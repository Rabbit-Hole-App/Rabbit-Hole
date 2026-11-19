# C07 learner-card review

Reviewed the example cards from `explain/composition-c07-r2` at a requested width of 408 px.

The correction is based on `8c3235710019f258e5cdf196dbf8f4169f341d0e`. Verified source tree `5fa3c67396bfdeeb703132d7de8401e89c7a8d2b`.
Reviewed 54 views. The refresh changed 1 views. The other 53 have the same SVG fingerprints. [View comparison](sheet-diff.json)

- The Detailed companion for `ml-attention-causal-mask-and-weights` prints 1.731 over each bar. The caption explains why editing a future token leaves context unchanged.
- The additive-attention Detailed and packed-projection Standard captions fit within three lines. The connectivity plots show shortest-path counts and identify hops in the captions.
- `ml-attention-packed-query-key-value-projections` Detailed companion has a native width of 572 px. Its operand and slice labels appear small in the 408 px column because the full row is fit to width.
- The tranche has no raw feature labels or registered author-single panel slices.

## Compact token counts

Maximum 300 tokens for compact `{id, spec}`. Two numbers give authored and parsed counts.

| Reference | Overview | Standard | Detailed | Companions |
| --- | ---: | ---: | ---: | --- |
| `ml-attention-additive-attention` | 178 | 240 | 280 / 281 | Overview 99, Standard 99, Detailed 123 |
| `ml-attention-query-key-value-roles` | 154 | 299 | 300 | Overview 286, Standard 286, Detailed 288 |
| `ml-attention-connectivity-and-path-length` | 99 / 98 | 141 / 140 | 139 / 138 | Overview 143, Standard 144, Detailed 135 |
| `ml-attention-causal-mask-and-weights` | 103 | 150 | 129 | Overview 162, Standard 162, Detailed 86 / 85 |
| `ml-attention-packed-query-key-value-projections` | 155 | 211 / 212 | 299 | Overview 267, Standard 267, Detailed 262 / 261 |
| `ml-attention-query-key-dot-products` | 215 / 214 | 281 | 287 | — |
| `ml-attention-weighted-vector-pooling` | 204 | 287 | 289 | — |
| `ml-attention-all-query-attention` | 204 | 264 | 244 | — |
| `ml-attention-pooling-kernel-weight-concentration` | 138 | 158 | 157 | Overview 159, Standard 159, Detailed 158 |
| `ml-recurrent-attention-decoder-context` | 236 | 300 | 132 | Overview 158, Standard 158, Detailed 139 |
| `figure-retro-chunk-embedding` | 94 | 185 | 198 | — |

## Relationship labels and notes

- `ml-attention-additive-attention` · Overview main 4, Standard main 6.
- `ml-attention-query-key-value-roles` · Overview main 4, Overview detail 3, Standard main 4, Standard detail 3, Detailed main 4, Detailed detail 3.
- `ml-attention-packed-query-key-value-projections` · Detailed main 4.
- `ml-attention-weighted-vector-pooling` · Overview main 2, Standard main 3, Detailed main 3.
- `ml-recurrent-attention-decoder-context` · Overview main 8, Standard main 10.

14 views exceed three visible note lines. The relationship renderer moves arrow labels into a numbered list.

- `ml-attention-additive-attention` · Overview main · 10 lines. The current relationship renderer puts the arrow labels into 8 numbered-list text lines below the diagram. The caption takes 2.
- `ml-attention-additive-attention` · Standard main · 12 lines. The current relationship renderer puts the arrow labels into 9 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-query-key-value-roles` · Overview main · 10 lines. The current relationship renderer puts the arrow labels into 8 numbered-list text lines below the diagram. The caption takes 2.
- `ml-attention-query-key-value-roles` · Standard main · 6 lines. The current relationship renderer puts the arrow labels into 4 numbered-list text lines below the diagram. The caption takes 2.
- `ml-attention-query-key-value-roles` · Detailed main · 5 lines. The current relationship renderer puts the arrow labels into 4 numbered-list text lines below the diagram. The caption takes 1.
- `ml-attention-query-key-value-roles` · Overview detail · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-query-key-value-roles` · Standard detail · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-query-key-value-roles` · Detailed detail · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-packed-query-key-value-projections` · Detailed main · 7 lines. The current relationship renderer puts the arrow labels into 4 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-weighted-vector-pooling` · Overview main · 5 lines. The current relationship renderer puts the arrow labels into 2 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-weighted-vector-pooling` · Standard main · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-weighted-vector-pooling` · Detailed main · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-recurrent-attention-decoder-context` · Overview main · 10 lines. The current relationship renderer puts the arrow labels into 8 numbered-list text lines below the diagram. The caption takes 2.
- `ml-recurrent-attention-decoder-context` · Standard main · 12 lines. The current relationship renderer puts the arrow labels into 10 numbered-list text lines below the diagram. The caption takes 2.

## Verification

- Production replay moved zero first picks or planner kinds over 3,603 catalogue and 474 archive cases. All 240 tranche prompt-depth cases still selected their reference. The correction adds no routing prompts. [Replay](planner-replay.json) · [Original tranche prompts](../new-prompts.md)
- 91 focused tests passed, including the data-module, content contract, SVG snapshot, author single and lazy library tests. The compiler and linter reported zero errors. [Tests](tests.log) · [Linter](lint.json)
- The central SVG snapshot registry was regenerated and is byte-identical. It has no entries for the corrected depths and companions. [Registry check](snapshots.json) · [Preview layout](preview-layout.json)

![C07 contact sheet at 408 px per diagram](contact-sheet.png)
