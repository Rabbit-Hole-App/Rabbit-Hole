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

## Placement

The menu opens at the cursor and is measured after it renders, before paint:
- If it would overflow the right or bottom edge, it flips to the cursor's other side.
- It is then clamped inside both the window and the canvas surface (which clips it), with an 8 px margin.
- A menu taller than the room scrolls inside itself.

It closes on choosing an item, a press anywhere outside it (on or off the canvas) and Escape.

Card dragging, editing and controls are unchanged: the menu only adds a row and its placement.

## Tests

`packages/web/e2e/card-context-menu-check.mjs` (8 checks, local stack, no model) covers:
- the exact label and origin with another card selected;
- no hole from opening, Escape or an outside click;
- the right, bottom and corner edges at 1440×900 and 820×560;
- the origin with A+B selected;
- Up returns;
- a kept hole entered, not duplicated;
- dragging still works;
- the view-only board: the viewer's own Rabbit Hole from the right-clicked card, the only item;
- no page errors.

The Library ⋮ menu and Rename are covered by card-redesign-check and visibility-check.
