# Ladder release checklist (one combined release, one tree)

**Historical release procedure.** The checklist below records the original C4 procedure from Decision 23. Decision 38 superseded it for the 4 November release. C14b `18d92571` shipped the scoped ladder implementation under the MVP fast path. The release succeeded, and the read-only checks confirmed the deployed build and activation. Gate 2 qualification, the SGD capability claim, the signed-in SGD acceptance and the weekly canary are parked. [Decision 38](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/superpowers/plans/2026-10-30-animation.md#L1122) · [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)

**Reference. Parallel sends commands at the moment of use.** The commands below document the original procedure.

Owner decision 23 (3 November 2026): **one** fast-path release carries MVP2b, MVP3, MVP4 and MVP5, after the `--mvp` branch release and both gates have passed. There is no separate MVP2b or MVP3 release. Owner order (later the same day): the release candidate is **one final tree**, C4 = C5, carrying the copy-and-claim commit, the scripts and this tooling; the recovery-branch cut and the combined smoke run **during** the gates, not after. Plan: `docs/superpowers/plans/2026-10-30-animation.md` sections 8 and 13.3 to 13.4; mechanism: `docs/features/mvp-fast-path.md`; recovery: `recovery-ladder.md`.

## The commits that matter

| Name | What it is | What runs on it |
|---|---|---|
| main | the previous release (`--prev`) | |
| prompt base `P` | the integrator's tree just before the AN-20 prompt work (decision 22's "MVP3 SHA"): MVP2b + MVP3 content with the pre-AN-20 prompts | the recovery restores the prompt files to it |
| C4 | the one final tree: `P` + the AN-20 prompts and harness + the copy/claim commit + scripts and docs | Gate 1 and Gate 2 previews, the combined smoke, the recovery cut, the fast-path preview, the release |

`P` is not guessed. `node scripts/animation/prompts-base.mjs <C4>` (read only) derives it twice over C4's first-parent history and prints both: by content (the last commit that still has the sentence AN-20 deleted from the author prompt) and by subject (the oldest first-parent prompt commit that says AN-20), and takes the first parent of that commit. It exits 0 only when the two agree and no other prompt-file commit sits after `P`. On the integrator's gate tree (`feat/an20-gate-tree` `2e3f7a168`) it gives `53a47f33ca90f3f18144ea2b196be4a724f3d10f` ("Merge feat/an18-contract ... into release/animation-ladder"), the commit before `e8e350691` ("cut the clamp, off-plot and tube-surface sentences ... (AN-20)"); the previous release is `166d8c6b01786e5c5990fb0ca127bc9e6a125a92`.

The copy-and-claim commit, scripts and docs must not touch anything Gate 2 measures: `contract.js`, `scene.js`, `framing.js`, `capabilities.js`, `review.js`, `renderer.js`, `session.js`, the golden JSON, the prompt files, `animation-brief.js`, `animation-author.js`, `animation-review.js`, `animation-render.js`. The smoke proves it from the recorded Gate 2 table (`gate2-result`); a change to any of them reruns the gate it was in (plan section 8, rules).

## Order, owner, and what is sent when

| # | Step | Who sends it | When |
|---|---|---|---|
| 1 | Freeze C4 (sha, tree, base). Derive `P`: `node scripts/animation/prompts-base.mjs <C4>`. | Parallel | before the gates |
| 2 | Cut the recovery branch from C4 and push it: `bash scripts/animation/cut-recovery.sh combined <C4> --prev <main> --prompts-from <P> --push`. It prints `RECOVERY READY`. Optionally cut the four single-slice branches the same way. | Parallel | the moment C4's sha is given, while the gates run (the launcher needs the branch on `rabbit-hole`) |
| 3 | Gate 1 on C4's preview (`author-sample.mjs verify-candidate`, then the batch); Gate 2 starts the moment the preview is up (`sgd-qualify.mjs --check`, then the paid run). Owner looks at captures and approves the second test session. | Parallel / owner | per the plan |
| 4 | Local list, by the integrator, before any push: `node scripts/animation/ladder-smoke.mjs combined --strict --sha <C4> --gate2-pending`. It ends `PENDING GATE 2 (not a release pass)` with exit 3 and says so on the Gate 2 line; it is never `PASS`. | integrator | while Gate 2 runs |
| 5 | Live items against the dev-clone preview: `node scripts/animation/ladder-smoke.mjs combined --strict --sha <C4> --live-only --origin <preview clone origin>` (add `--cookie-file <file>` for the signed-in route check). It ends `LIVE ITEMS ONLY (not a release pass)`. | Parallel | once the preview is up |
| 6 | When Gate 2 has finished: the release smoke, `node scripts/animation/ladder-smoke.mjs combined --strict --sha <C4> --gate2-result <the Gate 2 out folder>`; this is the `--smoke` command of the fast-path preview. **No `--gate2-pending`**: a pending run exits 3, so it cannot pass the preview. | Parallel | after Gate 2 |
| 7 | Preview and record: `node scripts/mvp-fast-path.mjs preview --mvp --sha <C4> --recovery <branch> --smoke "<the command in 6>"`. Build, affected tests, smoke, then the isolated clone is deployed. | Parallel | after 6 |
| 8 | Publish the record note: `git push rabbit-hole refs/notes/dev-deploys` (fetch and merge the remote notes first if refused). | the owner's `release-mvp.sh` does it with step 9 | with 9 |
| 9 | The owner allows the exact sha, checks, releases, removes the allowance: `gh variable set MVP_ALLOWED_SHA`, `release-mvp.cmd <name> --check`, `release-mvp.cmd <name>`, `gh variable delete MVP_ALLOWED_SHA`. Agents never set the variable. | owner | after 7 is read |
| 10 | Post-release verification, read-only, through `with-cf.mjs`: `post-release-verify-ladder.mjs --slice combined --sha <C4> --canary-file <description>`. | Parallel | the second `RELEASE DONE` prints |
| 11 | One real SGD request as the signed-in user (the plan's one post-release production spend), and the weekly canary scheduled. | owner / Parallel | after 10 passes |
| 12 | Closeout: `fix.md` fixing shas, `spend.md` totals, `checklist.md` rows, receipt with implemented / locally verified / release-verified / production-activated kept apart, worktree cleanup. | Parallel | after 11 |

The recovery branch stays pushed until the release is verified and the owner says it can go. If C4 changes, the recovery branch is cut again from the new sha, and the gate it changes reruns.

## The smoke

`ladder-smoke.mjs combined` is the union of the four parts below; `--strict` makes an optional test or script that is missing from the candidate a failure (everything in a combined candidate exists). A SKIP is never a pass. The fast path runs the smoke **before** it deploys the clone, so inside `--smoke` the items run against `packages/web/dist-dev`, the very bytes the deploy ships; step 5 runs the items that read the served clone.

Exit codes: 0 pass, 1 any failure, **3 no failure but the Gate 2 result is pending (`--gate2-pending`)**, 2 usage. Without `--gate2-pending` a missing `--gate2-result` is a SKIP that `--strict` turns into a failure.

| Part | Items |
|---|---|
| MVP2b | control-plane core (policy, job, recovery, races, pipeline, learn-models, usage, prod config), transport, escrow, strict-output and repair-program tests (`ANIMATION_STREAMING=false` is pinned in `animation-transport.test.js`), web client and storage tests; the optional paid grid-game job is printed, never run |
| MVP3 | the golden fixture exists; web unit tests (contract, capabilities, client, storage, scene, framing, renderer, review, session, card, legibility, `sgd-golden`); control-plane client-features gate, golden through the real routes, old-client, SGD framing, fixtures, fit, pipeline; **the old-client 409 path for the five flags** (`ladder-old-client-409.test.mjs`: through the real route and Durable Object, a reader missing any one of the five is refused with `409 client_update_required`, one flag at a time); signed-out and signed-in route checks on the clone; the built bundle and the served bundle declare the five features; **the golden-fixture browser check** `animation-primitives-check.mjs` (printed and SKIPPED unless run with `--browser --stack <dir>` on a started stack; CI `fast-e2e` selects it by `check-map.json`; a SKIP is not a pass) |
| MVP4 | prompt and draft budget (`animation-fit`), authoring, pipeline, sampling, review-size, SGD and old-client tests; the archetype test; contract and capabilities tests; the AN-20 harness tests and its `--dry-run` preflights on the pinned SGD plan and the three known-good plans; the Gate 1 identity check is printed |
| MVP5 | **the recorded Gate 2 table** (`gate2-result`, read-only: PASS, recounted to 8 of the first 9 accepted, the control did not become SGD, the tested sha is this checkout or an ancestor with no change since to a frozen file; the files that changed are listed for the receipt); `sgd-qualify.mjs --dry-run`; the built bundle and, with `--origin`, the preview clone no longer say loss surfaces are not supported and claim them; slash-sheet, learning-examples and card tests; control-plane SGD, fit and old-client tests |

The old-client 409 path, the golden-fixture browser check and the Gate 2 result are in the list for every run of `combined`; they cannot be left out by editing a flag.

## What a pass does and does not establish

- It establishes: the build, the affected tests, the focused smoke above, the exact commit and tree (the record), the preflights the release already does, a pushed recovery branch that contains C4, and the Gate 2 identity.
- It does not establish: a browser pass (not run by Claude), broad CI or the release gate (recorded as bypassed, never as passed), a real SGD card in production (step 11), or that a streamed answer from the real API carries the same usage as a non-streamed one (the dev preview's paid smoke).
- A functional failure is a defect, not a CI waiver.

## After the release

`post-release-verify-ladder.mjs --slice combined` adds to the release's own checks (served commit of both Workers, flags, Durable Object, base bundle probe): the signed-out matrix (jobs and results routes 401, diagnostics 404); `ANIMATION_STREAMING` is unset or "true" (streaming on); the served bundle declares the five features; the request-box copy no longer says loss surfaces are not supported and a chunk names loss surfaces as supported; and the canary description names weekly, SGD and two failures in a row. The prompts are server code: they are verified by the served commit, not by a GET. UNKNOWN is not a pass.

## Do not

- Do not change C4 after the recovery branch is cut without cutting it again.
- Do not set `MVP_ALLOWED_SHA`, push `main`, run a paid job or deploy from this page: those are separate, explicit steps.
- Do not put `--gate2-pending` in the preview's `--smoke`.
- Do not use the ladder's FX numbers (044 to 053, 070 to 076, 080 and up, 090 and 091) for anything else.
