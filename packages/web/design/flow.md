# small · UI flow

Every screen, what's on it, and what each click does. Wireframes are to scale in spirit,
not pixels — `components.html` is the pixel reference.

The mental model: **the org is a workspace, an app is a page, a run is a row in that page's
database.** Same as Notion, so nothing needs explaining.

---

## 0. Login

`/login` — one field, one button. No sidebar yet.

```
┌──────────────────────────────────────────────┐
│                                              │
│              ● small                         │
│                                              │
│         Sign in to acme                      │
│         ┌──────────────────────────┐         │
│         │ you@acme.com             │         │
│         └──────────────────────────┘         │
│         [ Email me a link ]                  │
│                                              │
│         We'll send a link. No password.      │
└──────────────────────────────────────────────┘
```

Click the link in the email → lands on whatever they were trying to open, or `/apps`.
The org is the email domain. First person from a domain creates the org by logging in.

---

## 1. The sidebar — always present

```
┌─ 240px ────────────┐
│ [A] acme        ‹‹ │  ← workspace row. Click name: switch org / log out. ‹‹ on hover collapses.
│ 🔍 Search       ⌘K │
│                    │
│ ▾ Apps           + │  ← org-wide apps (visibility = domain). + copies `small deploy`.
│   ◉ refund-dash…   │  ← icon = kind. Selected row is bg-active.
│   ▸ 🗀 ml           │  ← folder: folds on click, drag rows in/out. New folder in the header ⋯.
│   ◷ s3-log-writer  │  ← clock = scheduled job
│                    │
│ ▾ Shared           │  ← private apps with people/teams on them — mine and ones shared to me
│   ◉ counter        │
│                    │
│ ▾ Private          │  ← my private apps shared with nobody yet
│   ▶ scratch-job    │
│                    │
│ ▾ Recent           │  ← last 3 opened
│   ▶ yolo-job       │
│                    │
│ 🗑 Trash            │  ← restore within 30 days; redeploying a trashed name also revives it
│ 👥 Members         │  ← org-level people. See §6.
│ ⚙ Settings         │
│ ? Help             │
│ sara@acme.com      │
└────────────────────┘
```

The Notion Teamspaces / Shared / Private split. Which section an app lives in is derived,
never chosen: org-visible → **Apps**; private with any person or team on it → **Shared**;
private and unshared → **Private**. An app made private while filed in a folder keeps its
`folder_id` but lists only under Private — no double listing. Every section header is a
**▾/▸ chevron** (click folds; state persists) and a link to that section's filtered
`/apps` view.

Folders are org-wide and organizational (`folders` table, `apps.folder_id`) — filing an
app changes nothing about access — but a folder can itself be **shared** with a person or
`#team` as a live grant over every app currently or later filed in it (`folder_shares`).
Drag an app onto a folder, Private, or the workspace root to move it; moves that change
visibility confirm first.

**Layering rule:** every popover and modal born in the sidebar (workspace menu,
Settings, row `⋯` menus, Trash panel) renders **above and outside** the sidebar —
portal to the document root, never clipped by the sidebar's `overflow` or width and
never under the content pane (seen live: the workspace menu and Settings modal cut
off at the sidebar edge).

**Click an app** → `/apps/<slug>`, §3.
**Click Members** → `/members`, §6.
**Click Settings** → `/settings`, §7.
**Hover an app row** → `⋯` appears: Open · Copy link · Runbook · Move to folder · Move to Trash.
**Trash** → slide panel; items restore in place and are gone for good after 30 days.

Right-click anywhere on the app list is the same menu.

---

## 2. `/apps` — the home page

What you see after login, and when you click "Apps" in the breadcrumb.

```
acme / Apps                                          [Search] [Filter] [Sort]
─────────────────────────────────────────────────────────────────────────────
Apps

 Name               Kind      Access            People   Deployed        
 ◉ refund-dashboard server    anyone @acme.com  ●●●+4    2 hours ago     ↗
 ▶ yolo-job         job       anyone @acme.com  ●●       yesterday       ▶
 ◷ s3-log-writer    scheduled anyone @acme.com  ●        3 days ago      ▶
 ◉ counter          server    only shared       ●●●      last week       ↗
                                                                    Count 4
```

A Notion database. **Click a row → the app page** (the project itself). The hover
affordance is different: **Open** (`↗`) opens a right side peek showing the **runbook** —
read what it is without leaving the list; `▶` Run for jobs acts in place. App names are
plain text, not underlined — the whole row is the link, underlining one cell reads as a
second, different link. Empty state: *No apps yet · Copy `small deploy`*.

---

## 3. `/apps/<slug>` — the app page

This is where a click on the sidebar lands.

```
acme / Apps / refund-dashboard                              [Share] [⋯]
─────────────────────────────────────────────────────────────────────────────

◉  refund-dashboard                                        ← 40px, editable

Kind  server ·  Access  anyone @acme.com ·  Deployed 2h ago ·  Source main · a3f8e21 (3 behind) ·  Owner ●sara

  Runbook    Run    Logs                          [ Open ↗ ]   ← primary, servers only
  ────────
```

**Header** never changes across tabs. **Share** opens the share popover (§5). **⋯** is the
same menu as the sidebar row. **Open** is the primary action for servers; for jobs it's
replaced by the Run tab being the default.

**Breadcrumb shows the filing path**: an app filed in a folder reads
`acme / Apps / hhtg / counter` — the folder crumb clicks through to that folder's
filtered list. Unfiled: `acme / Apps / counter`. Private and Shared apps crumb through
their section name instead of Apps. (Seen live: folder missing from the crumb.)

**Default tab:** Runbook for servers, Run for jobs. The colleague who arrives from a link
sees an explanation first for a server, and the thing to do first for a job.

### 3a. Runbook tab

The generated `RUNBOOK.md`, rendered in Notion typography. Files table links to GitHub at
the deployed commit if the repo is public. This is what a colleague reads to understand
the tool.

**Charts — the `/` command.** The runbook is a BlockNote editor; typing `/` opens its
block menu, which already carries the standard blocks plus **Drawing** (Excalidraw).
**Chart** joins it. Charts render with [nivo](https://github.com/plouc/nivo) — only
`@nivo/line`, `@nivo/bar`, `@nivo/pie`, `@nivo/scatterplot`, `@nivo/calendar`, each
lazy-loaded so the runbook tab pays nothing until a chart of that type renders.
Inserting a chart drops the text cursor, so no "type / for commands" placeholder hangs
under the fresh block — the block contains the chart and its config row, nothing else.

```
  ... generated RUNBOOK.md ...

  ┌ Run duration, last 30 runs ──────────────── ⋯ ┐   ← ⋯: Edit · Duplicate · Delete
  │        ▂▄▃▆▅█▄▂▃▅   (nivo line)               │
  └───────────────────────────────────────────────┘
  Type / for blocks
```

Inserting a chart configures it inline, three fields:

- **Data** — *Runs of this app* (one point per run: status, duration, started_at, and
  every `[inputs]` column — same data as §3c) or *an output file* (`.json`/`.csv`) of the
  latest finished run.
- **Type** — line / bar / pie / scatter (two numeric fields) / calendar (runs per day,
  the GitHub-graph view — natural for scheduled jobs).
- **Fields** — x + y (label + value for pie), picked from the columns of the chosen source.

A ⚙ at the row's end folds out the rare knobs — color scheme (named nivo schemes),
decimals (auto/0–3, formats tooltips, labels and the y axis), stacked/grouped for bars.
Deliberately not offered: chart titles (type a heading block above — that's the Notion
way), custom hex colors, fonts, margins.

Charts are BlockNote blocks (same pattern as the Excalidraw block): config lives in the
block's props and rides the runbook JSON autosave, so it survives deploys, reorders like
any block, and needs no storage of its own. Data is live: a chart queries the existing
runs/outputs APIs on open, never a snapshot. Editors insert and edit; viewers see charts
rendered read-only.

Backend: nothing new — `GET /api/runs?app=` and the outputs routes already serve
everything a chart plots. Built: `ChartBlock.jsx` (block + `/chart` menu item),
`chart-data.js` (pure row/series shaping, node --test covered).

### 3b. Run tab — jobs with `[inputs]`

```
  Runbook    Run    Logs
             ───

  image        ┌─────────────────────────────┐
               │  ⬆  Drop a file or click    │      Photo to analyse
               └─────────────────────────────┘

  threshold    ●────────────○─────── [0.7]         Detection confidence, 0 to 1

  account      [ acme                    ▾ ]       Which customer

  since        [ 2026-09-01 ]  7 days ago

  dry run      (●  )

  [ Run ]        Last run 2 hours ago by sara · finished in 14s · Run again with those inputs
```

Generated entirely from `small.toml` `[inputs]`. Label left (200px), control right (320px),
help under. Required fields marked with nothing more than the absence of "optional".
The **Run** button is the one primary button on the page.

**Click Run** → validates client-side → posts → the run page opens as a **side peek** (§4).
The form stays behind it with the values, so "run again with a tweak" is: close the peek,
change one field, Run.

Jobs **without** inputs: no form, just the Run button and the last-run line.
Servers: this tab doesn't exist; **Open** is in the header.

### 3c. Logs tab

**Jobs** → the runs database. One row per run, one column per input so you can scan what
was tried. Click a row → side peek of that run. Toolbar: Filter, Sort, Properties, Search,
New run (which is just the Run tab). Calculate footer: count, avg duration.

```
  Run       Status     Started by   When         Duration   image       threshold
  a3f8e21   finished   ● sara       2 hours ago  14s        photo.jpg   0.7        ▶
  9c2d110   failed     ● bob        yesterday    3s         team.png    0.5        ▶
  7ab04f9   running    ● cron       just now     —          daily.jpg   0.5        ▶
                                                            Count 3     Avg 0.57
```

**Servers** → the request log. Time, method, path, status pill, ms, person. Filter by
person or status. Rejected direct-origin hits show as a grey `rejected` pill with no person.

---

## 4. The run page — side peek

Opens from Run or from a Logs row. 480px panel from the right; the page behind stays
interactive. Full page at `/apps/<slug>/runs/<id>` if you open it in a new tab.

```
                              ┌─ 480px ──────────────────────────────┐
                              │ Run a3f8e21                  [⤢] [×] │  ← ⤢ opens full page
                              │                                      │
                              │ finished · ● sara · 2h ago · 14s     │
                              │                                      │
                              │ Inputs                               │
                              │   📎 image      photo.jpg  2.1 MB  ⬇ │
                              │   #  threshold  0.7                  │
                              │   Aa account    acme                 │
                              │                                      │
                              │ Output                               │
                              │   [thumbnail: annotated.jpg]      ⬇  │
                              │   boxes.json                      ⬇  │
                              │   ┌────────────────────────────┐     │
                              │   │ {"people": 2, "boxes": …}  │     │
                              │   └────────────────────────────┘     │
                              │                                      │
                              │ Log                                  │
                              │   ┌────────────────────────────┐     │
                              │   │ loading yolov8n.pt         │     │
                              │   │ 2 people detected          │     │
                              │   │ ✓ finished (exit 0)        │     │
                              │   └────────────────────────────┘     │
                              │   Show all 41 lines                  │
                              │                                      │
                              │ [ Run again ]                        │
                              └──────────────────────────────────────┘
```

While running: status pill is blue, log streams, Output section says *Waiting…*.
**Run again** → the Run tab with these inputs pre-filled.

Backend for this page is live: the run row's `inputs` JSON drives the Inputs block (and
the per-input columns in §3c), `GET /api/runs/<id>/outputs` lists the files with sizes,
`GET /api/runs/<id>/outputs/<name>` serves each ⬇ (R2-backed, 100 MB per run). The CLI
mirror is `small run <app> --download ./out`.

---

## 5. Sharing — per app

The **Share** button in any app header. Popover, Notion-style.

```
                                  ┌─ Share ────────────────────────────┐
                                  │ [ Add an email…          ] [view ▾]│  ← Enter adds
                                  │                                    │
                                  │ Anyone at acme.com       can view  │  ← toggle; off = private
                                  │                                    │
                                  │ ● sara@acme.com          owner     │
                                  │ ● bob@acme.com           can edit ▾│  ← ▾ changes role / removes
                                  │ ● jane@partner.io        can view ▾│
                                  │                                    │
                                  │ 🔗 Copy link                       │
                                  └────────────────────────────────────┘
```

The email field autocompletes from org members and `#teams`; adding a team is a live
grant (grow the team later, access follows). Viewers see the same popover read-only, no
add field. This is the **only** place a colleague adds a person to one app — it's a
Google Doc's share dialog, deliberately.

Someone without access who opens the link sees the access-denied page with a
**Request access** button that emails the owner.

---

## 6. `/members` — people and teams, org-level

The place for "who's in this org and what can they see." Sidebar → Members.

```
acme / Members                                              [Invite]
─────────────────────────────────────────────────────────────────────────────
Members

  Person            Role     Apps                  Last active
  ● sara@acme.com   admin    4 owned · 0 shared    just now
  ● bob@acme.com    member   1 owned · 3 shared    2 hours ago
  ● jane@partner.io guest    0 owned · 1 shared    yesterday      ← outside the domain
                                                      Count 3

Groups                                                      [New group]
  #finance      ●●●  3 people · shared on 2 apps
  #ml           ●●   2 people · shared on 1 app
```

- **Member** = anyone with an `@acme.com` email who has logged in. Automatic.
- **Guest** = someone outside the domain who was shared on at least one app.
- **Admin** = the first person from the domain, and anyone they promote. Admins can remove
  people and see every app regardless of visibility.
- **Invite** sends a magic link and pre-creates the member row, so you can share with
  someone before they've ever logged in.
- **Groups** are `#finance`-style teams — share an app (or a folder) with a team instead
  of five emails; the share popover's email field accepts `#finance`. Built: teams are
  live references, so adding someone to a team later grants everything shared with it.

Click a person → their page: the apps they own, the apps shared with them, their runs.

---

## 7. `/settings` — org

Org name and icon, the domain, the default visibility for new apps (domain / private),
the login email sender, and **Delete org** at the bottom in red with a confirmation modal.
Later: IdP connection, org policy for the review, billing. Keep it a single page.

---

## 8. Search `⌘K`

From anywhere. Results grouped: Apps · Runs · Runbooks · People. Enter opens. Searching
`sara` finds her apps and her runs; searching `0.7` finds runs with that input.

---

## 9. The three arrival paths

**The builder** runs `small deploy`, gets a URL, and probably never opens the web app —
until a colleague asks a question. Then they open the app page → Logs.

**The colleague** gets a link in Slack. Logs in with their work email. Lands on the app
page: Runbook first (server) or Run first (job). Uses the tool. Maybe clicks Share to add
one more person. Never sees a terminal.

**The admin** opens `/members` once a month to see who's here, and `/apps` to see what's
running. Later, the review findings and policy live here too.

Every path is one click from the sidebar. Nothing is more than two levels deep.
