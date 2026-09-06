-- Structured runbook (docs/features/runbook.md): JSON on the app row, warnings
-- from validation. Ask reads the JSON; the rendered markdown is for people.
ALTER TABLE apps ADD COLUMN runbook_json TEXT;
ALTER TABLE apps ADD COLUMN runbook_warnings TEXT;
