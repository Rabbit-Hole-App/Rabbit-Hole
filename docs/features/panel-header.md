# Canvas right panel header: Find, Table of contents, Comments, Pin, Close

Owner request, 2026-10-07. This is the header of the canvas's right panel (`LearnPage.jsx`, the `ResizableSidePanel`; the component is `PanelHeader.jsx`).

```
[ Find | Table of contents | Comments ]            Pin   X
───────────────────────────────────────────────────────────
  the active tab's content
```

- **Icons only:** lucide `Search`, `BookOpen`, `MessageCircle`, `Pin`, `X`. Each has a tooltip (`title`) and an `aria-label`; there is no visible text and no chart tab.
- **Tabs:** the three tabs share one rounded group (`role="tablist"`, each `role="tab"` with `aria-selected`). Exactly one is active, and its content shows below the header.
- **Active colour:** the /teach violet, `#5b21b6` (`--cmd-teach-fg`, slash-command-tones.md), with a white icon. Inactive icons are neutral, and a thin divider runs under the header.
- **Keyboard:** the arrow keys move between the enabled tabs and select as they go. Comments is skipped.

## Table of contents (default)

- It is the tab the panel opens on.
- The outline works as before: add, rename, drag, tick done, delete.
- An open reader (Wikipedia, paper, PDF, repository source) still shows under the outline. Opening a reader brings this tab forward.
- With the panel closed, the ContentsRail ticks still mirror the outline.

## Find text on canvas

This is a new, local find. The header's Search button (YouTube, arXiv and Wikipedia) is a separate feature and is unchanged.

- **Matching:** as you type, case-insensitive, over each card's title and body. A chat card's question and answer count too (`canvas-find.js`).
- **Results:** one row per card, in canvas order. Each row shows the card's label and a snippet with the hit marked. A count shows "N found", then "i of N".
- **Moving between matches:** Enter or Next goes to the next match, Shift Enter or Previous to the one before. A click on a row goes to that card.
- **Going to a match:** it frames the card and selects it, through the canvas's existing `focusBlock`, the same select-and-frame the Files panel uses. Because it is the ordinary selection, the composer strip names that card.
- **Escape** in the input clears it.
- **Local only:** no server call and no new dependency.
- **Not searched:** text in tldraw shapes, free text and sticky notes, notebooks, code, tables and diagrams (`ponytail:` in `canvas-find.js`).

## Pin: Keep sidebar open

- **Pinned (the default)** is the behaviour from before the header: the panel stays open while you work on the canvas.
- **Unpinned:** a press on the canvas surface (`[data-canvas-surface]`) closes the panel. Work inside the panel, such as typing a find or picking a row, never closes it.
- **Storage:** the choice is kept in this browser (`localStorage` `small.learn-panel:pinned`). Reading and writing it are guarded, so blocked storage keeps the default.

## Repository files (a project's Main canvas)

A fourth tab, after Comments, only where the canvas has the repository's files (`filesOn`): lucide `FolderTree`,
"Repository files". The canvas's Map icon opens the panel on it (owner, 2026-10-08). It holds the Map's file reader and
Open the Map → (repository-browser.md). Anywhere else there is no Files tab, not even a disabled one.

## Close sidebar

X closes the panel, the same as the top bar's Show/Hide button, and changes no canvas content. Present still closes the panel too.

## Comments: on hold

Comments is paused by the owner. Its slot only holds a placeholder:
- `aria-disabled`, with the tooltip "Comments (coming later)".
- It is never selected and the arrow keys skip it.
- It has no state, routes, storage or components.

## Checks

- `src/panel-header.test.mjs`: order, labels, single active tab, the Comments placeholder, pin default and persistence, the unpinned close, Close, the reader tab, and the find matching.
- `e2e/panel-header-check.mjs`: the same in a browser, plus a real find that brings an off-screen card into view and selects it.
