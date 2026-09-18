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

## Verification

`node e2e/chat-block-check.mjs` against the dev deployment covers every block above end to end.
Unit tests: `node --test src/*.test.mjs` (scene engine, animation evaluator, behaviours).
