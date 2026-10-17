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
- A `fileRef` is **not** a board file: `assetKeysOf` and `boardAssetKeys` never list it, so the browser never uploads it
  as a board asset and a fork never copies its bytes (tested in `learn-files.test.js`). The board's file list for a
  `fileRef` is `fileRefSources(state)` (`packages/control-plane/src/file-refs.js`) and its authorized form is
  `file_source_refs` (section 4.1).
- Copy/fork copies the `fileRef` (sources are immutable; no live link). A card's `doc` is copied as a new document at the
  same revision content, never shared between boards.

## 4. Records (LEARN_DB) and R2 layout

Migration `packages/control-plane/learn-migrations/0023-file-imports.sql` (Lane 1), additive and re-runnable, mirrored
into `repository-schema.sql`. Times are Unix milliseconds.

**Applied:** the local stack (`C:/s/toc-fimport/local`), and shared learn-dev by the lead on 2026-10-16 at about 5:55 PM PT
from 9d0d1b75 (migration id `0023-file-imports`). Learn-dev before: `learn_boards` present, no `file_*` tables. One
attempt, `rows_written` 25. After: the 6 tables and 5 indexes present. **0023 is now frozen:** any change to these tables
is a new migration (0024 or later). Not applied to production.

Owner decision B allows shared learn-dev after local verification and the lead's review: the target is `rabbit-hole-learn-dev`
(`028f800f-ce8e-4461-adb2-827f417492eb`, account `c08d3dbdc53a3afd3cb09a536ac42318`, bound as `LEARN_DB` in
`packages/control-plane/wrangler.rabbit-hole-dev.jsonc`, `packages/web/wrangler.dev.jsonc` and `wrangler.parallel.jsonc`),
applied the way `dev-auto-deploy.md` records for 0004-0010:
`npx wrangler d1 execute rabbit-hole-learn-dev --remote --config wrangler.rabbit-hole-dev.jsonc --file learn-migrations/0023-file-imports.sql -y`
from `packages/control-plane`, coordinated by the lead. Production needs its own approval. Rollback: none needed; the
tables are new and no existing code reads them.

| Table | Purpose | Key columns |
|---|---|---|
| `file_sources` | one immutable original | `id`, `org`, `owner_email`, `app`, `board_id` (origin), `family`, `name`, `media_type` (verified), `declared_type`, `bytes`, `sha256`, `r2_key`, `status` (`uploading`, `stored`, `failed`, `deleted`), `created_at`, `stored_at`, `deleted_at` |
| `file_derivatives` | a preview, poster, text, mesh, playback copy; one row per converter output | `id`, `source_id`, `source_sha256`, `kind`, `name` (the converter's output name, e.g. `slide-001.png`), `converter`, `converter_version`, `options_hash`, `status` (`pending`, `ready`, `failed`), `media_type`, `bytes`, `sha256`, `r2_key`, `coverage_json` (small), `error`, `created_at`, `updated_at`; UNIQUE (`source_id`, `source_sha256`, `kind`, `converter_version`, `options_hash`, `name`), so a multi-output kind such as `slide` holds one row per output |
| `file_jobs` | durable conversion/extraction work | `id`, `org`, `owner_email` (initiator), `app`, `board_id`, `card_id`, `source_id`, `source_sha256`, `converter`, `converter_version`, `options_json`, `idempotency_key`, `state`, `stage`, `attempt`, `max_attempts`, `lease_until`, `cancel_requested`, `derivative_ids_json`, `limitations_json`, `error`, `created_at`, `updated_at`, `started_at`, `finished_at`; UNIQUE (`org`, `owner_email`, `idempotency_key`). Backoff counters live in the Durable Object's own storage, not here |
| `file_documents` / `file_document_revisions` | edited text/code/notebook content | document `id`, `org`, `owner_email`, `app`, `board_id`, `source_id`, `source_sha256`, `head_rev`; revision (`doc_id`, `rev`) PK, `parent_rev`, `r2_key`, `bytes`, `sha256`, `created_by`, `created_at` |
| `file_source_refs` | the authorized references: which boards may read a source | (`source_id`, `board_id`) PK; rewritten in the board write's batch, like `learn_canvas_refs` (section 4.1) |

**Extracted text derivative** (lead ruling, 2026-10-16; the CHAT lane reads it): `kind` `text` (or `transcript` for audio
and video), `media_type` `application/json`, R2 body
`{"v":1,"units":[{"loc":<range>,"text":"..."}],"complete":true|false,"limited":"..."}` (`limited` optional). `loc` is
one range shape: `{page}`, `{slide}`, `{sheet, cells?}`, `{rows:[a,b], cols?}`, `{start,end}`, `{cell}`,
`{startSec, endSec?}` or `{object}`. `coverage_json` = `{complete, limited}`. A `text/plain` text derivative counts as one
unit with no `loc`. The chat resolver caps each ref at 4,000 characters and each turn at 12,000, and labels each result
extracted, partial, transcribed, listed, unavailable or omitted.

R2 keys on the existing `LEARN_MEDIA` bucket (dev `rabbit-hole-dev-learn-media`, prod `rabbit-hole-prod-learn-media`):

- `file-sources/<source id>/original/<upload attempt>` (each upload streams to its own key; `file_sources.r2_key` points
  at it only once its byte count and sha256 match, so a bad or concurrent upload never replaces stored bytes)
- `file-sources/<source id>/d/<derivative id>`
- `file-docs/<document id>/<rev>`

Keys carry random ids only; access is decided in D1, never by knowing a key. Bytes are uploaded under a source id the
server issued and are never overwritten once stored.

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

Owner decision D (2026-10-16), binding on every lane:

- A file intentionally attached to a shared board (a card on it) may be previewed **and downloaded whole** by anyone
  authorized to view that board. This grants the **complete original**, even when the card previews only selected
  pages, slides or sheets. The UI that shares a board must not suggest otherwise.
- It never exposes the owner's unrelated private Context files or any other asset of the uploader: only sources a card
  on that board's saved state references.
- Every original, derivative and dependency request is authorized through the board/access relationship. An asset id
  alone never grants access. No permanent public raw-storage URL appears in a shared card.
- A fork reuses the immutable source bytes through its own authorized reference (its own saved card); nothing is
  re-uploaded. Editable document revisions stay independent: editing a fork never edits the source board's document.
- Removing one reference never deletes bytes another authorized board uses (`file_source_refs`). A source is deleted only
  when no reference remains and its retention has passed; deleting a source, revoking a share and existing forks each get
  a test in the lane that implements deletion.

**The one helper:** `authorizeFileSource(req, env, sourceId, through)` in
`packages/control-plane/src/file-access.js` (built, tested in `test/file-access.test.js`). `through` is `{ token }` (a
share or publication link; `sharedAccess` decides who it admits), `{ row }` (a `learn_boards` row the caller already
authorized for this requester: their own board, a fork, a member board), or nothing (the source's owner only). It
returns `{ source, via: 'owner' | 'board' | 'link', board? }` or a Response: 401 to sign in, otherwise the same 404 for
every refusal. `fileRefSources(state)` lists a state's referenced source ids. Every file route calls it; none checks
access its own way.

**A reference authorizes only when it is a `file_source_refs` row** (`packages/control-plane/src/file-refs.js`, built,
tested in `test/file-access.test.js`), never because a card merely names an id:

- Every board write rewrites the board's rows in the same batch as the write, guarded on the row that write produced (a
  rejected or stale save changes nothing): `saveOwn` (insert and update, so sharing too) and fork/duplicate.
- A save indexes the sources its cards name **that the saver owns**, and keeps a row the board already held while a card
  still names that source. A card naming another account's source id indexes nothing and reads nothing.
- A fork or duplicate inherits the rows of the board it was read from, for the sources its copied cards name, so it reads
  the same immutable bytes through its own reference; revoking the original link later does not take it back.
- Removing the card removes that board's row only; another board's row for the same source stays. A permanent board
  delete (`canvases.js`, `dives.js`) drops its rows in the same batch (`dropFileRefs`). Bytes are never deleted here.

**Canvas members** (lead ruling, 2026-10-16): reads accept `?member=<board id>`, the convention the JOBS routes use, checked
by `canvas-comments.js` `memberContext` (the owner or an active member, board not in Trash); then `{ row }` is that board.
A removed member gets 404. Adding a file to a board needs write access to it. Members can view a canvas but cannot edit
it (no member board write exists today), so a member's create is 403 and the owner's is allowed through the same
`member` field. If member editing is added, the same check admits editing members.

### 4.2 Routes (Lane 1; the three source routes are built in `packages/control-plane/src/learn-files.js`)

- `POST /api/learn/files` `{ app, board, name, type, size, sha256, family, member? }` → `{ source, upload }`
  (idempotent on owner + sha256 + size + family: an already stored identical source is returned, no second upload).
  The source is not readable through the board until a save of a card naming it indexes it (section 4.1).
- `PUT /api/learn/files/<source id>` raw bytes, by the source's owner → the server sniffs (families with a sniff), counts
  actual bytes (exactly the declared size; more is cut off with 413) and hashes while streaming, and marks `stored`
  only when count and sha256 match: this PUT is the finalize step. A family's cap is `limits.bytes`, or 25 MiB until its
  lane measures one. Create reuses the owner's stored source with the same sha256, size and family (`upload: null`), or
  resumes their unfinished upload of it.
- `GET /api/learn/files/<source id>` the original as an attachment (`filename*`), with Range; `?share=<token>` for a link
  viewer, `?member=<board id>` for a canvas member, `?app=&board=` through the requester's own board (a fork), else the
  owner only; all via
  `authorizeFileSource`. Derivatives: the JOBS lane's `GET /api/learn/files/sources/<source>/derivatives` (section 5.3).
- Mounted in `dev-worker.js`; `filesFetch` answers only `/api/learn/files` and `/api/learn/files/fs_*` and returns null
  for every other `/api/learn/files` path, so the JOBS routes mount beside it.
- `POST /api/learn/files/<source id>/jobs` `{ converter, options, card, idempotency_key }`; `GET /api/learn/files/jobs/<job id>`;
  `POST …/jobs/<job id>/cancel`; `POST …/jobs/<job id>/retry`.
- `PUT /api/learn/files/docs/<document id>` `{ base_rev, content }` → 409 when `base_rev` is not the head.

Converter callback routes (JOBS lane; the converter calls these, never a browser):

- `GET /api/learn/files/jobs/<job>/source` - the job's source bytes.
- `POST /api/learn/files/jobs/<job>/attempts/<n>/progress | complete | fail`.
- `PUT /api/learn/files/jobs/<job>/attempts/<n>/outputs/<name>` - one output, staged at
  `file-jobs/<job>/<attempt>/<name>`; `complete` copies each staged output to `file-sources/<source>/d/<derivative id>`
  and writes its `file_derivatives` row (unique key above, so a repeated `complete` cannot duplicate).
- Auth: `Authorization: Bearer <callback token>`, an HMAC over (job, attempt) keyed by the Worker secret
  `FILE_JOB_SECRET`. It is a new secret and is never `CONVERT_TOKEN`. A callback for any attempt but the job's current one
  is refused, so a late or killed attempt cannot write results.

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

### 5.3 Runner contract (portable; the converter host is not fixed by it)

The **only remote runner** is the push-based converter API (`feature/file-convert` ea3bd779, its section 1): the
control plane dispatches an attempt to `CONVERT_URL` with `CONVERT_TOKEN`, and the converter pulls the source and pushes
progress, outputs and the result through the callback routes in section 4.2. Owner decision A: for dev that converter is
one dev-only Fly app; the contract stays portable, so Fly for dev does not decide production hosting. Ordinary Workers and
Cloudflare Containers are different products; neither is assumed here.

- The control plane persists the job (`file_jobs` row, then the Durable Object's state) **before** dispatch, and wakes
  or re-dispatches it without a browser.
- A step that dies (converter killed, Worker evicted) leaves an expired lease; the next alarm recovers it with a new
  attempt number, and callbacks of the old attempt are refused.
- Retries are duplicate-safe: the idempotency key on the job, the per-attempt staging prefix and the derivative unique
  key mean a retried or repeated completion never creates a second derivative or a second card.
- Concurrency is bounded by `FILE_JOB_CONCURRENCY` (default 2). No cron.

In-Worker runners (conversion inside the Worker isolate) are **not built in this task**.

JOBS lane additions (efc63ef0, approved by the lead):

- `FILE_JOB_ORIGIN` (var): the control plane's own origin, used to build the source and callback URLs handed to the
  converter.
- `CONVERT_URL` must be https, except http on `127.0.0.1` or `localhost` for the local stub.
- The job submit body carries `app` and `board`.
- Share viewers read job status at `GET /api/learn/files/jobs/<id>?share=<token>`, only for a job of that link's own
  board.
- **Fork ruling:** a card never depends on its job to find its results. `GET
  /api/learn/files/sources/<source>/derivatives?sha=&converter=&options=` returns the ready derivatives only, authorized
  through `authorizeFileSource` (`{ row }` for the requester's own board, or `{ token }`). JOBS builds it. So a fork or a
  copy finds the same derivatives by source revision, converter and options, without the original job.
- Retry gives the job a fresh 3-attempt budget; `attempt` stays below 100.
- Staged outputs under `file-jobs/<job>/<attempt>/` are deleted 24 hours after the attempt is terminal, by the
  `FileJobs` alarm.

Configuration (JOBS lane adds the dev and parallel configs; prod stays out until release): secrets `CONVERT_TOKEN`,
`FILE_JOB_SECRET`; vars `CONVERT_URL`, `FILE_JOB_ORIGIN`, `FILE_JOB_CONCURRENCY`; Durable Object binding `FILE_JOBS`, class `FileJobs`,
migration tag `file-jobs-1` (`new_sqlite_classes`).

### 5.4 Result rules

A job never writes board JSON. The card holds the job id; it reads the job and its derivatives. So a late result shows
only on a card that still references that job and source revision; a removed or undone card is not recreated; Retry
reuses the stored source and the same idempotency key family; derivatives are unique per source revision + converter
version + options, so duplicates are impossible.

## 6. Chat attachment identity

New ContextRef kind `file` (added to `chat-modes.js KINDS`, `canvases.js REF_PREFIXES` and the web validators by the CHAT
lane, `feature/fi-chat`):

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
| 1 Foundation | this document, `file-capabilities.js`, migration 0023 (every table, the job table included), `file-access.js`, `file-refs.js`, `learn-files.js` (source routes), the 50 MiB fix |
| CHAT (Toolbar session, `feature/fi-chat`) | ContextRef kind `file` in the validators and the chat resolver (section 6) |
| JOBS (`feature/fi-jobs`, merges Lane 1) | `FileJobs` Durable Object, leases, dispatch, callbacks, results, cancel and retry, its configs |
| 2 Documents | text, Markdown, code additions, notebooks, CSV/TSV, workbooks, Word, PDF, PPTX adapters |
| 3 Media | images, SVG, audio, video adapters |
| 4 Models | glTF/GLB, OBJ/FBX/STL/3MF, STEP, PLY, splats |
| 5 Integration | access checks, fixtures, format report |

Lanes 2-4 add a family's adapter, its card, its `limits` and its `can.*` flags in `file-capabilities.js` only for their
own families, and change `LearnPage.jsx` / `AdaptiveCanvas.jsx` through focused adapter modules, not broad edits.

## 9. Built so far

First release scope (owner decision E): this foundation and the 50 MiB video fix only. Formats not built stay
`planned` in the registry and are not offered. SHAs per step in `C:/s/spec/fi-lane1-report.md`.

| Piece | State |
|---|---|
| `file-capabilities.js` registry: families, `boardFileLimit`, `formatBytes`, `familyOf`, `acceptList` | built; unit-tested (`file-capabilities.test.mjs`) |
| 50 MiB video: server cap on actual bytes, sniff, streamed R2 put, Range; client `syncAssets` on the same cap | built; unit-tested (`learn-boards.test.js`); browser-verified on the local stack (`canvas-file-drop-check.mjs`: 34 MiB WebM uploaded, checksum, range, fresh-browser play and seek; 50 MiB accepted, +1 and chunked +1 refused) |
| Migration 0023 | built; applied to the local stack and to shared learn-dev (lead, 2026-10-16 ~5:55 PM PT, from 9d0d1b75); not production |
| Registry in the picker, drop classifier and import limits | built: the picker `accept` is `acceptList()`, `learn-drop.js` and `learn-file-import.js` read their types and limits from the registry, and every size reads in MiB |
| `file-access.js` `authorizeFileSource` | built; unit-tested (`file-access.test.js`) |
| Source routes: create, upload (finalize), download | built; unit-tested (`learn-files.test.js`); real Worker on the local stack (`file-sources-check.mjs`, 30 MiB) |
| `file_source_refs` on every board write; references-only authorization; members through `?member=` | built; unit-tested (`file-access.test.js`, `learn-files.test.js`); real D1 on the local stack (`file-sources-check.mjs`) |
| ContextRef kind `file` | CHAT lane (`feature/fi-chat`) |
| Job runner | JOBS lane |
