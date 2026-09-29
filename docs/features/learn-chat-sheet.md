# Learn chat sheet

Status (2026-09-29): on the dev review clone. Not yet routed by intent: the
Tutor Agent's router decides later when a question should become a card.

A plain question typed in the Learn canvas composer ("hi", or anything not
tied to a card) answers in a sheet above the composer, not as a canvas card.
The sheet is the same idea as smart-home's result sheet on Home.

## Behaviour

- The sheet sits directly above the composer, the same width. Its header has
  **History**, **New chat** and **Collapse**. A new question reopens a
  collapsed sheet.
- Each answer is one block with a copy icon, however many paragraphs it
  has. The Learn chat elsewhere still splits answers into paragraph blocks
  with **Ask about this block**.
- Questions in the sheet share one thread, so follow-ups keep context.
  **New chat** starts a new thread.
- Each finished answer has **Add to canvas**. It places that question and
  answer on the canvas as a chat card, centred in the view above the open
  sheet, and the button then reads **On the canvas**.
- **Ask in chat** on a selected card is unchanged: the answer is a chat card
  linked under that card, in its own thread. It never shows in the sheet and
  does not break the sheet's thread.
- `/` commands are unchanged: they insert their cards directly.
- **History** lists only chats started in the sheet. Card questions and
  grading calls also create Learn threads, and the server does not record
  where a thread started.
  - ponytail: the sheet's thread ids are remembered in this browser
    (`small.learn-sheet-threads:<app>`), so History is per browser. A thread
    source column fixes that when History must follow the learner.
- **Explain on canvas** (the old lesson-board drawing button under answers)
  was removed on 2026-09-29.

## Where a new card lands

A fresh question's card, and a card added from the sheet, is centred once in
the visible view (above the sheet when it is open), then the camera holds
still while the answer streams. Cards inserted any other way (Insert menu,
`/` commands, paste, drop) are brought into view on both axes.

## Code

- `packages/web/src/ask.jsx`: `sheet` / `onAddToCanvas` props on `AskPanel`
  (only the Learn dock passes them).
- `packages/web/src/AdaptiveCanvas.jsx`: `insertChat`, `centerOn`, and
  `bringIntoView` on both axes.
- `packages/web/src/LearnPage.jsx`: the dock passes `sheet` and
  `onAddToCanvas`.

## Checks

- `packages/web/e2e/learn-chat-sheet.mjs`: the sheet end to end, answers
  stubbed.
- `packages/web/e2e/chat-card-placement.mjs` and
  `packages/web/e2e/canvas-landing-sweep.mjs`: where new cards land.
