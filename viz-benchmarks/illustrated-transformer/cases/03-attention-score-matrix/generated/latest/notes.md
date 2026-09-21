# Iteration v001 - static

Q and K strips (same running example as case01: tokens river/flows/south).
Three named-operand equations derive "river"'s whole score row explicitly
(`q_river . k_river = .54`, etc. - the literal Q[0]*K[j] products), then an
arrow ties that derivation to its place in the full 3x3 score grid, whose
row 0 is highlighted to match. This directly implements the reference's own
stated winning technique - verifiable, named-operand arithmetic - without
copying its layout, palette or wording.

## Failure classification

- first-draft-equation-overflow-and-misalignment: LAYOUT / cause: **layout**.
  First draft tried to align each equation directly above its matching grid
  column (60px pitch) and sized the scene from the grid alone; a ~200px-wide
  equation can never fit a 60px column regardless of width, and the third
  equation overflowed the canvas. Fixed by stacking the three equations
  vertically instead of trying to align them to the grid's pitch, and by
  widening the scene. Caught by rendering and looking, not by any check.

No PRIMITIVE or TEMPLATE gap. No bespoke scene workaround.

## Confirms the case01 harness fix (corrected framing - see case01's notes)

This is the first case to render an equation after adding
`katex/dist/katex.min.css` to `AnimatedScene.jsx`. `q_{river}\cdot
k_{river} = .54` renders as real KaTeX - proper italics, subscript, centred
dot - not flat text. Case01's notes originally called this a live product
bug fix; it was actually a fix for this benchmark's own standalone render
harness (`main.jsx` already loads `ask.jsx`'s katex CSS eagerly in the real
app, per `dist/index.html`), corrected there rather than silently. Recording
here only that the fix generalises as expected from a stylesheet import,
not a per-scene patch.

## Patterns exercised

`matrix_operation` passes. This case declares only one pattern.

## Did this case require a bespoke scene workaround?

No.
