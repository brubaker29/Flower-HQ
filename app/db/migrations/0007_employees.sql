-- Employee management + user permissions.

CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  position TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  hire_date TEXT,
  termination_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp),
  updated_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX employees_name_idx ON employees(last_name, first_name);
CREATE INDEX employees_location_idx ON employees(location_id);

-- User role + section access + link to employee record.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'employee';
ALTER TABLE users ADD COLUMN sections TEXT;
ALTER TABLE users ADD COLUMN employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
