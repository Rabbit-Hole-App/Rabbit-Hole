# Map inspector

Owner brief, 2026-10-06 (task #66; one review checkpoint with the dock, [workspace-dock.md](workspace-dock.md)). The right
panel on a repository project's Map is a learning inspector for the selected object, not a debug panel and not a second
chat. `MapInspector.jsx` renders it; `inspector.js` holds its facts, pure and unit-tested. Every field comes from the
stored snapshot (repository-graph-data-audit.md); a field nothing stores says so in one line, with an ask.

```
← [file] model.py                         Open source ↗  [⇥]
karpathy/nanoGPT › model.py
model.py:1 · Python file                         • In context
Overview   Source
──────────────────────────────────────────────────────────
  1  """
  2  Full definition of a GPT Language Model, all of it…   (preview, 8 lines)
Purpose
No summary yet. Ask about this →
Why it matters
No explanation yet. Ask why →
Symbols                                              23 ›
Relationships                                        14 ›
Conversation                              Ask about model.py →
──────────────────────────────────────────────────────────
[ Ask about this ]  [ Learn this ]
```

## Header (sticky)

- Back (when there is inspector history), a type icon, the title, **Open source** (GitHub, at the snapshot's pinned
  commit and the object's line), and the panel-close icon.
- The breadcrumb: repository › file › symbol.
- `path:line` and the type: "Python file" (the language from the indexer's code extensions), "Function" (a callable
  node), "Symbol" (any other code node; Graphify does not say class), or "External dependency".
- **In context**: a small dot and label when this object is what the composer will ask about. It goes when the chip is
  removed, while the inspector stays.
- **Overview | Source**: restrained underline tabs, only for an object with a file. The Selected / Conversation / Source
  pills are gone.

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
6. **Conversation**: the questions and answers asked while this object was the composer's context, folded with "N
   messages". Empty, it is one row: "Ask about model.py →". It is history about the object, not a chat; answers land in
   the bar's window.
7. **Actions**: Ask about this (secondary) and Learn this (the one primary). Nothing else.

Empty sections are omitted; there is no "No questions recorded yet", "No sessions recorded yet" or "No relationships".

## Behaviour

- Clicking a related object or a symbol selects it in place: the inspector and the composer context follow, the URL and
  browser history do not. Back returns the inspector to the previous object (up to ten), and never changes the context.
- **Ask about this** puts the object in context and writes "What does <object> do, and how is it used here?" into the
  composer; **Ask why →** writes "Why does <object> matter in this codebase?". Neither sends: the learner presses Send
  (owner, 2026-10-08; workspace-dock.md, Ask actions). **Learn this** puts it in context and runs `/teach`
  (`learnAction`), as before.
- Purpose and Why it matters stay on demand (owner decision 3, 2026-10-08): opening the inspector or selecting a node
  makes no model request; only a Send does.
- When the Files reader is showing the object's own file (Files view, the same path open), the inspector does not repeat
  its code: no preview and no Source tab (owner, 2026-10-08). A node picked in the graph keeps both. Open source on
  GitHub stays, as a link.
- A click on the graph's white space deselects: the inspector shows its empty state.
- A fold stays open as the learner walks from object to object.
- A file cited in an answer opens here, on Source, at its line, without changing the context.
- Source is the existing reader (`RepositorySource`): path, commit, numbered lines, Open in repository.
- An object with no file (an external dependency) has no tabs, no preview and no Open source.

## Data gaps (reported, not invented)

| Field | What exists | Missing interface |
|---|---|---|
| Purpose / summary | Nothing. Snapshot nodes are `{id, label, path, line, kind}`; files are `{path, lines}`. | A stored per-node and per-file `summary`, from the indexer or the repo-context backend. Never a render-time model call. |
| Why it matters | Nothing in production. Decision records exist only as review fixtures (audit §3.1). | A stored pedagogical-relevance field, or Decision records with Decision→Code links (audit G3, G4). |
| Callers / callees | Only what Graphify extracts as `calls` edges, shown under Relationships. | Nothing more: no call sites, no ranges. |
| Signature, symbol range | A start line only (audit G7). | An end line on snapshot nodes; the preview shows 8 lines from the start instead. |
| A file's own node | Graphify names a file's node after the file; that is how a Files row finds its edges. Node `kind` does not mark files (a file and a class are both `code`). | An explicit file kind on snapshot nodes. |
| Object conversation | The bar keeps each turn's context in this browser session. The server stores neither a selected node nor a whole-file context with a message, and messages have no timestamp (audit G1). | `repository_context` stored per user message, and `messages.created_at`. Until then the section is this session only. |
| Paper, video, wiki and canvas-card objects | Not on the repository screen. | Nothing for this task; the canvas has its own selection (canvas-card-selection.md). |

## Responsive

The same hierarchy in a 320px panel, a tablet drawer and a phone sheet (workspace-dock.md, Responsive).

## Tests

- Web unit: `inspector.test.mjs` (objects, types, symbols, relationship groups and their dedupe, conversation),
  `project-ui.test.mjs`.
- Browser: `packages/web/e2e/workspace-check.mjs`, on the local stack.
