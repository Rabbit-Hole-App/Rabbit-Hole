# Planner relabel, 2026-11-09 (owner)

Owner decision: "Relabel the planner flips as accepted. Prompts the new kinds were built for (walkthrough steps, architecture stacks, token sequences) planning to those kinds is the intended result; the old labels predate the kinds. Record which, so the relabel is auditable."

**Real count: 18 prompt rows**, all one prompt: the correct-svg prompt "how are attention weights computed?" (attention-weights) and its five paraphrases p1-p5, at the three depths each (3 + 15). The earlier report of 26 flips could not be reproduced: every planner output saved since the Codex illustration kinds landed (codex-illustrations 50bde10a1, categorical-x, codex-int3 after / after2 / after3, and a fresh run on this tree: 505 plans, 0 errors, US$0.034) lists exactly these 18 rows outside the old labels, and no other prompt of any set plans into tensor, token-links or block-stack outside its labels. kv-cache (paraphrase p2: token-links), gpu-matmul (original and p3: tensor) and content/transformer-block (block-stack), named in that report, do plan into the new kinds on the current text, but their labels already accept those kinds, so they are not part of the relabel; the MoE top-two prompt is in the illustrations set, labelled with its own kind.

Why accepted: the prompt asks how attention weights between tokens are computed; `token-links` draws the weighted relation between two token rows, the kind built for exactly that.

Change: `token-links` added to `acceptableKinds` at overview, standard and deep of `attention-weights` (sets/correct-svg.json) and of `attention-weights-p1` to `-p5` (sets/paraphrases/correct-svg.json); the label version is L4 and each file records the relabel in `relabels`. Nothing else in any set changed.

| prompt row | planned kind | old right kinds | old acceptable kinds | new accepted kinds |
|---|---|---|---|---|
| correct-svg/attention-weights/overview | token-links (fixed) | flow, relationship, matrix | transformation, bar-chart | flow, relationship, matrix, transformation, bar-chart, token-links (token-links acceptable) |
| correct-svg/attention-weights/standard | token-links (fixed) | matrix, flow, transformation | bar-chart, relationship | matrix, flow, transformation, bar-chart, relationship, token-links (token-links acceptable) |
| correct-svg/attention-weights/deep | token-links (fixed) | bar-chart, matrix | transformation, flow | bar-chart, matrix, transformation, flow, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p1/overview | token-links (fixed) | flow, relationship, matrix | transformation, bar-chart | flow, relationship, matrix, transformation, bar-chart, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p1/standard | token-links (fixed) | matrix, flow, transformation | bar-chart, relationship | matrix, flow, transformation, bar-chart, relationship, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p1/deep | token-links (fixed) | bar-chart, matrix | transformation, flow | bar-chart, matrix, transformation, flow, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p2/overview | token-links (fixed) | flow, relationship, matrix | transformation, bar-chart | flow, relationship, matrix, transformation, bar-chart, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p2/standard | token-links (fixed) | matrix, flow, transformation | bar-chart, relationship | matrix, flow, transformation, bar-chart, relationship, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p2/deep | token-links (fixed) | bar-chart, matrix | transformation, flow | bar-chart, matrix, transformation, flow, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p3/overview | token-links (fixed) | flow, relationship, matrix | transformation, bar-chart | flow, relationship, matrix, transformation, bar-chart, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p3/standard | token-links (fixed) | matrix, flow, transformation | bar-chart, relationship | matrix, flow, transformation, bar-chart, relationship, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p3/deep | token-links (fixed) | bar-chart, matrix | transformation, flow | bar-chart, matrix, transformation, flow, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p4/overview | token-links (fixed) | flow, relationship, matrix | transformation, bar-chart | flow, relationship, matrix, transformation, bar-chart, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p4/standard | token-links (fixed) | matrix, flow, transformation | bar-chart, relationship | matrix, flow, transformation, bar-chart, relationship, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p4/deep | token-links (fixed) | bar-chart, matrix | transformation, flow | bar-chart, matrix, transformation, flow, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p5/overview | token-links (fixed) | flow, relationship, matrix | transformation, bar-chart | flow, relationship, matrix, transformation, bar-chart, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p5/standard | token-links (fixed) | matrix, flow, transformation | bar-chart, relationship | matrix, flow, transformation, bar-chart, relationship, token-links (token-links acceptable) |
| paraphrase-correct-svg/attention-weights-p5/deep | token-links (fixed) | bar-chart, matrix | transformation, flow | bar-chart, matrix, transformation, flow, token-links (token-links acceptable) |

## Not relabelled

- Nothing else flipped into a new kind outside its labels, so nothing was left out. The 16 other labelled prompts that plan into a new kind on the fresh run already have the kind in their labels (the attention, kv-cache, gpu-matmul and transformer-block prompts and their paraphrases); the illustration references are labelled with the new kinds themselves.
- Walkthrough prompts and the batch-1 prompts have no label in these sets (the walkthrough prompts are in the `illustrations` set with their own labels; batch 1 is graded by REVIEW.md): they are not part of this relabel.
- No prompt unrelated to the new kinds had a "wrong" kind turned into an accepted one.

## Codex note (docs only, owner 2026-11-09)

The Gemma FFN block shows a generic "Normalize input / Transform token / Normalize output": use the gated-GELU components in the walkthrough FFN reference.
