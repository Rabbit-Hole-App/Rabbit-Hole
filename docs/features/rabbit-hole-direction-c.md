# Rabbit Hole — Direction C: Learning Hub + Agent Bar (revised T01)

Status: **low-fidelity flows awaiting approval.** This comes before the T02
spec and the Figma mockups. Nothing in `packages/` has changed. This document
supersedes Directions A and B in [rabbit-hole-home-audit.md](rabbit-hole-home-audit.md);
that audit's capability map still holds.

> **Rabbit Hole is not a chat app with pages. The interface is a learning
> environment, and the agent is its steering wheel.**

Evidence comes from the T00 audit (`wf_1af55b20-830`) and a second
verification run (`wf_836d8852-841`). The second run covered an action
inventory checked by a verifier, the chat seams, and Jev vendor docs.

## Decisions recorded (2026-09-23)

| ID | Decision |
|---|---|
| D1 | **(b)** A minimal canvas record in `small-learn-dev` only, subject to an implementation spec. No live D1 migration. |
| D2 | The new Home, Library, Project, and Agent Bar ship behind the dev flag. The live build is unchanged. |
| D3 | Server/job apps land on Runbook while no graph exists. Repository projects land on Overview. |
| D4 | Settings keeps its structure and gets Rabbit Hole copy. Unimplemented controls are marked Planned. The Agent Bar can open Settings → Connections. |
| D5 | Folders stay as access grants. Pinned is stored per device. Collections are prototype-only. |
| D6 | No mascot until an asset is approved. |
| D7 | Nothing may mutate live-backed data from a clone. The Agent Bar enforces this itself (see Policy). |
| — | "Knowledge is infinite." is removed from the authenticated app; it belongs to the public landing page. |

---

## The Agent Bar

```
┌──────────────────────────────────────────────────────────────────┐
│ [+] [Auto]  Start, open, ask, or paste a link…               [↑] │
│             Home · Gmail                                         │
└──────────────────────────────────────────────────────────────────┘
```

- **Same place everywhere.** It is fixed to the bottom of the content column
  on Home, Library, Project (Overview, Map), and app pages. Below `md`, where
  the sidebar is hidden today, it spans the full width and becomes the mobile
  way to navigate.
- **Input.** The existing `ChatComposer` component, so it looks identical to
  the Learn dock composer.
- **Mode pill.** `Auto` is the default. Typing `/` at the start opens a small
  menu of `/ask`, `/teach`, `/research`, `/do`. The chosen mode appears as a
  removable pill, `[/teach ×]`, and `×` returns to Auto.
- **Scope line.** Chips such as `Project: nanoGPT` or
  `Selected: CausalSelfAttention ×`. Removing a chip widens the scope.
- **Result sheet.** Answers, action previews, confirmations, and
  clarification pills open in a sheet above the bar. On Map and app pages the
  answers go to the existing right panel instead (see Composer rule).
- **Keyboard.** Ctrl/Cmd+J focuses the bar, reusing the existing
  `small:ask-focus` shortcut. Ctrl/Cmd+K stays as the search modal.

### What each mode does, honestly

| Mode | Behaviour | Backend | Status |
|---|---|---|---|
| Auto | Deterministic rules first. Anything unmatched becomes `/ask`. | See Router | — |
| `/ask` | Answers from the current scope. Changes nothing, except that proposals appear as confirmation cards. | `/api/ask` (org/app/run) and `/api/learn/ask` (project, canvas) | Live / Dev |
| `/teach` | Opens or creates the scope's Learn canvas and hands the text to Learn | `conversation: learn`, which needs an app/canvas scope | **The handoff needs one Learn hook**, see Dependencies |
| `/research` | Gathers sources: Wikipedia, arXiv, YouTube | Learn research tools (dev, app/canvas scope only) | Dev; "Add to canvas" needs the Learn hook |
| `/do` | Runs a typed command after checking policy | Command registry + existing `/api/ask/approve` | Phase 1 set below |

### Composer rule per route (one input at a time)

| Route | Bottom input | Answers appear in |
|---|---|---|
| Home, Library, Project Overview | Agent Bar | Sheet above the bar |
| Project Map, app Graph tab | Agent Bar | **The existing right panel**, which also keeps node details and source. Its own input box goes, so there is one composer. |
| Learn, Learn presenting | Learn's dock (the bar yields; same position and look) | Canvas, as today |
| `/chat` | The chat page's composer (the bar yields) | Chat page |
| Run subpage | Unchanged in phase 1 (existing run chat) | — |

---

## Flows

All names and data below are fixture content.

### 1 · Home with the persistent bar

```
┌ Gmail ▾ ────────────┐┌──────────────────────────────────────────────────┐
│ ⌕ Search       ⌘K   ││ CONTINUE — on this device                        │
│ ⌂ Home              ││ ┌──────────────────────────────────────────────┐ │
│ ▤ Library           ││ │ karpathy/nanoGPT · Project                   │ │
│ ◎ Explore  preview  ││ │ 3 of 7 sections ticked · Next: Masked attn   │ │
│                     ││ │ [Continue learning]   [Open project]         │ │
│ PINNED              ││ └──────────────────────────────────────────────┘ │
│  karpathy/nanoGPT   ││ RECENT  [nanoGPT·Project] [Attention·Canvas]     │
│  Attention          ││         [s3-log·Job] [counter·Server]            │
│                     ││ START   [Repository] [Sources] [Question] [Blank]│
│ APPS ▸              ││                                                  │
│                     ││ ┌──────────────────────────────────────────────┐ │
│ Members · Trash     ││ │[+][Auto] Start, open, ask, or paste a link…↑│ │
│                     ││ │          Home · Gmail                        │ │
└─────────────────────┘│ └──────────────────────────────────────────────┘ │
                       └──────────────────────────────────────────────────┘
```

There is no marketing header. The START buttons and the bar call the same
commands.

### 2 · "Start a rabbit hole with https://github.com/karpathy/nanoGPT"

The rules recognise a `github.com/<owner>/<repo>` URL and resolve it to
`connect_repository`. No model is involved.

```
┌ Connect repository ──────────────────────────────────────────┐
│ karpathy/nanoGPT · public GitHub                             │
│ Workspace  Gmail                                             │
│ Branch     master (default) ▾                                │
│ Visible to everyone in Gmail. Private projects aren't        │
│ available yet. Connected repositories can't be deleted yet.  │
│ [Connect]   [Cancel]                                         │
└──────────────────────────────────────────────────────────────┘
          │ Connect
          ▼
  ✓ karpathy/nanoGPT connected · map indexing
  [Start learning]  [Ask about the code]  [Open map · when ready]
```

- The default branch is preselected. The flow asks only when the repository
  has no default branch.
- The card states two facts: imported repositories are always
  workspace-visible (`repositories.js:34`), and no delete route exists.
- There is no "Create an app" option: deploying is CLI-only.
- After Connect, the page moves to the Project Overview and the scope line
  changes to `Project: nanoGPT`. That change is the navigation the user
  started; the draft was empty.

### 3 · Open an existing canvas by name

```
[+][Auto] open my attention notes                                    ↑
          Home · Gmail
  → one title match  →  opens "Attention deep dive" (Canvas)
     sheet: Opened Attention deep dive · Canvas in nanoGPT
```

```
[+][Auto] find canvases about masking                                ↑
  ┌ 2 results · titles only ──────────────────────────────────────┐
  │ ▤ Attention deep dive      Canvas · in nanoGPT                 │
  │ ▤ Causal masks             Canvas · standalone                 │
  └────────────────────────────────────────────────────────────────┘
```

Phase 1 searches titles over the catalog, which is apps plus repository
projects plus the new canvas records. It does not search inside canvas text:
that text lives in the browser. The AI find (`/api/apps/find`) covers deployed
apps only.

### 4 · Home → Project → Map → Learn, bar stays put

```
Home                Project Overview      Map                    Learn
[+][Auto] …   →    [+][Auto] …     →     [+][Auto] …        →   [Learn dock]
Home · Gmail        Project: nanoGPT      Project: nanoGPT       (same spot,
                                          Selected: Causal… ×     same look)
```

- Selecting a graph node adds the `Selected:` chip **only when the draft is
  empty**. When text is waiting, the bar offers `Use selection:
  CausalSelfAttention?` instead of switching the target.
- On Learn the bar yields to Learn's own dock composer, which uses the same
  component in the same position. The draft is saved under its scope and
  restored when the user returns to the Project.

### 5 · Mode selection

```
[+][Auto] /                                                          ↑
  ┌──────────────────────────────────────────────────────────────┐
  │ /ask       Answer from this context. Changes nothing.        │
  │ /teach     Explain or extend a Learn canvas                  │
  │ /research  Find sources and evidence                         │
  │ /do        Do something. Asks before anything lasting.       │
  └──────────────────────────────────────────────────────────────┘
[+][/teach ×] Go deeper on why sqrt(dk) matters                      ↑
              Canvas: Attention
```

Modes that the current scope can't serve are shown dimmed with a reason. On
Home, `/teach` says "creates a canvas first".

### 6 · Ambiguous request asks for clarification

```
[+][Auto] open attention                                             ↑
  ┌ Which one? ───────────────────────────────────────────────────┐
  │ [Attention deep dive · Canvas]  [attention-viz · App · server] │
  │ [Search everything for "attention"]                            │
  └────────────────────────────────────────────────────────────────┘
```

The rules found two title matches. This is the same shape as the existing Ask
`{choose}` reply, which the bar also renders. For fuzzy intent ("what have I
been working on lately?"), phase 1 falls back to `/ask`. Jev only logs its
guess in shadow mode (see Router).

### 7 · High-impact request needs confirmation

```
[+][/do ×] share counter with y@example.com as viewer                ↑
  ┌ Share counter ────────────────────────────────────────────────┐
  │ with y@example.com · Permission: View                         │
  │ counter is private. y@example.com gets access now; nobody     │
  │ else does.                                                    │
  │ [Confirm]   [Change]   [Cancel]                               │
  │ ⚠ Disabled on this preview: it would change a live app.       │  ← dev clone
  └───────────────────────────────────────────────────────────────┘
```

The risk class comes from the command registry, never from model confidence.
Cancel records a rejection so the proposal cannot be approved later.

### 8 · Failed or unsupported request

```
[+][Auto] connect github.com/acme/private-tools                      ↑
  ✗ Can't connect acme/private-tools.
    Private repositories aren't supported yet; public GitHub works.
    [Open Settings → Connections]

[+][Auto] explain the training loop                                  ↑
  ✗ Couldn't reach the server. Your message is kept.   [Retry]
```

The draft is never cleared on failure.

### 9 · Scope changes only when the user says so

```
(on nanoGPT, typing)
[+][Auto] Explain the tokenizer merge loop                           ↑
          Project: nanoGPT
(user clicks minbpe in the sidebar)
[+][Auto] Explain the tokenizer merge loop                           ↑
          Project: nanoGPT  ·  you're now viewing minbpe
          [Ask about minbpe instead]   [Keep nanoGPT]
```

- Scope is frozen at Send.
- Threads are separate per resource (workspace, app, project, canvas). The
  server already rejects cross-scope reuse with a 409. There is **no global
  mega-thread**; "one brain" is visual.
- Pulling context from another project is a later, deliberate action.

### 10 · Settings and Connections through the bar

```
[+][Auto] connect google slides                                      ↑
  → opens Settings → Connections, focused on Google Slides
  ┌ Connections ──────────────────────────────────────────────────┐
  │ GitHub         Public repositories need no account.            │
  │ Slack          Connect                                         │
  │ Google Slides  Planned. Bring slides into a Learn canvas.      │
  │ Notion         Planned. Use selected pages as sources.         │
  └────────────────────────────────────────────────────────────────┘
  sheet: Opened Settings → Connections. Google Slides is planned;
         nothing was connected.
```

Closing Settings returns to the same route with the draft intact. Opening it
needs a new `small:settings {tab}` event, handled in `Sidebar.jsx` (a free
file).

---

## Command layer

UI clicks and bar requests call the **same registry**. Each entry has a name,
a risk class, where it is available, whether it touches live data, a preview,
and a `run()` that calls the existing API. Entries wrap current code; this is
not a new framework.

```
UI click ─────┐
              ▼
Agent Bar → Router → command(args) → policy (risk, capability, D7 guard)
                                      → preview / Confirm when required
                                      → existing API → result + Undo
```

### Phase 1 set: what the bar may execute

| Class | Commands | Source |
|---|---|---|
| Immediate | `open_resource` (app, project, canvas, run, members, chat), `open_tab`, `open_settings(tab)`, `filter_library`, `search_resources` (titles), `find_apps_ai`, `find_runs_ai`, `new_thread` | Existing navigation and search. Settings needs the new event. |
| Undo | `pin` / `unpin` (new, device-local), `create_canvas` (D1b record; Undo deletes it), `set_theme` | New or existing client actions |
| Confirm | `connect_repository`, plus the 7 existing Ask tools: `run`, `run_again`, `set_schedule`, `pause_schedule`, `resume_schedule`, `share`, `unshare` | `repositories.js`, `ask.js:103-159`, `/api/ask/approve` |
| Opens a screen only | Rename, duplicate, trash, restore, visibility, folders, workspaces, members, teams, AI provider, AWS, Slack, dismiss Watch | The bar navigates to the right place; the user acts there |

Risk corrections from verification: renaming (it changes live URLs), pausing a
schedule (missed runs are lost), dismissing Watch "forever", and restoring a
scheduled job are **confirm**, not undo. Creating a folder, team, or member
has no safe blind undo, because the inverse deletes shares.

**D7 guard.** In dev builds, every confirm-class command that touches the live
`small-cp` / live D1 / live R2 renders its card with Confirm disabled and says
why. That includes `connect_repository`, because snapshots land in the live
`small-runs` bucket.

### Backend prerequisites before `/do` uses server actions

These are small fixes in `packages/control-plane/src/index.js`:

1. Proposals have no reject or expiry status; cancelled ones stay approvable
   (`index.js:1415-1514`).
2. Approve is not atomic (`1422` vs `1510`), so a web click and a Slack click
   can both execute a run.
3. Deleting a thread leaves its proposals approvable.
4. In app scope, `canAct` can match an app in another org (verifier finding).

## Router

```
message ─► RulesRouter ─ match ─► command
              │ no match
              ├─► JevRouter (shadow only: logs, never acts)
              ▼
           /ask via the existing Ask agent. Its tools come back as
           proposals, which the bar renders as Confirm cards.
```

- **RulesRouter:** slash modes, GitHub URLs, the verbs open/find/connect/share
  with catalog title matches, and provider names.
- **LLM fallback:** the existing Ask agent. No new routing model call.
- **JevRouter (experiment):** off unless a key is configured.
  - Shadow logging goes to a `LEARN_DB` table (dev). It records command text,
    mode, scope *type* only, the rules result, Jev's intent, confidence, and
    latency.
  - Never used for private BYOC, and never given resource titles or content.
  - Graduation: routing-only → read-only navigation → reversible → proposes
    high-risk with Confirm always.

### Jev facts (vendor docs, fetched 2026-09-23)

- Confirmed:
  - Typed questions over state; question types `choice`, `score`, and `noul`
    (yes/no probability).
  - Choice and Score return `probabilities` and `confidence`.
  - "Intent Routing" and "Thresholds scale with risk" are documented
    patterns.
  - Early access, announced 2026-09-15.
- One HTTP endpoint, `POST https://api.typesafe.ai/v1/systemone`, with a Bearer
  API key. Plain `fetch` works from a Worker. It is also served as Workers AI
  `typesafe/jev`.
- Price: $0.042 per million input tokens; output is free.
- No training on customer data. **No published retention window**; zero data
  retention is enterprise-only. The MCA forbids using its output to train a
  competing model.
- `jev-1.13` is weak at dates, counting, and maths (keep those in code). Pin
  `jev-1.13.0`, not `jev-latest`.
- Correction to the brief-era description: "System One" is the model family,
  not a benchmark workload.
- Unverified: the $5 monthly free credit and the removal of the waitlist.

**Needs your explicit authorization** before any call: it is a paid provider
with an API key.

## Dependencies on other owners

- **Learn hook (Learn branches).** Two capabilities need one small documented
  entry point in Learn:
  - `/teach` handoff: open a canvas with a pending prompt.
  - `/research` "Add to canvas": add a source.

  This branch does not edit `LearnPage.jsx`, `AdaptiveCanvas.jsx`, or
  `ask.jsx`. Until the hook exists, `/teach` opens the canvas and keeps the
  text in the bar, and `/research` shows sources without "Add to canvas".
- **Search.** `feature/parallel-work` replaces the three Learn search routes
  with `/api/learn/search`. `/research` uses whichever is on `main` at
  implementation time.

## Open questions for approval

1. **Right-panel chat on Map and app pages.** Direction C replaces the Graph
   Agent's own input with the Agent Bar. Its answers, node details, and source
   stay in the right panel. This removes an existing input box, so it needs
   your OK.
2. The Learn hook request above goes to the Learn branch owners.
3. Jev key and spend: later, only on your explicit go-ahead.
