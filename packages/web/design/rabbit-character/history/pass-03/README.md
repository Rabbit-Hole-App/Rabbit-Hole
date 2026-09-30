# Rabbit character review assets

Status: refinement 03 character proportions are retained; its run is **not
approved** because the legs do not clearly exchange roles. The current
[joint-guide review](motion/run_right/guide-04/README.md) comes before new artwork.
Start with [01 versus 05](motion/run_right/guide-04/contact-a-vs-b.png), then the
[eight poses](motion/run_right/guide-04/motion-skeleton-sheet.png) and
[slow skeleton loop](motion/run_right/guide-04/motion-guide-slow.gif).
Only `run_right` has rabbit animation artwork. The assets below remain refinement 03.

- [Run GIF](run-preview.gif) / [transparent WebP](run-preview.webp)
- [Previous versus refined run](run-comparison.gif)
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
The immediate prior candidate is retained in [history/pass-02](history/pass-02);
the first pass remains in [history/pass-01](history/pass-01).

This pass trims coat/hip volume, separates the watch and empty-hand arcs, adds
low passing hands and visible shoulder-driven arm overlap changes, and retains
ear lag. The unchanged original seed still supplies the identity check.

[Motion and preparation details](../../../../docs/features/rabbit-hole-run-preview.md)
include rebuild commands and provenance.
[Canonical proportion specification](../../../../docs/features/rabbit-character-proportions.md)
records the anatomy, accessory convention, and pose beats. After visual approval,
the eight-view sheet plus these proportions become the character bible for every
later generation; the original image remains an identity check.
[Directional and portal plans](../../../../docs/features/rabbit-hole-directions-and-portals.md)
define later milestones. No gameplay or portal runtime is included.

[Browser playback](qa/browser-verification.json),
[artifact checks](qa/artifact-verification.json), and
[visual review notes](qa/visual-review.md) record the evidence. File checks establish
file integrity and playback, not visual approval. [World travel](qa/world-travel-verification.json)
was exercised in isolated Chrome with continuous movement over fixed ground,
at 13 FPS and three speeds, plus 11/15 FPS at the fitted speed.
[Support-patch measurements](qa/foot-contact-review.json) improve from roughly
9–15 to 1–4 display pixels between support poses at the same speed/scale.
Continuous travel during a held drawing still creates visible sliding;
zero foot sliding is **not** achieved. The turnaround remains proposed artwork.
Generation used the built-in image tool through ChatGPT; the exact refinement
prompts are retained in [prompts](prompts).
