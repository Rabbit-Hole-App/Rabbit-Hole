# Brief 19 report: four fixes from the curve report, then the chain measured (2026-11-14)

Branch `design/fast-path`. Figures come from the evidence folders named below; estimates say so.

## Canvas, clone, launcher

- **Canvas:** `https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev/apps/canvas-f7df2e22`, account `owner-interact-fast-mwgskdw8@example.com`. It holds the chained curve card (prompt 17), the Moon card (prompt 5), the chained toss card (prompt 1), a toss card made through the Opus brief by the forced fill failure, and in its Chat the two gap sentences (prompts 35 and 46).
- **Launcher:** `C:\s\spec\interact-real\open-curve.cmd` (`--check` passes) opens that canvas.
- **Clone Version ID now:** `473a3f7f-7d3b-4e5b-a883-6ee7bc9bf0d3` (fast design, template build, `INTERACT_GAP=message`, Opus brief on, **chain off**, no forced failure). The cards above were made on earlier deploys of the same code: `1236a82d-f5ba-452d-8879-09dde4343a4e` (chain on) and `7aef25c0-6d0e-4366-9ab5-009907834fc2` (forced fill failure on, chain on).

## Task 5: the chain table and the decision

Chain on, deploy `1236a82d`, 12 runs (`evidence/2026-11-14-b19/final/toss/results.jsonl` and `final/sigmoid/results.jsonl`), the Worker log tailed with `wrangler tail`:

| Run | Prompt to card | `msTotal` | Path |
|---|---|---|---|
| Toss Brief 1 | 4.9 s | 3.5 s | fast |
| Toss Balanced 1 | 4.8 s | 3.6 s | fast |
| Toss Detailed 1 | 5.1 s | 4.0 s | fast |
| Toss Brief 2 | 4.0 s | 2.9 s | fast |
| Toss Balanced 2 | 4.8 s | 3.9 s | fast |
| Toss Detailed 2 | **23.0 s** | n/a (the Opus-brief route records 0) | Opus brief after a refused fill |
| Toss Brief 3 | 4.4 s | 3.5 s | fast |
| Toss Balanced 3 | 8.3 s | 7.0 s | fast, one correction |
| Toss Detailed 3 | **21.0 s** | n/a | Opus brief after a refused fill |
| Sigmoid Balanced 1, 2, 3 | 5.5, 4.7, 5.0 s | 4.0, 3.6, 3.5 s | fast |

- **Recovery alarm:** none fired. The log shows 17 active `interact_alarm` lines. The longest is 6.9 s; those are the shadow judge's alarm after the card is ready (`ready` to `ready`). No line shows a 30 s or 5 s recovery turn, no job shows a stage of 5 s or more waiting on the alarm, and the first alarm of each fast job carried the whole design and build (`queued` to `ready` in one alarm, 2.9 to 4.0 s).
- **The two rows over 12 s** (Detailed 2 and 3) are not stalls: both fill attempts failed on `mode.timeline.markers.0.time a time before 0 is outside the elapsed timeline`, so the job ran the Opus brief (about 19 to 21 s of design, then a card).
- **Decision by the rule as written:** "if no run exceeds 12 s, turn the chain on, otherwise leave both off". Two runs exceeded 12 s, so **`INTERACT_CHAIN` stays off in `wrangler.dev.jsonc` and on the clone.** If you count only delays that came from the alarm (none did), the answer would flip; turning it on is one line.
- **Earlier 18-run history** (report of this morning): 3 of 18 chained runs lost 30 s to the recovery alarm on the older chain; this set of 12 shows none, with the 5 s recovery alarm for quiet stages (30 s kept for a stage with a model call).

## Task 1: the toss template at low gravity

- The acceleration arrow's scale follows the plan's smallest gravity (`arrowScale` in `templates/shared.js`; 3.4 px per m/s^2, or 12.5 / the smallest acceleration if larger). The gravity-floor clause is removed from the toss family's `formulaRules`; the design-time precheck stays.
- The Moon prompt then failed on the VELOCITY arrow (`vec.v.toss ... at cp-before`): that checkpoint is 0.1 s before the top, where the speed is 0.1 x gravity (0.162 m/s on the Moon), so a 12 px per m/s arrow is under 2 px and the SDK draws a line. The velocity arrows now start at 1 px when the smallest nonzero speed would draw under 3 px, and only below 1.5 px does their scale grow. I did not use 12.5 px: speeds run from 0.16 to about 8 m/s, so that scale would draw the largest arrow about 600 px long.
- **Frames:** the four pinned plans' generated source and capture hashes are byte-identical to `5e7c381d8` (`2410fc76df9832fc` Overview, `3aa5f5e5b59c3cbd` Standard, `7f5d2fd497e2c00b` Deep, `17c77b7915c929ae` Moon ledge).
- **Tests:** `interact-arrow-scale.test.js` (builds Moon variants through the brief expander: Balanced at g 1.62 to 12.12, g 1.5 to 1.7, g 1.62 with the smallest launch speed; Detailed g 1.62; Overview fixed g 1.62; plus the pinned hashes). Web suite 6902 tests, 6874 pass, 0 fail, 27 skipped.
- **Moon card on the clone:** prompt 5 at Balanced, ready in 4.4 s, `msTotal` 3.4 s, design cost US$0.0028, judge v2 fail with 2 majors (uncalibrated). Screenshot: `final/showcase/fast-p5-card-top.png`.

## Task 2: a precheck failure goes to the Opus brief, never the full design

- Routing: a picked family whose fill (plus correction) or template precheck fails twice goes to the Opus brief with the first and last problem lines in its input; the full Opus design is reachable only from a `none` pick under `INTERACT_GAP=opus`. If the Opus brief is refused too, the job ends with the plain refusal.
- **First forced run: no card.** The Opus brief returned a plan the lane word budget refused (`words: "Back at start" is drawn as "Back at"`), and with one Opus call the job ended.
- **Fix:** the Opus brief now gets one correction (a second Opus call, the limit is 2) with the first reply's problem line (`interact-design.js`; tests: a precheck refusal gives two Opus calls and the second hears the words line; an Opus brief refused once is corrected once and its plan goes to approval). Pushed in `fc2269cf1`.
- **Forced run after the fix** (`INTERACT_FAST_FORCE_FILL_FAIL=1`, prompt 1 at Balanced, `evidence/2026-11-14-b19/final/fallback/results.jsonl`): **card ready, 49.1 s prompt to card** (plan at 47.4 s, build 1.6 s), 4 design calls (2 fill, 2 Opus), design cost about US$0.11 (the ledger records the fast record's cost: US$0.107), the Opus brief path (`opusBrief: true`), pick `vertical-throw` 0.98. The ledger row (`jobId ej_3815408b89df4790995c562df7178a94`) has `designKind=opus`, `designFallback=after_correction`, `designCalls=4`, `pickConfidence=0.98`, `msPick=78`, judge fail with 2 majors.
- Separately, in the Detailed chain runs above, the unforced Opus-brief route twice reached a card in about 21 to 23 s.

## Task 3: the pick retries once

`pickFamily` retries a timeout or transport error once (same request); two failures = gap with reason `pick_timeout`; a definite answer (`none`, a fit, below threshold) never retries. Tests (`interact-design-pick.test.js`): a stubbed first-call timeout returns the second call's choice; two timeouts return a gap logged `pick_timeout`; a definite answer asks once.

## Task 4: a `none` pick ends with a message

- `INTERACT_GAP=message|opus`, default `message` under `INTERACT_DESIGN_KIND=fast` (code default, the clone and `wrangler.dev.jsonc`). A `none` pick, a below-threshold pick, or two pick failures ends the job with "This kind of scene isn't supported yet." and `stopReason=design_gap`; no model call.
- **Clone, Balanced:** prompt 35 ended with the sentence in 1.25 s and prompt 46 in 0.89 s (`final/showcase/results.jsonl`). Screenshots: `final/showcase/fast-p35-gap-message.png` and `fast-p46-gap-message.png`.
- **Ledger rows:** gap rows carry `pickProbabilities` and `prompt`. The two rows on the first try had no prompt or depth (a job that never had a plan is built from a saved detail, which did not carry them); fixed by exposing `diagnostics.request` (`prompt`, `depth`) and reading it in `jobFromDetail`, with a test. After the fix the rows read: `How does attention work in a transformer?` balanced, `none 0.99, curve-sliders 0.01`; `What are the steps of the Krebs cycle?` balanced, `none 1, vertical-throw 0`.
- **`scripts/interact/gaps.mjs`** (`--offline`, `--json`): prints the gap rows grouped by the highest non-none family probability, else by the seven-criterion coverage question. On the current ledger it lists 9 gap rows; 7 older rows predate the prompt column and read "no prompt recorded", and both new rows are unclassified because no family has a probability above 0.2.

## Suites and spend

Control-plane suite on the final code: 4707 tests, 4702 pass, 4 fail, 1 skipped. Three of the four are the curve template and curve pin tests, which failed under load in the full run and pass alone (35 of 35 with the explain-job file). The fourth was a real failure from my change: `explain-job.test.js` asserts the exact key list of the diagnostics, and I added `request`; the test is updated and passes. Spend for this brief: clone runs and the judge are pennies; the Opus calls are the two forced-failure Opus briefs (about US$0.11) plus the first forced attempt (one Opus brief, a few cents); no full Opus design ran.

## Decided alone

- Chain left off by the rule as written (two runs over 12 s, both from the Opus-brief route).
- Velocity-arrow rule: 1 px start and a 1.5 px scale floor, not 12.5 px.
- Gave the Opus brief a second call with the problem line, after the first forced run produced no card.
- Fixed the missing prompt and depth on gap ledger rows (not in the brief).
- Added `--reuse <canvas.json>` to `drive-design.mjs` so the fallback card could join the showcase canvas.
- `pick-canvas.json` now points to the showcase canvas (so `open-pick.cmd` opens it too).
