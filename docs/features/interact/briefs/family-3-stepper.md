# Brief: third scene family, `stepper-states` (stepper through states)

Prepared overnight 2026-11-14 for Codex, from the coverage measurement (brief 15). Not built: this file is the work order. Base branch `design/fast-path` (the coverage bench is in it). Keep the cadence of the curve brief: one branch off `design/fast-path`, push after every numbered deliverable, each push followed by a short paragraph (what changed, what passed, what is open).

## Why this family

`docs/features/interact/benchmarks/bench-coverage.md` classified every unique prompt of `scripts/explain-bench/sets/*.json` (155 prompts) with JEV (3 repeats) and Sonnet 5.5 (once):

| Mechanism | JEV | Sonnet | Both |
|---|---|---|---|
| stepper through states | 34.8% | 34.2% | 44 prompts |
| curve with sliders (family 2) | 9% | 7.7% | 9 |
| scene over time (the vertical throw is one) | 2.6% | 3.9% | 4 |
| none | 18.1% | 16.8% | 17 |

Stepper is the largest bucket by far and no family covers it. The 44 prompts both classifiers agree on are the reference set below.

## Objective

A `stepper-states` family for the sealed template build: a fast model fills a flat brief (states as a list, no code), code expands it into a ScenePlan, a trusted template draws a fixed picture and highlights its active parts state by state, and the card is built with zero model calls. It goes through the same pick, fill, check, build and judge path as the toss and the curve, with no change to either.

## Read list (exact paths on `design/fast-path`)

Contract and family code
- `packages/control-plane/src/interact-families.js` (the registry; the comment block at its top is the export list a family provides)
- `packages/web/src/interact-family-vertical-throw.js` (the reference module: `FAMILY`, `INPUTS`, `ROLES`, `LIMITS`, `scalars`, `formulaGrammar`, `formulaRules(depth)`, `referenceCheck`, `context`, `templates`, `expandBrief`, `extractBrief`, `familyDescription`)
- `packages/web/src/interact-family-curve-sliders.js`, `interact-curve-briefs.js`, `interact-curve-data.js` (Codex's own family on `design/family-curve`: the pattern for a still scene with `independent`)
- `packages/web/src/interact-plan-brief.js` (`briefSchema(depth, family)`, `expandBrief`, `extractBrief`, `referenceFormulaCheck`)
- `packages/control-plane/src/interact-design-fill.js` (`fillSystem(depth, info, family)`: the names sentence is derived from the family; the limits block; `family.formulaGrammar`, `family.formulaRules(depth)`)
- `packages/control-plane/src/interact-design.js` (`fastDesign`, `fillProblems`: the checks every brief passes), `interact-design-pick.js` (`pickFamily`, `defaultThreshold`), `interact-template.js` (`templatePrecheck`)

Plan, build, card
- `packages/web/src/interact-plan.js` (ScenePlan schema, `planProblems`, `PLAN_LIMITS`, the control types `index`, `select`, `action`, `number`, `reset`; `scene.template`, `scene.slots`, `scene.words`; `mode.kind` `static` with `timeline: null`)
- `packages/web/src/interact-control-catalogue.js` (the native controls: `program.index_slider` "Step through ordered items with a slider and Previous/Next" needs the `inputs_v2` capability; `program.select` needs `select_inputs`; `program.action` needs `stateful`)
- `packages/web/src/interact-templates/generate.js`, `shared.js`, `one-body.js`, `two-lane.js`, `body-plot.js` (how a template turns a plan into program source and manifest; `generateProgram(plan, buildInput, registry)`; `FAMILIES`)
- `packages/web/src/interact-formula.js` (`TEMPLATE_WORDS`, `nestWords`: where a template's words are declared)
- `packages/web/src/interact-composition.js`, `interact-card-layout.js` (card composition; the readouts row and the one-place-per-number rule, `CALLOUT_SLOTS`)
- `packages/web/src/explain-program/sdk.js` (what the sealed program can draw: `box`, `circle`, `text`, `line`, `arrow`), `sdk-cyclic.js`, `sdk-figures.js` (`sdk.panel`), `sdk-geometry.js`, `stamps.js`. sdk-8 is frozen: no SDK change.
- `packages/control-plane/src/interact-oracle.js`, `interact-build.js`, `interact-checks.js` (what the build verifies; the oracle the template must satisfy)

Picture primitives (the `/explain` flow)
- `packages/web/src/tutor-diagrams/primitives.js`: exports `PALETTE`, `PATH`, `SURFACE`, `INK`, `MUTED`, `lineHeight`, `textWidth`, `wrap`, `label`, `box`, `diamond`, `dot`, `connector` (box and arrow geometry, text measuring with the glyph tables)
- `packages/web/src/tutor-diagrams/layouts.js`: the `layouts` map with `flow` (`layoutFlow`), `sequence` (actors, lifelines, messages) and `cycle` (ordered steps with a return connector), each a deterministic function of a spec and a width
- `packages/web/src/tutor-diagrams/README.md` (the kinds `flow`, `sequence`, `cycle` and their authored inputs), `flow.js`, `flow-paths.js`
- Design intent: the template runs these layout functions at BUILD time (trusted code, no model) to get box and connector positions, and emits them as literals into the program source, drawn with the existing `sdk.box`, `sdk.text`, `sdk.arrow`, `sdk.line`. Verify first that `layouts.js` and `primitives.js` import nothing that cannot run in the Worker (React, KaTeX); if they do, copy the pure geometry. Do not change the SDK.

Docs
- `docs/features/interact.md` (the spec), `docs/features/interact/build-half.md` (build half, settings), `docs/features/interact/references/tutor-scene-examples.md` (how a scene, mode and controls are specified; the Static mode row; the Reset and parameters-row conventions) and the three approved HTML references `overview-toss-and-drop.html`, `standard-toss-and-drop.html`, `deep-toss-and-drop.html` in `docs/features/interact/references/`
- `docs/features/interact/benchmarks/bench-coverage.md` and `bench-coverage.jsonl` (the reference set), `bench-pick.md` (the pick), `bench-design-mvp.md`
- `UI.md` and `CLAUDE.md` on main (reuse existing UI; no ellipsis in UI labels)

## The family shape

- **A fixed picture with 3 to 8 states.** The picture (the parts and their connectors) does not change between states. Each state has a `label` (the step name), one `sentence` (what happens, naming its active parts) and the `active` parts (highlighted; the rest are muted).
- **Controls.** One `index` control, `program.index_slider`, gives Previous / Next and the step scrubber over the state labels. At most one parameter that changes the states' content: a `select` (two or three named options, for example "Packet lost: No / Yes") or a bounded number. Reset restores step 0 and the default option. No playback, no timeline: `mode.kind` is `static` and `timeline` is `null` (the contract fc-e added allows a plan with no timeline when the family declares `independent`).
- **Picture kinds.** `flow` (algorithm and process: boxes and arrows), `sequence` (protocol between parties: actors, lifelines, messages) and `cycle` (phases that return). Three templates: `stepper-flow`, `stepper-sequence`, `stepper-cycle`. The brief names `picture: 'flow' | 'sequence' | 'cycle'` and the expansion picks the template.
- **Depth.** Brief: 3 or 4 states, no parameter, labels and sentences only. Balanced: 4 to 6 states and one parameter whose option changes at least one state. Detailed: 6 to 8 states, one parameter, a second sentence per state ("why this step follows") and a trace strip listing the completed steps. These are starting values; set them where the layout fits (the card is a 640 px frame, text at the legibility floors, never scaled up; the description fits 2 to 4 lines).
- **Pick criterion** (what the scene SHOWS, not the subject): "A process shown as a sequence of discrete states or steps that the learner advances one at a time (an algorithm, a protocol, a cycle of phases)." Register it as `pickCriterion` in `interact-families.js`. With three families registered the pick threshold default is 0.9 (`defaultThreshold`).

## The brief schema a fast model fills (flat, no code, no formulas)

```json
{
  "title": "string",
  "story": "string",
  "cardDescription": "string",
  "instructions": "string",
  "picture": "flow | sequence | cycle",
  "parts": [ { "id": "a", "label": "string" } ],
  "links": [ { "from": "a", "to": "b" } ],
  "states": [ { "label": "string", "sentence": "string", "active": ["a"] } ],
  "parameter": { "label": "string", "options": ["string", "string"], "default": 0,
                 "variants": [ { "state": 2, "sentence": "string", "active": ["b"] } ] },
  "words": { "key": "string" }
}
```

`parameter` is absent at Brief. `variants` give the changed content of the affected states for the options other than the default. Texts are plain (`$...$` only where the plan allows maths). Part ids are short ids; the template, not the model, positions everything.

## How each contract member is satisfied

| Contract member | Stepper |
|---|---|
| `id`, `FAMILY` | `stepper-states`; `depths[depth] = { template, roles, inputs }` with the state-count rule above. The template depends on the brief's `picture`, not on the depth: a contract gap (deliverable 1). Proposed fix: `FAMILY.depths[depth].template` may be a function `(brief) -> templateName`, with `templates` listing all three. |
| `INPUTS`, `ROLES` | Inputs: `step` (the independent variable, an `index` control) and, at Balanced and Detailed, `option` (the parameter). Roles: one quantity `stepNumber` (formula `step + 1`) for the "Step n of N" readout. No physics formulas. |
| `LIMITS`, `scalars` | State count 3 to 8, parts 3 to 10, label at most 32 characters, sentence at most 140 characters; `scalars` empty. |
| `referenceCheck(brief, depth)` | Checks the invariants below instead of formulas. Contract gap: the fill maps the result with `formulaProblems` (role, point, got, expected); the stepper returns its problems in that shape, or the contract gains a generic problem-line shape. Settle in deliverable 1. |
| `expandBrief`, `extractBrief` | Brief to ScenePlan and back (the round trip must be exact). Words (labels, sentences, part names) go in `scene.words`; the active sets as id-valued `scene.slots` records; the step as an `index` control with `items` equal to the state labels. |
| `familyDescription(depth)` | What the scene shows at that depth, what the model may and may not write, the state-count range. |
| `formulaGrammar`, `formulaRules(depth)` | Grammar: "There are no formulas: the states are a flat list." Rules: the wording and count rules and the invariants as sentences. The fill's derived names sentence reads `independent.id`. |
| `templates`, `context` | The three template names; `context(plan)` returns the picture geometry from the `layouts` functions (positions of parts and connectors, the box of the trace strip). |
| `independent` | `{ id: 'step', domain: [0, stateCount - 1] }` (integer steps); the plan has no timeline. |

## Invariants (the fill checks and the oracle)

1. State count within the depth's limits (3 to 8 overall).
2. Every `active` id names a drawn part; every link names two drawn parts; part ids and state labels are unique.
3. Each state's sentence mentions its active part (the label of at least one active part appears in the sentence, ignoring case).
4. The parameter changes at least one state: some `variants[i]` differs from state `i` (sentence or active set), and a variant's state index is valid.
5. Step 0 is the first state and Reset returns to it; Previous at step 0 and Next at the last step are disabled, not hidden, and keep their names (no ellipsis in any label).
6. The build's oracle: every state draws its active parts highlighted and the others muted, the readouts match the state, and each state fits the frame (layout rules).

## Reference set: the 44 prompts both classifiers put in `stepper-states`

Grouped by source set under `scripts/explain-bench/sets/`. The family must be able to fill these; use them for the fill bench (deliverable 5) and the pick check.

**aiml** (7)

- what is gradient descent?
- how does tokenization work?
- how does RAG work?
- how does RLHF work?
- how does a diffusion model generate an image?
- how does KV caching speed up inference?
- how does a robot arm pick up an object?

**baseline** (12)

- how does the human heart pump blood?
- how does the water cycle work?
- how does photosynthesis work?
- how does the TCP handshake work?
- what happens during mitosis?
- how does a bill become a law in the United States?
- how does a hash table work?
- how does merge sort work?
- explain the OSI model of networking
- explain recursion
- how does a four-stroke car engine work?
- how does a volcano erupt?

**content** (1)

- how do the generator and discriminator in a GAN work together?

**demo-lesson04** (4)

- how does a decision tree split a two-feature dataset into regions?
- how do I compute the Gini impurity on both sides of a split and the information gain?
- how does a decision tree search for the best threshold on one feature?
- how does a random forest combine the predictions of its trees into one answer?

**illustrations** (4)

- What happens inside one Llama-style decoder block?
- how does cross-validation detect overfitting?
- How does a transformer turn the words in a sentence into embeddings?
- How does a transformer turn scores into a guess for the next word?

**phase02-batch** (4)

- What happens to the training weights after AdaBoost gets one example wrong?
- Where do the out-of-fold predictions for the stacking model come from?
- How does Bayesian optimization decide which setting to try next?
- How does successive halving decide which trials get more training?

**phase02-batch2c** (1)

- Why does recursive feature elimination refit after each drop?

**review-batch-01** (10)

- how does public-key encryption work?
- how does k-means clustering work?
- how does the k-means algorithm group points into clusters?
- what happens to the centroids in k-means each iteration?
- explain k-means clustering with an example
- how does a bill become law in the United States?
- how does the call stack work during recursion?
- what happens on the stack when a function calls itself?
- how are stack frames pushed and popped in recursion?
- explain the call stack and the base case in a recursive factorial

**smoke** (1)

- Explain post entries to cash

(Total 44. Source: `bench-coverage.jsonl`, rows where `jevTop` and `sonnetChoice` are both `stepper-states`.)

## The nine reference cards (HTML, owner-approved look)

One card per depth for each of three prompts, hand-built first as HTML in `docs/features/interact/references/` in the style of the three toss references, then pinned as plans (the way the toss and Moon ledge plans are pinned in `packages/web/src/interact-plan-fixtures.js`):

1. "how does merge sort work?" (algorithm: `flow` or `cycle` of split and merge steps; the parameter is the array size or a pre-sorted option)
2. "how does the TCP handshake work?" (protocol between parties: `sequence` with two actors; the parameter is "packet lost: No / Yes")
3. "what happens during mitosis?" (cycle of phases: `cycle`; no parameter, or one on which phases are shown)

That is nine cards (three prompts at Brief, Balanced and Detailed). All three prompts are in the reference set above.

## Deliverables (numbered as the curve brief; push after each, one paragraph each)

1. **Review gate.** Read the list above and write the contract gaps the stepper needs in `docs/features/interact/references/tutor-scene-examples.md` under a heading `stepper-states: deliverable 1 review gate`. Expected gaps: a template chosen by a brief field, not by depth; `referenceCheck` returning invariant problems instead of formula failures; a family whose `inputs` are an `index` control and a `select` (check `briefSchema`'s input kinds); string-valued scene data (`scene.words` keys per state, id-valued `scene.slots`) and the key limits they hit; the `inputs_v2` and `select_inputs` capabilities the clone must have on. List which are contract-side (fixed on `design/fast-path`, small) and which are yours.
2. **Contract fixes.** The contract-side items from 1, smallest change, with the toss and curve byte-identical (the snapshot tests stay green). Do not touch the toss or curve modules except through the contract.
3. **The module.** `packages/web/src/interact-family-stepper-states.js` built against the contract list, registered in `INTERACT_FAMILIES` with its `pickCriterion`; `expandBrief` / `extractBrief` round trip on the nine pinned plans; `referenceCheck` for the invariants; `familyDescription`, `formulaGrammar`, `formulaRules(depth)` (including the "step over its domain" sentence). Tests for the invariants, the round trip and the schema.
4. **The templates and the nine plans.** `stepper-flow`, `stepper-sequence`, `stepper-cycle` in `packages/web/src/interact-templates/`, drawing from the `tutor-diagrams` layouts through the existing sdk shapes; words in `scene.words`; the nine HTML references and the nine pinned plans; the zero-model build, headless run and oracle pass for all nine; the `generateProgram` registry seam for tests.
5. **Fill bench.** The `--family stepper-states` switch on `scripts/interact/bench-design-mvp.mjs` (the toss and curve numbers unchanged); Flash Lite `gemini-3.5-flash-lite`, n=10 per depth from "how does the TCP handshake work?" and from two more reference prompts. Report first-try, after-correction and fallback per depth, and every first problem line. The target is the one the toss reached: 30 of 30 first try or after one correction.
6. **Clone acceptance.** Deploy the clone with the three-family pick (threshold 0.9) and run the three reference prompts at Balanced plus two toss and two curve prompts (the pick must not take a toss, curve or `none` prompt for the stepper, nor a stepper prompt for another family). Measure the card fit at 1440 x 900 with Chat open. Run the shadow judge with the readable inputs. Launcher `open-stepper.cmd` (reads its canvas file, `--check` passes). Report prompt to card seconds, cost and the judge's majors.

## Acceptance (the same as the curve brief)

- The toss and curve are unchanged: their schema, fill text and generated programs match the snapshots; round-trip and frame-equality tests pass unchanged.
- Round trip: the nine pinned plans extract, parse, check and expand back to an identical plan and draw identical frames.
- Zero-model build: `INTERACT_BUILD_KIND=template` builds all nine with no model call; the headless run, the oracle and the layout rules pass.
- Pick: the 44 reference prompts are picked as `stepper-states` at the threshold; no prompt of the toss or curve reference sets is; the near-miss and `none` sets stay gaps. Report wrong and missed fits at 0.7, 0.8 and 0.9 from `scripts/interact/bench-pick.mjs`.
- Fill: the bench numbers of deliverable 5.
- Fit: every card whole in view at 1440 x 900 with Chat open at 100% zoom; the description fits 2 to 4 lines at the three measured widths.
- Judge: findings saved, no gating; report the majors verbatim.

## Rules

- No SDK change (sdk-8 is frozen; any addition is sdk-9 and out of scope). No new SDK helper: draw with the existing shapes from the layout geometry.
- No Opus anywhere in this brief (the design fallback inside the job is the existing one; do not trigger it on purpose). JEV, Flash Lite and the Sonnet judge only; spend cap US$3.
- Reuse existing UI: the IndexSlider (Previous / Next and scrubber), the choice buttons, the Reset icon, the card chrome of the toss cards. No new component, no separate demo page, no ellipsis in any UI label, and a disabled item keeps its name, greyed (`UI.md`).
- Smallest change. Do not edit the toss module, the toss templates, the curve module or `interact-design-fill.js` except through the contract (and then only as a contract fix on `design/fast-path`, deliverable 2). Never rebase or force-push a shared branch; merge `design/fast-path` into your branch when it moves, as a merge commit.
- Commit messages are one plain line with no `Co-Authored-By` or Claude attribution; push only to `rabbit-hole`.
- Ownership: the contract files (`interact-families.js`, `interact-plan-brief.js`, `interact-design-fill.js`, `interact-templates/generate.js`) belong to `design/fast-path`; the family module, templates, tests and references are yours.

## Note on provenance

The text of the curve brief is not in the repository; this brief reconstructs its structure (read list, six deliverables, acceptance, rules) from the owner's messages of 2026-11-14 (00:50 family contract, 01:45 deliverable 3, overnight section 5) and from the contract files. If the curve brief's deliverable numbering differs, renumber; the content of each deliverable stands.
