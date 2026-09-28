# Canvas gap rail and free placement

## Gap rail

Everything on the Learn canvas counts: lesson cards, chat cards, notebooks,
shapes, sticky notes, text, dividers and ink. Wherever nothing on the canvas
occupies a band of height, there is a gap. With the pointer on blank canvas
left of the content, the nearest gap shows a dotted line across the canvas
with three buttons at its left:

- **[+]** pushes everything below the line down by 120 px.
- **[-]** pulls everything below the line up by 120 px, stopping 24 px short
  of closing the gap so its rail stays reachable.
- **[...]** adds a section heading there (Section, Sub-section,
  Sub-sub-section).

Undo reverses a push or a pull. Model and tests: `learn-gap-rail.js`.

## Free placement

Cards, chat cards, notebooks, shapes and notes drag anywhere and may overlap.
The dotted gap lines are not walls.

Verification: `packages/web/e2e/canvas-gap-rail.mjs` on the deployed clone.
