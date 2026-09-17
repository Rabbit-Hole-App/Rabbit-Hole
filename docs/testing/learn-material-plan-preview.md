# Modular lesson-plan preview verification

Regular Small dev deployment: `a17442de-6e18-4dbf-b7e8-5dd88ed0c346`.
Project: `repo-06745f10-nanogpt`.
Date: 2026-09-17.

## Delivered

- Main-area Curriculum / Lesson / My notes navigation.
- Owner Curriculum Agent and learner Learn Agent share `ChatComposer`.
- Supplied eight-lesson curriculum saved as an unapproved dev course draft.
- Lesson plans open within Curriculum with Back navigation.
- Readable blocks for Lesson 1, Pages 1–2 only: canvas text, asset plans,
  drawing sequence, explanation, supporting text and references.
- Quiz, Flashcards, Notebook and Repository focus tabs open their module below
  the lesson card. Lesson 1 has individual question, card and notebook-cell blocks.
- Empty completion indicators in the learner preview.
- Owner-selected block editing through chat, highlighted target and clear action.

## Evidence

15 course tests passed, including three new section-revision tests: owner access,
source/revision checks, input/output limits, unchanged saved curriculum/approval,
and rejecting an edit when the course changes while the model is working.

Three focused browser regressions passed against the final dev bundle with
mocked APIs: existing owner curriculum navigation, learner-only outline, and
saved-course navigation to generated pages.

The real deployed browser check passed:

- The owner opens Curriculum, an activity tab, and the nested Lesson 1 plan.
- Exactly two page headings and twelve page-section blocks are displayed.
- Four separate flashcards and five notebook cells appear in their modules.
- The selected block is highlighted and its context appears above the focused
  shared composer.
- One actual API model call appended a requested sentence to Page 1's
  below-canvas explanation. Only that block changed; eleven others stayed intact.
- Reload restored the isolated browser's draft edit.
- Back restores Curriculum without switching the main tab.
- Learner preview shows completion boxes and no edit icons. A mocked non-owner
  role response against the real bundle keeps Learn Agent and hides author tabs.
- No browser errors. No asset generation/rendering requests.

Artifacts: `.small/learn-modular-check.json`,
`.small/learn-modular-curriculum.png`, `.small/learn-modular-plan-edit.png`, and
`.small/learn-modular-learner.png`. The first test attempt matched both the hidden
Learn composer and visible Curriculum composer; the locator was narrowed to the
visible composer before the passing run. Earlier navigation checks also observed
the app's existing `/api/byoc/grant` connection-token requests; these are unrelated
to lesson generation and were excluded from the generation-request assertion.

## Six-page draft and page grouping

Regular dev deployment `7237df17-a72b-4697-8fda-01fba9dc3d1c` completes
Lesson 1's six-page material draft. The deployed Chromium check verified six
collapsible page cards and 36 section blocks, first-page default expansion,
expand/collapse on every page, section icons, reference links, rendered math
and code, and selecting Page 3 Further explanations for the shared chat composer.
The left connector groups the sections under their page. Back to canvas is
absent; Lesson navigation and Back to curriculum still work. Quiz (2),
flashcards (4) and notebook cells (5) remain accessible in their modules.

No browser errors, model calls or generation requests occurred in this check.
Three existing owner/learner/course navigation scenarios passed (8.9 seconds).
The standalone Python examples in Pages 2 and 3 executed successfully; this is
not a claim that the browser notebook or lesson playback has been built/tested.
Supporting diagrams remain specifications awaiting approval and rendering.

Evidence: `.small/learn-six-pages-check.json`, `.small/learn-six-pages.png`.

## Limits

Timing follow-up: regular dev `0e0d13ef-11b5-4b11-8e01-bf0364d052db`.
The deployed browser check verified the three timing labels (guided explanation,
self-paced review, optional notebook pending testing) and a lesson heading with
no ambiguous total-duration claim. Existing page, quiz-background, activity and
navigation checks passed without browser errors or generation requests. Objective
tracking and the optional-activity completion rules are still documented build
requirements, not a tested learner progress implementation.

Quiz readability follow-up: regular dev `c174a97c-c7b4-42fd-98ad-2bb9b2e189d4`.
The deployed browser check verified that selecting a quiz question retains its
original white computed background and adds only the selection outline. Correct
answer rows have transparent backgrounds; the green checkbox remains. All
existing six-page and activity checks passed without errors or model requests.

### Revision 3 draft and activity presentation

Regular dev `a6b79f41-92cf-4951-949f-27eb22542ce4` shows Quiz, Flashcards and
Notebook as independent collapsible blocks below Page 6. Quiz options render
checkbox outlines with the correct option checked green and feedback below.
The nested material plan hides Edit course / Learner view; returning to the
overview restores the switch. Existing curriculum-card activity tabs remain.

Deployed Chromium checks passed: all three dropdowns open/close independently,
2 quiz / 4 flashcard / 5 notebook review blocks remain, both correct-answer
checks are green, notebook editing focuses chat, and the view switch is absent
inside the plan and visible on return. Six pages retain distinct section icons,
math/code rendering and edit targets. No browser errors or model/generation
requests. Three existing navigation scenarios passed (8.7 seconds).

All six raw Python fences compile with notebook top-level-await support; no
escaped underscores, emphasized keywords or nonbreaking-space indentation were
found in the repository copy. The clean `lesson-01-notebook.ipynb` contains seven
Jupyter cells (3 code, 4 Markdown) from the five review sections; its three code
cells round-trip exactly to the Markdown source. The reported corrupt uploaded
copy was not supplied here, so its formatting transform was not identified.
This is syntax/export validation, not execution of the notebook in Pyodide.

Revision 3 specifies, but does not implement, Page 3 position targeting,
objective-linked learner attempts and Page 5's progressive three-group diagram.
Browser notebook execution, dataset pinning, real lesson interaction and an
audience-matched usability preview remain release requirements.

Evidence: `.small/learn-six-pages-check.json`,
`.small/learn-quiz-answer-key.png`, `.small/learn-lesson1-practice.png`.

Regular dev `3bef151e-2595-45d5-b17f-87b941822b0d` adds the three practice tabs
directly beneath Page 6. The deployed browser check opened all three modules,
verified two quiz blocks, four flashcards and five notebook cells, then selected
notebook Cell 2 for editing and verified composer focus. No browser errors or
model/generation requests. `make test-unit`: 31 passed (15.92 seconds).
Screenshot: `.small/learn-lesson1-practice.png`.

### Revision 2 teaching draft verification

Regular dev `32f9350a-22d3-4ab6-aab4-c6e9966c8c06` updates only the Lesson 1
fixture and its preview. All six pages use the Hello example and the agreed
intuition-first progression; learning is now Page 4, repository mapping Page 5.
The two quizzes include choice-specific feedback, the four flashcards ask
concrete retrieval questions, and the five-cell notebook starts with a toy
mapping before the real dataset. Material revision IDs prevent old browser
edits from replacing the new baseline; previous entries are not deleted.

The deployed browser check passed for six cards/36 sections, six distinct
section icon SVGs per page, collapse/expand, Page 3 math and code, the reordered
headings, revision IDs, edit selection and the quiz/cards/notebook module counts
and updated content. No page errors, model calls or asset requests occurred.
Three existing navigation scenarios passed (10.5 seconds). Page 2/Page 3 Python
examples and the notebook's toy cell executed with the expected outputs. The
network-backed Pyodide notebook remains a reviewed draft, not a tested lesson.

The review checks content coherence and UI behavior, not learning effectiveness
with students or automatic compliance by every model-generated answer.

Plan text edits persist in browser storage for this app/workspace/account, not
as shared server plan revisions or edits to the repository Markdown. Curriculum
chat history is visit-scoped; Learn chat keeps its existing persisted history.
The section editor can revise text/specifications, but cannot generate assets.
The full course-production approval/build workflow remains pending. No model
claim about teaching quality was evaluated, and no notebook cells were executed.
Only regular dev was deployed; Amazon BYOC and live were not changed.


## Lesson 1 Pages 1-2 playback preview (2026-09-17)

Deployed regular dev version `58d8147d-c64f-496b-8d42-0a13ea8d8dbf`.
The real authenticated browser check passed: pause, finish-before-next,
two canvas pages, Further explanations, encoding feedback/retry, reload,
real pinned source lines 21-32 highlighted above the composer, selection
transport accepted by the server snapshot validator, scrubbing, auto-advance
and replay preserving learner annotations. The tutor reply was intercepted;
no paid model or media-generation call was made. A stale viewport coordinate
after scrolling was found and fixed before the successful rerun.

Three focused progress unit tests passed (input parsing, attempt history and
account/source/revision isolation). Three existing navigation browser tests
passed. Supporting browser artifacts are local in `.small/nanogpt-*`.
Full Pages 3-6, scored Quiz Question 1/Page 4, browser notebook execution,
shared progress sync and rebuilding chat draft edits remain outside this slice.

### Main synchronization checks

- `make test-unit`: 31 passed.
- Control-plane Node suite: 167 passed after updating paper-planner fixtures
  for the current schema and the deploy-review DB mock for provenance lookup.
- Frontend helper suite: 9 passed.
- `make test-integration`: failed broadly against the configured external test
  environment; interrupted after repeated failures/timeouts. A focused rerun
  confirmed the first Ask test expects multiple yolo apps, but its authenticated
  context reports no visible yolo app (SSE answer instead of the expected JSON
  disambiguation). Integration is not green; no live deployment is part of this push.
