# Grid references — Deliverable 1

Nine standalone HTML review cards cover attention, a confusion matrix and a sliding image kernel at Overview, Standard and Deep. These are documentation references only. They add no runtime family, renderer, schema, pipeline, deployment, external model call or composition contract. The subject prompts retain the owner’s fallback wording; no Claude Code prompt replacements have been made.

The drawing shell is copied exactly from `overview-curve-sliders.html`: embedded Inter font, palette, card chrome, Prompt disclosure, explanation/Instructions order, experiment heading and top-right Reset icon. `grid-reference-kit.mjs` extracts that shell and the approved `P.teachingBox` / `P.teachingConnector` primitives using the same approach as `stepper-reference-kit.mjs`. Controls reproduce `IndexSlider` and stable-option-ID `ChoiceButtons` behavior from `packages/web/src/SceneControls.jsx`; they do not register another application component.

## Files and regeneration

- `grid-reference-kit.mjs`: shared documentation serializer and drawing adapter.
- `grid-attention.mjs`, `grid-confusion-matrix.mjs`, `grid-convolution.mjs`: exported `buildScene`, pure `createModel`, and subject drawing functions.
- `{overview,standard,deep}-grid-{attention,confusion-matrix,convolution}.html`: nine self-contained references, including their own model and handler scripts.
- `grid-reference.test.mjs`: independent numerical oracles and execution of the HTML’s actual scripts in a small document adapter.

From the repository root:

```sh
node docs/features/interact/references/grid-attention.mjs
node docs/features/interact/references/grid-confusion-matrix.mjs
node docs/features/interact/references/grid-convolution.mjs
node --test docs/features/interact/references/grid-reference.test.mjs
```

Importing a subject module is read-only. Running it directly regenerates only that subject’s three HTML files. Tests also compare every checked-in HTML byte with the serializer’s output.

## Controls and teaching depth

| Subject | Overview | Standard | Deep |
|---|---|---|---|
| Attention | Query index, 0–2; temperature fixed at 1 | Query + two choices, T=1 or T=2; current row compared with the other temperature | Same two controls; Q/K vectors, dot products, scaled scores and softmax formula |
| Confusion matrix | Cell index, 0–8; counts | Cell + Counts / Row %; normalization changes the actual displayed cell values | Same two controls; FN/FP and precision/recall for the selected cell’s actual class; TP belongs to its diagonal cell |
| Convolution | Patch index, 0–8; Mean kernel | Patch + Mean / Edge; readout compares the other kernel on the same patch | Same two controls; nine products and an exact row-sum expansion |

All selectors use a single integer slider with Previous/Next, rather than one button per cell. Every index starts at zero, advances in row-major order where applicable, and clamps to its admitted domain. Fractional input rounds to an integer; nonfinite or nonnumeric input returns to zero. Choice identity is its stable string ID. Reset restores index zero and the first choice. Standard and Deep each expose two parameters; Overview exposes one.

## Explicit inputs and computed evidence

Attention uses token order `the, cat, sat`, Q=`[[1,0],[0,1],[1,1]]`, and K=`[[1,0],[0,1],[0,2]]`. For one selected query, the model computes Q·Kᵀ, divides by √2 and the selected temperature, and applies numerically stable softmax across keys. The default row is approximately `[0.503490, 0.248255, 0.248255]`; its unrounded sum is 1. The row’s blue cell is its maximum, with the first key winning an exact tie. Standard compares that same query at the other temperature. These are authored toy vectors: token names imply no trained representation. One head, no mask, no dropout, no V/context calculation.

Confusion counts are computed from 24 explicit predictions grouped by actual class, rather than stored as final cells. Class order is `Cat, Dog, Bird`; actual labels are rows and predictions are columns. The resulting matrix is `[[7,2,1],[1,4,1],[0,2,6]]`, row totals `[10,6,8]`, and column totals `[8,8,8]`. There are 17 correct cases, so overall accuracy is 17/24, displayed as 70.8%. Row % divides each cell by its actual-class row total. Deep always takes the selected row’s class as its precision/recall focus, even if the selected cell is off diagonal. For Cat, TP=7, FN=3, FP=1, recall=70.0% and precision=87.5%. Warm off-diagonal cells are that focus class’s false negatives or false positives. Every admitted class has a nonzero row and column total; this reference does not define a zero-denominator policy for other datasets.

Convolution uses image `[[0,0,1,1,1],[0,1,2,2,1],[1,2,4,2,1],[1,2,2,1,0],[1,1,1,0,0]]`. Mean coefficients are all 1 with divisor 9; Edge coefficients are `[[-1,0,1],[-2,0,2],[-1,0,1]]` with divisor 1. Valid stride-1, padding-0 cross-correlation produces a 3×3 output. There is no kernel reversal or bias. Mean output numerators are `[[11,15,15],[15,18,15],[15,15,11]]` divided by 9; Edge outputs are `[[8,3,-5],[9,0,-9],[5,-3,-8]]`. The default patch gives Mean 11/9 and Edge +8; reversing Edge would incorrectly give −8. Kernel total weight is computed as coefficient sum/divisor: Mean 1, Edge 0.

The data, index sequences, grids, products, row/column totals, highlighted selection, formula terms, readouts and accessible descriptions all derive from these inputs. There are no image assets or precomputed picture frames.

## Label and number ownership

Callouts identify a query, selected actual→predicted cell, or patch location. They do not repeat the numerical readout. Grid cells own per-key attention weights, per-cell classification counts/rates and every current-kernel output. Convolution outputs use integers where exact and two decimals otherwise; product fractions remain exact. Its current selected output has no duplicate readout: the readout instead owns kernel total weight, and Standard/Deep separately quantify the other kernel’s output. The other kernel is a distinct comparison role. Deep shows a sum expansion without printing its final numerical result again.

Attention’s readouts own the sum before rounding and peak difference in percentage points. Its three-decimal cells can visibly sum to 0.999 or 1.001 while the unrounded sum remains 1. Confusion’s readouts own dataset summaries or per-class derived metrics. Per the owner’s one-place rule, Deep’s readouts quantify FN/FP, recall and precision; TP belongs only to the diagonal cell. The formulas use the TP symbol rather than repeating its count. The pure metrics model still computes TP, FN and FP independently of presentation.

## Source QA and limits

The final focused run passes 29/29 tests. The tests independently check all attention rows at both temperatures, confusion counts and all per-class metrics, and all nine convolution positions with both kernels. Actual HTML handlers execute all 105 admitted selection/choice combinations: attention 15, confusion 45, convolution 45. They also exercise Previous/Next bounds, invalid/fractional range input, stable pressed choices, accessible labels, readout values and Reset. Every frame checks unique SVG IDs and geometric callout segment clearance against every cell rectangle interior.

The clearance regression first failed for all nine cards with direct leaders across sibling cells. Leaders now leave the target cell’s bottom boundary, pass through a row gap and follow an outside margin spine. The output grid has a 4 px row/column gap for that route. Paint order is additional layering, never the clearance proof.

Native SVG width is 640 px. Attention and confusion height is 360 px; convolution height is 370 px. Attention cells are 88×52 px (score cells 88×42), confusion cells 78×50, and convolution cells 34×34. All drawn label text is at least 13 px. The existing viewport scrolls horizontally on narrow screens instead of shrinking these cells. Explanation and Instructions precede the experiment; controls follow the drawing, with no explanation appended below them.

<!-- ponytail: Deliverable 1 is source QA only by explicit owner scope. -->
No actual browser, screenshot review, keyboard/focus traversal, deployed window-fit check, application build or model/provider test was run. Source geometry and handler tests do not establish rendered text clearance or fit in a 900 px browser window. Those remain review items. This handoff is ready for reference review, not a production feature claim.

## Primary sources checked

Checked 2026-11-14; sources establish conventions, not the toy inputs.

- [Vaswani et al., Attention Is All You Need, §3.2.1](https://arxiv.org/html/1706.03762): query/key dot products are scaled by √dₖ, then softmax gives the weights.
- [PyTorch scaled_dot_product_attention](https://docs.pytorch.org/docs/2.15/generated/torch.nn.functional.scaled_dot_product_attention.html): the reference implementation scales QKᵀ and normalizes across the key dimension. Temperature here is an explicit teaching control that further divides scores.
- [scikit-learn confusion_matrix](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.confusion_matrix.html): row i is actual class i, column j is predicted class j; `normalize='true'` normalizes over rows.
- [scikit-learn precision_recall_fscore_support](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_recall_fscore_support.html): precision uses TP/(TP+FP), recall uses TP/(TP+FN), with multiclass metrics evaluated per class.
- [PyTorch Conv2d](https://docs.pytorch.org/docs/2.15/generated/torch.nn.Conv2d.html): the CNN operator is valid cross-correlation; valid means no padding, and output shape follows kernel size, stride, dilation and padding.

## Gaps for a later shared contract

No proposed contract is implemented here. The references expose requirements to settle later: bounded matrix dimensions and row-major domains; stable row/column/cell identity; count versus normalized-value roles; patch overlays linked to an output index; multi-grid geometry and leader routing with cell-interior clearance; computed-array support for softmax, normalization and cross-correlation; per-cell versus aggregate/comparison readout ownership; display precision; axis/orientation declarations; finite coercion and reset defaults; and invariant declarations for sums, shape, metrics and the unflipped kernel convention.

The root lane owns the Tutor record and global composition/family guides. This note intentionally does not edit or replace them.

The frozen SDK object/source budget also needs a production proof. The HTML's multiple cell grids and annotations are a reference drawing, not evidence that an expanded box-per-cell program fits. Reuse an admitted grid figure or a budgeted renderer part; if an approved-look capability is missing, report it rather than adding an SDK helper.
