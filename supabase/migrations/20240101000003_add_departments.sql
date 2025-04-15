-- Add initial departments
INSERT INTO departments (name, created_at)
VALUES 
    ('IT', NOW()),
    ('HR', NOW()),
    ('Finance', NOW()),
    ('Marketing', NOW()),
    ('Sales', NOW()),
    ('Operations', NOW()),
    ('Engineering', NOW()),
    ('Research', NOW()),
    ('Development', NOW()),
    ('Customer Service', NOW()),
    ('Administration', NOW()),
    ('Transport', NOW()),
    ('Maintenance', NOW()),
    ('Security', NOW()),
    ('Dutch Activity', NOW()),
    ('Kitchen', NOW()),
    ('Food & Beverage Department', NOW()),
    ('Butchery', NOW()),
    ('Reservations', NOW()),
    ('House Keeping', NOW()),
    ('Pastry Kitchen', NOW()),
    ('Stores', NOW()),
    ('Purchasing & Stores', NOW()),
    ('Accounts Department', NOW())
ON CONFLICT (name) DO NOTHING; 