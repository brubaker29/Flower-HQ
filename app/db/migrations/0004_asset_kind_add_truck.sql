-- Allow "truck" (and future kinds) on assets.kind. SQLite can't drop a
-- CHECK constraint in place, so rebuild the table. The new definition
-- removes the CHECK on `kind` entirely — valid values are enforced by
-- the Zod enum in app/db/schema.ts going forward, which is easier to
-- extend than a DB-level CHECK.

CREATE TABLE assets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
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
  updated_at TEXT NOT NULL DEFAULT (current_timestamp),
  plate TEXT,
  vin TEXT,
  registered_on TEXT,
  registration_expires_on TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL
);

INSERT INTO assets_new (
  id, kind, name, identifier, make, model, year,
  purchase_date, purchase_price_cents, status,
  sale_date, sale_price_cents, current_mileage, notes,
  created_at, updated_at,
  plate, vin, registered_on, registration_expires_on, location_id
)
SELECT
  id, kind, name, identifier, make, model, year,
  purchase_date, purchase_price_cents, status,
  sale_date, sale_price_cents, current_mileage, notes,
  created_at, updated_at,
  plate, vin, registered_on, registration_expires_on, location_id
FROM assets;

DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;
