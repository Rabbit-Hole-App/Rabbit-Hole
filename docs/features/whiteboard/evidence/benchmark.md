# Whiteboard benchmark: minutes from Generate to a playable card, per video length

Owner order, 4 November 2026: every MVP from W1 on adds its rows here. Every job records a deterministic timing line (no model) in its manifest and in the receipt: `plan`, `author` (all scenes), `narration` (all beats), `timing_fit`, `render` (per segment), `pull_store`, `total`, wall seconds each, plus the video length. A receipt's table is the median of that MVP's runs per length: W1 10, 30 and 60 s (the owner-try jobs); W2 adds 90 and 120 s; each later MVP updates the same table so the trend shows.

Reference point only: a competitor claims about 40 seconds of generation for a one-minute whiteboard explainer. We measure first; no work is spent chasing that number in W1 to W3. If an MVP's total for 60 s is over 10 minutes, its receipt says which stage dominates and what one change would cut it most; that goes in `parked.md`, it is not a candidate.

## W1.0: renderer only (render of a synthetic lecture; no audio, no model calls)

Seconds of wall time on `rabbit-hole-whiteboard-renderer` (1.5 CPU, 3 GiB, 4 GB / 2 CPU machine), image `28ae0afdd`, nms beats looped to about 70 primitives per 15 s scene, full output path (H.264 yuv420p bt709, silent AAC muxed in, poster, contact sheet, two determinism stills in a second fresh context). To be filled from the run:

| Video length | Bundle + browser | Render | Mux | Stills + contact sheet | Second context | Total (child) | Wall (POST to ready) | Frames/s (render) | Peak memory, cgroup (MiB) | Peak tmp (MiB) | MP4 (MiB) | ffprobe frames | Over 420 s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 s | 17.0 | 32.9 | 0.1 | 5.9 | 15.8 | 73.0 | 80.1 | 9.12 | 1,200 | 50 | 0.42 | 300 | no |
| 30 s | 12.4 | 103.5 | 0.2 | 6.2 | 16.5 | 142.0 | 150.1 | 8.69 | 925 | 51 | 1.23 | 900 | no |
| 60 s | 14.9 | 214.5 | 0.4 | 6.8 | 17.0 | 260.1 | 270.2 | 8.39 | 915 | 52 | 2.42 | 1,800 | no |
| 120 s | 19.7 | 431.1 | 0.6 | 6.6 | 18.4 | 487.2 | 500.3 | 8.35 | 1,089 | 54 | 4.76 | 3,600 | **yes** |

Seconds unless stated. Source and method: `w1-p0/README.md`; raw log `w1-p0/capacity-run-2026-11-05T01-12-09Z.json`. 300 s rule on the 60 s run: passes (270.2 s). Render is about 86 percent of the total at 60 s and the CPU quota throttles 18 to 20 percent of scheduling periods: the render is CPU-bound at 1.5 CPU.

## W1: end to end (Generate to a playable card; median of the owner-try runs)

| Video length | Plan | Author | Narration | Timing fit | Render | Pull + store | Total | Runs |
|---|---|---|---|---|---|---|---|---|
| 10 s | | | | | | | | |
| 30 s | | | | | | | | |
| 60 s | | | | | | | | |
