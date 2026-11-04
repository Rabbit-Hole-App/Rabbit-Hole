# Animation SGD ladder: gate evidence

Owner order (4 November 2026): commit the job exports, review reports and harness tables for every candidate, under `evidence/<candidate>/`, so a reviewer can read failures against the data. Each folder is named `<label>-<short sha>` after the candidate the runs were made on.

## Layout

| Folder | Candidate | Contents |
|---|---|---|
| `c3p-53a47f33c/` | C3' `53a47f33ca90f3f18144ea2b196be4a724f3d10f` | Gate 1 SGD (20) and regression (9) tables and per-run files |
| `c4-7ffa197ba/` | C4 `7ffa197ba3a9c406c449090a3a6ee01a4a75c4a0`, preview `ac467072-cacc-4b9d-bb37-61cbc5c79ea1` | Gate 1 (SGD 17 run, regression 9) and Gate 2 (8 jobs started) |
| `diag-string-standin/` | a stand-in tree (C3'' + AN-20 branches), not a release candidate | the 6-sample author diagnostic that captured whole tool inputs |
| `c6-c3d9aa6e8/` | C6 `c3d9aa6e815dca7596c5ff0570dfa2ae878ddc09`, preview `c894e9e7-c528-40d0-aeba-0c250f6402b9` | Gate 1 and Gate 2 (9 jobs) |
| `c7-951288c09/` | C7 `951288c09c321d8dbaaa22d539a2b7d4e51cb0b6`, preview `c7b3d363-0305-40c6-a42b-9f009548e4f5` | Gate 1 and Gate 2 (7 jobs) |

Runs on a candidate cannot be inside that candidate's own commit. They are committed with the next candidate; for a released candidate they are a docs-only follow-up.

## What each file is

- Gate 1 (`gate1-*`): `table.txt` and `summary.json` per batch; per run folder `run.json` (identities, status, credits, `inputKeys`), `usage.json`, `problems.json` (validator and assertion messages), `draft.json` (the author's draft when there was one) and `input.json` (the raw tool input, from C4 onward; the first 3,000 characters on C4, the whole string on later runs). Files over 250 KB are left out.
- Gate 2 (`gate2/`): `result-*.md` / `result-*.json` / `gate2-result.json` (the verdict table), `spend-rows.md`, `state-*.json`, and per job folder `summary.json`, `job.json` (stage, failure, usage, timing), `plan.json`, `reviews.json` (every review's raw reply with the findings), `diagnostics-detail1.json` (the artifact, calls with bounds and costs, captures' traces, findings), `chat-messages.json`, and the program source before each repair and the last draft.

## What is NOT here

- **Capture images.** The review captures (the pictures the reviewer model saw) are not stored by the Gate 2 script, the job record or the harness, so none exist to commit. What is here is the reviewer's text findings and each capture's trace (the state of the program at that sample), as JSON. A claim about what a capture showed rests on the reviewer's own words and the trace, not on the image.
- The CI screenshots of the primitives check on C3' exist only as a GitHub Actions artifact (run 41762152651, artifact `fast-e2e-53a47f33ca90f3f18144ea2b196be4a724f3d10f-2-1`).
- Session cookies, API keys and the sessions files. A scan of this tree for cookie, bearer, key and PEM patterns found none.

## Claims that stay unverified in the receipt until read against images

1. That the Status text readout was declared as `kind: text`, set by the program every frame and carried in all six captures of jobs `aj_be5a40378c654322a74f8eeca2e3286f` and `aj_3497b72a27c64f129e82ed27cefc8f95` (C7 Gate 2): the traces are in `c7-951288c09/gate2/<job id>/diagnostics-detail1.json` and the program in `program-last-draft.js`; the claim that the review page's strip dropped it comes from the code of `packages/web/render/animation3d-render.js` on C7 and is covered by a unit test of the formatter only (FX-AN-098); no capture was seen after the fix.
2. The reviewer reports for all C7 Gate 2 jobs: they are the reviewer model's reading of images not preserved here.

## Added after C8 (4 November 2026, 9:20 PM PT)

| Folder | Candidate | Contents |
|---|---|---|
| `c8-7bb1a0ef4/` | C8 `7bb1a0ef4211ea45ecd3a53ccd6770d76080e8d3`, preview `7c545e95-ecef-4418-a070-0709ef1ddec7` | Gate 1 (SGD 20 of 20, regression 9 of 9); Gate 2 rerun on fresh users `gate4-1..5` (verdict FAIL, 3 of the first 7); `gate2-aborted-first-start-429/` is the first start, stopped by the operator after job 2's approve returned HTTP 429 (the escrow's cap of 5 free failed attempts per learner per day, reached by the reused `gate2-*` test users): it counts for nothing. |

## Capture images (added 4 November 2026, about 9:28 PM PT)

The images do exist: every review render writes each capture PNG to the dev R2 bucket `rabbit-hole-dev-learn-media` at `animation/<job id>/<first 16 hex of artifactHash>-<capture id>.png`, and nothing deletes them. The earlier statement above that none are stored was wrong. They are fetched with `C:/s/spec/animation/release/ladder/fetch-captures.mjs` (read-only GETs; the keys come from each export's `diagnostics-detail1.json` captures and from each review round's `artifactHash`).

- `c8-7bb1a0ef4/gate2/<job id>/captures/` holds every capture of every C8 Gate 2 job (66 PNGs, 4.5 MB, all valid PNG files; repair rounds included) and a `manifest.json` per job.
- **Hash caveat:** for the final round, the SHA-256 of the downloaded file does NOT equal the `sha256` recorded in the job's diagnostics (42 of 42 final-round files differ; the 24 earlier-round files have no recorded hash to compare). The files are the right capture ids for the right artifact hashes, and they are real renders of the scene, but they are not proven byte-identical to the images the reviewer model received (rendering may not be byte-deterministic, or the object was written again by a later render of the same artifact). Read them as the same scene and state, not as the reviewer's exact bytes.
- **FX-AN-098 check against an image (C8, job `aj_a43c70b6269e4e04976d882faaa986b3`, `692b401ca03ebced-v0-s0.png`):** the readout strip at the bottom now reads `Loss (true value): 8.500 · Distance to minimum: 3.05 · Steps taken: 0 · Status: paused`, so the Status word appears in the review picture on C8. The C7 captures that the reviewer judged are fetched in the next commit if still in the bucket.

## Added after C9 (4 November 2026, about 9:50 PM PT)

- `c4-7ffa197ba/`, `c6-c3d9aa6e8/`, `c7-951288c09/` Gate 2 jobs now also carry `captures/` (PNGs and a `manifest.json` per job), fetched from the dev R2 bucket the same way as C8's. The same hash caveat applies: downloaded bytes are not proven identical to what the reviewer received.
- `c9-4a920b1f7/` (C9 `4a920b1f7433523b4e8c92afb813694090407aff`, preview `10947e93-08ab-45eb-b20c-d4dd7572a3f3`, fresh users `g2-202611040532-1..5`): Gate 1 SGD 20 of 20 and regression 8 of 9; Gate 2 verdict FAIL, 5 of the first 9 accepted (jobs 1, 2 and 7 rejected by the visual review; job 9 stopped by the dev platform day cap `USAGE_PLATFORM_DAY_USD` 40, not a product result; job 10 not run). Captures for every job are under `gate2/<job id>/captures/`.

## Added overnight (4 November 2026, 10:35 PM PT, decision 31 in force)

- `c10-852c86ce5/` (C10 `852c86ce5cbef7c1f6d737eea4ed0ddcc36ee61f`, preview `4d2318c1-3883-4a57-8e0e-189a808e825f`): CI green (verify 41784316493, fast-e2e 41784316316, all six parts incl. the primitives check). Gate 2 **did not run**: the mandatory control (job 0, the golden through the product's review) REJECTED the golden (`controls/controls-result.json`: arrows tiny/hidden, 'Downhill' mislabelled, arrow colour = path colour). Gate 1 on C10 was stopped by the operator (the golden is the exemplar). `controls/controls-exploratory-ae82facb429a.json` is the review of the retuned golden (`retuned-golden-r1.json`, sha256 `ae82facb429a...`): accepted, 0 of 6 captures rejected, minors only (decision 34).

## C11 (4 November 2026, about 11:00 PM PT)

`c11-28294cce9/` (C11 `28294cce9904138dcbb9c1ddec7176045f87690f` = C10 + the retuned golden `ae82facb429a` + exemplar pin; preview `1fc859c6-00a2-4697-b298-a399b7e4ba98`): `controls/` the job-0 control PASSED (golden accepted by the product's review); `gate1-sgd/` SGD 20 of 20 valid; `gate1-regression-voided-provider-limit/` and `gate2-voided-provider-limit/` are NOT results: from about 10:50 PM PT every model call failed because the dev Anthropic workspace reached its API usage limit ("You have reached your specified workspace API usage limits. You will regain access on 2026-12-01"). Jobs that completed before that (accepted jobs 3 and 5, 0 repairs) are real; the failed ones are provider_unavailable, not product outcomes. Both are to be rerun when the limit is raised.

## C11 second attempt (4 November 2026, 8:22 AM PT) and the first-round correction

- `c11-28294cce9/gate2-rerun-0821/` (release-gate2-c11r; fresh users `g2-202611041621-1..5`; job 0 passed, 11 credits): **FAIL, 4 of the first 7 accepted** (jobs 3, 5, 6, 7 accepted; jobs 1, 2, 4 rejected; jobs 8 and 9 not run). First-round (first draft) outcomes: job 6 accepted at first review with 0 repairs; job 3 and 7 rejected at first review (twin balls hide each other) and accepted after 2 repairs; job 5 rejected by the render check (trail below the surface) and accepted after 1 repair; job 1 failed validation (unknown geometry `dotM`) and then its first review had 4 majors, rejected after 2 repairs; job 2 rejected at first review (arrow 4x long runs through the bowl wall), 1 repair, rejected; job 4 rejected at first review with a renderer finding no repair can fix (the held diverged ball floats at height 2.7 above the 2.16 rim) .
- `c11-28294cce9/gate1-regression/`: 9 of 9 valid (91 credits). With the SGD 20 of 20 this is C11's full Gate 1.
- Correction (owner, 4 Nov 2026): the night attempt (`gate2-voided-provider-limit/`) was not wholly void: jobs 1, 2 and 4 were rejected on their first review there too; only their repair reviews hit the provider workspace limit. First-round score on C11's night attempt: 2 of 5 reviewed jobs accepted (jobs 3 and 5).
- Captures (PNG + manifest) are under each job's `captures/`; the same hash caveat applies.

## C12 golden controls (4 November 2026, about 9:50 AM PT)

`c12-7fdbae422/controls/` holds every job-0 control run on the C12 golden rounds, and the three golden files. All are exploratory runs of the product's own review (direct review call, about 11 to 15 credits each) except the C12 Gate 2 job 0, which is the gate's own control and stopped that gate (exit 5, no author job ran; Gate 1 on C12 was stopped by the operator before any run).

| Golden (sha256 prefix) | Preview, review identity | Result | File |
|---|---|---|---|
| `06cadd3f` (round 1) | C11 preview `1fc859c6`, identity `c42f81ed` | REJECTED, 6 of 6 captures: noise not scaled by the learning rate | `c11-preview-golden-06cadd3f-r1-REJECTED.json` |
| `72f091f7` (round 2) | C11 preview `1fc859c6`, identity `c42f81ed` | ACCEPTED, 0 of 6 rejected | `c11-preview-golden-72f091f7-r2-ACCEPTED.json` |
| `72f091f7` (round 2, same file) | C12 preview `bf1f5c5a`, identity `687d4661` | REJECTED, 6 of 6 captures | `c12-preview-golden-72f091f7-REJECTED.json` |
| `4f7f80ba` (round 3) | C12 preview `bf1f5c5a`, identity `687d4661`, run A | ACCEPTED, 0 of 6 rejected | `c12-preview-golden-4f7f80ba-r3-runA-ACCEPTED.json` |
| `4f7f80ba` (round 3, same file) | C12 preview `bf1f5c5a`, identity `687d4661`, run B | REJECTED, 2 of 6 (v0-s1, v1-s1): "converged" shown while the ball was still about 0.5 from the lowest point | `c12-preview-golden-4f7f80ba-r3-runB-REJECTED.json` |

What the record shows, and what it does not:

- The same artifact, `72f091f7`, was accepted on the C11 preview and rejected on the C12 preview. The two runs are not the same conditions: the review identity differs (`animation-render.js` `92c3b753` on C11, `f7331cf0` on C12), and C12 includes lane c's rim-held marker fix (d). The C12 rejection's first finding (the trail's last point drawn at the surface top, 3.74, while the ball is now held on the surface at 2.32) is explained by (d) meeting the golden's old `lift()`. Its other finding (the noise vanishes near the minimum and is invisible at batch 16) was a minor on the C11 acceptance and became a major on C12. A stricter reading by the same reviewer prompt cannot be separated from the changed review page with one run each.
- The same artifact `4f7f80ba` was accepted in run A and rejected in run B on the same preview and identity, back to back. Run A raised the run B finding as a minor ("the band lets it stop with a visible gap"). Run B made it a major. This is verdict variance for one artifact and one finding on one identity.
- The reviewer is not deterministic. Read single control verdicts, in either direction, as one sample.
- Golden files: `golden-06cadd3f-r1.json`, `golden-72f091f7-r2.json`, `golden-4f7f80ba-r3.json`.
- A local workspace path in `c12-preview-golden-72f091f7-REJECTED.json` was replaced by `<workspace>/`.

### Golden round 4 (`48a5b7e4`, 4 November 2026, about 10:05 AM PT)

Round 4 narrows the converged band (the ball must be at the lowest point within the noise before the status reads "converged"; the run stays "running" until then), the finding run B raised on round 3. Three runs on the C12 preview (`bf1f5c5a`, review identity `687d4661`), back to back:

| Run | Result | File |
|---|---|---|
| A | ACCEPTED, 0 of 6 rejected, minors only | `c12-preview-golden-48a5b7e4-r4-runA-ACCEPTED.json` |
| B | ERROR, no verdict: the render service answered HTTP 502 (`render_failed: Protocol error (Runtime.evaluate): Session closed`). Not a pass and not a rejection; rerun as C | `c12-preview-golden-48a5b7e4-r4-runB-ERROR-render-502.json` |
| C | ACCEPTED, 0 of 6 rejected, minors only | `c12-preview-golden-48a5b7e4-r4-runC-ACCEPTED.json` |

Golden file: `golden-48a5b7e4-r4.json`. Two accepted verdicts of the same artifact on one identity; one infrastructure error is recorded and not counted either way.

## C13 (4 November 2026, about 11:25 AM PT)

`c13-2c90f9d9d/` (C13 `2c90f9d9d8762d7d46836d6f1ecdf84be01e2cd7` = C12 + golden rounds 3 and 4 `48a5b7e4` + exemplar pin + primitives-check recalibration + evidence + plan note; preview `846574ba-c14d-4b0f-8a1a-f22f97697241`, prompt-files hash `365a5aef`, review identity `687d4661`; CI verify 41889947337 and fast-e2e 41889947226 both green; recovery branch `recovery/animation-combined-2c90f9d9` at `6062f5e91`):

- `gate1-sgd/`: SGD 20 of 20 valid (537.58 credits). `gate1-regression/`: 8 of 9 valid (84.48 credits). Files over 250 KB are left out.
- `gate2/` (fresh users `g2-202611041848-1..5`): the job-0 control accepted the golden (10.21 credits). **Verdict FAIL: 7 of the first 9 accepted**; 806.25 credits settled (US$8.06), 582 charged to the test users. Capture PNGs and a `manifest.json` per job are under each job's `captures/` (72 PNGs); the hash caveat above applies.

| # | Job | First round | Repairs | Final |
|---|---|---|---|---|
| 1 | `aj_8c02d10a` | rejected at review (11 serious) | 4 | rejected: round 4 ended on check (ii) |
| 2 | `aj_d6db10ff` | not reviewed (pre-review problem) | 3 | accepted |
| 3 | `aj_a9bf2a51` | not reviewed (pre-review problem) | 2 | accepted |
| 4 | `aj_bf396fcc` | not reviewed (pre-review problem) | 1 | accepted |
| 5 | `aj_adb387ce` | not reviewed (render check) | 2 | rejected: all three rounds ended on check (ii) |
| 6 | `aj_0c535edf` | accepted | 0 | accepted |
| 7 | `aj_e073c6f5` | not reviewed (pre-review problem) | 2 | accepted |
| 8 | `aj_d6dc61ef` | accepted | 0 | accepted |
| 9 | `aj_82f0dea3` | rejected at review (3 serious: kept-path colours) | 1 | accepted |
| 10 | `aj_60e05e90` | control: the plan was not approved (plan-sgd, see below) | 0 | n/a |

First round: 2 of 4 reviewed jobs accepted; the other five accepted jobs and job 5 failed a pre-review check on the first draft. After repairs: 7 of 9.

**Both rejections are check (ii) misfires.** Check (ii), "the trail marks every Nth step" (FX-AN-120), compared the drawn trail with every step. The plan each learner approved said otherwise: job 5's approved plan says "one marker every 4 steps, at most 50 markers" (the platform's own `fewer_markers` size choice produced it); job 1's says one marker every 2 steps, at most 100. The author followed the plan; the check fired anyway ("it holds 16 points after 40 steps", "21 after 69", "31 after 79"; job 1: "15 points after 27 steps", rounds 1 and 4), and the repair rounds ran out. Job 1 had also been rejected by the review in round 0 and again in round 2 for visual findings, so its rejection is not check (ii) alone; the owner's rerun decision 36 names it as a misfire and reruns it.

**Job 10 (control phrasing "the 2 sigma problem of optimizers"):** the harness recorded `plan-sgd (the plan has SGD markers: sgd, gradient, loss surface, learning rate, descent, loss_surface archetype)` and "the control plan was not approved". The pipeline planned the control phrasing as an SGD-like plan and the harness stopped before approval, so no author job ran for it. It is logged as a harness observation, not a gate result.

## C14 (4 November 2026, about 12:20 PM PT)

`c14-985872c69/` (C14 `985872c6939b83adcfc9f106e7b3e9e89b125618` = C13 + FX-AN-125; preview `1ad1061b-977b-4240-9c83-87c89e4f6805`, prompt-files hash `39cd0f57`, golden `48a5b7e4`; CI verify 41895661177 and fast-e2e 41895661318 green; recovery `recovery/animation-combined-985872c6`):

- `gate1-sgd/` SGD 20 of 20 valid (546.54 credits); `gate1-regression/` 8 of 9 valid (84.76 credits).
- `gate2/` is the **targeted rerun of decision 36**, not a Gate 2: the job-0 control accepted the golden (12.11 credits), then only jobs 1 and 5 on fresh users `g2-202611041920-1..5` (`--only 1,5`). Both were rejected, for causes other than check (ii): job 5 (`aj_11007d2c...`, "a ball rolling down a loss surface, step by step") on check (i) in all three render rounds; job 1 (`aj_39828bf0...`, "stochastic gradient descent") on the plan's stale `pathLength` assertion (min 100, plan draws at most 60 markers), check (e) and three review rejections. Captures (PNG + manifest per job) are under each job's `captures/`; the hash caveat above applies. A local workspace path in the controls files was replaced by `<workspace>/`.
- The released commit is C14b `18d92571` (C14 + the `/animation` text change); it was not gated, see `docs/features/animation/ladder-release-receipt.md`.
