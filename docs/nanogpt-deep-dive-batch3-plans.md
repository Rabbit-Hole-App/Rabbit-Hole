# NanoGPT deep-dive board - batch 3 plans (full)

Phase 1 plans for batch 3, produced by one planner per card, an adversarial critic per plan and a cross-card judge (2026-09-28). Every NanoGPT line cited was re-read at the pinned revision 3adf61e. The summary and the owner questions are in docs/nanogpt-deep-dive-board-plan.md section 11; this file keeps every field in full for the card authors.

## Batch summary

Batch 3 is four cards: c11, c12, c10 and c05. Three of them form one sequence, "Self-attention": c11 causal mask → c12 score scaling → c10 weighted values. It follows the spec's path: what a position can see → how scores become weights → how weights mix values. Multi-head (c13, batch 1) is attached to it as a deeper card and is not reopened. c05 ("Where positions mix inside a Block") is not in that sequence. Its idea sits at the Block level, and half of it is about the MLP, so ending the attention path on it would be wrong. It sits on the board right after the sequence and is marked as the prerequisite of c14 (Inside the MLP, a later batch). The two cards form a sequence only once c14 is built.

Overlap between the cards is resolved by giving each one its own idea:
- c11: the mask as a fixed 1/0 triangle that cuts exactly at every row's training target.
- c12: one positive multiplier, 1/√hs, applied before the mask, sets how peaked the weights are.
- c10: one head's output is a weighted average of the visible values, drawn as a point between them.
- c05: only attention moves information between positions. The MLP works per position.

Inventory card 10 changes from "Attention explorer (existing, reused)" to a new weighted-values card. The explorer's mask toggle and its scores-to-softmax steps belong to c11 and c12, so one idea per card leaves only its last step, the weighted sum.

Every practice asks about a case its card does not draw:
- c11: which positions query 99 of a 256-long window may read.
- c12: the weight on 'r' at × 0.
- c10: the output with equal 1/4 weights.
- c05: which outputs change after a whole Block when input 100 changes.

I re-read every NanoGPT line these plans cite at the pinned revision, 3adf61e, through pinnedFile. They all match. I also re-ran the toy numbers for c10, c11 and c12 through DERIVATIONS; they match. No claim is dropped.

Collection candidate "Attention" (noted, not built): c11, c12, c10, c13, c05, plus the depth-ladder Attention cards, which live on another board.

## Sequences

### Self-attention: c11-causal-mask → c12-score-scaling → c10-weighted-values

This is the spec's self-attention path, restricted to cards this batch builds. The cards are causally ordered.
- c11 fixes which keys a query can see: the triangle, where masked means weight exactly 0.
- c12 turns one reader's q·k scores into weights: × 1/√hs, then the mask, then softmax. It takes the mask from c11, and its × 0 practice combines c11's equal-scores split with its own rule.
- c10 takes those weights (never negative, summing to 1) as its input and mixes the values with them.

Each card depends on the one before. Each is also a different mental model: visibility, peakedness, averaging. So the path is a sequence of three cards, not one staged card.

The spec's fifth step, 'how NanoGPT does it across heads', is c13 (batch 1). It has no exported plan and is not reopened, so it is linked as 'deepens -> c13-multi-head' from c10 and is not a member of the sequence.

The spec's second step, 'how similarity scores are produced' (q·k), has no card on this board. c12 names it at its raw-scores stage (see open questions).

## Inventory changes

- **Card 10, replaced (split out of the reused explorer).** It was "Attention explorer (existing, reused) | explore | query, mask". It becomes c10-weighted-values, "One head's output: the weights mix the values" (explore + practice; control: query). The inventory row's title and controls match I01's attentionExplorerScene (queryIndex plus a 'Causal mask' bool); causalAttentionScene is a replay with no inputs. Both walk the whole pipeline: scores → mask → softmax → mix. Under the one-idea rule that pipeline is a sequence, and its mask and softmax steps are now owned by c11 and c12. Only the last step, "multiply every value vector by its weight, and add them up", is new, so c10 keeps that alone. Neither I01 nor causalAttentionScene is edited or placed on this board. This also leaves the board with a single mask toggle, c11's.
- **Card 5, retitled and gains a practice.** Title: "Attention mixes across tokens; the MLP works within each token" → "Where positions mix inside a Block". The old title held two claims joined by a semicolon. Kind: explore → explore + practice. Control: "connectivity view" → a 'Sub-layer' picker (② attn / ⑤ mlp).
- **Card 11, practice replaced.** The §5 row "query at position 2, mask fixed off, indices" predates the commit-before-you-see rule, and its answer is on screen. It is superseded by a choice question about query position 99 of a T = 256 window with the mask locked on.
- **Card 12, retitled and gains a practice.** Title: "Scaling scores by 1/√dₖ (a multiplier)" → "Scaling scores by 1/√hs", using NanoGPT's own name for the head size. Kind: explore → explore + practice. The practice asks about × 0, which the card does not draw. The × 0 preset is removed from the presets for that reason: it would also contradict the card's "order never changes" line.
- **Nothing folded or dropped.** The inventory stays at 25, after batch 2 folded card 8 into card 9.

## c11 · Causal mask as a triangle

**concept**

causal mask

**one_sentence_objective**

After this card, the learner should understand that the causal mask is one fixed lower triangle over the T × T scores, so every position reads only itself and earlier positions, never the next character it is trained to predict.

**prerequisites**

- attention lets a position read other positions and mix them. Named on c02: 'Causal self-attention: each position mixes in information from itself and earlier positions.'
- softmax turns a row of scores into weights that sum to 1 (named here, not taught)
- next-character targets: position i is trained to predict character i + 1. The card teaches this in place through the row labels 'B → e' and one legend line; c16 and c26 own the objective.

**causal_steps**

Staged as one pipeline, in timeline order.
1. The mask table (grid 1): NanoGPT's tril of ones, cut to T × T. It holds 1 on and below the diagonal and 0 above, so row i keeps columns 0..i. Row labels read 'i · char → next char'.
2. Wherever the table holds 0, the score becomes −∞ (masked_fill). In the toy every score is 0, so only the mask shapes what follows.
3. Softmax runs per row and gives the weights (grid 2). Blocked weights are exactly 0, drawn in the blocked band. Row i splits 1 evenly over i + 1 positions, and the cells read 1.00 | 0.50 0.50 | 0.33 ×3 | 0.25 ×4 | 0.20 ×5 | 0.17 ×6.
4. The consequence, read off grid 1: the highlighted cell (i, i+1) is row i's training target, and it is always the first 0 in its row. The mask cuts exactly at every row's target. Row 5's target is the space after the window, so row 5 has no highlighted cell.

**primary_interaction**

Question (y 30): 'Which positions may each position read, and why never the character it is trained to predict?'

One control in INTERACT: bool 'Causal mask (off = What-if)', default On (NanoGPT's state). At the default state the consequence is visible without scrolling (scene height about 620): both triangles and the five highlighted cells are on screen.

Turning it Off changes four things. Every changing label and caption goes through choose; there is no derived opacity.
- Grid 1: every 0 becomes 1, including the highlighted cells (0,1) (1,2) (2,3) (3,4) (4,5). Its label goes from '① causal mask: 1 = may read, 0 = blocked' to '① What-if, no mask: every cell 1'.
- Grid 2: the blocked upper triangle fills with heat and every row reads 0.17 × 6; row 5 is the same in both states. Its label goes from '② weights: 0 → score −∞ → weight 0' to '② What-if weights: every row spreads over all {{T}}'.
- Caption 1: 'Each position reads itself and every earlier one, never a later one.' → 'What-if, no mask: every row reads all {{T}} positions, later ones included.'
- Caption 2: 'The highlighted cell is the next character, the one that row is trained to predict: always blocked.' → 'Each row could read its highlighted cell: the very character it is trained to predict.'

These stay constant and hold in both states: the status line, the legend, the equal-scores note and one footer line, 'NanoGPT uses this same triangle in every head and every layer, for any T up to block_size = {{blockSize}}.'

Replay: grid 1 at 0 s, arrow at 0.6 s, grid 2 at 1.0 s.
Review states: {mask:true} and {mask:false}.

**check/practice**

Practice, check choice_equals, with fixedInputs {mask: true} ('Locked by this task: Causal mask = On').

Prompt, built from fx.architecture.block_size: 'In shakespeare_char training every window is T = 256 characters long (block_size). Positions count from 0, as on the card. With the causal mask on, which positions may the query at position 99 read?'

Answer domain (choice, bare ranges so the learner cannot match words against a caption):
- before: '0 to 98' (drops the diagonal)
- self: '0 to 99' (correct, 100 positions)
- target: '0 to 100' (leaks the target)
- all: '0 to 255 (all 256)' (forgets the mask)

The default is 'all', a wrong option, following the c04/c09 pattern. Expected: 'self'.

Reasoning required: apply 'row i keeps columns 0..i' to a row the card does not draw. The diagonal stays, and column i + 1 (row 99's target) is blocked.

feedbackPass: 'Right: position 99 reads positions 0 to 99, itself and every earlier one, 100 in all. Position 100 is the character it is trained to predict, and it is blocked with everything after it, up to 255.'
feedbackFail explains the kept diagonal and the blocked i + 1 target. It points back to row 5 on the card, which reads 0 to 5 and whose target, the space, lies after the window.

No drawn reveal (ponytail: add a reveal strip only if review asks). This replaces the pre-rule card-11 row in board plan §5.

**undrawn case**

Row 99 of a T = 256 window (256 = shakespeare_char block_size, a Source value). The card draws only rows 0-5 of a T = 6 window, so the range 0-99 cannot be read off the picture. The learner needs the rule 'row i keeps columns 0..i and blocks column i + 1'.

**boundary_decision**

staged

**boundary_reason**

One causal pipeline revealed in stages: the tril table, then 0 → −∞ (masked_fill), then a per-row softmax. The highlighted targets are not a second mechanism; they explain where the cut falls.

Rubric review:
- 3 (two visualization regions) does not hold: both grids belong to one pipeline and change together under the one toggle.
- 7 (concept B needed first) is a near-miss: next-character targets are taught in place by the row labels and one legend line.
- 11 (a removable half) is fixed by moving storage, the cut to T × T and the flash/is_causal branch off the card into sources. The Deep dive teaches those.

Separable ideas stay on other cards: the multiplier (c12), the weighted mix (c10), heads (c13), attn versus MLP wiring (c05), and growing T and memory (the depth Deep dive).

Expected boundaryFlags: none. The title has no 'and', the objective has no ';' or ', and', there is 1 control, height is about 620 and no 'separately' appears. plan.boundary.reviewed stays empty.

**sequence**

Self-attention, 1 of 3 (c11-causal-mask → c12-score-scaling → c10-weighted-values)

**relationships**

- prerequisite -> c12-score-scaling (which keys survive the mask before the multiplier and softmax act; c12's × 0 practice combines this card's equal-scores split with its own rule)
- prerequisite -> c05-position-mixing (c05 redraws this triangle as attn's wiring and sets it against the MLP's diagonal)
- prerequisite -> c13-multi-head (c13's legend 'masked, not a value: blank score = -inf; gray weight = exactly 0' assumes this card)
- depth-ladder board, tutor note only: deepens <- Attention · Overview; prerequisite -> Attention · Guided (its what-if 'Unmasked, it would read the character it must predict' covers one row); deepens -> Attention · Deep dive (T growth, manual vs fused, memory)

**data_plan**

Tokens (Source value, labels only): fx.tokenizer.tokenizers[0].tokens.slice(0, 7), re-verified as ['B','e','f','o','r','e','␣']. These are real shakespeare_char tokens from dataset line 2. Column labels '0 B'…'5 e'; grid 1 row labels '0 · B → e'…'5 · e → sp'. The legend says '(sp = space, the character after this window)'.

Scores (Calculated toy example): a 6 × 6 matrix of zeros, labelled 'every score 0'. Honest note: 'Every score is 0 here, so the mask alone shapes the weights: each row splits 1 evenly over what it may read.'

Structural tables built in the module from T:
- tril (1 if j ≤ i else 0), which is torch.tril(torch.ones) cut to T;
- ones, for the What-if.
grid1 = choose(mask, tril, ones), with numberFormat 'integer'.

Live calculation: weights = softmax(causal_mask(scores, mask)). Re-run here: rows [1], [0.5 ×2], [0.333 ×3], [0.25 ×4], [0.2 ×5], [0.167 ×6], with nulls above when on, and 0.167 everywhere when off.

What-if: the mask off, which NanoGPT has no switch for.

Source value: block_size = fx.architecture.block_size = 256 (re-verified), used in the footer via {{blockSize}} and in the practice. Query position 99 is authored, and the option ranges are computed from 99 and block_size. T is interpolated from the constant, never typed.

No distribution:true, following Guided/Deep. The rounding (0.33 × 3 reads 0.99) is explained in sources, never in a grid label.

**capability_notes**

No new capability is needed.
- The bool input joins the pool and feeds causal_mask's enabled argument and choose. choose returns matrices too.
- causal_mask and softmax pass nulls through (scene-derive.js:106-141, re-read here).
- Grid features: rowLabels, columnLabels, numberFormat 'integer', and heat with valueScale 'fixed' on grid 2 only. Grid 1 has cellHighlight [1,8,15,22,29] with cellHighlightKind 'highlight', which draws a fill one step brighter and a 2px stroke, not a ring. The captions say 'highlighted'.
- The highlights stay on grid 1: it has no heat, and its 0 cells are not null, so they keep their highlight.
- Practice uses choice_equals and fixedInputs.
- About 11 objects, width 960, cell 44.

Gate gap: assertCardGates does not measure grid labels, but the renderer fits the viewBox to sceneContentBounds. The card test must assert sceneContentBounds(evaluated.scene).xMax ≤ 960 at both states, and no grid label may carry a rounding note.

A clean-browser pixel check in both states must confirm the highlighted superdiagonal reads against both the 1 cells and the 0 cells.

**overlap_check**

What the existing cards already show:
- **c13** (batch 1) shows, per head, which keys one selected query sees, with the legend 'masked, not a value: blank score = -inf; gray weight = exactly 0'. It has no whole-matrix mask object and does not say why the mask exists.
- **Depth Overview** draws one reader's bars; characters to its right are 'hidden'.
- **Depth Guided's** what-if caption already says 'Unmasked, it would read the character it must predict.', but for one row only.
- **Depth Deep dive** draws one head's T × T att with the blocked triangle, 'M_{ij}=-\infty\ (j>i)', a T slider, manual versus fused, and memory.

Within batch 3:
- **c12** draws masking for one reader's row as a stage and takes the mask as given. Its × 0 practice uses this card's equal-scores result.
- **c05's** attn state draws the same lower triangle as wiring (output i from inputs 0..i), only to set it against the MLP's diagonal. Its practice is the scatter-and-compose inverse of this card's question: a change at 100 reaches outputs 100..255.
- **c10** starts from masked weights of 0.
- The reused explorer, which had its own 'Causal mask' toggle, no longer goes on this board (inventory change), so c11 holds the board's only mask toggle.

What only c11 adds:
(a) the mask as its own content-free 1/0 table, with the scores held equal;
(b) every row's target sitting at the first blocked cell (i, i+1) at once;
(c) the count rule, applied at a row the card does not draw.

It shows no q·k numbers, no query picker, no T slider, no heads, no memory and no scaling.

**source citations (pinned 3adf61e)**

- model.py:44-45 (pinned 3adf61e, re-read via pinnedFile): "# flash attention make GPU go brrrrr but support is only in PyTorch >= 2.0" / "self.flash = hasattr(torch.nn.functional, 'scaled_dot_product_attention')"
- model.py:46-50: "if not self.flash:" … "# causal mask to ensure that attention is only applied to the left in the input sequence" / "self.register_buffer(\"bias\", torch.tril(torch.ones(config.block_size, config.block_size))" / ".view(1, 1, config.block_size, config.block_size))". The 1/0 table grid 1 draws, stored only on the manual path.
- model.py:62-64: "if self.flash:" … "y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)". The default path applies the same triangle as a flag (sources only).
- model.py:67-69: "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))" / "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))" / "att = F.softmax(att, dim=-1)"
- model.py:70: "att = self.attn_dropout(att)" (sources note only)
- model.py:99: "self.attn = CausalSelfAttention(config)"; model.py:130: "h = nn.ModuleList([Block(config) for _ in range(config.n_layer)]),". The same triangle in every layer.
- model.py:173: "assert t <= self.config.block_size, f\"Cannot forward sequence of length {t}, block size is only {self.config.block_size}\""
- model.py:184-187: "if targets is not None:" … "logits = self.lm_head(x)" / "loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)" (sources)
- train.py:123-125: "ix = torch.randint(len(data) - block_size, (batch_size,))" / "x = torch.stack([torch.from_numpy((data[i:i+block_size]).astype(np.int64)) for i in ix])" / "y = torch.stack([torch.from_numpy((data[i+1:i+1+block_size]).astype(np.int64)) for i in ix])". Position i's target is character i + 1.
- config/train_shakespeare_char.py:19: "block_size = 256 # context of up to 256 previous characters"
- doc (not pinned code): PyTorch torch.nn.functional.scaled_dot_product_attention, is_causal applies a lower-triangular causal mask. The URL deep.js already cites; it backs the footer's claim on the default path.
- runtime (repo): scene-derive.js:106-141 softmax/causal_mask (re-read); choose; scene-activity.js choice_equals and fixedInputs; interactive-scenes.js:259-260 (the explorer's queryIndex/maskEnabled, now off this board)

**risks**

1. Equal scores could be read as how NanoGPT attends. The status line and the note carry 'Calculated toy example: every score 0'.
2. Row 5 has no highlight; the '(sp = …)' legend carries why.
3. The mask-off caption must stay 'could read', never measured behaviour.
4. Rounding (0.33 × 3 = 0.99, 0.17 × 6 = 1.02) is explained in sources only, because of the content-bounds overflow.
5. The highlight is a lit fill plus a 2px stroke, not a ring. Check pixels from a clean browser.
6. Drawing 0s instead of blanks matches NanoGPT's buffer. Review must confirm the triangle still reads at a glance.
7. The c11 (query 99) and c05 (input 100) practices are near-inverses by design. Each feedback names its direction (reads versus reaches).
8. c11 must never gain q·k numbers, a query picker or a T slider, or it collapses into c12/c13/Deep.

## c12 · Scaling scores by 1/√hs

**concept**

attention score scaling. NanoGPT multiplies every q·k score by one positive number, 1/√hs, which is set by the head size and not learned. It does this before the causal mask and softmax: the manual path is model.py:67-69, and the default fused SDPA call applies the same default scale inside it.

**one_sentence_objective**

After this card, the learner should understand that NanoGPT multiplies every attention score by one positive number fixed by the head size, 1/√hs, before the mask and softmax, so the size of that number sets how peaked the visible weights are while their order and the masked zeros stay unchanged.

**prerequisites**

- c11-causal-mask: later positions get −∞ and weight exactly 0; equal visible scores split the weight evenly
- a score is q·k, one number per key for this reader. It is named at the card's raw-scores stage, is taught on the depth ladder's Attention · Guided, and appears in c13's step 1. No deep-dive card owns it (open question).
- softmax turns a row of scores into weights that sum to 1, and a larger score gets a larger weight (named)

**causal_steps**

Staged. One reader's row, fixed at position 5, the second 'e' of "Before we" (6 visible, 3 later), in the manual path's source order:
1. Raw scores q·k against all 9 keys; the later keys are scored too.
2. The whole row × m, then the 3 later characters → −∞, drawn blank. The label says the mask comes after the multiplier.
3. Softmax → weights, drawn as cells with fixed 0-1 heat and as bars on a fixed 0-1 axis (masked = no bar).

att @ v is not drawn; c10 owns it.

**primary_interaction**

Question (y 30): 'What does multiplying every score by one number do to the weights?'

One control in INTERACT: 'Multiplier on the scores (preset)', an index picker over multiplierLabels ['× 1/4', '× 1/2 = 1/√hs', '× 1 (no factor)'] with multipliers [0.25, 1/Math.sqrt(att.hs) = 0.5, 1]. Default index 1, the rule at this toy's hs = 4. Reset is included.

What follows the control:
- the stage-2 row: -0.50 0.50 -0.50 0.50 2.00 0.50 / -1.00 … 4.00 … / -2.00 … 8.00 …, plus 3 blanks, with the × m label on its arrow;
- the weights cells and bars: 'r' reads 0.55 / 0.86 / 0.99, and the other visible weights shrink toward 0.00;
- the status tag: What-if, rule, What-if;
- one picked caption: × 1/4 'every gap is half the rule's, so the weights are flatter'; × 1/2 'the rule at this toy's hs = 4: × 1/√4 = × 1/2'; × 1 'no factor: every gap is double the rule's, so the weights are sharper';
- one readout: "weight on 'r': {{wR}} here, {{wRule}} at × 1/2 = 1/√hs".

Static lines, true at every drawn preset:
- "same order as the raw scores: 'r', then the three 2s, then the two −2s; equal scores keep equal weights"
- legend: 'blank = masked, exactly 0 · 0.00 = rounded, still above 0 · each cell rounded on its own, so a row can read 0.99'

Source lines:
- 'NanoGPT: × 1/√hs, hs = n_embd / n_head, fixed by the shape, not learned, the same in every head and layer'
- 'shakespeare_char: hs = 384 / 6 = 64, so × 1/8 on its own heads' scores'
- 'NanoGPT's default fused attention call applies the same × 1/√hs inside it'

At the default state everything fits in about 760 units.

**check/practice**

Practice, choice_equals. fixedInputs {multiplier: 1}, which snaps to × 1/2, the default state. Hidden bool revealInput 'zeroRevealed'.

Prompt: "What-if, not one of the presets: suppose the multiplier were × 0. What weight would this reader put on 'r'?"

Answer domain (choice, bare values so no option echoes a caption):
- sixth: '0.17 (1/6)' (correct)
- ninth: '0.11 (1/9)' (forgets the mask)
- zero: '0.00' (believes a score of 0 gives a weight of 0)
- top: 'still the largest, below 0.55' (over-generalises 'the order never changes')
The default is 'top', a wrong option (c04/c09 pattern).

Reasoning required:
- × 0 erases every gap between the visible scores, so the six visible characters get equal weights of 1/6 (c11's equal-scores rule).
- The mask runs after the multiplier, so the three later characters are still −∞ and get 0.
- A score of 0 is not a weight of 0 (e^0 = 1).
- 'Keeps order' holds only for positive multipliers.

Revealed after commit: a gated row gate(w0Row, zeroRevealed), live, reading six 0.17 cells and three blanks, labelled What-if. The line under it: '× 0: six equal scores, six equal weights, 1/6 = 0.167 each; the later three stay blank because the mask comes after the multiplier.' feedbackFail names the misconception behind the chosen option.

**undrawn case**

× 0 on the drawn reader's row. No preset draws a tie: the smallest preset, × 1/4, still gives 'r' 0.55 and keeps the order. Nothing on the card shows equal visible weights or the value 1/6 until the committed reveal, and the gate keeps the reveal values out of every display and out of the tutor payload before commit.

**boundary_decision**

staged

**boundary_reason**

One causal pipeline in source order: raw scores → × m → mask → softmax. It is shown in three stages, with one control acting on one quantity. NanoGPT's 1/√hs is the value the same multiplier takes, fixed by the shape, so it is a setting, not a second mental model.

Why 1/√hs in particular (score spread grows with hs; saturation; w(1 − w)) is a separate idea, left to the depth ladder's Attention Deep dive. The weighted mix is c10's.

Expected boundaryFlags: none. The title has no 'and'. The objective has no ';', ', and', 'and also' or 'as well as'. There is 1 visible control (the reveal bool is hidden), height is about 760, and no 'separately'.

**sequence**

Self-attention, 2 of 3 (c11-causal-mask → c12-score-scaling → c10-weighted-values)

**relationships**

- prerequisite <- c11-causal-mask (which keys are visible; masked weights are exactly 0; equal scores split evenly)
- prerequisite -> c10-weighted-values (the weights it produces, never negative and summing to 1, are c10's input)
- prerequisite -> c13-multi-head (c13's step '1. scores q·k × 1/√hs' is this card's × 1/2 rule preset at hs = 4)
- alternative_explanation <-> c21-temperature (the same multiply-then-softmax relationship on output logits, ÷ T = × 1/T)
- depth-ladder board, tutor note only: deepens -> Attention · Deep dive (why 1/√hs: hs = 4/16/64 saturation)

**data_plan**

Calculated toy example: head 0 q and k from packages/web/src/nanogpt/depth/fixtures/attention.generated.js (gen_attention.py; hand-set, not trained). hs = att.hs = 4. Context att.context.tokens = B e f o r e ␣ w e (re-verified; dataset line 2), with the space shown as 'sp'. The reader is fixed at 5.

Live calculation, re-run here through DERIVATIONS:
- matmul(Q, K) row 5 = [-2, 2, -2, 2, 8, 2, -2, 2, -2].
- Pipeline: m = pick(multipliers, multiplier); scale(raw, m) → causal_mask(·, 'causal') → softmax → pick row 5.
- × 1/4 → [0.045, 0.122, 0.045, 0.122, 0.545, 0.122]
- × 1/2 → [0.006, 0.043, 0.006, 0.043, 0.86, 0.043]
- × 1 → [0.00005, 0.0025, 0.00005, 0.0025, 0.9925, 0.0025]
- 3 nulls in each.
- wRule is a second pipeline with the constant 1/Math.sqrt(att.hs).
- rAt = argmin(pick(causal_mask(scale(raw, -1), 'causal'), 5)) = 4.
- Practice reveal: gate(pick(softmax(causal_mask(scale(raw, 0), 'causal')), 5), zeroRevealed) = six 0.167 and three nulls (re-verified).

What-if: × 1/4, × 1 and the × 0 reveal. The rule preset is bound as 1/Math.sqrt(att.hs), never typed.

Source value: n_embd 384 and n_head 6 from fx.architecture (re-verified). hs = 64 and × 1/8 are computed in the module.

No recorded run. Status line: 'Calculated toy example · Live calculation · What-if · Source value'.

**capability_notes**

Nothing new is needed. In use:
- an index picker;
- matmul / scale / causal_mask (with the boolean exampleData 'causal') / softmax / pick / argmin / gate / choose;
- grids with no heat on the raw and scaled scores (c13's precedent) and valueScale 'fixed' heat on the weights;
- bars with peak 1, where null draws no bar;
- a hidden bool revealInput with gate-derived values and choose-derived opacity, and no timeline appear on those objects;
- choice_equals with fixedInputs.

Constraints:
1. scale rejects vectors that contain nulls, so the argmax negates before masking.
2. The pool rounds to 3 decimals, so no caption prints the × 1 small weights.
3. No distribution:true: at × 1/4 it would show the equal −0.5 pair as 0.05 and 0.04. A legend note says each cell is rounded on its own.
4. The raw and scaled rows need cell 44 for '-2.00'. The captions sit in a right column, split by hand.

Budget: about 28 objects, height about 760.

**overlap_check**

What the existing cards already show:
- **c13** applies a constant 0.5 under '1. scores q·k × 1/√hs' and never varies it.
- **Depth Guided** uses the same fixture with a fixed factor; its reader 5 equals this card's default row.
- **Depth Deep dive** has 'Scale by 1/√hs (off = What-if)' on the same fixture's head 0 at T = 9, and row 5 of its att grid on/off equals this card's × 1/2 and × 1 presets. This is disclosed, not denied. The Deep dive's lesson is the WHY over the full matrix.
- **c21** teaches the same sharper/flatter relationship on logits, with no mask and no constant fixed by the shape. It is linked as alternative_explanation and its lesson is not re-taught as new.

Within batch 3:
- **c11** owns the mask. Its equal-scores grid is the building block of this card's × 0 answer, which is why it is a prerequisite. The step new to c12 is that × 0 erases every gap while the mask still applies afterwards.
- **c10** consumes the weights and draws no scores.

What only c12 adds:
- the doubling ladder × 1/4 → × 1/2 → × 1 on one row, with the raw, scaled and masked stages visible;
- the multiplier comes before the mask, so weight moves only among the visible keys;
- the × 0 limit as a committed practice.

**source citations (pinned 3adf61e)**

- model.py:67 (pinned 3adf61e, re-read via pinnedFile): "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))"
- model.py:68: "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))". The mask runs after the multiply (manual path).
- model.py:69: "att = F.softmax(att, dim=-1)"
- model.py:66: "# manual implementation of attention"
- model.py:57: "k = k.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)", so k.size(-1) = hs
- model.py:33: "assert config.n_embd % config.n_head == 0"
- model.py:10: "import math"
- model.py:45: "self.flash = hasattr(torch.nn.functional, 'scaled_dot_product_attention')"
- model.py:46-50: "if not self.flash:" … "self.register_buffer(\"bias\", torch.tril(torch.ones(config.block_size, config.block_size))" / ".view(1, 1, config.block_size, config.block_size))". The buffer exists only on the manual path.
- model.py:62-64: "if self.flash:" … "y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)". No scale argument.
- model.py:99: "self.attn = CausalSelfAttention(config)"; model.py:130: "h = nn.ModuleList([Block(config) for _ in range(config.n_layer)]),"
- config/train_shakespeare_char.py:23-24: "n_head = 6" / "n_embd = 384", giving hs 64 and × 1/8
- train.py:53-54: "n_head = 12" / "n_embd = 768"; model.py:113-114: "n_head: int = 12" / "n_embd: int = 768", giving hs 64
- model.py:217-220: "'gpt2': dict(n_layer=12, n_head=12, n_embd=768)" … "'gpt2-xl': dict(n_layer=48, n_head=25, n_embd=1600)". hs = 64 in all four sizes (sources only).
- doc (not pinned code): PyTorch torch.nn.functional.scaled_dot_product_attention. scale defaults to 1/√E, E = q.size(-1) = hs (the URL deep.js cites).
- paper (not pinned code): Vaswani et al. 2017, arXiv 1706.03762 §3.2.1, softmax(QKᵀ/√d_k)V

**risks**

1. **Overlap with Deep's toggle and Guided reader 5 (same fixture).** Disclosed. If review finds it too close, the fallback is c13's toy.
2. **Overlap with c21.** Handled by the relationship and by a practice about the multiplier's place relative to the mask.
3. **× 1 cells read 0.00.** The legend separates 0.00 from blank.
4. **Two rules side by side.** × 1/2 is the rule at hs = 4 and × 1/8 the rule at hs = 64. The source line ties each factor to its own head's scores.
5. **The × 0 answer echoes an earlier picture.** The answer, 0.17 over six visible keys, equals c11's row 5 (six 0.17 cells) because both readers sit at position 5. It is still reasoning: the learner must know that × 0 makes every visible score equal and that the mask still applies. A learner who memorised c11's picture without the rule gains little, because 'ninth' and 'zero' are the traps. If review wants no echo, move c12's reader. That is not done here, because the numbers above are verified at reader 5.
6. **Scope creep into why 1/√hs.** That stays in the Deep dive.

## c10 · One head's output: the weights mix the values

**concept**

Weighted values: for one query, a single head's output y = att @ v (one row) is the weighted average of the value vectors that query can see. This is the output before the heads are joined and c_proj mixes them.

**one_sentence_objective**

After this card, the learner should understand that one attention head's output for a query is the weighted average of the value vectors that query can see, so it always lands between those values, pulled toward each in proportion to its weight.

**prerequisites**

- c11-causal-mask: a query sees itself and earlier tokens; a masked weight is exactly 0
- c12-score-scaling: a query's weights are never negative and add up to 1 (at generation)
- a vector is a list of numbers; a 2-number vector can be drawn as a point

**causal_steps**

1. The chosen query's weight row: one weight per token it can see. The weights are computed live (q·k, × 1/√hs, mask, softmax) but act as this card's input. Scores and mask are not drawn; c11 and c12 own them.
2. Each visible value v_j is scaled by its weight w_j. A masked token has weight 0 and gives no pull.
3. The results are added: y = Σ w_j v_j (model.py:71, one row). Because the weights are ≥ 0 and sum to 1 at generation, y is a weighted average and lies between the visible values.

All three steps are drawn together, because only step 3 has a visible consequence. The replay only makes the weight row, the V table, the output row and the output dot appear. The value dots, labels and spokes follow the query through derived opacity, with no appear.

**primary_interaction**

One control in INTERACT: 'Query token' (index, of: tokens, presentation 'picker'). Domain 0..3 = [Before, ␣we, ␣proceed, ␣any]; default 3, so all four values are in the mix. The mask is fixed on, with no toggle: c11 owns it.

Layout (960 wide, about 790 tall):
- y 30: question, 'Where does a head's output land among the values its query can see?'
- y 56: status line.
- y 78: 'Builds on: which tokens a query sees; softmax weights · GPT-2 BPE tokens (␣ = space)'. This names the tokenizer switch from the characters of c11 and c12, as c13's token label does.
- Weight row (top left): 1x4 derived grid, cell 60, columnLabels = tokens, distribution:true, fixed heat; masked cells gray.
- 2-D plane (the dominant visual), value map x = 220 + 150·v1, y = 540 − 150·v2:
  - an L-shaped frame outside the data: bottom line at about y 590, left line at about x 30, tick texts, and the words 'dim 1' and 'dim 2'. No axis passes through the origin.
  - four value dots with no label of their own; token names are separate texts at least 20 px outward (␣we and Before below, ␣proceed and ␣any above).
  - one spoke per visible value to the output.
  - the output dot, role output, with no label of its own.
- Right: the V table (4x2 input grid, cell 52, signed shared heat). Directly under it, column-aligned: the output row (1x2, cell 56, same heat group), labelled 'this head's output for “{{qword}}”'.
- Under the plane:
  - legend 'orange dot = this head's output for “{{qword}}”';
  - legend 'faded = later token: weight exactly 0, no pull';
  - rule line 'at generation the weights are never negative and add up to 1, so the output is a weighted average of the values it can see - not their sum';
  - one live caption 'pulled hardest by “{{topWord}}”, its largest weight' (words only);
  - the Source value footnote on dropout.

Moving the query:
- the weight row recomputes;
- later tokens fade to 0.3 and their spokes hide;
- the output dot, the spokes' shared endpoint and the output row move to the live average.

The states it reaches: Before on its own value (zero-length spoke hidden); ␣we on the segment between two values; ␣proceed between three; ␣any inside all four, nearest Before. The consequence is visible at the default state without scrolling.

reviewStates: [{query:3},{query:2},{query:1},{query:0},{query:3,revealed:true}].

**check/practice**

Practice (id c10-practice, check choice_equals). fixedInputs {query: 3}; revealInput 'revealed' ({name:'revealed', type:'bool', hidden:true, default:false}).

Prompt: 'Suppose “␣any” put equal weight, 1/4, on each of the four tokens it sees (on the card its weights differ). Using the value table, where would its output land?'

Answer domain (choice; option strings and feedback built from V in the module and tested):
- unchanged: (0.47, 0.33)
- own: (1.00, 1.00)
- top: (1.00, 0.00)
- average: (0.25, 0.50) (correct)
- sum: (1.00, 2.00)
The default is 'unchanged', a wrong option (c04/c09 pattern). Correct: average, from Σ (1/4)·v_j = ((1 − 1 + 0 + 1)/4, (0 + 0 + 1 + 1)/4).

Why the distractors are wrong:
- unchanged: the weights, not only the values, set where the output lands.
- own and top: one value wins only when its weight is 1.
- sum: the weights add to 1, and (1, 2) lies outside every value.

Reveal after Check: a neutral grey dot at meanPx (257.5, 465), from uniform = softmax(zeros4), meanOut = weighted_sum(uniform, V) and meanPx = weighted_sum(uniform, Vpx). A legend line reads 'grey dot, What-if: equal weights → the plain average'. Both get opacity = choose(revealed, ghostAtQuery, 0).

**undrawn case**

The four-way uniform weighting (1/4 each) of ␣any's values. The drawn rows, re-verified, are [1], [.33, .67], [.25, .25, .50] and [.54, .13, .27, .06]. No drawn row is uniform over every token it sees. ␣proceed's equal .25/.25 pair is a partial instance. The drawn outputs are (1, 0), (-0.34, 0), (0, 0.50) and (0.47, 0.33), so (0.25, 0.50) is never an output. The query is locked at ␣any, so the answer must be computed from the V table with the rule.

**boundary_decision**

single

**boundary_reason**

One mental model: one head's output is a weighted average of the visible values. There is one control. Its causes, the mask (c11) and scaled scores → softmax (c12), are the sequence's earlier cards; multi-head (c13) deepens it.

The inherited explorer's mask toggle and its embedding, QK, score, mask and softmax stages are dropped, not staged: they are c11's and c12's content, and staging them here would make this card the whole sequence again.

The practice states the weights, so it does not also test softmax. Nothing on the card would survive as a lesson if the other half were removed.

Expected boundaryFlags: none. There is 1 visible input (the hidden reveal bool is filtered out), and height is about 790.

**sequence**

Self-attention, 3 of 3 (c11-causal-mask → c12-score-scaling → c10-weighted-values). It sits after c11 and c12 on the board although its inventory number is lower.

**relationships**

- prerequisite <- c11-causal-mask (which values are in the mix; masked weight exactly 0)
- prerequisite <- c12-score-scaling (weights ≥ 0 that add up to 1)
- deepens -> c13-multi-head (each head runs this mix on its own v; the outputs are joined side by side, then c_proj)
- prerequisite -> c05-position-mixing (c05's precision line: positions meet only where the weights mix the values)
- depth-ladder board, tutor note only: alternative_explanation <-> Attention · Guided step 4 (the same mix as a numbers table)

**data_plan**

Source value:
- tokens = fx.tokenizer.tokenizers[1].tokens.slice(0, 4) = [Before, ␣we, ␣proceed, ␣any] (re-verified). These are the tiktoken gpt2 output recorded by generate_fixtures.py, the same tokens as c13, and the card names them GPT-2 BPE tokens.
- fx.architecture n_embd 384, n_head 6 and dropout 0.2 (re-verified) are bound into the footnote.

Calculated toy example (labelled, with an honest note):
- Q = [[1,0],[0,1],[1,1],[1,-1]], K = [[1,0],[0,1],[1,1],[-1,1]], hs = 2. Copy the literals; the test pins them.
- V = [[1,0],[-1,0],[0,1],[1,1]].
- Vpx is an affine layout map, x = 220 + 150·v1, y = 540 − 150·v2.

Live calculation (exampleData adds causal: true, zeros4 and hs: 2):
- raw = matmul(Q, K)
- scaled = scale(raw, invSqrtHs), where invSqrtHs is computed in the module as 1/Math.sqrt(hs), never a typed 0.7071
- masked = causal_mask(scaled, 'causal'); att = softmax(masked); w = pick(att, query)
- out = weighted_sum(w, V); outPx = weighted_sum(w, Vpx)
- negScaled = scale(scaled, -1); negMasked = causal_mask(negScaled, 'causal'); negRow = pick(negMasked, query); topAt = argmin(negRow); topWord = pick(tokens, topAt); qword = pick(tokens, query)
- opacity tables are picked by query
- practice: uniform = softmax(zeros4); meanOut and meanPx by weighted_sum; ghost opacity by choose

Oracles, re-run here:

| Query | Weights | Output |
|---|---|---|
| Before | [1] | (1, 0) |
| ␣we | [.33, .67] | (-0.34, 0) |
| ␣proceed | [.248, .248, .503] | (0, .503) |
| ␣any | [.539, .131, .266, .065] | (.472, .33) |

Practice mean: (.25, .50).

No recorded run.

**capability_notes**

No new capability is needed. In use: an index picker; matmul, scale, causal_mask, softmax, pick, weighted_sum, argmin and choose; circles with derived x/y (c17); lines with derived endpoints and opacity; a 1-row grid with null cells gray, distribution and fixed heat; practice with fixedInputs and a hidden-bool revealInput.

Constraints:
1. Derive args are numbers or pool paths only. causal: true, zeros4 and hs go in exampleData; a literal true throws.
2. A circle's label is centred on the circle, so no circle carries a label. Token names and legends are separate texts outside the spoke fan.
3. There is no hollow circle style. The ghost is a neutral grey dot.
4. Objects with derived opacity carry no timeline appear.
5. The layout lint has no line-on-line check. Keep the frame off the data and inspect the ␣we and ␣proceed states in pixels.
6. The Before spoke has zero length at query 0, so it is hidden.
7. Cells ≥ 44 px for 2-decimal negatives.
8. Sources' calculation statuses are 'Calculated toy example', 'Live calculation' and 'Source value', all visible at the default state. What-if appears only in the reveal legend.

Budget: about 40 of 60 objects; height about 790.

The new module is packages/web/src/nanogpt/cards/c10-weighted-values.js, with a test.

**overlap_check**

What the existing cards already show:
- **causalAttentionScene and I01 attentionExplorerScene** each walk the whole pipeline. c10 keeps only their last step and replaces them on this board (inventory change).
- **c13** already has the same Query token picker over the same four tokens, a 1x4 weight row and a '3. {{headName}} output = Σ w·V' strip. c10 reuses the weight row as its input and does not restate c13's titled strip. Its output numbers sit as a row under the V table, and the plane is the dominant visual.
- **Depth Guided** step 4 shows the mix in numbers ('a mix of the visible v' under its What-if).
- **Depth Deep** states 'T = 1: att = [1], so y is exactly its own v', which is c10's query-0 state.

Within batch 3:
- **c11** and **c12** produce the weights; c10 draws neither the mask nor the scores.
- **c05** says where the mix sits in the Block; c10 says what the mix computes.

The residual add (model.py:104) comes after the heads are joined and after c_proj, not directly after this row.

What only c10 adds:
- the output as a point that always lands between the visible value points, pulled by weight;
- average, not sum;
- a practice that computes an undrawn equal-weight average from the value table.

**source citations (pinned 3adf61e)**

- model.py:56 (pinned 3adf61e, re-read via pinnedFile): "q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)"
- model.py:59: "v = v.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)"
- model.py:33: "assert config.n_embd % config.n_head == 0"
- model.py:39: "self.attn_dropout = nn.Dropout(config.dropout)"
- model.py:62-64: "if self.flash:" … "y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)"
- model.py:67-69: "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))" / "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))" / "att = F.softmax(att, dim=-1)"
- model.py:70: "att = self.attn_dropout(att)"
- model.py:71: "y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)" (this card: one row, one head)
- model.py:72: "y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side" (c13, named only)
- model.py:75-76: "y = self.resid_dropout(self.c_proj(y))" / "return y"
- model.py:104: "x = x + self.attn(self.ln_1(x))"
- config/train_shakespeare_char.py:23-25: "n_head = 6" / "n_embd = 384" / "dropout = 0.2"
- sample.py:51: "model.eval()"; train.py:218: "model.eval()"; train.py:227: "model.train()"
- doc (not NanoGPT): torch.nn.Dropout, which in training zeroes some elements and scales the rest by 1/(1-p)
- repo: interactive-scenes.js:259-260 (I01 queryIndex/maskEnabled); reference-scenes.js:112 causalAttentionScene; c13-multi-head.js:12 TOKENS and :146 'GPT-2 BPE tokens (␣ = space); bold = query'

**risks**

1. **Tokenizer switch.** The sequence goes from characters (c11, c12) to GPT-2 BPE tokens here, to match c13, which c10 deepens into. The card must name the tokenizer; the owner may prefer character labels (open question).
2. **Owner sign-off.** Card 10's inventory row changes (explorer → weighted values), so the owner should confirm.
3. **Training versus generation.** Keep 'at generation' on the rule line. Never call the training output an average; the dropout footnote says why.
4. **'Pulled hardest' is about weight, not distance.** It names the largest weight, not the nearest point. They coincide in this toy (tested), but the wording must not become a distance claim.
5. **Pixels.** Line-on-line overlaps and the density of the spoke fan show only in pixels. Screenshot all five reviewStates.
6. **Echo of c13.** The weight row echoes c13. Keep the plane dominant.

## c05 · Where positions mix inside a Block

**concept**

Position mixing inside one Block: which input positions each output position can depend on, in the attention sub-layer compared with the MLP sub-layer. Only attention moves information between positions, and only forward.

**one_sentence_objective**

After this card, the learner should understand that inside a Block only attention moves information between positions: output i can depend on inputs 0 to i in attn but on input i alone in the MLP.

**prerequisites**

- c02-block-anatomy: attn (② step) and mlp (⑤ step) are the Block's two sub-layers. attn reads ln_1(x) and mlp reads ln_2(x + a), each followed by a residual add.
- c11-causal-mask: an attention output at position i reads positions 0 to i

**causal_steps**

Not staged. One relation drawn in two states.
1. Six positions, 0 to 5, each hold one sub-layer input vector. The input-row label is 'reads ln_1(x)' or 'reads ln_2(x + a)'.
2. attn: output i can depend on inputs 0 to i. On the manual path this comes from the tril buffer (model.py:46-50) applied at :68; on the default path from is_causal=True (:64). Output i is therefore drawn from i + 1 inputs.
3. mlp: output i = dropout(c_proj(GELU(c_fc(input i)))) (:87-92), so it depends on 1 input. The same weights run at every position.
4. A fixed precision line: inside attn, positions meet only where the (T, T) weights mix the values (:67-71). c_attn (:56), the head split (:57-59), the re-assembly (:72), c_proj (:75), ln_1/ln_2 (:27) and the residual adds (:104-105) act on each position alone.

**primary_interaction**

Question: 'Inside one Block, which positions can each output depend on?' Status line under it.

One control: `sublayer`, an index picker over exampleData.sublayers = ['② attn', '⑤ mlp'] (c02's step names). Label 'Sub-layer', default 0 (attn).

Visual:
- State heading above the input row: '② attn: causal self-attention' or '⑤ mlp: c_fc → GELU → c_proj'.
- Input row of 6 box tiles, '0 · B' to '5 · e' (role input), and an output row of 6 tiles (role output), 160 units apart.
- 21 lines run from input tile j to output tile i, for every j ≤ i.
- Row labels in the left column: 'reads ln_1(x)' / 'writes a', or 'reads ln_2(x + a)' / 'writes m'.

attn → mlp:
- The 15 lines with j < i go from opacity 1 to 0 ($derive 'conn.i.j', no appear); the 6 diagonal lines stay.
- The 'from N' labels change from 1..6 to all 1.
- Two rule lines follow the state. attn: 'Output i can depend on inputs 0 to i: itself and every earlier position.' and 'Later positions are masked, so nothing flows backwards.' mlp: 'Output i depends on input i alone.' and 'The same c_fc → GELU → c_proj runs at every position.'

Fixed lines:
- 'Inside attn, positions meet only where the weights mix the values; c_attn and c_proj act on each position alone.'
- 'Six positions drawn; NanoGPT wires up to block_size = {{T}} the same way.'

No replay: timeline [] and duration 0.1.
reviewStates: [{sublayer:0},{sublayer:1}].

**check/practice**

Practice, choice_equals, answer type choice. The default is a wrong option ('only-100'). No fixedInputs.

Prompt: 'NanoGPT runs up to block_size = 256 positions (0 to 255); the card draws six. Dropout is off, as when generating. Only the Block's input x at position 100 changes. After the whole Block (attn with its residual add, then mlp with its residual add), which positions of the Block's output can change?'

Answer domain:
- only-100: 'Only position 100' (ignores attention's spread)
- from-100: 'Positions 100 to 255' (CORRECT)
- upto-100: 'Positions 0 to 100' (copies the gather shape without inverting it)
- all: 'All 256 positions' (forgets the mask, or believes the MLP mixes positions)

Reasoning required: attn spreads the change forward, so every output i ≥ 100 puts positive weight on position 100 while outputs 0 to 99 have it masked. Then ln_2, the MLP and both adds act per position: they carry the change but add no spread.

feedbackPass: 'Right: 100 to 255 (156 positions). attn carries the change forward to every output from 100 on; outputs 0 to 99 have position 100 masked. ln_2, the MLP and the adds work on each position alone, so they add no spread.'
feedbackFail: 'Not quite. Chain the two sub-layers. attn: output i reads inputs 0 to i, so a change at 100 can reach outputs 100 to 255 and never 0 to 99. Then ln_2, the MLP and the adds act on each position alone: no further spread. So 100 to 255. All 256 would need attention without the mask or an MLP that mixes positions; only 100 ignores attention; 0 to 100 reads the wiring backwards. On the card: input 3 reaches outputs 3, 4, 5 in attn and only 3 in mlp.'

**undrawn case**

Two things are undrawn: position 100 of a 256-position context (the card draws 0 to 5), and the composition of the two sub-layers through a whole Block (the card draws attn and mlp only as separate states). The answer, 100 to 255, is not on screen. It needs the attn rule inverted from gather into reach, then the MLP's per-position rule.

**boundary_decision**

single

**boundary_reason**

One relation, 'which inputs can an output depend on', drawn for the two sub-layers of one Block. The contrast is the idea.
- Rubric 11 does not hold. Without the MLP state, what remains is c11's triangle. Without the attn state, 'the MLP works per position' has nothing to stand against.
- Rubric 5 does not hold. The single control changes the wiring, the counts, the heading, the row labels and the rule lines.
- One visual region, one control, one practice.
- Not staged: there is no pipeline.

Mechanical flags: none. The critic checked with node that planProblems returns [] and boundaryFlags returns [], with 1 control and height 620.

Not a member of the Self-attention sequence. Half its idea is the MLP, and it does not advance the attention mechanism (see: sees → weights → mix → heads). It is the prerequisite of c14.

**sequence**

none. Board placement: directly after the Self-attention sequence, as the bridge from attention to the MLP. When c14 (Inside the MLP) is built, record the sequence 'The MLP', c05-position-mixing 1 of 2 → c14 2 of 2, and place c14 directly after c05. No single-card sequence is recorded now.

**relationships**

- deepens <- c02-block-anatomy (turns its ② and ⑤ captions into drawn wiring and a composed-Block consequence)
- prerequisite <- c11-causal-mask (the attn wiring is c11's triangle; c05 sets it against the MLP)
- prerequisite <- c10-weighted-values (named in the precision line: positions meet only where the weights mix the values)
- prerequisite -> c14 Inside the MLP (later batch): c_fc → GELU → c_proj on one position's vector

**data_plan**

Source value:
- The six characters 'Before' = WORD_TOKENS.chars from c07-embedding-lookup.js:12-13,30. This is real shakespeare_char text, the same word c07, c09 and c11 use. IDs are not shown.
- block_size = 256 from fx.architecture.block_size (re-verified), shown as {{T}}.

Structure from source, generated in the module and never typed:
- TRIL = j ≤ i ? 1 : 0. This is the pattern of model.py:49's buffer on the manual path and of is_causal=True on the default path.
- EYE = the 6×6 identity (model.py:87-92 acts per position).

Live calculation:
- conn = pick(connBy, sublayer), with connBy = [TRIL, EYE];
- reads_i = sum('conn.i'), shown as 'from {{reads_i}}';
- the opacity of the 15 lines with j < i is $derive 'conn.i.j';
- the heading, row labels and rule lines are picked by sublayer.

No hand-typed number, no calculated toy example and no recorded run.

Status line: 'Characters, block_size: Source value · counts: Live calculation'.

Doc entries (torch.nn.Linear over the last dimension; torch.nn.GELU and torch.nn.Dropout element-wise; torch.nn.functional.layer_norm over the trailing normalized_shape) are fetched and quoted at build time, not from memory.

**capability_notes**

No new capability is needed.
- The index picker, and the derive ops pick and sum. Dotted-path args such as 'conn.3' and a nested $derive 'conn.3.1' both work.
- Derived opacity on lines, with no appear.

The critic's scratchpad prototype passed assertCardGates at sublayer 0 and 1. Scratchpad, not the repo: C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/b42304fe-5fd3-4eb4-a62e-18299e625676/scratchpad/proto.mjs
- 48 objects, width 960, height 620.
- Tiles at x = 330, 100 apart, 76 × 44; input row at y = 150, output row at y = 354.

The schema refuses duration 0, so use 0.1 with an empty timeline.

Hard ceiling: T(T+1)/2 lines plus 2T tiles. Nine characters would need 63 objects, over the 60 limit, hence six.

The practice is choice_equals with a choice answer, like c09. Wrong answers share one feedbackFail string.

**overlap_check**

What the existing cards already show:
- **c02** states the contrast in words only. whatList[1]: 'Causal self-attention: each position mixes in information from itself and earlier positions.' whatList[4]: 'The MLP transforms each position's vector on its own: c_fc, GELU, c_proj.' It draws no positions and asks nothing about spread.
- **Depth Overview** fades later characters as 'hidden' for one reader.
- **c01, c03, c13, c15 and c21** do not draw per-position wiring.

Within batch 3:
- **c11** owns the triangle: the mask as a 1/0 object, cut at every row's training target. c05's attn state is that pattern redrawn as wiring, only as the baseline for the MLP contrast.
- c11's practice asks what a query reads (gather, position 99). c05's asks which outputs a change reaches after the whole Block (reach and composition, input 100). The distractor 'Positions 0 to 100' catches a learner who applies c11's gather rule without inverting it.
- **c10** owns what the mix computes. c05 only says it is the one step where positions meet.

What only c05 adds: the MLP's per-position wiring set against attention's; 'only attention moves information between positions'; and a practice that composes both through a whole Block.

c14 owns the MLP's internals; c05 shows only that the MLP works one position at a time.

**source citations (pinned 3adf61e)**

- model.py:46 (pinned 3adf61e, re-read via pinnedFile): "if not self.flash:"
- model.py:49-50: "self.register_buffer(\"bias\", torch.tril(torch.ones(config.block_size, config.block_size))" / ".view(1, 1, config.block_size, config.block_size))"
- model.py:56: "q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)"
- model.py:57-59: "k = k.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)" (same for q, v)
- model.py:64: "y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)"
- model.py:67-71: "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))" / "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))" / "att = F.softmax(att, dim=-1)" / "att = self.attn_dropout(att)" / "y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)"
- model.py:72: "y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side"
- model.py:75: "y = self.resid_dropout(self.c_proj(y))"
- model.py:82-85: "self.c_fc    = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)" / "self.gelu    = nn.GELU()" / "self.c_proj  = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)" / "self.dropout = nn.Dropout(config.dropout)"
- model.py:87-92: "def forward(self, x):" / "x = self.c_fc(x)" / "x = self.gelu(x)" / "x = self.c_proj(x)" / "x = self.dropout(x)" / "return x"
- model.py:23, 27: "self.weight = nn.Parameter(torch.ones(ndim))" / "return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)"
- model.py:103-105: "def forward(self, x):" / "x = x + self.attn(self.ln_1(x))" / "x = x + self.mlp(self.ln_2(x))"
- model.py:173: "assert t <= self.config.block_size, f\"Cannot forward sequence of length {t}, block size is only {self.config.block_size}\""
- config/train_shakespeare_char.py:19: "block_size = 256 # context of up to 256 previous characters"
- config/train_shakespeare_char.py:25: "dropout = 0.2" (why the practice says dropout is off)
- repo (not NanoGPT): c07-embedding-lookup.js:12-13,30 WORD = 'Before', WORD_TOKENS; c02-block-anatomy.js steps and whatList lines quoted in overlap_check
- Not pinned; fetch and quote at build: PyTorch docs for torch.nn.Linear, torch.nn.GELU, torch.nn.Dropout, torch.nn.functional.layer_norm

**risks**

1. **The answer equals attn alone.** The 'All 256' distractor, which is what a belief that the MLP mixes positions produces, is what makes the MLP half count. Keep it.
2. **Dropout.** The prompt must say dropout is off.
3. **False simplification.** Keep the precision line: positions meet only in the weights and att @ v.
4. **'Can', not 'does'.** Use 'can' in the captions and the prompt.
5. **Repeated character.** 'Before' has two e's. No caption may imply that equal characters get equal MLP outputs.
6. **Line crowding.** 21 lines converge on 6 points. Inspect the pixels.
7. **Echo of c11.** c05 and c11 sit next to each other in reading order and share the triangle. The heading and captions must frame the attn state as wiring for the contrast, not re-teach the mask.
8. **c14 not built.** No sequence is recorded until c14 ships.

## Open questions for the owner

- Card 10: do you accept replacing the reused explorer with the new weighted-values card? I01 and causalAttentionScene stay as benchmark scenes and are not placed on this board.
- No card on the deep-dive board teaches how similarity scores are produced (q·k), the spec's second self-attention step. c12 only names it at its raw-scores stage and relies on the depth ladder's Attention · Guided (another board) and on c13's step 1. Do you want a q·k card in a later batch, or is naming it enough?
- c13 (multi-head, batch 1) is the natural fifth step of the self-attention path, but it sits in batch 1, earlier on the board than c11 → c12 → c10. Should c13 move to follow c10 in board order only, with no content change? And should it become '4 of 4' in the sequence? That would need a plan export on a card approved before Phase 1.
- c10 uses GPT-2 BPE tokens, to match c13 which it deepens into. c11, c12 and c05 use shakespeare_char characters from the same text line. Keep BPE and name the tokenizer on the card (the plan's choice), or relabel c10 with characters for a consistent sequence?
- c05's sequence with c14 ('The MLP', c05 → c14) is recorded only when c14 is built. Confirm c14 is planned for the next batch, so c05 does not stand as an orphan next to the attention sequence for long.
