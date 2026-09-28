# NanoGPT deep-dive board - batch 4 plans (full)

Phase 1 plans for batch 4, by one planner per card, an adversarial critic per plan and a cross-card judge (2026-09-28). Every NanoGPT line cited was re-read at the pinned revision 3adf61e. Summary in docs/nanogpt-deep-dive-board-plan.md section 12; every field here in full for the card authors.

## Batch summary

Batch 4 has three cards: c14-mlp, c26-training-objective and c19-gradient-step. It forms two sequences.

**The MLP: c05 → c14.** The plan already fixed this pair. c05 says the MLP works on each position alone; c14 opens that step for one position.

**One training step: c26 → c19.** This is new. Both are new cards and sit next to each other on the board, and they give two different mental models in causal order:
- c26 shows the one number a step lowers: the equal-weight mean of −ln p over B·T positions, read again as perplexity.
- c19 shows how one step lowers a loss: w − lr × g, where lr × c decides where the step lands.

c19's first prerequisite ("a loss is one number training pushes down") is exactly c26. The rest of the training path is frozen batch-1 cards:
- c16 (the loss at one position) comes before the sequence;
- c20 (the update rule), c17 (lr per iteration) and c18 (when to stop) come after it.

Those four are linked by typed relationships recorded only on c26 and c19, as c11 links to c13 in batch 3. No frozen card is reopened or joins a sequence. Their board order cannot change, so the path lives in the relationships.

**Overlap is resolved by giving each card its own idea:**
- **c14:** c_fc widens, GELU bends each number on its own, and c_proj sums back. The practice shows the MLP is not linear. c05 keeps the wiring; c14 repeats it in one footer line only.
- **c26:** the targets are x shifted by one; each position counts 1/T; one surprise's share shrinks as 1/T; B·T is the per-step count; perplexity is e^mean. c16 keeps −ln p at one position. The depth ladder's Training · Guided (another board) keeps the checkpoint curve; c26 has no time axis.
- **c19:** the slope, −lr × g and five landing classes set by lr × c. c20 keeps the update rules, c17 the lr over time.

**Every practice asks about a case the card does not draw:**
- c14: position 0's input with every sign flipped.
- c26: a 256-position window with 255 losses of 1.00 and one of 9.00.
- c19: a bowl twice as steep.

**What I checked this turn:**
- I re-read every NanoGPT line cited at pin 3adf61e through pinnedFile (model.py, train.py, config/train_shakespeare_char.py, sample.py, README.md, data/shakespeare_char/prepare.py); all match.
- I re-ran c14's toy MLP in Python (inputs normalized as layer_norm does, zero-sum W_proj rows, h, GELU, m, the flipped case, sets of positive numbers, distances): all as stated.
- I re-ran the recorded toy bigram at iter 1000. p for 'Before we' matches to 6 decimals, and p(f|e) and p(sp|e) come from the same row, which confirms the critic's contradiction finding.
- I re-computed c26's sums, means, shares and perplexities, and c19's arithmetic and pixel mapping.

**Changes I made on top of the critics' plans:**
1. **c26's anchor.** It said 'perplexity e^4.17 = 65', but e^4.17 = 64.7. It now reads 'perplexity 65, loss ln 65 = 4.17'.
2. **c19 text widths.** The footers (122 chars) and the legend (119 chars) would fail the textOverflow gate at x 40 in annotation type; they are rewritten under 112 chars.
3. **c14 notation.** c14's GELU output is labelled GELU(h) on the card, not g, because c19 and c20 use g for the gradient.
4. **c14 names and test.** The pool names now match c04's (C, Cv, C4). The −0.17 bound is tested on unrounded erf values, since the flipped case stores −0.1700 at h = −0.76.
5. **Typed relationships.** Relationships to frozen cards are typed objects inside each sequence, not plan text.

## Sequences

### The MLP: c05-position-mixing → c14-mlp

This pairing was decided in batch 3 (resolved question 5). c05 shows that only attention moves information between positions and that the MLP works on each position alone. c14 opens that per-position step: c_fc widens, GELU bends, c_proj sums back.

The two cards are different mental models in causal order: c05 is the wiring between positions, c14 the computation inside one position. c05 is the last card of batch 3 and c14 the first of batch 4, so they sit next to each other.

c05's plan gains boundary.sequence {name: 'The MLP', position: 1, of: 2}, and its string relationship lines become typed objects. This changes c05's header visibly ('The MLP · 1 of 2'), so c05 goes into the visual review deploy. board.test.mjs's assertion that c05 has no sequence changes to {name: 'The MLP', position: 1, of: 2}.

### One training step: c26-training-objective → c19-gradient-step

The two new training cards form one path in causal order:
- c26: what one step lowers. The objective is the equal-weight mean of −ln p(next character) over B·T = 16,384 positions per shakespeare_char step; perplexity is e^mean.
- c19: how one step lowers a loss. The step is w − lr × g, and lr × c decides where it lands.

c19's first prerequisite ('a loss is one number training pushes down') is exactly c26. The two ideas are separable (averaging over positions versus a descent step), so they are two cards, not one staged card.

The rest of the training path is frozen batch-1 cards with no plan export: c16 (−ln p at one position) before it, then c20 (the update rule from SGD to AdamW), c17 (lr per iteration) and c18 (when to stop). They cannot be members, because a sequence's cards must all carry the plan, and their board order cannot change. They are linked by typed relationships recorded on c26 and c19 only, the precedent being c11 → c13-multi-head in batch 3:
- prerequisite, c16 → c26
- prerequisite, c26 → c18
- prerequisite, c19 → c20
- prerequisite, c19 → c17

The header reads 'One training step · k of 2'. c26's footer says B·T positions per step, and c19 is the step itself.

## Board order

- c05-position-mixing (last card of batch 3, unchanged position; header gains 'The MLP · 1 of 2')
- c14-mlp
- c26-training-objective
- c19-gradient-step

## Inventory changes

Owner to confirm. The inventory stays at 25 cards, and no title changes.

**Card 14, Inside the MLP: c_fc → GELU → c_proj.**
- Kind: explore → explore + practice. It practises on an undrawn case, the flipped input.
- Control: 'token preset' → 'Position's input (preset)': 0 · B, 1 · e, 2 · f. These are the Before characters c05 uses, with toy input vectors.
- Data: unchanged, precomputed GELU in a new fx.mlp fixture. The weights are a labelled Calculated toy example.

**Card 26, The training objective: per-position targets, their mean, perplexity.**
- Kind: explore → explore + practice.
- Control: 'position' → a What-if slider over the window length T = 1..8 (the window ends at position T − 1). A per-position 'predicted perfectly' what-if contradicts the bigram, where e→f and e→sp share one softmax row. A plain position inspector reveals nothing the table does not already show.
- Data: 'toy' → the recorded toy bigram run at iteration 1000 (p), plus precomputed −ln p and e^mean. This is the same run c18 and Training · Guided use, labelled 'Recorded toy run, not NanoGPT'.

**Card 19, One gradient step on a quadratic (prerequisite).**
- The §5 practice row ('which preset lands on the minimum', whose answer is on screen) is superseded by a commit-before-you-see question about an undrawn bowl twice as steep.
- The presets become lr 0.25, 0.5, 0.75, 1, 1.1 on L = (w − 3)², including the lr × c = 2 bounce.

**Sequences.** Two new: 'The MLP' (c05 → c14) and 'One training step' (c26 → c19).

**Existing code these plans touch:**
- **c05:** its visible header changes, its plan gets a sequence object with typed relationships, and its header comment and boundary reason are updated. The card's content does not change.
- **board.js:** NANOGPT_LATER_BATCHES gains the batch-4 array [c14, c26, c19].
- **board.test.mjs:** the c05 sequence assertion is updated.

No frozen batch-1 card (c16, c17, c18, c20, c15, c01) is reopened.

## c14 · Inside the MLP: c_fc → GELU → c_proj

**concept**

The MLP's inside, for one position.

**Its input** is ln_2(x + a): one normalized vector of C numbers, in c02's notation. The card never calls the MLP input x.

**The three steps:**
- **c_fc** is nn.Linear from C to 4C. In shakespeare_char it has no bias: train.py's bias = False, which the shakespeare_char config keeps. GPTConfig's own default and GPT-2 checkpoints use bias = True.
- **GELU** is nn.GELU with approximate 'none'. It maps each of the 4C numbers on its own to h·Φ(h). A positive h keeps between half and all of itself; a negative h ends between −0.17 and 0. It is never ReLU and never a gate.
- **c_proj** is nn.Linear from 4C back to C. Each output number is a learned weighted sum of all 4C GELU outputs.

In training, dropout follows. The Block then adds the MLP's output m to the stream: x + a + m.

**Why it matters:** GELU is not linear, so neither is the MLP. One visible sign is that flipping every sign of the input gives an output that is neither −m nor m.

**one_sentence_objective**

After this card, the learner should understand that inside the MLP c_fc widens one position’s C numbers to 4C, GELU bends each of them on its own (a positive one keeps more than half of itself, a negative one ends between −0.17 and 0), then c_proj sums them back into C numbers, so the MLP is not a linear map.

**prerequisites**

- c05-position-mixing: the MLP (step ⑤) works on each position alone, and the same c_fc → GELU → c_proj runs at every position. This card opens that step for one position.
- c02-block-anatomy: step ⑤ reads ln_2(x + a) and writes m; step ⑥ adds m to the stream, x + a + m.
- c15-layernorm: ln_2 hands the MLP a normalized vector; the toy input is one such vector.
- A weighted sum of numbers: each output is Σ w·input, with learned weights.

**causal_steps**

One staged causal pipeline. The replay reveals it stage by stage; at rest everything is drawn together.

1. **Input:** ln_2(x + a) at one position, C = 4 toy numbers.
2. **c_fc (model.py:82, :88):** h = input·W_fcᵀ. The 4 numbers widen to 16 (4C). Each h_j is a learned weighted sum of the input's 4 numbers, with no bias.
3. **GELU (:83, :89):** GELU(h)_j = h_j·Φ(h_j), for each of the 16 numbers on its own. Every sign is kept: h > 0 keeps between half and all of itself; h < 0 ends between −0.17 and 0.
4. **c_proj (:84, :90):** m = GELU(h)·W_projᵀ. The 16 numbers go back to 4; each m_i is a learned weighted sum of all 16 GELU outputs.
5. **Footnote only:** dropout (:85, :91) in training, then the Block adds m to the stream, x + a + m (:105).

**Replay, 3.8 s:**
- 0 s: input strip
- 0.5 s: c_fc funnel and its label
- 1.0 s: h
- 1.5 s: GELU line
- 2.0 s: GELU(h)
- 2.5 s: c_proj funnel and its label
- 3.0 s: m
- 3.4 s: highlight on m

The What-if objects carry no appear; their opacity is derived.

**primary_interaction**

**The control.** One visible control in INTERACT: `position`, an index picker labelled 'Position’s input (preset)'.
- options: ['0 · B', '1 · e', '2 · f'], taken from c07 WORD_TOKENS.chars.slice(0, 3), the word c05 uses
- default 0

There is also a hidden bool, `revealed`, which the practice owns (the c10 and c12 pattern).

**Layout** (960 × 830, cell 46; the critic's scratch prototype passed assertCardGates at all 6 states and assertCardPlan, and the gates are re-run at build).

**Header:**
- y 30, the question: 'What happens to one position’s vector inside the MLP?'
- y 56, the status line: 'Characters, sizes: Source value · input, weights, GELU values: Calculated toy example · h, m: Live calculation'
- y 78: 'Builds on: the MLP works on each position alone; ln_2 hands it a normalized vector'

**Row names** (caption type, x 40):
- 'input · C = 4'
- 'h · 4C = 16'
- 'GELU ↓'
- 'GELU(h) · 16'
- 'm · C = 4'
- 'What-if GELU(h)', with derived opacity

The judge renamed the GELU output from 'g' to 'GELU(h)' on the card, because c19 and c20 use g for the gradient.

**The rows:**
- **Input strip** at (180, 128), label '{{xLabel}}', e.g. 'ln_2(x + a) at position 0 · B (toy numbers)'.
- **c_fc funnel:** lines (180, 174)→(180, 254) and (364, 174)→(916, 254), with 'c_fc: 4 → 16' at (380, 222).
- **h strip** at (180, 254), 16 cells.
- **GELU line** at (250, 336): 'GELU(h) = h · Φ(h), on each number alone (Φ: the standard normal CDF)'.
- **GELU(h) strip** at (180, 360), each cell directly under its h cell.
- **c_proj funnel:** lines (180, 406)→(180, 486) and (916, 406)→(364, 486), with 'c_proj: 16 → 4' at (380, 450).
- **m strip** at (180, 486), role output.

**The What-if pair** (opacity choose(whatIf, 1, 0), no appear):
- 'What-if m, input flipped' strip at (680, 486); at x 600 the c_proj funnel line crosses its label.
- 'What-if GELU(h)' strip at (180, 558), labelled 'What-if: GELU after every sign of position 0’s input is flipped'.

**Colour:** all strips have signed heat in one valueScaleGroup, 'c14-mlp', so a squeezed cell turns pale against its h cell.

**Bottom text:**
- y 634, live caption (role output), e.g. '“B”: 10 of the 16 hidden numbers stay positive; the other 6 end between −0.17 and 0.'
- y 664: 'c_fc: each hidden number is a learned weighted sum of the input’s 4 numbers, with no bias.'
- y 688: 'GELU keeps each sign: h > 0 keeps over half of itself; h < 0 ends between −0.17 and 0.'
- y 712: 'c_proj: each of m’s 4 numbers is a learned weighted sum of all 16 GELU outputs.'
- y 744: 'The same weights run at every position: another position changes the input, never the weights.'
- y 766: 'cells: orange = +, blue = −, one colour scale for every row'
- y 788: 'Source value: shakespeare_char has C = {{C}}, so c_fc makes 4C = {{C4.0}} numbers per position; this toy has C = 4.'
- y 810: 'Source value: in training, dropout (p = 0.2) follows c_proj; then the Block adds m to the stream: x + a + m.'

**What moving the picker changes:**
- the input switches preset;
- h recomputes live (matmul);
- GELU(h) switches to that preset's precomputed values;
- m recomputes live;
- the caption follows;
- the weights never change, which carries c05's rule.

**The three states:**

| preset | stay positive | m |
|---|---|---|
| B | 10 of 16 | (−1.97, 1.77, 1.44, −1.98) |
| e | 4 of 16 | (0.78, −1.41, −0.56, −0.23) |
| f | 11 of 16 | (−2.17, 1.81, −0.38, 1.18) |

Every component of m changes sign somewhere across the three presets.

**What it reveals:** how much of each hidden number survives, Φ(h), depends on that number, which comes from this position's input; the weights are the same at every position. The consequence is visible at the default state without scrolling.

**reviewStates:** [{position: 0}, {position: 1}, {position: 2}, {position: 0, revealed: true}].

**check/practice**

**Practice, commit before you see.**
- id: 'c14-practice'
- check: 'choice_equals'
- version: 1
- fixedInputs: {position: 0}
- revealInput: 'revealed'

**Prompt:** 'Suppose every sign of position 0’s input were flipped (not drawn; as NanoGPT trains shakespeare_char, c_fc has no bias). Which hidden numbers would stay positive after GELU, and what would the MLP output be?'

**Options.** They are mutually exclusive, and the strings are built in the module from the derive pool, as c10 does with buildPool. The default never renders (the c05 ponytail note).

| id | option | the belief it catches |
|---|---|---|
| same-minus (default) | 'The same 10 stay positive, and the output is −m' | each unit's gate is fixed |
| other-minus | 'The other 6 stay positive, and the output is −m' | GELU, and so the MLP, is odd or linear |
| other-same | 'The other 6 stay positive, and the output is still m' | the MLP ignores the input's sign |
| other-neither (expected) | 'The other 6 stay positive, and the output is neither −m nor m' | correct |

**Reasoning required:**
1. With no bias, c_fc of the flipped input is −h, so every hidden number changes sign.
2. GELU keeps signs, so the 6 squeezed for B now stay positive and B's 10 are squeezed.
3. GELU treats +h and −h differently: a positive number keeps over half its size, a negative one ends between −0.17 and 0. So the new GELU(h) is neither the old one nor its negative, and c_proj's weighted sum has nothing that would make it −m or m.

**feedbackPass:** 'Right. c_fc has no bias, so the flipped input gives −h: every hidden number changes sign. GELU keeps signs, so the 6 squeezed for “B” now stay positive and its 10 are squeezed. GELU does not treat +h and −h alike, so nothing makes c_proj’s sum −m or m: here (−0.23, 1.23, −1.78, 1.37) against m = (−1.97, 1.77, 1.44, −1.98). The What-if rows now show it.'

**feedbackFail:** gives one clause per distractor, using the same numbers:
- 'the same 10' ignores that no bias means every h flips;
- '−m' treats GELU as odd, but a negative number ends between −0.17 and 0 while a positive one keeps over half itself;
- 'still m' ignores that the positive set changed.

**Reveal:** the additive What-if GELU(h) row and the What-if m strip, plus the caption 'What-if, input flipped: the 6 squeezed for “B” stay positive, its 10 are squeezed.' Everything is tied to position 0 by revealAtPos = [true, false, false], so a persisted `revealed` never shows the What-if next to e or f.

**undrawn case**

Position 0 · B's input with every sign flipped: (−0.22, 1.09, 0.65, −1.53). None of it is drawn before Check.

**The input is not a preset.** Its distance to e is 2.19, to f 2.54 and to B 4.0.

**No drawn row has its positive set.** Counting from 1, the flipped case keeps {1, 2, 6, 7, 11, 14}. The drawn rows keep:
- B: {3, 4, 5, 8, 9, 10, 12, 13, 15, 16}
- e: {6, 9, 11, 16}
- f: {1, 2, 3, 5, 6, 7, 8, 11, 12, 13, 15}

**The output.** m(flipped) = (−0.23, 1.23, −1.78, 1.37) and −m(B) = (1.97, −1.77, −1.44, 1.98). Neither appears before Check. Every component of m(flipped) is at least 0.54 from m(B) and at least 0.34 from −m(B).

**Why it needs the rules.** The picker is locked at B, so the learner sees only B's input, h, GELU(h) and m. The answer needs three rules the card states, applied to a case it does not draw:
1. linear with no bias, so every h flips;
2. GELU keeps signs, so the complement stays positive;
3. GELU is not odd, so the output is neither −m nor m.

All of these numbers were re-computed by the judge in Python with math.erf.

**boundary_decision**

staged

**boundary_reason**

**One staged card.** It is one mental model: widen, bend each number, project back. The three steps are causally dependent: GELU reads c_fc's output and c_proj reads GELU's. Under 'staging before splitting' they stay one card, revealed progressively.

**The rubric:**
- **11 does not hold.** c_fc alone is only 'a Linear widens'; GELU without the widening loses its role; c_proj without the bent numbers is only a matrix.
- **3 does not hold.** There is one visual region, the funnel, with its What-if pair.
- **4 and 6 do not hold.** One visible control, one practice.
- **2 does not hold.** There is no 'and' in the title.
- **5 does not hold.** The control changes every row and the caption.
- **9 does not hold.** The height is 830, below 900.

**Expected boundaryFlags: none.** The critic ran planProblems and boundaryFlags in a scratch prototype: no problems, no flags. plan.boundary.reviewed = {}.

**Not merged into c05.** c05 is the wiring between positions; c14 is the computation inside one position.

**sequence**

'The MLP', position 2 of 2: c05-position-mixing → c14-mlp.

**c14's plan:**
```
boundary = {decision: 'staged', reason, reviewed: {}, sequence: {name: 'The MLP', position: 2, of: 2, relationships: [
  {type: 'prerequisite', card: 'c05-position-mixing', direction: 'in'},
  {type: 'deepens', card: 'c02-block-anatomy', direction: 'in'},
  {type: 'prerequisite', card: 'c15-layernorm', direction: 'in'}]}}
```
c15 is a frozen batch-1 card, linked typed as c11 links c13.

**c05's plan** gains boundary.sequence {name: 'The MLP', position: 1, of: 2}. Its string lines become typed relationships:
- deepens ← c02-block-anatomy
- prerequisite ← c11-causal-mask
- prerequisite ← c10-weighted-values
- prerequisite → c14-mlp

Its boundary reason and header comment drop 'recorded when c14 is built'. This is a visible change: cardBlock puts 'The MLP · 1 of 2' in c05's header, so c05 is part of the visual review deploy. board.test.mjs's assertion that c05's sequence is undefined becomes {name: 'The MLP', position: 1, of: 2}.

**Board:** c14 is the first card of the batch-4 array in NANOGPT_LATER_BATCHES, directly after c05.

**relationships**

- prerequisite <- c05-position-mixing (direction 'in', in the sequence): the MLP works on each position alone with the same weights; c14 opens that per-position computation.
- deepens <- c02-block-anatomy (direction 'in'): c02's step ⑤ caption 'c_fc, GELU, c_proj', now drawn with numbers, keeping c02's notation ln_2(x + a) → m → x + a + m.
- prerequisite <- c15-layernorm (direction 'in', typed inside the sequence object; c15 is frozen and not reopened, the c11 → c13 precedent): the input is ln_2's normalized output.
- Depth-ladder board, tutor note only (another board, not a typed card id): alternative_explanation <-> Transformer · Deep dive's row 'ln_2 → c_fc → gelu', h: (B, T, 4C) (deep.js:222), the same step shown as a shape rather than as values.

**data_plan**

**New fixture, fx.mlp.** generate_fixtures.py gains mlp(), added to build(). It uses stdlib math only, and --check stays byte-identical. Everything is labelled Calculated toy example: the weights are hand-picked, not trained.

**Inputs.** Each raw integer vector is normalized as F.layer_norm does it: weight ones (model.py:23), no β because bias = False, eps 1e-5. Then it is rounded to 2 decimals.

| preset | raw | input |
|---|---|---|
| B | [0, −3, −2, 3] | [0.22, −1.09, −0.65, 1.53] |
| e | [4, −1, 3, −3] | [1.14, −0.61, 0.79, −1.31] |
| f | [2, 4, −3, 0] | [0.48, 1.26, −1.45, −0.29] |

The judge re-computed all three.

**W_fc**, 16 × 4, stored (out, in) as nn.Linear stores it:
[[−0.5, 0.5, −1, −0.5], [−0.5, 1, −1, −0.5], [1, 1, −1, 1], [−1, −0.5, 0.5, 1], [0.5, −0.5, −1, 1], [0.5, 1, −0.5, −1], [−1, 0.5, −0.5, −1], [−0.5, 0.5, −1, 0.5], [0.5, −0.5, 1, 0.5], [−1, −1, −0.5, 1], [1, 0.5, −1, −1], [0.5, 0.5, −1, 1], [0.5, 0.5, −1, 0.5], [−0.5, 0.5, 1, 0.5], [−0.5, 0.5, −0.5, 1], [0.5, −1, 0.5, 0.5]]

**W_proj**, 4 × 16; every row sums to 0 (verified):
[[0.25, 0.25, −0.5, 0.5, −0.5, 0.25, −0.5, 0.5, 0.5, −0.25, −0.25, −0.5, −0.25, 0.25, −0.25, 0.5], [0.5, 0.25, 0.5, −0.25, 0.5, 0.25, 0.25, −0.5, −0.5, 0.5, −0.5, 0.5, −0.5, −0.25, −0.25, −0.5], [0.25, 0.25, −0.25, −0.25, −0.5, −0.25, −0.5, 0.25, −0.25, 0.5, −0.5, 0.5, 0.25, −0.25, 0.25, 0.5], [0.25, 0.25, 0.5, −0.25, −0.5, 0.25, 0.25, −0.25, −0.5, −0.25, −0.25, −0.25, −0.25, 0.25, 0.25, 0.5]]

**Precomputed GELU:** 0.5·h·(1 + math.erf(h/√2)), rounded to 4 decimals, of h = W_fc·input. The fixture also stores the flipped case's GELU and the positive counts [10, 4, 11] and 6.

**Oracle values** (the judge re-ran them with Python math.erf):

| case | h | GELU(h) printed | m |
|---|---|---|---|
| B | [−0.77, −1.315, 1.31, 1.53, 2.835, −2.185, −1.97, 0.76, 0.77, 2.725, −1.205, 1.745, 0.98, −0.54, 1.2, 1.64] | −0.17 −0.12 1.19 1.43 2.83 −0.03 −0.05 0.59 0.60 2.72 −0.14 1.67 0.82 −0.16 1.06 1.56 | (−1.966, 1.768, 1.44, −1.985) |
| e | [−1.01, −1.315, −1.57, −1.75, −1.225, 0.875, −0.53, −2.32, 1.01, −2.235, 1.355, −1.835, −1.18, −0.74, −2.58, 0.92] | — | (0.78, −1.407, −0.56, −0.233) |
| f | [1.985, 2.615, 2.9, −2.125, 0.77, 2.515, 1.165, 1.695, −1.985, −1.305, 2.85, 2.03, 2.175, −1.205, 0.825, −1.89] | — | (−2.165, 1.807, −0.384, 1.181) |
| flipped B | −h_B | 0.60 1.19 −0.12 −0.10 −0.01 2.15 1.92 −0.17 −0.17 −0.01 1.07 −0.07 −0.16 0.38 −0.14 −0.08 | (−0.228, 1.232, −1.778, 1.371) |

Every h lies in [−2.835, 2.9], so no negative GELU prints '0.00'. Note that the flipped case's h = −0.76 stores −0.1700 at 4 decimals (true value −0.16996).

**Source values:**
- the characters B, e and f (c07 WORD_TOKENS);
- C = fx.architecture.n_embd (384), dropout 0.2 and bias false (fx.architecture).

**exampleData:**
- positions, xRows (each [[input]]), Wfc, Wproj;
- gRows (each [[GELU]]), gNegRow;
- C (a number) and Cv = [C], as in c04; the text uses {{C}} and {{C4.0}}, so the draft's nEmbd/{{C}} mismatch is gone;
- xLabels, captions and captionNeg, composed in the module from the fixture counts;
- revealAtPos = [true, false, false]; no = false.

**Live calculation.** One derive op per name:
- revealAt = pick(revealAtPos, position); whatIf = choose(revealed, revealAt, no); whatIfOp = choose(whatIf, 1, 0)
- xPicked = pick(xRows, position); h = matmul(xPicked, Wfc)
- xNeg = scale(xRows.0, −1); hNeg = matmul(xNeg, Wfc). This is the honesty link the test checks.
- g = pick(gRows, position); m = matmul(g, Wproj); mNeg = matmul(gNegRow, Wproj)
- C4 = scale(Cv, 4)
- xLabel and caption by pick or choose

**Tests** use a plain-JS oracle, never the derive graph:
- h = W_fc·input, and hNeg = −h_B;
- the GELU values match the fixture, and sign(GELU) = sign(h);
- on UNROUNDED erf values: h/2 < GELU(h) < h for h > 0, and −0.17 < GELU(h) < 0 for h < 0. The stored 4-decimal −0.1700 would fail a strict bound.
- min(h) ≥ −2.85 in every case;
- m = W_proj·GELU(h), and every W_proj row sums to 0;
- each m component takes both signs across B, e and f;
- every component of m(flipped) is at least 0.3 from m(B) and from −m(B);
- the flipped input is at least 2 from every drawn input, and its positive set equals no drawn set;
- the option strings come from the pool and are mutually exclusive.

There is no recorded run.

**capability_notes**

No new capability and no renderer primitive.

**In use:**
- the index picker plus a hidden-bool revealInput;
- the derive ops pick, scale, choose (with numeric literal branches) and matmul;
- signed-heat strips in one shared valueScaleGroup;
- line objects for the funnel;
- a timeline appear on static objects, and derived opacity only on the What-if objects, which have no appear.

**What the evaluator cannot do:** GELU (erf) is absent from DERIVATIONS, so it is precomputed, as the inventory row says.

**Constraints:**
1. matmul is A·Bᵀ over lists of vectors: the input is the 1-row matrix [[v]], and W is stored (out, in).
2. MAX_SCENE_VIEWPORT.h is 860. An 88-unit What-if band scaled annotations to 12.7 px, so the band is 60 units, for a height of 830.
3. The c_proj funnel line crosses a label to the right of m below x ≈ 620 (edge-crosses-label), so the What-if m strip sits at x 680.
4. The What-if caption must stay at or under about 90 characters in body type.
5. formatCell prints |v| < 0.005 as '0.00', so every negative h stays at or above −2.85.
6. Cells of 46 units give numerals of about 13.3 px for 5-character negatives.
7. Export no 'What-if' calculation source, because assertSources would require it on the default status line, which has no room. The reveal's own labels carry it.
8. The row name 'What-if GELU(h)' is 15 characters of caption type from x 40, ending at about x 166, before the strips at x 180.

**Budget:** about 30 of 60 objects, height 830.

**Deliberately skipped (ponytail):**
- A GELU curve inset (plot.js, about 16 objects). The aligned h-over-GELU(h) rows sample the curve; add the inset if review finds the shape unclear.
- A live gelu derive op. The smallest generic addition, if ever needed, is an elementwise gelu with an erf accurate to 1e-7.

**overlap_check**

**c02-block-anatomy** (objective: 'the recipe one Block applies to x: normalize, attend, add back, normalize, MLP, add back'). It only names the MLP ('The MLP transforms each position’s vector on its own: c_fc, GELU, c_proj.'), with no values. c14 keeps c02's notation.

**c05-position-mixing** (objective: 'only attention moves information between positions … on input i alone in the MLP'). c14 repeats this in one footer line only ('The same weights run at every position…'), to explain why the preset changes the input and never the weights.

**c04-block-stack.** It lists mlp.c_fc.weight ({{C4.0}}, {{C}}) as a parameter count. c14 counts no parameters.

**Depth-ladder cards** (another board):
- deep.js:222, the shape row 'ln_2 → c_fc → gelu';
- guided.js, which counts the MLP as 8C²;
- overview.js, 'reworks each piece on its own'.
None of them draws values.

**Other batch-4 cards:** c26 and c19 have no MLP content. The symbol g is c19's and c20's gradient, so c14 writes GELU(h) on the card.

**c15, c03, c16, c17, c18 and c20** do not overlap.

**What only c14 adds:**
- the 4 → 16 → 4 funnel with toy values;
- GELU as a per-number, sign-keeping bend that treats positive and negative numbers differently;
- a practice showing that the MLP is not a linear map.

**source citations (pinned 3adf61e)**

- model.py:78-92 (pinned 3adf61e; the judge re-read it through pinnedFile):
- :82 '        self.c_fc    = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)'
- :83 '        self.gelu    = nn.GELU()'
- :84 '        self.c_proj  = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)'
- :85 '        self.dropout = nn.Dropout(config.dropout)'
- :88-92 'x = self.c_fc(x)' / 'x = self.gelu(x)' / 'x = self.c_proj(x)' / 'x = self.dropout(x)' / 'return x'
- model.py:100-101: 'self.ln_2 = LayerNorm(config.n_embd, bias=config.bias)' / 'self.mlp = MLP(config)'.
- model.py:104-105: 'x = x + self.attn(self.ln_1(x))' / 'x = x + self.mlp(self.ln_2(x))'. In c02's notation the MLP reads ln_2(x + a), and m is added to the stream.
- model.py:23-24, :27: 'self.weight = nn.Parameter(torch.ones(ndim))' / 'self.bias = nn.Parameter(torch.zeros(ndim)) if bias else None' / 'return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)'. This is how the toy input is normalized.
- model.py:116: 'bias: bool = True # True: bias in Linears and LayerNorms, like GPT-2. False: a bit better and faster' (GPTConfig's own default).
- model.py:225: "config_args['bias'] = True # always True for GPT model checkpoints".
- train.py:56: 'bias = False # do we use bias inside LayerNorm and Linear layers?'. train.py:147-148: 'model_args = dict(n_layer=n_layer, n_head=n_head, n_embd=n_embd, block_size=block_size,' / '                  bias=bias, vocab_size=None, dropout=dropout)'.
- config/train_shakespeare_char.py:22-25: 'n_layer = 6' / 'n_head = 6' / 'n_embd = 384' / 'dropout = 0.2'. The whole file, lines 1-38, was re-read: it sets no bias, so train.py's False stands.
- model.py:164: 'torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)'. Real weights start small and are learned; the toy weights are hand-picked.
- sample.py:51: 'model.eval()'; train.py:218: 'model.eval()'; train.py:227: 'model.train()'. Dropout applies only in training.
- doc (re-quote at build, as c05 does): torch.nn.GELU, 'Applies the Gaussian Error Linear Units function', GELU(x) = x·Φ(x), approximate default 'none'. torch.nn.Linear: y = xAᵀ + b; bias=False gives no additive bias; weight is (out_features, in_features).
- paper (optional; verify at build): Hendrycks & Gimpel, Gaussian Error Linear Units (GELUs), arXiv:1606.08415.
- Numeric facts, re-checked by the judge in Python: the minimum of GELU is −0.16997, at h = −0.7518; h/2 < GELU(h) < h for h > 0; GELU(−2.85) ≈ −0.006, which prints '−0.01'; GELU(−0.76) = −0.16996, stored as −0.1700.
- repo (not NanoGPT):
- c02-block-anatomy.js:83, :90-92 (ln_2(x + a), m, x + a + m)
- c05-position-mixing.js plan (:124-150)
- c07 WORD_TOKENS
- c04-block-stack.js:168 (C4 = scale(Cv, 4))
- the c10 and c12 reveal patterns
- board.js cardBlock (the sequence header) and board.test.mjs (the c05 assertion)
- scene-layout.js MAX_SCENE_VIEWPORT
- card-gates.mjs

**risks**

1. **GELU is not a gate.** Never write 'pass', 'zeroes', 'turns off' or 'ReLU'. Positive numbers are shrunk too, by Φ(h). Say 'stay positive' and 'are squeezed, ending between −0.17 and 0'. Cells that print −0.17 have true values above −0.17, so keep the rule worded 'between −0.17 and 0', and test on unrounded values.
2. **Notation.** Keep c02's names: input ln_2(x + a), output m, stream x + a + m. Never call the MLP input x, and never call its GELU output g on the card (g is the gradient on c19 and c20).
3. **The bias premise** holds for shakespeare_char (train.py bias = False), not for GPTConfig's default or GPT-2 checkpoints. The prompt and the feedback say so.
4. **Toy artifacts.** Keep W_proj's zero-sum rows and the sign-variety tests. Never call the toy weights learned values.
5. **State clarity.** The reveal adds What-if rows and never replaces B's rows, and it is tied to position 0. Screenshot the revealed state.
6. **Logical honesty.** The rules show that nothing makes the flipped output −m or m, not that it cannot be. The feedback says so, then shows the numbers.
7. **c05 header.** Recording the sequence changes c05's visible header, so c05 is in the visual review deploy, and board.test.mjs's c05 assertion is updated.
8. **The repeated 'e'.** 'Before' has two e's. No caption may suggest that the same character gives the same MLP input.
9. **Pixels.** Check the 16 cells at 46 units, the funnel lines against the labels, and the What-if pair, in all four reviewStates, from a clean browser.
10. **Rounding.** Tests compare canonical values, not printed strings.

## c26 · The training objective: per-position targets, their mean, perplexity

**concept**

The training objective.

**Targets.** Every position of a window is a prediction whose target is the next character: y is the input x shifted by one, from get_batch's two slices. A window of T characters therefore gives T scored predictions, from T + 1 characters.

**The loss is one number.** NanoGPT's loss is the equal-weight mean of −ln p(target) over every scored position:
- F.cross_entropy runs over the flattened (B·T, V) logits with PyTorch's default mean;
- ignore_index = −1 skips nothing, because get_batch never emits −1;
- each position counts 1/N, with N = B·T = 16,384 per shakespeare_char step.

**Perplexity** = e^loss is the same number read another way: the size of a uniform guess that would score the same loss. A uniform guess over 65 characters has perplexity 65 and loss ln 65 = 4.17. NanoGPT logs the loss, never e^loss; perplexity appears only as a README todo.

**one_sentence_objective**

After this card, the learner should understand that NanoGPT's training objective is the plain mean of −ln p(next character) over every position it scores, each counting 1/N of it (N = B·T per step), a number perplexity only re-reads as e^mean.

**prerequisites**

- c16-cross-entropy: the loss at ONE position is −ln p(target), which reads the probability on the true next character, not the top choice. Taken as given; c26 draws no logits, no softmax and no top-choice mark.
- c11-causal-mask: position i is trained to predict character i + 1 (row labels '0 · B → e'), and c11 defers the objective to c16 and c26. c26 draws where those targets come from: the same text shifted by one.
- Named, not taught: an average; e^x undoes ln x (e^(ln 65) = 65).

**causal_steps**

Staged: one pipeline, top to bottom, replayed in this order.

1. **Targets.** One stream of 9 characters: B e f o r e sp w e.
   - Bracket x covers characters 0 to T − 1, what the positions read.
   - Bracket y covers characters 1 to T, the same text shifted by one: each position's target.
   - Both brackets follow T.
   - Captions: 'y is x shifted by one: position i's target is character i + 1.' / 'A window of T characters gives T scored predictions (sp = space).'
2. **Score each position.** One 2 × 8 grid with rows 'p (%)' and '−ln p' and columns B→e … w→e; columns past T are blank.
   - p comes from the recorded toy bigram run at its last checkpoint, iteration 1000.
   - −ln p is precomputed, because the evaluator has no log.
   - p %: 39.78, 1.86, 21.15, 13.23, 20.85, 24.65, 7.24, 27.44
   - −ln p: 0.92, 3.99, 1.55, 2.02, 1.57, 1.40, 2.63, 1.29
3. **Average.** One −ln p bar per scored column, on the grid's pitch, with a horizontal mean line.
   - Readout: 'Objective = (sum of the T losses) ÷ T = 15.371 ÷ 8 = 1.921 · each position counts 1/8'.
   - Share line: 'e→f, the least expected (p = 1.86%), adds its 3.986 ÷ 8 = 0.498'.
4. **Read it as perplexity.** 'Perplexity = e^1.921 = 6.83: as unsure as a uniform pick among 6.83 characters.'
   - Anchor: a grey line on the bars at 4.17, with the line 'Uniform guess over all 65 characters: perplexity 65, loss ln 65 = 4.17 at every position.' The judge changed this from 'perplexity e^4.17 = 65', because e^4.17 = 64.7.
   - Footer (annotation): 'NanoGPT averages B · T = 64 · 256 = 16,384 positions per step and logs that mean as its loss, not e^loss.'

**primary_interaction**

**Question** (heading, y 30): 'How do a window's per-position losses become the one number training minimizes?'

**The control.** One control in INTERACT, `window`:
- an index slider labelled 'What-if: window length T (preset)'
- over windowLabels ['T = 1' … 'T = 8'], default 7 (T = 8, the drawn window)
- Reset included
- NanoGPT's own window is 256.

This is the inventory's 'position' control, read as 'the window ends at position T − 1'. The draft's 'predicted perfectly' picker is dropped because it contradicts the bigram: e→f and e→sp come from one softmax row.

**What moving T changes:**
- the x and y brackets (derived end points);
- the grid: cells past T go blank;
- the bars: bars past T disappear;
- the sum, the mean and '1/T';
- e→f's share. At T = 1 it becomes 'e→f lies past a 1-position window';
- the mean line;
- perplexity;
- the state caption: 'T = {{Tn}}: {{Tn}} scored positions, each counting 1/{{Tn}}.' / 'The drawn losses stay the same: T only sets how many are averaged.'

That last line is true for any causal model with the window's start fixed: the first T predictions never read later characters.

**Values** (re-computed by the judge; the critic ran them through buildPool):

| T | sum | mean | e→f share | perplexity |
|---|---|---|---|---|
| 1 | 0.922 | 0.922 | none | 2.51 |
| 2 | 4.908 | 2.454 | 1.993 | 11.63 |
| 3 | 6.462 | 2.154 | 1.329 | 8.62 |
| 4 | 8.484 | 2.121 | 0.997 | 8.34 |
| 5 | 10.052 | 2.010 | 0.797 | 7.46 |
| 6 | 11.452 | 1.909 | 0.664 | 6.75 |
| 7 | 14.078 | 2.011 | 0.569 | 7.47 |
| 8 | 15.371 | 1.921 | 0.498 | 6.83 |

**What it reveals:**
- every scored position counts 1/T, with no per-position weights;
- one surprise's pull shrinks as 1/T, from 1.993 at T = 2 to 0.498 at T = 8;
- the mean moves only because different positions are averaged; no drawn loss changes;
- perplexity moves only with the mean.

At the default T = 8 the whole pipeline, the 1/8 weights and the share are visible, about 750 units tall with no scrolling, in a scene 960 wide.

**reviewStates:** [{window: 7}, {window: 1}, {window: 0}, {window: 4}].

**check/practice**

**Practice, commit before you see.**
- id: 'c26-practice'
- check: choice_equals
- answer type: choice
- fixedInputs: {window: 7}, so T = 8 is locked, with a generated setup line

**Prompt:** 'NanoGPT's shakespeare_char windows are block_size = 256 characters long; the card draws at most 8. Take one such window as a batch of one. Suppose 255 of its positions each score −ln p = 1.00 and one surprising position scores 9.00. What is this window's loss, the mean NanoGPT minimizes?'

**Options** (bare numbers):

| id | option |
|---|---|
| max (declared default; never renders, the c04 ponytail note) | '9.00' |
| kinds | '5.00' |
| sum | '264.00' |
| none | '1.00' |
| mean (expected) | '1.03' |

**Reasoning required:** the objective is the equal-weight mean over all N = 256 positions: (255 × 1.00 + 9.00) ÷ 256 = 1.03125. The surprise lifts it only (9.00 − 1.00) ÷ 256 = 0.03 above 1.00.

**feedbackPass:** 'Right: (255 × 1.00 + 9.00) ÷ 256 = 264 ÷ 256 = 1.03. Every position counts 1/256, so the one surprise lifts the mean only (9.00 − 1.00) ÷ 256 = 0.03 above 1.00. On the card the same 1/T rule shrinks e→f's share from 3.986 ÷ 2 = 1.993 at T = 2 to 3.986 ÷ 8 = 0.498 at T = 8: the longer the window, the less one position moves the objective.'

**feedbackFail:** 'Not quite. NanoGPT's loss is the mean of −ln p over every scored position, each counting 1/256 here: (255 × 1.00 + 9.00) ÷ 256 = 1.03. 9.00 lets the worst position decide; 5.00 averages the two kinds of position without counting them; 264.00 is the sum, not the mean; 1.00 ignores the surprise, which still adds (9.00 − 1.00) ÷ 256 = 0.03. On the card: e→f adds 3.986 ÷ T.'

Every number is built in the module from the prompt constants and fx.architecture.block_size, and tested.

There is no drawn reveal, so no hidden input. Ponytail: add a gated reveal row only if review asks for one.

**undrawn case**

A T = 256 window (shakespeare_char's block_size, a Source value) in which 255 positions score 1.00 and one scores 9.00.

**Not on the card.** It draws only T = 1..8, with recorded losses, and 1.00, 9.00, 256 and 1.03 appear nowhere on it:
- no cell reads 1.00;
- its means run from 0.922 to 2.454;
- its shares run from 0.498 to 1.993;
- its perplexities run from 2.51 to 11.63.

**Why it needs the rule.** The card shows the rule (mean = sum ÷ T, each position counting 1/T, a surprise's share = loss ÷ T) only for T ≤ 8. The practice needs it at T = 256, for the whole mean, not a share.

**boundary_decision**

staged

**boundary_reason**

**One causal pipeline, in data order:** stream → the (x, y) shift → p(target) per position → −ln p → mean over the T scored positions → e^mean. It is revealed in four stages, and the one control reaches every stage, the shift brackets included.

**Perplexity is not a second model here.** It has no input, mechanism, control or practice of its own, and it moves only when the mean moves. It is one readout line plus the 65 anchor that makes it readable. §4 of the board plan puts it on this card.

Collection candidates, noted and not built:
- log base and bits per character;
- why char-level and BPE perplexities cannot be compared;
- eval perplexity (the README todo).

**Rubric:**
- **11 holds weakly.** Without the perplexity stage a lesson remains; that is one signal, below the two needed.
- **1** would hold only if perplexity were taught as its own objective, and the objective keeps it subordinate ('only re-reads').
- **5 does not hold.** The slider moves every stage.
- **3 does not hold.** One top-to-bottom region.
- **4, 6 and 9 do not hold.** One control, one practice, about 750 units tall.

**Versus c16:** c16 owns −ln p at ONE position; its footer only names the mean.

**Versus Training · Guided phase 1 (another board):** Guided owns −ln p on a curve and a mean over a checkpoint slider. c26 has no time axis and adds the shift, the 1/T weight and its dilution, B·T, and perplexity.

**Expected boundaryFlags: none.**
- The title's own part has no 'and'.
- The objective has no ';' and no ', and'.
- There is one visible control, and the height is under 900.
- No 'separately' appears.

plan.boundary.reviewed = {}.

**sequence**

'One training step', position 1 of 2: c26-training-objective → c19-gradient-step.

**Plan:**
```
boundary = {decision: 'staged', reason, reviewed: {}, sequence: {name: 'One training step', position: 1, of: 2, relationships: [
  {type: 'prerequisite', card: 'c16-cross-entropy', direction: 'in'},
  {type: 'prerequisite', card: 'c11-causal-mask', direction: 'in'},
  {type: 'deepens', card: 'c01-forward-pass', direction: 'in'},
  {type: 'prerequisite', card: 'c19-gradient-step', direction: 'out'},
  {type: 'prerequisite', card: 'c18-train-val', direction: 'out'}]}}
```
The header reads 'One training step · 1 of 2'.

**Frozen cards.** c16, c18 and c01 are batch-1 cards with no plan export. They are linked typed from c26 only, never as members, as c11 links c13-multi-head.

**Why this sequence.** The judge decided it, overriding the critic's 'none'. c26 and c19 are both new, sit next to each other in batch 4, and form a real path in causal order: c26 is the number one step lowers, c19 is how one step lowers a loss. The critic's rejected alternative (c16 → c26 → c18) would need frozen cards to gain plan exports.

**Board:** second card of batch 4, after c14 and directly before c19.

**relationships**

- prerequisite <- c16-cross-entropy (direction 'in'): −ln p(target) at one position. c16's footer names the mean c26 draws, and c16's ln 65 = 4.17 is the loss behind c26's perplexity-65 anchor.
- prerequisite <- c11-causal-mask (direction 'in'): position i predicts character i + 1, the same 'B → e' pairs from the same line. c26 draws the two slices those targets come from.
- deepens <- c01-forward-pass (direction 'in'): the training call site, where targets are given, lm_head runs over every position and a loss comes out. c26 says what that loss is.
- prerequisite -> c19-gradient-step (direction 'out', in the sequence 'One training step'): c19's step lowers 'a loss'; c26 says which number that is in NanoGPT, the per-step mean over B·T positions.
- prerequisite -> c18-train-val (direction 'out'): each point on c18's curves is this mean over a whole slice of the same recorded run (2.161 train at iteration 1000); validation loss is the same mean on held-out text.
- Depth-ladder board, tutor note only (another board): alternative_explanation <-> Training and loss · Guided phase 1, 'What is training minimizing?'. It has six 'Citizen' positions, a p (%) / −ln p table, 'mean of these 6 losses' and a checkpoint slider.
- Depth-ladder board, tutor note only: deepens -> Training and loss · Deep dive 2/3 (N = B·T, view(−1, V), micro-steps). c26's footer names only B · T.

**data_plan**

**Source values:**
- The stream is fx.tokenizer.tokenizers[0].tokens.slice(0, 9) = B e f o r e ␣ w e, displayed with ␣ → 'sp' as in c11. It sits at character 15 of the toy run's 1,200-character training slice, 'First Citizen:\nBefore we…'. The judge re-verified this by running recorded_run.
- V = fx.architecture.vocab_size = 65; ln 65 = fx.crossEntropy.uniform65 = 4.1744; B = 64; T_nano = fx.architecture.block_size = 256.

**Recorded toy run** (the 65 × 65 bigram table, not NanoGPT, iteration 1000):
- p(target) = softmax(W[x_i])[y_i], to 6 decimals: [0.397769, 0.018573, 0.211479, 0.132347, 0.208491, 0.246526, 0.072372, 0.274424]. The judge re-computed these through gen_training_loss.recorded_run.
- p(f|e) and p(sp|e) both come from row 'e'.
- gen_training_loss.py recorded() gains recorded.objective = {text: 'Before we', at: 15, iteration: 1000, pairs, p, loss, pplByT}. It asserts that the window is inside the training slice, and --check keeps passing.

**Calculated toy example** (the generator, float64):
- loss = −ln p, to 4 decimals: [0.9219, 3.9860, 1.5536, 2.0223, 1.5679, 1.4003, 2.6259, 1.2931].
- pplByT = exp(m_T).toFixed(2), with m_T = r3(r3(sum of the first T losses) / T), the mean exactly as the card prints it: ['2.51', '11.63', '8.62', '8.34', '7.46', '6.75', '7.47', '6.83']. The judge verified e^2.454 = 11.6348.

**Structural, generated in the module, never typed:**
- windowLabels;
- tableByT: 8 flat rows of 16 raw values (p × 100 then loss), null past T, picked raw so no cell rounds twice;
- barsByT: 8 × 8 losses, null past T; lossZeroByT: 8 × 8 losses, 0 past T;
- lossAll; invT = [1, 1/2, …, 1/8]; Ts = [1..8];
- the bracket end-x lists by T;
- shareOpacity = [0, 1 × 7]; outsideOpacity = [1, 0 × 7];
- barBase = [BAR_BASE]; Bv = [64]; Tv = [256];
- pixel constants: CELL 60, COL_X 170, bars at y about 390 with h 150 and a peak of 4.5; the anchor's y comes from uniform65.

**Live calculation.** One derive op per name; derive ops cannot nest, so each step below is its own entry:
- lossZero = pick(lossZeroByT, window); lossSum = sum(lossZero)
- invNow = pick(invT, window); Tn = pick(Ts, window)
- sumV = concat(lossSum); meanV = scale(sumV, invNow); mean = pick(meanV, 0)
- meanPx = scale(meanV, −PX_PER_NAT); meanYv = add(meanPx, barBase); meanY = pick(meanYv, 0)
- fV = concat(lossAll.1); shareV = scale(fV, invNow); share = pick(shareV, 0)
- table, bars, bracket ends, perplexity and opacities by pick
- BT = dot(Bv, Tv) = 16,384

**What-if:** window lengths T = 1..8 (NanoGPT's is 256).

**Status lines** (annotation, each under 100 characters):
- 'Recorded toy run (a bigram model, not NanoGPT; it reads only the previous character): p'
- 'Calculated toy example: −ln p, e^mean · Live calculation: sum, mean, share, B · T'
- 'What-if: window length T (NanoGPT's is 256) · Source value: text, 65, B, T'

**Oracles pinned in the test:**
- the table above, at every T;
- r3(lossSum / T) = mean;
- exp(mean).toFixed(2) = pplByT[T];
- −ln(shown p) is within 0.01 of the shown −ln p (e→f: 3.98 against 3.99; the legend reads 'each cell rounded on its own');
- B·T = 16,384;
- the practice's 1.03125 → '1.03';
- the anchor text contains no 'e^4.17'.

**capability_notes**

No new capability and no renderer primitive.

**In use:**
- an index slider;
- the derive ops pick, sum, concat, scale, add and dot;
- one 2 × 8 grid with rowLabels ['p (%)', '−ln p'] and columnLabels = pairs, whose null values draw blank (as in c11), with no heat;
- bars with a fixed peak of 4.5, where null draws no bar;
- lines with derived x end points (the brackets) and a derived y (the mean line, c16's pattern);
- derived opacity only on the share line and the outside line, which carry no timeline appear;
- {{}} interpolation;
- a choice practice with fixedInputs.

**Constraints checked:**
1. concat rounds vector args with `round` regardless of fit, so no cell value passes through concat.
2. Pool results round to 3 decimals, so the mean is scale(printed sum, 1/T) and 'sum ÷ T = mean' holds as printed.
3. Literal arrays are not legal derive args (lookupPath would throw), so barBase lives in exampleData.
4. {{mean}} prints 2.01 at T = 5. Accept it, or pick generator-formatted 3-decimal strings asserted equal to the live mean (the Guided precedent).
5. textOverflow at x = 40: annotation under about 115 characters, body under about 100.
6. A bar value of 0 draws 1 px, so bars past T use null.

**Budget:** about 34 of 60 objects in one frame of 960 × about 750, with no pager.

**Gates:**
- assertCardGates at all 8 window states and the practice state;
- assertSources;
- assertCardPlan, expecting no flags;
- pinnedFile line checks for every code source.

**overlap_check**

**c16** (batch 1). It covers one position: logits → softmax → −ln p(target), plus the lines 'NanoGPT scale: a uniform guess over its 65 characters scores ln 65 = 4.17.' and 'NanoGPT's training loss is the mean of this −ln p(target) over every position in the batch.' It has no targets row, no multi-position table, no mean and no perplexity. c26 has no logits and no top-choice mark, and states the 65 anchor from the perplexity side.

**c11.** Its targets appear as row labels, and its plan defers the objective. c26 draws the shift as two slices that grow with T, and no mask.

**c01.** Its training call site computes a loss, with no numbers.

**c18.** Whole-slice train and validation means over time. c26 has one window at one checkpoint and no time axis.

**c19, in the same sequence.** A toy quadratic step with no cross-entropy. c26 has no gradient and no step.

**c14, c02, c05, c15, c17 and c20:** nothing on the objective.

**Depth ladder, Training · Guided** (another board): the same recorded run and default checkpoint, a p (%) / −ln p table for 'Citizen' and 'mean of these 6 losses'. It overlaps stages 2-3; the overlap is disclosed.

**Depth ladder, Deep dive 2/3:** N = B·T. c26 names B·T only as a count.

**What only c26 adds:**
- (a) the targets as the same text shifted by one, with brackets that grow with T;
- (b) the weight 1/T, and a surprise's share shrinking as 1/T;
- (c) NanoGPT's B·T scope as one logged number;
- (d) perplexity. No card on either board mentions it.

**Kept off the card:** the shape of −ln p and the top-choice story (c16); train against validation (c18); flatten, micro-steps and eval cadence (the Deep dive); gradients (c19); any claim that a longer context lowers the loss.

**source citations (pinned 3adf61e)**

- train.py:119-125 (pinned 3adf61e; the judge re-read it through pinnedFile): "if split == 'train':" / "data = np.memmap(os.path.join(data_dir, 'train.bin'), dtype=np.uint16, mode='r')" … "ix = torch.randint(len(data) - block_size, (batch_size,))" / "x = torch.stack([torch.from_numpy((data[i:i+block_size]).astype(np.int64)) for i in ix])" / "y = torch.stack([torch.from_numpy((data[i+1:i+1+block_size]).astype(np.int64)) for i in ix])". y is x shifted by one, read from a uint16 memmap, so it is never −1.
- model.py:184-187: "if targets is not None:" / "# if we are given some desired targets also calculate the loss" / "logits = self.lm_head(x)" / "loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)".
- model.py:188-191: "# inference-time mini-optimization: only forward the lm_head on the very last position" … "loss = None". Context only; c01 owns it.
- train.py:300-301: "logits, loss = model(X, Y)" / "loss = loss / gradient_accumulation_steps # scale the loss to account for gradient accumulation".
- train.py:216-228, estimate_loss: "losses = torch.zeros(eval_iters)" … "losses[k] = loss.item()" / "out[split] = losses.mean()".
- train.py:263-265: "if iter_num % eval_interval == 0 and master_process:" / "losses = estimate_loss()" / "print(f\"step {iter_num}: train loss {losses['train']:.4f}, val loss {losses['val']:.4f}\")".
- train.py:320-327: "lossf = loss.item() * gradient_accumulation_steps" … "print(f\"iter {iter_num}: loss {lossf:.4f}, time {dt*1000:.2f}ms, mfu {running_mfu*100:.2f}%\")". The loss is logged, not e^loss.
- README.md:211, 214: "## todos" … "- Eval zero-shot perplexities on standard evals (e.g. LAMBADA? HELM? etc.)". The critic grepped every pinned file for perplex and exp and found only this line. bench.py and the eval configs are not pinned, so the card claims only 'logs that mean as its loss, not e^loss'.
- README.md:51: "… the best validation loss is 1.4697." A sources note only, off the card: e^1.4697 = 4.35.
- config/train_shakespeare_char.py:17-19: "gradient_accumulation_steps = 1" / "batch_size = 64" / "block_size = 256 # context of up to 256 previous characters". These give B·T = 16,384 and T = 256 for the practice.
- data/shakespeare_char/prepare.py:24-25: "chars = sorted(list(set(data)))" / "vocab_size = len(chars)" (65). :38-40: "n = len(data)" / "train_data = data[:int(n*0.9)]" / "val_data = data[int(n*0.9):]" ('Before we' lies in the training split).
- doc (not pinned; fetch and quote at build): PyTorch torch.nn.functional.cross_entropy, reduction='mean' by default, averaged over targets that are not ignore_index.
- repo (not NanoGPT):
- depth/fixtures/gen_training_loss.py recorded_run (the tap on base.toy_run's W) and recorded()
- fixtures/generate_fixtures.py toy_run and cross_entropy() (uniform65)
- c16-cross-entropy.js:162, :164 (the uniform65 and average notes)
- scene-derive.js: concat (rounds vector args), scale, sum, pick, resolveOneDerivation (arg handling)
- scene-format.js formatCell
- card-gates.mjs textOverflow
- dataset: tinyshakespeare input.txt (sha256 86c4e6aa…). 'Before we' is at character 15 of the toy run's 1,200-character training slice; the judge re-computed the p values at iteration 1000 in the scratchpad.

**risks**

1. **Guided overlap.** Stages 2-3 are close to Guided phase 1: the same run and checkpoint, and a neighbouring word. c26's distinct parts are the T-driven shift, the 1/T dilution, B·T and perplexity. If review still finds it too close, drop the p (%) row and keep −ln p.
2. **Perplexity boundary.** One readout plus the 65 anchor. No bits, no base 2, no char-level against BPE.
3. **Window what-if wording.** Never imply that a longer window lowers the loss. The card claims only the averaging, and the caption says the drawn losses stay the same.
4. **Honesty.** The loss is in nats, so perplexity is e^, not 2^. The claim is scoped to 'logs that mean as its loss, not e^loss'. The anchor never says e^4.17 = 65, because e^4.17 = 64.7.
5. **Rounding.** Perplexity is e^ of the printed mean, and the mean comes from the printed sum. The e→f cell shows 3.99 while −ln(1.86%) = 3.98; the legend and a 0.01 test bound cover it. {{mean}} reads 2.01 at T = 5.
6. **Bigram artefact.** Both 'e' contexts share one distribution. No caption may imply context beyond the previous character.
7. **Pixels.**
   - The bracket end points must not touch the column labels.
   - At T = 2 the mean line (2.454) sits near the anchor (4.17); check which side the label is on.
   - Screenshot all four review states from a clean browser.
8. **Replay.** The two derived-opacity share lines carry no appear, so they are visible at t = 0; say so in review.
9. **Sequence header.** 'One training step · 1 of 2' is new UI on this card; it is part of the visual review.

## c19 · One gradient step on a quadratic (prerequisite)

**concept**

One plain gradient step on one weight.

**The step.** The gradient g is the slope of the loss at the current w, and the step −lr × g points downhill, opposite to g.

**What decides where it lands.** On a bowl L(w) = ½·c·(w − w*)², the slope grows by c per unit of distance: g = c·(w − w*). After one step, (w − w*) is multiplied by (1 − lr·c), so the product lr × c decides where the step lands. It can:
- stop short;
- land on the minimum;
- overshoot, with a lower loss;
- bounce back to the same loss;
- climb out.

**Where it sits.** This card is the prerequisite of the optimizer card: c20's SGD baseline is this same rule, Δθ = −lr × g. NanoGPT itself steps with AdamW, and get_lr sets its lr every iteration (decay_lr, on by default).

**one_sentence_objective**

After this card, the learner should understand that one gradient step moves the weight by −lr × g, so on a bowl whose slope grows by c per unit of distance the product lr × c decides whether the step stops short, lands on the minimum, overshoots, bounces back to the same loss or climbs out.

**prerequisites**

- c26-training-objective (the sequence 'One training step', 1 of 2): NanoGPT's loss is one number, the mean −ln p over the B·T positions of a step, that training pushes down. c19 replaces it with a one-weight bowl.
- The slope of a curve at a point. Taught in place: the slope line drawn through the start point is g.
- No calculus needed. The card gives g = c × (w − w*) for its own bowl, and the practice prompt gives the steeper bowl's gradient.

**causal_steps**

Staged. The replay reveals one causal pipeline in order, and each caption appears with its stage.

1. **The bowl** (0–0.6 s; the 12 curve segments appear left to right).
   - Bowl line (y 80): 'This bowl: L = ½·c·(w − w*)², steepness c = 2, minimum w* = 3, so g = c × (w − w*)'.
   - The loss is (w − 3)², and the one weight starts at w = 0, where the loss is 9.
2. **The gradient at the start** (0.8 s). g = c × (0 − 3) = −6, drawn as a slope line through the start dot from (−0.5, 12) to (0.5, 6), with the start readout and the direction line.
3. **The step** (1.2 s). step = −lr × g = 6·lr, drawn as a horizontal arrow in w at the start's loss level, L = 9, with the step readout.
4. **Where it lands** (1.6 s).
   - A drop line runs from the arrow tip to the bowl and ends in the landing dot at w₁ = 6·lr, with loss (6·lr − 3)².
   - The landing readout, the lr × c readout, the outcome caption and the three rule lines appear.
   - A landing below the arrow means the loss went down; at the arrow's level, the same; above it, up.

The chain is slope → × lr → step in w → new loss, with one control acting on one quantity.

**primary_interaction**

**Question** (y 30, heading, 66 characters): 'One step of w − lr × g: where does it land, and what decides that?'

**Status line** (y 56, annotation): 'Calculated toy example: one weight, one bowl-shaped loss · Live calculation: curve, step, readouts'.

**The control.** One control in INTERACT:
- input `lrPreset`, type index, presentation 'picker', label 'Learning rate (preset)'
- of: 'lrLabels' = ['lr 0.25', 'lr 0.5', 'lr 0.75', 'lr 1', 'lr 1.1'], generated from LRS
- default index 0 (lr 0.25, which stops short halfway)
- Reset included

**What moves with it:**
- the step arrow's end, the drop line and the landing dot;
- three body readouts in the right column at x 500, each at most 50 characters:
  - y 206, role learner: 'lr {{lr}}: step = −lr × g = {{step.0}}'
  - y 228: 'lands at w = {{w1.0}}: loss {{L1.0}}'
  - y 250: 'lr × c = {{lc.0}}, so w − w* goes {{d0.0}} → {{d1.0}}'
- one outcome caption (y 282, body), picked by preset, with a picked role:
  - 0.25: 'Stops short: halfway to the minimum' (neutral)
  - 0.5: 'Lands exactly on the minimum' (success)
  - 0.75: 'Overshoots the minimum, but the loss drops' (output)
  - 1: 'Bounces: past the minimum, back to the same loss' (warning)
  - 1.1: 'Climbs out: past the minimum, loss up' (warning)

**Values** (exact; re-checked by the judge):

| lr | step | w₁ | L₁ | lr × c | factor |
|---|---|---|---|---|---|
| 0.25 | 1.5 | 1.5 | 2.25 | 0.5 | 0.5 |
| 0.5 | 3 | 3 | 0 | 1 | 0 |
| 0.75 | 4.5 | 4.5 | 2.25 | 1.5 | −0.5 |
| 1 | 6 | 6 | 9 | 2 | −1 |
| 1.1 | 6.6 | 6.6 | 12.96 | 2.2 | −1.2 |

**Relationships the control reveals:**
- The step grows in a straight line with lr, but the landing loss does not: it falls to 0, comes back to the start's 9, then passes it.
- A counterfactual pair: 0.25 and 0.75 both land at loss 2.25, at the same distance on opposite sides of w*.

**Static at every preset** (right column):
- y 150, body: 'start: w = {{w0.0}}, loss {{L0.0}}, gradient g = {{g0.0}}'
- y 172, annotation: 'g < 0, so −lr × g > 0: the step goes right'
- rule lines, annotation, each at most 55 characters:
  - y 318: '(w − w*) after = (1 − lr × c) × (w − w*) before'
  - y 336: 'lr × c below 1: short · 1: lands · 1 to 2: overshoots'
  - y 354: '2: bounces, same loss · above 2: climbs out · any start'

**Layout** (960 × about 620):
- **Plot frame:** x 90, y 150, w 380, h 270; w ∈ [−1, 7], L ∈ [0, 20]. x ticks '0', '3 (w*)', '6'; y ticks '0', '10', '20'. Titles 'w (the one weight)' and 'loss L(w)'.
- **Reveal slot:** x 40, y 492 and 510.
- **Legend** (y 540, annotation, 111 characters; the judge shortened it from 119, which overflowed): 'slope line: g at start · arrow: step in w · drop line: to the new loss (down = lower, level = same, up = higher)'.
- **Footers** (annotation, x 40; the judge rewrote the critic's 122- and 135-character footers, which would fail textOverflow, whose limit is about 116):
  - y 574: 'NanoGPT's loss depends on millions of weights, not one, and each weight gets its own g from one backward pass.'
  - y 592: 'Its lr is set every iteration, and its step is AdamW, which builds on this plain step.'

The consequence is visible at the default state without scrolling.

**reviewStates:** [{lrPreset: 0, steepRevealed: false}, {lrPreset: 1, steepRevealed: false}, {lrPreset: 2, steepRevealed: false}, {lrPreset: 3, steepRevealed: false}, {lrPreset: 4, steepRevealed: false}, {lrPreset: 0, steepRevealed: true}, {lrPreset: 1, steepRevealed: true}].

**check/practice**

**Practice, commit before you see.**
- check: choice_equals
- id: 'c19-practice', version 1
- no fixedInputs: the question is about another bowl, so the lr control does not bear on it (the c05 precedent)
- revealInput 'steepRevealed': {name: 'steepRevealed', type: 'bool', label: 'Steeper bowl revealed', hidden: true, default: false}

**Prompt:** 'Not drawn: a bowl twice as steep, L(w) = 2(w − 3)², whose gradient is g = 4 × (w − 3). From the same start, w = 0, which learning rate lands exactly on its minimum in one step?'

**Answer:** a choice labelled 'Learning rate'. The options are bare values, so no option echoes a caption. The default is 'half', which never renders.

| id | option |
|---|---|
| eighth | '0.125' |
| quarter (expected) | '0.25' |
| half | '0.5' |
| one | '1' |

**Reasoning required:**
- Twice as steep means c = 4, so g = 4 × (0 − 3) = −12, not −6.
- The step −lr × g must still be +3 to reach w* = 3, so lr = 3 ÷ 12 = 0.25. In the card's rule, lr × c = 0.25 × 4 = 1.

**Traps** (re-checked):

| lr | on the steeper bowl | who picks it |
|---|---|---|
| 0.5 | lr × c = 2: it steps 6 to w = 6, loss 18 = the start's (a bounce) | the picture-reader, who takes this bowl's landing lr |
| 1 | it steps 12 to w = 12, loss 162 | 'a steeper bowl needs a bigger push' |
| 0.125 | it steps 1.5 to w = 1.5, loss 4.5: halfway | over-correcting |

**feedbackPass:** 'Right: 0.25. Twice as steep means twice the gradient at every w: at the start g = -12, not -6. The step still has to be +3 to reach w* = 3, so lr × 12 = 3 and lr = 0.25; in the card's rule, lr × c = 0.25 × 4 = 1. This bowl's 0.5 would give lr × c = 2 on the steeper one: it steps 6, to w = 6, back at loss 18 on the other side.'

**feedbackFail:** 'Not quite. Twice as steep doubles the gradient at every w: at the start g = 4 × (0 − 3) = -12. A step of −lr × g must still be +3 to land on w* = 3, so lr = 3 ÷ 12 = 0.25 (the card's rule: lr × c = 1 with c = 4). 0.5 lands this card's bowl, but on the steeper one lr × c = 2: it steps 6, to w = 6, the same loss 18 on the other side, a bounce. 1 steps 12, far past (loss 162). 0.125 steps 1.5: halfway. The steeper bowl now appears on the card.'

Every number in both strings is computed in the module from W0, W_STAR and C_STEEP, and tested.

**Before commit** (x 40, y 492, annotation): 'Not drawn: the steeper bowl. Answer the practice below, then it appears here, on the same axes.' Its opacity is choose(steepRevealed, 0, 1).

**After commit** (opacity choose(steepRevealed, 1, 0); none of these objects has a timeline appear):
- the steeper bowl, 8 segments through SWS;
- its start dot at (0, 18);
- its step arrow at loss 18, from w 0 to w 3;
- two captions (x 40, y 492 and 510, annotation):
  - 'Steeper bowl (Calculated toy example): c = 4, so g = {{g0S.0}} at w = {{w0.0}}, twice this bowl's {{g0.0}}'
  - 'lr 0.25: lr × c = 1, it steps 3 and lands on w* = 3 · lr 0.5: lr × c = 2, it steps 6, back to loss 18'

After the reveal at the default lr 0.25, the same lr stops halfway on the drawn bowl and lands on the steeper one.

This supersedes the pre-rule §5 row 19, whose answer, the landing preset, is on screen.

**undrawn case**

A bowl twice as steep, L(w) = 2(w − 3)² with c = 4, reached from the same start, w = 0.

**Nothing on the card draws it before a committed attempt:**
- no preset changes c;
- the steeper curve, its dot, its arrow and its captions are at opacity 0;
- on the drawn bowl, the right answer (lr 0.25, the default preset) visibly stops only halfway.

**Why the picture misleads.** Reading the picture gives 0.5, the drawn bowl's landing lr, and on the steeper bowl that answer bounces. The right answer needs the rule: g doubles with c, so the step at a given lr doubles; equivalently, lr × c = 1 with c = 4.

**Why the rule cannot be misread.** c = 2, w* = 3, |w0 − w*| = 3, |g0| = 6 and L0 = 9 are all different, so 'lr × c' cannot be mistaken for lr × distance, which would also give 0.5.

**boundary_decision**

staged

**boundary_reason**

**One causal pipeline:** slope at the start → × lr → step in w → new loss. The replay shows it in order, and one control acts on one quantity.

**No second model.** The five presets are values of that one quantity, and short, lands, overshoots, bounces and climbs out are the five classes of one factor, 1 − lr × c. The steeper bowl applies the same rule with another c.

**Separable ideas stay elsewhere:**
- the update rules (momentum, Adam, AdamW, weight decay): c20;
- lr across iterations: c17;
- what NanoGPT's loss is: c26, the previous card of this sequence;
- clipping and accumulation: Training · Deep dive.

**Rubric:**
- **3 does not hold.** The reveal draws on the same axes, and only after commit.
- **5 does not hold.** The control moves the arrow, the landing and every stateful readout.
- **6 does not hold.** One practice.
- **11 does not hold.** Without the landing there is no lesson; without the slope the step has no direction.

**Expected boundaryFlags: none.** The critic re-checked card-plan.js on this title and objective, with 1 visible and 1 hidden input and a height of about 620: planProblems [] and boundaryFlags []. plan.boundary.reviewed stays {}.

**sequence**

'One training step', position 2 of 2: c26-training-objective → c19-gradient-step.

**Plan:**
```
boundary = {decision: 'staged', reason, reviewed: {}, sequence: {name: 'One training step', position: 2, of: 2, relationships: [
  {type: 'prerequisite', card: 'c26-training-objective', direction: 'in'},
  {type: 'prerequisite', card: 'c20-optimizer', direction: 'out'},
  {type: 'prerequisite', card: 'c17-lr-schedule', direction: 'out'}]}}
```
The header reads 'One training step · 2 of 2'.

**Frozen cards.** c20 and c17 are batch-1 cards with no plan export. They are linked typed from c19 only (the c11 → c13 precedent) and are not moved: batch 1's order is not reopened, so c19 cannot sit next to c20. The relationship carries the tutor's path c19 → c20.

**Board:** third and last card of batch 4, directly after c26.

**relationships**

- prerequisite <- c26-training-objective (direction 'in', in the sequence 'One training step'): c26 names the number a step lowers, the per-step mean over B·T positions; c19 shows how one step lowers a loss, on a one-weight toy bowl.
- prerequisite -> c20-optimizer (direction 'out'; c20 is frozen and not reopened): c20's EXPLAIN.sgd, 'The baseline: Δθ = −lr × g, the latest gradient.', is this card's step. c20 changes the update rule; c19 changes only the lr.
- prerequisite -> c17-lr-schedule (direction 'out'; frozen): c17 sets the lr value per iteration; c19 shows what one lr value does in one step. c19 makes no claim about why warmup or decay help.
- Depth-ladder board, tutor note only (another board): prerequisite -> Training and loss · Deep dive 3/3. Its conceptual AdamW equation, θ ← θ − η_t(m̂/(√v̂+ε) + λθ) (training-loss/deep.js 'adamw-eq'), builds on this plain step.

**data_plan**

**Calculated toy example.** Module literals, pinned by the card test; no fixture change.

**exampleData:**
- W0: w0 = [0]; W_STAR: wStar = [3];
- cNum 2, cVec [2], halfC 1, one [1];
- LRS = [0.25, 0.5, 0.75, 1, 1.1], with lrs = LRS and lrLabels generated from LRS;
- ws = WS = [−1, 0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7], with wStarN = 13 × [3];
- sws = SWS = [0, 1, 2, 2.5, 3, 3.5, 4, 5, 6], with wStarS = 9 × [3];
- halfCSteep 2, cSteepNum 4, DELTA = [−0.5, 0.5];
- outcomes and outcomeRoles;
- the seriesMapping offset vectors from plot.js.

The samples are non-uniform: dense near w* so the minimum does not kink. Every value is exact at the pool's 3-decimal rounding. Do not use 0.75 spacing: 2 × 2.25² rounds to 10.126.

**Live calculation** (one derive op per name):
- lr = pick(lrs, lrPreset)
- d0 = sub(w0, wStar) = [−3]; g0 = scale(d0, cNum) = [−6]
- d0sq = elementwise(d0, d0); L0 = scale(d0sq, halfC) = [9]
- lrg = scale(g0, lr); w1 = sub(w0, lrg); step = sub(w1, w0)
- d1 = sub(w1, wStar); d1sq = elementwise(d1, d1); L1 = scale(d1sq, halfC)
- lc = scale(cVec, lr); factor = sub(one, lc). The oracle checks d1 = factor × d0 at every preset.
- **Curve:** dc = sub(ws, wStarN); dcsq = elementwise(dc, dc); LC = scale(dcsq, halfC) = [16, 9, 4, 2.25, 1, 0.25, 0, 0.25, 1, 2.25, 4, 9, 16]
- **Slope line:** g0s = pick(g0, 0); w0pair = concat(w0, w0); L0pair = concat(L0, L0); tanW = add(DELTA, w0pair) = [−0.5, 0.5]; dL = scale(DELTA, g0s); tanL = add(dL, L0pair) = [12, 6]
- **Steeper bowl:** ds = sub(sws, wStarS); dssq = elementwise(ds, ds); LS = scale(dssq, halfCSteep) = [18, 8, 2, 0.5, 0, 0.5, 2, 8, 18]; g0S = scale(d0, cSteepNum) = [−12]
- **Pixels:** seriesMapping for the curve (13 points), the slope line (2), start (w0, L0), aEnd (w1, L0), land (w1, L1), the steeper curve (9), steepStart (w0, [18]) and steepEnd ([3], [18]). The judge re-checked: start (137.5, 298.5); at lr 0.25 aEnd (208.75, 298.5) and land (208.75, 389.625); the slope line from (113.75, 258) to (161.25, 339), clear of the landing.
- outcome = pick(outcomes, lrPreset); outcomeRole = pick(outcomeRoles, lrPreset)
- steepOp = choose(steepRevealed, 1, 0); waitOp = choose(steepRevealed, 0, 1)

**Steeper-bowl oracle,** from w = 0:

| lr | w₁ | L |
|---|---|---|
| 0.125 | 1.5 | 4.5 |
| 0.25 | 3 | 0 |
| 0.5 | 6 | 18 |
| 1 | 12 | 162 |

**Source values:** none are displayed. learning_rate 6e-4 and 1e-3 stay in the sources. The footer's 'millions' is backed by c04's 1,770,240 per block × n_layer 6.

**Status words on the card:** 'Calculated toy example' and 'Live calculation'.

**capability_notes**

No new renderer primitive and no new derive op.

**In use:**
- an index picker plus a hidden-bool revealInput;
- pick, sub, scale, elementwise, add, concat and choose;
- plot.js axesObjects({tickMarks: false}) and seriesMapping/seriesObjects, including single-point mappings;
- circles with derived x and y;
- lines with derived endpoints;
- derived opacity with no appear on the reveal objects (c12);
- choice_equals with revealInput.

**Unproven on this board: an arrow with derived from/to.** c12's arrow derives only its label. It works by composition: walk() resolves $derive anywhere in initialState, and the schema validates the numbers. The card test asserts the arrow's endpoints at every preset. Fallback: a derived line, with the legend's word 'arrow' changed.

**Constraints:**
1. Name the input `lrPreset`, because `lr` is a pool name.
2. One-element vectors in text are referenced as {{g0.0}} and so on.
3. Negatives print with an ASCII '-'.
4. The steeper bowl's coordinates are computed ungated; only its opacity is gated.
5. At lr 1 the drop line has zero length. The landing dot covers it, and it cannot be hidden by opacity because it carries an appear. Fallback: drop the lr 1 preset.
6. There is no line-on-line lint. After the reveal, the main arrow at L 9 crosses the steeper curve near w 0.88; inspect it in pixels.
7. Text widths: at x 500, body at most 50 characters and annotation at most 55; at x 40, annotation at most about 116 (the legend is 111, the footers about 110 and 86).

**Budget:** 42 objects before commit plus 13 for the reveal and the wait note, 55 of 60. Fallback if the ceiling binds: a text-only reveal, which saves 10.

**Card test:**
- assertCardGates at all 10 (lrPreset, steepRevealed) combinations;
- assertCardPlan and assertSources;
- the oracles above;
- the caption class against the factor: 0 < f < 1 short, f = 0 lands, −1 < f < 0 overshoots, f = −1 bounces, f < −1 climbs out;
- the object count ≤ 60 at the reveal states;
- pinnedFile checks for every cited NanoGPT line.

**overlap_check**

**c20** (frozen). Its SGD appears only as EXPLAIN.sgd ('The baseline: Δθ = −lr × g, the latest gradient.', 'Step size tracks gradient size…'). Its gradients are 'not from a loss' (toy-note), and its lr is fixed at 0.01. It has no loss curve, no slope, no landing and no variation in lr. The feedback's 'twice the gradient, twice the step' touches c20's 'step size tracks gradient size', which is why c19 is c20's prerequisite, not a duplicate.

**c17:** lr values per iteration, with no step and no loss.

**c18:** loss curves over checkpoints, with no single step.

**c16:** −ln p at one position, with no gradient.

**c26** (the same sequence): the objective's value, with no gradient and no step. c19's footer names c26's number ('NanoGPT's loss depends on millions of weights') without redrawing it.

**c14:** unrelated. The symbol g is kept for the gradient here; c14 writes GELU(h) instead.

**Depth ladder, Training · Deep dive 3/3:** clip_grad_norm and a conceptual AdamW equation, with no plain step on a curve. The critic grepped the cards and depth modules for slope, descent, bowl, quadratic, overshoot and diverge and found nothing of this kind.

**What only c19 adds:**
- the gradient as a slope, with the step going the opposite way;
- where one step lands as lr varies;
- lr × c setting five outcome classes;
- a committed practice on an undrawn steeper bowl.

**Kept off the card:** momentum, Adam, AdamW and weight decay; several parameters; an iteration axis; any NanoGPT lr number.

**source citations (pinned 3adf61e)**

- train.py:305 (pinned 3adf61e; the judge re-read it through pinnedFile): "        scaler.scale(loss).backward()". This backs the footer's 'each weight gets its own g from one backward pass'.
- config/train_shakespeare_char.py:17: "gradient_accumulation_steps = 1", so there is one backward per step. train.py:48: "gradient_accumulation_steps = 5 * 8 # used to simulate larger batch sizes" is the default, and train.py:301 scales the loss by it (a sources note).
- train.py:306-309: "    # clip the gradient" / "    if grad_clip != 0.0:" / "        scaler.unscale_(optimizer)" / "        torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)". Not modelled; a sources note only.
- train.py:311: "    scaler.step(optimizer)" (the step). train.py:314: "    optimizer.zero_grad(set_to_none=True)" (each step's g is used once).
- train.py:199: "optimizer = model.configure_optimizers(weight_decay, learning_rate, (beta1, beta2), device_type)".
- model.py:284: "        optimizer = torch.optim.AdamW(optim_groups, lr=learning_rate, betas=betas, **extra_args)". NanoGPT's step is AdamW.
- train.py:257-260: "    # determine and set the learning rate for this iteration" / "    lr = get_lr(iter_num) if decay_lr else learning_rate" / "    for param_group in optimizer.param_groups:" / "        param_group['lr'] = lr".
- train.py:65: "decay_lr = True # whether to decay the learning rate". config/train_shakespeare_char.py (lines 1-38 re-read) does not override it.
- train.py:58: "learning_rate = 6e-4 # max learning rate" (sources only). config/train_shakespeare_char.py:27: "learning_rate = 1e-3 # with baby networks can afford to go a bit higher" (sources only).
- model.py:184-187: "        if targets is not None:" … "            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)". The loss NanoGPT differentiates is a cross-entropy averaged over the B·T rows, not a bowl.
- repo (not NanoGPT):
- c20-optimizer.js:23 (EXPLAIN.sgd[0]) and :109 (toy-note)
- c12-score-scaling.js: the gated-reveal pattern, and its 'times-m' arrow with constant endpoints
- c10-weighted-values.js:78-81
- c05-position-mixing.js activity (no fixedInputs)
- c04-block-stack.js (1,770,240 per block)
- plot.js
- scene-derive.js DERIVATIONS and walk()
- animation-scene.js:344-348
- scene-style.js text sizes
- card-gates.mjs textOverflow (CHAR_WIDTH_RATIO 0.6)
- card-plan.js
- docs/nanogpt-deep-dive-board-plan.md §3, row '19–20 LR, momentum' (the quadratic step is a prerequisite), and §5, row 19 (the pre-rule practice, now superseded).

**risks**

1. **The toy read as NanoGPT.** The status line and the footers carry the difference. Never call lr 0.5 'the right learning rate', and never put a NanoGPT lr beside the toy lr.
2. **The one-step landing is special to a quadratic.** 'Climbs out' is claimed for one step only, and 'any start' holds for this bowl only.
3. **The correct answer, 0.25, is also the default preset,** where it visibly stops halfway. This is intended: 0.5 is the picture-reader's trap, and both feedback strings explain why it bounces.
4. **The answer sits in a hidden caption before commit** (the c12 precedent). If review objects, gate a numeric readout instead.
5. **Echo of c20** ('twice the gradient, twice the step'). Keep it to the feedback and the reveal.
6. **Pixels.** Inspect from a clean browser, in all 7 reviewStates:
   - the lr 1 bounce: a zero-length drop line and the arrow tip under the landing dot;
   - the landing dot on the x-axis at lr 0.5;
   - the main arrow crossing the steeper curve after the reveal;
   - the steeper bowl's vertex at (3, 0), coinciding with the lr 0.5 landing.
7. **Object ceiling:** 55 of 60.
8. **Text widths.** The legend and footers were shortened by the judge. Keep any later rewording under about 116 characters at x 40 in annotation type.
9. **Mixed minus glyphs.** Numbers print an ASCII '-' next to the '−' in formulas (the c12 and c20 precedent).
10. **Sequence header.** 'One training step · 2 of 2' is new UI; it is part of the visual review.

## Open questions

None: the card-composition rules decided every boundary.
