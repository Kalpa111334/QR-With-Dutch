-- Create rosters table
CREATE TABLE IF NOT EXISTS rosters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id),
  employee_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('morning', 'evening', 'night')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS rosters_employee_id_idx ON rosters(employee_id);
CREATE INDEX IF NOT EXISTS rosters_status_idx ON rosters(status);
CREATE INDEX IF NOT EXISTS rosters_start_date_idx ON rosters(start_date);

-- Enable Row Level Security
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for authenticated users" ON rosters
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON rosters
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON rosters
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users" ON rosters
  FOR DELETE
  TO authenticated
  USING (true);
