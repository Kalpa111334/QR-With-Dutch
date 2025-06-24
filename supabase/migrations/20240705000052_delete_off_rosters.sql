-- Delete all active off rosters
DELETE FROM employee_rosters
WHERE roster_id IN (
    SELECT id FROM rosters
    WHERE shift_pattern @> '[{"shift": "off"}]'::jsonb
    AND is_active = true
);

DELETE FROM rosters
WHERE shift_pattern @> '[{"shift": "off"}]'::jsonb
AND is_active = true;

-- Add constraint to prevent automatic off roster creation
ALTER TABLE rosters
ADD CONSTRAINT prevent_auto_off_roster
CHECK (NOT (is_active = true AND shift_pattern @> '[{"shift": "off"}]'::jsonb)); 