# Static SVG illustration primitives

Written `/explain` now supports tensor strips, weighted links between tokens, and nested architecture stacks. The author supplies semantic JSON. TutorDiagram draws the geometry, arrows and labels with the existing teaching palette.

## Reference cards

| Learner prompt | What to check | Natural-width SVG and JSON |
| --- | --- | --- |
| How does a transformer get query, key and value vectors from one token? | One input strip feeds three separate learned projections. Four strips fit on one row at their natural width. Cells show excerpts of the labelled vector dimensions. | [SVG](illustrations/ml-transformer-qkv-projections/natural.svg) · [JSON](illustrations/ml-transformer-qkv-projections/spec.json) |
| When the word sat attends to the sentence the cat sat on the mat, which words matter most? | The repeated words keep separate positions. The six weights sum to 1 and the arrow to `cat` carries the visible maximum of 0.45. | [SVG](illustrations/ml-self-attention-token-links/natural.svg) · [JSON](illustrations/ml-self-attention-token-links/spec.json) |
| What is inside one transformer encoder layer and why is it repeated? | One inset flow shows self-attention, add and norm, feed-forward, and add and norm. The encoder layer repeats six times. | [SVG](illustrations/ml-transformer-encoder-stack/natural.svg) · [JSON](illustrations/ml-transformer-encoder-stack/spec.json) |
| What happens inside one Llama-style decoder block? | Pre-normalization, grouped-query attention and SwiGLU have two residual adds and a ×32 bracket. Detailed includes the dimension note. | [SVG](illustrations/ml-llama-decoder-block-detailed/natural.svg) · [JSON](illustrations/ml-llama-decoder-block-detailed/spec.json) |
| How does a dense decoder block differ from one with mixture-of-experts feed-forward layers? | Both panels preserve the same attention path. The FFN blocks get blue emphasis. Detailed shows the dense gate and expert selection as separate inset flows. | [SVG](illustrations/ml-dense-vs-moe-architecture-detailed/natural.svg) · [JSON](illustrations/ml-dense-vs-moe-architecture-detailed/spec.json) |
| How does a mixture-of-experts router choose the top two experts for one token? | Eight routed experts and one shared expert appear once each. Two blue routes branch in parallel and rejoin the shared expert at the merge. | [SVG](illustrations/ml-moe-top-two-experts/natural.svg) · [JSON](illustrations/ml-moe-top-two-experts/spec.json) |
| How is the Gemma 3 27B decoder arranged and what is inside its feed-forward block? | Detailed shows a ×62 layer group, pre/post normalization, 5:1 sliding-window/global attention, QK-Norm and RoPE inputs, residual adds, and four callouts. `Visual 2` points to the separate gated FFN. Brief shows one stack with plain labels. | [Decoder SVG](illustrations/ml-gemma-decoder-stack-detailed/natural.svg) · [JSON](illustrations/ml-gemma-decoder-stack-detailed/spec.json) · [FFN SVG](illustrations/ml-gemma-decoder-stack-detailed-detail/natural.svg) · [JSON](illustrations/ml-gemma-decoder-stack-detailed-detail/spec.json) · [Brief SVG](illustrations/ml-gemma-decoder-stack-brief/natural.svg) |

The QKV and attention values illustrate the mechanisms. The Gemma dimensions come from the published 27B configuration. The vocabulary callout is rounded. Its author reference cites the accessible config mirror in `useWhen`. [Alammar transformer illustrations](https://jalammar.github.io/illustrated-transformer/) · [Raschka architecture figures](https://sebastianraschka.com/llm-architecture-gallery/) · [Gemma 27B config](https://huggingface.co/mlx-community/gemma-3-27b-it-qat-3bit/blob/main/config.json)

## Schema and rendering

- `tensor` shows up to eight visible cells and a dimension label of up to 12 characters. Supply values for every visible cell or omit them for a shape-only strip. The same payload can appear in flow nodes, relationship nodes, transformation items, and block stacks.
- `token-links` accepts two to eight tokens in each row and up to three query panels. The parser checks weights in `[0, 1]` and checks the sum against `1 ± 0.02` when normalized. The largest arrow carries a numeric badge.
- `block-stack` accepts two to six blocks, bounded inset flows, tensors or layers, and renderer-owned skip lanes. `variant`, `dims`, `repeat` and `repeatTo` describe the block. Up to two inputs can feed a block, and add or multiply glyphs mark joins. Comparison children can mark FFN blocks `changed`.
- `orientation: "horizontal"` puts two to six independent label or tensor blocks in one left-to-right row. The existing viewport scrolls when the row exceeds the card width. Residuals, merge operators, side inputs, callouts, spanning repeat groups, and flow or layer children use the vertical layout.
- `callouts` attach up to four notes to block IDs. At 320 px the notes become a numbered list. A `detail` value names a separate visual by its one-based reading order. If the server drops a visual, remaining detail markers keep their target or disappear with it.

The [preview manifest](illustrations/manifest.json) lists each request width, actual SVG width and height. The 408 px exports preserve native text in the existing scroll viewport when the diagram needs more room. Gemma uses margin notes at 408, its 598 px natural width, and 960. [408 px](illustrations/ml-gemma-decoder-stack-detailed/408.svg) · [960 px](illustrations/ml-gemma-decoder-stack-detailed/960.svg) · [320 px minimized tile](illustrations/ml-gemma-decoder-stack-detailed/320.svg)

| Schema surface | Serialized characters | Change |
| --- | ---: | ---: |
| Full TutorDiagram | 97,549 | +11,130 |
| Full explanation author tool | 98,244 | +11,130 |
| Unsteered fast-author core | 10,526 | 0 |
| Legacy visual panels bundle | 29,622 | +28 |
| Legacy visual states bundle | 48,918 | +56 |
| QKV transformation bundle | 11,856 | +1,330 vs core |
| Token links bundle | 11,359 | +833 vs core |
| Block stack bundle | 13,977 | +3,451 vs core |
| Architecture comparison bundle | 33,073 | +3,451 vs legacy panels |
| MoE flow bundle | 10,701 | +175 vs core |

Coordinate-plot smoothing adds 112 characters to the full schema. Bundles expose the optional `smooth` field wherever they include a coordinate-plot.

### Gemini-compatible bundles

These counts come from the JSON request built for `gemini-3.5-flash-lite` through `stepRequest`. The recorded compatibility limit is 362 schema properties.

| Scoped Gemini bundle | Properties | Standalone `tensor` | `token-links` | `block-stack` |
| --- | ---: | --- | --- | --- |
| Core with no illustration reference or requirement | 129 | No | No | No |
| Explicit tensor | 139 | Yes | No | No |
| Weighted token links | 138 | No | Yes | No |
| Encoder, Llama, or Gemma stack | 171 | No | No | Yes |
| All three explicitly requested | 190 | Yes | Yes | Yes |
| QKV transformation on its own | 145 | No | No | No |
| Dense vs MoE comparison on its own | 129 | No | No | No |

The QKV bundle exposes the inline tensor payload inside transformation items. Gemini reduces comparison and visual transformation to their list forms, which removes nested block-stacks from the dense-vs-MoE example. A broad schema that exceeds the limit is reduced again, keeping new standalone kinds only when the request explicitly requires them. Measured against the full tool schema, the reduced request has 297 properties with no named new kinds and 358 with all three named. These are offline schema checks.

The [walkthrough handoff](illustrated-transformer-walkthrough.md) records the causal-mask heatmap constraint and the ten teaching examples.

## Token budgets

Counts use `cl100k_base` on compact JSON. Each cell gives diagram tokens, then the complete author packet including `id`, `useWhen` and `detailSpec` where present. The first number is the combined compact count for references with two visuals. All ten walkthrough references fit 300 tokens per visual. The Detailed Gemma decoder is 315 tokens with the explicit roles, and its separate FFN visual is 70. [Token measurements](../../../../../packages/web/src/tutor-diagrams/illustration-token-budgets.json)

| Reference | Brief | Balanced | Detailed |
| --- | ---: | ---: | ---: |
| QKV projections | 201 / 251 | 259 / 309 | 285 / 335 |
| Self-attention links | — | 119 / 183 | — |
| Encoder stack | 167 / 208 | 166 / 207 | 194 / 235 |
| Llama-style decoder | 147 / 193 | 162 / 208 | 166 / 213 |
| Dense vs MoE | 247 / 270 | 265 / 288 | 286 / 309 |
| Gemma decoder | 109 / 181 | 169 / 241 | 386 / 460 |
| Top-two MoE routing | — | 300 / 335 | — |

The gallery now has 24 kinds. All three new shapes have Brief, Balanced and Detailed specs. The saved depth keys remain `overview`, `standard` and `deep`. The preview manifest includes gallery variants, walkthrough examples, and both Gemma visuals. The dense-vs-MoE comparison also has a linked single-matrix alternative in the offline catalogue of variants.

## Block-stack role colours

Set `role` on a block or on an inset flow step written as `{ label, role }`. Norm uses the neutral inset, attention uses blue, feed-forward uses warm, and embedding and output use green. Output has a stronger green outline. `changed` uses the established blue emphasis. Omitted block roles and string steps retain their previous paint.

Component labels are noun phrases, including role-tagged steps in an inset. Untagged inset flow steps and ordinary flows use verb-first action labels. Captions wrap. Viewers without XHTML support can display the full caption as SVG text, including the formula source.

Detailed Gemma names the four pre/post RMSNorm stages, the sliding-window and GQA attention schedule, and the gated GELU FFN. Detailed Llama names its two pre-RMSNorm stages, causal grouped-query attention, and SwiGLU FFN. Balanced puts short plain-language glosses beside the component names.

## Coordinate-plot line curves

Basic and Phase 02 line series use monotone cubic SVG paths through the given samples. Two samples draw a straight segment. Repeated or reversing x values keep straight segments in the authored order. Set `smooth: false` for intentional piecewise-linear data. The curve stays within local sample extrema and the existing uncertainty band. Lines with more than six points show the first, last, and labelled samples as markers.

All 111 line captures across 37 specs changed, including the three positional encoding exports. The other 706 of 817 fingerprints matched, including all 99 plot captures with only step, scatter or stem series. SVG dimensions matched at every width. [Positional encoding SVG](illustrations/ml-transformer-token-embeddings-detailed-detail/natural.svg)

The curve tests cover two samples, unevenly spaced monotone samples in either x direction, a peak at 0.9, a narrow uncertainty band, straight-segment opt-out and dense markers in both renderers. All 1,025 focused tests and the web build passed.

## Offline verification

- All 14 learner prompts and paraphrases select their intended first reference in the prepared fast-author request. The existing 42 originals and 210 paraphrases return the same selector results as the base.
- Compared with `b269c371`, 214 existing fingerprints changed and 594 matched. The component and caption pass changed 199. The row pass changed 27 against the content-only renders and added nine 320 px captures. The tracked set has 817 fingerprints.
- The preview exports include 63 specs and 199 SVGs. The exact Gemma name fits the 320 px ledger. Inkscape renders the entire mixed text and formula caption at the original 320 px embedding width. All 1,020 focused tests and the web build passed.


Regenerate the preview set with `node packages/web/scripts/illustration-previews.mjs /tmp/rh-illustrations`. Update intended fingerprint changes with `UPDATE_TUTOR_SVG_SNAPSHOTS=1 node --test packages/web/src/tutor-diagrams/svg-snapshots.test.mjs`.

Live acceptance remains open. Run the seven prompts through written `/explain` on the dev build. Start with Detailed Gemma, then try Brief. Check that the saved Detailed card opens with both visuals in order and the FFN marker reads `Visual 2`. Compare the saved SVGs with the linked examples and record the provider, selected kind, actual diagram count and build SHA. Check the natural-width view and the minimized Gemma ledger in the app.
