# Canvas right panel header: Find, Table of contents, Comments, Pin, Close

Owner request, 2026-10-07. This is the header of the canvas's right panel (`LearnPage.jsx`, the `ResizableSidePanel`; the component is `PanelHeader.jsx`).

```
[ Find | Table of contents | Comments ]            Pin   X
───────────────────────────────────────────────────────────
  the active tab's content
```

- **Icons only:** lucide `Search`, `BookOpen`, `MessageCircle`, `Pin`, `X`. Each has a tooltip (`title`) and an `aria-label`; there is no visible text and no chart tab.
- **Tabs:** the three tabs share one rounded group (`role="tablist"`, each `role="tab"` with `aria-selected`). Exactly one is active, and its content shows below the header.
- **Active colour (owner brief 2026-10-16 item 3, approved mockup toc-upload-context):** a rounded pale purple (`--nav-selected-bg`, `#eee5fc`; dark `#453060`) with a purple icon (`--nav-selected-fg`, `#6431a0`; dark `#e1cff9`). Icons are 30 x 32 px, 2 px apart, with no enclosing box. Inactive icons are muted neutral; hover is the neutral hover, never the selected purple. A thin divider runs under the header.
- **Keyboard:** the arrow keys move between the enabled tabs and select as they go. Comments is skipped.

**Chat (chat workspace, owner brief 2026-10-13 section 3):** Chat (lucide `MessageSquareText`) is a permanent fourth tab,
first in the group and the tab the panel opens on. The header is then six icon buttons: Chat, Find, Table of contents,
Comments, Pin, Close. `e2e/panel-header-check.mjs` holds this order and default.

## Table of contents

- Before the Chat tab it was the tab the panel opened on.
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

## Viewers: one Context / Files / Graph control

Owner brief 2026-10-16 items 3-4: Context, Files and Graph are views of the companion column LEFT of Chat
(hide-right-panel.md, "Companion column"). Right of the tablist, set apart by spacing and before Pin and Close, the header
carries ONE pressed toggle (lucide `PanelLeft`, `data-panel-companion`), named for the views it opens ("Context, Files and
Graph"; "Context" on a canvas with no repository). It opens the column on the view it last showed, or closes it. The
column's own labelled tabs (Context, Files, Graph) switch views, and its X closes it; there is no Back to graph / Back to
files. The composer no longer carries Explore codebase or Open Context. The tabs are Chat, Find, Table of contents
and Comments.

## Links live in Search (owner UI brief 2026-10-20 section 7)

The fifth Links tab is gone. Its contents are Search's Links filter (`data-search-filter="links"`, LearnPage only; a shared
view keeps links to its cards' chips): one result per destination canvas from `GET /api/learn/links` (already filtered for
the viewer), "Linked from this canvas" or "Links here (backlink)", the canvas title and its reference count, counted in
All and matched by canvas and card titles. Selecting a link opens its canvas in this tab (the page saves first); Enter in
the field only steps through link results. Each result carries Open in new tab, its origin cards (Show frames the card) or,
for a backlink, a link to the source canvas at its card with its own new tab. An unavailable target is "Unavailable canvas"
with no destination. Unsaved canvas: "Links appear once this canvas is saved."; a failed load is Search's partial state with
Retry. `e2e/toc-links-search-check.mjs`.

## Table of contents empty state (owner UI brief 2026-10-20 section 6)

With no TOC messages there is no "TOC conversation" section and no composer, only one compact entry, "Ask the Tutor about
this outline" (`data-toc-start`). Pressing it opens the TOC composer (`data-toc-ask`, focused, with a close button while
nothing is typed); an unsent TOC draft keeps it open. The first sent turn, or a saved TOC thread with messages (after a
refresh), shows the TOC conversation section as before. The outline and its heading controls are unchanged.

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

## No Card conversation tab

The r36 Card conversation tab (`MessagesSquare`, a tabpanel per selected card) is removed (owner, 2026-10-13: "we do not need
Card Conversation in right side panel ... remove it"). The tabs are only Chat, Find, Table of contents and
Comments. A question about a selected card is answered where any ordinary chat answer
goes (learn-chat-sheet.md, "Where an answer goes"). `src/panel-header.test.mjs` fails if a conversation tab or panel
comes back.
