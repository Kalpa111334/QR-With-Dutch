-- Reset RLS settings for attendance table
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON attendance;

-- Create separate policies for each operation
CREATE POLICY "Enable read for all users" ON attendance
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable insert for all users" ON attendance
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable update for all users" ON attendance
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Grant necessary permissions
GRANT ALL ON attendance TO authenticated;

-- Add comment to explain the policies
COMMENT ON TABLE attendance IS 'Daily attendance records with granular RLS policies for authenticated users';
