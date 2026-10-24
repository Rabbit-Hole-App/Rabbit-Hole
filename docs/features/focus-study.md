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

## 5. Inventory (WP4)

Every renderer the canvas draws, audited on c4690f0b and against WP2 0752c73a and WP3 14d51846. Unsupported and deferred
kinds register no adapter (or, for CAD, are not imported), so they show no Focus control. Every block card is a `CanvasNode` host (`[data-block-id]`, AdaptiveCanvas.jsx) in the column's flex flow,
or inside a `[data-card-slot]` wrapper for a card layout; canvas items (notes, text, shapes) are absolutely placed
`[data-item-id]` elements outside the column.

**How a supported kind focuses** (`focus-host.js`, shared by the WP4 adapters). The host is restyled in place, never
moved or remounted, through the one `[data-focus-host]` rule in index.css (WP3) and its custom properties: `--focus-w`,
`--focus-h`, `--focus-transform` (`translate(...) scale(1 / view.z)` from `frameInWorld`: normal text size at any canvas
zoom) and `--focus-mb` (the height gained, given back, so the column keeps the card's entry footprint and no neighbour moves,
Finding 2). React's inline `width`, `height` and `transform` stay untouched and return on exit. The in-flow position
includes a card-layout slot's offset. While focused: a press on a drag zone does not start a move (nothing writes `dx` /
`dy` / `w` / `h`); the host carries `data-scroll`, so the canvas wheel scrolls the card instead of panning the board; a
direct `[data-scroll]` body takes the height and scrolls inside; the PDF and YouTube iframes take the pointer (they ignore
it until the card is selected, and `enterFocus` deselects); a card-layout slot rises with its card; a note gets the
surface token, a border and padding, and scrolls. Three placements: **fill** (the frame), **reading** (fill, at most 760 px
wide, centred) and **contain** (the picture or video at its own aspect ratio, as large as the frame allows with the card's
other rows, centred, never cropped; no picture yet: fill).

| Kind (`type` / file `kind`) | Renderer | Layout and scroll | Live state | Verdict |
|---|---|---|---|---|
| `pdf` | `PdfCard` (AdaptiveCanvas.jsx): the browser's own PDF viewer in an iframe (blob URL) | fixed height (`h` or 640), the viewer scrolls and zooms itself | page, scroll, zoom, text selection inside the viewer | **SUPPORTED** "Focus PDF", fill. The iframe is resized in place, so page, scroll, selection and the viewer's own page and zoom controls are kept; nothing is shrunk to fit vertically. The width fit is the viewer's own (Chrome and Edge re-fit width on resize at their default zoom); the native viewer cannot be scripted, and changing its URL to force `#view=FitH` would reload it and lose the page, so that is not done |
| `paper` | `PaperBody` > `LearnPaper.jsx` (pdf.js canvas and text layer) | fixed height, inner `overflow-auto` scroller; the page is `zoom x 100%` of the scroller's width | page (`block.paper.page`), scroll, zoom, highlights, text selection | **SUPPORTED** "Focus PDF", fill. At zoom 1 the page is exactly the available width (its own CSS), the text layer refits by its ResizeObserver, no re-render; the reader's page, zoom, Previous/Next and zoom buttons are kept |
| `slide` (a PDF page as an image) | `SlideCard` | `img w-full h-auto`, no scroll | none | **SUPPORTED** "Focus page", contain |
| `explanation` (and a PDF text excerpt) | `ExplanationBody` / `ExcerptBody` (LearningBlocks.jsx) | `[data-scroll]` body, `autoMax` 520 | open "more" sections, excerpt note being typed | **SUPPORTED** "Focus explanation", reading, internal scroll, normal text size |
| `animation` (learner-facing "Explanation", /explain scenes) | `AnimationBody` > `AnimatedScene.jsx` | frame is `flex-1`; the SVG viewBox follows the frame's own aspect (pads, never crops) | playback (play/pause, time), selection, practice | **SUPPORTED** "Focus explanation", fill; playback state is component state and survives the resize |
| `table` | `TableBody` | `[data-scroll]` body, `overflow-x-auto` table, sticky header | none | **SUPPORTED** "Focus table", fill (tables want the width), internal scroll both ways |
| `image` | `ImageBody` | `[data-scroll]`, `img w-full`, variants, caption, search row below | variant shown, search results, typed query, confirm | **SUPPORTED** "Focus image", contain |
| file `image`, `svg` (not an excerpt) | `FileCard` / `MediaCard.jsx` image and SVG previews | `img w-full`, `autoMax` 620 | none | **SUPPORTED** "Focus image", contain |
| `video` with `src` (Motion and other generated or hosted clips) | `VideoBody` | `[data-scroll]`, `<video w-full controls>` | playback position, play state, generation polling | **SUPPORTED** "Focus video", contain; the `<video>` is resized in place and keeps playing |
| `video` with `videoId` (YouTube moment) | `VideoCard` (AdaptiveCanvas.jsx) | fixed height, iframe `flex-1` (YouTube letterboxes) | playback in the cross-origin player | **SUPPORTED** "Focus video", fill; the iframe keeps its key, so playback continues |
| file `clip` (dropped video) | `MediaCard.jsx` video player | `<video>` | playback | **SUPPORTED** "Focus video", contain |
| `cad` | `CadCard.jsx` (`CadPreview`, three.js `three-d-renderer.js`) | fixed height, viewer `flex-1`, ResizeObserver resizes the renderer | camera, Interact (orbit) mode, dimensions toggle, edit state, generation polling | **DEFERRED**: `focus-adapter-cad.js` is ready (container fill, camera untouched, never calls Fit view) but not imported. `enterFocus` deselects the card, which ends CadPreview's Interact, and Interact, Fit view and Show dimensions live in the card's chrome row, which the shared rule hides, so a focused CAD model could not be orbited or framed. Needs WP2 to keep those tools in reach while focused (for example `CadViewerTools` in the Focus header for kind `cad`, and the card's view selection kept). Size: small in the seam, one import line here |
| file `model` (imported 3D model, point cloud, splat, CAD file) | `ModelCard.jsx` (same renderer) | fixed height, viewer `flex-1` | camera, Interact mode | **SUPPORTED** "Focus 3D model", fill; its Interact and Fit buttons are in its own header, in reach. An Interact running when Focus starts ends (deselection, ModelCard's own rule); Interact again inside Focus |
| `notebook` | `NotebookCard` / `NotebookCard.jsx` | iframe | kernel, cells, unsaved edits | WP3 (`focus-adapter-notebook.js`) |
| sticky and text items (notes; not code boxes) | `ItemView` (AdaptiveCanvas.jsx), RichText | absolute `[data-item-id]` in the items layer, a note grows with its words, no inner scroll | editing caret, typing | **SUPPORTED** "Focus note", reading, at its own text size, scrolling inside; editing while focused saves as usual. WP2's `enterFocus` and host lookup already resolve items |
| `model3d`, `scene` (Blender, when ready) | `ThreeDBody` (LearningBlocks.jsx) | viewer `flex-1`, ResizeObserver | camera, clip, play state | UNSUPPORTED for now (not in brief 3.2/3.3); the 3D model adapter's fill would work unchanged, a one-line follow-up |
| `scene` interactive activity | `SceneActivityBody` | fixed size | attempt state | UNSUPPORTED (not in the brief) |
| `wiki` | `WikiCard` > `LearnWiki.jsx` | `[data-scroll]` article | section, highlights, scroll | UNSUPPORTED (not in the brief); reading placement would work, follow-up |
| `webpage` | `WebpageCard.jsx` | captured tiles scrolled by a CSS transform | scroll, highlights, lock | UNSUPPORTED (not in the brief); its own transform scroll needs checking first |
| file document kinds (text, Markdown, table, workbook, Word, presentation) | `FileDocCard.jsx` | `[data-scroll]` bodies | slide index, scroll | UNSUPPORTED (not in the brief); reading or fill would work, follow-up |
| `repo-code` | `CodeCard.jsx` | `pre[data-scroll]` | scroll | UNSUPPORTED (not in the brief) |
| `repo-graph` | `GraphCard.jsx` | own graph viewport | pan, zoom, selection | UNSUPPORTED (not in the brief) |
| `graph` (Desmos / Plotly) | `GraphBody` | renderer in a fixed box | sliders, pan, zoom | UNSUPPORTED (not in the brief; third-party renderers need their own resize check) |
| `flow`, `mermaid`, `knowledge` | `FlowBody` (React Flow), `MermaidBody`, `KnowledgeBody` (RepositoryGraph) | fixed height, own viewport or `overflow-auto` | pan, zoom, selected node | UNSUPPORTED (not in the brief) |
| `whiteboard` | `WhiteboardBlock.jsx` (tldraw) | fixed height | tldraw camera, drawing | UNSUPPORTED (an embedded canvas inside the canvas; needs its own check) |
| `quiz`, `flashcards`, `challenge`, `code`, `snippet`, `audio` | `QuizBody`, `FlashcardsBody`, `ChallengeBody`, `CodeBody`, `SnippetBody`, `AudioBody` | `[data-scroll]` or auto height | choice, card side, typed answer, editor draft, audio playback | UNSUPPORTED (not in the brief; short practice cards that already fit) |
| chat exchanges | `ChatCard` | `[data-scroll]` answer | reply composer | UNSUPPORTED (not a block; not in the brief) |
| `heading`, `divider`, `canvas-ref`, file `attachment`, file `audio`, region excerpts (file with `excerpt`) | `HeadingCard`, `DividerCard`, `CanvasRefCard`, `FileCard` | auto height | heading text editing | UNSUPPORTED (structure, links and file stubs: nothing to enlarge; a region excerpt is a crop plus a note, not a picture to view) |
| code boxes, equations, sections, shapes, ink, connectors, groups, areas | AdaptiveCanvas items and SVG layers | absolute, world units | editing | UNSUPPORTED (drawn objects, not content cards) |

Follow-ups for the seam owner (WP2): a card in Full card layout (`data-card-layout="full"`) still pans the board on the wheel
while focused (the wheel handler's Full-layout exception); its body scrolls by scrollbar and keyboard. A press that selects
the focused card brings back its selection pill (a dropped image's and a slide's sit 40 px above the card, over the Focus
header).
