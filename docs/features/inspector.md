# Map inspector

Owner brief, 2026-10-06 (task #66; one review checkpoint with the dock, [workspace-dock.md](workspace-dock.md)). The right
panel on a repository project's Map is a learning inspector for the selected object, not a debug panel. Since 2026-10-08
it is also the object's conversation surface: its Chat tab (below). `MapInspector.jsx` renders it; `inspector.js` holds its facts, pure and unit-tested. Every field comes from the
stored snapshot (repository-graph-data-audit.md); a field nothing stores says so in one line, with an ask.

```
← [file] model.py              [Learn this]  Open source ↗  [⇥]
karpathy/nanoGPT › model.py
model.py:1 · Python file                         • In context
Overview   Source   Chat 2
──────────────────────────────────────────────────────────
  1  """
  2  Full definition of a GPT Language Model, all of it…   (preview, 8 lines)
Purpose
No summary yet. Ask about this →
Why it matters
No explanation yet. Ask why →
Symbols                                              23 ›
Relationships                                        14 ›
```

## Header (sticky)

- Back (when there is inspector history), a type icon, the title, **Learn this**, **Open source** (GitHub, at the
  snapshot's pinned commit and the object's line), and the panel-close icon.
- **Learn this** is the inspector's one action and its one primary button, in the title row beside the title (owner,
  2026-10-08: "Learn this button should be at the top right of the right side panel. next to the title of the node
  selected"). It stays on Source and Chat; a long title truncates, with the full title as its tooltip. There is no Ask
  about this button and no footer of actions: asking happens in the composer.
- The breadcrumb: repository › file › symbol.
- `path:line` and the type: "Python file" (the language from the indexer's code extensions), "Function" (a callable
  node), "Symbol" (any other code node; Graphify does not say class), or "External dependency".
- **In context**: a small dot and label when this object is what the composer will ask about. It goes when the chip is
  removed, while the inspector stays.
- **Overview | Source | Chat** (owner, 2026-10-08): restrained underline tabs. Source only for an object with a file whose
  code the main pane is not showing; an object without a file is Overview | Chat. Chat carries its message count when
  there is one ("Chat 3"). A fixture record has no tabs.
- **Overview hidden for now** (owner, 2026-10-08: "lets hide it. so we have only chat"). `OVERVIEW_TAB` in
  `src/inspector.js` is false. The inspector opens on Chat; Source | Chat shows when Source applies, Chat alone otherwise.
  Purpose, Why it matters, Symbols, Relationships and the preview are not shown. A fixture record still shows its
  entity. The e2e checks that drive the Overview skip while it is hidden. Setting the switch to true brings both back.

## Overview, in the brief's order

1. **Preview**: 3-8 source lines from the object's own line, read from the pinned commit like the Source tab. Nothing is
   generated for it.
2. **Purpose**: "No summary yet. Ask about this →" (see Data gaps).
3. **Why it matters**: "No explanation yet. Ask why →". On review builds with fixtures, the code's fixture decisions are
   listed here, labelled Fixture.
4. **Symbols** (files only): the nodes whose path is this file, in source order. Folded, with a count.
5. **Relationships**: the object's graph edges, folded with a count, grouped by the graph's own relation names (Contains,
   Imports, Imports from, Method, Calls…) and their reverse (Imported by, Contained in, Method of, Called by…). An
   unknown relation reads "<relation> (incoming)". Each node shows once per group; an inferred edge is marked "inferred".
6. **Actions**: none here since 2026-10-08. Learn this is in the header; asking happens in the composer.

Overview has no Conversation row since 2026-10-08; the Ask actions stay in Purpose and Why it matters.

## Chat (owner, 2026-10-08)

The object's conversation. "The right panel is the single conversation surface."

- A question sent while an object is the composer's context streams here, not into the window over the bar
  (`AgentBar.jsx` `ask`, `bar.js` `nodeKey`). Send opens this tab; Ask about / Ask why only fill the composer and do not
  switch tabs.
- The exchange is bound to the object captured at Send: selecting another object while the answer streams leaves it
  streaming into the original object's Chat, and reopening that object shows it.
- The window over the bar keeps clarifying questions, errors and status (a failed answer is said there too, and in the
  Chat). A question with no object selected, and every scope other than a project, lands in the window as before.
- Empty: "No messages yet. Ask about it in the composer below." On review builds, the fixture questions and sessions show here, labelled.
- **Saved on the server.** Each object has its own thread per learner, project and commit, in LEARN_DB's existing
  `threads`/`messages` tables (no migration): `scope_ref` is `<project>#<object id>` (a graph node id, `file:<path>` or
  `range:<path>:<a>-<b>`). The ask sends `node` (`ask-stream.js` `askBody`); the server finds or makes that thread
  (`repositories.js` `nodeScope`). The tab reads it with `GET /api/repositories/<project>/threads?node=<id>&commit=<sha>`
  the first time the object is shown. The same org, learner and project-owner checks as the project chat apply; the
  project's own History never lists a node thread. So the conversation survives a reload, a new browser and another
  device signed in as the same learner. A new commit (Refresh branch) starts a fresh thread for each object.

Empty sections are omitted; there is no "No questions recorded yet", "No sessions recorded yet" or "No relationships".

## Behaviour

- Clicking a related object or a symbol selects it in place: the inspector and the composer context follow, the URL and
  browser history do not. Back returns the inspector to the previous object (up to ten), and never changes the context.
- Purpose's **Ask about this →** (hidden with the Overview) puts the object in context and writes "What does <object>
  do, and how is it used here?" into the composer; **Ask why →** writes "Why does <object> matter in this codebase?".
  Neither sends: the learner presses Send (owner, 2026-10-08; workspace-dock.md, Ask actions). **Learn this** (header)
  puts it in context and runs `/teach` (`learnAction`), as before, and sends nothing.
- Purpose and Why it matters stay on demand (owner decision 3, 2026-10-08): opening the inspector or selecting a node
  makes no model request; only a Send does.
- When the Files reader is showing the object's own file (Files view, the same path open), the inspector does not repeat
  its code: no preview and no Source tab (owner, 2026-10-08). A node picked in the graph keeps both. Open source on
  GitHub stays, as a link.
- A click on the graph's white space deselects: the inspector shows its empty state.
- A fold stays open as the learner walks from object to object.
- A file cited in an answer opens here, on Source, at its line, without changing the context.
- Source is the existing reader (`RepositorySource`): path, commit, numbered lines, Open in repository.
- An object with no file (an external dependency) has no Source tab, no preview and no Open source: Overview | Chat.

## Data gaps (reported, not invented)

| Field | What exists | Missing interface |
|---|---|---|
| Purpose / summary | Nothing. Snapshot nodes are `{id, label, path, line, kind}`; files are `{path, lines}`. | A stored per-node and per-file `summary`, from the indexer or the repo-context backend. Never a render-time model call. |
| Why it matters | Nothing in production. Decision records exist only as review fixtures (audit §3.1). | A stored pedagogical-relevance field, or Decision records with Decision→Code links (audit G3, G4). |
| Callers / callees | Only what Graphify extracts as `calls` edges, shown under Relationships. | Nothing more: no call sites, no ranges. |
| Signature, symbol range | A start line only (audit G7). | An end line on snapshot nodes; the preview shows 8 lines from the start instead. |
| A file's own node | Graphify names a file's node after the file; that is how a Files row finds its edges. Node `kind` does not mark files (a file and a class are both `code`). | An explicit file kind on snapshot nodes. |
| Object conversation | Saved per object since 2026-10-08: its own LEARN_DB thread (Chat, above). LEARN_DB `messages` still have no `created_at` (`repository-schema.sql`; the control plane's own `messages` table does), so the Chat shows no times. | `messages.created_at` in LEARN_DB, if times are wanted. |
| Paper, video, wiki and canvas-card objects | Not on the repository screen. | Nothing for this task; the canvas has its own selection (canvas-card-selection.md). |

## Responsive

The same hierarchy in a 320px panel, a tablet drawer and a phone sheet (workspace-dock.md, Responsive).

## Tests

- Web unit: `inspector.test.mjs` (objects, types, symbols, relationship groups and their dedupe, the Chat key),
  `project-ui.test.mjs` (tabs, routing, the binding at Send).
- Server: `control-plane/test/repositories.test.js` (a node thread written and read back, hidden from the project list,
  private to its owner and workspace, and an answer kept with its node while another node is asked mid-stream).
- Browser: `packages/web/e2e/workspace-check.mjs`, on the local stack.
