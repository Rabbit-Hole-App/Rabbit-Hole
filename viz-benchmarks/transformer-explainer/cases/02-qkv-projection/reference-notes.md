# Reference notes — qkv projection

Captured from the live Transformer Explainer (MIT), 2026-09-19. These notes
describe what the reference does WELL, so our version can be judged against the
teaching, not the picture.

## What the reference does well

- Q, K and V are colour-coded consistently - one hue each - and that coding survives into the attention stage, so identity is traceable across columns.
- All three derive visibly from the same token row, which makes it clear they are three views of one thing rather than three inputs.
- The three letters are large enough to read at a glance; the vectors behind them are texture, not detail to be read.

## What must not be copied

Palette, typography, node shapes, arrow and ribbon style, coordinates and
wording. The target is semantic and pedagogical parity; visual imitation is an
explicit failure mode, scored as REFERENCE_OVERFIT.
