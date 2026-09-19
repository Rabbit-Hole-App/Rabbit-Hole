# Reference notes — embedding and positional

Captured from the live Transformer Explainer (MIT), 2026-09-19. These notes
describe what the reference does WELL, so our version can be judged against the
teaching, not the picture.

## What the reference does well

- Tokens are listed vertically as words the learner typed, never as ids alone, so the abstraction starts from something recognisable.
- Each token carries a small vector strip beside it, so a token and its numbers are one object rather than two.
- The whole column stays on screen while later stages run, so the learner can always look back at what is being transformed.

## What must not be copied

Palette, typography, node shapes, arrow and ribbon style, coordinates and
wording. The target is semantic and pedagogical parity; visual imitation is an
explicit failure mode, scored as REFERENCE_OVERFIT.
