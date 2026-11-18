# Brief for Codex: heatmap shape and a causal-mask grid (HEAT-1)

Repo: C:/s/var-1, branch feat/var-1, HEAD eedbda36a. Read only; paths below are under packages/ unless stated. Evidence: C:/s/film-evidence/docs/features/explain/checks/gem-s2/raw-attempt0/ (README.md, census.txt, idx1/idx2 attempt0/1 json).

## 1. Problem and evidence
- Prompt "How does the transformer decoder avoid looking ahead at later words?", 12 Gemini runs (batch arm): 9 of 12 attempt-0 answers are heatmaps in the comparison shape (census.txt).
- Shape written: `columns: [{heading, items}]`, no `rows`, no `range`; column k has k items (ragged triangle in 3 runs, other lengths in 6); cells are strings, blocked cell = the string "null"; raw scores, not a 0/1 mask.
- The 3 other runs wrote a valid `matrix` (columns as strings + 3 rows): the strings-plus-rows shape works when the model chooses matrix.
- Q0 cannot repair it: no row labels, ragged lengths; inventing labels is forbidden since release 126 (release-155 REPORT.md, GEM-S1 section). Repair (attempt 1) pads with "null" and still has no rows, so the step fails explanation_missing_visual and the card falls to gpt-oss.
- gpt-oss then writes the delivered card (8 of 12): a 6x6 lower-triangular mask, diagonal blocked, every allowed cell 0 (no contrast), prose says j <= i allowed (release-155 REPORT.md, "The 3 gpt-oss cards").
- IMPORTANT, found while reading: a causal-mask reference already exists and matches this exact prompt: `ml-transformer-causal-mask`, tutor-diagrams/transformer-decoder-references.js:52-76 (documented prompt at :54). Gemini's title/caption ("Causal mask on decoder scores", the sat row sentence) and its values (1.209, 3.33...) equal that reference (:64, maskedScores in transformer-walkthrough-data.js:73). So the reference was very likely in its context (inference from the identical text, not checked in a request) and Gemini still re-shaped it. Its masked cells are JSON null and its values are raw scores (range -scoreLimit..scoreLimit, :21).
- Most likely cause: the author guidance spells out `comparison` columns as `[{heading,items}]` and `matrix` as `columns [...], rows [{heading,cells}]` (control-plane/src/learn-primitives.js:395) but gives heatmap no field shape at all; the only heatmap text is "heatmap for numerical grids with an explicit scale" (control-plane/src/explanation-references.js:287). Not verified: whether the Gemini tool schema bundle carried the heatmap branch for this request (bundle rule: explanation-references.js:207-212, 266-270); check offline before blaming the text.

## 2. The valid heatmap shape
Schema: tutor-diagrams/ml-statistical-spec.js:8-16 (z.strictObject): `title`, optional `caption`, optional `rowLabel`/`columnLabel` (text 36), `columns: string[]` (1-6, each text 28, unique), `rows: [{label (text 28, unique), cells: (number | null)[] (1-6)}]` (1-6 rows, one cell per column), optional `range {min,max}` (min < max; omitted = min/max of the numeric cells, derived.js:127-129; written = every numeric cell must sit inside it, ml-statistical-spec.js:50-61), optional `highlights [{row,column}]` (a masked cell cannot be highlighted, :65). Numbers are z.number() (spec.js:31): the string "null" or "1.2" is NOT valid in a cell.
Masked cell = JSON `null`: rendered dashed with the text "Masked" (ml-statistical-layouts.js:54,59-61); comment at ml-statistical-references.js:1. There is no other blocked-cell field.
Verbatim valid example, tutor-diagrams/kind-gallery.json:188-197:
```
{ "version": 1, "diagram": { "kind": "heatmap", "title": "Soil temperature in Celsius",
  "columns": ["Morning", "Noon"],
  "rows": [{"label": "Shade", "cells": [16, 19]}, {"label": "Sun", "cells": [18, 24]}],
  "range": {"min": 16, "max": 24} } }
```
Verbatim with masked cells, ml-statistical-references.js:21-24 (id signed-feature-correlation):
```
{ kind: 'heatmap', title: 'Signed feature correlation', columns: ['Area', 'Price', 'Age'],
  rows: [{ label: 'Area', cells: [1, 0.9, -0.4] }, { label: 'Price', cells: [0.9, 1, null] }, { label: 'Age', cells: [-0.4, null, 1] }],
  range: { min: -1, max: 1 }, highlights: [{ row: 0, column: 1 }, { row: 1, column: 0 }], caption: '...' }
```
Existing 0/1 mask convention (use it): gallery-architecture-expansion-data.js:9 `mask = visible => positions.map(p => visible.includes(p) ? 1 : null)`; gallery-architecture-expansion-references.js:28-32 `maskGrid` = heatmap, `range: { min: 0, max: 1 }`, allowed 1, blocked null (used at :54, :237, :276). Rendering of such a grid: allowed cells full blue, blocked dashed "Masked", so contrast is built in (heatColor, ml-statistical-layouts.js:21-26).

## 3. What to author
A. A causal-mask grid, same six positions as the existing reference (labels "the 1".."mat 6", transformer-decoder-references.js:6): 6x6, row i allowed for columns j <= i (diagonal allowed = 1), blocked = null, range {min:0,max:1}, rowLabel/columnLabel as at :15-16, one caption saying the diagonal is allowed. Reference object shape (copy from :50-76 and gallery-architecture-expansion-references.js:21-26): `id, lessons: [], prompts: [one documented prompt], paraphrases: [2], keywords: [...], useWhen, spec, detailSpec?, depths: { overview: {spec,...}, deep: {spec,...} }` (depth keys overview/standard/deep; standard is the top-level spec; selection reads them at explanation-references.js:109-110).
   Recommendation: do NOT add a second reference with the same prompt; two references on one prompt tie on topical score (explanation-references.js:113-114, ties go to the lower index). Instead make the 0/1 mask the `spec` of `ml-transformer-causal-mask` and keep the score/weight grids as its `detailSpec` or deep variants, or give the new id a different documented prompt. Your call; say which you chose. Mind: learn-code-explain.test.js:231, 237, 388 pin this id and "a strong-tier heatmap reference still attaches"; reference-learner-keywords.json:694-697 has its two learner phrases.
B. One guidance sentence candidate (no topic words; generic to every heatmap). Exact home, preferred: control-plane/src/learn-primitives.js:395, right after `matrix for a grid (columns [...], rows [{heading,cells:[one per column]}]),`; alternative: control-plane/src/explanation-references.js:287 right after `heatmap for numerical grids with an explicit scale;`. Do not edit; send the text:
   `heatmap for a numeric grid (columns [strings], rows [{label,cells}] with a unique label per row and one number per column, range {min,max}); a blocked or masked cell is the JSON value null, never the text "null", and a heatmap never uses columns [{heading,items}].`
   Both lines sit in the shared cached prefix, so any edit changes the request bytes for every card; that is a release-level cost, state it in your hand-off.

## 4. Constraints
- No topic words in validators or guidance code (no "causal", "attention", "mask" in checks). Reference content may name its topic.
- No new kinds; heatmap stays 1-6 x 1-6. Use only the existing renderer: no colour changes; Theme 2 palette only, no hex literals (theme/stray-hex.test.mjs; derived.test.mjs:26).
- Do not change the schema, Q0 (learn-primitives.js:761-810) or add a repair that invents row labels.
- Tests that must stay green (node --test, tutor-diagrams/): kind-gallery.test.mjs (spec :12-23 sha256 + 200-token budget in kind-gallery.token-budget.json), kind-gallery-depths.test.mjs, svg-snapshots.test.mjs, set3-token-budgets.test.mjs, illustration-integration.test.mjs (:57-78, 300-token spec budget; illustration-token-budgets.json:270 has ml-transformer-causal-mask), reference-content-contract.test.mjs, ml-reference-integration.test.mjs, reference-vary.test.mjs, vary.test.mjs; control-plane: test/explanation-vary.test.js, test/explanation-token-links-contract.test.js (shows the pattern for pinning a guidance sentence once, :9), test/explanation-gemini-illustration-bundles.test.js (pins Gemini bundle sizes: do not touch schema), test/learn-code-explain.test.js.
- Regeneration: SVG snapshots only through `UPDATE_TUTOR_SVG_SNAPSHOTS=1 node --test packages/web/src/tutor-diagrams/svg-snapshots.test.mjs` (svg-snapshots.test.mjs:7; keys include ml-transformer-causal-mask/408|960|natural and the -brief/-detailed/-detail variants). Review the changed keys; only the causal-mask ones may move. Token budgets (illustration-token-budgets.json, set3-token-budgets.json, kind-gallery.token-budget.json) are sha256 + cl100k_base counts: I found NO generator script in the repo, so recount them by hand and say how you counted; changing the reference changes the :270 entry. If you leave the kind-gallery heatmap entry alone, its budget file is untouched.

## 5. Acceptance (offline, no provider call, no spend)
1. `parseTutorDiagram` (tutor-diagrams/spec.js, used in kind-gallery.test.mjs:5) accepts every new spec at overview/standard/deep and the detailSpec; show the output.
2. Cells: exactly 21 numeric 1s and 15 nulls for the 6x6 grid, diagonal numeric, no string cells, unique labels, range present.
3. `node --test packages/web/src/tutor-diagrams/*.test.mjs` and the control-plane tests in section 4 pass; `make test-unit` is the repo's gate (Makefile:43).
4. Byte-identity: explanation-vary.test.js:59 and :84 assert the library and the author request are byte-identical with and without a seed; they must still pass. A guidance-sentence edit WILL change request bytes by design, so list it as its own commit.
5. Real proof needs a funded rerun of the 12-run capture (owner approval, not part of this brief): target is attempt-0 valid heatmap in 12 of 12.

## 6. REF-1 ensemble-votes written value is Codex's
ml-plot-references.js:83-85: `ensemble-votes` bar-chart, Hard votes [4,2,1], Weighted votes [3.1,2.4,0.8]. reference-vary.js:40-44 varies hard A 4-5, B 2-3, weighted A 3.0-3.6, weighted C 0.6-1.0; class B weighted stays 2.4 as written, above its 2 hard votes, while A and C have weighted <= hard.
Whether 2.4 should be lowered to at most 2 (then vary it) or kept fixed is yours; the comment at reference-vary.js:40 says so; reference-vary.test.mjs:21 pins the current relations.
