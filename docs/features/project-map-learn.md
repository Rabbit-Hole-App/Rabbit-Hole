# Project: Map or Learn

Owner decisions, 2026-10-04. These replace the project page's Overview | Learn | Map layout in
rabbit-hole-checklist.md (WP6).

## Layout

- **No Overview.** A repository project is Map or Learn.
  - A project has both a Map and a canvas, so opening `/apps/<repo>` lands on the Map (owner, 2026-10-04;
    `routes.js` `projectTab`). Only `?tab=learn` opens Learn.
  - An old `?tab=overview` link also lands on the Map.
  - A repository with no snapshot yet shows its Map even for `?tab=learn`, and rewrites its URL to `?tab=map`.
  - A standalone canvas (no project) still opens straight onto its canvas.
- **Learn (the canvas)** has no Overview/Learn/Map pill and no repeated repository name.
  - The canvas strip's Map icon (`data-learn-map`) goes to the Map.
  - The canvas picker stays when the project has more than one canvas.
  - There is no Tutor or Practice button; the composer is the Tutor (production-tutor-entry.md).
- **Map** keeps a two-option Map | Learn switch beside the title.
  - The repository details sit behind one info icon (`data-repo-info`): source link, branch, commit, status, and
    Refresh branch for the owner.
  - The Code, Decisions, Questions and Sessions layers sit behind one layers icon (`data-map-layers-open`).

## The Map's side panel

Since 2026-10-06 it is the learning inspector: [inspector.md](inspector.md), with the composer contract in
[workspace-dock.md](workspace-dock.md). It still starts closed (`data-map-panel-close`, `data-map-panel-open`) and opens
for a selected node, file, record or cited source. Answers no longer land in it: they open in the bar's window, as
everywhere else, and the inspector keeps the conversation about the selected object. The Selected | Conversation |
Source pills and the accent outline are gone.

## The composers

- **Main composer** (Home, Library, Map): the Auto picker has a `/` icon (`data-bar-slash-help`). It opens a Slash
  commands sheet (`agent/BarCommandsSheet.jsx`) listing that place's commands, each with an example
  (`agent/bar.js` `exampleFor`), as the canvas composer opens its own sheet.
- **The window over the main composer** is just a window: its label, a clear icon (`data-result-clear`: empties
  the conversation and closes) and minimize. No History or New chat. Closed or
  minimized, a small chat icon beside + (`data-result-open`) reopens it. The + menu has no Attach item.
- **Node pill.** A Map node carried into Learn shows as "Asking about: <node>" above the composer, with an x that
  clears it (`onClearRepository`), like the Map's chip.

## Answers

Every file an answer cites (`file.py:12`, `file.py:3-9`, and line lists like `model.py:29, 78` or one number per
line) is listed once in a **Sources** dropdown under the answer (`source-references.js` `citedSources`, `ask.jsx`
`Md`). Each entry opens the file:
- on the Map, in the inspector's Source view (the answer window offers it too);
- on the canvas and in its chat, in the source reader.

## Checks

`src/project-ui.test.mjs`, `src/routes.test.mjs`, and `e2e/tutor-entry-check.mjs` (production build).

## Not done

There is no public/private switch for projects or canvases. A project is private to whoever imported it, and a
canvas to its owner. A switch needs server work and its own spec.
