# HEAT-1 prep: heatmap contrast and the causal-mask diagonal

Read-only prep. Repo C:/s/var-1, branch feat/var-1, HEAD eedbda36a. Paths below are under `packages/` unless absolute. Nothing in any repo was changed; no provider call. Scripts and probes are in C:/s/heat1-prep/ (crawl.mjs, rules.mjs, run.mjs, build.mjs, rules-table.json).

## 0. Two findings that change the ticket

1. A causal-mask reference already exists and is correct: `ml-transformer-causal-mask`, web/src/tutor-diagrams/transformer-decoder-references.js:52 (same prompt as the failing card). Upper triangle (j>i) null, diagonal numeric, range -4..4. The delivered 155 card is gpt-oss's own re-write of it (C:/s/film-evidence/docs/features/explain/checks/heat-1/codex-heatmap-brief.md section 1 says the same).
2. The ticket's literal contrast rule ("all cells the same value") rejects 4 shipped library references (9 spec instances) and the 0/1 mask convention that Codex's brief asks to be the new reference spec (codex-heatmap-brief.md section 2 and 3A: allowed = 1, blocked = null, range 0..1). Section 2 gives a rule that passes all of them and still catches the 155 card.

## 1. Where each rule lives

| Item | Location |
|---|---|
| Heatmap schema (strictObject: title, rowLabel, columnLabel, `columns` string[1-6], `rows[{label,cells:(number or null)[1-6]}]`, optional `range`, `highlights`) | web/src/tutor-diagrams/ml-statistical-spec.js:8-16 |
| Heatmap validator to extend | `checkHeatmap(d, issue)` ml-statistical-spec.js:50-67 (called from `validate`, :155, right after `checkDerived`) |
| Mask representation | JSON `null` cell = masked, drawn dashed with the text "Masked" (ml-statistical-layouts.js:54,59-61); a masked cell cannot be highlighted (ml-statistical-spec.js:65). No `mask` field exists; schema is strict (:8). Comment: ml-statistical-references.js:1 |
| Existing arithmetic-tagged non-derived rule (precedent to copy) | bootstrap draw count, ml-statistical-spec.js:84-86: `issue(path, message, { code: 'arithmetic' })` |
| How `issue` carries the tag | spec.js:365-367 (`ctx.addIssue({ code: 'custom', ..., params })`); child diagrams forward params, spec.js:358-361; domain validators run at spec.js:356 |
| Derived-field tagging (not the place for HEAT-1) | derived.js:237-239 `checkDerived` tags every non-`plain` problem arithmetic. A new DERIVED_ROWS entry breaks the closed-table test derived.test.mjs:17 and contrast is not a derived field |
| Routing of an arithmetic-tagged issue | learn-primitives.js:444 `arithmeticOf`; :450-453 `fenceProblem` -> `explanation_bad_numbers: ...`; :457-470 `numbersIssue`. learn-artifact.js:174-180 (rule and `ARITHMETIC_REPAIRS_SAME_MODEL = 2`), :299-300 (at the last attempt an arithmetic card fails the step; it is never passed to `dropInvalidDiagrams`/simplify), :352-356 (`failedOn`, same-model second repair, "Rewrite every sentence that states these numbers.") |
| Second repair applies to a heatmap | `nextCanWrite` = `canWriteKind` explanation-fast-chain.js:78 and :262; heatmap is a NEW kind Gemini only gets when the learner named it (explanation-references.js:196; test explanation-fast-chain.test.js:233-234), so after a gpt-oss miss with no next provider, or when the next is Gemini, the same model gets 2 repairs |
| Test file to extend (validator) | web/src/tutor-diagrams/ml-statistical.test.mjs, beside the bootstrap precedent :351-366 (helper `arithmeticOf` :353 filters `params.code === 'arithmetic'`); heatmap fixture :41-44; reject test :90-98 |
| Test file to extend (routing, end to end) | control-plane/test/explanation-visual-fallback.test.js:54-72 (arithmetic fails the step where an untagged invalid diagram is dropped); explanation-fast-chain.test.js:399-473 (repair counts, `failedOn`) |
| Words in the repair message | Put them in the issue message: that string is what the model reads (learn-primitives.js:446-453, 3 issues max, arithmetic first). Keep it generic (kinds, not topic), see section 3 |

Gate against topic words: there is exactly one automated gate, web/src/tutor-diagrams/derived.test.mjs:23-27, and it scans only derived.js (`/gradient|neuron|\bbank|\bloss\b|\bcat\b|\bdog\b|attention head|epoch/i` and no hex literal). ml-statistical-spec.js has no gate. The Codex brief's "no topic words in validators" (heat-1/codex-heatmap-brief.md section 4) is a convention, not a test. Recommendation: put both rules in ml-statistical-spec.js `checkHeatmap`, with kind-only vocabulary (grid, cell, diagonal, blocked), so neither gate applies and the convention holds.

Existing partial contrast check, and why it is not enough: derived.js:131-138 `heatmapInstance` reports "Every cell has the same value, so no range can be computed: write a range" (:135), but only when `range` is absent, and as a `plain` (untagged) issue, so it routes to the drop path, not repair. With an explicit range (all of the 155 cards write one) nothing fires.

## 2. "No contrast", defined without false positives

What the renderer draws (ml-statistical-layouts.js:21-26, :59-61): `heatColor` gives fill-opacity 0 to range.min when range does not cross 0 (opacity = (v-min)/(max-min)), to 0 when min < 0 < max, to range.max when max <= 0. A masked cell is `fill none`, dashed, text "Masked". So the delivered 155 card (every numeric cell 0, range 0..1) draws every allowed cell with no fill, which differs from a blocked cell only by a dashed border. That is the "no contrast".

Variants tested over every heatmap spec in the reference library, single-variant library, kind-gallery.json and kind-gallery-depths.json (110 specs in 39 ids, including every `detailSpec` and `depths` variant; walk script C:/s/heat1-prep/crawl.mjs, rules in C:/s/heat1-prep/rules.mjs):

- L (literal ticket): fewer than 2 numeric cells, or max == min over the numeric cells. Fails 9 shipped specs in 4 ids (below).
- D (recommended): every numeric cell has the same value AND that value is the blank point `b = (min<0 && max>0) ? 0 : (max<=0 ? max : min)` of the effective range (written, else numeric min..max; a degenerate range counts as blank). Meaning: the grid is drawn with no fill anywhere. Fails 0 shipped specs, fails both 155 shapes, passes the 0/1 mask (1 at range 0..1) and the uniform-weights reference (0.2 at range 0..1, drawn at 20% fill).
  Exact comparison, no tolerance: the closest legitimate non-constant card spreads over 10.2% of its range (d2l-transformer-cross-attention-grid-padding), so a threshold buys nothing and risks false positives.

L fails these (all are legitimate teaching cards):

| id | specs | why constant |
|---|---|---|
| d2l-attention-pooling-neighbor-weight-grid | `detailSpec` + `depths/deep/detailSpec` (2) | "Uniform weight by query and key", every cell 0.2, no nulls (d2l-vision-references.js:500) |
| figure-gallery-window-layer-schedule | `depths/deep/detailSpec` (1) | 0/1 mask, allowed 1 / blocked null (gallery-architecture-expansion-references.js:54, `maskGrid` :28) |
| figure-gallery-partial-block-mask | spec, overview, deep (3) | same convention (:237 or :276) |
| figure-gallery-window-vs-index-mask | spec, overview, deep (3) | same convention |

Full table (spec instances per id; D = recommended rule; diagonal rule from section 3 applies only where the null pattern is a strict upper triangle):

| id | specs | L (literal) | D (recommended) | diagonal rule |
|---|---|---|---|---|
| confusion-matrix-counts | 1 | pass | pass | n/a |
| signed-feature-correlation | 1 | pass | pass | n/a (nulls at (1,2),(2,1), not a triangle) |
| kernel-similarity-grid | 1 | pass | pass | n/a |
| hyperparameter-score-grid | 1 | pass | pass | n/a |
| classification-cost-matrix | 1 | pass | pass | n/a |
| ml-confusion-denominators | 1 | pass | pass | n/a |
| ml-minority-accuracy-trap | 1 | pass | pass | n/a |
| ml-transformer-causal-mask | 6 | pass | pass | 6 apply, pass (diagonal numeric) |
| ml-transformer-batched-attention | 3 | pass | pass | n/a |
| ml-transformer-position-heatmap | 3 | pass | pass | n/a |
| ml-word2vec-signed-embedding-heatmap | 3 | pass | pass | n/a |
| ml-stable-diffusion-forward-noise | 3 | pass | pass | n/a |
| ml-stable-diffusion-reverse-latent-steps | 3 | pass | pass | n/a |
| d2l-shared-patch-detector | 4 | pass | pass | n/a |
| d2l-convolution-window-arithmetic | 1 | pass | pass | n/a |
| d2l-convolution-filter-maps | 6 | pass | pass | n/a |
| d2l-convolution-window-reuse | 5 | pass | pass | n/a |
| d2l-convolution-zero-border | 3 | pass | pass | n/a |
| d2l-convolution-axis-strides | 5 | pass | pass | n/a |
| d2l-max-pooling-windows | 5 | pass | pass | n/a |
| d2l-backpropagation-through-time-cutoffs | 3 | pass | pass | n/a |
| d2l-attention-identity-weights | 3 | pass | pass | n/a |
| d2l-attention-pooling-neighbor-weight-grid | 5 | 2 FAIL | pass | n/a |
| d2l-attention-bandwidth-weight-spread | 6 | pass | pass | n/a |
| d2l-attention-valid-length-padding | 4 | pass | pass | n/a |
| d2l-attention-additive-score-projection | 2 | pass | pass | n/a |
| d2l-bahdanau-changing-decoder-context | 1 | pass | pass | n/a |
| d2l-bahdanau-read-translation-alignment | 3 | pass | pass | n/a |
| d2l-transformer-encoder-head-weight-grids | 6 | pass | pass | n/a |
| d2l-transformer-cross-attention-grid-padding | 3 | pass | pass | n/a |
| figure-gallery-window-layer-schedule | 1 | 1 FAIL | pass | n/a |
| figure-gallery-partial-block-mask | 3 | 3 FAIL | pass | n/a |
| figure-gallery-window-vs-index-mask | 3 | 3 FAIL | pass | n/a |
| figure-gallery-learned-sink-weight | 3 | pass | pass | n/a |
| ml-confusion-denominators-single | 1 | pass | pass | n/a |
| ml-minority-accuracy-trap-single | 1 | pass | pass | n/a |
| d2l-convolution-filter-maps-single | 1 | pass | pass | n/a |
| kind-gallery#17 (kind-gallery.json, "Soil temperature") | 1 | pass | pass | n/a |
| kind-gallery-depths#17 (kind-gallery-depths.json) | 3 | pass | pass | n/a |

Suggested issue (tagged arithmetic, path `['rows']`): "Every numeric cell is [v], the value drawn with no fill, so no cell stands out. Give cells different values, or put the cells that are allowed on a value that is drawn (for a 0 to 1 range, 1)." Fires for D; the library's own mask grids and uniform grids stay valid.

Open point for the Reviewer: D lets a 0/1 grid with null blocked cells pass contrast (blocked is a drawn state). L would force blocked = 0 and allowed = 1 as numbers; that also conflicts with the library convention (null = blocked) and with Codex's brief.

## 3. "A mask that blocks later keys must keep the diagonal"

Structural detection (no words; reads only cells):
`triangleBlocked(d)`: `rows.length === columns.length`, n >= 2, every row has n cells, every cell with j > i is `null`, and at least one numeric cell exists.
Violation: any diagonal cell `rows[i].cells[i] === null`. Issue path `['rows', i, 'cells', i]` (one issue per diagonal cell is noisy; emit one at `['rows']` naming the rows).
Suggested message (arithmetic-tagged): "The cells above the diagonal are blocked, so each row i must keep its own cell i: the diagonal is blocked in rows [labels]. Give those cells a number; row i allows columns 1 to i."

Results (rules.mjs): the delivered 155 card is detected and violates (rows 1-6, all six diagonal cells null; row 1 entirely null). The library causal mask (all 6 specs) is detected and passes. No other library heatmap is detected as a triangle (table above), so no false positive in the library. Probes:

| probe | triangle | diagonal blocked |
|---|---|---|
| delivered 155 card | yes | YES (fails) |
| idx 56 "after" (diagonal allowed, all 0, range -4..4) | yes | no, but fails contrast D |
| 0/1 mask, diagonal 1, blocked null, range 0..1 | yes | no (passes both) |
| half correlation matrix, diagonal 1 | yes | no |
| half correlation matrix, diagonal omitted (lower triangle) | yes | YES (fails): see risk 3 |

Not covered by design: the mirror pattern (nulls strictly below the diagonal). The ticket defines allowed as j <= i; add the mirror only on the Reviewer's word.

## 4. The failing card and what accepts it today

Source: C:/s/sprint2-evidence/fallbacks-batch/results.jsonl, arm `after`, idx 2, 13, 24 (prompt "How does the transformer decoder avoid looking ahead at later words?", depth detailed, reps 1-3, authored by fireworks gpt-oss-120b). The three rh-diagram fences are byte-identical (checked, build.mjs). The release-155 REPORT section is C:/s/sprint2-evidence/release-155/REPORT.md:31. Written to C:/s/heat1-prep/causal-mask-card.json (spec) and C:/s/heat1-prep/causal-mask-card.body.md (the full prose body, with the fence and the sentence "entry (i,j) is 0 (allowed) when j<=i").

Card: 6x6, columns and row labels "1".."6", `range {min:0,max:1}`, row 1 `[null x6]`, row k `[0 x (k-1), null x (7-k)]` (strictly lower triangular, blocked diagonal, every numeric cell 0, 15 numeric cells, 21 null). Title "Causal mask before softmax", caption "Gray cells are blocked (-inf) so later keys get zero weight."

Run of the repo's own code (C:/s/heat1-prep/run.mjs, node, no network):
- `parseTutorDiagram` (web/src/tutor-diagrams/spec.js:397): ACCEPTS.
- `diagramProblem(body)` (control-plane/src/learn-primitives.js:433): null. `numbersIssue({body})` (:457): null. `explanationProblem(block, 'detailed', prompt)`: null.
- So no repo validator objects; `dropInvalidDiagrams` is never reached. The only flag is the external card-errors check below.

Second failing shape, also in the evidence (var-1-bench results.jsonl idx 56 and 203, arm after; C:/s/heat1-prep/causal-mask-card-diag-allowed-all-zero.json, idx 56): diagonal allowed but every numeric cell 0 and range -4..4 (drawn blank). Parses today; fails the contrast rule D, passes the diagonal rule. Both rules are needed.

The `heatmap-weights-should-sum-to-1` check: NOT in the repo. It lives in the evidence tooling, C:/s/sprint2-evidence/card-errors/checks.mjs:151-160 (identical copy C:/s/film-evidence/docs/features/explain/checks/card-errors/checks.mjs). It runs when title, caption or axis labels match `/attention weight|softmax|probabilit|normali[sz]ed|weights? sum/i` (:153); the card says "softmax" in its title. It requires all numeric cells in 0..1 (:155), then flags when neither every row nor every column sums to 1 (:157-159): row sums are 0 for the card. It also fires on the idx 56/203 cards (range -4..4, cells 0 are in 0..1) as "row sums 0".

## 5. Risks and open questions for the Reviewer

1. Literal vs drawn contrast (section 2): the literal wording breaks 4 shipped references and Codex's pending 0/1 mask. Recommend D. Decide.
2. Skip masks in `heatmap-weights-should-sum-to-1`: yes. Cheapest structural skip: do not run the check when all numeric cells are equal (a constant grid carries no distribution; the false positives all have row sums 0), or when the grid is a triangle-blocked grid (section 3). Nothing else in the check needs words removed. After HEAT-1 both false-positive shapes go to repair, so the flag stays quiet by construction; the check tooling should still be fixed so old cards are not re-flagged. It is evidence tooling: not covered by the repo gate in derived.test.mjs.
3. Diagonal rule false positive: a half correlation matrix that deliberately leaves the diagonal out (strictly lower triangle, nulls elsewhere) is flagged. The library has none (the only correlation reference, signed-feature-correlation, is symmetric with 2 nulls); the card-error survey could be searched for one before release. Alternative: apply the rule only when the first row is entirely null (the delivered card's signature) or when the caption says nothing about a diagonal; both need words, so rejected here. Decide whether the half-correlation case is acceptable collateral.
4. Detection is the null pattern alone. A 0/1 mask whose blocked cells are written as 0 and allowed as 1 (both numeric) is invisible to the diagonal rule (no nulls) and is only caught by contrast if every cell is equal. The ticket's example does not need that; stating it so nobody assumes the rule covers it.
5. Arithmetic tag means the card never degrades: after the repairs the step fails (`explanation_bad_numbers`, learn-artifact.js:299-300) and the next provider runs; with no next provider the learner gets `validation_error`, no card, instead of today's delivered (wrong) card. In the 155 bench 18 of 33 runs moved to gpt-oss and 8 of 12 causal-mask runs ended on this exact card (release-155 REPORT.md:30-31, gem-s2 README), so the delivered-card rate for this prompt can fall until the author stops writing it. The second same-model repair (ARITHMETIC_REPAIRS_SAME_MODEL = 2, learn-artifact.js:180) applies here (heatmap is not writable by Gemini unless named). Owner's 2026-11-08 "a card should not fail" rule (learn-artifact.js:302 comment) is the counterweight; the ticket explicitly overrides it for these two issues.
6. The repair message is all the model sees. The ticket's prose problem remains: the 155 card also claims a softmax distribution per row over cells that are all 0. The repair appends "Rewrite every sentence that states these numbers." (learn-artifact.js:356), which helps, but nothing checks the prose against the grid. Out of scope; noted.
7. Nested heatmaps: for a heatmap inside `panels`/comparison the issue is tagged (spec.js:358-361) but `numbersIssue` reads `kind` from the top diagram (learn-primitives.js:465), so `nextCanWrite` sees the parent kind. Minor, applies to any arithmetic rule today.
8. The untagged range-absent same-value message (derived.js:135) will coexist with the new tagged issue; both appear, the tagged one first (learn-primitives.js:446-449). No test breaks: derived.test.mjs:98-99 reads `[0]` which is still the derived issue because `checkDerived` runs first (ml-statistical-spec.js:155).
9. Tests that touch heatmaps and need a re-run, not an edit, under D: ml-statistical.test.mjs:41,75-98 (heatmap with cells -1,0,1,.125,null,-0.5 passes), derived.test.mjs:92-99 (nulls plus 0.2/-0.5/0.9; all-0.5 and all-null cases only read `[0]`), TutorDiagram.test.mjs:14, svg-snapshots. Under L, the references listed in section 2 would fail the reference suites (kind-gallery*, gallery-architecture-expansion, d2l-vision) and need content changes.
10. Reference and prompt side (Codex's lane, not mine): the heatmap guidance gap is real (explanation-references.js:287 and learn-primitives.js:395 give no field shape; heat-1/codex-heatmap-brief.md). The validator rules here act on whatever the author writes after that fix; both are needed, since gpt-oss wrote this card with a valid shape.

## 6. Files written

- C:/s/heat1-prep/HEAT-1.md (this file)
- C:/s/heat1-prep/causal-mask-card.json (the failing spec, `{version:1, diagram:{...}}`), causal-mask-card.body.md, causal-mask-card-diag-allowed-all-zero.json
- C:/s/heat1-prep/rules.mjs (prototype rules and library scan, not applied), rules-table.json (per-spec results), crawl.mjs, run.mjs, build.mjs, extract.mjs, extract2.mjs, dump.mjs, offenders.mjs, crawl.json/crawl.err
