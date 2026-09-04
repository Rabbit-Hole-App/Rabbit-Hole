# web — /apps dashboard

`packages/web`: React + Vite + Tailwind + shadcn-style primitives. Built assets are
served by the small-cp Worker (`assets` in wrangler.jsonc → `../web/dist`), so the
dashboard is same-origin with `/api` and the session cookie just works.

> Deviation from the original ask ("Cloudflare Pages"): Pages lives on `*.pages.dev`,
> the control plane on `*.workers.dev` — no shared domain exists, so the cookie would
> never reach `/api`. Worker static assets deliver the actual goal (same origin).

## Rules
- The web app calls the control plane's existing `/api` routes and nothing else.
  No backend of its own, no direct Fly or D1 access. A page needing new data adds
  the route to the control plane in the same branch.
- `packages/cli` untouched.

## One page: /apps
- Lists every app in the org from `GET /api/apps`: name, kind (server/job), URL,
  visibility, member count, last deployed.
- Jobs: a Run button (visible on row hover) calls `POST /api/runs`, opens a panel
  polling `GET /api/runs/<id>` every second until it finishes; shows exit code and
  duration.
- Servers: an Open link to the app URL.
- Every app: a Runbook tab rendering markdown from the app row's `runbook` column.
  Nothing populates the column yet (CLI untouched) — panel shows "No runbook yet."
- Auth: existing magic-link login; a 401 from `/api/apps` redirects to `/login?next=/apps`.

## Control-plane changes (same branch)
- `/api/*` accepts the browser session cookie as well as the CLI Bearer token.
- `GET /api/apps` adds org, kind, url, member_count, deployed_at, runbook.
- `GET /api/runs/<id>` adds startedAt/finishedAt (duration in the log panel).
- `deployed_at` stamped on `POST /api/deploy` and `POST /api/image`.
- Migration `migrations/0003-web.sql` (deployed_at, runbook) — run on the live D1
  **before** deploying the worker.

## Commands
- `make web-dev` — Vite with `/api` (and `/login`, `/auth`, `/a`) proxied to
  SMALL_API from repo-root `.env`.
- `make web-deploy` — build `packages/web`, deploy the worker (assets ride along).
  Same as `make cp-deploy`.
- `make web-test` — Playwright: bypass login, sees counter + s3-log-writer, runs the
  job, waits for `finished (exit 0)` in the log panel. Needs `.env` with SMALL_API +
  SMALL_TEST_BYPASS and the live worker deployed from this branch.

## v2 additions
- Runs history: the panel's Run tab is now **Runs** — past runs from `GET /api/runs?app=`
  (glyph, local start time, who, duration), click one for its log. Run detail shows
  started/finished times; live runs keep the 1s poll.
- Members: avatar stack (initials, Notion tag palette hashed by email, owner first,
  +N overflow) instead of a count. `/api/apps` returns `members` (emails) + `canEdit`.
- Last run column on job rows: ✓/✗ + relative time, spinner while running (`lastRun`
  in `/api/apps`).
- Run button always visible; while a run is live it becomes **Stop** — new
  `POST /api/runs/<id>/stop` force-destroys the run's Fly machine (machine_id stored
  on runs at start, migrations/0004-stop.sql) and marks the run `stopped`. The
  runner's dying last post can't overwrite it (`AND status='running'` guard).
- Cron schedule: its own column, human-readable (`daily 09:00`, `09:00 Mon–Fri`,
  `every minute` — raw cron on hover, UTC). Paused schedules render struck-through +
  dimmed. Repeated in the panel header. Cells nowrap — no cramped two-line rows.
- Runbook: the tab IS a **BlockNote** (`@blocknote/shadcn`) editor, Notion behavior —
  no Save/Cancel; edits autosave (debounced 800ms, flushed on close) via
  `POST /api/runbook` (canEdit, ≤500KB); Ctrl+Z is BlockNote's own history; a quiet
  saved/saving status sits bottom-right. Viewers without edit rights get the same
  render read-only. Storage is BlockNote block JSON (v2 stored markdown — lossy, the
  saved page never matched the editor); legacy markdown rows are sniffed
  (JSON.parse fails → `tryParseMarkdownToBlocks`). Editor chunk is lazy-loaded.
  Panel is non-modal (`modal={false}`) so BlockNote's portaled menus stay clickable. Setup that BlockNote requires from the host app (side
  menu/drag/file panel break without it): `@source '../../../node_modules/@blocknote/shadcn'`
  in index.css so our Tailwind generates its utilities, plus the shadcn CSS
  variables (defined on :root, mapped to the Notion palette). ponytail: no image
  uploads (image block by URL only — R2 when asked).
- Excalidraw in runbooks: type `/excalidraw` (aliases: drawing, sketch, diagram) in
  the editor's slash menu — inserts a canvas block; the scene (elements) lives in the
  block's props so it rides the normal runbook autosave. Read-only for viewers
  (viewModeEnabled). One React copy enforced via root package.json
  `overrides` + direct deps (react 19) — npm workspaces hoisted a second react@18
  for @blocknote/@base-ui peers, which crashes React ("older version rendered").
  Two integration pins: `createReactBlockSpec` returns a factory in BlockNote 0.54
  (call it), and `.excalidraw .SVGLayer` needs `pointer-events: none !important`
  in our cascade or its full-viewport svg swallows every canvas gesture.
- Responsive: sidebar hides below md, table scrolls horizontally in its own
  container, content padding steps down (96px → 32px → 16px), panel is
  `w-[560px] max-w-full`.
- Stale runs: a runner can only report while its 6h run token lives, so runs
  'running' longer are dead machines — swept to `failed` (finished_at left NULL,
  no fake duration) lazily on `/api/apps` and `/api/runs` list reads. Durations
  render humanized (`4m 12s`, `2h 05m`).

## v3: share page (/apps/<slug>)
The Google-Doc promise, no terminal. Landing = the rendered runbook (BlockNote,
editable for owner/edit members, read-only otherwise), Open (servers) / Run (jobs,
reuses the run panel) at the top, `Owned by …` line, `Last opened by … · 2h ago`
from request_logs (query is try/caught — the table ships with the request-logs
branch), Copy link (copies the share-page URL). Share popover top-right:
visibility toggle (domain/private via PATCH `/api/apps/<slug>`), people list
(role select + hover-remove via `/api/share` upsert + new POST `/api/unshare`),
email+role field. Viewers see it read-only. Access denied: same-org 403 carries
the owner + a Request access button (POST `/api/apps/<slug>/request-access`,
Resend email to the owner); cross-org strangers/ex-members get 404-flavored
denial — existence is not revealed. New GET `/api/apps/<slug>` resolves the slug
for cross-org members via their membership row (org first). `/api/apps` list no
longer leaks runbook/members/lastRun of private apps to non-members (adds
canView; members now carry roles). Routing is hand-rolled (pushState + popstate)
— two pages don't need a router dep. ponytail: groups, link-sharing without
email, share expiry — all skipped until asked.

## Serving (hard-won)
The SPA shell is bundled INTO the worker (esbuild Text rule imports
`../web/dist/index.html`) and served at `/apps` + `/dash` with `Cache-Control:
no-store`; only hashed immutable chunks live on the ASSETS binding, under
`/static/*` (vite `build.assetsDir`). Why: on workers.dev, responses the asset
subsystem once served (`/apps` shell via ASSETS.fetch, `/assets/*`, even 404s
for probed-before-upload chunks) stayed pinned in Cloudflare's edge cache
ACROSS DEPLOYS — stale HTML + 405s that never reached the worker, for ~40 min.
There is no purge API for workers.dev. Never serve mutable content through the
asset binding; never probe asset URLs before they're uploaded.

## Look
Notion, not "inspired by": Inter 14px/1.5, text `#37352F`, secondary `#787774`,
borders `#E9E9E7`, hover `#F1F1EF`, sidebar 240px `#F7F7F5`, one accent `#2383E2`.
Content pane max 900px, left-aligned, 96px margins. 36px quiet rows, pills for
properties, no zebra/borders. No top nav; breadcrumb in the content pane. Lucide
icons, monochrome. Run button appears on hover; log/runbook panels slide in from
the right.

## Skipped
- ponytail: share page, settings, dark mode — next dashboard steps per PRODUCT.md.
- ponytail: nothing writes `runbook` yet — add a `runbook` field to small.toml and
  send it from `small deploy` when the CLI may change.
- ponytail: run history list — panel shows only the run it just started.
