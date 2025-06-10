-- Add deletion_type column to attendance table
ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS deletion_type TEXT CHECK (deletion_type IN ('check_in', 'check_out', NULL));

-- Create function to handle selective deletion
CREATE OR REPLACE FUNCTION handle_selective_deletion(
    p_record_id UUID,
    p_deletion_type TEXT
) RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    result JSONB;
BEGIN
    -- Get the record
    SELECT * INTO v_record 
    FROM attendance 
    WHERE id = p_record_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Record not found'
        );
    END IF;

    -- Handle first check-in/out and second check-in/out
    IF p_deletion_type = 'check_in' THEN
        -- If it's the first sequence, clear first check-in
        IF v_record.sequence_number = 1 THEN
            UPDATE attendance 
            SET first_check_in_time = NULL,
                check_in_time = NULL,
                status = 'pending'
            WHERE id = p_record_id;
        -- If it's the second sequence, clear second check-in
        ELSIF v_record.sequence_number = 2 THEN
            UPDATE attendance 
            SET second_check_in_time = NULL,
                break_duration = NULL
            WHERE id = p_record_id;
        END IF;
    ELSIF p_deletion_type = 'check_out' THEN
        -- If it's the first sequence, clear first check-out
        IF v_record.sequence_number = 1 THEN
            UPDATE attendance 
            SET first_check_out_time = NULL,
                check_out_time = NULL,
                status = 'present'
            WHERE id = p_record_id;
        -- If it's the second sequence, clear second check-out
        ELSIF v_record.sequence_number = 2 THEN
            UPDATE attendance 
            SET second_check_out_time = NULL,
                check_out_time = NULL,
                status = 'present'
            WHERE id = p_record_id;
        END IF;
    END IF;

    -- Check if both check-in and check-out are null after update
    SELECT * INTO v_record 
    FROM attendance 
    WHERE id = p_record_id;

    IF v_record.first_check_in_time IS NULL AND 
       v_record.first_check_out_time IS NULL AND 
       v_record.second_check_in_time IS NULL AND 
       v_record.second_check_out_time IS NULL THEN
        -- If all times are null, delete the record
        DELETE FROM attendance WHERE id = p_record_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Record deleted completely'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Record updated successfully'
    );
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON COLUMN attendance.deletion_type IS 'Type of deletion: check_in, check_out, or NULL for complete deletion'; 