# Iteration v001 - static

Two worked rows (river at position 0, flows at position 1): embedding grid
+ positional grid = input-to-encoder grid, using the REAL sinusoidal
formula (PE(pos,2i)=sin(pos/10000^(2i/d)), PE(pos,2i+1)=cos(...)) computed
in Node before authoring, not decorative numbers - the addition arithmetic
on screen is checkable. Below that, an 8-position x 8-dimension heatmap of
the positional vector alone, same formula, at full scale.

The heatmap genuinely reproduces the structural fact the source calls out:
d0/d1 swing widely across positions (fast wavelength), d6/d7 barely move
(slow wavelength) - visible directly in the real computed values, not
asserted in a caption.

## Failure classification

- first-draft-bottom-caption-overflowed-canvas: LAYOUT / cause: **layout**,
  minor. A 155-character closing caption ran past the 720px scene width and
  was clipped mid-sentence; a similarly-styled 113-character caption
  elsewhere in the same scene fit fine, so this was a per-caption length
  judgement, not a scene-wide sizing problem. Shortened to ~110 characters
  and re-rendered clean.

No PRIMITIVE or TEMPLATE gap. No bespoke scene workaround.

## Cross-case finding, now five instances

Case01/02/04/09 (see case09's notes for the fuller writeup) plus this case
are all "authored content exceeded its container, caught only by rendering
and looking." This one is the simplest variant yet - a caption wider than
the scene itself - confirming the finding is broader than "arrows crossing
labels": nothing checks that authored TEXT fits its intended space, whether
that space is a box, a grid's label zone, or the scene's own width.

## Patterns exercised

`matrix_operation` passes. `live_computation` is declared but tests values
changing over time (Phase 2) - this is one static, already-computed
heatmap, so it is `not_exercised` rather than passed, even though the
values themselves are genuinely computed rather than decorative.

## Did this case require a bespoke scene workaround?

No.
