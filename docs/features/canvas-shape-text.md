# Text in canvas shapes

Double-clicking a closed toolbar shape (rectangle, ellipse, triangle, diamond,
hexagon, star) with the select tool opens a text editor centred in it. Enter
adds a line; Esc or clicking away commits. Lines, arrows and curves take no
text.

The same H1 / H2 / H3 / H4 / Text ladder as text boxes (`TEXT_LEVELS` in
`learn-style-panel.js`) sits above the shape while it is being edited or is
the only selection. The shape keeps its corner handles: resizing reflows the
text, which wraps inside an inset box per shape kind (`TEXT_BOX` in
`AdaptiveCanvas.jsx`) so it stays inside the outline. Text is drawn in the
shape's stroke colour and opacity.

Stored on the shape: `text` (with line breaks) and `level`. Undo covers both.
Text longer than the shape has room for overflows it rather than shrinking.

Verification: `packages/web/e2e/canvas-shape-text.mjs` on the deployed clone.
