# Canvas Search

Use this handoff with [RABBIT-HOLE-NEW-UI.md](RABBIT-HOLE-NEW-UI.md). [Open the standalone reference](clean/62-canvas-search.html) or the [registered component](components/tutor/canvas-search/preview.html).

This handoff covers the Canvas Search reference and its component sources. The sidebar's account Library search has its own [SIDEBAR.md](SIDEBAR.md) contract.

## Latest owner corrections

Recorded on 2026-11-12.

- Remove the standalone `This canvas` caption beneath the search field. Keep the result count.
- Every result uses one type icon beside its title. Image results use the same Image glyph as the Image filter.
- Opening Filter keeps focus on the Filter button. The search field receives focus when the user enters it.
- Use the shared tooltip surface for header icons, Filter and match arrows. Keep keyboard focus indicators.
- A selected result keeps the same selected color through hover and press, until another result is selected or the query or filters change.
- Keep the Context / Files / Graph icon in the header with its tooltip. It is inactive in this Search reference. The separate companion viewer has a later review.

## Visible structure

The header contains Chat, Table of contents, Progress, Comments and Search, with the Context / Files / Graph icon, Pin and Close at the right. Search is selected. The viewer icon and other content tabs are labelled reference controls in this fixture.

Below the header, keep the Search this canvas field, Filter, Previous match and Next match on one row. Put the count below that row, followed by the scrolling result list. Code results include numbered source lines. Keep text sizes fixed while the panel width changes.

The filter opens a shared menu containing its own Search filters field, Content types / Sources / Other groups, checkbox rows, counts and Clear. The standalone reference lists all 30 options for icon review. App integration uses the existing availability rules from [canvas-search-panel.js](../../packages/web/src/canvas-search-panel.js).

## Exact component map

All UI paths below are relative to `docs/ui/`. Component IDs identify existing library entries. The Search templates compose these primitives.

| Visible part | Existing component and source | Search binding |
| --- | --- | --- |
| Panel shell and header | [Chat panel](components/tutor/chat-panel/markup.html), [chat-panel.css](styles/chat-panel.css), `.rh-chat-panel`, `.chat-nav`, `.chat-icon` | [Canvas Search markup](components/tutor/canvas-search/markup.html), [canvas-panel-header.html](templates/canvas-panel-header.html) |
| Search fields | [Text fields](components/controls/text-fields/markup.html), [standards.css](styles/standards.css) `.control`, [Library toolbar](templates/library-main.html) `.library-search` | [canvas-search-panel.html](templates/canvas-search-panel.html) `#canvas-query` and `#filter-query` |
| Filter button | [Buttons](components/controls/buttons/markup.html), `.button.secondary`, shared selected/hover/pressed/focus states | `#canvas-filter` and `#canvas-filter-label` in the Search panel template |
| Match navigation | [Icon toolbar](components/controls/icon-toolbar/markup.html), `.icon-button.quiet` | `#previous-match`, `#next-match`, shared ChevronDown glyph rotated for Previous |
| Filter menu and grouped rows | [Menu/popover](components/feedback/menu-popover/markup.html), `.menu`, `.menu-item`, `.menu-divider`, [Library menus](templates/library-menus.html) and [library.css](styles/library.css) | `#canvas-filter-menu`, [row templates](templates/canvas-search-rows.html), `.canvas-filter-menu` layout |
| Light outlined checkbox and blue checked state | [Range/switch/checkbox](components/controls/range-switch-checkbox/markup.html), [standards.css](styles/standards.css) `.checkbox > input[type="checkbox"]` | `#canvas-filter-row-template`, with a native checkbox, type glyph, label and count |
| Result rows and excerpts | Shared `.menu-item` and its `--button-*`, `--hover-*`, `--press-*` state tokens | [canvas-search-rows.html](templates/canvas-search-rows.html), [canvas-search.css](styles/canvas-search.css) `.canvas-search-result`, code and snippet layout |
| Type glyphs | [Card glyph sprite](icons/icons.svg), [standard sprite](icons/standards.svg) | One `typeIcons` map in [canvas-search.js](scripts/canvas-search.js) supplies both filter and result glyphs |
| Header, search and filter glyphs | [canvas-header.svg](icons/canvas-header.svg), [standards.svg](icons/standards.svg), [library.svg](icons/library.svg), with their license notices | References in the header and Search panel templates |
| Tooltips | [Tooltip](components/feedback/tooltip/markup.html), [standards.css](styles/standards.css) `.tooltip`, [review-corrections.css](styles/review-corrections.css), the hover/focus and 400 ms timing pattern in [sidebar.js](scripts/sidebar.js) | `#canvas-search-tooltip`, `data-tooltip-label`, `showTip` / `hideTip` in [canvas-search.js](scripts/canvas-search.js) |
| Scrolling and focus appearance | [Scroll region](components/layout/scroll-region/markup.html), [review-corrections.css](styles/review-corrections.css), shared `:focus-visible` rules in [standards.css](styles/standards.css) | `.canvas-search-results` and `.canvas-filter-options` scroll independently |
| Warm surfaces, ink and blue selection | [Palette roles](foundations/PALETTE.md), [tokens.json](foundations/tokens.json), [palette.css](foundations/palette.css) | Component metadata declares the shared palette role |
| Left edge resizing | The app's [ResizableSidePanel.jsx](../../packages/web/src/ResizableSidePanel.jsx) and the pointer/keyboard pattern in [sidebar.js](scripts/sidebar.js) | Standalone separator and width callback in [canvas-search.js](scripts/canvas-search.js). App integration uses ResizableSidePanel |

The component's full dependency lists are in [component.json](components/tutor/canvas-search/component.json). The stylesheet order is standards, review-corrections, chat-panel, library, canvas-search, then the shared palette overlay.

The existing Search composition has its own row layout, filter placement, result selection binding and tooltip positioning in `styles/canvas-search.css` and `scripts/canvas-search.js`. These are Search-specific adaptations. The field, checkbox, button, menu and tooltip surfaces come from the shared sources listed above. Review and extend the registered composition through these files.

## Interaction contract

- Search covers the current canvas's already accessible cards, notes, code, available document text and comments. The magnifier and `/` focus Search this canvas. An empty query browses the available content. Title and filename matches appear before body matches.
- Enter or Next selects the next result. Shift+Enter or Previous selects the previous one. The counter changes from `7 results` to `1 of 7` in the initial fixture. Clicking a result selects it, and one result remains selected through hover and press.
- Escape in the main query clears it. Changing the query or filters resets the active match.
- Filter opens without focusing its search field. Tab reaches the menu field because the menu follows the trigger in DOM order. ArrowDown on Filter opens the menu and focuses Search filters. Escape closes the menu and returns focus to Filter.
- Search filters matches menu labels. Typing in it preserves selected filters and the main query. Clear resets selected filters. Multiple checked categories are ORed.
- Filter counts are based on the current query before type filtering. Keep checked options reachable while the menu search narrows the displayed labels.
- Each filter and matching result gets its glyph from the same map. Images have the same title-row icon treatment as other types.
- Tooltips appear after 400 ms on hover or keyboard focus. They dismiss on pointer leave, blur, activation, Escape or viewport resizing. Each icon-only action keeps its accessible name.
- Pin toggles its pressed state in the fixture. Close hides the reference and exposes its reopen action. Left-edge dragging resizes the panel, with keyboard width controls on the separator.

The production callbacks must preserve the app's select-and-frame behavior, highlighted source locations, Back to previous view, comment navigation, saved filter state and access checks. The standalone selection callback demonstrates row and counter state.

## Separate companion viewer

The app uses a separate viewer panel. [LearnPage.jsx](../../packages/web/src/LearnPage.jsx) renders its `ResizableSidePanel` before the Chat/Search panel, so it sits to the left on wide layouts. [PanelHeader.jsx](../../packages/web/src/PanelHeader.jsx) supplies the companion toggle, `COMPANION_VIEWS` and `CompanionHeader`.

Context is available generally. Files and Graph are offered when the canvas has the corresponding repository views. One companion view is shown at a time. Below the wide layout breakpoint, the companion takes the main panel's place and offers Back to chat.

The owner has deferred this viewer's UI review. Keep its header icon and tooltip visible in the Search reference with `aria-disabled="true"`. Its panel-opening callback is deferred. Prepare the viewer's own component map and reference during that later task.

## App landmarks and demonstration boundaries

| Responsibility | Existing app entry |
| --- | --- |
| Main panel header and viewer toggle | [PanelHeader.jsx](../../packages/web/src/PanelHeader.jsx) |
| Search field, rows, actions and filter rendering | [CanvasSearchPanel.jsx](../../packages/web/src/CanvasSearchPanel.jsx) |
| Category definitions and filter availability | [canvas-search-panel.js](../../packages/web/src/canvas-search-panel.js) |
| Accessible content index, result metadata and ranking | [canvas-search-index.js](../../packages/web/src/canvas-search-index.js) |
| Query, selection, navigation and persistence wiring | [use-canvas-search.jsx](../../packages/web/src/use-canvas-search.jsx) |
| Main panel and separate companion composition | [LearnPage.jsx](../../packages/web/src/LearnPage.jsx), [ResizableSidePanel.jsx](../../packages/web/src/ResizableSidePanel.jsx) |

The preview starts with `cross entropy` and uses local sample rows and local navigation state. The complete app path includes existing loading, partial-content, retry, permissions and source actions. Inspect those handlers before integrating the visual reference.

## Maintenance and verification

Edit the component markup, the named templates, and the associated script/style sources. Regenerate previews through the shared include resolver and exporters. Update this handoff and its master-index row together.

From the repository root, use the existing workflow.

```sh
python3 docs/ui/scripts/build.py
python3 docs/ui/scripts/export_clean.py
python3 docs/ui/scripts/export_library.py
python3 docs/ui/scripts/check.py
```

Executed on 2026-11-12. The build generated 110 component previews, the clean exporter generated 60 standalone references, and the portable library bundled 84 specimens. Structural checks passed with zero errors across 59 JavaScript files. The 59 existing dynamic/host-ID warnings matched the preceding receipt.

The structural receipt is [verification/structural-check.json](verification/structural-check.json). Offline checks cover registered dependencies, embedded assets, SVG symbols, accessibility IDs and JavaScript syntax. Browser visual review and app integration verification remain pending.
