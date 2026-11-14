# HL-148 evidence: Go to highlight centres the passage at a readable zoom

Keyless Chromium on vite preview, v60-derived fixture (en.md file card, 10,738 px tall at 100%; its "Split criteria: measuring impurity" card carrying the sourceRef), owner route, server mint emulated, no model.
BEFORE = release/explain-146 5cd8b03a3. AFTER = explain/hl-148 72075aac5 (146 candidate + the camera change). Same script, same steps: open, click the card's Go to highlight icon.

| | file card after the click | heading after the click | zoom |
|---|---|---|---|
| before (146) | 140 x 2148 (whole card framed) | y 423, unreadably small | 20% |
| after (hl-148) | 577 x 8867 | y 467 (canvas middle y is 474), pink, readable | 83% |

Files: `before/A5-after-go-to-highlight.png`, `after/A5-after-go-to-highlight.png`, `before/measures.json`, `after/measures.json` (A_heading_after_go_to_highlight, A_zoom_after_go_to_highlight, A_canvas_centre), plus `A4` (Go to card) and `A2` (the header icon) of each build.
