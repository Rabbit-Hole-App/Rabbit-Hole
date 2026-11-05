> Written 5 Nov 2026 by the CI-MAP agent. Item 2 is 286c8e3b8, item 3 is 44ac75f04; feat/ci-speed ends at c7eb5cc2e (a revert of two comment-only probes, tree identical to 44ac75f04).

# ci-speed items 2 and 3: push points (5 Nov 2026)

Branch `feat/ci-speed` on rabbit-hole. Commits are plain (no attribution trailer).

| Push | SHA | Pushed by |
|---|---|---|
| Item 2 | 286c8e3b8ffc88370a22b0ad286ce6c910c9a3a1 | me, 20:12:15Z |
| Item 3 | 44ac75f04b5c1e6ec262855f5ba53ff23d45a5b4 | the owner (`!`; it changes `.github/workflows/verify.yml`), 20:25:59Z |
| Probe (a) | 3e663e7c1 | me, 20:43:34Z |
| Probe (b) | 4ac04ec0f | committed locally; push after (a) is recorded |

P0 reference (from `P0-REPORT.md`): verify 5.4-6.5 min and about 7 runner-minutes (rm); a broad fast-e2e 15.3-16.2 min, 94-96 checks, 87-91 rm.

---

## Item 2: the broad list shrinks; every source file maps to its own checks

### Diff (d3bfea9be..286c8e3b8): 6 files, +895 / -376

| File | +/- | What changed |
|---|---|---|
| `scripts/ci/affected.mjs` | +15/-13 | An unmapped path fails the plan with a one-line fix (owner ruling B). No default set runs any more. Unit-test entries in a row are listed as `unitTests`, never as browser checks. The glob regexes are compiled once (memoized). |
| `scripts/ci/check-map.json` | +795/-337 | broad is now 31 lines: the owner's 24 plus 7 reviewed keep-lines, with `broadReasons`. 599 new rows and 122 extended rows. `previewTier` (46 rows). `scripts/whiteboard/**` is `none`. `defaultChecks` and `defaultReason` are removed (no longer used). |
| `scripts/ci/check-map.test.mjs` | +60/-11 | New tests, listed below. |
| `scripts/ci/affected.test.mjs` | +23/-13 | Unmapped fails; unit tests are kept apart from browser checks. |
| `scripts/ci/cad-registration.test.mjs`, `ctrlk-extraction-registration.test.mjs` | +1/-1 each | `cad-execute/server.mjs` and `RegionalImageEdit.jsx` are now `mapped`, no longer `broad`. |

### Tests, written first and red before the change
- **New in check-map.test.mjs:**
  - broad equals the owner's list plus the keep-lines, each with a reason;
  - every mapped row names a Linux check or a unit test that `run.sh test:unit` runs, or is a recorded Preview/Full-tier row;
  - a one-file change in each area is mapped, selects its area's own check, and selects at most half the broad set;
  - `WhiteboardVideoCard.jsx` is no longer shadowed by a broad glob.
- **New in affected.test.mjs:** an unmapped path fails every part with exit 1 and one fix line; unit-test entries go to `unitTests`.
- **Result:** `node --test "scripts/ci/*.test.mjs"` gives 88 tests: 87 pass, 0 fail, 1 skipped (the same skip as on main).
- **Main itself was red on one test** ("every tracked executable file has a class"): `scripts/whiteboard/whiteboard-smoke.mjs` had no class. It is now `none`, with the reason "DEV-only /whiteboard smoke run by hand against a review clone with real model calls; never imported by the app or a worker".

### The 7 keep-lines and their reasons (`broadReasons`)

| Keep-line | Reason |
|---|---|
| `packages/web/e2e/provider-tripwire.js`, `packages/web/e2e/tripwire-*.js` | The provider tripwire every browser check loads. A change alters what every check proves; the gate attests a 0 count for it per stage. |
| `packages/web/src/fonts/*.woff2` | Bundled into every page; a glyph change shows in every page and screenshot check. |
| `packages/web/*.html` | The page entries (index.html) that every bundle and every browser check loads. |
| `docs/courses/nanogpt/lesson-01-plan.md`, `lesson-02-plan.md`, `quickstart-curriculum.md` | Markdown the bundles import at run time. |

### How the new rows were made (one-time generator, kept in the scratchpad, not committed)
- Each row is: the area's checks, plus the checks of its nearest importers that have checks of their own, plus the unit tests that import the file.
  - Area checks are found by file name (whiteboard, animation, cad, motion, explain, chat and proposals, files and sources, markdown, share and fork, image, credits, telemetry, comments, explore, voice, study, slash, and others).
  - The nearest-importer walk stops at an existing row and goes at most 3 hops.
  - The unit tests are those `run.sh test:unit` runs that import the file.
- A file with no area, no importer checks and no unit test gets the app-shell set (the old default): this happened for 34 rows.
- The renderer and executor packages each got one glob row.

### The exact rule for every generated row (the owner's ask)
No row was written by hand. The 599 new rows and the 122 extended rows all come from the same generator; extended rows keep their old entries and gain the generated ones. For each file F, the row is the union of four parts:

1. **F's own area, by name pattern.** A regex over the last two path segments of F (for example `/whiteboard/`, `/chat|proposal|generation/`, `/voice|tts|speech|audio|narrat/`) adds that area's fixed list of Linux checks. There are 27 area lists; for example, chat and proposals = card-prompt, chat-generation, chat-outputs and explain-proposal-card.
2. **F's nearest importers, from the import graph.** The graph is built from relative static and dynamic imports, `new URL(..., import.meta.url)`, CSS `@import` and relative `readFileSync` paths.
   - The walk goes upward, breadth-first, from F's direct importers.
   - An importer that has checks of its own contributes them, and the walk stops there. "Of its own" means an existing row, or, for another file leaving broad, its name-pattern area.
   - An importer with no checks of its own lets the walk continue through it, at most 3 hops.
   - Test files and `packages/web/e2e` files are skipped.
3. **Unit tests.** Every unit-test file that `run.sh test:unit` runs and that imports F directly (one hop). For Python and data files in byoc/cli, the CI-run tests that name the file.
4. **A fallback.** If parts 1-3 give no Linux check and no unit test, F gets the old app-shell set (34 rows).

**`whiteboard-policy.js` (7 checks) shows how the rule widens a row.**
- whiteboard-command and whiteboard-mvp come from part 1 (its own name).
- card-prompt, chat-generation, chat-outputs and explain-proposal-card come from part 2: `generation-proposal.js` imports it, and that file's name matches the chat-and-proposals pattern.
- voice-tts-stream also comes from part 2: `whiteboard-tts.js` imports it, and "tts" matches the voice pattern.
- The chat and proposal checks are real reach: proposals carry the whiteboard estimate. voice-tts-stream is **wider than the real reach**: that check covers the app's TTS stream, not the whiteboard's narration.

**Rows that look wider than their file's real reach.**
- The weak point is part 2: an importer's checks come from its name, not from what those checks exercise.
- 138 generated rows select 30 or more Linux checks.
- Some of these are genuinely near-broad: flags.js 84, api.js 78, routes.js 78, ui.jsx 77, session-display.js 78, Md.jsx 48.
- A control-plane cluster of about 60 files all land on the same 41 checks. Examples: canvases.js, token.js, aws.js, arxiv.js, learn-models.js, learn-video.js, learn-shared-ask.js, repositories.js. Each is imported by many control-plane modules, and those importers' names (comments, stars, creators, publication-analytics, repositories and so on) add up to the same 41. For files like aws.js, arxiv.js and learn-video.js that is probably wider than their real reach.
- Wider never loses coverage, it only costs minutes.
- Two options to tighten it, if the owner wants:
  - (i) for control-plane files, use only F's own area plus its direct importers' areas (no hops), or
  - (ii) cap what importers can add and rely on the unit tests.
  - Either is a regenerated check-map.json in one push.
- Not done.

### One-file change, before and after (affected.mjs on the same file)

| File | Before (class, Linux checks) | After |
|---|---|---|
| control-plane/src/whiteboard-job.js | broad, 96 | 2 checks + 2 unit tests |
| web/src/WhiteboardVideoCard.jsx | broad, 96 | 32 (its row now runs) |
| control-plane/src/animation-job.js | broad, 96 | 2 + 15 unit tests |
| web/src/Animation3DCard.jsx | mapped, 1 | 1 |
| control-plane/src/cad-jobs.js | broad, 96 | 1 + 7 |
| web/src/CadCard.jsx | mapped, 5 | 5 |
| control-plane/src/motion-provider.js | broad, 96 | 5 + 4 |
| control-plane/src/learn-video.js | broad, 96 | 42 + 12 |
| control-plane/src/explain-job.js | broad, 96 | 5 + 14 |
| web/src/ExplainBackPanel.jsx | mapped, 4 | 4 |
| control-plane/src/chat-proposal-route.js | broad, 96 | 5 + 9 |
| web/src/ChatPane.jsx | broad, 96 | 17 + 1 |
| control-plane/src/file-jobs.js | broad, 96 | 7 + 7 |
| control-plane/src/learn-files.js | broad, 96 | 6 + 5 |
| web/src/SourcesPane.jsx | broad, 96 | 18 + 2 |
| web/src/Md.jsx | broad, 96 | 48 + 2 |
| web/src/learn-rich-text.js | broad, 96 | 31 + 1 |
| control-plane/src/learn-shared-ask.js | broad, 96 | 41 + 7 |
| web/src/SharePanel.jsx | mapped, 13 | 13 |
| web/src/canvas-fork.js | mapped, 5 | 5 |
| control-plane/src/canvases.js | broad, 96 | 41 + 27 |
| web/src/AdaptiveCanvas.jsx | broad, 96 | 25 + 22 |
| web/src/api.js | broad, 96 | 78 + 1 |
| control-plane/src/learn-boards.js | broad, 96 | broad, 96 (on the owner's list) |

Linux checks per new row: 0 (but with unit tests) in 46 rows; 1-9 in 298; 10-29 in 162; 30-59 in 130; 60 or more in 8 (flags.js, api.js, routes.js, ui.jsx, session-display.js and others, which genuinely reach most checks).

### The 46 Preview/Full-tier rows (`previewTier`)
These rows have no Linux check and no CI-run unit test. All are recorded as tier `preview`, each with its reason.
- **packages/control-plane:** `file-jobs-demo.mjs`, `file-jobs-dev-demo.mjs`.
- **Other packages and assets:** `packages/math-renderer/**`, `packages/web/design/rabbit-character/**`, `packages/web/public/mascot/**`.
- **packages/web/e2e:** `cad-controls-facts.json`, `card-scroll-fixtures.mjs`, `code-box-editor-component.mjs`, `code-box-enter-conflict-component.mjs`, `code-box-persistence-check.mjs`, `ctrlk-compute-check.mjs`, `ctrlk-image-replacement-check.mjs`, `ctrlk-source-derivative-check.mjs`, `equation-generator-component.mjs`, `explain-gate-fixtures.js`, `explain-gate-stub-worker.js`, `file-import-harness.*`, `inline-evidence-handoff-component.mjs`, `inline-image-transforms-pixels.mjs`, `keyless-guard.mjs`, `large-video-fixture.mjs`, `model-budget-measure.mjs`, `model-viewer-harness.jsx`, `model-viewer.html`, `scene-render-harness.*`.
- **packages/web/src:** `BackgroundRemovalPreview.jsx`, `cad-details.jsx`, `cad-dimensions-overlay.jsx`, `cad-quick-edit.jsx`, `CadReview.jsx`, `canvas-search-content.jsx`, `DocImport.jsx`, `EquationGenerator.jsx`, `file-*.js`, `inline-card-arrangement.js`, `inline-diagram-layout.js`, `inline-tool-plan.js`, `InlineCodeRunPreview.jsx`, `InlineRepositoryEvidence.jsx`, `LaserPointer.jsx`, `lazy-feature.jsx`, `mascot/*.css`, `TutorActivity.jsx`, `TutorCitations.jsx`, `TutorCodebase.jsx`, `use-learn-coaching.jsx`.

Files I could not map to a Linux check or a CI-run unit test are exactly this list. No tracked file is unmapped.

### Coverage hole (ruling G: recorded, not fixed)
- check-map.json has 150 `windows-only` checks. Only 18 of them appear in the gate's stage script (`int35.sh` on the harness branch). **The other 132 run in no workflow.**
- fast-e2e's summary calls them "release gate only", which is not true for these 132.
- The 132:
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
- **One more hole I found:** the scripts/ci tests themselves, including the check-map tests, ran in no workflow before item 3. That is how main came to carry an unclassified file. Item 3 adds them as suite `ci`.

### Measured minutes (item 2 push, 286c8e3b8)
- **Every change in this push is in scripts/ci**, so the push is broad by design: the brief says workflow and CI changes go through the full chain.
- **verify 42101166704:** 20:12:15-20:17:54Z, 339 s wall (5.6 min), 7 rm. Unit suites 223 s, npm ci 21 s, uv sync 29 s, page builds 11 s. Success.
- **fast-e2e 42101166613: CANCELLED at 14.5 min** (20:12:15-20:26:47Z), by the item 3 push to the same branch (concurrency `cancel-in-progress`).
  - Plan job: 22 s.
  - Before the cancel: 86 checks passed, 0 failed.
  - Shards (job s / install s / build s / checks s / checks run before the cancel): 1: 842/40/12/769/8; 2: 799/39/11/727/16; 3: 815/42/11/733/16; 4: 827/47/9/753/16; 5: 813/65/10/719/16; 6: 842/39/10/774/14.
  - 87 rm.
  - No complete item-2 fast-e2e exists. The item 3 run below is the next full one.

---

## Item 3: verify runs only the suites the changed paths need

### Diff (286c8e3b8..44ac75f04): 8 files, +239 / -28

| File | +/- | What changed |
|---|---|---|
| `scripts/ci/verify-plan.mjs` | +60 | New. It uses the same plan as fast-e2e: affected.mjs classify/select over check-map.json, against the newest green verify run on the branch (else the merge-base with main). See the rules below. |
| `run.sh` | +25/-11 | `test:unit` split into one function per suite. With no argument (`make test-unit`) it still runs every suite. `test:unit <suite>...` runs the named suites; an unknown name exits 2 before anything runs. |
| `scripts/verify-evidence.mjs` | +23/-3 | The note gains `suites` and `pages`. `checkEvidence` accepts `build: skipped` only when no web suite ran. New `coverGap`. A note without `suites` is a full run, as before. |
| `scripts/verify-reuse.mjs` | +8/-4 | Reuses a note only when it covered this push's plan (`SUITES` and `BUILD` from the plan step). |
| `.github/workflows/verify.yml` | +35/-9 | Checkout with `fetch-depth: 0`. The plan step comes before the reuse decision. setup-uv and `uv sync` run only for the python suite. Unit suites run as `run.sh test:unit $SUITES`. The page build follows the plan. The evidence gets `--suites` and `--pages`. Still keyless, read-only, unchanged permissions. |
| Tests | +43 / +23-1 / +22 | `scripts/ci/verify-plan.test.mjs` (7 tests), `scripts/verify-evidence.test.mjs` (+3), `scripts/verify-reuse.test.mjs` (+2). |

**verify-plan rules:**
- Lockfiles, package.json, Python project files, `.github`, `scripts/ci`, `run.sh`, `Makefile`, or an unmapped path run every suite and both builds.
- Any other path runs its own package's suite, plus the suite of every unit-test file its row names.
- A broad path also runs web, control-plane and scripts.
- Docs run nothing.
- A web suite run brings one build (dist-dev).
- A plan that cannot be made runs everything.

### Tests run locally
- verify-evidence, verify-reuse and verify-plan tests: 25 pass, 0 fail.
- `bash run.sh test:unit scripts`: 207 tests, 207 pass.
- `bash run.sh test:unit render ci`: render 32 tests, 30 pass, 2 skipped (the real render and the Linux sandbox are opt-in); ci 95 tests, 94 pass, 1 skipped.
- `bash run.sh test:unit nope`: "unknown unit suite", exit 2.

### Measured (item 3 push, 44ac75f04). This push changes `run.sh`, `.github` and `scripts/ci`, so it selects everything by design.
**verify 42103316336** (the first run of the new verify.yml): 20:25:59-20:32:03Z, 364 s wall (6.1 min), 7 rm, success.
- Plan step log: `Verify plan against 286c8e3b: every suite; build both`. The reasons it printed: `all: .github/workflows/verify.yml`, `all: run.sh`, `all: scripts/ci/...`.
- Steps: setup-uv 45 s, npm ci 20 s, unit suites 249 s, page builds 12 s.
- The verify note written on 44ac75f04: `"unit": "pass", "build": "pass", "suites": ["python","web","control-plane","viz","evals","motion","render","file-convert","scripts","ci"], "pages": "both", "run": "42103316336.1"`.
- Suites that ran in CI for the first time:
  - `render` (the whiteboard renderer, `packages/learn-render/whiteboard/*.test.mjs`): 32 tests, 30 pass, 0 fail, 2 skipped (opt-in heavy tests).
  - `ci` (`scripts/ci/*.test.mjs`): 95 tests, 95 pass, 0 fail, 34 s.
  - No failures.
- The other suites: web 5170 tests, control-plane 3628, scripts 207, evals, motion 419, viz and file-convert; all 0 fail.

**fast-e2e 42103316294:** 20:25:59-20:43:01Z, success, 96 checks, 89 rm.
- Plan job: 18 s.
- Shards (job s / install s / build s / checks s / number of checks): 1: 895/30/10/835/16; 2: 785/28/10/726/16; 3: 693/20/10/642/16; 4: 864/42/10/791/16; 5: 947/63/12/774/16; 6: 853/29/10/792/16.
- Verdict job: 3 s.

**The fast-e2e `verdict` job is not new.** It has been in fast-e2e.yml since 69f2467b6 (2026-10-13): fast-e2e.yml:161-178. It passes when the plan and every part passed, or when the plan selected 0 checks and no part ran. Items 2 and 3 do not change it or any other part of fast-e2e.yml.

### Notes for item 1 (the other agent)
- The verify note keeps `unit` and `build` and adds `suites` and `pages`. A note without `suites` is a full run.
- If the gate's `make test-unit` is skipped because verify passed, require a note whose `suites` is absent or lists every run.sh suite.
- Nothing here touches the gate record.

---

## After-numbers: one-file pushes on feat/ci-speed (comment only, reverted afterwards)

(a) control-plane, 3e663e7c1 (`packages/control-plane/src/whiteboard-job.js`). Expected: fast-e2e 2 checks plus 2 unit tests; verify runs the control-plane suite only, with no page build.

- **fast-e2e 42106037991:** 20:43:35-20:45:58Z by the jobs, **144 s wall (2.4 min)**, **6 rm**, success. P0 broad: 15.5 min, about 90 rm.
  - Plan job: 27 s (20:43:38-20:44:05Z).
  - Shards (job s / install s / build s / checks s / number of checks): 1: 74/20/9/27/1 (`whiteboard-mvp`, 7/7 checks passed, 9 s); 2: 104/30/11/31/1 (`whiteboard-command`, 6/6 checks passed, 6 s). The rest of each check step is starting the local stack.
  - Verdict job: 4 s.
  - Selected: 2 checks plus 2 unit-test files, as expected. fast-e2e lists the unit tests; verify runs them, in their whole suite.
- **verify 42106038009:** 20:43:35-20:46:17Z, **162 s wall (2.7 min)**, **4 rm**, success. P0: 5.4-6.5 min, 7 rm.
  - Plan: `Verify plan against 44ac75f0: control-plane; build none`.
  - It ran the control-plane suite only (3628 tests, 0 fail, 96 s), with no page build and no uv setup.
  - npm ci 24 s.
- **Together:** about 2.7 min wall, 10 rm, against about 15.5 min and about 97 rm for the same kind of one-file control-plane push before.

(b) web, 4ac04ec0f (`packages/web/src/SourcesPane.jsx`), pushed at 20:47:15Z after both (a) runs had completed. Expected: fast-e2e 18 checks plus 2 unit tests; verify runs the web suite and dist-dev.

- **fast-e2e 42106618072:** 20:47:26-20:53:49Z by the jobs, **394 s wall (6.6 min)**, **30 rm**, success.
  - **18 checks**, as expected, plus 2 unit-test files.
  - Plan job: 20 s.
  - Shards (job s / install s / build s / checks s / number of checks): 1: 278/30/11/202/1; 2: 240/30/11/179/1; 3: 226/27/10/169/3; 4: 203/17/9/158/3; 5: 356/160/11/166/4; 6: 242/55/11/157/6.
  - Shard 5's install includes 160 s for the Firefox/WebKit engine libraries, for embed-firefox and embed-webkit. That shard decides the wall time.
  - Verdict job: 3 s. Every check exited 0.
- **verify 42106618130:** 20:47:16-20:51:08Z, **232 s wall (3.9 min)**, **5 rm**, success.
  - Plan: `Verify plan against 44ac75f0: web, control-plane; build dist-dev`.
  - Control-plane runs too because SourcesPane.jsx's row names one control-plane unit test (`packages/control-plane/test/pdf-pages.test.js`, which imports the web module).
  - Unit suites 163 s: web 5170 tests and control-plane 3628, 0 fail. dist-dev build 5 s. npm ci 16 s. No uv.
- **Together:** about 6.6 min wall, 35 rm, against about 15.5 min and about 97 rm before.

**Revert commit c7eb5cc2e** (pushed at 20:54:55Z) removes both probe lines. Its tree is 0cd83377, identical to item 3's 44ac75f04 tree, so the branch content equals item 3 again. Its own runs are only a check that this content is restored, not a measurement. **feat/ci-speed tip: c7eb5cc2e6d4da135734fdd0f99605bb7770c506.**

### Before and after, from real runs

| Push | fast-e2e wall | checks | fast-e2e rm | verify wall | verify suites | verify rm |
|---|---|---|---|---|---|---|
| P0 broad lane push (before) | 15.3-16.2 min | 94-96 | 87-91 | 5.4-6.5 min | all | 7-8 |
| (a) one-file control-plane, after | 2.4 min | 2 (+2 unit tests) | 6 | 2.7 min | control-plane | 4 |
| (b) one-file web, after | 6.6 min | 18 (+2 unit tests) | 30 | 3.9 min | web, control-plane | 5 |

Not checked: the area table counts other than (a) and (b) come from affected.mjs locally, not from CI; billing multipliers.
