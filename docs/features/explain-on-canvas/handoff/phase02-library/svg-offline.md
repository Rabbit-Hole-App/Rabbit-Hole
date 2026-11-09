# Offline SVG delivery and AI/ML reference batch

The 14 new references follow the request at `87d7d3918b3b5632c82709baa4899a80cbc2f6af` on `explain/refs-keywords`. The full Phase 02 branch now contains 174 worked examples and 21 neutral shapes. The isolated batch branch contains the 14 additions and their focused author tests on the pinned base. [Pinned batch request](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/87d7d3918b3b5632c82709baa4899a80cbc2f6af/docs/features/explain-on-canvas/handoff/phase02-library/batch-3-request.md) · [Isolated batch branch](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/chatgpt/explain-ai-ml-batch3) · [Rendered gallery and JSON](references/README.md)

| Prompt ID | Kind | What the example shows |
| --- | --- | --- |
| `backprop` | `flow` | Forward pass through hidden and output layers to loss, then chain-rule gradients and a weight update. [SVG](references/ml-backpropagation.svg) |
| `attention` | `matrix` | Query rows, key columns, normalized weights and their weighted value vectors. [SVG](references/ml-transformer-attention.svg) |
| `gpu-matmul` | `flow` | Parallel thread blocks compute tiles from rows of A and columns of B and assemble C. [SVG](references/ml-gpu-matmul.svg) |
| `cnn` | `flow` | Image, convolution, activation, pooling, flattening, dense layer and class scores. [SVG](references/ml-convolutional-network.svg) |
| `rag` | `sequence` | Query embedding and document retrieval, followed by a prompt with evidence and a grounded answer. [SVG](references/ml-rag-retrieval.svg) |
| `beam-search` | `tree` | Keep the two best candidates at each depth, mark pruned continuations and highlight the winning sequence. [SVG](references/ml-beam-search.svg) |
| `rlhf` | `cycle` | Start with a pretrained model, rank sampled answers, train a reward model and tune the policy. A return arrow shows the next sampling pass. The bench lists `cycle` as a best kind. [SVG](references/ml-rlhf-feedback.svg) |
| `cpu-vs-gpu` | `comparison` | Few large cores for low-latency work versus many small cores for parallel throughput. [SVG](references/ml-cpu-vs-gpu.svg) |
| `dropout` | `transformation` | The same network's connections before and after a training mask, plus inference behavior for that scaling convention. [SVG](references/ml-dropout-network.svg) |
| `diffusion` | `sequence` | Prompt-conditioned denoising from noise to an image, with the training direction identified. [SVG](references/ml-diffusion-denoising.svg) |
| `kv-cache` | `sequence` | Project the current token, append its key and value, and read the cached history during attention. [SVG](references/ml-kv-cache-decode.svg) |
| `nn-look` | `relationship` | Input, hidden and output units grouped in order on the existing graph rail, with each unit drawn once and every adjacent-layer weight labelled. [SVG](references/ml-neural-network-weights.svg) |
| `robot-arm` | `flow` | Sense, plan, move, grasp, lift and verify. [SVG](references/ml-robot-arm-pickup.svg) |
| `comp-graph` | `relationship` | Operations connected by forward values, with the same dependencies read backwards for gradients. [SVG](references/ml-computational-graph.svg) |

## Selector evidence

The original selector bench passed production parity on the pinned 142-reference tree and on the 156-reference tree with only the 14 additions. AI/ML coverage rose from **11/28 to 25/28**. Each of the 14 requested prompts gained exactly one reference of a best kind. All 28 other picks across `aiml` and `correct-svg` stayed identical, including the three picture-only prompts with empty picks. The existing overfitting prompt still picks a pruning tree alongside a fit comparison. Both recorded versions of the official bench agree. [Exact before/after results](svg-offline/selector-bench.json) · [Original bench source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/aba447cd40a83c735448ee85a69d9de0775b0873/scripts/explain-bench)

The additional local replay passed all 14 independent paraphrases and kept all 152 local controls, including the named keyword collisions and registered baseline prompts. The integrated tests confirm the selected specs reach `prepareArtifactAuthorRequest` for both phrasings. [Replay results](svg-offline/selector-replay.json)

The full Phase 02 branch also reaches 25/28 with production parity. Its gallery deliberately replaces the older kind-only examples for `water-cycle` and `nn-layers` with `shape-cycle` and `shape-layers`. The full branch's Gini selections differ from the pinned branch because of the earlier Phase 02 reference batches.

To repeat the benchmark, run it on the pinned tree and the **content-only** patch tree. The patch adds the two reference modules and their registry entries. The shape fallback and later reference edits are outside this comparison. [Content-only patch](svg-offline/ai-ml-refs-at-87d7d3918.patch)

```sh
git worktree add --detach ../svg-batch3-before 87d7d3918b3b5632c82709baa4899a80cbc2f6af
git worktree add --detach ../svg-batch3-after 87d7d3918b3b5632c82709baa4899a80cbc2f6af
git worktree add --detach ../svg-batch3-bench aba447cd40a83c735448ee85a69d9de0775b0873
patch="$PWD/docs/features/explain-on-canvas/handoff/phase02-library/svg-offline/ai-ml-refs-at-87d7d3918.patch"
git -C ../svg-batch3-after apply --check "$patch"
git -C ../svg-batch3-after apply "$patch"
node ../svg-batch3-bench/scripts/explain-bench/selector.mjs --tree ../svg-batch3-before --json before.json
node ../svg-batch3-bench/scripts/explain-bench/selector.mjs --tree ../svg-batch3-after --json after.json
```

Compare `detail` across both sets with the recorded result. The local replay can also be rerun with `node packages/control-plane/scripts/explanation-reference-batch3-bench.mjs ../svg-batch3-before ../svg-batch3-after replay.json` once both trees can resolve workspace dependencies. When integrating the neutral gallery into a branch that already has kind inference, retain that inference and use `kind-gallery.json` as the shape source.

## Other offline SVG deliverables

| Deliverable | Implementation and evidence |
| --- | --- |
| Kind gallery | `kind-gallery.json` has one compact spec per supported kind. `cl100k_base` measurements range from 36 to 150 tokens. The coordinate plot has nine samples and one labelled point. The author gets a neutral shape when a kind is known and topical selection comes up empty. `examples.json` retains the saved-spec regression fixtures. [Shape gallery](references/README.md#neutral-kind-shapes) |
| Content contracts | The initial audit flagged 120 findings across 43 of 160 references. These comprised 100 math, 16 flow label, two duplicate label and two redundant panel findings. The two drift pairs now share one plot or bar chart each, with their data preserved. All 174 worked examples and 21 shapes pass. [Audit](svg-offline/content-audit.json) |
| Formula sampler | `formula-sampler.js` exports `sampleFormula({ formula, xMin, xMax, samples }, { yMin, yMax })`. It uses an allowlisted parser and samples 2–24 evenly spaced points including endpoints. Bounds must increase within ±1e9. It rejects malformed input, nonfinite intermediate results and samples outside the y bounds. The validation covers sampled positions. The module is standalone. |
| Renderer | Lines with over six samples keep all vertices and draw markers at labelled points. Plot axes use three to five ticks. Geometry tests verify the existing orthogonal step path. The closest relationship arrow lane is 16 px from the node, down from 24 px. The renders use the existing palette. |
| Correction corpus | 55 rejected and corrected spec pairs exercise parser errors and check retained labels and values. This includes converting a one-branch decision to a step while keeping the branch label, and expanding an axis or timeline range to keep an authored value. The pairs run as offline fixtures. |
| SVG snapshots | The focused test renders every worked example and shape at 320, 408 and 720 px and compares the actual SVG hash and dimensions to the checked-in manifest. The deliberate update step is below. |

### Renderer before and after

Both renderers used the same final 195 specs. The baseline renderer is from `71f9e0d86edbc7e930b6f996a1bacda0f7f2b9be`. The 585 SVG pairs include 216 changed renders and 369 identical renders. The archive contains the raw before and after SVGs, a unified diff for each changed pair, and a manifest keyed by reference ID and requested width. The after hashes match the regression snapshot. Representative plot and relationship changes were inspected as static rasters. [Full diff archive](svg-offline/renderer-diffs.tar.gz) · [Counts and archive hash](svg-offline/renderer-diff-summary.json)

Reproduce the comparison from this branch with an empty output directory and the workspace dependencies available in both trees.

```sh
git worktree add --detach ../svg-render-before 71f9e0d86edbc7e930b6f996a1bacda0f7f2b9be
node packages/web/scripts/explanation-svg-snapshots.mjs --before ../svg-render-before --out ../svg-render-review
```

### Focused verification

679 focused tests passed on the full branch, including author request selection, all renders and snapshots, the correction pairs, content contracts and sampler. The web build passed with its existing chunk-size warning. Live model choice and browser acceptance remain separate from this offline verification.

```sh
node --test packages/web/src/tutor-diagrams/*.test.mjs packages/web/src/explanation-diagram.test.mjs packages/web/src/inline-ai-annotation.test.mjs packages/control-plane/test/explanation-reference*.test.js packages/control-plane/test/explanation-shape-gallery.test.js packages/control-plane/test/explanation-diagram-kinds.test.js packages/control-plane/test/explanation-visuals.test.js packages/control-plane/test/explanation-validation.test.js packages/control-plane/test/learn-artifact.test.js
npm run build --workspace=packages/web
```

For an intended SVG change, regenerate and review the fingerprint diff and gallery.

```sh
UPDATE_TUTOR_SVG_SNAPSHOTS=1 node --test packages/web/src/tutor-diagrams/svg-snapshots.test.mjs
node --test packages/web/src/tutor-diagrams/svg-snapshots.test.mjs
node packages/web/scripts/export-explanation-references.mjs
```
