# W1.0: what one whiteboard render costs on the renderer (4 November 2026, 5:00 to 5:17 PM PT)

One run per length, 10, 30, 60 and 120 s, on `rabbit-hole-whiteboard-renderer` (image `28ae0afdde2dfd0a423d45224f6bb81876ad4096`, the temporary measurement job type `POST /whiteboard-capacity`), inside the real render sandbox: 1.5 CPU, 3 GiB, 1,024 PIDs, no swap, cgroup v1, default 420 s service deadline (the measurement route used a 900 s deadline so a run that does not fit in 420 s is measured, not killed). Raw log: `capacity-run-2026-11-05T01-12-09Z.json` (per run: phase timings, render progress, the sandbox's own resource record, the ffprobe fields, the drawing density).

## What was rendered

The lecture composition (`src/lecture`: Rough.js strokes with `pathLength` reveal, Virgil text, the pen sprite, a board clear per scene) driven by `lectures/nms` beats looped to the length, with its `code` strokes dropped. nms alone is about 10.6 primitives per 15 s, far under the policy's 60 to 80 per scene, so each 15 s scene is topped up with deterministic extra strokes of every kind (text, rect, ellipse, line, arrow, cross, 40 to 60 point curves) to 70. Densities: 10 s: 47 primitives (a short scene); 30 s: 131 (scenes of 70 and 61); 60 s: 262 (70, 70, 66, 56); 120 s: 528 (max 70 per scene; the roadmap's own cap is 400 per video, so 120 s here is over policy on purpose, a conservative load; 3,537 path points against the 12,000 cap).

Output path per run, the same as a real job: H.264 yuv420p bt709 1920x1080 30 fps video-only render, a silent AAC track muxed in, the poster (last frame), a 12-tile contact sheet, and the first and last frame rendered again in a second fresh bundle and browser to compare pixel hashes.

## Results

| Length | Frames (ffprobe) | Total wall (POST to ready) | Child total | Render | Bundle + browser | Stills + contact sheet | Second context | Mux | Render rate | Peak memory (cgroup / RSS sum) | Peak tmp | MP4 | Deterministic | 420 s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 s | 300 | 80.1 s | 73.0 s | 32.9 s | 17.0 s | 5.9 s | 15.8 s | 0.1 s | 9.12 fps | 1,200 / 1,443 MiB | 50 MiB | 0.42 MiB | yes | no |
| 30 s | 900 | 150.1 s | 142.0 s | 103.5 s | 12.4 s | 6.2 s | 16.5 s | 0.2 s | 8.69 fps | 925 / 1,445 MiB | 51 MiB | 1.23 MiB | yes | no |
| 60 s | 1,800 | 270.2 s | 260.1 s | 214.5 s | 14.9 s | 6.8 s | 17.0 s | 0.4 s | 8.39 fps | 915 / 1,310 MiB | 52 MiB | 2.42 MiB | yes | no |
| 120 s | 3,600 | **500.3 s** | 487.2 s | 431.1 s | 19.7 s | 6.6 s | 18.4 s | 0.6 s | 8.35 fps | 1,089 / 1,363 MiB | 54 MiB | 4.76 MiB | yes | **yes** |

Every run: h264, yuv420p, color_space bt709, 1920x1080, AAC audio present, frame count exactly `seconds x 30`, no OOM kill, no PID-limit hit. "Total wall" includes the sandbox start and the 5 s poll step (7 to 13 s above the child's own total). Wall times carry about plus or minus 5 s of poll noise. "Peak memory" gives the cgroup's own `memory_peak` first; the second figure sums every process's VmRSS (shared pages counted more than once, so it overstates). Peak tmp is the job's temp directory, against a 1,536 MiB tmpfs. The CPU quota throttled the sandbox in 18 to 20 percent of its scheduling periods in every run (147 of 752, 284 of 1,455, 495 of 2,661, 890 of 4,984): the render is CPU-bound at 1.5 CPU.

## The decisions

**300 s rule, applied to the 60 s run: it passes, 270.2 s wall (260.1 s child).** W1 renders one segment per video, up to 60 s. No stitch route, no Dockerfile change, no ffmpeg change in W1 (W0.2 already showed the bundled build can stitch). The margin is 30 s (10 percent) and the 420 s service deadline leaves 150 s. This is a known thin margin, not a candidate: a slower machine day or a denser board than about 70 primitives per 15 s could cross 300 s, and the benchmark table will show it if it does.

**Segment decision for W2 (120 s): one segment does not fit the 420 s deadline (500.3 s wall; the render phase alone is 431 s).** The measured fixed cost per render is 40 to 57 s and the render itself is about 3.6 s per video second at 8.35 fps. Two ways to carry 90 to 120 s, to be chosen when W2 is started (the owner has stopped the roadmap after W1):

- **A (recommended): no segments, a longer deadline for this app only.** The service already has a per-job deadline formula (`MOTION_DEADLINE_FORMULA=1`, `MOTION_DEADLINE_FIXED_S`, `MOTION_DEADLINE_PER_SECOND_S`, up to 900 s, margin 1.3, flagged provisional in `server.mjs`). With fixed 60 s and 3.8 s per second, (60 + 3.8 x 120) x 1.3 = about 670 s for 120 s and about 375 s for 60 s, both comfortably over what was measured. It is an environment change in `fly.whiteboard.toml` plus one launcher deploy, with no wrangler change, no stitch route and no segment planning. Cost: a 120 s job holds the single render slot for about 8.5 minutes, and a failed render repeats from the start.
- **B: segments** (the roadmap's W2.1): each segment pays the 15 to 20 s bundle and browser cost again, so 6 segments of 20 s cost about 6 x (17 + 72) = 530 s, longer in total than A (500 s), in exchange for resumability and a shorter slot hold. Only worth it if concurrency or retry cost starts to matter.

## Not measured here

Audio (the muxed track is silent; real narration adds the beat audio in the composition, a small cost), the planner, author and Fish stages (model and provider time, measured end to end in W1's benchmark rows), and concurrent jobs (the service runs one render at a time).

## Cleanup

The measurement code (`whiteboard-capacity.mjs`, `src/whiteboard-capacity/`, the `capacity` route in `server.mjs`, the `whiteboard-capacity` branch of `child.mjs`) is marked `ponytail: W1.0 only`. It is deleted in the same lane before W1.4 lands and never ships to production. It is currently deployed on the whiteboard renderer only, behind the bearer token.
