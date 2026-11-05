# W1 smoke through the routes (4 to 5 November 2026)

`scripts/whiteboard/whiteboard-smoke.mjs` against the review clone `rabbit-hole-web-dev-wb-integrate` (renderer: `rabbit-hole-whiteboard-renderer`, image `a82e6f414`, `whiteboard-renderer-1`), one fresh canvas per case, as the dev test user `whiteboard-smoke@example.com`. Real model, Fish and renderer calls on dev. W6.5 reuses the script. Owner decision, 5 Nov 2026 12:28 AM: the browser try is waived for W1; this smoke and the two new e2e checks are the acceptance.

Files: `wb-smoke-10.txt` (first 10 s run, failed in the script's own proposal read), `wb-smoke-10b.txt` (10 s), `wb-smoke-3060.txt` (30 s and 60 s), `wb-smoke-rec.txt` (refusal, Edit, Cancel). Per video, `10s/`, `30s/`, `60s/`: `proposal.json` (the signed proposal: title, settings, usage incl. the "up to N credits" value), `job-status.json` (the job and its block), `result.json` (the stored result: measured and the `timings` line), `manifest.json` (plan, scenes, timing, measured, versions, asset hashes, timings), `transcript.json`, `captions.vtt`, `poster.png`, `contact-sheet.png` (the renderer's, from the job's R2 prefix). The ffprobe fields of each downloaded MP4 and the usage summary before and after each case are in the logs.

## Results

| Case | Result | Generate to playable | Credits (net, dev ledger) | "up to" line |
|---|---|---|---|---|
| 10 s | ready, 300 frames, h264 yuv420p bt709 30/1, AAC | 95 s | 8.9 | 125 |
| 30 s | ready, 900 frames, same | 191 s | 14.7 | 176 |
| 60 s | ready, 1,800 frames, same | 359 s | 26.2 | 240 |
| refusal ("make a game I can play") | `unsupported`, approved refusal text in Chat, no proposal | n/a | +0.33 | n/a |
| Edit | refine 202, plan revision 2 (two scenes, simpler) | n/a | +6.81 (two plan calls) | n/a |
| Cancel | 200, stage `cancelled` | n/a | +3.27 (the plan call) | n/a |

Stage timings per length are in `../benchmark.md`.

## Refunds: the W1 behaviour (owner, 5 Nov 2026)

The planner's call is charged: an unsupported request, a cancelled plan and an Edit each keep the cost of their plan calls. A failed generation (author, narration, timing, render) refunds its calls by key and says "nothing was charged for the part that failed". Seen: the 10 s run that failed at timing (`narration_overrun`, before the prompt fix) added 2.10 credits to the user's total, about one plan call, so its authoring and narration spend was refunded.

## The 60 s contact sheet, looked at

Legible: axes and the x squared curve, handwritten labels, the pen sprite, one caption line per beat at the bottom; scene starts are blank by design (the board is cleared). The numbers on the frames match the plan's facts: "slope of x² = 2x", "at x = 3: 2 × 3 = 6"; "3 − 0.25×6 = 1.5" and "1.5 − 0.25×3 = 0.75" (the third step, 0.375, is in the manifest and the caption "Step three: zero point three seven five"); rate 0.1 moves 3 to 2.4, rate 1 reaches −3 and "bounces forever". Weaknesses, not blockers: the small red point labels ("x = 3", "height 9", "2.25", "0.5625") are tiny at contact-sheet size and the pen sprite sits on top of "height 9" in one frame.

## What broke and was fixed (each the first candidate of its family)

1. Author reply cut at 4,000 tokens (`output_limit`): author output budget 8,000 (`learn-models.js`); Generate line 192 to 240 credits at 60 s, whole job 288 to 336, under 400.
2. Narration longer than its window after one rewrite (`narration_overrun`): prompt only, an explicit speaking budget (2.0 words per second) in the author and plan prompts.
3. The plan shown twice in Chat (message body and card): the body is not drawn for a `whiteboard-video` proposal.
4. "1 scenes": the narration line says "1 scene" for one scene (owner approved).
