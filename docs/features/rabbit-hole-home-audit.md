# Rabbit Hole Home & Project — T00 audit and T01 directions

Status: T00 audit done. Directions A and B below are **superseded** by
[Direction C](rabbit-hole-direction-c.md), which records decisions D1–D7.
Nothing in `packages/` has changed. The brief is [rabbit-hole-home-project-uiux-brief-v2.md](../rabbit-hole-home-project-uiux-brief-v2.md)
(copied from the smart-landing-page worktree, 2026-09-23).

Checkout: worktree `smart-home`, branch `feature/smart-home`, base and HEAD
`94dad46` (identical to `main`). The evidence comes from eight read-only area
audits and one adversarial verifier (workflow run `wf_1af55b20-830`). File:line
references are to this checkout.

Task IDs below are this brief's T00–T12. The interactive-visuals ledger in the
`small-deploy` worktree also uses T00–T12 for different work.

---

## T00 ledger

- [x] Read repository instructions and the Home/Apps/Graph/Learn source.
- [x] Map the workspace switcher and Settings shell, every entry, persistence scope, and role gates (see Settings below).
- [x] Record branch, worktree, base, router, state/data layers, tokens, and graph renderer (see Environment).
- [x] Inventory real APIs for projects, canvases, uploads, sharing, forks, apps, search, and progress.
- [x] Inventory provider/connection capabilities. Google Slides, Drive, and Notion are **Unavailable** (no code).
- [x] Mark every requested feature (see Capability map).
- [x] Identify preserved deep links, chat drafts, canvas seeds, storage namespaces, and permissions (see Preserve).
- [x] Record baseline tests (2026-09-23, after `npm ci`): web unit 418/418, control-plane 326/326, Python unit 31/31. Integration and e2e were not run: they reach deployed workers. On Windows, `npm ci` rewrites `packages/cli/bin/small.js` line endings; restore it with `git checkout -- packages/cli/bin/small.js`.
- [ ] Confirm other agents' ownership. Branch overlaps are mapped below. Unverified: which worktrees the two running peer sessions use, and whether the clone workers `small-cp-dev-smart-landing-page` and `small-learn-notebook-dev` are currently deployed.

---

## Environment

| Item | Fact | Evidence |
|---|---|---|
| Router | None. A regex allow-list plus `pushState` and a `popstate` listener. | `main.jsx:57-70`, `api.js:31-34` |
| SPA paths served | `/apps`, `/dash`, `/chat`, `/members`, `/apps/*`. A new route must be added in all four places. | `index.js:2485`, `dev-worker.js:137`, `private-auth.js:8`, `main.jsx:57` |
| Data | `Shell` loads `GET /api/apps` once and passes `children(data, reload)` | `Shell.jsx:24,92` |
| Workspace | `localStorage small.ws` becomes the `X-Small-Workspace` header. Switching reloads `/apps`. | `api.js:38-57`, `Sidebar.jsx:805` |
| Tokens | Tailwind v4 `@theme` in CSS, dark mode via the `.dark` class on `<html>`, Inter Variable | `index.css:6-31,148-217` |
| UI kit | Hand-rolled `ui.jsx`. Radix is used only for Tabs. `SlidePanel`, `ResizableSidePanel`, `ConfirmDialog`, `Menu`, `Toasts`. | `ui.jsx` |
| Code graph | Hand-built SVG with d3-force, 24/45/100-node views | `RepositoryGraph.jsx` |
| Learn canvas | Plain React (`AdaptiveCanvas`). tldraw appears only inside whiteboard and notes blocks. | `AdaptiveCanvas.jsx`, `WhiteboardBlock.jsx` |

**Two products in one codebase.** The live build (plain `vite build` on
`small-cp`) is the deploy-apps dashboard. Everything Rabbit Hole is about is
**dev-only**: repositories, Learn, sources, and graphify. It needs
`VITE_COACHING_DEV` plus routes that exist only in `packages/web/dev-worker.js`.
In the table below, "Dev" means a real backend that is reachable only in that
build.

**Data safety.** A dev clone worker binds `DB` to the live D1 `small` (same
`database_id` 3a9cc077…) and forwards to the live `small-cp`
(`wrangler.dev.jsonc:71-73,96-99`). Share, Rename, Trash, and Run on a clone
change real apps. Only `LEARN_DB` (`small-learn-dev`) is dev-only.

---

## Capability map

Status: **Live** = connected on the hosted product. **Dev** = real backend in
the dev build only. **Prototype** = no-op, fixture, or placeholder UI.
**Unavailable** = absent.

### Shell and navigation

| Feature | Status | Evidence | Design consequence |
|---|---|---|---|
| Workspace menu, switch, New workspace, Log out | Live | `Sidebar.jsx:772-824,850-864` | Reuse as is. A switch discards the current route. |
| Home / Library / Explore routes | Unavailable | `main.jsx:57` | New routes need all four path lists |
| Pinned | Unavailable | — | New. Device-local storage is the honest first version. |
| Collections | Unavailable | — | New. Folders cannot stand in for them (next row). |
| Folders | Live | `schema.sql:58`, `index.js:1692-1709` | These are **access grants**: a folder share gives view/edit on every app inside, and dropping an app into a folder forces domain visibility. Keep them as they are. |
| Recents | Live, device-only | `SharePage.jsx:540-543` | Only the last 5 app slugs, with no timestamps and no workspace scope |
| Search (Cmd/Ctrl+K) | Live | `Search.jsx`, `index.js:595-612` | Matches app names and runbook text. Queries of 4+ words go to a model find. No canvases, notes, or full text. |
| Mobile navigation | Unavailable | `Shell.jsx:62,72` | The sidebar is hidden below `md`, with no replacement |
| Rabbit Hole name and mark | Unavailable | `index.html:9` "small deploy", `Shell.jsx:79` | First-party copy change only; workspace names untouched |
| Mascot | Prototype, **unapproved** | smart-landing-page `rabbit-character/manifest.json:5` | Brief line 9 says "approved"; the asset manifest says it is not |

### Settings (one modal, 15 entries, no URL)

| Entry | Status | Evidence / scope |
|---|---|---|
| Open/close | Live | Opens from the switcher or the bell's AWS row (`Sidebar.jsx:817,905`). No Escape, no deep link, unreachable below `md`. |
| Theme | Live | `small.theme`, per device |
| High contrast, Language, Number format, Enter-newline, Text direction | **Prototype** (no-op) | `Sidebar.jsx:17-18,96-115`. The brief assumes these persist; they do not. |
| Notifications: mark as read | Live | `small.watchReadAt`, per device. The weekly-email row is text only. |
| Mail & Calendar, Import, Small MCP, Public pages, Emoji | **Prototype** (title + "Nothing here yet") | `Sidebar.jsx:31,315-320` |
| General, People, Teamspaces | Live | Rename and invite are owner-only (`index.js:145,157`) |
| Small AI provider | Live | Workspace-scoped with **no role gate** (`index.js:683`). The default model is per device. |
| Developer, Security, Identity | Live, static | `Sidebar.jsx:252-314` |
| Connections: AWS | Dev/private only | `byoc.js`, served by `dev-worker.js:136`. Installer-only actions. |
| Connections: Slack | Live, connect-only | No status or disconnect. Binds to the email-domain org, even inside a custom workspace. |
| Connections: GitHub, Google (Slides/Drive/Docs), Notion | Unavailable | Repo import is anonymous and public-only (`repositories.js:13`) |
| Provider catalog | Unavailable | Connections is two hardcoded rows |

### Projects, apps, map

| Feature | Status | Evidence | Design consequence |
|---|---|---|---|
| Server/job apps: table, peek, run/stop, logs, runbook, schedule, watch, trash, share | Live | `App.jsx`, `SharePage.jsx`, `Panel.jsx`, `run.jsx` | Keep all of it. Stop exists **only** on the Home table row (`App.jsx:463-470`). |
| Repository project (public GitHub, commit-pinned) | Dev | `repositories.js`, `dev-worker.js:22` | Always workspace-visible, max 25, no delete, no share |
| Private repositories | Unavailable | `repositories.js:13` | Show "planned" |
| Graph generation (graphifyy 0.9.63) | Dev | `index_repository.py:10-12` | States are only `queued / indexing / ready / failed`. No partial, stale, or revoked. |
| Graph for server/job apps | Unavailable | `SharePage.jsx:822-823` (empty div) | `app-tabs.md` promises CLI graphify; the CLI has none |
| Subsystem grouping, qualified names, stale detection | Unavailable | `index_repository.py:76-77` | Record the gap. Do not invent groups. |
| Files/Graph toggle, symbol search, source viewer | Dev | `RepositoryPage.jsx:39-41`, `RepositorySource.jsx` | Search is a client-side substring match |
| Graph Agent (apps) | Live | `SharePage.jsx:830-836` (`/api/ask`, scope app) | Real, but beside an empty canvas |
| Graph Agent (repos) | Dev | `RepositoryPage.jsx:46-48` | **Same backend, prompt, and thread list as the Learn Agent** (`repositories.js:162,205`) |
| Chat drafts | Unavailable | `ask.jsx` component state | A draft is lost on unmount, and a node click re-targets the chat |
| Sessions / decisions | Prototype | `coaching/sample-data.js` | No tables |

### Learn and sources

| Feature | Status | Evidence | Design consequence |
|---|---|---|---|
| Learn at `/apps/<slug>?tab=learn` | Dev | `SharePage.jsx:63,607-611` | Immersive takeover, sidebar collapses |
| Canvas persistence | Dev, **browser-local only** | `LearnPage.jsx:143` `small.adaptive-canvas:<org>:<email>:<app>` | No server record and no cross-device sync. The blob `{strokes, shapes, items, links, blocks}` has no timestamps. |
| Standalone canvas | **Unavailable** | `index.js:1063` "Learn requires an app scope" | Blank, Sources, and Question starts have no home. **Decision D1.** |
| Several canvases / picker | Prototype | `?board=` only (`LearnPage.jsx:144-158`) | No registry, list, or create |
| Bottom composer, Ask in chat, card follow-ups | Dev | `AdaptiveCanvas.jsx:437-441,1706-1719` | Untouchable (two branches are rewriting these) |
| PDF upload | Dev | `learn-paper.js`, R2 + IndexedDB | Upload works only inside an existing canvas |
| Slides, images, generic URLs | Unavailable | `LearnPage.jsx:689` Slides item shows a toast pointing at a Google connection that does not exist | The copy is misleading today |
| arXiv / Wikipedia / YouTube search | Dev | `dev-worker.js:122-125` | **Replaced** on `feature/parallel-work` by `/api/learn/search` |
| Progress | Dev, learner-ticked | `AdaptiveCanvas.jsx:901`, `LearnPage.jsx:726-735` | Section checkboxes stored in the local canvas. No server progress or resume pointer. |
| Course / curriculum | Backend Live, UI unreachable | `learn-course.js`. `learningView` is never set to `'curriculum'`. | — |
| Lesson playback | Prototype, unreachable | `LearnPage.jsx:795-816` (`false &&`) | — |

### Sharing and trust

| Feature | Status | Evidence |
|---|---|---|
| App sharing: domain/private + people/#teams (view/edit), folder shares, request access | Live | `index.js:420-437,1692-1711,1827-1837` |
| Link-access, public, comment | Unavailable | `index.js:425,1591` |
| Sharing a project or canvas | Unavailable | Repos are fixed workspace-visible; canvases are browser-local |
| Fork / lineage / credit | Unavailable | Duplicate only, with no parent (`index.js:498-518`) |
| Publish, public pages, Explore data | Unavailable | The proxy requires a session (`index.js:2288-2296`) |
| Verified badge, reviews, profiles, presence, export | Unavailable | No tables or code |

---

## Preserve (the redesign must not break these)

- **URLs:** `/apps`, `/dash`, `/apps/<slug>`, `/apps/<slug>/runs/<id>`, `/members`, `/chat?app=`, `?s=`, `?f=<folder name>`, `?tab=graph|learn|agent|code`, `?share=1`, `?board=`, `/login?next=`.
- **Storage keys** (renaming one orphans user data): `small.adaptive-canvas:*` (plus `:chat`, `:sources`, board `:s<ver>`), `small-learn-notes` and `small-learn-assets` (IndexedDB), `small.ws`, `small.theme`, `small.recent`, `small.askModel`, `small.watchReadAt`, `small.sidebar`, `small.sidebarW`, `small.secClosed`, `small.tbl*`, `small.peek-w.*`.
- **Shell contract** `children(data, reload)`; `sectionOf` rules; the events `small:theme`, `small:sidebar`, `small:search`, `small:ask-focus`, `small:toast`.
- **Operations:** Run/Stop from the table, the peek, the run subpage with its scoped chat, schedule, trash/restore, watch and the bell, and the viewer Denied / Request access page.
- **Repository:** commit-pinned snapshots, 409 on a cross-commit selection, extracted vs inferred edges (solid vs dashed), the skipped-files list, graph answer views with Back history, 120-line source selections, and graph keyboard access.
- **Learn:** the bottom composer mount (`LearnPage.jsx:794`), Ask in chat without auto-send, controls below the visual, outline proposals applied only by the learner, BOARDS seed versions.
- **Settings:** open-from-switcher, Connections deep-open from the bell, owner gates, masked AI key round trip, AWS installer-only actions, and e2e selectors on the exact texts "Settings" and "Connections" (`private-login.spec.js:322,392`).
- **Private BYOC:** `PrivateAuthGate` runs before route normalization, and unknown AWS ops throw instead of falling back to hosted APIs (`app-data.js:41-42`).

---

## Conflicts to resolve in T02

1. **Graph-first vs Overview-first.** `app-tabs.md` (2026-09-17) lands every app on Graph. The brief (2026-09-23, newer) says a project must not open on the graph. Server/job apps currently land on an **empty** canvas.
2. **Documents that disagree with the code.** `app-tabs.md` says `?tab=runbook|run|logs` work, but only graph/learn/agent do. It says Logs is for jobs only, but servers show request logs. It says Learn appears only with pinned source, but it shows for every app in dev. It says every deploy graphifies, but the CLI has no graphify. It says Graph Agent ≠ Learn Agent, but repos share one backend. `web.md:142,175` describes a peek-on-row-click and stub Settings, both outdated.
3. **What the brief assumes about Settings vs what exists.** The brief expects persisted preferences and working Mail/Import/MCP/Public pages/Emoji. They are no-ops or placeholders. Relabeling or hiding them is a UI removal and **needs your permission**.
4. **Folders ≠ Collections** (access semantics, see above).
5. **`CLAUDE.md` "build every feature into an app in the Apps list"** vs the brief's resources that are not apps (projects, canvases).
6. **Toast placement.** `main` renders info toasts bottom-left, against your standing preference. `feature/parallel-work` already moves them bottom-right.
7. **Mascot:** the brief says it is approved; the manifest says it is not. Also, the brief bans a watch motif, while the mascot costume includes a pocket watch.

---

## Ownership and merge risk

| Files | Owner / risk |
|---|---|
| `LearnPage.jsx`, `AdaptiveCanvas.jsx`, `ask.jsx` | Both `feat/canvas-block-conversations` (small-deploy, 25 commits ahead, still moving) and `feature/parallel-work` (small-parallel, 24 ahead) rewrite these. **Do not edit Learn internals**; link into Learn only through its existing `?tab=learn` / `?board=` entry. |
| Interactive visuals / visual evaluator (`scene-evaluate.js`, `scene-inputs.js`, …) | `feat/canvas-block-conversations` only. Do not touch. |
| `PaperSearch`, `WikiSearch`, `VideoSearch` | Deleted on `feature/parallel-work`. Do not build Home search on them. |
| `ui.jsx`, `index.css`, `Shell.jsx`, `main.jsx`, `SharePage.jsx` | Changed on other branches. Expect merge conflicts; keep edits small. |
| `App.jsx`, `Sidebar.jsx`, `RepositoryPage.jsx`, `RepositoryGraph.jsx`, `api.js`, `Search.jsx`, `Panel.jsx` | No other branch touches them. They are free for this redesign. |
| Deploy target | `small-cp-dev-smart-home` only |

---

## T01 — Information architecture (shared by both directions)

| Term | Maps to today | Change |
|---|---|---|
| Workspace | The existing `org` / `w-*` workspace | None |
| Project | A `repository_apps` row (`repo-*` slug, dev) | A new label. The URL stays `/apps/<slug>`. |
| Canvas | The Learn canvas of a project or app (browser-local) | Standalone needs an identity (**D1**) |
| App | A server/job/AWS app (`apps.kind`) | None. It moves out of Home's default view. |
| Collection | Nothing | New (Pinned first; Collections as a prototype until a backend exists) |
| Folder | The existing access-granting folder | Kept, shown in Library under Apps |

Routes: `/home` (new, the landing page after sign-in). `/apps` keeps its URL
and every `?s=` / `?f=` link, and becomes **Library** (today's table is its
Apps view). `/apps/<slug>` stays the canonical project/app URL. `/canvas/<id>`
is added only if D1 = (b). `/explore` is a preview route. Aliases:
`?tab=code|graph|agent` resolve to Map; `?tab=learn` is unchanged.

Default scope: the new Home, Library, and Project ship **behind the existing
dev flag** (`learnPreview`). The live build keeps today's Apps table untouched
until you approve promotion.

---

## T01 — Direction A: Learning hub (recommended)

Every block is backed by data that exists today. Resume comes first; ops move
to Library.

```
┌ Gmail ▾ ─────────────┐┌─────────────────────────────────────────────────────┐
│ ⌕ Search        ⌘K   ││ Knowledge is infinite.          [Start a rabbit hole]│
│ ⌂ Home               ││                                                     │
│ ▤ Library            ││ CONTINUE — on this device                           │
│ ◎ Explore  preview   ││ ┌─────────────────────────────────────────────────┐ │
│                      ││ │ karpathy/nanoGPT · Project · Learn canvas       │ │
│ PINNED               ││ │ 3 of 7 sections ticked                          │ │
│  karpathy/nanoGPT    ││ │ Next: Masked self-attention                     │ │
│  counter             ││ │ [Continue learning]   [Open project]            │ │
│                      ││ └─────────────────────────────────────────────────┘ │
│ APPS ▸ (folders,     ││ RECENT                                              │
│   collapsed)         ││ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│                      ││ │Project  │ │App·job  │ │Project  │ │App·srv  │     │
│ Members · Trash      ││ │nanoGPT  │ │s3-log   │ │minbpe   │ │counter  │     │
└──────────────────────┘│ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
                        │ START FROM                                          │
                        │ [Repository] [Sources ·planned] [Question ·planned] │
                        │ [Blank canvas ·planned]        ← real once D1 = (b) │
                        └─────────────────────────────────────────────────────┘
```

- **Continue** reads `small.recent` for the latest project/app on this device.
  From its local canvas it shows the section ticks and the **first unticked
  heading** as "Next". That text is the learner's own outline, not an
  inference. Without a canvas it shows "Open project". Labeled "on this device".
- **Recent** = `small.recent` × catalog, with a type chip. **Pinned** is new,
  stored per device.
- **Start a rabbit hole** is one dialog with four paths. Repository is real
  (dev: public GitHub; private shows "planned"). The other three depend on D1.
- **Library** (`/apps`) = today's table plus type chips *All / Projects /
  Canvases / Apps* and *Mine / Shared / Workspace*. The Apps view keeps every
  column, Run/Stop, peek, and folder grouping.

Project page (repository), with fixture content:

```
karpathy/nanoGPT                                              [Share] [⋯]
Overview · Learn · Map · More ▾ (Sources · Build)
github.com/karpathy/nanoGPT · master @ 3f2a1c9 · Map ready
┌ Overview ───────────────────────────────────┬ Context ─────────────────┐
│ What is this?  (editable description)       │ Map  ready · rev 3f2a1c9 │
│ [Continue learning]  Next: Masked attention │ 3 files skipped (why)    │
│ Canvases  · Default canvas                  │ [Open map]               │
│ Start here · top files by graph degree      │ Refresh source           │
└─────────────────────────────────────────────┴──────────────────────────┘
```

- **Map** = today's Graph tab unchanged: the Graph|Files toggle, the source
  panel, and the Graph Agent in the right `ResizableSidePanel`. Only the
  duplicate "Graph" label goes (the tab becomes Map). Graph colors move to tokens
  so dark mode stops showing a white island.
- **Learn** = today's LearnPage, untouched. Entered through the same
  `?tab=learn`.
- The Overview **Map status** is its own panel, so `failed` / `indexing` never
  block Learn. The Learn button stops being disabled before `commit_sha` exists,
  as the brief's "map not ready ≠ unusable" requires.
- Server/job apps keep their operational tab row. Their landing tab is
  **decision D3**.
- Chat: the Graph Agent stays on Map and Learn keeps its bottom composer. This
  is the brief's §10 fallback, because unifying them means rewriting `ask.jsx`,
  which two branches are changing.

## T01 — Direction B: Conversation launchpad

```
                        Knowledge is infinite.
        ┌──────────────────────────────────────────────────────┐
        │ What do you want to understand or build?             │
        │ ( Repository URL | Upload | Question | Blank )  [Go] │
        └──────────────────────────────────────────────────────┘
        Recent  nanoGPT · s3-log · minbpe · counter        Library →
```

The Project page opens on a large project-scoped composer with scope chips
(`Project: nanoGPT` · `Selected: …`). Answers stack beneath it, with Learn and
Map as secondary tabs. One bottom composer replaces the Graph Agent panel on
every tab.

**Why it is not the recommendation:**

- Its centerpiece, "type a question, get a canvas", needs a standalone canvas
  plus generation without an app scope. Neither exists, so the live version is
  mostly a labeled prototype.
- One box that Searches, Asks, **and** Starts is the ambiguity the brief warns
  against (§7.2).
- Resume and Library drop below the fold.
- Replacing the Graph Agent panel means rewriting `ask.jsx`, which conflicts
  with both Learn branches.

## Rejected alternatives

- **Graph-first** (today's app page): it lands on an empty canvas for every server/job app.
- **Database-first** (today's Apps table as Home): it puts operations first, the opposite of the brief.

## Comparison

| | A · Learning hub | B · Launchpad |
|---|---|---|
| Resume | First block, real device data | Below the fold |
| Start | One dialog, four honest paths | Strong first-use hero |
| Find (Library) | Sidebar destination, today's table kept | Secondary link |
| Needs new backend to look complete | D1 only (for 3 of 4 start paths) | D1 + generation without app scope + chat unification |
| Merge risk with Learn branches | Low (no Learn internals) | High (`ask.jsx`) |

---

## Decisions

**D1 — blocking: where does a canvas without a repository live?** Three of the
four start paths (Sources, Question, Blank) and the Library's Canvases filter
depend on it.

- **(a) Prototype only.** Those paths live in a labeled preview route. Real
  Start offers Repository only. This is UI-only, as the brief prefers, but
  Home can start real learning only from a repo.
- **(b) Minimal dev-only canvas record (recommended).** A `canvas-*` row in
  `LEARN_DB` (`small-learn-dev`), routed through `dev-worker.js` exactly like
  `repo-*`. The existing app-scoped Learn endpoints, composer, and PDF upload
  then work unchanged. Canvas content stays browser-local, as it is today. This
  is a new backend table and routes, but **not** in the live D1 and with no
  live migration.

Defaults unless you say otherwise (details settled in T02):

- **D2** — The new Home, Library, and Project stay behind the dev flag. The live build is unchanged.
- **D3** — Server/job apps land on Runbook while no graph exists (replaces `app-tabs.md`'s Graph landing). Repository projects land on Overview.
- **D4** — Settings keeps its structure and gets Rabbit Hole copy. No-op preferences and placeholder panes are marked **Planned** (removing any needs your OK). Connections gains a catalog: GitHub (public, no account needed), Slack, AWS where enabled, and Google Slides / Notion as Planned. Settings becomes openable by a `?settings=connections` deep link, so source flows can return to where they started.
- **D5** — Folders stay as access grants inside Library → Apps. Pinned is device-local. Collections are prototype-only until a backend exists.
- **D6** — No mascot until an asset is approved; a neutral mark is used.
- **D7** — Mock journeys on the clone never Share, Rename, Trash, or Run real apps, because the clone writes to the live D1.

After approval: T02 written spec, then Figma mockups (file "Rabbit Hole — Home & Projects"), then the plan, then code.
