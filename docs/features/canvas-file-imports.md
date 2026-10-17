# Canvas file imports: shared contracts

Owner spec 2026-10-16 (`C:/s/spec/file-imports.md`, verbatim there; confirmed decisions 1-7 at its top). This document is
the **shared contract** every file-import lane implements against. Lane 1 (foundation) owns it and every interface named
here. A lane that needs a change to a contract asks Lane 1; it does not add a parallel format, table, limit or ref shape.

Status key used below: **contract** (agreed, not built), **built** (in code on `feature/file-imports`), **verified**
(a named check passed). Section 9 lists what is built so far.

## 1. What current main does (inspected on `main` 502ef340, 2026-10-16)

| Area | Found |
|---|---|
| Drop routing | `LearnPage.jsx` `takeDrop`: a name `importKind` knows (`.ipynb`, `.py`, any extension `codeLanguage` maps, `.md` included as Markdown source) opens `FileImportDialog`; anything else goes through `learn-drop.js` `classifyDrop` (PNG/JPEG/WebP, GIF, MP4/WebM, PDF). `.txt` is refused on the canvas (Context only). |
| Picker | One hidden `<input type=file multiple>` in `LearnPage.jsx` with a hard-coded `accept` of `.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.pdf,.ipynb,.py`: the code extensions the drop accepts are missing from the picker. |
| Client limits | `learn-drop.js` `DROP_LIMITS`: image 5 MiB, GIF 10 MiB, clip 50 MiB, PDF 5 MiB (computed in MiB, displayed as "MB"). `learn-file-import.js`: `IMPORT_LIMIT` 25 MiB, `CARD_LIMIT` 1,900,000 characters. `three-d-asset.js` `MAX_MODEL_BYTES` 20 MiB (GLB only, not wired to drop). |
| Board files | Cards keep an asset key (`drop:<uuid>`, `pdf:<paper id>`, `import:<uuid>`, `notebook:<id>`); bytes sit in IndexedDB `small-learn-assets` (`learn-asset-cache.js`) and go up after each board PUT (`LearnPage` `syncAssets`) to `PUT /api/learn/boards/<app>/<board>/assets/<key>`. `assetKeysOf` (`learn-board-assets.js`) is the list both sides use. |
| **The 50 MiB bug** | `syncAssets` skips any blob over 25 MiB with a toast (`LearnPage.jsx:1040`), and `learn-boards.js` `MAX_ASSET` = 25 MiB refuses it (Content-Length check, then a full `req.arrayBuffer()`). A 25-50 MiB video therefore plays in the dropping browser and is missing everywhere else. |
| Asset storage | `learn-boards.js`: R2 `LEARN_MEDIA` key `learn-boards/<learn_boards.id>/<sha256(asset key)>`; served with `Content-Disposition: attachment`, `CSP: sandbox`, `nosniff`, a `SAFE_TYPE` allowlist (else `application/octet-stream`). No Range support. Readers other than the owner get only keys the saved board uses (`boardAssetKeys`); fork copies those objects. |
| Hops | Board asset routes run in-process in the app worker (`dev-worker.js` → `learnBoardsRoute`; `app-worker.js` and `dev-access-worker.js` wrap it). No proxy hop to the control plane. Cloudflare's request-body limit is per plan (100 MB on Free/Pro), above 50 MiB. Workers isolates have 128 MB, so a 50 MiB body must not be buffered twice. |
| Other stores | Images for the tutor: `POST /api/learn/media`, 5 MiB, `learn-media/<owner digest>/media:<id>` (`learn-media.js`). PDFs: `POST /api/learn/paper`, 5 MiB, 100 pages, `learn-papers/<owner digest>/<id>`. Context documents: `POST /api/learn/context`, PDF 5 MiB / text 1 MiB, `learn-context/<owner+canvas digest>/ctx:<id>`, D1 `canvas_context_documents` (`learn-context-docs.js`). Thumbnails `learn-thumbnails/<board id>/...`. |
| Board size | `MAX_STATE` 1,900,000 characters per board (D1 value cap). |
| Jobs | No file-conversion jobs exist. Durable Object alarm loops already drive `LearnVideos`, `LearnScenes` and `RepositoryImports` (`repositories.js`), bound in dev and prod. The app worker has a `queue()` handler, but prod binds no queue. Cloudflare cron ticks are not delivered on this account. |
| Chat refs | `ContextRef { sourceId, kind, name, version, range }` (`chat-context.js`, server `chat-modes.js contextRefs`, `canvases.js REF_PREFIXES`); closed kinds `doc, card, group, code, image, media, web`; `sameRef` = sourceId + range. Selected cards become `selectionRef` refs (`selection-ref.js`). |
| Shared constants | The control plane imports web modules directly (`learn-context.js` imports `MAX_OUTLINE_HEADINGS` from `../../web/src/learn-outline-model.js`; `learn-boards.js` imports `assetKeysOf`). The registry follows the same pattern. |

## 2. Capability and limit registry

**One module:** `packages/web/src/file-capabilities.js`. Pure ES module, no imports, no DOM. The web app imports it as
`./file-capabilities.js`; the control plane imports `../../web/src/file-capabilities.js`. Every picker `accept`, drop
classification, client limit, server upload cap, converter limit and capability label reads it. No other file holds a
format list or a byte limit for imports.

Each family:

```js
{
  id: 'video',                       // stable family id, stored in D1 file_sources.family
  label: 'Video',
  lane: 3,                           // owning lane for the adapter
  status: 'shipped' | 'planned',     // planned: not accepted by picker/drop/upload until its lane flips it
  extensions: ['mp4', 'webm'],       // lower case, no dot; matched case-insensitively
  mime: ['video/mp4', 'video/webm'], // hints only; never trusted alone
  sniff: bytes => boolean,           // structure check on the first bytes (null when the family has no magic)
  card: 'file:clip',                 // card type[:kind] the import creates
  chooser: null | 'import' | 'pdf' | 'pptx' | 'workbook', // which import-choice dialog, if any
  route: 'drop' | 'import' | 'pdf',  // today's entry function in LearnPage takeDrop (shipped families)
  can: { store, preview, edit, download, context },        // booleans: what is true NOW, never what is planned
  limits: { bytes, ...decoded },     // bytes = source cap; decoded limits per family (section 2.2)
  notes: 'one line on variants supported / not supported',
}
```

Exports (contract; built ones marked in section 9):

- `MiB`, `formatBytes(n)` - every displayed size uses MiB (`50 MiB`), so client and server text agree.
- `FAMILIES` - the table; `family(id)`.
- `familyOf({ name, type })` - extension first, then MIME; `null` when unknown. Structure is checked with `sniff` before
  any parse; a name match is not a format match (a JSON file is not a notebook; HTML is code, never a page).
- `acceptList()` - the picker `accept` string for shipped families (canvas drop and Upload/Insert share it).
- `BOARD_FILE_LIMIT` (25 MiB) and `boardFileLimit(contentType)` - the server cap for a board file PUT by its declared
  type: `{ bytes, family, sniff }`. A family whose cap exceeds 25 MiB must declare `sniff`, and the server refuses a body
  whose first bytes do not match (415) before storing it.

### 2.1 Families (initial table; `status` is what main does today)

| Family | Extensions | Card | Chooser | Status today | store / preview / edit / download / context today | Source cap |
|---|---|---|---|---|---|---|
| image | png jpg jpeg webp | file:image | - | shipped | yes / yes / no / no / yes (PNG/JPEG/WebP via /api/learn/media, 5 MiB) | 5 MiB |
| gif | gif | file:image | - | shipped | yes / yes / no / no / no | 10 MiB |
| svg | svg | (lane 3) | - | planned | - | lane 3 measures |
| video | mp4 webm | file:clip | - | shipped | yes (fixed by Lane 1 step 2) / yes (browser decode) / no / no / no | **50 MiB** |
| audio | mp3 wav ogg m4a flac | (lane 3) | - | planned | - | lane 3 measures |
| pdf | pdf | pdf | pdf | shipped | yes / yes / no / yes (browser PDF viewer) / yes (paper_context, 100 pages) | 5 MiB |
| text | txt | (lane 2) | - | planned (Context only) | - | 1 MiB (Context today) |
| markdown | md markdown | repo-code (Markdown source) | import | shipped as source code only; rendered card is lane 2 | yes / source only / no / via File attachment / card text | 25 MiB |
| notebook | ipynb | notebook | import | shipped | yes / yes / yes (runtime) / via File attachment / card text | 25 MiB source, 1.9 MB card |
| python | py | repo-code / notebook | import | shipped | as notebook | 25 MiB source |
| code | the spec's list (`codeLanguage` covers all but jsonl, ini, kts) | repo-code | import | shipped for what `codeLanguage` maps | yes / yes / no / via File attachment / card text | 25 MiB |
| delimited | csv tsv | (lane 2) | - | planned | - | lane 2 measures |
| workbook | xlsx xls | (lane 2) | workbook | planned | - | lane 2 measures |
| word | docx doc | (lane 2) | - | planned | - | lane 2 measures |
| presentation | pptx | (lane 2) | pptx | planned | - | lane 2 measures |
| gltf | glb gltf | (lane 4, ThreeDShape) | - | planned (viewer exists, not wired) | - | 20 MiB (GLB viewer today) |
| mesh | obj fbx stl 3mf | (lane 4) | - | planned | - | lane 4 measures |
| cad | step stp | (lane 4) | - | planned (needs native converter runtime) | - | lane 4 measures |
| ply | ply | (lane 4) | - | planned | - | lane 4 measures |
| splat | splat ksplat spz sog (+ splat-schema ply) | (lane 4) | - | planned | - | lane 4 measures |

A lane flips `status` to `shipped` and sets `can.*` only in the commit that makes the behavior true end to end, with
its check. An attachment-only fallback never sets `preview`.

### 2.2 Limit kinds

`limits.bytes` is the stored-source cap. Families add decoded-complexity limits under the same object, measured by the
lane on real fixtures and recorded with the hardware/browser used: `pixels` (images), `pages` (PDF/PPTX/DOC), `cells`
(workbook/CSV), `outputBytes` (notebook outputs), `chars` (text preview), `triangles`, `vertices`, `textureBytes`,
`splats`/`points`, `animationTracks`, `archiveEntries`/`archiveBytes` (expanded), `durationSec` (media). Preview limits
(what is rendered) and context limits (what an AI route may read) are separate keys: `preview: {...}`, `context: {...}`.
Until a lane measures, the current verified limits stay.

## 3. Card reference schema (no payloads in board JSON)

A card made by a new adapter keeps exactly one compact `fileRef` object on its block (the field name is reserved):

```js
block = {
  id, type, kind, dx, dy, w, h, label,          // existing card fields
  fileRef: {
    v: 1,
    source: { id: 'fs_<24 hex>', rev: '<sha256 hex of the original bytes>' },  // immutable identity
    family: 'workbook',
    meta: { name: 'sales.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 48213, title: 'sales' },
    view: { sheet: 'Q1', pages: [3, 5], slide: 2, language: 'python', camera: null }, // only the keys the card uses
    derivatives: { preview: 'fd_<24 hex>', text: 'fd_…', poster: 'fd_…' },          // a cache; D1 is the truth
    job: 'fj_<24 hex>' | null,
    doc: { id: 'fdoc_<24 hex>', rev: 3 } | null,   // the editable revision this card shows, when edited
    status: { preview: 'ready', context: 'extracted' | 'partial' | 'none' | 'unavailable', limited: 'first 2000 rows' },
  },
}
```

Rules:

- Never in board JSON: file bytes, base64, blob URLs, signed URLs, extracted text, cell grids, model arrays, notebook
  outputs beyond what the existing notebook card already keeps. `fileRef` serialized stays under 2 KB.
- Existing cards keep their fields (`assetKey`, `source.assetKey`, `source_asset`, notebook cells) and stay readable and
  editable. A card is upgraded to `fileRef` only by an idempotent upgrade that confirms the source record is stored
  before the old payload is dropped.
- `assetKeysOf` and `boardAssetKeys` are extended (Lane 1) to report `fileRef.source.id` and derivative ids, so share,
  fork, member reads and cleanup see them through the one existing list.
- Copy/fork copies the `fileRef` (sources are immutable; no live link). A card's `doc` is copied as a new document at the
  same revision content, never shared between boards.

## 4. Records (LEARN_DB) and R2 layout

Migration `packages/control-plane/learn-migrations/0023-file-imports.sql` (Lane 1), additive and re-runnable, mirrored
into `repository-schema.sql`. Local stack only until the owner approves learn-dev and prod.

| Table | Purpose | Key columns |
|---|---|---|
| `file_sources` | one immutable original | `id`, `org`, `owner_email`, `app`, `board_id` (origin), `family`, `name`, `media_type` (verified), `declared_type`, `bytes`, `sha256`, `r2_key`, `status` (`uploading`, `stored`, `failed`, `deleted`), `created_at`, `stored_at`, `deleted_at` |
| `file_derivatives` | a preview, poster, text, mesh, playback copy | `id`, `source_id`, `source_sha256`, `kind`, `converter`, `converter_version`, `options_hash`, `status` (`pending`, `ready`, `failed`), `media_type`, `bytes`, `sha256`, `r2_key`, `coverage_json` (small), `error`, times; UNIQUE (`source_id`, `source_sha256`, `kind`, `converter_version`, `options_hash`) |
| `file_jobs` | durable conversion/extraction work | `id`, `org`, `owner_email` (initiator), `app`, `board_id`, `card_id`, `source_id`, `source_sha256`, `converter`, `options_json`, `idempotency_key`, `state`, `stage`, `attempt`, `max_attempts`, `lease_until`, `cancel_requested`, `derivative_ids_json`, `error`, times; UNIQUE (`org`, `owner_email`, `idempotency_key`) |
| `file_documents` / `file_document_revisions` | edited text/code/notebook content | document `id`, `org`, `owner_email`, `app`, `board_id`, `source_id`, `source_sha256`, `head_rev`; revision (`doc_id`, `rev`) PK, `parent_rev`, `r2_key`, `bytes`, `sha256`, `created_by`, `created_at` |
| `file_source_refs` | derived index: which boards reference a source | (`source_id`, `board_id`) PK; rewritten in the board save's batch, like `learn_canvas_refs` |

R2 keys on the existing `LEARN_MEDIA` bucket (dev `rabbit-hole-dev-learn-media`, prod `rabbit-hole-prod-learn-media`):

- `file-sources/<source id>/original`
- `file-sources/<source id>/d/<derivative id>`
- `file-docs/<document id>/<rev>`

Keys carry random ids only; access is decided in D1, never by knowing a key. Bytes are uploaded under a source id the
server issued; the object is written once (`onlyIf` absent) and never overwritten.

### 4.1 Authorization (every route)

A request for a source, derivative, extracted text, job status, document revision, original download or AI retrieval
succeeds only when one holds:

1. The requester owns the record (`org` + `owner_email` match the session), or
2. The request names a board the requester can read by the existing rules (owner, member, share or publication link via
   `sharedAccess` / `canvas-comments` member family), **and** that board's saved state references the source
   (`boardAssetKeys`, as board files today), and the derivative belongs to that source.

Writes (upload, finalize, job submit, cancel, retry, document revision) need write access to the named board (its owner
today). Revoking a share revokes every derivative read through it, because the check runs per request. No public raw
URL, no cross-account deduplication, no thumbnail outside these rules. Responses keep the board-file headers
(`attachment`, `CSP: sandbox`, `nosniff`, served type from an allowlist).

### 4.2 Routes (contract, Lane 1)

- `POST /api/learn/files` `{ app, board, name, type, size, sha256, family }` → `{ source, upload }` (idempotent on
  owner + sha256 + board: an already stored identical source is returned, no second upload).
- `PUT /api/learn/files/<source id>` raw bytes → the server counts actual bytes against `family.limits.bytes`, sniffs,
  hashes, and marks `stored` only when bytes and sha256 match the declaration.
- `GET /api/learn/files/<source id>[?board=…]` original, with Range; `GET …/d/<derivative id>` a derivative.
- `POST /api/learn/files/<source id>/jobs` `{ converter, options, card, idempotency_key }`; `GET /api/learn/files/jobs/<job id>`;
  `POST …/jobs/<job id>/cancel`; `POST …/jobs/<job id>/retry`.
- `PUT /api/learn/files/docs/<document id>` `{ base_rev, content }` → 409 when `base_rev` is not the head.

## 5. Jobs

### 5.1 States

`queued` → `validating` → `converting` → `preparing_preview` → `ready` | `ready_with_limitations` | `failed` |
`cancelled`. Upload progress (`uploading`, `interrupted`) is the source record's and the browser's, never a job state.
A converter may skip stages. A stage has no invented percentage; byte upload is the only percentage shown.

### 5.2 Driver: one Durable Object per job, alarm-driven

`FileJobs` Durable Object class, `idFromName(job id)`, the same pattern as `RepositoryImports`. Submit writes the
`file_jobs` row (idempotency key unique), then calls the object, which stores the job and sets an alarm. Each alarm:
takes the lease (`UPDATE file_jobs SET lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<?)`), runs one
bounded step, writes the state, and re-arms while not terminal. A crashed step leaves an expired lease, and the
re-armed or retried alarm (DO alarms retry on exceptions) resumes it. `attempt` / `max_attempts` bound retries; a step
has a wall-clock budget. Cancel sets `cancel_requested`; the next step settles `cancelled`. Chosen over cron (ticks not
delivered on this account) and Queues (not bound in prod; would need a new resource). Browser polling only reads
status; it never advances a job.

### 5.3 Runner contract (converter runtime is pluggable; none chosen)

```js
export const runner = {
  converter: 'xlsx-preview', version: '1',   // stored on the job and every derivative
  families: ['workbook'],
  where: 'worker' | 'remote',                 // remote: an HTTP converter service, same shape as SCENE_WORKER_URL
  async run({ source: { bytes(), size, type, name }, options, signal, stage }) {
    // stage('converting') etc.; throw Error(userFacingReason) to fail; respect signal for cancel
    return { derivatives: [{ kind, media_type, body, coverage }], limitations: ['…'] | [] };
  },
};
```

A `worker` runner must fit the Worker CPU/memory budget measured on fixtures. A `remote` runner gets the source over a
short-lived authorized URL and returns derivatives; it holds no other credentials and has no general outbound network.
The native CAD/document runtime is an owner decision; this contract only fixes the interface.

### 5.4 Result rules

A job never writes board JSON. The card holds the job id; it reads the job and its derivatives. So a late result shows
only on a card that still references that job and source revision; a removed or undone card is not recreated; Retry
reuses the stored source and the same idempotency key family; derivatives are unique per source revision + converter
version + options, so duplicates are impossible.

## 6. Chat attachment identity

New ContextRef kind `file` (added to `chat-modes.js KINDS`, `canvases.js REF_PREFIXES` and the web validators by Lane 1):

- `sourceId: 'file:<source id>@<sha256>'` - the source and its immutable revision; `version` = the derivative/converter
  version the excerpt came from.
- `range`, one of: `{ page }`, `{ slide }`, `{ sheet, cells? }` (`cells` A1 range), `{ rows: [a, b], cols?: [a, b] }`
  (CSV/TSV), `{ start, end }` (lines), `{ cell }` (notebook cell id), `{ startSec, endSec? }`, `{ object }` (model part).
- `sameRef` (sourceId + range) is the one de-duplication rule: a card selected and then Add to chat is one ref.
- Selection context stays temporary (`selectionRef`), pinned refs stay in `attached`; clearing a selection never detaches.
- The server resolves the excerpt from derivatives under section 4.1; the board never carries the text. Coverage is one of
  `listed`, `extracted`, `partial`, `visually inspected`, `transcribed`, `unavailable`, `omitted`, said to the model and UI.
- Importing makes no model call (owner decision 7).

## 7. The 50 MiB video path (built in Lane 1 step 2)

Server: `PUT …/assets/<key>` caps by `boardFileLimit(declared type)`: 50 MiB for `video/mp4` and `video/webm` after the
first bytes sniff as MP4 (`ftyp` at offset 4) or WebM (EBML `1A 45 DF A3`), 25 MiB for everything else. The cap holds on
actual bytes: a declared Content-Length over the cap is refused at once, and the body is counted while it streams into
R2, so a missing or false header cannot pass. `GET` answers a single `Range: bytes=` request with 206 and
`Content-Range` (416 when unsatisfiable), for the owner, members and share links alike. Client: `syncAssets` uses the
same `boardFileLimit`, so a supported video is uploaded with the board; a file the server refuses shows its reason once.

## 8. Lanes and ownership

| Lane | Owns |
|---|---|
| 1 Foundation | this document, `file-capabilities.js`, migration 0023, `/api/learn/files*`, `FileJobs`, `fileRef` in `assetKeysOf`/`boardAssetKeys`, ContextRef kind `file` |
| 2 Documents | text, Markdown, code additions, notebooks, CSV/TSV, workbooks, Word, PDF, PPTX adapters |
| 3 Media | images, SVG, audio, video adapters |
| 4 Models | glTF/GLB, OBJ/FBX/STL/3MF, STEP, PLY, splats |
| 5 Integration | access checks, fixtures, format report |

Lanes 2-4 add a family's adapter, its card, its `limits` and its `can.*` flags in `file-capabilities.js` only for their
own families, and change `LearnPage.jsx` / `AdaptiveCanvas.jsx` through focused adapter modules, not broad edits.

## 9. Built so far

Filled in by Lane 1 per step (SHAs in `C:/s/spec/fi-lane1-report.md`).

## 10. Lane 4: models, CAD, PLY and Gaussian splats (feature/fi-3d)

Report and measurements: `C:/s/spec/fi-lane4-report.md`. Modules (all lazily imported except `model-drop.js`):

| Module | Role |
|---|---|
| `model-drop.js` | eager, about 1 KB: which dropped names go to the model importer; reads a dropped folder (`webkitGetAsEntry`, files carry `bundleRoot`/`bundlePath`, at most 512) |
| `model-formats.js` | structure sniffing per extension, PLY header -> mesh / points / splat (inconsistent schemas refused), dependency resolution only inside the bundle, budgets |
| `model-archive.js` | model ZIPs: central directory checked before inflating (no traversal, symlink, encryption, ZIP64; at most 512 entries, 200 MiB expanded, ratio 200), entries inflated in 16 KiB slices bounded by the declared size; `packBundle` stores loose files as one ZIP |
| `model-import.js` | files -> cards: one card per model (its dependencies packed with it), one card per ZIP or folder (a choice when it holds several models), unused loose files back to the ordinary drop |
| `model-loaders.js` | three.js loaders (GLTF + meshopt, OBJ + MTL, FBX, STL, 3MF, PLY) and Spark; one `LoadingManager` URL modifier answers only bundle files, every other URL gets an empty `data:` URL and is listed |
| `three-d-renderer.js` | the existing viewer, extended: `options.load`, `fit()`, `camera()`, `poster()`, context-loss handling (`onLost`; nothing is persisted after a loss) |
| `ModelCard.jsx`, `viewer-slots.js` | the card: explicit Interact state (Esc first, `data-viewer-active` makes the canvas key handler stand down), at most 3 live renderers, posters (this browser only) off-screen, missing / blocked dependency list with Add files, Download original |
| `model-cad.js` | STEP card states from the job and the derivatives it expects (below) |

Card record today (pre-`fileRef`, so it persists through the existing board-asset path): `{ type: 'file', kind: 'model',
assetKey: 'model:<uuid>', label, size, model: { v: 1, family, format, render: 'mesh'|'points'|'splat'|'cad', package:
'file'|'zip', entry, entries?, download, counts?, units? }, camera, animation? }`, about 300 bytes. `assetKeysOf` already
reports `assetKey`. When `fileRef` lands, `model` maps to `fileRef.view` (`entry`, `camera`) and `fileRef.meta`.

Libraries: `@sparkjsdev/spark` 2.3.1 exact (MIT, Copyright 2025 World Labs Technologies, Inc.; npm integrity
`sha512-K+SyIbkO/dx1TLLudK8Jp3/noS13z/kdNPo6OK2waxQaGy81HBmKGnNBT/t/K9Ew3dsIXmWqsJXxGfmAu1T5Jg==`; peer `three >=0.180.0`,
verified with three 0.186.0; its WASM and worker are inlined, and with `fileBytes` it fetches nothing), which brings
`fflate` 0.8.3 (MIT). three.js loaders and three's bundled fflate and meshopt decoder are MIT (three 0.186.0, already a
dependency). three 0.186's own Gaussian-splat loaders need the WebGPU renderer and have no SOG reader, so Spark is used.

Limits (`MODEL_LIMITS`, moves into `file-capabilities.js`): source 25 MiB (the general board-file cap); viewer budgets
1,000,000 triangles, 1,500,000 vertices, 1,600,000 points, 1,500,000 splats, 256 MiB decoded textures, 5,000 nodes,
5,000,000 accessor elements. Above a budget the card keeps the original and says why it does not render.

STEP derivatives the card expects from the `step-glb` converter (via the JOBS lane's runner): `mesh` = `model.glb`
(glTF 2.0, metres, Y-up, one node per assembly part named after it, within 20 MiB / 5,000,000 accessor elements);
`structure` = `structure.json` `{ units, unit_scale_to_m, parts, solids, tree: [{ name, children? }], bbox: { min, max }
(source units), limitations? }`; `poster` optional (the card draws one from the mesh when absent). Units are shown only
when `structure.units` is reported; the card never claims CAD features, tolerances or a feature tree survive.
