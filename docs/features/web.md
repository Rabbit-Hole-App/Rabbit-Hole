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

## v4: folders, teams, design system
- Sidebar: « collapses (persisted in localStorage, » reopens), org-wide folders —
  create with the hover +, drag apps in/out (HTML5 DnD → PATCH `/api/apps/<slug>`
  `{folder}`), delete returns apps to root. `folders` table + `apps.folder_id`
  (migrations/0006-folders-teams.sql).
- Teams: #finance is a live reference, not a copy — `teams`/`team_members`/`app_teams`
  tables; every access check (`memberRole`) unions direct membership with team
  membership, 'edit' beats 'view'. Share popover accepts `#name` (with suggestions),
  team rows carry role select + hover-remove; sidebar Teams section manages members
  in a slide-in panel. Routes: GET/POST `/api/teams`, POST `/api/teams/<name>/members`
  (add/remove), `/delete`, team fields on `/api/share`+`/api/unshare`.
  ponytail: any org member can manage folders/teams — org-internal organization, not
  an access boundary.
- Design system in `packages/web/DESIGN.md` + `src/ui.jsx`: 7 colors, type scale
  (28px/700 page titles), `PillButton` (Notion's bordered hover "⧉ OPEN" affordance —
  side peek on row hover; Run/Stop use it too), `IconBtn`, global hand-cursor rule,
  hover always `--color-hover`, panels slide 320ms easeOutExpo.
- e2e runs the production bundle (`vite preview` webServer) — dev-mode cold compile
  of the BlockNote/Excalidraw graph blew test budgets and masked real failures.

## v5: design/ implemented
The measured Notion spec (`packages/web/design/` — notion.md, components.html,
flow.md; read-only) is now the app: full token swap + component kit in ui.jsx
(Button primary/secondary/ghost, Input, Pill w/ tag palette, StatusPill, Menu,
toast/Toasts, EmptyState, SkeletonRows), 40px titles, 16px body, sidebar per
flow §1 (workspace row, Search w/ ⌘K, + copies `small deploy` with a toast,
Recent from localStorage, Members, email pinned), app page per flow §3
(properties line incl. Source from provenance fields now returned by GET
/api/apps/<slug>, tab bar Runbook·Run·Logs — Logs = runs database for jobs,
request log w/ rejected pills for servers, side-peek on row click), /members
(people derived from shares + Groups = teams), ⌘K search modal (apps +
runbook text), ⌘\ sidebar toggle, restyled worker login page. Fixed for real:
shadcn's semantic `--accent` was clobbering brand accent globally (the old
"grayed Save button") — now scoped to `[class*='bn-']` only.
ponytail: [inputs] run forms, sidebar drag-resize, column resize/multi-select,
invite emails, admin roles, /settings — per flow.md, when asked.

## v6: shell, inline groups, delete, resize
- One `Shell` owns the sidebar on every page (flow §1 "always present" — the app
  page too): /api/apps fetch, persisted collapse, » reopen, Ctrl+\.
- Sidebar drags to resize (200–400px, persisted, default 260).
- Groups edit inline on /members (expand a row: add email, hover-✕ remove, delete
  group) — the slide-in TeamPanel is gone.
- `SlidePanel` replaces the radix side peek: mounted transform transition
  (220ms, GPU) that eases in AND out — an actual slide.
- Delete app: sidebar ⋯ and app-page ⋯ (owner only) → the one confirm modal
  (name in body, red primary) → new DELETE `/api/apps/<slug>` destroys the Fly
  app (`destroyFlyApp`) then every D1 row. "Hide" = make it private in Share
  (content invisible to non-members) or drop it in a folder; ponytail: per-user
  hide-from-sidebar skipped until asked.

## v7: trash, members pool, workspace menu
- Delete = Trash (soft): `deleted_at` stamp (0008-trash.sql); the app vanishes
  everywhere (appRow filters), the Fly app stays so Restore is instant; sidebar
  Trash panel lists org's trashed apps w/ owner-only Restore; daily 3am cron
  purges 30-day-old items (destroyFlyApp + all rows). Redeploying a trashed name
  revives it. Every entity delete confirms via the modal (app, folder, group,
  member-pool removal); chip removals stay one-click.
- Members pool: `org_members` (0006) + GET/POST `/api/members` — Add person on
  /members; groups only accept known people (server-enforced: org_members ∪
  owners ∪ shares ∪ team members) with autofill suggestions from the pool.
  Group row ⋯ menu: Rename (POST `/api/teams/<name>/rename`) + Delete.
- Workspace row: pretty name (gmail-com → Gmail), dropdown with profile email,
  Settings (stub), New workspace (stub — one org per domain), Log out (new
  `/logout` clears the cookie). Sidebar highlights the active page (`bg-active`).

## v8: sections, folder sharing, duplicate
- Sidebar sections: Apps (workspace, with folders) · Shared (with me — incl.
  cross-org apps, now listed by `/api/apps`' second query) · Private (my
  private apps). Section labels click through to a filtered overview
  (`/apps?s=shared|private`); dragging an app between sections PATCHes its
  visibility; dropping on a folder also files it.
- Folder ⋯ menu: **Share folder** (new `folder_shares` table, 0008 — a live
  grant with email or #team + role over every app in the folder, enforced in
  memberRole/appForUser/apiApps), Rename (`POST /api/folders/<id>/rename`),
  Delete (confirm modal). Shared folders show a small people glyph.
- App ⋯ gains Duplicate (`POST /api/apps/<slug>/duplicate`): fresh owned copy
  (metadata, runbook, image; schedule starts paused; jobs immediately runnable,
  servers need one redeploy). Delete is labelled "Move to Trash" everywhere.
- Breadcrumbs use the workspace name (Gmail, not gmail-com) and every segment
  is a hover-highlighted button; Recent shows 3; group names are validated
  client-side with a toast (server always rejected bad ones).

## v9: autocomplete + app rename
- `ShareInput` (ui.jsx): every sharing field autocompletes from the org's people
  pool + #teams — the app Share popover (people AND teams now), the folder share
  panel, and group-add on /members. ↑/↓ + Enter picks; Enter with nothing
  highlighted submits the typed value; picked/typed entries excluded once shared.
- App rename: `POST /api/apps/<slug>/rename` (canEdit; slug = URL, so links
  change; request-log history follows; a small.toml still carrying the old name
  deploys a fresh app). UI: click the app-page title to edit (Notion-style,
  canEdit only) or sidebar ⋯ → Rename; both toast and refresh the sidebar.
  Fixed while wiring: the request_logs slug-update 500'd fresh DBs mid-rename
  (table ships with another branch) — now try/caught like lastOpened.

## v10: drag confirm + fixes
- Fixed: Sidebar used ShareInput without importing it — the folder share panel
  crashed on open (esbuild doesn't flag free identifiers; runtime ReferenceError).
- Fixed: an app made private via the popover while filed kept its folder_id and
  listed twice (folder + Private). Folders now render workspace-visible apps only.
- Drag & drop: targets (folders, Apps root, Private) highlight `bg-active` +
  outline while dragging; every drop opens a confirm modal saying what changes
  ("Move X into folder Y?" / "Move X to Private? — only people it's shared with
  keep access"); no-op drops (same place) are ignored; drops outside a target cancel.

## v11: run surface — Run tab, side peek, runs database
- Schema plumbing: `small deploy` now sends the small.toml `[inputs]`/`[outputs]`
  tables (2 fields in the deploy body — the one CLI change); the worker stores
  them on the app row (migration 0010, >20KB rejected at deploy, never truncated)
  and `GET /api/apps/<name>` returns them parsed. `GET /api/runs?app=` includes
  each run's `inputs`; `GET /api/runs/<id>` adds `startedBy`, `app`, and
  `inputFiles` (R2-stored input files with sizes); input-file GET accepts a
  session/CLI token with canView, not just the runner token. Output GET serves
  real content types for what the dashboard inlines (jpg/png/gif/webp/json/csv/
  txt, nosniff; svg stays octet-stream — inline svg on this origin is stored XSS).
- Run tab (`run.jsx` RunForm, flow.md §3b): one row per input — label 200px,
  control 320px, help under. file → dropzone w/ accept, number w/ min+max →
  slider + 64px field (without → plain field), select → dropdown (search past 6
  options; `multiple` → Chk group per explicit request), date → date input +
  relative text, bool → toggle, text → pattern validated on blur. Defaults
  prefilled; client-side validation mirrors cli/lib/inputs.js; errors under the
  field in danger w/ red border. Multipart post (`body` + `input:<name>` parts)
  when files, JSON otherwise. Last-run line shows when/who/status/duration
  (the "Run again with those inputs" link was cut on request — run-again lives
  in the peek footer and the table's hover ▶; both prefill scalars, files re-picked).
- Side peek (RunPeek/RunView, §4): 480px SlidePanel — ⤢ opens
  `/apps/<slug>/runs/<id>` (real route, same RunView full-page), Esc closes,
  page behind stays live. Props line: status pill · person (cron = clock
  avatar) · started (relative, full on hover) · duration. Inputs as a plist
  with type icons + file size/download; Output: declared outputs first with
  labels, images <2MB as 200px thumbnails, .json/.csv/.txt <4KB inline in a
  code block, rest as download rows, "Waiting…" while running; Log: last 20
  lines + "Show all N", 1s poll that survives transient fetch blips and
  auto-scrolls the real scroll container. Run again → Run tab prefilled.
- Logs tab for jobs (RunsDb, §3c): the runs database — run id / status /
  started-by / when / duration + one column per declared input (files as
  📎 name, bools as pills, numbers right tabular), header type icons, 32px
  header. Toolbar right-aligned: Filter (status / person / any input value,
  removable pill chips), Sort, Properties (hide input columns, persisted),
  Search, New run (→ Run tab). Columns resize by edge-drag, widths persisted
  per app (`small.tblw.<app>`); the table is exact-px wide (fixed layout —
  `w-full` would rescale dragged widths away) and scrolls in its wrapper.
  Calculate tfoot: Count under Run, Avg under Duration. 48px inline empty row.
  Servers keep the request-log table untouched.
- Fixed along the way (adversarial review pass): per-app state (peek/tab/
  prefill) resets on slug change; menu triggers toggle on mousedown (the
  outside-mousedown close raced click-toggles into reopening); Slider's number
  field sized inline (base Input `w-full` beat `w-16` in the cascade);
  full-page Run again lands on the Run tab; CodeBlock grew the hover Copy
  button and a scrollRef to its real scroll container; SlidePanel matches the
  panel spec (left border only, 44px header).
- e2e `run.spec.js`: real yolo-job run through the form (fixture image +
  threshold 0.4) → peek running → finished → annotated.jpg thumbnail +
  boxes.json inline → Run-again prefill asserted → runs table shows 0.4 →
  column resized, reload, width held. ~1 min against live.
- ponytail: Calculate footer is fixed count/avg — click-to-pick when asked.
- ponytail: cron runs pass no inputs; the runs table shows — for them.

## v12: property list, ⋯ menu, schedules from the dashboard
- App page properties are a Notion vertical property list (icon + grey 160px
  label, value beside, 32px rows): Type (was "Kind"), Deployed, Source, Owner,
  Schedule last. The Access row is gone — like Notion, access lives only behind
  the Share button.
- Header is just Share + ⋯. The ⋯ menu (all viewers): Copy link, Duplicate,
  Schedule (jobs w/ edit), Move to Trash (owner) — all with icons.
- Schedules from the dashboard: POST /api/schedule now also accepts
  `schedule` (set/replace; null removes) with per-part cron validation;
  setting unpauses. `apps.schedule` may hold SEVERAL crons, ';'-separated —
  the dialog lists each as a pill with ✕, "+ Add schedule" appends
  (presets: every minute/hour/day, specific days w/ a Mon–Sun checkbox row,
  custom cron; all UTC), Pause all/Resume all toggles the job's cron whole.
  The every-minute tick fires if ANY part matches (still one run per minute —
  last_scheduled_at pins the app, not the part). apiAppGet returns `nextRun`
  (min over parts) — the Schedule row shows "next in 3h". A `small deploy`
  still wins: small.toml's single schedule (or its absence) replaces
  dashboard-set crons.
- Sidebar/list/table already swap the job ▷ to a clock when scheduled
  (KindIcon); the dialog's reloadShell makes the swap immediate.
- Private apps have the Share button again: the FIRST share on an unshared
  private app opens a confirm ("moves it from Private to Shared") with a blue
  primary — sectionOf then files it under Shared for everyone including the
  owner. ConfirmDialog grew a confirmVariant for non-destructive confirms.
- Fixed: ScheduleDialog inherited the breadcrumb's text-ink-2 (pale dropdown
  text) — dialogs mounted inside colored rows must set text-ink; D1's 0/1
  schedule_paused leaked a literal "0" through a bare `&&`.
- ponytail: multiple crons share one pause flag and one per-minute fire; split
  into a schedules table when per-cron pause or same-minute fan-out matters.

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
