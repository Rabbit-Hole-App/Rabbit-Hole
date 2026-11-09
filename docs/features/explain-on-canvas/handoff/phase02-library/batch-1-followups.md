# Batch 1 SVG follow-ups

Base `c92ec1279` on `chatgpt/explain-phase02-library`. The changes use the existing TutorDiagram renderer, diagram grammar and teaching palette.

## Renderer

| Case | Expected result | Preview and saved spec |
| --- | --- | --- |
| Sequence self-message | A loop leaves and returns to the receiver lifeline. Its own label reads “Decrypt with private key.” The parser requires an ordinary message immediately before and after each self-message. | [SVG](illustrations/sequence-self-message/408.svg) · [JSON](illustrations/sequence-self-message/spec.json) |
| Converging flow edges | Three “No” routes enter “Bill dies” at separate top ports. The near approaches turn before the outer approaches. The existing label collision check keeps each label clear of other wires. | [SVG](illustrations/flow-converging-arrivals/408.svg) · [JSON](illustrations/flow-converging-arrivals/spec.json) |
| Two attention heads | Head A and Head B each retain the six token positions and the original weights for sat. At 912 px they fit side by side with 56 px boxes. At 960 px the boxes are 60 px wide. The panels stack below 912 px and the 408 px request produces a 458 px scrollable SVG. | [Stacked](illustrations/ml-transformer-parallel-attention-heads/408.svg) · [912 px](illustrations/ml-transformer-parallel-attention-heads/natural.svg) · [960 px](illustrations/ml-transformer-parallel-attention-heads/960.svg) · [JSON](illustrations/ml-transformer-parallel-attention-heads/spec.json) |

The two-head reference retains its separate output projection. Its linked offline single-diagram variant groups the same weights by token in a bar chart. The Balanced panel spec uses 219 compact tokens and the bar chart uses 147. [Variant catalogue](../../../../../packages/web/src/tutor-diagrams/reference-single-variants.js)

## References

| Learner prompt | What to check | Natural-width SVGs | Compact tokens, Brief / Balanced / Detailed |
| --- | --- | --- | ---: |
| How does a database index speed up a query? | An order-4 B-tree uses two levels, sorted keys and three child ranges. The highlighted middle branch finds 32. The caption compares a scan of up to $N$ rows with $O(\log N)$ node visits for a key lookup. | [Brief](illustrations/tree-btree-lookup-brief/natural.svg) · [Balanced](illustrations/tree-btree-lookup/natural.svg) · [Detailed](illustrations/tree-btree-lookup-detailed/natural.svg) | 157 / 163 / 179 |
| How does the call stack work during recursion? | One layers visual shows three factorial frames pushed, marks the base case at 1, then pops the frames with return values 1, 2 and 6. | [Brief](illustrations/recursion-factorial-unwind-brief/natural.svg) · [Balanced](illustrations/recursion-factorial-unwind/natural.svg) · [Detailed](illustrations/recursion-factorial-unwind-detailed/natural.svg) | 208 / 226 / 267 |
| What is Big-O notation? | Four curves show work on a linear scale from 0 to 100 for input sizes 1 to 10. The logarithmic and quadratic curves have right-edge labels. Detailed follows the linear plot with a log-scale view that adds $O(n\log n)$. | [Brief](illustrations/big-o-growth-rates-brief/natural.svg) · [Balanced](illustrations/big-o-growth-rates/natural.svg) · [Detailed linear](illustrations/big-o-growth-rates-detailed/natural.svg) · [Detailed log](illustrations/big-o-growth-rates-detailed-detail/natural.svg) | 469 / 492 / 492 + 877 |

The first Big-O visual shows $\log_2 n$ starting at zero. At $n=10$, linear work reaches 10 and squared work reaches 100. The Detailed second visual spans inputs 1 to 16 and explains how the log axis makes the smaller counts easier to compare. It uses $1+\log_2 n$ and $n(1+\log_2 n)$ to keep the logarithmic and log-linear counts positive. The complete author packets use 526, 549 and 1,429 compact tokens across the three depths.

The renderer supports up to five series and `endLabel: true` on a line ending at the x-axis maximum. Labels at nearby heights are spaced apart, and shared-axis panels reserve matching gutters.

The preview manifest records the requested and actual dimensions at 408, natural and 960 px. The flow, sequence, tree, layers and coordinate-plot renders use the existing 720 px cap for a 960 px request. [Manifest](illustrations/manifest.json) · [Reference source and paraphrases](../../../../../packages/web/src/tutor-diagrams/batch-1-followup-references.js)

## Gemma FFN detail

The Detailed reference says when to include the gate as Visual 2. One linear branch goes through GELU, then multiplies with the other linear branch before the output projection. The existing FFN block points to this separate visual with `detail: 2`. [Detailed decoder](illustrations/ml-gemma-decoder-stack-detailed/natural.svg) · [Gated FFN](illustrations/ml-gemma-decoder-stack-detailed-detail/natural.svg) · [Reference guidance](../../../../../packages/web/src/tutor-diagrams/illustration-architecture-references.js)

## Verification and integration

- The 14 new prompts and paraphrases selected the intended reference in all 42 prepared author requests across three depths. The existing selector bench replayed 42 originals and 210 paraphrases with identical picks. Another 594 selections across 198 existing registry prompts and all three depths matched the base. [Selector replay instructions](set3/README.md#paraphrase-benchmark)
- At `9580d7a4`, the SVG suite had 850 fingerprints. There were 33 additions, 12 expected changes and 805 matches against the base. Nine changes were the three depths of the two-head comparison. Three were the staggered flow arrivals in `ml-gpu-matmul`.
- The Big-O revision updated nine primary captures and added three Detailed log captures. All other 841 fingerprints matched `9580d7a4`. The 12 Big-O prompt and depth combinations sent the expected spec or spec pair in the prepared author packet. All 235 preview exports match their fingerprints. All 1,037 focused tests and the web build passed.
- The full diagram and author tool schemas grew by 953 serialized characters. The measured Gemini Step 6 request still reduces comparison to the list form, so it omits the nested token-links panels. [Schema measurements](illustration-primitives.md#gemini-compatible-bundles)

For integration, preserve a valid sequence self-message through the server's folding step and align the author guidance with the five-series plot limit. Live acceptance covers the decryption loop, the three No branches, the two attention heads in Gemini, the three learner prompts and the Gemma `secondVisual` result. This handoff verifies the renderer and prepared reference packets offline.

Regenerate the SVG exports with `node packages/web/scripts/illustration-previews.mjs docs/features/explain-on-canvas/handoff/phase02-library/illustrations`. Update intended fingerprints with `UPDATE_TUTOR_SVG_SNAPSHOTS=1 node --test packages/web/src/tutor-diagrams/svg-snapshots.test.mjs`.
