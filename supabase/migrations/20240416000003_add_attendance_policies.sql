-- Reset RLS settings for attendance table
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON attendance;

-- Create a single policy for all operations
CREATE POLICY "Enable all access for authenticated users" ON attendance
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Re-enable RLS
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON attendance TO authenticated;

-- Add comment to explain the policies
COMMENT ON TABLE attendance IS 'Daily attendance records with full access for authenticated users';
