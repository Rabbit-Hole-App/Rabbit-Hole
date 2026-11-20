# Relationship reference content on REL-1

Both sides of the [408 px before/after sheet](relationship-before-after-408.png) use `renderTutorDiagram` from `1b36e600ca1391a98e8194fe7c977372956f9200`. The before column uses that commit’s reference specs. The after column uses the revised specs from `b5b40d7dd87eee20a17881463fa98d9044d4972a`. The sheet uses the renderer’s native SVG text fallback for formulas.

## Numbered note lines

Counts are before → after at each requested width. They include wrapped note lines. All depth variants agree within each family. Every after view has at most three numbered note lines and three caption lines at each measured width.

| Reference family | 320 px | 408 px | 720 px |
| --- | ---: | ---: | ---: |
| `d2l-dense-hidden-layer-activations` | 6 → 2 | 6 → 2 | 4 → 2 |
| `d2l-regularized-forward-graph` | 7 → 3 | 6 → 3 | 3 → 3 |
| `ml-neural-network-weights` | 5 → 2 | 5 → 2 | 2 → 2 |
| `figure-gallery-multistream-residual` | 5 → 3 | 5 → 3 | 4 → 3 |
| `figure-gallery-encoder-global-kv` | 5 → 2 | 5 → 2 | 3 → 2 |
| `figure-gallery-shared-kv-and-index` | 5 → 2 | 5 → 2 | 2 → 2 |
| `ml-stable-diffusion-unet-timestep-and-skips` | 5 → 3 | 5 → 3 | 3 → 3 |
| `d2l-softmax-affine-class-scores` | 4 → 1 | 4 → 1 | 2 → 1 |
| `ml-version-lineage` | 5 → 2 | 4 → 2 | 1 → 2 |

The 408 px and 720 px SVGs draw at the requested width. At a 320 px request, the Brief U-Net’s native width goes from 382 to 388 px and version lineage goes from 360 to 364 px.

## Content checks

- Every node ID and every directed edge endpoint pair is preserved across the 23 specs.
- The dense hidden layer still shows both inputs feeding each hidden unit and both activations feeding the output. Its Detailed formula is preserved. The regularized objective keeps separate data-loss and weight-penalty paths into the sum.
- The network weights carry the same mapping through `w_ij` with the input index first and `v_j` on the activation from hidden unit `j`. The affine-score graph still shows both inputs reaching each class-specific score and softmax operating on the scores together.
- The multistream graph retains read weights 1/4 and 3/4, update weights 1/2 and 1/4, identity carry, and the Detailed values. The encoder and sparse-index graphs retain distinct sources for context, memory, and selected positions where each applies.
- The U-Net still shows both blocks receiving the same timestep condition and distinguishes the matching-scale skip from the path through the smaller, refined feature map. The lineage graph names the previous and current versions in their model boxes, with shared training features and changed hyperparameters visible.
- The 21 changed figure-chapter spec receipts remain within 300 cl100k_base tokens. The SVG fixture refresh changed 69 entries across exactly 23 IDs, with zero added or removed.

## Composition follow-ups

All 240 available C03–C11 views were measured at 408 and 720 px on `1b36e600c`. The C07 `ml-recurrent-attention-decoder-context` Overview and Standard main graphs were the overages at 408 px. Both graphs keep their recurrence and endpoint pairs, with numbered notes going from 4 to 3 and 5 to 3 respectively and captions at two lines. All 240 views meet both three-line limits with that patch. [C07 commit](https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/a721b602c7861a161cc4ab85997996b441a2fd3b)

The four-column transfer-learning matrix uses Input, Model, Vector, and Head and keeps the text and image cells and paths. At a 408 px request its minimum header size rises from 9 to 14 px. On MAT-F the entire header row is 14 px. The native matrix width is 412 px. [Matrix commit](https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/1aec25ee446fa2052e6f437462a47731c3937b89) · [Matrix before/after sheet](transfer-learning-matrix-408.png)

## Verification

- `node --test --test-concurrency=3 packages/web/src/tutor-diagrams/*.test.mjs` passed all 1,625 tests with zero skips.
- `npm run build --workspace web` succeeded.
- C07 passed 14 focused tests and the matrix passed three, including both branches’ SVG fingerprint checks against their source bases.
