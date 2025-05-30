-- Add working_duration column to attendance table
ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS working_duration VARCHAR(50) DEFAULT '0';

-- Add a check constraint to ensure valid format
ALTER TABLE attendance
ADD CONSTRAINT check_working_duration 
CHECK (
    working_duration ~ '^[0-9]+(\.[0-9]+)?$' OR 
    working_duration = '0'
);

-- Add an index for performance optimization
CREATE INDEX IF NOT EXISTS idx_attendance_working_duration ON attendance(working_duration);

-- Update existing records with a default value
UPDATE attendance 
SET working_duration = '0' 
WHERE working_duration IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN attendance.working_duration IS 'Total hours worked, stored as a string to allow decimal precision'; 