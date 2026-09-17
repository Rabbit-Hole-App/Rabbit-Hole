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
