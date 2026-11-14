# Before/after reference cards

Deliverable 1 only: nine self-contained review HTMLs, three subject generators,
one documentation-only drawing kit, and deterministic tests. Base:
`aa6a85b2604c273fc8a517e78d6265f1fb45b437` (`design/family-stepper`). This lane does
not change application code, family registration, the SDK, model contracts or
runtime composition. It creates no composition JSON schema. Root owns the shared
scene guide, scorecard, contract and Tutor examples table.

## Reused presentation

`before-after-reference-kit.mjs` extracts the exact embedded Inter font, CSS,
palette, card header, Prompt details and existing top-right Reset from
`overview-curve-sliders.html`. Its `P` implementation is copied unchanged from
that approved reference, including `teachingBox`, `teachingConnector` and `dot`.
The short drawing helpers and choice behavior follow `stepper-reference-kit.mjs`.
The kit only adds the native-width before/after layout and control arrangement;
it is not an application helper.

Both comparison panels remain visible at the native 640 px width. Narrow viewports
scroll the scene horizontally instead of shrinking labels. SVGs are 350–400 px
high. SVG labels have a 13 px floor; most subject labels are 14–15 px. Concept and
Instructions precede the experiment. Parameters follow the drawing and its
readouts. Each scene has one to three parameters and the existing Reset action.
Concept copy is kept to 140–180 characters and Instructions to at most 110.
With three parameters, the two choices share the first row and the final slider
spans the second row at native width; narrow screens retain the single-column
control arrangement. These source limits bound the intended layout but do not
establish rendered window fit.
Callouts locate the marked item or branch; the readout row owns numerical
measurements. No playback strip or additional action row is introduced.

## Files and controls

The file prefix maps Overview to Brief, Standard to Balanced and Deep to Detailed,
following the approved curve and stepper references.

| Subject | Overview | Standard | Deep |
| --- | --- | --- | --- |
| Normalisation | `overview-before-after-normalisation.html`: Last measurement, integer range 8–20, default 8. The last sample is marked. | `standard-before-after-normalisation.html`: the same measurement slider plus Marked sample, indices 1–9, default 9. Mean, population SD and the marked raw/z value compare both sides. | `deep-before-after-normalisation.html`: the same two controls. A worked symbolic/numerical z-score formula and transformed mean/SD make the calculation inspectable. |
| Tokenization | `overview-before-after-tokenization.html`: Sentence choice, default `unhelpful cats.`, alternative `cats nap.`. Toy subword mode is fixed. | `standard-before-after-tokenization.html`: the same sentence choice plus Word/Subword, default Subword. The segmentation and token count actually change. | `deep-before-after-tokenization.html`: the same choices plus Marked token. Its range follows the current computed token count; switching to fewer tokens clamps the selection. Each chip shows its derived vocabulary ID and half-open source span. |
| Pruning | `overview-before-after-pruning.html`: Keep branch / Prune branch, default Prune branch. This is a manual structural comparison. | `standard-before-after-pruning.html`: Leaf penalty α, range 0–2, step 0.25, default 1.5. The actual lowest-cost subtree updates. | `deep-before-after-pruning.html`: the same penalty plus Training / Held-out readout sample, default Held-out. The selector changes matched-record counts and mistakes; subtree selection continues to use training cost. |

Reset restores both the picture and every parameter, including dynamic token
slider bounds and the Deep pruning sample choice. IDs and labels identify the
same learner-visible parts on both sides rather than replacing them with an
unrelated after-picture.

## Numerical and algorithmic assumptions

### Normalisation

The raw sample is `[2,3,4,4,5,6,6,7,last]`. All summary values, dot coordinates and
marked values are computed from that sample at full precision. Population SD
uses the average squared deviation over all displayed samples, with no `n−1`
correction. The formula display rounds operands and uses `≈` for its result.
Changing the last measurement refits the statistics on the displayed toy sample;
this example is not a train/test preprocessing pipeline.

The raw axis stays `[0,20]` and the z-score axis stays `[-3,3]`; their different
units and scales are explicit. Distinct fixed values guarantee positive SD.
For `n` observations, `|zᵢ| ≤ √(n−1)`: the centered deviations sum to zero, so
Cauchy–Schwarz gives `dᵢ² ≤ (n−1)Σⱼ≠ᵢdⱼ²`, which bounds
`n dᵢ² / Σⱼdⱼ²` by `n−1`. Here `n=9`, so the fixed z axis encloses every dot.
This bound is our derivation for the authored toy data, not an API guarantee.
Standardization preserves order and relative gaps; it does not make data Gaussian.

At the default measurement, the calculated raw mean is 5 and population SD is
`√(10/3)`. The transformed mean and population SD are numerically zero and one.
Equal measurements stack as separate dots; each panel always draws all samples.

### Tokenization

The admitted inputs are the two exact lowercase ASCII sentences above. This is
an explicit toy word/subword tokenizer, not GPT tokenization or real model IDs.
Words and punctuation are pre-separated; spaces are omitted, and punctuation is
kept. Subword segmentation repeatedly selects the longest vocabulary match from
the current word position. Interior pieces require the `##` prefix. That prefix
does not occupy a source span. Failure to segment a whole word emits `[UNK]` for
the whole word; admitted sentences need no unknown token.

Declared vocabularies, in zero-based ID order:

- Word: `[UNK]`, `unhelpful`, `cats`, `nap`, `.`.
- Subword: `[UNK]`, `un`, `##help`, `##ful`, `cats`, `nap`, `.`.

Thus the default subword pieces are `un`, `##help`, `##ful`, `cats`, `.`. Their
IDs are looked up from the selected vocabulary array, never supplied as
independent metrics. Source offsets are computed while tokenizing and use
half-open character intervals. The character tiles include the literal space,
and only the emitted token span is highlighted. Source character, token and
omitted-space counts are computed independently from the chosen text/segmentation.

### Pruning

This is a constructed classification example. The full tree asks `Practiced?`;
No predicts `Needs review`, Yes asks `Notes used?`. The second No predicts
`Needs review` and Yes predicts `Ready`. Pruning replaces the second split with
the training-majority `Ready` leaf. Replacing the root with a leaf is the third
candidate. Replacement predictions are calculated from training records, with
an explicit `Ready` tie rule at the root.

| Records reaching a full-tree leaf | Training labels | Held-out labels |
| --- | --- | --- |
| Did not practice | 3 Needs review | 3 Needs review |
| Practiced, no notes | 2 Needs review, 1 Ready | 2 Ready |
| Practiced, used notes | 4 Ready | 4 Ready |

Every matched-node count and mistake count comes from evaluating each actual
subtree against these records. The full tree has 5 nodes / 3 leaves; the branch
pruned tree has 3 nodes / 2 leaves. Training mistakes change from 1 to 2; held-out
mistakes change from 2 to 0. The held-out improvement is one illustrative sample,
not a guarantee about pruning.

The toy cost is **training mistake count + α × leaf count**. It is not a
misclassification rate or scikit-learn’s sample-weighted impurity. Candidate
costs calculate to `1+3α`, `2+2α` and `5+α` for the full, branch-pruned and
root-only trees. A tied minimum prefers fewer leaves, so α=1 selects the
branch-pruned tree. At the default α=1.5 it costs 5. The root-only candidate is
evaluated and exposed in Deep; it never wins within the admitted α range.

## Primary references checked

Sources were read on 2026-11-14. The datasets, UI and resulting figures above are
authored toy examples and independently checked calculations.

- [scikit-learn StandardScaler](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html): the standard-score equation and population-style `ddof=0` convention. Our slider refits the displayed sample rather than demonstrating deployment of a fitted scaler.
- [Hugging Face WordPiece tokenization](https://huggingface.co/learn/llm-course/chapter6/6): longest-match vocabulary segmentation, continuation notation and whole-word unknown behavior. This reference borrows that segmentation rule with declared miniature vocabularies and does not simulate vocabulary training or a real model tokenizer.
- [scikit-learn minimal cost-complexity pruning](https://scikit-learn.org/stable/modules/tree.html#minimal-cost-complexity-pruning): complexity penalty per terminal node and weakest-link pruning. Our count-based criterion is deliberately distinguished from scikit-learn’s impurity-based implementation.

## Verification receipt

Executed from the isolated `before-after-work` worktree:

```sh
node docs/features/interact/references/before-after-normalisation.mjs
node docs/features/interact/references/before-after-tokenization.mjs
node docs/features/interact/references/before-after-pruning.mjs
node --test docs/features/interact/references/before-after-models.test.mjs docs/features/interact/references/before-after-reference.test.mjs
```

The focused suite has **16 executed, passing tests**: six independent
model/algorithm tests, nine depth/subject handler tests and one shared-shell
test. Normalisation checks every admitted measurement and every selectable
sample, using an independent sum-of-squares calculation; the HTML tests also
inspect actual dot coordinates and formatted readouts. Tokenization checks both
sentences in each available mode against separately specified tokens, IDs and
offsets, plus longest-first matching and whole-word unknown behavior. Pruning
checks actual predictions, every matched-node count and every α step, including
the cost tie. The HTML tests execute each file’s own model and view script and
invoke the real input, change, choice and Reset handlers. They include defaults,
lower/upper limits, step rounding, dynamic token limits and sample changes.

The shared checks assert the exact approved font, palette and `P` primitives,
native 640 px width, 400 px maximum SVG height, 13 px SVG label floor, two panels,
one to three parameters, card order and no ellipsis labels.
They also assert the compact concept/Instructions limits and the three-parameter
control rule. Deep normalisation checks that the formula is the sole marked-value
readout.

The combined documentation reference suite was also executed with
`node --test docs/features/interact/references/*.test.mjs`: **77 passing tests**,
including the pre-existing curve and stepper checks. A separate conservative
font-advance calculation inspected 1,240 SVG text bounds across 41 default and
boundary snapshots; none extended beyond the 640 px canvas. This was a numerical
extent check using the embedded Inter font, not a render or collision assessment.

**Pending, explicitly unverified:** rendered window fit, visual legibility,
label collisions in an actual browser, focus order and keyboard interaction.
The slim Node document adapter is not evidence for these. No browser, model,
paid provider, application build or deployment was run for this reference-only
lane. No application behavior or runtime support is claimed.

## Later contract concerns

The production contract must carry bounded sample/token/tree data and stable identities between views, categorical control ids and dynamic token selection domains, explicit transform/scale conventions, computed readout ownership, pruned topology and independent reference checks. The cohort caption identifies Training/Held-out; node labels own its counts without a third repeated global total. Static categorical comparisons need a declared selection/domain route without inventing elapsed time. All renderer parts must still prove frozen SDK object/source budgets; these SVG references do not establish sealed-program admission.
