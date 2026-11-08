# AI Learning Examples Implementation Plan

> For agentic workers: execute the approved examples using existing program-card fixtures. The coordinator owns shared registration, integration checks, documentation and push.

**Goal:** Add backpropagation, a movable decision boundary and Q-learning as reusable 2D teaching examples.

**Architecture:** Use the existing `ProgramScene`, shared `Frame`, input controls, schema-2 actions/drag events, persistence and Reset. Add fixture sources and focused numerical tests; do not add a renderer, new UI shell or SDK version.

**Tech Stack:** Existing JavaScript fixture bundles, QuickJS/WASM, React shared scene renderer and node:test.

**Spec:** Owner-approved recommendation in this conversation: change a weight and inspect gradients/update; move points and inspect classifications/errors; take an action and inspect Q-value/policy updates. This document records bounded implementation choices for that approved scope.

Task: `e3e779ff-23c6-43ab-b4fb-5b06f9eda2a4`.

## Global constraints

- Strictly 2D. Reuse current program card shell, title/description, controls and shared drawing primitives.
- Put explanatory prose in the card description above the scene; use concise diagram labels/readouts within it. No explanatory footer below scene or controls.
- Existing SDK 6 / renderer 4; four inputs, eight actions/targets, sixty frame objects and existing resource budgets remain unchanged.
- Examples are synthetic and hand-authored; never claim production activation or successful LLM regeneration from fixtures.
- No planner mapping, repair-budget change, broad CI, paid calls or deployment credentials in this batch.
- Root pushes the feature branch and updates the canonical tracker. Include a Claude regeneration handoff for the prior convolution/attention/gradient fixtures.

## Review focus

- Analytic backprop gradients must agree with finite differences, including zero and saturated inputs.
- Decision geometry must use the same coordinates and nearest-neighbor rule as predictions/errors, including drag boundaries and distance ties.
- Q-learning must not bootstrap from terminal states, and invalid moves must use the stated transition/reward rule.
- Saved state must reopen consistently and Reset must restore defaults; stateful fixtures need initialize/reduce/evaluate coverage.
- Scenes must fit the existing frame contract with legible labels and no explanatory footer.

## Tasks

- [x] `ai-backprop-fixture.js` / `ai-backprop.test.mjs`: one hidden tanh unit, fixed output weight/target, chosen input/weight/rate and forward/backward/update mode. Independently check analytic derivatives and one update using real QuickJS and frame validation.
- [x] `ai-boundary-fixture.js` / `ai-boundary.test.mjs`: six draggable labeled training points, one query target, 1/3-nearest-neighbor control; recompute a small numeric decision raster, query prediction and leave-one-out errors. Stable tie ordering; bounded drag domain. Check reference predictions, drag mapping, restore and unchanged target IDs.
- [x] `ai-qlearning-fixture.js` / `ai-qlearning.test.mjs`: 3×3 tabular world, start top-left, terminal goal bottom-right and terminal pit in center. Four movement actions and New episode; inspect updated Q values and greedy policy. Goal reward, alpha and gamma controls; changing controls starts a fresh learning run. Check exact update, terminal/self-loop transitions and episode preservation of Q.
- [x] Register exports in `ai-teaching-fixtures.js` and extend integration coverage for both schema versions, saved inputs/state and Reset. Run `node --test --test-concurrency=1 packages/web/src/explain-program/ai-*.test.mjs` and web dev build once after integration.
- [x] Inspect actual shared-Frame static renders. If browser access remains unavailable, record that limitation without claiming live acceptance.
- [x] Update support documentation and curriculum tracker; write the exact Claude handoff; commit and push `chatgpt/ai-learning-examples`.

## Verification record

2026-11-08: 28 focused tests passed with unchanged runtime budgets; dev build passed. Independent code review found no concrete defects. Shared-Frame static scenes inspected; offline export omits KaTeX foreignObjects and the shadow filter. Browser interaction, real generation and deployment remain pending in the linked handoff. Publication is recorded with its resulting SHA in the canonical curriculum tracker.
