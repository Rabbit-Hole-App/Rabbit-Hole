# tldraw removal

Ledger task `19e561b2-04b6-46bf-bc3b-2e6bb3f834ec`. **Owner decision 2026-10-26 (typed twice): remove tldraw completely.**
Done means the replacement works in production and tldraw is gone from source, manifests, lockfile, bundles, CSS, assets,
network requests, environment and build guards; dead-code cleanup alone is not done. The owner approved D1 to D4 (option A
each, see "Owner decisions"); the licence expiry no longer blocks implementation. Branches: `feat/tldraw-removal` (S1),
`feat/tldraw-removal-s2` (S2), `feat/tldraw-removal-contract` (the data contract below). This document is the inventory, the
data contract, the migration rule, the workstreams and the validation plan. S1 and S2 are built; the contract is committed
by `feat/tldraw-removal-contract`; the editor, migration, Tutor and cutover work is not started.

## Why (the license, read from the package)

`tldraw` 5.4.2 is under the tldraw license (`node_modules/tldraw/LICENSE.md` links to
`https://github.com/tldraw/tldraw/blob/main/LICENSE.md`; text read at tag v4.0.0 and main). Its terms:

- No use in a Production Environment (any deployment serving end users) unless tldraw issues a trial or a commercial
  license key; the key controls functionality and usage restrictions.
- Not to disable, change or interfere with License Key enforcement; the SDK may "collect and transmit usage data to tldraw
  for license compliance purposes".
- `@tldraw/tlschema`, `store`, `state`, `state-react`, `utils`, `validate` are MIT (`package.json` of each); `tldraw`,
  `@tldraw/editor` and `@tldraw/driver` are not.

Versions read: v2.4.6 is non-commercial only; v3.15.6 allows commercial use but forbids removing the watermark or the key
check; v4.0.0 and later need a key in production. `@tldraw/tldraw` v1 (1.29.2) is MIT on the npm registry. Whether a
downgrade to v1 could read or write today's v5 snapshots, and the cost of maintaining an old engine, is a separate
engineering question that this task does not pursue: the owner's direction is to remove tldraw, not to swap its version,
and not to buy a licence.

**Licence expiry (D0): not established.** No record exists in the repository, the docs or the notes. Only the owner can
retrieve it: the tldraw account or the licence page `https://tldraw.dev/community/license`, or the purchase email. The key
lives as `TLDRAW_LICENSE_KEY` in the root `.env` (mapped to `VITE_TLDRAW_LICENSE_KEY` at build) and as a GitHub secret
named `VITE_TLDRAW_LICENSE_KEY`. Nobody should read or decode the value; the date is on the vendor side.

Today the key is `VITE_TLDRAW_LICENSE_KEY` (names only here): required by `scripts/prod-release.mjs:227-229` and
`scripts/dev-deploy.mjs:459-460`, read from GitHub secret `VITE_TLDRAW_LICENSE_KEY` by `.github/workflows/deploy-dev.yml:56`
and `deploy-prod.yml:48`, set to `verify-only` by `verify.yml:58`, and compiled into the client bundle through
`import.meta.env`. A dev e2e route allows `cdn.tldraw.com` for tldraw's icons, fonts and translations
(`e2e/coaching.preview.js:25`), so a running board also fetches from that CDN.

## Inventory

Counts differ from the audit note ("imported in 20 src files"): `packages/web/src` has **11 files that import tldraw**
(14 import lines). 12 more src files and 4 e2e files only mention it in comments or selectors.

### What is live

| Surface | What the learner sees | Code |
|---|---|---|
| Whiteboard card | `/whiteboard`, Insert > More > Whiteboard, a Tutor `create_material` whiteboard; a full tldraw editor (all default tools) in a canvas card; Ask about selection; the Tutor draws its answer onto the board; narration | `WhiteboardBlock.jsx` (lazy, `LearningBlocks.jsx:25`, prewarmed `learn-warmup.js:37`), `learn-board-renderer.js`, `sigmoid-board.js`, `learn-shape-utils.js` |

### Everything that imports tldraw

| File:line | tldraw API used | Product feature | Reachable now | Risk |
|---|---|---|---|---|
| `WhiteboardBlock.jsx:2,12,147` | `Tldraw` (props `onMount`, `shapeUtils`, `components`, `licenseKey`), `getSnapshot`, `loadSnapshot`, `Box`; editor: `store.listen`, `sideEffects.registerAfterCreateHandler`, `createShapes`, `updateShape`, `deleteShapes`, `getCurrentPageShapes`, `getShapePageBounds`, `screenToPage`; `tldraw.css` | Whiteboard card: draw, save in the block, Ask selection, remove tutor drawing | Yes, live | High |
| `learn-board-renderer.js:1` | `createShapeId`, `toRichText`, `AssetRecordType`, `Box`, `compressLegacySegments`; editor: camera, `createShape`, `createAssets`, `getShapePageBounds`, `setCamera` with animation | The Tutor's answer drawn onto the board: text, equation, code, diagram (geo + arrows), image + annotations, plus proposals for video, scene, 3D, graph | Yes, via `WhiteboardBlock.jsx:97` | High |
| `sigmoid-board.js:1` | `createShapeId`, `toRichText`, `compressLegacySegments` | The seeded "sigmoid, drawn" demo board (`LearningBlocks.jsx:597`, `demo: 'sigmoid'`) | Yes, via `WhiteboardBlock.jsx:111` | Medium |
| `learn-shape-utils.js` -> `ThreeDShape.jsx:2`, `InteractiveGraphShape.jsx:2`, `LearnVideoShape.jsx:1` | `BaseBoxShapeUtil`, `HTMLContainer`, `T`, `useValue`; editor `select`, `markEventAsHandled`, `getContainer` | Three custom shape types (`three-d-viewer`, `interactive-graph`, `learn-video-pending`) that only exist inside a whiteboard snapshot | Yes, inside a board; `learn-video-pending` and the others are created by `drawExplanation` | Medium |
| `LearnNotes.jsx:3,7` | `Tldraw` (`hideUi`, `snapshot`), `TldrawImage`; editor tools, `undo`, `zoomToFit`, `store.listen` | "My notes": annotate a lesson slide | **No.** Rendered only when `learningView === 'notes'` (`LearnPage.jsx:2397`); nothing sets that value (`setLearningView` is only called with `lesson`, `notebook`, `practice`, `curriculum`) | Low |
| `LearnCanvas.jsx:1,3` | `Tldraw` with all chrome hidden | The old lesson canvas | **No.** No file imports it (only `scripts/ci/check-map.json` names it) | None |
| `learn-graph-storage.js:2` | `PageRecordType`; editor store, pages, camera | Saves graph and 3D shapes of the lesson canvas in IndexedDB `small-learn-graphs` | **No.** Called only when `editor` is set | None |
| `learn-video-canvas.js:1` | `AssetRecordType`, `PageRecordType`, `createShapeId`; editor store, assets, shapes | Places saved video and scene jobs on the lesson canvas | **No.** Same | None |
| `sigmoid-demo.js:4` | `Box`, `PageRecordType`, `createShapeId`, `getIndices`, `toRichText` | The animated lesson player (`playSigmoid`) | **No.** Same | None |

Why the last five are dead: `LearnPage.jsx:348` is `const [editor, setEditor] = useState(null)` and `setEditor` is never
called, so `editor` is always `null`. Every block that needs it is guarded (`if (!editor) return`, `LearnPage.jsx:1778,
1788,1907`). Those blocks are dead code: `LearnPage.jsx:1754,1769,1778-1798,1805-1838,1851,1887,1902-1920,1933-1953,
1989-1993,2203-2211,2350,2377` plus `canvas-preview.js`, `sigmoid-context.js` (`captureSelection`, `selectionSnapshot`) and
`region-targets.js`. `learn-notes-view.test.mjs` already says "the parked tldraw player".

Not tldraw, and not part of this task: `AdaptiveCanvas.jsx` ("a plain React surface (no tldraw)", `:120`), the Explain
Back sketch (`explain-sketch.js`, `block.sketch`), `AnimatedScene.jsx`, `animation-scene.js`.

### Other coupling to remove or keep

- Build and release: the three workflow lines and two script guards above; `scripts/prod-release.test.mjs:274` only asserts
  that the Release step does not mention the key, and keeps holding.
- `package.json` and `package-lock.json` are in `scripts/ci/check-map.json` "broad", so removing the dependency selects
  every browser check. `tldraw` pulls `@tiptap/*`, `idb`, `lz-string`, `radix-ui`, `classnames`, `@tldraw/*` (read from the
  package manifests); BlockNote shares `@tiptap/*`, so the lockfile shrinks by less than tldraw's own size.
- `index.css:728` (`.learn-canvas.tools-hidden .tlui-toolbar`), `check-map.json` entries for `LearnCanvas.jsx`,
  `LearnNotes.jsx`, `Whiteboard*.jsx`, `learn-shape-*.js`, `canvas-preview.js`.
- Stable seams that do not change: `board-ask.js` (`registerBoardAsk(id, { shapesIn, explain })`), `area-crop.js`
  (`binding.shapes = [{ id, type, text, author }]`), the server (`control-plane/src/learn-context.js` validates a lesson
  snapshot; a whiteboard sends `target: null`, so nothing about tldraw shapes reaches the server), narration, `marked`,
  `toolsHidden`, `tooLarge`.
- `@excalidraw/excalidraw` is a `packages/web` dependency that no src file imports (only comments mention Excalidraw).
  Noted, not touched here.
- Bundle weight today (measured: `vite build` of this branch, `VITE_TLDRAW_LICENSE_KEY=verify-only`): chunk
  `dist-esm-*.js` 1,337.7 kB (392.6 kB gzip) plus `tldraw-*.css` 77.2 kB (14.5 kB gzip), `tldraw-*.js` 13.1 kB,
  `WhiteboardBlock` 10.5 kB, `LearnNotes` 7.0 kB. Only the whiteboard and the dead modules import that chunk statically;
  the canvas page lists it in its preload map only, so the cost lands when a whiteboard card opens.

## Data: where tldraw snapshots live, exactly

No production data was read. Everything below is from code and from tldraw's own schema source.

| # | Format | Written by | Stored where | Size and limits |
|---|---|---|---|---|
| P1 | **Editor snapshot** `getSnapshot(store)` = `{ document: { store: { <id>: record }, schema: { schemaVersion: 2, sequences } }, session: { version, currentPageId, pageStates[{ pageId, camera, selectedShapeIds, focusedGroupId }], isFocusMode, isGridMode, ... } }`, in the whiteboard block as `block.snapshot`, next to `title`, `narration`, `demo`, `marked`, `toolsHidden`, `tooLarge` | `WhiteboardBlock.jsx:123-128`, debounced 700 ms on any user document change | Browser `localStorage` key `small.adaptive-canvas:<org>:<email>:<canvas>:ink` (cache); server D1 `LEARN_DB` table `learn_boards.state_json` (the main board of every owner is pushed, `LearnPage.jsx:1586-1588`; a named board only when shared) and every copy of it: share, fork, publication, recovery copies. No R2 object holds a snapshot | Block saves only while `JSON.stringify(snapshot).length <= 400000`, else `tooLarge`; whole board `<= 1,900,000` (`learn-boards.js:34`), warning at 85% |
| P2 | **Document-only snapshot** `{ document: { store, schema } }` filtered to one page, shapes locked for a slide | `learn-notes.js captureNotePage` | Browser IndexedDB `small-learn-notes`, store `notes`, key `[scope, id]` with `scope = JSON [email, org, app]`; record fields `id, kind (slide or note), lessonId, sectionIndex, courseTitle, lessonTitle, lessonOrder, sectionTitle, description, timeline, frame, pageId, createdAt, updatedAt, snapshot`. Never on the server | Unbounded |
| P3 | **Shape-record list** `{ records: [{ shape, page: { name, meta, key } }], camera, page }` (older value: the bare array) | `learn-graph-storage.js persistGraphs` | Browser IndexedDB `small-learn-graphs`, store `canvases`, key `JSON [email, org, app]` | Writer is dead code; whatever exists was written before the editor was parked |

So: **three persisted formats, two of them whole-store snapshots** (P1 with a session, P2 without), one record list (P3, no
longer written). Inside P1 and P2 the records are tldraw 5.x records. The package has been `^5.4.2` since it was first added
(`git log`, 2026-09-17), so every stored snapshot was written by a 5.x schema. That leaves these record kinds to read
(fixture-covered): `document`, `page`, `shape`, `asset`, `binding` (arrow to shape).

Shape records and their data, by `type`: `draw` and `highlight` (segments: base64 delta paths, first point Float32, then
Float16 deltas, `dim` 2 or 3; older records may carry a `points` array), `geo` (rectangle, ellipse, triangle, diamond,
hexagon, star, others; rich-text label), `text` (TipTap rich text), `note`, `arrow` (start, end, bend, heads, label,
bindings), `line`, `frame`, `group`, `image`, `video`, `embed`, `bookmark`, and the app's `three-d-viewer`,
`interactive-graph`, `learn-video-pending`. Every shape may carry `meta`: `author` (`learner`, `lesson`, `assistant`,
`tutor`) plus the Tutor's `explanationId`, `objectId`, `label`, `originalText`, `kind`, `renderStatus`, `runId`, `lessonId`,
`relatedObjectIds` and the operation fields (`videoOperation`, `sceneOperation`, `graphOperation`, `threeDOperation`,
`concept`, `description`, `paper`). The migration keeps `meta`.

The Explain Back sketch is **not** a tldraw snapshot: it is our own model `block.sketch = { strokes, shapes, items }`
(`explain-sketch.js`, `docs/features/explain-back-sketch.md`). The memory note "the whiteboard tldraw snapshot and the
Explain Back sketch inside `:ink`" is right about where they live, wrong to suggest they share a format.

How many whiteboards exist in production is unknown. The owner can count them with a read-only query (see "Owner commands").

## Risk ranking

1. **The whiteboard editor itself** (`WhiteboardBlock.jsx`): the only live user surface; losing the toolset, pan and zoom, or
   the tutor draw-back is visible. Largest piece of work.
2. **Existing-board migration**: a wrong conversion looks like lost work. Mitigated by the rule below (never destroy, derived
   copy, fallback picture), but it is the correctness risk that matters most.
3. **`learn-board-renderer.js`** (171 lines of editor API: shapes, bounds, camera animation, assets, rich text). Rewrite, not port.
4. **CI churn**: only `e2e/chat-block-check.mjs:758-840` drives the editor (`.tl-canvas`, `.tl-shape`, `.tlui-toolbar`, tool key
   `d`); the lockfile change selects all checks.
5. **Notes data** (P2/P3): unreachable, so no user impact today; the question is only what to do with data already in IndexedDB.
6. **Build guards and workflows**: trivial code, but removing the guard before the last import ships a key-less build that
   still imports tldraw. Ordered last; the workflow files need the owner's `!` push.
7. **Dead modules** (`LearnCanvas`, `learn-graph-storage`, `learn-video-canvas`, `sigmoid-demo`, editor wiring in `LearnPage`):
   no user can reach them; lowest risk, and they remove 4 of the 11 importers.

## Replacement options (licences read, sizes measured or read from the registry)

| Option | Licence (read) | Size | Fit |
|---|---|---|---|
| **A. Our own primitives**: the canvas already stores `strokes`, `shapes` (`rect, ellipse, triangle, diamond, hexagon, star, line, arrow, curve, elbow`, with `x1 y1 x2 y2`, `text`, `label`), `items` (`text`, `sticky`) and the Explain Back card already draws them inside a card through the canvas's own gesture code (`SketchHost`, `LearningBlocks.jsx:51,921`; `AdaptiveCanvas.jsx:1728-1738,3175-3200,3657-3692,4555-4582`) | ours | no new bytes; removes the 392.6 kB gzip chunk and 14.5 kB gzip css | Matches the product's existing tools; no infinite pan or zoom inside a card; no embedded media inside a board |
| B. `@excalidraw/excalidraw` 0.18.1 | MIT (`LICENSE` at github.com/excalidraw/excalidraw, package.json `license: MIT`) | 46.8 MB unpacked on npm (tldraw 14.9 MB), bundle not measured | Full editor, but our three custom shapes and the `meta.author` model do not fit; second editor look and feel; already a dependency nobody imports |
| C. Konva 10.9.0 / react-konva 19.3.2 | MIT | 1.9 MB / 0.1 MB unpacked | A rendering engine; we would write every tool, duplicating the canvas we have |
| D. Fabric 7.4.0 | MIT | 22.2 MB unpacked | Same as C, heavier |
| E. Buy a tldraw license | tldraw license, commercial agreement (price not in the license; contact `sales@tldraw.com`) | unchanged | Zero migration, but keeps the key, the CDN fetch and the usage reporting, and contradicts the requirement |
| F. Retire the whiteboard card | n/a | removes it | Smallest, but removes a shipped feature |

`perfect-freehand` (MIT) and `roughjs` (MIT) are in `node_modules` only as transitive dependencies of Excalidraw and Mermaid;
nothing in `src` imports them.

**Approved: A** (owner, 2026-10-26), in slices, with the S1 reader as the safety net for every existing snapshot. It reuses code that
already ships and is tested, adds no dependency, and is the only option that removes the license, the CDN fetch and the
usage reporting together.

## Migration rule (existing whiteboards and sketches keep working)

Owner rules 2026-10-26, as built into the contract below:

1. **Keep the original.** `block.snapshot` (P1) and the IndexedDB records (P2, P3) are never rewritten, trimmed or deleted by
   any slice, and no database is cleared. Nothing runs against production data.
2. **Derive in memory on open.** A block with a `snapshot` and no saved `sketch` is converted when it is opened, in the
   browser, by a pure converter built on `src/legacy-whiteboard.js`; the result is shown at once. Deriving calls no save.
3. **Persist only on an authorized edit.** The converted representation is written to `block.sketch` (with `sketchFrom`, see
   below) by the first edit made by someone who may edit (`mayPersist`). A shared read-only viewer, a guest without a copy
   and a fork preview never trigger a write; reopening an unedited board is byte-identical to what was stored, and repeated
   opens derive the same ids, so nothing duplicates.
4. **Unsupported objects stay visible and recoverable.** Images, embeds, bookmarks, video, the three app shapes, groups'
   relationships and any record the converter has no counterpart for stay in the retained `snapshot`. The editor lists them
   as "kept from the original board" with their positions, shows them in a read-only layer drawn from the S1 SVG, and says
   plainly that they cannot be edited in the new editor and that the picture is approximate: the SVG is a preview, not a
   proof of fidelity. The original JSON stays downloadable from the card.
5. **Both representations count toward the limits, and the original is never deleted to fit a save.** `saveVerdict`
   (contract) counts the sketch against the 400,000-character block cap and the whole board against 1.9 MB. A sketch that
   does not fit stays in memory with `tooLarge`, as an over-size tldraw board did, and the editor says so; there is no code
   path that removes `snapshot`. Dropping originals after a retention period is a separate owner decision, not in scope.
6. **Edits made in the new editor stay recoverable after a rollback to a tldraw build**, see "Rollback".
7. **Notes (P2) and graphs (P3)** stay in IndexedDB untouched; the unreachable Notes view and its dead code are removed.

### Workstream B: the converter, as built

Code: `src/legacy-to-sketch.js` (`convertLegacy`, `deriveSketch`, `saveNotice`), tests `legacy-to-sketch.test.mjs` (22), fixtures
`src/__fixtures__/tldraw/` (`generate-more.mjs` wrote `arrows-groups`, `assets-images`, `sigmoid-board`, `metadata-unknown`,
`near-cap` with tldraw 5.4.2's own schema and store; the unknown shape and record in `metadata-unknown` were added after
validation on purpose). The S1 reader gained four small things the converter needs: `route` on arrows, `bound` (which shape an
end is glued to and whether the anchor is precise), `scale` on strokes, and exports of its metrics and matrix helpers.

`deriveSketch(block)` returns `{ sketch, status, derived, kept, approx, warnings, report }` and never mutates or writes. A saved
`block.sketch` always wins (an emptied sketch stays empty); only a block with no saved sketch is derived. It reads the editor
snapshot, a document-only snapshot (a saved note) and a bare store snapshot; anything else gives an empty sketch, a warning and
the snapshot untouched. P3 (the graph record list) is not converted: its shapes are the app's graph and 3D shapes, which stay in
the snapshot anyway (`ponytail:`).

Ids: a converted mark's `id` is its tldraw shape id (`shape:xyz`); a frame's title item is `shape:xyz#name`. Ids come from the
snapshot alone, so every open, reload, share and fork yields the same ids. Mark fields added beyond the contract list, all
optional: `approx` (a comma-separated reason, set only when the mark departs from the original), `legacyRotation` (radians, only
when a rotation could not be kept), and the canvas's own style fields (`fill`, `fillOpacity`, `dash`, `fontSize`, `font`, `align`,
`valign`, `textColor`, `startHead`, `endHead`, `opacity`).

Approximation rules (also in the module header; each one is a test):

| Original | Becomes | `approx` |
|---|---|---|
| stroke, line, arrow ends under any rotation or group transform | exact points | none |
| rect, ellipse, diamond turned a quarter turn; hexagon a half turn | exact (width and height swap) | none |
| any other rotated box, note or text | upright, same size, at the rotated centre; `legacyRotation` kept | `rotation` |
| frame | a rect plus a title item; children keep page positions, nothing clipped | `frame`, `frame title` |
| group | no mark; members carry `legacyGroup` (innermost group; deeper nesting stays in the snapshot) | none |
| arrow glued to a shape, imprecise anchor | free arrow ending on the shape's outline on the line toward the other end, as tldraw drew it | `glued end freed` |
| arrow glued with a precise anchor | free arrow at that point | `glued end freed` |
| arrow with a bend | `curve` (ends and heads swap when needed so it bows to the same side); the canvas curve has one fixed bend | `curve bend` when the bend differs by more than 20 percent |
| elbow route | `elbow` between the ends | `elbow route` |
| diamond, square, inverted heads | dot, dot, triangle | `arrowhead` |
| line of more than two points | a pen stroke | `line drawn as a stroke`; a spline adds `spline` |
| highlighter not yellow | the canvas highlighter (always yellow) | `highlighter colour` |
| closed pen shape with a fill | an outlined path, no fill | `fill` |
| geo kinds beyond the ten | the nearest kind | `<geo> drawn as <kind>` |
| pattern or lined fill | a 20 percent tint | `pattern fill` |
| locked shape | editable mark | `lock not kept` |
| semi fill (the page colour) | no fill (the box becomes see-through) | none (a style difference, listed here) |
| rich text formatting, the hand-drawn font, pressure | plain text, the canvas default font, uniform width | none (listed under "Capabilities lost") |

Stays only in the snapshot and is listed in `kept` with a page box: image, video, embed, bookmark, the three app shapes,
every unknown shape type. Reported but not listed: shapes on other pages (`report.otherPages`), records of unknown types
(`report.unknownRecords`), shapes with nothing to draw (`report.skipped`). z-order is kept within strokes, shapes and items
but not across them.

**Size.** tldraw stores a point in 8 base64 characters; the sketch stores it as JSON, about 23. The exact conversion of the
`near-cap` fixture (snapshot 393,906 characters, the most the tldraw block would save) is 955,097 characters, 2.4 times the
snapshot and over the 400,000 cap, so a faithful copy of a dense board could never be saved. `convertLegacy` therefore thins
strokes (Ramer-Douglas-Peucker at 0.25, 0.5, 1, then 2 px, first rung that fits) until the sketch is at most 300,000
characters, three quarters of the cap, leaving room to edit. The same snapshot always thins the same way; the fixture
converts to 201,705 characters at 0.25 px. Thinning under 1 px is not visible and is not flagged; 1 px and up is flagged
`simplified` on each stroke. The snapshot keeps every original point either way. Both representations count: the block then
holds up to 394k (snapshot) plus 201k (sketch), and the whole board is still checked against 1,900,000.

**Decision table** (`saveVerdict` plus `saveNotice`; every row is a test; no row deletes the snapshot):

| Situation | Verdict | Learner sees | Saved |
|---|---|---|---|
| sketch and board fit | `ok` | nothing | sketch, `sketchFrom`, snapshot untouched |
| board at 85 percent or more | `ok`, `warn` | "This canvas is close to its size limit." | as above |
| sketch alone over 400,000 | `sketch-too-large` | "This drawing is too large to save beside the original board. Nothing was deleted: the original board is still saved as it was. Your changes stay on screen until you leave this page. Use Download my drawing to keep them." | nothing; sketch in memory, `tooLarge` |
| sketch fits, board over 1,900,000 with both retained | `board-too-large` | "This canvas is full, so this change cannot be saved." plus the same two sentences about the original and the download | nothing |
| both do not fit | `sketch-too-large` (reported first) | the first message | nothing |

The cost of the last three rows is real and is the owner's to weigh: the learner can keep looking at and editing the board in
that page, but cannot save new edits until something else on the canvas shrinks, and a reload shows the derived (unedited)
drawing. The only ways out that keep the original are removing other cards, or Download my drawing. Making room by dropping
the snapshot is a separate, explicit owner decision (rule 5) and no code does it.

## Data contract (shared by every workstream)

Code: `packages/web/src/whiteboard-sketch.js` (pure, no imports) with `whiteboard-sketch.test.mjs`. Workstreams build on
these types and rules and do not invent variants. The contract owner is the removal lane lead; a change to it is a change
to this section in the same commit.

### The block

A whiteboard block stays `{ id, type: 'whiteboard', title, narration, ... }` and gains:

| Field | Meaning |
|---|---|
| `snapshot` | The tldraw snapshot it was saved with (P1), kept **verbatim and never modified** by any code path. `null` for a board created after cutover |
| `sketch` | `{ strokes, shapes, items }`, the same lists the Explain Back sketch and the canvas use (`explain-sketch.js`), in sketch coordinates. A missing list reads as empty |
| `sketchFrom` | `{ digest, v }`: the digest (`digestOf`, canonical JSON, key order ignored) of the `snapshot` the sketch was converted from and the converter version. Written once, with the first saved sketch over a snapshot; absent on a new board |
| `tooLarge` | The sketch did not fit and lives in memory only (below) |
| `marked`, `narration`, `title`, `demo` | Unchanged. `toolsHidden` is retired (the tools are the canvas toolbar) |

`legacyState(block)` is one of `none` (no snapshot), `unconverted` (snapshot, no saved sketch: derive in memory),
`converted` (the saved sketch was made from exactly this snapshot) and `diverged` (the snapshot changed after the sketch
was made, which only an older tldraw build can do): the sketch is shown, the original is kept, and the editor says that the
original changed in an older version. `whiteboard` is not in `shared-privacy.js` `LEARNER`, so both fields are shared
content: a share link shows them and a fork copies them whole, exactly as today.

### Marks

- **Lists and kinds** (`validateSketch`): strokes `tool` `pen` or `highlighter` with `points: [{ x, y }]`; shapes `kind` in
  `rect ellipse triangle diamond hexagon star line arrow curve elbow` with `x1 y1 x2 y2`; items `kind` `text` or `sticky`
  with `x y`. All other fields the canvas already writes (`color`, `width`, `dash`, `fill`, `opacity`, `round`, `startHead`,
  `endHead`, `text`, `label`, `runs`, `w`, `h`) are carried unchanged.
- **Ids**: every shape and item has a unique string `id`; ids are unique across the three lists. A stroke may lack one (the
  shared gesture code makes none), but a **whiteboard's strokes carry one**, because Ask about selection and Remove
  explanation name marks: `withStrokeIds` gives an id-less stroke an id derived from its content, so every open gives the
  same id and no two strokes share one.
- **Provenance** (all optional): `author` is `learner`, `lesson` or `assistant` (`tutor` is read as `assistant`); a mark with no
  author is the learner's. `explanationId` and `objectId` tie a Tutor mark to the explanation and plan block that made it.
  A converted mark also carries `legacyId` (the tldraw shape id), `legacyGroup` (the id of the tldraw group it was in, so the
  relationship is not lost), and `meta` (the tldraw `meta` object, kept whole).
- **Coordinates**: converted marks keep tldraw's page coordinates (shapes inside frames are placed in page space by the S1
  reader). Nothing is clipped: see "Fit and focus".

### Where each legacy record goes (`legacyTarget`)

| tldraw record | Becomes | Note |
|---|---|---|
| `draw` | stroke `pen` | points decoded by the S1 reader; width from `size`; pressure is dropped |
| `highlight` | stroke `highlighter` | |
| `geo` rectangle, ellipse, triangle, diamond, hexagon, star | shape of that kind | label becomes `text` |
| `geo` oval, cloud, heart, rhombus, pentagon, octagon, trapezoid, x-box, check-box, block arrows | the nearest kind | `approx`: the editor tells the learner it was approximated |
| `arrow` | shape `arrow`, or `curve` when it bends | bound ends are resolved to the bound shape's edge and stay free ends; the label becomes `label` |
| `line` | shape `line` | a spline line is `approx` |
| `frame` | a `rect` shape (`approx`) plus its name as a text item | children keep their page positions |
| `text` | item `text` | rich text flattened to plain lines |
| `note` | item `sticky` | |
| `group` | nothing of its own | members keep `legacyGroup` |
| `image`, `video`, `embed`, `bookmark`, `three-d-viewer`, `interactive-graph`, `learn-video-pending`, anything unknown | **nothing: stays in `snapshot`** | listed by the editor as kept from the original board, drawn read-only from the S1 SVG, downloadable |

### Persistence

`mayPersist({ readOnly, canEdit })` gates every write; deriving a sketch never writes. `withSketch(block, sketch)` is the
only way a block gets a saved sketch: it carries `snapshot` over by reference and records `sketchFrom` once.
`saveVerdict({ block, sketch, boardChars })` answers `ok`, `sketch-too-large` (over 400,000 characters for the sketch alone,
the cap the tldraw block had) or `board-too-large` (the whole board, after replacing the old sketch with the new one, over
1,900,000), and `warn` from 85 percent. It has no outcome that removes the snapshot; a sketch that does not save stays in
memory with `tooLarge` and a message, and the original stays whole.

### Fit and focus (no pan or zoom inside the card)

The card draws sketch space through a view `{ s, tx, ty }` (`screen = sketch * s + t`). `initialView` is the identity when
everything lies inside the frame and `fitView` otherwise, so a large legacy drawing opens whole, never clipped; `focusView`
shows a chosen rectangle (a kept object, a Tutor explanation, the current selection); `toSketch` and `toFrame` convert
points so drawing in a fitted view lands in sketch space. A fitted view never magnifies past 1. The view is presentation
state: not saved, not shared, never a write. The editor offers Fit, a way to focus a kept object or an explanation, and
reset to 100 percent.

### Selection interface (Ask about selection)

`marksIn(sketch, rect)` returns the marks wholly inside a crop, else the ones it touches, as `{ id, type, text, author }`:
the shape `area-crop.js` `cropBinding` already stores in `binding.shapes`. `registerBoardAsk(id, { shapesIn, explain })`
(`board-ask.js`) keeps its signature; `shapesIn(clientRect)` converts the rectangle through the card's frame and view and
calls `marksIn`.

### Tutor draw-back interface

`explain({ question, answer, onStage })` no longer draws by itself. It resolves to a **draw-back**
`{ explanationId, marks: { strokes?, shapes?, items? }, cards: [{ kind, objectId, text, operation }] }` (`validateDrawBack`):
every mark has `author: 'assistant'`, the one `explanationId` and its `objectId`; `cards` are the plan's graph, 3D, video,
scene and image objects (`RICH_CARD` maps them to the palette entries `graph`, `model3d`, `videoGenerate`, `scene`, `image`;
`RICH_TYPE` gives the saved block `type` the card renderer switches on, which for video is `video` with `mode: 'generate'`).
The host applies marks and cards in **one** state update (one undo step). `explanationIdFor(whiteboardId, requestKey)` is
the same for the same request, so a retry or a reload finds its marks and cards already there. **Remove explanation**
is `removeExplanation(sketch, explanationId?)`: the Tutor's marks go, the learner's and the lesson's stay; cards beside
the board are ordinary cards and are not touched.

### Rich-media cards beside a board

A card made from a draw-back is an ordinary canvas card (all its normal behaviour, share, fork, delete) with
`whiteboardLink: { whiteboard, explanationId, objectId }`. Its id is `cardIdFor(link)`, a function of the link, so
`insertLinkedCards(blocks, cards)` inserting it twice is one card and an existing card is never replaced. Placement is
beside the originating whiteboard, not over it, in the card's own position fields. `cardsOf(blocks, whiteboardId)` lists
a board's cards. Deleting a whiteboard leaves its cards; the link then points at nothing and is harmless. Objects that are
already inside an existing snapshot are never converted into cards, dropped or flattened (migration rule 4).

### Tutor draw-back, as built (workstream T)

Code: `packages/web/src/board-draw-back.js` (pure; imports only `whiteboard-sketch.js` and `learn-board-layout.js`) with
`board-draw-back.test.mjs`. It replaces the drawing half of `learn-board-renderer.js`, which stays until X1 deletes it.

| Function | Job |
|---|---|
| `explainBoard({ whiteboardId, title, appName, question, answer, key, onStage, getSketch, exists, permit, request })` | What the card's `explain` does. Refuses before any paid request when `permit()` says read-only, returns `{ drawBack: null, reason: 'already-drawn' }` when `exists(explanationId)` (a retry or reload), calls `request` (`requestBoardExplanation`), checks `permit()` again after the plan arrives, and returns the draw-back. It draws nothing |
| `planDrawBack({ plan, snapshot, whiteboardId, requestKey, sketch })` | Plan blocks to `{ explanationId, marks, cards, spoken }`, validated by `validateDrawBack`. Text, equation and code become text items (equation blue, code `mode: 'code'`, prose wrapped at 52 characters); a diagram becomes boxes with labels, straight arrows between neighbours and curves below the row for skips and loops; an image's marks are drawn on a dashed frame of the picture's proportions; a block with `fromObjectId` gets a red connector from the existing drawing. The new column goes right of the existing content (an empty board starts at 24, 24). Ids are `explanation-<explanationId>-<n>:<k>`, so the same request plans the same ids |
| `applyDrawBack({ blocks, whiteboardId, drawBack, sketch, permit, layout, boardChars })` | One update for the host: the board's sketch gets the marks (`withSketch`, so a legacy board records `sketchFrom` and keeps `snapshot` by reference) and `insertLinkedCards` adds the cards. `permit` not allowed: the same `blocks` array comes back and nothing is written. Marks of an explanation already on the sketch are not added again, and a card whose `cardIdFor(link)` exists is skipped and not moved. `saveVerdict` over the sketch plus the new cards: if it does not fit, `blocks` is unchanged and `reason` says why |
| `placeCards(kinds, layout)` | `{ dx, dy }` per card so it is drawn 40 px right of the board, stacked below anything already there. `layout = { box, taken, nextFlowTop, column }` is read by the host when applying, so a board moved or resized while the plan was coming still gets its cards beside it. No layout: offset 0, 0 (end of the column, still linked) |
| `clearExplanation`, `explanationCount`, `hasExplanation`, `explanationBounds` | Remove explanation (the Tutor's marks only; cards stay), the "N marks drawn by the tutor" count, the retry guard, and the rectangle to focus after drawing |
| `boardShapesIn(() => ({ sketch, frame, view }))`, `sketchRect` | `shapesIn` for `registerBoardAsk(id, { shapesIn, explain })` over `marksIn`; `frame = { rect: client rect of the drawing surface, w: its logical width }` divides out the canvas zoom, `view` is the card's `{ s, tx, ty }` |

Card blocks made by `cardFor`: graph `{ title, brief, spec, state: {} }`, 3D `{ title, brief, modelUrl, camera, autoRotate, animation, animationTime }`,
video `{ mode: 'generate', title, src: '', caption, operation, status: 'idle' }`, scene `{ title, brief, operation, status: 'idle', ... }`,
image `{ mode: 'search', title, src, alt, caption, credit, variants, variant }` (a paper figure carries its citation in the caption). A video or
scene card has its own Generate button and paid confirmation, so the old "unavailable on a whiteboard" proposal is gone.

## Capabilities lost at cutover

The owner must see this list before cutover. "Verified" means read in the current code or docs; "to confirm" means the
editor workstream must check it against the dev build before the cutover is approved. The native tools are the canvas
toolbar acting on the card (the Explain Back pattern, `docs/features/explain-back-sketch.md`).

Kept (the owner's list): drawing (pen, highlighter, eraser), text and sticky notes, shapes, lines and arrows, selection,
move, resize and restyle, Delete, undo and redo (block-level, per gesture), save and reload, share and fork, Ask about
selection, Tutor draw-back, Remove explanation, narration and Read it aloud.

Lost or changed:

1. **Infinite pan and zoom inside the card** becomes Fit, focus and reset (owner direction). Verified.
2. **Shapes beyond ten kinds.** tldraw's cloud, heart, oval, rhombus, pentagon, octagon, trapezoid, block arrows, x-box and
   check-box cannot be drawn new; existing ones are converted to the nearest kind and flagged. Verified.
3. **Frames** as containers: converted to a rectangle plus a title; nothing is clipped to it. Verified.
4. **Rotation** of shapes and text: the sketch model has no rotation (shapes are `x1 y1 x2 y2`), so a rotated box converts to
   an upright one; the editor has no rotate handle. Verified from the model; the converter workstream decides how a rotated
   box is approximated.
5. **Groups** inside a board: the relationship is kept as `legacyGroup`, not editable; the Explain Back doc says group
   stands down while a sketch is the target. Verified.
6. **Arrows glued to shapes** (bound arrows follow a moved shape): converted to free arrows at the resolved ends. To confirm.
7. **Copy, cut, paste, duplicate inside a card.** The sketch doc lists copy, cut, duplicate and group as standing down while a
   sketch is the target. Verified; the editor workstream may add duplicate.
8. **Align, distribute and lock** inside a card. Verified in the editor: the sketch has none. **Reorder (z-order) is kept**: the
   canvas style panel's order buttons act on the card's marks.
9. **Images, video, embeds, bookmarks and the 3D, graph and video-proposal shapes drawn inside the board.** Existing ones
   are kept read-only from the retained snapshot; new ones become cards beside the board (D2). Verified.
10. **Pressure-shaped strokes.** Converted strokes are uniform-width paths. Verified (the stroke model has no pressure).
11. **Pattern and lined fills, and the four tldraw fonts.** Fills are the canvas's tints; text uses the canvas's text
    levels and its own font choices. Verified.
12. **Lists inside tldraw text and labels** are flattened to plain lines on conversion. **Bold, italic, underline, size, colour and
    alignment are kept** for new text: the card uses the canvas's own text editor. Verified.
13. **Laser pointer, snapping guides and grid.** Verified: the canvas tools have none inside a card.
14. **The card's own toolbar and its Hide-tools button** (`toolsHidden`): the canvas toolbar replaces both. Verified.
15. **tldraw keyboard shortcuts** are replaced by the canvas's (`docs/features/canvas-editing.md`). Verified.
16. **The CDN fetch of tldraw's icons, fonts and translations and the usage reporting to tldraw** go away (a gain).

Added by workstream T (all verified from `board-draw-back.js`):

17. **The Tutor's answer no longer writes itself.** The old renderer faded shapes in, typed text character by character, followed it with
    the camera and could be cancelled mid-way; the draw-back arrives in one update (one undo step) and the editor focuses it
    (`explanationBounds`, `focusView`).
18. **Image annotations sit on a frame, not on the picture.** The picture is a card beside the board; its box, circle, highlight, arrow,
    path and label marks are drawn on a dashed frame of the picture's proportions on the board.
19. **Links on the board are plain text.** The old board's Pexels credit and paper citation were clickable text shapes; now the
    image card shows the Pexels credit link, and a paper citation is in the card's caption and the first mark's `meta.paper`.
20. **Video and scene proposals gain a button.** They were drawn as "unavailable" on a whiteboard (no paid runner); they are now ordinary
    cards with their own Generate and paid confirmation. This is a behaviour change the owner should know about (D2 asked for ordinary cards).
21. **Diagram routing is simpler.** Neighbours are straight arrows; skips and loop-backs are curves under the row; a self-loop is not drawn.

Found while building the editor (workstream A), not on the first list:

22. **A drawn stroke cannot be selected, moved or restyled**; the eraser removes it. The canvas's pen and highlighter strokes
    are not selectable objects anywhere on the canvas. Verified.
23. **Marquee select and moving several marks at once** inside a card: marks are selected by click (Shift or Ctrl adds), and a
    press drags the shape under it only (`ponytail:` in `AdaptiveCanvas.jsx moveSketchShape`). Verified.
24. **Dropping or pasting an image, a file or an embed into the board.** New media are cards beside the board (D2). Verified.
25. **Undo and redo are the canvas's** (Ctrl+Z), one history shared with the other cards, not a history of the card alone.
    Verified.
26. **The red "marked" rectangle** the old board could draw over an Ask-about-selection area: nothing sets it today (only the
    canvas's own area mark appears). Verified in the code, not removed from the block.

Already unavailable today because `WhiteboardBlock.jsx` hides them (`HIDDEN`): the page menu and multiple pages, the main menu
and its export, the debug panel, the help menu and the shortcuts dialog, the minimap. Nothing is lost there.

## Workstream A as built (the editor)

Switch: `whiteboard-flag.js` (`VITE_NATIVE_WHITEBOARD=true`, or `localStorage['rh.nativeWhiteboard'] = '1'` in one browser). Off by
default: the tldraw card stays the live card until X, which replaces the body with `true` and deletes `WhiteboardBlock.jsx`.

- **A1** `AdaptiveCanvas.jsx renderSketch(block, { fill, sv, under })` draws a sketch through a view `{ s, tx, ty }` (the card's
  frame), and every press goes through `toSketch`, so marks drawn in a fitted view are saved in sketch space. Explain Back passes
  nothing and is unchanged (identity view, 240 px).
- **A2** `WhiteboardNative.jsx` (lazy, chosen in `LearningBlocks.jsx WhiteboardBody`): the frame is the canvas's own sketch surface;
  pressing it makes the one canvas toolbar draw there (pen, highlighter, eraser, text, sticky, rectangle, ellipse, triangle,
  diamond, hexagon, star, line, arrow, curved and elbow arrow, select, move, resize, restyle, Delete, z-order). Narration and Read it
  aloud are a copy of the old card's.
- **A3** `whiteboard-editor.js`: `editWhiteboard`/`editList` save through the contract (`mayPersist`, `withSketch`, `saveVerdict`);
  a read-only viewer, a copy or a locked card writes nothing; a board with a tldraw `snapshot` and no converter yet (`conversionPending`,
  the seam below) is not editable and never saved over; a sketch that does not fit stays on screen (`tooLarge`) and `lightBlocks`
  (`canvas-persist.js`) saves its last fitting sketch; the snapshot is never touched. One undo step per gesture is the canvas's
  history (it restores block objects).
- **A4** Fit, 100% and Focus on a kept object; `viewStep` chooses the view on open and on resize until the learner chooses; the view is
  never saved or shared.
- **A5** `whiteboard-kept.js` (reads the S1 reader): "Kept from the original board (n)" with positions, a read-only picture drawn
  from the S1 SVG (an `<img>`, inert), Focus per object, Download my drawing (JSON), Download picture (SVG of the current view) and
  Download original (the snapshot, byte for byte). `legacy-whiteboard.js` gained `only`, `x`/`y` and `shapeBounds` (additive).
- **A6** `whiteboard-seed.js sigmoidSketch()`: the native sigmoid for `demo: 'sigmoid'` (lesson marks with the Tutor's semantic ids).
- **A7** `e2e/whiteboard-native-check.mjs` (fork, runs in fast-e2e) and the rewritten whiteboard steps of `chat-block-check.mjs`
  (windows-only: the release gate, against the deployed dev worker; its explain-back step needs workstream T).

Seams for the other workstreams: `whiteboard-derive.js` (B3: `deriveSketch(block) -> { sketch, pending? }`, a stub until B lands) and
`whiteboard-explain.js` (T: `explainOnBoard({ block, appName, question, answer, onStage, addMarks, focus })`, a stub until T lands).
The card registers `shapesIn` itself (`marksIn` through the card's frame and view) and applies Tutor marks through
`sketchHost.edit` (one undo step, ids already there are skipped, `mergeMarks`).

## Workstreams and slices

Each slice ships on its own, passes `verify` and `fast-e2e` on its SHA and is revertible by `git revert`. The ratchet
`tldraw-imports.test.mjs` lists the files that still import tldraw; the build guards and the dependency come out only when
it is empty and the replacement checks pass. A step is one independently testable change.

| Workstream | Content | Steps | Starts after | Runs in parallel with |
|---|---|---|---|---|
| S1 (built) | reader, SVG exporter, fixtures, ratchet | done | | |
| S2 (built) | dead player removed (5 files, `LearnPage.jsx` call sites) | done | | |
| Contract (built) | the section above and `whiteboard-sketch.js` | done | | |
| S3 Notes | delete `LearnNotes.jsx`, the notes state in `LearnPage.jsx`, `captureNotePage`; keep IndexedDB data, never clear it (D4) | 4 | S2 merged (same file) | A, B, T |
| A Editor | (A1) `renderSketch` takes the card's frame and a view, store coordinates go through `toSketch`; (A2) the whiteboard card uses it, draw target and toolbar as Explain Back; (A3) saves through `mayPersist`, `withSketch`, `saveVerdict`, read-only never writes; (A4) Fit, focus and reset controls; (A5) the kept-from-original layer: list, S1 SVG, downloads; (A6) native seed for `demo: 'sigmoid'` replacing `sigmoid-board.js`; (A7) rewrite the `chat-block-check.mjs` whiteboard checks, add legacy-open, edit, reload, share and fork checks, check-map entries | 7 | Contract | B, T |
| B Migration (built, see "Workstream B") | (B1) `legacy-to-sketch.js` for strokes, shapes, arrows, lines, text, notes with deterministic ids, `legacyId`, `meta`; (B2) frames, groups, bound arrows, rotation, colours and sizes; (B3) `deriveSketch(block)` that A calls on open (no write); (B4) more fixtures: rotated and nested, near the 400,000 limit, 2D and 3D paths, rich text, assets; (B5) tests: repeated opens, reload, share and fork (`forkState`, `shared-privacy`), arrows and groups, assets, metadata, size with both representations | 5 | Contract (B3 before A3) | A, T |
| T Tutor | (T1) `shapesIn` and `registerBoardAsk` over `marksIn`; (T2) a planner that turns a board plan (text, equation, code, diagram, image annotations) into marks, replacing the drawing half of `learn-board-renderer.js`; (T3) rich-media plan objects to `insertLinkedCards`, placed beside the board, no duplicates on retry or reload; (T4) Remove explanation and the explanation count; (T5) the `area-crop.js` binding and the unit tests that pin it; (T6) tests and the `chat-block-check` explain step | 6 | Contract | A, B |
| X Cutover | (X1) delete `WhiteboardBlock.jsx`, `learn-board-renderer.js`, `sigmoid-board.js`, `learn-shape-utils.js`, the three shapes, the `learn-warmup.js` entry; (X2) remove `tldraw` from `packages/web/package.json` and the lockfile, keeping dependencies other features use; (X3) remove the key reads and guards (`scripts/prod-release.mjs:227-229`, `scripts/dev-deploy.mjs:459-460`, their tests) and prepare the exact workflow diff (`deploy-dev.yml:56`, `deploy-prod.yml:48`, `verify.yml:58`) as an owner `!` command; (X4) docs and obsolete styles (the CLAUDE.md dev snippet is an owner edit); (X5) a removal audit: source, `npm ls`, production bundles for tldraw code, CSS, assets and network requests; (X6) browser checks on the final combined SHA, dev deployment, deployed verification | 6 | A, B, T merged | |

Critical path: Contract, then A (A1 to A3) with B3 and T1 to T3 beside it, then X: three sequential stages after the contract,
with A, B and T side by side. After deployment and verification, deleting the obsolete licence secret is a queued owner command.

## Validation plan

- **Unit** (`npm run test:unit` in `packages/web`; keyless, offline): S1 `legacy-whiteboard.test.mjs` (11 tests) reads two
  fixtures that tldraw 5.4.2's own schema and store wrote and validated (`src/__fixtures__/tldraw/`), including the
  base64 stroke decode against known coordinates, bound arrows, frame children, images, the three app shapes, a note with
  locked shapes, hostile text escaped in the SVG, an unknown record counted, a non-snapshot refused, and no mutation of a
  frozen input. `tldraw-imports.test.mjs` is the ratchet; negative control run: dropping one name from its list fails it.
  B5 adds converter tests over the same fixtures (counts per kind, `meta.author` kept, idempotent, input untouched).
- **Snapshot round-trip fixtures**: the committed JSON is the tldraw-written side of the round trip; a real whiteboard
  exported from a dev clone by the owner would add a second source and is optional.
- **CI browser** (`fast-e2e`, read from CI, never run by Claude): `chat-block-check.mjs` is the only check on the editor and
  is rewritten in A7 and T6; confirm it was selected and executed (CLAUDE.md "Green CI can mean zero relevant checks").
  A legacy-open check seeds `:ink` with the fixture. X2 changes `package-lock.json`, which selects all checks.
- **Bundle** (X5): the production bundle contains no `tldraw` module and no `cdn.tldraw.com` string; extend
  `e2e/production-bundle-check.mjs` or add a unit assertion over the build output.
- **Final verification of complete removal (X5, X6):** an audit that fails on any `tldraw` or `@tldraw` in `src`, the manifests,
  the lockfile and `npm ls`, on any tldraw module, CSS or asset in the production bundles (extend
  `e2e/production-bundle-check.mjs`), and on any request to `cdn.tldraw.com`; browser checks on the final combined SHA for new
  drawing, a legacy board open, edit, save and reload, sharing, forks and Tutor interaction; a deployed Whiteboard working
  without the package, the key or the CDN. Claude reads these from CI and the dev clone; the owner tests in the browser.
- **Required unit coverage (B5, T6):** repeated opens give the same marks and ids, reload, share and fork, arrows, groups,
  assets, metadata, the size verdict with both representations, a read-only viewer never writing, retry never duplicating
  cards.
- **Not covered by any of this**: pixel fidelity of the SVG against tldraw's own rendering (geometry is a faithful preview;
  fonts, text wrapping, arrow arcs and pattern fills are approximate), real-learner drawing feel, and a deployed user flow.

## Rollback

Per slice `git revert` of the slice's commits. The retained `snapshot` makes A to X safe to revert: an older tldraw build
reads `snapshot` exactly as before. **Edits made in the new editor live in `block.sketch`, which an older tldraw build
ignores, so after a rollback they are invisible but intact**, and they come back when the new build is deployed again;
`legacyState` reports `diverged` if the older build changed the snapshot in between, and then both are shown and nothing is
discarded. Verified in the old code: `WhiteboardBlock.jsx` saves `{ ...latest.current, snapshot }`, so an older build keeps
`sketch` and `sketchFrom` when it saves. A board created after cutover has no snapshot, so an older build shows it empty with
the sketch intact in the block. To keep those edits recoverable while a tldraw build still exists, before cutover (X) the card must offer
**Download my drawing** (the sketch as JSON and the SVG) and **Download original** (the snapshot), and the rollback note names
the one-off converter that would write a sketch back into a tldraw snapshot. That converter is not built unless a rollback of
the cutover is scheduled, and it would write a copy beside the original, never over it. Workstream B judged it not cheap: it
needs a Float16 path encoder, fractional index keys, a nearest-colour map back to tldraw's names, the 5.4.2 schema block
copied from a fixture, and a validation run against the real tldraw store that only works while the packages are installed;
roughly a day with tests, and no consumer until a rollback is scheduled. Until then recovery is Download my drawing (the sketch
JSON, our own format) and the sketch kept in the block. The integrator decides whether to build it before cutover. X is reverted by restoring the
dependency, the lockfile and the guards; the licence key stays in the secret store until the owner deletes it after the
cutover is live and verified.

## Owner decisions

Approved 2026-10-26 (typed, twice): remove tldraw completely, and option A for each of D1 to D4. Constraints from the same
message: no new general-purpose drawing engine, reuse the existing UI components and styling, no tldraw version swap, no
licence purchase.

| # | Decision | Approved |
|---|---|---|
| D0 | Licence expiry | Not established and no longer blocking. Only the owner can read it, at the tldraw account, `https://tldraw.dev/community/license` or the purchase email; the key is `TLDRAW_LICENSE_KEY` in the root `.env` and a GitHub secret named `VITE_TLDRAW_LICENSE_KEY` (values never read here) |
| D1 | Replacement for the whiteboard editor | A: the existing native drawing primitives and sketch tools; no separate infinite pan or zoom inside the card, large drawings stay reachable by fit and focus |
| D2 | Images, 3D, graphs, videos and scenes the Tutor adds | A: ordinary canvas cards beside the originating whiteboard with a stored link, no duplicates on reload or retry; existing embedded objects never dropped or flattened |
| D3 | Existing boards | A: original snapshot intact, representation derived in memory on open, persisted only on an authorized edit, read-only viewers never write |
| D4 | Notes | A: remove the unreachable view and dead code, keep the IndexedDB data, never clear databases |

Open for the owner: the list under "Capabilities lost at cutover", before the cutover is approved.

## Owner commands (read-only, optional)

Count the production boards that hold a whiteboard, so the migration's blast radius is known. Read-only `SELECT`, database from
`packages/web/wrangler.rabbit-hole-prod.jsonc` (`LEARN_DB`, `rabbit-hole-learn-prod`); needs `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the environment (by name); no rollback needed:

```bash
cd packages/web && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --command "SELECT COUNT(*) AS boards_with_whiteboard, SUM(state_json LIKE '%\"snapshot\":{\"document\"%') AS with_saved_drawing, MAX(length(state_json)) AS largest_board FROM learn_boards WHERE state_json LIKE '%\"type\":\"whiteboard\"%'"
```

Success: one row. `--command` and `--remote` are confirmed by `wrangler d1 execute --help`; the column names come from
`control-plane/src/learn-boards.js` (`state_json`) and `WhiteboardBlock.jsx` (`snapshot`). The `LIKE` match is textual, so
a board whose card text contains those words is over-counted.
