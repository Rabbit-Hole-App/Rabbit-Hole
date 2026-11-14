# Per-frame object budget: measurement (brief 22 task 2, 2026-11-14)

Question: how many objects may a card's frame hold before scrubbing it costs more than one 16 ms frame? The default is 60; Codex's densest states are merge sort 64/77/100, mitosis 67/107/158 and TCP 26/45/69 objects.

## Method

`scripts/interact/frame-budget-browser.mjs` (the owner authorised this one local browser measurement): a throwaway page served by the repo's Vite dev server, headless Chromium through Playwright. Each scrub step builds a synthetic frame of N toss-look objects (a third boxes, a third lines, a third texts, every object moving a little each step), takes it through the card's own path (`normalizeFrame` with the approved budget, then the shared `Frame` renderer in the interact look) and records normalize + validate, the React render and DOM commit (`flushSync`), a forced layout, and the wait for the next animation frame. **Frame time = normalize + render and commit + layout** over 60 scrub steps (five warm-up steps not counted); the wait for the next frame is reported beside it because vsync caps it.

`scripts/interact/measure-frame-budget.mjs` is the headless half: the pinned QuickJS engine runs a synthetic sdk-8 program returning N objects and the result goes through `parseGuestResult` with the budget (the path of the headless capture); ms per evaluate over 60 evaluations.

**Machine.** This dev machine (Windows 11, headless Chromium, NOT a phone) while other agents ran their own test suites and builds, so the timings are noisy and pessimistic. Every figure below is the median of the per-run means (11 runs at 100 and 130 objects, 8 at 30, 60 and 160, 3 at 115), with the min and max shown. A quiet-machine rerun should come out lower. Raw runs: `browser-run1..11.json` and `headless-run1..3.json` in this folder.

## Table

| Objects | SVG nodes | runs | frame ms, median of run means | min..max of run means | median p95 | normalize | render + commit | layout | to next frame | headless ms per capture (median of 3 run means) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 88 | 8 | 7.0 | 5.7..18.0 | 11.3 | 1.8 | 4.9 | 0.38 | 9.7 | 19.1 |
| 60 | 168 | 8 | 9.3 | 7.3..17.0 | 14.3 | 2.5 | 6.6 | 0.45 | 7.5 | 30.6 |
| 100 | 275 | 11 | 13.0 | 8.3..26.3 | 21.9 | 3.8 | 8.7 | 0.60 | 4.1 | 35.6 |
| 115 | 315 | 3 | 14.9 | 13.2..26.1 | 26.5 | 4.6 | 9.7 | 0.65 | 4.2 | |
| 130 | 355 | 11 | 15.8 | 11.3..33.9 | 26.1 | 5.0 | 10.0 | 0.70 | 3.4 | 25.1 |
| 160 | 435 | 8 | 16.5 | 9.5..35.4 | 29.0 | 5.5 | 10.2 | 0.80 | 3.5 | 31.6 |

## Decision

- Scrub frame time grows about 0.06 ms per object on top of a fixed 5 to 6 ms: 100 objects 13.0 ms, 115 objects 14.9 ms, 130 objects 15.8 ms (under 16), **160 objects 16.5 ms (over 16)**.
- By the rule of the brief (if 160 objects exceed 16 ms per frame in the browser, set the hard maximum at the largest tested count under 16 ms) the **hard maximum is 130** (`FRAME_OBJECTS_HARD_MAX` in `packages/web/src/explain-program/frame-budget.js`, one constant). The default stays 60.
- 130 is under the line by 0.2 ms on a loaded machine and a single step at the 95th percentile takes 26 ms there, so a loaded or slower device will drop frames at 130; 100 (13.0 ms) is the comfortable count.
- Consequence for the stepper references: merge sort (100) and TCP (69) fit; mitosis Balanced (107) fits; **mitosis Detailed (158) does not fit a 130 budget** and needs fewer objects, or an owner decision to raise the constant after a quiet-machine measurement.
- The headless column is dominated by the fixed cost of creating the engine runtime per evaluate and by machine load (19 to 36 ms at any count); the marginal cost is roughly 0.1 to 0.2 ms per object, so the headless capture is not the limit.

## Not changed by this task

- **The card's scene gate still stops a drawn frame at 60 objects.** `normalizeFrame` calls `validateScene` (`packages/web/src/animation-scene.js:320`, `if (onScreen > 60)`), and `animation-scene.js` is one of the `RENDERER_FILES` that `render-fingerprint.mjs` hashes into every committed static render's fingerprint (`render-freshness.test.mjs`), so editing it stales those fingerprints and fails `budget.test.mjs` ("every limit is the existing one, read from where it is enforced", which greps `if (onScreen > 60)`). I made the one-line change, saw both tests fail, and reverted it. The measurement above ran with that change in place; it is saved as `scene-gate.patch` (a `maxOnScreen` option on `validateScene` and `normalizeFrame` passing the manifest's budget). Until the owner decides to apply it and re-render the static renders, the contract, the plan, the sealed manifest and the headless run honour the declared budget but a card in the browser still refuses a frame of more than 60 objects.
- The SDK helpers that interpolate `CONTRACT_LIMITS.objects` into their guest source (`sdk-geometry`, `sdk-plot`, `sdk-field`, `sdk-evidence`: "geometry exceeds the Frame object limit", plot and field keep 5 spare) still cap their own output at 60. They are in the frozen SDK source and changing them would change the sdk-8 fingerprint. A program that needs more than 60 objects draws them directly.
- sdk-8 fingerprint before and after: `055af456c39a33723545f654b4901f901758101579b2a9fbc92ecc01aea6efe2` for both. `sdkFingerprint()` hashes `SDK_SOURCE`, which does not contain the budget, and `contract.js` is not part of it; `stamps.test.mjs` passes 7 of 7 before and after.
