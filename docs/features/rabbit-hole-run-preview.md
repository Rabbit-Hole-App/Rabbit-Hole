# Rabbit Hole mascot: run validation

Current decision (2026-09-23): the final [hybrid 07 pass](../../packages/web/design/rabbit-character/hybrid-07/REVIEW.md)
does not clearly outperform Pass 04 visually. Preserve it for later, use the
user-authorized Pass 04 temporarily, and perform no further run refinement without
a new request. The [living mascot and reversible portal MVP](rabbit-living-mascot.md)
is now the active milestone. Character Bible v1 remains unfrozen.

## Historical continuous rig 06

Earlier scope: the user-authorized continuous articulated run, using the approved
[joint guide](rabbit-run-joint-guide.md) and existing candidate-04 source textures.
The [rig 06 experiment](../../packages/web/design/rabbit-character/articulated-06/REVIEW.md)
implements continuous guide evaluation, connected limb meshes and world support
anchors. No held full-character frames are used by that renderer. In Chrome at
780 source px/s and .375 scale, the ground-edge proxy ranges 1/2 display pixels
for LEFT/RIGHT, versus 32/38 in pass 04 and 9/10 in pass 05 across the same support
intervals. These include samples between historical pose boundaries.

**Skinning fails visual acceptance:** tucked recovery ankles remain pinched and
folded despite positive triangle areas. The custom experiment stops at the user's
fallback gate; Spine Professional is recommended for authored mesh topology,
weights and deformation correctives. No tool migration, new drawings, new run
strip, living idle/crouch or portals were started in that experiment. Reference artwork, proportions
and turnaround are unchanged. **The run remains unapproved.**

Review [normal motion](../../packages/web/design/rabbit-character/articulated-06/normal-run.webp),
[world comparison](../../packages/web/design/rabbit-character/articulated-06/world-motion.webp),
[joint close-ups](../../packages/web/design/rabbit-character/articulated-06/leg-deformation-closeups.png)
and the full linked report for rig/overlay/foot-lock recordings and reproduction.

## Controlled pass 05

Historical experiment, subsequently rejected by the user because the rendered
leg deformation looked broken. Its numeric checks did not approve its anatomy.

Review the [normal-speed world comparison](../../packages/web/design/rabbit-character/controlled-05/world-movement.gif),
[slow 16-frame loop](../../packages/web/design/rabbit-character/controlled-05/run-16-slow.gif),
[contact sheet](../../packages/web/design/rabbit-character/controlled-05/contact-sheet-16.png)
and [measured report](../../packages/web/design/rabbit-character/controlled-05/REVIEW.md).
The report includes the eight-key sheet, guide overlay, seam, anatomy/watch/style
limitations, root metadata and reproduction commands.

At the common guide speed of 780 source px/s and .375 display scale, Chrome
measured candidate-04 pose-boundary contact ranges of 13/19 display px, corrected
eight-key ranges of 1/1 px, and 16-frame ranges of 2/1 px. Held-pose sliding remains
about 22 px in both eight-frame versions and 11 px with 16 frames at 26 FPS.
All retain the 8/13-second cycle. These are observed canvas pixels, distinct from
the source-image edge proxies also documented in the report.

That experiment recommended continuous articulated/hybrid rendering. The user
subsequently authorized rig 06 above. No further redraw is proposed to solve
temporal sampling. The latest MVP decision above supersedes its earlier stop point.
The following section preserves candidate 04's earlier evidence.

## Render 04 review package

Candidate-04 assets remain under `packages/web/design/rabbit-character/`. Start with
`run-comparison.gif`, `run-contact-exchange.png`, `contact-sheet.png`,
`run-guide-overlay.png`, `run-slow-preview.gif`, `run-seam-preview.gif`, and
`run-world-comparison.gif`. `run-strip.png` and the eight individual transparent
frames are the candidate runtime assets. The previous complete run and its
evidence are preserved in `history/pass-03/`.

The selected source is one coherent eight-pose generation plus a whole-sheet
foot/ear correction. `prepare_preview.py` applies one .96 source scale and
recorded pelvis/floor registration; it does not warp limbs, flip individual
frames or fit each pose to its bounding box. Stance frames 01,02,03,05,06,07
reach y=480, while flight 04/08 retain 40/24 px clearance. The guide's expected
flight clearance is about 37 px in both: this is one visible remaining mismatch.

The rendered contact roles are clearer, with far LEFT supporting at 01 and near
RIGHT at 05, and the watch attached to the near RIGHT sleeve chain throughout.
The overlay also exposes departures in recovery feet, passing limbs and
shoulder/watch positions. Image conditioning did not enforce every joint as a
hard geometric constraint. Do not mark exact conformance true.

Actual isolated Chrome tests exercised continuous translation over fixed ground
at 13 FPS / 832,1040,1248 source px/s, 11/15 FPS at 1040, and the guide's 780 at
13 FPS. Fitting the rendered stance path gives 1040 source px/s. At display scale
.375, pose-boundary support ranges are 3/7.5 px, while held-frame translation is
30 px per full 1/13-second hold. At the guide speed the pose-boundary ranges
increase to 12/18 px. Both art/contact-path errors and runtime sampling contribute;
speed calibration alone cannot eliminate the within-frame sliding.

Full findings, limitations, source history and recommended next corrections are
in [render-04-review.md](../../packages/web/design/rabbit-character/qa/render-04-review.md).
The built-in image tool ran through verified ChatGPT subscription authentication.
Prompts are `prompts/run-04-*.txt`; no paid API fallback was used.

Rebuild the historical candidate-04 review from the repo root (no app UI or deployment):

```powershell
python -B packages/web/design/rabbit-character/prepare_preview.py
python -B packages/web/design/rabbit-character/prepare_review.py --run-only
python -B packages/web/design/rabbit-character/prepare_travel_review.py
python -B packages/web/design/rabbit-character/prepare_run_guide_review.py
node packages/web/design/rabbit-character/qa/check-preview.cjs
node packages/web/design/rabbit-character/qa/check-preview.cjs --world
python -B packages/web/design/rabbit-character/prepare_travel_review.py --package
python -B packages/web/design/rabbit-character/qa/verify-assets.py
python -B packages/web/design/rabbit-character/qa/verify-joint-guide.py
```

Stop for visual run approval. Only then freeze Character Bible v1 and proceed to
living idle/look/watch-check/crouch transitions. No portal behavior in this pass.

## Historical refinement 03 notes

The following describes the prior run and prior measurements. Its files and
scripts are retained under `history/pass-03`; use the commands above for the
current candidate. The unchanged art/identity rules still apply.

Prior scope: refinement 03 of the eight-frame run, a leaner character specification,
an eight-view turnaround, and horizontal-travel validation. Approval is separate
from starting a playable prototype. Earlier passes are preserved under
`history/pass-01/` and `history/pass-02/`.
Directional naming, turning, and the later portal milestone are specified in
[rabbit-hole-directions-and-portals.md](rabbit-hole-directions-and-portals.md).

## Art contract

The canonical rendered reference is the first 240 x 168 frame of
`packages/web/design/rabbit-sprite.png`. `rabbit_1.jpg` remains the underlying
character reference. Its long ears, pointed muzzle, fitted patterned coat,
waistcoat, striped trousers, large rabbit feet, and pocket watch are intentional.
Keep them at the same proportions and on the same side of the character.

The seed is extracted from the existing sprite, with an integer nearest-neighbor
enlargement and transparent padding only. Its pixels are not redrawn. Deliver
black ink and transparent negative space; inspect against white paper. Preserve
the coarse ordered dither, especially the pale ears, face, paws, and watch face.
Do not turn it into a black outlined cartoon, smooth shading, or solid silhouette.

Canonical run direction is right. Each frame contains one complete rabbit. The
watch remains in the anatomical right hand as it swings from behind the hip to
in front of the chest, through intermediate positions beside the waist. The
empty arm counter-swings. Ear tips, feet, coat
tails, and watch must fit inside every frame with clear padding.

## Motion contract

Eight distinct drawings, one complete run cycle, 13 frames per second. Generate
the complete action in one image-conditioned request using the seed. No separate
frame generation, world travel, artificial wrapper squash, or random ear motion.
The pelvis supplies horizontal registration while the head/shoulders can move
with the torso and the pelvis rises and falls through the stride. LEFT and RIGHT
always mean anatomical limbs: LEFT is far, RIGHT is near in this profile.
Names never change when limbs cross or the watch changes screen position.

The frame-by-frame contract is maintained in
[rabbit-character-proportions.md](rabbit-character-proportions.md#refined-run-pose-contract).
The current guide starts with LEFT contact at 01 and RIGHT contact at 05,
with compression, passing/toe-off, and short flight,
with opposing arm travel, torso weight changes, delayed ears, and a continuous
watch trajectory.

The planted foot moves backward relative to the stationary root during stance;
this is the local pose change that would cancel forward world velocity. Do not
pin the foot to one pixel through the entire in-place cycle or draw it skating
along a stationary floor. Review both the in-place loop and stance timing.

## Registration and outputs

Final canvas: 512 x 512 pixels per frame; fixed floor at y=480 and ground anchor
`[256, 480]`. Refinement 03 retains the padding/baseline introduced in pass 02.
The original seed remains unchanged. A single source-to-frame scale of .82
registers the newly drawn run; the standing sheet uses 432/378, matching the
same nominal standing height H=432. These are source-resolution conversions,
not different per-pose scale corrections.
Keep one shared scale and registered anatomical
landmarks across the cycle. Preserve flight above that floor. Never bottom-align
every frame to its lowest visible pixel,
which would erase flight and move the body when ears or feet change pose.

Outputs live under `packages/web/design/rabbit-character/`:

- `character-seed.png`: transparent seed from the shipped sprite.
- `generated/run-source-sheet.png`: unmodified final generated action sheet.
- `generated/run-strip-source.png`: that same source, repacked as one row.
- `run-strip.png`: normalized eight-frame horizontal sheet.
- `animations/run_right/frames/01.png` through `08.png`: identical fixed canvases.
- `contact-sheet.png`: all poses on white for inspection.
- `identity-comparison.png`: original seed beside frames 01, 04, and 08.
- `run-preview.gif` and `run-preview.webp`: looping review artifacts.
- `run-comparison.gif` and `run-comparison-sheet.png`: prior and refined poses,
  using the immediate previous pass at the same baseline, without rescaling.
- `run-world-comparison.gif` / `.webp`: two cycles of actual browser captures,
  previous and revised sprites traveling over fixed ground.
- `run-seam-preview.gif`: full slower loop, starting at 07 and including 08-to-01.
- `run-seam-sheet.png`: adjacent poses 07, 08, 01 and 02.
- `turnaround-sheet.png`: front, back, left and right views, all authored together.
- `turnaround-8-view-sheet.png`: cardinals plus front/back-left/right 3/4 views.
- `turnaround-refinement-comparison.png`: previous/revised views paired by direction.
- `turnaround/*.png`: eight individually registered views; no mirroring.
- `canonical-proportion-sheet.png` and `proportions.json`: the proposed character
  bible, alongside [the full proportion contract](rabbit-character-proportions.md).
- `generation-prompt*.txt`, `turnaround-prompt*.txt` and `manifest.json`: prompts,
  provenance, timing, registration, and explicit unapproved/candidate status.
- `prompts/`: the exact refinement prompts, including unsuccessful attempts.
- `qa/`: browser playback evidence and structural asset verification.

The workflow follows OpenAI's `game-studio` / `sprite-pipeline`, pinned to
`openai/plugins` commit `1dc195897af4161d039b80d8471ec0a10c9bbc89`.
Its generic normalizer crops and bottom-aligns each pose. Use fixed slots for
this run instead, preserving airborne phases and body bob. Use the built-in
image generator through the verified ChatGPT session, with no API-key fallback.

The eight poses were generated together on a four-column, two-row source sheet
after single-row attempts crowded the extremities. Repacking that one generation
into a strip does not combine unrelated frame generations. Refinement edits also
operate on the complete action: arm passing, flexible ear curves, and watch
continuity were corrected together. The final run uses one complete resulting
sheet, with no replacement frames from separate generations.

The existing eight source views were repacked at their recorded scale and anchor,
then edited together to reduce coat/hip volume. A first edit conditioned on the
already-dithered sheet added harsh outlines and uneven row scale, so it was
rejected. The selected source is `generated/turnaround-refinement-03-source.png`.
The manifest records its hash and each view's registration.

The generator supplies grayscale source art; the existing 4 x 4 Bayer matrix,
two-pixel connected-figure cleanup, and ear/paw coverage lifts produce final ink.
A shared coverage curve compensates for jacket shading that the original color
key removed. There is no per-frame scale fitting or pose replacement by wrapper
transforms. The source sheets and every prompt are retained.

## Acceptance

Compare first, middle, and final drawings with the seed for head shape, ear
length, costume, watch, hand/foot scale, and ink density. Reject identity drift,
missing or additional limbs, changed proportions, clipped extremities, position
jumps, missing weight changes, duplicated pose beats, or a bad loop seam.

Check the encoded animation's eight distinct frames, durations, loop setting,
common canvas, transparency, and safe margins. Visual quality remains subject
to the user's review; generated assets are candidates until approved.

## Verification and status — 2026-09-23

The seed retains the exact shipped ink after 2x nearest-neighbor enlargement and
transparent padding. Run poses 01, 04 and 08 are compared with it in
`identity-comparison.png`. The refinement reduces padded clothing volume, adds
low passing hands, changes the visible near-arm/torso overlap during forward
swing, and retains delayed ear bending. Stance/toe-off frames 01, 02, 03, 05,
06 and 07 end at y=480; flight frames 04 and 08 retain 12 and 4 pixels of clearance.
Registration uses manually
identified support landmarks; airborne frames are never aligned by their bounds.
The slow preview and seam sheet expose the 08-to-01 transition for review.

Isolated Chrome 152 loaded both real encoded animations over a local-only server
and displayed eight distinct frames in each, with no console errors. It also
checked all eight frames in the old/new comparison and the slow full loop. GIF uses
620 ms per cycle (centisecond rounding); WebP uses 616 ms, approximately 13 FPS.
Structural checks also confirmed the exact seed pixels and alpha, eight unique
512-pixel frames, strip/frame equivalence, clear image borders, shared stance
baseline, binary transparency, and lossless decoded previews. Results are saved
in `qa/artifact-verification.json` and `qa/browser-verification.json`.
The additional Chrome travel fixture draws both actual strips with independent
continuous horizontal motion over fixed ground. It tests 988, 1235, and 1482
source pixels/second at 13 FPS, plus 11 and 15 FPS at 1235. At the .375 review
scale, the fitted speed is 463.125 display pixels/second. There is no camera
movement or per-frame root/scale correction. Two cycles are captured at 52
samples/second and exported as the world-comparison previews.

The foremost ink in the lowest four-pixel support band is an observable contact
patch proxy. At the fitted speed its pose-to-pose range falls from 9.4/15.4
display pixels in pass 02 to .75/4.125 in pass 03 for the two support episodes.
The proxy has about four source pixels of measurement/foot-roll uncertainty;
it is not an exact material-point tracker. **Foot sliding is not resolved:**
the continuous root travels 35.625 display pixels during a full 77ms drawing
hold. The travel preview and `qa/world-support-timeline.png` expose this movement
and the snap back at pose changes. Better pose-boundary alignment does not mean
continuous foot locking. These limits are preserved in the manifest and QA.

The turnaround keeps watch handedness through eight views, with the far-side
watch partly occluded in left-facing views. Unseen costume details and the
standing views remain proposed artwork. User visual approval is pending for
both the run and turnaround. Gameplay, directional animation sets and portal
entry/exit previews have not started.

Rebuild with Pillow from the repository root:

```powershell
python packages/web/design/rabbit-character/prepare_preview.py
python packages/web/design/rabbit-character/prepare_turnaround.py
python packages/web/design/rabbit-character/prepare_review.py
python packages/web/design/rabbit-character/prepare_travel_review.py
node packages/web/design/rabbit-character/qa/check-preview.cjs
node packages/web/design/rabbit-character/qa/check-preview.cjs --world
python packages/web/design/rabbit-character/prepare_travel_review.py --package
python packages/web/design/rabbit-character/qa/verify-assets.py
```

The browser checks use installed Windows Chrome in isolated temporary profiles
and serve only the local assets and verification fixture. No app interface,
Phaser gameplay, or deployment is part of this milestone.
