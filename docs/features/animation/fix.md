# /animation blockers and fixes

Linked from [the checklist](checklist.md). Plan: [2026-10-30-animation.md](../../superpowers/plans/2026-10-30-animation.md).
Entry format: plan section 13. Resolved entries keep their history and name the fixing SHA. Times are PT (2026-10-30).
Real-run logs (accept-N) are the coordinator's acceptance runner outputs, C:/s/spec/animation/accept-N.log; each run is a
row in [spend.md](spend.md).

## Open

### FX-AN-031 — a clear next step before Generate and when generation cannot complete (owner request 2026-11-02)
- Task / phase: AN-05 / AN-06. Branch `feat/animation-feasibility`. `animation-feasibility.js`, `animation-job.js`, `animation3d/AnimationChoices.jsx`.
- Four outcomes before Generate (`job.outcome`), by deterministic server checks and server words. The planner prompt is unchanged.
  - supported: the usual plan. This is what the checks found, never a promise that the scene will fit or pass.
  - changes: the server's "You asked for" lines, or a plan over the size estimate. Over the estimate no Generate exists until the learner accepts a change in Chat. Each option says exactly what changes.
  - unsupported: the planner's gap. Its reason is shown only if it passes `learnerReason` (plain sentence, no code, ids, links, markup or system words), otherwise a server sentence. The raw reason stays in diagnostics; `failure.gap` is no longer in the learner view. Two alternatives: each is a new plan, its cost on the button.
  - clarify: a request naming no subject asks one question before any paid call. Narrow by design: a subject with an unclear goal still goes to the planner, which cannot ask (see the decision below).
- Size estimate (`estimateDraftBytes`), labelled an estimate wherever it is shown. Base 2,500 B + 300 per parameter + 200 per interaction + 2,500 for a rules or game program + 800 for a game + `TRAIL_NODE_BYTES` per drawn marker (doubled by a kept path) + 90 per named object or readout. Markers come from the plan's words: stated steps or points, else 24 for an unstated trail.
- Limit (`draftLimit`): the largest scene `fitProblems` itself passes for this plan, capped at `ANIMATION_DRAFT_BYTES`. A longer plan leaves less room. Over the limit: changes are offered, and "Keep my plan" too while within 1.25 times the limit; beyond that the plan as written is not offered. `fitProblems` stays the authority on a real candidate.
- Calibration (`test/animation-feasibility.test.js`, saved plans in `test/fixtures/animation-saved-plans.json`): 9 plans with a saved draft, mean absolute error about 12%, worst 16%; the 40-step SGD plan estimates 12,360 B against 13,252 B written. Flagged: only aj_51ec6a0 (150 steps with a kept path, whose author used its whole output limit). False negatives are real: aj_283c19f wrote 10,914 B against 9,160 B estimated, and any plan under the limit can still fail. False alarms are possible: a plan naming many steps it never marks one by one is flagged, and can be kept only when near the limit.
- Alternatives (`planAlternatives`), free and checked against the contract and the estimate: draw fewer markers while every step still runs; leave out a kept path unless the learner's own words asked to compare or keep. Controls, ranges and the rule are not changed. The change is written into the plan's limitations (`Changed: `), stays on the review card and is in the Chat line above the plan. With no change the server can make, one paid "A simpler plan", with its cost.
- Failures: output limit is its own class ("does not prove your request is impossible"); the other classes keep their words. The exact words and actions are pinned in the test's table.
- Chat report: same path, now one message and meta row in one batch, found again by key, so a lost answer or a retry writes no second message. A failed write stays pending until written: the alarm retries every 30 s for 5 tries, then with a backoff capped at 30 minutes; any status read (the card's poll, a reopen) tries at once and restarts the backoff. The card reloads the thread when it lands (`chatPending`). A thread event arriving during a streaming answer is held until the answer ends. No model call.
- Decision needed, not taken: a planner that can ask for a clarification or name its own reduced plan needs a plan-schema field and prompt text, so a new measured planner comparison. Recommended: wait for owner test evidence that the deterministic check misses real requests.
- Owner follow-ups (2026-11-02): Generate checks the executed plan again, with the sources it will be built from, before admission or consumption; an edited plan that needs a change is kept and its choices posted, the job waits. An accepted decision is bound to its plan hash and choice key: Keep is not asked again for that exact plan, and a button from an earlier plan is refused. A choice whose Chat answer failed to save is repaired by the same press, with no new plan; an unsupported request's first chosen alternative is kept with its successor, so another tab cannot relabel it. `fitProblems` now builds the review request from the artifact's real capture manifest (ids, views, labels, inputs, times, events, ticks) with traces filling the allowance; `animation-fit.test.js` has a near-limit candidate the old stand-in captures passed and the real request refuses.
- Trail consistency and step count (owner 2026-11-02; jobs aj_ad936ec1d2564dc1a37346299ca7d0cd, aj_ba11d5acbd09410b82c056cdede2a859): the built shortened plan still said "a trail of up to 40 points, one for each step" beside its own "one marker every 7 steps, at most 37", and 256 (a batch size: "at 256 every step follows the exact slope") had been read as the step count. Now every trail sentence is restated by rule (count, "one for each step", "adds one trail point"), a kept-path interaction is dropped whole, and an alternative with any sentence the rules cannot restate is not offered (`trailConflicts`). Steps are read only as "N steps", "N-step" or "N rule steps". Fixture: `test/fixtures/animation-sgd-trail.json`.
- Counts are read only where the words state one: a whole number, never part of a decimal, bound to its unit with at most one describing word and never a determiner. Regressions for the two saved sentences: "At 256 every step follows the exact slope." (had read as 256 steps) and "Above 0.25 the ball zigzags" (had read as 25 balls).
- Calibration, 16 saved drafts (the 9 earlier, aj_9c453b6, and both jobs' drafts with their previous drafts). Before the parsing fix: mean absolute error 20.9%, median 12.2%, worst 69.6%, mean bias +12.7%. After: mean 16.0%, median 12.2%, worst 42.8% (aj_ad936ec, whose author drew 20 markers where its shortened plan allowed 37 with a kept path), bias +7.7%. The byte constants are unchanged. Flags: the refined 40-step plan (aj_ad936ec's original) was 42,700 B before, a false positive; it is 12,370 B now against a 14,344 B limit (with `ANIMATION_DRAFT_BYTES` at 14,500) (aj_9c453b6 wrote 13,252 B for the same shape, which fitProblems accepts). The 300-step plan with a kept path stays flagged (600 markers, past the 256-node scene limit). No authored plan is flagged: on the 12 authored plans, false positives went from 1 (the shortened aj_ad936ec plan, at 14,230 B against 14,128 B) to 0, false negatives stay 1. Other subjects are covered by the same rules in the tests (a pendulum over 600 frames, "at 0.5 the pendulum", "with 100 every frame", "40 particles"); no wording is special-cased. False negative on record: aj_ba11d5a's 15,097 B previous draft was refused by the real review-size check while its plan was estimated at 13,960 B; fitProblems caught it before any review was spent.
- Clarification coverage, exactly: only a request whose words name no subject at all (and no attached source) is asked about. A clear subject with an unclear goal still reaches the planner.
- Also: `ANIMATION_SEED_PATH` (dev only, behind `ANIMATION_DIAGNOSTICS`) seeds one job per outcome and class for the owner's launcher, with no model call.
- Status: implemented; CI and owner review recorded in the hand-back.

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

### FX-AN-026 — owner's SGD run stopped with "Edit the request and try again" and no working action (MVP blocker)
- Task / phase: AN-05. First observed: owner try-it, 2026-11-01 PT, `/animation Show me how stochastic gradient descent works.
  Let me change the learning rate and batch size to see what happens.` Job `aj_41cfeaca81dd4d3785e8b86b8ef9a9a9`
  (canvas-910b08d0), 45 credits: brief, author, repair; no render or review.
- Cause: both candidates failed only validateStage's request-fit preflight ("too large for the repair request"); the review
  request fit. Replayed offline on the saved last draft (C:/s/spec/animation/fx026/DIAGNOSIS.md): 9,338 B as drafted (its repair
  request fits, 34,841 B), measured after the contract parse fills defaults (15,601 B sealed), over the repair bound. Same
  measurement class as FX-AN-025's last failure, shown from SGD's own draft. The one run repair could not fix it; `rounds`.
- Recovery flow (owner 2026-11-01, branch feat/animation-recovery): every failure is classed from recorded data (size limit,
  checks, transient, deadline, build limit, credits, capability) and explained once in the canvas Chat and on the card in the
  same plain words (no finding text). Transient stages (provider busy, a failed sample render) run once more by themselves
  after a pause. The card offers only the server's recovery list: Render again, Try again, or Revise plan (a new job for the
  same card and request; its planner revises the approved plan from the failure class, dropped controls are listed on the
  review card, and Generate is admitted again). animationRetry no longer assumes Try again; a failed card reads its actions
  again after a reload.
- Owner review follow-ups (2026-11-02, branch fix/animation-resume): (2) a saved card that still says failed reconciles
  with the server after a reload, a lost Retry answer or a Retry from another tab: it follows Revise plan's new job
  (`successor` on the job view), waits again on a job that moved on (running, awaiting review, ready) through the existing
  resume, poll and result paths, with GETs only; a card stopped on itself is never resumed. (3) A billed reply the job
  cannot use is "The AI answer could not be used.", no longer an interruption, and every charge sentence comes from the
  failed stage run's call ledger: refused or no measured cost "You are not charged for it.", a measured cost "It used N AI
  credits.", an unrecorded outcome "It may have used AI credits."
- Status: implemented and fixture-tested; not live. Needs the integrator's measurement fix for this request to build, then a
  preview deploy for owner review.

### FX-AN-070 — the golden SGD artifact: no exemplar and no fixture of the five primitives (SGD ladder AN-19; branch `feat/golden-sgd`)
- Task / phase: AN-19 (golden artifact, unit test, archetype data, browser check). Owner decisions 11 to 13. Plan section 8.
- Symptom: nothing showed the contract's five primitives working together, so nothing could be rendered, reviewed or given to the author as the one exemplar.
- Fix: `testdata/sgd-golden.json`, built by `testdata/build-sgd-golden.mjs` from run 2's repaired draft (`aj_0b6ca2b`): a 24 x 24 height-grid surface with 8 contours (heights `0.25 (3 x^2 + z^2)`, top 4), one ball with `clampTo` the surface, a `trail` and a `ghost` node, a text readout `status` (running, paused, converged, diverged), a number readout for the true loss, two arrows (next step, downhill) with `offset` = the ball radius and tip-anchored labels, learning rate 0.01 to 2 (0.1 default) and batch size, actions Run, Pause, Step once, New run (old path kept as the ghost). 10 nodes (run 2's draft had 93); 3,872 triangles, 1,600 line points; program 3.2 KB; as an author draft 9.7 KB (the budget is 14,500), 14.6 KB as the file with its plan. Title and description say OFFLINE FIXTURE, so the dev `seed-fixture` route accepts it. It is a fixture and an exemplar, never served as a result.
- Checks: `sgd-golden.test.mjs` (12 tests: the JSON equals its builder's output; the plan's table; the contract, including every frame of the 0.1 and 1.5 runs; the program in the pinned engine against closed-form values), `animation-golden-sgd.test.js` (control-plane: intact, seeded, served with all seven features, 409 for a client missing any of the five), `animation-archetypes.test.js`. Browser: `e2e/animation-primitives-check.mjs` (needs AN-19; syntax-checked only here).
- Status: fixed-unverified. Validated against the real AN-18 contract; not yet rendered (AN-19) and not yet reviewed (the one review call is Parallel's).

### FX-AN-071 — a text readout cannot reach the card: `frameView` drops it (found writing the primitives check; AN-19 must fix before MVP3)
- Symptom: `card.js` `frameView` keeps a readout only when `finite(values[item.id])`, and `Controls.jsx` `readoutText` formats numbers. A text readout's frame value is a string, so the status word would never appear on the card, and `animation-primitives-check.mjs` step 2 fails until it does.
- Needed: `frameView` passes a text readout's string (at most 40 characters) through, `readoutText` shows it as is (no decimals, no unit), and the same `data-animation-readout` element carries it (`data-value` the word). Not done here: card.js, Controls.jsx and renderer.js are lane U's / AN-19's files.
- Fixed (in the commit that adds this note, after `734a0e450`): `frameView` passes a text readout's string through and `readoutText` shows it as is; `Controls.jsx` was already generic (`data-value` is the word). `Animation3DCard.test.mjs` mounts the golden fixture card and finds the status word as the leading readout, beside its number readouts; it fails on the previous `card.js`. Status: fixed-unverified (no browser).

### FX-AN-077 — the primitives check failed steps 4, 6 and 9 in 4 of 4 CI runs: the golden's camera hid the ball and the path, the path tube had no normals, the thresholds were for the wrong view (AN-19; fast-e2e runs 41759867334, 41759618933, 41761659203, 41762152651)
- Symptom: `animation-primitives-check.mjs` passed 6 of 9. Step 4 "0 orange pixels"; step 6 "the bowl keeps 7.5% of the view"; step 9 the dev notebook warmup frame as an other-origin request. The CI screenshots (`fail-4.png`, `fail-6.png`, `A-loaded.png`, `B-ghost.png`, artifact `fast-e2e-...-2-1`) show a side-on bowl with its near wall in front and nothing inside it: no ball, no path, only the floating labels.
- Causes, all three real: (1) the golden camera `[7, 4, 0.5]` sits 22 degrees above the floor, so the near rim (3 to 4 high) hides the ball and the whole path; reproduced in Node by ray casting at the card's aspects (path 0 of 21 points visible). My earlier projection test checked only that points were in the view, never occlusion. (2) `scene.js` `trailBuffers` gave the tube no `normal` attribute, so a lit tube renders pure (0, 0, 0): CI pixels in `fail-6.png` show a black segment beside a red ball (234, 65, 43, faithful to the nominal #d23c2a), so the SwiftShader colours are not at fault; lane c fixes the geometry. (3) The thresholds came from a 700 x 450 view; the card's viewport is 725 x 240 once More settings is open (725 x 314 before). Step 5 passed for the wrong reason: with the path hidden, its with and without ghost difference came from the camera refit and label movement. Step 9: the notebook warmup frame is allowed the way `animation-mvp-check` allows it.
- Fix (mine): golden camera `[0, 10.03, 4.69]` (62 degrees, looking along -z) and trail radius 0.08; `sgd-golden.test.mjs` ray-casts the ball and every path point at aspects 2.3, 3.02 and 3.4 in the start, mid-run, converged and kept states and at rate 1.5 (it fails on the old camera, checked); the check's thresholds are for 725 x 240 (bowl 22% of the view, 15% at rate 1.5; finished path about 250 px2; ball 8 to 10 px across), it counts pure-black pixels so an unlit tube names itself, it proves the ghost by a same-camera difference (Reset view before each shot) against a control frame of the same scene, and it prints every measured number.
- Evidence rule: numbers from any local software-GL run (owner decision 25: calibration only, the golden fixture only, ended when C4's CI is green) are INPUTS to the thresholds, NOT evidence; the CI run on the candidate is the only acceptance record.
- Status: fixed-unverified until the tube normals land (lane c) and the check passes in CI.

## Deferred

### FX-AN-008 — changing a rate mid-play restarts analytical motion
- Reviewer minor finding (accept-3 experiment): an analytical scene computes phase from absolute time, so changing a
  period mid-play jumps. The runtime passes parameter events to reduce only in scenes with actions, selection, drag or
  stepping (runtime.js:188), so a pure analytical scene cannot carry phase.
- MVP handling: author prompt states the restart in assumptions (G `b62a866f6`). Fix after MVP if wanted: let analytical
  scenes export initialState/reduce for parameter events (R).
- Severity: minor; does not block MVP. Status: deferred

### FX-AN-025 — owner's game run stopped: the one repair went to a crash, then the framing was rejected
- Task / phase: AN-05. First observed: owner on the preview at `237964c54`, job aj_283c19f (7:44 PM PT 2026-11-01),
  request "Make a short game where I launch a ball to hit a target by choosing the angle and speed."
- Stages: preparing (brief) ok; authoring ok; rendering failed: the program wrote nodes `d0`-`d3` it never declared
  (invalid_output, phase evaluate); repairing (the job's single repair) fixed that; validating and rendering ok;
  reviewing rejected the default view (field, launcher and target in the bottom fifth under empty sky, majors on all three
  default captures) with no repair left: `stopReason: rounds`.
- Spend: US$0.4852 exact (dev ledger, 4 settled calls; spend row 24); renders platform, US$0. Not an estimate.
- Cause of the framing: the scene put its result and hint labels 20.5 m and 23 m above a ground-level field, and the fit
  (framing.js) counted every label anchor as subject, so it framed up to 23 m. It also fitted over every parameter extreme.
- Relation to FX-AN-018: the same family (a view fitted for more than the default experience leaves the subject small; a
  rejection with no repair left), a different trigger (floating labels, not a 0.1 m range) and a different scene (a game).
- Other review findings, recorded, not blockers: "Landed vs target 0.0 m" before any shot (reads as a perfect hit;
  major in kind, now an authoring and review rule); distance marks on the field's front edge, misaligned with the target by
  perspective (minor); the ball at rest sunk inside the launcher base (minor cosmetic); the hint's leader crossing the result
  text (minor). The flight itself was never sampled (the scene has no timeline and is not stepped, so its time stays 0).
- Fix (owner approved 2026-11-01 as option A):
  - Repairs: one for a run or validation failure and one for a review rejection, at most two per job, neither reset by
    Retry; each repaired candidate is validated, rendered and reviewed again. Worst case: author 1, repair 2, review 3 (two
    candidates reviewed plus one retry of a prose answer), render rounds 3; the admission check uses that worst case.
  - Framing (framing.js, session.js, the review capture page): fitted to the motion at one set of parameter values (the
    defaults first), never the extremes; a learner's parameter change is fitted again once the controls settle (300 ms)
    and moves the camera only when the distance changes by more than 1.2x or the aim by 15% of the distance; an action
    waits for that fit; a camera the learner moved is kept until Reset view; a label anchor counts only within 25% of the
    subject's size beyond its box. Review captures are fitted per capture inputs, as the card is.
  - Rules (author, repair, review): game status, result and hint text is the goal message, never a scene label; a
    readout that measures an attempt is left out of the frame until the first attempt (the card already hides a readout a
    frame leaves out), and a result shown before an attempt is a major review finding; marks and scales lie in the plane of
    what they measure (minor); a resting object sits on its holder (minor).
- Not done: no host-side check can tell which readout measures an attempt, so that rule is authoring and review only. An
  analytical game with no timeline and no steps cannot show a flight (its time never advances); not addressed here.
- Retries: the owner's retry on `30eac64c6` (aj_9229023, US$0.7692 exact, spend row 25) failed the same way: the field a thin
  strip across the middle of an along-the-ground view, and the ball never flew (analytical, no timeline, not stepped: time stays
  0). `fc013d7b8` added the rules that an action-started motion is stepped and a ground layout is viewed from a raised angle and
  kept compact. The coordinator's run of the same request on `fc013d7b8` (owner's request, launcher account, spend row 26)
  failed again: framing major findings on the default view, then the repaired artifact (14,910 bytes) was over the repair
  request's size limit, so the run repair could not be sent. The pendulum request on the same run was accepted (row 27).
- Status: open. The game request has now failed three times (US$2.00); no further paid game run without the owner.

### FX-AN-027 — planner answers over the tool's length limits (tracked, not changed)
- Task / phase: AN-05. Observed in the planner comparison (planner-eval.md): every refused first answer was over a length limit (variant A 1 of 10 and 1 of 4; variant B 5 of 10). Each correction succeeded, at about twice the cost of that plan.
- Improvement to make separately: say the limits in the shared planner prompt. Also tracked: the server repeats "real physics simulation" when both a behavior and a feature name it. Owner 2026-11-02: track separately; do not restart the paid comparison for documentation corrections.
- Status: open, not blocking. A prompt change needs its own measured run.

### FX-AN-028 — a review finding with no severity fails the build as serious
- Task / phase: AN-05. Observed in the owner's game acceptance request (job aj_54eec6a247f742159eb65ce8e47b306e, code e5e534637, preview version 3e985d75-4bd3-4e6e-a6d9-c3926f1b12f3, US$0.8047).
- Cause: the last review returned four findings: two minor and two with no severity. `parseReview` (explain-review.js) copies `f.severity` unchecked, and animation-review.js counts anything not `minor` as serious, so the job stopped on "2 serious problems". The tool schema requires severity, but the reply was not held to it. The reviewer's raw per-capture verdicts are not retained, so it is not proven that the review would otherwise have passed.
- Evidence: the last draft, rendered free through the candidate probe, launches, draws its arc and reads landing 22.96 m and peak 5.74 m at 15 m/s and 45 degrees, matching v^2 sin(2a)/g and v^2 sin^2(a)/2g. Parameter extremes were not rendered.
- Fix (owner 2026-11-02): `reviewProblems` (explain-review.js) checks a report against the report_review contract; /animation's review stage calls it before `parseReview`. Missing or invalid fields make the reply invalid, never minor and never a scene defect. One correction, carrying the validation errors, shares the per-job retry with the missing-tool-call retry inside the three review calls; a reply still invalid, or no allowance left, fails as `review_validation` and says the scene was neither accepted nor found faulty. Every reply is kept in `job.reviews` (raw tool arguments, original verdicts, problems, artifact hash, usage, call), diagnostics only. Explain still uses `parseReview` alone, unchanged: it has the same gap, not changed here.
- Status: fix implemented. FX-AN-025 and FX-AN-026 stay open until their real runs succeed. The failed job and its report are kept and are not accepted by this fix.

### FX-AN-029 — the SGD author call used its whole output limit (MVP blocker)
- Task / phase: AN-05. Owner's SGD acceptance request, job aj_51ec6a0 on canvas-99bc896f, code 0ef240b02, preview version 4b622018-7300-4fff-a94d-0f39f0c7a9a0, US$0.4652 (author US$0.3582). The game request was not run: the run stops at a failed request.
- Proven: the author call ended with stop_reason max_tokens at 16,000 output tokens (input 1,544), so no draft existed and there was nothing to repair or review. The review fix (FX-AN-028) was not reached.
- Inferred, not proven: reasoning, not the scene, used most of the limit. Every saved draft of a comparable scene is 9 to 11 KB whatever its token count: draft bytes per output token fall from about 2.0 on simple scenes to 0.89 on the earlier SGD run. The author has no effort setting (the planner's is medium), and its reasoning counts against the limit. This plan asks more than the earlier SGD plan that fit (10,546 tokens): 64 data points with a surface for every slope and intercept, continuous batch size 1 to 64, learning rate to 1.2 with a diverged state, a kept comparison path, two arrows, and clicks on objects.
- Correction (owner 2026-11-02): Opus 5.5 already defaults to medium effort (platform.claude.com/docs/en/build-with-claude/effort: omitting effort is exactly the same as medium), and the transport adds no override, so pinning medium would not change the effective setting and is not a fix. Draft bytes against tokens do not measure reasoning; the "Inferred" line above is not evidence of it and is withdrawn.
- Diagnostics: a reply refused after the provider answered now keeps, on its call (`reply`, diagnostics only): requested and served model, settings, stop reason, usage, block types and up to 8,000 characters of partial tool input. What the 16,000 tokens of job aj_51ec6a0 held was not retained and remains unknown; the next failure will show it.
- Plan inspection, offline: the plan's 150-step run needs trail nodes declared ahead. The earlier SGD draft declared one trail node for each of 40 steps at about 65 bytes each (2,591 B). At that rate 150 steps is about 9.7 KB, and the plan's kept old path doubles it to about 19.5 KB, against a 9.4 KB whole draft and an earlier 20,532 B candidate refused as too large. Proposed change, not applied: a 40-step run. The learning goal and both requested controls stay. Unmeasured: whether it reduces the author's tokens.
- Status: open. FX-AN-025 and FX-AN-026 stay open.

### FX-AN-030 — the 40-step SGD candidate was refused by the request-size bound, not by the model (MVP blocker)
- Task / phase: AN-05. Owner-approved simplified SGD attempt, job aj_9c453b6158ee46b2956ec21554ab713f on canvas-99bc896f, code bf48ef7ce, preview version d1582ea2-51bc-408e-bd1f-30e738f5ca8e, US$0.6783. The game request was not run: the run stops at a failed request.
- Proven: the author finished at 11,153 tokens, so the output limit did not recur. The draft failed validation once (an empty text geometry). Its repair fixed that, and fitProblems then refused the candidate: 22,571 bytes as measured there, 13,252 bytes as drafted (98 nodes, 82 of them trail markers, program 2,239 bytes). No review ran.
- Corrected budget: roleBoundMicros adds maxImages x IMAGE_TOKENS on top of maxInputTokens, so the images do not subtract from 40,000. requestSpendBound counts request bytes as units, plus 1,000.
- Measured offline on the saved repaired draft (animation-fit.test.js, test/fixtures/animation-aj_9c453b6.json; C:/s/spec/animation/fit-breakdown.mjs), at each request's permitted maximum overhead, units counted against the limit:
  - Before: review 44,427 of 40,000; the review correction 46,136 of 40,000 (not checked at all before this fix); repair 44,245 of 40,000. Review and repair both failed.
  - Review, before: system 3,785, tool 1,025, request and plan 4,308, normalized artifact 20,338, program 2,276, traces 6,115, coverage 1,024, labels 502, string escaping 3,086, framing 956, allowance 1,000. Images are separate: 28,704.
  - Mismatch: the draft is 13,261 B; normalization wrote every default into the review request, 20,307 B. Repair was already sent the draft.
  - Fix: the review is sent the scene as written, only when it parses back to exactly the artifact under review, with the defaults named. The artifact, its hash and validation are unchanged. Review after: 35,025 of 40,000; correction 36,734 of 40,000, which the size check now counts. The review bound did not move.
  - Repair has no defaults to remove, so its bound rose to 50,000: 44,643 of 50,000. The 60,000 bounds proposed earlier also fit these fixtures but cost more and were not needed.
  - The native-trail redesign is not needed for this candidate.
- First draft: not retained, because the repair overwrote it. Its failure is rebuilt in the test from the recorded finding, on the repaired draft. From now on the draft a repair replaces is kept in diagnostics. The empty label remains a validation problem; no words are invented.
- Author and repair are told the limits (ANIMATION_DRAFT_BYTES, TRAIL_NODE_BYTES, non-empty labels). The planner prompt stays frozen; the feasibility check reads the same constants. An estimate: a longer plan leaves less room, and passing it guarantees nothing.
- Not acceptance: this is an offline replay. Job aj_9c453b6 stays failed with its counters and evidence, and no generated SGD or game card exists.
- General limitation, recorded as the owner asked: limiting steps made this one plan simpler. It does not solve oversized plans in general: trails must be declared one node per point, and any plan with a long trail can reach this bound.
- Status: open. FX-AN-025, FX-AN-026 and FX-AN-029 stay open.

### FX-AN-035 — the author spends most of its output limit thinking (MVP blocker, fixed)
- Proven by the reply diagnostics (FX-AN-029's gap closed): job aj_49544d6 on canvas-99bc896f, code 5e736e95a, the SGD plan after its owner-path size choice (draw a shorter trail). The author stopped at max_tokens with output_tokens_details.thinking_tokens 11,993 of 16,000, then 19 characters of tool input. FX-AN-029's job aj_51ec6a0 was the same shape, not then measurable.
- Fix: author and repair run at effort low (learn-models.js). Medium is the model default, so it would not change anything; low does. Opus, the 16,000 and 12,000 limits, validation and review are unchanged. Quality risk: lower effort can make weaker scenes; review still decides acceptance.
- Status: fixed in code; open until a real SGD build succeeds.

### FX-AN-036 — a repair refused before it ran still used the build's repair (fixed)
- Found on the dev preview at aa4fb15ea, job aj_0bb9a9d (SGD, low effort): the author finished at 8,811 tokens (FX-AN-035's fix in effect), validation found one unknown field, and the repair was refused by the platform daily limit before reaching the provider. Try again then re-validated and stopped as "corrected automatically once" without any repair having run.
- Fix: a repair refused before it ran (provider busy, spend cap) gives back its turn (animation-job.js failed()). Test in animation-job.test.js.
- Also: the dev platform cap (USAGE_PLATFORM_DAY_USD 10, shared by every dev clone) was raised to 40 on the animation clone only, at deploy, within the owner's US$100 closeout budget.

### FX-AN-037 — review captures never varied an experiment's parameters or kept a nonempty path (owner, aj_ad936ec1)
- Found: aj_ad936ec1 (refined 40-step SGD) sampled initial, Keep Path and four Keep Paths; both parameter extremes were always
  omitted once an action existed, and the capture page ran events before steps, so Keep Path fired on an empty trail and the draft's
  no-op (DIAGNOSIS 1f, `event.id`) looked the same as a working one.
- Fix (`captureStates`, `review.js`): the capture request takes `leadTicks`, host steps run before the events (leadTicks + ticks at
  most 90). A stepped scene's one-action state is 60 steps, the action, 30 steps. An experiment with parameters samples its one action
  (or the initial state) and both extremes first; a stepped scene's extremes run 90 steps. Other experiences keep initial, action and
  sequence first (a game's action and win paths). `coverage.omitted` lists what is left out (aj_ad936ec1: initial, sequence of 4 events).
- Checks: `animation-sampling.test.js` on the saved last draft, real engine: both extremes (learning rate 0.01/0.6, batch 1/256),
  the draft's no-op visible (no saved path, run not restarted), the same draft reading `event.action` saves a nonempty path, the
  stepped Launch game still reaches `won`; `fitProblems` still fits with this manifest. Not yet checked by a real review (paid).

### FX-AN-038 — the comparison capture ran the scene before it saved (owner finding on ca45900a2, job aj_0b6ca2b; fixed)
- Symptom: the review's comparison state gave a paused scene 60 `leadTicks` before any action (they accomplish nothing: the scene starts paused), then Step, Save path, Clear trail, Run, 30 steps. The saved path was one point and the current path five, so the reviewer could not judge a comparison.
- Evidence: the committed generated program (`test/fixtures/animation-aj_0b6ca2b.json`) replayed through `captureManifest` and the real engine: 5 current-path points and 1 saved-path point; Run, 60 steps, Save path, Run, 30 steps gives 5 and 10. Failing regression first in `animation-sampling.test.js` ("motion occurred before the save: 1 points drawn").
- Fix (`db9e4603a`): a capture may spread its host steps over phases (`advance` and `resume` entries in `review.js`); for a stepped scene with a start-motion action and other actions the sampler presses the first start-motion action, lets it run, applies the other actions in declared order within the limits (4 actions, 90 host steps, 6 captures), resumes the motion and runs again. Offline on the failed artifact: 9 saved-path points and 5 current-path points. Status: verified offline; not yet by a real review.

### FX-AN-039 — the resume guard read whole-state hash equality as proof of stopped motion (owner finding on db9e4603a)
- Symptom: a periodic motion whose period divides the 12-step probe returns to the same state, was taken for stopped, and the second press of a toggling action paused a running scene; a paused scene whose hidden clock advances with every host step changes its state, was taken for running, and was never restarted.
- Evidence: two tests in `review.test.mjs` that failed on the guard of `db9e4603a` (periodic motion: still running after the resume; clocked pause: restarted by the resume).
- Fix (fixed in the commit that adds this entry): the probe runs one host step at a time and the scene is running when its drawn nodes differ between two consecutive steps, whatever the period; hidden state alone is not motion. The contract exposes no running flag, so this is the observable rule; limits: a scene whose drawn nodes change less often than every probe steps reads as stopped, and one whose drawn nodes move by host time alone reads as running. Documented in `review.js` and in the text the reviewer gets. Status: verified offline.

### FX-AN-041 — an author call cut by a gateway timeout (HTTP 524) has no same-job recovery (acceptance sequence 3, aj_2365d72c; OPEN)
- Symptom: the approved plan's author call failed after 126 s with `model_http_524`. The card said "An AI step was interrupted. You are not charged for it." and offered only Revise plan (a new job, a new plan, up to 56 credits) and Edit request: no way to run the same approved plan again. The call settled at $0.0000.
- Evidence: the job record (failure `{ category: 'internal', code: 'model_http_524', retryable: true }`, recovery `["revise_plan", "edit_request"]`). `recoveryOf` (`animation-job.js`) offers `new_attempt` only for `provider_unavailable` or a retryable failure within the ceiling; the ceiling is `ANIMATION_LIMITS.calls.author` = 1, already used, with no draft to repair. `roleFailure` (`animation-policy.js`) maps a 524 to `model_http_524`, not `provider_unavailable`, so the one automatic retry of a transient failure does not apply either. A pressed `new_attempt` is refused 409 `recovery_stale`.
- What is known about the timeout: the author call is one non-streaming request to the provider (`ask.js` `anthropic()`; `max_tokens` 24,000, effort medium, no client signal). `ANIMATION_LIMITS.deadlines.callMs` (120,000) is defined and read nowhere. Authoring stage times of four paid jobs: 87 s, 115 s, 121 s (all answered) and 126 s (524), about 115 output tokens per second, so a reply of more than about 14,000 tokens risks the same cut. Where the cut happens (provider edge or a proxy) is not verified.
- Not fixed (owner/integrator decision): a call that failed with no cost could give its count back as a refused one does, so the approved plan can be run again; and/or a gateway timeout (520-524) could be treated as `provider_unavailable`; and/or the author call could stream. Status: open.

### FX-AN-042 — the comparison captures made the review request too large for a draft that fitted before (acceptance attempt 4, aj_734f1e4e; fixed)
- Symptom: after one review rejection and two repairs, the job stopped (`rounds`, `size_limit`) without a final review: the repair 2 draft (13,917 B with its program) was refused as "too large for the independent review request" by about 95 bytes. The same draft fits the review request of the tree before the comparison captures (`5427f0db4`, margin 4,165 micro-USD of 463,520).
- Evidence: the job's three retained drafts, committed byte-identical (`test/fixtures/animation-aj_734f1e4.json`), through each tree's own `validateStage`: author draft 456,430 (5427f0db4) and 461,120 (89d9718bf); repair 2 draft 459,355 and 464,045 (limit 463,520). The worst-case request grew 842 B in its captions: the one-sentence explanation of the `advance` and `resume` entries (about 270 B) was written into the caption of every view that had one (twice), the comparison state's events grew by their two entries, and the second view repeated the whole text of each state of the first. The execution traces and the sampling coverage are padded to a fixed allowance, so they did not grow.
- Fix (fixed in the commit that adds this entry): the explanation is said once, at the end of the first block, which lists the captures, and only when a capture has such an entry; a capture of a state already captioned for another view says "same state as <id>" instead of repeating it. Nothing the reviewer reads is dropped: every state is still written out once, in order, with its events (advance and resume entries included), inputs, time and host steps; the sampling limits (4 actions, 90 host steps, 6 captures), the refusals and the pixels are unchanged. General: no scene ids or labels. `worstReviewContent` (`animation-repair.js`) is now the single builder of the worst-case review request that `fitProblems` and the tests share.
- Checks: `animation-review-size.test.js` (failed on 89d9718bf): repair 2 and author drafts keep at least their margins before the comparison captures (4,165 and 7,090), the 15,295 B repair 1 draft is still refused, the largest reviewable artifact is at least what it was before (14,750 B with its program on 5427f0db4, 14,564 B on 38d3e2963, 13,919 B on 89d9718bf), the capture text is at most 1,143 B + 60, the explanation appears once and only when needed, captions keep their events, a second view of one state refers to the first. After: bounds equal the tree before the comparison captures (456,430 and 459,355; aj_0b6ca2b author 453,905 and repaired 456,740, below its 454,590 and 457,425). The sealed game, watch, pendulum and bicycle fixtures still fit, with 6 captures and equal traces. Status: verified offline; not yet by a real review.

### FX-AN-047 — the contract cannot express a surface, a growing path, a status word, an offset arrow with a tip label or a clamped marker (SGD ladder AN-18; fixed in the commit that adds this entry)
- Task / phase: AN-18, owner decisions 11 (clamp) and 12 (five client features). Branch `feat/an18-contract`. Plan section 8, "Why SGD fails".
- Symptom (from the ladder's table): the reviewer's recurring majors on SGD each trace to a missing primitive: no surface geometry (a bowl is 3 to 4 tube rings), no updatable trail (82 of 98 nodes were trail markers, FX-AN-030), readouts are numbers only (status shown as a code), an arrow starts inside its ball, an arrow's label sits at the ball, and an out-of-bowl ball floats because nothing clamps it.
- Fix: five optional additions, each behind a client feature declared in `ANIMATION_CLIENT_FEATURES` (`capabilities.js`) and refused for a client that did not declare it (`clientProblems`, one repairable line per field), and a stored scene that uses one answers `409 client_update_required` to a reader without it (`needsFeatures`). `surface_grid`: geometry `surface` (4 to 64 rows and columns, rectangular, `contours` 0 to 16; `triangleCost` 2(rows-1)(cols-1)). `trail_points`: geometry `trail` (`max` 2 to 512, `style` trail or ghost) and the frame's node `points`, only on a trail node and at most `max`. `text_readout`: readout `kind` text, a frame word of at most 40 characters, no `unit` or `decimals`. `arrow_anchor`: arrow `offset` below `length`; label `anchor` only under an arrow. `clamp`: node `clampTo {node, max?}` on a sphere naming a surface node. Every field is optional with no default (a readout that names no kind gains none), so a stored artifact validates unchanged and an older client can still read every scene that uses none. The author tool schema carries the fields; no prompt text changed (AN-20).
- Decisions made here, for the reviewer: (1) contour line points are a bound, not a count: `contourPoints` = 4(rows+cols-2) per level (a convex level line crosses at most 2(rows-1)+2(cols-1) cells, two points per crossed cell); the renderer holds to it. A 24 by 24 grid with 8 contours costs 1,472 of the 4,096 line points. (2) `FEATURES` (the planner's required-capability list) is not extended: `PLAN_TOOL` enumerates it and `animation-sgd-mvp1.test.js` pins the planner schema until AN-20; the five names live in `ANIMATION_CLIENT_FEATURES`. (3) `capabilities.geometry` names `surface` and `trail`, so the planner and author now see them in their capability input while `SURFACES.tubes` still says no shape draws a filled surface: they disagree until AN-20 rewrites that text (tracked as FX-AN-053, AN-20 lane).
- Checks: `contract.test.mjs` (each field accepted; each refused on the wrong node or value; limits arithmetic; pre-AN-18 fixtures unchanged), `animation-client-features.test.js` (refusal per field and per missing flag, the validate stage, 409 for each flag missing, the tool schema agrees with the contract). Each failed before the change (import error for the first; 6 of 7 for the second).
- Not covered: nothing was drawn in a browser (the renderer half is FX-AN-048). Status: fixed-unverified (unit tests only; no browser, no deployment).

### FX-AN-048 — the renderer drew none of the five primitives, and a diverged ball floated above its bowl (SGD ladder AN-19, renderer half; fixed in the commit that adds this entry)
- Task / phase: AN-19 (renderer, framing, trace), owner decisions 11 and 12. Branch `feat/an18-contract`. Needs FX-AN-047.
- Fix: `scene.js` draws `surface` (an indexed mesh of the contract's 2(rows-1)(cols-1) triangles plus marching-squares contour lines held to `contourPoints` per level), `trail` (one buffer allocated for `max` points, a tube of 8 sides or a line, filled from each frame's `points`; a ghost is a copy of the material at 40% opacity and half the declared radius; nothing is drawn or framed until a frame carries points), an arrow with `offset` (the whole arrow starts that far up +Y, its length unchanged) and a label with `anchor: tip` (placed at offset + length up the arrow's +Y, in the arrow's own frame). `apply(frame)` clamps each `clampTo` sphere after the program's frame: world y held at the target surface's top (or `max`), the node marked `userData.diverged`, and `{ node, trueY, y }` returned in `clamped`; the program's own position is kept, so a frame that does not move the node is clamped again. `framing.js` measures after `apply`, so the fit sees the clamped box (a ball at 5.6 against a rim at 2 does not widen the view) and skips an empty trail. `review.js` puts `clamped` in the trace, `animation-review.js` states it to the reviewer as the host's clamp with both y values, and `card.js` shows a text readout's word.
- Decisions made here: (1) an arrow's `offset` translates it, so its drawn length is still `length` (the author's one-scale rule for magnitudes survives) and the tip, where a `tip` label sits, is `offset + length`; the plan text said the tip is at `length`. (2) The surface top is the highest point of the surface mesh in world space, so a moved or scaled surface is followed. (3) A text readout is shown by `frameView` only when the frame gives a string, a number readout only a number.
- Checks: `scene.test.mjs` (exact triangle and line-point charges for the primitives fixture, vertex positions and facing, contour levels and the per-level cap, trail draw range, allocation and bounds, ghost, arrow and label positions, clamp including a scaled parent, disposal), `framing.test.mjs` (clamped ball does not widen the fit, an empty trail is not framed), `review.test.mjs` (trace `clamped` on the real engine), `animation-review-size.test.js` (the capture text), `card.test.mjs`. `animation-sgd-framing.test.js` no longer depends on the sampler's wall-clock deadline: a fixed clock, and an assertion on the sampled frames (no literal wall-clock assertion existed at this commit).
- Not covered: nothing here was drawn in a browser or WebGL (Claude does not run browser checks); the pixel result, the look of the contour lines and the ghost, and label declutter near a tip label are for the preview and the golden fixture. The golden artifact, the `loss_surface` archetype and `animation-primitives-check.mjs` are lane (f)'s. Status: fixed-unverified.

### FX-AN-092 — the path tube renders black: its geometry has no vertex normals (renderer, AN-19; found by lane (f) in CI screenshot fail-6; fixed in the commit that adds this entry)
- Symptom: a black segment beside the ball in the CI screenshot; the ghost path, which uses the same geometry, is black too. Any GPU: a `MeshStandardMaterial` lights by vertex normal, and a tube with none has a zero normal.
- Cause: `scene.js` `trailBuffers` built the tube with a `position` attribute and an index only. The surface calls `computeVertexNormals`; the trail never did.
- Fix: the tube has a `normal` attribute, written with the positions on every frame that carries points: for each ring vertex the unit direction from the path out to it (`u cos + v sin`, the same orthonormal basis the position uses). The line trail (no radius) is unlit and unchanged. Only the drawn rings are written; the rest of the buffer stays zero, out of the draw range.
- Check: `scene.test.mjs` "a trail tube has a unit normal on every drawn vertex, pointing out from its path; a ghost too" (a path with a corner and a repeated point; length 1 within 1e-5, and facing away from the ring's centre). It failed before the change (no normal attribute) and passes now.
- Not covered: nothing was drawn in a browser or WebGL here; whether the black segment is gone is for the next CI screenshot (`animation-primitives-check.mjs`). The tube pinching at a sharp reversal is FX-AN-091. Status: fixed-unverified.

### FX-AN-093 — a diverged ball floats beyond the bowl's footprint, and the fit widens to include it (renderer, AN-19; fixed by decision 30)
- Cause: the clamp (`scene.js` `apply`, owner decision 11) holds only the node's world y. At learning rate 1.5 the golden's ball goes from (-1.05, -0.8) to x = 3.675 in one step while the surface footprint is x in [-2, 2]: it is held at y = 4 but hangs 1.7 past the rim, toward the camera, and the trail's last vertex is at the same x. `subjectPoints` fits the camera to what it sees (the trail corners are held to the ceiling in y only), so the view widens and the bowl shrinks.
- Evidence: `C:/s/spec/animation/release/ladder/artifact-part2/animation-primitives-check-shots/fail-6.png` (check 6: the bowl keeps 7.5% of the view; about 21% of the card's viewport width against about 38% at learning rate 0.1 in `fail-4.png`); the real golden program run through the review runner at learning rate 1.5: step 2 gives true y 10.84 held to 4, x 3.675, status diverged, loss 20.338. The fit itself was not measured, so the link between the two is the likely cause, not proven.
- Proposed fix: when a node is held in y, also clamp its world x and z into the target surface's world footprint (about 8 lines in `scene.js`), and the same footprint clamp for trail corners in `framing.js`, so a diverged ball sits at the lip, the status says diverged and the readout keeps the true loss. Or, on the author side, the program keeps the marker's x and z inside the bowl (the golden already lifts its trail's y; the archetype line "the program clamps nothing" would change).
- Risk: it changes what decision 11 means on screen, from "held at the surface's top" to "held at the lip above the bowl"; a marker legitimately outside the footprint would be pulled in when it is also above the ceiling.
- Decided and fixed (owner decision 30, C10; see FX-AN-103): a marker bound to a surface is held at the bowl's rim in x and z as well as y; readouts stay true; the trace says which axes and both positions; the fit follows the held marker and a path beyond the rim is not framed beyond it. The C9 evidence: C9 job 7 (`aj_ec5d7bfb0ea246e3bbae5de351f273ff`) "bowl fills 43% of the frame", with C7 and C8 similar. Status: fixed-unverified.

### FX-AN-094 — the near wall of a height-field surface hides the floor, ball and path from a low camera (renderer, AN-19; fixed in the commit that adds this note)
- Cause: a surface mesh is double-sided, and from outside the near wall is the back face of the height field (its normal points inward and up), drawn opaque. A camera at or below the rim therefore sees only the outside of the near wall. The golden's camera was `[7, 4, 0.5]` with the rim at 4: the ray to the lowest point crosses the near rim at about y = 1.7 against a wall about 3.6 high.
- Evidence: `C:/s/spec/animation/release/ladder/artifact-part2/animation-primitives-check-shots/A-loaded.png`, `B-ghost.png` and `fail-4.png`: only the dark outside of the near wall is seen; no ball, trail, ghost or arrow is visible (check 4 counted 0 orange pixels). Lane (f)'s higher camera (about 62 degrees of elevation) avoids it without any renderer change.
- Proposed fix: draw a surface mesh with `FrontSide`, a cutaway: the near wall is culled and the floor, marker, paths and far wall show from any low camera. About 6 lines in `scene.js`: surface nodes get their own material clone (the shared material is double-sided and used by other nodes) registered with the frame's material updates.
- Risk: it changes every future surface scene: the underside of a surface is invisible from below (right for loss surfaces and terrain, wrong for a closed shape built from several surfaces); the clone's colour and opacity must still follow frame updates.
- Fixed (in the commit that adds this note; Gate 2 on C4 failed 4 of the first 8, and the reviewer's most frequent finding in the rejected jobs 1, 2 and 4 was the author's own camera hiding the ball and the minimum behind the bowl's near wall, `C:/s/spec/animation/sgd-mvp1-acceptance/release-2/<job id>/reviews.json`): a surface node is drawn front side only, on its own clone of its material (`scene.js` `front`), registered with the frame's material updates (colour and opacity follow; the shared material and every other node stay double-sided; the clone is freed once with the scene). The near wall, seen from outside, is the back of the height field and is not drawn, so the floor, marker, paths and arrows show from any camera. Tests (`scene.test.mjs`, each fails on the old double-sided material): the side and the clone, the ray from `[7, 4, 0.5]` to the golden's ball meets nothing nearer. Not verified in WebGL. Side effect: the near wall's contour lines are lines, not faces, so they are still drawn and float where the wall was, a wire outline of the cutaway; they are thin and not filled. Status: fixed-unverified.

### FX-AN-095 — contour lines are invisible on a wall seen from below (renderer, AN-19; resolved with FX-AN-094)
- Cause: the contour lines are lifted by 0.3% of the height range in +y (`contourPositions`) to avoid z-fighting. On a wall seen from its underside that lifted line is behind the surface, so the depth test hides it.
- Evidence: `C:/s/spec/animation/release/ladder/artifact-part2/animation-primitives-check-shots/A-loaded.png`: lines appear on the far wall's inside only, none on the near wall.
- Proposed fix: with the `FrontSide` cutaway (FX-AN-094) the lifted side is always the visible side. Without it, give the surface material a `polygonOffset` and draw the lines exactly on the surface instead of lifting them.
- Risk: `polygonOffset` is set on a shared material unless the surface has its own clone; a lift of 0.3% is visible nowhere else.
- Resolved with FX-AN-094 (in the commit that adds this note): the lifted line is on the surface's front side and the surface is front side only, so no surface lies between a camera and a contour point it can see. By geometry and by `scene.test.mjs` (a ray from `[7, 4, 0.5]` to each of the golden's contour points hits the surface at the point or beyond it; fails on the double-sided surface). Not verified in WebGL. Status: fixed-unverified.

### FX-AN-096 — labels draw over objects that are hidden behind opaque geometry (DEFERRED, owner decides; renderer, AN-19)
- Cause: a label sprite is drawn with `depthTest: false` over the whole scene (a design choice so labels stay readable), so a label whose anchor is hidden behind the surface is still drawn, with nothing visible at its point.
- Evidence: `C:/s/spec/animation/release/ladder/artifact-part2/animation-primitives-check-shots/A-loaded.png` and `B-ghost.png`: "Next step" and "Downhill" float over the near wall with no arrow behind them.
- Proposed fix: none is small. The symptom disappears when nothing important is occluded (FX-AN-094, or the higher camera). The general fix is to hide a label whose anchor is behind opaque geometry, one raycast per label per layout, which is a larger change to `layoutLabels`.
- Risk: a raycast per label per frame on a surface of up to 7,938 triangles; a label that flickers when its anchor grazes an edge.
- Not fixed in the combined release; owner decides. Status: deferred.

### FX-AN-097 — a camera authored at 15 to 25 degrees hides the trail and collapses the zig-zag behind a surface (renderer, AN-19; owner order for C7; fixed in the commit that adds this entry)
- Cause: the card and the review page fit the camera along the authored direction (`position - target`). An author who picks a low direction for a surface scene gets a view that grazes the sheet: the path along the floor is foreshortened to a line and the near wall stands in front of it. The cutaway (FX-AN-094) hides the back of the near wall but cannot give a low camera any depth.
- Evidence: Gate 2 on C6 job 2 (`C:/s/spec/animation/sgd-mvp1-acceptance/release-2/aj_ae120e6a.../reviews.json`) and on C4 jobs 1, 2 and 4 (`release-2/<job id>/reviews.json`): authored cameras at 15 to 25 degrees, the reviewer's finding that the trail was hidden or the zig-zag collapsed.
- Fix: any scene with a surface node is viewed from at least `FRAMING.surfaceElevation` = 35 degrees above the horizon (25 in C7; raised to 35 for C9, owner order). `framing.js` `raiseElevation(camera, degrees)` rotates the camera about its target up to that elevation, keeping the azimuth, the distance, the target and the fov; a camera already at or above it is returned as it is (the golden's, about 62 degrees, is untouched). `subjectPoints` marks its result `surface` (`scene.hasSurface()`), and `fitCameraToPoints` applies the raise before it fits, so the card and both views of the review page (`animation3d-render.js`, which also calls `fitCameraToPoints`) agree. A scene with no surface node is untouched. The fit still contains every subject point after the raise (it is fitted on the raised direction).
- Tests (`framing.test.mjs`): `raiseElevation` (10 degrees raised to 25 on the same azimuth, distance, target and fov; below the horizon and straight down; 25, 40, 62 and 90 untouched); a surface scene fitted from 25 on its authored azimuth against a surface-less scene keeping its 10; the marker and a three-point path inside the view after the raise; the golden's camera unchanged. The existing framing, ghost and arrow tests pass unchanged.
- Note: `framing.js` is a frozen path; this change is the owner's order. Not verified in WebGL or by a review call. Status: fixed-unverified.

### FX-AN-098 — the review page's readout strip dropped every text readout, so the reviewer never saw the Status word (renderer/capture, AN-19; Gate 2 on C4, C6 and C7; fixed in the commit that adds this entry)
- Symptom: the reviewer reported the Status word missing from the readout strip in 7 of 8 (C4), 5 of 9 (C6) and 7 of 7 (C7) jobs, and as the main major finding of C7 jobs 5 and 6 (`aj_be5a40378c654322a74f8eeca2e3286f`, `aj_3497b72a27c64f129e82ed27cefc8f95`).
- Cause: not the author and not the validator. Both jobs declare `{ id: 'status', label: 'Status', kind: 'text' }`, their programs return `readouts.status` as a string, and every capture's trace carries it (`diagnostics-detail1.json`, captures `v0-s0` to `v1-s2`: `"status":"paused"`, `"running"`, `"diverged"`). The picture is drawn by the review page, whose own `showOverlay` (`render/animation3d-render.js`) built the strip with `Number.isFinite(frame.readouts[id])` and `.toFixed(decimals)`, so a string was filtered out. The learner's card (`card.js` `frameView`, FX-AN-071) and the golden's CI check were right, which is why the golden passed and authored scenes were judged on a strip without the word.
- Fix: `card.js` `readoutLines(artifact, frame)` (the card's own `frameView` and `readoutText`, one `label: text` line per readout), and the review page's strip calls it. Numbers are formatted exactly as before; a text readout shows its word; order is the artifact's declaration order; a string for a number readout or a number for a text readout is not shown (validation refuses those frames anyway).
- Test (`card.test.mjs`): the strip's lines for the fixture's text and number readouts, declaration order, declared decimals and units, wrong-typed values omitted. It failed before (no `readoutLines`); the page itself is DOM-bound and was not driven.
- Not covered: the review page was not run (no browser); a job already reviewed was not re-reviewed. The same candidate's accepted-or-not result under this fix is the next Gate 2 run's evidence. Status: fixed-unverified.

### FX-AN-099 — a label much longer than the short arrow it names, and a step label kept on an arrow too short to see (renderer, AN-19; owner order for C9; fixed in the commit that adds this entry)
- Evidence: Gate 2 on C7 job 2: a "Next step / rate" label about five times longer than its short arrow; the author's own hide threshold (0.25) was too low to hide it.
- Cause: a label's plate was sized from its text and the scene's span only; nothing related it to the arrow it names, and hiding a label for a short arrow was left to the author's program.
- Fix (`scene.js` `layoutLabels`, `ARROW_LABELS = { hide: 24, cap: 3, minWidth: 72 }`): a label whose node is a child of an arrow node is hidden (not laid out, no room taken) when that arrow is shorter than 24 CSS pixels on screen, and otherwise its plate is wrapped to at most 3 times the arrow's on-screen length (never narrower than 72 px; the cap moves in 8 px buckets so it repaints only when it changes). Any label not on an arrow is unchanged, and the author needs no rule.
- Tests (`scene.test.mjs`, a stub texture that honours the wrap width): a 14 px arrow's label is hidden, a 48 px arrow's is shown, at most 144 px wide and wrapped onto two lines; a short text is untouched; a label on a sphere is not an arrow label. All existing label tests pass unchanged.
- Interpretation: the owner's "cap a label's box size relative to the arrow" is the plate's width (wrapped), since the text cannot shrink below the legible 18 px minimum; "hide when its arrow is shorter than a threshold" is on screen in pixels, not in world units, so it follows the camera. Not verified in WebGL; `scene.js` is a frozen path and this is the owner's order. Status: fixed-unverified.

### FX-AN-100 — labels sit on the path of a trail, and rate tags are pushed far from their balls (renderer, AN-19; owner order for C9; fixed in the commit that adds this entry)
- Evidence: Gate 2 on C7 jobs 6 and 7: "Minimum" and "Next step" labels covering the zig-zag path, rate tags pushed far from their balls.
- Cause: label placement avoided arrows and small markers but knew nothing of a trail, so a plate was placed where the path ran.
- Fix (`scene.js` `layoutLabels`): each visible trail's polyline (its current points, at most 256 segments) is an obstacle for label placement, soft like a marker: a plate takes a clear spot beside the path where there is one, and one with no clear spot keeps its own place (the relaxed pass ignores soft obstacles) instead of vanishing. A path that ends at a label's own point (the ball's own trail) does not count against that label (`declutterLabels` `mine` now also matches a segment's end point). The trail node keeps its points for this (`userData.points`).
- Tests (`scene.test.mjs`): with a path through the place above a ball the plate sits on it (the control) and, once the path is drawn, is beside it, still shown; a zig-zag over the whole view still shows the label.
- Interpretation: "rate tags pushed far from their balls" is not changed by this commit beyond the new obstacle; if tags still sit far away after C9 the push distance is declutter's `steps` and needs its own entry. Not verified in WebGL. Status: fixed-unverified.

### FX-AN-101 — a marker or path drawn below the surface it sits on went undetected (C7 job 3; render stage and trace, AN-19; owner order for C9; fixed in the commit that adds this entry)
- Evidence: Gate 2 on C7 job 3 (`aj_2f17bed198df4482b5e2e7e170dcdd31`): the surface was drawn at twice the height the program uses, so the balls and the trails were buried under it.
- Cause: nothing compared the program's marker heights with the surface the card draws. The reviewer had to notice it in a picture, after a paid review.
- Fix (three parts, the check belongs to the render stage so it is found before any review is paid, as a repairable `spec` problem, like a trace over its limit): (1) `scene.js` `buried()` lists, for the frame last applied, each sphere with `clampTo` drawn below its target surface and each trail drawn below the first clamp target (or the scene's only surface): the surface height under a point is read from the surface's own triangles in its local frame (so a moved or scaled surface is followed), a point off the footprint is not on it, "below" is more than half the marker's radius (a path: its radius) and never less than 2% of the surface's height range (which absorbs a coarse grid's chord error: a 5 by 6 grid of a parabola is 0.04 off), and a path reports its worst point. (2) `review.js` adds `buried: [{ node, y, surfaceY }]` to the capture's trace (and `animation-render.js` lets the key through). (3) `animation-render.js` `renderStage` turns any capture's `buried` into one problem per node: "ball is drawn below the surface it sits on in captures v0-s0, v0-s1 (0.46 under it: its y is 0.6625 where the surface is 1.125): make the program's heights and the surface's heights follow the same heights, so the marker and the path are drawn on the surface", repairable, before the review.
- Tests: `scene.test.mjs` (job 3's shape: the fixture's surface doubled, the ball and path reported with how far under; the right surface, a ball off the footprint, in the air, clamped, resting on it, and a ball with no `clampTo` report nothing), `review.test.mjs` (on the real engine: the doubled surface gives `buried` for the path and the ball; the undoubled fixture and the golden at learning rates 0.1 and 1.5 after 2 to 4 steps give none), `animation-buried-marker.test.js` (the stage's problem, its text and category; a clean trace renders as before). Each failed before the change.
- Interpretation of the owner's wording: "a check that a marker or trail point drawn below the surface it sits on is detected, where it belongs in the pipeline" is the render stage's check on the sampled captures against the drawn surface's heights, fed to the repair as a spec problem, not a finding the reviewer has to make. A marker with no `clampTo` has no declared surface and is not checked.
- Risk: a false positive costs a repair round; the thresholds are deliberately generous (half a radius, 2% of the range), and the golden is clean. Not verified in a browser or against a real job. Status: fixed-unverified.

### FX-AN-102 — the review ran out of output tokens in the middle of its tool call (C8 Gate 2 job 4; raised to 8,000 for C9; decision-16-shaped, owner to confirm the displayed ceiling)
- Evidence: C8 Gate 2 job 4 (`aj_4f08e1b367964e4aa0c3124c26dfc33f`, "Why too large a learning rate makes gradient descent blow up", `C:/s/spec/animation/sgd-mvp1-acceptance/release-3b-c8/`): the review call stopped with `max_tokens` at exactly 6,000 output tokens (input 13,572): 3,818 thinking tokens, a 2,322-character prose answer written before the call, and a `report_review` tool call cut off (partial input `{}`). The job failed with `output_limit` ("The visual review reached its output limit before it finished"). The failed call cost 174,709 micro-USD (US$0.17) for nothing.
- Distribution (17 retained review calls, C7 and C8): completed outputs 2,620 to 5,312 tokens (mean about 4,100), thinking 1,824 to 4,100 (60 to 77% of the output), answer 796 to 1,980. The failing call's thinking is inside that range; its answer (2,182) is the highest seen, because of the prose. Input tokens are unchanged (13.4 to 13.6K against 12.8 to 13.6K), so the readout strip change did not cause it; the diverging scene gave the reviewer more to say.
- Fix (its own commit, so it can be reverted alone): `LEARN_TASKS.animation_review.maxTokens` 6,000 to 8,000 (`learn-models.js`). Nothing else moves: the brief, author and repair bounds and every input limit are as they were. Output is US$20 per million tokens, so the review's worst-case bound goes from 463,520 to 503,520 micro-USD per call (+US$0.04), the generation worst case from 3,246,240 to 3,366,240 (+US$0.12, +3.7%), and the credits shown on Generate from **325 to 337** (planning's 56 is unchanged; planning + refinement + generation 437 to 449). Actual spend grows only in the rare calls that use the extra room.
- Tests: `animation-fit.test.js` (a new test that fails on 6,000: the review's limit, bound 503,520, the generation worst case 780,000 + 3 x 503,520 + 2 x 537,840, 337 credits, and the brief, author and repair bounds, role input limits and call counts unchanged; the earlier pins of 6,000 and 325 updated), `animation-policy.test.js` (the review request's `max_tokens`).
- Not done, and why: pinning `effort: 'medium'` for the review would cut the 60 to 77% thinking share but changes review behaviour and needs a measured comparison; asking the reviewer not to write prose before its call saves about 600 tokens but is prompt text (AN-20's). A forced tool call is not available on this model (tool choice stays auto). Status: fixed-unverified; the displayed ceiling change is for the owner to confirm before release.

### FX-AN-103 — decision 30: a diverged marker is held at the bowl's rim in x and z as well as y (renderer, AN-19; C10; supersedes the y-only hold of decision 11; fixed in the commit that adds this entry)
- Evidence: FX-AN-093 (C9 job 7 `aj_ec5d7bfb0ea246e3bbae5de351f273ff`: the bowl 43% of the frame; at learning rate 1.5 the golden's ball goes to x 3.675 against a footprint of [-2, 2] and floated in the air toward the camera, widening the fit).
- Fix (`scene.js` clamp in `apply`, `framing.js`, `review.js`): for a sphere with `clampTo`, the world x and z are held inside the target surface's world footprint (its box) as well as y at the top (or `max`). A marker inside the footprint and under the ceiling is untouched, and so is a node with no `clampTo`. The readouts are the program's own numbers. `apply().clamped` and the capture trace's `clamped` now read `[{ node, axes, trueY, y, trueAt, drawnAt }]`: `axes` is the subset of `x`, `y`, `z` the host held, `trueAt` and `drawnAt` the world position the program gave and the one drawn ([x, y, z], 4 decimals in the trace); `trueY` and `y` are kept as they were. `framing.js` holds a trail's corners to the same footprint (and the ceiling), so a path beyond the rim does not widen the view (the path is still drawn where the program put it). A marker held at the rim is not reported as `buried`. The review request text says "held at the surface's rim (true position [...], drawn at [...])" for an x or z hold and keeps its y-only words otherwise.
- The golden JSON is unchanged (the golden's program needs no change): the golden's diverged ball at lr 1.5 is now drawn at the rim, (2, 4, 0.4) for a true (3.675, 10.84, 0.4); every other golden frame is inside the footprint. The sgd-golden tests do not read the clamp, and the primitives check's learning-rate-1.5 step (the clamped ball inside the frame, the bowl keeping its share) should only improve; its thresholds were not recalibrated and no browser was run here.
- Tests: `scene.test.mjs` (a ball at x 3.675 is drawn at the rim with axes x and y and both positions, readouts true; both ends of x and z; inside the footprint, exactly on the rim and a node with no `clampTo` untouched; x only and z only below the ceiling; the golden's diverged ball), `review.test.mjs` (the trace fields on the real engine), `framing.test.mjs` (a marker and path at x 9, z 7 frame as if at the rim), `animation-review-size.test.js` (the request text). The clamp tests that asserted the y-only shape were updated to the new fields. Frozen paths (`scene.js`, `framing.js`, `review.js`): this is the owner's decision. Status: fixed-unverified.

### FX-AN-104 — label distance cap: a plate may not be pushed far from the point it names (renderer, AN-19; C10; owner order; fixed in the commit that adds this entry)
- Evidence: Gate 2 on C9 job 7: a "Lowest point" label about 100 px to the right of its dot, sitting on the orange path's turning point, with the diverged ball beside the label while the real minimum dot was far to the left; C7 job 7: rate tags pushed far from their balls.
- Cause: `declutterLabels` pushed a plate along its placement, its sides and the opposite way (up to `DECLUTTER.steps` pushes) until it was clear of every obstacle and plate, with no limit on how far that could take it from its point: a plate was a whole plate-width (100 px and more) away and no longer read as the label of its dot.
- Fix (`scene.js`, `DECLUTTER.reach` = 48): a spot is taken only if the plate, there, lies within 48 CSS pixels of the point it names, measured from the plate's nearest edge to that point (a plate sits 4 px from its point by its own placement; flipping to the other side of the point is as near). When no spot that near is clear, an essential plate stays where it is, at its anchor, and an optional one is left out, as an optional plate with no clear spot always was: nothing is ever moved farther. It costs one comparison per candidate spot (the placement still runs once per draw, with no new cache or obstacle).
- Interpretation of the owner's wording: "if no spot within the cap exists it stays at the anchor, never farther" is read as the essential plate staying at its anchor and the optional plate being hidden rather than shown overlapping what it was kept off; saying "stays" for the optional plate too is a one-line change (return its own spot).
- Tests (`scene.test.mjs`): a plate with a clear spot a short way off moves there; one behind a wall of arrows (every clear spot far) is left out (optional) or stays (essential); a smaller reach takes the near side of the point; an unobstructed plate is where it was. Four existing declutter expectations changed because a push beyond 48 px is no longer taken: a side push of 94 became a push down of 22, a push up of 72 became down by 32 (with one push or many), and a crowd of 24 labels on one point places 4 instead of 5. Frozen path (`scene.js`): the owner's order. Not verified in WebGL. Status: fixed-unverified.

### FX-AN-090 — contour lines and a ghost trail do not follow a frame's material update (DEFERRED, cosmetic, decision 8)
- Task / phase: AN-19 renderer (`scene.js`). Found while implementing FX-AN-048; not a blocker for any rung.
- Actual / expected: a surface's contour lines use their own line material (the surface colour darkened to half), and a ghost trail uses its own copy of the node's material at 40% opacity. A frame's `materials` update (colour or opacity) reaches the node's shared material only, so after such an update the contours and the ghost keep their first colour. Expected: they follow, in proportion.
- Evidence: `scene.js` surface and trail branches build `own(new THREE.LineBasicMaterial(...))` and `own(base.clone())`; `apply` updates only `surfaces.get(id)` and `strokes.get(id)`. No test exercises it.
- Severity: cosmetic; blocks neither MVP3 nor any gate. The golden SGD artifact changes no material colour in a frame.
- Next concrete action: if a scene ever animates a material colour on a surface or ghost node, derive both from the base material in `apply` (the contour colour is `base.color * 0.5`, the ghost opacity `base.opacity * 0.4`). Owner action needed: none.
- Status: deferred

### FX-AN-091 — a trail tube may pinch at a sharp reversal (DEFERRED, cosmetic, decision 8)
- Task / phase: AN-19 renderer (`scene.js` `trailBuffers`). Not seen in a browser; found by reading the geometry.
- Actual / expected: each point's ring is built from the tangent between its neighbours with a fresh up-vector basis (no parallel transport), so where a path reverses direction in one step the ring can twist or flatten and the tube can pinch. Expected: a constant-thickness tube.
- Evidence: `trailBuffers` in `scene.js`; the tests check the draw range, bounds, ring radius and allocation, not the look at a reversal. Unverified in WebGL (Claude does not run browser checks).
- Severity: cosmetic, only for a path with an abrupt reversal (a ball bouncing back along its own path). Blocks nothing.
- Next concrete action: look at the golden fixture's diverged state on the preview; if it shows, carry the previous ring's frame forward (parallel transport) instead of rebuilding it from the up vector. Owner action needed: the preview look.
- Status: deferred

### FX-AN-072 — does an arrow's `offset` scale with its node? (AN-18/AN-19)
- A magnitude arrow is a unit arrow whose node `scale` is `[1, length, 1]` (the golden does this; one scale for both arrows). If the renderer composes `offset` inside the node's scaled frame, the tail sits at `offset x length` from the ball's centre: inside the ball when the step is short, off it when long, so the fix for "arrows start inside the ball" holds only at length 1.
- Recommended: `offset` is applied outside the node's scale (a world distance along the arrow's axis), and the tip anchor is `offset + length x scale`. If not, say so in the contract text so the author puts the arrow under an unscaled aim group. The golden assumes the first and is otherwise correct under either (it only sets `scale[1]`).
- Confirmed in `scene.js` (566f11bf3): the offset is a translate inside the arrow's own group, which the node's scale multiplies. For the golden: the first step at rate 0.1 is 0.18 long, so its tail sits 0.02 from the ball's centre (inside the ball, radius 0.12) and the arrow shows a 0.09 stub; at rate 1.5 the first step is 2.75 long and the tail sits 0.33 out, a 0.21 gap from the ball. If the renderer keeps this, the golden can compensate (give each arrow node `position` = direction x 0.12 x (1 - length), so the tail lands at the ball's edge at any length) at the price of knowing the renderer's convention; lane c decides, the golden is not changed for it.
- Decided and fixed (in the commit that adds this note): `offset` is applied outside the node's scale. The arrow's drawable sits at `offset / scale.y` in the node's own frame and a tip label at `offset / scale.y + length`, both re-placed whenever a frame changes the scale, so a unit arrow under scale `[1, length, 1]` keeps its tail `offset` from its origin and its tip at `offset + length x scale`. The contract comment and tool description already said "the tail starts that far along +Y". Tests: `scene.test.mjs` (a scaled arrow before and after a frame rescales it; the golden's arrows at lengths 0.05 to 3). The golden builder needs no compensation. Status: fixed-unverified.

### FX-AN-073 — DEFERRED: a stepped scene's own Pause is invisible to the program, so a status word can say running while the clock is paused
- The card's transport Pause stops the host clock; the program is told nothing (`evaluate` has no playing flag), so a program-level `status` of running stays until the learner presses the scene's own Pause. The golden declares Run, Pause, Step once and New run as actions and keeps its own `on`; the transport buttons duplicate Run and Pause.
- Options: give `evaluate` a `playing` boolean, or hide the transport when the scene declares a pause action. Neither is in this slice.
- Status: deferred (cosmetic; the learner sees the ball stop).

### FX-AN-074 — trail vertices are not clamped, and the camera fit sees them
- `clampTo` holds only a sphere node's world y. A diverged ball's trail vertex would be drawn at its true height and widen the fit by itself, so the golden's program keeps its trail vertices at the surface top (`lift` in its source, marked there) while the ball keeps its true height for the renderer to clamp. An author following the archetype ("the program clamps nothing") will not do this for the trail.
- Options for AN-19: let a trail node name the surface it follows (same `clampTo`), or have `subjectPoints` ignore trail points above the surface top the way it ignores a clamped ball's true position.
- Fixed for the camera fit only (in the commit that adds this note): `scene.clampCeiling()` is the highest world y a clamp held a node to in the last frame, and `subjectPoints` clamps a trail's corners to it, so a diverged path does not widen the view. The trail is still drawn where the program put it (it may leave the picture); a trail node naming its surface would be the contract change if that matters. Test: `framing.test.mjs`. Status: fixed-unverified.

### FX-AN-075 — the golden JSON is a frozen identity (owner decision 22) and a Windows checkout can change its bytes
- The AN-20 harness hashes `sgd-golden.json` by its bytes. With `core.autocrlf=true` a fresh Windows checkout writes it with CRLF, a different hash from the LF file Linux and the builder write (the same hazard `.gitattributes` already closes for the Motion fixtures).
- Fix, one line in `.gitattributes`: `packages/web/src/animation3d/testdata/sgd-golden.json text eol=lf`. Not applied here (a shared file); apply it before the golden is frozen. Any later edit to the golden (rebuild with `build-sgd-golden.mjs`) changes the hash and restarts the gate that froze it.
- Applied (in the commit that adds this note): the `.gitattributes` line `packages/web/src/animation3d/testdata/sgd-golden.json text eol=lf`; the golden re-checked out with LF on this Windows tree (the builder-equality test failed on the CRLF checkout and passes on the LF one). Status: fixed-unverified.

### FX-AN-076 — how the golden is shown on the dev preview (AN-19 task 5), and what the check needs
- Two ways, neither needs a model call. (a) `docs/features/animation/golden-fixture-card.patch` (one hunk in `Animation3DCard.jsx`: a card whose `fixtureId` is `sgd-golden` loads the JSON as its own chunk; the card then shows the Example pill and note like every built-in example; it is in no picker and no Slash window, so `slash-sheet.test.mjs` is unaffected; `Animation3DCard.test.mjs` passes with it applied). The primitives check seeds exactly such a card. (b) With no code change, the dev-only `seed-fixture` route stores the golden as a saved result (`animation-golden-sgd.test.js` runs that route), and the owner launcher `C:/s/spec/animation/open-correction-fixture.mjs` shows it if pointed at `sgd-golden.json`'s `artifact` instead of the correction artifact.
- Apply the patch with `git apply docs/features/animation/golden-fixture-card.patch` in the AN-19 branch (checked against `caf7ee9bc`'s file). Until it is applied and the renderer draws the five kinds, `animation-primitives-check.mjs` fails in `fast-e2e`; that is its job.
- Applied (in the commit that adds this note): `golden-fixture-card.patch` in `Animation3DCard.jsx`, with the card test above. Status: fixed-unverified.

## Resolved

### FX-AN-032 — a stepped game never moved in the card (owner canvas 2026-11-02, "Projectile Challenge: Hit the Target")
- Cause: a stepped scene moves only by the host's steps, which run only while playing (`runtime.js` displayFrame), and the
  card offered Play only for a timeline, so nothing ever started them: Launch counted a shot and stayed "Ball in flight".
  Review accepted it because the capture advances steps itself (`advance(ticks)`).
- Fix: a stepped scene shows Play and Pause (`card.js` visibleControls; no Restart or Speed: steps cannot rewind), and an
  accepted action starts its steps when they are paused (`session.js` action). Reset stops them until the next action or Play.
- Checks: `session.test.mjs` stepped game (fails on the old code); animation-mvp step 33 launches a stepped game and lands it.

### FX-AN-033 — a ready card fell into "The scene stopped responding" on a busy board (owner canvas 2026-11-02)
- Seen: "Ceiling fan" (watch) right after a reload with ten cards; reproduced on the same canvas in headless Chromium at 4x
  CPU after a reload, on "Grid robot": console `animation runtime: runtime_limit / engine boot deadline`.
- Cause: idle Workers stop (idleMs) and are evicted for other cards (2 live), so any later call boots an engine cold; a boot
  over 2 s on a busy page failed the call, and only a start retried. Playwright routes disable the HTTP cache, so every boot in
  a browser check refetches and recompiles QuickJS: the harness sees it far more often than a learner, who can still see it on
  a slow device or first load.
- Fix: `runtime.js` boots again after a missed boot deadline for every call of a card's runtime (START_RETRY_MS pauses; never
  for a background sampler or a program's own failure). Check: `runtime.test.mjs` cold boot after idle (fails on the old code).

### FX-AN-034 — animation-mvp check flakes (fast-e2e 41559196907 steps 30-32; 41559906404, 41510588122 step 17)
- Steps 30-32 (reproduced locally, 1 of 3 runs): the check pressed Generate on the last plan in the thread before the bead's
  plan had arrived, so it pressed the beam balance plan's (restored with Generate enabled after the reload) and approved job 1
  twice; the bead job was never approved. Fix: the check presses the plan with the bead's title and waits for its approve.
- Step 17 ("Interact did not start" on the game card): not reproduced (0 local failures). The check's `live()` clicked the
  click surface of a scene that was still preparing; a click on a scene that is ready enters Interact, so a scene becoming
  ready within the click leaves the card interacting and the next Interact press ends it. `live()` now clicks only a card
  waiting for a slot. Cause not confirmed: every Interact press now reports, on failure, the card's live/active/disabled/
  selected/focus state and the last 40 transitions (an init-script trace), so a repeat names it.

### FX-AN-024 — the camera-fit sampler starved learner runtimes (fast-e2e 41272196685: 16 of 34 animation steps failed)
- Cause: each card's fit sampler took a slot of the 2-Worker animation pool and evicted idle cards' Workers, so calls re-booted
  Workers (the check's route handler disables the HTTP cache, so each boot re-fetched and recompiled QuickJS) and cards missed
  the 2 s boot deadline ("The scene stopped responding"); a late fit also moved an idle scene after a baseline. A restore that
  hit an engine failure was silently restarted from the defaults (the saved input came back as the default).
- Fix: `runtime.js` background mode (a sampler only takes a free Worker, never evicts or waits; a card preempts it; stopping
  cancels a pending boot); an engine failure during a restore fails `ready` and Restart scene restores the saved state.
  `framing.js` samples at most 12 frames in 1 s as a background runtime and otherwise fits the frame shown. `session.js` fits
  before the first draw (no later jump). The check opens collapsed sections before reading readouts.
- Also (control plane): a reviewer that answers in prose with no report_review call is asked once more within the build's
  review calls (accept-11); the review judges size and layout in the default view, not side-view foreshortening, and accepts a
  smaller subject at a parameter extreme while it stays visible; strings and rods must not be hairlines; no label on small parts.
- Limit: on a board where both Workers are held by idle cards, a card is fitted from the frame it shows, not its motion range.

### FX-AN-023 — generated scenes worked but looked poor (owner review of the pendulum, 2026-10-31 PT)
- Owner: tiny subject in empty space, blurry scene labels, cheap geometry/materials, labels larger than the geometry and not
  shrinking on zoom-out, controls competing with the scene, Interact buried, unclear resets.
- Before images: C:/s/spec/animation/before-quality/ (Browser Rendering captures of the accepted experiment, watch, game).
- Fix (general, no subject rules):
  - Sharpness (`renderer.js`): backing bitmap = devicePixelRatio x the card's on-screen scale (canvas zoom), 0.25 steps,
    1..3, capped at 3840x2160, re-checked on resize, before draws and every 250 ms; canvas styled to its box; poster WebP 0.95.
  - Labels (`scene.js`): 18-22 px plates sized by the scene's on-screen size, rasterized at device pixels and snapped, at most
    20% of the scene footprint (larger hint, then order; the rest hidden), connectors when moved; Labels on/off for object
    names (frame-updated text and parentless captions always shown).
  - Look: studio environment light, key and fill, neutral tone mapping, roughness 0.55; contract unchanged.
  - Framing (`framing.js`, card session and review capture page): camera fitted once per scene to the subject over sampled
    motion and parameter extremes, authored direction kept, backdrops excluded, 10% margin; saved camera wins.
  - Card (`Animation3DCard.jsx`, `Controls.jsx`, `session.js`): 640 px card; one toolbar under the viewport (Play/Pause,
    Restart only where it can rewind, Speed, Playing/Paused, Reset view, Labels, Interact with a pressed Done state);
    Reset experiment/game/scene beside its settings with help text; first parameter as the main control, secondary
    settings and readouts collapsed; a prominent first readout for experiments and games only.
  - Generation (`agents/animation-brief.js`, `agents/animation-author.js`, `animation-author.js`): authoring and review
    standards for proportions, geometry, colour, framing and restrained labels; requested parameter first, requested result
    first readout; stated ranges, units and defaults kept (server check now also refuses a changed unit, default or order);
    the reviewer fails a visually poor scene as major; repair reframes instead of shrinking.
- Regression: framing, scene, renderer, session, card and pipeline unit tests; animation-mvp steps for status, resets,
  labels and zoom screenshots (Z-*.png). Web unit 4866 pass / 0 fail; control-plane animation 54/54.
- Fixing full SHA: see the M3 receipt update for this candidate.

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
