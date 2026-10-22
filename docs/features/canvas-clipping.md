# Canvas clipping beside the side panels

Owner report, 2026-10-14: a selected PDF card was cut off on its right side while a right-side panel was open, and there was
unused workspace between the visible edge of the document and the panel. This is section 7 of the PDF Materials refinement.

## Confirmed cause (measured, dc7f20e7, local stack, 1536 x 864 viewport)

With Chat (420 px) and Sources (400 px) open, the canvas row was 712 px wide. It held three boxes:
- the tools' gutter, 84 px;
- the canvas surface, `[data-canvas-surface]`, 536 px, at x 84 to 620;
- the Rabbit Holes Map's own column, `[data-dive-gutter]`, 92 px, at x 620 to 712, full height.

The Sources panel started at x 716. The map itself is about 76 x 110 px at the top of its column, so the 92 px below it was
blank workspace.

The surface is the canvas's clipping box (`overflow: hidden`, the camera transform inside it). A 560 px card at the home view
(x 108 to 668) therefore ended 48 px past the surface edge and was cut at x 620. The blank map column sat between that cut
and the panel.

Two further measurements:
- The card's PDF reader (iframe, 558 px) fitted its card. The card's own boxes clipped nothing early.
- Nothing re-showed the selected card when a panel narrowed the canvas. Add to chat opening a hidden Chat panel left a card
  parked at the right (x 440 to 1000) cut by the new edge.

So the intermediate clipping boundary was the surface's edge, set 92 px short of the real one by the map's full-height
column. The camera also did not follow the narrowing.

## Fix

The map keeps its own column only while the canvas row has room for:
- the tools' gutter (84 px);
- that column (92 px);
- a card column at the home view (`COLUMN` plus 24 px each side, 608 px).

Below that, the map sits at the top of the tools' gutter, as it already does when the tools dock right. The canvas then runs
to the panel (`mapBeside` in `AdaptiveCanvas.jsx`). Nothing is drawn over the canvas.

A resize of the surface is watched. When the width has settled (the same width two frames running, after the panel's
slide), the one selected card is glided back into view at the learner's zoom (`showBox`). This happens only if the card was
whole before the resize. A card the learner had panned away, or a camera move during the resize, is left alone. Nothing
moves while the width holds, so typing and panning never recentre the board. Saved card positions and sizes never change.

After the fix, measured the same way:
- The surface runs from x 84 to 712, against the panel at 716 (the row's own 4 px).
- The map sits at x 8 to 84, top left, in the tools' gutter.
- The selected PDF card is whole at x 108 to 668, with its reader inside it.
- Add to chat on a card parked at x 440 to 1000 ends with it whole at x 128 to 688.
- With Sources closed (the row is 1032 px), the map is back in its own column, top right, at x 1020 to 1112.

A card wider than the canvas, such as a 640 px Notebook in a 628 px canvas, shows its start and runs on under the panel.
That is the real edge of the canvas: ordinary clipping.

## UI-17: no map column at any width (owner, 2026-10-21)

The fix above kept the map's own column whenever the canvas row was 784 px or more (84 + 92 + 608), Chat alone for one. There
the same blank strip came back: a full-height 92 px column between the surface and the panel, and cards cut at its edge.
Measured from the layout (`src/canvas-shell.test.mjs`): a 784 px row gave a 608 px surface and a 92 px strip; a 1032 px row
856 px and 92 px.

Now the map always sits at the top of the tools' gutter, on either side, as it already did on narrow rows and with the tools
docked right. No column, no overlay on the canvas: the surface is the row less the tools' gutter at every width (784 px: 700
px; 1032 px: 948 px), and a card clips only at the panel. Map off hides it in place; the canvas width does not change.
Saved card positions and sizes, the camera, selection and playback are untouched: only the map's slot moved.

## Check

`e2e/canvas-clipping-check.mjs` (local stack, no model call):
- both panels open;
- Chat dragged wider;
- Add to chat opening a hidden Chat, for a PDF card and for a Notebook card;
- 64 % and 156 % zoom;
- Sources closed;
- saved positions unchanged.

Its "no blank strip" assertion fails on dc7f20e7 (96 px between the surface and the panel) and passes after.

Since UI-17 it also covers Chat alone (a card reaches the panel edge, the map in the tools' gutter), the window resized so the
row crosses 784 px (800, 784, 783, 760), View > Rabbit Hole Map off and on, and a wide video card beside the code and graph
cards, with their saved geometry unchanged. It prints `N/19 checks passed`.
