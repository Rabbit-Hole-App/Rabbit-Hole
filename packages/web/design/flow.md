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
│ ▾ Apps           + │  ← + copies `small deploy` with a toast. Section folds on click.
│   ◉ refund-dash…   │  ← icon = kind. Selected row is bg-active.
│   ▶ yolo-job       │
│   ◷ s3-log-writer  │  ← clock = scheduled job
│   ◉ counter        │
│                    │
│ ▾ Recent           │  ← last 5 opened
│   ▶ yolo-job       │
│                    │
│                    │
│ 👥 Members         │  ← org-level people. See §6.
│ ⚙ Settings         │
│ ? Help             │
│ sara@acme.com      │
└────────────────────┘
```

**Click an app** → `/apps/<slug>`, §3.
**Click Members** → `/members`, §6.
**Click Settings** → `/settings`, §7.
**Hover an app row** → `⋯` appears: Open · Copy link · Runbook · Delete.

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

A Notion database. Click a row → the app page. Hover → `↗` Open for servers, `▶` Run for
jobs, both act without leaving the list. Empty state: *No apps yet · Copy `small deploy`*.

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

**Default tab:** Runbook for servers, Run for jobs. The colleague who arrives from a link
sees an explanation first for a server, and the thing to do first for a job.

### 3a. Runbook tab

The generated `RUNBOOK.md`, rendered in Notion typography. Files table links to GitHub at
the deployed commit if the repo is public. Nothing else on the page. This is what a
colleague reads to understand the tool.

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

Viewers see the same popover read-only, no add field. This is the **only** place a
colleague adds a person to one app — it's a Google Doc's share dialog, deliberately.

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
- **Groups** are `#finance`-style — share an app with a group instead of five emails. The
  share popover's email field accepts `#finance`. Groups are in the roadmap's "when a company
  asks" tier, so this section can ship empty with the New group button doing nothing yet.

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
