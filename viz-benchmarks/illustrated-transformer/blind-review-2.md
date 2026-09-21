# Blind review 2 — Illustrated Transformer + critic-calibration

Reviewer: independent visual critic, fresh context. No prior review, `critic-report.json`,
`generated/**/notes.md`, `evaluation/current.json`, `evaluation/history/`, or git log/diff was
opened before scores below were written. `SCORING.md` was read (it is required reading and is
methodology, not a scene review) — it contains two claims about specific cases (case 09's decoder
chaining arrow, and case 03's dot-arithmetic checker being inert) which I independently re-verified
against the current renders rather than taking on faith; see case 09 and case 03 below for what I
actually found.

Case 05 (causal-masking) excluded per instructions — text-medium, no diagram.

---

## Verdict

**STATIC QUALITY REJECTED**

Two of the benchmark's flagship cases (01, 03) display a dot-product result that does not match
the two operand vectors drawn on the same canvas — not a rounding nit, a 1.35-magnitude error
presented as fact, in the exact pattern this review's own instructions warn about. A third case
(04) has a row of numbers that doesn't sum to its own displayed total. A fourth (07) fails to
visually show its case's core required concept at all. That is 4 of 9 scored cases with a
independently-computed, load-bearing defect. This is a system pattern, not scene noise.

---

## Per-case scores and findings

Scale: 1 (broken) – 10 (no notes). Reference images are jalammar's "Illustrated Transformer"
(CC BY-NC-SA 4.0, structure/teaching-approach only — not scored on visual imitation).

### 01 — self-attention-computation-flow — 3/10

**TECHNICAL_CORRECTNESS, cause: content.** The scene draws one `query (Q)` box `[.90, -.40, 1.30]`
and one `key (K)` box `[.60, 1.10, -.70]`, with arrows from each into the 3×3 "raw scores: Q·Kᵀ"
matrix (top-left cell, river/river = `.54`). I computed the actual dot product of the two vectors
drawn on screen: `0.90×0.60 + (-0.40)×1.10 + 1.30×(-0.70) = 0.540 − 0.440 − 0.910 = −0.810`. The
matrix shows `.54`, not `−.81`. `.54` is exactly the *first term* of the three-term product
(`0.90×0.60`), i.e. the sum of the other two terms was dropped. No cell in the 3×3 matrix equals
−0.81 either (closest is south/south at −.91).
**CONTENT_OMISSION, cause: template.** Only one Q, one K, one V vector are drawn, but the score
matrix needs three of each (per-token). The single boxes are wired by arrow into specific matrix
cells as if they *are* the per-token vectors, which is arithmetically impossible for a 3×3 result.
Confirmed downstream: south's weighted output `[.46, .12, .48]` cannot come from the single V box
`[1.00, .30, -.50]` scaled by south's weights (that would give `[1.00, .30, -.50]` since the
weights sum to 1) — meaning even the "value (V)" box is decorative, not the vector actually summed.
**Verified correct, for the record:** softmax row sums to ~1 in all three rows, and each softmax
row is the correct softmax of its (displayed) raw-score row — the softmax step itself is fine; the
corruption is isolated to the raw-score/operand relationship.
**LAYOUT/CONTENT (minor), cause: template.** Target.json requires `progressive_hierarchy` as a
static-mode pattern for this case; the render has no staged numbering (contrast cases 06/08/10,
which all use "1) / 2) / 3)" captions). Ordering is only implied by left-to-right position.

### 02 — qkv-projection — 8/10

No arithmetic to check (weight matrices are intentionally blank — "shape only, values do not
matter yet," matching the case's own stated scope). Structurally strong: one embedding (4 cells)
branches via three parallel arrows into `Wq/Wk/Wv` (each 4×3, dimensionally consistent), producing
Q/K/V narrower (3 cells) than the input — a direct, unforced match to reference-notes' "output
vectors are drawn narrower… making the projection's dimensionality change visible without a
caption." Drawn as siblings (parallel rows), not a sequence, matching reference intent. No label
collisions, generous spacing.
**CONTENT_OMISSION (minor), cause: content.** Nothing in the frame distinguishes *why* three roles
are needed (only that there are three) — outside this case's stated scope, so low severity.

### 03 — attention-score-matrix — 2/10

**TECHNICAL_CORRECTNESS, cause: content.** Same defect as case 01, restated as an explicit,
labelled equation this time: `q_river · k_river = .54`, directly under the drawn vectors
`q_river = [.90, -.40, 1.30]` and `key (K) = [.60, 1.10, -.70]`. Computed: `−0.81` (see case 01 for
the term-by-term math; identical vectors, identical error). This is worse than case 01 because the
case's whole teaching device — "show the equation with named operands so a reader can verify the
arithmetic" (reference-notes, this case) — actively invites verification, and fails it. The same
K box is also wired by arrow to two *other* claimed equations (`q_river·k_flows=.99`,
`q_river·k_south=−.63`); neither is reachable from the drawn Q/K pair either, confirming the K box
is not really any of river/flows/south's key — it's decorative.
I independently re-checked `SCORING.md`'s "known debt" note that the `dot-arithmetic` checker is
currently inert on this case (regex resolves 0 operands from grid-typed `k`). That note is
corroborated by what's on screen: the false `.54` is exactly what an inert checker would let
through undetected.

### 04 — softmax-attention-weights — 5/10

**Verified correct:** raw score `→ divide by √dk` (dk=3, consistent with the 3-dim vectors used
elsewhere): `4.33/√3=2.50`, `.17/√3=.10`, `−3.11/√3=−1.80` — all match. Softmax of
`[2.50,.10,−1.80]` → `.91,.08,.01` — matches to the displayed precision, verified by direct
computation (`e^2.5/Σ=0.906`, etc.).
**TECHNICAL_CORRECTNESS, cause: content.** "weight × value" row: river `.91×1.00=.91` ✓, south
`.01×(−.50)=−.005→−.01` ✓, but flows: displayed weight `.08` × displayed `V_flows=.30` = `.024`,
which rounds to `.02`, not the displayed `.03`. This also breaks the row's own arithmetic: the four
displayed cells are `.91 + .03 + (−.01)`, which sums to `.93`, but the adjacent "sum = output" box
reads `.92`. `.91 + .02 + (−.01) = .92` is internally consistent; `.91 + .03 + (−.01)` is not. The
row does not sum to its own stated total — checkable without reference to anything drawn elsewhere.
**Continuity note, cause: template (recurring, see below).** South's raw-score row here
(`4.33, .17, −3.11`) does not match case 01's south row for the identical river/flows/south example
(`.78, 1.43, −.91`), even though the `value (V)` vector (`1.00, .30, −.50`) is reused verbatim from
case 01 — but re-purposed there as one token's 3-dim vector and here as three tokens' scalars.
**LAYOUT, cause: layout.** The "value (V) – for reference" box floats top-right with no arrow
connecting it into the weight×value row it's supposed to feed — a reader must infer the link.

### 06 — matrix-self-attention — 9/10

Strongest matrix case. `X × Wq = Q` uses a blank (shape-only) `Wq`, correctly not claiming a
computed value that can't be checked. The second row (`Q, K, V → QKᵀ/√dk → softmax → Z`) gives
real numbers throughout, and I verified **all nine cells** of `QKᵀ/√dk` by hand
(`dk=3, √3≈1.7320508`; e.g. river/river: `−.12×−.30 + .54×−.18 + .24×.45 = .0468`, `/√3 = .0270 →
.03`, matches), **all nine cells of softmax** (row sums checked via `exp`/normalize, e.g. row 1 →
`.32,.32,.36`, matches), and **all nine cells of Z = softmax×V** using the displayed (rounded)
softmax values, which reproduce the displayed Z matrix exactly once a consistent per-step rounding
convention is used (row 3 col 1 is the one cell that only resolves under the rounded-chain method —
consistent with genuine cumulative rounding, not a fabricated number: with full floating-point
precision it also lands within 0.003, i.e. one rounding boundary, of the shown value). This is the
kind of arithmetic the benchmark should ship everywhere; cases 01/03/04 do not meet this bar.
**CONTENT_OMISSION (very minor), cause: content.** K and V's own `X × Wk`/`X × Wv` projections are
asserted only in a caption ("the same multiplication happens for K and V…") rather than drawn, a
reasonable economy given `requiredConcepts` doesn't demand three repeated projection diagrams.

### 07 — multi-head-attention — 4/10

**CONTENT_OMISSION / VISUAL_HIERARCHY, cause: content (recurring pattern: decorative
placeholders standing in for the case's actual teaching point).** Reference-notes for this case are
explicit: "Every head gets its OWN Q/K/V weight matrices drawn side by side… 'separate learned
projection per head' is a spatial fact… not something stated only in prose." The generated scene
draws head 0, head 1, and head 7 with three identical small colored squares (pink/tan/blue) and one
identical solid dark-gray "Z" tile per head — there is no visual difference between any head's row
other than its number label. No per-head weight matrix is drawn at all (contrast case 06, where a
weight-matrix primitive with per-object identity clearly exists in this vocabulary and was used).
The concatenation step is a row of four blank, undifferentiated cells (the reference's equivalent
step uses distinct color bands per `Z0..Z7` to keep head identity visible through concatenation).
The result: the one thing this case exists to teach — that heads are *separately learned*, not
copies — is stated in a caption sentence and contradicted by the picture, which shows every head as
pixel-identical.
**Verified correct:** step order is right (concatenate → project with `Wo` → one output Z, matching
reference's 3-step recombination), and using rows-not-columns for heads is a legitimate
non-scored layout choice (exact coordinates aren't scored).

### 08 — transformer-block — 9/10

Strong. All five required concepts present and correctly composed: `LayerNorm(X+Z)` and
`LayerNorm(Z+FFN(Z))` equations are placed beside the boxes they describe and are architecturally
correct (I traced the second residual loop's origin point — it starts at the *output* of the first
add-&-normalize, i.e. Z, not at raw self-attention output, which is the right place for it to
start). Residual loops route cleanly outside the box column, no crossings or collisions found.
Repetition is conveyed via caption + "→ next encoder block" arrow rather than a labelled bounding
box — a reasonable substitution (arrow style / exact container shape aren't scored).

### 09 — encoder-decoder-attention — 9/10

Strong; correctly reproduces the sublayer order (self-attention → encoder-decoder attention → feed
forward) for both decoder layers, and correctly fans the "encoder 3 (top)" arrow out to **both**
decoder layers' encoder-decoder-attention boxes specifically (not to self-attention or feed-forward)
— matching reference-notes' emphasis that it's the top encoder reaching *every* decoder layer.
**Explicitly checked, not a finding:** I traced the vertical arrow chain in the right-hand column
and confirmed the two decoder layers ARE chained — a single arrow runs from the bottom layer's
`feed forward` box up into the top layer's `self-attention` box. (`SCORING.md`'s calibration note
records that an earlier "decoder columns are never chained" finding was checked against the
committed scene and disproven; I re-checked this against the current render independently and
confirm the chaining arrow is present — that finding should not recur, and does not need to here.)

### 10 — positional-encoding — 8/10

Strongest arithmetic in the set. Worked example: `embedding(river)[.30,-.20,.50,.10] +
positional(pos0)[.00,1.00,.00,1.00] = [.30,.80,.50,1.10]` — checked term-by-term, correct.
`flows, position 1`: `[.10,.40,-.30,.20] + [.84,.54,.01,1.00] = [.94,.94,-.29,1.20]` — correct.
The embedding vectors are also reused verbatim from case 06's X matrix (river/flows rows match
exactly) — good cross-case consistency, unlike case 04.
I derived the actual sinusoidal formula from the numbers: the 4-dim worked example uses
`d_model=4` (`PE(1,2)=sin(1/100)=.01, PE(1,3)=cos(.01)=1.00`, matches) and the 8-dim heatmap below
uses `d_model=8` (`PE(1,2)=sin(1/10)=.10, PE(1,3)=cos(.1)=.99`, matches) — these are two genuinely
different, both-correct computations, not an inconsistency (initially looked like one until
checked). Spot-checked further heatmap cells against `sin/cos`: pos2 d0/d1 = `sin(2)=.91,
cos(2)=−.42` ✓; pos4 d0/d1 = `sin(4)=−.76, cos(4)=−.65` ✓. The "low dims change fast, high dims
barely move" caption is also verified true of the actual rendered numbers (d6/d7 columns are
near-constant across all 8 rows; d0/d1 oscillate).
**CONTENT_OMISSION, cause: layout.** Reference-notes call out "the left/right split… corresponds to
the sine/cosine halves… keeping that structural fact visible at a glance." The generated heatmap
interleaves d0(sin), d1(cos), d2(sin)… with no grouping, divider, or sin/cos labelling — a learner
cannot tell from the picture that half the dimensions are sine and half are cosine. This is a real,
moderate gap in an otherwise excellent case (it's the one required-teaching-device from
reference-notes that didn't make it in, on a case that's meticulous everywhere else).

---

## critic-calibration (gradient-alignment) — scored separately, not part of the 9-case set

**Planted defect found and confirmed by computation.** `g1 = [0.8, 0.6]`, `g2 = [-0.5, 0.9]`
(read directly off the two colored strips). Displayed equation: `g1 · g2 = 0.83`. Actual:
`0.8×(−0.5) + 0.6×0.9 = −0.40 + 0.54 = 0.14`. The displayed value is wrong by 0.69 — not a rounding
issue, not derivable from any alternative reading of the two vectors (checked cosine similarity too:
`≈0.136`, still not `0.83`). This is a `TECHNICAL_CORRECTNESS` failure, cause: content.
**Secondary, lower-confidence observation:** the equation is visually connected to `g2` by an arrow
(`arrow-g2-eq`), but `g1` instead has an arrow to an unrelated "step direction" caption, not to the
equation — reference-notes require "the equation's operands must visibly correspond to the two
vectors drawn beside it," and only one of the two operands has that visible correspondence. I flag
this with lower confidence since I can't be sure it's a second planted defect versus an
intentional secondary annotation.

---

## Recurring findings (system-level, not scene-level)

1. **Decorative/unbacked numbers standing in for real per-token derivation** — cases 01, 03
   (identical false `.54`/`−.81` pair), and 04 (V vector reused from case 01 but re-purposed with a
   different meaning; south's row doesn't continue case 01/03's numbers at all despite being the
   "next step" of the same worked example per case 03's own reference-notes). Three of nine cases
   share one root cause: the "river/flows/south" worked example is not backed by one real,
   consistent per-token Q/K/V/score dataset threaded through the case series — each scene invents
   plausible-looking numbers for its own frame. Cause: **template** (no shared, derived fixture /
   no composition pattern for wiring a flow's single exemplar vectors into a matrix operation's
   per-token cells with real arithmetic) manifesting as **content** errors in each individual scene.
   This is corroborated by `SCORING.md`'s own admission that the checker meant to catch exactly
   this (`dot-arithmetic`) is inert on case 03 due to a schema mismatch — the false number it should
   have caught is sitting right there, unflagged, in both 01 and 03.
2. **Required pattern present in some sibling cases, silently dropped in others** — `06`, `08`, `10`
   number their stages ("1) / 2) / 3)"); `01` requires `progressive_hierarchy` per its own
   `target.json` and doesn't stage anything. Cause: **content** (author-level inconsistency, not a
   missing primitive — the numbering device clearly exists and is used elsewhere).
3. **Core teaching concept asserted in a caption but contradicted by the picture** — case 07 states
   "each head learns its own Q, K and V" while drawing every head identically. This is the sharpest
   single instance but is the same underlying failure mode as (1): a scene using placeholder/generic
   objects to stand in for a claim that needs to be spatially demonstrated.

## What I verified by computation vs. by eye

**Computed directly:** case 01 (Q·K = −0.81 vs displayed .54); case 03 (same, plus checked the
other two equations against the same K box); case 04 (√3 division chain, softmax via `exp`,
weight×value row, and the row's own sum against its displayed total); case 06 (all 9 cells of
QKᵀ/√dk, all 9 cells of softmax, all 9 cells of Z, three ways, to rule out rounding-chain
explanations before calling it clean); case 10 (both additions, and reverse-derivation of the
sinusoidal formula for both `d_model=4` and `d_model=8` panels, plus four spot-checked heatmap
cells); critic-calibration (dot product, plus cosine similarity as an alternate hypothesis).
**Checked by eye / tracing, not arithmetic:** case 02 (shape-only, nothing to compute), case 07
(structural comparison against reference-notes), case 08 and 09 (traced arrow topology and
sublayer order against reference structure; case 09's decoder-chaining arrow was traced explicitly
as a targeted check, not a general pass).

## Contamination statement

I did not open `independent-review.md`, any `critic-report.json`, any `generated/**/notes.md`,
`evaluation/current.json`, `evaluation/history/`, or any git log/diff before writing the scores
above. `SCORING.md` was read as required background; where it made a specific claim about a case
(09's chaining arrow, 03's inert checker), I re-verified that claim independently against the
current render rather than repeating it on trust, and said so inline.
