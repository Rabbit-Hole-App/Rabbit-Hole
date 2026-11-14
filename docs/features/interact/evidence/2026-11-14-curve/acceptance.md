# curve-sliders acceptance (cv-p, on design/fast-path 834146e80 which contains design/family-curve 303762f73)

In-process, no network, no model call except the Flash Lite bench in the last section. Raw evidence of rows 3 to 6: `acceptance.json`, produced by `node scripts/interact/curve-acceptance.mjs`.

| # | Check | Command | Result | Evidence |
|---|---|---|---|---|
| 1 | Curve tests (Codex's) | `node --test test/interact-curve-pins.test.js test/interact-curve-templates.test.js test/interact-family-curve-check.test.js test/interact-family-curve.test.js` in `packages/control-plane` | 22 of 22 pass | the six-wrong-briefs test, the three zero-model builds and the real job path test are among them |
| 2 | Curve web test | `node --test src/interact-family-curve-sliders.test.mjs` in `packages/web` | 10 of 10 pass | |
| 3 | Round trip: `extractBrief` -> `expandBrief` of each pinned curve plan equals the plan | `node scripts/interact/curve-acceptance.mjs` | pass at all three depths: `curve-logistic-brief`, `-balanced`, `-detailed` have equal `planHash` | `acceptance.json` `roundTrip` |
| 4 | The three curve plans build through the template path with zero model calls | same script, `buildTemplate` with no adapters and a counting `fetch` | built at all three depths, templates `curve-one`, `curve-compare`, `curve-readouts`, 0 fetches during the build and 0 in total | `acceptance.json` `zeroModelBuild` and `oracle[].fetchesTotal` |
| 5 | Codex's oracle (`interactOracle(plan)` -> `curveLogisticOracle`) passes on all three | same script, headless capture + `checkSceneAgainstPlan` | 0 problems, oracle rows checked: brief 36, balanced 54, detailed 78, none skipped | `acceptance.json` `oracle` |
| 6 | Six wrong briefs each fail on the right line | same script, `curveSliders.referenceCheck(brief, 'detailed')` | 6 of 6: each stays a valid flat brief and its first failure has the intended code and path (table below) | `acceptance.json` `wrongBriefs` |
| 7 | Toss unchanged: full control-plane suite | `node --test` in `packages/control-plane` | 4688 tests, 4683 pass, 4 fail, 1 skipped under load (the bench ran at the same time); the 4 (`explain-m3` and three curve tests) pass alone: 41 of 41 | see "Flakes" |
| 8 | Toss unchanged: full web suite | `node --test "src/**/*.test.mjs"` in `packages/web` | 6902 tests, 6874 pass, 0 fail, 27 skipped (idle machine) | |
| 9 | Bench harness tests | `node --test test/interact-bench-design-mvp.test.js` | 7 of 7 pass, including the new `--family curve-sliders` proof ($0) | |

## The six wrong briefs (row 6)

The line is the first problem the fill correction would show (`formulaProblems(referenceCheck(...))[0]`).

| Brief | Intended | Actual first failure | Right |
|---|---|---|---|
| slope-sign | `curve_derivative` at `formulas.slope.formula` | `curve_derivative`, `formulas.slope.formula`: `formula slope at {"k":1,"x0":0,"xMarker":1,"x":-5.8125}: got -0.00297..., expected 0.00297...` | yes |
| slope-scale | `curve_derivative` at `formulas.slope.formula` | same code and path: `got 0.00594..., expected 0.00297...` | yes |
| output-bounds | `curve_bounds` at `formulas.y.formula` | `curve_bounds`, `formulas.y.formula`: `formula y at {...}: got 1.1256..., expected 0,1` | yes |
| steepness-direction | `curve_effect` at `formulas.slope.formula` | `curve_effect`, `formulas.slope.formula`: `... "at":"x0","parameter":"k"}: got 0.5,0.25,...` | yes |
| midpoint-direction | `curve_effect` at `formulas.y.formula` | `curve_effect`, `formulas.y.formula`: `... "parameter":"x0"}: got 0.0026...` | yes |
| marker-offset | `curve_marker` at `formulas.yAtMarker.formula` | `curve_marker`, `formulas.yAtMarker.formula`: `got 0.8807..., expected 0.7310...` | yes |

Contract-side note (not a failure): `formulaProblems` in `interact-design-fill.js` prints `formula <role> at <point>: got ..., expected ...` and drops the failure's `code` (`curve_derivative`, `curve_effect` and so on). For the two `curve_effect` lines the "got" is a list of about a dozen numbers, so the correction line is long and does not say "this parameter should increase the quantity". Proposed (Codex's family or the shared formatter): put `f.code` and, for effects, the direction in the line. Not changed here.

## Flakes

The full control-plane suite ran while the first bench run was using the CPU. Four tests failed (`explain-m3` accepted-artifact test, the curve zero-model build at Brief, and two curve ownership-rule tests at Balanced and Detailed). They pass when rerun alone (`explain-m3`, `interact-curve-pins`, `interact-curve-templates`: 41 of 41). The same load also made the first bench run fail 5 of 30 rows with `runtime_limit: time limit` (4) and `quantity_missing` (1) on correct logistic formulas (see `benchmarks/bench-design-mvp-curve-run1-under-load.*`). On an idle machine the bench passed 30 of 30. The headless run's time limit is a wall-clock budget; under load a correct plan can be refused. That is a robustness risk for the job on a busy Worker, not a defect in the curve family.

## Fill bench (`--family curve-sliders`)

`node scripts/interact/bench-design-mvp.mjs --family curve-sliders --model gemini-3.5-flash-lite --depth all --n 10 --concurrency 2 --cap-usd 2`, request "Why does a sigmoid squash any number into 0 to 1?", first try, no correction. Rows `benchmarks/bench-design-mvp-curve.jsonl`, table `benchmarks/bench-design-mvp-curve.md`. The pass rule has no range-match step (the job has none); it is schema, expand, plan checks, description fit, `referenceCheck`, the template build, the headless run with layout rules, and the family oracle.

| Depth | Idle run | Run under load |
|---|---|---|
| Brief | 10 of 10 | 8 of 10 (2 `runtime_limit`) |
| Balanced | 10 of 10 | 9 of 10 (1 `schema_mismatch: $.words.legend_curve: longer than 12`) |
| Detailed | 10 of 10 | 7 of 10 (2 `runtime_limit`, 1 `quantity_missing`) |

Median fill 2.1, 2.3 and 2.6 s; median cost US$0.0019, 0.0023 and 0.0025; total spend US$0.068 per run (two runs, about US$0.136).
