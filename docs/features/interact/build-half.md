# /interact build half (state at 2026-11-13, owner brief 9)

Status: built on branch `interact/capture-budget`, **not merged to main**. Dev clone only. No Opus call anywhere in the work recorded here.

## What it is

The build half takes an approved plan and returns a ready card. Two ways to build the program:

- **Template build (no model call).** A plan that names `scene.template` (`one-body`, `two-lane`, `body-plot`) and its `scene.slots` is built by trusted code: `packages/web/src/interact-templates/generate.js`
  turns the plan's formulas (`quantities[].formula`, with `switchAt` and `formulaAfter` for a piecewise quantity) into the program source and manifest. The formulas are strings
  parsed by `packages/web/src/interact-formula.js` (our own parser, no eval) into the existing ScalarExpr. There is no repair loop: a problem in a template build is our bug and the job stops as `template_error`.
- **Model build.** Any other plan goes the old way: `build_author` writes the program, then repair rounds. Measured to be unreliable for the fast models (see numbers).

Path from an approved plan to a ready card (both ways, same after the program exists): validate -> headless run (sealed program in QuickJS over the plan's capture cases) -> oracle and layout rules ->
seal -> compose the card -> deliver -> shadow judge (after delivery, not part of the build time).

## Settings (all default to today's behaviour)

| Setting | Values | Default | What it does |
|---|---|---|---|
| `INTERACT_BUILD_KIND` | `template` | unset | A plan with a template and every slot resolved builds with no model call; anything else (or unset) takes the model build, with the reason logged. |
| `INTERACT_RUN` | `headless`, `browser` | `browser` | Capture seam. `headless` runs the programs in-process and has no pixels; it needs `INTERACT_REVIEW=shadow`. |
| `INTERACT_REVIEW` | `shadow`, gating | gating | `shadow` delivers on the checks and scores the card afterwards with one judge call (Sonnet 5.5, about US$0.02 to 0.03 per card). |
| `INTERACT_DESIGN_FIXTURE` | `toss`, `ledge` | unset | Dev-only pin: the design stages answer the canonical plan. `toss`: Depth brief/balanced/detailed give Overview/Standard/Deep. `ledge`: Brief gives the Moon ledge plan. |
| `INTERACT_BUILD_PROFILE` | `google-low`, `fireworks-low`, `scripted`, ... | registry default | Model profile of the build half (not called by a template build). `scripted` is dev-only and refused when `ENVIRONMENT=production`. |
| `INTERACT_FALLBACK` | `off` | unset | A role runs its own provider only; a fallback counts as a failure in a bench. |
| `INTERACT_DESCRIPTION_FIT` | `estimate` | unset | Card-description fit gate (see the prod gap below). |

Deploy the clone (the profile is a required argument; there is no default):

```
node docs/features/interact/evidence/2026-11-12-clone-runs/scripts/deploy-clone.mjs build dist-dev
cd packages/web && npm run build && cd ../..
node docs/features/interact/evidence/2026-11-12-clone-runs/scripts/deploy-clone.mjs deploy INTERACT_BUILD_KIND=template INTERACT_BUILD_PROFILE=google-low INTERACT_FALLBACK=off INTERACT_DESIGN_FIXTURE=toss
```

The other clone vars (`INTERACT_RUN=headless`, `INTERACT_REVIEW=shadow`, `INTERACT_DESCRIPTION_FIT=estimate`, `INTERACT_SCENE_PLAN_ENABLED=true`, `EXPLAIN_DIAGNOSTICS=true`, `INTERACT_SEEK=on`) are the script's defaults.
`packages/web/node_modules` must be a junction to `C:\s\explain-layout-web\node_modules` (a real empty directory breaks the deploy).

Put cards on a canvas and open it:

```
node scripts/interact/scripted-look.mjs                       # fresh account and canvas, Brief, Balanced, Detailed (toss pin)
LOOK_CANVAS=<canvas> LOOK_EMAIL=<its account> LOOK_DEPTHS=brief LOOK_CARD=Ledge node scripts/interact/scripted-look.mjs   # add a card (after redeploying with INTERACT_DESIGN_FIXTURE=ledge)
node scripts/interact/drive-look.mjs <out-dir>                # measure and drive each card: Play to the pause, Play again, Reset, screenshots
C:\s\spec\interact-real\open-template.cmd [--check]           # opens the canvas in look-canvas.json, signed in
```

## Measured numbers (ledger rows in `benchmarks/ledger.jsonl`, `.md`)

| Build | Rows | Ready | 0 repairs | Median total | Median cost | Notes |
|---|---|---|---|---|---|---|
| Template (this work) | 8 template rows (toss x3 and ledge, on two deploys) | all | all | about 2.05 s ledger (job admitted to ready); 3.7 to 4.9 s as the driver saw it | no build cost; shadow judge about US$0.02 to 0.03 | `buildKind=template`, 0 build-role model calls |
| Scripted programs (`profile=scripted`) | 6 rows (3 timing v1, 3 v2) | all | all | about 2.05 s | 0 | the hand-written D1 programs through the real path |
| Opus baseline (the night, timing v1) | 9 rows | 6 of 9 | 0 of 6 | 132.6 s | US$0.45 | the only Opus baseline; no Opus rerun |
| Google-low on the clone (the night) | 6 rows | 1 of 6 | 0 | 22.1 s | US$0.02 | timing v1 |
| Google-low on the clone, 2026-11-13 evening | 18 runs | 0 of 18 | 0 | none | about US$0.03 | `evidence/2026-11-13-google-low-bench/` |

Program-contract bench (`benchmarks/bench-author.md`, in-process, four models, three plans): **7 of 180 first-try attempts pass** with the fits in (validator v2); 0 of 60 on the baseline (validator v1).
Best: Sonnet 5.5 at Brief (6 of 20). One repair round by the same model adds little (Sonnet Brief 8 of 20; Flash Lite 0 of 60). No model writes the program one-shot.

Expressions bench (`bench-expressions.md`): the model returns scalar expressions only, handed the plan's `relation` strings. gpt-oss-120b and Sonnet 5.5 pass 10 of 10 at Balanced and Detailed; Gemini fails on malformed trees.

Formula bench (`bench-formulas.md`): the model writes the formula strings with no `relation` given. Sonnet 5.5 and Gemini 3.5 Flash Lite 40 of 40; Gemini 3.5 Flash 39 of 40; gpt-oss-120b passes Standard only (0 of 10 on the others: an id outside the grammar, a force sign, an ignored ledge).
Standard's three piecewise drop quantities passed 40 of 40.

## Card size

The templates draw a 640 px wide frame (text at the legibility floors, never scaled up), so a card is 676 px wide. Measured at 1440 x 900 with Chat open at 100% zoom (`evidence/2026-11-13-template/resized/`):

| Card | Before (892 px frames) | After (640 px frame) | Whole block visible at 1440 x 900 |
|---|---|---|---|
| Overview | 928 x 745 | 676 x 637 | yes (top 230, bottom 867) |
| Standard | 928 x 717 | 676 x 731 | yes, to the last pixel (top 169, bottom 900) |
| Deep | 928 x 757 | 676 x 792 | yes, 4 px to spare (top 104, bottom 896) |
| Moon ledge | 928 x 726 | 676 x 618 | yes (top 106, bottom 724) |

## Known limits

- The templates are a vertical-throw family. Words (lane headings, state words, callout letters, axis and plot words), the state readouts, the constants (frame size, pixels per metre, decimals) and the physics assumptions
  (velocity starts positive and crosses zero; the second lane is released at the first body's top; the plotted quantity is linear in time; the acceleration arrow has a constant length in `one-body`) are in the template code, not in the plan.
- A plan with no template has no fallback: it takes the model build, which is unreliable.
- Stage times inside the Worker are not measurable (the isolate clock does not advance during pure CPU): `msValidate`, `msRun`, `msCheck` and `msCompose` read 0, and about 2 s per build is alarm-hop wait (`msHopWait`).
- The judge is uncalibrated. On the template cards it returns `fail` with 1 to 4 majors; many findings are "cannot be judged without pixels" because the clone runs headless. Findings are saved in full per job (`benchmarks/judge/<jobId>.json`, `evidence/2026-11-13-template/judge/`), none fixed.
- sdk-8 is not frozen (it changed several times this week; the latest fingerprint is in `packages/web/src/explain-program/stamps.js`). Cards sealed under an older fingerprint stop loading after a redeploy.
- Card chrome is the reduced one: the Reset icon in a heading row above the scene, no transport strip or parameter grid. The full chrome is parked on branch `codexmatch-chrome`, unmerged.
- The expressions and formulas benches are measurements only: nothing in the build uses a model-written formula yet.

## Not merged to main

What a merge would change: the web bundle gains the QuickJS WASM (about +503 KB, as measured for the owner earlier; not re-measured here), and the control plane gains the template path. Every new setting defaults to today's behaviour,
so a merge with the settings unset changes nothing a user sees.
Prod gap, unchanged: `INTERACT_DESCRIPTION_FIT` is unset in the prod config, so `/interactive` fails at `design_verifying` in prod; set it, or switch the prod flag off, in the same release.

## Evidence and ledger

- `evidence/2026-11-12-clone-runs/`: the clone scripts (`deploy-clone.mjs`, `run-depth.mjs`, `verify-canvases.mjs`) and the first runs.
- `evidence/2026-11-13-clone-runs/`: the Opus and first google-low clone runs of the night (ledger rows r1 to r16).
- `evidence/2026-11-13-codex-match/`: the look, next to Codex's cards (static renders, no model).
- `evidence/2026-11-13-google-low-bench/`: the 18 google-low clone runs.
- `evidence/2026-11-13-template/`: the template cards: judge findings (`judge/`), the drives of the canvas (`look-drive*`, `resized/`), the launcher `open-template.cmd` opens the canvas they were taken from.
- `benchmarks/`: `ledger.jsonl` and `.md` (every job), `bench-author`, `bench-expressions`, `bench-formulas` (in-process benches), `judge/` (full judge findings of the jobs since brief 9).
