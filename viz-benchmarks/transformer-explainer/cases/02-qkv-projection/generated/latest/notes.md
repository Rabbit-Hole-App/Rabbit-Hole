# Iteration notes - 02 qkv projection (iteration 2, Phase A.5d gate)

Same scene as case 03 (`packages/web/src/reference-scenes.js`,
`causal-self-attention`), re-rendered after the six passes that fixed
iteration 1's findings. SECONDARY case - this case's subject is the scene's
opening beat (tokens projected into Q, K, V), captured in `25.png`.

## What changed for this case specifically

`q` and `k` changed `heat: true` to `heat: { mode: 'signed' }` (both are
real dot-product operands and K has a genuine negative entry, -0.50).
More importantly for THIS case: `q`, `k` and `v` each gained an
`identity: 'query' | 'key' | 'value'` field, resolved through
`scene-vocab.js`'s `IDENTITY_SLOTS`. This is the fix for the finding that
motivated the whole phase - Q, K and V rendering pixel-identical because all
three are legitimately `observed` - and this case is exactly where that
finding lived.

## Why this is not a reversal of iteration 1's own praise

Iteration 1 scored this case's shared-role choice as a strength ("one shared
role... is a correct application of role-as-meaning"), and that is still
true - role still says "these are all computed quantities," identity now
separately says "and here is which one." The two channels are orthogonal by
construction (see `scene-identity.test.mjs`: identity changes the hue, never
the fill tier ROLE_FILL assigns), so adding identity does not undo the
role decision iteration 1 credited - it answers a different question the
scene had no channel for at all.

## What this case's subject looks like here

- `00.png`: blank, unchanged.
- `25.png` (t=4.3s, 25%): five tokens visible, Q/K/V strips fanned out from
  the token chip with arrows, each now carrying its own frame colour. K's
  negative entry (-.50) renders in the diverging blue heat-negative token,
  visually distinct from the orange heat-positive fill everywhere else in
  the same strip.
- `50.png`/`75.png`/`100.png`: continuity frames, scored under case 03 and
  case 07.

## Archiving

`generated/latest/` (iteration 1) archived to `generated/history/v001/`;
`evaluation/current.json` archived to `evaluation/history/v001.json`.

## The one finding specific to this case

COLOR_CONTRAST (shared system-level cause with case 03) is resolved - see
`critic-report.json`. FOCAL_POINT (low severity, an authoring choice not a
vocabulary gap) is unchanged and still open; it was never one of the five
findings this phase targeted.

## Cross-reference, not a hit

Case 03 documents a new COORDINATION defect this iteration surfaced (a
heat-mapped cell's fill can freeze mid-reveal under a gradual, human-paced
scrub). This scene's Q/K/V strips are not vulnerable to it: they are
populated with real values in `initialState`, never starting `null`, so
heat is truthy from the first frame and the vulnerable blocked-to-revealed
transition never happens for these three objects. Checked directly, not
assumed.
