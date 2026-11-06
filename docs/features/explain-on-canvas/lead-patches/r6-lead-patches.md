# R6 Lead patches (automatic next proposals)

Nothing here is applied. R6 needs no change to `learn-models.js`, `wrangler*.jsonc`, `dev-worker.js`, `app-worker.js`, `LearnPage.jsx` or `learn-usage.js`:
the proposal is composed by the R4 deterministic composer (no model role), the handlers register inside the existing `registerRoadmapHandlers()` the R4
mount already calls, and the UI is driven by the polled view the R4 mount already renders.

## 1. `repository-schema.sql` mirror of migration 0040 (`r6-repository-schema.patch`)

`git apply docs/features/explain-on-canvas/lead-patches/r6-repository-schema.patch` appends `learn_roadmap_settings_facts` at the file tail (after 0039's
mirror; if R5's 0041 mirror lands first, keep migration order 0040 then 0041). Checked: `git apply --check` clean on this base, `node scripts/schema-check.mjs`
and `node --test scripts/schema-check.test.mjs` pass with it applied, and the R6 and R4 loop tests pass with it applied.

## 2. `scripts/ci/check-map.json`

`node docs/features/explain-on-canvas/lead-patches/apply-r6-check-map.mjs` (textual insert, same method as R4's; refuses a second run).
Adds 4 rows (`roadmap-auto.js`, `roadmap-settings-events.js` and the shared test fixture in the control plane; `roadmap-auto.js` in web), the check
`roadmap-auto-check.mjs` (fork, estimate 45 s, never executed) and appends the new tests/check to the rows of `roadmap-controller.js`, `roadmap-fake-server.mjs`,
`roadmap-routes.js` and `learn-user-settings.js`.

Proved on a copy swapped in for one run (then restored): with the map patched and the R6 files tracked, `node --test scripts/ci/check-map.test.mjs` passes 21 of 22.
**Decision for the Lead:** the one failure is `a broad selection splits into six parts ...`: the six parts are already at 900 s at the R4 tip, so ANY added check
fails it (30 s gives a 905 s part, 45 s gives 910 s). Without the patch the test fails differently (`every e2e check has a runner`) because the check file exists.
Options: raise the split to seven parts in `fast-e2e.yml` and the test, retire or re-measure a slower check, or fold the four R6 steps into
`roadmap-mvp-check.mjs` (then bump that file's `TOTAL` and its recorded seconds). R6 did not pick one.

## 3. Activation (no patch, for the receipt)

`ROADMAP_AUTO_ENABLED` is a new variable, unset everywhere. It must be `'true'` together with `ROADMAP_ENABLED` for any R6 behavior. It must not be added to a
wrangler config as true by this release. Migration 0040 must exist on the target `LEARN_DB` before it is set (the Auto-suggest write falls back to the plain
preference write if the table is missing, but then no automatic proposal fires on a preference change; delivery and mode triggers still work).
