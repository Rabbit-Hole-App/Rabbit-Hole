# v8 — generated runbook (2026-09-04)

Every app now carries a generated runbook: the document a colleague reads to
understand and run a tool they didn't write. It rides the existing deploy
review — same model call, same bundle — so sharing an app always ships the
manual with it. `RUNBOOK.example.md` in the repo root is the canonical
template every generated runbook follows.

## How it runs

1. **Generation is the deploy review.** `review.js` adds a `runbook` field to
   `REVIEW_SCHEMA` — one Anthropic call per deploy still, schema-forced JSON,
   the same bundle (every `.py` plus `small.toml` and `requirements.txt`,
   entry flagged). No second model call, no extra wall-clock.
2. The system prompt fixes the section order exactly as in
   `RUNBOOK.example.md`: title, generated-by line, What it does, Who it's
   for, How to run it locally, What it needs (Secret | Used in | For — every
   env var the code reads, `SMALL_*` marked "(set by the platform)"), Files,
   Commands, Endpoints (servers) or Schedule (jobs), What it talks to, Known
   limits, If it breaks (Symptom | Likely cause | Where to look).
3. Prompt rules: start from the entry file and trace imports outward; every
   command must be copy-pasteable and must exist in the code (derived from
   `if __name__ == "__main__"` blocks, argparse, the Makefile, `scripts/`);
   `kind = "job"` apps start with `small run <name>`, servers redeploy with
   `small deploy`; leave a section out rather than invent content; secrets
   are named by where they're read and what that code does with them; never
   include secret values.
4. **The review summary line at the bottom is appended by Worker code, not
   the model** (`finishReview`): `*review: <summary> — risk: <risk>*`, where
   risk comes from `computeRisk` — the model cannot write its own risk into
   the runbook. `validateReview` rejects a missing or empty runbook.
5. **Storage: no D1 change.** The runbook lives inside the existing
   `review` / `review_prev` JSON columns with `reviewed_at` — timestamp and
   previous version were already there. No migration.
6. `small init` gets the first version, from the code as it stands: the CLI
   builds the bundle (secrets redacted as always) and calls the new
   `POST /api/runbook`, which runs the same model call synchronously
   (`generateRunbook`) — no app row exists yet, so nothing is stored — and
   the CLI writes `RUNBOOK.md` alongside `small.toml`. Failure never breaks
   init: `runbook: unavailable (…) — regenerated on every small deploy`.
   Existing `RUNBOOK.md` is only overwritten with `--force`.

## Output surfaces

- `small runbook [app]` — prints it (reuses `GET /api/review`; no new read
  endpoint).
- `small runbook --write` — saves `RUNBOOK.md` in the app directory.
- `small runbook --diff` — what changed since the last deploy (line diff
  against `review_prev`'s runbook).
- `small init` — writes `RUNBOOK.md` alongside `small.toml`.
- `skills/small/SKILL.md` step 6: after `small deploy`, the agent reads the
  runbook back in two sentences — what it does and what it needs — so the
  human confirms what was built before sharing it.

## Tests

- `packages/control-plane/test/review.test.js` (model mocked, 9 tests, 3
  new): runbook stored with the review and the appended line carries the
  *computed* risk (mock model deliberately says "low" on a
  user-input-reaches-shell app; appended line must say "high");
  `generateRunbook` returns a finished runbook with no DB; missing/empty
  runbook fails validation.
- `tests/integration_tests/examples/counter/test_app.py` (real model, 4
  new): runbook names `SMALL_DATA`, mentions SQLite, has the gunicorn
  command under Commands, and lists no endpoints beyond `/` and `/inc`;
  `small runbook` prints it ending in the review summary line. A session
  fixture polls `GET /api/review` (≤120 s) for the async-stored runbook.
- `tests/integration_tests/examples/s3-log-writer/test_app.py` (2 new):
  Commands-or-Schedule section contains `small run`; one line names
  `S3_BUCKET` together with `pipeline.py:<line>`.

## Issues hit

1. **`RUNBOOK.example.md` did not exist** although the spec referenced it in
   the repo root — created it as part of the feature (counter-shaped
   example, all sections, review line at the bottom).
2. **The spec said "no Endpoints beyond / and /click" — counter's real route
   is `/inc`** (the +1 button posts to `inc`). Tests assert code truth:
   `/inc`.
3. This worktree has no repo-root `.env`, so *all four* integration files
   fail at collection (module-level `_dotenv()`) — pre-existing, not caused
   by this feature. Integration also needs the live worker redeployed from
   this branch (`/api/runbook` + the schema field); the worker is shared
   across four worktrees, so it was not auto-deployed.

## Ceilings (ponytail)

- `--diff` is a line-*set* diff (mirror of `small review --diff`): moved
  lines show as +/−, ordering invisible. Real diff when it matters.
- The bundle still excludes the Makefile and non-`.py` scripts — the model
  can only derive commands from files it sees. Add them to `bundle.js` when
  Makefile-derived commands matter.
- A bad runbook fails `validateReview` and drops the *whole* review for that
  deploy (collapses to `review: unavailable`). Schema-forced output makes
  this rare; split the failure domains if it ever shows up in practice.
- `small init`'s runbook call is synchronous on an Opus-class model — can
  take tens of seconds. Acceptable for a one-time init.
- Editing the runbook by hand, a web view, translations: skipped per spec.

## Current state

- All local suites green: control-plane 9/9 (model mocked), CLI 18/18,
  Python unit 5/5. New integration tests compile; not run (see issue 3 —
  needs worktree `.env` + a union worker deploy).
- Touched: `review.js`, `index.js` (one route), `bin/small.js`,
  `RUNBOOK.example.md` (new), `skills/small/SKILL.md`, unit + integration
  tests. No D1 migration, no new dependencies.
- Uncommitted on `feature/runbook`; npm unpublished, worker undeployed —
  publish/deploy cumulatively per the shared live-state rule.
- v7 is reserved for cron (`feature/cron`, `8b9c437`) — its doc is not
  written yet; this doc takes v8 to keep the numbering.
