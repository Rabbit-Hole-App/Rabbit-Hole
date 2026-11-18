# SAME-1 b: what a "list-form transformation needs at least 2 items on each side" rule would reject (offline count, no rule implemented yet)

Tree: main 2aeca536d (feat/same-1 a1452a98c differs only in one planner text line). Script: `validator-count.mjs` (walks every reference object, including `depths.*` and `detailSpec`, and both gallery files; JSON output `validator-count.json`). No provider call.

Rule as counted: a transformation diagram with list-form `before.items` and `after.items` (not `variant: 'visual'`) is rejected when either side has fewer than 2 items, UNLESS any item on either side is a tensor item (an object, not a string): tensor forms exempt.

## Count
- 469 library references; 53 list-form transformation diagrams found across them and the galleries (counting each depth variant separately); 33 are tensor-exempt; **10 would be rejected: 6 in references (all `depths.overview` variants), 1 in kind-gallery, 3 in kind-gallery-depths.**

| source | id | path | before -> after | items |
| --- | --- | --- | --- | --- |
| reference | ml-gpt2-learned-position-lookup | depths.overview.spec.diagram | 2 -> 1 | text (the base spec and depths.deep are tensor items: exempt) |
| reference | ml-gpt2-fused-qkv-slices | depths.overview.spec.diagram | 1 -> 3 | text |
| reference | figure-retro-chunk-embedding | depths.overview.spec.diagram | 2 -> 1 | text |
| reference | figure-gpt2-learned-position-decoder | depths.overview.spec.diagram | 2 -> 1 | text |
| reference | figure-recurrent-decoder-matrix-memory | depths.overview.spec.diagram | 2 -> 1 | text |
| reference | figure-gallery-latent-query-and-kv | depths.overview.spec.diagram | 1 -> 2 | text |
| gallery | kind-gallery.json[10] ("Water freezes") | diagram | 1 -> 1 | "Water" -> "Ice" |
| gallery-depths | kind-gallery-depths.json[10] ("How water becomes ice" and its overview) | overview, standard, deep | 1 -> 1 | "Liquid water" -> "Ice" |

Not rejected (list-form, both sides at least 2, or tensor): ml-bert-cls-readout 5 -> 2, ml-what-is-machine-learning-program-direction 3 -> 3 (2 -> 2 in overview), figure-retro-encoded-neighbor-rows 2 -> 2, and the other tensor references. Full list in `validator-count.json` (`allFound`).

## What this says
- The base specs of the references are never rejected (their tensor or 2+ forms pass). The 6 reference hits are the plain-text overview depth variants of tensor references: the same operation described without tensors, 1 or 2 items a side.
- **The planner's own transformation gallery example is a 1 -> 1 card** ("Water freezes": one item before, one after). That is the "shape example" the author gets when no reference matches (shape-transformation), which is how all three SAME-1 cards came out as one-item-to-one-item pictures. The rule would reject its own example; the example has to change (Codex data branch: shape example) before or with the rule, or the gallery tests (kind-gallery, kind-gallery-depths, the 200-token budget hash) fail.
- Consequence if the rule lands as stated: 10 fixtures to change (6 reference overview variants, 4 gallery entries), the gallery token budget (kind-gallery.token-budget.json sha256 for the transformation entry) to recount, and svg snapshots to regenerate for the changed ids. Decision for the Reviewer after reading this count.
