# Iteration notes - 07 output probabilities

Task 12 (`packages/web/src/reference-scenes.js`, scene `causal-self-attention`).
This is a SECONDARY case for Task 12 - the same scene's closing beats (the
row-4 softmax distribution and the weighted-sum output) overlap this case's
subject.

## The one thing to read before scoring this case

The reference's "Probabilities" panel is the language model's final
distribution over the *whole vocabulary* for the next token - the output of
an LM head, downstream of every transformer block. This scene is a single
causal self-attention layer; it has no LM head. What it actually produces
that is structurally similar is the **row-4 softmax weights** - one query
token's probability distribution *over the sequence positions it can see*.
Both are real probability distributions with the pattern the reference notes
credit ("magnitude readable before any number is read", "one focal point"),
but they are not the same computed thing, and the case's `notes.md` says so
on purpose so this is scored as a pattern overlap, not mistaken for identity.

## What this case's subject looks like here

- `75.png` (t=12.9s, 75%): the row-4 distribution as bars appears, output
  strip and the softmax-formula equation are still fading in.
- `100.png` (t=17.2s, 100%): final state - bars settled, output values
  computed, closing caption.
- `00.png`/`25.png`/`50.png`: earlier beats of the same scene (tokens/QKV,
  matrix forming) - not this case's subject; see case 02 and case 03.

## Archiving decision

`generated/latest/` held only a `.gitkeep` before this run. Nothing useful to
archive.

## Why the bars are not sorted by magnitude

The reference sorts candidates by probability. This scene's bars keep key
POSITION order (h, e, l, l, o) instead, because position is the meaningful
axis for an attention row - re-sorting would erase which position is which
and contradict the causal-masking story the rest of the scene tells. This is
a deliberate divergence, not an omission.

## Bug found and fixed during this task

Before this run, the bars were built from the wrong slice of the softmax
array (row 3's tail plus one value from row 4, not row 4 itself) - see case
03's notes for the detail; the fix applies to this case's screenshots too,
since it is the same object.
