# Final hybrid leg pass — parked for the MVP

The continuous architecture remains approved. The rendered run is not approved.
The user limited this to one final pass, then explicitly selected Pass 04 as the
temporary fallback if the result did not clearly outperform it.

This pass removes the rubber-strip leg solver. Six rigid anatomical sections
(two thighs, two shins, two intact feet) rotate around the unchanged joints.
Four small overlap surfaces use three reusable local contour corrections for
compression, toe-off and recovery. Foot outline vertices receive one rigid
transform; no triangle-area solver can pull the heel into the shin.

The feet hold their shape better than candidate 06. However, the deep recovery
silhouette is still less convincing than the retained Pass 04 contact artwork.
The approved trajectory sometimes brings the foot almost parallel to the shin;
rigid skin overlap makes that limitation more apparent instead of stretching it
away. The guide has **not** been altered to hide this. No additional correction
pass is being made, and no dedicated-tool migration is underway.

- [Pass 04 / 06 / 07](pass04-vs06-vs07.png)
- [06 versus 07 loop](candidate06-vs07.webp)
- [Normal run](normal-run.webp), [slow run](slow-run.webp)
- [LEFT leg: plain / skeleton / weights / foot outline](left-leg-deformation-sheet.png)
- [RIGHT leg: same diagnostic columns](right-leg-deformation-sheet.png)
- [World movement](world-motion.webp), [foot anchors](foot-lock.webp)

## Checks and limits

800 samples retain the original motion, anatomical knee branch and bone lengths.
Rigid-section distance error is under 1.3e-13 px; the loop closes exactly.
All 16 canonical input hashes remain unchanged. Actual Chrome ground-edge range
is 1 px LEFT / 2 px RIGHT at 780 source px/s and .375 display scale, unchanged
from 06. This ground-edge proxy is not a claim of perfectly locked material dots.

Recordings are browser captures, not runtime sprite assets. Mathematical checks
do not establish visual anatomy. Candidate 07 is parked, not accepted.

## Superseding next step

[Living mascot and portals](../../../../../docs/features/rabbit-living-mascot.md)
now uses the existing Pass 04 clip temporarily. Continuous rig research, source
art, approved guide and all comparison evidence remain available. Further run
refinement requires an explicit new request.
