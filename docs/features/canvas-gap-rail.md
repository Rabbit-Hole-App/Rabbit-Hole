# Canvas gap rail and free placement

## Gap rail

Everything on the Learn canvas counts: lesson cards, chat cards, notebooks,
shapes, sticky notes, text, dividers and ink. Wherever nothing on the canvas
occupies a band of height, there is a gap. Every gap shows a dotted line
across the canvas with three buttons at the far left of the view, dimmed until
the pointer is near that line:

- **[+]** pushes everything below the line down by 120 px.
- **[-]** pulls everything below the line up by 120 px, stopping 24 px short
  of closing the gap so its rail stays reachable.
- **[...]** adds a section heading there (Section, Sub-section,
  Sub-sub-section).

Undo reverses a push or a pull. Model and tests: `learn-gap-rail.js`.

## Free placement

Cards, chat cards, notebooks, shapes and notes drag anywhere and may overlap.
Neither the dotted gap lines nor divider lines are walls. A divider is removed
with its x on hover, or by clicking it and pressing Delete.

Verification: `packages/web/e2e/canvas-gap-rail.mjs` on the deployed clone.
