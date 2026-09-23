# NanoGPT deep-dive board — Phase 1 plan

Board name: `nanogpt-deep-dive` (a fresh board; the existing `interactive-app-review`
board is untouched).

Purpose: stress-test the visual language, the interaction model and the composition
system across a much wider concept range than the four review cards.

## The bar every card is held to

An interaction earns its place only if changing it reveals a relationship,
counterfactual, or consequence that is hard to see in the static picture. "Click X
and X gets outlined" fails. Each card below records: concept, kind, what the learner
manipulates, what meaningfully changes, and whether practice is justified. Cards that
could not clear the bar were **downgraded to static or replay rather than padded with
a fake interaction**.

Authoring constraint: existing generic scene/input/derive vocabulary only — index,
bool, choice, indices, vec2; the declared derive ops; the existing render objects.
No lesson-specific runtime code, no new primitives, no scene-ID branches. Where a
capability is genuinely missing it is reported below as a gap, not patched with a
special case.

## Final set: 26 cards

Three merges were applied to the first 29-card draft: the two identical
residual-toggle cards became one; "Next-token prediction" folded into "What loss
measures" (the surviving card actually recomputes the distribution rather than
re-reading a fixed one); "Output aggregation" folded into the existing attention
explorer as a contribution row.

Kind mix: **3 static, 5 replay, 11 interactive-explore, 7 practice.**

### Module A — Big picture / architecture

| # | Card | Kind | Manipulates | What changes |
|---|------|------|-------------|--------------|
| 1 | NanoGPT end-to-end map: IDs → logits | static | — | Reference map; shape badges mark the only two reshape points ([T]→[T,C], [T,C]→[T,V]) |
| 2 | Anatomy of one transformer block | replay | — | Builds in dependency order so pre-norm placement and the two residual bypasses land as a sequence |
| 3 | The residual connection: remove it and watch the signal vanish | explore | bool | Output vector recomputes: ON → `x + f` (input survives); OFF → `f` alone (signal collapses to a tiny delta on a shared scale) |
| 4 | A stack of N identical blocks | replay | — | Blocks stamp out with an unchanging `[T,C]` badge: depth is repetition, shape is invariant |
| 5 | Attention mixes across tokens; the MLP mixes within each token | static | — | Side-by-side connectivity: cross-token arrows vs strictly per-token arrows |

### Module B — Tokenization / embeddings

| # | Card | Kind | Manipulates | What changes |
|---|------|------|-------------|--------------|
| 6 | Tokenizer: the same text, a different number of tokens | explore | index | One fixed string re-segments: ~12 char chips → 2 subword chips → 1 word chip; vocab size moves with it |
| 7 | Token ID → embedding: a learned lookup, not a formula | explore | index | Stepping id 0→1→2→3 gathers unrelated rows — proving "id 2" is not "near" id 3 |
| 8 | Two embedding tables: one keyed by content, one by position | static | — | Names the two key axes and separates them spatially |
| 9 | Token + position = the vector the model reads | practice | index + bool | The two `l`s share a token embedding but differ by position; switching position OFF makes them identical (`index_equals`) |

### Module C — Attention

| # | Card | Kind | Manipulates | What changes |
|---|------|------|-------------|--------------|
| 10 | Attention explorer (anchor — ships today) | explore | index + bool | Query recomputes every stage; mask re-normalizes the distribution and the output. Absorbs the per-token contribution row |
| 11 | Causal mask as a triangle (full N×N) | practice | bool | Mask OFF → the full square leaks future weight into early rows, visible across *all* rows at once (`set_equals`) |
| 12 | Why we divide by √dk | practice | index | Same raw scores; small factor smears attention to near-uniform, large factor saturates onto one token (`index_equals`) |
| 13 | Multi-head: same tokens, different focus | practice | index | Same query, different head → weight mass lands on entirely different tokens (`index_equals`) |

### Module D — MLP / block internals

| # | Card | Kind | Manipulates | What changes |
|---|------|------|-------------|--------------|
| 14 | Inside the MLP: expand → GELU → contract | replay | — | The `[C]→[4C]→[C]` width bulge and where the nonlinearity sits |
| 15 | LayerNorm: the block doesn't care how you shift the token | explore | index | Offsetting every feature moves the raw strip and its mean, while the centered strip stays pixel-identical |

### Module E — Training

| # | Card | Kind | Manipulates | What changes |
|---|------|------|-------------|--------------|
| 16 | Cross-entropy is a graded signal, not pass/fail | explore | bool | Top-1 choice is unchanged (identical "accuracy") while probability on the truth swings wide |
| 17 | Training drives the loss down — step by step, and noisily | replay | — | Steep early drop, then a jittery plateau; deliberately no learner knob |
| 18 | Train vs validation: where to stop | practice | index | Later stop keeps lowering train loss but *raises* val loss; the gap is derived (`index_equals`) |
| 19 | Learning rate: one step, from too-small to divergence | practice | index | Each preset recomputes a real post-step loss: 0.1 barely dents, 1.0 lands on the minimum, 2.5 diverges (`index_equals`) |
| 20 | Momentum: averaging out noisy gradients | explore | index | β=0 reproduces the raw thrashing gradients exactly; raising β damps oscillation into a steady drift |

### Module F — Inference / generation

| # | Card | Kind | Manipulates | What changes |
|---|------|------|-------------|--------------|
| 21 | Temperature: the peakiness knob | explore | index | Same logits morph from near-one-hot (greedy) to near-uniform (random) via `softmax(logits/T)` |
| 22 | Top-k: truncating the distribution | practice | index | Shrinking k zeroes the tail *and* raises every survivor via renormalization; k=1 is greedy (`set_equals`) |
| 23 | Context window: losing the distant past | explore | index | The sequence is built so an early token decides the answer; shrinking the window past it flips the prediction |
| 24 | The generation loop | replay | — | Each emitted token appends to the context and conditions the next distribution |
| 25 | Autoregressive conditioning: your token changes the next | explore | index | Choosing a different first token swaps the conditional row, changing the second-step distribution and its argmax |
| 26 | What loss measures | explore | choice | untrained → partly → trained concentrates mass on the true token (~0.15 → ~0.45 → ~0.8) |

## First batch (10 cards, spans all four kinds)

1. **NanoGPT end-to-end map** — static; the reference every later card hangs from
2. **Anatomy of one transformer block** — replay; topology in dependency order
3. **The residual connection** — explore; highest-signal counterfactual in the set
4. **Tokenizer: same text, different token count** — explore
5. **Attention explorer** — explore; ships today, extended with the contribution row
6. **Causal mask as a triangle** — practice; leakage across all rows at once
7. **Multi-head: same tokens, different focus** — practice
8. **Temperature: the peakiness knob** — explore
9. **The generation loop** — replay; output→input feedback is inherently temporal
10. **What loss measures** — explore

Two substitutions against your suggested list, both because the card is **not
honestly buildable today**: "Loss curve explorer" and "LR schedule" both need a
smooth multi-point curve the vocabulary cannot draw (see gaps). Their buildable
forms are #17 (replay bars) and #19 (one-step LR), kept for batch 2. I substituted
the residual counterfactual and the causal-mask triangle, which carry more first-batch
signal.

## Vocabulary gaps found (reported, not worked around)

Ranked by leverage:

1. **Continuous curve / polyline plot** — `line` is one straight segment, `bars` is
   discrete. Blocks 4 training cards (loss curve, train-vs-val, LR schedule).
   *Workaround in use:* discrete per-checkpoint bars, labeled illustrative.
2. **An `indices` → null-mask op** (plus prefix-sum for cumulative thresholds) —
   would fix **both** top-k and context-window honesty at once, and enable free-choice
   subsets instead of presets. *Workaround:* precomputed per-preset masked vectors;
   renormalization stays genuinely derived.
3. **`log`/`exp`** — cross-entropy and perplexity cannot be computed exactly (softmax
   hides its exp). *Workaround:* show p(truth), which loss monotonically tracks, and
   never print a fabricated loss number.
4. **Elementwise nonlinearity (ReLU/GELU)** — the MLP's defining op isn't derivable,
   which is why #14 is replay rather than interactive.
5. **`sqrt`/`rsqrt`** — LayerNorm's ÷σ and Adam's per-parameter RMS. *Workaround:*
   teach the mean-centering half honestly and caption the remaining step.
6. **Input-bound visibility for a set of objects** — opacity is timeline-driven, so
   one row can't toggle between two arrow-sets; forces #5 to be two static panels.
7. **Grid `rowLabels`** — only `columnLabels` exist; the N×N mask card needs query-axis
   labels.
8. **`length`/count op and RNG** — no derived token count; no stochastic sampling in a
   pure seam. *Workaround:* the chip strip's visible length carries the count;
   sampling is taught as temperature peakiness plus replay.

## Acceptance record

Each card ships with its concept / why-visual / manipulation / consequence /
why-better-than-a-paragraph / practice-justification recorded, and any card that
fails the bar at build time is downgraded to static rather than shipped with a
decorative interaction.
