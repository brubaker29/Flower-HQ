CREATE TABLE reimbursements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  submitted_by INTEGER REFERENCES users(id),
  category TEXT NOT NULL,
  description TEXT,
  expense_date TEXT NOT NULL,
  miles REAL,
  rate_per_mile REAL,
  amount_cents INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp),
  updated_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX reimbursements_employee_idx ON reimbursements(employee_id);
CREATE INDEX reimbursements_date_idx ON reimbursements(expense_date);
