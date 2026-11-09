# Review loop, batch 2: prompt list (DRAFT for the owner's approval)

Status: draft. Nothing generated yet. Same rules as batch 1: production pipeline as deployed to the clean-up build (Gemini 3.5 Flash Lite, planner on, clean-up prompt, server corrections), Balanced depth, one run per prompt, cap US$0.50, nothing regenerated or hand-fixed, same export (`review/batch-02/<nn>-<slug>/`), same review, at most one change per layer.

Batch 2 = ten new prompts (from the AI/ML misses and the owner's questions) plus any batch-1 card marked "wrong", regenerated. None of the ten repeats a batch-1 prompt (public-key encryption, hash table, positional encoding, k-means, supply and demand, Big-O, bill into law, call stack, database index, confusion matrix).

Evidence source for every "bench" number below: the clean-up 3x run `2026-11-08T222201-clean-up-3x-sectioned-prompt-depth-lines` (423 cards, three runs per prompt, stack 76d4486c6), as compared in `2026-11-08T233456-clean-up-3x-vs-fully-judged-116-baseline`.

## The ten prompts

| # | Exact prompt | Expected shape | What must be on the visual | Why chosen (evidence) | Layer probed | Picture? |
|---|---|---|---|---|---|---|
| 1 | how does a GPU run matrix multiplications? | flow (or transformation) with ONE start node | the two input matrices cut into tiles, tiles handed to parallel thread blocks, each block multiplies and accumulates its partial sums, partial sums assemble the output matrix | bench `aiml/gpu-matmul`: kind right 3/3 (flow) but **repaired 3/3, cause "two roots"** (every run) | server correction (two roots), then author prompt | diagram only |
| 2 | how does a diffusion model generate an image? | flow or timeline, one start, no loop | start from pure noise, a repeated denoising step (marked "repeat N times", not a drawn loop), image at the end | bench `aiml/diffusion`: kind right 3/3 but **repaired 3/3, cause "loop or unreachable node in a flow"** | server correction (loop or unreachable node: a repeated step is drawn as a loop that is not a pure closed loop), author prompt | diagram only (a picture here is a finding on the type rule) |
| 3 | how does backpropagation work? | flow or cycle: forward pass, loss, gradients flowing backward by the chain rule, weight update | named stages in order; the backward direction visible; a "repeat" for the training loop | bench `aiml/backprop` and `content/backprop`: **acceptable 3/3 in both, kind drawn `layers`** (the label wants flow, relationship or cycle) | planner criteria (layers chosen for a process) | diagram only |
| 4 | what is a vector database? | flow or transformation: documents, embedding model, vectors in an index, query embedded, nearest neighbours returned | embedding step, index store, query path; no coordinate-plot | bench `aiml/vector-db`: **acceptable 3/3, kind drawn `coordinate-plot`** (the word "vector" pulls a plot) | planner criteria (word collision: vector, plot) | diagram only |
| 5 | how does a decision tree make a prediction? | flow with decision nodes (owner's relabel: flow with decisions = right, tree = acceptable) | one worked example traced through yes/no questions to a leaf outcome; edge labels Yes/No; question-form decision labels | bench `aiml/decision-tree`: **acceptable 3/3, kind drawn `tree`** (word collision "tree") | planner criteria (tree vs flow with decisions), reference selection | diagram only |
| 6 | what does softmax do? | bar-chart of one worked example (logits next to probabilities), or transformation with computed values | logits 2.0, 1.0, 0.1 and probabilities about 0.66, 0.24, 0.10 computed from the formula the prose states; title says "worked example"; outputs sum to 1 | bench `content/softmax`: **`transformation` 3/3 and the formula criterion fails** ("plot or chart that recomputes" is 5/8 per run: softmax, attention-weights and precision-recall are the three misses); an earlier softmax card had an arithmetic error (0.10 for 0.09) | author prompt (formula to chart rule), server correction/arithmetic check | diagram only |
| 7 | how are attention weights computed? | bar-chart of one query's attention weights (or a matrix of scores then weights), numbers computed | scores of one query against the keys, divided by sqrt(d_k), softmax to weights that sum to 1, then the weighted sum named; a larger weight = more contribution | bench `content/attention-weights`: **`flow` 3/3, no plot/chart, formula criterion fails** (second of the three 5/8 misses) | author prompt (formula to chart), reference selection (the token-links kind is not in this build) | diagram only |
| 8 | what is overfitting? | ONE coordinate-plot: observed points drawn once as scatter, a simple-fit line, an overfit line, one annotated held-out point | caption says what to notice; the sentence before the plot points at it; models are lines only, the data is never redrawn as a second series | the owner's screenshot (one dashed line through eight points, the same points drawn twice, no simple fit, no held-out point); bench `content/overfitting` and `aiml/overfitting` are scored "right" 3/3 (kind `coordinate-plot`), so the label hides this content defect; the reference `ml-fit-quality-comparison` is not in this build (Codex integration pending) | reference/keywords, planner label (multi-series right, single-series wrong), author prompt (plot contract) | diagram only |
| 9 | how does the TCP handshake work? | sequence, two actors (client, server), three messages | SYN, SYN-ACK, ACK in order; sequence numbers x, y, x+1, y+1 on the messages; each message label says what is sent | bench `regression/tcp-handshake`: sequence right 3/3 (kind is not the problem); the prose test (Gini and TCP held out): Detailed persona "too basic" 6/6 on 116 and on the clean-up, "opens concrete" 0/6 at every depth on 116 (3/2/0 of 6 at Brief/Balanced/Detailed on the clean-up); owner raised it repeatedly | author prompt (prose and depth lines; visual already right) | diagram only |
| 10 | how does a suspension bridge hold up its deck? | picture (the bridge) plus one diagram (flow or relationship of load paths; a free-body figure only if it draws forces) | deck load to hangers to main cables to towers and anchorages; the picture shows the bridge; the diagram does not duplicate it | bench `baseline/suspension-bridge`: **planner V4 collateral flip, picture + `figure` 3/3** (labels accept it; the owner asked to see that it renders well); control for the physical-subject routing | renderer / author prompt (a figure kind for a bridge), planner (physical rule) | **picture expected** (the one picture prompt in the batch) |

Mix check: 5 AI/ML misses (rows 1-5), 2 formula/plot prompts that failed the recompute criterion (rows 6, 7), 2 from the owner's questions (rows 8, 9), 1 physical control (row 10). Pictures needed: 1 (row 10; limit 2).

## Selection evidence (bench ids and numbers)

| Row | Bench id and set | Numbers (clean-up 3x, 3 runs) |
|---|---|---|
| 1 | `aiml/gpu-matmul` | score right/right/right, mix `D:flow`, repaired 3/3, cause "two roots" 3/3 |
| 2 | `aiml/diffusion` | right/right/right, mix `D:flow`, repaired 3/3, cause "loop or unreachable node in a flow" 3/3 |
| 3 | `aiml/backprop`, `content/backprop` | acceptable x3 in each, mix `D:layers`; label best = flow, relationship, cycle |
| 4 | `aiml/vector-db` | acceptable x3, mix `D:coordinate-plot`; label best = flow, transformation, relationship, sequence |
| 5 | `aiml/decision-tree` | acceptable x3, mix `D:tree`; label best = flow (with decisions), acceptable = tree |
| 6 | `content/softmax` | right x3 (kind), mix `D:transformation`, no plot or chart; the formula criterion (plot or chart that recomputes) 5/8 every run |
| 7 | `content/attention-weights` | right x3 (kind), mix `D:flow`, no plot or chart; same 5/8 criterion |
| 8 | `content/overfitting`, `aiml/overfitting` | right x3, mix `D:coordinate-plot`; content defect (single series, doubled points) is not scored by kind labels |
| 9 | `regression/tcp-handshake`; prose test gini/tcp held-out | sequence 3/3 right; Detailed persona "too basic" 6/6 (116 and clean-up); "opens concrete" 0/6 (116), 3/2/0 of 6 (clean-up) |
| 10 | `baseline/suspension-bridge` | right x3, mix `P+D:figure` (planner V4); picture where needed 69/69 overall |

The 5/8 criterion's three misses are exactly softmax, attention-weights and precision-recall (the content set's formula prompts that did not draw a recomputable plot or chart; the other five, gini, cross-entropy, sigmoid, lr-schedule and gradient-descent, pass). Precision-recall is covered by batch 1 (confusion matrix), so it is not repeated here.

## Reserve (not in the ten; swap in if the owner prefers)

- `aiml/cpu-vs-gpu` ("what is the difference between a CPU and a GPU?"): kind right 3/3 (`D:comparison`), claims beyond the prose 2 of 3 runs (named facts: cache, branching, expansions of the acronyms). Probes the new "every number or name in a label appears in the prose" line.
- `aiml/tokenization` ("how does tokenization work?"): repaired 1/3 ("diagram.after.items: Too big"), claims beyond the prose 1 (the "##" marker, a named convention). Server correction (too many items in a transformation).
- `content/gini` ("what is gini impurity") and `content/cross-entropy` ("what is cross entropy"): plots right, but the owner marked the Brief cards wrong (plot at Brief); the prose pass probes them.
- `baseline/solar-eclipse` ("how does a solar eclipse happen?"): picture + `figure` 3/3 (the second V4 collateral flip).

## Batch-1 cards to regenerate (placeholder)

To be filled after the batch-1 review: every batch-1 card marked "wrong" is regenerated in batch 2 with the same prompt, after the fixes that review produced, and exported next to its batch-1 original (`review/batch-01-after/`).

| Batch-1 card | Verdict | Fix landed | Regenerated in |
|---|---|---|---|
| (pending the review) | | | |

## Constraints this draft keeps

- No prompt repeats batch 1; none is a prompt the bench judged only on a rubric edge.
- At most 2 picture prompts: 1 used (row 10).
- Each row names the layer it probes, so the fix pass can land at most one change per layer.
- Expected shapes are written before any card exists.
