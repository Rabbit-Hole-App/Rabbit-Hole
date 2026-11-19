# C09 content proposal — four NEW contextual-embedding families

**Proposal for root review only. C09 implementation remains gated on verified and pushed C08 plus root GO.** This document authors no JavaScript or diagram JSON. It preserves four authoritative queue families and five source headings, proposes 4 NEW / 0 REUSE, and changes no old reference, prompt, keyword, lesson, depth payload, single variant or receipt.

Read base: `48eb998162288fd55001c20639cc1d2aaa11b764` (`explain/composition-c07` when read). Reads use that commit explicitly because the shared checkout is active. Exact source authority remains `05d5f02f64b474dcf0f830050af4e34907fbdaa8`. The full scratch audit `c09-content-audit.md` was read; its SHA-256 is `c45371d6fa4934053df5207725cbe3b714c51cf025c7d7a3c5e8ef385a0d58d8`. The audit's historical author-contract pin is retained as history; current author/schema decisions below come from the actual files at the read base, pinned in the final table.

## Approach and preservation decision

Use one compact, independently declared linear directional/context/layer-mixture toy for the first three families. Use a separate six-record synthetic feature/readout case for evaluation. Keep their namespaces and provenance separate from each other and from existing `bert-figure-data.js` values.

The old `ml-bert-contextual-vectors`, `ml-bert-elmo-layer-mix` and `ml-bert-frozen-features` remain useful supporting examples. The audit found their resolved views fit 408/680 and recomputed their declared numbers correctly. Their partial coverage is not a width failure: contextual vectors are mostly tuple/text cells with only one numeric vector extra; the ELMo primary teaches read order/targets and leaves mixing to tuple-only Deep detail; frozen-feature F1 is string-only. None is a complete magnitude-encoded, default-Standard source route for this batch. Do not rewrite them, relabel their numbers, move an old Deep detail into a new Standard, or add a REUSE overlay to make them qualify.

Native heatmaps and bars are the proposed default routes. All four Standards are direct new parent ids, with no panels, visual transformation, nested composition or new single fallback. Compared with the audit's tentative layout, contextual Standard now includes all six token-output rows itself. Layer-mixture Standard main includes raw compatible joins, numerical coefficients and the final output; its additional native product view explains the arithmetic rather than supplying an otherwise missing source point. These are full source routes at Balanced, not a link to an unselected Deep-only picture.

Rejected alternatives: numeric tuple tables do not encode state/score magnitudes; a multi-tensor list transformation with every operand/product would spread many strips horizontally; a five-column heatmap has native minimum524px even before longer formula labels. A native three-column main plus a separate full-width product heatmap preserves the layer point within the existing vocabulary and short labels.

## Exact queue and source traceability

All ids below are queue ids and proposed registry ids, mode NEW, topic `contextual-embeddings`, proposed module `packages/web/src/tutor-diagrams/composition-contextual-embeddings-references.js`. Future source manifest entries retain the queue's complete representative/alias metadata, including kinds, sequence, gapTypes and individual lessons; a family union never overwrites source lessons.

| Family | Exact source heading | Verbatim source prompt | Exact source Elements | Source / family lessons |
|---|---|---|---|---|
| `ml-contextual-embeddings-contextual-word-vectors` | illustrated-bert Figure14, `briefs.md#figure-14` | The same surface word can have different contextual representations in sentences that mean different things. | An independently chosen ambiguous word in two short contexts, its two contextual vector strips, and one cue distinguishing the contexts. | representative08 / family08 |
| same family | illustrated-bert Figure15, `briefs.md#figure-15` | ELMo maps a whole sentence to a sequence of contextual vectors with one vector aligned to each token. | An independently chosen sentence in token order, contextual processing, and a matching output position for each input token. | alias08 / family08 |
| `ml-contextual-embeddings-two-directional-states` | illustrated-bert Figure17, `briefs.md#figure-17` | Forward and backward language models supply complementary context states at the same token position. | Aligned sentence positions, independent left-to-right and right-to-left state streams, and a selected token's two states. | representative[] / family[] |
| `ml-contextual-embeddings-weighted-layer-states` | illustrated-bert Figure18, `briefs.md#figure-18` | ELMo concatenates the forward and backward states at each depth and combines the layer representations with task-specific weights. | Base embedding, paired directional states concatenated by depth, compatible layer-vector widths, and a weighted componentwise sum. | representative08 / family08 |
| `ml-contextual-embeddings-layer-pooling-evaluation` | illustrated-bert Figure27, `briefs.md#figure-27` | Layer selection and layer combination can change the quality of frozen text features for a downstream task. | Distinct layer-pooling choices, the same evaluation setup, and only independently chosen illustrative scores or measured values with provenance. | representative08/09 / family08/09 |

Full brief prefix for every row: `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-bert/`. Figure14 kinds are comparison/block-stack, sequence step3; Figure15 transformation/block-stack, step4; Figure17 sequence/relationship, step6; Figure18 block-stack/transformation, step7, all under “Illustrated BERT · From static to contextual embeddings”. Figure27 kinds are matrix/bar-chart, sequence “Illustrated BERT · BERT objectives and uses · step5”. Figure17 has no source lesson. Do not import the old ELMo reference's15 into Figure18 or the old frozen-feature reference's13 into Figure27.

## Shared directional toy: operands, equations and exact results

Purpose: demonstrate position-aligned context dependence, independent direction streams and compatible layer mixing with small recomputable numbers. These are linear information-flow equations, **not real ELMo LSTM equations, pretrained outputs, learned semantic axes or model quality measurements**. The source statement about ELMo is the architectural teaching point; the numbers are an explicitly declared miniature illustration.

Contexts and stable identities:

| Context id | Tokens at positions0,1,2 | Human-supplied meaning cue |
|---|---|---|
| G | a, seal, glides | animal |
| C | a, seal, cracks | gasket |

Selected position is always1, selected surface token `seal`. Token/position identity is `(contextId, position)`, never a lookup by token text. Every context has three input positions and three output rows in that order. C is the controlled suffix edit of G: replace only position2, retaining all parameters. Meaning cues explain the authored sentences; they do not label vector coordinates or claim that a toy has learned senses.

The independently supplied lookup has width2:

| Token | E coordinate0 | E coordinate1 |
|---|---:|---:|
| a |0|1|
| seal |1|0|
| glides |2|1|
| cracks |-1|2|

For positions i=0,1,2, forward boundary is at−1 and backward boundary at3. Every boundary state at both depths equals0. With independent scalars per direction:

\[
F^{(1)}_i=\tfrac12 F^{(1)}_{i-1}+E_{i,0},\quad
B^{(1)}_i=\tfrac14 B^{(1)}_{i+1}+E_{i,1};
\]
\[
F^{(2)}_i=\tfrac12 F^{(2)}_{i-1}+F^{(1)}_i,\quad
B^{(2)}_i=\tfrac14 B^{(2)}_{i+1}+B^{(1)}_i.
\]

Compute F left-to-right and B right-to-left at each depth. F consumes only its own recurrent state and its own prior-depth input; B consumes only its own recurrent state and prior-depth input. F never reads B or vice versa. The deliberate use of different lookup coordinates in the two toy directions is a chosen simplification, not an assertion about real ELMo input wiring. Each state includes the selected/current token and its allowed prefix or suffix; this is not a BERT all-to-all attention mask.

Concatenate at the same position and depth, forward first:

\[
H^{(0)}_i=E_i\in\mathbb R^2,\quad
H^{(1)}_i=[F^{(1)}_i;B^{(1)}_i]\in\mathbb R^2,\quad
H^{(2)}_i=[F^{(2)}_i;B^{(2)}_i]\in\mathbb R^2.
\]

The scalar directional operands have width1 each; concatenation yields width2. Concatenation is defined only at depths1 and2: H0 is the separately supplied base E, with no F0 or B0. All three depth operands are compatible before mixing. Depth mixing does not concatenate them again and never joins different token positions.

Task A supplies depth coefficients s=(0.2,0.3,0.5), gamma=1, fixed for all positions and both contexts. They sum1 by declaration; no softmax or fitting step is implied. For coordinate j=0,1:

\[
C^{A}_{i,j}=\gamma\sum_{\ell=0}^{2}s_\ell H^{(\ell)}_{i,j}.
\]

Weights index base/layer depths, not source tokens, query keys or sentence meanings. Coefficients and all state features in this toy are dimensionless numbers; neither is a class or attention probability.

Exact recomputation, in input-token order:

| Context | F1 | B1 | F2 | B2 |
|---|---|---|---|---|
| G |(0,1,2.5)|(1.0625,0.25,1)|(0,1,3)|(1.1875,0.5,1)|
| C |(0,1,-0.5)|(1.125,0.5,2)|(0,1,0)|(1.375,1,2)|

| Output identity | Input token | H0=E | H1=[F1;B1] | H2=[F2;B2] | Task A output |
|---|---|---|---|---|---|
| G0 |a|(0,1)|(0,1.0625)|(0,1.1875)|(0,1.1125)|
| G1 |seal|(1,0)|(1,0.25)|(1,0.5)|(1,0.325)|
| G2 |glides|(2,1)|(2.5,1)|(3,1)|(2.65,1)|
| C0 |a|(0,1)|(0,1.125)|(0,1.375)|(0,1.225)|
| C1 |seal|(1,0)|(1,0.5)|(1,1)|(1,0.65)|
| C2 |cracks|(-1,2)|(-0.5,2)|(0,2)|(-0.35,2)|

At selected G1, componentwise products and their sum are:

| Term | Coordinate0 | Coordinate1 |
|---|---:|---:|
| 0.2E |0.2|0|
| 0.3H1 |0.3|0.075|
| 0.5H2 |0.5|0.25|
| output, gamma1 |1|0.325|

At C1 the same coefficient vector gives products (0.2,0), (0.3,0.15), (0.5,0.5), sum (1,0.65). The coefficient vector remains fixed across contexts; it is the states that change.

Concrete input probe: G→C changes only E2. F1/F2 at positions0/1 remain unchanged; both backward streams change at earlier positions; position2 forward values also change. Output changes are G0→C0=(0,+0.1125), G1→C1=(0,+0.325), and G2→C2=(-3,+1). Do not claim that only the selected ambiguous token changes.

Concrete task-parameter probe: on the fixed G1 operands only, supply Task B coefficients (0.5,0.3,0.2), gamma1. Products are (0.5,0), (0.3,0.075), (0.2,0.1); output is (1,0.175), versus Task A (1,0.325), delta (0,-0.15). Both coefficient sums are1. This changes supplied task-level parameters while holding input, lookup, states, concat order and scale fixed; it is not query-conditioned reweighting, an optimizer step or a better-task claim. Task B need only be evaluated for this selected probe, not silently substituted into the complete Task A sentence rows.

Arithmetic and rounding contract: retain unrounded derived arrays for recurrences, joins, products, sums, deltas and probes. State/output displays use at most4 decimal places, stripping insignificant zeros; the planned states/Task A outputs/selected Task B values are exact finite decimals at this precision. Any later rounded equality becomes an approximate equality. Coefficients remain their supplied exact decimal values. Display arrays are derived once after the full calculation; no downstream operation consumes chart labels. Numeric heatmap cells are numbers, not vector strings.

## Family 1 — contextual word vectors and a complete output sequence

Id `ml-contextual-embeddings-contextual-word-vectors`; lessons08. Purpose: visibly compare the same ambiguous word's numeric contextual strips while showing the complete whole-sentence input/output alignment required by alias15. Static lookup alone, a single output strip or a sentence mean is insufficient.

Depth plan:

| Depth | Native main | Native detail | Visible point |
|---|---|---|---|
| Overview |2×2 heatmap; rows “Animal seal”, “Gasket seal”; feature columns “First feature”, “Second feature”; outputs (1,0.325)/(1,0.65), range0..1 |none|One word, two supplied context cues, two magnitude-encoded output strips. Plain labels, no formula.|
| Standard |6×2 heatmap; rows G0 a, G1 seal, G2 glides, C0 a, C1 seal, C2 cracks; columns Feature0/Feature1; all six Task A outputs; shared range−0.5..3; highlight the two seal coordinate1 cells|none|Every input token/position has its own output row in the same order, and both selected-word strips coexist in the primary view.|
| Deep |Same full6×2 aligned-output grid, with explicit fixed-parameter suffix-probe caption|4×2 heatmap: rows F1,B1,F2,B2 at selected position; columns G/C, values (1,1),(.25,.5),(1,1),(.5,1), range0..1|Recompute the only-right-token edit; distinguish unchanged selected forward streams from changed backward streams and outputs.|

Standard title: “One contextual vector per input position”. Proposed Standard caption: “G: a seal glides, animal; C: a seal cracks, gasket. Same seal lookup; fixed linear toy and task mix, one output per position.” Deep detail names the linear toy explicitly and says fixed input prefix and task coefficients. Keep the full contexts/cues visible, not only in useWhen or hidden metadata. Output coordinates have neutral feature names, never “animal probability” or “gasket probability”.

Keywords: `ambiguous token output rows`; `contextual sequence alignment`.

Five paraphrases:

1. Show ambiguous token output rows for seal in animal and gasket contexts.
2. How does contextual sequence alignment give one vector to every input token?
3. Keep every input position visible while comparing ambiguous token output rows.
4. Change only the right cue and recompute contextual sequence alignment.
5. Compare ambiguous token output rows without averaging the whole sentence.

UseWhen: show complete token-aligned contextual outputs and contrasting strips for the same surface word under declared context cues; exclude static lookup only, sentence-level mean pooling, a sole CLS output, attention probabilities and measured semantic quality. Existing contextual-slot stacks remain separate supporting material.

## Family 2 — independent directional states at one aligned token

Id `ml-contextual-embeddings-two-directional-states`; lessons[]. Purpose: show the two independent directional streams, aligned input positions and the selected token's two scalar states. A bidirectional BERT attention mask does not show this mechanism.

| Depth | Native main | Native detail | Visible point |
|---|---|---|---|
| Overview |2×1 heatmap of selected G1 states: “Reads from start”=1, “Reads from end”=.25; column “seal state”, range0..1|none|The same selected token has two independently computed states, from opposite reads of a seal glides. Plain caption explains separate starts.|
| Standard |2×3 heatmap; rows forward F1 and backward B1 with read-order directions; columns “0 a”, “1 seal”, “2 glides”; arrays (0,1,2.5)/(1.0625,.25,1), range0..2.5; highlight both selected-column cells|none|Aligned states over all positions, opposite read orders, selected position1 and separate boundaries/recurrences in the caption.|
| Deep |4×3 heatmap: G forward/G backward/C forward/C backward; same three position columns labelled by position and cue role; values from both F1/B1 arrays above, range−.5..2.5; highlight the four selected-position cells|none|The suffix probe is embedded: selected forward remains1, backward .25→.5, with no cross-direction recurrent link.|

Standard title: “Independent streams meet at the same position”. Caption template, with complete mathematical expressions inside dollar delimiters when later authored: “Linear toy, separate zero boundaries: F_i=.5F_(i−1)+E_i0; B_i=.25B_(i+1)+E_i1. Neither direction reads the other.” Direction row labels also name left-to-right/right-to-left order; native arrows in labels denote actual read order, not messages between the streams. Deep column2 is “2 right cue” so G and C share positions without pretending the edited token text is unchanged. Caption identifies G=a seal glides and C=a seal cracks, says only the right cue changes, and states the fixed-state consequence. If the complete two-context explanation exceeds140 shown characters, move the G/C names into the short row labels, not an unsupported note field or silent truncation.

Do not add a sequence whose alternating messages suggest one directional model feeds the other. A separate sequence/relationship is unnecessary for these already aligned numeric streams; no fabricated graph-connection edge is proposed. The selected depth2 states are available in the shared data and in Family1's probe, but need not inflate this depth1 direction teaching view.

Keywords: `independent directional states`; `opposite read streams`.

Five paraphrases:

1. Show independent directional states at each position of a seal glides.
2. How do opposite read streams reach the selected seal position?
3. Change the right cue while keeping independent directional states separate.
4. Compare opposite read streams without treating them as BERT self-attention.
5. Which independent directional states stay fixed before an edited suffix?

UseWhen: compare independent forward/backward recurrence streams at aligned positions and their selected-token states; exclude joint BERT bidirectional attention, a single forward RNN, gradients, query attention and recurrent updates that read the other direction's state.

## Family 3 — direction concatenation followed by depth mixing

Id `ml-contextual-embeddings-weighted-layer-states`; lessons08. Purpose: make concatenation operands/order/width, the base embedding, supplied depth coefficients, weighted products and final componentwise output visible. The final output alone or products with no compatible input operands do not establish the source point.

| Depth | Native main | Native detail | Visible point |
|---|---|---|---|
| Overview |2×2 heatmap for G1: rows “First joined layer”, “Second joined layer”, columns “From forward”, “From backward”, values (1,.25)/(1,.5), range0..1|none|Two scalar states join in forward/backward order at each depth; both joined vectors have width2. Plain caption identifies a linear toy.|
| Standard |4×3 heatmap described immediately below, range0..1|4×2 heatmap of A products .2E/.3H1/.5H2 and gamma1 output, numbers in the product table above, range0..1|Primary itself carries base, raw joined operands, compatible feature width, numeric coefficients and final output; detail expands all componentwise products.|
| Deep |Same4×3 main with fixed G1 input operands but Task B depth coefficients and output (1,.175); gamma1|5×2 heatmap, columns TaskA/TaskB, rows s0,s1,s2,output0,output1; values (.2,.5),(.3,.3),(.5,.2),(1,1),(.325,.175), range0..1|Embedded task-parameter probe compares coefficients and recomputed outputs while the raw state operands remain fixed.|

Standard main columns are Feature0, Feature1, Weight or scale. Its rows and numeric cells are:

| Row label meaning | Feature0 | Feature1 | Weight or scale |
|---|---:|---:|---:|
| E=H0 |1|0|.2|
| H1=[F1;B1] |1|.25|.3|
| H2=[F2;B2] |1|.5|.5|
| C, gamma |1|.325|1|

In the first three rows the final column is the depth coefficient s0/s1/s2. In the output row it is explicitly gamma, not a fourth layer weight. Use short mathematical row labels with dollar delimiters, and define that column distinction in the visible caption; no sum of all four scale cells is claimed. These are dimensionless toy values on an explicit0..1 numeric color range. Coefficients therefore have magnitude encoding alongside the raw operands and output, rather than existing only as text labels. Later arithmetic checks must sum/normalize only the three task-depth coefficients s0/s1/s2; gamma is a separate scale. Never sum or normalize all four displayed scale-column rows as weights.

Standard title: “Join directions, then weight compatible depths”. Caption template: “Linear toy: H0=E; H_l=[F_l;B_l] for l=1,2, all width2. First3 scales: task-depth weights; last: gamma1. C=gamma sum_l s_l H_l.” All complete formulas later receive math delimiters; use the actual shown-character counter when spelling them. Shorter equivalent mathematical notation is permitted; omitting coefficient scope, concat order, gamma or width is not. E is explicitly H0 and has the same width2 as both joins.

The Standard product detail repeats the final output deliberately to let the viewer add every scaled coordinate. Its title is “Scale each depth, then add each feature”; caption names Task A, fixed G1 and gamma1. In Deep, the primary's first three scale cells become (.5,.3,.2), its output becomes (1,.175), and its input feature cells remain identical. The additional five-row comparison has no coefficient or output strings masquerading as vectors. Caption states both weight sums equal1, coefficients are supplied task parameters, and gamma/states remain fixed. No attention distribution, query or training trajectory is implied.

Keywords: `task layer mixture products`; `direction concat layer sum`.

Five paraphrases:

1. Show task layer mixture products after concatenating forward and backward states.
2. Explain the direction concat layer sum with compatible base and layer widths.
3. Keep token states fixed and change the task layer mixture products.
4. Which coefficients in a direction concat layer sum index depths rather than tokens?
5. Recompute task layer mixture products before adding their output coordinates.

UseWhen: concatenate directional states within each same-position depth, align the base width, then form the supplied task-weighted componentwise layer sum; exclude token pooling, query/key attention, concatenating different token positions, unsupported learned-weight claims and an unlabelled jointly bidirectional encoder.

## Separate evaluation toy: complete cohort, readouts and F1 arithmetic

Purpose: supply provenance for a visible frozen-feature pooling comparison. These are six synthetic feature records and supplied, untrained linear heads. No text encoder was run, no head was fit or tuned, and no benchmark/validation experiment occurred. The toy feature rows stand in for frozen text states; they are not claimed to be outputs from the directional toy, real BERT or ELMo.

The cohort ids u1–u6 and their binary labels remain fixed. Supply L1_i=(a_i,0) and L2_i=(b_i,0):

| Id | Target y | a | b |
|---|---:|---:|---:|
| u1 |1|1|2|
| u2 |1|-1.5|1|
| u3 |1|2.5|-1|
| u4 |0|-1.5|1|
| u5 |0|1.5|-2|
| u6 |0|-1|-1|

Both input layer vectors have width2. Cases, including readout widths and coefficients:

| Case | Feature operation | Feature width | Supplied head w | Logit, zero bias |
|---|---|---:|---|---|
| Last |L2|2|(1,0)|b|
| Sum |L1+L2, same coordinate positions|2|(1,0)|a+b|
| Join |[L1;L2], full L1 before L2|4|(.5,0,1,0)|.5a+b|

For each method m and whole record i, z_mi=w_m dot feature_mi, prediction=1 iff z_mi>0; a zero logit predicts0. Targets, cohort, bias0, threshold, positive class and F1 definition remain fixed. Join uses a different supplied head as required by its width: this compares declared pooling/readout cases and does not causally isolate pooling or establish a universally superior operator.

| Case | Logits in u1–u6 order | Predictions in u1–u6 order | TP | FP | FN | TN | Exact F1 | Display F1 |
|---|---|---|---:|---:|---:|---:|---|---:|
| Last |(2,1,-1,1,-2,-1)|(1,1,0,1,0,0)|2|1|1|2|2/3|.667|
| Sum |(3,-.5,1.5,-.5,-.5,-2)|(1,0,1,0,0,0)|2|0|1|3|4/5|.800|
| Join |(2.5,.25,.25,.25,-1.25,-1.5)|(1,1,1,1,0,0)|3|1|0|2|6/7|.857|

Counts derive from target/prediction pairs by stable id. Every row has TP+FN=3, FP+TN=3 and all four counts summing6. Precision=TP/(TP+FP), recall=TP/(TP+FN), and F1=2TP/(2TP+FP+FN): Last has precision/recall2/3; Sum has1 and2/3; Join has3/4 and1. Only F1 need be plotted. All denominators in this declared case are nonzero; no general empty-cohort/undefined-F1 policy is introduced.

Keep exact integer counts and unrounded rational F1 through every comparison and probe. Round only the final display score to3 decimals. Do not pretype method scores independently of the computed logits and confusion counts, and do not derive reordered scores from rounded chart values.

Concrete implicit probe: permute **whole keyed records** into u6,u2,u4,u1,u5,u3 order. Move ids, both features and targets together; recompute operations, logits, predictions, counts and F1 using unchanged heads/bias/threshold. The permuted target sequence is (0,1,0,1,0,1); predictions become Last=(0,1,1,1,0,0), Sum=(0,0,0,1,0,1), Join=(0,1,1,1,0,1). Every method's confusion counts and exact F1 remain equal to its original value. This is sample-order invariance of the calculation, not robustness to changing labels, dropping records or refitting a head.

## Family 4 — frozen-feature layer pooling under one declared setup

Id `ml-contextual-embeddings-layer-pooling-evaluation`; lessons08/09. Purpose: compare distinct layer readout choices with score magnitudes under one explicitly supplied synthetic setup. Preserve feature/head compatibility and cohort identity; do not attach invented empirical BERT provenance to correct toy arithmetic.

| Depth | Native main | Native detail | Visible point |
|---|---|---|---|
| Overview |2-bar F1 chart for Last and Sum; plain labels “Last layer”/“Add two layers”; .667/.8, common F1 unit|none|A simple score comparison, explicitly six synthetic records and supplied untrained heads; no formula or general ranking claim.|
| Standard |3-bar F1 chart Last/Sum/Join, .667/.8/.857; labels include feature widths2/2/4; unit F1|4×3 count heatmap, rows TP/FP/FN/TN, columns Last/Sum/Join; count rows (2,2,3),(1,0,1),(1,1,0),(2,3,2), range0..3|All source choices/score magnitudes coexist, with visible common synthetic cohort and supplied-head provenance. Count detail explains the computed metric.|
| Deep |6-bar F1 chart: Last base/Last permuted/Sum base/Sum permuted/Join base/Join permuted; paired values repeat the exact-derived rounded F1, same unit/axis|6×3 prediction-flag heatmap, rows in permuted id order with each row's supplied target in its label; columns Last/Sum/Join; predictions from the probe above; range0..1 explicitly categorical flags|The reorder probe is visible in the metric pairs and can be checked against stable ids/targets and categorical predictions.|

Standard title: “Pooling/readout cases on one synthetic cohort”. Main caption must visibly say six synthetic ids u1–u6, supplied untrained heads, zero bias, strict positive-logit threshold and “these cases only”. Example: “Six synthetic ids u1–u6; supplied untrained heads, bias0, positive iff logit>0. These pooling/readout cases were not trained.” The inequality later receives math delimiters. This provenance is not relegated to useWhen or a detail caption. Score labels are F1 magnitudes, not training accuracy or measured BERT validation F1.

Count-detail caption names fixed positive/negative support3/3 and the F1 formula, using math delimiters. Deep main names whole-record reordering and unchanged heads/threshold. Deep detail uses row labels “u6 target0”, “u2 target1”, “u4 target0”, “u1 target1”, “u5 target0”, “u3 target1”; its caption explicitly calls the0/1 cells prediction flags, not probabilities or score magnitudes. No extra sample is dropped to fit a figure. No confidence interval, measured training cost or source-less benchmark is added.

Keywords: `frozen pooling F1 comparison`; `fixed cohort layer readouts`.

Five paraphrases:

1. Show a frozen pooling F1 comparison with supplied untrained readouts.
2. How do fixed cohort layer readouts turn frozen features into predictions?
3. Reorder samples and recompute a frozen pooling F1 comparison.
4. Keep feature widths and fixed cohort layer readouts aligned for last, sum and join.
5. Explain why a frozen pooling F1 comparison does not prove a general best layer.

UseWhen: compare declared frozen-feature pooling/readout cases with recomputed F1 on the same keyed synthetic cohort; exclude encoder fine-tuning, training/tuning during the example, real pretrained benchmark claims, sequence probabilities, universal best-layer claims and incomparable evaluation splits.

## Frozen vocabulary, outgoing author route and feasibility

Reuse the existing `renderTutorDiagram` native heatmap/bar layouts and established depth/reference mechanism; add no renderer, schema, author prompt, tooling or dependency capability. Future module interface can be `topic-contextual-embeddings-data.js`, `composition-contextual-embeddings-references.js`, `topic-contextual-embeddings-sources.json` and subject-local token/hash receipts and affected tests. This is a content contract, not permission to create those files yet.

At the pinned read base, production depth names map brief→overview, balanced→standard, detailed→deep. `selectWithSteer` resolves the depth before parsing and retains primary plus present detailSpec. `selectForAuthor` then applies `preferSingleVariants`; native heatmap/bar parents are not swapped. `prepareArtifactAuthorRequest` includes selected primary/detail JSON in the author context, and fast-chain schema bundling inspects both. Its maximum is3 visuals per card. Every proposed depth has one or two figures, so a detail does not require an unsupported inset or extra schema field. Both normal and fast, planned and unplanned routes must be checked after authoring; this proposal makes no selection/schema-acceptance claim before then.


### Explicit depth-detail inheritance treatment

Production resolves a depth by shallow-merging the top-level reference with the selected depth override. A missing detailSpec in an Overview override therefore retains the Standard detail copied to the top level. The “none” entries in this proposal mean **no resolved or outgoing detail**, not an omitted override property. To keep every Overview as the single simple view planned above, explicitly set detailSpec:null in **all four Overview overrides**. Null is a reference-metadata override marker; the existing truthy detailSpec check excludes it from outgoing author JSON, so no null visual is sent or parsed.

| Family | Top-level / Standard detail | Overview override | Deep treatment |
|---|---|---|---|
| Contextual word vectors |none, absent or null|explicit detailSpec:null|replace with selected-state comparison|
| Independent directional states |none, absent or null|explicit detailSpec:null|explicit detailSpec:null, retaining the embedded-probe main only|
| Weighted layer states |Task A product heatmap|explicit detailSpec:null|replace with Task A/B coefficient/output comparison|
| Layer pooling evaluation |confusion-count heatmap|explicit detailSpec:null|replace with reordered prediction-flag heatmap|

This resolves to4 Overview figures,6 Standard figures (four mains plus layer/evaluation details), and7 Deep figures (four mains plus contextual/layer/evaluation details):17 total. Inspect/count the actual merged views and actual prepared author references, not only properties physically present inside each depths object. Future checks must establish that every Overview author reference has no outgoing detailSpec, both Standard details are present, and every Deep detail is replaced or cleared as declared. No inherited figure is silently excluded from tokens, widths, schemas, contact sheets or inventory counts.

Schema facts actually read: tensors allow1–4 rows and at most8 visible cells; heatmaps allow1–6 rows and columns, numeric/null cells and at most12 highlights; sequence allows2–4 actors and at most8 messages; legacy bars allow2–8 bars. `ml-plot-spec.js` overrides coordinate plots to at most5 series (not the old base max3), while grouped bars remain2–3 series. No coordinate plot, sequence, raw tensor, grouped bar or stack total is required by this proposed plan. The author schema omits the panels kind and stacked `total`; no such form is proposed. Exact mathematical expressions in labels/captions receive complete dollar delimiters; formulas count by actual shown length. Titles≤90, heatmap row/column labels≤28, caption≤140 shown characters.

The native heatmap layout has at least100px row-heading width, at least80px per numeric column and24px outer padding. Its short-label minima are therefore284px for two columns and364px for three. Four columns already require444px, so this plan keeps every heatmap to at most3 columns and transposes evaluation counts to4 rows×3 methods. At408, a three-column grid leaves144px for its row heading; the selected short formula labels are designed for that allowance. Formula widths and caption-driven expansion must still be measured on actual serialized diagrams. Native680-fit and408-readability are separate required receipts; fitting a schema is not visual approval. No dense grid is scaled inside an ordered panel, and no numeric text-box substitute or fake connector is introduced.

Planned maximum shapes: contextual outputs6×2; directional probe4×3; layer main4×3/products4×2/probe5×2; evaluation counts4×3/predictions6×3 and at most6 bars. All are within the frozen shape vocabulary. Overview has fewer rendered elements than Standard in every family:2 rather than6 output rows;2×1 rather than2×3 states;2×2 rather than4×3 layer cells plus product detail;2 rather than3 metric bars plus count detail.

Tentative per-visual token targets, **not measurements or acceptance claims**: small Overviews roughly90–170; contextual Standard/Deep full grids roughly180–280; directional grids roughly150–260; layer main/products/probe roughly170–280; evaluation bars/counts/flags roughly110–280. Each actual compact `JSON.stringify` visual, including every detail, must independently be≤300 cl100k tokens with its hash recorded. If a payload exceeds300, first shorten repeated prose/labels without dropping source operands, rows, coefficients, products, provenance or targets. Do not silently truncate a sentence, drop a record, substitute a text table or move the missing Standard point into Deep. Any remaining expressibility failure comes back to root before changing the vocabulary or scope.

Expected proposal inventory is12 main views plus5 detail views: contextual Deep1, layer Standard/Deep2, evaluation Standard/Deep2;17 visuals total. No new single variant is planned. This is a count of the content plan only; no new JSON was authored, parsed, rendered, tokenized or schema-accepted in this preparation.

## Honest limits and later acceptance boundaries

The equations omit LSTM gates, nonlinearities, training and real pretrained dimensionality. Direction streams remain independent until same-position collection/concat. Whole-sentence output rows demonstrate alignment and the toy dependency pattern; they cannot establish learned semantics, encoder quality or that one edited token affects only one output. The toy's gamma and coefficients are explicit supplied parameters over depths, not softmax over tokens.

The evaluation case is a synthetic calculation with supplied heads; it illustrates that declared choices can yield different scores under a shared setup. It does not reproduce the old10-positive-support table, reconstruct a real dataset, isolate a causal pooling advantage, establish trained-head performance or justify a general ranking. Old provenance and lessons remain untouched.

After C08 is verified/pushed and root authorizes C09, independent derivation checks must cover every state/boundary/position, scalar-to-width2 concatenation, all coefficient sums/products/output coordinates, suffix perturbation invariants and the fixed-state Task A/B probe; evaluation checks must derive head/feature width, logits, strict threshold decisions, all confusion counts, exact/rounded F1 and keyed whole-record reorder invariance. Source metadata must equal the authoritative queue per source/alias. Five exact source prompts plus20 narrow paraphrases give25 prompts×3 depths before transport/planning variants. Check actual outgoing parent ids and every present main/detail against the real prepared schemas on normal/fast and planned/unplanned paths; retain strict eligible-parent/single equality and all old picks/payloads/receipts. Root owns the authorized full replay, affected suites, snapshots, width/token/linter receipts,408/680 previews/contact sheets and final publication gates. None is claimed passed by this proposal.

## Pinned read hashes

SHA-256 of exact read-base file bytes follows. All21 files also matched their working-tree bytes at the independent arithmetic/read-hash check. Source brief bytes are additionally pinned to the authoritative source revision above. C08 may advance the checkout/registry; these file identities make the proposal's inputs reviewable without assuming HEAD stayed still.

| Read path | SHA-256 |
|---|---|
| `AGENTS.md` | `fd3ad431fed9e8f58b479919a0af8c169c3b94b7c932ec42d255f9d975faa873` |
| `CLAUDE.md` | `89dbd941e45e2eb9d128821800d6e7cb92cdce17e79dda851b09bd89470fb7da` |
| `UI.md` | `967a3bb8c7b67723b8b4ddd1b8d02aff525a5c7c97f9e8729204ac23f1dda235` |
| `docs/features/explain/composition/queue.json` | `4beca107ebdb9ff54edbd67657697cc7460ef66ddb276868c415150af5cb66d7` |
| `docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-bert/briefs.md` | `686f73cb7e70bf19ca72012f710044cfac30987a41e4b4a0ab4e951919c85adc` |
| `packages/web/src/tutor-diagrams/bert-figure-data.js` | `0477a6d134066a940cc8eaf7e05d8c8018d9b6d3e85665b8bb7d83e7c23833f0` |
| `packages/web/src/tutor-diagrams/bert-figure-references.js` | `d6ecebbfb7dc207cda90f8fa0770b36ee6ce84067985cf40ad70f32b5f3aa6d7` |
| `packages/web/src/tutor-diagrams/composition-transformer-references.js` | `eb12818e3a3fd72994be1e2cf2dd538360dedb6b69138c7866e98f57dc368812` |
| `packages/web/src/tutor-diagrams/topic-transformer-data.js` | `28bafc5de7f3396fe55f1ca71c8280c7fef4f31abce5b2bf8f33f39630641c87` |
| `packages/web/src/tutor-diagrams/spec.js` | `fd81e620c2c7a8795b1c79f12c9fbdb500a7158c49736b161291ad368ba93e33` |
| `packages/web/src/tutor-diagrams/tensor-spec.js` | `fb828722fcc696c538a62e7fd0ded8db719f9af7fd02a93eb0e68979c8fb89fc` |
| `packages/web/src/tutor-diagrams/ml-statistical-spec.js` | `c1207071a5ec412ed37c20c81ea8e1c467f844a6ead6c5b8ca28c9b544b95be4` |
| `packages/web/src/tutor-diagrams/ml-plot-spec.js` | `10dab13eca19563ab4bb9ba4680b49c6f552c43f7d827578a5571199a67bc70a` |
| `packages/web/src/tutor-diagrams/ml-statistical-layouts.js` | `71b287dff5c4964608dad0e0494762cb28c44f4ef11ca63a93163a4da27e1fbc` |
| `packages/web/src/tutor-diagrams/tensor-layout.js` | `4915b2d24811b00b2a5878ba491571a1aef62f637f1e48e6fe846b50ff9d5424` |
| `packages/web/src/tutor-diagrams/illustration-kinds.js` | `30e53745ffa3eae5754952455981da79f3b9beaf369c99d8b19fa37d5ec1ac19` |
| `packages/web/src/tutor-diagrams/content-contract.js` | `2e06211baf8e672dddca333581a152dc275c34c182e6141de71ec5cf5f87c8f8` |
| `packages/control-plane/src/explanation-references.js` | `df811029efd93e6d29dd8cd74fb4ea23c0653f6a733c89ad2ecd0cae5e0210a5` |
| `packages/control-plane/src/learn-artifact.js` | `705dc13a76dcc86e01dbc7cc84589b12cc32061c44a96dcc17178f917292c0d5` |
| `packages/control-plane/src/learn-primitives.js` | `80a240c770052f8b0df40d53a9c37f8503505abb0efa3976320184f3c372d9cf` |
| `packages/control-plane/src/chat-depth.js` | `33ea12c613602b2429c6e4156f41a3a4a15fd8a7571285cfbd5f09701da400ca` |

Preparation executed only pinned read-only source/schema inspection and independent exact rational arithmetic; the only written file is this scratch proposal. No repository edits, C09 JavaScript, new diagram JSON, tests, builds, providers, network, installations, pushes, deployments or subagents.

## Complete proposed title/caption inventory

These17 proposed title/caption pairs complete the visual labels above. They are prose content, not diagram JSON. Every title is below90 raw characters and every caption below140 raw characters; complete formulas later receive math delimiters and proper subscripts/TeX using the unchanged existing text contract. No new caption field or tooltip is needed.

| View | Title | Caption content |
|---|---|---|
| Word vectors Overview | One word, two context-dependent feature strips | Same word seal: a seal glides (animal), a seal cracks (gasket). Two numeric outputs from a declared linear toy. |
| Word vectors Standard | One contextual vector per input position | G: a seal glides, animal; C: a seal cracks, gasket. Same seal lookup; fixed linear toy and task mix, one output per position. |
| Word vectors Deep | Edit the right cue, retain every output position | G: a seal glides, animal; C: a seal cracks, gasket. Fixed lookup and task weights; recompute all positions with the linear toy. |
| Word vectors Deep detail | Separate directional states explain the changed output | Selected seal states from separate linear toy directions. Only the right cue changes; F1/F2 stay1, B1/B2 change. |
| Directions Overview | Two states for the same seal position | In a seal glides, separate linear toy reads start at opposite ends. Each reading reaches seal independently. |
| Directions Standard | Independent streams meet at the same position | Linear toy, separate zero boundaries: F_i=.5F_(i−1)+E_i0; B_i=.25B_(i+1)+E_i1. Neither direction reads the other. |
| Directions Deep | Edit the right cue, recompute both read streams | G: a seal glides; C: a seal cracks. Fixed linear toy: at seal, forward stays1, backward .25 to .5; no cross-stream state. |
| Layer mix Overview | Join two directions within each layer | Linear toy at seal in a seal glides. Each joined layer puts its forward scalar before its backward scalar, giving two features. |
| Layer mix Standard | Join directions, then weight compatible depths | Linear toy: H0=E; H_l=[F_l;B_l] for l=1,2, all width2. First3 scales: task-depth weights; last: gamma1. C=gamma sum_l s_l H_l. |
| Layer mix Standard detail | Scale each depth, then add each feature | Task A at seal: scale E,H1,H2 by .2,.3,.5, then sum matching features. Gamma1; inputs/output retain width2. |
| Layer mix Deep | Change supplied task weights on fixed states | Same linear toy seal states; Task B supplies depth weights .5,.3,.2. Gamma1 and every input operand stay fixed; output is recomputed. |
| Layer mix Deep detail | Supplied task parameters change the output | Task A/B weights each sum1. Fixed seal states and gamma1; only supplied task-depth parameters change, not a query or training. |
| Evaluation Overview | Supplied feature choices change this toy score | F1 balances missed positives and false alarms. Six synthetic records; supplied untrained heads compare these cases only. |
| Evaluation Standard | Pooling/readout cases on one synthetic cohort | Six synthetic ids u1–u6; supplied untrained heads, bias0, positive iff logit>0. These pooling/readout cases were not trained. |
| Evaluation Standard detail | Count all six predictions by the same rules | Same cohort, three positives and three negatives. F1=2TP/(2TP+FP+FN), computed from counts before display rounding. |
| Evaluation Deep | Whole-record reordering preserves these scores | Reorder u6,u2,u4,u1,u5,u3 together with labels/features. Heads and threshold stay fixed; recompute equal counts and F1. |
| Evaluation Deep detail | Reordered predictions retain ids and targets | Supplied targets appear in row labels. Cells are categorical prediction flags, not probabilities; all six synthetic ids remain. |

Final concurrency check: the checkout advanced to `a402edc19f46a0e78f84c5655cdc82bcad16327a` during preparation. All21 pinned instruction/queue/source/old-data/schema/author-path files still match the read-base hashes, with0 changes. The authoritative source brief whole-file hash also equals the source-revision hash. This does not authorize C09 implementation before the C08 gate and root GO.
