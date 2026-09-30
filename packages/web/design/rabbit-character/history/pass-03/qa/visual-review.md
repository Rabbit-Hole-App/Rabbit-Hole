# Refinement 03 visual review — candidate, not approved

The prior candidate is retained under `history/pass-02/`. No later animation or
app runtime has been added. Generation used the built-in image tool through the
verified ChatGPT subscription; exact prompts and pose coordinates are in `../prompts/`.

## What changed

- **Silhouette:** closer coat fit and less upper-trouser/hip volume, especially
  in three-quarter views. The contract targets 6–8% reductions in widths/depth;
  it does not claim every generated contour obeys an exact percentage. Height,
  muzzle, ears, limb lengths, paws, watch and hem targets remain unchanged.
- **Arms:** the watch arm passes low at 02/06, swings forward across the visible
  chest at 03–05, then opens behind at 07/08. The empty arm is more occluded on
  its rearward passage. Grips differ: ring pinch versus relaxed curled paw.
  Watch lag remains subtle at final dither size.
- **Torso:** pelvis registration permits shoulder/head motion instead of locking
  the pupil to one x coordinate. Lean, coat/lapel overlap, support compression
  and extension contribute to the stride. Shoulder yaw is implied by the drawing,
  not verified three-dimensional geometry.
- **Ears:** lower trailing tips in 03/07 and rebound toward 04/08 preserve
  secondary motion. Ear length/root identity was compared with the seed.

## Rejected candidates

The first run edit repeated the old hand mechanics too closely. A redraw still
underplayed ear flex. An eight-pose joint diagram conditioned a new whole cycle;
its first result swapped/omitted watches and failed to reverse near-arm overlap.
A whole-sheet correction supplied the final eight poses. No final run frames
come from independently generated drawings.

The first turnaround edit used the final dither sheet as input and made darker
outlines plus unequal row heights. It was rejected. The selected edit used the
existing grayscale sources repacked at their recorded scale, then the same
dither conversion as earlier passes. All eight views were edited together.

## Identity and loop

Inspected original versus 01/04/08, all run/standing poses, paired old/new
turnarounds, and 07→08→01→02. The seed's visible ink and alpha remain exact.
Watch handedness is retained, with far-hand occlusion in left-facing standing
views. No mirrored views.

The seam keeps the rear watch-arm phase and forward empty arm; the feet
approach contact from short flight. Ear recoil into compression is visible.
Passing/overlap at 02/06 remains a subjective review point, and eight drawings
still have noticeable stepping. Final visual approval is not claimed.

## World movement and foot contact

Chrome rendered the actual strips over fixed ground with continuous independent
horizontal translation. It exercised 13 FPS at 988/1235/1482 source px/s and
11/15 FPS at the fitted 1235 px/s. At display scale .375, the fitted speed is
463.125 px/s. The GIF/WebP contain actual browser captures.

Using each support patch's front edge as a visible proxy, pose-to-pose drift at
the same speed improves from 9.4/15.4 to .75/4.125 display pixels for the two
support episodes. See `foot-contact-landmarks.png` and `foot-contact-review.json`.
The patch changes as the foot rolls: this is not exact tracking of a physical
toe. Allow roughly 4 source px uncertainty.

**Continuous foot sliding remains visible.** Each held drawing travels 35.625
display pixels during its full 1/13-second hold. The support timeline shows the
foot moving during the hold, then returning near its earlier world point at the
next drawing. Pose timing is better, but this is not a locked-foot result. There
is no hidden per-frame root correction, interpolation, camera tracking, or
per-frame rescaling. This limitation blocks a zero-sliding claim.

Browser and integrity reports certify execution/exports only. The run,
turnaround and character bible remain pending user visual approval.
