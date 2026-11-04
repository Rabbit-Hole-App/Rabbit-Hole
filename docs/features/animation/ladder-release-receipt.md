# Animation SGD ladder: release receipt (5 November 2026)

Owner decision 38 closed the ladder. This receipt records what was released, what the gates measured, and what was waived. It does not claim that Gate 2 passed. It did not.

## What was released

- **Release commit (C14b):** `18d92571f7c286043d1dc92547d09529a8d22ffd`, on `main` at 12:08 PM PT, fast-forwarded from `7b51b62d04c54314e9e21d70a8e5147109d00ac1` under the MVP fast path.
- C14b is C14 `985872c6939b83adcfc9f106e7b3e9e89b125618` plus one commit: the `/animation` request-box text drops its last sentence (owner order). The final text is "Describe an idea to see as a live 3D scene you can watch, adjust or play; review its plan, then generate it. Works best for mechanisms, loops and small games." Neither "Loss surfaces and optimizers are not supported yet" nor "Also draws gradient descent on a loss surface" is in the product. The feature is not described by one scene.
- C14 is C13 `2c90f9d9d8762d7d46836d6f1ecdf84be01e2cd7` plus FX-AN-125 (the trail rule is read from the approved plan: `trailRule`, check (ii), FX-AN-111). C13 is C12 plus golden rounds 3 and 4, the exemplar pin and a primitives-check recalibration. Lineage and fixes are in `fix.md` and the plan.
- **Production:** release run 41903737638 succeeded in MVP mode (record `2584a077072b29d6`, build `2570c95a4fc846b8`). `rabbit-hole-app` `fe0ee38d-b78c-45cc-8b65-4de3e35dc721` and `rabbit-hole-cp` `9b2de958-d984-4e0e-8839-e5fa0f5b4c98` both serve `18d92571`.
- **Recovery branch:** `recovery/animation-combined-18d92571` at `5267c4bcbb8238ad7a5f178d65d5f31f3cd4e492` (one commit on the release commit; it restores the previous request-box line, "Loss surfaces and optimizers are not supported yet.", and turns the five SGD client features and streaming off).
- The release script printed a warning that the MVP banner was not in the run log. It came from a transient `error connecting to api.github.com` on the script's own read. The banner is in the log (three times), and the workflow's "MVP preview record of this commit" step found the record.

## CI run ids

| Commit | verify | fast-e2e |
|---|---|---|
| C13 `2c90f9d9d` | 41889947337 success | 41889947226 success |
| C14 `985872c69` | 41895661177 success | 41895661318 success |
| C14b `18d92571` (released) | 41902324893 success | 41902325006 success (all six e2e shards green; finished after the release) |
| Release | `release production` 41903737638 success | |

## Gates

- **Control (job 0, the golden through the product's review):** accepted on C13 (10.21 credits) and on C14 (12.11 credits). The golden went through four rounds first (see the evidence README): round 2 was accepted on the C11 preview and rejected on the C12 preview; round 3 was accepted once and rejected once on the same preview; round 4 `48a5b7e4` was accepted twice (one run was a render 502, no verdict).
- **Gate 1:** SGD 20 of 20 valid on C13 (537.58 credits) and on C14 (546.54 credits). Regression 8 of 9 on both (84.48 and 84.76 credits).
- **Gate 2 on C13: FAIL, 7 of the first 9 accepted** (806.25 credits). Accepted: jobs 2, 3, 4, 6, 7, 8, 9. Rejected: jobs 1 and 5. First round: 2 of the 4 jobs that reached a review were accepted (jobs 6 and 8); jobs 1 and 9 were rejected at review; the other five failed a pre-review check on the first draft. After repairs 7 of 9 were accepted.
- **Both C13 rejections ended on a check (ii) misfire.** Check (ii), "the trail marks every Nth step", compared the drawn trail with every step while the approved plan said otherwise (job 5: one marker every 4 steps, at most 50; job 1: every 2 steps, at most 100). Job 1 had also been rejected by the review in rounds 0 and 2 for visual findings, so check (ii) was not its only cause. FX-AN-125 fixed the check.
- **C14 targeted rerun (owner decision 36): jobs 1 and 5, on fresh test users, after the control. Both rejected, for other causes than check (ii)** (315.37 credits including the control):
  - Job 5: check (i), "at the highest learningRate the run diverges in N steps", fired in all three render rounds (diverged in 2, 1 and 1 steps; 3, 2 and 2 trail points). With a rate range up to 0.4 the author could not make the run diverge slowly. Under a thinned plan a run that leaves in fewer than about 9 steps holds under 4 points, so the check also contradicts the plan, but a one-step divergence holds two points at any density, so thinning was not the whole story. Rounds ran out.
  - Job 1: round 0 failed validation on the plan's own stale assertion (`pathLength` `min` 100 while the thinned plan draws at most 60 markers: `shrunk()` does not rewrite assertions); round 2 failed check (e), an arrow through the surface; rounds 1, 3 and 4 were rejected by the review for substance (arrows rescaled every step and hidden near the minimum, a tangled trail at rate 0.5).
- **Decision 38 therefore released C14b on the evidence of 7 of 9 with two misfires, not on a Gate 2 pass.** The released product is the ladder's machinery (honest failure, per-kind repairs, escrow billing, the five SGD client features, the shorter prompts and `loss_surface` archetype, the golden, the trace checks) without a capability claim.

## Control job 10, the "plan not approved" note

Job 10 ("the 2 sigma problem of optimizers") is the wrong-subject control. The harness recorded `plan-sgd (the plan has SGD markers: sgd, gradient, loss surface, learning rate, descent, loss_surface archetype)` and "the control plan was not approved". It means the planner turned the control phrasing into a plan that carries SGD markers, so the harness stopped before approving it and no author job ran. If the control path produced an SGD plan instead of the fixture, that is a harness observation to log, not a gate condition: Gate 2's pass condition on the control (it must not silently become SGD) was not what failed Gate 2.

## What was waived or done differently

- Gate 2 was not passed. The owner closed the ladder (decision 38) and released C14b as it is.
- The fast-path smoke (`ladder-smoke.mjs combined`) was run non-strict. The Gate 2 result item is therefore a SKIP (no passing table exists), not a PASS. No script was edited to make it pass.
- The first fast-path preview attempt for C14 failed on two environment tests: three `cad-execute` shell scripts had Windows line endings in the worktree's working copy (the committed files are correct and CI passed that test), and a card-size test hit a time limit while the machine was busy. The three scripts' working-copy bytes were set to the committed LF bytes and marked unchanged in the worktree's index; no commit changed. The same attempt then passed for C14b.
- The fast-path preview clone is deployed from the dev config, which does not turn animations on, so the clone answers `animation_disabled` on the jobs route. Production's state is verified separately below.

## Post-release verification (read-only, against digrabbithole.com)

Passed: both Workers serve `18d92571` as one version; `ANIMATION_ENABLED` true, `ANIMATION_EXECUTION_KILL` false, `ANIMATION_STREAMING` unset, diagnostics unset; Durable Object `ANIMATION_JOBS -> AnimationJobs`; signed-out jobs and results routes 401; the five diagnostics paths 404; the five SGD client features declared in the served bundle; the request-box copy is the final line and neither old sentence is in any of the 662 chunks.

Not passed: **the canary description is UNKNOWN.** The scheduled canary description (weekly, SGD, two failures in a row) was an AN-21 closeout item and was never created. The release is live without the canary.

## Spend (credits; 100 = US$1), listed batches only

C13: Gate 1 622.06, Gate 2 806.25, control 10.21 (1,438.52). C14: Gate 1 631.30, Gate 2 and control 315.37 (946.67). Listed total 2,385.19 credits (US$23.85). Golden-round controls on the C11 and C12 previews cost about 11 to 15 credits per run (seven costed runs, plus one render error). Earlier candidates' spend is in `spend.md` and the evidence folders.

## Known open items

See "SGD ladder: parked 4 Nov" in `fix.md` and in the plan.
