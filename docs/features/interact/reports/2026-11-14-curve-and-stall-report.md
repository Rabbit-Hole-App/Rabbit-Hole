# Curve family on the clone and the chain stall (2026-11-14, morning)

Branch `design/fast-path`. No release, rollback or pins work was done (owner instruction). Everything below is from files in this branch; where a figure is an estimate it says so.

## 1. Curve family (Codex's `design/family-curve`, merged as `834146e80`)

**Launcher and clone.** `C:\s\spec\interact-real\open-curve.cmd` (`--check` passes) opens `canvas-f6d1d0d2`, account `owner-interact-fast-mwgp5gy4@example.com`. The clone Version ID for these runs was `bb7351b8-81a3-4bc1-89ce-3e78e6b78d1a` (two-family pick, default threshold 0.9, `INTERACT_CHAIN` unset, Opus brief on). The clone has since been redeployed (chain confirmation, then back to chain off); the canvas and its cards are unchanged.

**Acceptance** (`evidence/2026-11-14-curve/acceptance.md`, raw `acceptance.json`, reproduce with `node scripts/interact/curve-acceptance.mjs`). Nothing failed, so no contract-side fix and no change to Codex's files.

| Check | Result |
|---|---|
| Codex's curve tests, control-plane | 22 of 22 |
| Codex's web test (`interact-family-curve-sliders.test.mjs`) | 10 of 10 |
| Curve round trip (`extractBrief` to `expandBrief`) | equal plan hash at all three depths |
| Zero-model template build | all three build (`curve-one`, `curve-compare`, `curve-readouts`), 0 fetches |
| Codex's oracle | 0 problems at all three depths (36, 54, 78 rows, none skipped) |
| Six wrong briefs | 6 of 6 fail on the intended code and path (`curve_derivative` x2, `curve_bounds`, `curve_effect` x2, `curve_marker`) |
| Web suite (idle) | 6902 tests, 6874 pass, 0 fail, 27 skipped |
| Control-plane suite | 4688 tests, 4683 pass, 4 fail (load flakes, pass alone), 1 skipped |

**Fill bench** (`benchmarks/bench-design-mvp-curve.md`, command as specified: `--family curve-sliders --model gemini-3.5-flash-lite --depth all --n 10 --concurrency 2 --cap-usd 2`, prompt "Why does a sigmoid squash any number into 0 to 1?", first try only). The `--family <id>` switch on `scripts/interact/bench-design-mvp.mjs` defaults to `vertical-throw` and leaves the toss path unchanged.

| Depth | Idle run | Run under CPU load | Median fill | Median cost |
|---|---|---|---|---|
| Brief | 10 of 10 | 8 of 10 | 2.1 s | US$0.0019 |
| Balanced | 10 of 10 | 9 of 10 | 2.3 s | US$0.0023 |
| Detailed | 10 of 10 | 7 of 10 | 2.6 s | US$0.0025 |

The loaded run's failures were `runtime_limit: time limit` on correct formulas (the headless run's budget is wall-clock in Node), a missing-trace line, and one word over its length. Total bench spend about US$0.14.

**Clone runs** (`evidence/2026-11-14-curve/clone/results.jsonl`, Balanced, once each, pick on):

| Prompt | Pick | Path | Prompt to card | Design cost | Judge v2 |
|---|---|---|---|---|---|
| 17 sigmoid squash | curve-sliders, 0.98, 77 ms | fast, built straight through | 9.8 s | US$0.0022 | fail, 3 majors |
| 19 logistic steepness | curve-sliders, 1.0, 68 ms | fast | 9.8 s | US$0.0021 | fail, 1 major |
| 26 parabola coefficient | curve-sliders, 1.0, 113 ms | fast, one correction (`formula y at {"k":1,"x0":0,"x":-6}: got 36, expected 0,1`) | 12.0 s | US$0.0042 | fail, 2 majors |
| 1 highest point of a throw | vertical-throw, 0.97, 78 ms | fast | 10.0 s | US$0.0032 | fail, 2 majors |
| 5 ball on the Moon | vertical-throw, 1.0, 103 ms | fell back to Opus after the correction; no card | 393 s | US$1.30 (US$1.34 total) | none |

Prompt 5 failed with `template build: [arrow_direction] the arrow "vec.a.toss" is not drawn at start`. The two-lane acceleration arrow is drawn at 3.4 px per m/s^2 and a vector under 12 px is not an arrow, so a Moon-gravity range cannot be drawn there; the fill text's gravity floor (at least 4) contradicts a Moon prompt. This is a toss template limit, not Codex's family. A fix would scale the arrow to the smallest gravity in range; not done.

**Fit at 1440 x 900** (`evidence/2026-11-14-curve/fit/drive-look.json`): all four ready cards are whole in view. Curve cards 676 x 646, 676 x 647, 676 x 626; toss card 676 x 660. `scripts/interact/drive-look.mjs` now skips the Play steps on a card with no Play button (the curve cards are sliders with no transport); it crashed on them before.

**Judge v2** (`benchmarks/judge2-curve/`, US$0.10): all four fail, with 3, 1, 2 and 2 majors. The curve majors are about guide lines and tangent objects missing from some states, and empty captures that cannot be judged. The judge is uncalibrated, so these are not yet confirmed defects.

## 2. The chain stall (`evidence/2026-11-14-chain/stall-analysis.md`, agent analysis on `st-q`)

**What was wrong with the earlier evidence.** Every chained clone run in the first measurement (`after`, `after2`, deploy `b5c98634`) ran commit `751feda48`, whose chain stopped after `authoring` whenever a 0 ms stage saved twice in one millisecond (`validating` is exactly 1000 ms in all 18 rows). The fix `23c023415` landed after those runs, so no run of the fixed chain existed.

**What the two stalled jobs show.** In both, the 1 s wake alarm never ran and the 30 s recovery alarm did (`explain-job.js` re-arms `setAlarm(now + 30000)` first). Both finished at submitted + 30.09 s and 30.08 s, with validate, render and accept in one millisecond afterwards.

**Ruled out:** a deploy reset (the nearest deploy was 11 to 13 minutes before); the previous job's shadow judge blocking the alarm; job content; a QuickJS or wasm leak (36 chained jobs in-process, `external` flat at 21 to 23 MB, no heap trend); retry backoff; a `runtime_limit` failure (a template-build refusal fails fast, it does not stall).

**Confirmation set on the fixed chain** (`evidence/2026-11-14-chain/after3/`, deploy `d461fa4a-dc79-4e3a-a3f8-a6b011f29224`, code `e15de0b11`, `INTERACT_CHAIN=on`, 3 per depth):

| Depth | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Brief (prompt to card) | 5.4 s | 5.0 s | 4.1 s |
| Balanced | failed (see below) | failed, 30 s interruption | 9.0 s |
| Detailed | 8.7 s | 8.5 s | 5.8 s |

`msTotal` (prompt admitted to ready) on the 7 ready rows: Brief 3.6, 3.8, 3.2 s; Balanced 7.5 s; Detailed 7.5, 7.3, 4.2 s. All are at or under the 7.5 s target.

The two failed rows:
- **Balanced run 2: the same 30 s signature again.** The job failed at `design_authoring` with "An AI step was interrupted. You are not charged for it." Its timing shows the stage lasting exactly 30000 ms with the `design_fill` call in flight for 30.0 s with status `unknown` (call started 1794679736793, ended 1794679766697). That is the 30 s recovery alarm finding a call whose isolate was lost.
- **Balanced run 1: a pick timeout, not the chain.** The pick timed out at 1200 ms (`reason: timeout`), was counted as a gap, and the job ran the full Opus design (US$0.94, 236 s) and failed with no card.

**Narrowest hypothesis.** With the chain on, 3 of 18 runs lost 30 s to the recovery alarm (two in `validating`, one with a fill call in flight in `design_authoring`). I read no 30 s stage in the roughly 35 unchained fast runs I looked at, though I did not scan every row systematically. The data cannot separate "the first alarm did not return normally and the platform resumed the job via the recovery alarm" from "the platform lost the wake". No code defect is confirmed, so no fix is made. `INTERACT_CHAIN` stays off by default and is off on the clone now. The `interact_alarm` log line added to `alarm()` (only while the chain is on) records alarm duration, stage before and after per job, and the armed alarm before `wake`; deploying with the chain on and `wrangler tail` filtered on it is the next step.

## 3. Finding to act on: a pick timeout costs a whole Opus design

A pick that times out (1200 ms) is treated as a gap, so a toss prompt that would have built in 10 s instead runs the full Opus design for about US$0.9 and ends with no card (seen once in 9 chained runs; none in the other pick runs). Retrying the pick once on a timeout or transport error (not on a definite `none`) would remove most of this; not implemented.

## 4. Contract fixes proposed for Codex's deliverable 3 (agent R, `briefs/contract-fixes.md`, docs only)

- **One-place family registration.** A family is one directory with one descriptor (templates with generator, states hook, roles and words; `pickCriterion`; `pins`; `oracles`; `tests`). One index file lists the family modules and derives the generator's template table, the role and word tables, the control-plane registry, the pin tables, the fixtures and the oracle chain. Two `check-map` globs replace the per-file rows. Codex had to edit 11 places outside his own modules (plan enum `interact-plan.js:218`, `generate.js:15,17`, `interact-formula.js:21-49,150-156`, `interact-families.js`, `interact-design-pin.js:18-38`, `interact-plan-fixtures.js:278`, `interact-oracle.js:253`, `check-map.json`: 8 rows edited and 14 added). Migration order: toss, then curve, then delete the hand tables; the existing snapshot, template, curve and `check-map` class tests prove nothing moved.
- **Fixed-input schema change.** The positive-only rule on fixed brief inputs is one zod validator (`interact-plan-brief.js:45`) that came from the Overview fixing gravity. Proposal: a family declares the sign per input, `[id, 'fixed', { min: -Infinity }]`; omitting it keeps today's rule, so the toss schema and fill text stay byte-identical. The stepper needs it because a step index starts at 0.
- Both are added to `briefs/family-3-stepper.md` as fixes needed before deliverable 3. No code was changed and the proposals were not tested.

## 5. Spend since 10:05 PT

About US$2.4 by my tally, not audited: the Moon prompt's Opus fallback US$1.34, the pick-timeout Opus design US$0.94, the judge US$0.10, the Flash Lite benches about US$0.14, and the toss and curve clone runs about US$0.02. The cap is US$5. Opus ran only inside the two fallbacks above.

## 6. Decided alone

- Kept `INTERACT_CHAIN` off after the confirmation set (the 30 s signature recurred once on the fixed chain).
- Did not fix the Moon arrow scale or add a pick retry (out of scope; both are listed above).
- Patched `drive-look.mjs` to skip Play steps on still cards.
- Restored `pick-canvas.json` after the prompts mode overwrote it.
- Did not touch `release/interact-131`, `rollback/pre-interact-131` or any pins.
