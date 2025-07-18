-- Drop existing working duration related functions and triggers
DROP TRIGGER IF EXISTS update_working_duration ON attendance;
DROP TRIGGER IF EXISTS update_working_time ON attendance;
DROP FUNCTION IF EXISTS calculate_working_duration();
DROP FUNCTION IF EXISTS calculate_working_time();

-- Create improved working duration calculation function
CREATE OR REPLACE FUNCTION calculate_working_duration()
RETURNS TRIGGER AS $$
DECLARE
    total_minutes INTEGER := 0;
    first_session INTEGER := 0;
    second_session INTEGER := 0;
    break_mins INTEGER := 0;
    standard_work_minutes INTEGER := 480; -- 8 hours in minutes
    break_duration_text TEXT;
BEGIN
    -- Calculate first session (handle ongoing sessions)
    IF NEW.first_check_in_time IS NOT NULL THEN
        first_session := EXTRACT(EPOCH FROM (
            COALESCE(NEW.first_check_out_time, CURRENT_TIMESTAMP) - 
            NEW.first_check_in_time
        ))/60;
    END IF;

    -- Calculate second session (handle ongoing sessions)
    IF NEW.second_check_in_time IS NOT NULL THEN
        second_session := EXTRACT(EPOCH FROM (
            COALESCE(NEW.second_check_out_time, CURRENT_TIMESTAMP) - 
            NEW.second_check_in_time
        ))/60;
    END IF;

    -- Calculate break duration if exists
    IF NEW.break_duration IS NOT NULL THEN
        break_duration_text := NEW.break_duration::TEXT;
        
        IF break_duration_text ~ '^\d+$' THEN
            -- Plain number (assumed to be minutes)
            break_mins := break_duration_text::INTEGER;
        ELSIF break_duration_text ~ '^\d+m$' THEN
            -- Format: "30m"
            break_mins := (REGEXP_REPLACE(break_duration_text, 'm$', ''))::INTEGER;
        ELSIF break_duration_text ~ '^\d+h \d+m$' THEN
            -- Format: "1h 30m"
            break_mins := (
                (REGEXP_REPLACE(break_duration_text, 'h.*$', ''))::INTEGER * 60 +
                (REGEXP_REPLACE(break_duration_text, '^.*h ', ''))::INTEGER
            );
        END IF;
    END IF;

    -- Calculate total working minutes (ensure non-negative)
    total_minutes := GREATEST(0, first_session + second_session - break_mins);

    -- Format working duration
    NEW.working_duration := 
        CONCAT(
            FLOOR(total_minutes/60)::TEXT,
            'h ',
            LPAD(MOD(total_minutes, 60)::TEXT, 2, '0'),
            'm'
        );

    -- Update total hours
    NEW.total_hours := total_minutes::FLOAT / 60;

    -- Calculate overtime (if total time > 8 hours)
    IF total_minutes > standard_work_minutes THEN
        NEW.overtime := (total_minutes - standard_work_minutes)::FLOAT / 60;
    ELSE
        NEW.overtime := 0;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger
CREATE TRIGGER update_working_duration
    BEFORE INSERT OR UPDATE ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION calculate_working_duration();

-- Update all existing records
WITH time_calculations AS (
    SELECT 
        id,
        -- Calculate total minutes between check-in and check-out (or current time)
        GREATEST(0,
            -- First session
            CASE 
                WHEN first_check_in_time IS NOT NULL THEN
                    EXTRACT(EPOCH FROM (
                        COALESCE(first_check_out_time, CURRENT_TIMESTAMP) - 
                        first_check_in_time
                    ))/60 
                ELSE 0 
            END::INTEGER +
            -- Second session
            CASE 
                WHEN second_check_in_time IS NOT NULL THEN
                    EXTRACT(EPOCH FROM (
                        COALESCE(second_check_out_time, CURRENT_TIMESTAMP) - 
                        second_check_in_time
                    ))/60 
                ELSE 0 
            END::INTEGER -
            -- Break duration
            CASE
                WHEN break_duration::TEXT ~ '^\d+$' THEN 
                    break_duration::TEXT::INTEGER
                WHEN break_duration::TEXT ~ '^\d+m$' THEN 
                    (REGEXP_REPLACE(break_duration::TEXT, 'm$', ''))::INTEGER
                WHEN break_duration::TEXT ~ '^\d+h \d+m$' THEN
                    (REGEXP_REPLACE(break_duration::TEXT, 'h.*$', ''))::INTEGER * 60 +
                    (REGEXP_REPLACE(break_duration::TEXT, '^.*h ', ''))::INTEGER
                ELSE 0
            END
        ) as total_minutes
    FROM attendance
)
UPDATE attendance a
SET
    working_duration = CONCAT(
        FLOOR(t.total_minutes/60)::text,
        'h ',
        LPAD(MOD(t.total_minutes, 60)::text, 2, '0'),
        'm'
    ),
    total_hours = t.total_minutes::float / 60,
    overtime = CASE 
        WHEN t.total_minutes > 480 THEN (t.total_minutes - 480)::float / 60
        ELSE 0
    END
FROM time_calculations t
WHERE a.id = t.id;

-- Add constraints to ensure data integrity
ALTER TABLE attendance
DROP CONSTRAINT IF EXISTS check_working_duration_format;

ALTER TABLE attendance
ADD CONSTRAINT check_working_duration_format
CHECK (working_duration ~ '^\d+h [0-5][0-9]m$');

-- Add comment for documentation
COMMENT ON FUNCTION calculate_working_duration() IS 'Calculates working duration including ongoing sessions and break time'; 