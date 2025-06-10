-- Migration to support Double Check-In and Check-Out
ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS first_check_in_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS first_check_out_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS second_check_in_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS second_check_out_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS break_duration INTERVAL DEFAULT '0 minutes';

-- Create a function to validate and process double check-in/check-out
CREATE OR REPLACE FUNCTION process_double_attendance(
    p_employee_id UUID, 
    p_current_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSONB AS $$
DECLARE
    v_today DATE := DATE(p_current_time);
    v_existing_record RECORD;
    result JSONB;
    v_break_duration INTERVAL;
BEGIN
    -- Fetch the existing attendance record for today
    SELECT * INTO v_existing_record 
    FROM attendance 
    WHERE employee_id = p_employee_id 
    AND date = v_today 
    ORDER BY created_at DESC 
    LIMIT 1;

    -- If no record exists, create first check-in
    IF v_existing_record IS NULL THEN
        INSERT INTO attendance (
            employee_id, 
            date, 
            check_in_time, 
            first_check_in_time, 
            status, 
            sequence_number
        ) VALUES (
            p_employee_id, 
            v_today, 
            p_current_time, 
            p_current_time, 
            'present', 
            1
        );

        result := jsonb_build_object(
            'status', 'Success',
            'action', 'first_check_in',
            'message', 'First check-in recorded'
        );
    
    -- If first check-in exists but no first check-out, process first check-out
    ELSIF v_existing_record.first_check_out_time IS NULL THEN
        UPDATE attendance 
        SET 
            check_out_time = p_current_time,
            first_check_out_time = p_current_time,
            status = 'first_checkout'
        WHERE id = v_existing_record.id;

        result := jsonb_build_object(
            'status', 'Success',
            'action', 'first_check_out',
            'message', 'First check-out recorded'
        );
    
    -- If first check-out exists but no second check-in, process second check-in
    ELSIF v_existing_record.second_check_in_time IS NULL THEN
        -- Calculate break duration
        v_break_duration := p_current_time - v_existing_record.first_check_out_time;

        UPDATE attendance 
        SET 
            check_in_time = p_current_time,
            second_check_in_time = p_current_time,
            break_duration = v_break_duration,
            status = 'second_checkin',
            sequence_number = 2
        WHERE id = v_existing_record.id;

        result := jsonb_build_object(
            'status', 'Success',
            'action', 'second_check_in',
            'message', 'Second check-in recorded',
            'break_duration', EXTRACT(MINUTES FROM v_break_duration)
        );
    
    -- If second check-in exists but no second check-out, process second check-out
    ELSIF v_existing_record.second_check_out_time IS NULL THEN
        UPDATE attendance 
        SET 
            check_out_time = p_current_time,
            second_check_out_time = p_current_time,
            status = 'checked_out',
            total_hours = EXTRACT(HOURS FROM (p_current_time - first_check_in_time))
        WHERE id = v_existing_record.id;

        result := jsonb_build_object(
            'status', 'Success',
            'action', 'second_check_out',
            'message', 'Second check-out recorded'
        );
    
    ELSE
        -- All scans for the day have been completed
        result := jsonb_build_object(
            'status', 'Error',
            'message', 'Maximum number of check-ins/check-outs reached for today'
        );
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create an index to improve query performance
CREATE INDEX IF NOT EXISTS idx_attendance_double_scan ON attendance(
    employee_id, 
    date, 
    first_check_in_time, 
    first_check_out_time, 
    second_check_in_time, 
    second_check_out_time
);

-- Add comments to explain the new columns
COMMENT ON COLUMN attendance.first_check_in_time IS 'Timestamp of the first check-in for the day';
COMMENT ON COLUMN attendance.first_check_out_time IS 'Timestamp of the first check-out for the day';
COMMENT ON COLUMN attendance.second_check_in_time IS 'Timestamp of the second check-in for the day';
COMMENT ON COLUMN attendance.second_check_out_time IS 'Timestamp of the second check-out for the day';
COMMENT ON COLUMN attendance.break_duration IS 'Duration of break between first check-out and second check-in'; 