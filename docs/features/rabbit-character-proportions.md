# Rabbit character proportions — refinement 03

This is the drawing contract for the refinement pass, pending the user's visual
approval. It is a proposed reconstruction from the original side reference,
not a claim that unseen anatomy has already been approved. The original ink seed
remains unchanged. The first turnaround is an exploration, not a geometry source.

## Units and neutral pose

One character unit (H) is the standing height from the sole plane to the highest
ear tip in the specified neutral pose. Target display size: H = 432 pixels on
the existing 512-pixel canvas, sole plane y=480 and root x=256. Use orthographic
views of one physical model. Do not independently stretch a view to fill a cell.
Coordinates below measure downward from the highest neutral ear tip; the sole
plane is y=1.00H. Measured output deviations must be reported, not hidden by
per-part scaling. Drawing tolerance is roughly 0.02H for major landmarks and
0.015H for accessory dimensions; foreshortened lengths are checked in a side
view or against the stated 3D length.

| Dimension | H | At 432 px/H | Definition |
| --- | ---: | ---: | --- |
| Standing height | 1.000 | 432 | Neutral longest ear tip to sole |
| Head height | 0.145 | 63 | Skull crown to chin, excluding ears |
| Head width | 0.160 | 69 | Across cheekbones, excluding whiskers |
| Head depth | 0.190 | 82 | Back of skull to nose |
| Muzzle projection | 0.050 | 22 | Beyond front of eye/skull mass |
| Each ear length | 0.280 | 121 | Root-to-tip curved centerline, not projected height |
| Ear-root spacing | 0.075 | 32 | Anatomical left/right root centers |
| Ear widest part / root | 0.065 / 0.030 | 28 / 13 | Thin tapering rabbit ears |
| Shoulder width | 0.225 | 97 | Across shoulder joints, excluding sleeves |
| Torso length | 0.255 | 110 | Shoulder line to hip centers |
| Torso depth | 0.157 | 68 | Front-to-back neutral chest; not front width |
| Hip width / depth | 0.190 / 0.153 | 82 / 66 | Under the trousers |
| Upper arm | 0.130 | 56 | Shoulder to elbow |
| Forearm | 0.115 | 50 | Elbow to wrist |
| Hand length | 0.055 | 24 | Wrist to fingertips |
| Upper leg | 0.155 | 67 | Hip to knee |
| Lower leg | 0.145 | 63 | Knee to ankle |
| Foot length / width | 0.175 / 0.065 | 76 / 28 | Long bare rabbit paw, heel to toe |
| Foot thickness | 0.035 | 15 | Low arch; no shoes or separate heels |
| Neutral foot-center spacing | 0.145 | 63 | Same front and back stance |
| Watch outside diameter | 0.125 | 54 | Case only, excluding bow |
| Bow/grip to watch center | 0.076 | 33 | Constant short suspension |

| Landmark | y/H |
| --- | ---: |
| Ear Roots | 0.235 |
| Eyes | 0.285 |
| Chin | 0.380 |
| Shoulders | 0.425 |
| Elbows | 0.555 |
| Wrists | 0.670 |
| Hips | 0.680 |
| Coat Front | 0.720 |
| Coat Hem | 0.765 |
| Knees | 0.835 |
| Trouser Cuffs | 0.855 |
| Ankles | 0.980 |
| Soles | 1.000 |

The initial drafting scaffold used H=360 pixels. Comparing the standing model
with the unchanged original seed exposed a physical scale mismatch. Revision
2.1 uses H=432 and moves the common baseline down 72 pixels, retaining the seed
and run's anatomical pixel scale. Head, muzzle, ear, and watch ratios were then
calibrated to that common scale. Earlier prompts retain their initial drafting
values as generation history; the table here and `proportions.json` are the
current contract for that pass. Revision 3.0 reduces shoulder width by 6.3%,
torso depth by 7.6%, and hip width/depth by about 7.3%. Height, head, ears, limb
lengths, paws, watch, and coat hem targets stay fixed. Tailoring removes volume
from coat and upper breeches rather than squeezing the whole drawing. A dimension
target is not a claim that every drawing has been
measured to meet it exactly. User approval remains pending.

## Anatomy, costume, and asymmetry

The head is a slender rabbit skull with a projecting muzzle and small eyes,
not a round cartoon head. Both ears grow from the same back/top skull region.
In neutral, pitch their centerlines about 33 degrees backward from vertical,
with a small outward cant (about 10 degrees). Use the same rest curvature in
every view; do not draw a symmetrical upright V from the front and horizontal
ears from the side. Perspective may overlap an ear, but cannot shorten its
physical length. Dynamic ear bending in the run is a pose, not new anatomy.

The coat has a fitted shoulder, narrow waist, curved front cutaway, and short
split tails reaching y=0.765H. Front/back share shoulder and pelvis width. The
side depth is smaller than front width. Cuffs, sleeves, waistcoat, bow, and
striped knee breeches keep the source cut. A rear seam continues the same hem;
do not add belts, hats, glasses, shoes, or new ornaments. Front/back feet use
the same long bare paw seen foreshortened; never invent broad mitten feet.

Canonical watch convention: **anatomical right hand**, matching the visible
watch arm in the source-facing profile. The paw pinches the watch's bow/ring.
There is no invented belt attachment or long coat chain. The suspension starts
at that moving grip, not at a fixed torso pixel. The round case keeps its size
and a short lagging pendulum swing. The face may foreshorten or show its reverse;
do not enlarge it to remain readable. Front: image-left. Back: image-right.
Right profile: near hand. Left profile: far hand, naturally occluded when needed.

Neutral pose is identical across all views: alert, relaxed knees, low arms,
parallel foot placement with slight natural toe-out. Do not stagger the feet
differently to make a view easier. Left and right are separately authored views
of matched anatomy with correct asymmetrical accessory visibility.

## Refined run pose contract

The proportions above stay at revision 3.0: the user does not want another
slimming pass. The prior run's anatomy is not approved. Its hand-positioned joint
diagram also varied segment lengths and did not enforce the rendered leg swap.
That guide remains historical evidence, not the current motion contract.

Use [joint guide 04](rabbit-run-joint-guide.md) before generating more artwork.
It keeps bone lengths from this table, one pelvis with paired hip attachments,
opposing shoulder/hip yaw, connected arm chains, and the watch on the anatomical
RIGHT hand. The eight-pose sheet and numerical joints live under
`packages/web/design/rabbit-character/motion/run_right/guide-04/`.
User review of the guide precedes another coherent action-sheet generation.
That review is complete: guide 04 is approved as the motion basis. Render 04
and the character bible remain unapproved; its measured departures are in the
[render review](../../packages/web/design/rabbit-character/qa/render-04-review.md).

| Frame | Legs / weight | Arms / torso | Ears / watch |
| --- | --- | --- | --- |
| 01 | LEFT forward and planted; RIGHT recovering behind. | RIGHT/watch arm forward; LEFT/empty arm backward. | Ear tips trail preceding head motion; watch remains attached to right grip. |
| 02 | LEFT absorbs support; RIGHT begins recovery. | Pelvis compresses; connected arms counter-swing. | Head settles first; ears react late to impact. |
| 03 | LEFT heel rises/toe pushes behind; RIGHT knee passes beneath pelvis. | Pelvis rises; arms pass through midpoint with distinct elbow bends. | Ears lag upward acceleration; watch lags its grip. |
| 04 | Flight: LEFT trails; RIGHT knee advances. | RIGHT/watch arm rearward; LEFT arm forward. | Ears trail/rebound according to head acceleration. |
| 05 | RIGHT forward and planted; LEFT recovering behind. | LEFT/empty arm forward; RIGHT/watch arm backward. | Opposite contact impulse, same ear anatomy and right-hand attachment. |
| 06 | RIGHT absorbs support; LEFT begins recovery. | Pelvis compresses; opposite arm phase to 02. | Delayed ear response to impact; small watch lag. |
| 07 | RIGHT heel rises/toe pushes behind; LEFT knee passes beneath pelvis. | Pelvis rises; arms cross midpoint. | Ear/appendage response follows acceleration, not a frame-number flap. |
| 08 | Flight: RIGHT trails; LEFT knee advances toward 01. | RIGHT/watch arm returns forward; LEFT arm back. | Continuous ear/watch trajectory into 01; no seam reset. |

Compare 08→01→02 at normal and slow playback. A long leap with the same lead leg
and the same arm position in every frame fails this contract. A frame counter or
eight unique image hashes cannot establish physical quality.

## Generation and approval order

1. Preserve refinement 03 artwork and proportions. Show joint guide 04 and
   complementary contacts to the user before new character generation.
2. After guide review, render one coherent eight-pose run from those joints and
   the refined provisional character reference. Reject a rendered side-swap
   failure even if the skeleton and exports pass their checks.
3. Re-test the actual rabbit against horizontal world travel in a browser;
   inspect held-frame sliding separately from contact-boundary alignment.
4. Deliver old/new run comparison, slow loop and 08-to-01 seam. Stop for run
   approval. Then freeze the eight-view sheet and these proportions as Bible v1.
5. Prove living idle/look/watch-check/crouch and `idle -> run -> idle -> crouch`
   before the Portal A-to-B milestone or all-direction animation production.

After approval, the approved turnaround **plus this proportion specification**
become the character bible supplied to every later generation. The original
source remains an identity check, not the only conditioning image each time.
Later breathing, glances, watch checks, ear flicks, weight shifts, jump/fall/land,
crouch, turns, and portal traversal must all use this same physical character.
