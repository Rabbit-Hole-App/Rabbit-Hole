# Iteration notes - 02 qkv projection

Task 12 (`packages/web/src/reference-scenes.js`, scene `causal-self-attention`).
This is a SECONDARY case for Task 12 - the same scene's opening beat (tokens
projected into Q, K, V) overlaps this case's subject.

## What this case's subject looks like here

- `00.png` (t=0s): blank, before anything has appeared - see the primary
  case's notes for why this is honest rather than a capture failure.
- `25.png` (t=4.3s, 25%): this case's subject - five tokens already visible,
  Q/K/V strips just appeared with arrows fanning from the token strip.
- `50.png`/`75.png`/`100.png`: included for continuity (they show the matrix,
  softmax, and output that come later in the same scene) but are not this
  case's subject - see case 03 and case 07 respectively.

## Archiving decision

`generated/latest/` held only a `.gitkeep` before this run. Nothing useful to
archive.

## What the scene composed from role/state/heat

Q, K and V share one role (`observed`) rather than three - they are three
*views* of the same computed quantity, differentiated by their own label
(`query (Q)`, `key (K)`, `value (V)`) and position, not by hue. This was a
deliberate reading of "role is what a thing MEANS, not what it's called":
giving each its own role would encode "which letter this is" as meaning,
which is exactly the kind of decorative role the brief warns against. No
eleventh role was wanted here either.

Q and K are single numbers per token, not per-dimension vectors, so that
`raw score = Q[i] * K[j]` is the literal arithmetic behind the matrix in case
03 - checkable by a reader who multiplies the two numbers on screen, not an
illustration standing in for a real computation.
