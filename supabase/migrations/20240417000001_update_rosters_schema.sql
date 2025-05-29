-- First, check if the old shift column exists and drop it if it does
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rosters' 
        AND column_name = 'shift'
    ) THEN
        ALTER TABLE rosters DROP COLUMN shift;
    END IF;
END $$;

-- Add columns if they don't exist
DO $$ 
BEGIN
    -- Add shift_pattern if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rosters' 
        AND column_name = 'shift_pattern'
    ) THEN
        ALTER TABLE rosters ADD COLUMN shift_pattern JSONB NOT NULL DEFAULT '[]';
    END IF;

    -- Add department if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rosters' 
        AND column_name = 'department'
    ) THEN
        ALTER TABLE rosters ADD COLUMN department TEXT;
    END IF;

    -- Add position if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rosters' 
        AND column_name = 'position'
    ) THEN
        ALTER TABLE rosters ADD COLUMN position TEXT;
    END IF;

    -- Add created_by if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rosters' 
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE rosters ADD COLUMN created_by UUID REFERENCES auth.users(id);
    END IF;

    -- Add updated_by if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rosters' 
        AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE rosters ADD COLUMN updated_by UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Update the status check constraint
ALTER TABLE rosters DROP CONSTRAINT IF EXISTS rosters_status_check;
ALTER TABLE rosters ADD CONSTRAINT rosters_status_check CHECK (status IN ('active', 'completed'));

-- Add indexes for the new columns (these will fail silently if they already exist)
CREATE INDEX IF NOT EXISTS idx_rosters_department ON rosters(department);
CREATE INDEX IF NOT EXISTS idx_rosters_created_by ON rosters(created_by);
CREATE INDEX IF NOT EXISTS idx_rosters_updated_by ON rosters(updated_by);

-- Add comments
COMMENT ON COLUMN rosters.shift_pattern IS 'JSON array of daily shifts for the roster period';
COMMENT ON COLUMN rosters.department IS 'Department the roster is associated with';
COMMENT ON COLUMN rosters.position IS 'Position/role in the department'; 