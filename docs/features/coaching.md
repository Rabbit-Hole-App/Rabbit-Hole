# Coaching: product, ideas, tasks, and results

Side panels must be resizable. Inline right panels reuse `ResizableSidePanel`
(drag, arrow keys, double-click reset, bounded width); overlay panels reuse
`SlidePanel`. Repository Code and Learn use the same inline resize behavior.
Repository chat can select source ranges, open inline source citations and
show saved graph answers in the main area. Selected-node context uses a compact
green outlined pill. Graph navigation keeps Back available; counts and help
share one information control. Details are in the public repository spec.

The [public repository import](learn-repositories.md) adds branch-selected GitHub
projects through Apps, Graphify code graphs, source browsing and repository-aware
Learn chat on regular dev. See its [verification results](../testing/learn-repositories-results.md).

The [Learn teaching planner](learn-teaching-planner.md) chooses explanation depth
and representations/tools from the current question and learner context. Its
decision, review flow, and verification results are documented there.

The Learn canvas now includes the [generated video primitive](learn-video.md): provider-neutral lesson operations, background jobs, saved clips, playback and explicit retry. Its implementation and verification status are tracked there. Regular dev only; live and private AWS are unchanged.
The same lesson canvas also supports the [interactive graph primitive](learn-graphs.md), with one shape for Desmos mathematics and Plotly data charts. That document tracks implementation and browser verification.
The [interactive 3D primitive](learn-three-d.md) embeds hosted GLB models with orbit, zoom, pan, animation controls and saved camera state in the same canvas.
UI blue links, text actions and answer-selection controls use the existing button accent token (`--color-accent`, `#2383e2`), including its tints for hover and selection. Keep ordinary answer text and citation pills in their existing neutral colors.

The [Blender scene-generation primitive](learn-scene-generation.md) creates new technical GLBs from validated scene JSON and places them into that viewer. It reuses the background asset lifecycle and is enabled only on regular dev.

Coaching helps builders and colleagues understand how an app was built through
the app's Agent tab. This release adds an inspection UI with sample data around
the existing chat. Capture and extraction are not connected in this UI release.

The [Coaching benchmark protocol](coaching-benchmark.md) and
[measured pilot results](../testing/coaching-benchmark-results.md) compare source,
session, and extracted-decision context in a separate evaluation harness. These
experiments do not connect extraction to the app or change the sample UI.

This is the central Coaching document. Keep proposed work, task status, and
links to supporting specifications and measured results here as we build.
The brainstorm below is proposed work, not an approved implementation or a
claim that the sample inspection tabs already feed Chat.

Learn is a separate app tab for the proposed narrated whiteboard experience.
The original [Learn build plan and current checklist](../../02-how-we-will-build-it%20%281%29.md#implementation-checkpoint--2026-09-16)
maps the shipped prototype to its larger milestones. The latest increment adds
owner-directed curriculum creation and first-lesson generation, described below.
Its layout is an enlarged canvas area with chat on the right. It preserves
the sidebar, uses the shared
`ExpandedPageFrame` and `PeekBreadcrumbs`, and offers Minimize and a clickable
app breadcrumb to return. `?tab=learn` supports direct links and browser Back.
The published version gives **Learn Agent** its own conversations and history,
separate from the app's Agent tab.
The original sigmoid demo remains available for existing app previews. Public
repository ingestion and agent canvas explanations are documented in the linked
feature sections. Audio and full-course generation are not implemented.

### Learn: explain a chat answer on the canvas

Deployed to regular Small dev as `3ca0d796-6510-425c-85ec-5169a30ad84c`.
This increment extends the original dev canvas explanation. Live and BYOC
remain unchanged. Model calls use Anthropic API billing, not a chat subscription.

- Completed Learn chat answers offer **Explain on canvas**, including general
  questions before a lesson starts and answers reopened from History. A blank
  canvas gets a freeform explanation context; no demo prerequisite. New explanations
  occupy columns to the right; the viewport pans at readable zoom and follows
  newly written content vertically inside the fixed 480px canvas. Manual
  pan/zoom stops auto-follow. Existing lesson
  objects and learner drawings remain in place. Unsafe long connectors are omitted.
- Chat answers use dynamically derived transparent blocks with a blue outline and an Ask icon to quote a
  passage in a follow-up. Page headings and source references stay outside blocks.
  The selected block has an opaque light-blue background, stronger blue outline
  and black text in both themes, matching its
  composer preview; clearing selection removes the highlight. Each explanation
  block also has a copy icon with local Copied/Copy failed feedback. Chat mathematics is typeset with KaTeX; canvas equations
  preserve their unwrapped Unicode/plain-text lines. Code is displayed, never run.
- The visual agent chooses tools as needed: `search_pexels` returns candidate photos;
  `inspect_image` supplies an actual retrieved photo to the model; and
  `search_arxiv` finds paper metadata, `read_arxiv_paper` reads the actual PDF,
  and `explain_on_canvas` returns a validated drawing plan. No search tool is
  mandatory; straightforward explanations use the supplied context alone.
  Selection, current object bounds,
  relationships and recent lesson explanations are supplied as context.
- The agent chooses up to eight blocks: text, equation, diagram/workflow, code,
  image, or an original paper figure crop. Paper-derived text, equations, code and
  diagrams carry a paper/page citation; figures are cropped from actual PDF
  pixels with PDF.js in the browser, never recreated and presented as originals.
  References link to the paper PDF page inside the canvas. At most two papers,
  12 MB per browser PDF download, and page numbers 1?100.
  Photos can have optional boxes, circles, highlights, arrows, labels,
  or paths chosen from context. Marks use normalized image coordinates and remain
  separate shapes over a proportionally resized photo. These are illustrative
  annotations, not detector results. No arbitrary image URLs or photo IDs.
- A short teaching plan precedes optional asset collection (at most six tool
  calls), then a draft. An independent evaluator reviews the question, plan,
  evidence and actual photos/paper PDFs. At most two evaluation passes: initial
  review, one revision if needed, final review. First-pass acceptance skips
  revision. A second rejection or invalid review draws nothing and shows an error.
  Streamed stages show planning, reading/inspection, review, revision and rendering.
  Photos must be inspected before use; at most two photos and four annotations
  per photo. Pexels failure can fall back to a text or diagram explanation.
  The Pexels key stays in the dev worker secret; public generic search terms only.
  Photo attribution is a clickable link inside the canvas only. The paused
  explanation status has no highlighted background.
- Added assistant objects can be selected or circled for further questions.
  Ask about selection and personal Notes also work on freeform explanations
  without starting a lesson; Save & resume returns to that active explanation.
  Their semantic context includes diagram connections and photo annotations.
  They remain labeled as AI explanations rather than verified app facts.
- Dismiss, resume, seek and replay clean up owned explanation shapes. Responses
  from a stale lesson run are rejected. Personal notes can save a board snapshot;
  canvas explanations themselves are otherwise temporary.
- Dev validates app/workspace access through the existing live control plane.
  Contextual Learn chat uses the shared D1 binding and existing history handler,
  preserving permissions and separate Learn conversations. No schema migration.

Verification: 24 focused server/context/region tests and four browser tests pass.
Browser checks cover math, quoted follow-ups, diagram selection, image sizing and
annotations, dismissal, and stale responses. A real Sonnet 5 / Pexels test searched
for a dog, inspected the returned photo, and produced a valid illustrative box,
label, and detection workflow. The Pexels secret is configured on dev only.

References: [Pexels API](https://www.pexels.com/api/documentation/),
[KaTeX](https://katex.org/docs/api), and
[Claude tools](https://platform.claude.com/docs/claude/docs/tool-use).

### Learn: hardcoded lesson, notebook, and practice preview

Notes description and timeline return preview deployed to regular Small dev as `36c47810-0734-47a7-9bb2-84a3116d284c`.
The My notes collection shows its heading without explanatory storage copy.

The note icon outside the canvas pauses playback and opens an isolated tldraw
snapshot in **My notes**. Text, pen, highlighting, eraser, and undo annotate that
snapshot. Lesson shapes start locked; the lesson editor is never edited by notes.
Notes mode remains visibly selected beside the pale yellow annotation canvas.
The selected drawing tool is highlighted and stays active for repeated marks.
Save controls sit above the canvas alongside the tools. Personal notes have a
trash icon both while editing and in the notes list, with Delete/Cancel confirmation;
original slides remain intact. Main Lesson/Notebook/Practice/My notes buttons
stay enabled while editing. After changes, switching views prompts Save notes
or Cancel; a successful save opens the requested view, while Cancel stays in
the editor. Autosave still runs, and explicit navigation confirmation remains
until leaving the editing session.
**Save & resume** restores the stored section/frame and continues playback;
**Save to My notes** opens the collected notes. Completed slides are collected as
they finish and grouped with editable personal snapshots by lesson/section.

Personal notes accept an optional short description above the editor, displayed
in place of Personal notes in the collection; blank descriptions keep that fallback.
Descriptions autosave with the snapshot and survive reloads. Return to lesson on each card restores its saved page and animation position,
paused for review; Save & resume still continues playback.

Notes autosave to IndexedDB, keyed by signed-in email, workspace, app and note ID.
They survive reloads in that browser. They are not sent to the server/chat, shared
with other app users, synced across devices, or encrypted against someone with
access to that browser's storage. Clearing browser data removes them. Saved
snapshots survive lesson replay; if an older course version is unavailable, its
notes stay readable and returning to that version reports the limitation.
Storage failures keep the editor open with a retry message rather than claiming
success. Learn remounts on account/workspace/app changes to clear previous state.

Browser verification covers typing a note, saved/rendered slide snapshots, reload
and editing, playback isolation, another account seeing no notes, storage failure
and retry, plus existing lesson/source/practice/navigation/progress checks.
Implementation uses [tldraw snapshots](https://tldraw.dev/sdk-features/persistence)
and [snapshot rendering](https://tldraw.dev/examples/image-component).


Section completion is tracked in this Learn session when the animation reaches
its final frame (including an explicit full-page preview). Opening an outline
section starts at its first frame. Completed sections and lessons show green
checks; lessons require every section. A text-free green progress bar above the
right-panel navigation tracks finished sections, and the trophy lights at 100%.
Replaying does not clear completion; reloading/leaving Learn does. Notebook,
Quiz, and Flashcards use visible bordered buttons in the curriculum, beside
learner-controlled completion checkboxes. They count
toward the lesson check, course progress, and award; scores are not automatically
used to mark these activities complete. No backend persistence
was added. Five focused browser checks passed, including two-lesson navigation,
saved curricula, completion accumulation, and the award. Dev deployment:
`05d9306b-8342-4f1c-b09b-3b7b75fa6633`.

The learner preview defaults to the two-lesson sample course **From classification
to object detection**: Logistic regression (3 pages) and Inside the YOLOv8
architecture (7 pages). Lesson headings open the first page; section links open
the selected page and highlight it in the outline. The course title appears next
to Learn, with the lesson title and current section above the canvas. When an app
has a saved curriculum, the outline course selector preserves access to it.
These are authored samples, not newly generated lessons or changes to saved data.


Curriculum now has **Edit course / Learner view** tabs for the app owner,
using the existing server-provided `canAuthor` permission. Other users get only
the learner outline. Its lesson/page links open the main canvas; the sample YOLO
lesson also links directly to Notebook, Quiz, and Flashcards. The outline stays
above the chat composer. Saved curricula show generated content where available;
unfinished lessons are disabled and labelled, rather than opening unrelated
sample content. With no curriculum, the outline explicitly offers sample lessons.
Learn uses a 900px maximum content width through the shared frame's optional
wide setting. The **Ask about selection** icon sits outside the canvas on its right and draws the existing
red ellipse; direct object selection remains automatic.

Verified four browser checks: existing controls/source/practice, owner switching
and navigation, learner-only access, and saved curriculum/unfinished lesson states.
Deployed to regular Small dev as `9ca7b431-c375-4fd4-9e5c-b5a56cd67043`.

The existing enlarged Learn page adds **Lesson / Notebook / Practice** views.
Learn Agent remains mounted on the right. Source links open in that panel's
conversation area, with the referenced range highlighted using the shared
syntax highlighter. The existing chat composer stays pinned below the source;
closing source restores the conversation and its unsent draft. Sending a question,
opening History, or starting New chat returns to the conversation. All new
source examples are explicitly illustrative, not claimed to be extracted from
the deployed app.

The existing sigmoid animation, playback, selection, curriculum controls, and
Learn chat history remain. The right-panel header has Curriculum and Lesson chat
icons with active labels using the existing search/notification style. Course
setup and Preview Lesson 5 buttons were removed at the user's request; Curriculum
opens the existing authoring flow. Practice review links can open the seven-page
authored YOLO architecture example through the existing page animation engine. Supporting
text, an equation, code snippet, source link, notebook link, and further reading
appear below the canvas. This is a UI prototype, not the generated lesson system.

Notebook embeds real JupyterLite on an isolated static dev origin. Users can
edit Markdown/code, add/remove cells, and run browser Python. Switching views
keeps the notebook mounted. **Reset notebook** uses the shared confirmation
dialog and restores the bundled original plus a fresh kernel. Edits last until
reset or leaving/reloading Learn; downloading retains a copy. No server execution,
new model calls, notebook ingestion, or cross-device persistence was added.
See [notebook build/deployment](../../packages/web/notebook/README.md).

Practice contains three authored quiz questions with explanations and links
back to lesson pages. Five flashcards flip on click (keyboard accessible;
reduced-motion respected). **Got it right / Not yet** records a separate choice
per card; navigating cards or views retains it for this preview session. Quiz
and card scores are not persisted or sent to a model. The existing Learn chat
remains available; notebook/cell/practice context is not automatically attached.

Follow-up UI: the notebook's external introductory heading/help text was removed;
Reset remains in a compact toolbar. Ordinary wheel/two-finger scroll over the
canvas scrolls the lesson reading area; Ctrl/Meta wheel remains available to the
canvas. Jupyter uses its own windowed notebook scroll container. The region
action is an icon with a tooltip on the canvas's right edge. Selecting a supported
lesson object automatically pins context and captures the thumbnail; no selection
button is needed. Focus moving into chat preserves that target, and X clears it.

Four focused Chromium scenarios pass for the follow-up: panel icons/removals,
source-with-composer and unsent draft retention, canvas/notebook wheel scrolling,
quiz/flashcard state, real Python/reset, automatic object selection with moved
bounds, deleted-target handling, and ellipse targeting. The browser wheel checks
exercise wheel events used by mouse/trackpad scrolling; physical trackpad hardware
was not available for a separate manual check.
Deployed to regular dev as `56d5a4c1-3638-4bdd-a318-0c17697b80e6`.

The Learn panel now has the existing resize-handle appearance on its left edge.
Drag changes its width without remounting chat/notebook; double-click restores
400px, and left/right arrow keys resize in 24px increments. Width is retained
while Learn is open and constrained to 320–800px, leaving at least 360px for the
main area when space permits. The stacked small-screen layout remains full-width.
Curriculum returns to content through the **Lesson** tab, preserving the existing
save-first guard for unsaved curriculum edits. The redundant Back to canvas
button has been removed. Focused browser checks cover drag and reset.

Verified with two Chromium scenarios (22.2 seconds): real edited Python returned
42, tab switching retained edits, Cancel preserved edits, confirmed reset restored
the original notebook and cleared output. Quiz scoring, source range/position,
and flashcard flip plus per-card self-assessment passed. Regular dev deployment:
`a6c70749-1418-49a2-a673-c67965d65d4f`. Isolated notebook assets:
`33b4c50b-2256-4b5a-8963-030525939573`. No live or BYOC deployment.

### Learn: owner-approved curriculum and first lesson

Next step: [review each lesson's Markdown material
plan before rendering](learn-lesson-plans.md). The first example is the
[nanoGPT Quickstart curriculum](../courses/nanogpt/quickstart-curriculum.md) and
[Lesson 1 plan](../courses/nanogpt/lesson-01-plan.md). This proposal adds a separate
owner review of canvas content, supporting text, notebooks, quizzes and
flashcards. Regular dev now displays the supplied nanoGPT curriculum and Lesson 1
Markdown as a review preview; automated plan generation and plan approval/build
remain pending. nanoGPT's preview does not offer the old direct Generate action.
All six Lesson 1 pages now use individually editable blocks. Each page collapses
as one card, with a chevron, section icons and a vertical connecting line on the
left. The first page starts expanded.
Section icons are distinct: type for Canvas text, image for Assets, route for
Drawing sequence, microphone for narration, open book for Further explanations,
and chain link for References. Heading whitespace is trimmed before icon lookup.
Quiz, Flashcards and Notebook open as modules beneath their curriculum tabs. Edit in chat highlights and
attaches a block; a bounded owner-only revision updates that block and saves the
draft in this browser. See the lesson-plan spec for persistence limitations.
Reference blocks include verified papers and online tutorials alongside source
links, with reading guidance and explicit distinctions from nanoGPT's own
implementation, without generating any paper assets.
The supporting block is named **Further explanations**. All six pages include
substantial self-paced material beyond the short canvas presentation: examples,
math, code, comparisons and planned supporting diagrams. This area can reuse
canvas assets or add images, videos and other material where useful; it is not
restricted to prose. Later lessons retain their outlines.

Lesson 1 material revision 2 follows the agreed intuition-first teaching flow
through a running Hello example, from the prediction problem to representation,
targets, learning, repository mapping and recap. Further explanations use worked
examples, explained notation and understanding checks. Quiz feedback addresses
each choice; flashcards use concrete retrieval prompts; notebook cells follow
predict/run/change/explain. Revision-scoped section IDs preserve old local edits
without applying them to this reordered draft. No assets are generated here.
Quiz, Flashcards and Notebook appear as separate collapsible blocks below Page 6,
reusing the same modules and section edit targets. Quiz options have checkbox
outlines and the correct answer has a green check; explanations follow below.
Quiz answer rows never receive a colored background. Selecting a quiz question
for editing changes its outline only; its reading surface remains white.
Edit course / Learner view stays on the overview and is hidden in the nested
material plan. Revision 3 also specifies the Page 3 interactive target-selection
check, objective-linked attempts and Page 5's three-stage reveal. Those learner
interactions remain planned, not implemented in the review UI.
Lesson 1 now separates guided explanation (~6 min), self-paced quiz/review and
optional notebook (~5 min, pending testing). Duration labels do not promise a
six-minute completion time. The draft maps three core objectives to checks on
Pages 2–4; optional reading/practice does not gate its proposed completion rule.

Navigation is in the main area: **Curriculum | Lesson | My notes**. Existing
notebook/practice shortcuts remain available for sample lessons. Curriculum
opens both the owner editor and learner outline in the main area. Selecting a
supplied lesson opens one level deeper inside Curriculum, with **Back to
curriculum**; it does not switch to Lesson. Learner preview lessons, topics and
activities show empty completion indicators until actual learning content exists.

The resizable right panel contains the agent header, History and New chat.
Owners editing Curriculum use Curriculum Agent; learners and the owner's Learner
view use Learn Agent. Both use the shared `ChatComposer` input/send component.
The curriculum adapter uses the configured default model; attachments are not
connected. Curriculum conversation history lasts for the current visit, separate
from the persisted course and the existing persisted Learn chat history.

Scope: **regular Small dev only**, one saved course per app. The owner decides
the audience, goal, prior knowledge, and duration before lesson generation.
The same app can support different teaching goals; multiple saved courses are
future work. App viewers can read an approved course, but only its owner authors
or approves it. An unapproved draft is visible only to the owner.

Flow inside the existing enlarged Learn tab:

1. **Create course** opens the brief/outline on the left and **Course setup**
   with Curriculum Agent on the right. Four questions are asked one at a time, with
   suggested answers and free text. Answers are saved per app.
2. **Draft curriculum** reads the available deployed source, runbook, and app
   metadata. The dedicated agent plans and reviews outcomes, topics, principles,
   prerequisites, scope, time allocations, and assessment criteria. It does not
   design slides. The interview is deterministic; model work starts here.
3. Edit the brief and curriculum fields directly; reorder/remove
   units; or ask Curriculum Agent to revise the draft. **Save curriculum** persists
   manual changes. Save edits before requesting a model revision.
4. **Approve curriculum** approves exactly the saved revision. **Generate first
   lesson** becomes available only afterward. Any edit/revision clears approval
   and the previous generated preview. A deploy change requires a new draft.
5. The retained lesson generator creates only the first lesson, using approved
   topics as initial page seeds through a compatibility adapter. It reuses the
   animated canvas, continuous playback, Back/Next,
   scrubbing, selection/region questions, and thumbnails. **Curriculum** returns
   to the outline; **Preview first lesson** replays saved content after reload.
   The original demo and Learn chat History / New chat remain in **Lesson chat**.

Curriculum planning determines **what** to teach, not **how**. The original
shared prompt was replaced by a dedicated curriculum system prompt and review
pass. Teaching techniques remain confined to the existing lesson generator.
See [Curriculum Agent: research, contract, and cleanup](curriculum-agent.md).
Existing page-based outlines can be explicitly rebuilt using the saved brief.

Owners can use **Delete curriculum** beside the course heading. The shared
confirmation dialog offers **Delete** and **Cancel**, explaining that the brief,
outline, approval, generated lesson, and unsaved curriculum edits will be removed.
The app, chat history, and learner drawings remain. After deletion, the interview
starts fresh. Generation now shows a spinner, indeterminate progress bar, and
elapsed time; no percentage or remaining-time estimate is fabricated.

Implementation boundaries:

- `GET/POST /api/apps/:name/learn-course` uses existing app authentication and
  permissions. Additive migration `0024-learn-courses.sql` stores brief,
  curriculum, revision/approval, deployed-source version, and first-lesson JSON.
  Compare-and-swap writes reject stale edits and delayed model responses.
- JSON is bounded and validated before storage or rendering. It contains page
  narration and text/equation/text-diagram/question blocks. Placement and
  animation are application code; model-generated JavaScript never executes.
- Generated diagrams are currently **text with arrows**, not generated plot
  geometry. Narration is text shown beside chat; no audio or real pen strokes.
- Source context is the existing deployed bundle (bounded to 65,000 characters),
  runbook, description, and input/output definitions. No raw sessions, new
  ingestion, live run outputs, or extracted Coaching decisions are added.
- Course content persists; learner drawings and playback position remain
  temporary. Replays/regeneration reuse course pages and preserve learner ink.

Checklist:

- [x] Interview and saved brief.
- [x] Source-informed draft, manual edits/reordering, and agent revisions.
- [x] Owner approval and invalidation after edits; stale-write protection.
- [x] Validated first-lesson generation and shared player integration.
- [x] Existing demo, Learn chat, selection/region interactions preserved.
- [x] Backend tests, browser flow, screenshots, and real synthetic model calls.
- [ ] Learning-quality evaluation with owners and colleagues.
- [ ] Multiple courses, remaining-lesson generation, voice and real handwriting.

Detailed checks and model observations: [Learn curriculum results](../testing/learn-curriculum-results.md).
The course table was applied to shared D1 `small`; backend version
`7e8ce0e3-dc55-4bd4-8861-78eb8d384ea0` adds the endpoint and preserves live
dashboard assets. AWS BYOC is untouched.
Regular dev UI version `dfc21c81-6d79-43be-a43b-61b310421447` serves the flow at
`/apps/yolo-s3-job?tab=learn`; click **Create course** to begin.

The dedicated Curriculum Agent supersedes that planner in dev version
`b1983ca2-4ee4-4900-870b-b13f06baacca`, backend
`13344b17-eec0-47c4-bf58-b2453825b316`. Existing outlines show **Rebuild with
Curriculum Agent** and preserve the saved brief. Its plan/review comparison took
about two minutes per request. See the [updated results](../testing/learn-curriculum-results.md#curriculum-agent-revision-what-to-teach).

### Learn canvas: deployed to regular dev

The dev UI replaces “No lessons yet” with a lazy-loaded tldraw 5.4.2
canvas inside the existing lesson area. Breadcrumbs, Minimize, the sidebar, and
Learn Agent remain in place. Drawings are temporary; no persistence, multiplayer,
or model-to-canvas integration is connected. Default fonts and icons load from
tldraw's CDN. Integration follows the [SDK quick start](https://tldraw.dev/quick-start).

The dev build and focused browser test passed: freehand drawing, undo, canvas
bounds beside chat, separate chat histories, and return navigation. Dev version
`2a9ac998-dd81-48c3-95ab-da36cb334cd6` includes the supplied license from
root `.env` (`TLDRAW_LICENSE_KEY`), mapped to `VITE_TLDRAW_LICENSE_KEY` at build
time. A browser check against the deployed HTTPS assets with synthetic API data
verified that the canvas stays visible beyond the license gate and drawing works.
Live and AWS BYOC were not deployed. Preserve this build-time key mapping for
future dev builds; the SDK requires a [valid key](https://tldraw.dev/community/license)
on HTTPS deployments. Never print or commit the `.env` contents.

Learn work targets **regular Small dev only**. The tab requires
`VITE_COACHING_DEV=true` and a non-private build; do not package or deploy Learn
updates to AWS BYOC. The first empty tab was also published to BYOC dev before
the user clarified this boundary; subsequent Learn changes stay on Small dev.

### Learn Agent history: deployed to regular dev

#### Three pages and a scrub timeline

The five-step canvas below is superseded by three actual tldraw pages:
**What is logistic regression?**, **The logistic regression formula**, and
**The sigmoid function**. The existing demo and Play start the lesson. Pages
are reused on replay; learner drawings stay on their own page.

Below the canvas: Back, Play/Pause, Next, **Page N of 3 · Title**, and a labeled
three-segment timeline. Play continues automatically through subsequent pages
and stops at the end of page 3. Pause, questions, selections, and scrubbing still
stop playback; Play resumes across page boundaries.
Next completes a partial page and pauses; another click opens and starts the
next page. Back opens the previous page fully drawn. Dragging the timeline
reconstructs the selected animation frame, across or within pages, and leaves
playback paused. Its endpoint represents the completed final page. Page-label
buttons open complete previews; tldraw's existing page menu stays synchronized.

Seeking rebuilds only scripted shapes and clears stale selected context and
preview images. Questions include the current page number, title, progress,
and currently drawn objects through the existing Learn API. Images stay UI-only.
This update needs only a regular dev UI deployment, with no backend or BYOC update.

Deployed as `51ee718a-738c-4b46-8f37-9734e7acb5e0`. Five Learn browser
scenarios passed, covering three real pages, replay without duplicates, the
native page menu, two-click Next, actual timeline dragging, pause/resume, page
context, drawing preservation, selection, and regions. Fourteen existing focused
tests passed. Intro/formula/sigmoid screenshots were reviewed; the viewport leaves
room for the canvas toolbar. No image transmission or live promotion was added.

Dev `ad84e3b6-2681-4e5d-a0b5-f1f52fff67ac` enables continuous playback
across all three pages. Play also resumes from a completed intermediate page.
Four focused browser scenarios passed for automatic progression/replay, manual
navigation and scrubbing, questions, selection, and regions. Dev build passed;
only the regular dev UI was deployed.

#### Five-step lesson playback

- [x] Split the scripted sigmoid lesson into idea, equation, curve, midpoint,
  and limits. Keep its existing drawing animation and semantic metadata.
- [x] Put Back, Play/Pause, Next, and step progress below the canvas. Play
  advances automatically; Pause freezes the current frame; Back/Next show the
  chosen cumulative step fully drawn and stay paused. Disable navigation at the
  ends. Play on the completed final step stays disabled; the existing demo
  button replays the lesson.
- [x] Pause on typing a question, selecting an object, or starting a region.
  Keep chat available during playback; answering never resumes it automatically.
  General questions receive the current lesson context without inventing a
  selected object. Images remain UI-only.
- [x] Preserve learner drawings, separate Learn history, existing thumbnails,
  and stale-answer protection across replay/navigation.
- [x] Review and test playback, manual navigation, question context, selection,
  cancellation, and drawing preservation; deploy regular Small dev only.

Play starts the demo from the bottom control bar; the original demo button also
remains. Navigation changes the run identity and clears pinned context/previews.
Partial objects can be questioned while paused: original text and currently
displayed text remain distinct. Playback controls are disabled while an answer
is pending. General questions use `/api/learn/ask` with a validated lesson snapshot
whose target is null; selected-object questions retain `/api/learn/selection`.
Both use app permissions, the tutor prompt, and no action tools. The Learn API
is shared with dev; deployment preserves the existing live dashboard assets.

Review fixed a possible pause during module-loading error and keeps asynchronous
lesson narration tied to its own chat message. Five Learn browser scenarios
passed (history, animation/replay, playback/questions, selection, and regions),
including frame freeze/resume, first/last boundaries, controls below the canvas,
current-step payloads, learner drawing preservation, and unmount cancellation.
Fourteen backend/semantic/geometry tests passed. Dev build, Worker dry-run, and
the controls screenshot review passed. Browser model responses are mocked;
this release does not claim a new real-Claude quality evaluation.

Published regular dev UI `cb08c39d-4536-412d-b718-16a592ba0f60` and shared
Learn API `98e1063c-5caa-4879-b20d-e04b896d6826`. The backend deployment
uploaded no dashboard asset changes; AWS BYOC was not deployed.

#### Selection questions: deployed to regular dev

The first object-question increment preserves the sigmoid animation and adds:

- Semantic metadata on demo shapes: lesson/run/object identity, scripted author,
  original meaning, relationships, math values, stage, and drawing status. The
  midpoint dot and label share one object ID. Curve samples stay in the renderer.
- Select one semantic object, then **Ask about selection** to pin it. The chat
  shows **Asking about: Sigmoid midpoint (0, 0.5)**. Clicking the composer keeps
  that target. Clear removes it; multiple unrelated objects need a new selection.
- Submission reads current page bounds and axis transforms. Mathematical
  coordinates remain separate. Snapshot includes related objects, original and
  displayed text, and the script's actual recent explanations.
- `POST /api/learn/selection` validates a bounded snapshot and app permissions,
  then uses the server's Claude credentials with a tutoring prompt and no tools.
  The dedicated route prevents old backends silently ignoring selection context.
  Ordinary Agent/app chat behavior is unchanged.
- Replies appear in chat only. No generated JavaScript, board changes, screenshots,
  or on-board answers in this increment. Questions and answers use Learn
  history; the temporary canvas store is not uploaded or persisted.
- Deleted targets are rejected at submission. Buffered replies are discarded if
  their target disappears or run ID changes. Replay is disabled during a pending
  reply; navigation aborts animation and a new playback gets a fresh run ID.

Seven backend/semantic tests pass, including permission enforcement, current
bounds after movement, preserved mathematical meaning, and rejection on replay
or deletion. Browser tests cover animation, pinning, moved bounds, related
equation, pending-answer deletion, and unchanged chat/navigation.
A real local Claude smoke call was attempted but returned HTTP 400 because the
local API key requires `ANTHROPIC_WORKSPACE_ID`, absent from root `.env`; no real
answer is claimed. The deployed end-to-end attempt authenticated successfully,
but the local CLI identity belongs to `amazon-com` and cannot access
`yolo-s3-job` (404). No permissions were changed and no Amazon app data was used.
The actual Claude answer on the user's app remains unverified.

Following explicit user approval, the backend was deployed as
`805a325d-aac0-4962-b444-54d0752301b6`, with no changed live dashboard assets.
Regular dev UI version `f099c918-a0b8-48b0-85e9-9d1bd8646b27` serves the
selection controls at `/apps/yolo-s3-job?tab=learn`. Remote HTML checks verified
the new dev bundle and preserved live dashboard. AWS BYOC was untouched.

#### Circle targeting

During the lesson, **Ask about a region** beside the Learn heading pauses it and enables
a temporary ellipse overlay. Click and drag an ellipse, then confirm **Ask about:
[object]**. The object is highlighted and pinned above the composer. Escape or
Cancel exits. The loop is never stored as a drawing or sent to Claude.

Targeting reads current page bounds and transformed shape geometry. Containment
and segment intersection are both considered; fully enclosed objects take
precedence over a curve or axis passing through the region. Parts sharing an
object ID merge into one choice. Multiple candidates remain explicit choices;
open/tiny loops and empty regions show guidance. This selects whole objects,
not a subexpression within a text shape. No screenshot interpretation is used.

Confirmation selects the resolved shapes and reuses the existing
`explicit-selection` snapshot and `/api/learn/selection` endpoint. This increment
requires only a regular dev UI deployment, with no shared backend change.
Four geometry tests and two focused browser tests passed: midpoint vs curve,
bounds-only false hits, ambiguous/shared objects, invalid/empty loops, moved and
deleted shapes, confirmation, context payload, Escape, and preserved drawings.
Published to regular dev as `d666bce3-c443-43cc-ad1a-2dcaadef8112`; the user's
Learn URL serves the matching build. The final browser check includes the region
overlay above tldraw's toolbar. No backend, live UI, or AWS BYOC deployment.

Dev `15d715d9-3cd5-4312-9d2f-8cbedc19c71b` replaces freehand region drawing
with a circle cursor and an automatically closed drag ellipse. Five geometry
tests and the circle-target browser test passed before deployment.

Dev `dce79141-61e4-4cde-8acc-069f3de776f1` adds UI-only canvas attachments.
Pin a selection or confirm a region to show a small marked viewport image above
the chat input. Its × removes the image while preserving the draft question and
structured target; Clear selected context removes both. Sending moves the image
into the local question bubble. New chat, Replay, and a new region clear the
pending preview. No marker is added to the board, and no image is sent to Claude.
Thumbnails are in-memory only and are not restored with saved chat history.
Two focused browser tests passed for selection/region previews, removal without
losing the draft or target, image display after sending, and no image bytes in
the API request. Screenshot reviewed; regular dev build and deployment passed.

Dev `51ead8fc-6465-4e66-a8eb-d3be60012dec` uses a + crosshair for region
selection and a solid red ellipse. Both selection and region thumbnails emphasize
the target with a red outline sized to stay bold at thumbnail scale (3px stroke,
at least 18px across). This visual emphasis does not change hit-testing or the
structured target. Both focused browser checks passed and the thumbnail screenshot
was reviewed before deploying regular dev.

The Learn chat also offers **Explain the sigmoid function · Demo**. Clicking it
or entering that exact prompt plays a local scripted lesson: progressive formula
text, axes, an S-curve sampled from `1 / (1 + exp(-x))`, its midpoint, and limits.
Chat explanation follows the drawing steps. No model request or saved thread
write occurs for the demo. Other questions retain normal chat behavior.
Replay replaces only demo-tagged shapes; user drawings remain. Playback stops
on navigation and respects reduced motion. The canvas uses tldraw's
[editor API](https://tldraw.dev/docs/editor). Two focused browser tests passed
for drawing, undo, separate chat history, demo animation, and replay; screenshot
review confirmed the formula, curve, labels, and chat fit the existing layout.
Published to regular dev as `6ed0a1d7-db74-4dcf-9163-786b149b23ad`.
Review at `/apps/yolo-s3-job?tab=learn`; live and AWS BYOC remain unchanged.

- The header reads **Learn Agent** on the same row as **History** and **+ New chat**.
- `POST /api/learn/ask` uses existing app context and model handling, but creates
  `threads.scope = 'learn'` with the app name as `scope_ref`. Normal Agent chat
  keeps its existing `app` scope. No schema migration or old-thread conversion.
- History, resume, New chat, rename, and delete use Learn's own thread IDs.
  New conversations appear in its history immediately after a completed reply.
- Continuing an Agent thread through Learn (or the reverse) is rejected, as is
  continuing a Learn thread for another app. Workspace/user ownership and current
  app access are checked; revoked app access blocks Learn history and mutations.
- The frontend uses the new POST route so an older backend cannot silently put
  Learn messages into ordinary Agent threads.
- Five backend tests pass against SQLite using the actual handlers. The browser
  test passes with mocked APIs for separate histories, New chat, resume, header
  alignment, and return navigation. The screenshot was reviewed, and both the
  dev build and backend dry-run bundle succeeded.
- The broader control-plane test run has four failures in the unchanged review
  tests: their database mock lacks the `first()` method used by provenance reads.
- Regular dev forwards chat to shared `small-cp`. Following the user's deployment
  instruction, the required backend was published as
  `16596bcd-d8e3-4d0b-856e-0615d6147479`, preserving the live dashboard assets.
  Regular dev UI version `c903e040-3430-41fc-bf2d-e2265736aaa3` serves the new
  Learn bundle. Remote HTML checks confirmed both artifacts. AWS BYOC was untouched.

## Why we are building Coaching

The builder already explained choices and corrected their coding agent while
making the app. A colleague should be able to recover that judgment without
finding the builder or learning the repository first. The builder should also
be able to recover their own reasoning later.

Both people use Small's existing Coach Agent interface. Coaching connects what
was intended, what was deployed, and what happened when the app ran. Its core
questions are:

- What does this app do, and how should I use it?
- Why was it built this way? What alternatives were rejected?
- What happened in this run, and what should I try next?
- What depends on this choice, and what is still unknown?

An answer must distinguish a recorded reason, an observed result, and an
inference. A plausible explanation is not evidence of the builder's intention.

## What exists and what we have tested

| Area | Status | Specification and evidence |
| --- | --- | --- |
| Inspection UI | Sessions, Sources, Capture, and Decisions are sample views. Their contents do not feed Chat. Existing chat controls and evidence navigation are preserved. | [Views](#views), [shared presentation](#shared-presentation), and [release verification](#release-and-verification) below |
| Context experiment 1 | Completed: 30 questions comparing sources, session context, and extracted decisions. Five excerpts came from one real session, not five independent sessions. | [Protocol](coaching-benchmark.md), [measured results](../testing/coaching-benchmark-results.md) |
| Context experiment 2 | Completed: five distinct sessions, 30 questions, 60 answers. Decisions plus retrieval did not meet the declared success rule. | [Protocol](coaching-retrieval-benchmark.md), [measured results](../testing/coaching-retrieval-results.md) |
| Evaluation harness | Offline preparation, capture, answering, grading, and reporting exist. Subscription runs do not imply a production model integration. | [Harness and reproduction commands](../../tests/evals/coaching/README.md), [tests](../../tests/evals/coaching/test_bench.py) |
| Private AWS app/run chat | Enabled on dev and live with job definitions and run evidence. Real dev Bedrock answers, follow-up, and separate histories passed. It does not include builder sessions or design decisions. | [Bedrock chat specification and verification](byoc-bedrock-chat.md) |
| Private AWS dev | Separate installation with test apps and sample Coaching tabs. Future Amazon Coaching work is tested here before approved live promotion. | [Dev installation and deployment](byoc-dev.md) |

Experiment 2 scored **12/30 strict passes for Session and 11/30 for Decisions
plus retrieval**. Retrieval reduced answering input by 7.4%, but used 13.8%
more total input after extraction. Unsupported answers were judged in 7 cases
for Retrieval versus 4 for Session. JSON-format failures affected 27 of 60
answers. The separately labeled content diagnostic scored 22/30 and 21/30.
These are provisional automated judgments from related work in one repository.
They do not establish human usefulness or a production-ready retrieval design.

Implication: keep full visible session context as a measured baseline. Test
retrieval improvements against it; do not assume smaller context gives better
answers. Keep answer-format failures separate from factual quality while still
counting them against a declared strict result.

## Ideas from Glen

[Glen](https://www.tryglen.com/) advertises continuous capture from coding agents
and company tools, automatic context injection, a shared transcript library,
permission-aware recall, and explanations of why code exists. These are their
published claims; we have not tested their product or verified their agent-clone
mechanism. The lessons below are our proposed application of those ideas.

| Idea | Application to Small |
| --- | --- |
| Relevant context arrives automatically | Chat knows the selected app, deployment, and run. The user can inspect what was included without assembling the context manually. |
| Preserve the original evidence | Extracted decisions link back to the precise conversation and deployed source that support them. |
| Connect knowledge to the user's work | Explain a failed run using operational evidence, and explain design choices using the builder's recorded reasoning. |
| Carry knowledge forward | Associate decisions with versions and identify changed or unresolved anchors before reusing old reasoning. |
| Make knowledge shared and permissioned | Colleagues can use approved app knowledge only while they retain access to its supporting material. |
| Learn from questions | Unanswered questions and builder corrections can improve future answers, with explicit review and provenance. |

Our proposed focus is the app the colleague actually uses: its purpose, inputs,
versions, runs, and builder reasoning. Company-wide connectors, shared skills,
and session takeover are later possibilities, not prerequisites for this MVP.

## Proposed tasks

C01's first evidence manifest and six diagnostic questions are prepared below.
Production ingestion and Chat integration remain **not started**. Existing
preview components and benchmark code are reusable starting points. A checked
task should link to its implementation and verification evidence.

| ID | Task | Concrete result | Depends on |
| --- | --- | --- | --- |
| C01 | Define the first app and questions | One dev app, its actual builder session, matching source snapshot, and a frozen question set spanning purpose, usage, reasons, runs, and unknowns. | None |
| C02 | Define the data and permission boundary | Document what can be read, stored, shared, and sent to the selected model, including full visible sessions. Establish deletion and access-revocation behavior before ingestion. | C01 |
| C03 | Connect real Sessions and Sources | Authorized session messages and matching deployed files appear in the existing inspectors with stable IDs and version metadata. | C02 |
| C04 | Connect Capture and decision review | Extraction produces traceable candidates; validation catches unsupported reasons and missing code anchors. The builder can approve, correct, or discard a candidate. | C03 |
| C05 | Assemble context for each question | Select authorized evidence using the current app/run/version and question. Record exactly what the model received and what was omitted. Compare full-session and retrieval approaches. | C03; C04 for decision context |
| C06 | Connect that evidence to Chat | Answer through the existing composer, History, New Chat, and enlarged layout. Explain purpose, use, design, and observed behavior without inventing missing reasoning. | C05 |
| C07 | Open exact evidence from answers | Citation tags open the relevant message group, source lines, decision, or log entry in the shared inspector, with working Back and Minimize. | C03, C06 |
| C08 | Capture gaps and builder corrections | A user can mark an answer wrong or record an unanswered question. A reviewed correction becomes sourced knowledge; an unreviewed chat answer never becomes a fact automatically. | C04, C06 |
| C09 | Handle knowledge across deployments | Preserve historical reasoning, flag changed anchors, and link superseding decisions. Avoid using an old reason as an explanation of a different version. | C03, C04 |
| C10 | Evaluate and review the complete experience | Run the frozen benchmark, audit failures, and have a colleague try the dev app. Link the report and an explicit continue/revise decision here. | C01 for protocol; C06/C07 for end-to-end evaluation |

### C01-C03: real inputs and traceability

- Choose authorized Small development material for the first test. For Amazon
  material, use the private AWS dev installation and its permitted processing
  path; do not send it through shared Small services.
- Resolve the full-session storage and model-processing policy explicitly.
  The earlier local-only proposal and later full-context experiments are not
  interchangeable authorization for production ingestion.
- Preserve session and message IDs, speakers, ordering, timestamps when present,
  source hashes, and deployment/commit associations. Do not manufacture metadata
  missing from a session export or claim access to hidden model reasoning.
- Keep raw input inspection separate from normalized model input. Show redaction,
  omissions, and truncation so debugging explains what the model actually saw.
- Apply access checks before retrieval, answering, and opening citations. A
  citation must not reveal a session that the viewer cannot access.
- Define the import interaction before changing the UI. The removed Add session
  button should not silently reappear as part of backend work.

### C04-C05: useful memory and context

- Candidate decisions include the choice, alternatives, reason or explicit
  unknown, evidence, code anchor, constraints, dependencies, and revisit condition
  when recorded. Missing fields remain missing; extraction does not fill them by
  guessing.
- Keep design reasoning distinct from operational observations. A successful run
  demonstrates behavior, not why the builder originally chose the implementation.
- Full visible sessions, approved decisions, source snapshots, and run evidence
  have different roles. Chat history is conversation context, not an approved
  decision store.
- Preserve corrections and nearby conversation when retrieving. Conflicting
  statements should retain their order and provenance rather than being silently
  merged into a single confident answer.
- Use version and permission filtering before ranking. Record selected IDs,
  context size, omissions, and retrieval time for evaluation and inspection.
- On removal or revoked access, stop using the affected evidence and define how
  dependent answers, summaries, and caches are invalidated. Do not claim deletion
  regenerates every view until that behavior is implemented and tested.

### C06-C09: the colleague's experience

- From the app, explain declared behavior and recorded design reasoning. From a
  run, use that run's deployment and observations; do not silently substitute the
  latest deployment's source.
- Use compact evidence tags after supported claims. Reuse `SourcePreview`,
  `colorLine`, and `ExpandedPageFrame`; retain the existing chat controls and
  sidebar rather than introducing a separate Coaching page.
- Derive Continue exploring suggestions from the user's recent questions and
  stated goal. Prefer useful next questions such as which input to change or
  which recorded constraint matters, without assuming a goal they never stated.
- Show unknowns plainly. The MVP can report gaps in answers before adding the
  persistent gap-and-correction workflow in C08.
- Start version safety with exact deployment association and unresolved-anchor
  warnings. Automatic semantic supersession and dependency warnings in C09 need
  their own evidence and evaluation before being presented as reliable.
- Coaching initially explains and guides. Running jobs, editing code, approving
  grants, or deploying from chat would be a separate scope decision.

## Proposed MVP order and checklist

The first complete experience is: a colleague opens one dev app, asks what it
does, why it was built that way, and how to use it, then opens the supporting
evidence without leaving the normal app interface.

- [x] Prepare C01's app, source/session evidence manifest, and six diagnostic questions: [dev-word-count](#first-app-evidence-manifest-dev-word-count).
- [ ] Confirm C02's session-sharing and model-processing boundary before inference or ingestion.
- [ ] Freeze the C10 evaluation protocol before tuning the implementation.
- [ ] Establish a full-session baseline in the existing evaluation harness.
- [ ] Compare C05's proposed context strategy before adding production memory.
- [ ] Connect C03's real session and versioned source to the existing inspectors.
- [ ] Add C04's candidate extraction, validation, and review.
- [ ] Connect C06 using the measured context strategy.
- [ ] Complete C07's exact citations and dev review.
- [ ] Run C10, record failures and results, and decide the next iteration.
- [ ] After that slice is useful, consider persistent corrections (C08) and
  richer version/supersession handling (C09).

Basic permission enforcement, exact version association, and truthful unknowns
belong in the first slice. Richer memory automation can follow it.

## Next execution plan

This sequence makes the next deliverable concrete. Implementation remains
proposed; writing this plan does not activate ingestion, inference, or deployment.

1. **Prepare one real app's evidence (C01-C02).** Inventory the available dev
   apps and builder sessions, then select one with a verifiable source/version
   match. Prefer Small-owned development material for the first experiment.
   Produce an evidence manifest containing app and deployment identifiers,
   session/message references, source hashes, missing inputs, and the agreed
   processing boundary. Do not silently choose a session that merely mentions
   the app or use synthetic dialogue as its history.
2. **Freeze six diagnostic questions (C01/C10).** Cover purpose, use, one design
   choice, one rejected alternative, one operational observation, and one
   genuinely unknown reason. Record supporting evidence and forbidden claims
   before generating answers. These six questions are development diagnostics;
   they do not replace the separate 30-question held-out comparison.
3. **Measure a simple baseline, then one challenger (C05/C10).** Start with a
   fresh model given the complete permitted visible session and matching source.
   A proposed challenger is a fresh model with bounded, read-only tools to search
   and open the same eligible evidence. It may follow a citation or fetch nearby
   messages before answering. It cannot execute code, browse other projects,
   access scoring rubrics, or change the app. Freeze tool limits and total model
   budgets; count search calls and all intermediate tokens. Fix output-contract
   reliability on development cases before the held-out run. Keep failures in
   the results instead of silently retrying until they pass.
4. **Connect the selected approach to one dev app (C03-C07).** Show its real
   authorized inputs in Sessions/Sources and answer through the existing Chat.
   Connect Capture/Decisions when candidate extraction and review are implemented;
   keep preview fixtures visibly separate until then. Full-session answering must
   not depend on inventing or approving an unnecessary decision record. Evidence
   tags open exact source locations with the existing navigation and layouts.
5. **Check the complete flow (C10).** Test version matching, permission denial,
   missing/removed evidence, failed model requests, and citation destinations.
   Ask a colleague to complete a defined task using the dev app. Report this
   human trial separately from automated answer scores. Link the results here
   before deciding whether to promote or revise the feature.
6. **Add memory improvements only after the first useful flow (C08-C09).**
   Prioritize reviewed corrections and recurring gaps, then stale-decision and
   supersession handling. Defer company-wide connectors, automatic shared skills,
   and action-taking tools.

The first action is **step 1: identify the app, session, and matching source**.
Its deliverable is the evidence manifest and proposed six questions, not another
UI mockup or a new extraction architecture. App selection and any unresolved
data-processing choices must be settled before dependent implementation.

### What we mean by an agent with historical context

Glen's phrase "agent clone" does not establish a technical implementation.
For our experiment, use precise names: **full-session answering** and
**read-only evidence-search agent**. Both start fresh from recorded evidence;
neither copies a model's private state or recreates the original agent's mind.
Simply loading the original conversation is already the full-session baseline,
so renaming it a clone would not create a meaningful third comparison arm.

The search-agent challenger is a proposal to test whether fetching additional
evidence when needed improves on the earlier fixed BM25 selection. It is not a
claim about how Glen works or an assumption that agentic search is better.

## First app evidence manifest: dev-word-count

Prepared 2026-09-11 after the user approved the next evidence-preparation step.
This is a development diagnostic, not a completed model experiment.

| Field | Verified value |
| --- | --- |
| App | `dev-word-count` |
| Interface | [Private AWS dev app](https://dviorrcko52ft.cloudfront.net/apps/dev-word-count) |
| Workspace | `w-small-aws-dev` |
| Current deployment at verification | `d-1789112453520-696d4b54be60`, ready |
| Image digest | `sha256:02e428d46d128af23ede187e1b83012049454cbc6f7f80d3de3efeb19662d417` |
| Source archive SHA-256 | `ab51b208b3ed66c11d4290a761069208d0ed970ebdda582f65a56d501e0f7c00` |
| `job.py` SHA-256 | `13eec9043446be01edb0d5c03f56887aa3d774dedc0a6eb53061568c45c7adc8` |
| `small.toml` SHA-256 | `13dd91a7c969b0ff45916545e6791c603771e2312220397c41cea147236c5ed6` |
| Builder session | Codex `01a0782a-6ed1-7513-84da-e7e9ff746866` |
| Original private dev deployment | `d-1789107898516-5810db9c3213`; the current deployment is a later image-hardening rebuild |
| Current-version recorded run | `r-1789112779853-ed52e9f64414`, finished, exit 0, `report.json` listed |

The current source hashes were computed inside customer AWS and compared with
the local prepared app files. Both match byte for byte. The deployed `job.py`
also matches [the tracked word-count example](../../examples/byoc-word-count/job.py).
The example's tracked configuration uses `aws-word-count`; the deployed
configuration uses `dev-word-count`. Do not treat that name difference as a
byte-identical config match. The matching local configuration is under ignored
`.small/byoc-private/dev-test-apps/dev-word-count/small.toml`.

The session contains the actual command copying the existing example into the
private dev app, not just a later mention of its name. It is a long mixed-work
session: dev setup and later image hardening are separate episodes within it.
Neither a single app-only conversation nor a complete original algorithm-design
discussion has been established. This makes it useful for wiring and unknowns,
but insufficient by itself to validate rich design-reasoning capture.

### Evidence references

The operator-local transcript is
`~/.codex/sessions/2026/09/06/rollout-2026-09-06T12-20-42-01a0782a-6ed1-7513-84da-e7e9ff746866.jsonl`.
Line numbers below refer to original `response_item` records, not duplicate
event notifications, compaction summaries, or this later planning discussion.
They are source locations, not native message UUIDs. The transcript is not
copied into this repository or sent to a model by this preparation step.

| ID | Location | What it establishes |
| --- | --- | --- |
| E1 | Matching `job.py`, lines 5-10 | Whitespace splitting, total count, lowercase distinct count, JSON output, and stdout. |
| E2 | Matching deployed `small.toml`, lines 1-12 | App name, Python entry, AWS job type, required text input/default, and report declaration. |
| E3 | Session line 16702, assistant, 2026-09-11 05:55:59 UTC | Explicit alternatives: use existing apps/data or separate test apps/data; using existing data would execute real jobs. |
| E4 | Session line 16709, user, 2026-09-11 05:58:47 UTC | User chose separate dev test apps while live keeps drift, oof, and overreach. |
| E5 | Session line 16940, tool call `call_7NJ9sd2AnKQTUJmOivTUFZPN` | Prepared `dev-word-count` by copying the existing `byoc-word-count` example. |
| E6 | Session line 17635, tool call `call_6BGcozDdK6VXicmIYVE1Wsot` | Requested the later word-count rebuild; a tool request alone does not prove build success. |
| E7 | `.small/byoc-private/image-proof/dev-verified.json` | Saved rollout verification associates the rebuilt version with a finished run and a listed `report.json`; not a fresh run during this preparation. |
| E8 | AWS metadata/hash comparison performed during this preparation | Confirms the current deployment and its source bytes; source stayed in AWS during this remote check. |

Original record SHA-256 values, hashing UTF-8 JSONL text without its line ending:
E3 `a56f310aeeea92870c1ba60ec9579761525ea7fd0bcd594f04362d13f92da449`;
E4 `2b0ba54fa1e775daf341b7878ae2dfeed109571acab2665b124c3ff74800db2d`;
E5 `0d5a3158eac10f699d22cd262af5fb99fe16b42939e3ce92db16edde28f395b4`.
E7's file SHA-256 is
`c3cc13ac11e98ea49a89c2a06d550b70f5cf365554e06c83980f3f6e8f786262`.
These hashes identify evidence; they do not make the transcript tamper-proof or
turn reported outcomes into independent execution tests.

### Six diagnostic questions and expected evidence

These questions and expected criteria are prepared before any new answers.
They may be used to debug the harness; keep them out of the later held-out score.

| ID | Question | Expected answer and evidence | Claims to reject |
| --- | --- | --- | --- |
| D1: purpose | What does this app do, and what result do I get? | Counts whitespace-separated words and case-insensitive unique tokens; writes `report.json` containing `word_count` and `unique_words`. E1/E2. | Semantic language analysis, punctuation normalization, or external text-service calls. |
| D2: use | What should I enter, and what should `Small small dev works` return? | Enter it in the Text input. Source predicts 4 words and 3 unique words; use Run, then inspect the report. E1/E2. This is a source-derived prediction, not a newly executed result. | Claiming this exact input was run in this preparation, or confusing total count with unique count. |
| D3: design | Why is this test app in a separate dev installation? | The user wanted separate test apps while live retained the business apps. E3/E4/E5. This is the environment decision, not a reason for the counting algorithm. | A claim that word counting technically requires a dedicated AWS account or installation. |
| D4: alternative | Could we have tested against the live apps and their data instead? Why did we choose otherwise? | The assistant offered shared existing apps/data versus separate test apps/data; the user selected separation. Cite E3/E4 and explain the stated real-job execution consequence. | Invented cost, latency, or regulatory studies; claiming the user explained more than their recorded choice. |
| D5: operations | Was this deployed version ever run successfully, and what does the evidence actually prove? | E7 records the specified run finished with exit 0 and `report.json` listed; E8 identifies the matching current deployment. It proves that recorded sample run, not arbitrary inputs, load performance, or today's browser login. | Mixing the original deployment's run with the rebuilt deployment, claiming a fresh run, or treating file existence as proof every result field is correct. |
| D6: unknown | Why use `split()` and lowercase tokens instead of a tokenizer? Was accuracy benchmarked? | E1 shows the implementation. The selected build episode does not record a tokenizer comparison or accuracy benchmark. Say the reason is unknown in this evidence. | Presenting simplicity, speed, or benchmark superiority as the builder's recorded rationale. |

Remaining boundary decisions: which visible session episodes may enter model
context and who may inspect/share them. Bedrock's US model routing was separately
approved for app/run chat; that does not settle builder-session ingestion. The whole
mixed session is not implicitly eligible because one app was selected. Candidate
selection and local inspection are complete; inference, production ingestion,
new UI controls, and deployment were not performed. No secrets, raw customer
job data, hidden reasoning, or retrospective planning messages should be added
to the evaluation evidence without a separate, applicable authorization.

## Next evaluation proposal

Reuse the five-session, 30-question structure, with fresh held-out questions for
claims about improvement. Keep the existing experiments as historical baselines;
do not silently revise their frozen questions or reinterpret their scores.

Compare the same model, evidence eligibility, answer instructions, and output
budget across full-session context and the proposed retrieval strategy. Report
extraction cost separately and included in total usage. For subscription-based
experiments, keep the user's existing subscription preference; production BYOC
inference uses the customer's configured provider, not a personal subscription.

| Measure | What to record |
| --- | --- |
| Answer quality | Required criteria covered, unsupported claims, correct treatment of unknowns, and strict pass count with a fixed denominator. |
| Evidence quality | Citations that resolve, citations that support the claim, omitted decisive corrections, and version mismatches. |
| Output reliability | Format failures, timeouts, and incomplete answers, separately from factual quality. |
| Access and removal | Cross-app/user access denial and inability to retrieve removed evidence. These need deterministic tests, not an LLM judge. |
| Efficiency | Serving and extraction tokens, retrieval time, and end-to-end answer latency. |
| Human usefulness | Whether a colleague completes a defined app task correctly, time needed, and interruptions to the builder. Report separately from model scores. |

Proposed selection rule: a retrieval approach must match or improve strict
quality without increasing unsupported answers before token savings justify
choosing it. No unauthorized evidence or fabricated citation is acceptable in
the deterministic access/citation tests. A small pilot is a decision aid, not
proof of general reliability. Report both wins and failures and agree on any
numeric release thresholds before running the experiment.

Open decisions before implementation: the first app and session, permitted
full-session handling, model and inference region, session import interaction,
who can review knowledge, and the exact evaluation thresholds. None requires
changing the current UI just to review this brainstorm.

## Views

| Tab | Current behavior |
| --- | --- |
| Chat | Original AskPanel: real chat, History, New Chat, attachments, model/source controls, and Open as page. Opens by default and stays mounted while switching preview tabs. |
| Sessions | Full sample coding-agent conversations, including user messages, tool calls, and results. Each User message starts a container containing the subsequent agent and tool messages, with alternating gray and blue backgrounds. Search and filter by speaker. |
| Sources | Sample deployed code, documents, configuration, logs, and access information. Code uses the existing shared syntax highlighter. |
| Capture | Five sample processing stages with readable conversation/code previews, a redaction comparison, prompt sections, candidate decision cards, and validation checks. Original data remains inspectable. |
| Decisions | Sample choices, reasons, alternatives, constraints, evidence, code anchors, gaps, and review status. |

The four inspection tabs show **Sample data / UI only**. They do not import
sessions, run extraction, call models, save decisions, or change approvals.
Their controls only navigate and inspect the handwritten fixtures.
Sessions has no **Add session** button; importing is not connected in this preview.

The [private AWS Bedrock chat](byoc-bedrock-chat.md) uses the same Agent chat UI,
History, New Chat, and enlarged page. Its context is the app's job definition and
recent run evidence. Private app chat and Logs run chat have separate histories;
the four sample inspection tabs do not feed either model call. Private AWS
chat is enabled on private dev and live with the approved US Bedrock profile.

Capture keeps the existing five-step list and inspector. Each step's **Contents**
view presents its sample input or output in a readable format:

- **Read inputs:** conversation excerpts with a link to the full session, and
  complete source files with line numbers and syntax highlighting.
- **Normalize and redact:** preserved message IDs/speakers and a highlighted
  before/after comparison. The redaction example is explicitly a separate
  illustration; the sample conversation contains no secrets to remove.
  The message count is a compact, muted line with its explanation on hover;
  status metadata should not compete with the contents for space.
- **Build model input:** extraction instructions followed by the included
  conversation and source context.
- **Model response:** decision cards with the reason, alternatives, evidence,
  code anchor, and links to the existing conversation/source/decision inspectors.
- **Validate candidates:** sample counts, passed checks, and a decision awaiting
  builder review. These are fixture results, not executed validation.

**Original** retains each step's full sample data and **Metadata** retains its
processing flags. Nested evidence links use the existing Back navigation.
Resize, enlarge, breadcrumbs, and Minimize keep the shared inspector layout.

The inspector's **Metadata** tab shows the selected input's source, type, name,
usage, version, message count, and processing flags. These currently describe
the sample data; real ingestion is not connected.

Conversation message IDs (for example, `m1`, `m4`, and `m7` for the first sample's
User messages) are unique within their session. IDs and timestamps remain visible.
Turn containers keep their original boundaries and colors when search or speaker
filters hide messages. Messages preceding the first User ask form a separate group.

Preserve the existing chat composer, History, New Chat, and navigation when
extending this UI. Adding a view does not authorize removing an existing control.

## Shared presentation

- Answer source footers render as evidence tags. File and run tags open the
  existing source and run views; unfamiliar references stay visible as text.
- Inspectors and evidence panels expand beside the sidebar. Breadcrumbs remain
  visible, and Minimize restores the preceding panel size. Escape first minimizes
  an expanded panel, then closes the normal panel.
- `ExpandedPageFrame` in `packages/web/src/ui.jsx` supplies the existing chat
  page dimensions: 780px maximum content width and 24px padding. Chat and expanded
  inspectors use this same frame.
- `colorLine` in `packages/web/src/code.jsx` is the existing tokenizer shared by
  chat code blocks, file previews, and sample deployed source.
- `SourcePreview` in `packages/web/src/coaching/SourcePreview.jsx` shares the
  complete source viewer between Sources and Capture, including file selection,
  line numbers, anchor highlighting, and syntax colors.
- The enlarged chat page has a Minimize button returning to the app's Agent tab.
- Each sidebar app menu includes Share. It opens that app and its existing
  sharing popover, preserving editor controls and the viewer's read-only view.

## Environments

| URL | Behavior |
| --- | --- |
| https://small-cp.zeroshothq.workers.dev/apps | Existing Agent chat; the four inspection tabs are disabled. |
| https://small-cp-dev.zeroshothq.workers.dev/apps | All five tabs; the four inspection tabs contain sample data. |

Sign in on dev using the same work email used on live. Each host has its own
browser session. For example, Amazon apps require the Amazon login identity.

Dev serves a separate frontend for the existing app experience.
`packages/web/dev-worker.js` serves its own HTML and static assets, and forwards
authentication and existing app requests to `small-cp` through a service binding.
Existing chat and app actions use real shared data and the existing permissions.
The [AWS BYOC preview](byoc-aws.md) additionally handles `/api/byoc/*` with its own
connection-only D1 database and scoped AWS installer credentials. Customer job
data goes directly to AWS. Connected jobs appear in the existing Apps list and
sidebar and reuse the normal app Run and Logs views. Setup is inside Settings →
Connections. AWS Coaching is deferred; native apps retain the existing Agent UI.
This does not change the shared app database or add scheduled jobs.

The `VITE_COACHING_DEV=true` build flag enables the sample tabs. Default builds
leave them disabled. Keep them in dev until the user approves promotion to live.

## Deploy dev

For **customer-hosted AWS**, use the [private AWS dev deployment](byoc-dev.md#build-and-deploy).
It has its own test apps and data. The Cloudflare steps below apply to shared
Small dev and must not be used to host Amazon app data or credentials.

Every requested UI addition or change includes a dev build and deployment for
the user's visual review. Complete these steps before reporting the UI change
as done, then provide its dev page link. This applies even when the same request
also asks for a commit and push. A separate deployment request is unnecessary.

From `packages/web`, in PowerShell:

```powershell
$env:VITE_COACHING_DEV = 'true'
$env:VITE_BYOC_DEV = 'true'
$env:VITE_TLDRAW_LICENSE_KEY = node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('../../.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);"
if ($LASTEXITCODE -ne 0) { throw 'Cannot build dev without the tldraw license' }
npm run build -- --outDir dist-dev
Remove-Item Env:VITE_COACHING_DEV
Remove-Item Env:VITE_BYOC_DEV
Remove-Item Env:VITE_TLDRAW_LICENSE_KEY
npx wrangler deploy --config wrangler.dev.jsonc
```

Stop if the build fails. The separate `dist-dev` output leaves the live `dist`
artifact untouched. `wrangler.dev.jsonc` deploys only `small-cp-dev`; live deploys
continue using the existing control-plane configuration.
Keep both flags enabled for the dev build so a Coaching UI deployment also
preserves the approved AWS app integration. Default builds disable both previews.

## Release and verification

Private dev `0.1.0-dev.3` and live `0.1.0-pilot.6.2` enable the existing Logs and
Agent chat composers. Both reached `UPDATE_COMPLETE`; nine dev and eight live
browser scenarios passed. A real Bedrock answer used the synthetic dev run's
counts, a follow-up retained context, and app/run histories remained separate.
The live catalog advertises chat on drift, oof, and overreach. See
[activation evidence](byoc-bedrock-chat.md#activation-evidence-2026-09-11).
This activates operational chat, not session extraction or the proposed Coaching
evidence-search experiment. The entries below retain earlier release history.

Shared dev version `859bb0e8-a938-411f-8a81-a4ee5f5a4db3` preserves both preview
flags with private mode off. The new [private AWS dev installation](byoc-dev.md)
enables the same sample inspection tabs in its existing Agent tab, including when
Bedrock is not configured. Its separate build displays a DEV badge. Nine private
browser scenarios passed; no private AWS data or login is routed through shared dev.

Dev version `9e5b5eb6-1c72-40bc-9895-4266c3b4c251` adds the shared UI wiring for
[private AWS Agent chat with Bedrock](byoc-bedrock-chat.md). App chat keeps the
existing History, New Chat, source picker, Open as page, and Minimize chat.
Both preview flags remain enabled; private mode stays off on shared dev.
135 Python BYOC tests, 10 private template tests, and all eight private browser
scenarios passed. Independent review found no blocker. Private release
`0.1.0-pilot.6.1` was packaged locally; Amazon deployment and actual inference
then awaited the region choice. The shared dev deployment does not enable
Bedrock for hosted apps or send Amazon evidence through Cloudflare.

Dev version `f20958cd-0f09-431e-96ff-8a411b2ce2dc` includes the shared components
for [private AWS Logs chat with Bedrock](byoc-bedrock-chat.md). Existing hosted
chat remains available; private run chat is enabled by the AWS installation's
capability response. Both dev preview flags remain enabled and private mode is
off on shared dev. The private browser flow covers answers, follow-ups, History,
New Chat, enlarged runs, and switching runs without retaining the previous chat.
At that stage the Amazon update and real Bedrock answer awaited the region choice;
the later activation is recorded above.

Dev version `91767f6b-a02e-479a-b1dd-648689c68c23` reduces the normalization
status banner to one muted line, with the explanation on hover. The contents
retain their space and existing behavior. The dev build, focused Capture browser
check, and screenshot review passed; both preview flags remain enabled.

Dev version `336c2a48-facc-4db7-a356-4b641f30fde9` publishes the readable
Capture views and removes the disabled **Add session** button from Sessions.
The dev build and all five isolated browser scenarios passed, including evidence
navigation, preserved chat controls, and responsive inspector behavior. The
decision cards and redaction comparison were also reviewed in browser screenshots.
Both preview flags remain enabled; private mode is off. No production or private
AWS deployment was made for this UI change.

The Capture browser check uses the existing app route with synthetic API reads;
it blocks external requests and fails on unexpected requests, including writes
or model calls. After building dev with both preview flags, run from `packages/web`:

```powershell
npx playwright test --config playwright.coaching.config.js
```

It covers the five readable steps, Original/Metadata, evidence navigation,
existing Chat controls, and inspector resizing/enlarge/minimize at 320, 768,
1024, and 1440px. This is an isolated UI check, not a capture/extraction benchmark.

Dev version `38d10e97-19a5-42a9-971f-12f927ec99d2` publishes the shared UI
after adding S3 approval to the separate private AWS installation. Both preview
flags remain enabled and private mode is off on shared dev. Existing connection
controls and the hidden-when-idle S3 panel are preserved. The private AWS build
reuses that Settings panel and identifies its installed account; it is packaged
as `0.1.0-pilot.4`. See [the private S3 proof](byoc-aws.md#private-installation-s3-approval-milestone).
Both builds, the private Settings browser scenario, focused CLI/template/API
checks, and all 31 repository unit tests passed.

Dev version `c402091f-e052-4175-a82f-863378d01ce3` removes the static S3
approved-folder list from AWS connection settings. The section stays hidden
when idle; upgrade, approval, cancellation, and status/error UI remain.
The dev build and all 31 `make test-unit` checks passed. Both preview flags
remain enabled, private mode is off, and the Apps **Type** label is retained.

Dev version `9aee52fd-39da-46b3-9556-6376e743a01c` includes the Apps table
column rename from **Kind** to **Type**, including in `test-ws`. The build succeeded with
both preview flags enabled and private mode disabled. No production promotion.
The label was first deployed as `e4f1e091-4b47-47b7-8e6d-3c99fb4104da`;
this final build also contains the private AWS adapter fix, inactive on shared dev.

Dev version `aeff9ac6-03f3-4bd1-8ed9-f43bfd2ad732` publishes the shared components
for [configurable private AWS grants and uploads](byoc-aws-grants.md). Both
preview flags remain enabled and private mode remains off in shared dev. The
existing Settings approval and Run form are reused; private Cognito traffic
stays on the AWS installation. Six private browser scenarios and both builds
passed. No live Cloudflare promotion.

Dev version `57a96323-3d5f-4a67-b309-360991af744f` publishes the shared UI after
adding the [private Cognito installation mode](byoc-aws.md#private-installation-first-dashboard-milestone).
Both existing preview flags remain enabled; private mode is disabled on this
Cloudflare site, so its login/app flows remain hosted. The Amazon pilot has a
separate AWS URL and sends no Cognito sessions or workspace data to this preview.
The two web builds and focused adapter/auth tests pass. No production promotion.

Dev version `37a0ce41-779c-460a-96b9-655c5849e046` adds **Approve & deploy** and
**Cancel** inside the existing AWS connection settings. Older connections show
a one-time AWS upgrade; new requests appear while Settings stays open. The
`aws-s3-approval` sample app passed the real browser/CLI approval, CSV run, and
denied-folder proof. Both preview flags and prior UI remain intact. Details:
[AWS approval verification](byoc-aws.md#verification). No production or npm release.

Dev version `d1ee690c-1021-40f7-b184-e7a7ac802ce5` adds the
[S3 permission flow](byoc-aws.md#s3-access-acceptance) within the existing AWS
connection settings. Both preview flags stay enabled. The live sample app
`aws-s3-report` uses the shared sidebar, Run form, logs, and output download;
the browser proof passed. Coaching tabs and the existing connection controls
remain intact. No production UI or npm release was made.

The initial dev deployment on 2026-09-08 is version
`0d271549-04c1-4f73-b7fb-a42dbe24a7ec`. Its build succeeded and Wrangler confirmed
deployment. The user reviewed the dev app and approved committing the work.
The original deployment composed the approved UI with main `49c2a3d`; this change
brings that source and the deployment configuration onto main.

<!-- ponytail: browser and test-suite checks were skipped for the initial deployment at the user's request; commit verification is recorded below. -->

Before committing to main, `make test-unit` passed all 31 tests and
`npm run build` succeeded with the inspection flag off. The build reports the
existing large-chunk warnings. The sidebar Share shortcut was reviewed against
the existing navigation and sharing permission flow; no live shares were changed.

Commit `1270e70`, including the sidebar Share shortcut, was subsequently built
with the dev flag enabled and deployed as dev version
`8faca65f-b420-469d-a550-1282711d3afd`. Wrangler confirmed the deployment.

Conversation turn containers were built with the dev flag enabled and deployed
as dev version `52a64522-b2c2-497b-a02c-d6064bc1c209`. The build succeeded;
Wrangler confirmed deployment. Visual review is left to the user as requested.

The Details-to-Metadata label change was built successfully and deployed to dev
as version `09d5d4d3-4d03-4e8e-9b84-80a0f16a1d00`.

The AWS app integration was built with both dev flags and deployed as version
`f8d1a5fd-8465-438f-9c0c-e001b4003357`. The CPU job is available at
`/apps/aws-cpu-proof`; `/aws` redirects to Apps. AWS setup uses the existing
Settings → Connections flow.
The browser check exercised the shared AWS Run/Logs views and verified that a
native app still shows Chat, Sessions, Sources, Capture, and Decisions without
JavaScript page errors.

The AWS privacy tooltip and shared Settings row alignment were built with both
dev flags and deployed as version `6b6cbb42-be11-4d88-af03-9f1e7193ea1a`.
The existing tooltip helper now also opens when a contained control has focus.
Build and whitespace checks passed. The browser check could not launch because
Windows denied process creation; hover/focus and alignment remain for visual review.

The AWS **Connected** action and **Disconnect / Cancel** confirmation modal were
built and deployed as version `b752de5f-9b29-4506-a4a4-f76533ac79d9`. A subsequent
browser check passed for alignment, tooltip hover/focus, Cancel, confirmed
disconnect, and reconnect. Connection writes were stubbed during that check;
the real AWS app remains connected. Eight connection API tests and four web
adapter tests passed.

The multiple-app AWS release was built with both dev flags and deployed as
version `0b7d2218-1191-4edd-88b0-4bad5ba390f9`. One workspace connection now serves
`aws-cpu-proof` and `aws-word-count` in the normal sidebar and Run/Logs UI.
The browser proof verified the second app's actual run and output, preserved
the original app's output, and rejected record IDs used under the wrong app.
The five Coaching tabs and their dev-only inspection behavior are unchanged.

The customer AWS account setup was built with both dev flags and deployed as
version `4b948ace-3d68-43f2-b7f0-d4cdb19e6c28`. Settings → Connections → AWS accepts
a customer account ID and explains approval in AWS followed by verification in
Small. Browser checks passed for the simulated onboarding flow and the existing
connection controls; real reads confirmed both AWS apps still work. A live
installation in a second account remains for its account owner to approve.

Dev version `1a89d7d0-e42a-4cd5-8538-50e24fe12c42` removes the duplicate AWS
installation link. One button opens AWS, with a current-tab fallback when popups
are blocked. Both dev flags were enabled; build and focused browser checks passed.

The CLI workspace follow-up required a separately approved authentication fix in
the shared backend. `small-cp` version `2323101b-89d0-4691-917a-6c567debbd4d`
resolves CLI workspace membership through the existing browser resolver. The
deployment preserved the live frontend assets: no changed assets uploaded, and
all 133 files matched afterward. Dev remains on the version above; AWS/Coaching
preview UI and the updated CLI/skill remain dev-only, with npm publication held.

Dev version `f765560a-87ef-4dbd-a242-175976948644` adds the shared run-log
controls: copy the complete run ID or copy an authenticated run link beside Open
as page. The production build and live worker remain unchanged.

Dev version `958c27d7-8e95-487e-9f9d-600afbe5652d` moves the run-ID and log-link
copy confirmations directly beneath the clicked icons. The shared live worker
was subsequently promoted with explicit approval as version
`ccf915cc-64fa-4236-b06c-eb497e96ecb8`; live `/apps` served the updated
bundle and anonymous `/api/apps` remained `401`.

Dev version `505b90ef-b645-48e6-a298-1879edf70eaf` places the run-ID copy
icon inside the Run pill in the Logs side panel. The focused private browser
test verified the icon's placement and copy behavior. Live was not promoted.

Dev version `59d322b8-5ee5-4861-8f2f-e3ae1c24a112` adds the empty Learn tab
alongside Agent. Both dev builds succeeded, and the existing private dev-tab
browser smoke check passed. The private AWS dashboard is `0.1.0-dev.14`.

Regular Small dev `3894304d-f05e-406f-9dc6-dfbfb5ff9dde` opens Learn in the
shared enlarged layout with app chat on the right. A focused browser test with
mocked APIs verified app-scoped sending, saved-thread reuse, breadcrumbs,
Minimize, direct linking, and Back/Forward. The layout screenshot was reviewed.
No BYOC or live deployment was made for this step.


### Visual explanation review implementation

Dev `841b7d27-8647-4e55-8479-f71926147aba` reveals explanation content section by section. Shapes are measured while transparent, then each section's source arrow appears before its text; diagram edges appear immediately before the destination node is written. Backward edges wait until their nodes exist, citations appear after their section's writing, and future sections remain hidden. Reduced-motion completion and cleanup are preserved. A deployed browser check sampled animation frames and verified first arrow -> first destination text -> second arrow -> second destination text, with no model calls. Evidence: `.small/learn-sequential-writing-check.json`.

Real verification: the YOLO request returned an approved plan after one review with all four checks true. Figure 1 (page 1) and Figure 2 (page 2) were rendered off-screen and supplied as crop pixels. The original browser assertion chose a hidden tldraw hyperlink control; a corrected visual replay of that exact approved result verified rendering without another model call. Evidence: `.small/learn-review-check.json` (real model events), `.small/learn-rendered-review-check.json` (visual replay), and `.small/learn-reviewed-canvas.png`. Earlier attempts exposed a missing planning field and a mixed-page citation; those failures were not reported as successful runs.

Rendered figure previews: before each factual review of a paper-figure plan, the dev server returns a draft preview request rather than permission to draw. The browser uses the existing PDF.js crop renderer off-screen and submits bounded PNG previews. The evaluator receives each crop's pixels and the original PDF; the revision receives them too. A revised figure must be rendered again before review 2. The final canvas reuses the reviewed pixels. Text-only explanations retain the existing flow. This adds no extra evaluator passes.

Continuation state is signed using the dev-only `LEARN_PREVIEW_SECRET`, bound to the app, workspace and authenticated user, and expires after ten minutes. Requests recheck app access, reject altered state, validate PNG signatures/dimensions and payload size, and preserve review/format-correction budgets across requests. Previews are supplied by the authorized browser; they are not cryptographically attested screenshots and are treated as untrusted evidence. No raw user sessions are part of this flow.

30 focused tests cover continuation tampering, identity/app/expiry, preview bounds, original PDF plus crop pixels reaching review, fresh previews after revision, correction limits and output truncation. Truncated model output is identified by `stop_reason=max_tokens`; its single format correction receives a larger bounded output allowance instead of repeating the same insufficient limit. Each paper-derived block must stay on its one cited page; claims from another page need their own block.

Dev `97905ddd-bc46-4e5e-8bd2-e823d1a1ae1f` adds schema-path validation feedback and at most one format correction across the entire explanation request. The generator receives the failed field and constraint; it must return a complete valid replacement. This applies to teaching plans, initial canvas drafts, and revised drafts, sharing one correction budget. Factual review remains separate with its existing two-review maximum. Validation logs contain paths and limits rather than learner content.

Verification: 26 focused tests passed, including exact feedback, the shared correction budget, failed-repair rejection, and factual review after repair. A real deployed YOLO canvas request exercised the repair: `canvas.blocks[1].nodes[2].label` contained 68 characters against a maximum of 60; the corrected plan reached review 2/2. The final review rejected the Figure 2 crop, so no plan was rendered. Chat citation -> PDF reader with visible composer passed. Thus format repair is demonstrated, but complete canvas success is not. Evidence: `.small/learn-review-check.json` and `.small/learn-review-check.log`. The remaining crop-review limitation is that the evaluator sees a PDF plus coordinates, not the actual rendered crop; its geometric judgments are not deterministic measurements.

The evaluator checks relevance, factual support, correspondence between assets
and annotations, and clarity. It receives original photos and paper PDFs plus
structured drawing instructions, renderer dimensions, and browser-rendered paper
figure crops. It does not see a screenshot of the entire final canvas; whole-board
layout review remains a possible later increment.

arXiv uses its public Atom metadata API and PDF URLs, without an API key.
Metadata requests are cached and spaced within each dev worker isolate; this
MVP is on-demand access, not a bulk ingestion service. PDF transport checks app
access and only accepts validated arXiv IDs. Model paper citations must resolve
to papers actually read during this request. Figures render locally from the
cited page; excerpts/pseudocode remain display content, not executed code.

References: [arXiv API](https://info.arxiv.org/help/api/user-manual.html),
[Claude PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support),
[PDF.js](https://mozilla.github.io/pdf.js/examples/).


### Paper references and reading panel (dev)

Current dev `f94223af-e7d7-4652-8c38-8e53da7b2255`: the paper toolbar places zoom minus/percentage/plus and Ask about selection before the next-page `>` icon. Zoom ranges from 50% to 300%, rerenders PDF pixels for clarity, and preserves the composer. Ask about selection uses a crosshair and red rectangle on the PDF. Selection coordinates are normalized to the page, so zoom does not change their meaning. A cropped thumbnail with a bold red rectangle appears in the existing removable image attachment UI. Removing it or changing pages clears the region. Sending supplies the cropped PNG, page coordinates, and actual PDF to the tutor; the selection image is treated as evidence, not instructions.

Verification: 42 focused tests passed. Deployed browser checks verified toolbar order, zoom sizing, rectangle selection, red thumbnail pixels, removal, stale-region clearing on page change, and the composer staying visible. One real selected-region question correctly identified the YOLO paper's title from the red rectangle on page 1. Evidence: `.small/learn-paper-selection-check.json`, `.small/learn-paper-selection.png`.

Dev `e5594a20-a16e-4667-a248-5786ca6d7417` routes arXiv chat pills through the same paper reader as canvas citations. It accepts validated arXiv PDF/abstract paths, retains page fragments, and leaves the reader's explicit Open original PDF action available. A deployed browser check opened and rendered PDF page pixels, verified the composer remained visible, and confirmed no new browser tab appeared.

The generator now distinguishes source captions, labels, and body claims instead of merging their meanings. Its one revision receives a fresh correction request with the rejected plan, every review finding, original PDFs, inspected photos, and lesson context; the previous chat answer is not repeated as authority. This is general source-grounding guidance, not a YOLO-specific exception. The two-review limit and rejection guard remain. 23 focused tests passed. The single real canvas verification failed earlier with `Invalid teaching plan`, so a successful factual revision has not been demonstrated. Evidence: `.small/learn-review-check.json`, `.small/learn-chat-paper-reader.png`. No further paid retry was run for this check.

Dev `718a0b5f-e47f-42cc-a8c1-d1f4ae84b039` removes the `Papers read:` label from chat presentation, retaining the clickable paper pills. The deployed browser replay confirmed the label is absent and the pill remains; no model calls were made for this check.

Dev `d34de8a1-452c-4f18-b258-5f6f1d0c56d5` shares `EvidencePill` between source tokens and Markdown links: neutral text, border, and file icon instead of blue underlined links. Markdown heading markers render as actual headings. A deployed browser replay verified `Step 1 — Resize` as a heading and the paper link with a 1px border, icon, neutral color, and no underline. The initial verification script incorrectly retained the live harness because of CRLF matching, causing an unintended paid chat request and starting canvas generation; it was interrupted and the corrected replay passed without model calls. Plain page/section references such as `(p. 4, §2.4)` are not changed yet, pending clarification about their click behavior.

arXiv citations beneath canvas assets open the cited PDF page in the existing Learn right panel. The chat composer stays visible. Opening a paper attaches its ID/page as question context, shown in a removable chip; sending a question returns the panel to chat while retaining the paper for follow-ups. New chat clears it. The panel also links to the original PDF in a new tab.

The API checks app access before retrieving a paper and supplies the actual PDF to the tutor. Paper questions cannot propose app actions. Paper metadata in model output is resolved against retrieved arXiv records; untrusted external URLs are rejected. The PDF reader uses an authenticated fetch and PDF.js page rendering, with previous/next controls and cleanup on close. Changing pages updates the page attached to chat.

Verification: 37 focused tests and five browser tests passed, covering paper context validation, app access, review limits, PDF transport, citations opening the reader with the composer visible, actual PDF crop rendering, fixed canvas height, automatic following, and selection behavior.

Real model checks: the photo explanation passed after one revision. The original YOLO paper was retrieved successfully (1506.02640v5); the figure explanation was rejected after the second review for uncertain crop placement and was not rendered. This is a fail-closed result, not evidence that figure extraction is reliably accurate. Evaluation sees the PDF and drawing plan, not a screenshot of the final canvas.

Deployed to regular Cloudflare dev: `50c9c0c8-635c-4689-8ce6-425097c82895`. Live and private AWS installations were not deployed.


### Subscription-only dev connection

Current override (2026-09-16): after the tunnel connectivity failure, the user explicitly authorized restoring the paid Claude API for regular dev Learn. `SUBSCRIPTION_ONLY=false` was deployed as `dcb8b3ac-134f-447a-afe0-ee44be874003`. The unused loopback subscription bridge was stopped. This overrides the subscription-only status below for regular dev; live and BYOC were not changed.

Verification of the API restoration: 22 focused tests passed. The real browser flow on yolo-s3-job retrieved arXiv:1506.02640v5 and returned a chat answer. Explain on canvas then failed validation with `Invalid canvas block or object reference`; the reader and follow-up checks were not reached. Evidence is in the local `.small/learn-research-real.json` and `.small/learn-research-error.png`. This is not a passing canvas test. No additional paid retries were run. The generated chat also conflated parts of YOLOv1's confidence/box representation with YOLOv8 despite stating their architectures differ; retrieval success does not establish answer accuracy.

The user's standing requirement is subscription-only model usage, with no paid API or cloud fallback. AGENTS.md records this rule. The native Claude Code login was verified as `claude.ai`, first-party, Max. The adapter strips API/provider overrides, starts Claude Code with safe mode and no native tools or session persistence, and checks subscription authentication before each request. A minimal answer and the actual YOLO PDF (Figure 1 labels) were verified through the native CLI.

`SUBSCRIPTION_ONLY=true` routes Learn chat, canvas generation, and reviews exclusively through `subscription-transport.js`. Missing bridge credentials, an offline bridge, or an unverified billing marker fails closed. Other dev generation paths that are not connected are blocked instead of proxying paid inference. Live and BYOC configuration remain unchanged. The personal bridge is limited to the configured subscription owner's authenticated dev requests.

Local service: `scripts/learn-subscription-bridge.mjs`, loopback port 8789, bearer authentication, one concurrent request, bounded request/asset sizes. It accepts only application tool decisions and text from Claude Code; native tools are disabled. Public PDF/image assets are validated and supplied as bytes to Claude Code. Credentials remain local. The hosted dev worker requires a protected HTTPS connection to this service.

Status: local subscription checks passed; hosted connection is NOT active. After the initial automatic approval rejection, the user explicitly approved starting the background bridge and authenticated public Cloudflare tunnel. The bridge now runs on loopback; its authenticated health check returned HTTP 200 with provider `claude-subscription` and plan `max`. Cloudflared exited because this computer's configured DNS returns NXDOMAIN for `api.trycloudflare.com` and `region1.v2.argotunnel.com`. No DNS, hosts, firewall, or proxy settings were changed. The hosted worker has no bridge URL/token installed yet and continues to fail closed. End-to-end hosted subscription testing remains blocked on tunnel connectivity.

Sources: [Claude subscription use with the SDK/CLI](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), [native CLI automation](https://code.claude.com/docs/en/headless).

Guard deployed to regular dev as `160c7342-85b5-4840-ae1b-28baa629f69e`. An authenticated request to yolo-s3-job verified the offline error and no API fallback. 22 focused checks passed. The approved local bridge is running, but the public tunnel failed to start; the dev app is not ready for subscription-backed testing.


### nanoGPT Lesson 1 two-page preview (2026-09-17)

Regular dev now renders the owner-authorized Pages 1-2 from the saved material
plan. Start/Resume Lesson 1 and Replay preview use the existing page player;
Curriculum's nested Lesson 1 also offers Preview Pages 1-2. The canvas has
semantic character tiles, a vocabulary, exact integer IDs and arrows, plus
selection questions and preserved learner annotations. Further explanations
reuse the reviewed Markdown and planned static visuals; pinned source pills
open highlighted lines beside the existing chat composer.

The Page 2 encoding exercise checks a new string, records first/latest attempts
and eventual correctness, and restores progress in this browser per account,
workspace, app, source and plan revision. Two pages and one check cannot complete
the full six-page lesson. Chat draft edits remain separate from the rendered
Markdown fixture; no automatic rebuilding or publication is claimed.

Verified on dev version `58d8147d-c64f-496b-8d42-0a13ea8d8dbf`: playback,
finish-before-next, scrubbing, auto-advance, replay preserving learner text,
incorrect/correct retry, reload, source highlight and valid selection snapshots.
The selection reply was mocked to avoid a paid model call. No generated assets.
