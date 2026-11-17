# Learn sections: code checks the Reviewer asked for (2026-11-16 01:05 PT, on rehearsal/mvp d6e42614d)

The spec bends to the code. Each finding says what the lanes were told.

## Written /explain: how `context` reaches the card
- `generateCommand` (`web/src/learn-slash.js:196`) posts `{ app, command, args, selection, context, board?, depth? }` to `/api/learn/artifact`.
- **`depth` rides only with `board`** (`learn-slash.js:198-199`): `picked` is the caller's `{ depth, board }` when either is given, else `settingsSnapshot(app)`, and `depth` is sent only when `picked.board` is set. BROWSER passes both together.
- **`context` is capped at 8000 characters, `args` at 1000** (`control-plane/src/learn-artifact.js:382`); over either, the request is refused as "Invalid artifact request". So the anchor text in `context` is capped at 8000 characters, not 300 lines. CORE cuts lines from the end of the last anchors first, keeps every header line, and records the cut.
- `context` is never rendered on the card. It is model input only: the author call gets it inside a JSON string field (`learn-artifact.js:129`), the planner gets it (`:180`), and it is also the query for context documents (`:421`). The numbered lines reach the model as plain text; nothing is shown to the learner.
- Today the typed path fills `context` from the selected card (`explainContext(target)`, `learn-slash.js:334`). Section items replace it.

## YouTube
- `validateShowVideo` (`control-plane/src/learn-youtube.js:148`) checks: the video is in this turn's `find_video_moments` result, passages exist unless the moment is `trusted`, 5 s to 5 min (`MOMENT_MIN_S`, `MOMENT_MAX_S = 300`), and `end` against `duration`.
- It does **not** check that the window overlaps the passages that were read. TOOLS' `youtube.js` adds that check from `ctx.turn` (C §5f.2).
- `duration` is often `null` (`:205`), so "a window inside the video" is checkable only when the duration is known.
- Captions come through `learn-captions.js fetchCaptions`. Whether captions fetch on the local stack is not checked yet; the YouTube acceptance run will show it.

## Webpage capture and highlights
- Highlights on a webpage card are the owner's only (`WebpageCard.jsx:126`, `owner ? highlightSource(...)`), stored through `pdf-highlights.js putHighlight` under `web:<lineage>` with **rects** from the rendered text layer (`highlight()` at `:232`, `highlightBody`).
- The server refuses a highlight without rects (`pdf-excerpts.js:92`), so a quote alone cannot be stored ahead of time.
- So webpage quotes follow decision S: the quotes ride on the block; when the capture and its text layer are ready, the card locates each quote, computes rects (`pdf-anchor.js textAnchor`), puts the highlight once, scrolls to the first (`block.scrollTop`), and reports `not_found` through `learn_section_made`.
