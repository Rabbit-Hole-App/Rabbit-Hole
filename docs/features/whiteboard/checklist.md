# Whiteboard: checklist and decisions

`/whiteboard` is a narrated, progressively drawn video card (10 to 120 s, one voice). The backlog is the owner's roadmap (`rabbit-hole-whiteboard-roadmap-v1.md`, version 1, 4 November 2026); this file records what was decided and what is done. Visible strings are approved in that roadmap's section 1.3 and wait for the owner's word before they are in a candidate.

## Decisions

Taken on 4 November 2026, 3:06 PM PT unless stated.

| # | Decision |
|---|---|
| W-D1 | Spend line $150, counted in settled credits across the roadmap (not holds). |
| W-D2 | Per-job ceiling: 400 credits in W1, 700 from W2. The policy prints the exact worst case; it never blocks a lane. |
| W-D3 | Illustrations at 1K now. 2K is parked as `P-WB-002`. |
| W-D4 | Amended 4 Nov 2026: the second Fly app `rabbit-hole-whiteboard-renderer` exists from W0 (not W2), same image, its own bearer token, never Motion's, no volume. `rabbit-hole-motion-renderer` is never redeployed by this roadmap. |
| W-D5 | W2 gate bar: 6 of 8 gate jobs ready at first round or after repairs; 0 of the owner's 3 inspected videos with a wrong number or label. |
| W-D6 | `/whiteboard` is visible to everyone from W1. |
| W-D7 | A duration change on the proposal re-plans (one planner call). |
| W-D8 | JEV shadow study parked as `P-WB-001`. |
| W-D9 | Dev clones use the whiteboard renderer app; there is no dev renderer. (4 Nov 2026) |

Release authority (owner, 4 Nov 2026): standing GO to release W1, W2 and W3 to production once each MVP's acceptance list and the owner try are done; after each release stop and wait for the owner's word before the next MVP's first candidate. W4 onward waits for the recorded W3 gate decision. The owner keeps the `45-whiteboard` rule set, the pushes to `main`, and the renderer token.

## W0 (renderer, secrets, bindings)

- [x] W0.1 `/health` of the production and dev Motion renderers read (`evidence/w0-2026-11-04.md`).
- [x] W0.2 ffmpeg concat probe in the Linux image (`packages/learn-render/whiteboard/ffmpeg-probe.mjs`): the bundled build stitches H.264 + AAC with `-c copy`; Dockerfile unchanged (a).
- [x] W0.3 `fly.whiteboard.toml`, the `whiteboard` target of `context.sh`, the owner launcher (`ops/whiteboard-renderer.*`). The owner ran it: the app is serving the deployed commit.
- [x] W0.4 Binding commit: `WHITEBOARD_JOBS` with migration `whiteboard-jobs-1`, `WHITEBOARD_ENABLED` (`"false"` in production, `"true"` in dev), `WHITEBOARD_RENDERER_URL`; no `WHITEBOARD_ESTIMATE_USD`. Released: `71162c729`, gate 41938211033, release run 41940668346, 4 Nov 2026 4:23 PM PT.
- [x] W0.5 Owner steps (launcher run; W-D9 recorded above).
- [x] W0.6 Receipt: `evidence/w0-2026-11-04.md`.

## W1

Standing orders (owner, 4 Nov 2026): W1 is the last MVP started until the owner says otherwise; after it is released and its receipt posted, no W2 candidate or W2 file work. The View > Slash Commands entry (`EXAMPLES` line and `PREVIEWS` row, kind `card`, "/whiteboard explain gradient descent with one worked example") lands in the W1.5 registry commit, and W1 acceptance includes the window showing it on the preview (screenshot in the receipt).
