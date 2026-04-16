-- Per-asset odometer readings. See schema.ts for the rationale.

CREATE TABLE mileage_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  read_on TEXT NOT NULL,
  mileage INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','service','imported')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX mileage_readings_asset_idx ON mileage_readings(asset_id);
CREATE INDEX mileage_readings_date_idx ON mileage_readings(asset_id, read_on);
