-- Add RLS policies for attendance table
CREATE POLICY "Enable insert access for authenticated users"
ON attendance 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users"
ON attendance 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Add comment to explain the policies
COMMENT ON TABLE attendance IS 'Daily attendance records with RLS policies for authenticated users';
