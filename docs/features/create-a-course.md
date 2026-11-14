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

## Retired

Per-card Accept / Cancel / Next card (canvas and Chat), Tab accept, Propose next step, the proposal editor (Ctrl/Cmd+K), the recovery entry and the
per-card Chat entries. The client no longer calls their routes; the server routes remain for old rows and tests (`proposals/*`, `steps/propose`, `drafts/*`).
`AdaptiveCanvas` / `SlotCard` still carry the dead pending-offer branch (`pillOf` is always null).

## Not verified in a browser

The dim and the progress card, the placement of cards around the Markdown card as they land, the Chat shimmer, the table of contents rows, Accept opening
the contents, and real Gemini output (the plan's `section`s, the facts). Unit and route-level tests use doubles for every model.
