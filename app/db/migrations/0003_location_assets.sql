-- Add store_number to locations and location_id to assets so
-- vans can be assigned to a home store.

ALTER TABLE locations ADD COLUMN store_number TEXT;
ALTER TABLE assets ADD COLUMN location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;
