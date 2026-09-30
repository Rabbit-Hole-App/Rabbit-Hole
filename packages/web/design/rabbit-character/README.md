# Rabbit character review assets

**2026-09-24: removed from the landing page at the user's request.** These assets
and experiments are retained for history; the landing does not load the mascot.

Current milestone: **[living mascot and reversible portals](living-08/README.md)**,
integrated into the existing Rabbit Hole landing page; the misplaced app tabs are
removed per the user's correction. Breathing, looks, watch check,
crouch, and movable A/B openings use the existing artwork and renderer. The final
[hybrid 07 pass](hybrid-07/REVIEW.md) is preserved but does not clearly beat Pass 04
visually. The user authorized Pass 04 as the temporary run and stopped further run
refinement. No new sprite strip was generated. Final visual approval and the
Character Bible freeze remain pending.

Earlier experiment: **[continuous articulated rig 06](articulated-06/REVIEW.md)**.
It evaluates the approved guide continuously and renders connected meshes with
world contact anchors. [World comparison](articulated-06/world-motion.webp),
[slow comparison](articulated-06/comparison-slow.webp),
[plain leg close-ups](articulated-06/leg-deformation-closeups.png).
Visible contact-edge drift falls to 1–2 display pixels in the fixed-speed browser
test, but tucked ankle contours remain pinched. **The visual skinning gate fails.**
Custom refinement stops; dedicated skeletal authoring is recommended, not installed.
Pass 05 is explicitly rejected. No further sprite strip was generated. The guide,
seed, proportions and turnaround remain unchanged. The newer user authorization
allows living actions and portals to proceed. Historical candidates remain intact.

Previous render 04: the leg exchange is clearer, but the model did not trace every joint
and foot target exactly. Remaining sliding includes both drawing/contact-path
differences and held-frame playback. See [the candid review](qa/render-04-review.md).
Only `run_right` has rabbit animation artwork. The standing references are unchanged.

- [Run GIF](run-preview.gif) / [transparent WebP](run-preview.webp)
- [Previous versus refined run](run-comparison.gif)
- [01 versus 05: rendered support exchange](run-contact-exchange.png)
- [Guide overlay](run-guide-overlay.png) / [guide, render and overlay comparison](run-guide-comparison.png)
- [Slow loop, 01 through 08](run-slow-preview.gif)
- [Run over fixed ground, previous / revised](run-world-comparison.gif) / [WebP](run-world-comparison.webp)
- [Slow loop including 08 to 01](run-seam-preview.gif) / [seam poses](run-seam-sheet.png)
- [Eight-pose contact sheet](contact-sheet.png)
- [Original versus first, middle and final poses](identity-comparison.png)
- [Canonical proportion sheet](canonical-proportion-sheet.png) / [measurements](proportions.json)
- [Corrected four-view turnaround](turnaround-sheet.png)
- [Eight-view turnaround](turnaround-8-view-sheet.png)
- [Previous / revised turnaround, paired by direction](turnaround-refinement-comparison.png)
- [Exact source seed](character-seed.png), [run strip](run-strip.png),
  [individual frames](animations/run_right/frames)
- [Timing and registration manifest](manifest.json)

All frames use a 512 x 512 canvas, ground anchor `[256, 480]`, and transparent
monochrome ink. The seed preserves the original sprite's pixels at 2x scale.
Eight run poses were generated together, then registered and dithered. The
opposite turnaround side is explicitly authored; mirroring is disabled.
Standing scale now matches the run's head/watch scale. Extra ear clearance comes
from changing the common padding/baseline, not shrinking the standing character.
The immediate prior candidate is retained in [history/pass-03](history/pass-03);
earlier passes remain under `history/pass-01` and `history/pass-02`.

This pass changes the run using the approved joint guide and an explicit near/far
depth underlay. It does not change the seed, proportion measurements, standing
images or canonical proportion sheet; integrity checks confirm identical bytes.
All eight selected poses come from one coherent source-sheet edit.

[Motion and preparation details](../../../../docs/features/rabbit-hole-run-preview.md)
include rebuild commands and provenance.
[Canonical proportion specification](../../../../docs/features/rabbit-character-proportions.md)
records the anatomy, accessory convention, and pose beats. After visual approval,
the eight-view sheet plus these proportions become the character bible for every
later generation; the original image remains an identity check.
[Directional and portal plans](../../../../docs/features/rabbit-hole-directions-and-portals.md)
record directional requirements and the portal design. The current page-portal
runtime is in `src/mascot`; full directional animation remains future work.

[Browser playback](qa/browser-verification.json),
[artifact checks](qa/artifact-verification.json), and
[visual review notes](qa/visual-review.md) record the evidence. File checks establish
file integrity and playback, not visual approval. [World travel](qa/world-travel-verification.json)
was exercised in isolated Chrome with continuous movement over fixed ground,
at 13 FPS and three speeds, plus 11/15 FPS at the fitted speed and 13 FPS at the
approved guide speed. At the fitted 1,040 source px/s, [support-patch ranges](qa/foot-contact-review.json)
are 3/7.5 display px between support poses, while a full held frame travels
30 display px. The guide itself calls for 780 source px/s: the rendered stance
path still differs. **Zero foot sliding and exact guide conformance are not
achieved.** The turnaround remains proposed artwork until run approval.
Generation used the built-in image tool through ChatGPT; the exact refinement
prompts are retained in [prompts](prompts).
