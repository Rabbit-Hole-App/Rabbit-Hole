> Superseded in part (5 Nov 2026): this is the report written before any real gate ran. The first candidate (tripwire step in fast-e2e.yml, 99b406666 / 23b57621 / 9853b58a7) attested nothing because that step ran after run-part.sh had stopped the stack; the shipped candidate is 1c3f73d9c (the read moved into run-part.sh). The measured Windows numbers are in ../receipt.md. Everything else here stands.

# Item 1 report: the gate runs nothing already green (5 Nov 2026)

Builder: item-1 agent. Nothing pushed, no workflow dispatched, no deploy. Two local worktrees, four local branches.

## Branches (all local; the two `-wf` branches contain a workflow file and need the owner's `!` push)

| Branch | Worktree | Commits | Base |
|---|---|---|---|
| `feat/ci-gate-attest` (no workflow file) | `C:\Users\cyudhist\Desktop\workspace\ci-gate-attest` | 5205b062f | `rabbit-hole/main` 091843927 (main moved on from d3bfea9be; I used the current tip) |
| `feat/ci-gate-attest-wf` (= above + `.github/workflows/fast-e2e.yml`) | same | 99b406666 (tree 5c5b8a4b5224210c8a4c8a9a1913117bf9406d63) | |
| `fix/ctrlk-gate-selection-attest` (no workflow file) | `C:\Users\cyudhist\Desktop\workspace\ci-gate-attest-harness` | 55b638cd1 | `rabbit-hole/fix/ctrlk-gate-selection` fc0ff0a62 (never pushed to, never merged into) |
| `fix/ctrlk-gate-selection-attest-wf` (= above + `gate-sharded.yml`) | same | c475d83e7 | |

I did not push the two non-workflow branches: the `-wf` branches contain them, and a separate push would only burn a second broad verify and fast-e2e on the same code.

## What the design is

A gate stage is taken from the exact-SHA fast-e2e run only when that run's artifact shows the check's own `exit 0  N/N checks passed  (Ns)` line (ruling A) and the part's new `tripwire.log` reads `provider-tripwire hits: 0` and the part's stack never restarted. The green conclusion alone never counts. Any doubt leaves the stage running.

Harness (`scripts/r36-gate/`):
- `attest.mjs` (new): `readPart`, `attestedStages`, `checkRun`, `attestation`.
- `dispatch-preflight.mjs`: after the existing refusal checks, `plan()` reads the newest green fast-e2e run at the exact sha and its per-part artifacts (`gh run download`), and writes job outputs `attest`, `layout`, `parts`. Any error gives an empty attestation, the committed SHARDS and the nine parts.
- `shards.mjs`: `ATTESTABLE` (20 stages), `TAG`, `shardsOf`/`partsOf` (layout from `GATE_LAYOUT`), `shardScript(full, n, shards)`, `mergeShards(..., { shards, attest })`. The merge writes `<stage> provider-tripwire hits: 0` and `<stage> exit 0  N/N checks passed  attested-by-fast-e2e run=<id> sha=<40hex>` for each taken stage, plus a `gate paths:` line. It refuses a stage outside ATTESTABLE, one that also ran, a non-N/N count, or a bad run/sha.
- `pack.mjs`: `pack(d, k, skip)`, `layoutFor`. The stages that still run are repacked into fewer shards with the existing packer (units kept whole).
- `collect.mjs`: re-reads the attested run through the API (same sha, completed success) and fails the gate otherwise; passes the commit to `gateVerdict`; records `attested` in `gate-verdict.json`.
- `run.mjs`, `prepare.mjs`: read the layout instead of the constant.
- `gate-sharded.yml` (`-wf`): preflight gets `id`, `outputs`, wider sparse checkout; matrix is `fromJSON(needs.preflight.outputs.parts || '<the nine>')`; `GATE_LAYOUT` on run; collect `needs: [preflight, run]` with `GATE_LAYOUT` and `GATE_ATTEST`.

App (`scripts/`):
- `gate-attest.mjs` (new): `ATTESTABLE`, `TAG`, `attestation`, `attestGaps`, `attestedStages`, `attestedRunBlockers`. Independent of the harness list (a different repo and branch cannot import it).
- `dev-deploy.mjs`: `gateVerdict(text, tree, inTree, sha)` and `rerunVerdict(..., { gSha })` refuse a tag on a stage outside ATTESTABLE, a malformed tag, a sha that is not the gated commit (or no sha given), and keep requiring the positive N/N count and the stage's own tripwire line. New `gatePaths(text)`; main prints `gate path: ...` and the dev row gets `"attested":{"run","sha","stages"}` (not on a reuse row).
- `dev-deploy-gate.mjs`: `attestedBlockers` requires every attested run to be a completed success of fast-e2e at the exact commit in the runs it read; a rerun record may not carry a tag.
- `prod-release.mjs`: `greenDevDeploy` accepts a row with or without `attested`; with it, stages must be attestable, sha must be the row's, run numeric. `checkPrepare` then requires that run to be a completed fast-e2e success among the runs read. No `gates` value change and no `deploy-prod.yml` change were needed: the field is inside the row prepare already reads.
- `fast-e2e.yml` (`-wf`): one step, before "Stop the stack": reads `http://127.0.0.1:8878/__provider-tripwire` and writes `provider-tripwire hits: N|unreadable` to `$RUNNER_TEMP/fast/tripwire.log` (uploaded with the artifact).
- Docs: `docs/features/dev-auto-deploy.md` section "Stages taken from fast-e2e"; harness `README.md` section.

## Stages attested vs still run

Attested (20), the exact skip list: sketch (explain-back-sketch), project-canvases, fork (canvas-forking), dive, handle, explore-holes, card-select, naming, visibility, sidebar, card-redesign, project-menu, creator-profile, analytics-ui, workspace, card-context-menu, panel-header, slash-sheet, thumbnails (card-thumbnails), cross-device.

P0 counted 22 shared checks. I keep two in the gate on purpose: `share-revocation` (an access check; the owner's brief names it among the smoke stages) and `library-folders` (it shares int35.sh's `for beta` block with share-revocation, and `shardScript` refuses to split that block). Their check time is 0.48 + 0.11 min in `durations.json`.

Always run, on every path: `make test-unit` and `fixture regression` (paidRefusal, escrow, auth tests), `bundle(dist)`, `bundle(dist-dev)`, rh-app, comments, comments-invite, explore, sca, rh-dev, selected-pill, repo-browser, equation, rh-local, filedrop, answer-routing, canvas-shell, canvas-toolbar, journey J1-J8, tutor-slice, blank-hooks, practice-card, canvas-chrome, share-revocation, library-folders, and the Windows `checkpoints` part (preflight plus instrumented Dive). The dev smoke (sign-in), the prod secret preflight, the prod schema preflight and the `prepare` production-bundle check are not gate stages and are unchanged (a test greps for each).

Windows `units` part: **kept on every path.** Ruling from P0 was keep it for the Full-gate tier and drop it elsewhere only if safe without item 3; item 3 is not in main, and item 3's note to me says a verify note without `suites` means a full run and `run.sh test:unit` now splits per suite. I did not skip `make test-unit` anywhere. If it is later skipped because verify passed, the gate must require a verify note whose `suites` is absent or lists every run.sh suite. That is not implemented.

## Windows parts and runner-minutes

Before (P0, real runs 41938211033 and 42073187357): 9 Windows parts: `units`, `checkpoints`, `shard-1`..`shard-7`; wall 15.0-15.6 min; about 93-96 raw runner-minutes (Windows bills at 2x Linux, so about 186-192 Linux-equivalent); longest part shard-4, 14-15 min.

After, structural fact from the code (not a measurement): with all 20 stages attested the matrix is 6 Windows parts: `units`, `checkpoints` and 4 shards (journey group; rh-app, comments, comments-invite, explore, repo-browser and the two bundles; rh-dev, sca, selected-pill, filedrop, library-folders, share-revocation; answer-routing, equation, canvas-shell, canvas-toolbar, rh-local). Verified by generating `shardScript` for that layout and for three smaller skip sets against a prepared gate.

After, runner-minutes: **missing: needs the dispatch (held until the owner releases the hold; no real run exists).** A real run needs two owner pushes first (below): the app candidate must contain the new fast-e2e step (otherwise no part has a `tripwire.log` and nothing is attested, by design), and the harness branch must contain the workflow. The candidate change touches `.github/**`, which the check map treats as broad, so fast-e2e will run all checks and attest all of them if they pass. After the pushes and a green verify and fast-e2e on 99b406666, dispatch `gate-sharded.yml` with `--ref fix/ctrlk-gate-selection-attest-wf` and read per-part durations from the run's jobs.

## Tests added and run

- App `scripts/gate-attest.test.mjs` (11 tests; the 11th, the fast-e2e step pin, is on the `-wf` branch): both paths pass; refusal on a different sha, on no sha, on a malformed tag, on a missing, partial or zero count, on a failed stage; the tripwire line still required for an attested stage; tripwire test that every gate stage outside ATTESTABLE (unit run, fixture regression, both bundles, rh-app, journey, tutor, share-revocation, library-folders) is refused when tagged, that ATTESTABLE names match no money/auth/secret/migration/bundle word, and that prod-release and dev-deploy still contain the bundle check, secret and schema preflights and smoke; red run, in-progress run, other sha, unknown run id and pull_request run refused; prepare accepts both row shapes and refuses non-attestable, unknown, empty, other-sha, no-run and non-numeric attestations and an attested run that is not in the runs read or is red.
- App `scripts/dev-deploy.test.mjs`: one existing source-pin regex updated for the new `attested` spread.
- Harness `scripts/r36-gate/attest.test.mjs` (9 tests), `collect.test.mjs` (+1), `shards.test.mjs` (workflow pins, on the `-wf` branch). They cover: result-line parsing (failed, N/M, 0/0, repeated, readiness, restart-suffixed lines all refused), tripwire file missing or non-zero, stack restart, two parts naming one check, the never list, red run, other sha, expired artifact, newest attempt per part, plan fallback on API error, layout validation, merge output with tag/run/sha and `gate paths`, merge refusals, cross-check that the app's `attestedStages` parses the harness record, and collect failing on an attestation for another commit or an unreadable run.
- Commands and results (Git Bash):
  - App, `-wf` branch: `node --test scripts/*.test.mjs scripts/ci/*.test.mjs` gave tests 297, pass 295, fail 0, skipped 2 (the glob `run.sh test:unit` uses for scripts is `scripts/*.test.mjs`; I did not run the whole `run.sh test:unit`, which is Python, web and control-plane suites I did not touch).
  - Harness, `-wf` branch: `R36_FIXTURE_SOURCE_ROOT=<app worktree> node --test scripts/r36-gate/*.test.mjs` gave tests 151, pass 141, fail 5, skipped 5. The same 5 fail on the unmodified harness with the current main as source root (fixture-adapters and prepare-sources tests against the newer checks): shared canvas adapter, repo-browser adapter, adapter skip, portable preparation, already-fixed check. They are unrelated to this change. I did not run the Windows-only parts.
  - YAML of both workflow files parsed (pyyaml).

## The `!` commands (verified: remote `rabbit-hole`, both worktrees share the repository config, branches exist locally)

1. Application candidate (contains `fast-e2e.yml`):
   `!git -C C:/Users/cyudhist/Desktop/workspace/ci-gate-attest push rabbit-hole feat/ci-gate-attest-wf`
   Then wait for verify and fast-e2e to pass on 99b406666cb65d85db0ffe131a0f5651115c42e4 (tree 5c5b8a4b5224210c8a4c8a9a1913117bf9406d63).
2. Harness (contains `gate-sharded.yml`):
   `!git -C C:/Users/cyudhist/Desktop/workspace/ci-gate-attest-harness push rabbit-hole fix/ctrlk-gate-selection-attest-wf`
   (gate-sharded.yml is a workflow file; collect also waits for a green verify on the harness sha c475d83e7df13724d32a7bd289737e982ab881c2.)
3. Only after you tell me both are on the remote and verify and fast-e2e are green on the candidate: `gh workflow run gate-sharded.yml -R Rabbit-Hole-App/Rabbit-Hole --ref fix/ctrlk-gate-selection-attest-wf -f app_sha=99b406666cb65d85db0ffe131a0f5651115c42e4 -f app_tree=5c5b8a4b5224210c8a4c8a9a1913117bf9406d63`. fast-e2e artifacts keep 7 days.

No change to `deploy-prod.yml` or `deploy-dev.yml` is needed.

## Mismatches between the owner's text and the code

1. Owner: "dev-deploy.mjs runs the deploy ... Its 45 e2e stages run only when no green verify/fast-e2e exists". The stages run in the harness (another branch), so the skip is in the harness plus an independent check in `gateVerdict`; dev-deploy.mjs runs no stage (P0 mismatch 1). Unchanged by me.
2. fast-e2e does not record provider-tripwire hits per check, and the gate requires a tripwire line for every browser stage and `extraReceipts` requires `project-menu provider-tripwire hits: 0`. Ruling A (result line only) would have dropped that proof for 20 stages. I added the one workflow step above (fast-e2e.yml was not on the do-not-touch list) so the proof exists per part; it is stricter than a per-check count (any hit in the part blocks every stage of the part). Without it nothing is attested. If you prefer ruling A with no tripwire condition, say so: it is a one-line change in `attest.mjs` `readPart`, but it removes the tripwire proof for these stages.
3. "22 shared checks": I attest 20; share-revocation and library-folders stay (reasons above).
4. "Windows `units` dropped elsewhere": kept everywhere (see above).
5. "prod-release.mjs accepts both with a new gates value or field and deploy-prod.yml:33-40 adjusted": a field (`attested`) inside the existing row, no workflow change.
6. The stack the gate uses for a check is Windows with the r36 adapters for four checks; fast-e2e's is Linux. Ruling A accepts that; none of the 20 is an adapted check (adapted: sca, selected-pill, tutor-slice, repo-browser, answer-routing; all still run).

## Open risks

- No real run yet: the preflight's `gh run download` path, the artifact root layout (I search `fast.log` and `tripwire.log` recursively), `fromJSON` fallback and the sparse checkout are unit-tested or YAML-checked but not exercised on GitHub.
- Two edits to `fast-e2e.yml` from different lanes will conflict textually (item 2 edits the plan job); mine is one step before "Stop the stack".
- The harness `ATTESTABLE` and the app `ATTESTABLE` are two lists in two repos. Drift is caught at deploy time (the app list refuses an unknown tag) but not by a shared test; the harness test only cross-checks the tag format when `R36_FIXTURE_SOURCE_ROOT` points at an app checkout that has `gate-sharded` support.
- Old candidates (no `gate-attest.mjs`) would accept a tagged line as an ordinary line because their `gateVerdict` ignores the tag; the harness itself enforces ATTESTABLE and collect re-reads the run, so the exposure is only a hand-edited gate note.
- Items 2 and 3 can make fast-e2e narrow: a green run that did not run a check simply attests nothing for it (the stage runs). That is the intended behaviour of ruling A.
- fast-e2e retention is 7 days: a later gate rerun finds no artifact and runs everything.
- The model of a smaller layout (4 shards) is deterministic, but its wall time and minutes are unmeasured.

## Update after owner rulings (rebased onto feat/ci-speed 44ac75f04)

- Base: `rabbit-hole/feat/ci-speed` tip is two comment-only probe commits (3e663e7c1, 4ac04ec0f) on 44ac75f04; I based on 44ac75f04.
- Pushed (non-workflow): `feat/ci-gate-attest` 0da91db1b935d2d127d8952cef66827ea98cf5c7; `fix/ctrlk-gate-selection-attest` f22d1ad4d05f1b47913f843c41b74d4df11b9f12.
- Local, for the owner's push: `feat/ci-gate-attest-wf` 23b57621cfc41eb6ab6c5514663c90c1aee77af0 (tree 27c19222481f33fbef3b9d154520fcea8342843a); `fix/ctrlk-gate-selection-attest-wf` 704c3775a2da71b32be880d998e5bbcb69fb5714.
- Added: tripwire, 7-day expiry and drift-guard rules in docs/features/prod-release.md; `gate-attestable.json` fixture (identical blob 560a153b in both repos); collect.mjs fails when the candidate has no scripts/gate-attest.mjs or its list differs.
- Tests: app `node --test scripts/*.test.mjs scripts/ci/*.test.mjs`: wf branch 314 tests, 312 pass, 0 fail, 2 skipped; non-wf 313/311/0/2. Harness (both harness branches): 152 tests, 142 pass, 5 fail (the same 5 pre-existing), 5 skipped.
