-- Job inputs: what small run passed, recorded as JSON on the run row.
-- Input/output files live in R2 (bucket small-runs), keyed by run id — no table.
ALTER TABLE runs ADD COLUMN inputs TEXT;
