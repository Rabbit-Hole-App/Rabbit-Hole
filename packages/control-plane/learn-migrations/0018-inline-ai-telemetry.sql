-- Inline AI editor telemetry (docs/features/inline-ai-editor.md A3 and A5, owner 2026-10-12): one row per inline Edit or
-- Explain request, keyed by its request id, so a retried write never makes a second row. Stored: who (users.id) and which
-- board (the app id), whether it was a live request or a tagged benchmark run (run_id, the tested sha, the fixture id),
-- whether the provider was mocked, whether the result streamed, how it was routed (direct = an explicit / command,
-- jev = classified by JEV, bypassed = no routing: Edit or a plain explain), the capability that answered, the outcome,
-- and metrics_json: stage timings in milliseconds and counters only (the learn-inline.js cleanMetrics allowlist).
-- Never stored: prompt text, selected or surrounding canvas content, code, screenshots, model output or an email.
-- Written best effort after Accept, Reject or Cancel; a missing table skips the row, never the request.
-- Additive and re-runnable; LEARN_DB only. Shared dev and production apply wait for the owner's GO.
CREATE TABLE IF NOT EXISTS inline_ai_telemetry (
  request_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT,
  board TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'benchmark')),
  run_id TEXT,
  sha TEXT,
  fixture TEXT,
  mocked INTEGER NOT NULL DEFAULT 0 CHECK (mocked IN (0, 1)),
  streaming INTEGER NOT NULL DEFAULT 0 CHECK (streaming IN (0, 1)),
  route TEXT NOT NULL CHECK (route IN ('direct', 'jev', 'bypassed')),
  capability TEXT,
  outcome TEXT NOT NULL,
  metrics_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inline_ai_telemetry_run ON inline_ai_telemetry (source, run_id, created_at);
