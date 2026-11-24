# Task 4 design note: the shared diagram template (explanation-diagram-template)

Written by the lead on 2026-11-24 for the reviewer. No code, no provider call. Facts come from a read-only lane over the tree at 201865bdf (feat/same-json 953a9ea55 with main b29b6bdd7 merged); the lead re-read spec.js:44-56 and 404-416, calculation.js:160-175 and explanation-fast-chain.js:102 itself. The lane did not run the repo's suites. Per the order, this stops here for the reviewer.

## 1. The spec's task 4, verbatim (SPEC.md v0.28, lines 237 to 309)

> ## Task 4 (owner, 2026-11-19): the shared diagram template
>
> Name: `explanation-diagram-template`. One template that every diagram kind and every example fits. It is today's diagram JSON with one shared block added, not a second format.
>
> Basis: the inventory of what exists (`claude/explanation-diagram-inventory.md` and `.csv`): 25 kinds, 1,343 stored diagram JSONs, 545 fields. Only `kind`, `title` and `caption` are in all 25 kinds.
>
> ### The template
>
> ```json
> {
>   "version": 1,
>   "diagram": {
>     "kind": "…",
>     "title": "…",
>     "caption": "…",
>     "variables": [ … ],
>
>     "…": "the kind's own drawing fields"
>   }
> }
> ```
>
> | Part | Fields | Status |
> |---|---|---|
> | Shared, in every kind | `kind`, `title`, `caption` | Exists today |
> | Shared, in every kind | `variables` | New, optional |
> | Per kind | bars, nodes and edges, boxes, cells and so on | Unchanged |
>
> ### The `variables` block
>
> One entry per number that matters, with the same shape in every kind.
>
> | Field | What it says | Values |
> |---|---|---|
> | `name` | What the number is called | text |
> | `role` | Who sets it | `input` or `result` |
> | `type` | The kind of number | `int` or `float` |
> | `min`, `max` | Its limits | numbers |
> | `at` | Where it is drawn | a place in the kind's drawing fields, such as `series[0].values` |
> | `value` | Its value when it is not drawn | a number |
>
> Each entry has either `at` or `value`, never both.
>
> ### Example: the top-k reference
>
> The title, caption, categories and the two series stay as they are today. Added:
>
> ```json
> "variables": [
>   { "name": "full", "role": "input", "type": "float",
>     "min": 1, "max": 90, "at": "series[0].values" },
>   { "name": "k", "role": "input", "type": "int",
>     "min": 1, "max": 4, "value": 2 },
>   { "name": "renormalized", "role": "result", "type": "float",
>     "min": 0, "max": 100, "at": "series[1].values" },
>   { "name": "keptShare", "role": "result", "type": "float",
>     "min": 1, "max": 100, "value": 70 }
> ]
> ```
>
> ### Rules
>
> - The numbers stay where the renderer reads them. `variables` names, types and limits them; it does not move them.
> - The block is optional. A diagram without numbers leaves it out.
> - It is defined once, beside `title` and `caption`, so every kind accepts it.
> - `unit` is not part of the block. It stays where each kind has it today.
> - The version stays 1: no existing JSON becomes invalid.
>
> ### Order of work (owner)
>
> 1. Write the template.
> 2. Prove it works for all: the 1,343 existing diagram JSONs pass it with no JSON edited, and every picture is drawn as before.
> 3. Only after that, add the numbers to the references.

## 2. What exists today

- **The shared block is already built on feat/same-json.** `spec.js:46-56` defines `variable` and puts `variables: z.array(variable).min(1).max(8).optional()` into `titled` (beside `title` and `caption`); every kind spreads `titled`, including the ml-* kinds, tensor, token-links and block-stack. Main (b29b6bdd7) has no `variables` and no `calculation.js`.
- **The model does not see it by default.** `stripVariables` (`spec.js:406-415`) deletes it from every kind branch of the JSON schema; `bundledAuthorSchema` (`explanation-references.js:337-347`) puts it back, required, only for the kinds of a selected reference that has a function (today bar-chart for top-k and softmax, coordinate-plot for the mean baseline). `learn-primitives.js:76` (`stripUnknown`) keeps `variables` on any kind.
- **The code's entries differ from the spec's table in three ways:** `at` is a dot path (`series.0.values`, `series.0.points.*.y`), not `series[0].values`; `value` is a number or a list of up to 12; at most 8 entries, names of at most 24 letters or digits.
- **The code's "template" is not the spec's "shared template".** `calculation.js:170` (`declareSpec`) builds `template` = the reference's stored diagram with the `variables` list added, results written and `{{v:name}}` placeholders kept; Gemini is shown it with the numbers masked to "?" (`explanation-references.js:199-200`). It sits on the reference and on depth entries (top-k: reference plus overview, standard, deep; softmax and mean baseline: reference only); confusion-matrix-counts and the token-links reference declare `{none:true}` and have none. The names collide.
- **Placeholders:** `{{v:name}}` (`calculation.js:103`) may name any input or result of the reference's function contract (also undrawn ones such as `k`), `.N` indexes a list; a token left behind is refused (`explanation-tokens.js:68-69`). The `explanation-tokens.js:1-3` the spec cites is the older `{{d:path}}` mechanism.
- **The spec's 1,343 reproduces:** 1,317 reference slots (492 `spec`, 25 `detailSpec`, 699 + 101 under `depths`) + 25 gallery + 75 gallery-depth + 43 single variants = 1,460 slots, **1,343 distinct JSONs** (same on main ab40f5dc9 and b29b6bdd7; the 22 `examples.json` entries and the 6 templates are not counted). `svg-snapshots.json` draws only **1,095** of them; 248 are never drawn in a snapshot (138 depth specs, 31 depth detail specs, 44 gallery-depth specs, 35 singles), including top-k's overview and deep.

## 3. What "shared" means

Defined once in `titled`, accepted by every kind in the parser, optional, version 1, and absent from every model schema except where a reference has a function. That is the state of feat/same-json now, so the spec's step 1 (write the template) is built. What is open is step 2 (the proof, below) and step 3 (numbers into references: M5).

## 4. Which files change

- **For the proof:** one new test only, for example `packages/web/src/tutor-diagrams/stored-diagrams-variables.test.mjs`, built on the lane's script `variables-experiment.mjs`. No production file.
- **Only if `variables` must reach the model schema of non-function kinds** (not proposed): `spec.js:406-415`, `explanation-references.js:263,275,337-347`, `learn-primitives.js:76`, and the tests `variables-spec.test.mjs:40-53`, `control-plane/test/explanation-calculation-context.test.js:165-223`, `explanation-gemini-plan-bundles.test.js`, `explanation-gemini-illustration-bundles.test.js`.

## 5. How it is proven without a provider call

The lane ran it once, not as a committed test: all 1,343 distinct stored JSONs, at widths 320, 408 and 720, with one `variables` entry added to the 1,338 that have none (and removed from the 5 that carry one): all parse, all 25 kinds, **the SVG strings are byte-identical in every case**. To make it a proof it is committed as a test. "Drawn as before" then means that with/without test over all 1,343 (question F below), because `svg-snapshots.test.mjs` covers 1,095 only.

## 6. Does it change any request?

- **The shared block alone: no.** Because of `stripVariables`, the 487 references with no function are byte-identical in schema, body, Gemini and Fireworks hashes (hash guard over all 492, branch against main).
- **What does differ is the function work, not the block:** on feat/same-json five references differ from main (top-k, softmax, mean baseline: schema, body, both providers, properties 308 to 316; confusion-matrix and token-links: body only: the examples heading, the number rule, the masked example). After M1 parks top-k: four.
- **Limit:** the Gemini answer schema may hold 362 properties (`explanation-fast-chain.js:102`; refused at 368). The maximum today is 350 on branch and main (five references). If every kind's schema carried `variables` (+8 per kind branch), the maximum would be about 494 and 295 of 492 bundles would pass 362 (estimate). A function on a 350-property reference (for example ml-transformer-vocabulary-softmax) gives 358; two function kinds in one request exceed 362.

## 7. Questions for the reviewer and owner (the lead's recommendation after each; nothing is decided here)

- A. Must `variables` also reach the model schema of non-function kinds? Recommendation: no (breaks the 362 limit in most bundles; the spec's "every kind accepts it" already holds in the parser).
- B. Path syntax: spec `series[0].values`, code `series.0.values`. Recommendation: the spec text follows the code (one syntax already used by 4 references).
- C. `value`: spec says a number, code also a list of up to 12 (an undrawn input list such as `weights`). Recommendation: keep the list, amend the spec.
- D. The spec's top-k example (inputs `full`, `k`) differs from the code's (input `weights`, `k`; results `full`, `renormalized`, `keptShare`). Moot while top-k is parked.
- E. Does "1,343" count the 6 templates and the 22 `examples.json` entries (1,355 with them)? Recommendation: no, as the spec counted.
- F. "Drawn as before": a new with/without test over all 1,343 (recommended), or extend `svg-snapshots.json` to the 248 undrawn.
- G. Rename the code's `template` (for example to `maskedSpec`) so it stops colliding with `explanation-diagram-template`? Recommendation: yes, in the proof commit.
- H. Headroom of 12 properties limits which references can get a function in M5.

## Not checked

Other server correctors that rebuild diagram objects (`learn-primitives.js:1076`) might drop `variables`; they touch only flow, tree and relationship kinds, which no declared reference uses. 28 distinct stored JSONs differ between branch and main: 5 are the declared references; the other 23 were inferred to be main's drift between ab40f5dc9 and b29b6bdd7, not checked one by one. The repo's suites were not run for this note. Lane scripts and outputs: C:/s/sj-list/design/ (not committed).
