# Canvas connectors

Shapes on the Learn canvas connect with arrows that stay attached.

## Behaviour

- Closed shapes (rectangle, ellipse, triangle, diamond, hexagon, star) have a
  port in the middle of each side: top, right, bottom, left. Ports show on
  hover, on the selected shape, and on every shape while a connection is being
  made.
- **Drag** from a port to another shape's port (or a card's top or bottom
  port), or **click** a port and then click the target: a port, a shape (the
  connector lands on the side facing the start) or a card. Esc or a click on
  empty canvas cancels.
- A connector touching a shape is a diagram arrow: an arrowhead at its end, in
  the current ink colour, routed **elbow** by default. Moving a shape re-routes
  its connectors; deleting a shape deletes them; undo restores both.
- Selecting a connector shows a **Line** row in the style panel: Straight,
  Curved, Elbow. The choice changes the selected connectors and becomes the
  route of the next connector. The same row switches a drawn arrow between the
  Arrow, Curved arrow and Elbow arrow kinds.
- The toolbar has an **Elbow arrow** tool beside Arrow and Curved arrow for
  free-drawn right-angle arrows.
- **Labels:** a selected connector or drawn arrow shows a dot in its middle;
  clicking it (or double-clicking the line) opens a label editor there. Enter
  commits, Shift+Enter breaks the line, Esc commits. The label sits on a
  paper patch in the middle of the line and moves with it; once a line has a
  label, clicking the label of the selected line edits it.
- Card-to-card connections made before this keep their original vertical
  curve and no arrowhead until a route is chosen for them.

## Data

Connectors are the canvas's existing `links`:

```js
{ id, from, fromSide, to, toSide, color,
  route,   // 'straight' | 'curved' | 'elbow'; absent on older card links
  head,    // true: arrowhead at the `to` end
  label }  // optional text
```

`fromSide`/`toSide` are `top | right | bottom | left` for shapes and
`top | bottom` for cards. Drawn arrows are shapes with `kind` `arrow`,
`curve` or `elbow` and an optional `label`. Geometry lives in
`packages/web/src/learn-connectors.js`.

## Limits

- Elbow routes leave and enter through the ports at right angles and detour
  around the two shapes they join when the target is behind a port; they do
  not avoid other shapes on the canvas.
- Shape text takes the shape's colour: recolouring a shape recolours its text.

## Verification

`packages/web/e2e/canvas-connectors.mjs` on the deployed clone, and
`learn-connectors.test.mjs` for the routes.
