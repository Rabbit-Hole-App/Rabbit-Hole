# NanoGPT deep-dive board - batch 5 plans (full)

Phase 1 plans for batch 5, by one planner per card, an adversarial critic per plan and a cross-card judge (2026-09-28), the first batch under the locked pipeline (docs/features/learn-card-pipeline.md). Every NanoGPT line cited was re-read at the pinned revision 3adf61e. Summary in docs/nanogpt-deep-dive-board-plan.md section 13; every field here in full for the card authors.

## Batch summary

Batch 5 (cards 22-25), judged across cards. Every NanoGPT line cited below was re-read through pinnedFile at 3adf61e: model.py:170-191 and :305-330, sample.py:13-27, :36-41 and :78-89, train.py:272-287, and config/train_shakespeare_char.py:8-20. I also re-ran the load-bearing data:
- toyRun's lowest validation loss after iteration 0 is at iteration 100 (val 3.0547; bestValIndex 2), so that is the checkpoint the save rule keeps.
- At iteration 100, with sample.py's settings, the toy draws '⏎ → N a k i f o n o (u)' and 'ROMEO: → sp m e l :'.
- c25's four rows at iteration 100 match the critic's table (e: sp 19.90 … other 57 45.65; comma: sp 72.24).
- c23's counting rows over the training split match: or 7676, for 2431, efor 388, Befor 31, with the same per-character counts.

**Decisions:**
1. **One sequence, 'Generation context', path c24 → c25 → c23.** 'Generation' alone over-claims: c21 (frozen) and c22 cover the draw step, so those three cards are not all of generation. The same reasoning led to the rename to 'Training fundamentals'. 'Generation context' is what the three cards share: what each pass is handed (c24), what the prediction depends on (c25), and where that is cut (c23).
2. **c23 joins as 3 of 3 even though its toy model is different, and its status line names the switch.** Batch 3, decision 4 turned down a switch that had no teaching reason, since c10 could use characters. Here the switch is forced: a bigram reads one character and cannot show a crop. c25's closing contrast ('the toy reads one; NanoGPT reads up to 256') is also what motivates a table that reads several characters.
3. **c22 stays standalone.** c21 is frozen with no plan export, and top-k is a branch off the draw step that no path card needs. It sits last in batch 5, after the path that teaches where the draw happens.
4. **c24 and c25 share iteration 100.** That is the checkpoint the save rule keeps: c18 teaches it, and sample.py loads it. Both cards name it on the surface, because c26 (closed) prints the same table at iteration 1000.
5. **One vocabulary across the path.** 'Handed' means the input to the forward. 'Reads' means what the prediction depends on (c25's and c26's word). c24's toy line uses 'reads'.
6. **Every reveal of a practice answer is gated, not only hidden by opacity:** gate for numbers, choose for text and tokens (c14's pattern). This changes c24, which the critic had hidden with opacity only. Its trivial live additions become strings built in the module.
7. **c25's second 256-crop line is trimmed.** c23 owns the crop; c24's objective and c25's stage 2 each name it once, as scope.

Every practice asks about a case the card does not draw:
- c22: an unseen six-value distribution;
- c23: new character 300 at block_size 256;
- c24: the ROMEO: start at pass 5.
c25 is explore-only.

## Sequences

### Generation context: c24-generation-loop → c25-autoregressive-conditioning → c23-context-window

One path through what generate() gives the model:
1. **The loop (c24).** Each pass is handed all of idx, draws one character and appends it (model.py:312-328).
2. **Conditioning (c25).** The prediction is a distribution that depends on what the model reads of that text. The appended draw becomes the next condition.
3. **The crop (c23).** Once the appends push idx past block_size, only the last block_size characters are handed over (model.py:314).

Each card needs the one before:
- c25's 'each draw is appended and becomes the next previous character' is c24's loop;
- c23's practice counts idx at the moment of prediction (start + one draw per pass, c24) and relies on 'the prediction depends on the text before it' (c25).

**Name.** Not 'Generation' or 'Generating text': c21 (frozen) and c22 cover the draw step, so the name would over-claim, as 'One training step' did.

**Model switch.** c23 uses a counting table over k characters, not the recorded bigram. A bigram cannot show a crop, and c23's status line names the switch.

**Typed relationships** (all consistent in both directions):
- c24 → c25: prerequisite;
- c24 → c23: deepens;
- c25 → c23: prerequisite.

**Frozen or earlier cards join by relationship only:** c01, c21, c05 and c09.

## Board order

- c24-generation-loop
- c25-autoregressive-conditioning
- c23-context-window
- c22-top-k

## Inventory changes

The inventory stays at 25 cards and every title is unchanged. The batch-5 array in NANOGPT_LATER_BATCHES is [c24, c25, c23, c22], after batch 4's c19.

- **Row 22** (Top-k): kind, control and data are unchanged (explore + practice | k preset | toy). The k preset runs 1 to 6, with a default of k = 2. The section 5 practice row for card 22 ('With k = 2, which candidates can still be sampled?') is superseded because its answer was drawn. The new practice is proportional renormalisation on an undrawn distribution.
- **Row 23** (Context window): kind changes from explore to explore + practice, the precedent set by c14, c26 and c04. The control, 'window preset', becomes 'What-if: toy block_size (preset)', 2 to 5. The data, 'toy conditional table', is a counting table over the Tiny Shakespeare training split that reads the last k characters, added to gen_generation.py as g.window.
- **Row 24** (The generation loop): kind changes from replay to replay + practice. The only input is a hidden revealInput, so there is still no visible control. Data: recorded draws from the toy bigram at iteration 100, the checkpoint the save rule keeps (c18), added to gen_training_loss.py as recorded.generation.
- **Row 25** (Autoregressive conditioning): kind, control and data are unchanged (explore | previous character | recorded toy bigram conditionals). The data is fixed at iteration 100 and added to gen_training_loss.py as recorded.conditioning.
- **New sequence:** 'Generation context' (c24 → c25 → c23).
- **Collection candidate, noted but not built:** 'Sampling' (c21, c22, and the depth ladder's Generation · Guided and Deep dive).

## Open question, resolved without reopening a closed card

- c26 is closed. It prints the recorded toy bigram at iteration 1000 without naming the checkpoint on the card (e→sp 24.65%). c25 shows the same table at iteration 100, the checkpoint the save rule keeps and sample.py loads, and names it (e→sp 19.90%). Should 'at iteration 1000 (the last checkpoint)' be added to c26's status line, a one-line edit to a closed card? Or does c26 stay as it is, with the difference left to the tutor note?

**Resolution.** c26 stays closed. c24 and c25 name iteration 100 on the card itself (judge decision 4), so a learner who compares c25 with c26 sees which checkpoint each shows. Whether c26 should also name iteration 1000 goes to NC9 (curriculum coherence), which is where cross-card consistency of closed cards is decided.

## c24 · The generation loop

**concept**

The control flow of NanoGPT's generate(). It is a loop of a fixed number of passes, 'for _ in range(max_new_tokens)' (model.py:312). Lines 312-330 contain no break; the only return is at :330.

Each pass does four things:
1. Hands the model idx, all of the text so far. idx_cond is capped at block_size (:313-314); that is the scope only, and c23 owns it.
2. Runs one forward (:316). There is no cache, so the Blocks run over every position again (:180-181). Only the last position is projected (:190) and its logits are kept (:318).
3. Draws one ID (:319-326).
4. Appends that ID to idx (:328).

After max_new_tokens passes, generate() returns idx itself, the start included (:330). sample.py decodes it (:88), and in shakespeare_char one ID is one character (prepare.py:30-35).

**Why it must be a loop.** Each pass's newest input is the previous pass's draw. Training scores all positions in one pass because its text is given (train.py:124-125, :300).

**What the card draws.** The first 8 passes of sample.py's call: start = one newline (sample.py:14, :80-81). The model is the recorded toy bigram at iteration 100, the checkpoint train.py's save rule keeps (c18).

**one_sentence_objective**

After this card, the learner should understand that generate() is a loop of exactly max_new_tokens passes that each hand the model all of idx so far (at most its last block_size characters), take the prediction at its last position, draw one character from it and append it, so idx grows by one per pass and the returned text is the start plus max_new_tokens characters.

**prerequisites**

- c01-forward-pass (frozen; linked by type only). Without targets, forward projects only x[:, [-1], :], giving (B, 1, V). Named in the Builds-on line, not redrawn.
- c21-temperature (frozen). A draw is one weighted random pick (torch.multinomial). c24 shows only the drawn characters, never probabilities.
- c06-tokenizer (frozen). In shakespeare_char, one token ID is one character, and there are 65 of them.
- Named, not taught: the recorded toy bigram run of c18 and c26, a 65 × 65 table.

**causal_steps**

The card is staged: one loop body, which the replay reveals pass by pass. At rest every drawn pass is on screen.

0. **Start.** idx = '⏎', shape (1, 1) (sample.py:14, :80-81).
1. **Hand over idx.** Pass k's row shows all k characters of idx as label tokens. Here idx_cond = idx, because t ≤ 256.
2. **Forward.** The row's last character is bold: its prediction is the one kept (:316-318). The Blocks read the whole row to make it (:180-181, :190).
3. **Draw.** One recorded toy draw, a text object with role output, sits in the next column (:319-326).
4. **Append.** The draw sits directly above the same character, plain, in the next row, so the staircase's diagonal is the text being written (:328).
5. **Repeat.** The loop runs max_new_tokens passes and returns idx, start included (:330).

Rows at iteration 100 (re-computed by the judge):

| pass | handed | draw |
|---|---|---|
| 1 | ⏎ | N |
| 2 | ⏎ N | a |
| 3 | ⏎ N a | k |
| 4 | ⏎ N a k | i |
| 5 | ⏎ N a k i | f |
| 6 | ⏎ N a k i f | o |
| 7 | ⏎ N a k i f o | n |
| 8 | ⏎ N a k i f o n | o |

**Replay,** about 4 s:
- row k and its label appear at 0.4·(k−1) s;
- its draw appears 0.2 s later, so each draw appears before the row that reads it;
- the captions appear from 3.3 s.

**primary_interaction**

**Replay only,** as the inventory specifies. There is no visible control; SceneControls renders no INTERACT row or Reset when no input is visible (SceneControls.jsx:172, :183). The one input is 'revealed' (bool, hidden, default false), the practice's revealInput, as on c14 and c19. The replay carries causal order: each draw appears before the row that reads it.

**Layout** (960 wide, 729 tall).

Header:
- y 30, question (heading): 'What does generate() repeat for each new character?'
- y 56, status (annotation, 113 characters, fits the 116 limit): 'Recorded toy run (a bigram, not NanoGPT; iteration 100, the kept checkpoint): the draws · Source value: the start'
- y 78, builds-on: 'Builds on: generation predicts from the last position only; a draw is a weighted random pick'
- y 106, setup: 'sample.py starts from one new line (⏎). The first 8 passes of generate():'

Staircase:
- rows at y = 128 + 36·(k−1), with a caption 'pass k' at x 40;
- tokens at x 180, tokenStyle 'labels', cellHighlight = k − 1;
- each draw is a role-output text centred on the next column (chip widths from CHIP_PAD 16, CHIP_CHAR 9.5 and CHIP_GAP 8).

Captions, directly under the staircase (5 lines, one every 26 from y 440; they appear at 3.3 s):
- y 440 (output): 'Passes 1 to 8 added 8 characters: idx grew from 1 character to 9.' A module string from the fixture lengths.
- y 466: 'Each pass hands the model all of idx so far, at most its last block_size characters.'
- y 492: 'Its last position's prediction gives a draw, appended and handed to the next pass.' Bold and colour are keyed only in the legend.
- y 518: 'Training scores all positions in one pass: its text is given. Here the newest character is a draw.'
- y 544 (body): 'The loop runs max_new_tokens passes, with no other stop, and returns all of idx, the start included.'

Footer, static, directly under the captions:
- y 576 (legend): '⏎ = new line · sp = space · bold: the position whose prediction is drawn from · colour: the draw'
- y 598 (annotation; appears at 3.3 s with the captions): 'Toy: the bigram reads only the last character it is handed; NanoGPT's Blocks read the whole row.'

Practice band, last, under the toy note (label at 630, row at y 640, line at 688). The label, row, arrow and draw have derived opacity choose(revealed, 1, 0) and no appear. The line keeps a static opacity of 1 with its text choose()d blank, so the static bounds hold the band (everDrawn skips derived opacity) and the reveal never refits the frame. Before a committed attempt nothing of the band reads, the main scene only (owner, 2026-09-29: the 'Not drawn' wait note is removed); its reserved height is trailing space under the toy note, not an empty slot between the captions and the legend (closeout fix: the legend used to sit below the band, which left a 129 px blank inside the card). Its content is also gated:
- label, via choose(revealed, …, ' '): 'Practice case: start ROMEO: (6 characters), pass 5';
- tokens, via choose(revealed, practiceRow, placeholder): R O M E O : sp m e l, last character bold;
- an arrow '→' in the next column, then the draw ':', via choose, one column past it: the draw sits two pitches from the last handed cell, so the handed cells count to 10 before the arrow (the ':' draw otherwise reads as an 11th cell);
- line, via choose: 'handed 10 characters · returns 6 + 500 = 506'. It is built in the module from the fixture.

**reviewStates:** {revealed: false}, {revealed: true}, plus a mid-replay capture at about 1.5 s.

**check_practice**

**Practice (commit before you see).**
- id: 'c24-practice'
- check: choice_equals
- version: 1
- revealInput: 'revealed'
- no fixedInputs

**Prompt:** 'Suppose sample.py starts from ROMEO: (6 characters; in shakespeare_char one token ID is one character) instead of one new line, with max_new_tokens = 500. In one generate() call, how many characters is the model handed on pass 5, and how many characters does generate() return?'

**Options.** They are mutually exclusive, built in the module from 6, 5 and g.sample.max_new_tokens.value. The declared default 'lastOnly' never renders (the c26 ponytail note).

| id | option | belief it catches |
|---|---|---|
| lastOnly | 'handed 1, returns 506' | the model is handed only the last character |
| passNumber | 'handed 5, returns 501' | copies the card's pattern that pass k holds k, and 1 + 500 |
| newOnly | 'handed 10, returns 500' | the start is not returned |
| full (expected) | 'handed 10, returns 506' | correct |

**Reasoning required:**
1. idx = start + one draw per pass, so pass 5 hands 6 + 4 = 10.
2. The whole of idx is handed over; only the prediction is taken at the last position.
3. There are exactly 500 passes and idx itself is returned: 6 + 500 = 506.

**Answer label:** 'Characters', one word, so the four options sit on one row at the review width and no option stands alone.

Each feedback is at most two lines under the chips.

**feedbackPass:** 'Right. idx is the start plus one draw per earlier pass: pass 5 is handed 6 + 4 = 10 characters, all read by NanoGPT's Blocks. generate() returns the start plus max_new_tokens: 6 + 500 = 506. Only a 1-character start makes pass k hold k.' (Review fix: the 269-character version filled its first line to 912 of 924 px; this one leaves slack.)

**feedbackFail** has one clause per distractor: 'Not quite. Pass 5 is handed all of idx, start + (k − 1) = 6 + 4 = 10 characters: only the last position's prediction is kept (the toy bigram reads only the last), and pass k holds k only for a 1-character start. generate() returns idx, which still holds the start: 6 + 500 = 506.'
- lastOnly: all of idx is handed; only the last position's prediction is kept, and only the toy bigram reads just the last.
- passNumber: pass k holds k only for a 1-character start; it holds start + (k − 1).
- newOnly: generate() returns idx, which still holds the start.

**Reveal:** the gated practice band (label, the 10-character row, an arrow, the draw ':', and the 10 / 506 line). It adds a case and never extends the main staircase.

**undrawn_case**

A start longer than one character: 'ROMEO:' (6 characters; it begins 163 lines of the pinned tinyshakespeare), at pass 5 of max_new_tokens = 500.

**Before Check:**
- The card draws only the 1-character '⏎' start, which makes 'pass k holds k' look like the rule.
- The practice band's text and tokens are choose()d to blanks (at opacity 0; the line at opacity 1, blank), and no placeholder line holds its slot.
- 'ROMEO', '506', a 10-chip row and any count above 9 appear nowhere. A test asserts this for every visible default-state label, and for the evaluated values of the band objects.

**Why it needs the rule.** Copying the picture gives (5, 501). The answer needs three facts: idx = start + one draw per pass, all of idx is handed over, and return = start + max_new_tokens.

**boundary_decision**

staged

**boundary_reason**

One staged card with one causal loop body: hand idx, forward (keep the last position), draw, append, repeat max_new_tokens times, return idx. Every caption describes that body or its direct consequences: the growth, the return value, why it is sequential.

The critic's no-cache compute line was a second idea (compute cost) and is cut. The depth Deep dive owns it (deep.js:230).

**Rubric:**
- 1, 2, 3, 4, 6 and 10 do not hold;
- 9 does not hold (729 tall);
- 11 does not hold.

**Expected boundaryFlags: none.** The objective has no ';' or ', and'; there are 0 visible inputs; the height is under 900. So plan.boundary.reviewed = {}.

**Kept apart from c25:** c24 draws no probabilities and never says the draw changes the next prediction, only that the next pass is handed it. Its one toy-honesty line guards against the bold-last-character misreading, with no visual, control or practice of its own; c25 teaches the contrast.

**sequence**

'Generation context', 1 of 3: c24-generation-loop → c25-autoregressive-conditioning → c23-context-window. The header reads 'Generation context · 1 of 3'. board.js cardBlock and LearningBlocks.jsx:1025 already render it; only the name is new.

```
boundary = {decision: 'staged', reason, reviewed: {}, sequence: {name: 'Generation context', position: 1, of: 3, relationships: [
  {type: 'prerequisite', card: 'c01-forward-pass', direction: 'in'},
  {type: 'prerequisite', card: 'c21-temperature', direction: 'in'},
  {type: 'prerequisite', card: 'c25-autoregressive-conditioning', direction: 'out'},
  {type: 'deepens', card: 'c23-context-window', direction: 'out'}]}}
```

There is no c22 link: c24 never uses top-k (top_k = 200 keeps all 65; sources only).

Module: src/nanogpt/cards/c24-generation-loop.js, scene id 'nanogpt-c24-generation-loop'. It is first in the batch-5 array.

**relationships**

- prerequisite <- c01-forward-pass (direction 'in'; frozen, linked by type only). Forward without targets projects only the last position; c24 calls it once per pass and bolds that position.
- prerequisite <- c21-temperature (direction 'in'; frozen). Each draw is one weighted random pick; c24 shows only the drawn characters.
- prerequisite -> c25-autoregressive-conditioning (direction 'out', in the sequence). c24 shows that the draw is appended and handed to the next pass. c25 shows how the condition sets the next distribution, from the same bigram at the same checkpoint (iteration 100): c24's draws come from rows of that table.
- deepens -> c23-context-window (direction 'out', in the sequence). c24 scopes 'all of idx' to at most block_size in its objective only; c23 opens the crop at model.py:313-314.
- Depth-ladder board, tutor note only: alternative_explanation <-> Generation · Overview (overview.js:172). c24 adds the fixed pass count, the whole of idx handed to each pass, and the returned start.
- Depth-ladder board, tutor note only: deepens -> Generation · Deep dive 1/4 (crop, forward, last position, the no-cache total at deep.js:230) and 4/4 (draw and cat, with shapes).

**data_plan**

**Recorded toy run, a new fixture entry.** gen_training_loss.py recorded() gains recorded.generation, written to depth/fixtures/training-loss.generated.js.
- It reuses recorded_run's tapped table W.
- The checkpoint is computed by train.py:274-276's rule: the argmin of val over iterations > 0, below the iteration-0 val. That gives iteration 100 (val 3.0547). The generator asserts it equals the base fixture's toyRun.checkpoints[bestValIndex] (c18's kept checkpoint).
- sample.py settings come from gen_generation.top_level_constants(base.nanogpt('sample.py')): start '\n' (:14), max_new_tokens 500 (:16), temperature 0.8 (:17), top_k 200 (:18), seed 1337 (:19).
- It replays generate() on the bigram: logits = W[idx[-1]] / 0.8; top-k with min(200, 65) keeps all; softmax; random.Random(1337).choices standing in for torch.multinomial; append.
- The ROMEO: run uses a fresh Random(1337), as sample.py --start re-seeds at :26.

Stored:
```
{checkpoint: 100, start: '\n', drawn: ['N','a','k','i','f','o','n','o'], practice: {start: 'ROMEO:', pass: 5, drawn: [' ','m','e','l',':']}}
```
plus the settings.

The judge re-computed these values:
- iteration 100 from '\n': N a k i f o n o u;
- iteration 100 from 'ROMEO:': sp m e l :.
--check keeps passing and existing entries are unchanged.

**Source values:**
- start and max_new_tokens from g.sample (depth/fixtures/generation.generated.js);
- block_size from fx.architecture, in sources only.

**Built in the module, never typed:**
- rows[k] = display(start + drawn[0..k−1]), with '\n' shown as '⏎' and ' ' as 'sp' (c21 precedent);
- practiceRow = 'ROMEO:' + drawn[0..3];
- the draw x positions from chip widths;
- the growth caption (1 + 8 = 9);
- the band line (6 + 4 = 10, 6 + 500 = 506);
- the option strings.

There is no live calculation: the critic's add() derives only restated fixture lengths, so they are dropped, together with the 'Live calculation' status.

**Derive (gating only):**
- bandOp = choose(revealed, 1, 0);
- bandLabel, bandLine and bandDraw = choose(revealed, text, ' ');
- bandTokens = choose(revealed, practiceRow, placeholder).

**Tests** (plain-JS oracle):
- rows[k] = rows[k−1] + drawn[k−1];
- 9 = 1 + 8, 10 = 6 + 4, 506 = 6 + 500;
- the checkpoint equals toyRun's bestValIndex checkpoint;
- the options are mutually exclusive, with exactly one expected;
- no default-state visible label or evaluated band value contains 'ROMEO', '506' or '10 characters';
- the static bounds equal the revealed bounds;
- pinnedFile line checks for every code source.

**Gates:** assertCardGates at {revealed: false} and {revealed: true}, assertSources (statuses 'Recorded toy run' and 'Source value' are on the default surface), assertCardPlan (no flags), assertEvidence.

**capability_notes**

No new capability and no renderer primitive.

**In use:**
- tokens with tokenStyle 'labels' and a constant cellHighlight (a lit token draws bold ink; AnimatedScene.jsx:348-352);
- role-output text objects for the draws (AnimatedScene.jsx:524-526);
- derive op choose, with a derived tokens list (variable-length-tokens probe);
- a hidden bool as revealInput (scene-activity.js:177-181);
- derived opacity on 4 of the 5 practice-band objects, which carry no appear; the fifth, the line, is text-gated at static opacity so the static bounds hold the band;
- about 25 timeline appears;
- 40 of 60 objects.

**Constraints:**
- Label-style tokens ignore role fill, so each draw is a separate text object.
- A scene whose only input is hidden renders no INTERACT row and no Reset, but still evaluates (AnimatedScene.jsx:632), and SceneActivity renders (LearningBlocks.jsx:1030). This is the first card of this shape: check the whole Check → reveal → New attempt flow in the browser.
- DERIVATIONS has no sampling op, so the draws are recorded.
- The space shows as 'sp'. Pixel-check the '⏎' glyph in label tokens.
- Width limits, from textOverflow at 0.6 × the font size: body text at x 40 fits about 100 characters, annotation about 116. The strings above fit.
- Everything assertSources names must be on the default surface, so the ROMEO: draws go under the 'Recorded toy run' source.
- everDrawn ignores derived-opacity objects, so the band's bottom line keeps a static opacity (text blank until Check) and the band sits last, under the legend and toy note.

**Deliberately skipped (ponytail):**
- per-row 't = k' readouts and staircase arrows from the last position to the draw; add them if review finds the link unclear (only the practice band has an arrow: its draw has no next row to line up with);
- the no-cache compute line (the Deep dive owns it).

**overlap_check**

**Depth Generation · Overview** (another board). Its concept: 'reads the end of the text, scores every possible next token, picks one at random…, appends it, and repeats' (overview.js:172). Shared: one appended character per step, which is disclosed. c24 rests on what the Overview lacks:
- the whole of idx handed over (the Overview's toy reads 3 characters);
- the fixed pass count;
- the returned start;
- why the loop is sequential.

**Deep dive 1/4:** its no-cache total is no longer on c24. **Deep dive 4/4:** c24 has no shapes and no multinomial or cat mechanics beyond the append column. **Guided:** no overlap.

**c21:** c24 shows no distribution; T 0.8 is in sources only. **c22:** no top-k on the card.

**c25** (same sequence): c24 has one honesty line ('the bigram reads only the last character it is handed; NanoGPT's Blocks read the whole row') as a guard against its own bold encoding, with no visual, control or practice on it. c25 makes the condition the variable, with whole distributions. c24 never shows probabilities and never says the draw changes the next prediction.

**c23** (same sequence): the crop appears only as the scope in the objective and in sources; no drawn t exceeds 10.

**c01:** the last-position projection is named in the Builds-on line. **c26 and c11:** one contrast line, no targets drawn. **c18:** the same recorded run, at the checkpoint c18 teaches is kept.

**source_citations**

- All NanoGPT lines were re-read through pinnedFile's sha-verified cache at karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291.
- model.py:305-311 '@torch.no_grad()' / 'def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):' / 'Take a conditioning sequence of indices idx (LongTensor of shape (b,t)) and complete' / 'the sequence max_new_tokens times, feeding the predictions back into the model each time.'
- model.py:312 'for _ in range(max_new_tokens):'. There is no break in :312-330; the only return is :330.
- model.py:314 'idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]' (scope only; c23's line).
- model.py:316 'logits, _ = self(idx_cond)'. model.py:318 'logits = logits[:, -1, :] / temperature'.
- model.py:321-322 'v, _ = torch.topk(logits, min(top_k, logits.size(-1)))' / "logits[logits < v[:, [-1]]] = -float('Inf')". k = min(200, 65) keeps all 65 (sources only).
- model.py:324 'probs = F.softmax(logits, dim=-1)'; :326 'idx_next = torch.multinomial(probs, num_samples=1)'; :328 'idx = torch.cat((idx, idx_next), dim=1)'; :330 'return idx'.
- model.py:170 'def forward(self, idx, targets=None):' (no cache argument). :173 'assert t <= self.config.block_size'. :180-181 'for block in self.transformer.h:' / 'x = block(x)'. :190 'logits = self.lm_head(x[:, [-1], :]) # note: using list [-1] to preserve the time dim'.
- sample.py:14-19: start = "\n", num_samples = 10, max_new_tokens = 500, temperature = 0.8, top_k = 200, seed = 1337. :23 configurator overrides (--start). :26 'torch.manual_seed(seed)'. :37-38 load out_dir/ckpt.pt. :80-81 start_ids and x. :86-88 the num_samples loop / 'y = model.generate(x, max_new_tokens, temperature=temperature, top_k=top_k)' / 'print(decode(y[0].tolist()))'.
- train.py:124-125: x and y are the given text shifted by one. train.py:300 'logits, loss = model(X, Y)'. train.py:274-286: 'if losses['val'] < best_val_loss or always_save_checkpoint:' … 'if iter_num > 0:' … torch.save(… 'ckpt.pt').
- config/train_shakespeare_char.py:9-10 '# we expect to overfit on this small dataset, so only save when val improves' / 'always_save_checkpoint = False'; :19 'block_size = 256'.
- data/shakespeare_char/prepare.py:24-25 (chars, vocab_size 65); :30-35 (stoi, itos, encode, decode: one character per integer).
- Repo:
- gen_training_loss.py:64-84 (recorded_run) and :87-148 (recorded());
- gen_generation.py:51-57 (top_level_constants) and :130-145 (the Overview's random.choices replay);
- nanogpt-fixtures.generated.js toyRun: bestValIndex 2 = iteration 100, val 3.0547;
- overview.js:172; deep.js:230 and :309-310;
- c21-temperature.js:16-19 ('sp');
- AnimatedScene.jsx:343-352 and :524-526;
- SceneControls.jsx:172, :183; LearningBlocks.jsx:1025, :1030; scene-activity.js:177-181;
- scene-derive.js choose (:204-210) and gate (:233-246);
- c14-mlp.js:81-86 (the gated reveal pattern).
- Judge re-computation through recorded_run with sample.py's settings: iteration 100 from '\n' gives N a k i f o n o u; from 'ROMEO:' it gives sp m e l :.

**risks**

1. **Checkpoint on the board.** c26 (closed) prints the same table at iteration 1000 without naming it. c24 and c25 name iteration 100 on the surface. See the open question.
2. **Toy honesty.** The rows show what generate() hands the model; the bigram reads only the last character. The toy line and the lastOnly feedback say so. The draws come from random.Random(1337).choices, not torch.multinomial, and the sources say so.
3. **Boundary with c25.** Never say the draw 'changes the next prediction'. No probabilities on the card.
4. **Boundary with c23.** The crop appears only as the scope in the objective and in sources, never in captions or feedback.
5. **Answer leakage.** 'ROMEO', 506 and 10 must be absent at default, including in the evaluated band values (gated). A test asserts it.
6. **State clarity.**
   - The reveal is a separately labelled practice case, and the main captions are scoped to passes 1 to 8.
   - With revealed = true, a replay shows the band from t = 0 (derived opacity, no appear). Say so in review, as c26 did.
7. **Pixels.** Check:
   - the '⏎' glyph;
   - 'sp' at a width of 59 in the practice row;
   - row pitch 36 against a chip height of 32;
   - draws centred on the next column;
   - the 13 px bold-versus-regular contrast.
   Screenshot {revealed: false}, {revealed: true} and mid-replay from a clean browser.
8. **Hidden-only input.** This is the first card of this shape. Confirm there is no empty INTERACT row and that Check, reveal and New attempt all work.
9. **Choose to a placeholder token list.** Confirm the placeholder renders nothing visible at opacity 0 and that token-count gates pass in both states.

## c25 · Autoregressive conditioning

**concept**

Autoregressive conditioning. Every next-character prediction is p(next | what the model reads of the text so far). While generating, that text includes the model's own earlier draws: generate()'s docstring says 'a conditioning sequence of indices idx … feeding the predictions back into the model each time' (model.py:308-309), and each draw is appended with torch.cat (:328).

**The toy.** The recorded bigram reads ONLY the previous character. Its prediction is the softmax of that character's row in a 65 × 65 logit table, so every text ending in the same character gets the identical distribution.

**NanoGPT.** It reads the whole cropped window. generate() forwards idx_cond, the last ≤ block_size characters of idx (256 for shakespeare_char; model.py:314-316), and keeps the logits at its last position (:318; forward projects only x[:, [-1], :], :190). That position starts from tok_emb + pos_emb (:179) and passes through causal attention in every Block (is_causal=True, :64; Block :104). So it can depend on every character in idx_cond and where each sits. Two texts ending in the same character CAN get different distributions.

**Kept off this card:**
- sampling, temperature, top-k and which character wins (c21, c22);
- the loop replay (c24);
- the crop itself (c23);
- loss (c16, c26).

**one_sentence_objective**

After this card, the learner should understand that each next-character prediction is a whole distribution conditioned on what the model reads of the text so far, its own earlier draws included, which for the recorded bigram is only the previous character and for NanoGPT is the whole cropped window idx_cond.

**prerequisites**

- c24-generation-loop (Generation context · 1 of 3): each generate() pass draws one character and appends it to idx (model.py:326-328), then repeats. c25 says what the appended character does to the next prediction.
- c05-position-mixing: inside a Block, only attention lets output i read inputs 0..i. That is how NanoGPT's last position can read the whole window. Named, not redrawn.
- c01-forward-pass (generation mode): without targets, lm_head projects only the last position (model.py:190).
- Named, not taught: a distribution over the 65 characters sums to 1 (c16, c21).

**causal_steps**

Staged: one pipeline, top to bottom, replayed in this order. At rest everything is drawn.

1. **The text so far (0 s).** Two real Tiny Shakespeare texts that end in the selected previous character. Each is a tokens row with tokenStyle 'labels': '…' first, a space shown as 'sp', and the last token lit (cellHighlightKind 'highlight') to mean what the toy reads. Each row is named at x 40 by its text as words, in body type and quotes ('“…Before we”'), so it reads without spelling the tokens (visual review V-c25-V5).
2. **What each model reads (0.6 s).**
   - 'The toy reads only the lit last character: {{prevName}} in both texts, so both get one row.'
   - 'NanoGPT reads all of each text, up to 256 characters back, so its two predictions can differ.'
3. **The row (1.0-1.4 s).**
   - Caption: 'Row {{prevName}} of the toy's 65 × 65 table: p(next character | previous {{prevName}})'.
   - A 1 × 8 p (%) grid over 8 fixed next-character columns.
   - Bars on the same pitch (fixed peak 100, with a line at the 100% top labelled 'bar height 100%' and the baseline labelled 'bar height 0%'). Nothing is lit.
   - A 1 × 1 cell, 'the other 57 together' (live), labelled in two lines over its own cell: 'the other 57' over 'together'.
4. **The loop closes (1.8 s).** Captions only; c24 owns the loop.
   - Static, body: 'When it writes, each draw is appended and becomes the next previous character.'
   - Per preset, from appendByPrev (95 characters or fewer):
     - ‘e’: 'Append sp, as Shakespeare does next, and the toy switches to row sp: pick the sp preset.'
     - sp: 'These are the ‘e’ texts plus one appended sp: the toy has switched from row ‘e’ to row sp.'
     - ‘h’ and ‘,’: 'Append any character and the toy switches to that character’s row; it reads nothing before it.'
   - Two NanoGPT lines, annotation. Line 1 is judge-trimmed: c23 owns the crop, and stage 2 already scopes it.
     - 'NanoGPT: generate() takes the logits at the last position of the text it is handed.'
     - 'Through attention that position can read every earlier character and its position; the toy reads one.'

**primary_interaction**

**Question** (heading, y 30): 'What does the next-character prediction read of the text so far?'

**Header** (annotation):
- y 56: 'Recorded toy run (a bigram reading only the previous character, not NanoGPT; iteration 100, the kept checkpoint)'. It names the checkpoint because c26 prints the same table at iteration 1000.
- y 74: 'Live calculation: the other 57 together · Source value: the texts, 65 characters, NanoGPT’s 256-character window'
- No header line ends in a bare symbol or an unlabelled number (visual review V-c25-V1).
- y 92: 'Builds on: generation appends each draw to the text; attention lets the last position read earlier ones'

**The control.** One control in INTERACT, 'prev': an index picker labelled 'Previous character (preset)'.
- prevLabels: ['‘e’', 'sp (space)', '‘h’', '‘,’ (comma)']
- default 0 (‘e’); Reset.
- These are stored presets; nothing runs when one is picked.

**Picking a preset changes:** both token rows (text and lit last token), {{prevName}}, the 8 p (%) cells, the 8 bars, the 'other 57' cell and the append line.

**It never changes:** the columns, the axis, the draw line and the NanoGPT lines.

**States** at iteration 100 (judge re-computed). Cells are in column order sp a e i n r t w, then the other 57.

| preset | texts | cells | other 57 |
|---|---|---|---|
| ‘e’ | '…Before we', '…hear me' | 19.90 8.15 3.59 1.28 8.59 11.23 1.42 0.19 | 45.65 |
| sp | the ‘e’ texts + sp | 0.18 9.07 2.02 5.73 0.63 4.31 12.15 7.07 | 58.83 |
| ‘h’ | '…to famish', '…this with' | 0.26 11.35 39.04 18.05 0.26 0.26 3.11 0.26 | 27.41 |
| ‘,’ | '…further,', '…Speak,' | 72.24 0.42 0.44 0.43 0.44 0.43 0.43 0.43 | 24.72 |

**What it reveals:**
- the condition alone moves the whole distribution, from peaked (comma) to spread (sp);
- two texts with the same last character get one toy row;
- one appended character switches the row (‘e’ → sp).

**Layout** (960 × about 700):
- token rows at (180, 120) and (180, 166), each labelled at x 40 by its text as words ('“…Before we”');
- grid at (180, 322), cell 60; 'other 57' cell at (700, 322), its label 'the other 57' / 'together' in two lines;
- bars at (180, 404), h 128, peak 100: the 100% line 26 below the grid, tagged 'bar height 100%', and the baseline tagged 'bar height 0%' (visual review V-c25-V4);
- legend at y 560 (annotation): 'the same 8 of the 65 next characters for every row, each cell rounded on its own; sp = space; … = earlier text';
- stage-4 lines at y 592-668.

**reviewStates:** [{prev: 0}, {prev: 1}, {prev: 2}, {prev: 3}].

**check_practice**

None: explore-only, as inventory row 25 lists it.

The interaction is not decorative. Its consequence is the lesson: the whole distribution follows the condition, and two texts with one last character share one row.

The critic's candidate practice ('two other texts ending in ‘e’') was the drawn case in different words, and the stage-2 captions state its answer, so it fails commit-before-you-see (section 5). A truly undrawn conditioning case (a longer context, text past the cut) is c23's practice.

**undrawn_case**

None: the card is explore-only, with no practice.

**boundary_decision**

staged

**boundary_reason**

**One mental model:** a prediction is a function of what the model reads, its condition. The pipeline: text so far → what is read (for the toy, the last character) → that character's row → the next-character distribution → an appended draw becomes the next condition. It is revealed in four stages, and the one control reaches every stage.

**The NanoGPT lines are not a second mechanism.** They state the same condition for NanoGPT (idx_cond) as the exactness guard, with no control, visual or practice of their own.

**Rubric:**
- 1, 2, 3, 4, 5, 6, 9 and 10 do not hold;
- 11 holds weakly: without the NanoGPT lines the card still teaches, but misleadingly. That is one signal, below the two needed.

**Kept apart from:**
- c24: the loop mechanics, a replay of draws;
- c23: where the window is cut;
- c26: one entry per row read as a loss.

**Expected boundaryFlags: none.** The objective has no ';', ', and', 'and also' or 'as well as'. plan.boundary.reviewed = {}.

**sequence**

'Generation context', 2 of 3: c24-generation-loop → c25-autoregressive-conditioning → c23-context-window. The header reads 'Generation context · 2 of 3'. board.js cardBlock and LearningBlocks.jsx:1025 already render it; only the name is new.

```
boundary = {decision: 'staged', reason, reviewed: {}, sequence: {name: 'Generation context', position: 2, of: 3, relationships: [
  {type: 'prerequisite', card: 'c24-generation-loop', direction: 'in'},
  {type: 'prerequisite', card: 'c23-context-window', direction: 'out'},
  {type: 'prerequisite', card: 'c05-position-mixing', direction: 'in'},
  {type: 'deepens', card: 'c01-forward-pass', direction: 'in'}]}}
```

Module: src/nanogpt/cards/c25-autoregressive-conditioning.js, scene id 'nanogpt-c25-autoregressive-conditioning'. It is second in the batch-5 array.

**relationships**

- prerequisite <- c24-generation-loop (direction 'in', in the sequence). generate() appends each draw (model.py:326-328); c25 shows the appended character becomes the condition, which for the toy selects the next row. Both cards use iteration 100.
- prerequisite -> c23-context-window (direction 'out', in the sequence). c25 says NanoGPT conditions on the whole idx_cond; c23 shows where it is cut (model.py:314, block_size = 256). c25 draws no window comparison, and the block_size = 1 → bigram remark belongs to c23's tutor notes.
- prerequisite <- c05-position-mixing (direction 'in'). Attention is the only place output i reads inputs 0..i.
- deepens <- c01-forward-pass (direction 'in'; frozen, typed from c25 only, as in the c11 → c13 precedent). The generation call site projects only the last position (model.py:190); c25 says what that position depends on.
- Tutor note, not typed: c26-training-objective ('Training fundamentals') prints single entries of the same recorded table at iteration 1000 (e→sp 24.65%). c25 shows iteration 100, the kept checkpoint (e→sp 19.90%). The tutor names the checkpoint difference: c26 reads the last checkpoint, generation loads the kept one.
- Tutor note, not typed: c21-temperature (frozen) and c22-top-k reshape the distribution one condition gives and decide which character wins; c25 changes the condition.
- Depth-ladder board, tutor note only: alternative_explanation <-> Generation and sampling · Overview. It teaches the same idea with a 3-character counting model and never says what NanoGPT reads.
- Depth-ladder board, tutor note only: Training and loss · Overview draws the same bigram's row ‘z’ at four checkpoints (the variable is time); c25 draws four rows at one checkpoint (the variable is the condition).

**data_plan**

**Model and checkpoint.** The recorded toy run, not NanoGPT: the seeded character bigram (generate_fixtures.py toy_run, seed 1337) that c18 plots and c26 reads, taken through gen_training_loss.py's recorded_run tap. p(next | prev) = softmax(W_it[prev]).

The checkpoint is iteration 100 (judge decision). It is the checkpoint shakespeare_char's save rule leaves in ckpt.pt (config:9-10, train.py:274-276, c18), and sample.py:37-38 loads ckpt.pt. It is computed in the generator by the same rule as c24's (argmin of val over iterations > 0) and shared with c24. Iteration 1000 was evaluated by the critic (comma row sp 98.15%, an overfit) and is not used.

**Fixture addition** (same generator, no new file). recorded() gains recorded.conditioning:
```
{iteration: 100, columns: [' ', 'a', 'e', 'i', 'n', 'r', 't', 'w'], presets: [{prev, pairs, p: [8 values, 6 decimals], rest: 1 − Σ8, argmax (over 65), texts: [{text, at}, {text, at}]}]}
```

**Generator asserts:**
- each text lies in the 1,200-character training slice and ends in prev;
- the sp texts are the ‘e’ texts plus ' ';
- the argmax is among the columns;
- pairs ≥ 14;
- the 65-entry row sums to 1;
- every shown p ≥ 5e-5;
- the checkpoint equals toyRun's bestValIndex checkpoint.

c26's objective block is unchanged, and --check passes.

**Columns.** The union of each preset's top 3; every row uses the same 8.

**Values at iteration 100** (%, judge re-computed):

| preset | pairs | sp | a | e | i | n | r | t | w | other 57 |
|---|---|---|---|---|---|---|---|---|---|---|
| ‘e’ | 122 | 19.8998 | 8.1513 | 3.5862 | 1.2795 | 8.5909 | 11.2289 | 1.4218 | 0.1931 | 45.6484 |
| sp | 171 | 0.1798 | 9.0717 | 2.0178 | 5.7338 | 0.6328 | 4.3081 | 12.1533 | 7.0709 | 58.8317 |
| ‘h’ | 39 | 0.2600 | 11.3547 | 39.0422 | 18.0488 | 0.2600 | 0.2577 | 3.1119 | 0.2587 | 27.4061 |
| ‘,’ | 14 | 72.2448 | 0.4248 | 0.4362 | 0.4330 | 0.4415 | 0.4328 | 0.4310 | 0.4339 | 24.7220 |

**Texts** (Source value: tinyShakespeare, positions in the training slice, verified):
- ‘e’: 'Before we' at 15, 'hear me' at 46
- sp: the same plus ' '
- ‘h’: 'to famish' at 137, 'this with' at 878
- ‘,’: 'further,' at 37, 'Speak,' at 67

**Source values:** 65 = fx.architecture.vocab_size; 256 = fx.architecture.block_size.

**Structural, in the module:**
- prevLabels, prevNames;
- textAByPrev and textBByPrev ('…' first, ' ' → 'sp');
- lastAByPrev and lastBByPrev;
- rowByPrev = p × 100;
- colLabels;
- restCount = vocab_size − columns.length (57);
- appendByPrev;
- hundred = [100].

**Live calculation:**
- pick(…, prev) for the texts, last indices, row and append line;
- shownSum = sum(row); restV = sub(hundred, concat(shownSum)).

restV appears only in the 1 × 1 cell, never interpolated into text.

**Oracle tests** (plain JS):
- cells equal the fixture;
- cells + rest = 100 within 1e-6;
- the argmax is among the columns;
- min cell ≥ 0.005;
- the texts end in prev;
- the sp texts are the ‘e’ texts + ' ';
- no visible text contains a most-likely marker.

The c26-equality oracle is dropped: it holds only at iteration 1000.

**capability_notes**

No new capability and no renderer primitive.

**In use:**
- one index picker;
- two tokens rows with tokenStyle 'labels', derived variable-length tokens (c06 pattern) and a derived cellHighlight of kind 'highlight' (c21 pattern);
- a 1 × 8 grid with fixed columnLabels, rowLabels ['p (%)'] and derived values (c26 pattern);
- a 1 × 1 grid for the live rest;
- bars with a fixed peak of 100, no highlight;
- one line at the 100% top;
- derive ops pick, sum, concat and sub;
- {{}} interpolation of strings only.

**Checked:**
- '…Before we sp' is 11 tokens and ends near x 744 (animation-scene.js:454 chip metrics);
- '72.24' in a 60-unit cell draws at about 18 px;
- the smallest bar in the sp row is about 16.5 px;
- body lines are 95 characters or fewer; the NanoGPT lines and legend are annotation, under x 944;
- there is no derived opacity.

**Budget:** about 24 of 60 objects.

**Skipped (ponytail):**
- a live softmax over the 65 logits (recorded p is enough, as on c26);
- a most-likely highlight, which cues greedy decoding (c21 and c22 own it);
- NanoGPT scope brackets.

**overlap_check**

**c26-training-objective** (batch 4). The same recorded table, but c26 prints p(target) per position, −ln p, the mean and perplexity at iteration 1000. c25 has no target, loss or mean; it draws four whole rows at iteration 100 and names the checkpoint on the surface.

**c21** (frozen) and **c22:** they reshape and cut one distribution and decide the winner. c25 never divides by T, samples, cuts or lights a winner. The 8 fixed columns plus 'the other 57' cell guard against a top-k reading.

**c24** (same sequence): the loop, with draws and no probabilities. c25 has no draws and no replay.

**c23** (same sequence): c25 mentions 256 once, as scope ('up to 256 characters back'). The judge trimmed the second crop line and draws no window comparison.

**c01, c05 and c11:** their conclusions are relied on, not redrawn.

**Depth ladder** (another board):
- Generation · Overview: the same autoregressive idea, with a counting model and draws; disclosed.
- Guided and Deep dive: none of their mechanics are drawn.
- Training · Overview: row ‘z’ across checkpoints.

**Only c25 adds:**
- the condition as the variable, with the whole distribution following it;
- two texts giving one toy row;
- one appended character switching the row;
- the exact NanoGPT contrast.

**source_citations**

- model.py:305-311 (pinned 3adf61e, re-read): '@torch.no_grad()' / 'def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):' / 'Take a conditioning sequence of indices idx (LongTensor of shape (b,t)) and complete' / 'the sequence max_new_tokens times, feeding the predictions back into the model each time.'
- model.py:312-316: 'for _ in range(max_new_tokens):' / '# if the sequence context is growing too long we must crop it at block_size' / 'idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]' / '# forward the model to get the logits for the index in the sequence' / 'logits, _ = self(idx_cond)'.
- model.py:317-318: '# pluck the logits at the final step and scale by desired temperature' / 'logits = logits[:, -1, :] / temperature'. model.py:320-322 (top-k) is named only as c22's.
- model.py:324-328: 'probs = F.softmax(logits, dim=-1)' / '# sample from the distribution' / 'idx_next = torch.multinomial(probs, num_samples=1)' / '# append sampled index to the running sequence and continue' / 'idx = torch.cat((idx, idx_next), dim=1)'.
- model.py:172-174 'b, t = idx.size()' / 'assert t <= self.config.block_size, …' / 'pos = torch.arange(0, t, dtype=torch.long, device=device) # shape (t)'.
- model.py:177-182 'tok_emb = self.transformer.wte(idx)' / 'pos_emb = self.transformer.wpe(pos)' / 'x = self.transformer.drop(tok_emb + pos_emb)' / 'for block in self.transformer.h:' / 'x = block(x)' / 'x = self.transformer.ln_f(x)'.
- model.py:188-191 'else:' / '# inference-time mini-optimization: only forward the lm_head on the very last position' / 'logits = self.lm_head(x[:, [-1], :]) # note: using list [-1] to preserve the time dim' / 'loss = None'.
- model.py:61-64: causal self-attention, is_causal=True in the flash path. Slow path :48-50 (tril 'bias' buffer) and :67-69 (masked_fill, then softmax).
- model.py:103-105 Block.forward: 'x = x + self.attn(self.ln_1(x))' / 'x = x + self.mlp(self.ln_2(x))'.
- model.py:127-128 'wte = nn.Embedding(config.vocab_size, config.n_embd),' / 'wpe = nn.Embedding(config.block_size, config.n_embd),'.
- config/train_shakespeare_char.py:9-10 '# we expect to overfit on this small dataset, so only save when val improves' / 'always_save_checkpoint = False'; :19 'block_size = 256 # context of up to 256 previous characters'.
- train.py:274-276 'if losses['val'] < best_val_loss or always_save_checkpoint:' / 'best_val_loss = losses['val']' / 'if iter_num > 0:' (why iteration 100 is the kept checkpoint; toyRun bestValIndex 2, val 3.0547).
- sample.py:14 'start = "\n" …'; :37-38 'ckpt_path = os.path.join(out_dir, 'ckpt.pt')' / 'checkpoint = torch.load(ckpt_path, map_location=device)'; :80-81 start_ids and x; :87 'y = model.generate(x, max_new_tokens, temperature=temperature, top_k=top_k)'.
- data/shakespeare_char/prepare.py:24-25 'chars = sorted(list(set(data)))' / 'vocab_size = len(chars)'; :38-40 (the 90% train split).
- Recorded toy run (repo, not NanoGPT): generate_fixtures.py toy_run; depth/fixtures/gen_training_loss.py recorded_run (:64-84) and recorded() (:87-148). The iteration-100 rows were re-computed by the judge through recorded_run.
- Dataset: tinyshakespeare input.txt (sha256 86c4e6aa…). Text positions 15, 46, 137, 878, 37 and 67 in the training slice.
- Repo patterns: c26-training-objective.js:126 (status wording); c21-temperature.js (derived tokens with cellHighlight); c06-tokenizer.js (variable-length tokens); animation-scene.js:454 (chip metrics); scene-format.js formatCell; scene-derive.js DERIVATIONS; board.js cardBlock and LearningBlocks.jsx:1025 (sequence header); card-gates.mjs textOverflow and assertCardPlan.

**risks**

1. **Toy is not NanoGPT.** Never say NanoGPT reads only the previous character, and never show a measured NanoGPT distribution. NanoGPT's 'can differ' is structural (:314-318, :64, :179). 'not NanoGPT' stays in the status line.
2. **Greedy misreading.** Nothing is lit as most likely. The ‘e’ append line says 'as Shakespeare does next', never 'the model picks'.
3. **Small-slice artifacts.** Presets have at least 14 pairs (asserted), and unseen characters are never offered. In row ‘h’, a character outside the columns (o 4.92) outranks the shown t; the legend and the rest cell cover it.
4. **Cross-card numbers.** e→sp reads 19.90% here and 24.65% on c26. c25's status names iteration 100; c26's surface names no checkpoint (open question; resolved in NC9: c26 now reads 'iteration 1000, the last checkpoint').
5. **The sp preset.** Its texts are the ‘e’ texts plus the space that really follows in Shakespeare, not a model draw, and the captions say so.
6. **Rounding.** Printed cells plus the rest can miss 100 by ±0.03; the legend says each cell is rounded on its own.
7. **Pixels.** Check:
   - the 11-token row ends near x 744;
   - the '‘,’ (comma)' chip;
   - small bars in the sp row;
   - the '…' token;
   - the 'other 57' label over its 60-unit cell;
   - nothing past x 944.
   Screenshot all four reviewStates from a clean browser.
8. **State clarity.** The lit last token means what the toy reads (highlight kind, not select). Every caption naming a text or row follows the preset, and the fixed lines are true in every state.

## c23 · Context window: what idx_cond crops away

**concept**

The context window at generation time. Before every forward pass, generate() crops the growing idx to its last block_size characters: 'idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]' (model.py:314).

**The forward reads only idx_cond** (:316), and it cannot take more: it asserts t <= block_size (:173), and wpe has exactly block_size rows (:128).

**idx keeps every character.** The append goes onto idx (:328), generate() returns all of it (:330), and sample.py prints all of it (:88). So a character further back than block_size, prompt included, no longer counts for the next prediction, although it stays in the generated text.

**block_size is fixed by the trained model.** It is 256 for shakespeare_char (config:19). train.py stores it in the checkpoint's model_args (:147-148, :277-280), and sample.py rebuilds the model from those args (:39-40).

**The What-if** compares separate toy counting tables, one per block_size.

**Collection candidate, not on the card:** positions restarting at 0 inside idx_cond (:174).

**one_sentence_objective**

After this card, the learner should understand that before every forward generate() keeps only the last block_size characters of idx, so a character cropped from the front, the prompt included, no longer counts for the next prediction even when it would change the most likely next character, although it stays in the text generate() returns.

**prerequisites**

- c25-autoregressive-conditioning (Generation context · 2 of 3): the next character's distribution depends on the text before it. c23 bounds how much of it counts.
- c24-generation-loop (Generation context · 1 of 3): generate() appends each draw to idx and repeats, which is why idx grows past block_size. Pass k is handed start + (k − 1) characters, which the practice counts on.
- c01-forward-pass (frozen): the generation call site forward(idx=idx_cond) passes no targets and projects only the last position. Its line 'T = tokens so far, cropped to block_size' (c01-forward-pass.js:69) is what c23 opens.
- c09-token-plus-position: wpe has one learned row per position, 0 to block_size − 1 (used in one footer line).
- Named, not taught: a conditional frequency, count ÷ matches.

**causal_steps**

Staged: one pipeline, read top to bottom. The replay takes 1.8 s, with stages at 0, 0.6 and 1.2 s; at rest everything is drawn.

**Header:**
- y 30 (heading, 70 characters): 'What does the next prediction read once idx is longer than block_size?' (review fix: the crop acts on what the forward is handed, never on idx; batch decision 5's handed/reads)
- Status lines (annotation, each 116 characters or fewer):
  1. 'Calculated toy example (counts over Tiny Shakespeare's training text; not NanoGPT, not the bigram): counts' (107). It names the model switch within the sequence.
  2. 'Live calculation: matches, p = count ÷ matches, most likely next · What-if: toy block_size 2 to 5, one table each'
  3. 'Source value: the text, NanoGPT's block_size 256'
- y 112: 'Builds on: each new character is predicted from the text before it; generate() appends it and repeats'

**1. idx and the crop.**
- idx = B e f o r, t = 5: the first 5 characters of the board's line 'Before we proceed any further', as five heading-size (20 px) text characters, one 50-wide slot each from x 170, baseline y 197. (Visual review: the 13 px tokens-row glyphs read as a footnote to the table.)
- The last k characters sit in an input-role box as idx_cond (derived x and w, y 170, h 40), with the short label 'read' under the box's left edge (derived x). The first t − k characters are dimmed to opacity 0.72 (derived, no appear): the faintest a resting text line may be, still 4.5:1 on the scene surface in both themes (owner, 2026-09-29; was 0.45, 2.5:1).
- A neutral 'cropped' bracket sits above the first t − k characters (derived end x), its label directly over the bracket's start, not in the gutter. Both carry derived opacity [1, 1, 1, 0] and no appear.
- A '→ ?' slot ends before x 590. There is no truth mark.
- Readouts in annotation at x 600, y 160-204:
  - '5 characters in idx · toy block_size {{k}}'
  - 'idx_cond (read): "for"'
  - 'cropped from the prompt, still in idx: "Be"' (names the cropped characters as the prompt's, so 'prompt included' is drawn at every cropped state)
  - At k = 5: 'no crop: 5 characters ≤ block_size 5' (compares idx's length, never idx itself).
- Rule line, body: 'The forward is handed only idx_cond, the last block_size characters of idx; the prompt is not exempt.'

**2. The toy table's row for exactly idx_cond.**
- A 1 × 6 grid, numberFormat 'integer', rowLabel 'count', columns e, sp, d, t, m, other; cell 70, y 293.
- matches = the sum of the row (live), printed ungrouped (7676, 2431, 388, 31).

**3. The prediction.**
- p = count ÷ matches as a 1 × 6 'p (%)' grid at y 363, and bars (fixed peak 100) at y 461, h 150, both live.
- A live argmax highlights the most likely bar, and a prediction-role box frames that bar's whole column (0..100 and its label; x picked by the argmax), 16 below the p grid. The readout 'Most likely next: sp (50.93%)' sits beside the frame's top (x picked by the argmax), where no other bar can reach (every other bar is at most 50%).
- A two-line state caption, indented (text at x 48) beside a quiet prediction-role left rule (a vertical line at x 37), so the two lines that change with block_size stand apart from the constant lines under it. (Deployed review: a bordered grey panel read as a disabled text field.) The caption's top clears the framed column's bottom (y 631) by at least 20.
- Constant lines:
  - 'The prediction can use only idx_cond: whatever the crop removes no longer counts.'
  - 'idx keeps every character: the crop limits what the model reads, not the text generate() returns.'
- Legend: 'other = every remaining character together · each p cell is rounded on its own'.
- Footers:
  - 'Source value: NanoGPT's block_size is fixed by the trained model, 256 for shakespeare_char; the crop starts once idx passes 256.'
  - 'The forward accepts at most block_size positions: wpe has one learned row for each.'

The scene is 960 × 860 (the padded content, 859.32, drawn at scale 1), with 38 objects.

**primary_interaction**

**The control.** One visible control in INTERACT, plus Reset: 'block', an index picker labelled 'What-if: toy block_size (preset)'. (Visual review: a slider's readout said '2 of 4' at block_size 3; the picker's chips say 'block_size k'.)
- blockLabels: block_size 2, 3, 4, 5.
- Default index 1 (block_size 3, also the depth ladder's toy block_size).
- No hidden inputs.

**What moving it changes:**
- the idx_cond box (x and w), the 'read' label's x, and which characters are dimmed;
- the 'cropped' bracket's end and, with its label, derived opacity [1, 1, 1, 0] with no appear;
- the readouts;
- the count row (that table's row for exactly the kept characters), matches, p (%), the bars, the most-likely highlight (argmin(scale(p, −1))), its column frame and readout and the two-line caption.

**The four states** (columns e, sp, d, t, m, other; judge re-computed from the pinned input.txt):

| block_size | idx_cond | counts | matches | p (%) | most likely |
|---|---|---|---|---|---|
| 2 | or | [1035, 2461, 1300, 697, 134, 2049] | 7676 | 13.48 32.06 16.94 9.08 1.75 26.69 | sp |
| 3 (default) | for | [392, 1238, 133, 279, 90, 299] | 2431 | 16.13 50.93 5.47 11.48 3.70 12.30 | sp |
| 4 | efor | [339, 0, 33, 6, 7, 3] | 388 | 87.37 0.00 8.51 1.55 1.80 0.77 | e |
| 5 | Befor | [31, 0, 0, 0, 0, 0] | 31 | 100.00 0 0 0 0 0 | e |

**Captions**, built from the fixture with toFixed(2):
- **block_size 2:** 'Cropped: "Bef". After "or" a space leads (32.06%); e gets 13.48%.' / 'The e before "for" is cropped too, so e does not lead: it ranks fourth of the 6 columns.' (e is 13.48%, behind sp, other and d; the rank is computed from the fixture)
- **block_size 3:** 'Cropped: "Be". After "for" a space leads (50.93%); e gets 16.13%.' / 'While the e before "for" is read (block_size 4), e leads with 87.37%: the crop removed what pointed to e.'
- **block_size 4:** 'Cropped: "B". After "efor", e leads (87.37%): the e before "for" is still read.' / 'Crop that one e (block_size 3) and a space leads instead.'
- **block_size 5:** 'No crop: all 5 characters are read; after "Befor", e followed in 31 of 31 matches.' / 'Once idx is longer than block_size, the oldest characters are cropped first.'

**What it reveals:** cropping one character (the e of 'efor') moves the most likely next character from e (87.37%) to a space (50.93%). The prediction can use only what idx_cond holds.

**reviewStates:** [{block: 1}, {block: 0}, {block: 2}, {block: 3}].

**check_practice**

**Practice (commit before you see).**
- id: 'c23-practice'
- check: 'choice_equals'
- version: 1
- fixedInputs: {block: 1}
- No reveal: the feedback carries it (c26 precedent; ponytail: add a gated reveal line only if review asks).

**Prompt:** 'NanoGPT's sampler starts idx as one newline character and appends 500 new characters; shakespeare_char's block_size is 256 (not drawn: the card's text is 5 characters). When the model predicts new character 300, which characters of idx does its forward read?'

**Options.** Bare ranges, built in the module from g.sample.start (length 1), fx.architecture.block_size (256) and n = 300:

| id | option | belief it catches |
|---|---|---|
| all | 'the newline and new characters 1–299' | no crop; the declared default, never rendered |
| first | 'the newline and new characters 1–255' | the crop keeps the beginning |
| pinned | 'the newline and new characters 45–299' | the prompt stays in view |
| ahead | 'new characters 45–300' | counts the character being predicted, which cat has not appended yet (model.py:328) |
| last (expected) | 'new characters 44–299' | correct |

**Reasoning:**
1. Before new character 300 is drawn, idx holds the newline plus new characters 1–299 (c24's start + one draw per pass), so t = 300 > 256.
2. idx_cond = idx[:, −256:], which is idx positions 44–299: new characters 44–299.
3. The prompt gets no exception.

**feedbackPass:** 'Right. Before new character 300 is drawn, idx holds the newline and new characters 1–299: 300 characters, more than block_size = 256. So the forward is handed only the last 256, new characters 44–299. The newline and new characters 1–43 stay in the printed text, but they cannot change this prediction. On the card, at block_size 3, the forward reads "for", not "Be".'

**feedbackFail:** 'Not quite. Before new character 300 is drawn, idx holds 300 characters: the newline and new characters 1–299 (character 300 joins idx only when it is appended). That is more than block_size = 256, so the forward is handed only the last 256: new characters 44–299. Reading all 300 ignores the crop. Reading 1–255 takes the wrong end, because the oldest characters go first. Reading the newline treats the prompt as special, but it is cropped like any other character. 45–300 counts a character that has not been drawn yet.'

**undrawn_case**

NanoGPT's own sampling run at shakespeare_char scale: sample.py's start '\n' (1 character) plus 299 generated characters. When the model predicts new character 300, t = 300 > block_size = 256.

**Not on the card:**
- It draws only a 5-character idx and toy block_size 2 to 5.
- 44, 45, 255, 300 and 500 are drawn on no state, grid and bar values included. 299 is drawn only as the block_size-3 count for other; it is in three of the five options, so it singles none out (44 separates them). A test asserts both, and that none of the six is in any visible text.
- There is no prompt/generated split and no numbered new characters.
- 256 appears only in the Source-value footer and status line 3.

**Other cards.** c24's drawn staircase stops at pass 8, and its gated reveal is a different case (a 6-character start at pass 5, t ≤ 10).

**Why it needs the rule.** The options are bare ranges: two leave out the newline and three are 256 characters long. Choosing needs t counted at the moment of prediction (1 + 299), a crop from the front (300 − 256 = 44), and no exception for the prompt.

**boundary_decision**

staged

**boundary_reason**

**One causal pipeline in data order:** idx → crop to the last block_size (idx_cond) → a prediction that can read only idx_cond (the toy table's row for exactly those characters) → p and the most likely next character. It is revealed in three stages, and the one control reaches every stage.

**Rubric:**
- 1-7, 10 and 11 do not hold;
- 8 holds for no cell or text: 70-unit cells, and '100.00' at 12 px or more;
- 9 does not hold (860 tall, scale 1).

**Expected boundaryFlags: none.** plan.boundary.reviewed = {}.

**Not merged into c24:** append-and-repeat is a different mental model; c23 is what the loop's first line does once idx is long.

**Collection candidates (noted, not built):**
- positions restarting at 0 inside idx_cond (model.py:174);
- the no-cache re-run cost (the Deep dive owns it);
- crop_block_size surgery (train.py:189-192, model.py:195-204);
- README's separately trained block_size-64 run (README.md:85/:88).

**sequence**

'Generation context', 3 of 3: c24-generation-loop → c25-autoregressive-conditioning → c23-context-window. The header reads 'Generation context · 3 of 3'; it already exists (board.js cardBlock, LearningBlocks.jsx:1025).

**Judge decision: join the sequence despite the different toy.** Batch 3, decision 4 turned down a representation switch that had no teaching reason. This one is forced: a one-character reader cannot be cropped. c25's closing contrast ('the toy reads one; NanoGPT reads up to 256') motivates a table that reads several characters, and status line 1 names the switch ('not NanoGPT, not the bigram'). There is no block_size 1 preset, so no count-based p(next | r) sits beside c25's trained-bigram rows.

```
boundary = {decision: 'staged', reason, reviewed: {}, sequence: {name: 'Generation context', position: 3, of: 3, relationships: [
  {type: 'prerequisite', card: 'c25-autoregressive-conditioning', direction: 'in'},
  {type: 'deepens', card: 'c24-generation-loop', direction: 'in'},
  {type: 'prerequisite', card: 'c01-forward-pass', direction: 'in'},
  {type: 'prerequisite', card: 'c09-token-plus-position', direction: 'in'}]}}
```

Module: src/nanogpt/cards/c23-context-window.js, scene id 'nanogpt-c23-context-window'. It is third in the batch-5 array.

**relationships**

- prerequisite <- c25-autoregressive-conditioning (direction 'in', in the sequence): the prediction is conditioned on the text before it. c23 bounds how much counts: block_size characters.
- deepens <- c24-generation-loop (direction 'in', in the sequence): c23 opens the loop's first line, model.py:314, which only bites once the appends have made idx longer than block_size.
- prerequisite <- c01-forward-pass (direction 'in'; frozen, typed as in the c11 → c13 precedent): the generation call site self(idx_cond), with no targets and only the last position projected.
- prerequisite <- c09-token-plus-position (direction 'in'): wpe = nn.Embedding(block_size, n_embd), which is why the forward asserts t <= block_size and generate() must crop.
- No typed link to c11-causal-mask: c11 is which earlier positions a position may read inside a window; c23 is where the window's left edge sits. Overlap note only.
- No typed link to c26-training-objective: its What-if 'window length T' trims the END of a training window and leaves every loss unchanged; c23 crops the FRONT at generation and the prediction changes.
- Depth-ladder board, tutor note only: alternative_explanation <-> Generation and sampling · Deep dive 1/4 'Crop, forward, last position'. It holds toy block_size 3 and switches the prompt; c23 holds the text and switches block_size. The block_size = 1 → bigram remark (from c25's critique) lives here as a tutor note.

**data_plan**

**Source values** (nothing typed):
- idx = fx.tokenizer.tokenizers[0].tokens.slice(0, 5) = B e f o r;
- block_size 256 = fx.architecture.block_size;
- the practice's start '\n' (length 1) and max_new_tokens 500 from g.sample (parsed from sample.py:14/:16).

**Calculated toy example (new).** depth/fixtures/gen_generation.py gains window() in build(), output g.window. It uses the script's training split (the first 90%, 1,003,854 characters) and, for each k, counts train[i+k] wherever train[i:i+k] == window:
```
{text: 'Befor', blocks: [2, 3, 4, 5], windows: ['or', 'for', 'efor', 'Befor'], cropped: ['Bef', 'Be', 'B', ''], slots: ['e', 'sp', 'd', 't', 'm', 'other'],
 counts: [[1035, 2461, 1300, 697, 134, 2049], [392, 1238, 133, 279, 90, 299], [339, 0, 33, 6, 7, 3], [31, 0, 0, 0, 0, 0]], matches: [7676, 2431, 388, 31]}
```
The judge re-computed these values.

**Generator asserts:**
- the text opens dataset line 2 and lies inside the train split;
- each window's top 3 is within the slots;
- each row sums to its matches;
- the block-3 row equals the existing BLOCK = 3 table's counts['for'] (gen_generation.py:108-111);
- --check is byte-identical.

**Structural, in the module:**
- blockLabels, keptIdxByBlock, bracket end x values;
- cropOpacity [1, 1, 1, 0];
- pctPerMatchByBlock = 100/matches (the evaluator has no division);
- slotLabels;
- the readout and caption strings (toFixed(2) from the fixture);
- the practice options from g.sample and fx.architecture.

**Live calculation:**
- countsRow = pick(countsByBlock, block);
- matches = sum(countsRow);
- pPct = scale(countsRow, pick(pctPerMatchByBlock, block));
- top = argmin(scale(pPct, −1));
- topLabel = pick(slotLabels, top);
- keptIdx, bracket ends, opacity and strings by pick.

**Tests** (plain-JS oracle):
- row sums equal matches;
- formatCell(count × 100 / matches) equals the caption and readout strings;
- top = [1, 1, 0, 0];
- keptIdx = the last k;
- the idx text = the tokenizer slice;
- matches prints as '7676' / '2431' / '388' / '31';
- practice: t = 300, first kept = 44, five distinct options, exactly one equal to the last 256, and 'ahead' ends at n;
- 44, 45, 255, 299, 300 and 500 appear in no visible text at any state; among every drawn value (labels, tokens, grid and bar values) at every review state and the practice state, 44, 45, 255, 300 and 500 never appear and 299 only as the block_size-3 other count.

There is no recorded run.

**Sources export:** calculation entries for Calculated toy example, Live calculation, What-if and Source value; tinyShakespeare (dataset); the code entries.

**capability_notes**

No new capability and no renderer primitive.

**In use:**
- one index picker;
- five heading-size text characters with derived opacity (dotted-path $derive 'charOps.i', no appear);
- a box with derived x and w behind idx_cond, and a short label at its derived x;
- one line with a derived end x above the row;
- short labels;
- derived opacity on the 'cropped' bracket and its label, which carry no appear;
- a 1 × 6 integer grid and a 1 × 6 decimal grid with no distribution claim;
- bars on a fixed peak of 100 with a derived cellHighlight (c16), plus a box and a text at x picked by the argmin;
- a prediction-role vertical line as a left rule beside the two caption lines;
- derive ops pick, sum, scale and argmin;
- {{}} interpolation of picked fixture strings;
- a choice practice with fixedInputs and no reveal (c26).

**Constraints:**
1. The pool rounds to 3 decimals, so captions use fixture strings asserted equal to formatCell of the live cell.
2. A zero bar draws 1 px; it is a measured zero.
3. '100.00' in a 70-unit cell clears the 12 px floor.
4. Width limits:
   - readouts are annotation at x 600 (the longest ends near x 920);
   - the rule line and the 'idx keeps…' line are about 100 characters of body type at x 40; split either one if textOverflow objects;
   - the status lines are annotation, 116 characters or fewer.
5. idx_cond, block_size and generate() pass citationsOnSurface, and no 'separately' or 'unrelated' appears.
6. The block_size-3 p row prints a total of 100.01; the legend covers it.

**Budget:** 38 of 60 objects, no pager.

**Gates:** assertCardGates at the 4 block states and the practice state; assertSources; assertCardPlan (no flags); pinnedFile line checks.

**overlap_check**

**Depth ladder, Generation and sampling · Deep dive 1/4** (another board). Its interactionPurpose: 'does a longer prompt change p (no - only the last block_size characters are read)'. It holds toy block_size 3 and switches the prompt, and adds shapes, the forward, the last position and the re-run cost. c23 holds the text and switches block_size. It shows which cropped character carried the prediction and that idx keeps it, with no shapes, logits, ÷T, top-k, softmax, draw, cat or re-run cost. The objective carries only that distinct part.

**Depth Overview:** no loop and no draws here.

**c21 and c22:** no temperature or top-k.

**c11:** no mask.

**c26:** its 'window length T' trims the end; c23 says block_size and 'front'.

**c01:** names the crop in one line; c23 draws it. **c09:** owns wpe; one footer line here.

**c24 and c25** (same sequence): c23 has no loop, no draws and no one-character reader. Its toy model differs and status line 1 says so.

**The most-likely highlight** is a measure of the crop's effect. No append follows it, so it does not cue greedy decoding the way c25's dropped highlight would have.

**Only c23 adds:**
- what a crop costs a prediction;
- a What-if on block_size, labelled as separate tables;
- idx keeps what idx_cond drops;
- no exception for the prompt, practised at NanoGPT's 256 scale.

**source_citations**

- model.py:312-314 (pinned 3adf61e, re-read): 'for _ in range(max_new_tokens):' / '# if the sequence context is growing too long we must crop it at block_size' / 'idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]'.
- model.py:315-316 '# forward the model to get the logits for the index in the sequence' / 'logits, _ = self(idx_cond)'.
- model.py:317-318 'logits = logits[:, -1, :] / temperature' (context).
- model.py:325-326 'idx_next = torch.multinomial(probs, num_samples=1)': the next character is drawn, not known.
- model.py:327-330 '# append sampled index to the running sequence and continue' / 'idx = torch.cat((idx, idx_next), dim=1)' / '' / 'return idx'.
- model.py:306-309: the generate() signature and docstring.
- model.py:173-174 'assert t <= self.config.block_size, f"Cannot forward sequence of length {t}, block size is only {self.config.block_size}"' / 'pos = torch.arange(0, t, dtype=torch.long, device=device) # shape (t)'.
- model.py:128 'wpe = nn.Embedding(config.block_size, config.n_embd),'.
- model.py:189-190 '# inference-time mini-optimization: only forward the lm_head on the very last position' / 'logits = self.lm_head(x[:, [-1], :]) …' (c01's; context).
- model.py:195-204 crop_block_size and train.py:189-192 ('if block_size < model.config.block_size:' / 'model.crop_block_size(block_size)' / "model_args['block_size'] = block_size"): collection candidate.
- config/train_shakespeare_char.py:19 'block_size = 256 # context of up to 256 previous characters'.
- train.py:147-148 'model_args = dict(n_layer=n_layer, n_head=n_head, n_embd=n_embd, block_size=block_size,' …; train.py:277-280 'checkpoint = {' … "'model_args': model_args,".
- sample.py:14 'start = "\n" …'; :16 'max_new_tokens = 500 …'; :37-40 ckpt_path / torch.load / "gptconf = GPTConfig(**checkpoint['model_args'])" / 'model = GPT(gptconf)'; :80-81 start_ids and x; :87-88 generate and 'print(decode(y[0].tolist()))'.
- README.md:51 (the 256-character context), :54 'python sample.py --out_dir=out-shakespeare-char', and :85/:88 (a separately trained block_size-64 model; sources note).
- data/shakespeare_char/prepare.py:38-40 'n = len(data)' / 'train_data = data[:int(n*0.9)]' / 'val_data = data[int(n*0.9):]'.
- Dataset: tinyshakespeare input.txt sha256 86c4e6aa9db7c042ec79f339dcb96d42b0075e16b8fc2e86bf0ca57e2dc565ed; 1,115,394 characters, train split 1,003,854. The counts after 'or', 'for', 'efor' and 'Befor' were re-computed by the judge.
- Repo:
- depth/fixtures/gen_generation.py:38 (BLOCK = 3) and :108-111; g.sample;
- generation/deep.js evidence (the prompt-switch crop); overview.js:119;
- c21 concept; c26-training-objective.js:66 and its activity pattern;
- c01-forward-pass.js:69; c09-token-plus-position.js:263-264;
- scene-derive.js (3-decimal rounding; pick, sum, scale, argmin; no division);
- scene-format.js formatCell and groupDigits (5 or more digits only);
- card-gates.mjs (textOverflow, citationsOnSurface, pinnedFile); card-plan.js boundaryFlags; board.js cardBlock.

**risks**

1. **Longer-is-better misreading.** The toy sharpens as block_size grows. The card never claims that longer predicts better or that NanoGPT counts. The default caption quotes 87.37% (388 matches), not 100% (31).
2. **Knob misreading.** Status line 2 ('one table each') and the footer ('fixed by the trained model') say block_size is not a sampling-time setting.
3. **Model switch inside the sequence.** Status line 1 names it; there is no block_size 1 preset. Visual review should confirm the '· 3 of 3' header plus that status line read as intended.
4. **Deep dive overlap.** It is the same operation; the objective carries only c23's distinct part.
5. **Word clash with c26.** Say block_size and 'front', never 'window length T'.
6. **Practice off-by-one.** Options are built from g.sample and fx.architecture; tests check that they are distinct, that exactly one is the last 256, and that 'ahead' ends at n.
7. **Rounding.** The block_size-3 row totals 100.01, and the legend covers it. Strings equal formatCell(live), and 4-digit matches print ungrouped.
8. **State clarity.** Only one prediction state exists (the most-likely highlight and its column frame). 'cropped' reads as still in idx: dimmed, not removed, under a bracket above the row, readout 'cropped from the prompt, still in idx'. 'other' is a pooled bucket with a legend and neutral style.
9. **Pixels.** Bracket above the row, idx_cond box on it; readouts clear of the '→ ?' slot. Screenshot all 4 reviewStates from a clean browser.

## c22 · Top-k: truncating the distribution

**concept**

Top-k sampling in NanoGPT's generate(). It is optional and runs on the last position's logits after ÷ T (model.py:318) and before softmax (:324), in :319-322.

1. torch.topk(logits, min(top_k, logits.size(-1))) finds v_k = v[:, [-1]], the k-th largest logit; k is capped at V.
2. Every logit strictly below v_k becomes −Inf; a tie with v_k survives.
3. Softmax gives each cut candidate exactly 0 (e^−∞ = 0) and shares the whole 1 among the survivors. Each survivor's new p is its uncut p ÷ the kept mass, so the survivors keep their relative odds.
4. torch.multinomial (:326) draws in proportion to p, so p = 0 is never drawn.
5. top_k = 1 leaves one survivor unless the top logits tie; generate() has no argmax branch.

**NanoGPT's defaults cut nothing.** generate() defaults to top_k = None (:306), and sample.py sets top_k = 200 (:18), above shakespeare_char's 65 characters.

**Contrast with c21 (frozen).** ÷ T rescales the gaps between logits and in exact arithmetic never makes a probability 0; top-k keeps the survivors' ratios and zeroes the rest.

**one_sentence_objective**

After this card, the learner should understand that top-k sets every logit below the k-th largest to −∞, so softmax gives those candidates probability exactly 0 and shares the whole 1 among the candidates that remain, each in proportion to its old probability.

**prerequisites**

- c21-temperature (frozen, batch 1): generate() takes the last position's logits, applies ÷ T and softmax, then makes one random draw from p. c22 reuses c21's six toy candidates after “First Citi” (z e t s a sp) and their T = 1.0 row, and contrasts with c21's 'a .00 cell is rounded, not zero'.
- c24-generation-loop (Generation context · 1 of 3; earlier on the board, not required): where the draw sits in each pass. c22 says where in that step the cut runs.
- A larger logit gives a larger probability (softmax keeps the order). Named on c16 and c21, not taught; the practice relies on it.
- 'The k-th largest value' is taught in place: the logits are shown largest first, and a readout names v_k and its ordinal.

**causal_steps**

One staged pipeline. The replay reveals it over about 1.6 s; at rest everything is drawn.

1. **① The logits** (T = 1.0): c21's toy z 3 · e 2 · t 1 · s 0.5 · a 0 · sp −1, largest first.
2. **v_k** (model.py:321): the k-th largest logit, capped at V. The survivors are ringed, and a readout gives v_k and its ordinal.
3. **The cut** (:322): every logit strictly below v_k becomes −∞. A '−∞' mark appears under each cut cell; a tie would survive (the toy has none).
4. **Softmax** (:324):
   - ② the uncut p, the fixed reference;
   - ③ softmax after cut (p after top-k), with cut cells blank (exactly 0) and each survivor = its uncut p ÷ the kept mass;
   - bars of ③, where a cut candidate has no bar.
5. **Consequence** (:326): multinomial draws in proportion to p, so a blank candidate is never drawn. This is a per-k caption; no draws are recorded.

**Replay:**
- 0 s: ① and ②
- 0.4 s: the survivors' ring and the −∞ marks
- 0.8 s: ③
- 1.2 s: the bars
- 1.4 s: the bars' top line

What-if objects have no appear.

**primary_interaction**

**Controls.** One visible control in INTERACT: 'topK', an index slider labelled 'top_k (preset)'.
- kLabels: ['1', '2', '3', '4', '5', '6 (nothing cut)'] (bare values, so the practice's lock line reads 'top_k = 2', not '= k = 2'; the learner phrasing, scene-inputs.js describeInputForLearner, drops the index and the '(preset)' qualifier - owner, 2026-09-29)
- default 1 (k = 2)

There is also a hidden bool 'revealed' (default false), owned by the practice (c14 pattern).

**Layout** (960 × 771, the padded content at scale 1; cell 59).

Header at x 40:
- y 30, heading (68 characters): 'When top-k cuts the smaller logits, where does their probability go?'
- y 56 (annotation): 'Logits: Calculated toy example · p, kept and cut mass: Live calculation · top_k defaults, 65: Source value'
- y 78: 'Builds on: temperature (÷ T, softmax, one random draw) · the same six candidates after “First Citi”'
- y 100: 'Each generate() pass (the generation loop): last position’s logits ÷ T → top-k (if set) → softmax → one random draw'

Rows (names at x 40 in caption type, data at x 200):
- ① logits (T = 1.0): grid at y 160 (review fix: its column labels sat 7 px under the header and read as part of it; now the header-to-labels gap exceeds the labels-to-grid gap), cellHighlight = keptIdx (kind 'highlight'). Review fix, the kept/cut split read only from ③: the survivors (always the first k columns, the logits being descending) sit in a box in ③'s green (role output), 5 px outside their cells on the left, top and bottom, drawn first so the cells sit on it, width derived per k. Second review fix: the box's right edge is the kept/cut divider (x 200 + 59k), so no cut cell is inside it (it stood 5 px into the first cut cell); at k = 6 nothing is cut and it clears the grid by 5 px. The '−∞' marks are five display-type texts (baseline y 257), one centred under each of columns 1-5, each printing '−∞' when its column is cut and a blank otherwise (none at k = 6). Second review fix: as chips they looked like the Practice answer buttons, and ∞ at the chips' 13 px mono size was 4 px tall; at the display size it is about 11 px, taller than the annotation text;
- ② p, no cut: y 276;
- ③ softmax after cut: y 352, null cells drawn as the blocked band (c11).

② and ③ have fixed [0, 1] heat, and each cell rounds its own p to 2 decimals (no distribution: true). So ② prints .60 .22 .08 .05 .03 .01 and totals 0.99, as ③ does at k = 5 and 6 (the first footer line says a row can total 0.99). Review fix: sum-to-1.00 rounding printed z's 0.6048 as 0.61, so at k = 2 ② 0.61 ÷ 0.827 = 0.74 sat beside ③'s 0.73, and at k = 5 z stayed 0.61 while e rose 0.22 → 0.23, as if the cut went to a lower survivor. distribution: true stays on the What-if row and the bars (bars print no numbers).

Bars of ③: y 440, h 120, peak 1. Their top line (p = 1) is at y 444, 33 px under ③, labelled 'p = 1' at its left end (review fix: 'top line: p = 1' sat 70 px below it in the name column, and the line read as a divider under ③).

What-if band: y 600-659. Before the reveal it holds an annotation placeholder, 'What-if (k = 2): fills in after you check a Practice answer' (opacity choose(revealed, 0, 1)), so the band never reads as missing content.

Static footer at x 40 (annotation, 116 characters or fewer), y 690, 710, 730:
1. 'A blank cell is exactly 0, never drawn; a .00 cell (the temperature card) is only rounded, so a row can total 0.99.'
2. 'Source value: generate() cuts nothing by default (top_k = None); the sampler sets 200, above all 65 characters.' 200 and 65 are JS literals from the fixtures; no file name on the card.
3. Last, below the What-if band: 'Shown largest first; NanoGPT keeps vocabulary order and compares each logit with v_k (a tie with v_k survives).'

Readouts at x 572 (body, 41 characters or fewer, as templates and filled; every filled line ends inside the widest static footer, so the frame never moves):
- 'top_k = {{kValue}} · v_k = {{vk}}' (v_k printed as its ① cell, e.g. 2.00, so it never reads as k)
- 'v_k = the {{kth}} largest logit'
- '{{kLine}}'
- '{{keptCount}} of 6 can be drawn'
- 'cut: {{cut}}, which held {{cutMass}}'
- 'kept: {{keptNames}} held {{keptMass}}'

Annotations at x 572 (review fix: 'new p = old p ÷ {{keptMass}}: same ratios' could not be checked against 2-decimal cells, so the rule is printed where it can be):
- '{{factorLine}}': 'every kept p × 1.209 (= 1 ÷ 0.827)' at k = 2, the common factor to 3 decimals;
- '{{oldNew}}': 'z 0.6048 → 0.7311 · e 0.2225 → 0.2689' at k = 2, z's and e's p before and after to 4 decimals ('e … → 0, cut' at k = 1);
- '{{consequence}}'

No derive op divides, so the factor and the 4-decimal pairs are built in the module per k from the same softmax op; old p × the factor matches new p within 0.001.

The per-k strings:

| | k 1 | k 2-5 | k 6 |
|---|---|---|---|
| kLine | every logit below v_k → −∞ | every logit below v_k → −∞ | nothing is below v_k: no cut |
| consequence | only z is left: every draw is z (greedy) | softmax: −∞ → p exactly 0, never drawn | ③ = ②; sp: 0.01 in ③, bar too thin to see |

Review fix (k = 6): sp's 0.0111 bar is about 1 px on the p = 1 axis and hides under the baseline, so the caption points at ③'s 0.01 cell instead of claiming a visible sliver.

**States:**

| k | v_k | kept mass | cut mass | ③ |
|---|---|---|---|---|
| 1 | 3 | 0.605 | 0.395 | 1.00 |
| 2 | 2 | 0.827 | 0.173 | .73 .27 |
| 3 | 1 | 0.909 | 0.091 | .67 .24 .09 |
| 4 | 0.5 | 0.959 | 0.041 | .63 .23 .09 .05 |
| 5 | 0 | 0.989 | 0.011 | .61 .22 .08 .05 .03 |
| 6 | −1 | 1 | 0 | = ② (.60 .22 .08 .05 .03 .01) |

Each ③ cell is rounded on its own; the factor is 1.653, 1.209, 1.100, 1.043, 1.011, 1.000.

**What it reveals:** the cut mass goes to the survivors in proportion (p(z)/p(e) = e ≈ 2.72 at every k ≥ 2), and the cut ones drop to exactly 0. k = 1 is the greedy case, which c21 says temperature does not reach.

**reviewStates:** [{topK: 1}, {topK: 0}, {topK: 2}, {topK: 5}, {topK: 1, revealed: true}, {topK: 5, revealed: true}].

**check_practice**

**Practice (commit before you see).** It supersedes the section 5 row, whose answer was drawn.
- id: 'c22-practice'
- check: 'choice_equals'
- version: 1
- fixedInputs: {topK: 1} (k = 2)
- revealInput: 'revealed'

**Prompt:** 'The card is at top_k = 2. Suppose a different model gave these six probabilities before any cut (not drawn): 0.45, 0.15, 0.13, 0.11, 0.10, 0.06. With top_k = 2, what would the two survivors' probabilities be?'

**Options.** Built in the module from the pool. The default 'same' never renders (c14-mlp.js:158-159).

| id | option | belief it catches |
|---|---|---|
| same | '0.45 and 0.15' | no renormalization; the row sums to 0.60 |
| even | '0.65 and 0.35' | the cut 0.40 is split evenly |
| top | '0.85 and 0.15' | all of it goes to the top one |
| proportional (expected) | '0.75 and 0.25' | correct |

**feedbackPass:** 'Right. top_k = 2 keeps the two largest logits; the other four become −∞, so their 0.40 is gone and softmax shares the whole 1 over what is left: each survivor ÷ 0.60, the kept mass. 0.45 → 0.75 and 0.15 → 0.25, still 3 to 1. The What-if row now shows it.'

**feedbackFail:** 'Not quite. The cut four get exactly 0; softmax shares the whole 1 over the survivors in proportion to their old p, each ÷ 0.60 (the kept mass): 0.75 and 0.25. “0.45 and 0.15” sums to 0.60, not 1; an even split or all to the top one breaks the 3 : 1 ratio. The What-if row now shows it.' (Review fix: two lines at the practice panel's width, like feedbackPass; the shared panel draws the whole line in the error colour.)

**Reveal** (additive, no appear):
- row name 'What-if (k = 2)', with opacity choose(revealed, 1, 0);
- a 1×6 grid, values gate(softmax(whatIfMasked), revealed) = [.75, .25, blank × 4], role output like ③, so its four cut cells are ③'s blocked band (review fix: they were grey empty cells);
- two captions at x 572 via choose(revealed, line, ' '): 'other model’s p: 0.45, 0.15 · 0.40 cut' (review fix: it names itself another model, not z … sp) and 'each ÷ 0.60 → 0.75, 0.25 (3 : 1 kept)'.

**undrawn_case**

The distribution 0.45, 0.15, 0.13, 0.11, 0.10, 0.06 cut to top_k = 2: survivors 0.75 and 0.25, kept mass 0.60, cut mass 0.40.

**Not on the card before a committed attempt:**
- The distribution appears only in the prompt.
- No cell, readout or caption at any k shows 0.45, 0.15, 0.60, 0.40, 0.75, 0.25, 0.65, 0.35 or 0.85, with one exemption: z's own uncut p, 0.6048, prints 0.60 in ② at every k and in ③ at k = 6, because each cell rounds on its own (see Layout). It is z's p on this card, not the What-if's kept mass, and it matches no option. Every other 0.60, and every other listed number in any cell or text, fails. A test asserts this at every preset with revealed false.
- The What-if values are gated to null and its captions are blank.

**Why it needs the rule:** 'every kept p × 1 ÷ the kept mass' is shown only on the card's own six numbers (the factor line and z's and e's p before and after).

**Why the picture misleads:** 'the cut mass goes to the survivors' fits three wrong answers. z's absolute gain at k = 2 (+0.126) dwarfs e's (+0.046), which invites 'the top takes it'.

**boundary_decision**

staged

**boundary_reason**

One mental model: cut the tail, then renormalize the rest in proportion. The steps are causally dependent: the cut needs v_k, softmax reads the cut row, and the zeros and the proportional survivors are one softmax result. Under staging-before-splitting they stay one card.

**Rubric:**
- 1 and 11 do not hold: a cut without renormalization is not a distribution, and renormalization without a cut is c21's softmax;
- 2, 3, 4, 6, 9 and 10 do not hold;
- 5 does not hold: every row but the fixed reference ② follows k.

**Expected boundaryFlags: none.** plan.boundary.reviewed = {}.

**Not merged into c21:** c21 is frozen, and reshaping all odds (temperature) and zeroing the tail while keeping the odds (top-k) are separate models.

**sequence**

**None** (judge decision). plan.boundary.sequence is omitted, and the header shows 'Animation' (board.js:65).

**Why none:**
- c21, the only same-concept partner, is frozen with no plan export, so it cannot be a member.
- The Generation context path (c24 → c25 → c23) does not need top-k: sample.py's top_k = 200 ≥ 65 cuts nothing.

**Board order:** last in the batch-5 array, after c23. Top-k is an optional branch off the draw step the loop makes, and the path that teaches where that step sits comes first. The sequence cards stay contiguous.

**Collection candidate, noted but not built:** 'Sampling' (c21, c22, the depth ladder's Generation · Guided and Deep dive).

Module: src/nanogpt/cards/c22-top-k.js, scene id 'nanogpt-c22-top-k'.

**relationships**

- prerequisite <- c21-temperature (direction 'in'; frozen, not reopened): c22 reuses c21's six candidates and T = 1.0 row as ②, and applies the step c21 cites but does not apply (c21-temperature.js:187). With no sequence there is no header-free typed field, so the link lives in plan.prerequisites, the 'Builds on' line and the plan doc (ponytail until the Phase 2 data model).
- Tutor note: c24-generation-loop (Generation context · 1 of 3). Its per-pass draw (÷ T → optional top-k → softmax → multinomial) is where this cut runs when top_k is set. c22 is not a prerequisite of c24.
- Tutor note, same move elsewhere: c11-causal-mask. −∞ → exactly 0 → renormalize over what is left, on attention scores; c22 shares c11's blocked-band look for exact zeros.
- Depth-ladder tutor note (another board): alternative_explanation <-> Generation and sampling · Deep dive 2/4 and 3/4 (top-k inside the whole generate() step, with shapes, equations and T).

**data_plan**

**No new fixture and no generator change.**

**Calculated toy example, reused:** fx.temperature logits [3, 2, 1, 0.5, 0, −1] over z e t s a ␣ after 'First Citi', with the space shown as 'sp'. The logits are strictly descending, which a test asserts.

**Calculated toy example, new (What-if):** p' = [0.45, 0.15, 0.13, 0.11, 0.10, 0.06].
- whatIfLogits = p'.map(Math.log) in the module;
- whatIfMasked = [l0, l1, null × 4].

**Per-k, in the module, by generate()'s rule:**
```
vk(k) = sorted desc[min(k, 6) − 1]
masked(k) = logits.map(x => x < vk ? null : x)
```

**exampleData:**
- kLabels, kValues, ordinals, kPosByK
- logits, display
- maskedByK, keepByK
- keptIdxByK, cutMarksByK
- keptNamesByK, cutNamesByK
- kLineByK, consequenceByK
- logitTexts (v_k as its ① cell prints it)
- factorLineByK, oldNewByK (built per k from the same softmax op; see Annotations)
- one = [1]
- whatIfLogits, whatIfMasked
- wBefore, wAfter, blank (the What-if captions and their blank)

**Source values as JS literals at load:**
- 200 = g.sample.top_k.value (sample.py:18);
- None = g.generateDefaults.top_k (:306);
- 65 = fx.tokenizer char vocabSize.

**Live calculation:**
- masked and keep by pick;
- pAll = softmax(logits); pCut = softmax(masked), null-aware (scene-derive.js:106-125);
- keptMass = dot(pAll, keep); cutMass = pick(sub(one, concat(keptMass)), 0); keptCount = sum(keep);
- vk, kth, names, keptIdx, cutMarks, kLine, consequence, factorLine and oldNew by pick;
- pWShown = gate(softmax(whatIfMasked), revealed);
- whatIfOp and the What-if lines by choose.

**Oracle values:**
- pAll = 0.6048 / 0.2225 / 0.0819 / 0.0496 / 0.0301 / 0.0111;
- kept masses 0.605 / 0.827 / 0.909 / 0.959 / 0.989 / 1;
- pCut at k = 2 → [0.731, 0.269];
- What-if → [0.75, 0.25].

**Tests** (plain-JS oracle):
- the logits are descending;
- the masks match the torch rule, including min(k, V);
- pCut = pAll ÷ keptMass on survivors and sums to 1;
- p(z)/p(e) is invariant for k ≥ 2;
- softmax(ln p') = p';
- the options are distinct and 'proportional' is expected;
- no answer number appears in visible text or cells with revealed false (z's own 0.60 cell exempt, see undrawn_case), and the What-if values are null and its captions blank;
- the printed numbers obey the printed rule: the factor line divides by the printed kept mass, z's and e's 4-decimal old p ÷ kept mass and × factor land within 0.001 of new p, and no drawn cell leaves a survivor unchanged while a lower one rises;
- the static bounds equal the revealed bounds;
- pinnedFile checks of model.py 306, 318, 320-322, 324 and 326, and sample.py 18;
- assertCardGates over 6 presets × revealed, plus assertCardPlan, assertSources and assertEvidence.

**capability_notes**

No new renderer primitive, no new derive op and no shared change. The compare against v_k is not in DERIVATIONS (board plan section 1 lists top-k as absent, so it is precomputed per k). Everything downstream is live.

**null, not −1000, for the cut.** An exact 0 prints '0.00', the same as a rounded small p (scene-format.js:58-64). null draws c11's blocked band, and a null bar draws nothing (AnimatedScene.jsx:300).

**In use:**
- an index slider plus a hidden-bool revealInput (c14);
- a derived cellHighlight list;
- five '−∞' texts at pitch 59, their text picked per k (blank when kept), and a box with a derived width ringing the survivors up to the kept/cut divider;
- fixed [0, 1] heat; ② and ③ round each cell on its own, and distribution: true is only on the What-if row and the bars;
- bars with peak 1;
- a choice practice with fixedInputs;
- What-if values gated and text choose()d (c14-mlp.js:81-86).

**Layout:** everDrawn ignores derived-opacity objects (scene-layout.js:235-241), so a static footer caption sits below the What-if band. The frame measures unfilled {{…}} templates, so every template obeys the width limits.

**Sources:** no 'What-if' calculation source, because assertSources checks the default state; p' is described under 'Calculated toy example'.

**Budget:** 37 of 60 objects.

**overlap_check**

**c21-temperature (frozen):** 'What does dividing the logits by a temperature do - and does a low temperature make it greedy?'. c22 has no T control and no draws. It uses c21's T = 1.0 row only as reference ②, and teaches exact zeros and preserved ratios. Its k = 1 draws the greedy case c21 says temperature does not reach, which is a contrast.

**Depth Generation · Overview and Guided:** no top-k.

**Deep dive 2/4 and 3/4** (another board) covers top-k inside generate() with the uncut-p ÷ kept-sum identity at one state (k = 3, T = 0.8). c22 differs:
- different toy data;
- one control;
- no shapes, equations, crop or draws;
- before/after rows plus bars answering where the cut probability goes;
- a practice on proportional sharing over an undrawn distribution.
The shared facts (200 ≥ 65, greedy at k = 1) appear once each.

**c11:** the same −∞ → 0 → renormalize move, on attention scores.

**The Generation context path** (c24, c25, c23): none shows top-k; c24 keeps top_k = 200 in sources only.

**c16, c26, c19 and c01:** no overlap.

**Section 5 row 22** is superseded. **Inventory row 22** is unchanged.

**source_citations**

- karpathy/nanoGPT@3adf61e model.py:306 'def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):' (top-k off by default; re-read by the judge).
- model.py:317-318 'logits = logits[:, -1, :] / temperature': the last position, divided by T before the cut.
- model.py:319-322 '# optionally crop the logits to only the top k options' / 'if top_k is not None:' / 'v, _ = torch.topk(logits, min(top_k, logits.size(-1)))' / "logits[logits < v[:, [-1]]] = -float('Inf')": k is capped at V; strictly below becomes −Inf, so ties survive.
- model.py:323-324 'probs = F.softmax(logits, dim=-1)': −Inf becomes p exactly 0 and the survivors renormalize.
- model.py:325-326 'idx_next = torch.multinomial(probs, num_samples=1)': always a random draw in proportion to p. :312-330 has no argmax branch.
- sample.py:18 'top_k = 200 # retain only the top_k most likely tokens, clamp others to have 0 probability' (parsed into depth/fixtures/generation.generated.js sample.top_k); sample.py:87 passes it to generate().
- README.md:54 'python sample.py --out_dir=out-shakespeare-char'. data/shakespeare_char/prepare.py:24-25 give V = 65, so the cap cuts nothing at that setting.
- Repo:
- generate_fixtures.py temperature() (:381-395): the toy logits (fx.temperature);
- scene-derive.js :106-125 (null-aware softmax), :233-246 (gate), :204-210 (choose), :263-277 (pick), :82-89 (dot), :49-73 (distributeRounding);
- scene-format.js:58-64; AnimatedScene.jsx:300;
- scene-layout.js:224-233, 235-241, 262-264;
- card-gates.mjs:101-116, 160-163, 186-190.
- Repo precedents:
- c14-mlp.js:43, 70-86, 151-166;
- c11-causal-mask.js:40-41 and :96-103;
- deep.js:74-75, 239-241 and :264;
- c21-temperature.js:111 and :187.

**risks**

1. **Ring on the logits row.** The cellHighlight ring alone was too faint (visual review: kept and cut borders differed by a few RGB steps, and the −∞ labels were the faintest text on the card), so the survivors also sit in a green box and the −∞ marks are display-size text (chips read as buttons); ① now names the survivors on its own.
2. **Mechanism overlap** with the depth Deep dive (another board). The unique content is the before/after rows, the proportional reading and the practice.
3. **Different numbers, same context.** The 'First Citi' context carries different toy numbers from the Deep dive's ln-count toy; the status line says Calculated toy example.
4. **Empty band at default.** The What-if band (about 60 px) would be empty before the reveal, so it holds a neutral annotation placeholder; the revealed state keeps scale 1 (as on c14).
5. **The practice gives probabilities, not logits.** It relies on softmax keeping the order; the prompt lists p in descending order.
6. **Multinomial wording.** Keep it to 'p = 0 cannot be drawn'.
7. **Default k = 2 shows two survivors;** k = 3 to 5 show the ratio across more.
8. **Placement.** c22 sits far from c21 (batch-1 order is frozen) and after the Generation context path. The link rests on the Builds-on line, plan.prerequisites and the plan doc.
9. **Rounding differs from c21 (owner tradeoff, routed to NC9).** ② is c21's T = 1.0 row, but c21 (frozen) keeps distribution: true and prints z's 0.6048 as 0.61, while ② rounds each cell on its own and prints 0.60 (the Layout review fix). The first footer line says a row can total 0.99. c21 is not reopened; whether the two cards should print the same cell is an NC9 coherence item, like c26's checkpoint. Resolved in NC9: c21’s probability grid now rounds each cell on its own (no distribution: true), so its T = 1.0 row prints ②’s 0.60 0.22 0.08 0.05 0.03 0.01; its live-note says a row can total 0.99 or 1.01. c22's rounding unchanged (its builds-on now says hand-set and its blank-note says 0.00).
