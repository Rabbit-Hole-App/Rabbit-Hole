# C07 · Release 164

Branch `explain/composition-c07-r2` at `8c3235710019f258e5cdf196dbf8f4169f341d0e`, stacked on `d3f202ff5fe3e416d5865000b10a9859f4697987`. [Source commit](https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/8c3235710019f258e5cdf196dbf8f4169f341d0e) · [Previous tranche](https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/d3f202ff5fe3e416d5865000b10a9859f4697987)

This tranche adds 10 references and updates 1 existing references.

## Compact token counts

Counts use compact `{id, spec}` and `cl100k_base`. Maximum 300 authored and 300 parsed. A cell with two counts shows authored / parsed.

| Reference | Brief | Balanced | Detailed | Companions | Author single |
| --- | ---: | ---: | ---: | --- | ---: |
| `ml-attention-additive-attention` | 178 | 240 | 280 / 281 | Brief 99, Balanced 99, Detailed 123 | — |
| `ml-attention-query-key-value-roles` | 154 | 299 | 300 | Brief 286, Balanced 286, Detailed 288 | — |
| `ml-attention-connectivity-and-path-length` | 99 / 98 | 141 / 140 | 139 / 138 | Brief 143, Balanced 144, Detailed 135 | — |
| `ml-attention-causal-mask-and-weights` | 103 | 150 | 129 | Brief 162, Balanced 162, Detailed 90 / 89 | — |
| `ml-attention-packed-query-key-value-projections` | 155 | 211 / 212 | 299 | Brief 267, Balanced 267, Detailed 262 / 261 | — |
| `ml-attention-query-key-dot-products` | 215 / 214 | 281 | 287 | — | — |
| `ml-attention-weighted-vector-pooling` | 204 | 287 | 289 | — | — |
| `ml-attention-all-query-attention` | 204 | 264 | 244 | — | — |
| `ml-attention-pooling-kernel-weight-concentration` | 138 | 158 | 157 | Brief 159, Balanced 159, Detailed 158 | — |
| `ml-recurrent-attention-decoder-context` | 236 | 300 | 132 | Brief 158, Balanced 158, Detailed 139 | — |
| `figure-retro-chunk-embedding` | 94 | 185 | 198 | — | — |

## Relationship edge labels

Counts include nonempty labels in each depth’s main diagram and any companion. [Relationship inventory](relationships.json)

| Reference | Scope | Overview | Standard | Deep | Author single |
| --- | --- | ---: | ---: | ---: | --- |
| `ml-attention-additive-attention` | added | 4 | 6 | 0 | — |
| `ml-attention-query-key-value-roles` | added | 7 | 7 | 7 | — |
| `ml-attention-packed-query-key-value-projections` | added | 0 | 0 | 4 | — |
| `ml-attention-weighted-vector-pooling` | added | 2 | 3 | 3 | — |
| `ml-recurrent-attention-decoder-context` | added | 8 | 10 | 0 | — |

## Verification

- Replay moved zero existing first picks or planner kinds across 3,372 catalogue and 474 archive cases. All 240 tranche prompt-depth cases selected their intended reference. [Replay](planner-replay.json) · [New prompts](new-prompts.md)
- 175 affected tests passed, including both lazy library cases. The web build passed. The compiler found zero errors and the linter reported 0 errors and 0 warnings. [Spec verification](tokens.json) · [Linter](lint.json)
- Snapshots added 30, changed 0, and removed 0. [Snapshot keys](snapshots.json)
- The sheet shows 54 views at a requested 408 px. 12 wide views were scaled to fit. Native widths are 408 px × 42, 415 px × 2, 435 px × 2, 454 px × 1, 482 px × 1, 487 px × 2, 502 px × 1, 530 px × 2, 572 px × 1. The PNG uses the renderer’s native text fallback for 53 math lines. [Preview layout](preview-layout.json)

## Visual review

Reviewed 54 of 54 views at 408 px. [Review record](visual-review.json)

The following views need an owner decision on the three-line note limit.

- `ml-attention-additive-attention` · Brief main · 10 lines. The current relationship renderer puts the arrow labels into 8 numbered-list text lines below the diagram. The caption takes 2.
- `ml-attention-additive-attention` · Balanced main · 12 lines. The current relationship renderer puts the arrow labels into 9 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-query-key-value-roles` · Brief main · 10 lines. The current relationship renderer puts the arrow labels into 8 numbered-list text lines below the diagram. The caption takes 2.
- `ml-attention-query-key-value-roles` · Balanced main · 6 lines. The current relationship renderer puts the arrow labels into 4 numbered-list text lines below the diagram. The caption takes 2.
- `ml-attention-query-key-value-roles` · Detailed main · 5 lines. The current relationship renderer puts the arrow labels into 4 numbered-list text lines below the diagram. The caption takes 1.
- `ml-attention-query-key-value-roles` · Brief detail · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-query-key-value-roles` · Balanced detail · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-query-key-value-roles` · Detailed detail · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-packed-query-key-value-projections` · Detailed main · 7 lines. The current relationship renderer puts the arrow labels into 4 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-weighted-vector-pooling` · Brief main · 5 lines. The current relationship renderer puts the arrow labels into 2 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-weighted-vector-pooling` · Balanced main · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-attention-weighted-vector-pooling` · Detailed main · 8 lines. The current relationship renderer puts the arrow labels into 5 numbered-list text lines below the diagram. The caption takes 3.
- `ml-recurrent-attention-decoder-context` · Brief main · 10 lines. The current relationship renderer puts the arrow labels into 8 numbered-list text lines below the diagram. The caption takes 2.
- `ml-recurrent-attention-decoder-context` · Balanced main · 12 lines. The current relationship renderer puts the arrow labels into 10 numbered-list text lines below the diagram. The caption takes 2.

- The relationship graph renderer leaves node boxes unfilled and numbers its arrow labels in these references: `ml-attention-additive-attention`, `ml-attention-query-key-value-roles`, `ml-attention-packed-query-key-value-projections`, `ml-attention-weighted-vector-pooling`, `ml-recurrent-attention-decoder-context`. These views are listed for the renderer review.
- The additive-attention Detailed and packed-projection Standard captions fit within three lines. The connectivity plots show shortest-path counts and identify hops in the captions.
- `ml-attention-packed-query-key-value-projections` Detailed companion has a native width of 572 px. Its operand and slice labels appear small in the 408 px column because the full row is fit to width.

![C07 contact sheet at 408 px per diagram](contact-sheet.png)
