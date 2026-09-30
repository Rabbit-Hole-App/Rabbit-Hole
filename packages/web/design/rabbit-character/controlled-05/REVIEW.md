# Controlled pass 05: pose correction helps; 16 held frames still slide

**Superseding user decision: rejected as a final visual candidate.** The rendered
legs are visibly deformed; correct joints and exports are insufficient. The
[continuous rig experiment](../articulated-06/REVIEW.md) follows this rejection.
The original experiment record below is retained as historical evidence.

**Decision: keep this as a review candidate. Recommend a continuous articulated
or hybrid run renderer as the next approval-gated milestone. Do not generate
another rabbit strip to address the remaining temporal problem.** No app renderer
migration, idle/crouch animation, Bible freeze, gameplay or portal behavior was
implemented.

## Review the result

- [Normal-speed world comparison](world-movement.gif) / [104 Hz capture WebP](world-movement.webp):
  candidate 04, corrected eight keys, controlled 16 frames, all at the same speed.
- [Slow 16-frame loop](run-16-slow.gif), [normal 26 FPS loop](run-16.webp),
  [three-way slow comparison](three-way-slow.gif).
- [Corrected eight-key sheet](corrected-key-contact-sheet.png),
  [16-frame sheet](contact-sheet-16.png), [individual frames](frames).
- [Joint-guide overlay](joint-guide-overlay.png),
  [original / first / middle / final identity comparison](identity-comparison.png).
- [08-key-to-01 seam loop](cycle-seam.gif), [seam sheet](cycle-seam-sheet.png).
- [Measured slip data](qa/foot-slip.json), [actual Chrome measurements](qa/browser-verification.json),
  [magnified sliding inside one hold](qa/within-hold-detail.png).

## What was controlled

All character pixels come from candidate 04, primarily its unobstructed parts in
keys 01 and 05. Hand-authored cutout masks and bind landmarks live in
`authoring/cutouts.json`; the registered sources and extracted parts are retained.
This is disclosed layered recomposition and deformation, not a claim that the
old drawings were pixel-identical after correction. No new image-model request,
optical flow, frame crossfade, mirrored anatomy or new costume artwork was used.
The source seed, candidate-04 strip, canonical proportions, proportion sheet and
standing turnaround remain byte-identical; the verification checks 16 input hashes.

Existing pixels are attached to the approved guide at asset-build time. The
approved eight key joint positions are unchanged. The eight inserted poses are
samples at half-phases of that same fixed-length, continuous guide, including
its pelvis, IK leg trajectories, shoulder/elbow/wrist chains and right-hand
watch curve. No coordinates were chosen by interpolating rendered pixels.

Keys 03/07 now rotate the support foot around toe-off, lift the heel, and keep
the passing recovery foot aligned with the ankle. Keys 04/08 exchange anatomical
roles and both clear the floor (36/34 source px of visible clearance, versus
40/24 before). The guide's geometric clearance is about 37 px. The small
silhouette discrepancy comes from the original foot contour and dither sampling.
The 01/05 and 02/06 contacts also use the common binding so they meet the same
support path. Head, coat and facial textures are reused rather than redrawn.

The upper-body texture now has less pose-specific variation. That avoids
identity changes but can read as a cutout, especially at sleeve overlaps. Passing
legs still overlap heavily in the approved side projection. The overlay makes
their opposite roles explicit; silhouette readability remains a visual judgment.
These are art/skin-quality considerations, separate from support-foot sliding.

## Foot contact: artwork versus sampling

Comparison speed is the guide's **780 source px/s**, with a .375 display scale:
292.5 display px/s. All versions retain the 8/13-second stride. The old candidate
was also measured previously at its own 1,040 source px/s fit; that is a different
speed and must not be silently mixed into this comparison.

| Version at common speed | Final-image stance edge range, LEFT / RIGHT | Actual Chrome stance range, LEFT / RIGHT | Actual Chrome first full hold slide |
|---|---:|---:|---:|
| Candidate 04, 8 frames / 13 FPS | 12 / 18 display px | 13 / 19 px | 22 px |
| Corrected 8 keys / 13 FPS | 0.75 / 1.5 px | 1 / 1 px | 22 px |
| Controlled 16 frames / 26 FPS | 0.75 / 2.25 px | 2 / 1 px | 11 px |

The image measure uses the same foremost opaque pixel in the lowest four source
rows as pass 04, with about four source pixels of contour uncertainty. Chrome
independently reads dark pixels near the actual canvas ground line. Integer
display sampling explains their slightly different small ranges; neither is
precision physical toe tracking. The rendered edge differs from the geometric
toe by 1–7 source px as the original rounded paw rolls.

**A. Pose-to-pose alignment:** substantially improved. Both anatomical support
episodes now follow the approved contact path. The mathematical joints are
exact, while the small visible contour/dither error above remains.

**B. Sliding inside a hold:** still significant. At the common speed, an eight-key
hold travels 22.5 display px and a 16-frame hold travels 11.25 px. Actual canvas
pixels move about 22 and 11 px in the first complete support hold. The corrected
eight-key result isolates the issue: its contact positions improve, but its hold
sliding stays the same. Sixteen frames halve that sliding rather than eliminate it.
At candidate 04's earlier fitted speed, the old hold traveled 30 display px.

Raster sampling also holds the toe-off pose beyond its instantaneous guide
sample until the next frame. More redraws cannot fix that support-timing
quantization. Speed changes need gait phase coupled to travelled distance;
the browser deliberately exercises off-calibration speeds to expose mismatches.

## Seam, anatomy, watch and dither

- **Loop:** rendering phase 8 reproduces phase 0 exactly. Ear/watch curves are
  periodic and do not reset at the seam. The final-to-first joint changes are
  not larger than the largest internal changes. The dedicated seam export shows
  07 → in-between → 08 → in-between → 01 within a complete cycle. Raster stepping
  is still visible; these checks do not certify a visually seamless final run.
- **Anatomy:** one pelvis; unchanged bone lengths and key coordinates; left/right
  chains keep their anatomical identities. Coverage checks place knees, ankles,
  elbows and wrists on raster material. The two passing poses have natural but
  substantial side-view overlap; a skeleton overlay is not proof of appealing skinning.
- **Watch:** one reused face texture, fixed 54 px guide diameter, anatomical right
  grip only. The wrist comes from the arm chain. The existing damped watch lag
  follows it; the watch never drives the wrist or changes hands. The bow is a
  separate existing cutout joining grip and face; the paw occludes its upper edge.
- **Ears:** two separately attached source cutouts, each driven by a warmed damped
  response to head acceleration. Their frequencies/damping differ; their roots
  stay on the head. This is stylized secondary motion, not a physical ear simulation.
- **Style:** original source textures and the existing Bayer coverage/cleanup
  pipeline; output remains transparent or `(10,10,10)` ink at the same 2x logical
  pixel scale. Dither is reapplied after deformation, so dots can boil between
  poses. No optical-flow smear or additional color is introduced. This preserves
  the treatment, not every individual dot's original location.

## Root separation and recommendation

The browser test renders held PNGs using only `drawImage`. An independent physics
test root translates continuously; pose selection never writes world position.
The local pelvis bob belongs to animation. **Visual root compensation is disabled
and explicitly recorded as `[0,0]` in `manifest.json`.** There is no hidden camera
motion, frame-dependent sprite nudge or speed change in the comparison.

A stance-only root offset could cancel the held foot's travel, but it would also
hold the whole body and require a reset/catch-up at pose changes. That trades
foot slide for stepped pelvis motion unless limb deformation also runs
continuously. This experiment does not conceal the remaining problem that way.

The recommended next milestone is to evaluate the approved joints continuously
in a dedicated run renderer, deform the same authored cutouts with joint overlap
or a small weighted mesh, and maintain support anchors in world space. Keep
physics position separate and gait phase driven by travelled distance. Apply the
dither after deformation or with stable material coordinates, then validate both
foot lock and texture stability. That is a proposed migration, **not implemented**.

The local anatomy/pose representation is separate from facing and world position.
It does not assume future motion is horizontal or that a portal occupies one
fixed location. This side-view experiment supplies no automatic new-facing art;
authored directional views and later portal interactions remain separate work.

## Evidence and reproduction

Chrome 152 ran all 8/8/16 frames on live animation ticks, then captured 128 actual
canvas screenshots at 104 samples/s over two cycles. The normal-speed world GIF
uses every other capture (52 samples/s); WebP retains all 128. The run seam occurs
inside that traversal. The world preview's file repeat intentionally restarts the
two-cycle traversal; it is not the character's local cycle seam. No console errors.
Scratch PNG captures and isolated Chrome profiles are removed after packaging;
the lossless WebP retains every captured frame for inspection.
The normal sprite GIF rounds to 620 ms and WebP to 615 ms; the ideal cycle is
615.385 ms. Slow and seam exports use 150 ms per displayed pose.

From the repository root:

```powershell
python -B packages/web/design/rabbit-character/controlled-05/prepare_sources.py
python -B packages/web/design/rabbit-character/controlled-05/prepare_controlled_run.py
python -B packages/web/design/rabbit-character/controlled-05/measure_contact.py
node packages/web/design/rabbit-character/qa/check-preview.cjs --controlled
python -B packages/web/design/rabbit-character/controlled-05/measure_contact.py --package
python -B packages/web/design/rabbit-character/controlled-05/verify_controlled.py
```

Stop for the user's review of these assets and the proposed renderer migration.
Run approval still precedes freezing Character Bible v1 and the planned
idle-breathe/look/watch-check/crouch transition milestone. Portals remain later.
