# Film SOP — product videos (v1, 2026-11-14, from the /explain film; v0 kept as film-sop-v0.md)

Owner's rule: a film is footage, not a release. No CI, no gate, no tests on the film's path. Product fixes that the footage needs are made on the film branch and gated later when they ship.
Standing rule (owner, 2026-11-14 02:24): anything the reviewer must accept, verify or read (a draft, a contact sheet, a still, a video, a report) is pushed to the remote first and the message carries the SHA and the path. Films: branch `film/evidence` (reading copy, never merges; `docs/features/explain/film/<draft>/`, MP4s under `.../videos/`, each file < 100 MB).

## 1. Pipeline (fixed order)
1. **Script** (reviewer writes, owner approves): beats, prompts, depths, what is real vs scripted. Everything below in §3 is in the script, not improvised. **Dry-run the beats on the dev stack at device scale 1 before the bank is built**, so product defects are found before the take, not in frame.
2. **Bank**: every model answer the take will show is generated beforehand (production blocks where they exist, otherwise the local stack) and stored as JSON, outside git (a `bank.schema.md` documents the shape). The take never calls a model. Requests log must show **0 UNSCRIPTED, 0 model calls**, and no route polled more than ~20 times.
3. **Recording build**: the branch's dist-dev under vite preview on loopback; every `/api` answered from the bank and the scripted routes: profile, workspaces, board, **depth settings (GET returns the current depth, PUT ok)**, **roadmap (the product's own "disabled" answer, never a bare 404: a 404 makes the page re-poll in a tight loop and freeze it)**, chat stream with `ok: true`, any upload/import routes. No email, key or cookie anywhere on screen or in the kit's text files.
4. **Take** → **480p draft** (854×480, `yuv420p` TV range) to the owner. Redo drafts until the owner approves; one revision per draft. Only after "approved": the 1080p, then the 4K.
5. **Deliverables**: `out/<name>-480p.mp4` per draft; on approval `-1080p.mp4`, `-4k.mp4`, `poster.jpg`, a contact sheet every 3 s, a dead-scene check text and a settings text. All pushed to `film/evidence` with SHA + paths. Encode: `libx264`, CRF 18, preset slow, `yuv420p` **TV (limited) range** (never `yuvj420p`), `+faststart`, 30 fps, silent.

## 2. The kit (reuse, don't rebuild)
`capture.mjs` (Playwright, scripted `/api`, CSS camera on `<body>`, injected cursor + click ring, real clicks, `marks.json`), `encode.mjs` (trim), `retime.mjs` (speed ramp, frame render), `frames.mjs` (contact sheet). Editorial layer lives in the recording page only — camera, cursor, click ring, keycap stickers, tooltip overlays (headless never draws native `title` tooltips) — never in product code. The app must see **camera-free rectangles** (override of `getBoundingClientRect` in the recording page, raw rectangles only where the mouse needs them) or placement breaks.
- **Real-time capture is 1080p at best.** The screencast is capped at CSS size whatever the device scale, and a 4K screenshot takes ~0.2–0.6 s, so real-time 4K is impossible on a software-rendered page. The page also stalls (12–15 s per card landing) and freezes the footage.
- **4K = a frame-stepped take** (`capture-step.mjs`): a virtual clock (Playwright `page.clock`) advanced 33.3 ms per step, CSS animations/transitions driven through the Web Animations API, camera tween and cursor on the same clock, every script wait sleeping on it, and a real `page.screenshot` at device scale 2 per step. No stalls, a visible shimmer, true 3840×2160. Short waits (key delays, glide steps) are clamped to whole steps by typing in per-frame chunks. Use it for the 4K; the 480p drafts may come from it too (downscale).
- The typing tool can drop characters (e.g. the "c" of "class"): type with real key events in chunks, retry dropped keys, assert the field text equals the sentence afterwards; never fall back silently to a native setter.

## 3. Camera and timing grammar (every script states these per beat)
- **Camera**: eased (`cubic-bezier(.65,0,.35,1)`), **distance-aware 700–1100 ms** (overview 1100–1250 ms; owner: not fast), never below 1×, max ≈2.4×. Move *to the composer* while typing; *to the landing slot* as soon as a skeleton appears; **centre every new card when it lands**; *out* to frame the result, then hold. Overview at the end, hold ≤ 2.5 s, drift ≤ 1.04× over 3 s. Camera moves play at 1.0×. No camera follow during a card drag (the app moves a card by the raw mouse delta, so under zoom it runs ahead of the cursor).
- **No dead time**: any stretch > 1.2 s with no typing, reveal, hover or camera move is marked `dead` and cut (not sped); a frozen page stretch > 3 s is cut at render. Holds exist only where there is something to read, 1.5–2.5 s (trimmed to ~1.5 s in practice). Proof before a draft: frame-to-frame change on the OUTPUT frames, no still stretch > 2.0 s, each read hold listed with its timestamp and what is on screen.
- **Speed ramp**: 1.4–1.8× outside (the approved film used 1.8×); 1.0× during typing, reveals, menus, previews, uploads, holds and camera moves.
- **Typing (owner: always slow, a film of ~90 s is fine)**: prose 45 ms/key, slash commands 80 ms/key, visible character by character everywhere text is typed (composer, Ctrl+K window); after a slash command + Enter, pause 500 ms with the **command pill** in frame. Config keys: `typing.prose_ms`, `typing.command_ms`.
- **Loading is part of the footage**: scripted answer delay 1.6–2.0 s (up to 3 s in a stepped take); the reserved **skeleton with shimmer** and the composer spinner in frame for every card, camera on the slot. Cards made from a Ctrl+K window show the window's own spinner (no slot is reserved). The send button turns into a red **Stop** button while a request runs: real behaviour, keep it (hover it so the tooltip explains it).
- **Hover before click** on any control with a tooltip (800 ms, drawn as an overlay) so the tooltip is read; click ring on every press. Button labels as the product has them (e.g. "Ask in chat", "Ask in a new card").
- **Keyboard chords** (Ctrl+K, Shift+1) and the Ctrl+K pill button get an editorial **keycap sticker**: large (≈56 px), high contrast, top third or directly above the window, never over a card title, 1.2–1.5 s, present in the output frames at that moment.
- **Selection beats**: highlight text → the selection pill appears **directly above the highlight** (assert: within ~60 px above, both in the viewport and the card's visible area), hold 1.0 s → the cursor glides onto the pill's **Ctrl+K button**, hover 600 ms, click ring on it → the Ctrl+K window opens in "Explain selection" mode (fixed label, no dropdown, the passage as its text: the product's own window). Frame it at ~1.6–1.8× so the dimmed highlighted card stays visible (a tight zoom on the passage text alone reads as a mock-up); assert `[data-inline-ai]` with `[data-inline-mode-current="explain"]`. Then the preview with Reject/Accept (hold 2.2 s), click Accept, camera to the generated card.
- **Ctrl+K on the canvas**: start from NOTHING selected (click truly empty canvas, assert no selection), then the chord, the window in empty-canvas mode (placeholder + mode dropdown), the typed `/explain` pill and prompt. In the slash picker inside the window, click its first entry (Enter does not pick).
- **Menus and windows** (Depth menu, Ctrl+K window, preview with Reject/Accept) are framed inside the viewport (≥ 260 px free to the right of a drop-down) — open, hold 600–700 ms, choose.
- **Opening**: start on an EMPTY canvas: Insert menu (hold 600 ms) → "Upload a file" → the file input (`setInputFiles`, the native dialog never shows) → the product's destination dialog (`data-upload-choice`) → the real card lands; set the film board layout to scrollable if the product lands it in Full. Marks `upload` play at 1.0×.
- **Ending**: move several cards (3), each by its header handle, 250–350 px to a free spot chosen by rectangles (assert no overlap after each drop), caption "Click and drag cards anywhere" for the whole beat; then the overview, hold 2.5 s.
- **Real behaviour only**: if the product opens the answer in the Chat pane, the camera goes to the Chat pane. After any Ask on a card the product hides that card's suggestion rows: plan beats around it. No film-only placement nudges. If something looks wrong on camera, it is a product bug → fix on the film branch, register it, film the fix.
- **Beat checklist** before a draft (asserted by the take, a draft that fails never reaches the owner): pill seen · skeleton (shimmering) seen · card centred · tooltip seen · menu in frame · typing slow and visible · sticker visible · pill above the highlight and the Ctrl+K button clicked · nothing selected before the canvas Ctrl+K · window not looking fake (framed wide, DOM asserted) · no dead stretch · Chat pane shown when used.

## 4. Approval loop
Owner reviews the 480p draft with timestamps (note the draft's own timeline; keep marks so a timestamp maps to a script beat); notes become a numbered list; one revision per draft; each draft's contact sheet and the check frames read by the reviewer against the list before the owner watches (pushed to `film/evidence`). 1080p/4K only after "approved". Say which beat a note refers to (B0a upload, B1 … B7 overview) — numbers are the script's beat ids.

## 5. What cost time on the first film (avoid)
- Tests/gates on the film path (the owner's rule: none, ever).
- **4K attempted before a 1080p file existed**, and real-time 4K capture (impossible; use the frame-stepped take, and keep a real 1080p as the safety net).
- Product defects discovered in frame (now: dry-run the beats on the dev stack at scale 1 before the bank is built): the selection toolbar misplaced at any zoom ≠ 100% (UX-2), a "Ask here" label that did not say it opens the chat (UX-3), the markdown card failing to anchor a first card (CV-4).
- The depth-settings route missing from the script (toast on camera) and the roadmap route answered with a bare 404 (31,751 polls, 6–12 s freezes).
- The CSS camera on `<body>` skewing the rectangles the app measures (cards landing thousands of px away): override in the recording page.
- Native tooltips never drawn in headless: overlay them.
- The typing tool dropping characters; the markdown card landing in Full layout (a 10,500 px strip) when the board's default was not set; a 1.4× ramp making a 97 s film (1.8× and 1.5 s holds gave ~72 s).
- Several rounds of re-takes because the owner's notes arrived piecemeal: collect the notes into one numbered list per draft before a re-take.


## 6. This folder (packages/web/scripts/film/) and how to use it

Written 2026-11-14 from the first film's scripts and mirrored to SOP v1 and the film's final script the same night. The equivalence status is in "Equivalence" at the end of this section.

| File | What |
|---|---|
| `capture.mjs` | the ONE take runner: reads a `film.config.json`, records the take from the real canvas (dist-dev under `vite preview`), writes `requests.log`, `marks.json`, `checks.json`, `frames/` |
| `film.config.json` | THIS film (explain-around-markdown) in beats, as the film's final script |
| `film.config.example.json` | a minimal skeleton for the next video |
| `verbs.mjs` | the beat verbs, their required fields and the static config check (`--dry`) |
| `assert.mjs` | the SOP section 3 beat checklist, asserted from the take (see below) |
| `draft.mjs` | ONE COMMAND: take -> checklist -> 480p render -> dead-scene check of the output -> contact sheet; a failing draft is never written |
| `render.mjs` | frames of a take -> constant 30 fps timeline with the speed ramp and the cuts -> H.264 (yuv420p TV range, faststart) |
| `deadcheck.mjs`, `sheet.mjs`, `autotrim.mjs` | still-stretch check of an output, 1 fps contact sheet, auto-trim of long still stretches |
| `tools.mjs` | where ffmpeg (`FILM_FFMPEG`) and sharp (`FILM_SHARP_FROM`) come from |
| `push-evidence.sh` | push stills, sheets and videos to the reading branch `film/evidence` with git plumbing (no checkout; refuses text files that look like they hold an email, key or cookie) |
| `bank.schema.md` | the shape of the per-video answer bank (banks stay out of git) |
| `experimental/capture-step.mjs`, `experimental/make-step.mjs` | the film fork's frame-stepped 4K take (it produced the v1 4K): a film-specific snapshot, not config-driven; porting its stepping into `capture.mjs` as a mode is the next step |
| `kit-landing/` | the owner's landing AI-Tutor kit this grew from (notes, RUN.txt, encode/retime/frames, original capture): reference only |

### Set up once per machine
- `FILM_FFMPEG` = an ffmpeg with libx264 (Playwright's has no H.264 or MP4; the first film used the build in Remotion's compositor package).
- `FILM_SHARP_FROM` = a `package.json` whose node_modules has `sharp` (packages/web does not).
- `FILM_DATA` = the folder of the video's data: `bank/bank.json`, `serve/en.md` or other files the config names. Banks hold model answers: never commit them.

### One video
1. Write `<video>.film.config.json` from the example (beats, texts, locators, scripted routes, bank keys, `typing`). `node scripts/film/draft.mjs <config> --dry` until it validates. Dry-run the beats on the dev stack at scale 1 BEFORE building the bank (section 1).
2. Build the branch: `VITE_COACHING_DEV=true VITE_TLDRAW_LICENSE_KEY=<key from the credentials file, by name, never printed> npx vite build --outDir dist-dev` (from packages/web), then `node ../../node_modules/vite/bin/vite.js preview --outDir dist-dev --port 5480 --strictPort --host 127.0.0.1`.
3. `node scripts/film/draft.mjs <config>` -> 480p draft + contact sheet (or the checklist failure).
4. Approval loop (section 4). On "approved": 1080p from the SAME take (`PRESET=slow CRF=18 FAST=<ramp.fast> node scripts/film/render.mjs <take> <out>/<name>-1080p`, real 1920x1080 frames) and the 4K from a frame-stepped take (section 2); poster from the take's `poster.jpg`, `sheet.mjs` every 3 s.
5. Push stills and contact sheets (and the mp4s, < 100 MB each) with `bash scripts/film/push-evidence.sh <subdir> "<message>" <src>=<dest> ...`.

### The beat verbs (verbs.mjs)
`goto`, `wait-for`, `blur`, `start`, `end`, `hold`, `shot`, `click`, `hover` (`tooltip`, `assertCursorOn`), `type` (`kind: prose|command` picks `typing.prose_ms` / `typing.command_ms`; `expectField`), `press`, `mouse-press`, `sticker` (56 px key-cap), `camera` (to locators and/or remembered rectangles via `include`, or the full frame; `free`; `check: centred|inframe`; the duration is distance-aware, 700-1100 ms, overview 1100-1250 ms, played at 1.0x), `remember`, `scroll-into-view`, `scroll-heading`, `slash-command` (picker click + pill), `expect`, `choose-depth`, `skeleton`, `wait-card`, `set-files`, `toggle-layout`, `select-text`, `assert-pill-above`, `assert-window` (`mode: explain|empty`), `nothing-selected`, `caption`, `stamp`, `mark` (typing/reveal/depth/hold/dead/cut/upload), `click-empty`, `fit`, `drag-cards`, `dump-layout`, `poster`. A locator is a css string, `"@name"` (config `locators`), or `{ css | role+name | text, within, hasText, hasExactText, nth, first }`. `"@NAME"` in a `type` text refers to config `texts`.

### What the checklist asserts (assert.mjs, thresholds in config `checklist`)
pill seen (every slash command) - skeleton seen >= 1200 ms before the card lands - card centred within 12% of the viewport centre - tooltip shown >= 700 ms before the click - menus and the Ctrl+K window inside the viewport - Chat pane inside the viewport when an ask answers there - typing slow and visible (prose >= 40 ms/key, commands >= 70) - key-cap sticker shown (>= 50 px, top half) - the selection pill directly above the highlight (gap -6..60 px, both in view, selection inside the card's visible area) - the cursor on the pill's Ctrl+K button before the click - the Ctrl+K window is the product's own (DOM asserted in both modes) - nothing selected before the canvas Ctrl+K - dragged cards land without overlap (>= `dragsMin`) - no hold over 2.6 s (the last may be) - dead stretches (> 1.2 s with no typing, reveal, hover, camera or cursor activity) are marked and cut by the render, and the OUTPUT must have no still stretch over `stillMax` (draft.mjs) - request hygiene: 0 UNSCRIPTED, 0 ABORT, 0 FAILED, 0 PAGEERROR, no route polled more than `pollMax` times.
Not yet asserted from the SOP: the shimmer of the skeleton (needs the stepped take: in a real-time take the skeleton is frozen during page stalls), the red Stop button hover, and that the sticker is present in the OUTPUT frames (the take only records that it was shown).

### Known limits (measured on the first film)
- The screencast is capped at the page's CSS size: real-time capture is 1920x1080 whatever the device scale; a true 3840x2160 screenshot takes 0.2-0.6 s on the canvas page, so real-time 4K is impossible. 4K needs the frame-stepped take (`experimental/`), which also removes the stalls and shows the shimmer.
- The page stalls for 12-15 s at every card landing in a headless software-rendered browser: the render cuts any stall over 3 s (LONGTASK in `requests.log`), keeping 0.5 s, so in a real-time take the skeleton is visible but frozen.
- Native title tooltips are not drawn headless: the runner draws its own (config `tooltip.selector`).
- Ramp: SOP v1 allows 1.4-1.8x outside the 1.0x windows; the approved film used 1.8x. `draft.mjs --dry` warns outside that range.

### Equivalence
`compare-takes.mjs <referenceTake> <newTake>` compares two takes: request hygiene, the /api routes called, the order of the scripted events (artifacts by bank key, inline decide, file store, asks, depth menus, selection, drags) and the marks (script length, seconds per mark kind).
Run 2026-11-14 (own vite preview on the film's dist-dev, device scale 1, `draft.mjs`, real-time take) against take-d7 (real-time, old script) and take-s5 (frame-stepped 4K, current script):

- Request hygiene: 0 UNSCRIPTED, 0 model calls (0 model aborts), 0 failed, 0 page errors, one outside host blocked (the same line is in the film's own d7 and s5 logs). Identical to both takes.
- Routes: 47 routes, 0 flagged against both takes (random chat thread ids normalised); the scripted bank artifacts, inline decide, file store, ask and depth menus occur in the same order and count.
- Beat checklist (SOP section 3): every check passes. One accepted known issue is printed, not hidden: the chat pane's Depth menu is clipped at the right edge of the 1920 viewport, in the film's own take-s5 (frame 843) as well; it is the app's layout, not the take (config beat `known`).
- Timing is NOT within 1 s, and cannot be in a real-time take: script 135.3 s (kit, real-time) against 102.4 s (film draft 4, stepped) and 145.6 s (d7, real-time, old script); the output is 104.9 s against 95.0 s. The kit take carries page stalls (6-8 s at card landings, cut by the render) and per-key latency (typing 16.9 s against 13.2 s). Mark counts match the stepped take (37 reveals, 6 typing, 2 depth). Timing equivalence needs the frame-stepped mode, which is not ported yet (`experimental/`).
- The take-by-take evidence is in the reading branch film/evidence under kit/ (comparison texts, marks, checks, the 480p draft and its contact sheet).

Known differences of the real-time kit take from the film's frame-stepped take: the render cuts page stalls (LONGTASK) which the stepped take does not have; no per-key retry (RETRY) in the real-time typing, the field text is asserted after typing instead (expectField); the draft uses CRF 23 as the film's drafts; the log lines of the assertions are worded differently (compare-takes.mjs reports them as count differences, not as behaviour differences).
