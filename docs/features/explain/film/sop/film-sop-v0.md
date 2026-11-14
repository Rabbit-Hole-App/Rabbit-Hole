# Film SOP — product videos (v0, from the 2026-11-13/14 /explain film)

Owner's rule: a film is footage, not a release. No CI, no gate, no tests on the film's path. Product fixes that the footage needs are made on the film branch and gated later when they ship.

## 1. Pipeline (fixed order)
1. **Script** (reviewer writes, owner approves): beats, prompts, depths, what is real vs scripted. Everything below in §3 is in the script, not improvised.
2. **Bank**: every model answer the take will show is generated beforehand (production blocks where they exist, otherwise the local stack) and stored as JSON. The take never calls a model. Requests log must show 0 UNSCRIPTED, 0 model calls.
3. **Recording build**: the branch's dist-dev under vite preview on loopback; every `/api` answered from the bank and the scripted routes (profile, workspaces, board, depth settings, chat stream with `ok: true`). No email, key or cookie anywhere on screen or in the kit's text files.
4. **Take** at device scale 1 → **480p draft** (854×480) to the owner. Redo drafts until the owner approves. Only then: 1080p from the same take, then 4K (frame render path).
5. **Deliverables**: `out/<name>-480p.mp4` per draft; on approval `-1080p.mp4`, `-4k.mp4`, `poster.jpg`, contact sheet. Contact sheets and stills of every draft pushed to `film/evidence` (reading copy, never merges).

## 2. The kit (reuse, don't rebuild)
`capture.mjs` (Playwright, scripted `/api`, CSS camera on `<body>`, injected cursor + click ring, real clicks, `marks.json`), `encode.mjs` (trim), `retime.mjs` (speed ramp, frame render), `frames.mjs` (contact sheet). Editorial layer lives in the recording page only — camera, cursor, click ring, keycap stickers — never in product code. The app must see camera-free rectangles (override in the recording page) or placement breaks.

## 3. Camera and timing grammar (every script states these per beat)
- **Camera**: eased 500–600 ms (`cubic-bezier(.65,0,.35,1)`), never below 1×, max ≈2.4×. Move *to the composer* while typing; *to the landing slot* as soon as a skeleton appears; **centre every new card when it lands**; *out* to frame the result, then hold. Overview at the end, hold ≤ 2.5 s, drift ≤ 1.04× over 3 s.
- **No dead time**: any stretch > 1.2 s with no typing, reveal, hover or camera move is marked `dead` and cut (not sped). Holds exist only where there is something to read, 1.5–2.5 s.
- **Speed ramp**: 1.4× outside; 1.0× during typing, reveals, menus, previews, holds.
- **Typing**: commands 30 ms/key, prose 9 ms/key; after a slash command + Enter, pause 500 ms with the pill in frame.
- **Loading is part of the footage**: scripted answer delay 1.6–2.0 s; skeleton + shimmer and the composer spinner in frame for every card.
- **Hover before click** on any control with a tooltip (800 ms) so the tooltip is read; click ring on every press.
- **Keyboard chords** (Ctrl+K, Shift+1) get an editorial keycap sticker for 1.2 s.
- **Menus and windows** (Depth menu, Ctrl+K window, preview with Reject/Accept) are framed inside the viewport — open, hold 600–700 ms, choose.
- **Real behaviour only**: if the product opens the answer in the Chat pane, the camera goes to the Chat pane. No film-only placement nudges. If something looks wrong on camera, it is a product bug → fix on the film branch, register it, film the fix.
- **Beat checklist** before a draft: pill seen · skeleton seen · card centred · tooltip seen · menu in frame · no dead stretch · Chat pane shown when used.

## 4. Approval loop
Owner reviews the 480p draft with timestamps; notes become a numbered list; one revision per draft; each draft's contact sheet read by the reviewer against the list before the owner watches. 1080p/4K only after "approved".

## 5. What cost time on the first film (avoid)
Tests/gates on the film path · 4K path attempted before a 1080p file existed · product defects discovered in frame (now: dry-run the beats on the dev stack at scale 1 before the bank is built) · depth-settings route missing from the script (toast on camera) · toolbar placement bug (UX-2) found at the take.
