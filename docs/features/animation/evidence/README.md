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

## C11 second attempt (5 November 2026, 8:22 AM PT) and the first-round correction

- `c11-28294cce9/gate2-rerun-0821/` (release-gate2-c11r; fresh users `g2-202611041621-1..5`; job 0 passed, 11 credits): **FAIL, 4 of the first 7 accepted** (jobs 3, 5, 6, 7 accepted; jobs 1, 2, 4 rejected; jobs 8 and 9 not run). First-round (first draft) outcomes: job 6 accepted at first review with 0 repairs; job 3 and 7 rejected at first review (twin balls hide each other) and accepted after 2 repairs; job 5 rejected by the render check (trail below the surface) and accepted after 1 repair; job 1 failed validation (unknown geometry `dotM`) and then its first review had 4 majors, rejected after 2 repairs; job 2 rejected at first review (arrow 4x long runs through the bowl wall), 1 repair, rejected; job 4 rejected at first review with a renderer finding no repair can fix (the held diverged ball floats at height 2.7 above the 2.16 rim) .
- `c11-28294cce9/gate1-regression/`: 9 of 9 valid (91 credits). With the SGD 20 of 20 this is C11's full Gate 1.
- Correction (owner, 5 Nov 2026): the night attempt (`gate2-voided-provider-limit/`) was not wholly void: jobs 1, 2 and 4 were rejected on their first review there too; only their repair reviews hit the provider workspace limit. First-round score on C11's night attempt: 2 of 5 reviewed jobs accepted (jobs 3 and 5).
- Captures (PNG + manifest) are under each job's `captures/`; the same hash caveat applies.
