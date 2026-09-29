# Canvas gap rail and free placement

## Gap rail

Everything on the Learn canvas counts: lesson cards, chat cards, notebooks,
shapes, sticky notes, text, dividers and ink. Wherever nothing on the canvas
occupies a band of height, there is a gap. With the pointer near a gap -
anywhere along it - that gap shows a dotted line across the canvas with three
buttons at the far left of the view (just right of the toolbar, which docks
left by default):

- **[+]** pushes everything below the line down by 120 px.
- **[-]** pulls everything below the line up by 120 px, stopping 24 px short
  of closing the gap so its rail stays reachable.
- **[...]** opens a menu to add a section heading there (Section, Sub-section,
  Sub-sub-section, each with its heading icon). A press anywhere else closes
  it; after adding, the line goes away until the pointer comes back.

Undo reverses a push or a pull. Model and tests: `learn-gap-rail.js`.

## Free placement

Cards, chat cards, notebooks, shapes and notes drag anywhere and may overlap.
Neither the dotted gap lines nor divider lines are walls. A divider is removed
with its x on hover, or by clicking it and pressing Delete.

Verification: `packages/web/e2e/canvas-gap-rail.mjs` on the deployed clone.
