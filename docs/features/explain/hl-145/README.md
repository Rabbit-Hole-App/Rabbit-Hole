# HL-145 screenshots (evidence only, not release-blocking)

Status 2026-11-14: BEFORE (ctrlk-144) complete; AFTER (hl-145-on-ctrlk f250cd48b) has the pink-vs-yellow, the persistence-after-reload, the Ctrl+K dim with the pink words, and the keyboard Ctrl+K linked card.
NOT yet captured: the two icons' hover shots and the two camera clicks (A2-A5) and the dim with a saved passage as a second hole (B1): the run crashed on the header icon's hover (the card was off-screen at that zoom)
and the heavy lock went to the 144 gate's re-run. `capture.mjs` here is corrected (hover after Go to card, fail-soft scenes, measures always written); one more run completes the set when the lock is free.

## How these were taken (keyless, local, no stack, no model)

`capture.mjs` drives Chromium (a fresh browser context per scene) against `vite preview` of a built dist-dev; every `/api` request is answered by the script, anything off the loopback is refused.
Fixture DERIVED from the v60 board export (`film-explain/bank/board-export-canvas-bcb7f9f6-postwrite-v60.json`): its Markdown file card (en.md, rev e020962c...) and its "Split criteria: measuring impurity" card
(no sourceRef in the export). The server's mint (`POST /api/learn/source-refs`) and the artifact route attaching the minted ref to the card are emulated; nothing else; no model call. Route: the owner's `/apps/<id>`.

## What the screenshots show

- `before/C1-before-ctrlk-window.png` (ctrlk-144): keyboard Ctrl+K over the selected heading: the words are marked YELLOW and the whole page is dimmed with no hole.
- `before/C2-before-card-made.png`: after Send the card exists but the file card draws nothing for the passage and the card has no source row. `before/measures.json`: `tutorSource: 0`, no `source-refs` request (`ARTIFACT sourceRef=-`): the owner's "no highlight, no symbol".
- `after/C1-after-ctrlk-window.png` (hl-145-on-ctrlk): same action: the words are PINK and are NOT dimmed (a hole in the dim), the rest of the page dimmed. HL-1 + HL-2.
- `after/C2-after-card-made.png`: the same keyboard Ctrl+K now mints (`POST /api/learn/source-refs`), the made card carries "Source: en.md" with the Go to highlight icon top right of its header, and the heading in the file card is pink behind it. HL-1 + HL-3.
- `after/A1-pink-and-yellow.png`, `after/A1b-pink-and-yellow-zoom.png`: a board whose card already carries the ref: the saved heading pink beside the plain Highlight's yellow ("meaning each child contains mostly one class").
- `after/A1c-after-reload-still-pink.png`: after a hard reload of the page the pink heading is still there (the persistence proof; it is drawn from the card's stored sourceRef).

## Notes and one earlier mistake

A first after run showed no pink on the "linked" board. Cause: one shared browser context, so the app's local board draft from the previous scene (a card made before the stub carried the ref) was loaded instead of the fixture. It was a capture defect, not an HL defect; a fresh context per scene fixed it (A1c).
Not yet proven by screenshot: Go to highlight / Go to card clicks centring the camera (before/after rects), the gutter icon on hover, the dim with a saved passage as a second hole. Unit pins exist for all three (explained-passage.test.mjs).
