# Film kit notes (from the draft-4 take, for the kit fork to mirror)

## Config (film.config.json)
{ "typing": { "prose_ms": 45, "command_ms": 80 } }
- prose_ms: every free-text sentence typed (chat questions, window prompts). command_ms: slash commands ("/explain"). The take types every character with real key events on the virtual clock, retries a dropped key (up to 3 times, logged as RETRY) and asserts the field text equals the sentence (logged TYPED ok / MISMATCH). Typing is rendered at 1.0x (padded 0.15 s each side).

## Camera moves
- Nominal move x1.28, plus the screen travel: travelFrac = hypot(dTx, dTy) / hypot(VW, VH) + 0.25 * |dZoom|.
- Normal moves (nominal < 800 ms): ms = clamp(nominal*1.28 + travelFrac*450, 700, 1100). Overview moves (nominal >= 800 ms): ms = clamp(nominal*1.28 + travelFrac*300, 1100, 1250).
- Same easing (easeInOutCubic in the stepped take, cubic-bezier(.65,0,.35,1) in the real-time take), same zoom limits and framing. Every camera move is a 1.0x window in the render (never ramped); each is logged as "CAMERA move <nominal> -> <ms>".

## Beats added or changed in draft 4
- B5: highlight (real drag) -> the pill directly above the highlight (asserted: gap -6..60 layout px, pill and selection in view, selection inside the card's visible area) -> 1.0 s hold -> the cursor glides onto the pill's [Ctrl+K] button (asserted inside the button box), 600 ms hover -> 56 px key-cap sticker (Ctrl K, 1.4 s) at the press -> window asserted: role=dialog, aria-label=Quick Edit, data-inline-ai, data-inline-mode-current=explain, fixed label "Explain selection", no mode dropdown -> window framed at 1.8x with the pill's origin and the card behind.
- B6: starts from NOTHING selected: click on empty canvas (hit-tested; skips cards, chat pane, buttons, toolbars, dialogs), assert no [data-block-id][aria-current="true"], empty window.getSelection(), no [data-file-doc-selection-toolbar]; if anything is selected press Escape and use another spot. Then the chord (sticker) -> assert the window is the empty-canvas mode: [data-inline-prompt] and [data-inline-mode-toggle] present, no [data-inline-mode-label], no selected card.
- B6b (the ending): three cards dragged one after another by their [data-drag-handle] (Gini Impurity vs Entropy, Bootstrap Coverage Limit, Decision Tree Feature Regions). Free spot chosen by the rects: 250-350 px away, 24 px gap to every other card and to the chat pane, inside the viewport. Drag = glide to the handle, 120 ms, mouse down, 80 ms, 24 eased steps of 28 ms, release, 0.4 s settle (1.7-1.9 s each, marked as 1.0x). Overlap asserted after each drop (logged DRAG ... overlap=false). Caption "Click and drag cards anywhere" for the whole beat. B7 holds 2.5 s. No camera follow during the drags (under zoom the card would run ahead of the cursor, because the app moves a card by the raw mouse delta).

## Bug fixed in the take script (affected draft 3 and v1)
- The markdown card scrolls inside a [data-scroll] element whose px are canvas-zoomed: a screen px = 1/k scroller px, k = box.height / clientHeight (~0.56 at the overview). The helpers scrolled by the screen delta, so they under-shot and the Bagging sentence sat below the card's clip (pill over empty canvas, no visible highlight). Fix: divide the delta by k, 3 iterations to 40% of the box (scrollMarkdownTo and the sentence scroll).

## Stepped take notes
- Virtual clock + 4K page screenshot per 33.3 ms step; Playwright timeouts are real time, so make-step multiplies every `timeout: N` by 10 (a 25 s wait covered only ~3 s of virtual time and timed out on the preview Accept).
- Render settings of the drafts: NOFREEZE=1 FAST=1.8 TRIM=1.5 REV=3 (holds 1.5 s, waits 3 s, ramp 1.8x), draft: SIZE=854x480 PRESET=veryfast CRF=23; final: PRESET=slow CRF=18, yuv420p tv, +faststart.
- Draft 4 numbers: script 102.4 s -> 95.0 s; typing 13.2 s source; longest still stretch 1.8 s.
