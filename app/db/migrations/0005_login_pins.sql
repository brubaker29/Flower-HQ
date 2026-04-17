-- Email-PIN auth scaffolding.
-- Add an active flag to users so admins can disable accounts without
-- deleting their history, then create the short-lived PIN table.

ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE TABLE login_pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX login_pins_user_idx ON login_pins(user_id);
