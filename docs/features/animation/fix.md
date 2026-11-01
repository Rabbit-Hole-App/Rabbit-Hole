# /animation blockers and fixes

Linked from [the checklist](checklist.md). Plan: [2026-10-30-animation.md](../../superpowers/plans/2026-10-30-animation.md).
Entry format: plan section 13. Resolved entries keep their history and name the fixing SHA. Times are PT (2026-10-30).
Real-run logs (accept-N) are the coordinator's acceptance runner outputs, C:/s/spec/animation/accept-N.log; each run is a
row in [spend.md](spend.md).

## Open

### FX-AN-016 — owner's first /animation start failed ("could not be started"); not reproduced, cause unconfirmed
- Task / phase: AN-03 / AN-06. First observed: owner on the preview at `8ed7e52edec5baccc08109310581cee325f3577a`
  (~5:30 PM PT 2026-10-30): "The 3D animation could not be started. Try again" twice, on a fresh canvas
- What is known: no job from the owner's browser reached the server (job list for the owner test user); the ~5:43 PM
  attempt overlapped a preview redeploy. The exact start request, sent through the server API for the same test user and
  canvas, was accepted (202). The owner was first handed a bare preview URL, which cannot be signed into (dev clones
  refuse /login); the handoff now uses the signed-in launcher `C:\s\spec\animation\open-preview.cmd`.
- Not established: the cause. The earlier entry here claimed "a never-saved canvas has no board id" as the cause; no
  evidence connects that to the owner's failure. A fresh canvas's board GET already supplies a board id, and the
  brand-new-canvas browser step (animation-mvp step 30) exercises that ordinary path, not a save fallback.
- Mitigation: since `81df661ba8599d9f66401aad43f23be3ec39347f` a refused start shows its reason
  ("could not be started: <reason> (status)"), so a repeat names its cause.
- Severity: unknown; does not block MVP review. Status: not reproduced / cause unconfirmed. Next: the owner's reason line
  from a repeat, if any.

### FX-AN-018 — owner's pendulum run stopped: "did not pass its checks after one correction"
- Task / phase: AN-05 / AN-07. First observed: owner try-it, 2026-10-31 PT, request "Let me change the length of a
  simple pendulum and see how its period changes, with the period shown as a number." (the request accepted once as
  accept-6). The job stopped with `stopReason: rounds` (animation-job.js: review still failing after the one repair).
- Where: job `aj_4dbdc54c977348afb93ef5dfc98edb11` on the canvas's `review-main` board (FX-AN-021), 7:56 PM PT; 34
  credits; brief, author, review, repair, review (C:/s/spec/animation/review-jobs.json, read-only diagnostics).
- Cause: not physics. Every semantic finding agreed with T = 2π√(L/g) (2.01 s at 1 m, 0.634 s at 0.1 m, 7.29 s at 5 m on
  Mars). Two major visual findings: at the plan's minimum length (0.1 m, against a 5 m maximum) the pendulum is too
  small to see under the fixed camera, and the Bob label covers the support bar. The one repair shrank the bob instead
  of reframing, so the second review found the same thing and the job stopped (`rounds`).
- Severity: quality stop working as designed (a scene whose short swing cannot be seen is not accepted). Improvement
  candidates, not done: a planner rule to keep a parameter range the camera can show (or a camera that follows a
  length parameter), and a repair hint naming reframing. Status: open, for the owner's decision.

## Deferred

### FX-AN-008 — changing a rate mid-play restarts analytical motion
- Reviewer minor finding (accept-3 experiment): an analytical scene computes phase from absolute time, so changing a
  period mid-play jumps. The runtime passes parameter events to reduce only in scenes with actions, selection, drag or
  stepping (runtime.js:188), so a pure analytical scene cannot carry phase.
- MVP handling: author prompt states the restart in assumptions (G `b62a866f6`). Fix after MVP if wanted: let analytical
  scenes export initialState/reduce for parameter events (R).
- Severity: minor; does not block MVP. Status: deferred

## Resolved

### FX-AN-022 — the Chat link under an /animation line repeated the request and said "Animation3d"
- Task / phase: AN-03, MVP (owner try-it, 2026-10-31 PT on `57f585526`).
- Cause: the pending card was titled with the request words (`LearnPage.jsx` startAnimation), the Chat output link shows
  the card title, and `ChatOutputs.jsx` had no label for the `animation3d` kind, so it printed the raw kind.
- Fix: the pending card is titled "3D animation"; `storage.js` settleAnimationJob gives it the plan's title as soon as
  the job has a plan (kept through ready and failure); `ChatOutputs.jsx` labels the kind "3D animation". A link saved
  before the fix keeps its old label.
- Regression: `animation3d/storage.test.mjs` (plan title through progress, ready and failure); web unit 4847 pass / 0 fail.

### FX-AN-021 — the try-it launcher opened a separate review board, so /animation said "not finished loading"
- Task / phase: AN-07 owner try-it (2026-10-31, 8:21 PM PT on `57f585526`): "The 3D animation could not be started: this
  canvas has not finished loading."
- Cause: the launcher (C:/s/spec/animation/open-preview.mjs) opened `/apps/<canvas>?board=main`. On a preview build
  (reviewTools) `?board=` opens a separate review board (`LearnPage.jsx` reviewBoard: `main` becomes `review-main`), which
  is not saved to the server unless shared, so it had no board id and the start was refused. Before `622d17501` the
  forced save created that review board, which is why the earlier pendulum job sits on `review-main` (FX-AN-018).
  Learners never open `?board=`; the app is unchanged.
- Fix: the launcher opens `/apps/<canvas>` (the canvas's own board, saved by the launcher first). Checked with
  `open-preview.mjs --check`.

### FX-AN-019 — a card with no scene kept the full 560 px viewport (empty space under a failure)
- Task / phase: AN-03, MVP (owner screenshot, 2026-10-31: a stopped card's text at the top of a mostly empty card).
- Fix: `LearningBlocks.jsx` animation3d `sizeFor` gives the card its content's height until a scene is attached
  (`animation3d.ref`) or it is a built-in example; with a scene it keeps 560 px. A learner's own resize still wins.
- Fixing full SHA: see the M3 receipt update for this candidate.

### FX-AN-020 — the plan review read like the internal model specification
- Task / phase: AN-03 / AN-05, MVP usability (owner, 2026-10-31).
- Fix: the server signs `input.scene` (animation-job.js `planScene`: parameters without ids, interaction text, its own
  "you asked for" lines) beside the unchanged full plan lines; `animation3d/PlanSummary.jsx` draws, for any plan:
  What you can change (ranges and units) and Starts at, How to play (game) or What you can do (no parameters), those
  notices in view, the first assumption as the visible caveat, the rest under collapsed Model assumptions and
  Limitations. The request echo, the plan lines (Behavior, Controls, Interaction, Parameter, Recommended) and the cost
  note are gone from the card; Experience stays a select with a plain hint per option; Edit reads Edit plan. The
  server's notices no longer name enums ("uses motion computed from formulas instead"). A plan without `input.scene`
  (made before) keeps the full card. Generate still approves the signed plan hash with its reviewed edits.
- Regression: `animation3d/plan-summary.test.mjs` (experiment, watch scene, mini-game, experience change, old plan);
  control-plane `animation-job.test.js` (scene signed beside the plan lines; notice filter); animation-mvp step I asserts
  the summary and saves I-plan.png and I-plan-details.png.
- Fixing full SHA: see the M3 receipt update for this candidate.

### FX-AN-017 — /animation's forced board save raced the hydration autosave (self-inflicted 409)
- Task / phase: AN-03 / AN-06, MVP (owner review of `bb23270a79214cd36c815ca50f91e874821b68d1`, 2026-10-31)
- Actual / expected: `3b53780bed9e9e352cea086b6ab4a2edeeffa8b0` made `startAnimation` call `saveBoard({ force: true })`
  directly, outside `pushQueue` and the loading/conflict guards of `pushBoard`, and swallowed its error
  (`.catch(() => null)`, then "this canvas has not finished loading"). Started while the board GET was pending, the forced
  PUT and the hydration's queued autosave both sent version 0 and one got a 409. Expected: one serialized save, the job
  on the saved board, no duplicate job, and a refused save reported with its reason.
- Evidence: owner's source-extracted reproduction; reproduced by the new regression on the old code (2 self-inflicted
  409s). Not reproduced in the deployed browser.
- Fix: `startAnimation` waits for the board GET (`boardReady`, max 10 s), then, only if there is still no board id, saves
  through `pushBoard(null, { now: true })` (the push queue with its guards) and reads the board id after it; a refused
  save returns "this canvas could not be saved: <server message> (status)", a stopped board "this canvas changed
  elsewhere; reload it, then try again". `saveBoard` lost its `force` flag. The hydration GET now also sets
  `commentBoardRef` directly so the id is readable before the next render.
- Regression: `animation3d/start-board.test.mjs` runs LearnPage's own hydration effect, `saveBoard`, `refused`, `pushBoard`
  and `startAnimation` against a fake board server (409 on a stale version): delayed GET + early autosave + two presses
  gives one version-0 PUT, at most one PUT in flight, 0 conflicts, one job on the created board; an existing board starts
  without a PUT; a 413 save says why. All three fail on `81df661ba8599d9f66401aad43f23be3ec39347f`.
- Fixing full SHA: `622d17501be42899a0af78f373913ebcd8e1bbbb`; web unit 4840 pass / 0 fail
- Validation: verify 41239541164 success; fast-e2e 41239541265 success on attempt 2 (attempt 1: every check passed except
  credits-meter, which crashed after 3/7 on "SocketError: other side closed" from the local stack, unrelated; 7/7 on the
  rerun of that job); animation-mvp 32/32. Deployed-browser repro of the race: not attempted. Status: fixed

### FX-AN-015 — a cancelled object drag can move the object to a position computed from (0, 0)
- Task / phase: AN-03 / AN-04, MVP (owner review of `ef73e0e90b3ec697c65086e2611bc5e36485c355`)
- Actual / expected: `renderer.js` `cancelHeld()` dispatches `PointerEvent('pointercancel', { pointerId })` without
  coordinates; both pointercancel and pointerup reach `up()`, which calls `axisValue(event, drag)` for an active drag, so
  the object's final position comes from synthetic (0, 0). Expected: Escape, blur, hidden tab and cancellation release
  the gesture without moving the object or selecting; later pointer moves do nothing until a new press.
- Evidence: owner's isolated handler check; deployed-browser reproduction outstanding
- Severity: blocks MVP readiness (owner)
- Owner / branch: R (renderer fix + renderer.test.mjs), V (browser step in animation-mvp-check)
- Fixing full SHAs: `8fc92fca9d2f84aed2540a45c8c14cf7756e58f8` (R: pointercancel goes to its own cancel(); a started drag ends with drag_end at its last accepted position, never selects; moves and releases after a cancel do nothing until a new press; interact(false) ends the renderer drag before cancelling OrbitControls pointers; renderer.test.mjs cases fail on the old code), `5a9d096558a821e584f5fe65474a944436f1233d` (V: animation-mvp steps 29-31, a draggable bead on a rail cancelled by Escape and by blur)
- Validation: fast-e2e 41147580048 on `8ed7e52edec5baccc08109310581cee325f3577a`: animation-mvp 31/31. Status: verified

### FX-AN-014 — Interact never orbited the scene
- Task / phase: AN-03. First observed: fast-e2e 41143743749 on `2e86f4ef25d85852d104ff1915f4ffbc435af613` (step 18:
  Interact on, a left drag left the scene unchanged; fail-18.png)
- Cause: `interaction.js` used `onPointerDownCapture` with `stopPropagation()`; React's capture handlers run from the
  root first, so the press never reached the WebGL canvas and OrbitControls. Step 19 had passed only because nothing moved.
- Fixing full SHA: `ef73e0e90b3ec697c65086e2611bc5e36485c355` (bubble-phase press; interaction off cancels any held
  pointer so a drag held through blur stops orbiting); unit 132/132 animation suites
- Validation: animation-mvp step 18 passes in fast-e2e 41146083516 (ef73e0e90) and 41147580048. Status: verified

### FX-AN-013 — after a reload two of three cards stayed on "Preparing the scene"
- Task / phase: AN-04 / AN-06. First observed: fast-e2e 41141201411 on `f918c4f54550e41bb632fd1c0883fd5f3b43fee3`
  (steps 17-20; diagnostics: a-watch and a-exp `phase=loading live=false`, a-game ready)
- Cause: a race in `animation3d/session.js`: the board context arrives after mount, so each card starts twice; with the
  two-Worker animation budget a superseded start settled late and its stale `rendererStage` disposed the current ready
  renderer. `detach()` also awaited the poster before clearing, so an immediate `attach` was lost.
- Fixing full SHA: `8ebfeef330a68cc95baffd7f4aabcb62a2006fde` (stale starts return; synchronous detach); two regression
  tests that failed on the old code
- Validation: fast-e2e 41143743749 on `2e86f4ef2`: steps 17, 19, 20 pass. Status: verified

### FX-AN-012 — the review's second view saw a flat mechanism edge-on
- Task / phase: AN-05. First observed: accept-8 (fresh bicycle gears, `05c85abc98fe4dc0b9ca1cacae305627b74817de`): every
  major finding was the fixed "side" view (a quarter turn) looking along the drivetrain plane; the learner's view was fine
- Fixing full SHA: `45ad75e18c8ced185a146876123211140a086655` (second view = the artifact's camera orbited 55 degrees and
  raised 15 degrees about its own target; the author is told which views review uses)
- Validation: accept-9 fresh prompt accepted on `45ad75e18`. Status: verified

### FX-AN-011 — an internally inconsistent plan stopped a request
- Task / phase: AN-05. First observed: accept-6 (fresh): "requiredCapabilities: step needs behavior rules"
- Fixing full SHA: `e92200278fdd594d7810f988c4c6eccd1058c575` (cross-field rules generated from the contract's validator
  into the planner prompt; one bounded correction turn with the validator issues; never a silent plan rewrite)
- Validation: accept-7 and accept-9 planned the same prompt validly. Status: verified

### FX-AN-010 — output limits stopped the author and the review
- Task / phase: AN-05. First observed: accept-5 (fresh: author used all 10,000 output tokens before its tool call,
  "got 0"), accept-7 (review hit 3,000 before finishing)
- Fixing full SHAs: `e16cad51243e332c9b9e05681c71876bf58fbeac` (stop at the limit reported as `output_limit`; billed
  tokens recorded for refused replies), `f918c4f54550e41bb632fd1c0883fd5f3b43fee3` (author 16,000, repair 12,000),
  `05c85abc98fe4dc0b9ca1cacae305627b74817de` (review 6,000). Worst case per build US$2.0349, plus plan US$0.56
- Validation: accept-9 completed within the limits. Status: verified

### FX-AN-009 — Anthropic workspace API usage limit reached
- First observed: ~3:05 PM PT, preview at `c84c0c51a7fddee65bb9cf9562d905fee24df828` (accept-4): every call refused before
  processing (US$0 provider charge). Direct 5-token request: HTTP 400 "You have reached your specified workspace API usage
  limits ... 2026-11-01 at 00:00 UTC" (request_id req_011CgZBb4zSk7L499LbTpfo4)
- Resolution: the owner raised the workspace limit (~3:40 PM PT); the same probe then returned 200. Status: resolved

### FX-AN-007 — watch check tolerance was relative, not absolute
- Task / phase: AN-07 (owner report). The watch frame-vs-oracle comparison scaled its 0.03 allowance by the value (at
  360 it allowed 10.8)
- Fixing full SHA: `c660463bcb1aefea9be92e51f384ce3d76063805` (oracle `within()`: absolute, 0.5 ms time rounding times the
  oracle's fastest rate plus 1e-6; self-test: 3% off fails, rounding-sized passes); oracle tests 5/5
- Validation: animation-mvp watch steps pass in fast-e2e 41143743749. Status: verified

### FX-AN-006 — labels unreadable, then overlapping, in visual review
- Task / phase: AN-02 / AN-05. First observed: accept-2 (too small), accept-3 (overlapping in one view/state)
- Fixing full SHAs: `c0d450915b58aec1f51924048402ceed08a0a535` (constant screen-size plates, placement),
  `62c8718957d812a6df7249dee97f159c59c56e40` (deterministic screen-space declutter), G prompt rules
  `64577172a68f249bc8983b87bcc928448b3001ae`
- Validation: watch, experiment and fresh accepted afterwards with no label major findings; render probe images show
  readable plates. Status: verified

### FX-AN-005 — repair output dropped the behavior program
- Task / phase: AN-05. First observed: accept-3 and again accept-5 (experiment): repair returned an artifact without
  `program`; validation failed `missing_program`
- Cause: the repair request showed the program as a separate block, and the model answered the same shape (program
  beside the artifact); `repairStage` read only `input.artifact`. Requiring `program` in the schema
  (`b62a866f6ac1e7ddb3713e8bec95feb926b7f110`) did not help: a non-strict tool schema is not enforced.
- Fixing full SHA: `e16cad51243e332c9b9e05681c71876bf58fbeac` (program taken from `artifact.program` or beside it; never
  invented; candidate record keeps reply keys)
- Validation: accept-6 experiment accepted (`da7d7f0e...`) on `f918c4f54`. Status: verified

### FX-AN-004 — review samples aliased periodic motion; minor findings failed builds
- Task / phase: AN-05. First observed: accept-2 (watch loop sampled at 0, T/3, 2T/3 caught a 3-turn fan at one angle)
- Fix: `64577172a68f249bc8983b87bcc928448b3001ae` — samples at 0, 0.538T, 0.769T (test covers 1-12 cycles); review stage
  accepts minor-only findings and fails on major/blocker
- Validation: render probe orbit 193.7 deg expected, 194 shown; watch accepted in accept-5. Status: verified

### FX-AN-003 — inserting the 3D example crashed the canvas
- Task / phase: AN-03. First observed: fast-e2e 41129301739 on `38918a481` (animation-mvp steps 23 and 25)
- Cause: the lazy Animation3DCard rendered without its own Suspense boundary, so the whole canvas suspended and
  `chromeTop` read a null surface (`AdaptiveCanvas.jsx` insertBlock updater)
- Fixing full SHA: `0cbd3ff6983c44cb000608be4059a2771f981dba` (Suspense with "Loading the 3D animation")
- Validation: step 23 passes in fast-e2e 41135505983 and 41143743749. Status: verified

### FX-AN-002 — preview clone had no model key; failure recorded as a bare "Error"
- Task / phase: AN-05. First observed: `53df42332`, accept-1 (~2:25 PM PT)
- Cause: secrets do not clone; `anthropic()` answered "not configured" (503) and animation-policy.js turned it into a bare
  Error. Evidence: dev usage_operations row `failed http_503`; `wrangler secret list` (names only) empty.
- Fix: ANTHROPIC_API_KEY installed on this clone only (C:/s/spec/animation/set-clone-secrets.mjs, value read by name from
  small-deploy/.env, owner decision A); `192fc47d01ec6a3a43468c1e34c277a297145ce3`: `model_not_configured` refused before
  admission, every failure finding carries code and message. Nothing reached the provider (the ledger counted US$0.1216).
- Validation: accept-2 ran the full pipeline. Status: verified

### FX-AN-001 — /explain paid-call record overwritten after a refused call
- Task / phase: AN-05 (found while building animation-job.js); affects existing /explain
- Actual / expected: explain-job.js `paidCall` keyed a call record by the role's call count; a refused call gives its
  count back, so the retried call reused the key and the new record stayed `running` forever
- Evidence: control-plane `test/explain-provider-cap.test.js` "cap reached before generation" (fails on the old code)
- Severity: nonblocking. Fixing full SHA: `f7aa8a8e28fad2ef622841044b8c6bd0cdb3b4d9` (merged into feat/animation)
- Validation: explain + animation control-plane tests pass; not deployed to production. Status: fixed, ships with /animation
