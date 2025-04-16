-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON attendance;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON attendance;

-- Add comprehensive RLS policies for attendance table
CREATE POLICY "Enable all access for authenticated users"
ON attendance
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Add comment to explain the policies
COMMENT ON TABLE attendance IS 'Daily attendance records with full access RLS policies for authenticated users';
