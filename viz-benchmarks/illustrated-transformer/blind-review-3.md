# Blind review 3 — Illustrated Transformer (static)

Independent visual critic pass. No prior review, prior critic-report.json, notes.md
under generated/, evaluation/current.json, evaluation/history/, git log, or diff was
opened. The one piece of prior material that *was* read is `viz-benchmarks/SCORING.md`,
because the task explicitly assigned it as required reading — see the disclosure at
the end of this report; it names a debt note about case 03 that this review verified
independently rather than repeating on trust.

Case 05 (causal masking) is out of scope — text-medium, no diagram, per SCORING.md.

## Overall verdict

**ACCEPTED WITH FIXES**

The content is unusually solid: every arithmetic pipeline I re-derived by hand or by
script — nine cases, well over 120 individual displayed numbers — came back correct
to rounding precision. That includes two cases (03, 06) where the numbers are
authored as bare literals with no `$derive` tag, meaning no automated check protects
them at all; a human/critic pass is the *only* verification they ever get, and they
hold up.

Against that, one systemic layout defect recurs in **7 of the 9 scored cases** (plus
`gradient-alignment/01-dot-product-alignment`), and in four of those it produces literal, illegible
character-level text overlap, not just tight spacing. A second, narrower defect
(row-label clipping at the canvas edge) recurs in 3 of 9. Both are single, well-
understood root causes — not scattered unrelated bugs — which is why this is "accept
with fixes" rather than "reject": fixing two shared primitives/templates clears the
majority of findings below.

## Recurring findings (system-level — read this section first)

### Finding A — label positioned closer to the preceding element than to its own content

**Taxonomy:** LAYOUT (in 02/07/10 it crosses into outright unreadable text, which is
also a readability/VISUAL_HIERARCHY failure). **Cause:** `template` — the generic
vertical-stack-of-labeled-objects layout (used by `strip` and `grid` with a `label`)
reserves a large gap between an item's label and *its own* box, but a much smaller
gap between the *previous* item's box/caption and the next label. Reading order
therefore attaches every second-and-later label to the wrong neighbour.

Verified by direct pixel measurement (not just eyeballing) in two independent
scenes, then confirmed by eye (with coordinates cross-checked against the
scene-spec) in the rest:

- **gradient-alignment/01-dot-product-alignment** — "gradient 2 (g2)" sits 14px below the g1 box but 47px
  above its own g2 box (measured at `x=100`, PowerShell `Bitmap.GetPixel` scan).
  Same ~48px offset is used correctly for "gradient 1 (g1)" above its own box,
  confirming the template applies one offset uniformly without accounting for
  the box immediately above eating into it.
- **case 01** — "key (K)" sits 13px below the Q box, 41px above the K box; "value
  (V)" sits 8px below the K box, 47px above the V box (same pixel-scan method,
  x=110, scaled 2×). Tight but not overlapping here.
- **case 02** — no longer just tight, it **overlaps**: "learned weights (Wq)"
  visually interleaves with the caption line above it ("...values do not matter
  yet"), and "learned weights (Wk)" / "learned weights (Wv)" sit on top of the
  bottom border of the *previous* weight-matrix grid. All three instances visible
  directly in the render.
- **case 04** — heading ("...sum to one") and the "Value (V) - one number per
  token, for reference" label crowd to within ~11–25px of each other at the top
  right (pixel scan at y=40–55); not conclusively overlapping characters, lower
  confidence, flagged as crowding rather than collision.
- **case 07** — three separate, unambiguous overlaps: "Z0" merges into the line
  "...each head learns its own Q, K and V from the same input"; "Z1" floats
  between head 0's row and the "head 1" label, reading as attached to head 0;
  "Z7" merges into "...5 more heads, computed the same independent way...". All
  three visible directly in the render, and confirmed against scene-spec y-
  coordinates (each `note`/label pair is separated by ~2–20 scene units where
  ~70+ would be needed).
- **case 10** — the worst instance: "the same addition applies to every
  position..." literally overlaps "positional encoding: every position, every
  dimension" — character strokes cross in the render.

Not present in **case 08** or **case 09** — both use the `box`+`arrow` flow-diagram
vocabulary with generous (50–100 scene-unit) gaps rather than the tight
`strip`/`grid`-with-label stack, which narrows the fix: this is a defect in the
label-stack template/primitive specifically, not a property of the renderer as a
whole.

### Finding B — row labels clipped at the canvas left edge

**Taxonomy:** LAYOUT / readability. **Cause:** `primitive` — the `grid` primitive's
`rowLabels` render to the left of the grid without reserving or measuring a margin,
so when the grid sits near `x≈40` (scene units), the labels run off the left edge of
the canvas.

Confirmed directly in the render, three times:
- **case 03** — "river/flows/south" render as "ver/ows/uth".
- **case 06** — same clipping on the X matrix's row labels.
- **case 10** — "pos0..pos7" render as "os0..os7" (the "p" is cut off) on the 8×8
  heatmap.

Column labels are never clipped in any case — this is specifically a left-margin
problem for row labels, confirming the mechanism rather than a general text bug.

## Per-case findings

### 01 — self-attention-computation-flow — 7/10
Reference: `reference/synthetic/static-00.png` (this case's declared reference is the
internal synthetic reconstruction, not the external jalammar capture — per its own
`target.json`).

- **Verified correct by computation:** all 9 QKᵀ scores, all 9 softmax weights (each
  row's un-rounded values sum to 1.0000), and all 3 output values. Full chain:
  Q/K/V (3×3 each) → matmul → softmax → weighted sum of V using the "south" row —
  every one of the 12 displayed numbers matches to the displayed precision.
- **CONTENT_OMISSION, cause: content.** The "query (Q)"/"key (K)"/"value (V)" strip
  shown on the left are `Q[0]/K[0]/V[0]` — i.e. token **river**'s projections — while
  every other highlighted element in the scene (the bold-filled input token, the
  bold-bordered row in both matrices, the bold-bordered output cell) consistently
  traces token **south** (`row 2`, per the scene's own `highlight_cell` timeline and
  `weighted_sum(weights.2, V)`). A learner following the highlighted thread from
  input → output would expect the Q/K/V panel to belong to south; it belongs to
  river instead. This is the scene's own stated failure condition — reference-notes.md
  lists "Q/K/V identities change midway" as a Failure If — so I'm holding it to its
  own bar, not an external one.
- **Finding A**, moderate severity (tight, not overlapping): see above.
- Checked and fine: scores/weights use visually distinct colour families (signed
  diverging vs. magnitude single-hue) — "scores and weights look indistinguishable"
  does not occur here.

### 02 — qkv-projection — 5/10
Reference: `.local-benchmark-cache/illustrated-transformer/transformer_self_attention_vectors.png`.

- **Finding A, severe** (three literal overlaps): see above. This is the worst
  content-legibility hit in the suite outside of case 10.
- **EDGE_ROUTING, cause: primitive.** The arrow from "word" into "embedding (X)"
  terminates (150,152 scene units) essentially on top of the embedding label's own
  text, and the arrowhead visibly pierces the "(X" characters in the render. Arrows
  are authored with raw coordinates and have no collision-avoidance against known
  text bounding boxes.
- Checked and fine: colour identity is carried correctly from each weight matrix's
  border to its output vector's fill (Wq pink ↔ Q pink, Wk tan ↔ K tan, Wv navy ↔ V
  navy) — this is exactly what the reference notes call out as the key success
  factor, and it holds. Output vectors are also correctly drawn narrower (3 cells)
  than the input embedding (4 cells), and the underlying shapes are dimensionally
  real: 1×4 input × 4×3 weight = 1×3 output, matching matrix-multiplication rules
  even though no numbers are shown (deliberately — "values do not matter yet" per
  reference-notes.md, and the scene correctly uses `null` values throughout, which
  also means there is no numeric-error surface here).

### 03 — attention-score-matrix — 7/10
Reference: `.local-benchmark-cache/illustrated-transformer/transformer_self_attention_score.png`.

- **Verified correct by computation — this is the case SCORING.md flags as debt.**
  SCORING.md documents that the automated `dot-arithmetic` checker is inert here
  (it can't resolve operands from a `matrixKind: input` grid) and explicitly asks a
  human pass to cover the gap it left. I recomputed all three named-operand
  equations by hand: `q_river·k_river = -0.81`, `q_river·k_flows = -0.33`,
  `q_river·k_south = 1.39` — all three match the render exactly, and all three also
  match the matching row of case 01's independently-verified score matrix. The
  known debt is *debt, not a live bug*: I can now say that positively rather than
  just cite the note.
- **Finding B**: row labels clipped ("ver/ows/uth"). Same bug as case 06 and 10.
- Checked and fine: the bold-bordered focal cell (river's Q, highlighted) correctly
  threads through to the bold-bordered output row on the right; the reference's
  named-operand-equation teaching device ("a reader can verify the arithmetic, not
  just trust the label") is genuinely delivered, and delivers a true result.

### 04 — softmax-attention-weights — 8/10
Reference: `.local-benchmark-cache/illustrated-transformer/self-attention_softmax.png`.

- **Verified correct by computation, 6-stage pipeline.** raw score (south's row) →
  ÷√3 → softmax → per-token scalar value → weight×value → summed output. All 3 raw
  scores, all 3 scaled scores, all 3 softmax weights, all 3 value-row scalars, all 3
  contributions, and the final output scalar match a precise Node re-computation.
  Worth flagging explicitly: my first pass at the final output used hand Taylor-
  series approximations for the exponentials and got 0.495 → would have rounded to
  "0.50" and been reported as a bug against the rendered "0.49". A precise
  computation puts the true value at 0.494972 (below the 0.495 rounding boundary),
  which correctly rounds to 0.49 exactly as rendered. Recorded here as a caught
  near-miss, not a finding — the scene is right, my first estimate was wrong, and
  only the script-based recheck caught the difference.
- **Finding A, minor** (crowding, not confirmed overlap): heading vs. the "Value
  (V)..." label at top right, ~11–25px gap.
- Checked and fine: the pipeline correctly extends past softmax into weight×value
  and a summed output, matching one of the reference's two source diagrams; the
  scores-vs-weights colour distinction again holds.

### 06 — matrix-self-attention — 7/10
References: `self-attention-matrix-calculation.png`, `self-attention-matrix-calculation-2.png`.

- **Verified correct by computation — 27 displayed values, zero `$derive` tags.**
  Unlike cases 01/03/04, every number in this scene (Q, K, V, the scaled QKᵀ scores,
  softmax, and Z) is a hand-authored literal with no automated derivation guard at
  all. I recomputed QKᵀ/√3 → softmax → Z from the displayed Q/K/V and compared
  against the displayed scores/softmax/Z: matches to 3 decimal places throughout
  (the two 0.001 deltas are pure rounding, e.g. computed -0.220 vs. displayed
  -0.221). This is the case most exposed to an undetected wrong-number bug in the
  whole suite, and it is correct.
- **Finding B**: X matrix row labels clipped ("ver/ows/uth"), same bug as 03/10.
- **CONTENT_OMISSION, cause: content.** The Wq weight-matrix grid has no `identity`
  field in its scene-spec (`role: "neutral"` only), so it renders as a plain grey
  grid with no colour link to Q — losing exactly the "each learned weight matrix
  keeps its own stable colour identity, carried through to the output vector"
  device the reference notes name as a defining strength. This is a real
  inconsistency, not a vocabulary gap: case 02's `w-query` object sets
  `"identity": "query"` and renders correctly coloured; case 06 simply omits the
  field on the equivalent object.

### 07 — multi-head-attention — 5/10
References: `transformer_attention_heads_qkv.png`, `transformer_multi-headed_self-attention-recap.png`.

- **Finding A, severe, three instances** (Z0, Z1, Z7 all collide with neighbouring
  text): see above. This is the case with the most instances of the recurring bug.
- **TECHNICAL_CORRECTNESS, cause: content.** The `wo` output-projection grid is
  authored 4 rows × 2 cols, but `final-output` is drawn with 3 cells, not 2. Read
  literally (as the case's own "shape only, values do not matter yet" convention —
  established correctly in cases 02 and 06 — asks a viewer to), a 1×4 concatenated
  vector × a 4×2 matrix must produce a 1×2 result, not 1×3. This is verifiable
  straight from the scene-spec (`wo.cols: 2` vs. `final-output.cols: 3`) without
  needing the render, and it is visibly present in the render too (I counted the
  Wo grid's columns directly: 2, not 3).
- Checked and fine: head count is internally consistent (head 0, head 1, "...5 more
  heads...", head 7 = 8 total); Q/K/V colour identity is correctly consistent
  within each head row and across the whole suite; each head's Z output gets its
  own distinct fill colour, a reasonable substitute for the reference's literal
  side-by-side columns given the vertical-stack layout this case chose instead.

### 08 — transformer-block — 9/10
Reference: `transformer_resideual_layer_norm_2.png`.

- No arithmetic in this scene (pure structural flow diagram) — nothing to verify
  numerically, and no risk of a numeric error either.
- **Verified by tracing coordinates, not just eyeballing:** both residual bypass
  loops are correctly wired. Bypass 1 leaves input-X's left edge, routes around the
  self-attention box, and arrives at add&normalize-1's same left edge that
  self-attention's own output arrow feeds into (matching `LayerNorm(X+Z)`). Bypass 2
  leaves add&normalize-1's top-left corner, routes around feed-forward only, and
  arrives at add&normalize-2 (matching `LayerNorm(Z+FFN(Z))`). Traced every
  from/to coordinate against the box boundaries in the scene-spec — no
  crossed-wire errors.
- No instance of Finding A or B here — generously spaced `box`+`arrow` vocabulary,
  reinforcing that the recurring bug is confined to the label-stack template, not
  universal.
- Cleanest case in the suite: correct block-repeat count (5 background cards + 1
  main = "#6 total, stacked"), clear input-X highlight as the entry point, both
  equations placed beside their corresponding boxes exactly as the reference notes
  ask.

### 09 — encoder-decoder-attention — 8/10
Reference: `Transformer_decoder.png`.

- **Verified by tracing coordinates, not just eyeballing:** I traced
  `arrow-layer1-layer2` in the current scene-spec (`from (530,400)` =
  feed-forward's top edge of decoder layer 1, `to (530,350)` = self-attention's
  bottom edge of decoder layer 2) and then looked at the actual render: the
  vertical arrow connecting the two decoder columns is clearly present and
  correctly placed, so the two decoder columns read as one connected stack
  rather than two parallel decoders.
- Both encoder→decoder fan-out arrows correctly target the encoder-decoder-attention
  box specifically in each decoder layer (not self-attention, not feed-forward) —
  matches the semantic requirement that only cross-attention receives encoder K/V.
- No instance of Finding A or B — same generously-spaced `box` vocabulary as case 08.
- Minor, not scored as a failure: two connecting arrows rather than the reference's
  one, but the case's own reference notes explicitly ask for exactly this second
  diagram (fan-out to every layer) merged into the same frame — a deliberate,
  justified compression, not a flaw.

### 10 — positional-encoding — 6/10
Reference: `transformer_positional_encoding_large_example.png`.

- **Verified correct by computation — the largest numeric surface in the suite.**
  The full 8×8 (64-value) sinusoidal positional-encoding heatmap matches the
  standard `PE(pos,2i)=sin(pos/10000^(2i/d))`, `PE(pos,2i+1)=cos(...)` formula with
  `d=8` to within 0.0005 (pure 3-decimal rounding) at every one of the 64 cells —
  checked with a script, not by eye, because hand-checking 64 values is exactly the
  kind of task that produces false confidence. Both worked rows also check out
  exactly: `embedding(river) + positional(pos0) = [.30,.80,.50,1.10]` and
  `embedding(flows) + positional(pos1) = [.94,.94,-.29,1.20]`.
- **Finding A, severe:** the "the same addition applies to every position..." caption
  literally overlaps "positional encoding: every position, every dimension" — worst
  instance of this bug in the suite.
- **Finding B:** row labels clipped ("pos0..pos7" → "os0..os7" on the 8×8 grid).
- **CONTENT_OMISSION, minor, cause: content.** The heatmap interleaves sin/cos by
  dimension (d0=sin,d1=cos,d2=sin,...) rather than splitting into a sin-half /
  cos-half. This is not incorrect — the "low dimensions change fast, high ones
  barely move" caption is still true under either convention — but the case's own
  reference-notes.md names "the left/right split... corresponds to the sine/cosine
  halves, keeping that structural fact visible at a glance" as one of only four
  named success factors, and this scene doesn't attempt it even though nothing in
  `useExistingVocabularyOnly`/`doNotCopyReference*` would have prevented reordering
  the columns and labels to achieve it within the existing grid primitive.
- Checked and fine: positional vector drawn the same 1×4 shape as the token
  embedding it's added to (not concatenated); one consistent colour scale reads
  correctly across the whole 8×8 grid by eye (spot-checked column d1's 8 values
  against their fills for sign/magnitude consistency).

## What I verified computationally vs. by eye

**By script/computation (Node.js or PowerShell pixel sampling), not by eye:**
case 01 full 12-value pipeline; case 03 three named-operand equations; case 04
six-stage, 15-value pipeline (including the near-miss described above); case 06
27-value pipeline with zero automated guard; case 10 the full 64-value heatmap plus
two addition rows; case 01's and gradient-alignment/01-dot-product-alignment's
label-gap pixel measurements.

**By eye, cross-checked against scene-spec coordinates but not pixel-measured:**
case 02's arrow-into-label collision and colour-identity consistency; case 06's
missing Wq identity field; case 07's three label collisions and the Wo/output
dimension mismatch (the dimension mismatch was also confirmed directly from the
scene-spec numbers, independent of the render); case 08's and case 09's wiring
traces; case 03's/06's/10's row-label clipping.

## What I checked that turned out fine

Scores-vs-weights colour distinction (cases 01, 04, 06); colour identity carried
from weight matrix to output vector (case 02, and by omission, its absence in case
06); correct narrower output-vector width vs. input embedding (case 02); correct
matrix dimensions for "shape only" schematics in cases 02 and 06 (case 07's failed
the same check); residual bypass wiring correctness (case 08); encoder→decoder
fan-out targeting only the cross-attention sublayer (case 09); one consistent
colour scale across the full positional-encoding heatmap (case 10); case 09's
decoder-column chaining arrow, specifically re-verified rather than assumed.

## Disclosure

I read `viz-benchmarks/SCORING.md` because it was explicitly named as required
reading in this task's instructions. It states the automated `dot-arithmetic`
checker is inert on case 03 for a specific technical reason (it can't resolve
operands from a `matrixKind: input` grid), and frames this as debt a human pass
should cover. I used that framing to decide where to spend manual-verification
effort, then did the verification myself (see case 03 above) rather than
assuming the note's implied "probably fine."

I did not open, read, or grep `independent-review.md`, `blind-review-2.md`, any
`critic-report.json`, any `generated/*/notes.md`, `evaluation/current.json`, any
file under `evaluation/history/`, or any git log/diff describing repairs. All
findings above were reached from `target.json`, `reference-notes.md`,
`scene-spec.json`, the rendered `static-00.png` files, the cached/synthetic
reference images, and direct computation/pixel-sampling.

## Commit

This file was committed immediately after being written; the commit SHA is
reported alongside this review, not inside it.
