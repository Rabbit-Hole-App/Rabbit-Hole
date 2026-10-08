# Start Rabbit Hole from a card's right-click menu

Owner request, 2026-10-07. Right-clicking a card on a canvas opens a small menu beside the cursor. Its first item is **Start Rabbit Hole**, which starts a Rabbit Hole from that card.

## What it does

The origin is the card that was right-clicked, even when other cards are selected. With A and B selected, right-clicking B starts from B. The menu runs the flow that already owns Rabbit Holes:

| Canvas | Start Rabbit Hole |
|---|---|
| Your own canvas | The card's Rabbit Hole, exactly as opening the card does (Dive.jsx `portals.open` / `enter`). If the card already has a hole, the menu enters it (never a second one). Otherwise it makes the pending hole anchored on that card, kept by its first object (dive-v1.md). Telemetry `via`: `learner_menu`. |
| A shared view-only board | The viewer's own private Rabbit Hole from that card, through the header button's flow (shared-canvas-rabbit-hole.md). It is the same request, the same one-start guard and the same sign-in resume. |

Permissions, grounding and return navigation are the existing flow's:
- the navigator's "Up to the parent hole" returns;
- a kept hole's card becomes its portal;
- a view-only board's new canvas is the viewer's.

Opening, Escape or an outside click never creates anything. Only clicking the item does.

## A view-only board edits nothing

On a shared board the menu shows only **Start Rabbit Hole**, and only on a card. The editing rows (Duplicate, Group, Select all, Delete…) are owner-only, and a right-click off a card opens no menu. The board presses through the hand tool, so the card is found by its bounds, as its click selection does.

## Every item has an icon

Owner, 2026-10-08: "on card, when we right click we see Copy text, Duplicate etc... each options should have an icon next to it". Every item of the menu, on a card, a chat card, a note or shape, a group and the empty canvas, has a lucide icon left of its label, in the card ⋮ menu's style (`ui.jsx` `MenuItem`: 16 px, strokeWidth 1.5, `text-ink-2`, dimmed with a disabled item). Each row is one `MenuRow` (`AdaptiveCanvas.jsx`), so a new item only passes its `icon`. The menu is 240 px wide so the longest label fits beside its icon.

| Item | Icon |
|---|---|
| Add comment, Add comment here | MessageCircle |
| Start Rabbit Hole | ArrowDownToLine (its mark on the shared header and the Explore card) |
| Ask about this | CircleHelp (the /ask mark) |
| Open in reader | BookOpen |
| Open on Wikipedia, Open on YouTube | ExternalLink |
| Attach … to tutor / Detach … from tutor | Paperclip / Unlink |
| Show the tutor this image | Eye |
| Mark done / Mark not done | CircleCheck / Circle |
| Present from here | Play |
| Copy text | Copy |
| Duplicate | CopyPlus |
| Zoom to selection | ZoomIn |
| Group, Ungroup, Rename group | Group, Ungroup, Pencil |
| Select all | BoxSelect |
| Delete | Trash2 |

## Placement

The menu opens at the cursor and is measured after it renders, before paint:
- If it would overflow the right or bottom edge, it flips to the cursor's other side.
- It is then clamped inside both the window and the canvas surface (which clips it), with an 8 px margin.
- A menu taller than the room scrolls inside itself.

It closes on choosing an item, a press anywhere outside it (on or off the canvas) and Escape.

The surface clips its contents but can still be scrolled by focus or scroll-into-view, and its absolute children move with that scroll. The position is therefore turned back into the surface coordinates with the scroll offset. Before this, a menu on a scrolled surface drew away from the cursor, for the mouse and the keyboard alike.

The keyboard keeps working: the context-menu key (or Shift+F10) on a focused card opens the same menu on that card, Escape closes it, and focus stays on the card.

Card dragging, editing and controls are unchanged: the menu only adds a row and its placement.

## Tests

`packages/web/e2e/card-context-menu-check.mjs` (12 checks, local stack, no model) covers:
- the exact label and origin with another card selected;
- an icon left of every item's label, on the card, empty-canvas, sticky-note and view-only menus (`src/card-selection.test.mjs` pins one `MenuRow` with an icon per item);
- no hole from opening, Escape or an outside click;
- the right, bottom and corner edges at 1440×900 and 820×560;
- the origin with A+B selected;
- Up returns;
- a kept hole entered, not duplicated;
- dragging still works;
- a sticky note still edits, and its menu has no Start Rabbit Hole;
- a quiz option still answers;
- the keyboard menu (Shift+F10) opens on the focused card inside the window, and focus stays after Escape;
- the Library ⋮ still opens with Enter and shows Rename;
- the view-only board: the viewer's own Rabbit Hole from the right-clicked card, the only item;
- no page errors.

The Library ⋮ menu and Rename are covered by card-redesign-check and visibility-check.
