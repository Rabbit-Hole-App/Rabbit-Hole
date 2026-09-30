# Coaching: product, ideas, tasks, and results

### Canvas conversation blocks (2026-09-17)

Regular dev's adaptive canvas uses these terms:

- **Main composer:** the bottom textbox; every submission starts a new conversation block.
- **Conversation block:** a movable card containing a question, agent answer, and its own follow-ups.
- **Block reply button:** the small reply icon after each completed answer.
- **Block composer:** the shared chat input inside that card; closing and reopening it preserves its thread.
- **Connection handles:** left/right dots revealed on hover or keyboard focus.
- **Connection:** a colored visual link between blocks; it does not merge model context.

The first block follow-up creates a separate authorized Learn thread seeded with
only that card's displayed original exchange. Subsequent follow-ups use its
thread ID. The server validates the seed before storing it; app/workspace/user
access checks still apply. A block never resumes the main composer's latest
thread. Prior assistant text is conversation history, not source evidence.

Drag between connection handles to link cards. The canvas color picker controls
new links and recolors a selected link. Select a link and press Delete to remove
it; Ctrl/Cmd+Z undoes link changes. Links track moved/resized blocks. The card's
resize control is a horizontal double-arrow icon. Existing canvas tools remain.

Scope limitation: the existing adaptive canvas still has session-only card
positions, connections and displayed exchanges. Backend conversation threads
are saved, but reloading does not reconstruct the canvas layout. No live or
private AWS deployment is included.

Verification: 171 control-plane tests and 31 repository unit tests pass. The
verified regular-dev deployment is `aa378d0f-3666-404b-ac15-8792813216b9`. The
real dev browser check (`packages/web/e2e/canvas-conversations-check.mjs`) uses
stubbed model responses to verify branch context, independent thread IDs,
close/reopen, hover ports, colored connections, movement, resizing, self-link
rejection and undo without paid model calls. SQLite-backed endpoint tests cover
history storage and permission isolation for both repository and deployed apps.

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
- The enlarged chat page has a Minimize button returning to the app's Graph tab
  (formerly the Agent tab; see [app-tabs.md](app-tabs.md)).
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
$devLicenseLine = [IO.File]::ReadAllLines((Resolve-Path ../../.env)) | Where-Object { $_.StartsWith('TLDRAW_LICENSE_KEY=') } | Select-Object -First 1
if (-not $devLicenseLine) { throw 'Cannot build dev without the tldraw license' }
$env:VITE_TLDRAW_LICENSE_KEY = $devLicenseLine.Substring('TLDRAW_LICENSE_KEY='.Length).Trim().Trim('"').Trim("'")
try {
  npm run build -- --outDir dist-dev
  $devBuildResult = $LASTEXITCODE
} finally {
  Remove-Item Env:VITE_COACHING_DEV, Env:VITE_BYOC_DEV, Env:VITE_TLDRAW_LICENSE_KEY
  Remove-Variable devLicenseLine
}
if ($devBuildResult -ne 0) { throw 'Dev build failed; do not deploy' }
$devSessionName = Split-Path (Resolve-Path ../..) -Leaf
npx wrangler deploy --config wrangler.dev.jsonc --name "small-cp-dev-$devSessionName"
```

Stop if the build fails. The separate `dist-dev` output leaves the live `dist`
artifact untouched. Follow [parallel dev deployments](parallel-dev-deploys.md):
the explicit name deploys this worktree's clone, never the shared dev worker.
Live deploys continue using the existing control-plane configuration.
Keep both flags enabled for the dev build so a Coaching UI deployment also
preserves the approved AWS app integration. Default builds disable both previews.

On a fresh worktree without `dist/index.html`, create that local default build
once before setting the dev flags. The dev worker's imported control-plane module
still resolves the production shell even though dev pages use `dist-dev/index.html`.
Building the missing local artifact does not deploy it. Do not replace an existing
live build merely to prepare a dev deployment.

## Release and verification

### Landing section order and opening-copy removal — 2026-09-29

Removed the product description beneath Knowledge is infinite, including its
styles and scroll hook. Reordered the existing content after the manifesto to:
Learning, at your pace → pink cloud → What is Rabbit Hole? → Who is it for? →
FAQ. Existing visuals and interactions are retained. The final audience action
now continues forward to the FAQ and focuses its heading.

Built with both dev flags and the existing license; deployed only to the
worktree clone, version `4243f8f8-e027-4881-ad0d-db810ab6b799`. All 27 focused
deployed Chrome checks passed at desktop 1440px and touch-mobile 390px: exact
document/visual order, adjoining section boundaries, removed description,
adaptive controls, cloud-to-overview navigation, overview/audience scroll
forward and reverse, final audience-to-FAQ navigation, and preserved footer CTA.
No browser errors or horizontal overflow. Desktop/mobile screenshots were
visually inspected. Evidence: `tmp/landing-adaptive/reorder-results.json` and
`reorder-*.png`. The preceding removal-only deployment also passed 17 focused
checks, recorded in `tmp/landing-adaptive/remove-description-results.json`.

### Landing clarity, adaptive example and footer action — 2026-09-29

Added a short product description beneath the opening headline. The reserved
white space after the clouds now presents one attention/context example with
Start simple, Show visually and Go deeper controls. Persistent word cards move
between arrangements; keyboard and reduced-motion changes are immediate. The
canvas stays the same height and labels the content as illustrative. The
existing animated footer now has a Start exploring action linking to the
existing `/sign-up` UI. No generated images, model calls or backend integration.

Built with both dev flags and the existing license. Deployed only to the
worktree clone as `e486879f-e6bf-4d4b-8f59-ba82672d1d6b`. All 113 local and 114
deployed browser checks passed at six desktop/mobile/landscape viewport sizes.
Verified hero readability/reversal, all three modes, rapid switching, diagram
and copy containment, stable height, keyboard navigation/focus, reduced motion,
native scroll and actual footer-to-signup navigation. Earlier artwork, audience
chapters, overview controls, footer animation and the flush FAQ boundary are
preserved. No browser errors or API calls. Inspected deployed desktop/mobile
screenshots. Evidence: `tmp/landing-adaptive/deployed/results.json` and images.
Scope: `docs/features/rabbit-hole-adaptive-demo.md`.

### Landing overview window and cloud interlude — 2026-09-29

The existing Japanese observatory now backs a Mac-style product overview.
Five animated HTML scenes introduce sources, questions, canvas, practice and
saved learning. Desktop scrolling opens the window and advances/reverses the
scenes; tabs, keyboard controls and compact-screen swipes provide direct access.
The scenes are explicitly illustrative, with no backend or model calls. The
Features page retains the detailed walkthrough. Preview animation waits while
the scene is offscreen and reduced motion shows complete, stable previews.

The original cloud loop now has a stronger draft headline, supporting copy,
small annotations and an overview link. A blank white section follows for
future content. Removed the external gap between the landscape and FAQ while
preserving the FAQ's internal layout. Existing audience chapters are unchanged.

Built with both dev flags and the existing license; deployed only to the
worktree clone. Initial version `6a7aaa48-83ed-4aee-b4c2-3dad9f164033` passed
190 overview checks across seven viewport sizes and all 162 audience regression
checks. The final offscreen-animation adjustment is deployed as
`4797cedd-01c3-4abc-8fa0-f73b6bb8757f`; 15 focused deployed checks passed for
arrival playback, completed scenes, reduced motion, mobile layout, preserved
assets and the exact FAQ boundary. No browser errors or API requests. Final
desktop, mobile and FAQ-join screenshots were visually inspected.

Evidence: `tmp/landing-overview/deployed/results.json`,
`tmp/landing-overview/final/results.json` and screenshots;
`tmp/audience-section/deployed-live/results.json`. Scope:
`docs/features/rabbit-hole-overview.md`. Real product captures remain future work.

### Landing audience chapters — 2026-09-29

The white section between the black manifesto and pink clouds now presents six
audiences one at a time. Desktop scrolling advances/reverses the sticky chapter;
compact screens use direct selection, arrows and horizontal touch swipes. Each
chapter has draft positioning and a neutral HTML canvas placeholder for a future
real workflow capture. No new generated artwork, model calls or backend behavior.
The existing thinkers, cloud animation, observatory, footer and Pro Contact CTA
are preserved. The earlier generated audience concept was rejected and is kept
only as history.

Built with both dev flags and the tldraw license. Deployed only to
`small-cp-dev-smart-landing-page`, version
`e188d01c-8487-42b7-9089-6513c8737baf`.

All 162 browser checks passed locally and on the deployed page at seven viewport
sizes from 320 to 1440px. Verified all six chapters, forward/reverse scroll,
actual wheel and touch input, native selection, keyboard controls, reduced
motion, short screens, deep links, one active accessible story, no overflow and
release into the clouds. No browser errors or interaction API calls. Inspected
deployed desktop/mobile screenshots. Evidence:
`tmp/audience-section/deployed-live/results.json` and screenshots. Specification:
`docs/features/rabbit-hole-audiences.md`. Canvas contents remain illustrative.

### Distinct portraits, editorial rules and contained stairs — 2026-09-29

Manifesto now uses fresh, independently composed portraits: Socrates thinking
with a finger at his chin, and Feynman in a dark sweater sketching in a notebook.
The built-in image tool received no landing-page image or other visual reference.
The v2 PNGs retain true alpha transparency and the approved blended treatment.
The landing image is unchanged. Exact prompts, paths and hashes are recorded in
`packages/web/design/manifesto-distinct-portraits-prompts.md`; v1 is retained.

At the user's request, https://typesafe.ai/manifesto was inspected for its long
vertical rules and inline red highlights. Rabbit Hole's opening and four prose
blocks now have full-height left rules, and five phrases in the existing draft
have brick-red highlighting. The text itself is unchanged. The marks wrap with
cloned decoration; foreground/background contrast measures 5.27:1. The approved
ivory/stone palette and background staircase remain.

The footer leak was reproduced at 320 × 568: hiding the stair canvas changed
footer pixels. The negative-margin sticky layer extended beyond the article.
The article and canvas now occupy the same grid area, without negative margins,
and the journey uses `overflow: clip` to bound the drawing while preserving
sticky positioning. The footer remains outside that layer.

Build and session-clone deployment passed, version
`52a6a23f-6777-4c58-a10c-ac86fe2e593d`. Actual Chrome checks passed at 1440, 390
and 320px: both v2 portraits/alpha/aspect ratios, no old-image requests, five
highlights and full-height rules, no overflow, forward/reverse/held staircase,
reduced motion, direct reload, mobile menu and landing return/Read more links.
Unchanged landing, Features, Blog and Pricing image hashes were checked.
Screenshots were visually reviewed for new poses, blending and wrapped marks.

Footer checks passed at 1440 × 1000, 390 × 844, 768 × 1024 and 320 × 568:
the stair bottom matches the article/footer boundary and footer screenshots
are pixel-identical with the staircase shown or hidden. No browser errors or
failed assets remained. Evidence: `tmp/manifesto-distinct/verification.json`,
`footer-before.json`, `footer-after.json` and PNGs. The initial main check had
an incorrect Features v2 expectation in the harness; it was corrected to the
unchanged v1 asset and the check rerun successfully. No API-key model call,
shared/live deployment or schema change; no commit requested for this pass.

### Manifesto text over stairs and separate blended portraits — 2026-09-29

Following visual feedback, the Manifesto essay now scrolls over the stairway.
The existing canvas is a sticky decorative background within the article's
flow; its progress comes from actual essay height. The separate empty animation
stage is gone. Native text, navigation and links stay above the canvas and remain
selectable/clickable. Scroll reversal and the complete static reduced-motion
view remain. The user authorized choosing a replacement palette: warm ivory
`#f9f7f2`, deepening to stone `#e5dfd6`, with charcoal text and muted gray stairs.
The background drawing is subdued on desktop and further reduced on phones.

Two new independent portraits replace the rejected blackboard scene. Socrates
stands beside the question passage; Feynman accompanies active understanding.
Both PNGs have actual alpha transparency, stippled lower edges and no room or
rectangular backdrop. Multiply blending and a lower CSS mask integrate them
with the page. Captions identify each as an imagined portrait. Source assets and
exact prompts: `packages/web/design/manifesto-solo-portraits-prompts.md`.
The landing page's approved pair and Features/Blog/Pricing art are unchanged.

Build/deployment passed on the session clone. Version
`51070899-e573-4d61-8632-57a2b26e1cc7` passed deployed Chrome checks at 1440,
390 and 320px: text/canvas overlap with correct layer order, article height
without an added art stage, two transparent PNGs with no border/background,
increasing step construction, identical pixels when reversing, stable held
progress, wheel down/up, reduced motion, direct reload, mobile navigation and
landing return/Read more links. Asset hashes match the local PNGs; earlier page
assets are unchanged. No overflow, browser errors, failed assets or requests for
the rejected combined images were observed. Screenshots were visually inspected.

Final version `b50d1154-9a71-440a-b497-f71aa8ce6616` only darkens the small
portrait captions; their contrast against the darkest page tint exceeds 4.5:1.
Deployed desktop/phone placement and caption colors were checked again.
Evidence: `tmp/manifesto-layered/verification.json`, `final-verification.json`
and screenshots. Built-in image generation only; no API-key model call,
shared/live deployment or schema migration. No commit requested for this pass.

### Manifesto staircase, blackboard scene and Features header — 2026-09-29

The existing scroll-built green stairway moved from Features to Manifesto. Its
geometry and animation code are unchanged apart from CSS/element names: forward
construction, reverse scroll, stopped-scroll stability and reduced motion remain.
Manifesto now has an oversized centered title, editorial sections with small
side labels, an image beside prose, and a large closing statement. Existing
Rabbit Hole draft copy is preserved; the reference informed layout, not prose.

The seated scene is replaced by `manifesto-blackboard-v1.png`: Socrates and
Richard Feynman stand at a chalkboard, with Feynman writing and Socrates engaged
in the discussion. The imagined-scene caption remains. Features now uses a new
green technical collage, `features-collage-v1.png`, behind its heading/subtitle
only. Existing cards follow on white. Phone cropping retains some right-side
diagram detail while keeping text readable. Blog/Pricing art, landing artwork,
white spacer, clouds, observatory and public navigation are unchanged.

Both images were generated through the built-in tool with existing images as
style/identity references. Source PNGs and previous versions are retained.
Exact prompts, dimensions and hashes: `packages/web/design/manifesto-features-art-prompts.md`.

Dev build and deployment passed on the session clone only. Initial deployment
`787b4eb2-3193-464f-a469-a7fa6650a459` passed actual Chrome checks at 1440, 390
and 320px: step counts increase with scroll, the reversed canvas matches the
earlier pixels, no motion while held, wheel down/up, sticky positioning, fixed
complete reduced-motion view, four essay sections, full blackboard aspect ratio,
mobile menu, return/Read more links, direct /manifesto/ reload, asset hashes,
three feature cards and no horizontal overflow. No browser errors, failed
assets or requests for the old seated scene/Features renderer were observed.

Final deployment `33cc6750-3f87-409f-bb3f-c664acde931f` adds only the inspected
phone crop/subtitle-width adjustment. Features was checked again at all three
widths, and the unchanged Manifesto stairway/blackboard were verified on this
version. Desktop and phone screenshots were visually inspected. Evidence:
`tmp/manifesto-features/verification.json`, `final-verification.json` and PNGs.
No shared/live worker deployment, schema migration or API-key model call.

### Centered Socrates and Feynman images — 2026-09-29

Both discussion images now contain Socrates and Richard Feynman only. After the
initial removal-only edit left the composition unbalanced, both were regenerated
with the pair centered and looking at each other. The standing scene retains
its black outer edges and full-body view; the seated scene retains its table,
chalkboard and monochrome photographic treatment. Captions and alternative text
identify the two remaining participants and the imagined encounter. Current
assets are `thinkers-standing-v3.png` and `manifesto-conversation-v3.png` in
`packages/web/public/landing/`; exact prompts, source paths and hashes are in
`packages/web/design/thinkers-centered-prompt.md`. Prior versions are retained.

Dev build and session-clone deployment passed, version
`6c83b88e-ceef-4d86-a583-2e5e2a8de240`. Actual deployed Chrome verification passed
for both `/` and `/manifesto` at 1440 and 390px: new asset dimensions/hash, full
aspect ratio without cropping, updated captions/alt text, no old asset requests,
no horizontal overflow and working Read more navigation. The blank white space
and observatory selection remain intact. All four screenshots were visually
inspected for centering, gaze and visible anatomy. No browser errors or failed
assets were observed. Evidence: `tmp/thinkers-two-person/verification.json`,
`standing-*.png` and `seated-*.png`. Built-in image generation only; no API-key
model call, shared/live deployment or schema change.

### Observatory selected as the single landscape — 2026-09-29

Following visual approval, the landing page keeps the animated observatory as
its only Japanese-style landscape. The standalone mountain figure and its unused
styles are removed; the original mountain asset remains in the repository.
The observatory follows the pink clouds, retaining its mist, stars, responsive
layout, offscreen pause and reduced-motion behavior. The approved standing
thinkers image and blank white content section remain unchanged.

Dev build and session-clone deployment passed, version
`3a947fe7-2fc2-4908-8239-69b3777ec6fd`. Actual deployed Chrome checks passed at
1440 and 390px: a single observatory directly after the clouds, no mountain image
request, moving mist, reduced-motion/offscreen pause, retained white space and
thinkers asset, and no horizontal overflow. Both screenshots were visually
inspected; no browser errors or failed assets were observed. Evidence:
`tmp/observatory-only/verification.json` and `deployed-*.png`. No shared/live
deployment or schema changes.

### White content space before the clouds — 2026-09-29

The black manifesto/image section now ends with a sharp cut into a blank white
content area, followed by the existing pink cloud loop. The reserved section is
55svh tall, bounded to 320–640px. The previous top mask, pink haze and scroll-driven
opacity reveal are removed; the GIF stays at full opacity and reduced motion
continues to use its existing still. No new copy or images were added.

The preceding approved public-page state was saved in commit `6b4a8b9` after
`make test-unit` passed. This subsequent layout change passed the dev build and
was deployed only to the session clone, version
`634216e2-52dc-448d-96f3-d759cebbf6a1`. Actual deployed Chrome verification passed
at 1440, 390 and 320px: full-width empty white section, flush black/white/cloud
boundaries, hidden scrollbars, no horizontal overflow, full-opacity animated
clouds during forward/reverse scroll and reduced-motion toggling. Artwork/GIF
hashes are unchanged and Read more still opens `/manifesto`. Desktop and phone
screenshots were visually inspected; no browser errors or failed assets were
observed. Evidence: `tmp/landing-white-section/verification.json`, `cut-*.png`
and `cloud-*.png`. No shared/live deployment or schema changes.

### Standing thinkers on the landing page — 2026-09-29

The black manifesto introduction now includes a generated monochrome image of
Plato, Socrates and Richard Feynman standing in discussion. The 1536 × 1024 image
is displayed without cropping, with a caption identifying the imagined meeting.
The seated image on `/manifesto` is preserved. Asset and exact prompt:
`packages/web/public/landing/thinkers-standing-v1.png` and
`packages/web/design/thinkers-standing-prompt.md`.

Dev build and session-clone deployment passed, version
`0660ef7d-8e96-4ad5-9af7-359a653c2b77`. Actual deployed Chrome checks passed at
1440, 390 and 320px: image dimensions/hash, uncropped aspect ratio, no horizontal
overflow, Read more navigation and the cloud transition below the added image.
Desktop and phone screenshots were visually inspected. No browser errors or
failed assets were observed. Evidence: `tmp/standing-thinkers/verification.json`
and `deployed-*.png`. No shared/live deployment, schema change or API-key model
call was performed.

### Black manifesto introduction and cloud dissolve — 2026-09-28

The landing hero now continues into a black manifesto introduction: “Follow your
curiosity.”, a short draft paragraph and a white “Read more” button. The cloud
follows with its own heading, “One question. Endless paths.” A static top mask
and a brief pink stippled haze soften that boundary; opacity follows scroll
position directly across 112–288px and reverses immediately. There is no extra
animation track, timed reveal, new motion dependency or scroll interception.
Reduced motion shows the original cloud still with the haze/mask removed.

“Read more” opens `/manifesto`, a new public HTML entry using the existing mobile
navigation and simple footer. Original draft copy describes Rabbit Hole's
adaptive-learning mission. A new built-in image-generation asset shows Socrates,
Richard Feynman and Plato around a table; its caption says it is an imagined
conversation. Image SHA-256:
`7b23e2654df67a462d3842df05277d667f51ad64eb934340f6f800644703055a`.
The full image remains visible on mobile. Spec: [Rabbit Hole manifesto](rabbit-hole-manifesto.md).

Dev build and session-clone deployment passed, version
`6568cc55-9bd6-46cd-afac-992690e251dc`. Actual deployed Chrome verification covered
1440px desktop, 390/320px touch-emulated layouts, and 390px reduced motion. Checks
passed for partial scroll progress, reversal, held scroll state, native wheel
reversal, moving cloud playback, keyboard/touch “Read more” navigation, direct
reload, `/manifesto/`, mobile menu/Escape, return-to-introduction link, image
dimensions/hash, and hidden scrollbars. Blog, Features and Pricing routes still
return their own pages. Landing heading sizes are explicitly scoped so shared
production CSS cannot shrink them; computed sizes match the intended desktop
and phone values. Screenshots were visually inspected; no horizontal
overflow, page exceptions or failed page-asset responses occurred. Evidence:
`tmp/manifesto/verification.json` and `deployed-*.png`. No shared/live deployment,
schema changes or API-key model calls.

### Bring clouds directly after the hero — 2026-09-28

The fixed 1740px hero track kept an empty black canvas visible long after the
headline faded, followed by 150px desktop / 96px mobile padding. Track and
spacer now share `100svh + 350px`: the hero releases when its existing title
fade completes, and clouds enter directly beneath it without the extra padding.
Reduced motion uses one viewport for the static hero. Tunnel rendering, cloud
artwork/playback and subsequent sections are preserved.

Session clone deployment `18d27535-73b9-4d76-9b6a-8f8801310a75` passed the dev
build and actual deployed Chrome checks at 1440×1000, 1536×814 and 390×844,
plus mobile reduced motion. The cloud meets the outgoing hero with zero gap;
normal playback still animates, reverse scrolling restores the hero, and the
navigation follows its earlier release. No horizontal overflow, page exceptions
or failed page-asset responses occurred. Screenshots were visually inspected.
Evidence: `tmp/hero-cloud-transition/{before-proposed,verification}.json` and
screenshots. Only the session clone was deployed; no model calls or schema changes.

### Hide scrollbars across public pages — 2026-09-28

The shared public-page stylesheet now hides the browser scrollbar on the
landing page, Blog and article readers, Features, and Pricing. Native
`overflow-y: scroll` remains enabled. The landing-only root class is no longer
needed; app scrollbars are unaffected because the app does not load this CSS.

Dev build and session-clone deployment passed, version
`a8ae0460-0d50-43a3-ab27-cffcc07815aa`. Deployed Chrome checks covered all five
routes at 1440px and touch-emulated 390px with Chrome's default scrollbar-hiding
flag disabled. Wheel, PageDown/Home and emulated touch scrolling work; no
horizontal overflow, JavaScript exceptions or failed page-asset responses
were observed. The Features staircase still builds and reverses with scrolling
(96 to 184 steps). Screenshots were visually inspected. Evidence:
`tmp/public-scrollbars/verification.json` and screenshots. No app UI, shared/live
deployment, schema or model changes.

### Blog/Pricing card feedback and landing scrollbar — 2026-09-28

Blog and Pricing share a circular arrow treatment: pointer hover fills the
circle and moves its arrow diagonally 2px using a 200ms CSS transition. Blog
also reveals “Read story” and parts its two existing wireframe cover layers
slightly; the label stays visible on touch screens. Pricing retains its
existing hover glow and gains a 3px lift. Plus stays black, CTA labels and
destinations are preserved, and the three desktop buttons remain aligned.
Keyboard focus emphasizes the action immediately without movement. Reduced
motion removes card, arrow and cover movement. No new animation library or
runtime event handler was added.

Only the landing HTML entry has `class="landing-page"` on its root element.
Scoped scrollbar styling hides the vertical browser bar without changing
native `overflow-y: scroll`; Blog, Features, Pricing and app pages are untouched
by this rule. Both current Blog and Pricing header images are preserved.

Dev build and session-clone deployment passed, version
`642263df-d746-4713-b54e-58ab5ffe8597`. Actual deployed Chrome verification covered
all six Blog hover/reset states, all three pricing cards, rapid hover reversal,
keyboard focus and article navigation, reduced motion, 390/320px touch-emulated
cards and article taps, and landing wheel/PageDown/Home plus emulated touch
scrolling (390px, 425px of travel with the scrollbar hidden). Screenshots
were visually inspected. The Blog/Pricing image bytes match their previous
hashes. No horizontal overflow, JavaScript exceptions or failed page-asset
responses were observed. Evidence: `tmp/public-card-hover/verification.json`
and screenshots. No shared/live promotion, schema changes or model calls.

### Regenerated Blog artwork; Pricing image preserved — 2026-09-28

The Blog's white v3 illustration was rejected. Built-in image generation
produced a new aqua, cobalt and teal technical atlas, saved as
`public/landing/blog-atlas-v4.png` (2172 × 724). Its composition uses an indexing
wheel, connected apertures and contour fields rather than the previous book
and cube diagrams. It appears only behind the Blog heading; the page below
and article readers remain white. Phone/tablet image crops favor the quiet
title area. The six sample cards, story content and navigation are preserved.
Prompt and provenance: `design/blog-collage-{prompt.md,assets.json}`.

The user's follow-up asks to keep the previous Pricing image. Pricing still
uses `pricing-collage-v3.png`: the actual deployed asset's SHA-256 matches the
previous recorded file (`2f456616ecdab8f64366e6f63ea7e5098a134615be8d339138bddfe2cdb43953`).
No Pricing artwork was generated or replaced in this pass.

Session clone `small-cp-dev-smart-landing-page` version
`cdfab1f4-2325-4480-b001-28bdc6b8764d` serves the change. The dev build passed
with both flags and the existing tldraw license. Actual deployed Chrome checks
at 1440, 768, 390 and 320px verified the new image, header-only placement,
white page, six cards, no horizontal overflow and working article/back links.
Desktop/tablet/phone screenshots were inspected. No JavaScript exceptions or
failed page-asset responses were observed. Evidence and the preserved Pricing
screenshot are under `tmp/blog-atlas-v4/`. No paid API fallback, app inference,
schema change or shared/live-worker deployment.

### Pricing amounts, allowances and shared learning benefits — 2026-09-28

The Pricing cards show **Free $0, Plus $19/month and Pro $39/month**. The active
learning-project allowances use the user's earlier specification: **3 / 20 /
100** respectively, with **250 MB / 5 GB / 25 GB** of source storage and **20 /
200 / 500 AI generation credits per month**. These credit quantities remain
placeholders until usage and cost telemetry informs final allowances. The cards,
credit-explanation heading and generation description use “AI generation credits.”
Free lists **Interactive learning canvases** alongside adaptive explanations and
**Learn from repositories, papers and documents**. Plus and Pro inherit these
through their existing “Everything in…” features; the redundant source-type
bullet in Plus is removed so source access does not read as a paid-only benefit.
Paid prices remain labeled planned; early access remains free. These are displayed package
proposals, not backend entitlement enforcement.
Other resources, CTAs and styling remain as previously deployed. Session clone
`small-cp-dev-smart-landing-page` version
`07193d66-4562-4968-a5a5-427259a4deb7` includes the change. The dev build passed
with both preview flags and the existing tldraw license; no shared/live
promotion, schema change, billing change or model call.

Actual deployed Chrome checks at 1440px and 390px show the three prices,
3 / 20 / 100 active-project limits, 250 MB / 5 GB / 25 GB source storage and the
AI generation credit labels, interactive-canvas benefit and shared source types,
with no horizontal overflow, JavaScript exceptions or failed page-asset responses.
Chrome separately reports the undeclared `/favicon.ico` as missing (404); this
unrelated issue remains recorded in verification. Card grids were visually
inspected and desktop CTAs remain aligned. This verifies the Pricing
presentation; no source ingestion, canvas runtime or billing behavior was introduced.
Evidence: `tmp/pricing-sources/verification.json` and the desktop/mobile PNGs
beside it. The existing [Pricing · deployed review Figma section](https://www.figma.com/design/MYZz4RLKIfJh3uDvLXlF0p/Pricing-deployed-review?node-id=2-2)
preserves the earlier captured state, before these pricing edits.

### White Blog and denser abstract header collages — 2026-09-28

Session clone `small-cp-dev-smart-landing-page`, version
`81b87259-a365-4461-9154-e618a3a22080`, replaces the Blog paper animation with
a static collage confined to the introduction. The user's follow-up removes
the pink page background, pink card-cover fills and scroll tint. Blog and
article readers now stay white. The paper canvas, sticky stage and color
controller are removed. Six existing sample stories, reading routes and
navigation remain. The selected `blog-collage-v3.png` adds more abstract
diagrams in the upper-right on white paper.

Pricing uses `pricing-collage-v3.png`, regenerated with denser right-side
wireframe, cutaway and contour diagrams while retaining a clear subtitle area.
Its plan cards, credit explanation and Teams content are unchanged. Plus stays
black, the desktop grid has three columns and the CTAs remain bottom aligned.
The separate request to revise pricing entitlements awaits the referenced
model, which was not included in the user's message. Figma export awaits the
user's choice between the two available teams; no Figma file was created yet.

Built-in image generation produced the collages. Prompts and asset provenance
are recorded in `design/blog-collage-{prompt.md,assets.json}` and
`design/pricing-collage-{prompt.md,assets.json}`. Earlier image versions remain.
Only this session clone was deployed, retaining both dev flags and the tldraw
license. No shared-worker/live promotion, backend change or app inference.

Deployed Chrome checks passed at 320, 390, 768, 1024 and 1440 pixels:
header-only art bounds, static images, white Blog throughout scrolling, no
paper canvas, responsive grids, all six article links, direct reload, browser
back, keyboard activation, unknown-story recovery and mobile navigation.
Pricing hover/focus, reduced motion, no-JavaScript header, three columns and
aligned CTAs passed. No horizontal overflow, browser errors or failed
same-origin requests. Desktop/mobile screenshots were visually reviewed.
Source checks confirm story content and Pricing copy are unchanged, and that
Features, landing artwork and shared footer files match their prior hashes.
JavaScript syntax, asset metadata and repository whitespace checks passed.

Evidence: `tmp/blog-collage/verification.json` and
`tmp/pricing-collage/verification.json`. Full Pricing desktop/mobile captures
are `tmp/pricing-collage/pricing-desktop-full.png` and
`tmp/pricing-collage/pricing-mobile-full.png` for the pending Figma review.
Review `/blog` and `/pricing` on the session clone.

### Public-page artwork and scroll colors — 2026-09-28

Session clone `small-cp-dev-smart-landing-page`, version
`058339a4-e3ff-49fb-8031-8cb2f19d61f8`, places an original technical print collage
behind only the Pricing introduction. The live heading/subtitle remain HTML;
cards start below the art. The previous manga sky/bird module is no longer
loaded. The selected image is `public/landing/pricing-collage-v2.png`; built-in
generation prompts and provenance are in `design/pricing-collage-{prompt.md,assets.json}`.
A targeted image edit cleared dense ink behind the small subtitle. Plan content,
hover/focus feedback, free-trial destination and static footer are preserved.
The requested pricing disclaimer sentence was removed, retaining the free-access note.

Blog cards now sit over the paper animation in the same scroll region. The
subtitle and both paper-animation captions were removed. Blog starts at the
reference pink `#f386a1` and deepens to `#c65c82`; Features keeps its green palette
and darkens from `#d9e8c9` to `#6a9479`. Both reverse with scroll and hold a static
composition/tint under reduced motion. Cards stay light and readable. Blog
article reading views retain their prior pale pink. No animation trajectories
were changed and the landing page artwork remains unchanged.

Both dev flags and the tldraw license were retained. Build and actual deployed
Chrome checks passed: header-only bounds, image loading, no old manga requests,
hover/keyboard focus, reduced motion, no-JavaScript Pricing, and no horizontal
overflow at 320, 390, 768, 1024 and 1440 pixels. Desktop/mobile screenshots were
visually reviewed. Scroll checks confirmed cards remain clickable over the
papers, six working article links, keyboard/browser-back behavior, both color
endpoints and exact reversal. Measured caption contrast at the darkest tint is
4.55:1 on Blog and 4.69:1 on Features. No browser errors or failed same-origin
requests. JavaScript syntax and repository whitespace checks passed.

Evidence: `tmp/pricing-collage/verification.json`, `tmp/blog-overlay/verification.json`
and screenshots in those directories. Only the session clone was deployed;
no API/model inference, database changes, shared-worker or live promotion.
Review at `/pricing`, `/blog` and `/features` on the session clone.

### Blog sample cards and article reading views — 2026-09-28

The Blog's placeholder rows are now six clickable sample cards below the
existing pink paper archive. Cards include paper-style covers, categories,
titles, excerpts, dates and reading times. The original three titles remain.
Each link opens a sample article at `/blog?post=<slug>` in the existing public
Blog shell, with top/bottom **Back to blog** links. Unknown slugs have a recovery
view. Content is explicitly labeled sample; no backend, CMS, model calls or
persistence were introduced. The original paper animation, other public pages
and shared static footer are unchanged.

Built and deployed to the session clone only, version
`88c5d560-7731-4cb1-982c-d84a47a33457`. Browser verification opened all six cards,
checked direct article reload, browser back with restored card position,
keyboard activation/focus, the back links and unknown-slug recovery. The grid
uses three, two and one columns at desktop, tablet and phone widths; checked
1440, 1024, 768, 390 and 320 pixels with no horizontal overflow. Desktop and
mobile card/article screenshots were visually reviewed. Scroll down/up still
advances/reverses the archive; reduced motion keeps its existing fixed pose and
disables card lift. No browser errors, failed same-origin requests or API calls.
JavaScript syntax and whitespace checks passed. Evidence:
`tmp/blog-cards/verification.json` and screenshots in the same directory.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog#stories`.

### Plus free-trial entry — 2026-09-28

Saved the existing public-page design in commit `a731d75` after `make test-unit`
passed (31 Python tests, 425 web tests, 326 control-plane tests and two benchmark
checks). The subsequent pricing update changes Plus to **Start free trial** and
preserves its `/apps` destination. Paid prices are labeled planned; the existing
note explains that early access is free and no credit card is required. No
checkout, trial expiry or plan gates were introduced. The requested Pro
**Contact** action is awaiting a confirmed email address or contact page.

Deployed only the session clone, version
`1f71a046-1cb3-4928-a002-6cda4f29f3ad`. An isolated browser verified the actual
Plus link: a signed-out visitor reaches the existing email sign-in; a signed-in
visitor reaches `/apps` with a successful app-catalog response. No billing or
Stripe requests occurred. The label, free-access note and responsive layouts
were checked at 1440, 390 and 320 pixels, with desktop/mobile screenshot review.
No page errors or failed artwork requests. Evidence:
`tmp/pricing-cta/verification.json`. Model inference was not exercised by this
pricing-button check.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.

### Restore the original manga artwork without pixelation — 2026-09-28

The user clarified that all pixelization should be removed. Session clone
version `8cec95ce-6c70-442a-a30b-f9d3307c5ee6` restores `pricing-manga-v2.png`,
`pricing-sky-v1.png` and `pricing-mountains-v1.png`, and removes the pixelated
image-rendering rule. Cloud/bird motion, bottom fade, typography, cards and
neighboring pages remain unchanged. No new image generation was needed.
Build and deployed browser checks passed: original image sources, smooth
rendering, full opacity/no color filter, responsive layout, preserved motion,
reduced-motion behavior and no public-page errors or failed requests. Desktop
screenshot review confirms the painterly artwork is restored. Evidence:
`tmp/pricing-manga/verification.json`.
Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Only the session clone was redeployed.

### Restore the previous Pricing pixel treatment — 2026-09-28

At the user's request, session clone version
`8fed5d47-f9c6-4918-b2c3-c021d8cb74b7` restores the pixel-v1 assets and removes
the subsequent extra pixelation, .84 opacity and saturation reduction. The
existing bottom fade, typography, moving sky and birds remain. The discarded
pixel-v2 workspace assets and prompt were removed. Build and deployed browser
checks passed, including original asset references, full opacity, no color
filter, responsive layout and preserved animation. Screenshot review confirms
the restored appearance. Evidence: `tmp/pricing-manga/verification.json`.
Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Only the session clone was redeployed.

### Pricing pixel-art landscape — 2026-09-28

Session clone version `9464c059-19df-408d-8dbe-f9f4ebf7d263` applies the
requested pixel-art treatment to the complete landscape fallback and both
animated scene layers. Built-in image-generation edits preserve the blue/pink
mountain composition and the foreground's true sky transparency. Original
painterly assets remain available. Prompts and selected paths are recorded in
`design/pricing-pixel-prompts.md`; hashes are in `pricing-canvas-assets.json`.

Image-only pixelated resampling keeps the new stepped detail crisp. Text,
cards, layout, cloud/bird animation, bottom fade and reduced-motion behavior
remain unchanged. No neighboring page or footer implementation changed.
Build passed with the existing large-chunk warning. Deployed Chrome checks and
desktop/mobile screenshot review verified pixel-art asset loading and rendering,
preserved typography/card markup, moving sky/birds, fixed mountains, offscreen
and reduced-motion pausing, hover feedback, and no overflow at 320–1920px.
No page errors or failed same-origin requests were observed. Evidence:
`tmp/pricing-manga/verification.json` and screenshots in the same directory.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Only the session clone was deployed; shared dev and live were not promoted.

### Pricing sky motion, page-top artwork and Features typography — 2026-09-28

Session clone version `cdd99d3b-8338-4640-b563-c2161c72c310` removes the
88px artwork offset so the landscape starts behind the navigation. The user's
follow-up restores only a gentle bottom fade; no white brush, top/side fade or
heading backdrop is added. Pricing uses the same rendered heading sizes as
Features: 68px section title on desktop, 38px on mobile, with the large headline
scaling to 146px on desktop and 68–96px on mobile. Its existing introductory
copy is split into the headline and supporting sentence. Pricing cards,
allowance notes, credit explanations and Teams details retain their content.

`src/landing/pricing-art.{js,css}` moves a painted sky behind a stationary
mountain foreground with real alpha transparency. Three small SVG birds glide
behind the ridge. Cloud drift takes 42 seconds per direction; bird crossings
take 38–43 seconds. Only transforms animate. Motion pauses offscreen, in hidden
tabs and for reduced-motion preferences. The original full image stays visible
until both enhancement images decode and remains the fallback on load failure.
No animation controls or dependencies were added. Prompts and provenance are
recorded in `design/pricing-motion-prompts.md` and `pricing-canvas-assets.json`.

Build passed with the existing chunk-size warning. Deployed Chrome checks
compared computed Pricing/Features font size, weight, line height and tracking
at 320, 390, 768, 1024, 1440 and 1920px. They verify zero artwork top gap,
bottom-only masking, no horizontal overflow, moving clouds/birds, fixed mountain
geometry, reduced-motion and offscreen pausing, card hover and static footer.
Desktop/mobile screenshots and two animation moments were reviewed. Card and
detail markup and neighboring page/renderer hashes remain unchanged. No public
page errors or failed same-origin requests were observed. Evidence:
`tmp/pricing-manga/verification.json` and screenshots in the same directory.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Blog, Features and landing visuals remain unchanged. Only this session clone
was deployed; shared dev and live were not promoted.

### Pricing manga landscape and white-wash removal — 2026-09-28

Session clone version `7f06beb2-b853-4bbd-ab36-8e1a287aa576` replaces the
rejected desk artwork with a Japanese manga-style blue mountain valley and lake,
using the landing mountain art as the style reference. The follow-up removes
the white brushed margins from the image, all CSS edge masks, mobile dimming,
and the blurred white backdrop beneath Pricing. The introductory text uses
solid ink over the image. Pricing cards and their content remain live HTML.
Blog was explicitly left unchanged; Features and the landing art are unchanged.

The active asset is `public/landing/pricing-manga-v2.png`. Built-in image
generation produced the landscape and its targeted white-wash correction.
Prompts and asset provenance are in `design/pricing-manga-prompt.md`,
`design/pricing-manga-clean-prompt.md` and `design/pricing-canvas-assets.json`.
Earlier selected assets remain as history. The landscape is static; subtle
cloud-only drift was discussed as a possible subsequent animation.

Dev build passed with the existing large-chunk warning. Isolated Chrome on
the deployed clone verified image decoding, no white masks/backdrop/dimming,
exact pricing-section markup preservation, hover highlighting, static footer,
solid introductory text and no horizontal overflow at 320–1920px. Desktop and
mobile screenshots were visually reviewed. Source hashes confirm Blog,
Features, landing artwork and both footer implementations are preserved.
No page errors or failed same-origin requests were observed. Evidence:
`tmp/pricing-manga/verification.json` and screenshots in the same directory.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Only this session clone was deployed; shared dev and live were not promoted.

### Learner's desk, pricing explanations and static footers — 2026-09-28

Session clone version `f3964884-8189-42b1-a4ce-66a530d24d3a` replaces the
pricing illustration's planetary motifs with the selected learner's-desk
direction: notebook, pencil, ruler, research papers and calculator. The small
pricing and credit notes remain. A generated numeric cost example was removed
before integration; the final drawing retains the symbolic contribution formula.
Built-in image generation was used. Prior artwork versions are retained.

The requested introductory early-access sentence is removed. Existing package
cards, prices, benefits and hover feedback remain. The credit explanation now
uses three illustrated rows with explicit charging labels and a monthly refresh
note. The upcoming Teams offer has a separate panel with its $29 rate,
five-learner minimum and existing benefits. No billing implementation changed.

Blog, Features and Pricing share a simple static footer with branding, navigation,
Get started and Back to top. The module is scoped to those three pages. The
landing-page footer, wireframe animation and FAQ are unchanged. Keyboard focus
preserves the rounded CTA and uses a dark outline against the light footer.

Dev builds passed with the existing large-chunk warning. Deployed Chrome checks
and visual review covered desktop/mobile layouts, 320–1440px overflow, exact
pricing-card text preservation, credit labels, Teams details, image loading,
hover, footer navigation and keyboard focus. The landing footer was exercised
and still animates; source hashes confirm its renderer and other existing art
are unchanged. The final footer-only check confirms consistent neutral color,
visible focus and mobile sizing on all three pages. Public-page checks have no
page errors or failed same-origin requests.

Get started reaches the existing sign-in destination. That separate unauthenticated
app navigation records 401s for `/api/apps` and `/api/watch` and a 503 from the
clone's `/api/byoc/connection`; no email or model request was sent. Backend
availability is not claimed by this visual change.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Evidence: `tmp/pricing-desk/verification.json`, `footer-verification.json` and
screenshots. Prompts: `packages/web/design/pricing-desk-prompt.md`. Layout notes:
`packages/web/design/pricing-layout-refinement.md`. Only the session clone was
deployed.

### Pricing whiteboard and card highlights — session clone, 2026-09-28

Version `cfc160eb-ba4f-411d-bfe5-3e98ca1d56af` adds a partial abstract canvas
behind the pricing introduction and cards. The user liked the first generated
collage, then requested economics-whiteboard notes. The edited v2 includes the
planned $0 / $19 / $39 prices, 20 / 200 / 500 AI credits, usage curves, cost
drivers and a contribution formula. These are illustrative annotations, not
measured business statistics. The original v1 remains in the repository.

White edge masks blend the artwork into the page. Cards remain opaque and the
package text, benefits and links are unchanged HTML. A soft backdrop protects
the introduction on smaller screens. Cards brighten with a lilac/mint highlight
on pointer hover or keyboard focus. Only opacity transitions (160ms); content
does not move. Touch hover is disabled and reduced-motion feedback is immediate.

The dev build passed with the existing large-chunk warning. Deployed isolated
Chrome checks passed for all three hover highlights and their reset, keyboard
focus, reduced motion, touch behavior, image loading, exact pricing-text
preservation and mobile navigation. No horizontal overflow at 320, 390, 768,
1024 or 1920px. A 2px phone overflow from the introduction backdrop was found
and fixed before this final verification. Desktop, tablet and mobile screenshots
were visually inspected. No page errors or failed same-origin requests; source
hashes confirm the other landing artwork and navigation are unchanged.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Evidence: `tmp/pricing-canvas/verification.json` and screenshots in that directory.
Prompts and asset provenance: `packages/web/design/pricing-whiteboard-prompt.md`
and `pricing-canvas-assets.json`. Generation used the built-in image tool.
Only this session clone was deployed; no billing or model-inference changes.

### Pricing packages and benefits — session clone, 2026-09-28

Version `a61f393c-3f06-4ffe-b2da-a246b88d1fd3` replaces the old placeholder
tiers with Free ($0), Plus ($19/month) and Pro ($39/month). Each card lists its
project capacity, monthly AI credits, source storage, learning tools and support.
A separate Teams offer is marked coming later at $29/learner/month with a
five-learner minimum. The credit explanation distinguishes new generation from
reading, editing notes and replaying saved material; generated media has a
separate planned allowance.

The page identifies these as planned early-access packages and paid subscriptions
as coming soon. All card links open the existing `/apps` flow. No billing,
entitlement enforcement, model routing, data migration or paid model calls were
added. Pricing retains the white/black palette and shared card layout. CSS
additions are scoped to `.content-page #pricing`.

The dev build passed with the existing large-chunk warning. Deployed Chrome
checks and desktop/mobile visual inspection confirmed prices and resource
counts, benefit/support lists, aligned desktop cards, the upcoming-plan notices,
credit explanation, keyboard focus, mobile navigation and no horizontal overflow
at 320, 390, 768 and 1024px. Get started reaches the existing sign-in page at
`/login?next=%2Fapps`; no email was sent. Blog typography and Features artwork
remain intact. No page errors or failed same-origin requests occurred on the
public pages. Source hashes confirm other landing artwork and navigation are
unchanged; all prior shared CSS rules remain intact.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Evidence: `tmp/pricing-plans/verification.json`, `desktop.png`, `mobile.png` and
`get-started.png`. Only the session clone was deployed.

### Pricing key removal — session clone, 2026-09-28

Version `a24fbe18-f494-40f6-99b1-f74420f1e024` removes the rejected key and
yellow palette. Pricing uses the shared white background and black typography
again. The three placeholder plans, amounts, links and disclosure are unchanged.
The orphaned pricing-art module and stylesheet are removed; the rejected version
is archived under `tmp/pricing-neutral/`.

The dev build passed with the existing large-chunk warning. Deployed Chrome
verification and desktop/mobile visual inspection confirm no key or empty art
gap, unchanged plan markup, working mobile navigation to Blog, and no horizontal
overflow at 320, 390 and 768px. No page errors or failed same-origin requests
occurred. Source hashes confirm landing, Blog, Features and shared presentation
are unchanged. Checkout remains placeholder-only and was not claimed functional.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Evidence: `tmp/pricing-neutral/verification.json`, `desktop.png` and `mobile.png`.
Only the session clone was deployed.

### Pricing wireframe key — session clone, 2026-09-28

Version `1615d5e2-f03d-4a16-b3d6-2d3c1cfe8ab8` adds the approved antique
wireframe key to Pricing on a pale butter-yellow background. The hollow handle,
shaft, collars and stepped teeth are authored mesh geometry with brown/plum
lines and stippled shading. A short scroll gently turns and brings the key
closer while fifteen small pixels settle into the outline. Reverse scroll
retraces the motion. The compact artwork sits beside the heading on desktop
and above the plans on phones. Plan markup, amounts, links and the explicit
placeholder notice are unchanged; only the page palette and artwork changed.

The dev build passed with the existing large-chunk warning. Local and deployed
Chrome checks passed for five scroll poses, exact screenshot reversal, actual
wheel input, stationary output after scrolling stops, and fixed reduced-motion
output at 65%. All three plans fit the first 1440×1000 desktop view. The first
phone plan starts within 500px of the page top. Mesh-boundary and overflow checks
passed at widths 320, 390, 600, 620, 768, 900 and 1024px. The deployed mobile menu
opens Blog with its expected typography and paper artwork; Features retains
its staircase. No page errors or failed same-origin requests occurred. Source
hashes confirm landing, Blog, Features and shared styles/navigation are unchanged.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/pricing`.
Evidence: `tmp/pricing-key/deployed-verification.json` and desktop/mobile
screenshots. Only the session clone was deployed.

### Blog falling archive — session clone, 2026-09-28

Version `efeebc5b-bb38-48a3-82f8-c9c86026616f` replaces the rejected paper
tunnel with the user's selected “Falling through an endless archive” direction.
Loose sheets follow a winding downward path on the pink background. Scroll
introduces more papers at different depths; each sheet tilts, curls and rolls
independently. Large sheets pass through the foreground, with smaller sheets
behind. Scroll reversal retraces the same poses. The Blog content and shared
navigation remain; no playback controls were added.

Deployed visual inspection caught a CSS-order conflict with the shared content
page styles. The Blog label and top spacing now use stronger scoped selectors;
desktop 12px/mobile 11px label sizes and 146px/125px top spacing were verified
against the final deployed build.

The dev build passed with the existing large-chunk warning. Local and deployed
Chrome checks passed at six scroll positions. Desktop visible-sheet counts
increased from 5 to 37; matching sheets moved downward between samples.
Screenshot comparisons confirmed exact reversal, including real wheel input
and mid-scroll direction changes. Mobile reversal passed at 390×844; responsive
checks passed at widths 320, 390, 600, 620, 768 and 1024px. Reduced motion holds
the 55% composition, removes the extended stage and hides the scroll cue.
The deployed mobile menu opens Features, and Pricing retains its own page.
No page errors or failed same-origin requests occurred. Source hashes confirm
landing art, clouds, observatory, footer, Features stairs, Pricing and navigation
are unchanged.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog`.
Evidence: `tmp/blog-archive/deployed-verification.json` and desktop/mobile
screenshots. Only the session clone was deployed.

### Blog paper tunnel — session clone, 2026-09-28

Version `bee962c3-cfcb-460d-bf6b-cc405ba8f377` replaces the downward paper
ribbon with the approved rabbit hole made of curved, overlapping pages.
The background stays pink. Scroll assembles additional layers and moves the
viewpoint into the opening, with nearby sheets passing the viewport edges.
Reverse scroll returns through the same geometry. Fine plum outlines,
stipple, lifted corners and a recessed pink/plum center retain the paper style.
The existing Blog headline, article list and navigation remain. No playback
controls or generated bitmap were added.

The dev build passed, with the existing large-chunk warning. Local and deployed
Chrome checks passed at six scroll positions, with exact screenshot reversal
at the same position, actual wheel input in both directions, camera crossings,
stationary output when scrolling stops, and a fixed reduced-motion composition.
Mobile wheel reversal passed at 390×844; overflow checks passed at 320, 390,
600, 620, 768 and 1024px. The deployed mobile menu still opens Features;
Features and Pricing retain their own pages. No page errors or failed same-origin
requests occurred. Source hashes confirm landing imagery, clouds, observatory,
footer, Features stairs, Pricing and shared navigation are unchanged.

Review: `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog`.
Evidence: `tmp/blog-tunnel/deployed-verification.json` and corresponding
desktop/mobile screenshots. This deploy updates only the session clone.

### Blog pink background and increasing papers — session clone, 2026-09-24

Version `f10f5233-ca81-4a5d-ba35-cad56899142d` keeps the page pink throughout
and increases the paper count with downward scroll. The ribbon begins with
one sheet and grows to fourteen connected sheets, preserving the original
fold/twist patterns and stippled paper treatment. New sheets grow from the
preceding edge; there is no hidden fixed stack of fourteen at the start.
Reverse scroll retracts the additions. The existing downward composition,
headline, article list, navigation and reduced-motion behavior remain.

The dev build passed. Local browser checks passed for increasing rendered
sheet counts across six scroll stages, one/fourteen endpoints, constant pink,
downward orientation, exact scroll reversal, real wheel input, reduced motion
and responsive widths from 320 to 1440 pixels. Desktop/mobile screenshots were
visually inspected. Preservation hashes match Features, Pricing, landing
artwork/HTML, shared styles and navigation; article markup is unchanged.

The same checks passed on the deployed Blog page, including mobile navigation
to Features and Pricing, with no page errors or failed page requests. Deployed
screenshots were inspected. Results: `tmp/blog-growing/deployed-verification.json`.

Evidence: `tmp/blog-growing/`. Design: `packages/web/design/blog-art-direction.md`.
Review: https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog.

### Original Blog paper restored, flowing down — session clone, 2026-09-24

Version `fe282f17-23e9-4c8b-b937-73385a9a3f77` follows the user's clarification:
restore the first paper version, except flowing downward. The original seven
connected sheets, hinge timing, twists, bow, stipple texture, pastel pink/lilac
palette and “Ideas, unfolded.” headline are restored from the archived source.
The projection turns the sculpture downward on both desktop and mobile. The
narrow-phone heading size fix is retained. The loose windblown-sheet experiment
is superseded. No other page, new dependency or backend behavior changes.

The dev build passed. Local Chrome checks passed for six scroll stages,
downward head-to-tail direction, zero-to-seven opened sheets, exact reversal,
wheel input, reduced motion and responsive widths from 320 to 1440 pixels.
The first version's shapes/material were compared with the archived renderer;
the only animation change is the projection direction. Existing article markup
is preserved; hashes match Features, Pricing, landing artwork/HTML, shared
styles and navigation. Desktop/mobile screenshots were visually inspected.

The same checks passed on the deployed Blog page, including mobile navigation
to Features and Pricing. Deployed desktop/mobile screenshots were inspected;
no page errors or failed page requests. Results:
`tmp/blog-downward/deployed-verification.json`.

Evidence: `tmp/blog-downward/`. Design: `packages/web/design/blog-art-direction.md`.
Review: https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog.

### Blog papers in the wind — session clone, 2026-09-24

Superseded by the user's request to restore the original connected paper above.

Version `2bfeef63-4efd-4a06-887b-fa554643a019` implements the user's return to
the paper direction: a pink background and loose pixelated wireframe sheets
flowing away in the wind as the page scrolls. Nine separate meshes lift from
a pile at staggered intervals, curl, rotate, recede and leave the view. The
background shifts gradually toward mauve. Reverse scroll retraces the same
flight; reduced motion holds the middle composition and removes the extended
sticky stage. Desktop uses upward/right travel and mobile uses upward drift.
The headline is “Ideas, in motion.” There are no playback controls, new
dependencies, bitmap assets or backend changes.

The dev build passed with both preview flags and the tldraw license. Local
Chrome checks passed for seven distinct scroll poses, staggered launches,
departure from view, exact reversal, real wheel input, stationary rendering
when scroll stops, reduced motion and responsive widths from 320 to 1440 pixels.
Desktop and mobile screenshots were visually inspected. The article markup
and existing placeholder destinations remain intact. Preservation hashes match
Features, Pricing, landing artwork/HTML, shared styles and navigation.

The same browser checks passed against the deployed Blog page, including mobile
navigation to Features and Pricing. Desktop and mobile reversal screenshots
matched exactly. Deployed screenshots were visually inspected; no page errors
or failed page requests. Results: `tmp/blog-wind/deployed-verification.json`.

Design notes: `packages/web/design/blog-art-direction.md`. Evidence and prior
root source snapshots: `tmp/blog-wind/`. Review:
https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog.

### Blog tree of knowledge — session clone, 2026-09-24

Rejected by the user; superseded by the loose-paper wind animation above.

Version `49edb8b9-dc77-4dca-802f-4e00404b1dbc` replaces the rejected Hidden ink
concept with the user's requested tree and downward-growing roots. Five main
roots split into an irregular network of 145 paths, with connected growth from
the tips. Reverse scroll retraces the same geometry. The rendering uses coarse
pixels, curved wireframe contours and stippling in sage/earth green, sharing the
approved Features staircase's visual treatment. The headline is “Knowledge
takes root.” Reduced motion shows the complete tree without the long sticky
stage; there are no playback controls, new dependencies or backend changes.

The dev build passed with both preview flags and the tldraw license. Local
Chrome checks passed for seven growth stages, all roots reached, exact desktop
screenshot reversal, wheel input, no motion after scrolling stops, reduced
motion, responsive widths from 320 to 1440 pixels and the unchanged article
list. Mobile reversal reproduces the same geometry; its screenshot differs by
an average 0.00011 of an 8-bit channel value, with no pixel differing by more
than 16. Desktop/mobile captures were visually inspected. Preservation hashes
match Features, Pricing, landing artwork/HTML, shared styles and navigation.
The same checks passed on the deployed Blog page, including mobile navigation
to Features and Pricing, with no page errors or failed page requests. Deployed
mobile reversal was pixel-identical. Deployed desktop/mobile captures were
visually inspected. Results: `tmp/blog-roots/deployed-verification.json`.

Design notes: `packages/web/design/blog-art-direction.md`. Evidence and source
snapshots: `tmp/blog-roots/`. Review:
https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog.

### Blog Hidden ink — session clone, 2026-09-24

Rejected by the user; superseded by the tree of knowledge above.

Version `d5d42d25-69c8-4188-9e6c-1afad3222bc8` replaces the rejected paper
sculpture with the user's chosen Hidden ink concept. Aubergine dot patterns on
butter yellow align with scrolling to reveal “Why?”, “What if?” and a question
mark, then conceal them again. The header is “Look closer.” The effect uses two
flat phase-encoded dot screens and simulated ink cancellation, with no moving
camera, folding object or text faded over the finished image. Each question
holds clearly through the middle of its scroll interval. Reverse scroll
retraces the alignment; reduced motion fixes the clear first reveal and removes
the extended scroll stage. There are no playback controls or new dependencies.

The dev build passed with both preview flags and the tldraw license. Local and
deployed Chrome checks passed for seven distinct rendered states, all three
reveals and intervening concealed states, exact screenshot reversal, real wheel
input, stopping with scroll, reduced-motion freeze/resume, mobile scroll and
navigation, and no horizontal overflow. The article list's markup is unchanged,
including existing placeholder destinations. Desktop and mobile screenshots
were visually inspected. No page errors or failed page requests; preservation
hashes match the landing artwork/HTML, Features renderer/HTML, Pricing, shared
styles and navigation. Only the session clone was deployed.

Evidence: `tmp/blog-ink/deployed-verification.json` and screenshots in that
folder. Design notes: `packages/web/design/blog-art-direction.md`.
Review: https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog.

### Blog unfolding paper sculpture — session clone, 2026-09-24

Rejected by the user for repeating the staircase's visual structure;
superseded by Hidden ink above.

Version `663f0cdd-d8b9-4c62-993d-3ed2e30e82cb` adds the approved Blog concept
for visual review: “Ideas, unfolded.” with a lilac-to-violet page and plum ink
paper sculpture. Seven connected sheets open sequentially from a folded stack
into a ribbon with shallow curves and twists. Scroll reverses the folds directly;
there is no timed loop or playback control. The 168svh desktop / 148svh mobile
scroll stage is shorter than Features. Mobile uses an upright composition.
Reduced motion fixes an open pose at 72% and removes the extended scroll stage.
The original introduction and dated article list remain unchanged, including
their existing placeholder destinations. No article or backend functionality
was added. Canvas geometry replaces any need for generated imagery or a library.

The dev build passed with both preview flags and the tldraw license. Local and
deployed Chrome checks passed for six distinct rendered scroll stages, opening
from zero to seven sheets, exact screenshot reversal, actual wheel input,
stationary rendering after scrolling stops, reduced-motion freeze/resume,
mobile scroll reversal, no horizontal overflow, and preserved article markup.
Deployed mobile navigation to Features worked. Desktop and mobile screenshots
were visually inspected; no page exceptions or failed page requests. Hashes
confirm that the landing HTML/art, Features HTML/renderer, Pricing, shared styles
and navigation are unchanged.

Evidence: `tmp/blog-paper/deployed-verification.json` and screenshots in that
folder. Design notes: `packages/web/design/blog-art-direction.md`.
Only this session clone was deployed. Review:
https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/blog.

### Features stairs construct with scroll — session clone, 2026-09-24

Version `f08c0924-c571-464e-91b6-a7607f57c86a` makes the approved wireframe
stairway build ahead of the descending camera. Each tread extends from its
joining edge; steps and landings finish in sequence so the next piece stays
connected. Reverse scroll retracts the same geometry, and stopping scroll holds
the current construction state. Reduced motion keeps a complete, still stairway.
The existing camera motion, palette, layout and other pages remain.

The dev build passed. Deployed Chrome checks verified five scroll stages and
five closely spaced construction samples: progressing from 50% to 52% completed
two additional steps, with intermediate extension visible. Desktop and mobile
wheel reversal reproduced the same rendered screenshots. Pause-on-scroll-stop,
reduced-motion freeze/resume, mobile navigation and no horizontal overflow
passed. Deployed construction and mobile screenshots were inspected. No page
errors or failed page requests; preservation hashes matched prior landing
modules, navigation/styles, landing HTML, Blog and Pricing.

Evidence: `tmp/features-step-build/verification.json` and deployed screenshots
in that folder. Only the session clone was deployed. Review:
https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/features.

### Features abstract stair descent — session clone, 2026-09-24

Version `f0ba3718-38a8-4575-b260-5f037dd9676f` replaces the rejected bitmap
labyrinth and coral route on `/features` with procedural stair geometry.
Forest-green wireframe edges and dithered pixel surfaces form descending flights
around an open shaft. Scroll controls camera descent, a gentle turn and the
pale-green-to-jade background; reversing scroll retraces the same composition.
The canvas remains sticky on desktop and mobile. Reduced motion fixes the view
at 32% progress and removes the extended scroll stage. No playback controls.
Existing feature cards, navigation, landing animations, Blog and Pricing remain.
The rejected picture is archived outside public assets and is no longer loaded.

The dev build passed with both preview flags and the tldraw license. Deployed
Chrome checks passed for five distinct rendered progress states, exact screenshot
reversal on desktop and mobile, real mouse-wheel input, stationary rendering
after scrolling stops, background progress, reduced-motion camera freeze/resume,
mobile navigation and no horizontal overflow. Desktop and mobile screenshots
were visually inspected. No page exceptions or failed page requests were found.
Preservation hashes match all prior landing modules, shared navigation/styles,
landing HTML, Blog and Pricing. The first test used repeated canvas pixel reads,
which changed Chrome's rasterization during measurement; verification now uses
browser screenshots. Reduced-motion checks compare camera state because fixed
navigation can overlap its non-sticky canvas at different scroll positions.

Evidence: `tmp/features-stairs/verification.json` and deployed screenshots in
that folder. Design/renderer notes: `packages/web/design/features-art-direction.md`.
Only this session clone was deployed. Review:
https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/features.

### Features labyrinth artwork and scroll journey — session clone, 2026-09-24

Rejected by the user; superseded by the abstract stair descent above.

Version `9a61d0d3-cd0a-4bea-858c-897f3ba23309` adds original Escher-inspired
architectural artwork to `/features`: mint and forest-green ink, a coral thread
revealed by scrolling, and a pale-mint-to-sage background. The illustration stays
still while the separate SVG route advances or retraces. Wide screens keep the
artwork sticky through the journey; phones use normal page flow and a shorter
scroll range. Reduced motion shows the complete route with a fixed background.
No playback buttons, model runtime calls, or animation dependencies were added.
The existing feature cards/copy and shared navigation remain.

Built and deployed with both dev flags and the tldraw license. Deployed Chrome
checks passed for five actual rendered progress states, exact route reversal,
mouse-wheel input, changing background opacity, reduced-motion freeze/resume,
mobile scroll/layout/navigation, and artwork without JavaScript. Desktop and
mobile screenshots were visually inspected. No page errors or failed requests.
Preservation hashes verify the landing HTML, Blog, Pricing, shared stylesheet,
navigation and prior animation modules are unchanged. One local screenshot run
was interrupted by Vite reloading; the stable local rerun and deployed checks
passed. Small text retains at least 5.26:1 contrast against the deepest page tone.

Evidence: `tmp/features-art/verification.json` and screenshots in that folder.
The generated PNG, prompt, dimensions and hash are documented in
`packages/web/design/features-art-direction.md`. Only the session clone was
deployed. Review: https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/features.

### Automatic landing animation without playback controls — session clone, 2026-09-24

Version `58c25a80-4664-4e97-a500-8c54c4121039` removes the cloud,
observatory and footer play/pause buttons at the user's request. Their event
handlers and styles are removed as well. The original animations, timing,
artwork, FAQ and navigation remain. Reduced motion still selects the original
cloud still and freezes the observatory/footer; returning to normal motion
resumes automatically. Offscreen and hidden-tab suspension remain in place.

Build and deployed Chrome checks passed with both dev flags and the tldraw
license. The HTML comparison found only the three playback controls removed.
Actual cloud screenshots, mist transforms and footer canvas pixels confirmed
automatic motion; preference changes verified freezing and resumption. Mobile
layout, FAQ and menu passed with no page errors or failed asset requests.
Evidence: `tmp/landing-controls/verification.json` and screenshots in that folder.
The session clone alone was deployed; review at
https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/.

### Inward tunnel flow and distinct FAQ — session clone, 2026-09-24

Version `00224833-6b97-4f12-9592-2cdd123fe0dd` on
`small-cp-dev-smart-landing-page` gives the footer a continuous inward flow:
wireframe rings travel toward the narrow end over eight seconds while the
existing revolution slows to 76 seconds. A fixed rim and longitudinal ribs stay
visible as individual rings recycle. The FAQ now has a warm paper background,
left-aligned introduction and separate rounded question cards. Its approved
tunnel symbol and answer copy are preserved. Prior sections, shared styles,
artwork, controllers and separate public pages match the pre-change snapshot.

Build and deployed Chrome checks passed with both dev flags and the tldraw
license. Real canvas path measurements verified inward travel independently of
revolution: one ring's area relative to the mouth changed from 0.646 to 0.386
over 1.2 seconds. Ten rendered samples span more than two eight-second depth
cycles with no blank reset or clipped edges and a stationary wordmark. FAQ
mouse/keyboard/rapid-reversal behavior, native disclosures without JavaScript,
pause/resume, offscreen suspension, reduced motion, mobile layout and public
navigation also passed. Desktop/mobile screenshots were visually inspected.
No browser errors or failed requests. Shared dev and live were not changed.

Evidence: `tmp/footer-depth/browser-verification.json`,
`tmp/footer-depth/preservation-verification.json`, and screenshots in that folder.
Review at `/#faq` and `/#site-footer`.

### Revolving tunnel footer and FAQ — session clone, 2026-09-24

Version `fe50d7b3-bf03-4ef6-af3c-091c1741820f` on
`small-cp-dev-smart-landing-page` adds the approved charcoal FAQ and footer after
the observatory. The footer uses an original revolving wireframe funnel behind
a stationary Rabbit Hole wordmark, with the existing tagline/copyright and links
to existing public pages. The FAQ has six native disclosures and provisional
adaptive-learning copy. No TypeSafe logo, external animation embed, or new
dependency is used. Earlier page sections, assets, controllers, shared styles,
and separate public pages match the preservation snapshot.

Both dev flags and the tldraw license were retained. Build and deployed Chrome
checks passed: all FAQ answers, one-open behavior, keyboard activation, rapid
toggle reversal, no-JavaScript disclosures, full-cycle tunnel rendering with a
stationary wordmark, no edge clipping, pause/resume, offscreen suspension,
reduced motion, mobile layout, footer navigation and back-to-top. Ten actual
canvas samples span more than 38 seconds. No browser errors or failed requests.
Desktop/mobile screenshots were visually inspected. A full-turn check caught
clipping in the first framing; the final renderer fits the entire projected
extent on desktop and mobile. Cloudflare's expired login was renewed before the
successful deployment. Shared dev and live were not changed.

Evidence: `tmp/landing-footer/browser-verification.json`,
`tmp/landing-footer/preservation-verification.json`, and screenshots in that
folder. Review at `/#faq` and `/#site-footer`. Implementation and design rationale
are documented in `packages/web/design/rabbit-hole-landing.md`.

### Observatory appended below the mountain — session clone, 2026-09-24

Version `89940ace-3a5d-4306-91c6-bda807748672` on
`small-cp-dev-smart-landing-page` adds an illustrated mountaintop observatory at
`/#observatory`, below the existing mountain image. Built-in image generation
produced an opaque base scene and a separate transparent foreground mist layer.
Only the mist and five tiny star highlights animate. Pause, keyboard activation,
reduced motion and offscreen/tab visibility control the new scene independently.

Existing HTML is identical after removing the appended figure and its module
import. Hash checks confirm the hero's shared styles, navigation, cloud assets
and controller, and mountain asset are unchanged. No shared or live deployment.

The dev build and deployed Chrome checks passed on desktop and mobile: actual
mist translation and star shimmer, a fixed opaque base, pause/resume, preference
changes, offscreen suspension, keyboard control, no horizontal overflow, original
cloud control, and separate Blog/Features/Pricing pages. No browser errors or
failed art requests. Desktop/mobile screenshots and both drift extremes were
captured; desktop/mobile compositions were visually inspected.
Evidence: `tmp/observatory/browser-verification.json`,
`tmp/observatory/preservation-verification.json`, and screenshots in that folder.
Prompts/provenance: `packages/web/design/observatory-{prompts.md,assets.json}`.

### Original cloud restored with a trimmed loop — session clone, 2026-09-24

Version `c53f9f7d-8d63-4a3a-9012-e94803764367` restores the original TypeSafe
cloud artwork and animation. The user rejected the generated center because it
was static. The generated fill, permanent base, CSS drift and blending are gone.
Only source frames 13–96 play, preserving the original visible forward/back
motion and timing while removing the white opening/closing and their transition
frames. The loop is 6.72 seconds. Every exported frame is pixel-identical to its
original on the page's white background; the first and last frames match.
Pause/reduced motion use the original decoded still, only while motion is paused.
The blue mountain image and the rest of the landing page remain as before.

Both dev flags were enabled; build and deployed Chrome checks passed. Twenty
browser captures span two complete loops, show changing animation pixels, and
contain visible clouds in every capture. The generated fill is absent from the
DOM and is never requested. Pause/resume, reduced motion, mobile sizing, the
mountain and public routes passed, with no page errors. Desktop/mobile
screenshots were inspected. Evidence: `packages/web/design/cloud-loop-verification.json`
and `tmp/landing-art/cloud-loop-qa/{browser-verification,pixel-verification}.json`.
No shared-worker or live deployment.

### Filled clouds and blue mountain artwork — session clone, 2026-09-24

Superseded: the user rejected the static cloud center. The restoration above
replaces this cloud treatment. These earlier checks established persistence,
not acceptable cloud motion throughout the generated artwork.

Version `7b945b8f-d2a5-4dc9-956a-1547ef2cbc39` of
`small-cp-dev-smart-landing-page` adds two generated landing assets. The pink
cloud now has a filled center and a persistent base underneath the original
GIF, whose opening and closing frames are blank. A gentle horizontal drift and
blended GIF detail preserve motion without clearing the cloud. Pause and reduced
motion keep the filled base visible. An original blue mountain landscape in a
Japanese-animation background style appears below it. The existing hero,
navigation, public pages and footer are preserved; the mascot remains absent.

Both dev flags were enabled. Build and deployed Chrome checks passed for the
full cloud loop, pause/resume, preference changes, mountain loading, desktop and
mobile layout, and Blog/Features/Pricing. Fourteen actual cloud screenshots span
more than the full 9.68-second GIF loop; pixel checks found pink in at least
91.6% of the central sample region in every capture. Desktop and mobile artwork
were visually inspected after decoding. No page errors or failed art requests.
Evidence: `tmp/landing-art/qa/browser-verification.json`,
`tmp/landing-art/qa/cloud-pixel-verification.json`, and
`tmp/landing-art/qa/mountains-mobile.png`. Reusable browser check:
`packages/web/e2e/landing-art-check.mjs`. Prompts and asset provenance are under
`packages/web/design/landing-art-*`. No shared-worker or live deployment.

### Rabbit removed from landing — session clone, 2026-09-24

At the user's request, version `222410fb-f94c-4f92-9c26-c01caf981380` of
`small-cp-dev-smart-landing-page` removes the rabbit, A/B portal interaction,
controls and reserved scroll region. The original hero, pink clouds and separate
Blog, Features and Pricing pages remain. Cloud controls now load independently
from the retired mascot entry. Both dev flags remain enabled.

Deployed Chrome verification confirmed the rabbit/portal DOM is absent, no
mascot assets are requested, cloud pause/resume works, mobile reduced motion
works without horizontal overflow, and all three public navigation links work.
Desktop/mobile screenshots were inspected; zero page errors. Evidence:
`tmp/rabbit-mascot/removal-verification.json`. No shared-worker or live deployment.

### Landing-only scroll mascot and public pages — session clone, 2026-09-23

Clone `small-cp-dev-smart-landing-page`, version
`450b3b20-64e0-45df-8462-93bd4c095b9e`, serves the Rabbit Hole landing at `/`,
with separate `/blog`, `/features` and `/pricing` pages. The user's explicit
landing-only direction supersedes the earlier Mascot app-tab placement; both
regular and repository app interfaces retain their original tabs. Both dev flags
remain enabled. The shared worker, live installation and databases were not changed.

The landing includes a front-facing mascot, scroll-reversible upper/lower vertical
page portals, runtime portal placement and the exact requested TypeSafe cloud.
Seven controller tests and 16 deployed Chrome scenarios passed, with zero page
errors and no model calls. Checks exercised actual wheel input in both directions,
partial reversals, held poses, rim occlusion, pointer/keyboard positioning, living
gestures, mobile/reduced motion, cloud pixels, page navigation/reload and absence
from both app interfaces. Screenshots were visually inspected. Evidence:
`packages/web/design/rabbit-character/living-08/qa/scroll-portals/browser-verification.json`.
The portal effect remains an MVP for user visual review; no final art approval is inferred.

### Living mascot prototype — previous app placement, 2026-09-23

Superseded by the user's landing-only correction. The app tabs described below
are removed. Current implementation and scroll-portal verification are recorded in
[the living mascot specification](rabbit-living-mascot.md). The landing and its
Blog, Features and Pricing pages are separate Vite entries in regular dev builds;
private BYOC and production app builds retain their existing entry points.

`small-cp-dev-smart-landing-page`, version `339ab997-ea8e-477e-a401-52b0deea6cc5`,
adds a dev-only **Mascot** tab alongside the existing app tabs. Both preview flags
remain enabled. It uses the shared enlarged app layout and existing buttons;
`/mascot/` artwork is served by the dev asset binding. Existing Graph, Runbook,
Logs and Learn flows remain available. Leaving Mascot retains the chosen app tab.

The [living mascot milestone](rabbit-living-mascot.md) includes five actions and
movable reversible page portals. Six controller tests and 11 real deployed Chrome
scenarios passed, including the existing counter app's navigation, all actions,
both portal directions, moved exit during hidden transfer, pause/reset, keyboard
and pointer dragging, mobile layout and reduced motion. No model calls, mocks,
database migrations, shared-worker or live deployments were used. Browser evidence:
`packages/web/design/rabbit-character/living-08/qa/browser-verification.json`.
Visual character approval remains pending; Pass 04 is explicitly temporary.

### Previous releases

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
