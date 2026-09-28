# Rabbit Hole Home / smart-home: master checklist

Source of truth for the smart-home track (user, 2026-09-28). No new work
packages; do not reopen finished work unless something regresses. Every visual
batch is reviewed as actual deployed screenshots in Figma ("Rabbit Hole — Home &
Projects", `ef9SfiemEsPQF2bd8B1os3`), with the exact node URL.

| WP | Scope | Status |
|---|---|---|
| WP1 | Foundation / routing, repository resolution | Done, frozen |
| WP2 | Canvas backend (LEARN_DB canvases) | Done, frozen |
| WP3 | Proposal lifecycle / action safety | Done, frozen |
| WP4 | Home / Library / Explore / Start / Settings | Done (closeout 2026-09-28) |
| WP5 | Mothership Agent Bar / command surface | Active |
| WP6 | Project / Canvas / App destinations | After WP5 |
| WP7 | Final integration / MVP verification | Last |

## Product model (user, 2026-09-28)

- **Project** = the learning and source hub (e.g. nanoGPT): its source repository,
  Map, Learn canvases, sources, experiments, and the apps built from it.
  Destination: Overview | Learn | Map.
- **Canvas** = one learning workspace (cards, notes, drawings, sources, notebooks,
  interactions). Opens directly in Learn.
- **App / Job / Server** = an operational or build artifact (status, deployment,
  last run, inputs and outputs, Run, logs). A Project may produce many.
- So the Library keeps Projects and Canvases as cards and Apps as operational
  rows. Never merge them into one generic resource UI.
- Source owner badge: solid blue with a white check, meaning only "Created by the
  owner of the source repository" (never identity, quality, endorsement or
  popularity). A card's GitHub line opens GitHub in a new tab; "Forked from"
  opens the original Rabbit Hole resource.

## WP4 closeout

- Library header: `Library [Filters] [Start a rabbit hole]`; no permanent tabs.
- One Filters popover (Type; Ownership); View all and the bar set the same state.
- Mobile Library has no horizontal tab or chip strip.
- Start: a stale list plus a different `/tree/<branch>` never dead-ends in a
  Failed card; it offers WP1's open-or-connect choice.
- Explore stays simple.
- Figma: Library default, Filters open, Projects / Canvases / Apps filtered,
  Library mobile, Home desktop, Home mobile. Wait for visual approval.

## WP5 Mothership

Status (2026-09-28): floating Mothership chosen ✅ (review switch removed) · + Add menu ✅ ·
Send → Stop ✅ · Home slash picker ✅ (short copy) · project scope ✅ · Map node scope ✅ ·
scope chips on the dock ✅ · shared Learn command contract ✅ (`agent/slash.js`,
`docs/features/rabbit-hole-commands.md`; the Learn owners wire it) · response states ✅
(built-in answers, clarification, unknown command, unsupported) · sidebar / icon rail (in
progress) · final visual gate ⬜.

Result surface rule for WP6: Home, Library and Project Overview answer in the sheet above the
Mothership; Map answers longer results in the right Context panel; Learn keeps its own
conversation. The bottom sheet is not the permanent answer UI for Map.

- Composer: no separator; about 64-76px desktop, 56-68px mobile; stronger surface
  and padding; input dominant; + Add/Attach; mode control; Send becomes Stop
  while responding; scope chips secondary; never a giant chat panel.
- Placement: Home, Library, Explore, Project (project scope), Map (project and
  node scope), App (after WP6); hidden on Learn (its composer owns the space).
- Modes: Auto (default), /ask, /teach, /research, /do; `/` opens the picker.
- Home / Library shortcuts: /find, /open, /new, /connect, /run, /share. Natural
  language works too: "Find my nanoGPT project", "Show canvases about attention",
  "Open the project I worked on recently", "Start a rabbit hole from
  karpathy/minGPT" (owner/repo is a narrow shorthand through WP1's resolver).
- Learn shortcuts: /ask /teach /research /do /deeper /simplify /example
  /practice /quiz /compare /source /notebook. The selection (card, equation,
  notebook cell, Map node) changes the context. Unavailable commands are not shown.
- Home /teach hands off to Learn: resolve or create the canvas, navigate, prefill
  the Learn composer, never send silently.
- Architecture: clicks, slash commands and natural language converge on the same
  typed semantic actions; no AI DOM-clicking; drafts survive navigation; scope
  freezes at Send; navigation and scope warnings work.
- Figma: integrated and slightly floating dock variants; Home, Library, Project,
  Map, dark, mobile, project + node scope, slash picker open.
- The Library's bottom card scrolls fully above the larger dock (mobile too).

## Sidebar shell (reviewed with WP5/WP6)

- Expanded: workspace/account; Home, Library, Explore; then Members (if
  needed) and Trash; New chat only if it keeps a clear job. Projects, Canvases
  and Apps are not repeated in the sidebar: the Library owns browsing.
- Map each legacy item to its replacement, with regression checks, before
  removing it: Apps (replaced by the Library Apps filter), Private (remove
  unless it maps to a real workflow), New chat (the Mothership is the
  persistent conversation).
- Desktop collapsed: a 48-56px icon rail (workspace, Home, Library, Explore,
  Members, Trash) with tooltips and the active destination visible. Never fully
  hidden on desktop.
- Mobile: fully hidden, reopened as a drawer. No icon rail on a phone.

## WP6 destinations

- PROJECT = learning hub = Overview + Learn + Map. Overview (default): identity
  and source, Continue learning, learning canvases, light source/commit info,
  recent activity; no operational clutter. Learn is the real Learn canvas (its
  composer owns the bottom; several canvases selectable). Map reuses the graph;
  the bar is the only input; a node selection sets `[project ×] [node ×]`; a
  Context/Selected/Source panel; "Learn this" or /teach this hands off to Learn.
- CANVAS = learning workspace = opens directly in Learn. A project-owned canvas
  shows its parent lightly. "This canvas's content isn't on this device." never
  becomes an empty editable canvas.
- APP / JOB / SERVER = operational artifact = operational detail: status, last
  run, runtime, outputs; Run only where runnable; "Built from <project> →" when
  it has one; the bar available; confirmation for persistent/external actions.
- Figma: Project Overview, Learn, Map, node selected, scoped bar, Map → Teach →
  Learn, standalone canvas, project-owned canvas, not on this device, App detail,
  Job detail, App → source Project, mobile Project Overview, mobile Learn.

## WP7 final integration

Full journey Home → Project → Map → select → Teach this → Learn → cards/notebook
→ back to Project; Library → Canvas → Learn; Library → App/Job → detail;
natural-language navigation; the bar survives page changes; no double composer
on Learn; desktop, mobile, dark; no production-visible mutation from the review
copy; all browser checks green; final Figma; final whole-branch review; the
user's visual approval.

## Deferred

Public Explore backend; real source-owner and fork fields; ranking by forks;
rare Markdown / multi-link GitHub parsing; complex /blob/ branch paths; AWS
preview-warning polish; the old Library 141px offset; toast redesign;
schedule/watch dark-mode pills; rare picker keyboard cases.
