# Build MVP 2: the ten build-schemas as Programs (brief 46)

Made by `scripts/interact/build-programs.mjs`. Each build-schema of `build-mvp1/build-schemas/` is turned into a Program by the Program writer (`programFromBuild` in `interact-blueprint-build.js`: every placement decision is the build-schema's; the writer keeps one rule, for motion decoration: a label that would land on a part in a frame, an arrow shorter than its dot's radius and an arrowhead that would land on a dot are left out of that frame). Validate: the Program against the card contract (size, object count, each frame parsed and normalised by the host's own parser). Frames: the Program run headless in QuickJS at 3 settings (the defaults and the two ends) x 3 times (0, half, end), 9 frames, tested against `frame-overlap.js` (the overlap and the layout rules); the first frame that fails gives its sentence. Dropped: the labels and arrows left out of a frame, summed over the 9 frames. No repair. The Programs are in `programs/`, the per-frame results in `checks/`.

| Build-schema | Layout / arrangement | Validate | Frames: pass, or the first frame sentence | Dropped in frames | Program bytes |
|---|---|---|---|---|---|
| b41-pendulum-1 | side-by-side / columns | pass | pass (9/9) | 0 labels, 5 arrows | 15420 |
| b41-pendulum-2 | side-by-side / columns | pass | pass (9/9) | 0 labels, 6 arrows | 15548 |
| b41-pendulum-3 | side-by-side / columns | pass | pass (9/9) | 0 labels, 0 arrows | 15394 |
| b41-pendulum-4 | side-by-side / columns | pass | pass (9/9) | 0 labels, 3 arrows | 15790 |
| b41-pendulum-5 | side-by-side / columns | pass | pass (9/9) | 9 labels, 8 arrows | 15216 |
| b43-pendulum-1 | side-by-side / rows | pass | pass (9/9) | 0 labels, 8 arrows | 15552 |
| b43-pendulum-2 | tall-with-panel / rows | pass | pass (9/9) | 0 labels, 0 arrows | 15446 |
| b43-pendulum-3 | side-by-side / columns | pass | pass (9/9) | 0 labels, 6 arrows | 15538 |
| b43-pendulum-4 | side-by-side / columns | pass | pass (9/9) | 0 labels, 0 arrows | 15420 |
| b43-pendulum-5 | side-by-side / columns | pass | pass (9/9) | 0 labels, 0 arrows | 15812 |

Validate passed: 10 of 10. All frames passed: 10 of 10.
