# CI and release speed: receipt (5 November 2026)

Items 2, 3 and 1 of the owner's brief shipped; items 4 to 11 are parked. The hand-off for a fresh session is [STATUS.md](STATUS.md). All times are Pacific; run clocks are UTC as GitHub prints them. "rm" is runner-minutes with each job rounded up to a whole minute; a Windows runner is billed at twice a Linux runner.

## Before and after, from real runs

| Push | fast-e2e | Checks | fast-e2e rm | verify | verify rm |
|---|---|---|---|---|---|
| Broad lane push, before (P0: W0 and W1 pushes) | 15.3 to 16.2 min | 94 to 96 | 87 to 91 | 5.4 to 6.5 min, all suites | 7 to 8 |
| Broad push, after (44ac75f04, run 42103316294) | 17.0 min | 96 | 89 | 6.1 min, all 10 suites | 7 |
| One-file control-plane change, after (probe (a), `whiteboard-job.js`, runs 42106037991 and 42106038009) | **2.4 min** | 2 | 6 | **2.7 min**, control-plane suite only | 4 |
| One-file web change, after (probe (b), `SourcesPane.jsx`, runs 42106618072 and 42106618130) | **6.6 min** | 18 | 30 | **3.9 min**, web and control-plane suites plus the dist-dev build | 5 |

A broad push (anything on the broad list, or a workflow or `scripts/ci` change) costs what it always cost. The saving is on narrow pushes: 15.5 min of fast-e2e became 2.4 or 6.6, and about 97 runner-minutes became 10 or 35. Probe (b) was decided by one shard: 160 s of Firefox and WebKit engine-library install for the embed checks (parked, P-CI-001).

## The Windows gate

| | Before: W0 gate | Baseline on this branch, nothing attested | Attested, 20 stages |
|---|---|---|---|
| Run | 41938211033 | **42112793441** | **42120661030** |
| Windows parts | 9 (units, checkpoints, shard-1..7) | 9 | **6** (units, checkpoints, shard-1..4) |
| Wall time | 15.0 to 15.6 min | 13.3 min (21:27:21Z to 21:40:36Z) | **11.4 min** (22:20:31Z to 22:31:58Z) |
| Windows runner-minutes | about 93 to 96 | 94 | **56** (about 40 percent fewer) |
| Windows billed at 2x | about 188 | about 188 | about 112 |
| Longest part | shard-4, 14 to 15 min | shard-4, 12.3 min | shard-1, 10.5 min |

The wall time barely moves because `units` (8.1 min) and `checkpoints` (8.0 min) stay on every path by ruling; the saving is in runner-minutes. The baseline run is the "nothing attested" case: its preflight found no clean tripwire line (first candidate, see below) and fell back to the full gate, as designed.

The 20 attested stages are the browser checks that fast-e2e already ran green on the exact SHA: sketch, project-canvases, fork, dive, handle, explore-holes, card-select, naming, visibility, sidebar, card-redesign, project-menu, creator-profile, analytics-ui, workspace, card-context-menu, panel-header, slash-sheet, thumbnails, cross-device. share-revocation and library-folders keep running (the brief names share-revocation among the smoke stages, and library-folders cannot be split from it).

Full chain for a broad push, push to production, against P0's 36.9 min: fast-e2e 17.0 + gate 11.4 + launcher gap 2.2 + dev deploy 1.4 + production 2.0 = about 34.0 min. The last three are carried over from P0 (items 1 to 3 do not touch them) and were not remeasured.

## What shipped

| Item | Commit | Change |
|---|---|---|
| 2 | 286c8e3b8 | The broad list is the owner's 24 lines plus 7 reviewed keep-lines, each with a reason. An unmapped file fails the plan job. Every source file has a row (599 new, 122 extended). 46 rows with no Linux check and no CI-run unit test are listed in `previewTier`. |
| 3 | 44ac75f04 | `verify` plans from the same changed-path plan as fast-e2e (`scripts/ci/verify-plan.mjs`), runs only the suites it needs, records `suites` and `pages` in the evidence note, and reuses a note only if it covered this push's plan. `run.sh test:unit` is one function per suite and now also runs the whiteboard renderer tests and `scripts/ci`. |
| 1 | 1c3f73d9c (also 8b6974c26, 0da91db1b) | A gate stage is attested by the exact-SHA fast-e2e run instead of re-run (`scripts/gate-attest.mjs`, `gateVerdict`), `run-part.sh` writes `tripwire.log`, `dev-deploy-gate.mjs` and `prod-release.mjs` accept both paths. Harness side (`fix/ctrlk-gate-selection`, merged by the owner): `attest.mjs`, `dispatch-preflight.mjs`, `pack.mjs`, `shards.mjs`, `collect.mjs`. |

## Rules now in force

See [prod-release.md](../prod-release.md#gate-stages-attested-by-fast-e2e) for the attestation section, and STATUS.md for the whole list: attestation by the check's own result line; tripwire proof; 7-day artifact expiry; drift guard on the attestable list; an unmapped file fails the plan; the verify note records the suites; over-wide rows (option (i)) pending.

## What went wrong on the way (each a lesson, none a regression)

- **Item 3's push cancelled item 2's fast-e2e** (same branch, `cancel-in-progress`); item 2's fast-e2e has no complete run (86 checks passed, 0 failed at 14.5 min). Item 3's broad push supplies the 96-check number.
- **Item 1, candidate 1** put the tripwire read in a workflow step that ran after `run-part.sh` had stopped the stack, so every `tripwire.log` read `unreadable` and the first gate (42112793441) attested nothing. It failed closed. Candidate 2 (1c3f73d9c) reads the tripwire inside `run-part.sh` before the stack stops. Real artifacts: 20 of 20 stages attest.
- **GitHub's `status=success` filter returned 0 for a green `verify` run** (42114874912) a second time, so the preflight of dispatch 42120253090 refused after 5 s. A rerun of that run fixed the index; no code change.
- **Two flaky checks cost reruns** (P-CI-002): `project-menu` and `explain-back-sketch`.

## Parked

- **P-CI-001**: the 160 s Firefox and WebKit engine-library install on fast-e2e shard 5; a cacheable cost.
- **P-CI-002**: `project-menu` (fast-e2e 41997063688, W1 flip, waited 8 h 01 min for a rerun) and `explain-back-sketch` (fast-e2e 42114874686 attempt 1, TimeoutError, passed on rerun); worth a look later.
- **The 132 windows-only checks that run in no workflow**: listed in STATUS.md. Recorded, not fixed.
- **The items 1 and 2 interaction.** Attestation skips only what fast-e2e ran green on the exact SHA. After item 2 a narrow push runs few checks, so a narrow release attests few stages and still runs the 9-part gate (about 13 min, 94 runner-minutes). Item 5 (the Direct and Preview tiers) is the fix, because it lets a narrow change skip the full gate by tier.

The release's own chain numbers (this candidate through verify, fast-e2e, the gate and the production release) are in the integrator's hand-back, not in this file.
