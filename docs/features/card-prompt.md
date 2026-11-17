# Card prompt (the Prompt control)

Owner request, 2026-10-20: every generated card keeps the prompt used and lets the person copy it. Owner decisions:

- The prompt is the words the person typed, never a system prompt or the full model request.
- It covers every AI-generated card.
- Cards made before this have no prompt and show no control.
- Anyone who can see the card can see the prompt (share links, forks and Explore), the same as chat questions.
- Copy copies the prompt.
- Owner brief 2026-10-23 replaced the always-visible Prompt row, then the separate Show prompt button under the card, with one
  control in the card's top-right slot (below). Owner correction 2026-10-23: the generic "course" label and pill are gone from
  every card; nothing is drawn in that slot at rest.
- Owner 2026-11-17: the Prompt moved out of every card's header into the card's hover action pill (one component with Enter, Add to chat
  and Quick Edit), as its last action; opening it also copies the words at once. Cards no longer minimize or expand (same day).

## What it does

One shared component, `PromptControl` in `CardPrompt.jsx`, for cards and the Chat status alike.

- **At rest:** nothing. No row, no button, no reserved height, and no "course" pill. No card draws a Prompt control in its header.
- **Prompt action (owner 2026-11-17):** one more action of the card's hover pill above the card, `[ Enter | Add to chat | Quick Edit | Prompt ]`, the
  last item, in the siblings' look (icon `Quote` and the label, no shortcut). It appears and disappears with the rest of the pill (one condition:
  the pointer rests on the card, or the card is selected; on a narrow view or a card with a comment pin the same action is in the floating selection
  bar, as its siblings are). It is drawn only for a card that has a stored prompt (`promptOf(id)` of `SelectionActionsProvider`, which reads the
  block's `promptUsed` in `AdaptiveCanvas.jsx`): no prompt, no button, no empty slot. Where Add to chat and Quick Edit are absent (a view-only board, a
  shared page) Prompt still shows, alone. It is pressed (`bg-hover`) while its popover is open. It acts without selecting the card. A chat card has no
  Prompt control: its question is drawn in the card.
- **Copy on open:** clicking Prompt opens the popover and copies the words in that same click, and the popover's status line says **Copied** (**Copy failed**
  in the danger colour when the clipboard refuses). Only opening copies; closing and re-rendering do not, and opening again copies again. The Copy
  button stays for another go.
- **Click Prompt:** opens a small popover to the right of the card with the exact stored words and a **Copy** button. Near the
  window's right edge it flips to the left of the card, and when neither side fits it overlays the card's edge kept inside the
  window; it is always clamped vertically so it stays visible (`placePrompt`, a pure function). A long prompt scrolls inside it
  (`data-scroll`, so the wheel scrolls the popover, not the canvas).
- **Stays open** when the pointer leaves the card, so the words can be read, selected and copied: while it is open the card's action row is held
  drawn (`PromptHold`, `CanvasNode`'s `promptOpen` joins the one row condition), so the popover stays where it opened. It does not follow a card:
  a press on the card (a drag starts with one), a wheel (pan or zoom) or a window resize closes it. It closes on an outside press,
  Escape (focus returns to Prompt), Tab out of it, or a wheel or window resize elsewhere (the canvas pans or zooms, so a popover
  left behind would be detached). It is closed on every load.
- **Canvas zoom and clipping:** the popover is portalled to `document.body` and positioned from `getBoundingClientRect`, so the
  zoom-scaled, overflow-clipped canvas never distorts or hides it. Its pointer events do not reach the card (no select, drag or
  open).
- **Copy:** writes the complete prompt, unchanged, and says **Copied**; if the clipboard refuses it says **Copy failed**.
- **Read only:** opening and Copy generate nothing, change nothing on the card and do not open or fill the Chat. There is no
  "put in chat" action. A share-link viewer or a view-only board has no Add to chat or Quick Edit, but keeps Prompt, alone in the pill (or the
  floating bar) for a card that has a prompt (owner 2026-11-17: shared canvases keep every feature).
- **Popover placement from the pill:** beside the card (right, else left, else over its edge, `placePrompt`), starting at the pill's bottom edge so
  it never covers the pill.
- **No stored prompt:** no control at all.
- **Chat status:** the "Generating on the canvas" line above the Chat uses the same control, with the same wording and
  popover. It is hidden at rest and drawn on hover, keyboard focus in the row or a tap on touch; the job status words, elapsed
  time, Go to card and the lowercase `cad` pill stay visible always. A `/cad` line shows the `cad` pill and the popover
  holds the words after `/cad`; Copy writes the original `/cad <prompt>` line. The CAD confirmation (`PaidConfirm`) shows the
  `cad` pill and the visible prompt: it is what the person approves. `/cad` stays unchanged internally.

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
| Chat card (Ask on the canvas, Add as card) | Its question, already stored as `exchange.question`; the card draws it itself and has no Prompt action (owner 2026-11-17) | `AdaptiveCanvas.jsx` `ChatCard` |

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

## Verification (2026-10-20; Prompt control 2026-10-23; moved into the pill 2026-11-17)

- Unit (2026-11-17): `card-prompt-reveal.test.mjs` also renders the real `SelectionActions` pill: Prompt last after Quick Edit in Quick Edit's classes, absent
  without a prompt, alone on a view-only board (pill, hover pill and floating bar), the row held while open, opens and copies once per opening (`Copied`, `Copy failed`), closing copies nothing, pressed while open,
  Escape closes, a hovered card's press selects nothing, the popover starts at the pill's bottom edge; the card bodies draw no header Prompt.
- Unit: `card-prompt-reveal.test.mjs`: rest, hover/focus/touch selection (before 2026-11-17), the popover (portalled, exact text, stays open, outside
  press, Escape, wheel), no event reaches the card and no request is made, full Copy and Copy failed, no prompt means no control,
  `placePrompt` right/left/over/vertical clamps and the measured placement, the real card bodies (explanation, table, challenge,
  quiz, flashcards) with no "course" pill and the tutor badge kept, and the Chat status with its `cad` pill. Also
  `paid-confirm.test.mjs`, `learn-slash.test.mjs`, `inline-ai-apply.test.mjs` and `learn-journey-materialize.test.mjs`.
- Browser (run by the owner, not by Claude): `e2e/card-prompt-check.mjs` (12 steps, local stack, board save real; updated 2026-11-17 for the pill, copy on open and a viewer with no Prompt): `/explain` and
  `/cad` cards, rejected and accepted CAD edits, Prompt in the hover pill and by keyboard, the popover beside the card, Copy, nothing sent,
  a corner resize, the server copy, a fresh browser and a share-link viewer; `e2e/chat-outputs-check.mjs`: the Chat status control and
  popover; `e2e/primary-button-contrast-check.mjs` (fork runner, both themes): Prompt on explanation, table and quiz cards by
  hover in the pill, keyboard focus and a touch tap, 4.5:1 for the control and the popover text. No model is called.
- Unverified in a browser by Claude: real hover, layout, the popover's position at the window edges, and the canvas zoom.
