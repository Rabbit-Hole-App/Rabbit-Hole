# Continuous rig 06 — foot locking improves; skinning gate fails

**Decision: stop custom renderer refinement at the user's fallback gate. This is
not an acceptable final visual run.** Continuous evaluation and support contact
work, but tucked recovery poses still pinch the lower leg/ankle into a folded
silhouette. Zero inverted triangles did not establish good anatomy. Pass 05 is
also explicitly rejected as a final visual candidate.

No additional run strip, generated drawing, raster in-between asset, idle,
crouch, portal behavior or Character Bible freeze was created. The recordings
below capture the continuous WebGL renderer; the renderer never plays them.
The existing landing-page mascot was not replaced.

## Inspect the actual skin

- [Normal-speed run](normal-run.webp) / [GIF](normal-run.gif).
- [Slow rendered run](slow-run.webp) / [GIF](slow-run.gif).
- [Pass 04 / Pass 05 / continuous comparison](comparison-slow.webp) / [GIF](comparison-slow.gif).
- [World-motion comparison](world-motion.webp) / [GIF](world-motion.gif).
- [Plain leg close-ups](leg-deformation-closeups.png): the important failure evidence.
- [Plain arm/elbow close-ups](arm-deformation-closeups.png).
- [Undithered surface inspection](surface-continuity-review.png).
- [Rendered key review](rendered-key-review.png), [cycle seam](cycle-seam.webp).

The isolated leg examples include phases 4.25/4.65 for anatomical LEFT and the
opposite half for RIGHT. The foot stays topologically attached, but the skin at
the tightly folded ankle narrows and overlaps into an implausible shape. The
continuous mesh improves the knee/cuff joins relative to pass 05; that improvement
does not cancel the ankle failure. Watch-side elbows are visibly more connected,
but the run as a whole fails the required "neither leg ever looks broken" gate.

## Rig and motion

- [Rig visualization](rig-visualization.png).
- [Skeleton plus rendered overlay](skeleton-overlay.webp).
- [Foot-lock visualization](foot-lock.webp), [plain foot close-up](foot-lock-closeup.png).
- [Rig data](rig.json), [motion verification](qa/motion-verification.json),
  [browser verification](qa/browser-verification.json).

The independent [recording checks](qa/artifact-verification.json) re-read all
support screenshots, check the output files and compare the full lossless
recordings with the captured pixels. These technical checks do not grant visual
approval; the plain skinning evidence above fails.

The rig contains 20 named anatomical/art regions across 12 surface attachments:
head, two ears, coat, pelvis, tail, both upper arms/forearms/paws, watch/bow and
both thighs/shins/feet. Limb segments share mesh vertices and one texture surface
across their joints instead of rotating independently cut rectangles. There are
4,206 vertices. Sources are existing candidate-04 grayscale pixels, primarily
unobstructed parts in keys 01 and 05. This is disclosed texture extraction and
skinning, not new drawing or a claim of pixel-identical posed art.

`motion.mjs` ports the approved continuous guide. Its eight keys are unchanged;
832 on/off-key samples match Python's guide within 2.3e-13 source pixels. Bones
keep their defined lengths; the anatomical right grip exclusively owns the
watch. The pelvis and shoulder trajectories drive the limbs. Existing damped ear
and watch curves remain periodic. The source seed, canonical proportions,
proportion sheet, standing views, guide and old strip pass all 16 frozen hashes.

`skinning.mjs` uses normalized bind geometry and dual-quaternion deformation.
Smooth joint weights replace nearest-bone discontinuities. The foot/heel remain
rigid; lower-leg fur above the ankle blends to the foot. A local triangle-area
constraint prevents inversions in blended regions, with rigid foot/paw vertices
pinned. At 160 inspected phases there are no inverted or near-zero-area triangles,
and the phase 8 surface equals phase 0. **This does not detect global overlap,
pinched contours or convincing musculature.** Those fail in the plain skin review.
An independent review also measured a mesh edge stretching to 5.98 times its
bind length at LEFT recovery phase 4.25. Positive triangle orientation prevents
one failure mode; it does not bound this damaging surface distortion.

Near/far ordering remains anatomical LEFT/far and RIGHT/near. White fur occludes
far material before the final transparent ink pass, so negative-space holes do
not reveal a second limb underneath. Dither thresholds use stable material UVs
after deformation, with the existing coverage curve and Bayer pattern. This
reduces frame-to-frame re-quantization boil, but screen sampling still aliases
moving dots, and compressed joint textures visibly stretch. Texture preservation
alone is not a skinning acceptance result.

## World contact: measured separately from anatomy

All rows move at **780 source px/s**, scale **.375**, with a fixed ground/camera.
The nominal stride is 480 source pixels over 8/13 seconds. Chrome captured 128
samples over two cycles; 21 samples cover each support episode in the first cycle.

| Renderer | Visible support-edge range LEFT | RIGHT |
|---|---:|---:|
| Pass 04, eight held poses | 32 display px | 38 px |
| Pass 05, sixteen held poses | 9 px | 10 px |
| Continuous mesh | 1 px | 2 px |

These are actual dark-pixel positions in the bottom canvas rows throughout the
support interval, including time between the old held-pose boundaries. They are
**not** the earlier pose-boundary-only ranges. The same speed and scale apply to
all three rows. Rounded toe contours, dither and display sampling make this an
edge proxy, not subpixel proof of a perfectly planted visible paw. All 21 samples
per side have visible contact ink.

`RunMotion.sample` receives caller-owned position, accumulated travel, and a local
tangent/normal basis. Phase comes from distance/60. Each support episode retains
a world-space toe anchor; leg IK resolves any local contact correction. It never
writes physics position, freezes the rabbit, or moves the camera. The visual
root offset is explicitly `[0,0]`. Tests cover changing speeds, irregular time
steps and rotated contact bases; anchor error is below 1e-12 source pixels in
those synthetic trajectories. Browser measurements above cover actual horizontal
rendering. Other facing artwork and turning are not implemented.

In the measured isolated Chrome 152 run, 99 live animation ticks evaluated
non-quantized phases. After warmup, measured render/update time was 3.6 ms median,
11.7 ms p95 and 15.9 ms maximum; no console errors. This is one machine/browser
measurement, not a cross-device performance guarantee.

## Recommended next step

Use **Spine Professional** to author the run's joint topology, weights and
corrective deformations while retaining this guide and the character artwork.
Spine supports weighted mesh attachments and keyed vertex deformation; meshes
are unavailable in Essential. Those controls directly address this remaining
skin-authoring problem. See the official [mesh guide](https://esotericsoftware.com/spine-meshes)
and [weight workflow](https://esotericsoftware.com/spine-weights).

This is a recommendation, not a guarantee that changing tools fixes the art.
The required work is to author continuous calf/ankle contours and deformation
correctives for the two tucked recovery halves, then inspect the plain rendering
at those bends. Reuse the approved trajectories, right-hand watch convention,
distance-driven controller, support anchors, layering and final dither approach.
Spine's [runtimes](https://esotericsoftware.com/spine-runtimes) provide the playback
integration path; the version and license should be selected before integration.
No tool installation, purchase, Spine migration or further animation work was done.

Once the articulated run is visually approved, the same rig technology should
serve breathing/look/watch-check/crouch. Portals remain a subsequent milestone.

## Reproduce this experiment

From the repository root:

```powershell
python -B packages/web/design/rabbit-character/articulated-06/prepare_rig.py
node packages/web/design/rabbit-character/articulated-06/verify-motion.mjs
node packages/web/design/rabbit-character/qa/check-preview.cjs --articulated
python -B packages/web/design/rabbit-character/articulated-06/package_review.py
python -B packages/web/design/rabbit-character/articulated-06/verify-recordings.py
```

The private artifact harness launches an isolated Chrome profile over localhost.
It does not add an app/demo page or deploy a feature. The normal GIF uses 32
captured samples per cycle at approximately 52 Hz, while the slow recording uses
64 samples at four times the stride duration. Lossless `*-104hz.webp` recordings
retain every normal-speed capture. Preview sampling is independent of runtime
evaluation. The world recording resets travel only when the whole file repeats;
the local gait seam occurs inside the recording.
Scratch captures and isolated browser profiles are removed after verification;
the lossless archives retain all full-render and world samples, and the close-up
sheets retain the skin inspection examples. Rerun browser capture before running
the packaging or recording-verification commands again.
