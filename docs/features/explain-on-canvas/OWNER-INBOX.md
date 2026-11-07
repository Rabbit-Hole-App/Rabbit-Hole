# Explain on Canvas: owner inbox

Non-blocking follow-ups recorded by the Tutor core MVP sprint (2026-11-06). Each item has evidence, impact and a next action. Nothing here blocks the core flow.

## Backend lane

# OWNER-INBOX lines from the backend lane (tutor/be)

Each entry: evidence, impact, next action. None blocks the core MVP.

- **CORE.06 safety coverage is not full-document.** Evidence: `roadmap-run.js::finish` screens the highlighted source passage, the learner's original instruction plus accepted revisions, and the generated output; the newly supplied whole document (up to 40,000 characters) is not screened. Impact: unsafe text elsewhere in the learner's own document is not checked at publication; only the card's output and the passage are. Next action: separate follow-up that measures false refusals on educational and unrelated source content and accounts for sequential 24k chunks, repeat screening and adjudication deadlines before enabling. Not a silent new gate.
- **Scope change after acceptance is refused.** Evidence: `revisePlan` still answers 400 for `scope` (roadmap-planning.js). Impact: Edit roadmap after acceptance can change the instruction and Depth, not switch between Full content and a selected passage. Next action: decide the UX, then reuse the existing source-read scope path.
- **Revising a completed roadmap is unsupported.** Evidence: REVISABLE is questioning, proposed, active, paused; a `completed` roadmap answers 409 invalid_transition. Impact: after the last card the learner cannot extend the roadmap with Edit roadmap. Next action: allow `completed` with kept steps and reactivate on reacceptance.
- **An unknown provider outcome is shown as failed.** Evidence: `roadmap-view.js` maps a result with a reconciling or unknown call to the generic generation_failed message; the money state stays `unknown` and is never relabelled as zero cost. Impact: the learner sees a failed, skipped step although the provider may have billed. Next action: expose a distinct reconciling stage and message once the reconciliation sweep exists.
- **Org-level model routing is ignored by the author quote.** Evidence: `roadmap-generate.js::authorRoute` follows `SUBSCRIPTION_ONLY`, `LEARN_PLAN_MODEL` and the default model; the artifact path passes no org, so an org Bedrock or OpenAI-compatible setting is not read (`shortcut:` comment). Impact: if the artifact path ever passes an org, the quoted provider and the dispatched one could differ and the dispatch would be refused (fail closed, no spend). Next action: read `aiSettings` in `authorRoute` at that point.
- **Pre-existing control-plane test failures (not ours).** `no-ellipsis.test.js` (agents/roadmap-check.js:12 quotes the string "...") and `M3 program: an artifact sealed by the server accept path...` fail on base e062beedc too.

## Chat and Table of contents lane

Chat/ToC lane: deferred items (branch tutor/chat, code commits 1cf5a8332, 0bfc02915, 2229efe32)

Each item: evidence, impact, next action. None blocks the supported flow. All are unverified in a browser (owner rule).

1. Older invitations are not queued
   Evidence: RoadmapTranscript.jsx routes only the invitation the controller currently holds (roadmap.invitation, one per board and source set).
   roadmap-transcript.js entriesOf() draws that one; a second drop while a first invitation is still unanswered replaces it in state, and the first stored
   message stays in the thread with its buttons disabled (historyActions, no live counterpart).
   Impact: with two quick drops, the first source's Explain on canvas / Just keep it here is no longer clickable. It is not lost: the learner can drop
   again or ask in Chat. No multi-source roadmap is ever started silently (checklist 4.3 UI.01 requirement kept).
   Next action: a small queue in the controller (invitations list ordered by offeredAt, the oldest live) plus one live entry; add a roadmap-controller
   test for two sources in order.

2. Cross-device "Stay here" / Start new chat choice is browser-local (lead step 3, skipped)
   Evidence: the choice is stored in localStorage (rh.roadmap.route.<id>, rh.roadmap.ivthread.<id>) in RoadmapTranscript.jsx. The only server record of it
   is the route message itself (client_id roadmap-route-<invitation>, tutor.choice) in the occupied thread. roadmap-invitations.js has no column for a
   destination, and the invitation table has no thread field, so a server guard needs a migration (not allowed) or an invitation-id-to-thread
   lookup by scanning message meta.
   Impact: a second device that opens the board before choosing can show the chooser again and save a second route message (a different thread, same
   client_id) and a second invitation. The first writer still wins for the roadmap thread (bindTutorThread), so no card or charge is duplicated.
   Next action: a migration adding routed_thread_id and route_choice to learn_roadmap_invitations (written once, first writer wins, returned in the
   invitation view), then read it instead of localStorage. Needs the lead's migration GO.

3. Selected passage scope is shown but not selectable
   Evidence: RoadmapPlan.jsx renders the Scope select with "Selected passage" disabled unless the draft scope is already a passage; changing Scope is not
   wired (onChange is a no-op). Contracts.md revise accepts instruction and settings.depth/practiceMode only, no scope field.
   Impact: Scope is display-only; Full content is the default and the only choice after a whole-source draft. Roadmap 3.5 allows a supported selected-passage
   choice; this MVP leaves it to R7 / the backend revise route.
   Next action: backend adds scope to revise and a passage anchor; then wire the select to controller.revise({ scope }) and enable the option when a
   source selection exists.

4. Edit card opens the canvas editor, not a Chat composer pill
   Evidence: runner() in RoadmapTranscript.jsx maps edit_card to controller.openEditor() (the existing proposal overlay editor). The roadmap pill uses
   chat.editing (EditTargetPill) but only for command 'roadmap'.
   Impact: Edit card works (Ctrl/Cmd+K editor, R5 limits kept) but it is not the targeted pill checklist UI.04 bullet 11 prefers ("or the existing explicit
   canvas Quick Edit entry" is allowed, so this satisfies the either/or).
   Next action: if the owner wants the pill, set chat.editing to roadmapEditTarget for a proposal and route the typed text to controller.previewEdit then
   applyEdit in ask.jsx next to the roadmap branch.

5. Manual done marks on roadmap rows are per browser
   Evidence: TableOfContents.jsx stores them in localStorage rh.toc.roadmap-done.<roadmapId>; the board toc list holds only ordinary headings.
   Impact: a mark does not follow the learner to another device; it never means delivered, paid or understood (kept separate, as required).
   Next action: persist in the board's toc list (an added field on a roadmap row) or a server table; needs the lead's decision on the board format.

6. Go to highlighted text frames the source card only
   Evidence: use-roadmap.js go() kind 'source' calls host.focusBlock on the roadmap's source block; no inner scroll to the verified range.
   Impact: the card is framed, the passage is not scrolled to or emphasised; no wrong passage is ever shown.
   Next action: UI.07 (canvas lane): resolve the step's sourceRef to the rendered range through source-refs.js viewPassage and call it here instead.

7. Smaller notes
   - Chat entries are saved only while the Chat pane is mounted (RoadmapTranscript runs inside AskPanel). A step that advances while the pane is hidden
     is saved when it is shown again; the roadmap view on the server stays the record, so nothing is lost, only a delayed message update.
   - ask.jsx still contains the tocView branches (ChatComposer data-toc-composer, ModeSelector toc mode, chat-workspace toc thread/draft). They are inert
     now that nothing mounts a ToC conversation; removing them is a larger refactor of ask.jsx and was left alone (surgical-change rule).
   - LearnPage.jsx line 1358 comment still mentions TocConversation / TocWorkspace (lead-owned file, comment only).
   - e2e checks toc-tutor-check.mjs, toc-links-search-check.mjs, panel-header-check.mjs and toc-check.mjs still describe the removed ToC conversation
     (scripts/ci/check-map.json maps TocConversation.jsx to them). They are browser checks and were not run or edited; they will need rewriting or
     retiring by the lead.
   - packages/web/src/voice-ui.test.mjs (VOICE-08) failed in the full unit run before the merge; it pins AdaptiveCanvas's signature, which this lane
     does not touch.

## Canvas lane

## Canvas lane: deferred items (OWNER-INBOX lines, 2026-11-06)

Format per line: item | evidence | impact | next action. None of these blocks the supported flow (drop, plan, accept, card, next card, second card, reload).

- **Image anchors (UI.07, file 05 "Image")** | `Md.jsx` has no image rendering for Markdown `![alt](src)` (grep `<img` in Md.jsx: none), so a Markdown card draws no image block to outline; `FileDocMarkdown` tints prose, code lines, Mermaid diagrams and heading sections only. | A step whose passage is an image gets no persistent tint or View card button (the card, its View section and Chat navigation still work). | Add image rendering to the file card's Md (a separate Md feature), then add `shape: 'image'` to `anchorShape` and a `[data-tutor-anchor="image"]` outline; the quote must come from a resolved block id, not the filename (checklist UI.07).
- **Learner drag of a pending slot is not stored (UI.06 "learner drag is authoritative")** | `SlotCard` is `onPointerDown stopPropagation` with no drag handle; `AdaptiveCanvas` has no `moveSlot`; `roadmap-slots.js` stores one place per offer and the POST never overwrites it. | A learner cannot reposition a pending/generating Tutor slot; they can drag the DELIVERED card (the board stores dx/dy, which is then authoritative, and it survives reload). | Add a drag strip to the Tutor slot that calls a new `PUT` mode of `roadmap-slots.js` (explicit overwrite for the same proposal) and updates `roadmapSpots`; test in `roadmap-canvas.test.mjs`.
- **Passage geometry is measured only when the passage is visible in the source card's scroller** | `FileDocMarkdown` `measureRef` answers null unless the range is in view (so placement never scrolls or expands the source, per UI.06 7.3). | A passage that is scrolled out of the source card's view is placed beside the whole source card (honest fallback), not level with the paragraph. | If the owner wants true passage-level placement for offscreen paragraphs, estimate it from the rendered text offset ratio or map markdown offsets to heights; needs an owner decision, no code now.
- **Proposal excerpt and accepted words depend on backend view fields** | `C:/s/spec/tutor-sprint/requests/canvas-to-be-1.md` (results[] title/description/format, proposal.excerpt). Not in the view at e062beedc. | Slot shows no excerpt, and an applied Edit card title survives generation only within the session (kept by `planSlots`), not across a reload. | Lead forwards the request to the backend lane; canvas already consumes the fields when present (`roadmap-canvas.js`).
- **No browser evidence** | All canvas checks are Node markup/logic tests (explanation-card.test.mjs, canvas-slot-card.test.mjs, roadmap-canvas.test.mjs, roadmap-view.test.mjs, file-doc-highlights.test.mjs). | Scroll containment, downward growth, hover/focus reveal of View card, the Mermaid SVG, bottom pill centring beside the open panel, hidden-until-settled card and the blue outline are unverified visually. | Owner checks on the deployed main build per checklist 4.4 and 8.0.4 (files 02, 04, 05, 06).
- **Bottom Next card pill is centred over the canvas strip, not measured against the panel** | It is mounted inside `AdaptiveCanvas` `[data-canvas-bottom]` (the canvas's own box, which already excludes the open right panel), 8px above the chrome row. | If the zoom/minimap stack or composer is wide, the pill can sit near them; it never overlaps the world (it is outside the transformed layer). | Owner eyeballs at narrow widths; if it collides, raise it by the measured `chromeTop` rather than a fixed 8px.
- **Dark-mode pill colours use the file 02 hex values; light mode uses the `success`/`danger` tokens** | `NextStepPill.jsx` GO/STOP classes. | Light-mode green/red are token tints (not the exact file 02 light pair, which the reference does not define). | Owner confirms the light-mode look or supplies the light hex pair.
- **VOICE-08 unit test fails on the base commit too** | `voice-ui.test.mjs` expects an `AdaptiveCanvas` signature without `roadmap = null`; same failure on e062beedc. Not caused by this lane. | Red test in `npm run test:unit` for web. | Update that assertion (owner of voice tests).

## Lead

- Owner manual production acceptance of UI.01-08 and CORE.09 is pending; Node evidence does not prove physical layout, scroll, hover or focus behavior.
- check-map still maps the deleted TocConversation.jsx to toc browser checks (a check-map test pins that row); the toc-tutor browser checks describe the removed ToC conversation and need rewriting before they run again.
- Pre-existing failures not caused by this sprint: no-ellipsis.test.js (agents/roadmap-check.js line 12) and VOICE-08 (voice-ui.test.mjs).
