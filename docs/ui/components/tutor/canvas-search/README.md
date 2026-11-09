# Canvas Search

Stable ID: `tutor/canvas-search` · Status: **reference**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/f3314b43631a5c583056612b821f481d6988c899/packages/web/src/CanvasSearchPanel.jsx) · [Collection review](../../../REVIEW.md)

Search within the canvas. Filter options have their own search and share a type icon with result rows. The sample uses one icon per result, including images.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/standards.css`, `styles/review-corrections.css`, `styles/chat-panel.css`, `styles/library.css`, `styles/canvas-search.css`. Behavior: `scripts/canvas-search-filters.js`, `scripts/canvas-search.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/canvas-search-rows.html`, `templates/canvas-panel-header.html`, `templates/canvas-search-panel.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/PanelHeader.jsx](../../../../../packages/web/src/PanelHeader.jsx)
- [packages/web/src/CanvasSearchPanel.jsx](../../../../../packages/web/src/CanvasSearchPanel.jsx)
- [packages/web/src/canvas-search-index.js](../../../../../packages/web/src/canvas-search-index.js)
- [packages/web/src/canvas-search-panel.js](../../../../../packages/web/src/canvas-search-panel.js)
- [packages/web/src/use-canvas-search.jsx](../../../../../packages/web/src/use-canvas-search.jsx)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.
