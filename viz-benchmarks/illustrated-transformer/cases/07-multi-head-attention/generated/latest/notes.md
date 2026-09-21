# Iteration v001 - static

Shared input -> three head rows (0, 1, and an abbreviated 7, with a caption
naming the five skipped in between) -> concatenation -> output projection
-> one output. Each head is a compact Q/K/V swatch triple (IDENTITY-coloured,
the same three slots reused across every head on purpose - see "identity
axis validation" below) feeding an abstract Z square.

Structural choice, stated so it doesn't read as an oversight: heads are
stacked VERTICALLY, not drawn as side-by-side columns with a divider line
(the reference's own layout). Vertical stacking reuses the same
spine-and-branch fan-out already proven in cases 01/02 and keeps every
connection a short, local, non-crossing segment. A divider-line column
layout was considered and rejected only because it adds routing risk for no
teaching benefit `visualImitationTarget` already asks us to avoid anyway.

## Identity axis validation (not a gap - recording the negative result)

Eight heads could plausibly have needed more identity slots than the three
that exist (`IDENTITY_SLOTS`). They did not, because head identity here is
conveyed through LAYOUT (row position, "head N" labels), not colour -
IDENTITY stays reserved for what it is actually for within one head:
distinguishing Q, K and V as peers of the same role. This is a genuine
validation of the four-axis model holding up under a case that could have
strained it, not a finding that needed fixing. A future case that truly
needs 8 colour-distinct peers with no layout alternative available is the
one that would find this ceiling for real.

## Failure classification

- unvalued-observed-role-renders-stark: VISUAL_HIERARCHY / cause:
  **content**. Z0/Z1/Z7 use role 'observed' with no identity and no value,
  which resolves to a bold, dark, hue-less fill (RESTING step of the
  'solid' band, no identity hue to warm it). Correct per the role system's
  own convention (observed = measured data, drawn boldly) - case02's Q/K/V
  output vectors use the identical solid-observed treatment and read well
  there, because they had an identity hue to carry it. Here, deliberately
  withholding identity from Z (heads aren't colour-coded) leaves the solid
  fill looking more like a void than "this head's real output." Minor,
  cosmetic, not a system defect - an authoring tradeoff, not a bug.

## Pattern mismatch found in this case's own target.json

`target.json` declares `routing` as one of this case's patterns. Routing
(per `patterns.json`) tests "a choice among alternatives ... where the path
not taken stays legible" - gating, dispatch, branching. Multi-head attention
has no such choice: every head runs, unconditionally, always. Nothing here
is "not chosen." This is not a rendering failure or a vocabulary gap - it is
the case's own pattern declaration not matching what the mechanism actually
does. Recorded as a mismatch rather than forced into a pass or a fail.

No PRIMITIVE or TEMPLATE gap. No bespoke scene workaround.

## Patterns exercised

`flow` passes. `routing` is a declaration mismatch - see above - and is
reported separately from the pass/fail tally rather than counted either way.

## Did this case require a bespoke scene workaround?

No.
