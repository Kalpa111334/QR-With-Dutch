-- First, drop the new constraint
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS check_session_times;

-- Restore the original session times constraint
ALTER TABLE attendance
ADD CONSTRAINT check_session_times
CHECK (
    CASE
        -- First session rules
        WHEN is_second_session = false OR is_second_session IS NULL THEN
            (second_check_in_time IS NULL AND
             second_check_out_time IS NULL AND
             first_check_in_time IS NOT NULL)
        -- Second session rules
        WHEN is_second_session = true THEN
            (first_check_in_time IS NOT NULL AND
             first_check_out_time IS NOT NULL AND
             second_check_in_time IS NOT NULL)
    END
); 