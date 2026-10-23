# Card prompt (Show prompt)

Owner request, 2026-10-20: every generated card gets a small toggle that shows the prompt used, a copy button and a
small Add to chat icon. Owner decisions:

- The prompt is the words the person typed, never a system prompt or the full model request.
- It covers every AI-generated card.
- Cards made before this have no prompt, and their row is hidden.
- Anyone who can see the card can see the prompt (share links, forks and Explore), the same as chat questions.
- Copy copies the prompt.
- The chat icon puts the prompt in the Chat box to edit and send again. It never sends.
- The prompt is hidden until asked for (owner brief, 2026-10-23, replacing the always-visible Prompt row): no row, no Copy
  icon and no reserved height at rest.

## What it does

`CardPrompt.jsx` draws nothing at rest. Hovering a card, focusing into it or selecting it (touch has no hover) shows a small
**Show prompt** button over the card's foot, bottom left. It overlays the card, so the card never changes size.

- **Show prompt** opens a panel over the card's foot with the typed words (complete; a long prompt scrolls inside, at most
  160 px), Copy, the chat icon and **Hide**. It stays open until Hide or Escape: the pointer leaving never closes it.
  The panel takes focus when it opens; Hide returns focus to Show prompt. It is closed on every load.
- **Copy:** writes the complete prompt to the clipboard and says Copied or Copy failed beside the icon.
- **Chat icon:** calls the Chat workspace's `composer.prepare({ text })`. Chat opens, and an empty draft becomes the
  prompt. A written draft is kept, and the prompt follows it after a blank line, as for every prepare. Nothing is sent.
  A line that starts with `/` runs as that command when the person sends it.
- **View-only boards:** a share-link page has no Chat workspace, so it shows Copy only. The canvas pans with the hand
  there and its cards take no pointer, so the viewer selects the card (a click) to get the button, which takes the
  pointer back (`pointer-events-auto`).
- **No stored prompt:** no control at all.
- **Chat status:** the "Generating on the canvas" line above the Chat uses the same reveal (`PromptReveal`). A `/cad`
  line shows the lowercase `cad` pill (no slash) and hides the words until Show prompt; Copy keeps the original
  `/cad <prompt>` line. The CAD confirmation (`PaidConfirm`) shows the `cad` pill and the visible prompt: it is what the
  person approves. `/cad` stays unchanged internally.

## Where the prompt comes from

It is stored on the card as `promptUsed`, at most 8,000 characters (`card-prompt.js` `withPrompt`), and is saved with
the board like any other card field. The names `prompt` and `question` are already card content (quiz, challenge and
image cards), and shared asks and Rabbit Hole titles read them, so this field has its own name and reaches no model.

| How the card is made | Prompt kept | Code |
|---|---|---|
| A / command in the Chat box or dock (`/explain …`, `/quiz …`, paid proposals after Generate, `/motion`) | The typed line, command included | `learn-slash.js` `runLearnCommand` |
| `/cad` from Chat, and CAD from Ctrl+K | The typed line (Chat) or the editor's words (Ctrl+K). A CAD edit's words replace it only when its revision is accepted, on any Accept (the card's, the inline editor's, after a reload): the server's Accept answer carries the accepted model's words (`cad-jobs.js` `acceptedResponse`, owner-only). Status, list and reject answers never carry them, a repeated Accept answers the same, and a rejected edit leaves the old prompt | `LearnPage.jsx` `startCad`, `cad-jobs.js` |
| Tutor `create_material` | The learner's message for that turn, not the model-written command line. A Next Steps hook click typed nothing, so its cards keep none | `LearnTutor.jsx`, `runMaterials` |
| Ctrl+K card result | The words typed into the editor (`frozen.words`) | `inline-ai-apply.js` `cardTx` |
| Journey section steps, including a paid step after Generate | The words that started the journey (`journey.request.raw_user_message`). The section heading keeps none | `learn-journey-materialize.js` |
| Chat card (Ask on the canvas, Add as card) | Its question, already stored as `exchange.question` | `AdaptiveCanvas.jsx` `ChatCard` |

A copied, duplicated or Alt-dragged card keeps its prompt. A fork keeps it.

## Not covered

- **Ctrl+K notes, diagrams and equations.** These are native shapes and items without card chrome. The note keeps its
  `inline` provenance record but not the words.
- **Not generated:** cards the Tutor shows from an authored module, papers, Wikipedia articles and videos Ask found,
  outline headings, the notebook from an answer's code, and imports, drops, pastes, menus and Rabbit Hole seed copies.
- **Separate renderers:** cards drawn by their own card component get no row (video moments, wiki, file, PDF, notebook,
  code, graph, canvas reference, heading, divider, slide).
- **CAD recovery:** a CAD card rebuilt from the job list (the card was missing from the board) has no prompt. Only an
  Accept answer carries one.

## Verification (2026-10-20; reveal 2026-10-23)

- Unit: `card-prompt-reveal.test.mjs` (rest, hover/focus/selected, open, stays open, Hide and Escape, full Copy, no prompt, the Chat
  status and its `cad` pill) and `paid-confirm.test.mjs`. Browser (run by the owner, not by Claude): `card-prompt-check.mjs` and
  `chat-outputs-check.mjs`, edited for the reveal.

- Unit: `learn-slash.test.mjs` covers:
  - the typed line on a command card;
  - the learner's words on Tutor cards, and none on a hook click;
  - the line handed to `/cad`.

  `inline-ai-apply.test.mjs` covers the Ctrl+K card, and `learn-journey-materialize.test.mjs` covers journey steps and
  a paid proposal.
- Browser: `e2e/card-prompt-check.mjs`, 10 steps on the local stack with the board save real. It covers:
  - `/explain` and `/cad` (polled);
  - a CAD edit that is rejected, then one that is accepted;
  - opening the row, Copy, and putting the prompt in chat without sending;
  - a corner resize with no jump at release;
  - the server copy, a fresh browser and a share-link viewer.
  No model is called: the artifact and CAD routes are answered in the browser.
