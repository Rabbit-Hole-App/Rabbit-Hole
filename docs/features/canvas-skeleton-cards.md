# Reserved-position skeleton cards

While a card is on its way to the Learn canvas, a skeleton holds the exact place it will land. The owner approved
this design on 2026-10-04 and asked for the camera, sizing and paid-command changes below the same day. It is built
on `ui/canvas-skeleton-cards`.

**The rule:** a skeleton means "we have committed to creating an artifact here", never "we might offer one".

## What it looks like

- The coming card's frame: its typical size, and CanvasNode's border, radius, shadow and drag strip.
- A spinner, a short status label and the time waited, e.g. "Creating /graph… 3.8s". Placeholder lines carry a
  soft sweep. Nothing else moves, and there is no percentage bar.
- The sweep and the label shimmer stop under `prefers-reduced-motion`.
- It cannot be selected, moved, asked about or connected. Its label is a polite `role="status"`, and its timer is
  hidden from screen readers.
- Waiting labels end in one ellipsis character (`waiting-text.js`). A server stage that already ends in dots
  ("Preparing answer...") reads "Preparing answer…" on the canvas chat card and in the chat sheet, never
  "Preparing answer......".

## When one appears

| Path | Trigger | Label |
|---|---|---|
| Slash (`learn-slash.js`) | On send, for every command that asks `/api/learn/artifact` and cannot end in a paid proposal: `/explain`, `/graph`, `/diagram`, `/quiz`, `/flashcards`, `/code`, `/walkthrough`, `/practice`, `/compare`. Paid commands are in the next section. Commands that insert at once (`/notebook`, `/whiteboard`, `/paper <id>`, `/image`) or answer in chat get none. | `Creating /<command>…` |
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

## Paid and confirmed artifacts

This covers any command whose card needs the learner's confirmation: `/animate`, `/video` and `/3d` today
(`mayConfirmPaid`), and an eventual `/motion` with a confirm step.

- **Send.** No canvas skeleton. Only the proposal shows in the composer ("This uses paid generation." with Cancel
  and Generate).
- **Cancel.** Nothing ever appears on the canvas.
- **Generate.** The slot is reserved at once, and the camera glides it into view. The confirmed card is inserted
  into that slot as soon as the skeleton has been drawn: on the second animation frame, because a slot reserved
  this tick is only in the canvas after it renders.
- **The card.** It carries `confirmedStart` and runs its own paid job with its own in-card progress, as it did
  before. It is the committed artifact, so it replaces the skeleton straight away. The skeleton does not wait for
  the paid job.

## Sizes

The size table lives in `canvas-slots.js` `slotSize`. It reads `LearningBlocks.jsx` `BLOCK_TYPES`:

- the block type the command's card makes, taken from its palette sample;
- that type's width and fixed height;
- else its `typicalHeight`;
- else its auto-height cap.

`typicalHeight` and `typicalRows` are new BLOCK_TYPES fields. They hold rendered heights measured on 2026-10-04
at 1440x900: the palette samples, and the six seeded NanoGPT Tutor slice cards.

| Card | Skeleton (w x h) | Source |
|---|---|---|
| `/explain` (explanation) | 440 x 330 | typicalHeight; the cap is 520 |
| `/quiz` | 380 x 270 | typicalHeight |
| `/practice` (challenge or explain-back) | 380 x 220 | typicalHeight |
| `/flashcards` | 380 x 240 | typicalHeight |
| `/code` (code sample) | 520 x 400 | typicalHeight; the cap is 760 |
| table (`/explain` second family, `/compare` first) | 560 x 610 | typicalHeight |
| `/graph` (interactive graph; a data plot renders as a graph) | 560 x 520 | fixed height |
| `/diagram` (flow) | 560 x 520 | fixed height |
| `/walkthrough` (renders as a scene) | 560 x 480 | fixed height |
| `/animate`, `/video` (generated video), on Generate | 560 x 440 | typicalHeight |
| `/3d` (scene), on Generate | 560 x 480 | fixed height |
| Research paper | 620 x 560 | BLOCK_TYPES fixed |
| Research Wikipedia article | 560 x 640 | the size it opens at |
| Research video moment | 560 x 420 | the size it opens at |
| Tutor slice card | 981 x 1014 | median of `sizeFor` over the slice cards, plus `typicalRows` (180): the controls, practice and sources rows below the frame |
| Nothing known | 380 x 420 | CanvasNode default |

- A command with several card families is sized by its first, for example `/explain` as an explanation.
- A shorter or taller real card shifts the cards below by the difference. That is normal layout.
- Measured rendered slice cards are 868 to 1157 px tall: 1014 is their middle.

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

**Camera: pan only, never the learner's zoom.**
- **What counts as visible.** It works inside the unobscured canvas (`canvas-slots.js` `freeArea`, measured in
  `AdaptiveCanvas` `visibleArea`). That is the canvas surface, less:
  - the open chat sheet above the composer;
  - the Voice caption;
  - the page's contents rail (`edgeInset`);
  - each cut from the side that keeps the most room;
  - then a 24 px margin from the chat edge, the tool gutter and the frame.
- **Not overlays.** The composer strip, the tool gutter and the side panel sit beside the surface, not over it.
- **On reserve.** The skeleton glides (200 ms, instant under reduced motion) to the centre of that area on any
  axis where it is not already inside. An axis already in view is left alone. A skeleton taller than the area gets
  its top at the area's top.
- **On replace.** There is no second fit and no zoom change. The card gets **one** correction, made once its
  measured box has been still for 200 ms (`SETTLE_MS`). That wait covers the rows an animation card measures a frame
  or two after mount, such as its controls and sources; the correction happens 1.5 s after the insert at the
  latest (`REVEAL_MS`). The camera nudges only if the card leaves the visible area, and only far enough to bring
  it back in, or its top for a card taller than the area.
- **Who uses this rule.**
  - Every insert reveal.
  - The Tutor's show (`revealBlock`): select, then glide into the visible area. A card inserted that tick only
    selects; its one correction is the settle above.
  - A reused research card.
- **Files panel.** "Show" keeps `focusBlock`'s existing frame. It is an explicit learner action.
- **Tall cards (V1).** A card taller than the visible area is top-aligned in it, at the learner's zoom: its top
  sits just inside the visible area, its left and right edges inside it, never under the chat. There is no
  zoom-to-fit; the e2e asserts this (G3).

**The learner's camera wins.** The canvas may pan to a skeleton, then make one correction after the real card is
measured, and only if the learner has not moved the camera since. Once the learner moves it, the canvas never
pulls them back.
- **Where it hooks in.** `AdaptiveCanvas` counts every camera change it did not make itself: an effect on `view`
  compares it with the last view the canvas set (`autoView`) and bumps `manualMoves`. Every camera input already
  ends in `setView`:
  - wheel pan, ctrl or ⌘ wheel zoom, and pinch;
  - a hand-tool or canvas drag;
  - keyboard scroll and zoom, and the zoom pill;
  - the minimap;
  - the Files panel's Show (`focusBlock`), a section from the contents rail, a presentation step;
  - a Rabbit Hole return point.
  So no input path changed, and the global camera policy is untouched.
- **What it cancels.**
  - Each reservation records the count when it is made. A card that fills it, a card reused for it, and the
    Tutor's show of a card already on the canvas (`revealBlock(id, slot)`) do not move the camera if the count
    changed in between.
  - A new card's settle correction records the count when it is armed: the slot's count for a card that fills
    one. It is dropped if the count changed before it fires, for example after a wheel zoom while the card settles.

**The Tutor focus bug, fixed.**
- **Before.** `showCard` did insert, then `updateBlock`, then `focusBlock` in one tick. The update read the canvas
  before the card existed, so the part was ignored. The focus needed a measured box, so it did nothing.
- **First fix (cde0d7b6).** It framed the card instead, which could zoom the learner from 100% to 60%. The owner
  did not accept that.
- **Now.**
  - A new card is inserted with its part already applied.
  - The Tutor calls `revealBlock`, which selects the card and, once it is in the DOM, pans it into the visible
    area at the learner's zoom, unless the learner has moved the camera since asking.
  - A card already on the canvas gets the same treatment.

**The Tutor focus bug, fixed.**
- **Before.** `showCard` did insert, then `updateBlock`, then `focusBlock` in one tick. The update read the canvas
  before the card existed, so the part was ignored. The focus needed a measured box, so it did nothing.
- **First fix (cde0d7b6).** It framed the card instead, which could zoom the learner from 100% to 60%. The owner
  did not accept that.
- **Now.**
  - A new card is inserted with its part already applied.
  - The Tutor calls `revealBlock`, which selects the card and, once it is in the DOM, pans it into the visible
    area at the learner's zoom.
  - A card already on the canvas gets the same treatment.

## Endings

| Outcome | Skeleton |
|---|---|
| The card arrives | Replaced in place by the card. |
| A card already on the canvas (Tutor `findCard`, research `insertPaper` / `insertWiki` / `insertVideo` reuse) | Removed. That card is brought into the visible area at the learner's zoom, and selected for the Tutor. |
| Paid proposal | None was shown. Generate reserves one, and the confirmed card replaces it. Cancel shows none. |
| Clarification, unsupported, validation error | Removed. The composer notice shows the outcome, as before. |
| The Tutor answers in words only | Removed after the actions run. |
| Failure | Removed. The existing error UI stays. |
| Timeout | Removed. The Tutor's timeout is 60 s, as before. Slash artifact requests time out at 120 s with "/x took too long. Try again." |
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
  - `canvas-slots.test.mjs`: placement, filling, typical sizing, the visible area and pan-only camera, and a
    structural pin that the save, the undo snapshot and the content count stay slot-free.
  - `learn-tutor-skeleton.test.mjs`: the intent table, the decision before any request, slot hand-off, the part
    on a new card, and that the reveal comes after the insert on a deferred canvas.
  - `learn-slash.test.mjs`: reserve before the post, fill, release on every non-card outcome including a timeout,
    and paid commands: nothing at send or on Cancel, reserve then fill on Generate.
  - `waiting-text.test.mjs`: one ellipsis.
  - `control-plane/test/learn-research.test.js`: the progress card field.
- Browser: `packages/web/e2e/canvas-skeleton-check.mjs` runs against the local stack, with scripted model routes
  and screenshots mid-wait and after replacement.
  - Slash at the learner's zoom (80%), layout, clarification and failure.
  - The learner's camera wins:
    - a real wheel pan after the skeleton's pan keeps the camera where the learner put it while the card lands
      and re-measures;
    - a wheel zoom in the card's settle window cancels its correction;
    - untouched, a tall card gets exactly one correction.
  - Paid: proposal, Cancel, Generate.
  - Shared push and fork.
  - Research, including the status ellipsis.
  - Tutor at the learner's zoom with the chat open: visual, question, text-only, Stop, failure, existing card and
    timeout.
  - A pending Rabbit Hole.

## Known issues / follow-ups

- **Grid backdrop jump (small, not a merge blocker).**
  - **What happens:** only the world transform glides. With the grid on, the dotted backdrop (the surface's
    `background-position`) jumps to the new camera while the cards glide for 200 ms.
  - **Fix:** transition `background-position` together with the world transform while `glide` is on.
  - **In the code:** a `ponytail:` comment in `AdaptiveCanvas`.
- **What counts as the canvas's own.** The canvas marks its own moves as its own: a skeleton's pan, a card's
  correction, centring a newly asked chat card, and its first centring at mount. Every other camera change counts as
  the learner's and cancels pending corrections. That includes the camera scroll after a + palette insert, itself
  the result of a learner's click. If in doubt, the canvas does not move the camera.
