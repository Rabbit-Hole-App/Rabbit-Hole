# Review lesson materials before rendering

Status: review UI and an owner-requested full Lesson 1 playback (all six pages)
on regular dev. The supplied nanoGPT outline is saved as an unapproved course
draft, and all six pages of the Lesson 1 Markdown fixture are browsable under
Curriculum. Automated per-lesson planning, shared saved plan revisions and
plan approval/build actions are not implemented yet.

## Modular preview

### Execution plan: Lesson 1, Pages 1–2 (2026-09-17)

The owner authorized rendering this two-page preview. Regular Cloudflare dev only;
the full curriculum remains a draft. No paid/generated assets are needed.

- [x] Extend the existing page player with prepared text, tiles and arrows;
  retain pause/play, finish-before-next, scrub, selection questions and notes.
  Verify both pages and that replay preserves learner drawings.
- [x] Render Further explanations and source pills from the reviewed material;
  add the Page 2 encoding check with separate first-attempt/eventual correctness.
  Store attempts per account/workspace/app/source/plan revision in this browser.
  Verify incorrect/correct feedback, retry, reload and account isolation.
- [x] Check selection snapshots and the highlighted source reader with chat
  still available, build, deploy regular dev and inspect it in a real browser.

Pages 3–6 are rendered (owner request, 2026-09-19, plan revision 5): scripted
canvas scenes with per-part narration, Further explanations (authoring
directives about planned diagrams stripped; tables render via the shared Md
renderer), and reference pills. The Page 3 prefix-target practice and the
Page 4 generation-weights check live below the canvas beside the Page 2
encoding check, with attempts stored in the same browser progress record.
Page 6 reveals its two self-check answers on the canvas after a pause. The
quiz, flashcards and notebook remain later work. Lesson completion counts six
pages plus the three checks. A short encoding exercise on Page 2 assesses the
text-versus-IDs objective.

Implementation: a supplied lesson fixture using the existing canvas player,
with a small reading/check component; no new API, generation or publication flow.
Browser persistence is explicitly local, not cross-device progress sync.

Pages 1–2 have narration audio, pre-generated once from the plan's spoken text
with Fish Audio (`scripts/generate-lesson-audio.mjs`, key in the repo `.env`,
one pinned narrator voice) and committed as static files under
`packages/web/public/audio/`. There is no runtime TTS call. The script splits
each page's narration into parts anchored to scene objects — it fails if the
split no longer matches the plan text — and writes clip timings to
`packages/web/src/nanogpt-audio.json`. The player stretches each scene segment
to its clip length, applies a small drift correction, pauses/seeks audio with
the lesson, and pauses the lesson when the browser blocks autoplay so speech
and drawing restart together. A mute toggle sits in the canvas-side toolbar and
persists per browser. Rerun the script whenever the narration text changes.

The curriculum list remains in the main area. A lesson opens one level deeper
inside Curriculum, with Back to curriculum. Lesson 1 displays all six pages;
later lessons retain their outlines. Each page is a collapsible card (first page
initially open), with a chevron and a left vertical connector linking its sections.
Each section has a distinct icon alongside its visible label and retains Edit in chat.
Each page has separate canvas text, assets, drawing sequence,
explanation, Further explanations and reference blocks. Further explanations
adds depth beyond the canvas: a worked example, the underlying reasoning,
misconceptions, and relevant math/code where useful. It is substantive learner
reading, not a three-sentence recap of the animation. It can reuse canvas assets
or add new equations, code, diagrams, images, videos and interactive material.
The draft specifies each asset's placement, content and purpose before generation;
it does not restrict supporting material to prose. Sections stay visible together
inside the expanded page. Curriculum no longer has Back to canvas; the existing
Lesson tab remains the way to return to lesson content.

Quiz, Flashcards, Notebook and Repository focus are clickable tabs in each
curriculum lesson card. The chosen module opens below the tabs. Lesson 1 uses
the detailed plan: two question blocks with answers, four individual front/back
card blocks, and five notebook cell blocks. Later lessons show their supplied
outlines without fabricated answers or notebook implementations.

Lesson 1 exposes Quiz, Flashcards and Notebook as three separate collapsible
blocks directly beneath Page 6. Each has its own icon and chevron. It reuses the
same activity content, revision IDs, draft edits and Edit in chat actions as the
curriculum cards. The quiz draft shows outlined checkbox-style options, the
correct option with a green check, and feedback below, with no colored row fill.
Selecting a quiz block changes only its
outline; the text background remains unchanged. This is a reviewable
answer key, not the learner's scored quiz. Curriculum cards keep their existing
activity tabs. Edit course / Learner view appear on the overview only, not
inside a detailed material plan; returning to the overview restores the switch.

The review wording and answer key above belong to the owner's editor view in
the dev/review build (`reviewTools`, VITE_COACHING_DEV) only. Learner view, and
every view in the production build (VITE_RABBIT_HOLE alone), shows the lesson
inside the plan: learner labels ("Lesson pages, quiz and flashcards", "Outline
only"); no Canvas text, Assets, Drawing sequence or Planned evidence sections;
no "Insert/Reuse … here" author notes, captions or "pending testing"; and
"Spoken or written explanation" reads "Explanation". Quiz questions are answered
first: radio choices, the Before answering hint, and Check answer. A wrong
choice shows only its own "If you chose" note and can be changed; the right one
locks the choices and shows the why and the transfer check. Objective lines are
never shown. Flashcard backs stay folded behind Show answer.
`src/lesson-plan-preview.test.mjs` renders both builds, and
`e2e/production-bundle-check.mjs` fails a production bundle that still carries
"Material plan ready for review", "Draft material plan" or "Quiz answer key".

Lesson 1 displays separate timing labels sourced from the Markdown: Guided
explanation ~6 min; Quiz and review self-paced; Optional notebook ~5 min, pending
testing. Page durations describe playback, not total completion time. Overview
duration labels likewise say guided explanations. The progress contract maps
the Page 2 encoding exercise to representation, Quiz Question 1 to next-token
prediction, and Page 4 to training versus generation. Page 3 is practice.
Required participation is guided playback plus those three submitted checks;
correctness is recorded separately. Supporting reading, Quiz Question 2,
flashcards and notebook remain optional. Only Pages 1–2 playback and the encoding
exercise currently persist, locally in the learner's browser. The progress bar
counts them against all six pages and three objective checks, so this preview
cannot mark the whole lesson complete.

The Lesson tab has Start/Resume Lesson 1 and Replay preview; Curriculum's nested
Lesson 1 plan has Preview Pages 1–2. They use the existing canvas player,
Back/Play/Pause/Next, timeline, selection context and My notes. Next first finishes
an unfinished page; playing advances between pages. Page layouts carry semantic
metadata, with exact character tiles, vocabulary, IDs and connecting arrows.
Further explanations reuse the reviewed Markdown and add its static supporting
visuals. Source pills open pinned repository lines in the existing right-panel
reader while retaining the composer. Browser draft edits remain in the plan;
they do not silently rebuild this fixture, and the plan warns when they differ.
No paid assets or model calls are required to play the preview.

Each owner-editable block has Edit in chat. Selection highlights the block,
focuses the shared chat composer and attaches the page, section and current
content. The owner-only `revise_section` action on the existing course API
returns a replacement for that section only. It validates source/course versions
and bounded input/output, uses source context, and neither generates assets nor
modifies the curriculum/approval. The client applies the returned text to the
selected block. User edits are currently saved in browser storage scoped to the
app/workspace/account; they are not published or synced into the repository's
Markdown files. Shared revision storage and approval remain pending.

Both agents use `ChatComposer`, retaining the same input/send interface.
Curriculum editing uses the configured default model. Its chat history lasts for
the current visit; the existing Learn chat keeps its persisted history.

## Purpose

The owner must be able to change what a lesson will say and show before rendering or generating assets. Curriculum approval determines what to teach. Lesson-plan approval determines the actual explanation and supporting materials.

First fixture: [nanoGPT Quickstart curriculum](../courses/nanogpt/quickstart-curriculum.md) and [Lesson 1 draft](../courses/nanogpt/lesson-01-plan.md). These are example content, not a hardcoded general-agent syllabus.

## Owner flow

1. Learn starts with an empty lesson area and the existing Learn Agent panel.
2. Review the curriculum's lessons. Approve, modify directly or through chat, or discard the draft.
3. Choose an approved lesson and request **Plan lesson**.
4. Learn Agent reads relevant pinned sources and writes one Markdown material plan. No canvas rendering, notebook execution, image/video generation, or Blender rendering occurs here.
5. Show the plan in the main area with **Approve plan**, **Discard draft**, and chat editing. Keep the resizable Learn Agent panel and composer available.
6. Approval records the exact plan revision. Only then offer **Build lesson** to create its assets and render its materials. Approval does not silently start paid generation.
7. Revisions create an unapproved draft. Keep any previously approved/rendered lesson available until its replacement is approved. Discard cancels only the draft, not the course, chat, or learner work.

Lesson plans are produced on demand, one lesson at a time. Curriculum changes must flag affected plans for review; delayed responses cannot overwrite a newer revision. Learners see approved, built content rather than the owner's planning drafts.

## What every plan contains

### Teaching standard

The owner's requested Andrew Ng-inspired approach applies to the canvas,
narration, Further explanations and assessments: motivate the problem, develop
intuition with a concrete example, add precise notation/mechanisms after their
prerequisites, work through the example, check understanding with feedback, and
connect to the next question. Use original prose; do not impersonate the teacher.
This is a teaching progression, not mandatory repeated headings or a reason to
turn a narrow follow-up into a full lecture.

Carry a small running example across pages where it helps. Define every new
symbol, distinguish illustrative values from measured outputs, and explain why
each step is needed. Further explanations can reuse or extend canvas assets and
introduce additional media when they resolve a learning obstacle. References
support the explanation rather than substitute for it.

Quizzes test application and misconceptions, with reasoning for correct and
incorrect choices. Flashcards pair retrieval questions with a concrete example.
Notebooks follow predict → run → change → explain, starting with a small
inspectable example before using real repository data. Include expected behavior,
recoverable failure examples and a final conceptual check.

Lesson 1 revision 3 demonstrates this direction across all six pages, the two
quiz questions, four flashcards and five notebook cells. Its draft section IDs
include the material revision so older browser edits cannot overwrite reordered
pages or revised activities. Older edits are not deleted, but are not applied
to the new revision. This content preview is not a teaching-quality evaluation
of automated lesson generation.

Revision 3 specifies a position-selection exercise on Page 3, objective-linked
answer tracking on Pages 2–4, and a three-group introduction to the repository
on Page 5. These interactions/progress records are still build requirements,
not live learner behavior. Syntax checks on raw Python do not replace executing
the exported notebook in the real browser kernel before publication.

### Material structure

- Identity: course, lesson, curriculum revision, plan revision, source commit, review status.
- Objective, audience assumptions, prerequisites, duration and exclusions.
- Each page: title, objective, exact canvas text/equations/code, diagram objects and relationships, reveal sequence, explanation text, and supporting text below the canvas.
- Sources: verified file/symbol/line references plus relevant papers and online learning resources. For each external resource, include its title, authors or publisher, year for papers, suggested section, and a short explanation of what the learner gains. Distinguish beginner explanations from optional deeper reading and historical/background methods from the repository's actual implementation. Verify links and relevance; do not invent citations or add unrelated papers just to fill a quota. Clearly label invented teaching examples and unknown facts.
- Asset manifest: chosen primitive, purpose, exact specification or generation prompt, source/attribution, dependencies and intended placement. State when no external/generated assets are needed.
- Notebook: Markdown and code cells, instructions, dependencies/data inputs, expected behavior, reset baseline, and execution checks. Distinguish actual outputs from expected outputs.
- Quiz: questions, choices where relevant, answer key, feedback, and the objective each question tests.
- Flashcards: exact front and back, tied to lesson concepts.
- Review checklist and unresolved decisions.

Markdown is the review artifact. A later renderer consumes a validated structured representation tied to that same approved revision; it must not silently improvise new content. Review shows substantive changes before approving another revision.

## Agent boundaries

Curriculum Agent owns the course outline. Learn Agent owns the lesson material plan and its revisions. Chat must know whether the user is editing the curriculum or the selected lesson. A lesson edit must not silently rewrite the curriculum.

Planning may use source/graph retrieval to verify claims. It chooses tools for explanatory value; images, video, plots, papers and 3D are optional. No asset-generation side effects occur while planning. Tool failure after approval must be visible; substituting different teaching content requires review.

## Acceptance checklist for implementation

- [x] Empty initial lesson area for a repository course; preserve existing saved work.
- [ ] Curriculum approval precedes per-lesson planning.
- [x] Owner can browse the supplied Lesson 1 Markdown including assessments and notebook cells.
- [ ] Chat revisions, approve and discard operate on exact revisions.
- [ ] No rendering, execution or asset generation before approval.
- [ ] Build reuses the approved content and existing lesson primitives.
- [ ] Drafts survive reload; app membership and owner permissions apply.
- [ ] Test approval invalidation, stale responses and draft discard.
- [ ] Deploy and verify regular Small dev only.

Related: [current course workflow](coaching.md#learn-owner-approved-curriculum-and-first-lesson), [teaching/tool selection](learn-teaching-planner.md), [repository context](learn-repositories.md).
