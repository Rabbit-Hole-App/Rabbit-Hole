# CI and release speed lane: hand-off (5 November 2026)

Written so a fresh session can continue without the conversation. Receipt with the measured numbers: [receipt.md](receipt.md). Evidence copies are in [evidence/](evidence/). Stop state: items 2, 3 and 1 shipped, items 4 to 11 parked, nothing runs until the owner says.

## 1. What was ordered

Owner brief v2 ([evidence/owner-brief-v2.md](evidence/owner-brief-v2.md)): "a lane push waits on nothing, a release is about 5 minutes when I do not need to look first and about 5 to 6 when I do, a flag flip is one minute, a rollback is two. Everything else runs after the release in the background." The P0 report ([evidence/p0-report.md](evidence/p0-report.md)) measured the before numbers and found 30 mismatches between the brief and the code; the owner built from the report, not the brief.

The 11 items: P0 measure; (1) the gate runs nothing already green; (2) the broad list shrinks, every source file gets a mapped row; (3) verify runs only the changed packages' suites; (4) feature switches leave wrangler and become secrets, with `flag.cmd`; (5) the fast path as the default release in three tiers (Direct, Preview, Full gate) with a background full run after release; (6) a rollback drill, first on a clone and then once on production; (7) the stable preview deploys without the gate, with a background verdict recorded on the SHA; (8) `--mvp` accepts the stable preview and warm clones; (9) where a change goes, written in prod-release.md; (10) the lane rule in CLAUDE.md; (11) after-numbers from real runs.

Owner rulings (5 Nov):
- **A** per-check attestation from the exact-SHA fast-e2e artifact (the check's own `exit 0  N/N checks passed` line); a green run alone never counts.
- **B** an unmapped file fails the plan with the one-line fix; a mapped row names at least one Linux check or a CI-run unit-test file.
- **C** the CLAUDE.md rewrite (the MVP-only lines and OPS-04) is drafted in item 5's push for the owner to review and push.
- **D** `=== 'true'` for all six switches, MOTION_GENERATION_PAUSED changed from `'1'` in the same commit, `flag.cmd` prints the kill or pause meaning; item 4 after item 6; the var versus secret name conflict is tested on a clone first.
- **E** the Preview tier is "push to dev" through `dev-deploy.mjs`'s own path; no `--mvp` deploy to the stable preview.
- **F(1)** stable preview only; warm clones with provider secrets are a separate spend decision and are not built.
- **G** the 132 windows-only checks that run nowhere are recorded, not fixed.
- **H** lane CI stays, cut by items 2 and 3.
- Scope cut: items 2, 3 and 1 only, then stop and hand back; failed-only reruns of flaky shards are dispatched by the integrator at once, never overnight.

## 2. What shipped

| Item | Commit(s) | What changed |
|---|---|---|
| 2 | 286c8e3b8 | `scripts/ci/check-map.json`, `affected.mjs` and tests. Broad list = the owner's 24 lines plus 7 reviewed keep-lines (`broadReasons`: tripwire, fonts, page html, three bundled nanoGPT docs). 599 new and 122 extended rows. 46 rows with neither a Linux check nor a CI-run unit test sit in `previewTier`. An unmapped file fails the plan job. |
| 3 | 44ac75f04 | `scripts/ci/verify-plan.mjs`, `run.sh` (one function per suite; adds the whiteboard renderer tests and `scripts/ci`), `verify.yml`, `verify-evidence.mjs`, `verify-reuse.mjs`. The verify note records `suites` and `pages`; a note without `suites` is a full run; a note is reused only if it covered this push's plan. |
| 1 | 1c3f73d9c (8b6974c26, 0da91db1b) | `scripts/gate-attest.mjs`, `gateVerdict`/`rerunVerdict`, `dev-deploy-gate.mjs`, `dev-deploy.mjs`, `prod-release.mjs` (accepts both record shapes), `run-part.sh` writes `tripwire.log` before it stops the stack, `scripts/fixtures/gate-attestable.json`. Harness (`fix/ctrlk-gate-selection`): `scripts/r36-gate/{attest,pack,shards,dispatch-preflight,collect}.mjs`, `gate-attestable.json`, `gate-sharded.yml`. |
| (probes) | 3e663e7c1, 4ac04ec0f, revert c7eb5cc2e | Two comment-only commits that measured a one-file control-plane and a one-file web push; reverted (tree identical to 44ac75f04). |

Measured table (full version in receipt.md):

| | Before | After |
|---|---|---|
| One-file control-plane push, fast-e2e | 15.5 min, 96 checks, about 90 rm | 2.4 min, 2 checks, 6 rm |
| One-file control-plane push, verify | 5.4 to 6.5 min | 2.7 min, control-plane suite only |
| One-file web push, fast-e2e | 15.5 min, 96 checks | 6.6 min, 18 checks, 30 rm |
| One-file web push, verify | 5.4 to 6.5 min | 3.9 min |
| Windows gate | 9 parts, 15.0 to 15.6 min, about 94 rm | baseline run 42112793441: 9 parts, 13.3 min, 94 rm; attested run 42120661030: 6 parts, 11.4 min, 56 rm |
| Broad push, fast-e2e | 15.3 to 16.2 min | 17.0 min (unchanged by design) |

## 3. What did not ship, and why

Parked by the owner on 5 Nov after items 2, 3 and 1 were accepted. One line each; the file:line anchors are on the release candidate.

| Item | What it would do | Depends on |
|---|---|---|
| 4 switches as secrets | Move WHITEBOARD_ENABLED, WHITEBOARD_EXECUTION_KILL, ANIMATION_ENABLED, ANIMATION_EXECUTION_KILL, MOTION_GENERATION_PAUSED, IMAGE_GENERATE_ENABLED out of wrangler and read them like CAD_MODEL_ENABLED; add `flag.cmd <name> on or off --check`. | Item 6 first (does a rollback restore secrets? does Cloudflare refuse a secret with the name of an existing var?). |
| 5 tiers | Direct, Preview and Full-gate tiers decided by `affected.mjs`; `--mvp --direct`; a background full run after every release that posts the rollback command on red; a failed-only rerun of a flaky shard dispatched at once. | The owner's CLAUDE.md rewrite (MVP-only lines and OPS-04); a tier list in `check-map.json` with a test that every full-gate path is broad; a new `--direct` record shape in `mvp-fast-path.mjs`; a production confirmation loop. Closes the items 1 and 2 interaction (section 6). |
| 6 rollback drill | Release a known-good SHA, then a broken one, then `wrangler rollback` to the previous version id, timed; later once on production with a no-op commit. | A clone; the owner choosing the production minute. The rollback must carry `--message "rollback to release <sha12>"`. |
| 7 stable preview without the gate | Dev push is build, deploy, confirmations and smoke; the gate and full suites run afterwards and record a verdict note on the SHA that a later main release reads. | `deploy-prod.yml` fetching the new note; a decision on `gates:'pending'` records. |
| 8 stable preview as `--mvp` target; warm clones | Superseded by ruling E (push to dev) and F(1) (no warm clones). The unowned clones were deleted on 5 Nov. | Spend decision for any warm clone with provider secrets. |
| 9 where a change goes | Written in `prod-release.md`. | Items 5 and 7. |
| 10 lane rule | Lane pushes run touched tests locally and do not wait for CI; full suites once on the candidate. | The CLAUDE.md rewrite (item 5). |
| 11 after-numbers for the later items | The same table for a `--mvp --direct` release, a stable-preview push and a flag flip. | Items 4, 5, 7. |

## 4. Rules now in force

- **Attestation (ruling A).** A gate stage is skipped only when the exact-SHA fast-e2e artifact shows that check's own `exit 0  N/N checks passed  (Ns)` line. The run's conclusion alone never counts. A stage with a repeated, failed or missing line runs. The harness reads the highest attempt of each part, so a green rerun counts and the failed first attempt does not. See prod-release.md, "Gate stages attested by fast-e2e".
- **Tripwire.** `run-part.sh` writes `provider-tripwire hits: <n>` to `tripwire.log` while the stack is still up (`unreadable` only if it is already down). No `tripwire.log` reading `hits: 0` means nothing in that part is attested; a hit blocks every attested stage of that part. Never move the read back into a workflow step: the script owns the stack's lifetime.
- **7-day expiry.** fast-e2e artifacts expire after 7 days; a gate dispatched after that attests nothing and runs the full gate.
- **Drift guard.** The attestable list exists twice, `scripts/fixtures/gate-attestable.json` (app) and `scripts/r36-gate/gate-attestable.json` (harness), byte-identical. Each repo's test pins its copy; `collect.mjs` compares the harness list with the candidate's `scripts/gate-attest.mjs` and fails the gate on any difference or if the candidate lacks the file.
- **Never attested, always run:** `make test-unit` and the fixture regression (the paidRefusal, escrow and auth tests), both bundle checks, all stack-app, journey and tutor stages, the Windows `checkpoints` part, share-revocation and library-folders. The secret preflight, schema preflight, `prepare` bundle check and the dev and production smokes are not gate stages and are unchanged.
- **Unmapped fails.** A tracked file with no class and no row fails the plan job with "add <path> to scripts/ci/check-map.json". A mapped row names a Linux check or a CI-run unit-test file, or the file is in `previewTier` with a reason.
- **Suites recorded.** The verify evidence note carries `suites` (array) and `pages`; a note without `suites` is a full run. If a later change skips the gate's `make test-unit` because verify passed, it must require a note whose `suites` is absent or lists every `run.sh` suite.
- **Over-wide rows (option (i)): pending, owner approved, not done.** 138 generated rows select 30 or more Linux checks, about 60 control-plane files (`canvases.js`, `token.js`, `aws.js`, `arxiv.js`) all on the same 41 checks. Option (i): control-plane files take their own area plus their direct importers' areas, no hops. One regenerated `check-map.json` as its own push, with per-area counts before and after. Wider never loses coverage; it only costs minutes.
- **Flake rule.** The integrator reruns only the failed shard at once (`gh run rerun <id> --failed`), never overnight.
- **GitHub run filter.** If the gate preflight says "no successful verify.yml push run" for a green run, rerun that verify run once; the API's `status=success` filter sometimes returns 0 for a completed success.

## 5. Parked items, flakes and known holes

- **P-CI-001**: 160 s Firefox and WebKit engine-library install on fast-e2e shard 5 (probe (b), run 42106618072); a cacheable cost. [evidence/parked.md](evidence/parked.md).
- **P-CI-002**: `project-menu` ("a new tab opened"), fast-e2e 41997063688 attempt 1 on d3bfea9be, rerun waited 8 h 01 min; `explain-back-sketch` (TimeoutError, 0/0 after 31 s, shard 5), fast-e2e 42114874686 attempt 1 on 1c3f73d9c, passed on rerun and on 9853b58a7 and 44ac75f04.
- **Also unresolved:** `animation-mvp` step 19 ("the wheel left the scene camera") on the slash-previews SHA, fast-e2e 42089804510.
- **The 132 windows-only checks that run in no workflow** (150 are marked windows-only; 18 run in the gate's `int35.sh`). fast-e2e calls them "release gate only", which is false for these. Recorded, not fixed (ruling G):
  - explain and tutor: explain-gate, explain-entry, explain-scene, tutor-controls, tutor-codebase, tutor-loop, tutor-progress, progress-chat;
  - cad: cad-controls, cad-viewer, cad, cad-real, cad-final-recovery, cad-shared-interaction, cad-runtime-browser;
  - cards and code boxes: card-scroll, card-full-code, card-edit, code-box-persistence, code-box-autocomplete;
  - ctrlk: ctrlk-native, ctrlk-tools, ctrlk-explain-provenance, ctrlk-image-replacement, ctrlk-source-derivative, ctrlk-compute, inline-evidence-handoff-component, ctrlk-code-run, ctrlk-image-action, ctrlk-regional-image, ctrlk-background-removal, ctrlk-extraction, ctrlk-repository-evidence, ctrlk-image, ctrlk-notebook, ctrlk-annotations;
  - equations: equation-inline, equation-permission;
  - files and models: file-bundle-context, file-context-add, file-converter-ui, file-doc-cards, file-import, file-shared-bundle, file-shared-slides, file-step-retry, model-fixture-cards, model-viewer;
  - canvas, search and chat: add-to-chat, answer-routing, app-tabs, bar-baseline, board-interaction, canvas-clipping, canvas-doc, canvas-refs, canvas-refs-permissions, canvas-context, canvas-conversations, canvas-doc-persist, canvas-search-viewers, canvas-search-files, search-previews-drag, canvas-search, canvas-editing-stack, file-edge, file-sources, board-restore, canvas-skeleton, card-sources, chat-block, chat-context-pill, chat-persistence, chat-workspace-shell, composer-plus, curious-context;
  - drawing and editing: dark-ink, delete-esc, drop-ui, grade-shadow;
  - shell, landing and learn: journey-switch, landing-art, landing-auth, landing-guided, learn-handoff, learn-shell, live-bundle, live-moment, manim-render, mascot, materials-remove, menu-shortcuts;
  - nanogpt and next steps: nanogpt-audio, nanogpt-board, next-steps, next-steps-wiring;
  - provenance, toc and paper: provenance, toc, paper-highlight, paper-selection;
  - panels and composer: hide-right-panel, composer-pills, context-actions, materials-rows, scene-retry, pdf-to-canvas, offline-edit, present-laser;
  - repository and code cards: repo-canvas-graph, public-code-cards, code-card-theme, repo-canvas-cards, scene-graph;
  - search, settings and slash: search-files, selection-bar, settings, view-menu, slash-3d, slash-cleanup, slash-core, source-finder;
  - toc and tutor: t12-deployed, toc-cap, toc-links-search, toc-plan, toc-tutor, tutor-entry, tutor-image-context;
  - media and wiki: video, voice, wiki, wiki-card.
- **One more hole closed:** the `scripts/ci` tests themselves ran in no workflow before item 3; they are suite `ci` now.

## 6. The items 1 and 2 interaction (item 5 closes it)

Attestation skips only what fast-e2e already ran green on the exact SHA. Item 2 made a narrow push run only a few checks (2 for a `whiteboard-job.js` change). So a narrow release attests few or no stages and still runs the 9-part gate (about 13 min, 94 runner-minutes). The big gain is on lane pushes, not on a narrow release's gate. Item 5 (Direct and Preview tiers) is the fix: it lets a narrow change skip the full gate by tier instead of by attestation. Broad releases (workflows, `scripts/ci`, the broad list) attest up to 20 stages and save about 38 Windows runner-minutes.

## 7. Owner launchers that still encode the old order (outside the repo, `C:\s\spec`)

- `release-queue\release.sh` / `release.cmd`: needs the gate, verify and fast-e2e on the SHA, then pushes `dev`, then `main`, in that order. It reads the gate's `APP_SHA` from the log. Unchanged by this lane.
- `release-queue\release-mvp.sh` / `.cmd`: the MVP path; never touches `dev`; needs the owner's `MVP_ALLOWED_SHA` variable. It has no `--direct` mode.
- `release-queue\gate-step.sh` and `day-1021\gate-only.sh`: wait for verify and fast-e2e on the worktree HEAD, then `gh workflow run gate-sharded.yml --ref fix/ctrlk-gate-selection` (line 10). That default ref already points at the harness branch the owner merged in this release, so the attestation is on by default; no launcher change was needed. `rel-after-gate.sh` and `rel-main.sh` push the gate note, dev and main.
- None of them know the Preview or Direct tiers; items 5 and 7 need new or changed launchers.

## 8. Where to start next

Start with item 4 (switches as secrets), then 6, then 7, as the owner ordered; but item 6's drill must come before item 4 reaches production, because it answers whether a rollback restores secrets. Anchors on the release candidate:

- **Item 4.** Wrangler keys to remove: `packages/web/wrangler.rabbit-hole-prod.jsonc` lines 89 (ANIMATION_ENABLED), 90 (ANIMATION_EXECUTION_KILL), 93 (WHITEBOARD_ENABLED), 99 (IMAGE_GENERATE_ENABLED), 183 (MOTION_GENERATION_PAUSED "0"); `packages/web/wrangler.dev.jsonc` lines 172 (WHITEBOARD_ENABLED) and 183 (IMAGE_GENERATE_ENABLED); `packages/web/wrangler.parallel.jsonc` line 153. WHITEBOARD_EXECUTION_KILL is in no wrangler file. Readers: `packages/control-plane/src/whiteboard-job.js:47`, `animation-job.js:57`, `generation-proposal.js:68` (reads `'1'`, must become `'true'`), `whiteboard-routes.js:2`. Tests that pin the vars: `packages/control-plane/test/rabbit-hole-prod-config.test.js` lines 170 and 277 to 283, `motion-policy-values.test.js:35`, plus `chat-capability-route.test.js` and `whiteboard-job.test.js`. Mind: "absent means off" inverts for the two KILL switches and the PAUSED switch (absent means the feature runs). A secret's value cannot be read back, so `flag.cmd --check` can confirm only the name plus a behavioural probe (`GET /api/learn/whiteboard/jobs` answers `{available}`; `/animation` is 404 when off). Removing WHITEBOARD_ENABLED from `wrangler.dev.jsonc` turns `/whiteboard` off on every dev clone and the stable preview until a secret is set there. The read-backs in `release.sh` (`explain-worker-vars.mjs`) and the animation recovery recipes read the vars and must change too.
- **Item 6.** The code's own rollback is `scripts/prod-release.mjs` around lines 331 to 340 (`wrangler rollback <previous id> --config ... --message "rollback to release <prev sha12>"`, app first, then the control plane). The next release refuses a version "no release named" (`prod-release.mjs:170`) if a hand rollback omits the message; the manual command in `docs/features/prod-release.md` (Manual rollback, line 115) must carry it. Measure the rollback time and whether secrets are restored.
- **Item 7.** `.github/workflows/deploy-dev.yml` lines 30 to 61 (waits for the gate note and verify note), `scripts/dev-deploy-gate.mjs` (refuses without verify evidence, green runs and a gate note), `scripts/dev-deploy.mjs` (`GATE_STAGES` line 59, `gateVerdict` line 105, the use of `GATE_STAGES` near line 418). The gate's stages run on local keyless stacks, so they cannot run "against" the preview: dispatch the existing gate in the background and record its verdict in `refs/notes/gates`, which `deploy-prod.yml` must then fetch.
- **Item 5.** `scripts/mvp-fast-path.mjs:27` (`REQUIRED` includes `preview`), `:73` (record needs `version`), `:77` (dev-clone target); `scripts/prod-release.mjs` smoke around 186 to 193 (no five-confirmation loop; production smoke is signed-out, so it cannot show a paid refusal); CLAUDE.md MVP lines 305 to 332 and OPS-04 lines 271 to 273.
- **Next small push, no new approval needed beyond the owner's go:** over-wide rows, option (i), with per-area counts before and after.
