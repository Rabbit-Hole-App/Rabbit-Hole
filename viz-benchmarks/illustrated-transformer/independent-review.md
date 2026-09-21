# Independent visual review — illustrated-transformer static cases

Reviewer: independent critic, no authorship stake in these scenes.
Scope: `static-00.png` for cases 01, 02, 03, 04, 06, 07, 08, 09, 10. Case 05 excluded (text-medium, no diagram reference).

Contamination statement: this review was written entirely from `target.json`, `reference-notes.md`, the rendered `static-00.png` files, and the cached external reference images in `.local-benchmark-cache/illustrated-transformer/`. No `critic-report.json`, `notes.md`, `evaluation/current.json`, or `evaluation/history/` file was opened before the scores below were finalized. The delta table at the end was produced by reading the author's self-scores only after this point, as instructed.

Scale: 1-5, matching `evaluation-rubric.json`. That rubric also defines hard fails, one of which — **"technically false explanation"** — is triggered below.

---

## Case 01: arrow-into-label collision

Pixel-cropped both spots:

- The horizontal arrow carrying the "flows" row from the raw-score matrix into the softmax matrix terminates with its arrowhead drawn directly on top of the row label text "flows" (the arrowhead visibly overlaps the "s"). Crop evidence: region (1350,380)-(1750,560) of `static-00.png`.
- The arrow carrying the "south" row (query→key, feeding the score matrix, not softmax) has its arrowhead landing on the row label "south" on the score-matrix side, at (250,280)-(900,620). Same defect pattern, second occurrence, confirmed by pixel crop.

Both are exactly as described. This is `EDGE_ROUTING` / cause: **layout** (row-label text and arrow endpoints share the same anchor point; the primitive to offset one from the other clearly exists elsewhere in the same image — e.g. the column headers are never crossed).

This defect alone is a legitimate reason to distrust a 4.80/5 self-score on this case, and it turned out not to be the most serious problem in case 01 (see below).

---

## Per-case scores and findings

### 01 — self-attention-computation-flow — **3.0 / 5**

- **[EDGE_ROUTING, layout]** The arrow-into-label collision above: arrow-through-label, twice (into "flows" and into "south").
- **[TECHNICAL_CORRECTNESS, content]** Only one query vector and one key vector are drawn (`.90 -.40 1.30` and `.60 1.10 -.70`), yet the score matrix beside them has 3 distinct rows and 3 distinct columns (river/flows/south), which requires 3 distinct query vectors and 3 distinct key vectors to produce. The diagram never shows where rows/columns 2 and 3 of the matrix come from. Checked by hand: `Q · K` using the two vectors actually drawn = `.90×.60 + (-.40)×1.10 + 1.30×(-.70) = -0.81`, which does not equal any of the 9 cells shown in the matrix (.54, .99, -.63, -.24, -.44, .28, .78, 1.43, -.91). The worked vectors and the matrix are not the same computation. This recurs, more visibly, in case 03 (see below) — it is the same underlying example data.
- Positive: consistent color identity for Q/K/V through to the output box; one clean left-to-right reading order; softmax rows genuinely sum to 1 (.35+.55+.11≈1, .29+.23+.48=1, .32+.62+.06=1).

### 02 — qkv-projection — **4.0 / 5**

- Dimensionality change (4-wide embedding → 3-wide Q/K/V outputs) is visible without a caption, exactly what the reference notes call out as the thing that must survive.
- Color identity per role (magenta/Wq/Q, tan/Wk/K, blue/Wv/V) is carried correctly from weight matrix to output vector.
- **[CONTENT_OMISSION, content — minor]** The objective states "why three roles are needed rather than one"; the image teaches the shape of the projection but nothing about why Q/K/V are functionally distinct. Scope note says "projection step only," so this is a minor, defensible gap rather than a failure.
- The single shared input branching into three arrows (rather than three parallel rows as in the reference) is a legitimate alternate composition, not a defect — it still reads as "one source, three siblings," not a sequence.

### 03 — attention-score-matrix — **2.0 / 5 — hard fail (technically false explanation)**

- **[TECHNICAL_CORRECTNESS, content — hard fail]** The title promises "comparing one query against every key," but only **one** key vector is ever drawn (`.60 1.10 -.70`). Two arrows fan out of that single key box to two different labeled equations — `q_river · k_flows = .99` and `q_river · k_south = -.63` — which is mathematically impossible: one fixed vector dotted with one fixed vector produces exactly one number, not two different ones depending on which arrow you follow.
- Worse, the arithmetic on the one equation that *can* be checked is wrong: `q_river · k_river` is captioned as `= .54`, but the query and key vectors drawn (`.90,-.40,1.30` and `.60,1.10,-.70`) actually dot to `-0.81`. `.54` is only the first term of that dot product (`.90×.60`), not the sum. The reference notes specifically praise "an equation with named operands... a reader can verify the arithmetic, not just trust the label" — here, verifying the arithmetic proves it false.
- This is the same underlying example data as case 01 (identical Q, K values, identical matrix), so the defect is not isolated to one scene — see recurring findings below.
- Everything else about the case (layout, one clear reading direction, no overlapping text) is fine, but a diagram whose central worked equation is arithmetically false cannot score above the hard-fail floor.

### 04 — softmax-attention-weights — **4.2 / 5**

- Full arithmetic chain checks out: raw score `[4.33, .17, -3.11]` ÷ `√3` (the actual embedding dimension used throughout this benchmark, not a copy-pasted `÷8`) = `[2.50, .10, -1.80]`; softmax of that = `[.91, .08, .01]` (verified via `e^x` by hand); weighted sum using full precision = `.92`, matching the displayed output.
- Matches the reference's praised technique of visibly fading a near-zero-weight value cell (south's weight×value cell is drawn pale/light while river's is dark and saturated).
- **[TECHNICAL_CORRECTNESS, content — trivial]** The three *displayed* (rounded) weight×value cells (`.91, .03, -.01`) sum to `.93` by hand, not the `.92` shown as the final output — a rounding-display artifact, not a formula error, but it does undercut the "a reader can verify the arithmetic" property the case is going for.
- The worked numbers here do not match case 01's numbers for the same "south" token in the same toy sentence, but that is a cross-case continuity nit, not a same-case defect (each case is scored independently per its own scope).

### 06 — matrix-self-attention — **4.4 / 5 — best of the set**

- Fully end-to-end arithmetically verified by hand, at full precision: `X × Wq` values, then `QKᵀ/√dk`, then `softmax`, then `Z = softmax·V` all check out to two decimal places across multiple cells I spot-checked (including a case where I initially mistranscribed a V-matrix sign and got a divergent result — re-reading the source pixels confirmed the scene was right and my transcription was wrong). This is the only case where I could not find a single arithmetic inconsistency.
- Row identity (river/flows/south) is explicit and correct in "Q — still one row per token."
- **[VISUAL_HIERARCHY, layout]** Part 2 ("the rest of attention, condensed to one row of matrix operations") drops the river/flows/south row labels that Part 1 established. A learner tracking one specific token across the full pipeline loses the label exactly when the diagram compresses — the one place continuity matters most.

### 07 — multi-head-attention — **2.7 / 5**

- **[CONTENT_OMISSION, content]** The reference notes identify "every head gets its OWN Q/K/V weight matrices... a spatial fact, not something stated only in prose" as the single most important thing this diagram needs to get right. The generated scene shows small colored Q/K/V boxes per head but never draws the per-head weight matrices (`W0^Q`, `W1^Q`, …) at all — the fact that each head learns separately is asserted only in a caption sentence ("each head learns its own Q, K and V from the same input"), which is exactly the failure mode the reference notes warn against.
- **[VISUAL_HIERARCHY, content]** Confirmed by pixel sampling: the Z0, Z1, and Z7 output boxes are not merely similar, they are literally identical solid fills, RGB `(79,78,72)` at every sampled point, with no numbers or pattern inside. Multi-head attention's entire pedagogical point is that different heads learn to attend differently and therefore produce different outputs — rendering all outputs as one indistinguishable black square visually asserts the opposite of what the case exists to teach.
- The concatenation → `Wᵀ` → single output structure (3 explicit ordered steps) is correctly sequenced and matches the reference's structural approach without copying its surface — a legitimate, well-judged reuse of a general "ellipsis for the repeated middle" technique rather than reference-overfit.

### 08 — transformer-block — **3.8 / 5**

- Residual wiring is correct: the bypass line for the first residual originates at "input X" and lands at the first "add & normalize," matching `LayerNorm(X+Z)`, which is also written out as an explicit equation beside the boxes — directly mirrors what the reference notes praise ("a reader can move between the visual flow and the exact operation without translating").
- No arrow-through-label collisions found in this case.
- **[CONTENT_OMISSION, layout]** "Block repetition" is a required concept, but it is expressed only as a caption ("this whole block repeats, stacked N times"). Unlike the reference (which draws the block once inside a bounding box explicitly labelled "Encoder #1," making repetition a visual fact of the container), nothing here is visually stacked, bounded, or numbered — a learner has to take the sentence's word for it.
- Minor notational looseness: the label "Z" is reused for both the raw self-attention output and (implicitly) the post-LayerNorm value that feeds the second residual, in the equation `LayerNorm(Z + FFN(Z))`. This mirrors an ambiguity already present in the original Illustrated Transformer's own diagram, so it is not a new error introduced here — noted, not penalized.

### 09 — encoder-decoder-attention — **3.6 / 5**

- Structurally faithful to the concept that matters most here: "encoder-decoder attention" is drawn as its own labeled sublayer sitting between self-attention and feed-forward, in both decoder columns, exactly matching what the reference notes call out as the key visual fact.
- Good original touch: the top encoder is explicitly highlighted (green fill, "encoder 3 (top)") rather than just labeled, so "the TOP encoder specifically" reads as a visual fact, not something you have to infer from a number.
- **[CONTENT_OMISSION, template]** The two decoder columns are drawn side by side but are never connected to each other — there is no arrow from decoder-column-1's output into decoder-column-2's input. The encoder side explicitly shows stacking (arrows chaining encoder1→encoder2→encoder3), but the decoder side does not, even though the case scope is specifically about the encoder-to-every-decoder-layer connection implying a decoder *stack*. As drawn, the two decoder columns read as two parallel/independent decoders rather than sequential layers of one stack.

### 10 — positional-encoding — **4.5 / 5 — most technically rigorous case**

- Every number checked out. The two worked examples (`embedding(river) + positional(pos 0) = input`, `embedding(flows) + positional(pos 1) = input`) are exact arithmetic (`.30+.00=.30`, `-.20+1.00=.80`, etc.).
- The large 8×8 position/dimension table independently reproduces the actual sinusoidal positional-encoding formula: for `d_model=8`, I recomputed `sin`/`cos` pairs at multiple frequencies (`1`, `0.1`, `0.01`, `0.001`) for positions 0-3 and every value matched the displayed cell to 2 decimal places.
- **[COLOR_CONTRAST, verified positive]** Pixel-sampled the color scale directly: every cell with value `1.00` is the exact same RGB `(168,84,0)` and every cell with value `0.00` is the exact same RGB `(242,242,242)`, regardless of row or column — a single, non-rescaled color scale across the whole grid, which is precisely what the reference notes require and precisely the thing that is easy to get wrong (per-row auto-scaling is a common charting-library default).
- No defects found. The only mild caution is information density (two worked examples plus an 8-column, 8-row table on one static frame), but it stays legible and well-labeled.

---

## Recurring findings (system-level, not scene-level)

1. **Worked vectors don't arithmetically match the matrix/equation shown beside them.** Cases 01 and 03 share the same toy numbers, and in both cases a single representative Q vector and a single representative K vector are drawn while the diagram claims or implies results for 3 distinct token comparisons that a single vector pair cannot produce. This is the same underlying example-data bug appearing in two cases, not two independent scene mistakes — it fits the SCORING.md definition of "a system problem wearing a disguise." Cause: **content** (the vocabulary can clearly render 3 vectors — case 06 and case 07 both do — so this is a data-generation/authoring bug in whatever produced this specific worked example, not a missing primitive).
2. **Continuity (labels or connections) established early in a scene is dropped once the diagram compresses to a repeated or condensed section.** Case 06 drops row labels in its "condensed" second half; case 08 states repetition only in a caption instead of a visual container; case 09 fails to chain its two decoder columns into an actual stack. Three different cases, same shape of failure: whatever handles "now show N of these compressed/repeated" doesn't carry forward the identity/connectivity established in the uncompressed version. Cause: **template** — no existing composition pattern for "repeat this and keep the labels/links that matter," so each scene improvises differently and each improvisation drops something.
3. **Undifferentiated fill color reused for objects that are supposed to be different.** Case 07's Z0-Z7 boxes are pixel-identical. This is currently a single occurrence, so it is a scene problem for now, but it's worth watching for since it directly contradicts a case's teaching objective rather than being a cosmetic nit.

Positive recurring pattern, worth naming since an honest review should note what generalizes well too: leaving learned-weight-matrix cells blank/gray (shape-only, "values don't matter yet") is used consistently and correctly in cases 02, 06, and 07, and it is a legitimate, deliberate simplification rather than a missing-data bug.

---

## Delta table — my score vs. the author's self-score

Read only after the scores above were finalized and written to this file.

| case | my score | author score | delta | biggest disagreement |
|---|---|---|---|---|
| 01 self-attention-computation-flow | 3.0 | 4.80 | +1.80 | Author logged exactly the arrow-into-label collision (`row-highlight-crowds-row-label`, minor/template) and nothing else. Never flagged that the single displayed Q and K vectors cannot produce the 3x3 score matrix beside them — the deeper of the two problems in this case, unflagged. |
| 02 qkv-projection | 4.0 | 4.93 | +0.93 | Close agreement; both reviews treat this as a strong case. |
| 03 attention-score-matrix | 2.0 | 4.93 | **+2.93 — largest disagreement** | Author's pattern note explicitly credits this case with "matching the reference's own winning technique (verifiable arithmetic)" and scores technicalCorrectness 5/5. Verifying that arithmetic by hand shows it is false: the query/key vectors drawn dot to `-0.81`, not the `.54` the equation claims, and only one key vector is drawn despite the title promising a comparison against "every key." This meets the case's own rubric definition of a hard fail ("technically false explanation") and was not caught. |
| 04 softmax-attention-weights | 4.2 | 4.93 | +0.73 | Close; my only objection is a rounding-display artifact in the weight×value cells. |
| 06 matrix-self-attention | 4.4 | 4.93 | +0.53 | Closest agreement in the set. Author logged zero first-draft defects for this case; I'd dock a small amount for the dropped river/flows/south labels in the condensed second half, which they did not treat as a finding. |
| 07 multi-head-attention | 2.7 | 4.53 | +1.83 | Author noticed the symptom (Z0/Z1/Z7 render as a "stark near-black square... more like a void") but filed it as a defensible cosmetic choice with technicalCorrectness and conceptualCompleteness both still at 5. I score it as a conceptual failure: pixel-sampling confirms the three boxes are literally identical, which visually asserts the opposite of the case's teaching point (heads produce different outputs). Author also never flagged the complete absence of per-head weight matrices, despite the case's own reference-notes calling that the single most important thing to get right. |
| 08 transformer-block | 3.8 | 4.80 | +1.00 | Author's visualHierarchy (4, not 5) acknowledges a uniform-role choice across distinct boxes but treats it as a non-defect. Neither review's score gap is huge, but I weight the caption-only "block repeats" gap (no visual container/labelling of repetition) more heavily than they did. |
| 09 encoder-decoder-attention | 3.6 | 4.80 | +1.20 | Author's only logged issue is a fixed first-draft heading/label overflow. The larger remaining gap — the two decoder columns are never connected to each other, so the "stack" reads as two parallel decoders — was not flagged. |
| 10 positional-encoding | 4.5 | 4.87 | +0.37 | Closest to agreement on the strongest case in the set; both reviews rate it highly. |
| **average** | **3.58** | **4.83** | **-1.25** | |

The pattern across every large disagreement is the same: the author's critic reliably catches first-draft layout mechanics (overflow, clipped headings, arrow-crosses-caption) because those are visually obvious and get fixed before finalizing — but it does not re-derive the arithmetic behind a "verifiable" worked example, and it treats a symptom that contradicts the case's core teaching point (case 07's identical Z boxes) as a cosmetic footnote rather than a conceptual failure.

