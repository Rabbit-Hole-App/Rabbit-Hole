# nanogpt-depth-ladder — one concept, three learner-chosen depths

A review board that tests Rabbit Hole's adaptive-depth idea: six NanoGPT
concepts, each taught three times — **Overview**, **Guided**, **Deep dive** —
18 cards. The learner picks the depth; nothing infers it and no card describes
the learner (the board test forbids beginner/intermediate/advanced-style
labels anywhere on a card).

Open it: `https://small-cp-dev-small-deploy.zeroshothq.workers.dev/apps/repo-06745f10-nanogpt?tab=learn&board=nanogpt-depth-ladder`

## How the learner chooses

One section heading per concept, one sub-section per depth, each followed by
its card. The Learn page's table of contents lists them
(*Attention › Overview / Guided / Deep dive*); clicking an entry brings that
card into view. The card title repeats concept and depth
(*Attention · Deep dive: …*), so a card read on its own still says what it is.

## The ladder (what each depth must do)

| | Overview | Guided | Deep dive |
|---|---|---|---|
| Aim | intuition, concrete cause → effect | mechanism, numerical relationships, meaningful manipulation | exact equations, named shapes, source, branches, edge cases, tradeoffs |
| Controls | exactly one, discrete | 1–2 that move real numbers | an implementation-branch control + a triggerable edge case |
| On the card | plain words; no equations or tensor shapes | numbers the learner can check (sums to 1, ratios, invariances) | LaTeX equations, (B, T, C…) shapes, a quantified tradeoff |
| Prerequisites line | "No prerequisites." | "Builds on: <Overview idea>; <math>" | "Builds on: Guided; <shapes…>" |
| Source | collapsed Sources & evidence | same | a code source for every step; the inspector is the code connection — no code on the card |

"Deeper" must not mean "more paragraphs": a Deep dive's visible text is capped
at ~1.3× its Guided card's; the depth is carried by structure. Short cross-depth
bridge lines may be left out of that ratio when they only connect ideas already
taught at another depth and introduce no new mental model (owner, NC8: Residual
Deep 3/3's caption tying 2L changes to the Overview's running total); the
exemption never covers extra explanation. All three cards
of a concept share the source truth — `karpathy/nanoGPT@3adf61e`, the pinned
dataset, the fixtures — and, where it fits, the same example, so switching
depth keeps the example recognisable. The universal card rule of the deep-dive
board applies (status labels on the card, provenance under Sources & evidence).

## The 18 cards

| Concept | Overview | Guided | Deep dive |
|---|---|---|---|
| Tokenization | Letters vs word pieces for one line: piece count, kinds of piece, how much of the play fits the window (choice) | Character → integer ID by lookup in the sorted 65-character list, and back; GPT-2 pieces and their IDs (position slider, tokenizer choice) | encode → (B, T) uint16 → wte (V, C) → logits; train.py's meta.pkl branch (65 vs the 50,304 fallback), parameter and logit costs, the digit prompt that stoi cannot encode (bool + choice) |
| The Transformer, end to end | Six stages from "hear me spea" to the next character (stage stepper) | Where the 10.65M parameters live: 12C²+2C per block vs V×C embeddings, tying (C and V pickers) | Shape after every step of GPT.forward per call site — training, generation, crop, direct (assert fails); untie what-if (choice + bool) |
| Attention | Which earlier characters the character being read looks at; the future never lights (reader picker) | One reader's row: q·k, ÷√hs, mask, softmax, weights sum to 1, masked = 0 (reader slider, "q points at" what-if) | CausalSelfAttention.forward as tensor steps with shapes, per-head maps, T slider, manual vs fused path, drop-1/√hs what-if (4 controls) |
| Residual stream and LayerNorm | Keep or drop the stream through six toy blocks: the token's own pattern survives or is lost (bool) | One pre-LN sub-block in numbers: mean/std → x̂ → change → x + change; scale/shift invariance (multiplier slider, shift picker) | Pre-LN vs post-LN what-if, the ε edge case on a constant vector, bias=False, the 0.02/√(2·n_layer) scaled init (3 controls) |
| Training and loss | One context's guess moving onto the right letter across four recorded stops, loss falling (stop picker) | Loss = mean of −ln p(target): every prediction a dot on the −ln p curve, train vs val and the best checkpoint (checkpoint slider, inspect picker) | One train.py iteration: get_lr branch, eval/save guards, cross-entropy over B·T, gradient accumulation, clipping, AdamW groups; 1-GPU vs 8-GPU config (iteration picker, config choice) |
| Generation and sampling | The write loop — read, score, pick, append, repeat — over a recorded run (step picker) | Temperature: logits ÷ T → softmax, the gap scales by 1/T, ranking never changes; seeded draws (T slider) | One generate() iteration: block_size crop, last-position logits (B, 1, V), ÷ T, top-k, softmax, multinomial; T = 0 edge case (3 choices) |

## Benchmark: does each depth genuinely teach at a different level?

**Method.** Two independent signals per concept.
1. *Structure* — `node scripts/depth-metrics.mjs` reads each card at its end
   state: visible characters, equations, named shapes, numbers shown, visual
   primitives, control types, configurations, derived values, sources by kind.
2. *Judgement* — a fresh judge agent per concept (never the author or fixer)
   rendered every card at every review state, looked at the pixels, recomputed
   the numbers against the pinned sources, and decided for each step
   (Overview→Guided, Guided→Deep dive) whether it is genuinely different or
   "more words on the same picture". Round 1 found repairs in every concept; a
   repair agent fixed them, a second judge re-benchmarked, a final fix round
   applied the round-2 findings, and an independent verifier re-checked them.

**Structure (end state, default inputs).**

| Concept | Depth | Chars | Equations | Shapes | Numbers | Controls | Configs | Code sources |
|---|---|---|---|---|---|---|---|---|
| Tokenization | Overview | 677 | 0 | 0 | 13 | choice | 2 | 4 |
| | Guided | 645 | 0 | 0 | 15 | slider, choice | 58 | 4 |
| | Deep dive | 692 (1.07×) | 5 | 3 | 55 | bool, choice | 6 | 23 |
| Transformer | Overview | 438 | 0 | 0 | 1 | slider | 6 | 9 |
| | Guided | 1113 | 0 | 0 | 39 | picker, picker | 4 | 11 |
| | Deep dive | 1066 (0.96×) | 6 | 7 | 49 | choice, bool | 8 | 19 |
| Attention | Overview | 422 | 0 | 0 | 0 | picker | 9 | 2 |
| | Guided | 571 | 0 | 0 | 14 | slider, choice | 18 | 5 |
| | Deep dive | 642 (1.12×) | 10 | 4 | 56 | picker, slider, choice, bool | 108 | 17 |
| Residual/LayerNorm | Overview | 603 | 0 | 0 | 2 | bool | 2 | 4 |
| | Guided | 684 | 0 | 0 | 10 | slider, picker | 15 | 4 |
| | Deep dive | 869 (1.27×) | 4 | 4 | 31 | choice, choice, bool | 12 | 19 |
| Training and loss | Overview | 703 | 0 | 0 | 17 | picker | 4 | 2 |
| | Guided | 971 | 0 | 0 | 26 | slider, picker | 252 | 5 |
| | Deep dive | 967 (1.00×) | 5 | 4 | 50 | picker, choice | 12 | 23 |
| Generation | Overview | 551 | 0 | 0 | 4 | picker | 8 | 4 |
| | Guided | 903 | 0 | 0 | 36 | slider | 6 | 5 |
| | Deep dive | 1060 (1.17×) | 2 | 6 | 36 | choice ×3 | 24 | 16 |

Every Overview has one discrete control and no equations or shapes; every
Guided card adds numbers and a checkable relationship; every Deep dive adds
equations (2–10), named shapes (3–7), a branch control and 16–23 code sources,
with visible text between 0.96× and 1.27× its Guided card's — the depth is not
in the prose.

**Verdict (final judge round):** all six concepts — *three distinct levels*;
both steps genuinely different in every concept; no step judged "more
paragraphs only".

**Honest weaknesses the judges kept.**
- Two Overviews are *watch-only*: *Generation* steps through a recorded run and
  *The Transformer* paces a story; the learner changes what is shown, not a
  cause. They still pass the Overview bar (one discrete control, concrete
  effect), but a pick-your-own-next-character Overview would teach cause/effect
  more directly.
- Three concepts' Guided or Deep dive cards show rounded values that come out
  slightly off because of the shared renderer (see below).

## Gaps in the shared renderer (reported, not changed)

- Grid cells print without the leading zero (`.90`) and print values ≥ 10 as
  integers — `num` in `AnimatedScene.jsx`. Cards work around it with text
  readouts where it matters; the integer-cell approval request is still open.
- Double rounding: derive ops round to 3 decimals, cells then print 2, so a
  value near a half step can show the wrong last digit (attention weights).
- A highlighted bar is scaled 1.06× around the bar-plus-label centre and sits
  3–4 px below its neighbours' baseline; the tokenization Guided card stopped
  highlighting the bar to avoid it.

## Verification

- Unit: every card at every review state passes the scene gates (object limit,
  consistency, layout lint, text overflow, no citations on the surface),
  `assertSources`, `assertEvidence`, and plain-JS oracles for every number;
  every cited line checked against the sha-pinned nanoGPT files; every concept
  generator reproduces its fixture byte for byte (`--check`).
  `src/nanogpt/depth/board.test.mjs` checks the section/depth structure,
  unique titles, sources, review states and the absence of learner labels.
- Deployed (real clicks, `e2e/board-interaction-check.mjs`): every card reached
  from its table-of-contents entry; at each review state the rendered text
  equals the evaluator's; Reset restores defaults.
- Deployed sources (`e2e/card-sources-check.mjs`): collapsed by default, counts,
  groups, every code link opens the source panel at 3adf61e with exactly its
  lines highlighted (text compared with the pinned files), arXiv links open the
  paper reader in place, no chat request.

## Review pass 1 (2026-09-24)

An external review of the 18 default states approved the ladder ("three levels
genuinely different") and asked for one targeted pass, applied in place:

- **Generation · Deep dive** — T = 0 is no longer offered as a setting: the
  option reads "0 - invalid (What-if)", the ÷ T step turns red with
  "Invalid: generate() requires T > 0", and the downstream steps are dimmed and
  never run (no silent argmax).
- **Attention · Deep dive** — the 604 MB figure is labelled "Manual attention,
  fp32 illustrative memory" with "fused SDPA need not materialize this full
  matrix"; the path option reads "fused SDPA (NanoGPT default when available)";
  the gradient line claims only local sensitivity (∂w_i/∂s_i → 0 near 0 or 1).
- **Attention · Overview** — "Future characters are hidden from this position".
- **Residual/LayerNorm** — Overview leads with "each block reads the current
  stream, proposes a change, and adds that change back", LayerNorm is a quiet
  detail line; Guided says "Nearly the same here; ε is tiny relative to this
  variance" wherever the multiplier is not 1; Deep dive scales only
  attn.c_proj and mlp.c_proj ("other Linear/Embedding: std 0.02").
- **Training** — Overview reveals the loss curve only up to the chosen stop;
  Guided stages its three ideas in the replay (−ln p for the selected
  transition → average training loss → held-out loss and checkpoint choice);
  Deep dive labels the AdamW equation "conceptual update".
- **Tokenization** — "word pieces (text chunks)"; the Guided lookup path is
  primary and the 65-entry table quieter; Deep dive names "NanoGPT's reported
  non-position-embedding parameter count (wpe still trains)".
- **Transformer** — "65 next-character scores"; Guided labels each parameter
  group with what it does (the "most of the parameters" claim is computed and
  flips to "under half" at V = 50,304); Deep dive spells out generate()'s crop
  (257 → 256) so it never implies 257 positions reach the model.

Re-verified in the deployed app: 18 cards, every review state, 0 failures.

## Deep dives as sub-cards (2026-09-28, WP6)

Owner review of v2: Overview and Guided are the right size; every Deep dive held 4–5 ideas in
one frame, and the tallest were scaled down to 0.86, drawing 13px annotations at about 11px.
Each Deep dive is now paged into numbered sub-cards inside the same card ("Deep dive · k/N" in
the header, Previous / Next), sharing one INTERACT row, practice and Sources & evidence; the
ladder stays 6 × 3. Mechanism and rules: docs/features/learn-canvas-blocks.md, "Sub-cards";
decision and reasoning: docs/progress.md.

| Concept | Sub-cards |
|---|---|
| Tokenization | 1/3 meta.pkl → stoi → get_batch → logits · 2/3 wte and lm_head sizes, parameter count N · 3/3 block_size tradeoff and the digit edge case |
| The Transformer, end to end | 1/3 Call site, assert, embedding · 2/3 One Block, run n_layer times · 3/3 ln_f, lm_head, the loss and two savings |
| Attention | 1/4 Shapes: split, view, transpose · 2/4 The causal mask and att · 3/4 fp32 memory and the fused path · 4/4 The 1/√hs experiment |
| Residual stream and LayerNorm | 1/3 Pre-LN or post-LN · 2/3 LayerNorm and ε · 3/3 The scaled init |
| Training and loss | 1/3 get_lr schedule and eval · 2/3 Micro-steps: forward, loss, backward · 3/3 The step: clip, AdamW, zero_grad |
| Generation and sampling | 1/4 Crop, forward, last position · 2/4 Temperature and top-k · 3/4 Softmax over the kept logits · 4/4 Draw and append (T = 0 invalid is a state here) |

Two departures from the owner's split, both inside the 2–4 rule: Generation takes 4 sub-cards
(softmax got its own, so the draw part holds one visual); Training's 2/3 and 3/3 each hold two
stacked equations (loss + accumulation; clip + AdamW) — five equations cannot be one per part
within four parts. Attention · Guided was brought to scale 1 by layout only. Every card now
passes the render-size floor gate (`assertCardGates`) on every sub-card at every review state.

## Cross-depth transitions (NC8, 2026-09-29)

A read-only audit (one auditor per concept, one for sub-card state, a synthesis) checked the
owner's NC8 boxes. Card side only: the content supports going deeper and simplifying; no
routing is built here.

| NC8 check | Audit | Fix |
|---|---|---|
| Overview has a meaningful deeper target | PASS in all six concepts (same example and numbers into Guided) | — |
| Guided has a meaningful deeper target | Partial: Architecture, Attention and Training Deep opened without a bridge to Guided | one bridge line each (Architecture Deep 2/3 header, Attention Deep 1/4 note and Builds-on, Training Deep Builds-on; Training Guided says "held-out (val)") |
| Deep has a sensible simpler target | Partial: Attention Deep 3/4 (memory) and Residual Deep 3/3 (scaled init) had no simpler form anywhere | one line each tying the part back to Guided / the Overview |
| Prerequisites can be represented | Partial: batch-2 records had no direction (c07 ↔ c09 read as a cycle); depth cards carried prose only | directions on the four batch-2 records, a board-wide relationship test; transition data below |
| Sub-card state stays coherent | PASS (each card keeps its own part and inputs across reload, Reset, replay; no leaks) | — |

Residual Overview also stated one add per block where Deep, c02 and c03 say NanoGPT's Block adds
twice (contradictory depth behaviour): the Overview now says so on the card, briefly.

**Owner decisions (2026-09-29).**
- **Sub-card targeting is approved.** A transition may name a target sub-card, by a stable
  semantic part id, never by position ("4/4") or array index. Without a part it lands on the
  whole card (its default part); a part id that no longer exists falls back to the parent card
  instead of breaking navigation. Shape, conceptually: `{ relation: simplifies_to | deepens_to |
  prerequisite | related, target_card, target_part?, from_part? }`.
- **Architecture Deep is a hub, not forward-linked.** It previews and connects the whole system;
  Attention Guided and Training Guided later explain those mechanisms more deeply. Its edges to
  them are `deepens_to` (from the relevant sub-card), never `prerequisite`: a prerequisite that
  comes later in the ladder would make the graph run backwards. If Architecture Deep ever needs
  a later mechanism in detail to make sense, Architecture Deep is overreaching and is simplified.
- **Transferable state is declared, never inferred.** A future router carries only inputs a card
  lists as `transferable_inputs`; entering another depth otherwise uses that card's own
  defaults. Inputs are never copied between depths by matching names (Training's `stop` means a
  different thing on Overview and Deep). Recorded as a contract requirement; not implemented.
- **Defaults kept.** Training Deep keeps opening at it = 2550 (mid-training shows change; an
  endpoint would not) with the Builds-on bridge back to Guided. Residual Overview keeps the
  two-add disclosure on the card: two residual additions per block are part of the mental model.
- **Optional bridge lines** (Tokenization, Architecture Guided, Residual Guided, Generation
  Guided) only where a transition is causally abrupt, one sentence each, never for uniformity.

**To NC9.** A small Softmax prerequisite card (logits → positive probabilities summing to 1;
exponentiation makes larger logits relatively larger; normalise by the total; relative gaps
matter), reusable for Attention Guided and Generation Guided to branch to and return from, not a
new depth ladder or sequence — built only if NC9 confirms those cards cannot stand without it.
Also notation drift (y for two tensors on Architecture Deep, log vs ln, n_h vs nh, ␣/•/sp,
u/change/F_k, η/λ vs lr/wd), example drift (c21/c22's six candidates after "First Citi" vs the
depth cards' eight after "iti"; c10's B e f o toy vs Attention Guided's), and c18's practice,
whose answer Training Guided's default shows (the smallest fix: change the practice case or what
Guided claims as its reveal, no reordering).

## NC9 coherence: q·k score production (2026-09-29)

**PASS** (two independent auditors, audit only, nothing changed). Owner question: is how attention
scores are produced taught before later cards rely on q·k? On the path Attention Overview →
Guided → Deep:
- **q and k:** Attention Guided draws the reader's query column "q" and "keys k, one column per
  character", with the "q points at" What-if; Deep 1/4 gives their origin (c_attn(x).split →
  q, k, v), previewed by Architecture Deep 2/3 as a hub.
- **Dot product:** Guided's step "1. score = q · k" multiplies dim by dim (0.38 | 3.62 | 2.62 |
  1.38) and adds ("add them: 8 = its score").
- **Score matrix:** Guided gives one score per key for each reader (the Reader slider changes the
  row); Deep 1/4 stacks the rows ("q @ k.transpose(-2, -1) … att @ v: Guided's steps 1–4, for all
  readers of all heads at once"), Deep 2/4 draws the (T, T) grid.
- **Why larger means a better match:** q's sign pattern equals key "f"'s, so every product is
  positive and "f" scores highest (8.00); key "w", the opposite pattern, scores −8.00; the What-if
  moves the match and the score follows. Shown by construction rather than stated in words — the
  thinnest piece, but learnable, so not a gap.

Overview never relies on q·k (it lives in its Sources); Guided teaches it where it first uses it;
Deep relies on it after "Builds on: Guided". For information only: on the deep-dive board c13 and
c12 name q·k without teaching it — the owner's 2026-09-28 decision (board plan §11, no q·k card;
Attention · Guided computes the scores by hand) stands, and this check was scoped to the ladder.
