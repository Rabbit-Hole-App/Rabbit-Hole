# Learn explanation depth and tool selection

Regular Small dev only. The existing Learn chat and Explain on canvas flow
choose how deeply to answer separately from how to represent the answer.
The Explain on canvas button was removed from Learn chat answers on
2026-09-29; the depth and tool choice below describe the flow as it was.

## Behavior

- Chat follows a shared teaching policy without an extra planning model call.
- The existing `plan_explanation` records `objective`, `depth`,
  `assumedKnowledge`, `representations`, `tools`, `reason`, `outline`, and `assets`.
- Depth is `quick`, `conceptual`, `technical`, or `deep_dive`. The model chooses
  from the question and context; topics are not routed through keyword rules.
- Tool choices can be empty. Detailed explanations can use equations alone;
  beginner explanations can use an interactive graph when manipulation helps.
- Retrieval tools and lesson operations remain distinct. `interactive_plot`,
  `generate_video`, `interactive_3d`, and `generate_3d_animation` are JSON
  operations inside `explain_on_canvas`, not new independent model tools.
- The evaluator checks depth/prerequisites under relevance, and tool usefulness
  under asset correspondence. There are still at most two reviews with one
  revision. No extra evaluation loop was added.
- The final API result includes `plan.teachingPlan` for inspection. Progress
  reports the chosen depth. The plan is an initial decision summary; a failed
  asset fetch may lead to a reviewed alternative.
- Explain on canvas uses the existing primary blue button style.

## Context

The current question and live semantic snapshot include selected objects, graph
parameters, current 3D camera state, the page stage and up to four recent lesson
explanations. Canvas preparation now also receives up to six preceding chat
messages, each limited to 1,000 characters, from that conversation up to the
answer being explained. Later turns and other conversations are excluded.

For generated course lessons, the snapshot includes the course's audience,
goal, prior knowledge and duration, each limited to 600 characters. Demo/freeform
lessons do not inherit an unrelated saved curriculum's brief. These are declared
learning needs, not a measured mastery profile. Missing information stays unknown.
Client context and previous assistant output are untrusted evidence. Existing
app access checks and canvas-operation validation remain in place.

## Implementation

- `packages/control-plane/src/learn-teaching.js`: shared policy and history bounds.
- `learn-context.js`: chat policy and course-brief validation.
- `learn-board-review.js`: structured teaching plan and evaluator instructions.
- `learn-board.js`: context propagation, planning progress and result metadata.
- `packages/web/src/LearnPage.jsx` and `ask.jsx`: current course/chat context,
  existing primary button.

## Verification

61 focused tests pass, covering schema bounds and unsupported tools, history and
brief limits, context retention through revision, the existing two-review limit,
paper previews, chat, graphs, video, and 3D primitives.

Dev deployment: `a329c791-6208-4780-933b-ce76c3683eb2`.
Real response/browser results are recorded in
[the test report](../testing/learn-teaching-planner.md).

This is prompt-guided adaptation with validated output, not a trained mastery
model or a guarantee that every depth choice is correct. The small verification
set is a smoke test, not a teaching-quality benchmark. Existing eight-block
canvas limits remain; a deep dive may need focused follow-up questions.
