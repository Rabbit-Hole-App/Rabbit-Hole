# /animation blockers and fixes

Linked from [the checklist](checklist.md). Plan: [2026-10-30-animation.md](../../superpowers/plans/2026-10-30-animation.md).
Entry format: plan section 13. Resolved entries keep their history and name the fixing SHA. Times are PT.

## Open

### FX-AN-009 — Anthropic workspace API usage limit reached (blocks all real generation)
- Task / phase: AN-07, MVP acceptance
- First observed: 2026-10-30 ~3:05 PM PT, preview at `c84c0c51a7fddee65bb9cf9562d905fee24df828` (accept-4): every call was
  refused before processing (`provider_unavailable`, US$0 provider charge)
- Evidence: one direct 5-token request with the small-deploy/.env key (key read by name, never printed): HTTP 400
  `invalid_request_error` "You have reached your specified workspace API usage limits. You will regain access on
  2026-11-01 at 00:00 UTC." (request_id req_011CgZBb4zSk7L499LbTpfo4). Not the $10 /animation cap: ledger total US$1.53.
- Severity: blocks real-generation acceptance (watch, experiment, fresh prompt) until access returns or the limit is
  raised; every other feature using the same Anthropic workspace is affected too (possibly production, if production's
  key is in the same workspace — not verifiable from here, secrets are write-only)
- Owner action needed: raise the workspace usage limit in the Anthropic Console (or supply a key from a workspace with
  headroom), or wait until 2026-10-31 5:00 PM PT
- Status: open (owner)

### FX-AN-005 — repair output dropped the behavior program
- Task / phase: AN-05, MVP
- First observed at full SHA / environment: feat/animation `a006319c994a0981b487169b49231a120b2839cf`, preview
  rabbit-hole-web-dev-animation, real provider (accept-3 experiment case, 2026-10-30 ~3:00 PM PT)
- Actual / expected: review 1 rejected (major: overlapping labels); the repair returned an artifact without `program`, so
  deterministic validation failed `missing_program` and the build stopped. Expected: repair returns a complete artifact.
- Evidence: C:/s/spec/animation/accept-3.log (experiment: `validating: program: this scene needs a behavior program`)
- Severity: blocks MVP acceptance of experiment scenes
- Owner / branch: G / feat/animation-g
- Fixing full SHA: `b62a866f6ac1e7ddb3713e8bec95feb926b7f110` (author and repair tools require program when the scene needs one; fake-transport test reproduces the case)
- Owner action needed: none
- Status: fixed-unverified (next real experiment run)

### FX-AN-006 — overlapping labels fail visual review
- Task / phase: AN-02 / AN-05, MVP
- First observed: accept-2 and accept-3 (real provider). Labels were too small (fixed by R `c0d450915`, screen-space plates)
  and then overlapped in one view/state (experiment side view at L=0.1 m; game status label vs Goal tag)
- Severity: causes review rejections and repairs (cost), blocks experiment acceptance
- Owner / branch: R / feat/animation-r; G prompt rules `64577172a`
- Fixing full SHA: `62c8718957d812a6df7249dee97f159c59c56e40` (deterministic screen-space declutter, card and review page)
- Status: fixed-unverified (next real run)

### FX-AN-007 — watch check tolerance was relative, not absolute
- Task / phase: AN-07 (owner report 2026-10-30)
- Actual / expected: the watch frame-vs-oracle comparison scaled its 0.03 allowance by the value (at 360 it allowed 10.8).
  Expected: an absolute allowance from the displayed 3-decimal time rounding.
- Fixing full SHA: `c660463bcb1aefea9be92e51f384ce3d76063805` (oracle `within()`: absolute, from 0.5 ms times the oracle's
  fastest rate plus 1e-6; self-test: 3% off fails, rounding-sized passes); oracle tests 5/5
- Status: fixed-unverified (browser check not yet executed in CI on this SHA)

## Deferred

### FX-AN-008 — changing a rate mid-play restarts analytical motion
- Reviewer minor finding (accept-3 experiment): an analytical scene computes phase from absolute time, so changing a period mid-play jumps. The runtime passes parameter events to reduce only in scenes with actions, selection, drag or stepping (runtime.js:188), so a pure analytical scene cannot carry phase.
- MVP handling: author prompt states the restart in assumptions (G `b62a866f6`). Fix after MVP if wanted: let analytical scenes export initialState/reduce for parameter events (R).
- Severity: minor, cosmetic; does not block MVP. Status: deferred

## Resolved

### FX-AN-002 — preview clone had no model key; failure recorded as a bare "Error"
- Task / phase: AN-05, MVP. First observed: feat/animation `53df42332`, accept-1 (2026-10-30 ~2:25 PM PT)
- Cause: secrets do not clone; `rabbit-hole-web-dev-animation` had none, `anthropic()` answered "not configured" (503),
  and animation-policy.js turned it into a bare Error ("preparing/internal: The animation stopped unexpectedly").
  Evidence: dev usage_operations row `failed http_503`; `wrangler secret list` (names only) empty.
- Fix: ANTHROPIC_API_KEY installed on this clone only (C:/s/spec/animation/set-clone-secrets.mjs, value read by name from
  small-deploy/.env, owner decision A); G `192fc47d01ec6a3a43468c1e34c277a297145ce3`: `model_not_configured` refused
  before admission, every failure finding carries code + message. Nothing reached the provider.
- Validation: accept-2 then ran the full pipeline. Status: verified

### FX-AN-003 — inserting the 3D example crashed the canvas
- Task / phase: AN-03. First observed: fast-e2e 41129301739 on `38918a481` (animation-mvp steps 23 and 25)
- Cause: the lazy Animation3DCard rendered without its own Suspense boundary, so the whole canvas suspended and
  `chromeTop` read a null surface (`AdaptiveCanvas.jsx` insertBlock updater). Seeded cards were unaffected.
- Fixing full SHA: `0cbd3ff6983c44cb000608be4059a2771f981dba` (Suspense with "Loading the 3D animation", like WhiteboardBlock)
- Status: fixed-unverified (awaiting the fast-e2e rerun)

### FX-AN-004 — review samples aliased periodic motion; minor findings failed builds
- Task / phase: AN-05. First observed: accept-2 (watch loop sampled at 0, T/3, 2T/3 caught a 3-turn fan at one angle)
- Fix: G `64577172a68f249bc8983b87bcc928448b3001ae` — samples at 0, 0.538T, 0.769T (test covers 1-12 cycles); review stage
  accepts minor-only findings and fails on major/blocker
- Status: fixed; render probe confirms the new sample times (orbit 193.7 deg expected, 194 shown)

### FX-AN-001 — /explain paid-call record overwritten after a refused call
- Task / phase: AN-05 (found while building animation-job.js); affects existing /explain
- First observed at full SHA / environment: main `ff0fff36ad919785d1924a2f5780b2f5838e7fa8`, fake-transport tests
- Actual behavior / expected behavior: explain-job.js `paidCall` keyed a call record by the role's call count; a refused
  call gives its count back, so the retried call reused the refused call's key, overwrote it, and the new record stayed
  `running` forever. Expected: one record per call, refused then settled.
- Evidence: control-plane `test/explain-provider-cap.test.js` "cap reached before generation" (fails on the old code)
- Severity: nonblocking (accounting record, no extra charge observed); blocks neither MVP nor production
- Owner / branch: lane G / `fix/explain-paidcall-key`
- Attempted fixes and outcome: key `${id}-${role}-${calls.length + 1}`; animation-job.js built with the same rule
- Next concrete action: ships with the animation integration branch (merged into `feat/animation`)
- Owner action needed: none
- Fixing full SHA: `f7aa8a8e28fad2ef622841044b8c6bd0cdb3b4d9`
- Validation result: explain + animation control-plane tests 228/228 on feat/animation; not deployed
- Status: fixed-unverified (not deployed)
