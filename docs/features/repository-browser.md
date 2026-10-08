# Repository browser

Owner brief, 2026-10-07 (task #67, with the repository-graph clarification). A repository project is browsed as Files,
Graph or Learn. A learner clicks a file, a symbol or a graph node, or selects a code range, then types naturally in the
global Auto composer; no slash command is needed. The dock and its chips are [workspace-dock.md](workspace-dock.md); the
inspector is [inspector.md](inspector.md); the data truth is
[repository-graph-data-audit.md](repository-graph-data-audit.md).

```
karpathy/nanoGPT (i)                                                    [⇥]
Files   Graph   Learn                         [⌕ Search files or symbols…] [≋ Layers ▾]
━━━━━
┌ config/            ┐┌ karpathy/nanoGPT › model.py › lines 177–179   3adf61e  Open in repository ↗ ┐
│ data/              ││ 176      # forward the GPT model itself                                      │
│ model.py           ││ 177      tok_emb = self.transformer.wte(idx)                     (selected)  │
│   {} GPT     :118  ││ 179      x = self.transformer.drop(tok_emb + pos_emb)                        │
│   {} .forward() :170│└ model.py:177–179  Ask  Learn                                              │
└────────────────────┘└──────────────────────────────────────────────────────────────────────────────┘
karpathy/nanoGPT › model.py › lines 177–179                                          (dock chips)
```

## Navigation

- **One row: Files · Graph · Learn** (`data-project-tabs`), restrained underline tabs. They replace the Map | Learn pill
  and the Files | Graph buttons. Blue stays for primary actions; the active tab is underlined in ink.
- `/apps/<repo>` lands on **Graph**, where the Map landed. `?tab=map`, `?tab=overview` and the older aliases land there too;
  `?tab=learn` opens Learn ([project-map-learn.md](project-map-learn.md)).
- Files and Graph are views of the same page, so switching keeps the selection and the URL. Learn is the project's canvas;
  its Map icon comes back to whichever view was open.
- Repository details stay behind the info icon beside the title.

## Search

One field, `Search files or symbols…` (`aria-label="Search repository"`), contextual:
- **Files**: the tree gives way to two lists, Files (by path) and Symbols (by name, with `file:line`). A file's own graph
  node and an external dependency are not symbols (`code-reader.js` `searchRepository`).
- **Graph**: the graph shows only the matching nodes, as before.

No repository search shortcut exists, so none is shown (only the canvas has `/`).

## Layers

`[≋ Layers ▾]` in Graph opens a panel of node types, as checkboxes (`MapMemory.jsx` `LayersRow`). It opens beside the
graph, which narrows to make room, and stays open while layers are toggled; the button closes it. A floating popover
covered the graph's top-right nodes and controls, so a node under it could not be picked (canvas chrome never covers
content):

```
Layers
☑ Code
☐ Decisions   none recorded yet
☐ Questions   none recorded yet
☐ Sessions    none recorded yet
```

- Code is always on. Decisions, Questions and Sessions are first-class node types, but nothing stores one
  (repository-graph-data-audit.md), so they stay off and disabled.
- Only the review fixtures (`?fixtures=1`, nanoGPT, labelled `Fixture · UI preview`, excluded from production bundles)
  turn them on, several at once.
- Repository chat threads are not shown as Sessions: that is owner decision F, still open.

## One selection

There is one canonical selection: the composer context (`surface.selected`), owned by `RepositoryPage` as `context`.
Files, Graph, the inspector and the dock chips all read and write it.

| Selected from | Context | Chips | On the wire (`repository_context`) |
|---|---|---|---|
| A file row (tree or search), or a graph node named after its file | `kind: 'file'`, `id: file:<path>` | `repo › train.py` | `{commit, path, label}` |
| A symbol row, a graph node, a relationship in the inspector | the graph node | `repo › model.py › GPT` | `{commit, nodeId, label}` |
| [Ask] or [Learn] on a code range | `kind: 'range'`, `id: range:<path>:<a>-<b>` (`scope.js` `rangeContext`) | `repo › model.py › lines 177–179` | `{commit, range: {path, start, end}, label: 'model.py:177–179'}` |

- **Graph ↔ Files.** A graph pick opens its file in the reader at its line, and the tree marks it. A Files pick lights its
  node (or a range's file node) when the Graph opens; a node outside the bounded overview joins it (`RepositoryGraph`
  `pinned`). A search, a focus or an answer view is never changed by it.
- **× steps up one level** (`scope.js` `contextWithout`): a range or a symbol falls back to its file, a file to the
  repository. The reader keeps showing its file; the inspector stays where it is.
- **Another repository or canvas never inherits it.** `RepositoryPage` is keyed by project, and Root resets the surface
  on every URL, so another project starts at its root and a canvas has its own composer.
- A new snapshot (a refreshed branch) clears the context, the inspector and the open file: node ids belong to one commit.
- Identity only: the server reads the source at the pinned commit. No source text is sent.

## Files: the code reader

`CodeReader.jsx`, with `RepositorySource` as its reader. A lightweight browser, not an IDE.
- **Tree**: folders first, then files (`code-reader.js` `fileTree`). The open file lists its symbols, in source order, as
  jump targets. Folders open natively (`<details>`).
- **Reader**: breadcrumb (`repo › path › symbol`), the pinned commit, Open in repository, line numbers, the existing
  highlighter (`code.jsx` `colorLine`). A symbol highlights its start line and scrolls to it; a range highlights its lines.
  A whole file highlights nothing.
- **Selecting code** (a drag, the keyboard, or a line number and Shift-click) only highlights it and shows a compact bar
  under its last line: `model.py:177–179 [Ask] [Learn]`. A selection that is only whitespace is not one. Nothing reaches
  the composer until a button is clicked, so text can be copied and read freely. Esc, a click in the code or another file
  drops the bar.
  - **Ask** puts the exact range in context (the inspector shows it) and focuses the composer.
  - **Learn** puts the range in context and opens Learn through `learnAction('teach')`, as Learn this does. It sends
    nothing; Learn shows `Asking about: model.py:177–179 · <commit>`, and the Tutor chooses the pedagogy. No card type is
    chosen here.
- The context stays until it is cleared or replaced, so follow-ups ("Why?", "What calls this?") need no reselection.
- With a selection, "Show me the data flow." is a question too (owner, 2026-10-07): in a project with a selection, a
  "show …" that names no resource is asked about the selection instead of answering No matches (`agent/router.js` rule
  3). A resource match still opens, "show my canvases" still filters the Library, and open / go to stay navigation (the
  bar opens no files, so "open missing.py" keeps its No matches). With no selection, "show …" is the search it was.

## Large selections

- A range of any length keeps its whole identity: the chip reads `lines 1–330`, and the request carries
  `{path, start: 1, end: 330}`, never text.
- The server bounds what it reads (`repositories.js` `selectedRange`): the model gets the first 120 lines and a note naming
  the full range, and reads the rest with `read_source`. The stored question names every selected line
  (`Selected code: model.py:1-330 (commit …)`). A range past the file's end is refused, never clamped.
- The reader's old "Select up to 120 lines" refusal is gone, in Learn's source panel too.

## Inspector

The selected file, symbol or range drives it ([inspector.md](inspector.md)). A range reads:

```
model.py:177–179                          Open source ↗ (#L177-L179)
karpathy/nanoGPT › model.py › lines 177–179
model.py:177–179 · 3 selected lines                   • In context
```

A range has no graph node, so it shows no relationships (never its file's). Its preview and Source tab start at the range.

## Answer provenance

Unchanged: the Sources dropdown under an answer lists only the files the server's answer cites (`source-references.js`
`citedSources`); nothing is built client-side.

## Not done

- Decisions, Questions and Sessions have no canonical data (audit G1-G4); their layers stay off. Nothing invents a node,
  an edge or a line reference.
- Symbols have a start line only (audit G7), so a symbol highlights one line, not its body.
- `ponytail:` the search is a substring match capped at 50 files and 50 symbols; rank it when a repository outgrows that.
- Learn (the canvas) has no Files · Graph · Learn row: its Map icon returns to the browser (owner, 2026-10-04: no pill on
  the canvas).

## Tests

- Web unit: `agent/scope.test.mjs` (range context, chips, ×), `agent/ask-stream.test.mjs` (range on the wire),
  `agent/router.test.mjs` (show … with a selection),
  `code-reader.test.mjs` (tree, search), `project-ui.test.mjs` (navigation, Layers, one selection).
- Server: `control-plane/test/repositories.test.js`, the large-range case.
- Browser: `packages/web/e2e/repo-browser-check.mjs` on the local stack, one numbered case per brief §16 item, with the
  shared nanoGPT stub and `/api/learn/ask` stubbed. `workspace-check.mjs` and the Map cases of `rabbit-hole-check.mjs`
  follow the tabs and the Layers checkboxes.
