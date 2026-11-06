# R5 (proposal editing, positioning and existing-card reuse) receipt

Candidate `feat/tutor-r5`, stacked on `feat/tutor-r6` (tip `2119107c0f8422abb67e60246599eefc8e8a06f9`), itself on the frozen R4 release tip `fe941068917184a183faa533344cde18524a0598`. The stacking is git order only: R5 imports nothing from R6 and R6 was released without R5 in mind. MVP fast path.
**R5 sits behind `ROADMAP_ENABLED` and a new `ROADMAP_EDIT_ENABLED`, both unset everywhere. Nothing is visible or reachable until both are `'true'`.**

Three things stay distinct. R5 = the learner editing a pending proposal, or reusing a card (this file). R6 = automatic suggestion of the next proposal (composes metadata only). R11 = speculative card generation: not in this branch; R5 generates no card and a draft is never generated content.

## Checklist coverage

| Row | Covered | Not covered |
|---|---|---|
| R5.01 drafts store | Yes: `roadmap-proposal-drafts.js` (save, apply, discard, sweep), `roadmap-edit.js` (composer + validator), migration 0041, routes, `test/roadmap-proposal-drafts.test.js` (7 tests) | Model role registration (Lead patch; fails closed 503 until applied). Proposal-text safety screen: a `screen` seam exists and the held path is tested with a double, but the R4 classifier is not wired to it (`ponytail:` in the file). Platform work reservation uses the existing `plan` quota class |
| R5.02 Ctrl/Cmd+K target + Apply | Behavior yes, mechanism differs (below): own target kind, preview beside the pending original, Apply closes only after server confirms, Esc discards, Tab never accepts while open, stale preview cleared, IME/repeat handled; `inline-ai-proposal.test.mjs` (8 tests), `roadmap-edit-check.mjs` (3 steps, never run) | Reuse of `InlineAiEditor.jsx` / `inline-ai-session.js`: not done on purpose |
| R5.03 position + Chat | Server: `proposal` ContextRef (one shape, text and extra fields refused) + actor-scoped resolution module + 2 tests. Client: ref builder, overlay Add to chat button (needs the LearnPage patch), drag handle with per-version screen-space position (2 tests). Offscreen Next step ready indicator is untouched | Ctrl/Cmd+L chord; handing the dragged position to R4 slot reservation (needs canvas camera in LearnPage); browser proof of drag/zoom; the ask-route hook is a Lead patch to `index.js` |
| R5.04 link an existing card | Backend yes: link proposals in the single proposal position, zero-priced acceptance with a re-read of the card, stale-link handling, ceiling, routes, view (`link`, `existingCard`), `test/roadmap-links.test.js` (6 tests) | Card-menu entry for the learner's "Use as my next step" (route and `controller.linkCard` exist); the Tutor-selected reuse chooser (the `origin: 'tutor'` field and the route accept it, nothing selects a card); fork-sanitization test (a link inserts no new block and sets no `stepId`, so there is nothing for the fork sanitizer to strip; not separately asserted) |

### R5.01 detail

- A draft is a preview of one PENDING proposal version: composed by the injected `composeEdit` (platform-funded role `roadmap_proposal`, not registered until the Lead patch), validated (title/description lengths, format explanation or table, no dollar amount, USD, credits or price), stored beside the untouched original. Asserted: the proposals table, the roadmap revision and every money-shaped table (authorizations, results, provider calls, usage) are unchanged by a save.
- A repeated action key returns the same draft BEFORE any composition (`recordedReplay`), so a replay does no platform work (asserted: one composition for two saves). The same key with different words is a 409.
- Apply is one guarded batch: the original still pending, current (same content hash), roadmap active, draft live, unexpired and at the named revision. It supersedes the original, inserts the next immutable version (pending, or held when the draft's checks did not pass), consumes the draft once and appends a `proposal_edited` event. Accept and Apply race on the same guard: tested both orders, the loser is a 409 with the current state, there is never a second version after an acceptance and never a purchase of a superseded version.
- Expired draft, edited input fingerprint (content hash moved), another actor (404) and a held validation are tested. Esc/discard is housekeeping only; `sweepProposalDrafts` (scheduled, only with the edit flag) expires old drafts and discards ones whose proposal is no longer pending. Drafts are not deleted inside `acceptRoadmapStep` (touching R4's accept batch would couple it to a table that may not exist); the Apply guard is the correctness boundary.

### R5.02 deviation to approve

The checklist says reuse the current Ctrl/Cmd+K editor. A proposal is not a board block, and `InlineAiEditor.jsx` (1,041 lines) is wired to board-edit transactions and the paid-card Generate branch, which the checklist itself says must not run for a proposal. R5 therefore adds a small editor box inside the proposal overlay (`NextStepPill.jsx`) with the specified keys. Ctrl/Cmd+K claims the chord only while the keyboard is on the overlay, so Quick Edit on a selected card is untouched. If the owner wants the shared editor chrome, that is a follow-up that can keep the same server routes and `inline-ai-proposal.js`.

### R5.04 detail

- Eligibility at offer: the card is read from the saved board of THIS actor's board (a card id or an earlier inventory is never access), of a linkable type (`explanation`, `table`, `note`, `text` — a `shortcut:` in `roadmap-links.js`, not verified against every board block name), with a content fingerprint that ignores layout keys (moving or resizing is not an edit; asserted). The offer takes the next planned step's place and the single proposal position.
- Acceptance re-reads the card. Deleted or materially edited: the link is superseded, the step returns to planned, nothing is accepted or charged, a 409 `link_stale` carries the current state, and the next Propose next step issues an ordinary checked proposal (asserted). Never silently converted into a chargeable generation.
- Accepting writes one result row: accepted, generated, passed, delivered, billing `zero_priced`, no body, with the existing card's id; the step becomes delivered, the delivered count rises (ceiling enforced: offer refused at the ceiling), and a `card_delivered` event is appended, so R6 reacts to a link delivery like any other. No authorization, hold, allocation, provider call or usage row is written (asserted on counts); the result version avoids the per-card unique key when the card already has a result.
- Acceptance goes through the same `POST .../proposals/:id/accept` route; with the edit flag on, a proposal that has a link row takes the zero-priced path. The view shows `proposal.link` and `existingCard` on the result; the overlay shows the Existing card label and hides Edit (a link has no editable words).

## Strings

Learner-facing strings added (all NEW, pending owner approval; in `roadmap-strings.js`): R5-S1 `Edit`; S2 `What should change?` (placeholder); S3 `Apply`; S4 `Discard`; S5 `Add to chat`; S6 `Existing card`; S7 `Editing is not available right now.` and S8 `That change could not be made.` (the server's refusal sentences, defined in `roadmap-proposal-drafts.js` and shown by the existing notice path). No ellipsis in any. The edit box is also labelled by S1 for assistive tech.

## Migration

`learn-migrations/0041-roadmap-proposal-drafts.sql` (R5's reserved number): two additive `CREATE TABLE IF NOT EXISTS` (`learn_proposal_drafts`, `learn_proposal_links`) and one index; no retained CHECK changes. **Not applied to any database** (dev needs the owner's GO, announced first). Tested on the in-memory schema with 0041 executed on top; the `repository-schema.sql` mirror is a Lead patch. The view's link lookup tolerates a missing table.

## Flag-off proof

- `ROADMAP_ENABLED` unset: all roadmap routes 404 before identity (R4's proof, unchanged).
- `ROADMAP_EDIT_ENABLED` unset, `false`, or set without `ROADMAP_ENABLED`: the draft, apply, discard and `steps/link` paths answer 404 `roadmap_disabled` before identity or any database read (route test with an identity spy asserts zero calls). The accept route only looks up a link row when the edit flag is on. The scheduled draft sweep runs only with the edit flag.
- Billing: no usage statement from a save, an Apply or a link acceptance (asserted on row counts).

## Tests run (this tip)

- `packages/control-plane`: new `roadmap-proposal-drafts.test.js` 7, `roadmap-links.test.js` 6, `roadmap-proposal-context.test.js` 2 pass; all `test/roadmap-*.test.js` pass (218 in all). With the learn-models patch applied: `learn-models.test.js` 15 pass.
- `packages/web`: new `inline-ai-proposal.test.mjs` 8, `roadmap-proposal-context.test.mjs` 2 pass; existing `roadmap-client`, `roadmap-controller`, `roadmap-view`, `roadmap-auto` suites pass.
- `scripts/schema-check.test.mjs` 7 pass with the 0041 mirror applied; `scripts/ci/check-map.test.mjs` with both R6 and R5 row scripts applied: 21 of 22 (the six-part time budget, a Lead decision).
- `node --check` on `roadmap-edit-check.mjs`; esbuild parse of `NextStepPill.jsx`, `RoadmapSurfaces.jsx`, `use-roadmap.js`. No browser, workerd or CI run.

## Not verified

- Any browser behavior (editor focus and key handling in a real page, drag, overlay layout, the Ctrl/Cmd+K claim against the page's own handler). `roadmap-edit-check.mjs` was written, never run.
- The edit composer against a real model (prompt quality, tool-call shape); `roadmap_proposal` pricing/limits are the patch's proposal (Sonnet 5.5 low, 600 tokens) and have not been measured.
- `RoadmapJobs` or any workerd path; migration 0041 on real D1; that the ask route patch (`index.js`) behaves under a real thread; the proposal text safety screen.
- Board JSON shape for the link fingerprint was taken from `roadmap-sweep.js` (`state_json.blocks[].id`, `type`); other block types and nested content were not enumerated.

## Recovery

`feat/tutor-r5-recovery`: one commit whose tree equals `feat/tutor-r6`'s tip (reverts R5 only).
