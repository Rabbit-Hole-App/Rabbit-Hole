# Render 04: guide approved, rabbit run still a candidate

The user approved joint guide 04 as the motion basis. Its coordinates are
unchanged, with the approval and content hash in
`../motion/run_right/guide-04/approval.json`. The previous run, sources and QA
are preserved in `../history/pass-03/`.

The selected output was generated as one complete eight-pose sheet, followed by
one whole-sheet foot/ear edit. No individual frame was independently generated,
flipped, stretched or limb-warped. Normalization uses one .96 scale and documented
pelvis/floor registration. All frames are 512x512 with anchor `[256,480]`.
The seed, `proportions.json`, canonical proportion sheet and all turnaround
images are byte-identical to pass 03. No new character proportions were authored.

## What improved, and what did not pass

The visible near right thigh trails in 01 and leads in 05. The near right
sleeve carries the watch forward in 01 and rearward in 05; the empty far sleeve
counter-swings. The pocket watch remains on that same anatomical hand through
the cycle. These are visual readings of the rendered overlaps, not an automatic
joint detector's certification. See `../run-contact-exchange.png`.

The guide overlay exposes remaining differences rather than concealing them:

- Recovery feet in the contact poses rotate farther backward than the approved
  targets. The heel/ankle/toe relationship is not an exact match.
- Passing/toe-off in 03/07 compresses the leg shapes and occludes more of the
  far shin/foot than the guide. This still needs visual refinement.
- Flight clearances are 40 px at 04 and 24 px at 08; the guide has about 37 px
  in both. Trailing-foot silhouettes differ more than intended.
- Some shoulder, wrist/watch and inferred hip positions miss the targets.
  Hidden joints cannot honestly be measured as precise anatomical landmarks.
- Ear tilt varies through compression/flight and remains attached to the same
  head. It is subtler than the desired acceleration response; the export is not
  a verified ear simulation.

The actual drawing is therefore **not an exact trace of the approved skeleton**.
The guide's approval has not been copied to the artwork. The pose overlay is an
audit image, not a claim that adding colored lines makes the render conform.
The 08-to-01 loop is exported at 250 ms/pose for review; anatomy/ear differences
still prevent a claim of a visually locked seamless run.

## A. Art / registration / contact-path issue

At frames 01,02,03 the approved forefoot x targets are 356,296,236. The rendered
support-edge proxies are 377,305,225. In 05,06,07 they are 379,311,211.
That produces target differences from -25 to +23 source px. The edge proxy moves
slightly as a paw rolls; allow approximately 4 px uncertainty, and do not treat
these numbers as exact physical toe tracking.

The resulting stride fits 1,040 source px/s at 13 FPS, versus 780 for the guide.
At the guide speed, support-edge ranges across the two stance episodes are
12/18 display px. At the fitted speed they fall to 3/7.5 px (display scale .375).
This is evidence of remaining art/registration mismatch; the gait cannot yet be
described as mechanically exact merely because the leg exchange reads better.

## B. Runtime sampling issue

Chrome rendered both real strips over stationary ground with independent,
continuous world translation. It tested 13 FPS at 832,1,040,1,248 source px/s,
11/15 FPS at 1,040, and the approved guide speed 780 at 13 FPS. Eight poses
played on real requestAnimationFrame ticks. The exported world GIF/WebP contain
64 actual browser captures over two cycles; no camera motion or root offsets
were added. The animation seam occurs inside that continuous recording; the
final preview-file repeat restarts the two-cycle traversal.

At the fitted speed, a drawing held for 1/13 s translates 80 source px, or
**30 display px**, before the next pose. The screenshots show the stance foot
moving during that hold and stepping back at the pose change. Speed calibration
cannot remove this within-frame movement: it is a playback limitation of eight
held raster drawings. This is the larger measured movement during an individual
hold, but the overall result still contains both A and B; it is not solely a
runtime problem.

Compared at this same world speed, pass 03's stance ranges are 12/10.5 display
px. At its own previous best-fit speed, however, pass 03 measured .75/4.125 px.
Do not cherry-pick the common-speed comparison into a claim that every contact
metric improved. Clearer anatomical roles and better contact locking are
separate acceptance conditions.

## Best next correction

Avoid another unstructured redraw of the entire rabbit. Keep the identity
references and approved joint data fixed, and explicitly author the remaining
limb/foot contours onto those targets. The model's image conditioning improved
topology but did not act as a hard pose constraint. A controlled layered rig or
direct pose cleanup is the reliable next step if exact constraint adherence is
required; that would be a deliberate workflow change, not hidden asset warping.

After the drawings conform, derive runtime speed from the final stance path and
couple gait phase to travelled distance. For continuously planted feet, add
validated in-between poses or interpolate articulated limbs. Merely playing the
same eight drawings faster changes cadence and does not provide missing poses.
Whole-sprite root-offset compensation is not the first choice: it can trade
sliding for pelvis/body jitter and still leave foot-rotation errors. It would
need a separate visual test if adopted.

## Evidence and provenance

- `browser-verification.json`: native GIF/WebP/comparison/seam playback; eight
  distinct poses, no console errors.
- `world-travel-verification.json`: actual Chrome movement, speed/FPS cases,
  fixed ground and capture provenance.
- `foot-contact-review.json`, `world-support-timeline.png`: stance measurements
  and visible movement inside held frames.
- `guide-render-review.json`, `../run-guide-overlay.png`: target deviations.
- `artifact-verification.json`: integrity, transparency, dimensions, unchanged
  identity assets and export decoding. Passing is not visual approval.

Generation used the built-in image tool through verified ChatGPT subscription
authentication. Prompt files are `../prompts/run-04-*.txt`. The initial sheet
turned the bottom row left; the next repeated near-leg overlap and switched
watch arm. Both were rejected. A capsule depth guide using the exact same
approved joints produced clearer side exchange, followed by the selected
whole-sheet foot/ear correction. Two service output rejections produced no
image; their unchanged benign requests succeeded on retry. No paid API fallback.

Stop here for the user's review. Do not freeze Character Bible v1, generate
idle/look/watch-check/crouch, or begin portal behavior yet.
