# NanoGPT deep-dive board — plan (revision 2)

Board: `nanogpt-deep-dive` (a fresh board; `interactive-app-review` and
`interactive-holdouts` are untouched). Target: 26 cards in six modules. The
first batch of ten is built; the other sixteen wait for review.

This revision replaces revision 1, which contained two false capability claims
and several technical overstatements. Both are corrected below, with evidence.

## 0. What this plan is checked against

| | |
|---|---|
| Worktree | `small-deploy`, branch `feat/canvas-block-conversations` |
| HEAD when checked | `d5a2c1a` |
| Base (merge-base with `main`) | `94dad46` |
| NanoGPT revision | `karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291` — read from `repo_commit` of the connected app `repo-06745f10-nanogpt` via `/api/apps` (not assumed from upstream `master`) |
| Capability evidence | `packages/web/scripts/probe-scene-capabilities.mjs` — every claim below is a probe you can re-run: `node scripts/probe-scene-capabilities.mjs` |

## 1. Capability report — verified, classified

Categories: **renderer** (cannot draw it) · **calculation** (evaluator cannot
compute it) · **binding** (value exists, cannot reach the field) ·
**composition** (possible today from existing primitives) · **precomputed**
(possible today from validated authoring-time data).

### Two revision-1 claims were wrong

| Claim in revision 1 | Verdict | Evidence |
|---|---|---|
| "Grids expose only `columnLabels`, not `rowLabels`" | **Wrong — supported.** Not a stale branch, a different primitive, or an unsupported binding. | `rowLabels` is declared in the scene schema, drawn at `AnimatedScene.jsx:247`, laid out at `scene-layout.js:124`, present since `7e2cc0c` (2026-09-19) — at the base `94dad46`, on `main`, and at HEAD. Probe `grid-row-labels` evaluates a grid with `rowLabels: ['query 0','query 1']` and they survive to the rendered object. The claim was an unverified inference by a design subagent that I put in the plan without checking. No second row-label implementation is needed or built. |
| "No input can show or hide a set of objects (opacity is timeline-driven)" | **Wrong — possible by composition.** | Probe `input-bound-visibility`: `opacity: {$derive: 'opA'}` with `opA = pick([1,0], which)` → `which=0` shows A / hides B, `which=1` the reverse. One real constraint: an object whose visibility follows an input must not also carry a timeline `appear` (the probe shows the appear wins). |

### What the runtime actually can and cannot do

| Need | Status | Category | Evidence (probe id) | Response |
|---|---|---|---|---|
| Row and column axis labels on a grid | supported | — | `grid-row-labels` | use it |
| Show/hide objects by an input | supported | composition | `input-bound-visibility` | derived `opacity`; no `appear` on those objects |
| A token row whose **length** follows an input | supported | composition | `variable-length-tokens` (6 chips → 1) | derived `tokens` list |
| A grid whose **shape** follows an input | supported | composition | `derived-grid-shape` (1×3 → 1×1, gates clean) | derived `rows`/`cols`/`values` |
| argmax | supported | composition | `argmax-by-composition`: `argmin(scale(v,−1))` → 1 | compose |
| Piecewise-linear plot through checkpoints with axes and a shared scale | **possible, bounded** | composition | `piecewise-linear-plot` (segments evaluate, gates clean); rendered and inspected (`plot.js`, LR schedule, 22 points) | built from `line` segments + `text` ticks; data→pixel mapping through the existing `scale`/`add` ops. **Ceiling: ≤ 60 objects per scene** (schema), one object per segment/tick — about two 20-point series. See §4. |
| `log`, `exp`, `sqrt`, GELU/ReLU, cumsum, top-k, token count, indices→mask | absent | calculation | `missing-ops`: `unknown op "log" - known ops are dot, matmul, softmax, causal_mask, sum, weighted_sum, scale, elementwise, choose, argmin, sub, gate, add, pick, concat` | **precomputed** fixture values (§2). Not added to the evaluator. |
| Small magnitudes (learning rates) in arithmetic | constraint | calculation | `derive-precision`: `scale([0.0001, 0.00095], 1) → [0, 0.001]` — every op result is rounded to 3 decimals (`scene-derive.js:15`) | keep sub-1e-3 values out of arithmetic (`pick` returns raw); display pre-formatted strings from the fixture |
| Small numbers in grid/strip/bars cells | constraint | renderer | `cell-number-format`: `0.0001 → ".00"`, `14.1 → "14"` (`AnimatedScene.jsx:40`) | learning rates shown as text readouts, never cells |
| Text wrapping | gap | renderer | `text-wrap`: no `<tspan>`; only equations get a wrapping HTML box (`AnimatedScene.jsx:567`) | split long captions into separate lines by hand |
| A `vec2` control in an animation card's INTERACT zone | gap | renderer | `vec2-control`: `WIDGETS = { index, bool, indices, choice }` (`SceneControls.jsx:113`) — a declared `vec2` input silently gets **no** control | not needed in batch 1; report only |
| Live random sampling | by design | precomputed | `randomness`: the evaluator is pure | show seeded draws recorded by the generator, labelled |
| Object types | — | — | `rendered-types`: box, text, circle, arrow, line, equation, code, image, grid, strip, bars, tokens | no polyline/path/axis type |

Other schema limits the cards were built against: ≤ 200 timeline events,
≤ 48 tokens of ≤ 24 characters, labels ≤ 24 characters, rows/cols ≤ 64,
cell ≤ 80, a text object ≤ 600 characters.

## 2. Fixtures: calculated, recorded, or read from source

`packages/web/src/nanogpt/fixtures/` holds the generation script and its
output together:

- `generate_fixtures.py` — stdlib Python + tiktoken (pinned `0.14.0`). It
  downloads each source once, **verifies a pinned sha256**, and computes.
- `nanogpt-fixtures.generated.js` — the output the cards bind to. Header says
  generated; never edited by hand.
- Reproducibility: `uv run --with tiktoken==0.14.0 python generate_fixtures.py --check`
  regenerates in memory and fails on any byte difference (it passes).

Sources and how each is used:

| Source (pinned) | Used for | Provenance label on the card |
|---|---|---|
| `train.py@3adf61e` — **its own `get_lr` function is parsed out of the file and executed**, and its top-level defaults are read with `ast` | the LR schedule; the toy run's schedule | *source* |
| `config/train_shakespeare_char.py@3adf61e`, resolved over `train.py` defaults the way `configurator.py` does | B=64, T=256, C=384, n_layer=6, n_head=6, dropout 0.2, bias False, lr 1e-3, warmup 100, decay 5000, min_lr 1e-4, beta2 0.99 | *source* |
| tinyshakespeare `input.txt` (sha256 `86c4e6aa…`), vocabulary rebuilt exactly as `data/shakespeare_char/prepare.py` does | 65-character vocabulary and IDs; the toy run's data (prepare.py's 90/10 split) | *source* |
| tiktoken `gpt2` (as `data/shakespeare/prepare.py` uses) | real BPE tokens and IDs, vocab 50257 | *source* |
| Script-authored toy inputs (logits, vectors, a 20-step gradient sequence) | cross-entropy, LayerNorm, optimizer, temperature | *calculated toy example* |
| A seeded run the script performs: a **character bigram** table (65×65) trained with a faithful AdamW, NanoGPT's `get_lr`, gradient clipping, on a 1,200-character training slice | train/validation curves | *recorded toy run — not NanoGPT's transformer* |
| Derive ops inside the card (softmax, scale, add, matmul …) | anything the evaluator can compute | *live calculation* |

Rules the cards follow: no derived number is typed into a label (all bind to
the fixture or to derive results); discrete controls are called presets; a
stored result is never described as the model training or running.

## 3. Technical corrections (checked against `@3adf61e`)

| Card | Revision 1 said | Now |
|---|---|---|
| 1 IDs → logits | "the only two reshape points" | Embedding and `lm_head` change the **representation** (IDs → learned vectors; vectors → one score per vocabulary entry). Batch dimension shown: idx (B,T) → (B,T,C) … → logits (B,T,V) in training. Generation projects **only the last position**, (B,1,V) (`model.py:190`). Weight tying noted (`model.py:138`). |
| 4 N identical blocks | "the same block reused" | Same architecture, **separate learned parameters**: `nn.ModuleList([Block(config) for _ in range(n_layer)])` (`model.py:130`). |
| 3 Remove the residual | "remove it and the signal vanishes" | Renamed **"What the residual preserves"**. A deliberately small toy branch shows what the skip path carries; no general claim that removing residuals destroys the signal. |
| 6 Tokenizer | invented subword split; vocab inferred from a count | Real tokenizers only: `shakespeare_char` (29 tokens, vocab 65) vs tiktoken GPT-2 BPE (5 tokens, vocab 50257) for the same dataset text. `GPTConfig` pads 50257 → 50304 (`model.py:111`). |
| 12 Divide by √dₖ | direction unstated | The code **multiplies** by `1.0 / math.sqrt(k.size(-1))` (`model.py:67`). The control is a multiplier: a larger positive multiplier sharpens unequal logits. |
| 13 Multi-head | "heads focus on entirely different tokens" | "In this hand-built example" head patterns differ; trained heads can overlap or have no clean role. |
| 15 LayerNorm | mean-centering only; "the block ignores shifts" | Full normalization: mean, biased variance, `÷ √(var + 1e-5)`, × γ (`model.py:27`); `bias=False` by default so no β. Invariance holds for the normalized input a sub-layer reads — the residual stream itself is not normalized. |
| 19–20 LR, momentum | generic momentum as the optimizer | One quadratic step is labelled a **prerequisite**; the optimizer card ends at **AdamW** — betas (0.9, 0.95) default / (0.9, 0.99) shakespeare_char, weight decay 0.1 only for tensors with dim ≥ 2 (`model.py:263-284`), grad clip 1.0. |
| 21 Temperature | low T ≈ greedy | `generate()` divides by T then always samples with `torch.multinomial` (`model.py:318, 326`). Low T is **sharper, not greedy**: at T = 0.25 one of 20 recorded draws is still not the top token. Positive presets only. |
| 23, 26 Context, training states | implied measured behaviour | Every changing prediction names its source: a toy conditional table, or the recorded toy bigram run. Nothing is called NanoGPT's measured behaviour. |

## 4. Loss, metrics and optimizer coverage — kept, not dropped

- **Plotting.** Composition works: `plot.js` builds axes, ticks, series and
  markers from existing primitives, with the data→pixel mapping in the derive
  seam, and the LR schedule was rendered and inspected at 22 points. Batch 1
  ships two real line-plot cards (#17 LR schedule, #18 train vs validation).
  What composition does **not** test: a native series/axis abstraction, plots
  with many points or series (the 60-object ceiling allows about two 20-point
  series), and automatic scales.

  > **Requested capability:** time-series / metric plot beyond ~40 points
  > **Status:** bounded by the scene's 60-object ceiling (a composed plot spends one object per segment)
  > **Existing alternative in use:** composed `line` segments (not bars)
  > **What the alternative does not test:** a native series primitive, auto axes, long runs
  > **Smallest proposed shared extension:** one `series` object type — `{ xs, ys (derivable), xDomain, yDomain, x, y, w, h, role }` drawn as a single SVG polyline, with optional tick labels; one object per series regardless of point count. **Approval requested; not built.**

- **Training data** is either the LR schedule computed by NanoGPT's own
  `get_lr`, or the recorded toy bigram run — labelled as a toy, never as
  NanoGPT's measured curve.
- **Learning-rate schedule** (#17) uses the real schedule: linear warmup →
  cosine decay → `min_lr`, with `decay_lr = False` and a labelled what-if.
- **Cards 16 and 26 are distinct.** 16: same top-1, different confidence and
  loss at one position. 26: next-token targets across a sequence and how
  per-position losses average into the objective, plus perplexity.

## 5. Practice — optional, specified in full

Revision 1 assigned seven practice cards, several naming a checker without a
task. Now four, each with a real reasoning step. The others are explore-only.

| Card | Question | Seen before answering | Submits | Correct | Reasoning required | Revealed after |
|---|---|---|---|---|---|---|
| **18 Train vs val** (batch 1) | "NanoGPT's shakespeare_char config keeps only the checkpoint with the lowest validation loss (`always_save_checkpoint = False`). Which checkpoint would it keep?" | both curves; any checkpoint's numbers via the explore control; nothing marks the minimum | a checkpoint (index; the answer widget starts empty) | argmin of validation loss — not the final checkpoint | use validation, not training loss; don't default to the last checkpoint | a ring on the best point; feedback: the final checkpoint has lower train loss but higher val loss |
| 11 Causal mask | "With the mask on, which positions may the query at position 2 attend to?" | the token row and the **unmasked** weights (practice fixes the mask off) | a set of positions (`indices`) | {0, 1, 2} | causal = itself and earlier, derived from the mask rule rather than read off a picture | the masked row and its renormalized weights |
| 19 One LR step (prerequisite) | "Which learning rate lands on the minimum of this quadratic in one step?" | the bowl, the current point, its gradient; losses hidden | a learning-rate preset | the preset equal to 1 / curvature | step = lr × gradient; overshoot vs undershoot | the post-step loss for every preset |
| 22 Top-k | "With k = 2, which candidates can still be sampled?" | the full distribution (k locked to all) | a set of candidates (`indices`) | the two largest logits | top-k keeps the k largest *logits* then renormalizes | the k = 2 renormalized bars |

**Rule for every practice from batch 3 on: commit before you see** (owner,
2026-09-28). A practice question asks about a case the card does not draw — a
position, setting or value outside what is on screen — so the answer needs the
rule the card teaches, not a reading of the picture. A question answerable by
reading the visual is not practice; make the card explore-only instead. The
reveal after the answer may then draw the case. Precedent: c09 asks whether a
third *e*, at position 8 (past the rows drawn), enters the block as the same
vector as the *e* at position 5. Every plan's check/practice field names its
undrawn case, and the reviewer rejects a practice whose answer is on screen.
The rows above were written before this rule and are re-planned against it
when their cards are built.

## 6. Card layout (applies to every card)

Title + concise learning question → visualization/explanation → optional
replay → ─── **INTERACT** (explicit controls + Reset) ─── → optional Practice.
No control rows inside the visualization (reference token rows use
`tokenStyle: 'labels'`), no card-level Ask (the existing Ask-in-chat pill and
bottom composer are the ask surface), selected / inspected / preferred / truth
states distinguished in style and words, no full-matrix dashboards where one
row answers the question.

**Sources & evidence (revision 3).** The card body carries the concept and a
short status label only — *Calculated toy example*, *Recorded toy run*, *Live
calculation*, *What-if*, *Source value*, *Recorded model output* — never file
names, line references, revisions, generator notes or code listings. Each card
module exports `sources` (schema: `src/card-sources.js`; kinds `code`, `paper`,
`doc`, `web`, `dataset`, `calculation`), and the board attaches them to the
block. `SourcesDisclosure` renders one collapsed row under every card that has
them, **▸ Sources & evidence (N)**, grouped Code / Paper/documentation /
Dataset/source material / Example/calculation provenance. A code entry opens
the Learn page's right-side source panel (`RepositorySource`) at its pinned
revision with its lines highlighted and an *Open in repository* link; a
revision or file the server cannot load is reported as unavailable at that
revision, never replaced by current code. arXiv entries open in the paper
reader and Wikipedia entries in the wiki reader, through the lesson page's
existing link interception; other links open in a new tab; calculation entries
explain themselves in place. The chat composer is untouched — inspecting a
source makes no chat request. Gates: `assertCardGates` fails on any visible
code object or citation-looking text; `assertSources` checks the list, the pin,
and that every status the sources name is also labelled on the card.

## 7. The 26-card inventory (revised) and the first batch

**B1** = built in batch 1.

| # | Card | Kind | Control | Data |
|---|---|---|---|---|
| **1** | **NanoGPT forward pass: token IDs to logits** — B1 | explore + replay | mode (training / generation) | source config |
| 2 | Anatomy of one transformer block | replay | — | source structure |
| **3** | **What the residual preserves** — B1 | explore | residual add on/off | toy, live |
| 4 | A stack of n_layer blocks: same architecture, separate parameters | replay | — | source config |
| 5 | Attention mixes across tokens; the MLP works within each token | explore (now possible: input-bound visibility) | connectivity view | structural |
| **6** | **The same text through NanoGPT's two tokenizers** — B1 | explore | tokenizer | real tokenizers |
| 7 | Token ID → embedding row | explore | token | toy table |
| 8 | Two embedding tables: by token, by position | static | — | source structure |
| 9 | Token + position = the block's input | explore | position, wpe on/off | toy, live |
| 10 | Attention explorer (existing, reused) | explore | query, mask | toy, live |
| 11 | Causal mask as a triangle | explore + practice | mask | toy, live |
| 12 | Scaling scores by 1/√dₖ (a multiplier) | explore | multiplier presets | toy, live |
| **13** | **Multi-head attention: one query, several heads** — B1 | explore | head, query | toy, live |
| 14 | Inside the MLP: c_fc → GELU → c_proj | explore | token preset | precomputed GELU |
| **15** | **LayerNorm: normalize each token vector, then scale** — B1 | explore | input preset | precomputed |
| **16** | **Cross-entropy: same top prediction, different loss** — B1 | explore | prediction preset | toy; live softmax; precomputed log |
| **17** | **NanoGPT's learning-rate schedule** — B1 | explore (line plot) | schedule preset, iteration | source `get_lr` |
| **18** | **Train vs validation loss: which checkpoint to keep** — B1 | explore + practice (line plot) | checkpoint | recorded toy run |
| 19 | One gradient step on a quadratic (prerequisite) | explore + practice | LR preset | toy |
| **20** | **One update step: from SGD to AdamW** — B1 | explore | optimizer | toy; recorded gradients |
| **21** | **Temperature: sharper or flatter sampling** — B1 | explore | temperature preset | toy; live softmax; recorded draws |
| 22 | Top-k: truncating the distribution | explore + practice | k preset | toy |
| 23 | Context window: what `idx_cond` crops away | explore | window preset | toy conditional table |
| 24 | The generation loop | replay | — | recorded draws from the toy bigram model |
| 25 | Autoregressive conditioning | explore | previous character | the recorded toy bigram model's conditionals |
| 26 | The training objective: per-position targets, their mean, perplexity | explore | position | toy; precomputed log/exp |

**Why this batch.** It covers each area the review required, early:
architecture (1), residual counterfactual (3), real tokenizer output (6),
attention and multi-head (13), a numerical loss explanation (16), a metric
view with a real line plot (17, 18), an optimizer update (20),
sampling/temperature (21) — plus LayerNorm (15) to exercise precomputed
normalization. It deliberately includes both plotting cards and the optimizer
instead of more attention variants.

**Blocked cards.** None of the 26 is blocked outright. The capability that is
bounded (long time-series) is listed in §4 with its approval request; no card
has been swapped for an easier one under the same title.

## 8. What building batch 1 revealed

Found by the card authors and reviewers while building against the real
runtime. Each has a repro in the card's notes.

| Finding | Category | Evidence | Status |
|---|---|---|---|
| **60-object ceiling** is binding, not theoretical | renderer (schema) | c01 (forward pass) and c18 (train vs val, two 20-point series) both sit at exactly 60/60 objects | bounds the plotting request below |
| Integer values below 10 print as decimals in cells | renderer (formatting) | a grid with `values: [1, 14]` renders **"1.00"** and "14" (`AnimatedScene.jsx:40`); c06 therefore shows token IDs as text labels, not a grid; c21 shows "12" beside "8.00" | **approval requested:** print integer values as integers — touches every existing grid cell, so it re-renders the committed statics and changes some existing cards' look |
| Practice answers over a long index domain | renderer (controls) | c18's answer is 20 "iter N" chips over two rows; there is no compact answer picker with an explicit unpicked state | report only |
| Derived opacity cannot combine with a timeline `appear` | composition constraint | c01 needed a mode-dependent reveal; solved without shared changes because timeline events are derive-resolved too (a per-mode `appear`/`pause` step) | noted; works today |
| A heat `valueScale: 'local'` is refused mid-derive-chain | gate (by design) | c13's score row feeds the weights row, so the value-scale gate rejects `local` | works with `shared` |
| My fixture had typed-in optimizer settings | honesty (fixed) | reviewers caught that `betas`/`weight_decay` in the generator were typed with a comment instead of read from `train.py`; now read from the resolved config, and the toy run lists which settings are source vs toy choices | fixed; every recorded number unchanged |

**Approvals requested (nothing built):**
1. A `series` object type for line plots (see §4).
2. Integer-aware cell formatting (above).

## 9. Evidence (batch 1, deployed and browser-verified)

Generated by `node scripts/nanogpt-evidence.mjs` from each card's `evidence`
export plus `e2e/shots/nanogpt/results.json` (written by
`node e2e/nanogpt-board-check.mjs <deployed base>`). For every card the browser
check drove the INTERACT control by real clicks, asserted the rendered text
equals what the scene evaluator computes for those inputs (numbers are
checked against independent oracles in each card's unit test), sent a chat
question and asserted the request carried the card's live inputs, reloaded
to confirm the state persisted, then pressed Reset and asserted the defaults
returned. Screenshots (before / after / after-reload / reset, plus the
practice states) are in `packages/web/e2e/shots/nanogpt/`.

Browser run: https://small-cp-dev-small-deploy.zeroshothq.workers.dev/apps/repo-06745f10-nanogpt?tab=learn&board=nanogpt-deep-dive — bundle `/static/index-i8wIcrqw.js`, seed s1

| # | Card | Concept | Source revision | Provenance | Control | Consequence | Interaction purpose | Task | Capability exercised | Browser-verified |
|---|---|---|---|---|---|---|---|---|---|---|
| c01-forward-pass | NanoGPT forward pass: token IDs to logits | GPT.forward: idx (B, T) IDs -> wte lookup (B, T, C) + wpe (T, C) broadcast over B -> dropout -> n_layer separate Blocks (B, T, C) -> ln_f -> lm_head scores over the vocabulary. With targets (model.py:184) lm_head scores every position and cross-entropy is computed; without targets only x[:, [-1], :] is projected and loss is None. Dropout is a separate switch: model.train()/eval(). | karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | source: model.py:64,75,91,130,138,170-193,314,316; train.py:123-125,143,218-227,300; sample.py:51,81; config/train_shakespeare_char.py:18-25; data/shakespeare_char/prepare.py:25 (read at 3adf61e). Sizes and p: source, fx.architecture (config/train_shakespeare_char.py over train.py defaults; vocab_size = len(chars)) via generate_fixtures.py. No calculated toy example, recorded run or live calculation displays a number here; derive ops only pick state-following labels, roles and one reveal step. | mode (index, picker, labelled "Call site (preset)"): training step = train.py:300 model(X, Y) -> forward(idx=X, targets=Y); generation step = model.py:316 self(idx_cond) -> forward(idx=idx_cond), targets=None. | training: lm_head receives x with all T positions, logits (B, T, V), targets Y (B, T) feed a cross-entropy loss box, dropout on under model.train(); generation: lm_head receives x[:, [-1], :] (B, 1, C), logits (B, 1, V), targets = None and loss = None (:191), no logits -> loss arrow, dropout off under model.eval() - labelled as a separate switch from targets. | Contrast the two call sites of the same forward(): the code path and tensor shapes up to ln_f are the same; dropout (at :179 and inside each Block, :64/:75/:91) is active only in train mode, which train()/eval() sets independently of targets; the head (which positions are projected, whether a loss exists) and the meaning of B/T change. | none (explore only - no Practice on this card) | index picker input; pick-derived state-following labels and roles (lm_head input, logits, targets, loss); timeline reveals every stage in data-flow order in both presets, with no derived opacity - the one mode-only object (the logits -> loss arrow) gets a pick-derived reveal step (appear vs a no-op pause marker); n_layer Block boxes generated from fx.architecture; identity hue marks the tied wte/lm_head weight. | drove {"mode":1}; 8 line(s) changed; reset restored; chat context sent |
| c06-tokenizer | The same text through NanoGPT's two tokenizers | Tokenization decides how many integer IDs the model sees: NanoGPT's character-level map (vocab from sorted(set(data)), saved to meta.pkl) vs GPT-2 BPE via tiktoken; train.py sets the model's vocab_size from meta.pkl, else the padded 50304, and a GPT-2 checkpoint keeps 50257. | karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | recorded by generate_fixtures.py: the character map rebuilt with data/shakespeare_char/prepare.py:24-33's logic over the sha-pinned tinyshakespeare file, and tiktoken "gpt2" at the generator's pin (NanoGPT pins none, README.md:22). Citations checked against data/shakespeare_char/prepare.py:24,30,55-61, data/shakespeare/prepare.py:20-21, train.py:137-155,181-185, model.py:111,223, README.md:160-166. | tokenizer - index input, picker over two stored presets: character-level \| GPT-2 BPE | The same text re-tokenizes: the token/ID rows change from 29 one-character tokens with IDs below 65 to 5 subword tokens from a 50257-entry vocabulary; the count/vocabulary readout, takeaway, model-side vocab notes and verbatim source lines switch with it, while a fixed line compares both counts. | Compare two real tokenizations of one text, so the learner sees that token count and IDs depend on the tokenizer: the same text gives different counts and IDs; the char vocabulary comes from the corpus, the GPT-2 BPE vocabulary is fixed. | Switch the preset and compare how many tokens the same text becomes, how large the IDs get, and how big each vocabulary is. | Index input picking stored records: tokens-as-labels rows (token over ID, padded to shared column centres), per-preset caption/code lines, and a picked row position that centres the one-line preset in the same band; {{a.0.b}} path interpolation. | drove {"tokenizer":1}; 8 line(s) changed; reset restored; chat context sent |
| c03-residual | What the residual preserves | The residual add x = x + branch(x) carries x forward unchanged through the skip path; the branch only contributes an update. NanoGPT does this twice per block. | karpathy/nanoGPT @ 3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | source: model.py:104-105 (Block.forward) quoted verbatim; calculated toy example: x and u authored in exampleData, u is not computed from x by attention; live calculation: out = choose(residual, add(x,u), u), out - x = sub, squared sizes = dot. | residual (bool) "Residual add: x + branch", default true. | On: out = x + u, out - x = u, a small change next to x. Off (what-if): out = u, out - x = u - x, about as large as x itself (squared sums compared); the skip path dims, its arrow into out disappears, and captions say x is not carried forward by this branch alone. | A counterfactual toggle: remove the add and see that x no longer reaches out through this branch, while the shared colour scale keeps x's cells unchanged across states. | Compare out and out - x with the add on and off; say what the skip path carries. | bool input + choose/add/sub/dot derive ops, signed heat strips on one shared valueScaleGroup, derived opacity on the skip path, choose-driven captions. | drove {"residual":false}; 4 line(s) changed; reset restored; chat context sent |
| c13-multi-head | Multi-head attention: one query, several heads | CausalSelfAttention splits q, k, v (one learned c_attn projection) into n_head heads of size C // n_head; each head scales its scores by 1/sqrt(hs), masks the future, softmaxes and mixes its own V; the head outputs are laid side by side into C numbers and c_proj mixes them. | karpathy/nanoGPT @ 3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | source: model.py:35 and :56 (one c_attn for q, k, v), :57-59 (head split), :64 (fused flash path, PyTorch >= 2.0), :67 (x 1.0/math.sqrt(k.size(-1))), :68 (masked_fill -inf), :69 (softmax), :70 (attn_dropout, not shown), :71 (att @ v), :72 (transpose/view re-assembly), :75 (c_proj), read at @3adf61e; real sizes n_head/n_embd from fx.architecture (config/train_shakespeare_char.py); tokens: fx.tokenizer.tokenizers[1].tokens.slice(0,4) (tiktoken gpt2 output recorded by generate_fixtures.py); calculated toy example: hand-built Q, K = I, V per head in exampleData; live calculation: matmul, scale 0.5, causal_mask, softmax, pick, weighted_sum, argmin, concat. | "Head (preset)" index picker over head 0/1/2 (default head 0); "Query token" index picker over the four tokens (default the last). | From the second token on, head moves the weight mass (head 0 -> previous token, head 1 -> first token, head 2 -> itself in this hand-built example; at the second token heads 0 and 1 coincide on the first token), changes the head output and its dominant V row, and moves the orange frame to that head's slice of the 12-number concatenation. At the first token every head puts all its weight on it, so heads cannot differ there. Query changes which key positions are visible (future scores -inf drawn blank, weights exactly 0 drawn gray) and every head's output in the concatenation. | Compare heads on the same query to see different attention patterns from the same tokens, and see that the per-head outputs are only placed side by side before c_proj mixes them. | Pick each head at the last query and say where its weight goes; then pick an earlier query and see which positions disappear, and why the first token leaves the heads no choice. | two index pickers; per-head derive pipelines (matmul, scale, causal_mask, softmax, pick, weighted_sum) plus concat; argmax composed as argmin of negated masked scores; head x query caption table picked twice; masked cells drawn blank (scores, no heat) or gray (weights) and explained in words; scores carry no heat (a per-row scale is all they could honestly have); frames drawn as four lines with picked (derived) corner coordinates. Illustrates the manual attention path (:66-71); the default flash path (:64) is named on the card, not drawn. | drove {"head":1,"query":3}; 6 line(s) changed; reset restored; chat context sent |
| c15-layernorm | LayerNorm: normalize each token vector, then scale | LayerNorm normalizes one token vector over its features (subtract the mean, divide by sqrt(var + eps)) and then multiplies by a learned per-feature weight γ; with train.py’s default bias=False there is no β (GPT-2 checkpoints load bias=True and add β). The normalized result is identical when one constant is added to the whole vector, and equal to displayed precision when the whole vector is multiplied by a positive constant (eps is not rescaled, so that match is approximate). | karpathy/nanoGPT @ 3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | calculated toy example (generate_fixtures.py layernorm(): x, x - mean, mean, biased var, std = sqrt(var + 1e-5), x-hat rounded to 4 decimals, illustrative γ); live calculation (y = γ · x-hat via the elementwise derive op; x-hat - x-hat(x0) via the sub derive op); source (model.py:18-27, :23, :24, :27, :98-100, :104-105, :116, :131, :182, :225; train.py:56; n_embd = 384 from config/train_shakespeare_char.py:24 via fx.architecture). | input - index picker over three stored presets: "x₀" (reference), "x₀ + 3", "2 · x₀" (the fixture's "x", "x + 3", "2 · x", renamed so the reference is not confused with LayerNorm's input x); discrete presets, not a continuous experiment. | Shift (x₀ + 3): x and the mean change; x - mean, var and std do not. Rescale (2 · x₀): x, mean, x - mean, var and std all change. x-hat and y are identical for the shift and equal to displayed precision for the rescale (eps is not rescaled); the live x-hat - x-hat(x0) row reads zero at every preset, on a heat scale that does not move. | Compare a vector, its shift and its rescale and see which stages of the normalization change and which do not - the invariance is the lesson. | Explore only (no practice): switch presets and check that the mean (and, for the rescale, std) move while x-hat, y and the check row stay fixed. | index picker over exampleData presets; pick for per-preset fixture rows and strings; elementwise for the live γ · x-hat; sub for the live x-hat check row; strips with signed heat on x-hat and y in one shared value-scale group (x and x - mean uncoloured, since a domain can only be shared within one state); {{name}} readouts of pre-rounded fixture scalars. | drove {"input":1}; 7 line(s) changed; reset restored; chat context sent |
| c16-cross-entropy | Cross-entropy: same top prediction, different loss | Cross-entropy at one position is -ln p(target): it reads how much probability the model put on the true next token, not just whether its top choice was right. Two predictions with the same top-1 (same accuracy) can have very different loss; among these presets, the confident wrong one costs the most, and its p(target) is below a uniform guess over the same toy vocabulary. | karpathy/nanoGPT @ 3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | source: model.py:187 F.cross_entropy line quoted verbatim (its loss averages the per-position value); the 65-character vocabulary (data/shakespeare_char/prepare.py) and the GPTConfig.vocab_size note (model.py:111; from-scratch GPT-2 via config/train_gpt2.py and train.py:155) via the fixture. calculated toy example: fx.crossEntropy (generate_fixtures.py) - context, 5-token toy vocabulary, target, three stored logit presets, each preset's top choice, loss = -ln p(target), and ln 65 (the evaluator has no log). live calculation: softmax over the selected preset's logits, top choice = argmin(scale(p, -1)), p(target) = pick, the toy uniform guess = softmax over zero logits, bar/mark/label positions = scale/add. | prediction (index, picker) "Stored prediction preset" over the three fixture presets: confident, right / hesitant, right / confident, wrong. Discrete stored presets; nothing is run when one is picked. | Logits cells change; live softmax re-draws the probability bars and cells; the model's top-choice mark (▼ purple text riding the top bar, lit bar) moves to the argmax while the target mark (▲ green text and a ring on the target's p cell) stays on k; the grey uniform-guess line (p = 1/5, live) stays put, so the target bar sits above it in the right presets and below it in "confident, wrong"; readouts give the model's top choice (correct/incorrect), p(target), and the loss at this position; the loss-by-preset rows keep all three presets' top choices and losses on screen, with ▶ on the selected row. | Compare "confident, right" and "hesitant, right" (same top choice, same accuracy, loss 0.11 vs 1.26, both visible at once in the loss-by-preset rows) and "confident, wrong" (wrong, loss 3.61, p(target) below the toy's uniform guess) to see that the loss scores the probability on the target, not the top-1 decision. | Switch between "confident, right" and "hesitant, right" and explain why the loss grows although the top choice stays correct; then pick "confident, wrong" and compare the target's bar with the uniform-guess line over the same 5 tokens. | index picker over fixture presets; softmax, scale, argmin (argmax by composition), pick, add derive ops; bars with a fixed peak and a derived highlight; boxes with derived widths (loss by preset) and a derived ▶ row marker; a derived grid with distribution: true and a constant target highlight; a derived horizontal line (uniform guess via softmax over zero logits); derived x/y positions for markers and value labels; text interpolation of fixture-formatted strings. | drove {"prediction":2}; 6 line(s) changed; reset restored; chat context sent |
| c18-train-val | Train vs validation loss: which checkpoint to keep | Overfitting and checkpoint selection: NanoGPT evaluates both splits (train.py:216-228 estimate_loss, an average of eval_iters random batches) at iter_num % eval_interval == 0 (train.py:263) and saves only when validation loss improves (train.py:274, always_save_checkpoint = False in config/train_shakespeare_char.py:10). The card applies that rule at this toy run's evaluations every 50 iterations; shakespeare_char's own eval_interval is 250 (config:5). | karpathy/nanoGPT @ 3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | Recorded toy run: character bigram (65 x 65 logit table) - a toy, not NanoGPT's transformer, trained by generate_fixtures.py (seed 1337) with AdamW, NanoGPT's get_lr executed from train.py, and global-norm gradient clipping as in train.py. AdamW and clipping settings read from source (config/train_shakespeare_char.py resolved over train.py defaults): beta1 0.9, beta2 0.99, grad_clip 1, weight_decay 0.1. Toy-scale choices, not source: batch_size 64, eval_interval 50, learning_rate 0.1, max_iters 1000, train_chars 1200, val_chars 20000, warmup_iters 20, lr_decay_iters 1000, min_lr 0.01. Losses are exact averages over the 1200-char training slice and the 20000-char validation slice every 50 iters (NanoGPT's estimate_loss averages random batches instead). Rounding to 3 decimals, the gap, the change line and the ring's argmin are live calculations. The save rule and config are source. | checkpoint (index slider over the 20 recorded checkpoints, 50..1000) - picks stored results, no training runs | Dark dots move to the inspected checkpoint on both curves; the readout shows its train loss, val loss and the live gap, and a live change line shows how both losses moved since the previous checkpoint (after a committed practice attempt: versus the kept checkpoint, which a ring then marks). | Step through checkpoints to see training loss keep falling while validation loss turns up - the reason the save rule keeps an earlier checkpoint. | Practice: pick the checkpoint train.py:274's save rule would leave in ckpt.pt at this run's evaluations (lowest validation loss), resisting the final checkpoint. | Line plot composed from line/text/circle primitives via plot.js (two series, one shared axis), input-bound markers, live argmin, live change line with sign via argmin/pick, commit-gated reveal via a hidden bool and choose-derived opacity. | drove {"checkpoint":1,"bestRevealed":false}; 2 line(s) changed; reset restored; chat context sent |
| c17-lr-schedule | NanoGPT's learning-rate schedule | train.py get_lr: linear warmup to learning_rate over warmup_iters, cosine decay to min_lr by lr_decay_iters, min_lr after (never reached here: the loop stops at max_iters = lr_decay_iters); train.py:258 bypasses it when decay_lr is False | karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | source: fx.lrSchedule - train.py:231-242 get_lr compiled from the pinned file and executed by generate_fixtures.py with config/train_shakespeare_char.py (learning_rate 1e-3, warmup_iters 100, lr_decay_iters 5000, min_lr 1e-4, max_iters 5000); the decay_lr = False preset is train.py:258's else-branch (lr = learning_rate) applied by the generator, not executed; the warmup_iters = 1000 preset is a hypothetical run of the same get_lr; lrText/phase strings come from the fixture; warmup boundary = each preset's first cosine-phase iteration; live calculation: preset selection (pick) and data->pixel mapping (scale/add) | schedule: index picker over 3 stored presets (as configured / decay_lr = False / warmup_iters = 1000 what-if); inspect: index picker over 6 stored iterations (0, 99, 100, 1000, 2500, 5000) | the preset re-shapes the whole curve (cosine with a short ramp, a flat line at learning_rate, a 1000-iteration ramp) and moves the warmup_iters boundary; the inspected dot, its readout (iteration, lrText, phase), the train.py lines that produced the value and a per-point note follow the pick, and on the non-configured presets a grey dot + readout keep the configured value at the same iteration on screen - iteration 0 is learning_rate/(warmup_iters+1), not zero; 99 is warmup, 100 is the peak and first cosine iteration; 5000 = max_iters = lr_decay_iters lands exactly on min_lr | swap schedule variants on one fixed axis to see the whole shape change against the configured value, and read exact values at the iterations where get_lr changes branch | explore-only (no practice) | line plot composed by plot.js (axesObjects without tick marks, three seriesMapping calls) with derived circle markers and a derived vertical boundary; sub-1e-3 values kept out of rounding ops (pick + scale-before-round only); derived opacity to show the reference only off the configured preset; pick of a record map by the fixture phase string for state-following source lines; nested pick for per-preset, per-iteration notes | drove {"schedule":2,"inspect":3}; 7 line(s) changed; reset restored; chat context sent |
| c20-optimizer | One update step: from SGD to AdamW | One optimizer update per parameter: SGD (baseline), SGD + momentum, Adam (a running average of g divided by its running RMS), and AdamW - Adam plus decoupled weight decay on p.dim() >= 2 params only (1-D biases and LayerNorm weights exempt), which is what NanoGPT builds. | karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | Calculated toy example: fx.optimizer from generate_fixtures.py optimizer() (4 params with starting values, one seeded 20-step gradient sequence with its per-parameter mean and RMS, last-step update in lr units per optimizer). Live calculation: the AdamW - Adam decay row (sub op) in the Adam / + decay / = AdamW grid. Source values: fx.config.defaults beta1, beta2, weight_decay, grad_clip (train.py:60-63) and fx.config.shakespeareChar.beta2 (config/train_shakespeare_char.py:31); train.py:56 bias = False (fx.architecture.bias). Source citations: model.py:263-284 (AdamW at :284, dim >= 2 decay groups at :268-275, LayerNorm weight at :23), train.py:307-309 clipping. | optimizer: index picker over the four stored toy results (SGD, SGD + momentum 0.9, Adam, AdamW (as in NanoGPT)), labelled as presets. | The selected bars and the selected row of the update grid switch to that optimizer while the SGD baseline bars and row stay, on one scale per preset: momentum piles steady gradients up far past SGD, Adam gives every steady parameter about one lr (w2 now as far as w1), AdamW adds a pull toward zero on the weights and leaves the 1-D b alone. The heading and six explanation lines follow the selection. | Compare each update rule against SGD on the same gradients, to see where step size stops tracking gradient size and what decoupled decay adds on top of Adam. | Explore only (no practice): pick each optimizer and compare its w1 vs w2 step sizes with the SGD row, the noisy w3, and the exempt b. | index picker -> pick of stored fixture rows (grid, two bars objects sharing a picked per-preset peak, picked sentence lists); concat ops for a baseline+selected grid and an Adam / + decay / = AdamW grid; sub op for the live decay row; grid row highlight for the selected row; a verbatim source code line (model.py:284); fx.config source values bound into text. | drove {"optimizer":3}; 7 line(s) changed; reset restored; chat context sent |
| c21-temperature | Temperature: sharper or flatter sampling | generate() divides the last position's logits by temperature (model.py:318), softmaxes (:324) and always samples with torch.multinomial (:326); sample.py:17 defaults to temperature = 0.8. T below 1 sharpens the distribution and T above 1 flattens it; the ranking never changes, and a low positive T is still sampling (the other candidates keep 1 - p(top) > 0), not greedy argmax. | karpathy/nanoGPT @ 3adf61e154c3fe3fca428ad6bc3818b27a3b8291 | source: model.py:318/:324/:326 and sample.py:17 quoted verbatim, top-k crop :320-322 cited; calculated toy example: fx.temperature.logits over 6 candidates (generate_fixtures.py), with the real shakespeare_char vocab size from fx.tokenizer (char); live calculation: softmax(scale(logits, pick(invTByPreset, temperature))), softmax(logits) for the T = 1.0 comparison, top = argmin(scale(probs,-1)), 1 - p(top) = sub, expected top count = scale(p(top), draws), non-top draw count = sub(draws, drawnTop); recorded toy run: fx.temperature.presets[].drawn/drawnTop, 20 seeded random.choices draws per preset by generate_fixtures.py (not NanoGPT, not torch.multinomial, not live sampling). The space candidate is displayed as "sp". | temperature (index, slider) over the five stored presets fx.temperature.presets[].label, T = 0.25 ... T = 2.0, all positive; default T = 1.0. Discrete presets, labelled as presets. | The logits / T row, the probability row (fixed [0,1] heat) and the bars (peak 1) recompute live; p(top), its T = 1.0 value and 1 - p(top) update; the caption says sharper / the same as / flatter than plain softmax; the recorded toy draws, "N of 20 draws were the top token" and the live expected count (20 x p(top)) switch to that preset. At T = 0.25 the other five still share 1 - p(top) > 0, and one recorded draw is not the top token (one seeded illustration; counts vary run to run). | Sweep the stored presets from low to high T and watch the same six toy candidates go from nearly one-hot to flat, while generate()'s code path (multinomial at model.py:326) keeps sampling at every preset, and the recorded draws illustrate it. | Move the preset to the lowest T and read what share the other five candidates still hold, and whether every recorded draw is the top token; then move to the highest T and say how p(top) and the expected count changed. | index slider input over preset labels; pick/scale/softmax/argmin/concat/sub derive ops; derived grid with distribution:true + fixed valueScale heat; bars with peak 1 aligned under the grid; derived token lists with tokenStyle labels and derived cellHighlight lists; pick-driven state captions. | drove {"temperature":4}; 8 line(s) changed; reset restored; chat context sent |

Practice (nanogpt-c18-train-val): answered the final checkpoint (19) → graded wrong: “Not the lowest validation loss. The rule keeps the minimum of the VALIDATION curve - not the lowest training loss and not simply the last checkpoint. The kept checkpoint is iter 100 (val 3.055); neighbouring checkpoints look almost level on the plot, so compare the val numbers in the readout. The final checkpoint (iter 1000) has lower training loss (2.161 vs 2.327) but higher validation loss (3.196 vs 3.055): the model kept fitting the 1,200-character training slice after it stopped improving on unseen text. The green ring now marks it.”; answered 1 → passed: “Right: iter 100 has the lowest validation loss (3.055) of these evaluations, so train.py:274's rule leaves it in ckpt.pt. The final checkpoint (iter 1000) has lower training loss (2.161 vs 2.327) but higher validation loss (3.196 vs 3.055): the model kept fitting the 1,200-character training slice after it stopped improving on unseen text. The shakespeare_char config evaluates every 250 iterations, with the comment "keep frequent because we'll overfit" (config/train_shakespeare_char.py:5).”.

## 10. Batch 2 — plans under Phase 1 of card composition

Authored under docs/features/learn-card-composition.md (Phase 1): each card is
planned and boundary-reviewed before it is built, and the card module exports
the same plan. Two short sequences; their cards sit next to each other on the
board in path order (no next-links).

**Boundary decision that changes the inventory:** card 8 ("Two embedding
tables: by token, by position", a static card with no interaction) is not a
separate mental model — the two tables are the first stage of card 9's causal
pipeline (look up two rows → add them). It becomes card 9's first stage. The
inventory goes from 26 to 25 unless the owner wants card 8 kept.

### Sequence "Embeddings" (2 cards) — card 7 is a prerequisite of card 9

**c07 · Token ID → embedding row**
- concept: token embeddings
- one_sentence_objective: After this card, the learner should understand that a token ID does no arithmetic: it selects one learned row of the embedding table, and that row is the token's vector.
- prerequisites: token IDs (tokenizer card)
- causal_steps: token ID → row index in wte (V × C) → that row, C numbers
- primary_interaction: pick a token of a short phrase; its row in the (toy) wte table lights and appears as its vector; picking the same character elsewhere lights the same row
- check/practice: none — the relationship is read directly (same ID, same row)
- boundary_decision: single — boundary_reason: one mental model (lookup); the addition of positions is a second model and goes to c09. sequence "Embeddings", 1 of 2; relationship: prerequisite → c09

**c09 · Token + position = the block's input** (absorbs card 8)
- concept: token and position embeddings
- one_sentence_objective: After this card, the learner should understand that the first block reads the sum of a token row and a position row, so the same token at two positions enters as two different vectors.
- prerequisites: c07 (an ID selects a row)
- causal_steps: stage 1 two tables — wte by token ID, wpe by position; stage 2 pick one row from each; stage 3 add them → x (then dropout, noted, not modelled)
- primary_interaction: a position slider for a repeated character, plus a what-if "wpe off": with positions the two occurrences differ; without, they are identical
- check/practice: practice — predict whether two occurrences of the same character enter the block as the same vector, with wpe on and with wpe off (asked about a third e the card does not draw, so it needs the rule, not the picture)
- boundary_decision: staged — boundary_reason: one causal pipeline (lookup, lookup, add), revealed in stages; card 8's two tables are its first stage, not a separate idea. sequence "Embeddings", 2 of 2; relationship: prerequisite ← c07

### Sequence "The block and the stack" (2 cards) — card 4 deepens card 2

**c02 · Anatomy of one transformer block**
- concept: the transformer block
- one_sentence_objective: After this card, the learner should understand the recipe one Block applies to x: normalize, attend, add back, normalize, MLP, add back.
- prerequisites: residual add (c03), LayerNorm (c15) — named, not required to follow the order
- causal_steps: x → ln_1 → attn → x + … → ln_2 → mlp → x + …
- primary_interaction: step through the six operations; the tensor each reads and writes lights, and the residual path x stays lit the whole way
- check/practice: none — the order is the lesson; a practice question would test memory, not reasoning
- boundary_decision: staged — boundary_reason: one causal pipeline in a fixed order; staging it keeps the recipe whole. sequence "The block and the stack", 1 of 2; relationship: deepens → c04

**c04 · A stack of n_layer blocks: same architecture, separate parameters**
- concept: the stack of blocks
- one_sentence_objective: After this card, the learner should understand that NanoGPT applies n_layer Blocks in order, each with the same structure but its own learned weights.
- prerequisites: c02 (one Block's recipe)
- causal_steps: x → Block 1 → Block 2 → … → Block n_layer → ln_f
- primary_interaction (revised 2026-09-28, owner: "a slider lets the learner discover the count is linear"): slide n_layer from 1 to 12 (source value 6 for shakespeare_char; 12 is NanoGPT's default, a what-if at the same C, as is every other depth): the chain builds that many Blocks and haloes the newest, whose parameter tensors are listed as transformer.h.<n_layer - 1>.* with unchanged shapes; the toy table compares it with the previous block (same shape, different values); the count n_layer × one block rises by the same live step at every depth, and running-total bars fill to n_layer. One slider replaces the block picker: two controls could pick h[7] in a 6-block stack
- check/practice: practice (commit before you see) — how many parameters do the Blocks of a 24-layer stack hold at the same C? 24 is past the slider and the options are bare numbers (1,770,240 · 42,485,760 · 531,072,000), so the answer needs the rule (separate weights per block: one block's worth per layer)
- boundary_decision: single — boundary_reason: one mental model (repeat the same recipe with separate weights). sequence "The block and the stack", 2 of 2; relationship: deepens ← c02

## 11. Batch 3 — plans under Phase 1 of card composition

Planned 2026-09-28 by one planner per card, an adversarial critic per plan and a cross-card judge; every field in full, with the pinned source lines, is in [nanogpt-deep-dive-batch3-plans.md](nanogpt-deep-dive-batch3-plans.md). Every practice follows the commit-before-you-see rule (section 5). Board order: c11-causal-mask, c12-score-scaling, c10-weighted-values, c05-position-mixing.

**Inventory changes (owner to confirm):** card 10 stops being the reused attention explorer and becomes "One head's output: the weights mix the values" - the explorer's mask and softmax steps belong to c11 and c12, so under one idea per card only the weighted sum is left. Card 5 is retitled "Where positions mix inside a Block"; card 12 becomes "Scaling scores by 1/√hs" (NanoGPT's own name). The inventory stays at 25.

### Sequence "Self-attention" (3 cards) — c11-causal-mask → c12-score-scaling → c10-weighted-values; c13 (batch 1) deepens it

**c11 · Causal mask as a triangle**
- concept: causal mask
- one_sentence_objective: After this card, the learner should understand that the causal mask is one fixed lower triangle over the T × T scores, so every position reads only itself and earlier positions, never the next character it is trained to predict.
- boundary_decision: staged — sequence: Self-attention, 1 of 3 (c11-causal-mask → c12-score-scaling → c10-weighted-values)
- undrawn case (practice): Row 99 of a T = 256 window (256 = shakespeare_char block_size, a Source value).

**c12 · Scaling scores by 1/√hs**
- concept: attention score scaling. NanoGPT multiplies every q·k score by one positive number, 1/√hs, which is set by the head size and not learned. It does this before the causal mask and softmax: the manual path is model.py:67-69, and the default fused SDPA call applies the same default scale inside it.
- one_sentence_objective: After this card, the learner should understand that NanoGPT multiplies every attention score by one positive number fixed by the head size, 1/√hs, before the mask and softmax, so the size of that number sets how peaked the visible weights are while their order and the masked zeros stay unchanged.
- boundary_decision: staged — sequence: Self-attention, 2 of 3 (c11-causal-mask → c12-score-scaling → c10-weighted-values)
- undrawn case (practice): × 0 on the drawn reader's row.

**c10 · One head's output: the weights mix the values**
- concept: Weighted values: for one query, a single head's output y = att @ v (one row) is the weighted average of the value vectors that query can see. This is the output before the heads are joined and c_proj mixes them.
- one_sentence_objective: After this card, the learner should understand that one attention head's output for a query is the weighted average of the value vectors that query can see, so it always lands between those values, pulled toward each in proportion to its weight.
- boundary_decision: single — sequence: Self-attention, 3 of 3 (c11-causal-mask → c12-score-scaling → c10-weighted-values)
- undrawn case (practice): The four-way uniform weighting (1/4 each) of ␣any's values.

**c05 · Where positions mix inside a Block**
- concept: Position mixing inside one Block: which input positions each output position can depend on, in the attention sub-layer compared with the MLP sub-layer. Only attention moves information between positions, and only forward.
- one_sentence_objective: After this card, the learner should understand that inside a Block only attention moves information between positions: output i can depend on inputs 0 to i in attn but on input i alone in the MLP.
- boundary_decision: single — sequence: none
- undrawn case (practice): Two things are undrawn: position 100 of a 256-position context (the card draws 0 to 5), and the composition of the two sub-layers through a whole Block (the card draws attn and mlp only as separate states).

**Open questions for the owner:**

- Card 10: do you accept replacing the reused explorer with the new weighted-values card? I01 and causalAttentionScene stay as benchmark scenes and are not placed on this board.
- No card on the deep-dive board teaches how similarity scores are produced (q·k), the spec's second self-attention step. c12 only names it at its raw-scores stage and relies on the depth ladder's Attention · Guided (another board) and on c13's step 1. Do you want a q·k card in a later batch, or is naming it enough?
- c13 (multi-head, batch 1) is the natural fifth step of the self-attention path, but it sits in batch 1, earlier on the board than c11 → c12 → c10. Should c13 move to follow c10 in board order only, with no content change? And should it become '4 of 4' in the sequence? That would need a plan export on a card approved before Phase 1.
- c10 uses GPT-2 BPE tokens, to match c13 which it deepens into. c11, c12 and c05 use shakespeare_char characters from the same text line. Keep BPE and name the tokenizer on the card (the plan's choice), or relabel c10 with characters for a consistent sequence?
- c05's sequence with c14 ('The MLP', c05 → c14) is recorded only when c14 is built. Confirm c14 is planned for the next batch, so c05 does not stand as an orphan next to the attention sequence for long.

**Open questions — resolved (2026-09-28, under the owner's NC checklist: decide on the
card-composition rules, record, continue).**

1. Card 10 becomes "One head's output: the weights mix the values". The reused explorer walks the
   whole pipeline; under one idea per card its mask and softmax steps belong to c11 and c12, so only
   the weighted sum is left. The explorer stays a benchmark scene, off this board.
2. No q·k card. The curriculum stays at 25 cards; c12 shows the raw q·k scores as its first stage
   and names them, and the depth ladder's Attention · Guided computes them by hand. Recorded for the
   NC9 coherence review (is the "how are scores produced" step thin?).
3. c13 stays where batch 1 put it (cards 1–10 are frozen). The Self-attention sequence records
   `deepens → c13`, so the path is represented without moving an approved card.
4. c10 uses characters, like c11, c12 and c05 (the same "Before we…" line), not GPT-2 BPE: a
   tokenizer switch in the middle of one sequence is a second, unrelated mental model. c13 keeps its
   BPE tokens and names them.
5. c14 is built in batch 4 (with c26 and c19), so c05 is not left without its MLP partner for long;
   the sequence "The MLP" (c05 → c14) is recorded then.

## 12. Batch 4 — plans under Phase 1 of card composition

Planned 2026-09-28 by one planner per card, an adversarial critic per plan and a cross-card judge; every field in full, with the pinned source lines, in [nanogpt-deep-dive-batch4-plans.md](nanogpt-deep-dive-batch4-plans.md). Every practice asks about a case the card does not draw. No open questions: the composition rules decided every boundary. Board order after c05: c14, c26, c19.

### Sequence "The MLP" — c05-position-mixing → c14-mlp

### Sequence "Training fundamentals" (renamed by the owner from "One training step": the frozen cards still cover the rest of a real step) — c26-training-objective → c19-gradient-step

Frozen batch-1 training cards (c16, c20, c17, c18) are linked from c26 and c19 by typed relationships only, as c11 links to c13; none is reopened. c05 gains its sequence ("The MLP · 1 of 2" in its header), as batch 3 decided.

**c14 · Inside the MLP: c_fc → GELU → c_proj**
- one_sentence_objective: After this card, the learner should understand that inside the MLP c_fc widens one position’s C numbers to 4C, GELU bends each of them on its own (a positive one keeps more than half of itself, a negative one ends between −0.17 and 0), then c_proj sums them back into C numbers, so the MLP is not a linear map.
- boundary_decision: staged
- undrawn case (practice): Position 0 · B's input with every sign flipped: (−0.22, 1.09, 0.65, −1.53).

**c26 · The training objective: per-position targets, their mean, perplexity**
- one_sentence_objective: After this card, the learner should understand that NanoGPT's training objective is the plain mean of −ln p(next character) over every position it scores, each counting 1/N of it (N = B·T per step), a number perplexity only re-reads as e^mean.
- boundary_decision: staged
- undrawn case (practice): A T = 256 window (shakespeare_char's block_size, a Source value) in which 255 positions score 1.00 and one scores 9.00.

**Not on the card.** It draws only T = 1..8, with recorded losses, and 1.00, 9.00, 256 and 1.03 appear nowhere on it:
- no cell reads 1.00;
- its means run from 0.922 to 2.454;
- its shares run from 0.498 to 1.993;
- its perplexities run from 2.51 to 11.63.

**Why it needs the rule.** The card shows the rule (mean = sum ÷ T, each position counting 1/T, a surprise's share = loss ÷ T) only for T ≤ 8.

**c19 · One gradient step on a quadratic (prerequisite)**
- one_sentence_objective: After this card, the learner should understand that one gradient step moves the weight by −lr × g, so on a bowl whose slope grows by c per unit of distance the product lr × c decides whether the step stops short, lands on the minimum, overshoots, bounces back to the same loss or climbs out.
- boundary_decision: staged
- undrawn case (practice): A bowl twice as steep, L(w) = 2(w − 3)² with c = 4, reached from the same start, w = 0.

**Nothing on the card draws it before a committed attempt:**
- no preset changes c;
- the steeper curve, its dot, its arrow and its captions are at opacity 0;
- on the drawn bowl, the right answer (lr 0.25, the default preset) visibly stops only halfway.

**Why the picture misleads.** Reading the picture gives 0.5, the drawn bowl's landing lr, and on the steeper bowl that answer bounces.
