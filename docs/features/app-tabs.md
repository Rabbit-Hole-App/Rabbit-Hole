# App page tabs: Graph-first apps

Status: built and deployed to small-cp-dev (worker version `81c350d0`,
2026-09-17); verified by `packages/web/e2e/app-tabs-check.mjs` (10 checks).
Live promotion pending approval. Owner decisions recorded 2026-09-17.

The former Agent tab is now the Graph tab; older docs that mention the Agent
tab refer to today's Graph tab. `?tab=agent` links map to Graph.

Every app — job, server, repository — opens as a full page with a graph map as
its home view. A single tab row replaces the `Apps / <name> / Graph` breadcrumb.

## Page structure

Every app page uses the repository-page format: compact title row (name +
Open/Share/⋯ actions), a pill tab row directly beneath, a one-line meta strip
(kind, deployed, source, owner, schedule), the description, then full-bleed
tab content. The old Notion property grid and the app-page breadcrumb are
gone; the run subpage keeps its breadcrumb. Tabs are bordered pills with a
grey (bg-active) selected state:

**Graph · Runbook · Run · Logs · Learn**

- No breadcrumb anywhere on the app page.
- Clicking an app anywhere (sidebar, Apps table row) lands on the **Graph** tab.
- Deep links: `/apps/<name>?tab=graph|runbook|run|logs|learn`. The legacy
  `?tab=code` continues to resolve to the Graph tab.

### Tab visibility per app kind

Same rules as today's side peek:

| Tab | Shown for |
|---|---|
| Graph | Every app. Apps without a graphify graph show a blank canvas |
| Runbook | Jobs and servers |
| Run | Jobs only |
| Logs | Jobs only |
| Learn | Apps with pinned source (repositories today) |

## Graph tab

- The graphify map is the canvas: code nodes plus the app's moving parts
  (service, runbook, last run, schedule) on one canvas.
- **Files stays a mode toggle inside the Graph tab**, exactly as the repository
  page behaves today. Files is not a sixth tab.
- Right panel hosts the **Graph Agent** — an operational copilot scoped to this
  app. Its context: the graph, pinned source, app metadata, runs, logs, and the
  runbook, so it can answer questions like "why did yesterday's run fail?" with
  source pills into code and run logs.
- The Graph Agent is a separate agent from the Learn Agent: separate system
  prompt, context assembly, and tools. The existing ask-about-selection flow on
  the repository graph becomes the Graph Agent.

## Learn tab

Unchanged from the built experience: selecting Learn performs the immersive
takeover — sidebar collapses, home button appears, the tab row is hidden while
inside. Leaving Learn returns to the Graph tab.

## Graphify at deploy

- From now on, **every `small deploy` from the CLI graphifies the app** — a
  graph is produced as part of the deploy, so every new app has a populated
  Graph tab from its first deploy.
- **Old apps are disregarded**: no backfill. An app without a graph still
  lands on its Graph tab, which stays a blank canvas until a deploy graphifies
  it. The Graph Agent panel appears only where a graph exists.

Constraint carried from AWS BYOC: customer source, inputs, outputs and logs
travel directly to customer AWS; the dev control plane accepts connection
metadata only. Graphify for BYOC apps must respect this — the pipeline design
(what the CLI extracts, where the graph is computed and stored) is its own
feature spec and is out of scope here.

## Apps table peek

The side peek from the Apps table (Runbook / Run / Logs) **stays for now** as a
quick glance. Its tab content is the same content the full-page tabs render.

## Out of scope for this spec

- Graphify pipeline mechanics (extraction, storage, BYOC placement).
- Logs for servers (Logs remains jobs-only until specified).
- Any change to Learn's internals or the Learn Agent.
