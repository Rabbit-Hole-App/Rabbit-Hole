# Focus and Study map defaults: shared interface

Owner brief 2026-10-24 (`C:/s/spec/focus-study/brief.md`, binding), parent task 61a13b25. This file is the contract that lanes
WP1 to WP5 build against. WP0 (43958f33) owns the three modules below; a lane that needs a change to them asks the
coordinator instead of making a local variant.

## 1. Modules (committed by WP0)

### `packages/web/src/widget-visibility.js`: the one visibility calculation

- `WIDGETS`: `['minimap', 'holeMap', 'curious', 'toolbar']`.
- `effectiveWidgets({ mode, canvas, study })` returns `{ minimap, holeMap, curious, toolbar }`: what is actually visible.
  `mode` is `'canvas'` or `'study'`; `canvas` is the Canvas preferences in force (AdaptiveCanvas state seeded from
  `ui-prefs.js`); `study` is the Study arrangement's `maps`. In Study a map is shown only with an explicit
  `study[name] === true`; with no Study choice both maps are hidden. Curious and the toolbar follow Canvas in both modes.
- `widgetToggle({ mode, name, on })` routes an explicit View > Show / hide toggle:
  `{ store: 'study', action: { type: 'setMap', name, on } }` (Study map, dispatch to the Study reducer) or
  `{ store: 'canvas', name, on }` (set the AdaptiveCanvas state and `saveUiPref`). `null` for an unknown name.
- Entering or leaving Study writes neither store; it only changes `mode`. Never implement Study entry with
  `showWidget(name, false)`.

### `packages/web/src/study-state.js`: Study map choices

- New field `maps: { minimap?: boolean, holeMap?: boolean }`, still `v: 1`. `defaultStudy().maps` is `{}`. `normalize`
  keeps only boolean `minimap` / `holeMap`; old arrangements without `maps`, and malformed `maps`, keep their pin, split
  and reader and read as `{}`.
- `STUDY_MAPS`: `['minimap', 'holeMap']`.
- Reducer action `setMap { name, on }`: records the explicit Study choice; anything else is ignored. `unpin` and
  `setMode` keep `maps` (the choice is remembered for the next Study visit on this canvas).
- Writes go through the existing `writeStudy`: blocked or memory-only storage keeps the choice for the page and reports
  Not saved (`useStudy` status), never Saved.

### `packages/web/src/focus-controller.js`: the one Focus controller

- State: `null`, or `{ id, kind, saved, frame }`. `saved` is exactly what `captureNavigation()` returns
  (`{ owner, view, selection, scroll }`); `frame` is the working rectangle in surface px. No card size or position.
- `focusReducer(state, action)`:
  - `enter { id, kind, saved, frame }`. Same id again: unchanged. Another id while focused: the new card, the first
    `saved` kept (Back to canvas returns to where Focus began).
  - `workspace-changed { frame }`: new frame, same card (panel opened, divider moved, window resized).
  - `exit`: Back to canvas, Escape, Study > Canvas.
  - `content-gone { id }`: the focused card was deleted or became inaccessible (`id` omitted: whatever is focused).
- When the state goes from a value to `null`, the host calls the adapter's `exit(host, ctx)` and then
  `restoreNavigation(exitNavigation(previous))`, once. When `id` changes, old adapter `exit`, then new adapter `enter`.
- `exitNavigation(state)`: `saved` minus scroll entries inside the focused card, so the reader's latest page and the
  notebook's scroll are never reverted to the entry snapshot.
- `focusSnapshot(state)`: `{ id, kind } | null`, for `onState`.
- `focusFrame({ pane, inset, narrow })`: `pane` (`{ left, top, width, height }`, surface px, chrome already removed)
  less the inset: 16 px desktop, 12 px narrow (`narrow` defaults to `pane.width < 640`, the canvas's phone breakpoint).
- `frameInWorld(frame, view)`: the frame in world units plus `scale: 1 / view.z`, so a host placed inside the
  transformed world layer fills the frame at normal text size.
- Adapters: `registerFocusAdapter({ kind, label, canFocus(block, ctx), enter(host, frame, ctx), update(host, frame, ctx), exit(host, ctx) })`
  into `focusAdapters` (a `Map` by kind). It throws without every hook or with "..." / "…" in `label`. `label` is the
  accessible name ("Focus notebook", "Focus PDF"). `host` is the card's existing element; hooks change only its temporary
  presentation, never its parent or the saved card. `ctx`: `{ view, readOnly }`.
- `adapterFor(block, ctx)` and `isFocusEligible(block, ctx)`: false when no adapter claims the block, so no Focus control
  ever shows that does nothing. WP0 registers none.
- `shouldExitOnEscape(event, { focusing, menuOpen, dialogOpen, gesture, viewerActive })`: true only for an unclaimed
  Escape: not `defaultPrevented`, not in an input, textarea, select, iframe, contenteditable or textbox, not inside a
  menu, dialog, listbox or active viewer, and not while the canvas reports one of those open.

**Presentation state only.** Entering or leaving Focus writes no board geometry, adds no undo entry (`snapshot()` is never
called for it), makes no model call and charges no credit. It is local to this page and never changes another viewer's
layout. Real content edits made while focused save as they do today. Read-only viewers may focus; permissions are unchanged.

## 2. Integration seam

AdaptiveCanvas (WP2, lands first):

- `useReducer(focusReducer, null)`; apiRef commands `enterFocus(id)` (looks up the block, `adapterFor`, captures
  navigation, measures the frame, dispatches `enter`; returns false when not eligible), `exitFocus()` and
  `focusState()`. `onState` gains `focus: focusSnapshot(state)`.
- `ctx.canvas.focus(id)` and `ctx.canvas.focusable(object)` for the right-click row; the card toolbar button calls the
  same `enterFocus`. The toolbar button, the right-click row, the keyboard and Study > Notebook all call these commands;
  none keeps its own Focus state or sizing.
- Escape: in the canvas keydown handler, before the read-only branch, `if (shouldExitOnEscape(event, ctx)) exitFocus()`.
- Workspace: a ResizeObserver on the surface (it resizes when a panel opens and when StudyPane changes the frame's
  margins) and the header/bottom-chrome measurements (`--canvas-top`, `chromeTop`) dispatch `workspace-changed`;
  the adapter's `update` runs on each new frame. Blocks list changes dispatch `content-gone` when the focused id is gone.

LearnPage and StudyPane:

- Study map choices: AdaptiveCanvas takes one new prop `study` (LearnPage passes the `useStudy` object; shared canvases
  pass none, so Canvas mode). Inside, the Canvas-preference state is renamed (for example `minimapPref`) and the old
  names are recomputed with `effectiveWidgets`, so the render (`minimap &&`, the `hidden` class on the Rabbit Hole Map),
  the footprint measurements and `onState` (the View menu checkmarks) all read the effective values with no further
  edits. `showWidget` routes through `widgetToggle`; Study toggles call a new `study.setMap(name, on)` in `useStudy`.
  The prop is present on the first render, so a restored Study arrangement never flashes the maps.
- Study > Notebook calls `canvas.enterFocus(notebookId)` and Study > Canvas calls `canvas.exitFocus()` (the same
  expanded view, no second resize). The controller then holds the saved navigation, so `useStudy`'s own `nav` capture
  for the notebook path goes away.

## 3. File ownership

| Lane | Owns | Notes |
|---|---|---|
| WP0 | `widget-visibility.js`, `focus-controller.js`, `study-state.js` (maps), their tests, this doc sections 1 to 3 | Contract changes go through the coordinator |
| WP1 Study map defaults | AdaptiveCanvas.jsx widget block (currently lines 1878-1888) and the one props line (`study = null`); StudyPane.jsx `useStudy` `setMap`; LearnPage.jsx the `<AdaptiveCanvas` element (passes `study`); `ui-prefs.js` (Finding 3) | Does not touch the `onState` line or the canvas-menus.js rows: the checkmarks already read `onState` |
| WP2 Focus chrome | The AdaptiveCanvas seam above (focus reducer beside `focusBlock`, apiRef commands, the `onState` line, the Escape lines, `ctx.canvas` rows, one mount line for the chrome); new `FocusFrame.jsx` (title left, "Back to canvas" right, existing tokens, reduced motion); new `focus-adapters.js` (one side-effect import per adapter, imported once by AdaptiveCanvas); `canvas-actions-types.js` Focus row; `SelectionActions.jsx` Focus button | Lands first; WP1 rebases onto it. No View-menu Focus row (brief 2.1 lists toolbar, right-click and keyboard); canvas-menus.js stays untouched unless the coordinator asks |
| WP3 Notebook adapter | New `focus-adapter-notebook.js`; `NotebookCard.jsx` temporary sizing only; StudyPane.jsx `showNotebook`, `showCanvas`, `reframe` (switch to `enterFocus` / `exitFocus`); one import line in `focus-adapters.js` | Iframe rule below |
| WP4 Other adapters | One `focus-adapter-<kind>.js` per supported kind; one import line each in `focus-adapters.js`; the inventory in section 5 | The renderer files it sizes (for example `CadCard.jsx`, `ModelCard.jsx`) only for temporary sizing |
| WP5 Validation | `packages/web/e2e` checks (extend `pinned-study-kernel-check.mjs`, `pinned-study-check.mjs`) and `scripts/ci/check-map.json` | Runs through approved CI only |

Prefer new files over AdaptiveCanvas.jsx edits. Two lanes appending to `focus-adapters.js` is the only expected
overlap; the integrator resolves it.

## 4. Notebook iframe rule

The notebook card's iframe must keep its DOM parent and instance: moving an iframe to another parent reloads it and
restarts Python. Focus therefore never portals, clones or remounts the notebook. It restyles the existing host in place
(position and size from `frameInWorld`, a `scale(1 / view.z)` counter-scale so editor text stays readable) and lets the
notebook scroll its own cells. CSS changes on the host or its ancestors are safe; a React key change, a moved subtree or
a conditional wrapper around the card is not. StudyPane already follows this rule (it only sets the frame's margins).

WP3 (`focus-adapter-notebook.js`): `enter` sets `data-focus-host` and four custom properties (`--focus-w`, `--focus-h`,
`--focus-mb`, `--focus-transform`) on the `[data-block-id]` host; the `[data-focus-host]` rule in `index.css` applies them with
`!important` (React keeps writing the inline width, height and transform) and hides the drag strip, selection row, ports and
resize corner. The host stays in the column's flow at its old height (`margin-bottom` returns the difference), so no other
card reflows (Finding 2), and `transform: translate(...) scale(1 / view.z)` from its untransformed `offsetLeft` /
`offsetTop` places it on the frame. A press on a drag zone is stopped while focused (a drag would save a position). `exit`
removes the attribute, the properties and the guard. The rule is generic: another adapter may reuse it. Study > Notebook
calls `enterFocus`, Study > Canvas `exitFocus`; when Focus ends elsewhere (Back to canvas, Escape) the switch follows
`onState().focus` back to Canvas. Kernel coverage: `pinned-study-kernel-check.mjs` steps 5a to 5c.

## 5. Inventory (WP4 TODO)

WP4 lists every card renderer with: kind, file, Focus behavior (brief 3.2 and 3.3), or "unsupported" with the reason.
Unsupported kinds register no adapter, so they show no Focus control. Start from the `type` values in
`canvas-actions-types.js` and `LearningBlocks.jsx`: PDF, Explanation, note and sticky, table, image, Motion, CAD and
model, webpage, video, code, quiz and the rest. CAD keeps its own 3D "Fit view" distinct from container Focus.

## 6. Findings (code against the brief)

1. Map footprint. Both maps already release it when hidden, and the release reads AdaptiveCanvas's `minimap` /
   `holeMap` state: the minimap unmounts (`{minimap && ...}` in the bottom strip, so `chromeTop` and `--chrome-left`
   shrink), and the Rabbit Hole Map stays mounted under `display: none` in the floating tools gutter (state kept, brief
   4.5). Hence the seam in section 2 feeds those same names, rather than adding a second hide path.
2. The world layer is `translate(view.x, view.y) scale(view.z)` and card hosts flow inside a column (`measureNow` reads
   `offsetLeft` / `offsetTop`). A focused host taken out of flow would let its neighbours reflow and change the measured
   bounds. WP2 must keep the slot's footprint while the host is focused, and confirm that a bounds change from Focus
   reaches no board save.
3. `ui-prefs.js` lists `toolbar` in `UI_PREF_DEFAULTS` but not in `VALID`, so `saveUiPref('toolbar', ...)` throws
   "Unknown toolbar" (caught silently by `showWidget`) and View > Show / hide > Toolbar is never remembered across a reload.
   This predates this work; WP1 owns the one-line fix and its test.
4. `captureNavigation` records scroll positions inside every card, the focused one included. Restoring them as they are
   would revert the reader's latest page (brief 2.4); `exitNavigation` drops the focused card's entries.
