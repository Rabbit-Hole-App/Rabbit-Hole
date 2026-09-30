# Rabbit Hole — T02 UX spec: Home, Library, Project, Agent Bar

Status: **Gate A approved on 2026-09-23. Gate B closed and Gate C approved on
2026-09-24.** The T03 mockups are in
[Rabbit Hole — Home & Projects](https://www.figma.com/design/ef9SfiemEsPQF2bd8B1os3)
(rabbit-hole team). The implementation plan is
[T04](../superpowers/plans/2026-09-23-rabbit-hole-home-agent-bar.md), and WP1 has
started.

> **Rabbit Hole is not a chat app with pages. The interface is a learning
> environment, and the agent is its steering wheel.**

Inputs: [the brief](../rabbit-hole-home-project-uiux-brief-v2.md), the
[T00 audit](rabbit-hole-home-audit.md), and [Direction C](rabbit-hole-direction-c.md),
with the twelve amendments approved on 2026-09-23. File:line references are to
`94dad46`.

**Scope boundary.** Everything here ships behind the existing dev flag
(`VITE_COACHING_DEV`, `learnPreview`). The live build stays exactly as it is
(D2). Where this spec says "dev", it means the dev build plus
`packages/web/dev-worker.js`.

---

## 1. Routes

| URL | Dev build | Live build |
|---|---|---|
| `/apps` (no `?s`/`?f`) | **Home** | Apps table (unchanged) |
| `/apps?s=shared\|private`, `/apps?f=<folder>` | **Library**, filtered as today | unchanged |
| `/library` (new) | **Library** | not served |
| `/explore` (new) | Explore **preview** (demo data, §11) | not served |
| `/apps/repo-<id>` | **Project** (repository) | not served |
| `/apps/canvas-<id>` (new, D1b) | **Canvas**: opens Learn directly | not served |
| `/apps/<slug>` (server/job/AWS) | App page | unchanged |
| `/apps/<slug>/runs/<id>`, `/members`, `/chat`, `/dash` | unchanged | unchanged |

- Home keeps the bare `/apps` URL. Sign-in, the `/` redirect, and
  `/login?next=` then land on Home with no server change.
- New paths must be added to `main.jsx:57`, `dev-worker.js:137`, and
  `private-auth.js:8`. The live `index.js:2485` needs no change until
  promotion.
- Project tab aliases:
  - `?tab=overview` is the default.
  - `?tab=learn` is unchanged.
  - `?tab=map`, plus the legacy `code`, `graph`, and `agent`, open Map.
  - `?tab=sources` opens Sources.
- App pages add working `?tab=runbook|run|logs`, as `app-tabs.md:26` already
  promises.

## 2. Shell

Expanded (desktop):

```
┌ Gmail ▾ ─────────── « ┐┌──────────────────────────── content ──────────┐
│ ⌕  ◔                  ││                                                │
│ ⌂ Home                ││                                                │
│ ▤ Library             ││                                                │
│ ◎ Explore  preview    ││                                                │
│ PINNED                ││                                                │
│ ───────────────────── ││ ┌ Agent Bar ─────────────────────────────────┐ │
│ Members               ││ │[+][Auto] …                               ↑ │ │
│ Trash                 ││ └────────────────────────────────────────────┘ │
└───────────────────────┘└────────────────────────────────────────────────┘
```

Collapsed (desktop, Ctrl/⌘+\ or Learn's entry): a 52px icon rail.

```
┌────┐
│ G  │  workspace menu
│ »  │  Open sidebar
│ ⌂  │  Home
│ ▤  │  Library
│ ◎  │  Explore
│    │
│ ── │
│ ◍  │  Members
│ ▣  │  Trash
└────┘
```

- **Workspace menu** is unchanged: identity, workspace list with the active
  check, Settings, New workspace, Log out. The rail's tile opens the same
  menu; the workspace name stays in the sidebar's DOM in every mode
  (screen-reader only in the rail).
- **Search** (⌘K) and **Notifications** stay as the two icons under the
  workspace row.
- **Home, Library, Explore** are the main nav. The current destination has
  `aria-current="page"` and the active surface; app, project and canvas pages
  (`/apps/<slug>`) mark Library.
- **Pinned** is device-local, stored in `small.pinned:<org>:<email>` as an
  ordered list of resource slugs. Unknown slugs are dropped silently when the
  catalog loads.
  - Keep it **small and flat**. Projects and canvases are pinned as
    independent resources: a canvas is never nested under its project, and
    the sidebar is not a filesystem.
  - Pin and Unpin live in the Library card's ⋯ menu (projects and canvases)
    and the Agent Bar's pin command. A pinned row has the usual row ⋯ menu:
    Open, Unpin, Share (disabled for projects and canvases), Copy link; Rename,
    Duplicate and Move to Trash only for live apps.
- A divider, then **Members** and **Trash**.
- **Removed from the sidebar** (the Library owns browsing):
  - the Apps tree and its folders → Library Filters → Apps;
  - Shared and Private → Filters → Ownership (Shared with me, Mine), and the
    app page's Share popover;
  - Recent → Home (`small.recent` is kept);
  - New chat and the + New menu → the Agent Bar, the one persistent
    conversation. Ctrl/⌘+O focuses it instead of opening `/chat`.
  - Folder create, rename and delete have no preview UI yet; they move to the
    Library's ⋯ actions later. The folder API and data are unchanged.
  - The AWS catalog error that sat under Apps shows in the Library body.
- **Collapsed (desktop)** is never fully hidden: the icon rail holds the
  workspace tile, Open sidebar, Home, Library, Explore, then Members and Trash,
  each with a tooltip (`title` and `aria-label`). No Pinned, no resize handle.
  The Agent Bar sits beside it: `--sidebar-w` is the rail width
  (`home/pinned.js` `sidebarEdge`, `RAIL_W`). The fixed Back button is live
  only.
- **Below `md`** there is no rail. The sidebar is hidden; a 40px top strip with
  one Open sidebar button (`--shell-top-h`, which pads the page) opens it as a
  drawer over a backdrop, at most 85% of the width. Navigation, Esc and the
  backdrop close it. The Agent Bar is full-width (§6).
- **Product name.** One constant, `PRODUCT = learnPreview ? 'Rabbit Hole' : 'small'`,
  drives the document title and first-party copy. Workspace names are never
  changed.
- The live build keeps today's sidebar: Apps, Shared, Private, Recent, New
  chat, + New, the Back button, and Ctrl/⌘+O opening `/chat`.

## 3. Home (`/apps`, dev)

There is no marketing copy. The page has three blocks and no others.

### 3.1 Continue — on this device

This is derived only from data in this browser, and it is labeled that way.
The default is **Last explored + Next**. Rabbit Hole content adapts and
grows, so there is no universal "N of M" progress.

1. Walk `small.recent` in order, keeping slugs that are in the current
   catalog.
2. For the first slug that has a local canvas
   (`small.adaptive-canvas:<org>:<email>:<slug>`, `LearnPage.jsx:143`),
   show:
   - title and type chip
   - **Last explored:** the most recent question asked on that canvas (the
     local `:chat` key)
   - **Next:** the first unticked heading of the learner's own outline
     (`AdaptiveCanvas.jsx:901`). It is omitted when the canvas has no
     headings.
   - buttons `[Continue learning]` and `[Open project]` (the latter only for a
     project)
3. **Finite step counts** (`Step 3 of 7` plus ticks) appear only for a
   genuinely bounded authored path: an approved course revision with fixed
   steps (`learn_courses`). This is a separate "Authored path" card.
4. If no recent item has a canvas, show the first recent item with
   `[Open]` only.
5. If nothing is recent, skip the Continue block and show §3.3 first.

One small read-only module owns the canvas read. If the blob shape changes on
the Learn branches, Continue drops those lines and never errors. It never
shows mastery, streaks, or percentages of "knowledge".

### 3.2 Recent

Up to 5 items: `small.recent` ∩ catalog. Kinds differ by **meaningful
metadata and next action**, not only by the type chip:

| Kind | Metadata | Next action |
|---|---|---|
| Project | revision, map status, number of canvases, visibility | Open project |
| Canvas | where it lives (project or standalone), last explored, "Content in this browser" | Continue learning |
| Canvas on another device | "On another device" (§8.3) | explanation only, no Open |
| Job | last run and result, schedule, who can run it | View last run |
| Server | last deploy, access | Open app ↗ (new tab) |

### 3.3 Start (revised 2026-09-23)

One **primary** button, **`[Start a rabbit hole]`**, opens the Start dialog
(§5), where the four paths live: Repository, Sources, Question, Blank canvas.
The four paths are **not** four equally prominent permanent buttons on Home.

The Agent Bar is the natural-language route into the same commands. The dialog
and the bar call the same registry entries; no backend logic is duplicated.

### States

| State | Shows |
|---|---|
| Loading | Skeleton rows in the three blocks. The bar is usable at once. |
| First visit (empty catalog) | `[Start a rabbit hole]` first, with one line: "Start from a repository, sources, a question, or a blank canvas." Nothing else. |
| Catalog error | The Shell error (`{error}`) plus Retry. The bar stays usable for Settings. |

## 4. Library (`/library`, `/apps?s=…`, `/apps?f=…`)

Revised 2026-09-28 (user): the Library is **everything I can return to, learn
from, or build from**. Running and deploying are capabilities of some
resources, not the organizing principle, so learning resources come first and
operational detail is contextual. Preview build only; the live `/apps` table is
unchanged.

- Header action: **Start a rabbit hole** (the same Start dialog; importing a
  repository is its Repository path). No "Import repository" button.
- Header (revised 2026-09-28): `Library   [Filters] [Start a rabbit hole]`. No
  permanent type or ownership tabs; the default Library is All.
- **Filters** is one popover. Type: `Projects · Canvases · Apps`, plus
  `Archived canvases`, filtering on `kind` (`repository`, `canvas`,
  `job|server`). Ownership: `Mine · Shared with me · Workspace`, mapping to
  `sectionOf` (`api.js:9-14`); `?s=` keeps working. Active filters show as
  removable pills under the header. The heading stays "Library".
- One state, the URL (`library-filter.js` `libraryHref`): the Filters popover,
  **View all** and the Agent Bar's `filter_library` ("Show my canvases",
  "Show projects shared with me", "Show runnable apps") all set it.
- **All**: sections in this order: Projects (cards), Canvases (cards), then Apps
  (compact operational rows). Each section shows the 6 most recent (opened in
  this browser first, then the newest; a redeploy counts) and **View all n →**
  opens its type view.
- **Projects**: a card grid. Card order: title; creator and the source-owner
  check; `github.com/owner/repo`; Forked from; a short learning context (summary,
  Last explored and Continue from this browser's Learn, or "Not explored in this
  browser yet"); revision and map status; the fork count and Open.
  The card opens the project; `Open`; `⋯` offers Learn and Map.
- **Canvases**: a card grid. Card: title, `Canvas`, its project or Standalone,
  Last explored when known, Created (canvases record no last-edited time), and
  "Content in this browser" or "On another device". `⋯` offers Archive…
  (with confirmation, §8.4).
- **Apps**: today's operational table (row click, the Open pill peek,
  folders, all `small.tbl*` keys), with Deployed and Last run. **Run** exists
  only on jobs and is secondary: it shows on row hover (always on phones); Stop
  stays visible while a run is going.
- Actions follow capability: Project → Open, Learn, Map; Canvas → Open; Server
  → Open; Job → Open and Run.
- The Archived chip (canvases only) lists archived canvases with Restore (§8).
- The Agent Bar stays at the bottom, so the Library can be navigated from the UI
  or from the bar.

## 5. Start a rabbit hole

This is one dialog, a portaled `ConfirmDialog`-style modal, with four tabs.
Enter submits only the focused form. The dialog stays open with its fields
intact on any recoverable error. Submit is disabled while a request is in
flight, which prevents duplicates.

| Path | Fields | Result | Status |
|---|---|---|---|
| Repository | GitHub URL. Branch: the default is preselected; a select appears only when there is no default. | `connect_repository` (Confirm class, §7) → Project Overview | Dev, public only. A private URL returns "Private repositories aren't supported yet". |
| Sources | Canvas title. Method: **Upload** (PDF) or **From a connection** (tiles: Google Slides, Drive, Notion, all *Planned*, not clickable). | `create_canvas` → Canvas | Upload happens in the canvas's existing Sources menu. Until the Learn hook exists the dialog says "Use Upload in the canvas menu". |
| Question | Question text, optional depth `Overview · Guided · Deep dive` | `create_canvas` (title from the question) → Canvas → Learn hook `teach` | Until the hook exists: "Opened your canvas. Your question wasn't transferred; it's kept in the Agent Bar." |
| Blank | Title (optional, default "Untitled canvas") | `create_canvas` → Canvas | Dev |

The dialog copy states two facts the user needs: an imported repository is
visible to the whole workspace (`repositories.js:34`), and it can't be
deleted yet.

## 6. Agent Bar

### 6.1 Placement and lifetime

- It is mounted once in `main.jsx` `Root`, next to `SearchModal`. `Shell`
  remounts on every page type, so a bar inside it would lose drafts and
  in-flight streams.
- It is fixed to the bottom of the content column. Its left edge follows the
  sidebar width (`small.sidebarW`, `small:sidebar`). Pages get a bottom
  padding of `var(--agent-bar-h)`.
- Toasts stay above it on the bottom right. SlidePanel peeks sit above it.
- The input is the existing `ChatComposer` (default export), so it looks the
  same as the Learn dock.

**Visibility**

| Route | Bar | Reason |
|---|---|---|
| Home, Library, Explore preview, Project (Overview, Map, Sources), app pages | Shown | — |
| App pages (WP6) | Shown with the app chip; asks off on the preview; on the preview the Graph tab's Graph Agent input is replaced by the bar | One input |
| Learn (any `?tab=learn`, all canvases) | Hidden. The Learn dock owns the same spot. | The Learn branches own it (amendment 8) |
| Learn presenting (`[data-presenting]`) | Hidden | The canvas captures keys |
| `/chat` | Hidden. The chat page composer owns the spot. | One input |
| Run subpage | Hidden in phase 1 | Keeps its run-scoped chat |

The long-term target is recorded here: **one Agent Surface contract** with
route adapters (Home/Library/Project now, Learn and Chat later). It carries
scope, mode, draft, send, results, and handoff. Two unrelated composers that
merely look alike is not the end state.

### 6.2 Anatomy

```
┌──────────────────────────────────────────────────────────────────┐
│ [+] [Auto]  Start, open, ask, or paste a link…               [↑] │
│             Project: nanoGPT · Selected: CausalSelfAttention ×   │
└──────────────────────────────────────────────────────────────────┘
```

- `[+]` (revised 2026-09-28, WP5) opens **Add**: "Start from" Repository,
  Sources, Question or Blank canvas (the Start dialog on that path, through
  `open_start`; nothing is created). "Attach a file" is listed but disabled on
  the preview with "Attachments aren't available on this preview.": workspace
  asks are off (G1), project asks are JSON only, and a multipart ask would
  reach live storage (D7). It attaches one file where `/api/ask` accepts
  multipart once that is allowed.
- **Send and Stop.** While an answer streams, the send button is Stop. One
  answer streams at a time.
- **Mode.** `Auto` by default. Typing `/` at position 0 opens the picker: the
  four modes `/ask`, `/teach`, `/research`, `/do`, a divider, then the
  shortcuts the place can use (Home, Library, Project): `/find`, `/open`,
  `/new` (not on a project), `/connect`, `/run` (only when a job exists),
  `/share`. A chosen mode appears as a pill, `[/teach ×]`; Backspace on an
  empty input, or `×`, returns to Auto. A mode the current scope can't serve
  is shown dimmed with its reason (§6.4). A shortcut is typed into the draft
  (`/find `) and routes exactly as its sentence (`find …`, §6.6 rule 1b):
  `/find` and `/open` alone open the Library, `/run` alone its Apps filter,
  `/new [repository|sources|question|canvas]` and `/connect` alone open Start,
  `/share` acts on the resource in scope (or says how).
- **Scope chips appear only when context changes what the agent will do.**
  The bar never tells you where you already know you are:

  | Where | Chips |
  |---|---|
  | Home, Library, Explore | none (these are places, not conversational scope) |
  | Project | `[nanoGPT ×]` |
  | App | `[counter ×]` |
  | Canvas / Learn | shown by the Learn surface (the bar yields there) |
  | Selected object | optional second chip, `[CausalSelfAttention ×]` |

  - The workspace is not repeated under the bar; the workspace switcher
    already shows it. It appears **explicitly on confirmation and action
    cards** where it matters for safety.
  - `×` widens the scope. Scope still exists internally when no chip is
    rendered (workspace plus route), and it is **still frozen at Send**.
  - An in-flight answer names its own scope in the status line
    (`Answering in nanoGPT…`), even when the current page shows no chip.
- **Keys.**
  - Enter sends. Shift+Enter adds a new line.
  - Ctrl/Cmd+J focuses the bar (the existing `small:ask-focus` event).
  - Esc closes the picker, then the sheet.
  - Ctrl/Cmd+K, O, and `\` keep their current meanings.

### 6.3 Scope, drafts, threads ("one brain, scoped memory")

- **Scope is frozen at Send.** The request and its result card carry the
  frozen scope.
- **No silent retargeting.**
  - Navigation or a node selection changes the chips only while the draft is
    empty.
  - With text waiting, the bar shows
    `you're now viewing <X> · [Ask about <X> instead] [Keep <Y>]`.
  - A node click with a waiting draft offers `Use selection: <node>?`.
- **Drafts** are kept in memory per scope key (`org|kind:slug|selected`).
  Returning to a scope restores its draft. Workspace switching reloads the
  page, as today, so the bar warns before the switch if any draft is
  non-empty.
- **Threads are per scope.** Visually it is one agent; the conversations stay
  separate.

  | Scope | Endpoint | Thread store |
  |---|---|---|
  | Workspace | `POST /api/ask` `scope:{}` | Live D1 (existing) |
  | App | `POST /api/ask` `scope:{app}` | Live D1 (existing) |
  | Project | `POST /api/learn/ask` `scope:{app:'repo-…'}` | `LEARN_DB` (existing) |
  | Canvas | `POST /api/learn/ask` `scope:{app:'canvas-…'}` | `LEARN_DB` (D1b, §8) |

  The sheet header has **History**, which lists threads for the current scope
  from the existing thread endpoints. Cross-scope context is a later,
  explicit action.

### 6.4 Modes

| Mode | Available in | Does | Unavailable reason shown |
|---|---|---|---|
| Auto | Everywhere | §6.6 router | — |
| `/ask` | All scopes | Answers from the scope. Tool calls return as Confirm cards and never execute directly. | — |
| `/teach` | Project, Canvas (Home/Library: "creates a canvas first") | Opens the scope's Learn canvas and hands over the prompt through the Learn hook (§9) | Hook absent: "Opened Learn. Your prompt wasn't transferred; it's kept here." |
| `/research` | Canvas | Learn research tools (Wikipedia, arXiv, YouTube) through `/api/learn/ask`. Results show as source pills. | Project scope: "Research runs in a canvas · [New canvas for this project]". Repository asks go to the code-tool handler, which has no research tools (`dev-worker.js:75-78`, `repositories.js:168-204`); T04 re-verifies this. Workspace/App scope: "Research works inside a canvas." With the hook absent, results have no Add-to-canvas. |
| `/do` | All scopes | Executes a phase-1 command (§7) | Server-backed actions stay blocked until §7.4 ships |

### 6.5 Result sheet and right panel

- **The sheet** grows upward from the bar. It is resizable, and collapses to
  the bar with the latest result as one line. It holds answers (rendered with
  the exported `Md`), source pills (neutral pills, no blue link text), action
  previews, confirmation cards, clarification pills, and errors.
- **On Map and the app Graph tab**, results go to the **right panel instead**
  (amendment 1). The panel becomes the Context inspector:

  ```
  ┌ Context ─────────────── [Results] [Selected] [Source] ┐
  │ Results   bar answers for this scope (+ History)      │
  │ Selected  node label, qualified path:line, kind,      │
  │           relationships (extracted/inferred), rev     │
  │ Source    RepositorySource (existing)                  │
  └────────────────────────────────────────────────────────┘
  ```

  - **Selected** separates relationships extracted from code (solid) from
    inferred ones (dashed, with the extractor's confidence), matching the
    solid and dashed edges on the graph.
  - **Source** is the evidence and code inspector. Later, code-source links
    on learning cards will open it at the exact lines.
  - The existing `AskPanel` in `RepositoryPage.jsx:46-49` and
    `SharePage.jsx:830-836` is removed from these two places. The bar is the
    only text input there.
  - The panel stays a `ResizableSidePanel`.
  - Below `lg` it stacks, as today. Below `md` it becomes a **bottom drawer
    above the bar**, and a Results or Selected update opens it, so no result
    is ever hidden.
- The bar handles these SSE events from `/api/ask` and `/api/learn/ask`:
  `chunk`, `progress`, `graph` (the page's `showGraph`), `proposal`, `papers`,
  `wiki`, `video`, `outline`, `done`, `error`, plus JSON `{choose}` /
  `{error}` replies.
  - Unknown events are ignored and logged to the console.
  - The graph answer view keeps Back history, as today.
- **While a stream runs, navigation stays usable.** The stream belongs to its
  frozen scope. Stop (the send button while streaming) aborts it. If the user navigates away, the
  sheet shows `Answering in nanoGPT…` and delivers the result to that scope's
  thread.

### 6.6 Router

```
message ─► mode pill set? ─ yes ─► that mode
             │ no
             ▼
        RulesRouter ─ match ─► command (policy §7)
             │ no match
             ├─► JevRouter (disabled; shadow design only, §10)
             ▼
        /ask in the frozen scope (the existing Ask agent; its tools become Confirm cards)
```

RulesRouter rules, first match wins:

1. `/ask|/teach|/research|/do` at position 0.
2. `github.com/<owner>/<repo>` URL → `connect_repository`. Any other URL goes
   to `/ask`.
3. `open|go to|show <name>` → catalog lookup (below) → `open_resource`.
4. `find|search <text>` → `search_resources`.
5. `connect <provider>` → `open_settings('connections', provider)`.
6. `settings|preferences|connections|theme` → `open_settings(tab)`.
7. `pin|unpin` (+ this or a name) → `pin`.
8. `new canvas|blank canvas [called <title>]` → `create_canvas`.
9. `share <name> with <email> [as view|edit]` → a `share` proposal (Confirm).
10. `run <job>` → a `run` proposal (Confirm).

**Catalog lookup** works over titles and slugs of apps, projects, and
canvases:

- exact match → 1 result
- otherwise a case-insensitive substring match
- 1 match → act
- 2–5 matches → clarification pills plus `Search everything for "<text>"`
- more than 5 → results list
- 0 matches → an empty state with `[Ask instead]`

Search covers titles only. The text inside canvases stays in the browser and
is not searched.

## 7. Command layer and policy

### 7.1 Registry

`commands.js` holds one list of entries:

```js
{ name, risk: 'immediate'|'undo'|'confirm', available(ctx), touchesLive,
  requires(ctx),            // capability hint from catalog (canEdit/owner); the server still enforces
  preview(args, ctx),       // card model: workspace, target, operation, params, effect
  run(args, ctx),           // calls the existing API
  undo?(result, ctx) }
```

UI buttons for these commands (Start dialog, Pin, Home/Library opens, Settings
open) call the same entries. Other existing buttons are left as they are.
Nothing is migrated speculatively.

### 7.2 Phase-1 set

| Risk | Commands |
|---|---|
| Immediate | `open_resource`, `open_tab`, `open_settings(tab, focus)`, `filter_library`, `search_resources`, `find_apps_ai`, `find_runs_ai`, `new_thread` |
| Undo | `pin` / `unpin`, `set_theme`, `create_canvas` (Undo only while the canvas is untouched, §8.4) |
| Confirm | `connect_repository`, and the existing Ask tools `run`, `run_again`, `set_schedule`, `pause_schedule`, `resume_schedule`, `share`, `unshare` |
| Opens a screen only | Rename, duplicate, trash, restore, visibility, folders, workspaces, members, teams, AI provider, AWS, Slack, Watch dismiss |

Risk comes from the registry, **never** from model or Jev confidence. The
verified risk corrections (rename, pause, dismiss forever, restore of a
scheduled job) are why those actions stay in "opens a screen".

### 7.3 Confirmation card

```
┌ Share counter ─────────────────────────────── Gmail ┐
│ Target     counter (server) · /apps/counter          │
│ Operation  share · add y@example.com as View         │
│ Effect     counter is private; y@example.com gets    │
│            access now; nobody else does.             │
│ [Confirm]   [Change]   [Cancel]                      │
└──────────────────────────────────────────────────────┘
```

The card always shows the exact workspace, the target (title, kind, URL), the
operation, the parameters, and the effect. Its states:

| State | Shown when |
|---|---|
| Pending | Waiting for the user |
| Executing | After Confirm |
| Done | Done, with the result link (e.g. the run page) |
| Failed | The error is shown; the draft and card are kept |
| Cancelled | Recorded server-side as `rejected` |
| Expired | Older than 15 minutes |
| No longer allowed | The permission recheck failed at approve time |
| **Blocked on this preview** | D7 (§7.5) |

`[Change]` puts the command text back in the bar.

**Who may act on a proposal.** Confirm needs edit rights on the target app,
rechecked at approve time. Cancel is an action too: only the person who asked,
or an editor of the target app in the proposal's workspace, may cancel. Anyone
else gets 403 ("No longer allowed") and the proposal stays open, so a viewer
can't close an editor's proposal (user decision, 2026-09-28).

### 7.4 Proposal lifecycle — blockers before any server `/do`

The four bugs below are **release blockers** (amendment 5). Each gets a
failing test first, then the fix, in `packages/control-plane` (`index.js`,
`slack.js`). The `proposals` table (`migrations/0012-proposals.sql`) needs
**no schema change**: `status` is TEXT, and `created_at` exists.

| # | Rule | Implementation contract |
|---|---|---|
| 1 | **Cross-org permission (highest priority).** The recheck uses the proposal's frozen `org` and target, never a name lookup that can match another org. | `editableApp(org, name)` scoped to `proposals.org`. Test: a same-named app in another org can't be acted on. |
| 2 | **One transition, once.** `proposed → approved` happens once only. | A single `UPDATE proposals SET status='approved', approved_by=?, approved_at=? WHERE id=? AND org=? AND status='proposed' AND created_at > datetime('now','-15 minutes')` that must change exactly 1 row before executing. Otherwise 409 with the current status. Web and Slack share this path. Test: two concurrent approves → exactly one execution. |
| 3 | **Cancel is final.** | `POST /api/ask/reject` sets `status='rejected'` (same conditional update). Slack Cancel calls it. Test: approve after reject → 409, no execution. |
| 4 | **Deleting a thread invalidates.** | Thread delete also runs `UPDATE proposals SET status='invalidated' WHERE thread_id=? AND status='proposed'`. Test: approve after thread delete → 409. |

- **Frozen at proposal time:** workspace (`org`), tool, args (which include
  the target app), proposer, and `created_at`.
- **Rechecked at approve time:** the approver's permission in that frozen
  workspace.
- `rejected` and `invalidated` record the resolver in `approved_by` /
  `approved_at`. These are existing columns, so no migration is needed.

**These fixes live in the live control plane.** They take effect only when
`small-cp` is deployed, which is a live promotion and needs your explicit
approval. Until that happens, server-backed `/do` cards render as **Blocked**,
even outside a clone.

### 7.5 D7 guard (absolute)

- In every dev build, a Confirm command with `touchesLive: true` renders its
  card with Confirm disabled:
  "Blocked on this preview: it would change live apps."
- `touchesLive` is set in the registry for everything that reaches live
  `small-cp`, live D1, or live-app R2 paths. That covers all seven Ask tools.
- Immediate and Undo commands that touch only device storage or `LEARN_DB`
  are allowed.
- `connect_repository` writes only to `LEARN_DB` rows and to R2 objects under
  `learn-repositories-dev/` in the dev bucket `small-repositories-dev` (`repositories.js:90`). It is allowed on the
  review copy under the §16 conditions.

## 8. Canvas identity (D1b, dev only)

### 8.1 Record

`LEARN_DB` (`small-learn-dev`) gets a new table, added to `repository-schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS canvases (
 id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL,        -- name = 'canvas-' + 8 hex
 owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,          -- project = 'repo-…' or NULL
 created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT,
 device_id TEXT,                                                      -- §8.3
 UNIQUE(org,name));
```

There is no migration on the live D1 `small`.

### 8.2 API (dev worker only, same pattern as `repo-*`)

| Method and path | Who | Does |
|---|---|---|
| `POST /api/canvases {title?, project?, device_id?}` | Any workspace member | Creates the record and returns the canvas object. `title` defaults to "Untitled canvas" and is at most 120 characters; `device_id` is the §8.3 `small.device` id. |
| `GET /api/apps` | — | Merges the caller's non-archived canvases as `kind:'canvas'`, the way `repository_apps` is merged (`dev-worker.js:23-28`) |
| `GET /api/apps/canvas-*` | Owner | Returns the canvas object (shape mirrors `repositoryApp`) |
| `PATCH /api/apps/canvas-* {title}` | Owner | Renames. The title changes; the slug never does. |
| `POST /api/apps/canvas-*/archive` and `/restore` | Owner | Sets or clears `archived_at` |
| `DELETE /api/apps/canvas-*` | Owner | Undo only (§8.4): deletes the record while no `LEARN_DB` thread exists for it; a touched canvas returns 405 "This canvas has been used. Archive it instead." |
| `GET /api/canvases?archived=1` | Owner | The caller's archived canvases, for the Library Archived chip (§4). Without the parameter it lists the non-archived ones. |
| `GET /api/ask/threads?scope=learn&ref=canvas-*`, `GET /api/ask/threads/canvaschat-*`, `POST …/canvaschat-*/rename {title}` and `/delete` | Owner | Canvas chat history from `LEARN_DB`, on the paths Learn's chat already calls (`ask.jsx:388,401,601,622`). The Agent Bar's History for canvas scope uses the same paths: it lists `/api/ask/threads?scope=learn&ref=<canvas slug>` and opens `/api/ask/threads/<canvaschat id>`. |

- **Visibility:** owner only in phase 1. Content is browser-local, so sharing
  a canvas is honestly unavailable.
- **Learn traffic** for `canvas-*`:
  - `authorizedBoardApp` resolves it from `LEARN_DB`, the same way `repo-*`
    is resolved (`learn-board.js:361`).
  - `/api/learn/ask` answers with the general Learn tutor and stores threads
    in `LEARN_DB`. **It must write no rows to the live D1.**
  - `apiAsk` today resolves apps from the live D1. T04 must specify the
    smallest seam (an injected app context plus a thread store) and test that
    no live-D1 write occurs. This is the largest backend piece in D1b.
- **Content** stays under the existing Learn key,
  `small.adaptive-canvas:<org>:<email>:canvas-<id>`. Nothing in Learn changes.
- **PDF uploads** in a canvas behave as they do today (per-identity R2 key).

### 8.3 Content not on this device

The canvas record lives on the server, but its content lives in one browser.
The page must never open that record as an empty, editable canvas on a device
that doesn't hold the content. That would look like lost work, and editing it
would create two divergent local versions under one canvas identity.

- `create_canvas` stores `device_id`, an opaque random id from
  `localStorage small.device` that is created on first use and is not
  personal data.
- Opening `/apps/canvas-<id>`: before Learn mounts, the canvas route checks
  whether the local blob is absent.
  - **Local blob absent and `device_id` ≠ this device's id:** show this state
    instead of Learn:

    > **This canvas's content isn't in this browser.**
    > It was created on another device, and its learning content is stored
    > only there. It may also have been cleared from this browser's storage.
    > `[Open project]` (if linked) · `[New canvas here]` · `[About local-only storage]`

  - **Local blob absent and the `device_id` matches:** open normally. The
    canvas is new or untouched here.
- Nothing edits the record's content, and there is no "edit anyway".
  `[New canvas here]` creates a separate canvas with its own identity.
- Home and Library canvas cards on another device carry the chip
  `On another device` instead of "Content stays in this browser".
- Cross-device sync and versioning are **out of scope for this milestone**.
  They are the long-term fix.

Add `device_id TEXT` to the §8.1 table.

### 8.4 Undo and removal (amendment 6)

- After `create_canvas`, the result line shows `Canvas created · Undo`.
- **Undo is offered only while the canvas is untouched.** Untouched means the
  local blob is absent or has no blocks, strokes, items, or shapes, and there
  are no threads for it. Undo then deletes the record (dev-only `DELETE`
  allowed for untouched canvases, checked server-side by thread count, and
  client-side by blob).
- Once the canvas is touched, Undo disappears. Removal becomes **Archive**,
  with confirmation from the canvas's `⋯` menu in Library. Archive never
  deletes local content, and Restore brings the canvas back. Permanent delete
  is deferred.

## 9. Learn hook (built on `feature/parallel-work`, not yet on main)

The `feature/parallel-work` owner built the handoff in commit `cc0cbf8`. They
deployed it to `small-cp-dev-small-parallel` and cover it with
`packages/web/e2e/learn-handoff-check.mjs` (30 checks). It reaches this branch
only after that branch merges to `main`. **Until then the bar uses the
fallback copy.** The `feat/canvas-block-conversations` owner agreed to the same
names but has not built it.

**Request.** Send it one of two ways:
- Before navigating to `/apps/<app>?tab=learn[&board=<board>]`, write
  `sessionStorage['small.learn.request'] = JSON.stringify(request)`. Learn
  reads it once on mount and deletes it.
- If Learn is already mounted, dispatch
  `window.dispatchEvent(new CustomEvent('small:learn-request', { detail: request }))`.

Request shapes. Each `id` is a non-empty string, unique per request:
- `{ id, kind: 'teach', app, board?, prompt }` fills the dock composer, focuses
  it, and puts the caret at the end. It **never sends**. It is rejected if the
  composer already holds different text, and that text is left untouched.
- `{ id, kind: 'research', app, board?, source: { kind: 'arxiv'|'wiki'|'youtube', ref } }`
  looks up `ref` through the same path as Learn Search (`/api/learn/search`):
  - a link or id resolves exactly
  - a title or topic takes the first result
  - the source is added as a normal card and registered in Files
  - `pdf` is rejected with a reason
- `app` must equal the open app's slug, and `board` must match the open canvas
  (leave `board` out for the main canvas). A mismatch is rejected.

**Result.** There is exactly one result per id: the window event
`small:learn-result` with detail
`{ id, kind, status: 'prefilled'|'added'|'rejected'|'failed', reason?, resourceId? }`.
- `resourceId` is set only when the status is `added`.
- The same object is stored at `sessionStorage['small.learn.result:<id>']`.
- `rejected` means the input or state was refused. `failed` means Learn tried
  and broke (search error, timeout).
- Idempotency: a repeated id replays the stored result; duplicate deliveries in
  flight produce one action.

**Bar behaviour:**
- `flags.js` exports `learnHandoff`, a constant that is `false` until the
  handoff code reaches this branch's `main`. The PR that merges it flips the
  constant to `true`. It is not detected at runtime, because a missing hook
  and a slow hook look the same.
- **`learnHandoff === false`:** nothing is sent.
  - `/teach` says "Opened Learn. Your prompt wasn't transferred; it's kept
    here."
  - `/research` lists sources with no Add-to-canvas.
- **`learnHandoff === true`:** the bar sends the request and claims success
  **only on a matching result**.
  - Timeouts are 12 s for teach and 30 s for research, with "Adding to
    canvas…" shown meanwhile. These bounds come from the owner: Learn waits
    up to 10 s for the composer or canvas to mount; research then runs an
    uncached `/api/learn/search` call with no client timeout, and waits up to
    5 s for the card to render.
  - A timeout **does not cancel anything**. The card may still land later.
    On timeout the copy is **"Still working, check the canvas"**, never "not
    added". The bar reconciles later by reading
    `sessionStorage['small.learn.result:<id>']` when the sheet reopens.
  - `rejected` or `failed` show Learn's `reason` verbatim.

## 10. Jev: designed, disabled

**No calls, keys, or spend** until you explicitly authorize a shadow
experiment (amendment 3). The design is recorded so the seam exists:

- `DecisionRouter` = `RulesRouter → JevRouter → Ask fallback`. `JevRouter` is
  compiled out unless a dev flag and a server secret both exist.
- **Shadow-data policy** (amendment 4). One redacted form is used for both
  sending and logging; raw command text is never stored or sent.
  - Redaction runs server-side before anything leaves the worker:
    - emails → `<email>`
    - URLs → `<url:github>` / `<url>`
    - catalog titles and slugs → `<resource:kind>`
    - quoted strings → `<text>`
    - code identifiers (CamelCase, snake_case, dotted) → `<ident>`
    - numbers → `<n>`
    - anything that looks like a secret (long high-entropy tokens) → `<secret>`
  - State sent: `{mode, scope_kind, has_selection, candidate_kinds}` only.
  - Never sent: source contents, repository snippets, selections, attachments,
    thread or session text, email addresses, secrets, resource titles.
  - **Stage 0** runs on a synthetic plus hand-redacted corpus checked into the
    repo, before any real command.
  - **Stage 1** runs on real commands in redacted form, dev build only, never
    for private BYOC.
  - The external-provider boundary (TypeSafe API or Workers AI `typesafe/jev`,
    which have different terms) is chosen and approved at authorization time.
  - The shadow log (`LEARN_DB`) stores: redacted template, rules route, Jev
    intent, confidence, latency, and the pinned model id (`jev-1.13.0`).
- **Graduation:** routing-only → read-only navigation/search → Undo-class →
  proposing Confirm-class. Confirm is always required, and the registry's risk
  always wins.

## 11. Settings, Connections, previews

- **Settings** keeps its modal, groups, entries, persistence, and gates (T00
  map).
- Changes:
  - It **renders through a portal**. Today it is inside the `aside`, which is
    `max-md:hidden`, so it can't open on mobile or while the sidebar is
    collapsed.
  - **Escape** closes it.
  - It opens on the `small:settings {tab, focus}` event, which the bar uses.
  - Rabbit Hole copy comes through `PRODUCT` in the first-party strings
    (`Sidebar.jsx:86-89,107` and Connections).
- **No-op controls** (high contrast, language, number format, Enter-newline,
  text direction) are shown disabled with a `Planned` badge.
- **Placeholder panes** (Mail & Calendar, Import, Small MCP, Public pages,
  Emoji) get `Planned` in the nav and "Planned — not available yet." in the
  pane. Nothing is removed.
- **Connections** becomes a catalog. Each row shows the provider, what it
  adds to learning, its availability, and account status **only where real**:

  | Provider | Availability | Account status shown | Action |
  |---|---|---|---|
  | GitHub | Available (public) | "No account needed for public repositories" | `[Start from a repository]`. Private: *Planned*. |
  | Slack | Available (workspace) | none (the code has no status read) | Connect (existing) |
  | AWS | Dev/private builds only | Existing enums (`AwsConnection.jsx`) | Existing |
  | Google Slides | Planned | — | none |
  | Google Drive / Docs | Planned | — | none |
  | Notion | Planned | — | none |

  - `open_settings('connections', 'google-slides')` scrolls to and highlights
    that row.
- **MVP surface cleanup (2026-09-30, `fix/mvp-surface-cleanup`)** supersedes the
  three bullets above for the preview: a setting shows when it works and is
  absent otherwise. The no-op preferences and the placeholder panes are hidden,
  not badged. Connections lists only GitHub, plus AWS when the control plane
  has AWS configured (`app-data.js` `awsAvailable`). The planned providers and
  Slack are hidden; Slack installs the live small bot, which the preview never
  writes to (D7). The planned rows stay in `connections.js` for the bar's
  `connect <provider>` notice. The Start dialog's Sources path offers PDF
  upload only (`StartDialog.jsx` `connectionSources`). The live build is
  unchanged.
  - The sheet says "Opened Settings → Connections. Google Slides is planned;
    nothing was connected." There is no fake OAuth, waitlist, or token field.
- **Return.** Settings overlays the page without changing the route, so the
  page, the Start dialog, and the bar draft survive when it closes.
- **Explore and future features** (profiles, reviews, forks, collaboration,
  publishing):
  - `/explore` preview only.
  - A persistent banner: "Demo data — changes stay in this preview".
  - Fixture storage lives under the namespace `small.preview:`.
  - They never call a mutating API.
- **Share for projects and canvases** shows
  "Sharing projects and canvases isn't available yet." The app Share dialog is
  unchanged.

## 12. Project page (repository)

```
karpathy/nanoGPT                                              [Share·n/a] [⋯]
Overview · Learn · Map · Sources
github.com/karpathy/nanoGPT · master @ 3f2a1c9 · Map ready
```

- **Overview:**
  - The description, read-only; repositories have no edit route.
  - Continue learning (§3.1 logic for this slug).
  - **Canvases:** the project canvas (`?tab=learn`), plus canvases whose
    `project` is this slug, plus `[New canvas]`.
  - **Start here:** the top files by graph degree, from the loaded snapshot.
  - **Map status panel:**
    - `queued`, `indexing`, `ready`, or `failed` (the only states that exist)
    - commit and the number of skipped files (with reasons)
    - `Refresh`, importer only, which opens the screen that does it
- **Learn** is enabled at once. While the map is not ready, the bar shows
  "Code answers are available once the map is ready". Today the button stays
  disabled until `commit_sha` is set at `ready` (`RepositoryPage.jsx:32`,
  `repositories.js:66,93`).
- **Map** is today's graph, Graph|Files toggle, and source view. The duplicate
  "Graph" label goes. The right panel is the Context inspector (§6.5). Graph
  colors move to tokens so dark mode works.
- **Sources** shows the repository source row: provider, URL, branch, pinned
  commit, and status. It has `[Add source]`, which uses the Learn hook or the
  fallback, and `[Manage connections]`, which is `open_settings('connections')`.
- **Build** is hidden (repositories have no runnable artifact).
- **App pages** (server/job) keep their tab row and land on **Runbook** while
  they have no graph (D3). On their Graph tab, the Graph Agent input is
  replaced by the bar, and the right panel is the Context inspector with its
  Results view.

## 13. States (per surface)

| Surface | Empty | Loading | Error | Restricted |
|---|---|---|---|---|
| Home | First-visit Start | Skeletons | Shell error + Retry | — |
| Library | "Nothing here yet" + Start | Existing table loading | Existing | Viewers see the existing Denied/Request access |
| Project | — | Snapshot loading | Map `failed` panel + Refresh (importer) and a usable Learn | Non-importer: no Refresh |
| Canvas | Learn's own empty canvas | Learn | Learn; **content not on this device** (§8.3) | Non-owner: 403 "This canvas is private to its owner" |
| Agent Bar | Placeholder per scope | Streaming + Stop | Error line, text kept, `[Retry]` | Mode dimmed with its reason; Blocked card (D7) |
| Confirmation card | — | Executing | Failed (kept) | No longer allowed / Expired / Cancelled |

## 14. T03 Figma package (after approval)

File **"Rabbit Hole — Home & Projects"**, built from named components with
auto-layout, using synthetic data only.

- **The ten Direction C flows:** Home with the bar; URL connect; open/find by
  name; Home→Project→Map→Learn; mode picker; clarification; confirmation;
  failure; scope change; Settings/Connections.
- **The ten extra states:**
  1. Result sheet above the bar
  2. Map with the bar and the Context panel, and no second composer
  3. Mobile bar and drawer
  4. Scope-change warning with an unsent draft
  5. Confirm blocked on the preview
  6. Cancelled/expired proposal
  7. Create, then Undo while untouched
  8. Create after editing: Archive, not Undo
  9. Streaming while navigating
  10. Routing/provider failure with the text preserved
  11. Canvas content not on this device (§8.3), plus its Home/Library card chip
- Both themes for Home, Project, and Map. One narrow-width variant for each.

## 15. Traceability

| Requirement (brief § / amendment) | Section | Task |
|---|---|---|
| Resume without reconstructing context (§1, §5.2) | 3.1 | T06 |
| Start: four paths, one dialog (§6) | 5, 8 | T06 |
| Standalone canvas first-class (§3, D1b) | 8 | T06 |
| Library filters, keep Apps (§4, §7.1) | 4 | T05, T07 |
| Search vs Ask vs Start distinct (§7.2) | 6.4, 6.6 | T07 |
| Project hub, not graph-first (§8) | 12 | T08 |
| Map: one label, inspector, dark mode (§8.4) | 6.5, 12 | T09 |
| One text input; right panel = context (A1) | 6.1, 6.5 | T08, T09 |
| Learn hook via contract only (A2) | 9 | T06, T08 |
| Jev designed, disabled; shadow-data policy (A3, A4) | 10 | — (later, with authorization) |
| Proposal blockers (A5) | 7.4 | T10 prerequisite |
| Canvas Undo only while untouched (A6) | 8.3 | T06 |
| Scoped memory, frozen scope (A7) | 6.3 | T05 |
| Agent Surface long-term contract (A8) | 6.1 | recorded |
| Four modes only (A9) | 6.2, 6.4 | T05 |
| Registry risk, D7 absolute (A10) | 7 | T05, T11 |
| Connect Google Slides → Planned (A11) | 11 | T05 |
| Figma states (A12) | 14 | T03 |
| Settings reused, not rebuilt (§4.1) | 11 | T05 |
| No fake functionality (§16) | 7.5, 9, 11 | T11 |

**Contradiction check:**

- §7.4 fixes need a live deploy, while D2 keeps everything dev-only. This is
  resolved by blocking server `/do` until you approve that promotion.
- The canvas routes use `/apps/canvas-*` although the brief says canvases
  aren't apps. It is a URL only; labels always say "Canvas".

## 16. Resolved: Q1 and the meaning of D7 (2026-09-23)

**D7 means:** the review environment must not mutate production-visible user
or application state. It does **not** mean the environment can never write
anything.

`connect_repository` **may execute on the review copy.** It stays
Confirm-class, because it creates persistent state. It is exempt from the
Blocked treatment only while all of these hold, and T04 verifies each against
the code:

1. The repository row goes only into `small-learn-dev` (`LEARN_DB`).
2. Artifacts stay under `learn-repositories-dev/` in the dev bucket `small-repositories-dev`
   (`repositories.js:90`; moved out of the live `small-runs` bucket 2026-09-28).
3. No existing production artifact can be overwritten. Keys contain the
   `LEARN_DB` id and the commit, and production writes nothing under that
   prefix.
4. It never calls a live app, share, or member mutation API.
5. Review-created records can be identified and cleaned up separately
   (`LEARN_DB` rows by `org`, `owner_email`, and `created_at`, and their R2
   keys through `repository_versions`).
6. The UI still says that imported public repositories are workspace-visible.

**If implementation finds any of these false, D7 wins and the action is
blocked.**
