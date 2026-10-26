# tldraw removal

Ledger task `19e561b2-04b6-46bf-bc3b-2e6bb3f834ec`. Owner direction 2026-10-26: ship Rabbit Hole without the `tldraw`
dependency and its license key. Branch `feat/tldraw-removal`, from main 7b105a4b. This document is the inventory, the
replacement approach, the data-migration rule, the slices and the validation plan. Slices S1 and S2 are built; the rest is not.

## Why (the license, read from the package)

`tldraw` 5.4.2 is under the tldraw license (`node_modules/tldraw/LICENSE.md` links to
`https://github.com/tldraw/tldraw/blob/main/LICENSE.md`; text read at tag v4.0.0 and main). Its terms:

- No use in a Production Environment (any deployment serving end users) unless tldraw issues a trial or a commercial
  license key; the key controls functionality and usage restrictions.
- Not to disable, change or interfere with License Key enforcement; the SDK may "collect and transmit usage data to tldraw
  for license compliance purposes".
- `@tldraw/tlschema`, `store`, `state`, `state-react`, `utils`, `validate` are MIT (`package.json` of each); `tldraw`,
  `@tldraw/editor` and `@tldraw/driver` are not.

No tldraw release is open-licensed: v2.4.6 is non-commercial only; v3.15.6 allows commercial use but forbids removing the
watermark or the key check; v4.0.0 and later need a key in production. A downgrade is therefore not an exit.

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

**Recommendation: A**, in slices, with the S1 reader as the safety net for every existing snapshot. It reuses code that
already ships and is tested, adds no dependency, and is the only option that removes the license, the CDN fetch and the
usage reporting together.

## Migration rule (existing whiteboards and sketches keep working)

1. **Never destroy.** `block.snapshot` (P1) and the IndexedDB records (P2, P3) are never rewritten, trimmed or deleted by
   any slice. Nothing runs against production data; conversion happens in the learner's browser when they open a card.
2. **Read without tldraw.** `src/legacy-whiteboard.js` (S1) reads P1, P2 and a bare store snapshot into a plain structure and
   a static SVG. It never mutates its input (tested on a deep-frozen snapshot) and counts every record it cannot read as
   `unsupported` instead of dropping it.
3. **Derived copy, first open.** A whiteboard block that has `snapshot` and no `sketch` is converted in memory with the S2
   converter (stroke to `strokes`, `geo`, `arrow`, `line`, `frame` to `shapes`, `text` and `note` to `items`, `meta.author`
   kept) and shown at once. The converted copy is written to `block.sketch` only on the learner's first edit; until then
   the card is byte-identical to what was stored.
4. **What has no counterpart is not lost.** Images, embeds, bookmarks, video, the three app shapes and any `unsupported`
   record stay in the retained `snapshot`, and the card shows them from the S1 SVG as a read-only layer behind the new
   marks, labelled as before. Decision D2 sets what the Tutor does for new ones.
5. **Both fields count toward the 1.9 MB board limit** (`BOARD_LIMIT`, warning at 85%). Dropping the legacy `snapshot` is a
   separate owner decision after a retention period; no slice does it.
6. **Notes (P2) and graphs (P3)** are left untouched in IndexedDB. Their view is unreachable today; D4 decides what happens.

## Slices

Each slice ships on its own, passes `verify` and `fast-e2e` on its SHA, and is revertible by `git revert`. The license-key
guards come out only in S6, when `tldraw-imports.test.mjs` (the ratchet) has an empty list.

| Slice | Content | Needs owner decision | Imports removed |
|---|---|---|---|
| **S1 (built)** | `legacy-whiteboard.js` reader and SVG exporter; fixtures written by tldraw's own schema; the ratchet test; check-map entry | No | 0 |
| **S2 (built)** | Remove the dead player: delete `LearnCanvas.jsx`, `learn-graph-storage.js`, `learn-video-canvas.js`, `sigmoid-demo.js`, `canvas-preview.js`; cut the editor blocks out of `LearnPage.jsx` (lines listed above); update `learn-notes-view.test.mjs`, `index.css:728`, check-map. As built, `LearnPage.jsx` keeps `const [editor, setEditor] = useState(null)` and its other guarded uses (none import tldraw); only the code that called the deleted modules went, and `demo.run` and `previewLesson` became empty functions (`previewLesson` already returned at once without an editor; `demo.run` would have thrown) | No | 4 of 11 (the fifth deleted file, `canvas-preview.js`, used the editor but did not import tldraw) |
| S3 | Notes: per D4 (recommended: delete `LearnNotes.jsx`, the notes state in `LearnPage.jsx:313-345,1930-1970,2227,2397` and `captureNotePage`; leave IndexedDB data) | D4 | 1 |
| S4 | New whiteboard card on our primitives, plus the converter and on-open migration (sub-steps below) | D1, D2, D3 | 0 until S5 |
| S5 | Cut `WhiteboardBlock.jsx`, `learn-board-renderer.js`, `sigmoid-board.js` over to the new card; delete `learn-shape-utils.js`, the three shapes | after S4 | the last 6 |
| S6 | Remove `tldraw` from `packages/web/package.json` and the lockfile, the two script guards, docs; owner pushes the workflow edits and deletes the secret | none beyond D0 | dependency |

S4 sub-steps: (1) a whiteboard card body that renders and edits `block.sketch` with the canvas's gesture code at the card's
size; (2) `legacy-to-sketch.js`, pure, tested on the S1 fixtures; (3) on-open conversion and first-edit write (rule 3); (4) Ask
about selection: `shapesIn` over the sketch marks with the same `{ id, type, text, author }` contract; (5) the Tutor
answer drawn as sketch items and shapes (text, equation, code, diagram, image annotations) and, per D2, graph, 3D, video and
scene as ordinary canvas cards beside the board; (6) `chat-block-check.mjs` whiteboard checks rewritten for the new
selectors and a new check that seeds a legacy snapshot into `:ink` and opens it; check-map entries.

## Validation plan

- **Unit** (`npm run test:unit` in `packages/web`; keyless, offline): S1 `legacy-whiteboard.test.mjs` (11 tests) reads two
  fixtures that tldraw 5.4.2's own schema and store wrote and validated (`src/__fixtures__/tldraw/`), including the
  base64 stroke decode against known coordinates, bound arrows, frame children, images, the three app shapes, a note with
  locked shapes, hostile text escaped in the SVG, an unknown record counted, a non-snapshot refused, and no mutation of a
  frozen input. `tldraw-imports.test.mjs` is the ratchet; negative control run: dropping one name from its list fails it.
  S4 adds converter tests over the same fixtures (counts per kind, `meta.author` kept, idempotent, input untouched).
- **Snapshot round-trip fixtures**: the committed JSON is the tldraw-written side of the round trip; a real whiteboard
  exported from a dev clone by the owner would add a second source and is optional.
- **CI browser** (`fast-e2e`, read from CI, never run by Claude): `chat-block-check.mjs` is the only check on the editor and
  is rewritten in S4 step 6; confirm it was selected and executed (CLAUDE.md "Green CI can mean zero relevant checks").
  A legacy-open check seeds `:ink` with the fixture. S6 changes `package-lock.json`, which selects all checks.
- **Bundle** (S6): the production bundle contains no `tldraw` module and no `cdn.tldraw.com` string; extend
  `e2e/production-bundle-check.mjs` or add a unit assertion over the build output.
- **Not covered by any of this**: pixel fidelity of the SVG against tldraw's own rendering (geometry is a faithful preview;
  fonts, text wrapping, arrow arcs and pattern fills are approximate), real-learner drawing feel, and a deployed user flow.

## Rollback

Per slice `git revert` of the slice's commits. The retained `snapshot` makes S4/S5 safe to revert: an old bundle reads
`snapshot` exactly as before. Edits made in the new editor live in `block.sketch`, which an old bundle ignores, so they
are invisible (not deleted) after a revert; the rollback note for S5 says so. S6 is reverted by restoring the dependency,
the lockfile and the guards; the license key stays in the secret store until the owner deletes it after S6 is live.

## Owner decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D0 | Deadline: does the current license key or trial expire, and when? It sets how fast S4 must ship | A) a date; B) none, the key is paid | State the date; if soon, run S2 and S3 now (no decision needed), S4 next |
| D1 | What replaces the whiteboard editor | A) our own primitives (reuse the canvas tools, no infinite pan or zoom inside a card); B) Excalidraw; C) retire the card; D) buy a tldraw license | A |
| D2 | Images, 3D, graph, video and scene objects the Tutor used to draw inside the board | A) they become normal canvas cards next to the board; B) the Tutor draws text, diagrams and annotations only; C) keep them inside, read-only | A |
| D3 | Existing whiteboards | A) convert in the browser on first open, keep the old snapshot; B) read-only picture forever; C) an offline batch migration (needs a production data job and approval) | A |
| D4 | Personal notes (view unreachable; data in IndexedDB) | A) remove the dead view, leave the data; B) rebuild a read-only "My notes" from the S1 SVG; C) rebuild editing | A, B later if anyone asks |

## Owner commands (read-only, optional)

Count the production boards that hold a whiteboard, so S4's blast radius is known. Read-only `SELECT`, database from
`packages/web/wrangler.rabbit-hole-prod.jsonc` (`LEARN_DB`, `rabbit-hole-learn-prod`); needs `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the environment (by name); no rollback needed:

```bash
cd packages/web && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --command "SELECT COUNT(*) AS boards_with_whiteboard, SUM(state_json LIKE '%\"snapshot\":{\"document\"%') AS with_saved_drawing, MAX(length(state_json)) AS largest_board FROM learn_boards WHERE state_json LIKE '%\"type\":\"whiteboard\"%'"
```

Success: one row. `--command` and `--remote` are confirmed by `wrangler d1 execute --help`; the column names come from
`control-plane/src/learn-boards.js` (`state_json`) and `WhiteboardBlock.jsx` (`snapshot`). The `LIKE` match is textual, so
a board whose card text contains those words is over-counted.
