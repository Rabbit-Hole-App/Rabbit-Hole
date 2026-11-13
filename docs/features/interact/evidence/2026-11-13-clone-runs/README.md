# Clone runs 2026-11-13: the three Depth cards on the pin family

Branch `interact/capture-budget`. Every run is one Playwright run against `rabbit-hole-web-dev-interact` (owner-authorised, `scripts/run-depth.mjs` in the 2026-11-12 folder): a fresh canvas, the Chat Depth set, the prompt `/interactive At the highest point of a vertical throw, is acceleration zero because velocity is zero?`, Generate on the pinned plan, the job to its end, one ledger row (`docs/features/interact/benchmarks/ledger.md`), then a reload and screenshots at rest, At top and with the launch-speed slider moved.

Clone settings: `INTERACT_DESIGN_FIXTURE=toss` (brief -> toss-overview, balanced -> toss-standard, detailed -> toss-deep), `INTERACT_RUN=headless`, `INTERACT_REVIEW=shadow`, `INTERACT_SEEK=on`, `INTERACT_BUILD_PROFILE=opus-baseline` (google-low for runs 6 to 11), fallback on, `USAGE_PLATFORM_DAY_USD=20`, `EXPLAIN_DIAGNOSTICS=true`. The test account is `owner-interact-night@example.com` (a fresh 2,500-credit account). `owner-interact-preview` had 812 credits left, below the 842 a Generate press reserves (run 1, `runs/r1-brief-opus-baseline`: approve answered 429 allowance_limited, no job).

| run | depth | profile | result | repairs | generate to ready | learner cost | bench judge | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| r2-brief-opus-baseline | brief | opus-baseline | ready (accepted) | 1 | 52 s | $0.253 |  |  |
| r3-balanced-opus-baseline | balanced | opus-baseline | ready (accepted) | 2 | 133 s | $0.452 |  |  |
| r4-detailed-opus-baseline | detailed | opus-baseline | failed (rounds) | 3 |  | $0.628 |  | runtime_error on every state; the diagnostic was dropped from the problem text (fixed before run 5) |
| r5-detailed-opus-baseline | detailed | opus-baseline | ready (accepted) | 2 | 137 s | $0.463 | fail (2 major) |  |
| r6-brief-google-low | brief | google-low | failed (no_progress) | 3 |  | $0.031 |  | Gemini left manifest.timeline out (fixed before run 9) |
| r7-balanced-google-low | balanced | google-low | failed (no_progress) | 1 |  | $0.015 |  | same |
| r8-detailed-google-low | detailed | google-low | failed (no_progress) | 1 |  | $0.014 |  | same |
| r9-brief-google-low | brief | google-low | failed (no_progress) | 1 |  | $0.014 |  | Gemini wrote duplicate state labels; the repair changed nothing |
| r10-balanced-google-low | balanced | google-low | failed (rounds) | 3 |  | $0.032 |  | sdk.panel lane too narrow, readout label room; three repairs spent |
| r11-detailed-google-low | detailed | google-low | ready (accepted) | 2 | 22 s | $0.021 | fail (3 major) |  |
| r12-brief-opus-baseline | brief | opus-baseline | ready (accepted) | 1 | 73 s | $0.288 | pass (0 major) |  |
| r13-balanced-opus-baseline | balanced | opus-baseline | ready (accepted) | 1 | 95 s | $0.318 | fail (3 major) |  |
| r14-detailed-opus-baseline | detailed | opus-baseline | failed (budget) | 0 |  | $0.000 |  | platform daily guard (not a bug) |
| undefined | detailed | opus-baseline | failed (budget) | 0 |  | $0.000 |  | undefined |
| undefined | detailed | opus-baseline | ready (accepted) | 3 | 179 s | $0.682 | fail (2 major) | undefined |

Total learner and judge cost of the runs: about $3.38. The judge is claude-sonnet-5-5 and platform-paid; fail / pass is its blind score of the delivered card, not a gate.

## What the runs found and fixed

- Run 1: the test account's allowance was below one Generate reservation (842 credits). A fresh account is used for the runs and the morning launcher defaults to another fresh one.
- Run 2: the bench judge's whole judgement was refused because one finding was over 400 characters (the limit is now 1,200). The y-axis title sat on the top tick label (the title now rides 18 px above the axis end, FIGURE_BAND.titleRoom 28).
- Run 4: a program_error problem dropped the runtime diagnostic, so the repair could not read why the program failed. A state readout was refused for having no unit.
- Run 6: Gemini 3.5 Flash Lite left the approved timeline out of the manifest because the author tool left timeline an untyped object; it is typed for /interact now. With that, google-low reached ready once (run 11, Detailed, 22 s, about $0.02) and failed four times on other schema and layout details. No provider call failed, so no fallback fired.
- Run 14: the platform guard (the rolling 24-hour sum over the shared dev database, plus the new reservation, against USAGE_PLATFORM_DAY_USD) refused the call. Not a code bug; see the report's open decisions.

## Known visual defects of the cards (looked at, not fixed)

- A text label can sit on a ball or a line the rules do not measure (run 12: "Motion" over the ball).
- Balanced: the two lane boxes (sdk.panel) came out as empty rectangles at the top of the scene and a readout box ran past the frame edge (run 3). The layout rules do not yet measure boxes against the frame.
- The card shows the experiment box without the INT-06 badge, "Slow motion" label or a Reset inside the experiment box; Reset is the icon at the right of the controls row.

Screenshots are in each run folder (3-reopened-at-rest.png, 4-at-top.png, 5-slider-changed.png). The private job detail (stages, calls, findings verbatim) is job-<id>-final-full.json. The page-after.html captures are left out of git.
