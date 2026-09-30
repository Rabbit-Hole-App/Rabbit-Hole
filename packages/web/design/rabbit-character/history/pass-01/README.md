# Rabbit character review assets

Status: candidates awaiting visual approval. Only `run_right` is animated.

- [Run GIF](run-preview.gif) / [transparent WebP](run-preview.webp)
- [Eight-pose contact sheet](contact-sheet.png)
- [Original versus first, middle and final poses](identity-comparison.png)
- [Four-view turnaround](turnaround-sheet.png)
- [Exact source seed](character-seed.png), [run strip](run-strip.png),
  [individual frames](animations/run_right/frames)
- [Timing and registration manifest](manifest.json)

All frames use a 512 x 512 canvas, ground anchor `[256, 408]`, and transparent
monochrome ink. The seed preserves the original sprite's pixels at 2x scale.
Eight run poses were generated together, then registered and dithered. The
opposite turnaround side is explicitly authored; mirroring is disabled.

[Motion and preparation details](../../../../docs/features/rabbit-hole-run-preview.md)
include rebuild commands and provenance.
[Directional and portal plans](../../../../docs/features/rabbit-hole-directions-and-portals.md)
define later milestones. No gameplay or portal runtime is included.

[Browser playback](qa/browser-verification.json) and
[artifact checks](qa/artifact-verification.json) passed. These checks establish
file integrity and playback, not visual approval or foot contact at a future
world movement speed. The turnaround's unseen views remain proposed artwork.
