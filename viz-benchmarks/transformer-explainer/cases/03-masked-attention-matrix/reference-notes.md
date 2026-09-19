# Reference notes — masked attention matrix

Captured from the live Transformer Explainer (MIT), 2026-09-19. These notes
describe what the reference does WELL, so our version can be judged against the
teaching, not the picture.

## What the reference does well

- The matrix is drawn as a grid of discs, and the lower triangle is filled while the upper triangle is flat grey - causal masking is visible as shape before any explanation is read.
- Fill intensity carries the weight, so the distribution reads before a single number does. The strongest cell is unmistakable.
- Query labels run down the left and key labels across, both as words, so a cell can be read as this word attending to that word.
- Ribbons enter from the Key and Query lists and leave towards Out, so the matrix is placed in the computation rather than floating.

## What must not be copied

Palette, typography, node shapes, arrow and ribbon style, coordinates and
wording. The target is semantic and pedagogical parity; visual imitation is an
explicit failure mode, scored as REFERENCE_OVERFIT.
