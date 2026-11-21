# Build MVP 2: the ten build-schemas as Programs (brief 46)

Made by `scripts/interact/build-programs.mjs`. Each build-schema of `build-mvp1/build-schemas/` is turned into a Program by the Program writer (`programFromBuild` in `interact-blueprint-build.js`: every placement decision is the build-schema's; the writer keeps one rule, for motion decoration: a label that would land on a part in a frame, an arrow shorter than its dot's radius and an arrowhead that would land on a dot are left out of that frame). Validate: the Program against the card contract (size, object count, each frame parsed and normalised by the host's own parser). Frames: the Program run headless in QuickJS at 3 settings (the defaults and the two ends) x 3 times (0, half, end), 9 frames, tested against `frame-overlap.js` (the overlap and the layout rules); the first frame that fails gives its sentence. Dropped: the labels and arrows left out of a frame, summed over the 9 frames. No repair. The Programs are in `programs/`, the per-frame results in `checks/`.

| Build-schema | Layout / arrangement | Validate | Frames: pass, or the first frame sentence | Dropped in frames | Program bytes |
|---|---|---|---|---|---|
| b41-pendulum-1 | side-by-side / columns | pass | pass (9/9) | 6 labels, 5 arrows | 15688 |
| b41-pendulum-2 | side-by-side / columns | pass | pass (9/9) | 0 labels, 6 arrows | 15711 |
| b41-pendulum-3 | side-by-side / columns | pass | pass (9/9) | 0 labels, 0 arrows | 15557 |
| b41-pendulum-4 | side-by-side / columns | pass | pass (9/9) | 5 labels, 5 arrows | 16040 |
| b41-pendulum-5 | side-by-side / columns | pass | pass (9/9) | 9 labels, 8 arrows | 15353 |
| b43-pendulum-1 | side-by-side / rows | pass | pass (9/9) | 8 labels, 8 arrows | 15800 |
| b43-pendulum-2 | tall-with-panel / rows | pass | pass (9/9) | 0 labels, 0 arrows | 15605 |
| b43-pendulum-3 | side-by-side / columns | pass | pass (9/9) | 0 labels, 6 arrows | 15701 |
| b43-pendulum-4 | side-by-side / columns | pass | pass (9/9) | 0 labels, 0 arrows | 15558 |
| b43-pendulum-5 | side-by-side / columns | pass | pass (9/9) | 0 labels, 0 arrows | 15948 |

Validate passed: 10 of 10. All frames passed: 10 of 10.
