-- Flower HQ initial schema.
-- Regenerate with `npm run db:generate` after editing app/db/schema.ts.
-- This hand-written migration ships with the initial scaffold so a fresh D1
-- can be brought up before drizzle-kit is installed.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX attachments_subject_idx ON attachments(subject_type, subject_id);

CREATE TABLE assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('van','trailer','equipment','other')),
  name TEXT NOT NULL,
  identifier TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  purchase_date TEXT,
  purchase_price_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','sold','retired')),
  sale_date TEXT,
  sale_price_cents INTEGER,
  current_mileage INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp),
  updated_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE maintenance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  performed_at TEXT NOT NULL,
  mileage_at_service INTEGER,
  category TEXT,
  vendor_id INTEGER REFERENCES vendors(id),
  description TEXT,
  cost_cents INTEGER,
  next_due_date TEXT,
  next_due_mileage INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX maintenance_records_asset_idx ON maintenance_records(asset_id);

CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE facility_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('hvac','plumbing','electrical','refrigeration','other')),
  name TEXT NOT NULL,
  identifier TEXT,
  install_date TEXT,
  warranty_expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX facility_assets_location_idx ON facility_assets(location_id);

CREATE TABLE work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  facility_asset_id INTEGER REFERENCES facility_assets(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','scheduled','in_progress','completed','cancelled')),
  vendor_id INTEGER REFERENCES vendors(id),
  scheduled_for TEXT,
  completed_at TEXT,
  cost_cents INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (current_timestamp),
  updated_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX work_orders_location_idx ON work_orders(location_id);
CREATE INDEX work_orders_status_idx ON work_orders(status);

CREATE TABLE work_order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX work_order_events_wo_idx ON work_order_events(work_order_id);

-- Seed the 3 stores so Facilities sub-app has data on day one. Edit names
-- and addresses in a follow-up migration or via the UI once built.
INSERT INTO locations (name, address) VALUES
  ('Store 1', NULL),
  ('Store 2', NULL),
  ('Store 3', NULL);
