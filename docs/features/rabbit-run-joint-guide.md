# Rabbit run: joint guide 04, before new artwork

**Current status:** the user has approved this guide as the motion basis. Its
coordinates are frozen; `guide-04/approval.json` records their hash. The new
[continuous rig 06 review](../../packages/web/design/rabbit-character/articulated-06/REVIEW.md)
is the latest experiment. It uses the unchanged trajectories continuously, with
connected meshes and support anchors. Pass 05 is rejected; rig 06 also fails the
visual skinning gate at the tucked ankles and stops for the dedicated-tool
recommendation. The guide approval does not approve rendered artwork or
Character Bible v1. The design/generation gate below is historical.

The refinement 03 rabbit artwork is not approved for locomotion. Its repeated
lead-leg reading is a structural gait problem, not merely an awkward drawing.
The current milestone is a mechanically constrained guide for user review **before
another image-generation request**. Keep the refined turnaround, seed and
`proportions.json` unchanged. No further slimming, new rabbit strip, idle animation,
gameplay or portal work is included in this guide milestone.

Review assets live in
[`packages/web/design/rabbit-character/motion/run_right/guide-04/`](../../packages/web/design/rabbit-character/motion/run_right/guide-04/).

## Review order

1. [Contacts 01 versus 05](../../packages/web/design/rabbit-character/motion/run_right/guide-04/contact-a-vs-b.png):
   the same spatial roles belong to opposite anatomical legs and arms.
2. [Eight-pose sheet](../../packages/web/design/rabbit-character/motion/run_right/guide-04/motion-skeleton-sheet.png),
   [joint map](../../packages/web/design/rabbit-character/motion/run_right/guide-04/joint-topology.png),
   and [labeled phase strip](../../packages/web/design/rabbit-character/motion/run_right/guide-04/stride-phase-sheet.png).
3. [Eight-key slow loop](../../packages/web/design/rabbit-character/motion/run_right/guide-04/motion-guide-slow.gif)
   and [full-cycle seam review starting at 07](../../packages/web/design/rabbit-character/motion/run_right/guide-04/seam-08-to-01.gif).
4. [Continuous skeleton](../../packages/web/design/rabbit-character/motion/run_right/guide-04/continuous-skeleton.gif)
   to inspect intermediate joint trajectories. These samples are not additional
   rabbit drawings.
5. [World-contact diagnostic](../../packages/web/design/rabbit-character/motion/run_right/guide-04/world-contact-diagnostic.gif):
   the continuous guide above, its eight held keys below, at identical world speed.

Blue dashed limbs and square joints are anatomical LEFT/far. Orange solid limbs
and round joints are anatomical RIGHT/near. The watch marker is always orange,
attached to the right hand's bow grip. These colors are diagnostic only. Both
chains are visible through the torso so occlusion cannot disguise a side swap.
The head is a locator; this skeleton deliberately omits ears, costume and fur.
It does not redesign their approved-or-proposed appearance.

## Fixed anatomy and shared root

Coordinates use x forward, y downward, z toward the viewer, with an orthographic
x/y projection. The existing ground anchor remains `[256, 480]`; the moving
pelvis is a separate joint. Its local x stays 256. Root height varies smoothly
between approximately y=348 and y=371. Both hips rotate around that same pelvis, never separate
per-leg roots. Shoulder center connects through the unchanged 110.16 px torso.

The unchanged H=432 proportion contract supplies upper/lower leg lengths
66.96/62.64 px, foot length 75.6 px, upper arm/forearm 56.16/49.68 px, and hand
length 23.76 px. Hip width stays 82.08 px and shoulder width 97.2 px in 3D;
their small side-view projection is not a narrowed body. Hip yaw is +/-6 degrees,
shoulder yaw opposes it at +/-8 degrees, and lean varies 11–13 degrees.

Legs use a two-segment solution with a consistent knee-forward bend. Arms rotate
from their shoulder joints and retain connected elbows, wrists and hands. The
watch arm has a slightly more open elbow for its pinched grip; it still changes
front/back jobs. The watch keeps a 54 px diameter and 32.832 px grip-to-center
distance. A small damped response to grip acceleration supplies diagnostic lag,
with a warmed periodic state rather than a reset at frame 01.

This is a kinematic drawing scaffold, not a biomechanics simulation or a shipped
character rig. In particular, coat occlusion, readable knee contours, near/far
arm visibility and acceleration-driven ear bending still need to survive the
later illustration pass.

## Eight keys

| Frame | Leg roles | Arm roles / accessory |
| --- | --- | --- |
| 01 Contact A | LEFT forward and planted; RIGHT recovering behind. | RIGHT/watch forward; LEFT/empty back. |
| 02 Compression A | LEFT knee absorbs weight; RIGHT starts recovery. Pelvis low. | Connected chains counter-swing; watch stays with right grip. |
| 03 Passing / push A | RIGHT knee crosses beneath pelvis; LEFT heel rises and toes push behind root. | Hands pass through mid-swing with distinct elbow bends. |
| 04 Flight A | LEFT trails; RIGHT knee advances. Neither foot contacts ground. | Watch arm rearward; empty arm forward. |
| 05 Contact B | RIGHT forward and planted; LEFT recovering behind. | LEFT/empty forward; RIGHT/watch back. |
| 06 Compression B | RIGHT knee absorbs weight; LEFT recovers. Pelvis low. | Opposite arm phase to compression A. |
| 07 Passing / push B | LEFT knee crosses beneath pelvis; RIGHT toes push behind root. | Connected mid-swing; anatomical identities persist through overlap. |
| 08 Flight B | RIGHT trails; LEFT knee advances toward contact A. | Watch arm returns forward; empty arm moves back. |

01/05, 02/06, 03/07 and 04/08 exchange the two leg chains exactly in the
projection, with the same lengths and root motion. The arms are contralateral,
with a modest intentional difference between watch and empty-hand elbow arcs.
Do not exchange anatomical names when limbs cross on the screen.

During support, the forefoot stays at its world contact point while the pelvis
travels past it. The heel then lifts around that forefoot. During recovery, the
knee folds, ankle lifts, and foot changes angle before the next flat contact.
The continuous curves close in both position and tangent at the cycle boundary.
The slow seam export contains the full cycle in order 07,08,01,02,03,04,05,06;
there is no misleading four-frame loop with an artificial 02-to-07 jump.

## Contact and sampling limitation

Proposed guide timing is 13 keys/second, eight keys/cycle. World travel is
60 source pixels per key, or 780 px/s. This value follows this skeleton's stance
path; it is **not** a calibration result for the existing rabbit strip.

The continuous guide plants each support toe with zero drift up to floating
point error. The paired diagnostic intentionally also shows eight held poses
moving continuously. Those held drawings still travel 60 source pixels during
one full hold (42 px at the diagnostic's 0.70 display scale). Matching contact
positions at key boundaries does not eliminate that within-frame sliding.
No camera movement, root correction or per-frame scale adjustment hides it.

This exposes two separate gates: first correct anatomical topology; then solve
sampling and world-speed readability in the rendered rabbit. Eight raster
drawings at fixed holds cannot provide exact continuous foot locking by
themselves. If the new artwork still visibly slides, evaluate additional
in-between poses or a validated articulated rig before claiming it solved.
Do not pulse world velocity or make the pelvis teleport to conceal it.

The previous browser test remains evidence for refinement 03 only. This guide
diagnostic is an exported mathematical drawing, not a new browser gameplay test.
Render 04 has now undergone the real-world-speed browser test. Its stance path
differs from the guide, and held-frame sliding remains. See the render review
for measured results; any further changed artwork needs a fresh test.

## Verification and generation gate

`qa/verify-joint-guide.py` checks 800 continuous poses, bone lengths, common
pelvis/shoulder widths, knee bend direction, ground clearance, support ordering,
opposite contacts, watch attachment, seam position/tangents and preview exports.
It also proves it rejects a repeated first half, a stretched shin and a watch
moved to the other grip. Results are saved in `guide-04/validation.json`.
These checks do not grant visual approval.

The guide-review gate is now complete. Use it to generate one coherent
eight-pose `run_right` sheet using the reviewed guide plus the current refined
turnaround/proportions as the provisional character reference. They are not yet
frozen as Character Bible v1. Inspect the actual rendered joints and compare
01/05 before normalization. Reject illustrations that ignore the guide even if
each drawing looks plausible. Preserve the current art as the comparison source.

The render-review deliverables are: candidate strip and frames, old/new
comparison, slow loop, 08-to-01 seam preview, and real browser travel/sliding
evidence. Preserve ear length, root attachment, lag on head acceleration,
overshoot on deceleration, and impact settling. No arbitrary ear flap by frame
number. Stop again for visual run approval.

## Subsequent milestones, in order

1. After the corrected run is visually approved, freeze the refined eight-view
   turnaround and canonical proportions as **Character Bible v1**.
2. Prove the living character with `idle_breathe`, `idle_look_left`,
   `idle_look_right`, `idle_watch_check`, and `crouch`, including readable
   `idle -> run -> idle -> crouch` transitions. Do not generate all directional
   run cycles yet.
3. Then prototype arbitrary Portal A and Portal B: approach A, crouch, enter A,
   hidden state, transfer, emerge from B, and recover with visible rim occlusion.
4. Then generalize portal placement and entry/exit directions: left/right,
   top/bottom and arbitrary page or screen positions. Reuse portal-local surface
   frames and the facing resolver; no hardcoded side-only disappearance.

The portal requirement is already recorded; its implementation remains queued
behind the living-character proof.

Check from the repo root. The preparation command now retains approved artifacts
instead of overwriting the frozen guide:

```powershell
python -B packages/web/design/rabbit-character/prepare_joint_guide.py
python -B packages/web/design/rabbit-character/qa/verify-joint-guide.py
```
