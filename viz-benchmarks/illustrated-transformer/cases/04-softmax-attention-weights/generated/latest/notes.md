# Iteration v001 - static

One query's ("south") row, traced through five stages: raw score -> divide
by root(dk) -> softmax -> weight x value -> summed output. Numbers are
purpose-built for this case (not reused verbatim from case01/03) so that one
key ("south") ends up with a genuinely near-zero weight (.01) - the
reference notes specifically ask for a weight small enough that its value's
contribution visibly vanishes, and case01/03's more balanced example does
not produce that.

## The fade effect, achieved without a new primitive

The reference fades a near-zero-weight value vector (draws it paler). There
is no per-cell opacity binding in the vocabulary - a cell's fill comes from
VALUE (heat) or ROLE, never from an external weight. Instead of asking for
that, the scene computes and shows weight x value as its OWN row (a real,
mathematically meaningful intermediate quantity, not an invented one) -
south's cell there is -.01, and heat's own magnitude ramp already renders a
number that small as pale automatically. Same visual outcome the reference
wants, using only an existing primitive (a grid) and an honest intermediate
value - not a workaround, and not a gap.

## Failure classification

- first-draft-arrow-crossed-column-label: LAYOUT / cause: **layout**. An
  arrow from the reference V grid into the weighted-contributions grid ran
  straight down through the centre of a column header ('flows'). Column
  labels tile almost the entire top edge of a grid, so a vertical entry from
  directly above will hit one of them at nearly any x. Fixed by removing the
  arrow - V sits directly above its target and the two labels already carry
  the relationship (same reasoning as case01's tokens -> Q/K/V).

No PRIMITIVE or TEMPLATE gap. No bespoke scene workaround.

## Cross-case pattern - now three in a row

Case01 (arrow through a stacked strip), case02 (arrow through its own
target's caption), case04 (arrow through a column header) are the same
underlying issue: arrows are undecorated straight lines, and nothing checks
whether one crosses a label. Every instance was fixed by moving or removing
the arrow - never a renderer bug, never a scene that couldn't be authored
correctly. Worth a dev-time lint eventually (arrow bounding line intersects
another object's label rect -> warn), but that is authoring tooling, not a
defect in what gets drawn, so it does not block this run. Flagging as the
interval finding instead of fixing it now.

## Patterns exercised

`matrix_operation` passes. `live_computation` is declared on this case but
tests values changing over time (Phase 2); a static frame shows one already-
computed state, so it is `not_exercised` here rather than passed.

## Did this case require a bespoke scene workaround?

No.
