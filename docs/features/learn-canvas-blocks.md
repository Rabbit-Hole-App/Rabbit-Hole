# Learn canvas blocks

Tools the learner agent can place on the adaptive canvas (`packages/web/src/LearningBlocks.jsx`,
`BLOCK_TYPES`). The canvas itself is plain React/SVG (`AdaptiveCanvas.jsx`); tldraw is one block
type inside it, not the container. Spec: [docs/adaptive-learning-canvas-spec.md](../adaptive-learning-canvas-spec.md).

## Animation vs Whiteboard

These two look similar and are not. The dividing line:

**Animation** — an authored scene that plays. Use it when the lesson is *the change over time*:
a value becoming another value, a row being selected, a distribution forming.

- The agent emits scene JSON: objects plus a timeline of events (`animation-scene.js`).
- `getSceneState(scene, t)` is pure — same time in, same frame out. That is what makes scrubbing,
  pausing and "ask about this moment" work, and what a future exporter would share with playback.
- The scene never mutates. A question is a pointer: `(time, selectedObject, marked region)` plus a
  thumbnail. Replay is therefore free and needs no copy of anything.
- The learner cannot draw on it. Marking a region asks about it; it does not change it.
- Objects are the mathematical thing, not a label for it: `grid` (a table with a row that lights
  up), `strip` (numbers that change), `bars` (a distribution that grows), `tokens` (characters as
  chips), plus `box` / `circle` / `text` / `arrow` / `line` / `equation` / `code` / `image`.
- Motion (`motion/react`) springs the discrete on/off states only — what is lit, what just won.
  Positions and values stay evaluator-driven so a scrubbed frame is exact.

**Whiteboard** — a real tldraw board that is worked on. Use it when the lesson is *the marks on a
surface*: the learner attempting something, the tutor annotating that attempt.

- Free-form tldraw tools, learner ink, saved with the block (snapshot in the block, capped at
  400 KB; over that the board stays in memory and says so).
- No time axis. Nothing to scrub or replay. Narration is an attached clip, not a soundtrack.
- Every shape carries `meta.author` (`learner` | `lesson` | `tutor`), so tutor drawing can later be
  hidden or removed without touching what the learner drew.
- "Ask selection" arms a red rectangle over the board (the same gesture as the paper block), pauses
  any playing media, and sends the crop plus the shapes inside it. Esc or the pill clears it.
- Seeded demo: `demo: 'sigmoid'` draws the sigmoid lesson (`sigmoid-board.js`) so both "Ask in chat"
  and "Ask selection" have something real to point at.

Rule of thumb: **if the change over time is the explanation, it is an Animation; if the surface is
the explanation, it is a Whiteboard.** Replay belongs to the first; undo and erase to the second.

**Maths animation** is a third thing: a manim render, produced offline and played as a video. Use it
when the explanation needs typeset mathematics moving - a derivation morphing line by line, a tangent
travelling along a curve - which the SVG animation engine cannot typeset and the whiteboard cannot
animate. It is not scrubbable in the engine sense: it is a clip, so questions about it are questions
about a video. See [learn-math-animation.md](learn-math-animation.md).

## Explain in canvas

A question asked from a board creates a conversation node linked to it, and that node carries an
"Explain in canvas" action next to "Continue convo". It plans the explanation server-side, draws it
onto **the same board**, and reads it aloud. No copy of the board is made: tutor shapes arrive tagged
`author: 'assistant'`, so they can be removed without touching the learner's ink, which is the same
guarantee a duplicate would give without a second board drifting out of date.

The planner (`plan_explanation`, `explain_on_canvas`, `review_explanation`) runs on a cheap OpenAI
model - `PLAN_MODEL` in `packages/control-plane/src/ask.js`, overridable with `LEARN_PLAN_MODEL` -
and falls back to the platform model when no OpenAI key is configured. Every plan is still checked by
`validateTeachingPlan` / `validateBoardPlan` and the review pass before anything is drawn.

## Answering blocks

- `challenge` — commit a guess, then the tutor grades it and reveals.
- `challenge` with `mode: 'explain_back'` — understanding evidence: the tutor judges the explanation
  and names what is missing instead of revealing. Artifact completion and understanding evidence are
  kept separate on purpose.
- Both accept a spoken answer: the mic records, `/api/learn/transcribe` returns the text into the
  same input, and the learner can correct a misheard word before submitting. The graded answer is
  tinted green (good) or amber (partial) with a retry.

## Everything else

Interactive activities run on the scene engine (`scene-engine.js`, validated envelope + behaviour
registry): `walkthrough`, `vector` explorer, `pipeline` assembly. Content blocks: quiz, flashcards,
table, code sample, code exercise (Pyodide), paper (arXiv, page navigation and region questions),
graph, plot, knowledge graph, flow diagram, mermaid, image (Pexels or generated), video (existing or
FAL), 3D scene (Blender), audio narration.

## Canvas utilities never cover authored content

Approved 2026-09-24 as regression invariants for the canvas shell (`AdaptiveCanvas.jsx`):

- Canvas utilities — the drawing toolbar and the overview minimap — never permanently obscure
  authored canvas content. They live in the tools' gutter beside the canvas surface
  (`[data-tool-gutter]`, next to `[data-canvas-surface]`), never on it.
- No card- or scene-specific padding or layout for the toolbar or overview; cards do not know the
  utilities exist.
- Expanding a utility changes the available layout space instead of overlaying content: opening
  the overview widens the gutter (the canvas narrows); on a canvas narrower than 640px the tools
  become one row under the canvas (toolbar scrolling in it) and the overview takes the next row.
  The overview opens by default only on a canvas 1400px or wider.
- On phones and tablets (below `lg`) the lesson canvas gets a viewport-relative height (`75dvh`)
  and the page scrolls, so the table of contents stays reachable underneath.
- Toolbar and overview stay functional at 100% zoom; wheel over empty gutter space pans the canvas,
  while toolbar controls, menus and the overview keep their own wheel.

Regression check: `node e2e/canvas-toolbar-check.mjs <deployed-base> nanogpt-depth-ladder <outDir>`
(desktop 1720×1100 with the widest card pushed past the edge, a 2200px wide screen, and 390×844).

The same rule holds inside a card: sections under an animation's frame — Sources & evidence and
the practice section, collapsed or open — grow the card by their measured height and never shrink
the frame, so a scene keeps its size (and its text and cell numbers stay above the floors) while
the learner practises. Check: `node e2e/nanogpt-board-check.mjs <deployed-base>` fails if a
visual narrows when practice opens.

## Sub-cards: one idea per frame

Owner rule (2026-09-28, WP6): a card whose content is several ideas is paged into 2–4 numbered
sub-cards inside the same card, never shrunk and never turned into separate top-level cards.

- One index input with `presentation: 'pager'` lists the parts (`of`: their names). It draws in
  the card header — "Deep dive · 2/4", the part's name, Previous / Next (`CardPager`,
  SceneControls.jsx) — not in INTERACT, and Reset leaves it where it is.
- Every object may declare `part` (0-based): it is on screen only on that part; objects without
  one are on every part (`scene-evaluate.js` `onePart`). All parts share one INTERACT row, one
  practice and one Sources & evidence panel; the inputs are one state, so changing a control on
  2/4 is already applied when the learner pages to 4/4.
- The frame is sized once for the tallest part (hidden parts still count, `everDrawn`), so paging
  never rescales the card. At most 60 objects are on screen at once (per part).
- A sub-card holds at most one formula block and one visual; "Builds on:" appears on 1/N only.
- Nothing renders below its type's floor at the size the card is actually drawn (body 15,
  annotation 13, grid numerals 12 — `LEGIBILITY_FLOORS`): `assertCardGates` fails a card whose
  frame scales it down. Before this rule the tallest Deep dives were scaled to 0.86, drawing 13px
  annotations at about 11px.
- Every section around the frame grows the card by its measured height — INTERACT (wrapped rows
  included), practice, Sources & evidence — so the frame keeps the size the scene was sized for.
  INTERACT used to be an estimate (84–128px) and a wrapped row squeezed the frame: ten depth-ladder
  cards drew at 0.82–0.995. The deployed check `e2e/board-interaction-check.mjs` measures the
  scale each card is really drawn at (the frame's SVG against its viewBox, canvas zoom divided out)
  in every review state and fails below 0.995.

## Numbers in text are readable

Owner rule (2026-09-28): a number of five or more digits in card text carries thousands separators
— "1,770,240", not "1770240"; four digits stay as written ("1536", "iter 1000"). One formatter,
`groupDigits` in `src/scene-format.js`, display only:

- `{{marker}}` interpolation groups numbers on its own (`scene-derive.js`); in an `equation` object
  the separator is TeX `{,}`, since a bare comma typesets as punctuation.
- A number that is one element of a list or tuple stays raw: a shape `(50304, 384)`, a call
  `get_lr(301000)`, a list of IDs `31056, 3262, 1248` — a thousands comma there would read as
  another element (`writtenRaw`).
- Text a card composes in JS calls `groupDigits` itself. Decimals keep their fractions
  (`0.00001`); exponent forms are left alone. Data cells (`formatCell`) are unchanged.

Gate: `src/number-grouping.test.mjs` evaluates every card on every board (default, review states,
each input varied) and fails on any ungrouped long number in labels, practice text or control
labels.

## Practice and secondary text read cleanly

Owner rules (2026-09-29), fixed in the shared renderer and tokens, never per card:

- **Secondary text clears 4.5:1.** `--color-ink-2` (captions, provenance lines, unlit token
  characters, unlit cell numbers, control labels, the attempt count) passes normal-text contrast on
  every surface it is drawn on, in both themes: every background a `text-ink-2` element carries,
  the scene surface, and every soft resting cell tint in any role or identity hue (c25's
  probability cells are prediction's). The fix is the token itself (`#63615d` light, `#a1a1a1`
  dark), still visibly lighter than `--color-ink`. No grey passes on a strong or solid fill, so an
  unlit numeral there takes the fill's own ink (`cellInk`, `scene-style.js`). Unproven there, and
  named in `cellInk`'s ponytail because no lesson draws numerals on a loud fill yet: any identity
  hue, success at rest in light, learner lit or peak in dark, and a strong-role grid whose
  `cellHighlightKind` is `highlight` (lit and unlit share that ink; only the fill step differs).
- **Informational card text is secondary, never tertiary.** Provenance rows under a card (repo @
  revision, sha256, Reproduce), image credits, block labels (Output, Given, Your code) and the
  scene selection line are `text-ink-2`. `--color-ink-3` (2.8:1) stays for placeholders, disabled
  controls and icon buttons. No component writes the retired `#787774` as a literal: a light-only
  island (InteractiveScene's step list) uses `#63615d`, FlowDiagram's edge labels sit on a
  card-coloured plate so the pair flips with the theme.
- **Role-hued scene text clears 4.5:1 too.** A text object in a role or identity hue is drawn in
  that hue's text-safe variant, `--viz-<hue>-text` (`textObjectInk`, `scene-style.js`): the hue
  darkened just enough in light (input, output, prediction, learner, code, identity-2) and in dark
  (identity-3). Strokes and fills keep the hue itself.
- **Dimmed text stays readable.** De-emphasis is not an exemption: learner-facing text the learner
  is expected to read meets 4.5:1 even when de-emphasized (owner, 2026-09-29). Make a visual look
  inactive with a lighter fill, a thinner border, reduced saturation, a pattern, opacity on
  non-text decoration, or stronger emphasis on the active state — not by fading readable text. A
  text line at a resting opacity below 1 is measured with that opacity composited over the scene
  surface: `--color-ink` can dim to 0.72 and no further (c23's cropped characters). The only
  exception is content that is intentionally unavailable, disabled, masked away or decorative,
  where the learner is not expected to read its exact value (a masked-out cell whose token is
  irrelevant, a non-actionable disabled label, ghosted decorative context); if the exact dimmed
  text matters to understanding, it is not exempt. Each exemption is documented, never assumed.
  Listed in the check's `PENDING_OWNER` and deferred to the NC10 accessibility audit (frozen cards
  are not reopened for it): the focus and mask dims of c10 (later characters' names at 0.3) and
  the depth ladder (tokenization guided and deep, architecture overview and deep, attention deep,
  generation deep: 0.25 to 0.4), each to be classified A (semantic text: bring to 4.5:1) or B
  (intentionally unavailable/decorative: documented exemption).
  Check: `src/text-contrast.test.mjs` - the tokens, every role and identity hue, every loud-fill
  step, and every glyph on the scene surface of every card at rest.
- **Feedback is 14px and reads in both themes.** Pass, fail and not-ready feedback and the
  committed-attempt count are `text-sm`, like the answer text; the count may stay in secondary
  ink. Pass and fail use `--color-pass` and `--color-fail`, which flip in dark (Tailwind's
  green-700 and red-700 fell to 3.56:1 and 2.74:1 on the dark card; `src/text-contrast.test.mjs`).
- **No internal representation in learner text.** The practice lock line and a locked control say
  what is locked in the learner's words: "Locked by this task — block_size = 3", "top_k = 2". No
  `(index N)`, no control qualifier such as `(preset)`, no name said twice
  (`describeInputForLearner`, `scene-inputs.js`). The tutor payload keeps the index
  (`describeInputValue`), because its state names cells by index.
- **A locked input is a statement, not a dimmed control.** While a practice locks an input, INTERACT
  shows "block_size = 3 · locked by practice" in its place (`[data-input-locked]`), its
  alternatives hidden, for every input type. Back to explore restores the controls.
- **New attempt is never an answer option.** It sits in its own row under the feedback: the
  committed-attempt count on the left, New attempt on the right as a borderless text action.

Check: `src/practice-panel.test.mjs` renders the real SceneActivity and SceneControls (esbuild +
react-dom/server) for every practice on every review board and fails on any of the last four rules.

## Verification

`node e2e/chat-block-check.mjs` against the dev deployment covers every block above end to end.
Unit tests: `node --test src/*.test.mjs` (scene engine, animation evaluator, behaviours).
