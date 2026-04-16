-- Replace the single `identifier` column with explicit plate and VIN
-- columns, and add Ohio (or any state) registration date + expiration.

ALTER TABLE assets ADD COLUMN plate TEXT;
ALTER TABLE assets ADD COLUMN vin TEXT;
ALTER TABLE assets ADD COLUMN registered_on TEXT;
ALTER TABLE assets ADD COLUMN registration_expires_on TEXT;
