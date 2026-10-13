# Text in canvas shapes

Double-clicking a closed toolbar shape (rectangle, ellipse, triangle, diamond,
hexagon, star) with the select tool opens a text editor centred in it. Enter
adds a line; Esc or clicking away commits. Lines and arrows take a label in
their middle instead ([canvas connectors](canvas-connectors.md)).

The same H1 / H2 / H3 / H4 / Text ladder as text boxes (`TEXT_LEVELS` in
`learn-style-panel.js`) sits above the shape while it is being edited or is
the only selection. The shape keeps its corner handles: resizing reflows the
text, which wraps inside an inset box per shape kind (`TEXT_BOX` in
`AdaptiveCanvas.jsx`) so it stays inside the outline. Text is drawn in the
shape's stroke colour and opacity until it is given its own.

Since 2026-10-12 ([canvas editing](canvas-editing.md)): the style panel's
labelled **Text color** and **Font size** controls style the words on their
own, independent of the outline, fill and stroke width, beside the six
formatting controls and left/center/right plus top/middle/bottom alignment.
Changing the outline colour of a shape whose words followed it first gives the
words that colour as their own `textColor`, so they keep it. Words never
overflow silently: the shape grows downward to hold them as they are typed or
formatted, and a resize stops at the height they need (the font never shrinks).

Stored on the shape: `text` (plain, with line breaks), `level`, and optionally
`runs`, `font`, `fontSize`, `bold`, `italic`, `underline`, `textColor`, `align`
and `valign`. Undo, duplicate, copy/paste, save and forks carry all of them.

Verification: `packages/web/e2e/canvas-shape-text.mjs` on the deployed clone;
`packages/web/e2e/canvas-editing-check.mjs` (shape text) in the local harness.
