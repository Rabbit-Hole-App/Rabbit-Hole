# Iteration v001 - static

Encoder stack (3 boxes) beside a two-layer decoder stack (3 sublayers each:
self-attention, encoder-decoder attention, feed forward). The top encoder
box (role 'output' - it is genuinely the thing whose output matters here)
sends two fan-out arrows, one into each decoder layer's encoder-decoder
attention box, showing the required "reaches every layer, not just the
first" fact as a real diverging pair of arrows rather than a caption
asserting it.

## First-draft defect, fixed before finalizing

Two compounding mistakes: the 85-character heading overflowed a 680px scene
and was clipped mid-word ("cross-a..."), and "encoder-decoder attention" (26
characters) was given a 160px box - narrower than even the renderer's own
default node width (176px) - so the label overflowed the box on both sides,
and the incoming fan-out arrow landed inside that overflowing text. Fixed by
shortening the heading, widening the scene, and widening the decoder boxes
to 220px. Re-rendered clean: full heading, no label overflow, visible
arrowheads landing cleanly on each box's edge.

## Failure classification

- first-draft-heading-clipped-and-box-labels-overflowed: LAYOUT / cause:
  **layout**, moderate (would have been a real defect if shipped, not just
  a nitpick - the title was genuinely unreadable in the first render).

No PRIMITIVE or TEMPLATE gap. No bespoke scene workaround.

## Cross-case finding, now four instances

Case01 (arrow through a stacked strip), case02 (arrow through a caption),
case04 (arrow through a column header), and this case (a label overflowing
its own box, then an arrow landing inside that overflow) are all the same
underlying fact: nothing in `validateScene` or `sizeOf` checks whether a
label fits its shape, or whether an arrow's line intersects another
object's bounds. Every one of the four was fixed with an ordinary
coordinate or size change - never a renderer bug, never something the
vocabulary couldn't express. Four instances across nine cases is enough to
name this as the run's clearest recurring finding: a dev-time lint (does
this label fit this box; does this arrow's line cross that object's bounds)
would remove a render-and-look cycle each time, though nothing here ever
blocked a case from being authored correctly.

## Patterns exercised

`flow` passes. `coordinated_views` passes loosely - the same encoder output
is shown as one linked fact (a highlighted source, two fan-out arrows) at
two decoder layers, rather than as separate unlinked diagrams.

## Did this case require a bespoke scene workaround?

No.
