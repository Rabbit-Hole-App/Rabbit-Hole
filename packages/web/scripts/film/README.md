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

## 6. This folder (packages/web/scripts/film/) and how to use it

Written 2026-11-14 from the first film's scripts. **Status: written but never run end to end** (the machine was busy with the 4K capture when this was made): only `--dry` and `node --check` have been exercised. See "Equivalence TODO" below before trusting a take from it.

| File | What |
|---|---|
| `capture.mjs` | the ONE take runner: reads a `film.config.json`, records the take from the real canvas (dist-dev under `vite preview`), writes `requests.log`, `marks.json`, `checks.json`, `frames/` |
| `film.config.json` | THIS film (explain-around-markdown) in beats: the approved take-d7 |
| `film.config.example.json` | a minimal skeleton for the next video |
| `verbs.mjs` | the beat verbs, their required fields and the static config check (`--dry`) |
| `assert.mjs` | the SOP section 3 beat checklist, asserted from the take (pill, skeleton, card centred, tooltip, menu in frame, Chat pane, no dead stretch, request hygiene) |
| `draft.mjs` | ONE COMMAND: take -> checklist -> 480p render -> dead-scene check of the output -> contact sheet; a failing draft is never written |
| `render.mjs` | frames of a take -> constant 30 fps timeline with the speed ramp and the cuts -> H.264 (yuv420p, TV range, faststart) |
| `deadcheck.mjs`, `sheet.mjs`, `autotrim.mjs` | still-stretch check of an output, 1 fps contact sheet, auto-trim of long still stretches |
| `tools.mjs` | where ffmpeg (`FILM_FFMPEG`) and sharp (`FILM_SHARP_FROM`) come from |
| `push-evidence.sh` | push stills, sheets and videos to the reading branch `film/evidence` with git plumbing (no checkout; refuses text files that look like they hold an email, key or cookie) |
| `bank.schema.md` | the shape of the per-video answer bank (banks stay out of git) |
| `experimental/capture-step.mjs` | the frame-stepped 4K take (virtual clock, one true 3840x2160 screenshot per step): an unproven snapshot, see below |
| `kit-landing/` | the owner's landing AI-Tutor kit this grew from (notes, RUN.txt, encode/retime/frames, original capture): reference only |

### Set up once per machine
- `FILM_FFMPEG` = an ffmpeg with libx264 (Playwright's has no H.264 or MP4; the first film used the build in Remotion's compositor package).
- `FILM_SHARP_FROM` = a `package.json` whose node_modules has `sharp` (packages/web does not).
- `FILM_DATA` = the folder of the video's data: `bank/bank.json`, `serve/en.md` or other files the config names. Banks hold model answers: never commit them.

### One video
1. Write `<video>.film.config.json` from the example (beats, texts, locators, scripted routes, bank keys). `node scripts/film/draft.mjs <config> --dry` until it validates.
2. Build the branch: `VITE_COACHING_DEV=true VITE_TLDRAW_LICENSE_KEY=<key from the credentials file, by name, never printed> npx vite build --outDir dist-dev` (from packages/web), then `node ../../node_modules/vite/bin/vite.js preview --outDir dist-dev --port 5480 --strictPort --host 127.0.0.1`.
3. `node scripts/film/draft.mjs <config>` -> 480p draft + contact sheet (or the checklist failure). Dry-run the beats on the dev stack at scale 1 BEFORE building the bank (section 5).
4. Approval loop (section 4). On "approved": `PRESET=slow CRF=18 FAST=<ramp.fast> node scripts/film/render.mjs <take> <out>/<name>-1080p` from the SAME take (its frames are real 1920x1080), poster from the take's `poster.jpg`, `sheet.mjs` every 3 s.
5. Push stills and contact sheets (and the small mp4s) with `bash scripts/film/push-evidence.sh <subdir> "<message>" <src>=<dest> ...`.

### The beat verbs (verbs.mjs)
`goto`, `wait-for`, `blur`, `start`, `end`, `hold`, `shot`, `click`, `hover` (+ `tooltip`), `type` (+ `expectField`), `press`, `mouse-press`, `sticker` (key-cap), `camera` (to locators or the full frame, `free`, `check: centred|inframe`), `scroll-into-view`, `scroll-heading`, `slash-command` (picker click + pill), `expect`, `choose-depth`, `skeleton`, `wait-card`, `set-files`, `toggle-layout`, `select-text`, `caption`, `stamp`, `mark` (typing/reveal/depth/hold/dead/cut/upload), `click-empty`, `fit`, `drag-to-free-spot`, `dump-layout`, `poster`. A locator is a css string, `"@name"` (config `locators`), or `{ css | role+name | text, within, hasText, hasExactText, nth, first }`. `"@NAME"` in a `type` text refers to config `texts`.

### What the checklist asserts (assert.mjs, thresholds in config `checklist`)
pill seen (every slash command) - skeleton seen >= 1200 ms before the card lands - card centred within 12% of the viewport centre - tooltip shown >= 700 ms before the click - menus and the Ctrl+K window inside the viewport - Chat pane inside the viewport when an ask answers there - no hold over 2.6 s (the last one may be) - dead stretches (> 1.2 s with no typing, reveal, hover, camera or cursor activity) are marked and cut by the render, and the OUTPUT must have no still stretch over `stillMax` (draft.mjs) - request hygiene: 0 UNSCRIPTED, 0 ABORT, 0 FAILED, 0 PAGEERROR, no route polled more than `pollMax` times.

### Known limits (measured on the first film)
- The screencast is capped at the page's CSS size: real-time capture is 1920x1080 whatever the device scale. A true 3840x2160 screenshot takes about 0.6 s on the canvas page (about 1.7 fps) and starves it, so 4K needs a frame-stepped take (`experimental/capture-step.mjs`: unproven; the CSS animations may not follow the virtual clock).
- The page stalls for 12-15 s at every card landing in a headless software-rendered browser: the render cuts any stall over 3 s (LONGTASK in `requests.log`), keeping 0.5 s, so the skeleton is visible but frozen, not shimmering. A GPU browser or the stepped take is the fix.
- Native title tooltips are not drawn headless: the runner draws its own (config `tooltip.selector`).
- The ramp of the first film was 1.8x outside the 1.0x windows (not 1.4x) to stay near 75 s; `draft.mjs --dry` warns when `ramp.fast` is not 1.4.

### Equivalence TODO (do after the 4K, with the machine free)
`capture.mjs` and `film.config.json` were written from `take-d7`'s script by hand and never run. Re-run the runner on this config at device scale 1 (`DSF=1 SCREENCAST=1 node scripts/film/capture.mjs scripts/film/film.config.json <outDir>`) and compare with take-d7: `requests.log` must show 0 UNSCRIPTED and 0 model calls with the same scripted routes called in the same order; `marks.json` (typing/reveal/depth/hold counts and the start/end) must match to within a second or two; the contact sheet must show the same beats. Any difference is a bug in the runner or the config, not in the product. Things I had to guess when translating: the window pill check at B6 (`[data-inline-ai][data-inline-command]` stands in for the original's attribute read); the `after` pause after typing a command (260 ms default, the original used 300 ms for the window's `/explain`); marks of short pauses (now recorded as activity so they do not count as dead time); the `check` observations (new: they only record, the take's behaviour is unchanged).
