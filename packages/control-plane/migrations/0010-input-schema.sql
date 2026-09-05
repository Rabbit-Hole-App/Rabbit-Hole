-- The [inputs]/[outputs] schema from small.toml, stored at deploy so the web
-- dashboard can render the Run form. JSON, shape identical to the toml tables.
ALTER TABLE apps ADD COLUMN inputs TEXT;
ALTER TABLE apps ADD COLUMN outputs TEXT;
