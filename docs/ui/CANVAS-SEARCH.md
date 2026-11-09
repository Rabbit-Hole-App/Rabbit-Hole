# Canvas Search

[Open the standalone preview](clean/62-canvas-search.html). It opens with `cross entropy` to show matching titles, highlighted excerpts, and numbered code lines. Clear the field to browse the canvas.

## Controls and states

- **Search this canvas** filters the current canvas. The header magnifier and `/` focus the field. The arrows move between matches, and the count changes from `7 results` to `1 of 7` when a match is selected.
- **Filter** opens the Content types, Sources, and Other groups. **Search filters** narrows the menu labels while preserving checked options and the main query. The menu shows counts and a Clear action. In the reference, all 30 options are visible for review. Keep the app's availability rules when integrating.
- The same type-to-icon map supplies each filter row and its result rows. Every result uses one type icon, including images.
- Escape closes the filter and returns focus to its trigger. The filter field and checkboxes are reachable by keyboard. The preview panel can be resized from its left edge.
- In the app, preserve canvas focus, highlights, Back to previous view, comment navigation, and the existing access rules.

## Component mapping

| Part | UI reference | App landmark |
| --- | --- | --- |
| Panel and navigation | [Panel markup](components/tutor/canvas-search/markup.html), [header template](templates/canvas-panel-header.html), [chat panel styles](styles/chat-panel.css) | [PanelHeader.jsx](../../packages/web/src/PanelHeader.jsx) |
| Search field and filter menu | [Search panel template](templates/canvas-search-panel.html), [shared search and menu styles](styles/library.css), [shared checkboxes](styles/standards.css) | [CanvasSearchPanel.jsx](../../packages/web/src/CanvasSearchPanel.jsx), [filter groups](../../packages/web/src/canvas-search-panel.js) |
| Result rows and type icons | [Row templates](templates/canvas-search-rows.html), [Search behavior and icon map](scripts/canvas-search.js), [card icons](icons/icons.svg), [standard icons](icons/standards.svg) | [Search index](../../packages/web/src/canvas-search-index.js), [navigation hook](../../packages/web/src/use-canvas-search.jsx) |

Reuse the shared [palette](foundations/palette.css) and the app's existing resizable panel. The standalone preview uses sample data and local navigation state. Its checks cover filter search, selection retention, all 30 icon mappings, matching and empty results, keyboard focus, and selection styling. Browser and app verification are pending.
