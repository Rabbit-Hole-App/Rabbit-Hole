# Reserved-position skeleton cards

While a card is on its way to the Learn canvas, a skeleton holds the exact place it will land. The owner approved
this design on 2026-10-04. It is built on `ui/canvas-skeleton-cards`.

## What it looks like

- The coming card's frame: its width and height, and CanvasNode's border, radius, shadow and drag strip.
- A spinner, a short status label and the time waited, e.g. "Creating /graph… 3.8s". Placeholder lines carry a
  soft sweep. Nothing else moves, and there is no percentage bar.
- The sweep and the label shimmer stop under `prefers-reduced-motion`.
- It cannot be selected, moved, asked about or connected. Its label is a polite `role="status"`, and its timer is
  hidden from screen readers.

## When one appears

| Path | Trigger | Label |
|---|---|---|
| Slash (`learn-slash.js`) | On send, for every command that asks `/api/learn/artifact`: `/explain`, `/graph`, `/diagram`, `/quiz`, `/flashcards`, `/code`, `/walkthrough`, `/practice`, `/compare`, `/animate`, `/video`, `/3d`. Commands that insert at once (`/notebook`, `/whiteboard`, `/paper <id>`, `/image`) or answer in chat get none. | `Creating /<command>…` |
| Tutor (`learn-tutor.js` `wantsCard`) | Before any model call, when the learner clearly asks to see a card (rule below). | `Creating a card…` |
| Research (Learn chat, `ask.jsx`) | When a show tool has validated: the `progress` event carries `card: 'paper' \| 'wiki' \| 'video'` (`learn-research.js`). Searching and reading reserve nothing. | `Opening the paper…` / `article…` / `video…` |

**Tutor rule (`wantsCard`).** It builds on `learnerIntent`:

- Yes: `/deeper` and `/simplify`.
- Yes: a request (`show…`, `explain…`, `walk…`) whose words name something to see: `show`, `visual…`, `card`,
  `canvas`, `draw`, `diagram`, `picture`, `animat…` or `mechanism`.
- Yes: words that open with making or showing (`make…`, `draw…`, `create…`, `put…`, `can you show/draw…`), which
  `learnerIntent` reads as an explanation or a question, and that name something to see.
- No: ordinary questions ("Why does softmax sum to one?"), answers to the Tutor's open question, a hole's opening
  turn, a turn back from a hole, and any "don't… / stop…".
- The plan can still decide to show a card on a turn without a skeleton. Authored cards insert instantly, so none
  is added afterwards.

## Sizes

The size table lives in `canvas-slots.js` `slotSize`.

| Known | Size |
|---|---|
| The card type fixes its size | Exact: the BLOCK_TYPES width and height of the block type the command's card makes (e.g. `/graph` 560 x 520, `/diagram` 560 x 520, `/walkthrough` 560 x 480). |
| The card type grows with content | The type's width and its auto-height cap (e.g. `/explain` 440 x 520, `/quiz` 380 x 420, `/code` 520 x 760). The card can only be shorter, so the cards below only ever close up. |
| A research card | Paper 620 x 560 (BLOCK_TYPES), Wikipedia 560 x 640, video moment 560 x 420 (as they open). |
| One of a known set (the Tutor) | The middle width and height of the slice cards the Tutor may show, each sized by its scene (`showableCards`, 981 x 834 today). |
| Nothing | CanvasNode's default, 380 x 420. |

A command with several card families is sized by its first, for example `/explain` as an explanation.

## Placement and camera

- **Reserve.** `canvas.reserve({ label, card, samples })` takes the slot `insertAtView` would use now:
  `flowIndexAtView`, stored as "in front of block X", or the end. It returns a stable transient id
  (`slot:<uuid>`).
- **Fill.** The card's insert takes `into: <id>`: `insertBlock(block, { into })`, and `insertPaper` /
  `insertWiki` / `insertVideo` `{ …, into }`. The card lands at that slot's index, never a new place. The skeleton
  and the card swap in one render.
- **Layout.** The cards below were pushed down by exactly the skeleton plus one gap. They move again only by the
  card's real height minus the skeleton's. Slots are measured with the column, so bounds stay right.
- **Several slots.** Each reservation has its own id. A filled slot re-anchors the slots made before it in front
  of the new card, so nothing waiting jumps.
- **Camera on reserve.** It brings the skeleton into view with the existing pan rule: it moves only if the
  skeleton is off screen, and keeps the learner's zoom. The move is a 200 ms glide, instant under reduced motion.
- **Camera after the card.** The slash and research paths keep the existing reveal: the camera moves only if the
  card is off screen.
- **Tutor.** It keeps its existing `focusBlock`: select and frame.

**Focus fix.**
- **Before.** `showCard` did insert, then `updateBlock`, then `focusBlock` in one tick. The update read the
  canvas before the card existed, so the part was ignored. The focus needed a measured box, so it did nothing.
- **Now.** A new card is inserted with its part already applied. `focusBlock` frames the card from a layout
  effect once it is in the DOM, so it waits for its real bounds. The Files panel and Rabbit Hole return use the
  same path.

## Endings

| Outcome | Skeleton |
|---|---|
| The card arrives | Replaced in place by the card. |
| A card already on the canvas (Tutor `findCard`, research `insertPaper` / `insertWiki` / `insertVideo` reuse) | Removed. That card is focused: the Tutor frames it, research brings it into view. |
| Clarification, paid proposal, unsupported, validation error | Removed. The composer notice shows the outcome, as before. |
| The Tutor answers in words only | Removed after the actions run. |
| Failure | Removed. The existing error UI stays. |
| Timeout | Removed. The Tutor's timeout is 60 s, as before. Slash artifact requests now time out at 120 s with "/x took too long. Try again." |
| Stop | Removed at once: the AbortError path releases the slot. |
| Research answer ends without opening that card (a shown paper suppresses the article) | Removed when the stream ends. |
| Navigating away | Gone with the canvas: slots are component state. A late card for a slot that no longer exists lands as before. |

## Why it cannot leak

- **Not in `blocks`.** Slots live in their own `useState` in `AdaptiveCanvas`, beside the artifact lists.
- **Never saved.** The save effect writes `{ strokes, shapes, items, links, blocks, groups, areas }`. The
  localStorage copy therefore never has a slot.
- **Never shared or forked.** A shared board's push (`boardSnapshot`) reads that saved copy. A fork copies the
  server's `state_json`.
- **Not in undo or redo.** Snapshots capture `present.current = { strokes, shapes, items, links, blocks }`.
- **Not content.** `canvasState.content` counts strokes, shapes, items and blocks. A slot never makes a pending
  Rabbit Hole meaningful (`dive.js meaningful`), so the hole is kept by the card, not by its skeleton.
- **Not Tutor state.** The Tutor reads `canvas.blocks()` and `canvas.block(id)`, which return blocks only. A slot
  never reaches the LearnerTurn, evidence or planner context.
- **Other viewers.** A shared viewer only sees what was saved, so another viewer's skeletons never reach them.

## Checks

- Unit tests:
  - `canvas-slots.test.mjs`: placement, filling, sizing, and a structural pin that the save, the undo snapshot
    and the content count stay slot-free.
  - `learn-tutor-skeleton.test.mjs`: the intent table, the decision before any request, slot hand-off, the part
    on a new card, and that focus comes after the insert on a deferred canvas.
  - `learn-slash.test.mjs`: reserve before the post, fill, and release on every non-card outcome, including a
    timeout.
  - `control-plane/test/learn-research.test.js`: the progress card field.
- Browser: `packages/web/e2e/canvas-skeleton-check.mjs` runs against the local stack, with scripted model routes
  and screenshots mid-wait and after replacement.
  - Slash, layout, clarification and failure.
  - Shared push and fork.
  - Research.
  - Tutor: visual, question, text-only, Stop, failure, existing card and timeout.
  - A pending Rabbit Hole.

## Open

- Auto-height cards reserve their cap, so a short card closes up a lot (e.g. an explanation of three lines). Use
  per-type typical heights if that reads as a jump.
- Paid-only commands (`/animate`, `/video`, `/3d`) always end in a proposal today, so their skeleton is always
  removed. Keeping it until Generate or Cancel is not built.
- Only the world transform glides. The grid backdrop, when on, jumps (`ponytail:` in `AdaptiveCanvas`).
