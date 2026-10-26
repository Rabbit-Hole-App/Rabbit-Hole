# Lane A hand-back (tldraw removal: native Whiteboard editor, combined with B and T)  2026-10-26 15:22 PT

Branch feat/tldraw-editor (rabbit-hole). Candidate SHA 8fd0518e20c488397a35da018e8c20c86222b973 (code); branch tip 0a442d2f9 adds only docs/features/tldraw-removal.md.
CI on 8fd0518e: verify run 40409405353 success; fast-e2e run 40409405322 all six parts success (whiteboard-native-check 16/16 in part 4; explain-back-sketch and the other broad-selected checks green).
Merged: B feat/tldraw-migration 04787532, T feat/tldraw-tutor f338aa8a (check-map union by hand, chat-block step taken from T, docs both).
Off by default: whiteboard-flag.js (VITE_NATIVE_WHITEBOARD=true or localStorage rh.nativeWhiteboard=1). Cutover X waits for the integrator.

## Files
New: WhiteboardNative.jsx, whiteboard-editor.js(+test), whiteboard-kept.js, whiteboard-seed.js, whiteboard-derive.js (re-exports B), whiteboard-flag.js, e2e/whiteboard-native-check.mjs.
Changed: AdaptiveCanvas.jsx (renderSketch view/fill/under, sketchStore through toSketch, editSketch via editList for whiteboards, sketchHost.edit/writable, applyBoardDrawBack, ChatCard key/onDrawBack, captureSketch svg), LearningBlocks.jsx (flag switch), canvas-persist.js (lightBlocks persists the last fitting sketch), learn-warmup.js, legacy-whiteboard.js (additive: only, x/y, shapeBounds), chat-block-check.mjs, check-map.json, tldraw-removal.md.
Old WhiteboardBlock.jsx / learn-board-renderer.js / sigmoid-board.js untouched (X deletes them).

## What ran where
- Unit, local: packages/web 4334 pass / 0 fail (before the last two CI-driven edits, which touched only the e2e file and WhiteboardNative.jsx layout classes); check-map/fast-e2e/affected scripts tests pass; vite build ok.
- CI browser (fork stack, keyless, plan stubbed): whiteboard-native-check 16/16: native card (no tldraw DOM), sigmoid seed whole at 100%, pen/highlighter/rect/ellipse/arrow/line/text/sticky, select, move, resize, delete, undo, redo, save+reload, kept layer + downloads (original byte-identical), converted-board edit, tldraw-board edit (derived marks saved with sketchFrom, snapshot byte-identical), fitted large board + drawing in a fitted view, Tutor draw-back (marks + linked image card in one undo step, replay adds nothing, undo/redo, Remove explanation keeps the card), Ask-about-selection pill, no tldraw request, no model request.
- NOT run: chat-block-check.mjs (windows-only, deployed dev worker; its rewritten whiteboard steps and T's explain step have never executed). Run it once on the combined candidate on a dev clone (rabbit-hole-web-dev-tldraw-editor, per parallel-dev-deploys.md) or in the gate; its explain step makes a real model call, so it needs the owner's spend OK. Not run: any real-model Tutor plan, any real learner pen feel, a read-only shared view or fork in a browser (unit only), pixel look of the kept-layer picture, dark mode.

## Interface summary for the integrator
- Card: WhiteboardNative({block, appName, onChange, host}) host = SketchHost context. Canvas side: sketchHost { render(block,{fill,sv,under}), edit(id, sketch=>sketch), writable(id), capture(id,'svg') }.
- Saves: editWhiteboard/editList (mayPersist, withSketch, saveVerdict; tooLarge = verdict reason; persistable() in lightBlocks).
- Tutor: explainBoard (card) -> applyBoardDrawBack (canvas, one snapshot()).

## Capabilities
Spec list items 1-16 as written, with these resolved: kept after all: z-order (8), fonts/bold/italic/underline/size/colour/alignment for new text (11, 12); confirmed lost: align/distribute/lock, laser/snapping/grid, groups, rotation, frames, glued arrows, copy/paste/duplicate, shapes beyond ten kinds, pressure strokes, lists in text.
Additional losses found (spec items 17-26 now): strokes cannot be selected/moved/restyled (eraser only); no marquee select or multi-mark move; no image/file drop into the board (cards instead); undo is the canvas's shared history; red marked rectangle unused; T: no typewriter/camera glide, image marks on a dashed frame, credits as plain text, video/scene become real cards with Generate, simpler diagram routing.

## Unproven / risks
- Bundle: the canvas chunk now statically includes whiteboard-editor, legacy-to-sketch, legacy-whiteboard, board-draw-back (not measured).
- Download picture (html-to-image SVG of the current view) not exercised in a browser.
- Kept-layer picture is an inert <img>: https images inside it will not load (data: images do).
- Card heights: seed needs a frame of about 500x216; below that the seed opens fitted.
- check-map: AdaptiveCanvas.jsx is broad, so every push selects all fast-e2e checks.

## Owner decisions still needed
None for the editor. For cutover: the capability list above; whether Tutor video/scene as cards with their own Generate is accepted (T item 20).
