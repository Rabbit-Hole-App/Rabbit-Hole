# Phase 02 reference library: batch 3 request (AI/ML coverage gap)

Requested 2026-11-08 by Claude for the owner. Base branch: `explain/refs-keywords` (142 references, after the keyword
commit `a381470e6`).

## Why

The free selector bench shows which worked examples the production selector
(`packages/control-plane/src/explanation-references.js`) gives each labelled prompt. On the AI/ML set
(`C:/s/explain-math/scripts/explain-bench/sets/aiml.json`), 11 of 28 prompts now get an example. Of the 17 without
one, 3 are picture-only (`gpu-look`, `rack-look`, `bio-neuron`) and need none. The other 14 have no existing reference
of an expected kind on a related subject, so they need new references. Keywords alone cannot cover them.

Existing references that were checked and rejected, so they are not reused:

- `softmax-probabilities`: bar-chart, not an expected kind for `attention`.
- `kernel-similarity-grid`: heatmap, not matrix.
- `ml-feedback-graph`: a retraining loop, not backpropagation or RLHF.
- `general-sequence-1`: a cache-aside read, not a KV cache.
- `general-layers-2`: web application layers, not a neural network.

## References to add (one per prompt)

The kind listed is the recommended one, chosen from the prompt's `best` kinds in `aiml.json`. Any other `best` kind is
fine if it suits the content better.

| Prompt id | Learner prompt | Kind | What the diagram must show |
|---|---|---|---|
| backprop | how does backpropagation work? | flow | Forward pass input → hidden → output → loss, then gradients flowing back through the same layers (chain rule at each step), ending in the weight update. |
| attention | how does attention work in a transformer? | matrix | One small attention weight matrix: rows are query tokens, columns are key tokens, each row's softmax weights sum to 1, and the output is the weighted mix of value vectors. |
| gpu-matmul | how does a GPU run matrix multiplications? | flow | The output matrix C split into tiles, the tiles fanned out to many cores or thread blocks in parallel (each multiplies a row-block of A by a column-block of B), then merged back into C. |
| cnn | what is a convolutional neural network? | flow | Image → convolution (filters produce feature maps) → activation → pooling → flatten → fully connected layer → class scores. |
| rag | how does RAG work? | sequence | Participants: user, app, retriever/vector store, LLM. Query → embed and search → top documents returned → prompt built from query plus documents → LLM answer grounded in them. |
| beam-search | how does beam search work? | tree | Candidate continuations expanded from a start token with scores, beam width k = 2: only the 2 best partial sequences kept at each depth, pruned branches marked, final best sequence highlighted. |
| rlhf | how does RLHF work? | flow | Pretrained model → sample several answers → humans rank them → reward model trained on the rankings → policy tuned against the reward (e.g. PPO), with a loop back to sampling. |
| cpu-vs-gpu | what is the difference between a CPU and a GPU? | comparison | The comparison is the point: a few large cores optimized for low latency on sequential work, against thousands of small cores for high throughput on parallel work. |
| dropout | how does dropout work? | transformation | The same small network before and after dropout: during training, a random subset of hidden units is switched off with their links removed. At inference all units are used, with activations scaled to match. |
| diffusion | how does a diffusion model generate an image? | sequence | Start from pure noise. Each denoising step predicts and removes some noise, conditioned on the prompt, ending in a clean image after T steps. Training is the reverse direction, adding noise. |
| kv-cache | how does KV caching speed up inference? | sequence | Decode steps: at each new token only its query, key and value are computed. The key and value are appended to the cache and attention reads all cached keys and values. Earlier tokens are never recomputed. |
| nn-look | what does a neural network look like? | relationship | Input, hidden and output nodes arranged in layers, each node joined to every node in the next layer by a weighted edge. Each node is drawn once. |
| robot-arm | how does a robot arm pick up an object? | flow | The diagram half only (the picture is separate): sense (camera finds the object) → plan the grasp pose → move the joints → close the gripper → lift → verify the grip. |
| comp-graph | what is a computational graph? | relationship | Operations as nodes and values as edges for a small expression, e.g. x, w → × → + b → loss. Forward values flow along the edges, and the same graph is read backwards for gradients. Never a chart. |

Target after this batch: 25 of 28 AI/ML prompts get an example of a `best` kind. The remaining 3 are the picture-only
prompts.

## Constraints

1. **Prefer a single diagram.** Use a two-panel `comparison` (or a before/after `transformation`) only when the
   comparison is the point: `cpu-vs-gpu` and `dropout` above. A card has a 4 s budget, and a two-panel composition
   costs about 1 s of output.
2. **Keywords use the learner's own words for the topic**, as a learner would type them: `backprop`,
   `backpropagation`, `kv cache`, `kv caching`, `rag`, `retrieval augmented generation`, `rlhf`, `beam search`,
   `dropout`, `diffusion model`, `computational graph`, `robot arm`, `cpu`. The matcher matches whole phrases and adds
   only plural endings (s, es, ies). List other word forms (such as `caching` or `-ing` forms) explicitly.
3. **Do not use keywords that would move an existing pick.** These words appear in other labelled prompts:
   - `attention`: correct-svg "how are attention weights computed?" (currently `softmax-probabilities`). Use
     `transformer`, `self attention` or `query key value` instead.
   - `neural network`: also in `cnn` and `nn-layers`, which currently picks `general-layers-2`. Use a longer phrase
     such as `neural network look like`.
   - `gpu`: also in `gpu-look`, which is picture-only and where flow and matrix are bad kinds. Use
     `matrix multiplication` or `matmul` for `gpu-matmul`.
   - `search`: also in correct-svg "binary search tree".
   - `look like`, `image`, `model`, `data`, `flow`, `work` and `prediction` appear in many prompts. Do not use them
     alone.
4. **Each reference must pass the selector bench.** Its prompt must be covered with its kind, and no existing prompt
   in either set may change its pick. Run this from the tree under test:

   ```sh
   node C:/s/explain-math/scripts/explain-bench/selector.mjs --tree <repo root> --json after.json
   ```

   It exits 1 if its copy of the selector and production disagree. Compare `detail` in `after.json` with a run on
   the base branch: only the 14 prompts above may change, each from no example to the new reference.
5. Follow the batch 2a and 2b pattern: a `ml-batch3-*-references.js` file registered in `reference-library.js` before
   `...generic`, and a `packages/control-plane/test/explanation-reference-batch3.test.js`. Every reference parses,
   renders at 320/408/720 px and stays inside the existing schema. Do not change the schema or selector logic.
   The repository-root check is:

   ```sh
   node --test packages/web/src/tutor-diagrams/*.test.mjs packages/control-plane/test/explanation-references.test.js packages/control-plane/test/explanation-reference-batch2a.test.js packages/control-plane/test/explanation-reference-batch2b.test.js
   ```

   Add the batch 3 test to this command. It currently passes 350 of 350.
