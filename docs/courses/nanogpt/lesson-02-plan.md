# Lesson 2 material plan: GPT architecture overview

Status: draft for owner review. Authored in this coding session as a Learn Agent-style artifact; not generated through the application's Learn Agent. No pages rendered, no media generated, notebook not executed.

Course: [nanoGPT Quickstart](quickstart-curriculum.md).
Lesson ID: `nanogpt-quickstart-02`. Plan revision: 1.
Source commit: `3adf61e154c3fe3fca428ad6bc3818b27a3b8291`.
Curriculum approval: pending. Plan approval: pending.

## Brief

Objectives:

- `embed-tokens`: explain why a token ID selects a learned vector and identify which embedding row a given ID selects.
- `order-matters`: explain what positional embeddings add and why two identical tokens at different positions enter the blocks with different vectors.
- `read-the-head`: state what the language-model head outputs per position (one logit per vocabulary entry) and that logits are raw scores, not probabilities.

### Planned evidence of understanding

| Check ID | Objective | Learner action | Evidence |
|---|---|---|---|
| `embedding-row` | `embed-tokens` | Page 1: click token tiles, then answer which table row ID `2` selects | Row choice and correctness; expected row `2`, the same row for both `l` tiles |
| `position-sum` | `order-matters` | Page 2: answer whether the two `l` positions enter the first block with identical vectors | Yes/no choice and correctness; expected No |
| `logits-count` | `read-the-head` | Page 4: enter how many logits the head produces per position with a 65-entry vocabulary | Number and correctness; expected `65` |

The three rows above are the objective-linked checks. The three quiz questions
reinforce the same objectives as optional review; they are not additional core
checks. Recording, retry, reveal and skip semantics follow the Lesson 1 rules:
record learner/course/lesson/plan revision, check ID, objective ID, attempt
number, response, correctness and prior reveal on explicit submission; first
attempt and eventual success stay separate; a reveal without an answer is
reviewed, not correct; playback progress is independent of check completion.
Required participation is reaching playback's end plus submitting the three
core checks. Quiz, flashcards and notebook remain optional activities that
never block completion or navigation to Lesson 3.

Audience assumption for review: learners who completed Lesson 1: they can
encode/decode with a toy character vocabulary and can state the next-token
prediction task. No linear-algebra background is assumed beyond adding lists of
numbers elementwise; call the rows vectors and demonstrate addition concretely.

The six page budgets total 420 seconds of guided explanation. Time spent paused
on checks or reading is additional. These are design estimates, not measured
completion times. Do not advertise the lesson as a seven-minute task.

Teaching direction: continue the owner's requested Andrew Ng-inspired
progression: motivate a concrete problem, build intuition, work through a
small example, introduce notation only when it helps, check understanding,
connect onward. Original wording, no impersonation. The running example remains
`Hello` with the Lesson 1 toy IDs `[0, 1, 2, 2, 3]`; the repository's actual
Shakespeare vocabulary (65 entries) is distinct from the invented teaching
vocabulary and is labeled whenever it appears.

Page progression: why IDs need vectors → positions → the block stack → final
norm and head → the assembly in `model.py` → synthesis. This is a shapes-and-
data-flow lesson. Defer attention internals (Lesson 3), MLP/LayerNorm/residual
detail (Lesson 4), loss (Lesson 5), optimization and dropout behavior
(Lesson 6), and sampling controls (Lesson 7). Inside-the-block description
stays at "positions share information, then each position reworks its own
vector," attributed as a preview, not an explanation.

Visual direction: this lesson is diagram-first. Every page's primary asset is a
drawn structure (tables, towers, funnels), not paragraphs. Reuse the Lesson 1
tile visual language for `Hello`. Highlight definitions as emphasized cards.
Keep all displayed numbers either verified repository values (65, 6, 6, 384,
256, 10.65M) or explicitly labeled invented toy values (the 3-number rows).

## Timing

- **Guided explanation:** ~7 min
- **Quiz and review:** self-paced
- **Optional notebook:** ~7 min, pending testing

Playback estimate only; answering checks and optional reading add time.

## Page 1 — Why can't the model use IDs directly? (~65 seconds)

### Canvas text

- Heading: **From ID to vector**.
- Recap tiles: `H`, `e`, `l`, `l`, `o` over IDs `[0, 1, 2, 2, 3]`.
- Problem statement: **An ID is a label. Is l + l = o? Arithmetic on labels is meaningless.**
- Toy token-embedding table: five rows labeled 0–4, each with three invented numbers.
- Lookup arrows: ID `2` → row 2. Both `l` tiles point at the same row.
- Definition card: **Embedding = the learned vector a token ID selects. Training adjusts its values; the ID never changes.**
- Note: **Toy table: 5 rows × 3 numbers. The Shakespeare model: 65 rows × 384 numbers.**
- Check prompt: **Click a tile, watch its row light up. Which row does ID 2 select?**
- Transition: **Both l tiles fetch the same row. How does the model tell the two positions apart?**

### Assets

**Canvas diagram:** the Lesson 1 character tiles with their ID row beneath, an
arrow into a five-row table, and per-tile lookup arrows. Table values are
clearly invented (e.g. `0.40, 0.40, 0.00`) and labeled illustrative; no claim
that any trained model contains these numbers.

**Canvas interaction: `embedding-row`:** clicking a character tile highlights
its ID and the selected table row together. Clicking either `l` highlights the
same row 2, visibly. After exploration, the check asks which row ID `2`
selects, with row choices 0–4 and Check answer. Correct feedback: "Row 2: and
both l tiles select it. One entry per token type, not per position." Incorrect
feedback names the actual lookup. Keyboard-operable per the Lesson 1
interaction rules; selection state announced without relying on color.

**Further explanations:** a static two-column contrast card: "ID: which entry"
versus "Embedding row: values the model computes with": reusing the table
asset. Alt text: "ID 2 names a table entry; row 2 holds three adjustable
numbers used in computation."

**Images, videos, plots or external assets:** none. The lookup must be exact;
structured tiles and a drawn table communicate it precisely.

### Drawing sequence

1. Title: **From ID to vector**.
2. Bring back the `Hello` tiles with IDs `[0, 1, 2, 2, 3]` from Lesson 1.
3. Pose the problem: arithmetic on labels is meaningless. Short pause.
4. Draw the five-row toy table, one row at a time, values visible.
5. Draw lookup arrows from each tile's ID to its row; emphasize both `l` tiles landing on row 2.
6. Reveal the definition card and the toy-versus-Shakespeare size note.
7. Invite the tile interaction and the `embedding-row` check, then show the transition question.

### Spoken or written explanation

"Welcome back! Last time, Hello became the IDs zero, one, two, two, three. Now here is the problem: two is just a name. If we ask the computer to do math with names (is l plus l equal to o?) we get nonsense. So instead, every vocabulary entry gets its own row of adjustable numbers, called an embedding. Seeing ID two means: fetch row two. Both l characters fetch the very same row: identical twins, remember? The values start out random, and training tunes them. Our toy table has five rows of three numbers; the Shakespeare model has sixty-five rows of three hundred eighty-four. Try it below: click a tile and watch its row light up. Then a puzzle: if both l tiles fetch the same row, how does the model tell them apart?"

### Further explanations

#### Why a lookup label is not enough

Lesson 1 ended with text as integer IDs. IDs solve identification: same
character, same ID, reversible. But a neural network computes: it multiplies
and adds its inputs. Feeding the raw ID `2` into arithmetic would make `l`
"twice" `e` and half of `[space]`, relationships we never intended. The fix is
indirection: use the ID only to select, and give every vocabulary entry its own
list of numbers to be the actual input.

Those lists are vectors: here, just fixed-length lists of numbers. The table
of all of them is the token-embedding table. Its shape is decided by two
numbers: how many entries the vocabulary has (rows) and how many numbers
represent each token (columns). The column count is this lesson's recurring
quantity: nanoGPT calls it `n_embd`.

#### Work the lookup by hand

**Reuse the toy table beside this code.** The values are invented for
readability; a real model's values come from training and initialization.

```python
n_embd = 3  # toy width; the Shakespeare model uses 384
token_table = [
    [0.10, -0.20, 0.30],   # row 0: H
    [0.00, 0.50, -0.10],   # row 1: e
    [0.40, 0.40, 0.00],    # row 2: l
    [-0.30, 0.20, 0.10],   # row 3: o
    [0.05, 0.00, -0.25],   # row 4: space
]
ids = [0, 1, 2, 2, 3]      # Hello, from Lesson 1
vectors = [token_table[token_id] for token_id in ids]
print(vectors[2])
print(vectors[3])
assert vectors[2] == vectors[3]
```

The two `l` positions produce the same vector because the lookup only sees the
ID. That is exactly the unresolved problem this page ends on.

#### What "learned" means here

The table's values are parameters: the adjustable numbers from Lesson 1's
Page 4. Training nudges them so that tokens end up with vectors useful for
predicting continuations. Nothing about row 2's values is hand-designed to
mean "the letter l"; usefulness emerges from the updates. We make no claim
about what any individual number means, and this lesson never inspects a
trained table's values.

In `model.py` the table is one line: `nn.Embedding(config.vocab_size,
config.n_embd)`, named `wte`: weights, token embedding. PyTorch's
`nn.Embedding` is precisely a lookup table with adjustable rows.

#### Check the boundary

If we renamed ID 2 to ID 4 everywhere, and swapped rows 2 and 4 to match,
would the model behave differently? No: the pairing of token type to row is
what matters, not the integer's size. This confirms Lesson 1's "IDs are
labels" with the table in view. What the lookup cannot fix on its own: two
occurrences of the same token still look identical. That needs the next page.

### References and further reading

**Repository: the table:** [model.py, line 127](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L127) inside the transformer module dict. One `nn.Embedding` with `vocab_size` rows and `n_embd` columns.

**Online explanation: start here:** [PyTorch: nn.Embedding](https://docs.pytorch.org/docs/stable/generated/torch.nn.Embedding.html). Read the first description line: "A simple lookup table that stores embeddings of a fixed dictionary and size." The parameters `num_embeddings` and `embedding_dim` are this page's rows and columns.

## Page 2 — How does the model know where a token sits? (~65 seconds)

### Canvas text

- Heading: **Add where you are to what you are**.
- Reminder: **Both l tiles selected row 2. Same vector: a problem.**
- Second table: **Position-embedding table: one learned row per position, 0 up to the context window.**
- The sum, per position: **input vector = token row + position row**.
- Worked pair: position 2: `row 2 + position row 2`; position 3: `row 2 + position row 3`.
- Result caption: **Same token row, different position rows: the sums differ.**
- Definition card: **The model's input is one vector per position: token embedding + position embedding. From here on, no letters: only vectors.**
- Check: **Do the two l positions enter the first block with identical vectors?** Yes / No. Answer: **No: the added position rows differ.**
- Footnote: **nanoGPT learns this position table (wpe). It is not computed from a fixed formula.**
- Transition: **What does the model do with these vectors?**

### Assets

**Canvas diagram:** two stacked tables (the Page 1 token table and a new
position table) feeding a `+` node per position, producing an input-vector
row. The two `l` positions get side-by-side worked sums with the shared token
row visually identical and the position rows visibly different. Toy values
remain labeled invented.

**Check `position-sum`:** Yes/No with Check answer under the worked pair.
Correct: "No. The token rows match; the added position rows differ, so the
sums differ." Incorrect: "The token lookup is identical for both l tiles, but
each position adds its own position row, so the resulting vectors differ."
Record before feedback; Retry/Skip per the standard rules.

**Further explanations:** a static three-row alignment (token row, position
row, sum) for all five `Hello` positions, reusing the toy tables. Alt text:
"Each of the five positions adds its own position row to its token row,
producing five distinct input vectors."

**Images, videos, plots or external assets:** none. Exact elementwise addition
is clearer as aligned tiles than as any generated image.

### Drawing sequence

1. Title: **Add where you are to what you are**.
2. Restate the problem with the two highlighted `l` lookups from Page 1.
3. Draw the position table beside the token table; label rows position 0–4.
4. Build the worked sums for positions 2 and 3, one term at a time.
5. Reveal the result caption and the definition card.
6. Pause for check `position-sum`; feedback, then the learned-table footnote.
7. Transition to what consumes these vectors.

### Spoken or written explanation

"So, how do we tell the twins apart? By where they sit! The model keeps a second table with one learned row per position: position zero, position one, and so on, up to the context window. Each position's input is its token row plus its position row: we literally add the two vectors, number by number. Now the first l is row two plus position-row two, while the second l is row two plus position-row three. Same character, different sums. And that is everything the rest of the model receives: no letters anymore, just one vector per position. Quick check: do the two l's now enter the model identical? One more note: nanoGPT learns this position table during training, just like the token table. Next: what does the model actually do with these vectors?"

### Further explanations

#### Why order must be injected

Nothing in the token lookup records position. If the rest of the model
received only token vectors, `Hello` and `olleH` would present the same
multiset of vectors, and the two `l` occurrences would be indistinguishable.
Lesson 1 established that context (which tokens came before) is the whole
basis of the prediction task, so position must enter the input somewhere.

nanoGPT's answer is the simplest one: a second embedding table indexed by
position instead of token ID. Row `t` of `wpe` is a learned vector for "being
at position t." Because the tables share the width `n_embd`, the two vectors
can be added elementwise.

#### Extend the worked example

**Reuse the three-row alignment here.** Continuing the Page 1 code:

```python
position_table = [
    [0.01, 0.02, 0.03],    # position 0
    [0.02, 0.00, -0.01],   # position 1
    [0.00, 0.03, 0.01],    # position 2
    [-0.02, 0.01, 0.00],   # position 3
    [0.03, -0.01, 0.02],   # position 4
]
inputs = []
for position, token_id in enumerate(ids):
    token_row = token_table[token_id]
    position_row = position_table[position]
    inputs.append([t + p for t, p in zip(token_row, position_row)])
print(inputs[2])   # [0.40, 0.43, 0.01]
print(inputs[3])   # [0.38, 0.41, 0.00]
assert inputs[2] != inputs[3]
```

The assertion that failed conceptually on Page 1 now passes: the two `l`
positions carry different vectors. All values remain invented.

#### The same statement in the code

`GPT.forward` builds `pos = torch.arange(0, t)`: the integers 0 through the
sequence length minus one: then computes `tok_emb`, `pos_emb`, and their sum.
The comment shapes in the source are worth reading literally: token embeddings
`(b, t, n_embd)`, position embeddings `(t, n_embd)`; the addition gives every
position in every batch row its position vector. A dropout layer wraps the
sum; it only acts during training and is discussed with the training loop in
Lesson 6.

The position table has `block_size` rows: 256 in the Shakespeare
configuration. That is another way to see why the context window is a hard
limit: position 256 has no row to look up, and the forward pass asserts the
sequence fits.

#### Not the only design

Learned absolute position embeddings are one choice, used by GPT-2 and
nanoGPT. Other models compute position signals from fixed formulas or encode
relative offsets. This course describes what this repository does; when you
read about other schemes, the question to carry over is the same one this page
answers: where does order enter the input?

#### Check the boundary

Would appending ` Hello` to the input change the first five input vectors? The
token rows stay the same, and positions 0–4 keep their position rows, so those
five sums are unchanged; the new characters occupy positions 5–10 with their
own rows. What changes downstream is what the blocks can mix together: which
is exactly the next page.

### References and further reading

**Repository: the sum:** [model.py, lines 174–179](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L174-L179). `pos`, `tok_emb`, `pos_emb`, and `drop(tok_emb + pos_emb)` in four lines. The position table itself is [line 128](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L128).

Source pill: [config/train_shakespeare_char.py, lines 16–25](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/config/train_shakespeare_char.py#L16-L25) for `block_size = 256` sizing the position table.

**Online refresher:** [Hugging Face: Transformer architecture](https://huggingface.co/learn/llm-course/en/chapter1/4). The architecture overview places embeddings at the model's entrance; attention details there belong to Lesson 3.

## Page 3 — What is inside the tower? (~75 seconds)

### Canvas text

- Heading: **A stack of identical blocks**.
- Input row: **one vector per position** (from Page 2).
- Tower: six stacked boxes labeled **Block 1 … Block 6**, annotated **× n_layer (6 in the Shakespeare model)**.
- Inside one expanded block, two sub-steps:
  - **Share: positions read earlier positions (attention: Lesson 3).**
  - **Rework: each position transforms its own vector (MLP: Lesson 4).**
- Residual caption: **Each step adds its result onto its input: x = x + step(x). Refine, not replace.**
- Shape caption: **Vectors in, same-shaped vectors out: that is why blocks can stack.**
- Note: **Every block has the same structure with its own separate parameters.**
- Transition: **After the last block: how do vectors become predictions?**

### Assets

**Canvas diagram:** a vertical tower of six block boxes with the vector row
entering below and exiting above, plus one block expanded to the side showing
the two sub-steps and the add-back arrows. Arrows follow the actual data flow:
input into the sub-step, sub-step output curving back into the running vector.
The expanded view is a preview silhouette, deliberately without attention or
MLP internals.

**Further explanations visual:** a static "same shape in, same shape out"
card: three towers of different heights (1, 6, 12 blocks) over the caption
that stacking depth is a configuration choice, `n_layer`. Alt text: "Towers of
one, six and twelve identical blocks; each block preserves the vector shape."

**Images, videos, plots or external assets:** none. The block structure is
exact and best drawn; animating it would add nothing at this level of detail.

### Drawing sequence

1. Title: **A stack of identical blocks**.
2. Bring the input vector row from Page 2 to the tower's base.
3. Draw the six-box tower; annotate n_layer = 6.
4. Expand one block; draw the Share sub-step with its Lesson 3 tag.
5. Draw the Rework sub-step with its Lesson 4 tag.
6. Draw the add-back arrows and the refine-not-replace caption.
7. Reveal the shape caption and the separate-parameters note; pause briefly.
8. Transition to the head.

### Spoken or written explanation

"Here comes my favorite part: the tower! The vectors flow through a stack of identical transformer blocks: the Shakespeare model uses six. What happens inside one block? Two moves. First, positions look at earlier positions and share information: that is attention, and it gets its whole own lesson. Second, each position reworks its own vector with a small neural network. And notice the neat trick: each step adds its result onto its input: refine, not replace. Same-shaped vectors go in and come out, which is exactly why we can stack block after block, each with its own parameters. After six floors of this, every position's vector has been enriched by its context. So: what turns the final vectors into actual predictions?"

### Further explanations

#### Read the block as a signature, not a mechanism

At this lesson's depth, one block is a function: it takes the row of position
vectors and returns an equally shaped row. The source is short enough to read
with that lens:

```python
class Block(nn.Module):
    def forward(self, x):
        x = x + self.attn(self.ln_1(x))
        x = x + self.mlp(self.ln_2(x))
        return x
```

Two sub-steps, each wrapped in `x = x + ...`. The `attn` step is where
positions interact: the only place in the block where information moves
between positions. The `mlp` step transforms each position independently. The
`ln_1`/`ln_2` calls normalize a vector's scale before each sub-step; their
mechanics belong to Lesson 4. Quoted code is from the pinned `model.py`;
Lessons 3 and 4 open `attn` and `mlp`.

#### Why add instead of replace

The pattern `x = x + step(x)` is a residual connection. Its consequence at
this level: a block starts from its input and contributes an adjustment, so
the running vector accumulates refinements floor by floor. This framing:
which Lesson 4 justifies mechanically: explains why depth is a dial rather
than a redesign: `n_layer` selects how many refinement floors the tower has.

#### Identical structure, separate parameters

The tower's blocks are built by one line in the model constructor: a list of
`Block(config)` repeated `n_layer` times. Each call constructs fresh
parameters, so Block 1 and Block 6 have identical shapes and completely
separate learned values. "Identical blocks" means identical architecture, not
shared weights.

**Reuse the three-tower card here.** GPT-2's default configuration in this
file stacks 12 blocks of width 768; the Shakespeare configuration stacks 6
blocks of width 384. Same block design, different dials.

#### What we deliberately did not explain

How does a position "look at" earlier positions, and why only earlier ones?
That is the causal attention rule Lesson 1 promised and Lesson 3 delivers.
What are the two normalizations and the small neural network exactly?
Lesson 4. If you leave this page able to say "six identical-shaped blocks,
each mixing context then reworking positions, each adding onto its input,"
you have everything Lesson 5's forward-pass walkthrough needs.

#### Check the boundary

If block 3's output had a different vector width than its input, could the
tower still stack? No: block 4 expects the same shape block 3 received. The
shape-preserving contract is what makes depth configurable. Ahead: the one
place the shape finally changes, from `n_embd` numbers to one score per
vocabulary entry.

### References and further reading

**Repository: the block:** [model.py, lines 94–106](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L94-L106). The four members (`ln_1`, `attn`, `ln_2`, `mlp`) and the two residual lines.

**Repository: the stack:** [model.py, line 130](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L130). `h` is a list of `n_layer` blocks; the forward pass loops over it.

**Online explanation: optional visual companion:** [Jay Alammar: The Illustrated GPT-2](https://jalammar.github.io/illustrated-gpt2/). Read only "Part 1: GPT2 and Language Modeling" for the stacked-decoder pictures; its attention sections preview Lesson 3. Its diagrams show GPT-2 sizes, which differ from our 6-layer model.

## Page 4 — How do vectors become scores? (~60 seconds)

### Canvas text

- Heading: **One score for every vocabulary entry**.
- Step 1: **Final normalization (ln_f): put each vector on a stable scale.**
- Step 2: **Language-model head: one linear layer from n_embd numbers to vocab_size scores.**
- Funnel figure: a 384-wide vector narrowing into a 65-bar score column labeled **logits**.
- Definition card: **Logits = raw prediction scores, one per vocabulary entry. Softmax converts logits to the probability distribution from Lesson 1: applied where it is needed, not inside the head.**
- Weight-tying note: **nanoGPT reuses the token-embedding table as the head's weights. One table, two jobs.**
- Check: **With a 65-entry vocabulary, how many logits does the head produce per position?** Expected: **65**.
- Transition: **Now watch the whole pipeline run in model.py.**

### Assets

**Canvas diagram:** a compact two-step exit path drawn after the tower: a
normalize step, then the funnel from one position's vector into a 65-bar
column. Bar heights are decorative-uniform or clearly arbitrary: no invented
score values presented as model output; label the column "65 scores, values
come from the trained model."

**Check `logits-count`:** numeric entry with Check answer. Accept `65` with
surrounding whitespace. Correct: "65: one raw score per vocabulary entry, at
every position." Incorrect: "The head maps each position's n_embd-wide vector
to one score per vocabulary entry; this vocabulary has 65 entries." Record
before feedback; standard Retry/Skip.

**Further explanations visual:** a static tying diagram: the token table from
Page 1 shown twice, once at the entrance (lookup) and once at the exit (head
weights), connected by an equals badge. Alt text: "The same 65 × 384 table is
read as embedding rows at the input and used as scoring weights at the
output."

**Images, videos, plots or external assets:** none. Exact shapes matter; a
drawn funnel and bar column state them precisely.

### Drawing sequence

1. Title: **One score for every vocabulary entry**.
2. Take the tower's output row; draw the normalize step and its caption.
3. Draw the funnel from one position's vector into the 65-bar logits column.
4. Reveal the logits definition card, including the softmax deferral.
5. Reveal the weight-tying note.
6. Pause for check `logits-count`; feedback.
7. Transition to the full walkthrough.

### Spoken or written explanation

"Time to cash in! After the last block, one final normalization puts each vector on a stable scale. Then comes the language-model head: a single linear layer that turns each position's three hundred eighty-four numbers into sixty-five scores: one score for every character in the Shakespeare vocabulary. These raw scores are called logits. They are not probabilities yet; softmax converts them into the distribution we met in lesson one, and that happens where it is needed: in the loss during training, or at sampling time. And here is a lovely bit of thrift: nanoGPT reuses the token-embedding table as the head's weights. One table, two jobs, fewer parameters. Quick count check below the canvas. Then let's watch the whole machine run in model.py."

### Further explanations

#### The exit path in the source

Two lines end the shared portion of the forward pass: `x =
self.transformer.ln_f(x)` normalizes, and `logits = self.lm_head(x)` scores.
The head is declared as a linear layer from `n_embd` to `vocab_size` with no
bias. For the Shakespeare model that is a map from 384 numbers to 65 scores at
each position.

"Raw score" means: larger is more favored, and the values can be negative or
exceed one. Softmax exponentiates and normalizes a score vector into
probabilities that sum to one. In this repository you can see that division of
labor directly: the training path hands logits to the cross-entropy loss,
and the sampling loop applies `F.softmax` just before drawing a token. The
head itself never normalizes.

#### Why tying the tables makes sense

The head asks, for each vocabulary entry, "how compatible is this position's
vector with that entry?" The embedding table already stores one learned vector
per entry. nanoGPT sets the head's weight matrix to be the token-embedding
table itself:

```python
self.transformer.wte.weight = self.lm_head.weight
```

**Reuse the tying diagram here.** Consequences worth stating exactly: the
model stores one 65 × 384 table, not two; training updates it from both roles;
and parameter counts treat it once. This is a design choice, not a
requirement: untied models exist.

#### Logits at every position

During training, the head runs at every position, because Lesson 1's shifted
targets provide an answer at every position. The source also contains an
honest inference shortcut: when no targets are passed, it computes logits only
for the last position, since generation only needs the next token. Same
architecture, two amounts of work: the comment in the source calls it a
mini-optimization.

#### Check the boundary

If the vocabulary had 66 entries, what changes? The embedding table and the
head gain one row: and nothing inside the tower changes, because blocks never
see vocabulary size, only `n_embd`-wide vectors. Vocabulary size lives at the
entrance and the exit; that observation is most of the next page.

### References and further reading

**Repository: head and tying:** [model.py, lines 133–138](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L133-L138): the `lm_head` declaration and the tying assignment with its comment. Final normalization and scoring in the forward pass: [lines 182–191](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L182-L191).

**Research paper (optional deeper reading:** [Using the Output Embedding to Improve Language Models) Press and Wolf, 2017](https://aclanthology.org/E17-2025/). Read the abstract for the argument that tying input and output embeddings helps; the source line above links the same technique.

## Page 5 — The whole assembly in model.py (~80 seconds)

### Canvas text

- Heading: **model.py, end to end**.
- Pipeline map, left to right:
  - **token IDs** → **wte lookup + wpe lookup, added** → **Block × 6** → **ln_f** → **lm_head** → **logits: one row of 65 scores per position**.
- Configuration card, exact values: **Shakespeare model: n_layer 6 · n_head 6 · n_embd 384 · block_size 256 · vocab_size 65** (each on its own line).
- Parameter caption: **About 10.65M reported parameters: most of them inside the six blocks.**
- Connection note: **meta.pkl's vocab_size (65) from Lesson 1 sizes both the embedding table and the head.**
- Footnote: **dropout 0.2 in this config: a training-only regularization, covered with the training loop.**
- Check reminder: **Where does vocabulary size appear: entrance, exit, or inside the blocks?** Answer: **Entrance and exit only.**
- Transition: **Can you rebuild this map from memory?**

### Assets

**Canvas diagram:** the full architecture map as one horizontal pipeline with
the six-block tower compressed to a single labeled group. Each stage carries
its source anchor as a small label (`wte`, `wpe`, `h`, `ln_f`, `lm_head`).
The configuration card lists the five verified values as bullets, never
crammed onto one line. The parameter caption uses the repository's own
reported figure (see references): no invented precision beyond it.

**Further explanations visual:** a static shape-trace table for a 5-character
input to the Shakespeare model: `5 IDs → 5 × 384 → (unchanged through 6
blocks) → 5 × 384 → 5 × 65`. Alt text: "Shapes through the model: five IDs
become five 384-wide vectors, stay that shape through the blocks, and exit as
five rows of 65 logits."

**Images, videos, plots or external assets:** none. This page is a reading
map of verified code; exact drawn structure beats any generated art.

### Drawing sequence

1. Title: **model.py, end to end**.
2. Draw the pipeline left to right, one stage at a time, each with its source-name label.
3. Reveal the configuration card, one value per bullet.
4. Reveal the parameter caption and the meta.pkl connection note.
5. Add the dropout footnote quietly.
6. Ask the where-does-vocab-appear question; reveal the answer.
7. Transition to the recap page.

### Spoken or written explanation

"Let's open model.py and watch the whole flow: you have now met every stage. Token IDs go in. Look up token rows, look up position rows, add them. Then the loop: pass the vectors through each of the six blocks. Then the final normalization, then the head: and out come sixty-five logits per position. The entire architecture is a handful of dials in one config: six layers, six heads, three hundred eighty-four channels, context two hundred fifty-six. That is about ten point six five million parameters, and most of them live inside the blocks. One thread back to lesson one: remember meta dot pickle? Its vocab size, sixty-five, is exactly what sizes the embedding table and the head. Notice where vocabulary size appears: the entrance and the exit, never inside the tower. Ready to rebuild the map yourself?"

### Further explanations

#### Follow the forward pass line by line

`GPT.forward` reads like this lesson's table of contents:

```python
tok_emb = self.transformer.wte(idx)   # Page 1: token lookup
pos_emb = self.transformer.wpe(pos)   # Page 2: position lookup
x = self.transformer.drop(tok_emb + pos_emb)
for block in self.transformer.h:      # Page 3: the tower
    x = block(x)
x = self.transformer.ln_f(x)          # Page 4: final normalization
```

followed by the `lm_head` scoring with its training/inference split from
Page 4. The quoted lines are from the pinned source; the page-mapping comments
are ours. Before the lookups, the method asserts the sequence fits in
`block_size`: the position table simply has no rows past it.

**Insert the shape-trace table here.** Being able to trace the shapes from
memory (IDs, to `t × n_embd`, unchanged through the blocks, to `t ×
vocab_size`) is this lesson's core skill.

#### Where the numbers come from

`GPTConfig` declares seven fields: `block_size`, `vocab_size`, `n_layer`,
`n_head`, `n_embd`, `dropout`, `bias`. The Shakespeare quickstart overrides
five of them (256, 65 via meta, 6, 6, 384) plus `dropout = 0.2`; `bias`
stays at the training script's default, `False`, meaning this model's linear
layers and normalizations carry no bias terms. The config file calls the
result a baby GPT; the file's own defaults describe GPT-2 size: 12 layers,
12 heads, width 768, context 1024.

`n_head` is the one dial this lesson defers: heads partition attention inside
a block, Lesson 3's topic. The notebook shows one surprising fact about it
that you can verify today: changing `n_head` does not change the parameter
count.

#### How vocab_size travels from Lesson 1 to here

The training script looks for the dataset's `meta.pkl`, reads its
`vocab_size`, and passes it into `GPTConfig` before constructing `GPT`. So the
65 characters counted during data preparation become the 65 rows of `wte` and
the 65 outputs of the tied head. One number, decided by the dataset, shapes
both ends of the model. (The default 50304 in `GPTConfig` is GPT-2's 50257
padded up to a multiple of 64 for efficiency: a reminder that vocabulary
entries are storage rows, and row counts can be padded.)

#### Where the 10.65M parameters sit

When constructed, the model prints its own parameter report; for this
configuration the reported count is 10.65M. The report subtracts the position
table (it is the one part tied to context length rather than the model
proper), and counts the shared token/head table once. The notebook rebuilds
this number from the architecture with plain arithmetic: table sizes plus
six blocks: and it lands exactly on the printed figure. No memorization
needed: every term traces to a stage you have now seen.

#### Check the boundary

Could you train this same architecture on a dataset with a 200-character
vocabulary? Yes: meta's vocab_size would size the tables to 200 rows and
200 logits; nothing inside the blocks changes. Could you prompt it with 300
characters of context? No: position 256 has no row, and the forward pass
asserts the limit. Knowing which dial constrains what is exactly what the
recap asks you to demonstrate.

### References and further reading

**Repository: configuration:** [model.py, lines 108–116, GPTConfig](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L108-L116) and [config/train_shakespeare_char.py, lines 16–25](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/config/train_shakespeare_char.py#L16-L25). The `bias = False` default: [train.py, line 56](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/train.py#L56).

**Repository: construction:** [model.py, lines 126–133](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L126-L133), the five-member transformer dict plus head. Forward pass: [lines 170–193](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L170-L193). Parameter report: [lines 147–160](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py#L147-L160).

**Repository: vocab_size flow:** [train.py, lines 139–157](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/train.py#L139-L157) reads `meta.pkl` and builds `GPTConfig`; [prepare.py, lines 25–27](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/data/shakespeare_char/prepare.py#L25-L27) computes it, with the recorded example output `vocab size: 65` at [line 66](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/data/shakespeare_char/prepare.py#L66).

**README description:** [quickstart](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/README.md#quick-start): "a context size of up to 256 characters, 384 feature channels, and it is a 6-layer Transformer with 6 heads in each layer."

## Page 6 — Check your mental model (~75 seconds)

### Canvas text

- Heading: **IDs in, logits out**.
- Recap map: **IDs → token + position embeddings → Block × 6 → ln_f → lm_head → logits**.
- **Check 1: Which two tables combine to make one position's input vector?**
- Answer, revealed after a pause: **The token-embedding table (by ID) and the position-embedding table (by position), added elementwise.**
- **Check 2: Does the head output probabilities?**
- Answer, revealed after a pause: **No: logits, raw scores. Softmax converts them to a distribution where it is needed.**
- Closing: **Try the quiz, review the cards, or count the parameters yourself in the notebook.**

### Assets

**Canvas diagram:** the Page 5 pipeline redrawn compact, plus two question
cards with separately revealed answer cards. Answers stay hidden until their
reveal points. Use existing Quiz, Flashcards and Notebook navigation; no
nonfunctional drawn buttons.

**Further explanations:** a complete annotated trace of `Hello` through the
toy tables into the tower, and one misconception table. No new media.

### Drawing sequence

1. Title: **IDs in, logits out**.
2. Redraw the compact recap map.
3. Display Check 1; pause; reveal its answer.
4. Display Check 2; pause; reveal its answer.
5. Link to the quiz and the optional notebook using existing lesson navigation.

### Spoken or written explanation

"You made it: the tower is complete! Trace it with me one last time: IDs select token rows, positions add their rows, six blocks refine the vectors floor by floor, one final normalization, and the head scores all sixty-five characters at every position. First check: which two tables combine to make one input vector? Say it out loud. The token table and the position table, added together. Second check: does the head hand us probabilities? Not quite: logits, raw scores; softmax turns them into lesson one's distribution when the loss or the sampler needs it. That is the entire architecture! Try the quiz, flip the cards, or open the notebook and count all ten point six five million parameters yourself: spoiler: extra heads are free. Next lesson, we step inside a block and meet attention. See you there!"

### Further explanations

#### Explain the architecture using one tiny example

Close the page and narrate `Hello`'s journey yourself before reading on:
five IDs, five input vectors, the tower, the exit. Then compare with this
trace, which reuses the toy tables from Pages 1–2:

`[0, 1, 2, 2, 3]` selects five token rows; positions 0–4 add their position
rows; the two `l` positions now differ. Six blocks transform the five vectors
while keeping their shape: sharing across positions, reworking each position,
adding refinements on. The final normalization stabilizes each vector's scale,
and the head produces five score rows. In the toy world each row would have
five scores (our vocabulary has five entries); in the Shakespeare model, 65.
Lesson 1 told us what to do with such scores at one position: softmax them
into a distribution, then compare with the target (training) or select a
token (generation).

#### Diagnose common mix-ups

| If you hear… | Replace it with… |
|---|---|
| "The embedding is the ID." | An ID selects a row; the embedding is the learned vector in that row. |
| "Repeated tokens get different embedding rows." | Same ID, same row: position embeddings, not the token table, distinguish occurrences. |
| "Each block outputs something smaller until one answer remains." | Blocks preserve shape; only the head changes width, to one score per vocabulary entry. |
| "The head outputs probabilities." | The head outputs logits; softmax produces the distribution where needed. |
| "More heads means a bigger model." | `n_head` splits vectors inside attention; the parameter count does not change. |
| "vocab_size shapes the whole network." | It sizes the entrance table and exit scores; blocks only ever see n_embd-wide vectors. |

Explain one correction aloud without looking at the right column; revisit its
page if it will not come.

#### What to do before Lesson 3

Take the three-question quiz: it mirrors this lesson's three checks. Use the
five flashcards: embedding, positional embedding, transformer block, hidden
dimension, logits. If the parameter caption on Page 5 felt like magic, the
notebook removes it: you rebuild 10.65M from table sizes and block arithmetic
in plain Python, then move the dials.

#### The next question

Every vector that leaves the tower was shaped by "positions share
information." We treated that step as a sealed box with one promise attached:
a position only reads earlier positions. Lesson 3 opens the box: queries,
keys, values, and the causal mask that keeps the future out. Nothing in
Lesson 3 changes this lesson's map; it fills in the tower's first sub-step.

### References and further reading

**Repository reading route:** [model.py](https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291/model.py) top to bottom with this lesson's map in hand: `LayerNorm`, `CausalSelfAttention` (Lesson 3), `MLP` (Lesson 4), `Block`, `GPTConfig`, `GPT`. Skip `from_pretrained`, `configure_optimizers` and `estimate_mfu` until their lessons.

**Optional visual companion:** [Jay Alammar: The Illustrated GPT-2](https://jalammar.github.io/illustrated-gpt2/), Part 1, as a second drawing of the same architecture. The papers linked on Pages 4–5 are optional background, not prerequisites for the quiz or Lesson 3.

## Asset and interaction manifest

| ID | Primitive | Purpose | Planned content / source |
|---|---|---|---|
| token-table | Tiles, drawn table, arrows | Make the ID-to-row lookup concrete | Page 1's five-row toy table with invented values |
| embedding-row | Tile click → row highlight, row-choice check | Let the learner perform the lookup | Page 1; objective embed-tokens |
| position-sum-diagram | Two tables, per-position + nodes | Show input = token row + position row | Page 2's worked sums for positions 2 and 3 |
| position-sum | Yes/No check | Confirm the twins now differ | Page 2; objective order-matters |
| block-tower | Stacked boxes, one expanded block | Preview block structure without internals | Page 3; Share/Rework sub-steps, residual arrows |
| depth-cards-reading | Three static towers | Show n_layer as a dial | Page 3 Further explanations |
| exit-funnel | Funnel into 65-bar column | Fix the n_embd → vocab_size shape change | Page 4; bar values explicitly arbitrary |
| logits-count | Numeric-entry check | Anchor one-logit-per-entry | Page 4; objective read-the-head |
| tying-card-reading | Twice-drawn table with equals badge | Explain weight tying | Page 4 Further explanations; model.py L138 |
| architecture-map | Full pipeline with source labels | Connect concepts to model.py names | Page 5; wte/wpe/h/ln_f/lm_head |
| config-card | Bulleted value card | State the verified Shakespeare dials | Page 5; config lines 16–25, bias=False, vocab 65 |
| shape-trace-reading | Static shape table | Drill shapes end to end | Page 5 Further explanations: 5 IDs → 5×384 → 5×65 |
| recap-map | Compact pipeline + reveal cards | Retrieval practice | Page 6 |
| toy-trace-reading | Annotated Hello walkthrough | Reuse toy tables end to end | Page 6 Further explanations |

Use existing tldraw text/diagram primitives, grouped with semantic IDs and
source metadata; connectors appear with their associated explanation. Source
pills open the highlighted file in the right panel.

No photos, generative video, 3D assets, extracted paper figures or
quantitative plots are proposed. Every quantity on the canvas is either a
verified repository value or a labeled toy value; exact drawn structure
communicates each of them better than generated media. This is a decision for
this lesson, not a restriction on future lessons.

## Quiz: exact content

### Question 1

A colleague says: "Token IDs are already numbers: feed ID 2 straight into the network." What is the correct objection?

- A. Nothing: models can compute with raw IDs directly.
- B. An ID is a label; the model instead looks up a learned vector for each ID, whose values training can adjust.
- C. IDs must first be converted to probabilities before the model can use them.

Correct: **B**.
**Before answering:** recall Page 1's failed arithmetic: is l + l = o?

**Why B is right:** arithmetic on labels encodes relationships nobody chose (ID 4 is not "twice" ID 2). The embedding table gives every vocabulary entry adjustable numbers to compute with, while the ID only selects the row.

**If you chose A:** the integer's size is arbitrary: Lesson 1 showed IDs could be consistently renamed. Computation on the raw integer would change behavior under renaming; lookup does not.

**If you chose C:** probabilities are the model's *output* story (Lesson 1). Inputs become vectors via lookup; no probability is involved at the entrance.

**Transfer check:** both `l` tiles in `Hello`: same row or different rows? Same row: one entry per token type.
Objective: `embed-tokens`.

### Question 2

In `Hello`, both `l` characters select the same row of the token-embedding table. Why doesn't the model treat the two positions identically?

- A. The second occurrence of a character is assigned a new ID.
- B. The model reads characters one at a time, so order is implicit.
- C. Each position adds its own row from a learned position-embedding table, so the two input vectors differ.

Correct: **C**.
**Why C is right:** the input at each position is token row + position row. Positions 2 and 3 share the token row but add different position rows, so their sums differ before the first block runs.

**If you chose A:** encoding is a fixed lookup: same character, same ID, every occurrence. That was Lesson 1's core rule.

**If you chose B:** the forward pass processes all positions of the sequence together; order is not implicit in the computation, which is exactly why a position signal must be added to the input.

**Transfer check:** would `olleH` and `Hello` produce the same set of input vectors? No: same token rows, but paired with different position rows.
Objective: `order-matters`.

### Question 3

For one input position, what does the Shakespeare model's language-model head produce (vocabulary size 65)?

- A. The single most likely next character.
- B. 65 logits: one raw score per vocabulary entry.
- C. A probability distribution that already sums to one.

Correct: **B**.
**Why B is right:** the head is a linear map from the position's 384-wide vector to 65 scores. Selecting a character or normalizing into a distribution happens later, where sampling or the loss needs it.

**If you chose A:** choosing a character is a separate selection step (Lesson 1's generation loop; details in Lesson 7). The head only scores.

**If you chose C:** logits can be negative and do not sum to one; softmax produces the distribution. The distinction matters when you read the code: the loss consumes logits directly.

**Transfer check:** during training, at how many positions does the head produce logits? Every position: each has a shifted target to compare against.
Objective: `read-the-head`.

## Flashcards: exact fronts and backs

| Front | Back |
|---|---|
| Embedding: what does ID 2 select in the token-embedding table? | Row 2: a learned vector of n_embd numbers. Same ID, same row, at every occurrence. Training adjusts the row's values; the ID itself never changes. |
| Positional embedding: two identical tokens at positions 2 and 3: what differs in their inputs? | The added position rows. Input = token row + position row, so the sums differ even though the token rows match. nanoGPT learns its position table (wpe); it is not computed from a fixed formula. |
| Transformer block: what shape comes out compared with what goes in? | The same shape: one n_embd-wide vector per position. Each sub-step adds its result onto its input (x = x + …), which is why blocks stack; the Shakespeare model stacks six. |
| Hidden dimension: what does n_embd = 384 mean for the Shakespeare model? | Every position is represented by 384 numbers from the embedding sum through every block. The README calls these feature channels. The width only changes at the head. |
| Logits: how many per position, and are they probabilities? | One per vocabulary entry: 65 here. They are raw scores; softmax converts them into a distribution where needed (the loss during training, sampling during generation). |

Use the existing flip interaction and Got it / Not yet controls. Ask learners
to answer the concrete question before flipping; the back supplies the concept
and its reasoning.

## Optional notebook: Count the parameters (~7 minutes)

Browser notebook constraint: the Pyodide runtime does not provide PyTorch, so
the curriculum's "instantiate a GPTConfig and print the model" sketch is
implemented as pure-Python architecture arithmetic that reproduces the model's
own reported parameter count exactly. A local-PyTorch variant is included as a
commented cell for learners with a Python environment. This substitution needs
owner sign-off with this plan.

No training, downloads, GPU or network access required; Python built-ins only.
Editable learner copy with Reset to the approved baseline.

### Cell 1: Markdown

"Where do 10.65 million parameters hide in a model this small? In this
notebook you rebuild nanoGPT's parameter count from the architecture you just
learned (two tables, six blocks, one head) using nothing but arithmetic.
Before running each cell, predict the result; run it; change one dial; explain
the difference. Nothing here trains or predicts."

Predict: which single component of the Shakespeare model holds the most
parameters: the token table, the position table, or one block?

### Cell 2: Code: the toy lookup, twins included

Before running: predict which two of the five input vectors would collide if
the position rows were removed.

```python
token_table = [
    [0.10, -0.20, 0.30],   # row 0: H
    [0.00, 0.50, -0.10],   # row 1: e
    [0.40, 0.40, 0.00],    # row 2: l
    [-0.30, 0.20, 0.10],   # row 3: o
    [0.05, 0.00, -0.25],   # row 4: space
]
position_table = [
    [0.01, 0.02, 0.03],
    [0.02, 0.00, -0.01],
    [0.00, 0.03, 0.01],
    [-0.02, 0.01, 0.00],
    [0.03, -0.01, 0.02],
]
ids = [0, 1, 2, 2, 3]      # Hello
inputs = []
for position, token_id in enumerate(ids):
    row = [t + p for t, p in zip(token_table[token_id], position_table[position])]
    inputs.append(row)
    print(position, ids[position], row)
assert token_table[ids[2]] == token_table[ids[3]]
assert inputs[2] != inputs[3]
```

Expected: positions 2 and 3 share a token row (first assertion) yet produce
different inputs (second assertion). All values are invented teaching numbers.
Remove the `position_table` term and rerun to watch the second assertion fail;
restore it afterward.

### Cell 3: Code: rebuild the reported parameter count

Predict: will the total be closer to 1M, 10M or 100M? The model prints
`number of parameters: 10.65M` when constructed; we now derive that figure.

```python
def gpt_parameters(n_layer, n_head, n_embd, block_size, vocab_size, bias):
    assert n_embd % n_head == 0          # same divisibility rule as model.py
    def linear(n_in, n_out):
        return n_in * n_out + (n_out if bias else 0)
    norm = n_embd + (n_embd if bias else 0)
    attention = linear(n_embd, 3 * n_embd) + linear(n_embd, n_embd)
    mlp = linear(n_embd, 4 * n_embd) + linear(4 * n_embd, n_embd)
    block = norm + attention + norm + mlp
    token_table = vocab_size * n_embd     # also the head: weights are tied
    position_table = block_size * n_embd
    total = token_table + position_table + n_layer * block + norm
    reported = total - position_table     # model.py subtracts wpe in its report
    return total, reported

total, reported = gpt_parameters(n_layer=6, n_head=6, n_embd=384,
                                 block_size=256, vocab_size=65, bias=False)
print(f"total {total:,}")
print(f"reported {reported:,} = {reported / 1e6:.2f}M")
assert reported == 10_646_784
```

Expected: total `10,745,088`, reported `10,646,784`: printed as 10.65M,
matching the model's own report for this configuration. Two subtleties the
formula encodes: the tied head contributes no separate table, and the report
deliberately subtracts the position table (see `get_num_params` in the
source). `bias=False` follows the training script's default, which the
Shakespeare config does not override.

### Cell 4: Code: move the dials

Predict each line before running: which changes double the count, which
quadruple it, and which change nothing?

```python
base = dict(n_layer=6, n_head=6, n_embd=384, block_size=256, vocab_size=65, bias=False)
for change in ({}, {"n_layer": 12}, {"n_embd": 768}, {"n_head": 12}, {"vocab_size": 130}):
    config = {**base, **change}
    _, reported = gpt_parameters(**config)
    print(f"{change or 'baseline':<24} {reported / 1e6:6.2f}M")
```

Expected findings to explain in your own words:

1. Doubling `n_layer` roughly doubles the count: blocks dominate, and each block is a fixed cost.
2. Doubling `n_embd` roughly quadruples it: every linear layer inside a block scales with width squared.
3. Doubling `n_head` changes nothing: heads split the existing vectors inside attention (Lesson 3); they add no parameters.
4. Doubling `vocab_size` adds only one table's worth: vocabulary lives at the entrance/exit, not in the blocks.

Then try the GPT-2 default dials from `GPTConfig`: `n_layer=12, n_head=12,
n_embd=768, block_size=1024, vocab_size=50304, bias=True`: and compare the
result with the ~124M figure the source's `from_pretrained` table quotes for
GPT-2. Expect the same order of magnitude, not equality: the checkpoint table
describes the unpadded 50257-entry vocabulary and its own bias settings.

### Cell 5: Markdown: try it, and the local variant

1. Which component would grow if you trained on a 200-character alphabet? Rerun Cell 4 with `vocab_size=200` and point at the term that moved.
2. Find the smallest configuration you can build that still respects `n_embd % n_head == 0` and exceeds one million reported parameters. State which term did the most work.
3. Has any cell measured a trained model's behavior? No: we counted the architecture's adjustable values. Counting parameters tells you a model's capacity and cost, not its quality.

With a local Python environment and PyTorch installed (not in this browser
notebook), the repository does this in two lines and prints the same figure:

```python
# local-only, requires torch and the nanoGPT repo:
# from model import GPTConfig, GPT
# GPT(GPTConfig(n_layer=6, n_head=6, n_embd=384, block_size=256,
#               vocab_size=65, dropout=0.2, bias=False))
# -> prints: number of parameters: 10.65M
```

**Finish by explaining:** "The parameter count is the architecture, added up:
two tables plus n_layer identical blocks plus a final norm, with the head tied
to the token table." If your assertion in Cell 3 fails after edits, compare
your formula against the module list in `model.py`: every term must
correspond to a declared component.

## Review and build checks

- [x] Six pages cover only Lesson 2's curriculum concepts; attention, MLP detail, loss, optimization and sampling are deferred with their lesson numbers named.
- [x] Three quiz questions and five flashcards match the curriculum's counts and have explicit answers.
- [x] Notebook cells and expected values are available for review; the parameter arithmetic was verified against the pinned source's structure and reproduces 10,646,784 (10.65M reported).
- [x] All repository quantities (65, 6, 6, 384, 256, bias=False, dropout 0.2, 10.65M) checked at the pinned commit; toy table values are labeled invented.
- [x] Lesson 2 repository references cite exact pinned-commit line ranges.
- [ ] Owner confirms audience assumption and the notebook's pure-Python substitution for the torch-based sketch.
- [ ] Curriculum and this exact lesson plan revision approved.
- [ ] Page 1 tile-to-row interaction, Page 2 and Page 4 checks: recording, masking, keyboard operation and feedback verified when built.
- [ ] Objective-linked checks persist across reload with the Lesson 1 semantics.
- [ ] Narration clips generated with the pinned voice, page pacing measured in preview.
- [ ] Overlap and text-containment checkers pass on all six rendered pages.
- [ ] Rendering matches the approved plan; source pills and line highlights work.
- [ ] Notebook exported and executed in the actual browser runtime.

Open review points: Page 5 is the densest page at 80 seconds: measure in
preview whether the pipeline map plus configuration card fit the pace without
crowding, and split the meta.pkl connection into Further explanations if not.
Page 3 deliberately teaches a sealed-box block; confirm the owner accepts
residual connections being named and used but not justified until Lesson 4.

Next milestone: owner review of this plan revision, then fixture pages built
in the Lesson 1 engine with narration, followed by the standard checkers and a
learner preview. Revise from observed confusion, not by adding assets.
