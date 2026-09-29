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
| WP5 | Mothership Agent Bar / command surface | Done (naming closeout 2026-09-28) |
| WP6 | Project / Canvas / App destinations; Map as conversational knowledge graph | Active |
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

Status (2026-09-28): floating composer ✅ · + Add ✅ · Send → Stop ✅ · slash picker ✅ ·
Project scope ✅ · Map node scope ✅ · visible response states ✅ · shared Learn command
contract ✅ (`agent/slash.js`, `docs/features/rabbit-hole-commands.md`; the Learn owners wire
it) · /research global semantics ✅ (product vs review-copy limits) · compact result sizing ✅
(content-sized, at most 45vh) · sidebar / icon rail ✅ integrated · mobile drawer ✅ integrated ·
final Figma gate ✅ ("WP5 · batch 2", node 56:222, closeout row; clone 790858aa, commit
6c6b070, browser suite 75/75). Closed; no further WP5 features.

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

Built 2026-09-28, preview only (T02 §2 has the layout; the live sidebar is unchanged).
Harness checks sh-sidebar, sh-rail, sh-drawer and sh-legacy pass on the clone.

- Identity (user, 2026-09-28): the chrome names the product, `Rabbit Hole` with its mark
  (lucide Rabbit on an ink tile until a real mark exists), never a workspace or a letter from
  the email domain. The workspace is context: a separate switcher under the brand, named by
  its real name, else `Personal` (api.js `workspaceLabel`); gmail.com never becomes `Gmail`.
  Home, Library and Explore have no workspace breadcrumb. The result sheet header is the
  scope (`nanoGPT · CausalSelfAttention`), or `Rabbit Hole` on Home/Library/Explore. Copy
  about visibility says who sees it (`anyone who signs in with an @gmail.com email`), not
  the label. One location state: a resource page marks its Pinned row, not Library.
  Check: sh-naming.
- Expanded: the brand; the workspace switcher; the Search and Notifications icons; Home, Library,
  Explore; Pinned (flat); a divider; Members; Trash. Projects, Canvases and Apps
  are not repeated in the sidebar: the Library owns browsing.
- Desktop collapsed (Ctrl/⌘+\ or Learn): a 52px icon rail (the product-mark tile with the
  workspace menu, Open sidebar, Search, Notifications with the unread count, Home,
  Library, Explore, Members, Trash) with tooltips; the current destination has
  aria-current and the active surface; a resource page marks no global destination (its
  Pinned row carries the state). No Pinned, no resize handle. The Agent Bar sits beside
  it. Never fully hidden on desktop.
- Mobile: fully hidden, reopened as a drawer from a top strip (Open sidebar);
  navigation, Esc and the backdrop close it. No icon rail on a phone.

| Legacy item | Replacement | Regression check |
|---|---|---|
| Apps tree and folders | Library Filters → Apps | sh-legacy |
| Shared | Filters → Shared with me | sh-routes |
| Private | Filters → Mine; the app Share popover | sh-legacy, sh-library |
| Recent | Home Recent | sh-home |
| New chat, Ctrl/⌘+O | the Mothership (Agent Bar); Ctrl/⌘+O focuses it | sh-legacy |
| + New → Chat / App | the Mothership / Settings → Developer | sh-sidebar |
| Pin from an Apps row | Pin and Unpin in the Library card ⋯ menu | sh-sidebar |
| AWS catalog error under Apps | the Library body, same text | none (no AWS error on the test user) |
| Back (reopens the sidebar) | the rail's Open sidebar | sh-rail |
| Folder create, rename, delete | none yet: the Library's ⋯ actions later (ponytail); API and data kept | none |

## WP6 destinations

Checkpoint 1 built (2026-09-29), waiting for the user's Figma review: the Project, Canvas
and App destination shell on clone small-cp-dev-smart-home (841c3a8a), commits 32bf6f6..0a5d6b1,
browser suite 90/91 (the miss, G2-branch, is GitHub metadata through the repository worker and
passed 2/2 on rerun). Checks: wp6-app-d7, wp6-app-denied, wp6-app-bar, wp6-canvas, wp6-project,
wp6-learn, wp6-map, wp6-learn-this, wp6-overview, wp6-app-ops, wp6-built-from, wp6-mobile,
wp6-library-d7, wp6-show-on-graph. Decisions: docs/superpowers/plans/2026-09-28-wp6-checkpoint1-destinations.md
(Open decisions). Figma: node 65:222 "WP6 · checkpoint 1 (destinations)". Deferred minors: Start
learning before a snapshot exists; a canvas made from the bar shows after a reload; a stale app
chip while switching apps.

- PROJECT = learning hub = Overview + Learn + Map. Overview (default): identity
  and source, Continue learning, learning canvases, light source/commit info,
  recent activity; no operational clutter. Learn is the real Learn canvas (its
  composer owns the bottom; several canvases selectable). Map reuses the graph;
  the bar is the only input; a node selection sets `[project ×] [node ×]`; a
  Context/Selected/Source panel; "Learn this" or /teach this hands off to Learn.
- CANVAS = learning workspace = opens directly in Learn. A project-owned canvas
  shows its parent lightly. "This canvas's content isn't available in this browser."
  (supporting line: "The canvas exists, but its local content was created in another
  browser or has been cleared.") never becomes an empty editable canvas. Content is
  browser-local, so the copy never says "device" (user, 2026-09-28).
- APP / JOB / SERVER = operational artifact = operational detail: status, last
  run, runtime, outputs; Run only where runnable; "Built from <project> →" when
  it has one; the bar available; confirmation for persistent/external actions.
- Figma: Project Overview, Learn, Map, node selected, scoped bar, Map → Teach →
  Learn, standalone canvas, project-owned canvas, not in this browser, App detail,
  Job detail, App → source Project, mobile Project Overview, mobile Learn.

Checkpoints (user, 2026-09-28). Checkpoint 1: the destination model - Project
Overview | Learn | Map (graph + right Context/Conversation panel + the Mothership as the
only input), Canvas opening directly in Learn, the App/Job/Server operational page; the
14 captures above. Checkpoint 2: the knowledge-graph layers below. Checkpoint 2 never
blocks checkpoint 1.

Dev storage hygiene (user, 2026-09-28): dev repository snapshots move out of the live
`small-runs` bucket into a dedicated dev storage resource. The review clone writes only
to dev storage, production is unchanged, the environment config makes a cross-environment
write impossible by construction, and one test proves dev cannot write to the production
location. WP1's UX is not reopened.

### Map = conversational knowledge graph (user, 2026-09-28)

Path A (user, 2026-09-28): WP6 builds this UX now on clearly labelled dev fixtures. No
transcript capture, decision extraction, new DB tables or ingestion infrastructure in
WP6 (see Deferred: Knowledge Capture v1).

- Two truths, never mixed. Real behaviour: for a real code node, "Why does this exist?"
  may explain what the code does and infer technical reasons from source, but says "I
  don't have a recorded project decision explaining why the team chose this." Source
  evidence, model explanation/inference and recorded decision stay visibly distinct;
  organisational history is never manufactured. Future behaviour: Decisions, prior
  questions, Sessions and linked rationale are shown with fixtures, labelled "Fixture ·
  UI preview" (or "Demo data") at the panel and layer level; no made-up people appear
  without that label. Figma captions say which captures are real behaviour and which
  are fixture previews.
- The current private Learn questions are not the Questions graph (one learner's, not
  node-linked, mixed with Learn conversations, not shared memory). They are not
  repurposed to make the layer look real.
- Permissions invariant: a graph answer may only use session, question or decision
  evidence the requesting user is authorised to access. Fixture filtering tests exercise
  the UI only; real knowledge-memory permissions are not marked implemented until real
  persisted records exist.

PROJECT = Overview + Learn + Map; Map = code graph + decisions + questions +
sessions + the right Context/Conversation panel, with the Mothership as the only input.
Map explains structure, history and why; Learn teaches the concept deeply.

- One input. No second Graph composer; the old right-side Graph Agent composer does
  not come back. The right panel holds Selected/Context, the conversation and its
  history, Decisions, Questions, Sessions and Source, with no text input.
- Graph-aware Mothership. No node: `[nanoGPT ×]` "Ask about this codebase...". Node:
  `[nanoGPT ×] [CausalSelfAttention ×]` "Ask about CausalSelfAttention...". Answers land
  in the right panel, not a bottom sheet. Clicking another node retargets; the draft
  keeps its retarget protection ("You're now viewing LayerNorm." [Ask about LayerNorm
  instead] [Keep CausalSelfAttention]).
- Entities. Code: file, class, function, module. Work memory (durable entities, never
  raw chat): Decision {decision, rationale, alternatives, who/agent/session, time,
  evidence/source, affected code nodes}; Question {question, answer if resolved,
  resolved, source session, code nodes}; Session {summary, participant/agent, time,
  questions, decisions, artifacts/code touched}; change/commit/PR references.
  Provenance is kept; an inferred rationale never looks like a recorded decision.
- Layers. The default Map shows Code only; a light Layers control adds Decisions,
  Questions, Sessions. Recorded or extracted relations are solid; inferred ones are
  dashed with confidence. No hairball.
- Selected code node panel: name, path:line, summary; Why (n decisions); Questions (n
  prior); Sessions (n relevant); Relationships; Source; [Learn this]. Sections or
  tabs (Context | Why | Questions | Sessions | Source), not deep navigation.
- Why is the differentiator: answers combine code evidence with recorded
  decision/session evidence and cite both.
- Prior questions are onboarding knowledge: a node lists its common questions; a click
  sends one through the Mothership with the node/session context. Counts are not a
  popularity metric.
- Onboarding: a large unfamiliar Map shows quiet starter prompts in the panel (architecture
  tour; what to understand first; most important modules; decisions that shaped it;
  common questions). They are Mothership prompts, not another agent.
- Map → Learn stays: select → ask → answer with code and decision context → [Learn this]
  → Learn canvas.
- The Mothership acts on graph results: /teach this (hand off the node), /research why
  (external sources + internal evidence), "show every decision related to attention"
  (filter/highlight), "what did engineers struggle with here" (questions/sessions),
  "take me to the code that implements this decision" (select/open the node).
- Evidence hierarchy in every answer: recorded decision; recorded question/session;
  code/source evidence; inferred relationship; model explanation. No invented
  organisational history: with no captured evidence, say "I can explain what the code
  does, but I don't have a recorded decision explaining why the team chose this."
- Permissions: session and decision memory obey the user's existing access; a private
  session is never surfaced through the graph or the Mothership. Backend enforcement
  may follow the dev fixtures, but it is part of the WP6 contract.
- Fixtures: dev-only session/decision/question entities where live data is thin. Never
  write fake institutional memory into live data.
- Figma (in addition to the 14 above): Map default code layer; selected code node;
  node → "Why does this exist?"; the answer in the right panel; a recorded Decision
  linked to code; Questions layer; a prior question selected; Sessions layer / a
  relevant session; inferred vs recorded relation; onboarding starter prompts; Learn
  this → Learn; the Mothership scopes throughout.

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

Future: Knowledge Capture v1 (not a work package; never delays WP6/WP7): CLI/session
capture; decision and question extraction; code-node linking; provenance; permissions;
retention and deletion. The WP6 knowledge-graph layers run on fixtures until it exists.

Repository snapshot cleanup (never blocks WP6): 1. every active dev/review copy picks up
1f21d70 or its equivalent; 2. verify no dev environment reads or writes
`learn-repositories-dev/` in `small-runs`; 3. delete the two legacy objects there (byte-
identical copies are in `small-repositories-dev`); 4. verify the Map still loads from
`small-repositories-dev`. Until then the legacy objects stay.

Learn media storage (owned by the Learn branch, not WP6): dev paper uploads, ask
attachments and generated video/3D artifacts still write the live `small-runs` bucket.
Split the bindings rather than repointing RUNS (App/Job pages read live outputs through it):
LIVE_OUTPUTS stays on `small-runs`, LEARN_MEDIA points at a dev media bucket on review/dev.
Invariant: a review clone creates no new Learn artifacts in production storage.
