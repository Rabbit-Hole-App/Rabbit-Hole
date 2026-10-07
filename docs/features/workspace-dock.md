# Workspace dock

Owner brief, 2026-10-06 (task #65; one review checkpoint with the inspector, [inspector.md](inspector.md)). The global
Home/Library composer (the Agent Bar, `agent/AgentBar.jsx`) is workspace chrome: a dock under the main workspace and the
right inspector, from the sidebar's edge to the window's edge. The canvas's own Tutor composer is a different composer and
is unchanged. The live (small) build has no Agent Bar.

```
[sidebar] ┌──────────────────────────────────────┬──────────────────────┐
          │ Main workspace                       │ Inspector            │
          │ (scrolls)                            │ (scrolls on its own) │
          ├──────────────────────────────────────┴──────────────────────┤
          │ ◌ Reading repository…  ×                       activity row │
          │ karpathy/nanoGPT × › model.py × › GPT ×        context chips│
          │ [+] [Auto] Ask about GPT…                                ↑  │
          └─────────────────────────────────────────────────────────────┘
```

## Layout

- The bar is fixed to the bottom, `left: --sidebar-w`, `right: 0`. It publishes its height as `--agent-bar-h`, and
  `index.css` pads every Shell `main` by it, so the workspace and the inspector both end exactly at the dock's top edge.
  Nothing scrolls under it: cards, files, graph nodes and inspector content all stay above.
- The dock is chrome, not a floating box: one top divider (`border-line`), a white surface, no gradient. The input keeps
  its rounded frame and a hairline shadow (`ChatComposer` `flat`); the Learn composer keeps its popover float.
- The input spans the dock (no 780px centred column). It never resizes on its own: it follows whatever width the
  inspector leaves.
- The input starts one line high and grows upward to five lines (`max-h-33`), then scrolls inside. The dock grows with it
  and the workspace above shrinks, so it never covers content.
- The answer window (`ResultSheet`) still opens over the dock, as everywhere. While the Map's inspector is open it centres
  over the workspace pane, never over the inspector: the inspector publishes its on-screen width as `--inspector-w`
  (`ResizableSidePanel` `edgeVar`).

## Context chips

The chips above the input are what Auto will ask about. A project reads **repository › file › symbol**:

| Selection | Chips |
|---|---|
| Nothing | `karpathy/nanoGPT` |
| `train.py` (Files row, or its graph node) | `karpathy/nanoGPT › train.py` |
| `GPT` (a class in `model.py`) | `karpathy/nanoGPT › model.py › GPT` |
| `torch` (an external dependency) | `karpathy/nanoGPT › torch` |

- Each chip has its own ×, and × steps up one level only (`scope.js` `contextWithout`): `GPT` falls back to `model.py`, a
  file falls back to the repository. Only the repository chip's × clears everything (it widens to the workspace for this
  visit, as before).
- A graph node named after its own file is that file and shows once.
- Home, Library and Explore are places, not context: they show no chip.
- Auto stays the neutral default pill. A slash command is optional; the normal flow is select, then type.

## The context contract

There is one context and one inspected object, kept apart on purpose (owner §10, §18):

- **Context** is `surface.selected` (`agent/surface.js`), the bar's existing scope model. On a project page
  `RepositoryPage` owns it as React state and publishes it with `handlers.setContext`. The bar renders chips from it, and
  its × calls `setContext` with the parent level, so the chips and the inspector's "In context" read the same state.
  - Shape: `{ id, kind, label, path, line, nodeId, commit }`. A whole file is `kind: 'file'`, `id: 'file:<path>'`
    (`scope.js` `fileContext`); anything else is a graph node.
  - On the wire (`ask-stream.js` `askBody`): a node is `repository_context.nodeId`; a whole file is
    `repository_context.path`. The server reads that file from the stored snapshot as `selectedFile` (its first 80
    lines and its length) and stores the question without a line-selection suffix (`repositories.js`). This is the one
    server change: the old contract had no whole-file field, so a file chip would have reached Auto as nothing.
  - The Learn tab receives the same context as `repositoryContext` (path or nodeId).
- **The inspected object** is what the inspector shows (`RepositoryPage` `inspected`, plus a local Back trail).
- Selecting (a Files row, a graph node, a related object or symbol in the inspector) sets both. Closing the inspector
  clears neither. Removing a chip leaves the inspector where it is. Back moves the inspector only. A click on the empty
  graph changes nothing. A new snapshot (a refreshed branch) clears both, because node ids belong to one commit.
- A fixture record (review builds, `?fixtures=1`) is only inspected, never context: no fixture id reaches the model.
- The canvas keeps its own selection and strip (canvas-card-selection.md); nothing here touches it.

## Activity row

- A thin row above the chips for background work the learner can keep typing through: this bar's answer
  ("Answering in karpathy/nanoGPT…") and whatever the page publishes in `surface.activity`.
- The Map publishes "Reading repository…" (or "Waiting to read the repository…") while a refresh runs with a snapshot on
  screen; the big status box in the page now shows only for a first import, when there is nothing else to show.
- Each line has a ×, which hides it until its text changes. There is no blocking spinner in the input.

## The + menu

Unchanged: the Start paths (Repository, Blank canvas). No other actions were added.

## Inspector panel

- Full height above the dock; its body scrolls on its own and its header is sticky ([inspector.md](inspector.md)).
- One left divider, white surface, no outline or ring; blue only for the active tab, the In context dot and the one
  primary action.
- Width: drag the left divider between 320 and 520px (default 380); double-click resets; the width is remembered in this
  browser (`small.inspectorW`, guarded storage). The arrow keys resize too.
- Collapse with the header's panel icon, reopen with the page header's. The workspace widens with a 320ms slide; the dock
  still spans.

## Responsive

| Width | Inspector | Dock |
|---|---|---|
| ≥ 1024px | Inline beside the workspace; narrower when the window is (it leaves the workspace at least 360px) | Sidebar edge to window edge |
| 768-1023px (tablet) | A right drawer over the workspace, `min(26rem, 100%)` wide, ending at the dock | Same |
| < 768px (phone) | A full-width sheet between the top strip and the dock | Full width, the input keeps its width |

## Not built

- Home and Library have no inspector: their cards open on click (card-redesign.md) and selecting a card would change
  the card component, which belongs to the cards lane. The dock, its chips and the padding apply to them unchanged.
- The repository browser (#67: Files / Graph / Learn) is a later task and reuses this contract.
- `ponytail:` the drawer below lg has no backdrop or Esc; the header's close icon closes it.

## Tests

- Web unit: `agent/scope.test.mjs` (chips, ×), `agent/ask-stream.test.mjs` (a file by path), `inspector.test.mjs`,
  `project-ui.test.mjs` (the Map's structure).
- Server: `control-plane/test/repositories.test.js`, the whole-file context case.
- Browser: `packages/web/e2e/workspace-check.mjs` on the local stack, both briefs point by point, with every Figma shot.
  The repository endpoints are stubbed with a Graphify-shaped snapshot read off the real nanoGPT files pinned in
  `packages/learn-render` (the keyless stack has no indexer); `/api/learn/ask` is stubbed, so no model is called.
