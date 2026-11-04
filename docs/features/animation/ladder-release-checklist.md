# Ladder release checklist (one combined release)

**Reference. Parallel sends commands at the moment of use.** This page says what happens, in what order, and who sends what; the commands are named so they are verified in advance, and none of them is a standing instruction.

Owner decision 23 (3 November 2026): **one** fast-path release carries MVP2b, MVP3, MVP4 and MVP5, after the `--mvp` branch release and both gates have passed. There is no separate MVP2b or MVP3 release. Plan: `docs/superpowers/plans/2026-10-30-animation.md` sections 8 and 13.3 to 13.4; mechanism: `docs/features/mvp-fast-path.md`; recovery: `recovery-ladder.md`.

## The candidates

| Name | What it is | What runs on it |
|---|---|---|
| C3 | main plus MVP2b (streaming, deadline, retry, escrow) plus MVP3 (the five client features, renderer, framing, golden fixture) | Gate 1 on its dev preview |
| C4 | C3 plus the AN-20 prompts and archetype | Gate 2 on its dev preview, starting the moment that preview is up |
| C5 | C4 plus **only** the copy and claim-list commit and scripts and docs | the fast-path preview, the focused smoke, the release |

C5 must not touch anything Gate 2 measured: `contract.js`, `scene.js`, `framing.js`, `capabilities.js`, `review.js`, `renderer.js`, `session.js`, the golden JSON, the prompt files, `animation-brief.js`, `animation-author.js`, `animation-review.js`, `animation-render.js`. The smoke proves it from the recorded Gate 2 table (`gate2-result`); a change to any of them reruns the gate it was in (plan section 8, rules).

## Order, owner, and what is sent when

| # | Step | Who sends it | When |
|---|---|---|---|
| 1 | Freeze C3 (sha, tree, base). Record the base: main at its current tip. | Parallel | before Gate 1 |
| 2 | Deploy C3 to its dev preview; run Gate 1 (`author-sample.mjs verify-candidate` first, then the batch). Read the table. | Parallel; owner looks at the captures | after the `--mvp` branch release |
| 3 | Freeze C4 = C3 + AN-20 prompts. Deploy its preview. Start Gate 2 (`sgd-qualify.mjs --check`, then the paid run) the moment the preview is up. | Parallel; owner approves the second test session | when Gate 1 passed |
| 4 | Build C5 = C4 + the copy and claim-list commit + scripts and docs, only. | Parallel | when Gate 2 passed |
| 5 | Cut the recovery branch from C5 and push it: `cut-recovery.sh combined <C5> --prev <main> --prompts-from <C3> --push`. It prints `RECOVERY READY`. Optionally cut the four single-slice branches the same way. | Parallel | before the preview, because the launcher requires the branch to be on `rabbit-hole` |
| 6 | Preview and record: `node scripts/mvp-fast-path.mjs preview --mvp --sha <C5> --recovery <branch> --smoke "<the smoke below>"`. Build, affected tests, smoke, then the isolated clone is deployed. | Parallel | after 5 |
| 7 | Live items on the clone, after the deploy: `ladder-smoke.mjs combined --live-only --origin <clone url>` (and `--cookie-file` for the signed-in route check). Read the SKIP lines. | Parallel | after 6 |
| 8 | Publish the record note: `git push rabbit-hole refs/notes/dev-deploys` (fetch and merge the remote notes first if refused). | the owner's `release-mvp.sh` does it with step 9 | with 9 |
| 9 | The owner allows the exact sha, checks, releases, removes the allowance: `gh variable set MVP_ALLOWED_SHA`, `release-mvp.cmd <name> --check`, `release-mvp.cmd <name>`, `gh variable delete MVP_ALLOWED_SHA`. Agents never set the variable. | owner | after 7 is read |
| 10 | Post-release verification, read-only, through `with-cf.mjs`: `post-release-verify-ladder.mjs --slice combined --sha <C5> --canary-file <description>`. | Parallel | the second `RELEASE DONE` prints |
| 11 | One real SGD request as the signed-in user (the plan's one post-release production spend), and the weekly canary scheduled. | owner / Parallel | after 10 passes |
| 12 | Closeout: `fix.md` fixing shas, `spend.md` totals, `checklist.md` rows, receipt with implemented / locally verified / release-verified / production-activated kept apart, worktree cleanup. | Parallel | after 11 |

The recovery branch stays pushed until the release is verified and the owner says it can go.

## The smoke (step 6)

One command, the same for the record and for a rerun:

`node scripts/animation/ladder-smoke.mjs combined --strict --sha <C5> --gate2-result <the Gate 2 out folder>`

`--strict` makes an optional test or script that is missing from the candidate a failure (everything in a combined candidate exists). A SKIP is never a pass. The fast path runs the smoke **before** it deploys the clone, so inside `--smoke` the items run against `packages/web/dist-dev`, the very bytes the deploy ships; step 7 runs the items that read the served clone.

What the combined smoke contains (prefixed by the part it comes from; a test file is run once):

| Part | Items |
|---|---|
| MVP2b | control-plane core (policy, job, recovery, races, pipeline, learn-models, usage, prod config), transport, escrow, strict-output and repair-program tests (`ANIMATION_STREAMING=false` is pinned in `animation-transport.test.js`), web client and storage tests; the optional paid grid-game job is printed, never run |
| MVP3 | the golden fixture exists; web unit tests (contract, capabilities, client, storage, scene, framing, renderer, review, session, card, legibility, `sgd-golden`); control-plane client-features gate, golden through the real routes, old-client, SGD framing, fixtures, fit, pipeline; **the old-client 409 path for the five flags** (`ladder-old-client-409.test.mjs`: through the real route and Durable Object, a reader missing any one of the five is refused with `409 client_update_required`, one flag at a time); signed-out and signed-in route checks on the clone; the built bundle and the served bundle declare the five features; **the golden-fixture browser check** `animation-primitives-check.mjs` (printed and SKIPPED unless run with `--browser --stack <dir>` on a started stack; CI `fast-e2e` selects it by `check-map.json`; a SKIP is not a pass) |
| MVP4 | prompt and draft budget (`animation-fit`), authoring, pipeline, sampling, review-size, SGD and old-client tests; the archetype test; contract and capabilities tests; the AN-20 harness tests and its `--dry-run` preflights on the pinned SGD plan and the three known-good plans; the Gate 1 identity check is printed |
| MVP5 | **the recorded Gate 2 table** (`gate2-result`, read-only: PASS, recounted to 8 of the first 9 accepted, the control did not become SGD, the tested sha is this checkout or an ancestor with no change since to a frozen file; the files that changed are listed for the receipt); `sgd-qualify.mjs --dry-run`; the built bundle no longer says loss surfaces are not supported and claims them; slash-sheet, learning-examples and card tests; control-plane SGD, fit and old-client tests |

The old-client 409 path, the golden-fixture browser check and the Gate 2 result are in the list for every run of `combined`; they cannot be left out by editing a flag.

## What a pass does and does not establish

- It establishes: the build, the affected tests, the focused smoke above, the exact commit and tree (the record), the preflights the release already does, a pushed recovery branch that contains C5, and the Gate 2 identity.
- It does not establish: a browser pass (not run by Claude), broad CI or the release gate (recorded as bypassed, never as passed), a real SGD card in production (step 11), or that a streamed answer from the real API carries the same usage as a non-streamed one (the dev preview's paid smoke).
- A functional failure is a defect, not a CI waiver.

## After the release

`post-release-verify-ladder.mjs --slice combined` adds to the release's own checks (served commit of both Workers, flags, Durable Object, base bundle probe): the signed-out matrix (jobs and results routes 401, diagnostics 404); `ANIMATION_STREAMING` is unset or "true" (streaming on); the served bundle declares the five features; the request-box copy no longer says loss surfaces are not supported and a chunk names loss surfaces as supported; and the canary description names weekly, SGD and two failures in a row. The prompts are server code: they are verified by the served commit, not by a GET. UNKNOWN is not a pass.

## Do not

- Do not change C5 after the recovery branch is cut without cutting it again.
- Do not set `MVP_ALLOWED_SHA`, push `main`, run a paid job or deploy from this page: those are separate, explicit steps.
- Do not use the ladder's FX numbers (044 to 053, 070 to 076, 080 and up, 090 and 091) for anything else.
