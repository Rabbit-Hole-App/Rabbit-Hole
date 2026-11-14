# Create a course (owner decision 2026-11-14)

A Markdown file dropped on the canvas becomes a course: a table of contents of sections and sub-sections, and one explanation card per
sub-section, all made from one button. This replaces the one-card-at-a-time approval of the roadmap (Accept, Cancel, Edit card, Next card,
Propose next step). The roadmap machinery underneath (plan, hold, quote, one author call, checks, refund, delivery) is unchanged.

## The flow

1. **Drop.** The file lands as a Markdown card, Chat opens, and a shimmer ("Reading your document") shows until the invitation arrives
   (`state.waiting`, roadmap-controller.js `expectInvitation`).
2. **Invitation.** "You've added **name**. Would you like me to create a course from it?" with **Create a course** and **Cancel**
   (Cancel dismisses the invitation).
3. **Draft.** The "Generating roadmap" shimmer, then the draft in Chat: its steps grouped under **sections** (the plan's `section` field), with
   **Accept** and **Edit**. Edit is the composer's edit pill: the learner types what to change.
4. **Accept.** The table of contents opens. Its rows are the plan: a section row, with its sub-sections one level down. **Generate course**
   is in the contents panel and in the Chat summary.
5. **Generate course.** The canvas dims; a card in the middle shows a progress bar (cards made of total), the card being made, a rotating fun
   fact about the document, and **Cancel**. Cards land on the canvas around the Markdown card (right, left, below, above, then outward:
   `roadmap-placement.js deliveredSpot`). Cancel stops new cards; the one in hand finishes; cards already made stay.

## Server

- `POST /api/learn/roadmap/:id/course/start` and `/course/stop` (roadmap-routes.js), run state in `scope_json.course` (no migration),
  engine in `roadmap-course.js`. `advanceCourse` offers and accepts the next step in one go (the first offer Accept plan leaves pending is adopted).
  It runs after Generate course, after every card made (`step_accepted` handler, roadmap-wire.js) and after every delivery or failure
  (`roadmap-auto.js`, independent of Auto-suggest and `ROADMAP_AUTO_ENABLED`).
- **One card at a time.** BE.12 allows one unresolved learner call per roadmap, so cards are made in sequence; the next starts when the card in
  hand is *made* (`COURSE_BUSY_STEP`), not when the browser places it. Making them in parallel needs that rule scoped per step first
  (and the proposal position unique index, `offerProposal`): not done.
- Stops by itself when credits run out (`stopped: 'allowance'`) or a card cannot be prepared (`'blocked'`); the client says so once.
- **Limits.** At most 40 cards: step ceilings are 10 / 20 / 40 for Brief / Balanced / Detailed (`ROADMAP_LIMITS.stepCeiling`). Cards are charged to the
  learner's credits exactly as before; no new cap.
- **Models.** Every roadmap role (plan, revise, grounding checks, safety adjudication, index) runs on Gemini Flash (`CHAT_GEMINI`) with 4000 tokens for
  its thinking; cards use the /explain profile (`EXPLANATION_MODEL_PROFILE`, production `google-low`).
- **Fun facts.** One platform-funded call on the small role (`roadmap_subject`, tool `submit_facts`, agents/roadmap-facts.js) per course, made once
  the first card is under way; a failure leaves the wait without facts. They are not cards and are not checked as claims.

## Rules decided 2026-11-14 (edge cases)

- **One course per canvas, no End or Keep.** A drop is invited over any roadmap except a course being made (then Chat says so, with no buttons). **Create a course** ends the canvas's
  other unfinished roadmap (a draft, a plan under review, an accepted plan not started, a cancelled or incomplete course); its cards stay (`roadmap-course.js replaceUnfinished`).
  A cancelled course stays open with **Generate course** to go on.
- **A file is checked before any planning cost.** Under 100 words of prose, or over 70% of it inside code fences, is refused in the create request (`source_too_short`,
  `source_not_prose`; `roadmap-preflight.js`). The first plan screens the source once with JEV (platform-paid); only a block refuses (`source_unsafe`).
- **Try again.** A course with cards that could not be made stays open (`stopped: 'incomplete'`); **Try again** (`POST course/retry`) plans only those steps again.
- **Stop rules** (`advanceCourse`): credits (`allowance`), a card that cannot be prepared (`blocked`) or a file that changed (`source_changed`), three cards in a row that
  could not be made (`failures`), two withheld for safety in a row or one learner signs-of-danger (`safety`). Each shows its own sentence once.
- **Back-pressure.** No new card starts while three made cards wait to be placed (`UNPLACED_MAX`): an absent browser costs at most three cards, and each placement wakes the run.
- A paused plan can Generate course. Edit waits while a course runs. The per-card automatic offer is off for a roadmap once a course has run.

- **Typed words.** "Create a course" typed in Chat is chosen by the chat router (JEV) from the capability's own declared intent (`inline-ai-route.js CHAT_CAPABILITIES.course`,
  `standalone`: no slash command, no picker row), never from a phrase list; the browser runs it on the selected (else the only) Markdown file. Insert > Create a course does the same.
- **Earlier courses stay in the contents** under their file name (the last three accepted and delivered, `tocOf().earlier`), after the current one.
- **Two files dropped together:** the first stays on offer, the second waits and is offered when the first is answered (`state.queue`).
- **Quiet failures are said:** no invitation after a minute ("I could not prepare this file. Drop it again."), three failed board saves in a row ("The cards could not be saved to this canvas…").
- **The canvas fits itself** to a course that finishes (not one that was cancelled or stopped).
- **What a file gives a course:** its text. Images and relative links in the Markdown are not read, so a card never describes a picture it did not see.
- **Cards and models.** Cards are authored on Gemini Flash by the fast chain under the roadmap hold (`ROADMAP_CARD_PROFILE`, default `roadmap-gemini` wherever the server holds a Gemini key; no JEV
  planner at dispatch, so the quote matches the request). The plan is explanation cards only.

- **Older roadmaps.** A step planned as a table is authored as an explanation card on Gemini too (`authoredFormat`), so no card of a course runs on the plan model.
- **Local and dev stacks** have no RoadmapJobs object: a kick drains the due events (`roadmapKick`), as the object's alarm does in production, so a course is not left waiting after a failed card.
- **Verified live (owner stack, 2026-11-14, real Gemini, over HTTP):** a 4-card and a 7-card course, Cancel and resume, a new file after a finished course, a CRLF/BOM file, two invitations, a changed file (`source_changed`), a provider outage
  (`failures` after three cards, then Try again made all 7). Safety stops are covered only by the in-memory test (forcing them live needs prohibited content).

## Retired

Per-card Accept / Cancel / Next card (canvas and Chat), Tab accept, Propose next step, End roadmap, the proposal editor (Ctrl/Cmd+K), the recovery entry and the
per-card Chat entries. The client no longer calls their routes; the server routes remain for old rows and tests (`proposals/*`, `steps/propose`, `end`, `drafts/*`).
`AdaptiveCanvas` / `SlotCard` still carry the dead pending-offer branch (`pillOf` is always null).

## Not verified in a browser

The dim and the progress card, the placement of cards around the Markdown card as they land, the Chat shimmer, the table of contents rows, Accept opening
the contents, and real Gemini output (the plan's `section`s, the facts). Unit and route-level tests use doubles for every model.
