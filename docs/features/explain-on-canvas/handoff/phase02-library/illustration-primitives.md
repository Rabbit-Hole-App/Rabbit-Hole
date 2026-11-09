# Static SVG illustration primitives

Written `/explain` now supports tensor strips, weighted links between tokens, and nested architecture stacks. The author supplies semantic JSON. TutorDiagram draws the geometry, arrows and labels with the existing teaching palette.

## Reference cards

| Learner prompt | What to check | Natural-width SVG and JSON |
| --- | --- | --- |
| How does a transformer get query, key and value vectors from one token? | One input strip feeds three separate learned projections. Four strips fit on one row at 524 px. Cells show excerpts of the labelled vector dimensions. | [SVG](illustrations/ml-transformer-qkv-projections/natural.svg) · [JSON](illustrations/ml-transformer-qkv-projections/spec.json) |
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
- `callouts` attach up to four notes to block IDs. At 320 px the notes become a numbered list. A `detail` value names a separate visual by its one-based reading order. If the server drops a visual, remaining detail markers keep their target or disappear with it.

The [preview manifest](illustrations/manifest.json) lists each request width, actual SVG width and height. The 408 px exports preserve native text in the existing scroll viewport when the diagram needs more room. Gemma uses margin notes at 408, its 598 px natural width, and 960. [408 px](illustrations/ml-gemma-decoder-stack-detailed/408.svg) · [960 px](illustrations/ml-gemma-decoder-stack-detailed/960.svg) · [320 px minimized tile](illustrations/ml-gemma-decoder-stack-detailed/320.svg)

| Schema surface | Serialized characters | Change |
| --- | ---: | ---: |
| Full TutorDiagram | 96,685 | +10,266 |
| Full explanation author tool | 97,380 | +10,266 |
| Unsteered fast-author core | 10,526 | 0 |
| Legacy visual panels bundle | 29,594 | 0 |
| Legacy visual states bundle | 48,862 | 0 |
| QKV transformation bundle | 11,856 | +1,330 vs core |
| Token links bundle | 11,359 | +833 vs core |
| Block stack bundle | 13,601 | +3,075 vs core |
| Architecture comparison bundle | 32,669 | +3,075 vs legacy panels |
| MoE flow bundle | 10,701 | +175 vs core |

All 16 legacy fast-author flag combinations serialize identically to the base. The Gemini fallback keeps scoped illustration schemas that fit its recorded property limit. Its existing list-only reduction still applies to comparison panels.

## Token budgets

Counts use `cl100k_base` on compact JSON. Each cell gives diagram tokens, then the complete author packet including `id`, `useWhen` and `detailSpec` where present. The 300-token compact spec ceiling includes both Detailed Gemma visuals together. [Token measurements](../../../../../packages/web/src/tutor-diagrams/illustration-token-budgets.json)

| Reference | Brief | Balanced | Detailed |
| --- | ---: | ---: | ---: |
| QKV projections | — | 218 / 251 | — |
| Self-attention links | — | 119 / 183 | — |
| Encoder stack | — | 93 / 135 | — |
| Llama-style decoder | 126 / 172 | 149 / 195 | 165 / 211 |
| Dense vs MoE | 247 / 270 | 265 / 288 | 286 / 309 |
| Gemma decoder | 88 / 160 | 135 / 207 | 300 / 374 |
| Top-two MoE routing | — | 300 / 335 | — |

The gallery now has 24 kinds. All three new shapes have Brief, Balanced and Detailed specs. The saved depth keys remain `overview`, `standard` and `deep`. The 23 exported JSON files include gallery variants and both Gemma visuals. The dense-vs-MoE comparison also has a linked single-matrix alternative in the offline catalogue of variants.

## Offline verification

- All 14 learner prompts and paraphrases select their intended first reference in the prepared fast-author request. The existing 42 originals and 210 paraphrases return the same selector results as the base.
- All 618 existing SVG fingerprints match. There are 70 new fingerprints at 408, natural width and 960, including the extra 320 px Gemma render. The focused tests check schema bounds, linter contracts, renderer output and detail indices after visual removal.
- All 1,000 focused tests passed. The web build passed. The web build reported its existing chunk-size warning.

Regenerate the preview set with `node packages/web/scripts/illustration-previews.mjs /tmp/rh-illustrations`. Update intended fingerprint changes with `UPDATE_TUTOR_SVG_SNAPSHOTS=1 node --test packages/web/src/tutor-diagrams/svg-snapshots.test.mjs`.

Live acceptance remains open. Run the seven prompts through written `/explain` on the dev build. Start with Detailed Gemma, then try Brief. Check that the saved Detailed card opens with both visuals in order and the FFN marker reads `Visual 2`. Compare the saved SVGs with the linked examples and record the provider, selected kind, actual diagram count and build SHA. Check the natural-width view and the minimized Gemma ledger in the app.
