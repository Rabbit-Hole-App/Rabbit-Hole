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
