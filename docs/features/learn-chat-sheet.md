# Learn chat sheet

Status (2026-10-09): option B is implemented locally for the Tutor-backed
Learn dock, pending full-suite, browser and deployed verification. This is r36;
it is excluded from the r35 integration candidate.

## Where an answer goes

The resolved Tutor plan determines the destination after Send:

- Clear teaching requests create a card directly. A generated or shown material
  card is the answer; its planner narration does not become another card or a
  second explanation above chat.
- Discussion about a selected card is an ordinary chat answer: a canvas card, linked to the selected card, like an
  answer with no selection. The request retains the selection captured at Send, so the card still scopes the
  question; Ask in chat behaves the same. There is no right-panel Card conversation (owner, 2026-10-13: "we do not
  need Card Conversation in right side panel ... remove it"; the r36 tab and its per-card history are gone).
- Clarification, setup and errors stay in the window above chat. Failed or refused
  source handoffs do not become permanent answer cards.
- A substantive answer without a selected card becomes a canvas card. A distinct
  retrieved source answer survives material narration suppression, using the same
  destination rules. Questions accompanying material remain visible.
- This change does not add server persistence or alter model providers, prompts or evaluators.

The rules below describe the existing sheet controls and legacy non-Tutor chat.
The Tutor dock uses the destinations above instead of duplicating its answers in
that sheet.

## Behaviour

- The sheet sits directly above the composer, the same width. Its header has
  **History**, **New chat** and **Collapse**. A new question reopens a
  collapsed sheet.
- Each answer is one block with a copy icon, however many paragraphs it
  has. The same holds in every Learn chat (the repository page too): the
  per-paragraph blocks and **Ask about this block** were removed on
  2026-09-29.
- Questions in the sheet share one thread, so follow-ups keep context.
  **New chat** starts a new thread.
- Each finished answer has **Add to canvas**. It places that question and
  answer on the canvas as a chat card, centred in the view above the open
  sheet, and the button then reads **On the canvas**.
- **Ask in chat** in legacy non-Tutor chat is unchanged: the answer is a chat card
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
- `packages/web/e2e/learn-chat-one-block.mjs`: one block per answer on the
  repository page's Learn chat.
- `packages/web/e2e/chat-card-placement.mjs` and
  `packages/web/e2e/canvas-landing-sweep.mjs`: where new cards land.

## Option B verification

- `src/answer-destination.test.mjs`: material suppression, teaching intent,
  selected-card answers as cards (never a conversation panel), clarification, setup, source failures and distinct
  source answers.
- `src/learn-tutor-handoff.test.mjs` and `src/learn-tutor-auto.test.mjs`: preserve
  the source answer and the legacy string return contract.
- `e2e/answer-routing-check.mjs`: scripted browser scenarios with model-capable
  requests intercepted. This is UI evidence only, not real-model verification.
- Latest focused run: 70 passed, zero failed. Full suite and browser pending.
  Isolated upload failed Cloudflare validation for `node:crypto`; no deployment
  or real-model success is claimed. Final evidence belongs in the external
  answer-routing lane receipt before integration.
