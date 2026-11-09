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

## Chat model (release 117, owner 2026-11-08)

- **On Gemini 3.5 Flash Lite, medium reasoning** (same model, endpoint and key as the explain cards, `GEMINI_API_KEY`): every chat answer, that is Ask, Auto and Tutor chat, Continue convo, sheet asks, chat-answered slash commands, app and repository chat, the shared-canvas ask. Auto, no pick, an unknown key and a saved `opus-5` all resolve to Gemini; the picker no longer offers Opus 5.
- **Stays on Anthropic:** a Sonnet 5 or Haiku 4.5 pick; any call that carries a PDF (an attachment, or a paper the research tool read) runs on Sonnet 5 because the Gemini path sends text and images only; cards, the whiteboard and grading stay on Opus 5 (their own `ASK_MODELS.auto` pin); the background tutor jobs keep their configured models; an org with its own provider keeps it; subscription mode never leaves its bridge.
- **Switch back:** `CHAT_MODEL_PROFILE=anthropic` puts Auto back on Opus. There is no fallback from Gemini to Opus: a Gemini 4xx/5xx shows "Learn answer unavailable (model HTTP <status>: <reason>)", and a missing key shows "AI answers aren't configured on this preview."
- **Delivery:** a plain chat answer (stream:true) is streamed token by token from Gemini through its OpenAI-compatible stream (`gemini-stream.js`, stream_options.include_usage): message_start at once, text deltas as the chunks arrive, usage in the closing message_delta, so `spendTransport` settles once as it does for any event stream (a cancel or a mid-stream error settles once as failed and keeps the reservation). A stream that cannot be established (an error status, no event stream, a network error) falls back to one whole call replayed as SSE. Tool calls (the research loop, the edit-proposal path) stay non-streamed. Measured 2026-11-08 (one real call, 300 words): the wait before the first word is Gemini's reasoning, not the transport (first text 3.7 s at medium, 2.7 s at low, 0.6 s at minimal; the answer then takes 0.5-0.8 s), so streaming brings the first word about 0.5 s earlier than the whole answer; the reasoning effort is the lever for speed.
- **Verified with real calls (2026-11-08):** a tool loop (search tool call, then the tool result, then the answer); the assistant tool call must go back with its thought signature (without it Gemini answers 400, and the research loop replays `result.content` unchanged); all 14 chat tool schemas are accepted as written, so nothing is stripped; an image attachment is converted to an `image_url` data part and described.
