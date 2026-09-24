# Rabbit character review assets

Status: refinement 02 candidates awaiting visual approval. Only `run_right` is animated.

- [Run GIF](run-preview.gif) / [transparent WebP](run-preview.webp)
- [Previous versus refined run](run-comparison.gif)
- [Slow loop including 08 to 01](run-seam-preview.gif) / [seam poses](run-seam-sheet.png)
- [Eight-pose contact sheet](contact-sheet.png)
- [Original versus first, middle and final poses](identity-comparison.png)
- [Canonical proportion sheet](canonical-proportion-sheet.png) / [measurements](proportions.json)
- [Corrected four-view turnaround](turnaround-sheet.png)
- [Eight-view turnaround](turnaround-8-view-sheet.png)
- [Exact source seed](character-seed.png), [run strip](run-strip.png),
  [individual frames](animations/run_right/frames)
- [Timing and registration manifest](manifest.json)

All frames use a 512 x 512 canvas, ground anchor `[256, 480]`, and transparent
monochrome ink. The seed preserves the original sprite's pixels at 2x scale.
Eight run poses were generated together, then registered and dithered. The
opposite turnaround side is explicitly authored; mirroring is disabled.
Standing scale now matches the run's head/watch scale. Extra ear clearance comes
from changing the common padding/baseline, not shrinking the standing character.
The prior candidate is retained in [history/pass-01](history/pass-01).

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
file integrity and playback, not visual approval or foot contact at a future
world movement speed. The turnaround's unseen views remain proposed artwork.
Generation used the built-in image tool through ChatGPT; the exact refinement
prompts are retained in [prompts](prompts).
