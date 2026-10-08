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

The planner (`plan_explanation`, `explain_on_canvas`, `review_explanation`) runs on the platform
model, `claude-opus-5` (`LEARN_TASKS.board` in `packages/control-plane/src/learn-models.js`). It runs
on OpenAI only when both `OPENAI_API_KEY` and `LEARN_PLAN_MODEL` are set (the model id is that var;
no config sets it), and never in `SUBSCRIPTION_ONLY` mode (`planModel` in `ask.js`). Every plan is still checked by
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

- Canvas utilities — the drawing toolbar, canvas home, the minimap and the Rabbit Hole navigator —
  never permanently obscure authored canvas content. None of them sits on `[data-canvas-surface]`.
- The desktop shell was restored on 2026-09-30 after integration lost Parallel's layout
  (`caca1c2b`):
  - **Top left:** canvas home (`[data-canvas-home]`, back to the start, Shift 0).
  - **Left:** the tool palette in the tools' gutter (`[data-tool-gutter]`, docked left by default;
    the grip still docks it right).
  - **Top right:** the Rabbit Hole navigator in its own gutter (`[data-dive-gutter]`), or at the
    top of the tools gutter when the tools dock right.
  - **Lower left** (owner, 2026-10-08): the minimap directly above the zoom row, one group on one left
    edge in the bottom strip's left column (`[data-zoom-stack]` holding `[data-canvas-minimap]` then
    `[data-zoom]`), in flow, so the strip grows to hold it. Hidden below `md` and on canvases under
    640px, where the overview stays the tools row's toggle.
  - **Lower right** (owner, 2026-10-08): the Professor Next Steps hook card (`[data-hooks-slot]` in
    `[data-canvas-lower-right]`), right of the composer with its bottom on the composer's bottom, in
    flow, never over the canvas or the composer; same width rule as before. Below `md` it sits above
    the composer, at the right, `min(100%, 300px)` wide. Owned and shared canvases place it the same
    way. Voice Mode's caption keeps the lower-left stack on the canvas.
  - **Bottom:** the composer.
  - **Pinned by:** `src/canvas-shell.test.mjs`. Rendered at root, child and grandchild by
    `e2e/canvas-shell-check.mjs` (local stack); the bottom strip at 1440, 1024 and 390 wide, owned
    and shared, by `e2e/canvas-chrome-check.mjs` (local keyless stack).
- No card- or scene-specific padding or layout for any utility; cards do not know the utilities
  exist.
- On a canvas narrower than 640px the tools become one row under the canvas (toolbar scrolling in
  it), and the overview is that row's toggle, opening on the next row.
- On phones and tablets (below `lg`) the lesson canvas gets a viewport-relative height (`75dvh`)
  and the page scrolls, so the table of contents stays reachable underneath.
- Toolbar and overview stay functional at 100% zoom; wheel over empty gutter space pans the canvas,
  while toolbar controls, menus and the overview keep their own wheel.
- The zoom controls never cover the composer or the canvas (NC10, 2026-09-29): below 1024px of
  canvas width they take their own line above the composer instead of sitting beside it.

Regression check: `node e2e/canvas-toolbar-check.mjs <deployed-base> nanogpt-depth-ladder <outDir>`
(desktop 1720×1100 with the widest card pushed past the edge, a 2200px wide screen, and 390×844,
where a tap on the composer input must land on the input, not the zoom controls).

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
  unlit numeral there takes the fill's own ink (`cellInk`, `scene-style.js`), the same ink a box
  label gets (below). Unproven there, and named in `cellInk`'s ponytail because only the IDENTITY
  benchmark draws numerals on a loud fill in an identity hue (identity has no on-ink of its own);
  and a strong-role grid whose `cellHighlightKind` is `highlight` draws lit and unlit in that one
  ink (only the fill step differs).
- **A label on a filled shape takes the fill's ink.** Text drawn on a box, circle, chip or cell
  reads against that fill, not the page: a shape's own label, a cell's numeral and a chip's token
  on their own fill, and a text line, token label, bar label or equation drawn over another
  object's box or circle. On a soft tint the text keeps its own ink. On a strong or solid role
  fill it takes the fill's readable ink, `inkOn` at the fill's step (`shapeStyle`'s `onFill`);
  a glyph over another object's box or circle gets that box's `onFill` (`inkOver`,
  `scene-style.js`). No new tokens: where one ink cannot hold a loud role's whole band in both
  themes, the step picks from existing inks (heat's zone pattern). Learner takes `--viz-ink-mid`
  (black in light, white in dark): page ink fell to 4.21:1 on its rest step in dark
  (Tokenization Guided's found entry, sorted-list and selection boxes; Attention Overview's
  reading tile). Success takes black (`--viz-ink-solid`) up to its lit step and
  `--viz-on-success` at its peak: white fell to 4.09-4.25:1 on its rest step in light (Training
  Deep 1/3's `estimate_loss(): runs`). Warning and observed keep page ink and their on-ink.
  Active highlights keep their fill; only the ink moves. c15's verdict line on its output-tinted
  box is page ink (the output-green line read 3.87:1 in light). A grid's row and column names
  stay secondary ink on the surface.
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
  Floors on the scene surface: `--color-ink` 0.72 (0.57 dark), `--color-ink-2` (annotations,
  captions, label tokens) 0.88 (0.79 dark), role-hued text in light effectively none; a box
  label on a 12% soft fill, under its box shadow, holds 4.5:1 down to 0.73 (4.60:1; 4.47 at
  0.72), not on a strong fill (warning at 0.72: 3.32:1). Classified in the NC10 audit (owner,
  2026-09-29). A, brought to 4.5:1: c10's later characters' names (0.72; their value dots keep
  0.3, non-text); Tokenization Guided's sorted list (full strength; the found entry keeps its box
  and bold, in the box's ink); Tokenization Deep 3/3's two digit-prompt rows (both texts at full strength; the other branch's step box at
  0.73, grey when it is the what-if KeyError); Attention Deep 3/4's fused call on the manual
  path (its two notes at full strength, its box at 0.73). B, exempt in the check's `EXEMPT` by
  object and input state, each with its reason: Architecture Overview's loop note before stage
  6 (a stage not yet reached); Architecture Deep's steps below the failed assert (model(idx) at
  T = 257); Attention Deep's five manual steps and att on the fused path (1/4, 2/4: the path not
  taken); Generation Deep's steps after ÷ T at T = 0 (invalid). The step-box labels under these
  dims follow the same B, each listed by object: Architecture Overview's stage boxes the stepper
  has not reached (0.3), Architecture Deep's step boxes below the failed assert, Attention
  Deep's five manual step boxes on the fused path (0.25), Generation Deep's step boxes after
  ÷ T at T = 0, and Tokenization Deep 1/3's batch, wte and lm_head boxes after the digit
  prompt's KeyError (0.35; the not-reached line says so). New with the box-label check, B:
  Attention Overview's characters after the one being read (0.3) - the causal mask hides them
  from that reader, so they get no bar; each reads at full strength once it is read, and the
  future note says why it is faded. Each B line reads at full strength in the state that
  teaches it, and a full-strength line in the same state says why it is dimmed.
  Check: `src/text-contrast.test.mjs` - the tokens, every role and identity hue, every loud-fill
  step, every glyph on the scene surface, and every glyph over a filled shape (its own label
  included, no blanket skip) composited with its fill's step, every object's opacity and the
  box shadow - on every card of every board at rest, in every review state and input value,
  both themes. It fails on a listed B object that no longer fails in its state. Glyph extents
  are estimated (sans 0.5 em per character, monospace 0.6), so a line whose last character or
  two runs onto a fill can go unmeasured.
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
