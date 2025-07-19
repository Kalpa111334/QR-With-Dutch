-- First drop the existing constraint if it exists
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;

-- Add the new constraint with updated status values
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check 
  CHECK (status IN ('CHECKED_IN', 'ON_BREAK', 'COMPLETED', 'ABSENT', 'PRESENT'));

-- Update the attendance status sequence
CREATE OR REPLACE FUNCTION process_attendance(
    p_employee_id UUID,
    p_current_time TIMESTAMPTZ,
    p_roster_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_existing_record attendance;
    v_new_record attendance;
    v_today DATE;
    v_late_minutes INTEGER;
BEGIN
    v_today := DATE(p_current_time);

    -- Get existing record for today
    SELECT * INTO v_existing_record 
    FROM attendance 
    WHERE employee_id = p_employee_id 
    AND date = v_today;

    -- Case 1: No record exists - First Check-in
    IF v_existing_record IS NULL THEN
        INSERT INTO attendance (
            employee_id,
            date,
            first_check_in_time,
            status,
            last_action,
            roster_id
        ) VALUES (
            p_employee_id,
            v_today,
            p_current_time,
            'CHECKED_IN',
            p_current_time,
            p_roster_id
        )
        RETURNING * INTO v_new_record;

        RETURN jsonb_build_object(
            'status', 'Success',
            'message', 'First check-in recorded',
            'action', 'FIRST_CHECK_IN'
        );
    END IF;

    -- Case 2: First Check-out
    IF v_existing_record.first_check_in_time IS NOT NULL AND 
       v_existing_record.first_check_out_time IS NULL THEN
        UPDATE attendance 
        SET first_check_out_time = p_current_time,
            status = 'ON_BREAK',
            last_action = p_current_time,
            working_duration_minutes = EXTRACT(EPOCH FROM (p_current_time - first_check_in_time))/60
        WHERE id = v_existing_record.id
        RETURNING * INTO v_new_record;

        RETURN jsonb_build_object(
            'status', 'Success',
            'message', 'First check-out recorded',
            'action', 'FIRST_CHECK_OUT'
        );
    END IF;

    -- Case 3: Second Check-in
    IF v_existing_record.first_check_out_time IS NOT NULL AND 
       v_existing_record.second_check_in_time IS NULL THEN
        -- Validate sequence timing
        IF p_current_time <= v_existing_record.first_check_out_time THEN
            RETURN jsonb_build_object(
                'status', 'Error',
                'message', 'Second check-in cannot be before first check-out'
            );
        END IF;

        UPDATE attendance 
        SET second_check_in_time = p_current_time,
            status = 'CHECKED_IN',
            last_action = p_current_time,
            break_duration_minutes = EXTRACT(EPOCH FROM (p_current_time - first_check_out_time))/60
        WHERE id = v_existing_record.id
        RETURNING * INTO v_new_record;

        RETURN jsonb_build_object(
            'status', 'Success',
            'message', 'Second check-in recorded',
            'action', 'SECOND_CHECK_IN'
        );
    END IF;

    -- Case 4: Second Check-out
    IF v_existing_record.second_check_in_time IS NOT NULL AND 
       v_existing_record.second_check_out_time IS NULL THEN
        UPDATE attendance 
        SET second_check_out_time = p_current_time,
            status = 'COMPLETED',
            last_action = p_current_time,
            working_duration_minutes = 
                EXTRACT(EPOCH FROM (first_check_out_time - first_check_in_time))/60 +
                EXTRACT(EPOCH FROM (p_current_time - second_check_in_time))/60
        WHERE id = v_existing_record.id
        RETURNING * INTO v_new_record;

        RETURN jsonb_build_object(
            'status', 'Success',
            'message', 'Second check-out recorded',
            'action', 'SECOND_CHECK_OUT'
        );
    END IF;

    -- If we reach here, all actions are completed
    RETURN jsonb_build_object(
        'status', 'Error',
        'message', 'All attendance actions for today are completed'
    );
END;
$$ LANGUAGE plpgsql;

-- Drop the old function if it exists
DROP FUNCTION IF EXISTS process_roster_attendance(UUID, TIMESTAMPTZ, UUID);

-- Create the new function with roster validation
CREATE OR REPLACE FUNCTION process_roster_attendance(
    p_employee_id UUID,
    p_current_time TIMESTAMPTZ,
    p_roster_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Validate roster_id
    IF p_roster_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'Error',
            'message', 'Roster ID is required'
        );
    END IF;

    -- Call the main attendance processing function with roster_id
    v_result := process_attendance(p_employee_id, p_current_time, p_roster_id);
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql; 