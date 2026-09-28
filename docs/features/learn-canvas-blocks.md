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

## Verification

`node e2e/chat-block-check.mjs` against the dev deployment covers every block above end to end.
Unit tests: `node --test src/*.test.mjs` (scene engine, animation evaluator, behaviours).
