# Explain on Canvas implementation roadmap

**Rabbit Hole · Version 1.3 · November 6, 2026**

This roadmap builds the rebuilt Tutor through small production releases. Ship feedback, Depth and source navigation independently, then a complete Markdown-to-explanation flow. Add automatic proposals, research, computation, practice, preparation ahead and richer formats as separately verifiable capabilities. A release must provide working learner value rather than expose an unfinished plan-acceptance flow.

This revision replaces v1.2's execution order and reconciles its billing, publication, recovery and tool contracts. It consolidates repeated code inventories and preserves the feature scope through the decision register and legacy milestone map. It is an implementation plan, not a record that the proposed code has shipped. Existing owner decisions remain binding; proposed limits, new paid-testing budgets and operational production permissions are distinguished from those decisions.

**Verified code baseline:** Rabbit-Hole-App/Rabbit-Hole main at `4102f8ea0a0a38783e5b79144ef9748152f9ddc1`. Resolve main again before creating an implementation branch and inspect relevant changes. Line references in earlier drafts are snapshot references, not permanent truth.

## Contents

- [1 Scope and working rules](#1-scope-and-working-rules)
- [2 Learner experience and retained behavior](#2-learner-experience-and-retained-behavior)
- [3 MVP release ladder](#3-mvp-release-ladder)
- [4 Technical architecture and state](#4-technical-architecture-and-state)
- [5 Billing and durable recovery](#5-billing-and-durable-recovery)
- [6 Tools grounding and safety](#6-tools-grounding-and-safety)
- [7 Agents and integration](#7-agents-and-integration)
- [8 Verification and production release](#8-verification-and-production-release)
- [9 Decision register](#9-decision-register)
- [10 Legacy milestone coverage](#10-legacy-milestone-coverage)
- [11 Evidence and completion record](#11-evidence-and-completion-record)

## 1 Scope and working rules

### 1.1 First complete Tutor capability

The first Tutor release supports one readable Markdown source within a measured input bound, on an owned desktop canvas, with explanations only. Its complete path is source ready, invitation, editable proposed roadmap, plan acceptance, one step proposal, Tab or Cancel, actual text/table delivery, manual next step and an explicit stopping point. Source grounding, relevant text safety, correct charging, reload, access and sharing privacy ship with this path.

The first release does not silently summarize an unread long source as if it had read everything. When whole-source coverage is unavailable, identify the limitation and ask for a supported scope. Long-source indexing, PDF text, research and other tools expand this capability later. Never offer a format or source type that its deployed adapter cannot handle.

### 1.2 Cleanup and preparation

Keep Auto, Ask and Tutor. Retire the old Tutor implementation through the approved cleanup plan; do not maintain two active Tutor planners. Production integration of rebuilt functionality requires the applicable M0 cleanup receipt and compatible retained interfaces. Independent component work, fixtures and contract work can proceed in isolated branches while cleanup finishes.

Carry the cleanup decisions forward: retain archive-sensitive journey joins until the archive backfill is verified in each environment; keep Home teach requests by sending the original request/context into ordinary canvas Chat; retire the unused handoff endpoint with its last caller while preserving reusable repository reading. Do not accidentally delete retained assessment, Progress, Next Steps or ordinary Chat dependencies.

New work does not widen an existing agent's local-only execution permission. Production migration, exact-SHA release controls and existing authorized work remain as recorded. Do not ask again for a decision already recorded in the session.

### 1.3 Release boundaries

R identifiers below are production release units; M identifiers refer to legacy v1.2 implementation groups. A dependency means code or behavior that must exist, not simply the preceding row number. Shared contracts are frozen before dependent work; unrelated tools can ship in either order once their prerequisites pass.

The MVP path is the intended release path for this feature ladder, including editor access with focused authorization checks. Record the owner's MVP label before first use if it has not already been recorded. This document does not set the release variable or apply a migration. A later optional tool must not become a prerequisite for a ready earlier release.

## 2 Learner experience and retained behavior

### 2.1 Modes and invitations

- Auto answers normally and can initiate the Tutor invitation or respond to an explicit request to explain on the canvas. Tutor uses the rebuilt flow. Ask answers without initiating a roadmap.
- When a supported source finishes importing, invite in the right-side Chat once it is idle. Group sources becoming ready in the same idle window; do not interrupt typing or an active answer. Offer only **Explain on canvas** and **Just keep it here**, with free typing available.
- Dismissing an invitation dismisses that invitation only. It does not disable future invitations globally. Auto-suggest off suppresses unsolicited invitations/proposals, while explicit learner requests remain usable.
- On an empty canvas, use a meaningful title as a suggested topic. A generic or unrelated title triggers one focused question. Title-only support is a separately enabled R4 follow-up; it must obey the same grounding rules as source-based work and must not invent evidence when no source or qualified research is available.
- Questions about competing/incomplete sources appear in Chat. Bind an answer to the active question only when its context makes that intent clear; unrelated Chat turns remain ordinary clarifications. Do not fabricate a missing definition, assume a prerequisite gap from dismissal, or repeatedly prompt a learner who has declined.
- Preserve Home's useful teach entry point. Do not revive the retired journey or syllabus route to support it.

### 2.2 Outcome scope and roadmap

- Before card generation, propose an outcome, starting-point assumptions, selected scope, sequence and stopping point in the ToC. The outcome describes something the learner should be able to do.
- Scope, Depth and explanation/practice mode belong together in the ToC's learning settings. Keep ToC and Progress as separate existing right-panel tabs; keep Find, Comments and companion views.
- Depth is Overview, Standard or Deep. It affects Chat/slash answers as supported and the roadmap. Provisional roadmap ceilings are 5, 10 and 15 steps, not quotas. Use fewer when sufficient; avoid redundant or excessively advanced explanations.
- One coherent learning task per step; provisionally at most three independent cards. A step can combine formats after those adapters ship. It is not automatically a canvas group.
- Edit plan routes into the existing ToC conversation. A material scope, Depth, outcome or practice-mode change produces a revised plan for acceptance. Never silently rewrite accepted or delivered work.
- Visible section captures the selected passage and source version when chosen. Scrolling afterward does not change the scope. Whole source means coverage is established, with unreadable portions explicitly reported.
- Maintain one unfinished roadmap per learner per canvas. A second source is context until the learner includes it in a revised plan. Existing plain ToC headings remain alongside the private roadmap.
- ToC entries navigate to the corresponding proposal or delivered cards. An entry with neither does not pretend there is content to navigate to.

### 2.3 Proposal acceptance and editing

- A **step proposal** is an offer, with title, description, proposed formats and roadmap position. A **skeleton** means an accepted artifact is being created. Preserve that distinction in state and UI.
- Show one pending proposal. Its compact square pill is **Accept [Tab] | Cancel**, with the agreed green/red treatment. No price, estimate or maximum is shown in desktop Tutor proposals. Server authorization still records the bound.
- Tab can debit credits. It accepts the active proposal only when keyboard ownership belongs to the canvas/proposal, no editor/modal owns the key and Shift is not held. Tab in the composer or another control retains normal focus behavior.
- Acceptance means the learner wants the addition, not that they understand it. Cancellation alone does not establish why it was declined.
- Quick Edit uses Ctrl/Cmd+K. Applying its preview uses Ctrl/Cmd+Enter and creates a new proposal version; it does not generate the cards. Esc leaves the original proposal unchanged. Tab accepts only after the editor closes.
- Reuse existing Add to Chat and editing affordances without cramping the card controls. Before proposal editing ships, use plan/Chat revision as the functional editing route and omit dead Edit placeholders.
- Cancel marks the proposal cancelled and pauses automatic progression. Manual Propose next step can request the next independent step; it does not automatically recreate the cancelled proposal. A prerequisite dependency must be resolved explicitly.

### 2.4 Placement delivery and progression

- Place explanations outward around the dropped source where space is available, not on one mandatory side. Use the source/step anchor, existing card bounds and collision-aware placement; preserve user movement.
- Link explanations to precise source passages or regions. Show the relevant highlight on interaction, with a subtle View explanation affordance. If the source changed and an anchor no longer resolves, mark it changed rather than highlighting a guessed passage. Use arrows only when they clarify a relationship, not for every card.
- Multi-card steps use independent card IDs and a shared private step relationship. The learner may group them. Delivery and reload use server-minted IDs so retries cannot duplicate cards.
- Do not move the camera automatically when a quiet next proposal arrives. If it is offscreen, the compact Next step ready indicator navigates to it; it does not accept or generate another step. Propose next step remains in the ToC.
- Propose the next step only after the current accepted step's deliverable cards are ready or its failure is resolved. Automatic proposal composition and speculative artifact generation are separate releases and mechanisms.
- Switching to Ask pauses unsolicited work; accepted generation can finish. Resume in Auto/Tutor respects Auto-suggest and any explicit cancellation pause. Turning Auto-suggest off on another device takes effect without requiring a reload.
- Respect the stopping point and ceiling. Continuing beyond it requires a new explicit learner request/revised scope; do not quietly expand the session.
- End roadmap preserves delivered cards and history. Removing a delivered card leaves its delivery record with a removed marker. Undo is a canvas removal, not an automatic refund.
- Learner-created slash/Quick Edit cards stay outside the roadmap unless explicitly linked as a step. Their private feedback and applicable assessment can still inform Progress. Linking existing content creates no generation charge. Different version replaces unaccepted results only; earlier delivered cards and assets remain available under their normal lifecycle.

### 2.5 Practice evidence and Progress

- Offer Explanations only initially; enable Explanations plus practice once assessment and Progress support ship. Never expose a practice setting whose promised behavior is unavailable.
- Practice timing depends on context, difficulty, thumbs and demonstrated evidence. Do not enforce a fixed two-to-one rhythm or a mandatory homework sequence.
- A learner can accept practice and answer later. Unanswered practice is not failure and does not freeze independent explanations. If answered now, use the evidence to inform the next appropriate unaccepted step.
- Use the existing Explain-back assessor for open responses and immutable keyed quiz activities for choices. Assessment remains free. Do not revive a shadow grade or turn JEV routing output into mastery evidence.
- One thumbs pair appears under each generated card, with hover-only presentation and blue selection for either thumb. Imported source cards and pending proposals have no understanding rating. Keep keyboard operation accessible and test focus presentation explicitly without making selection alone permanently reveal the controls.
- Thumbs are private self-reports, distinguishable from assessed evidence. Progress works without requiring a personal goal. It shows what the learner reported or demonstrated; the ToC shows coverage, delivery and navigation.
- Explain prerequisites on the same canvas. Open a Rabbit Hole only when the learner chooses it; preserve ordinary manual Rabbit Hole behavior throughout cleanup and rebuilding.

### 2.6 Sharing formats and deferred scope

- Shared readers see permitted delivered cards, not private proposals, roadmap state, feedback, evidence or charges. Forks copy permitted content and headings without inheriting a roadmap or private step relationship. Preserve useful source references only where access permits them.
- Editor support is a later isolated release with separate board-owner, acting-learner and payer identities. Two editors have separate roadmaps/evidence. Revocation stops further privileged actions.
- The Tutor may use supported generation commands other than `/goal`, which remains the learner's personal-goal action. Browser, photos, YouTube, arXiv and Wikipedia cards are explanation resources; notebook can support explanation or practice. Code examples are not automatically assessed exercises.
- Whiteboard integration refers to the existing narrated-video capability, not the retired drawing tool. Integrate existing rich-format handlers one at a time; this roadmap does not reopen unrelated Animation engineering.
- Desktop first. Mobile layouts, cross-user reuse, prefilled notebooks, reward mechanics and voice-driven Tutor steps remain separately scoped. Record unaccepted results and needed metadata for possible later reuse without enabling cross-user reuse now.

## 3 MVP release ladder

Release IDs describe deployable increments; they are not a serial calendar. Legacy M IDs identify work carried forward from v1.2. A release may take a defined portion of an old M task, but its receipt must name that portion and the remaining release. Every release follows the common build, focused-check, identity, recovery and production procedure in section 8.

M0 remains the cleanup prerequisite for integrating the new Tutor. Preserve its archive-backfill ordering and the retained Chat, Home and repository-reading capabilities. Teams may prepare contracts, components and fixtures in parallel with cleanup, but do not integrate code that assumes unverified removals. The integrator reads the M0 receipt and refreshes the main-code baseline before merging.

### 3.1 Dependencies and useful production outcomes

| Release | Production outcome | Hard dependency |
| --- | --- | --- |
| R1 | Card feedback and a private Progress readout | M0 |
| R2 | Depth and persistent suggestion settings | M0 |
| R3 | Two-way source passage navigation | M0 |
| R4 | Complete Markdown explanation loop with manual progression | R1, R2, R3 |
| R5 | Proposal editing, positioning and existing-card reuse | R4 |
| R6 | Automatic next proposals without speculative card generation | R4 |
| R7a | Long Markdown indexing and coverage | R4 |
| R7b | PDF text sources and page references | R7a retrieval contract |
| R8a | Scoped web research and fetched evidence | R4 |
| R8b | Verified arithmetic and computational evidence | R4 |
| R9 | Optional practice and assessed Progress | R4 |
| R10 | Evidence-based adaptation and expanded revisions | R1, R5, R9 |
| R11 | Platform-funded speculative card preparation | R6, R5 version contract |
| R12a onward | Additional generation formats, one adapter per release | R4, R5, the chosen command prerequisites |
| R13 | Repository-backed Project canvases | R4 and repository adapter |
| R14 | Editor access with private evidence and correct payer | R4, R9 |
| R15 | Image, notes and OCR source adapters | R7 retrieval contract and relevant vision checks |
| R16 | Isolated code execution | R4 and execution service qualification |

R1, R2 and R3 can be implemented concurrently with non-overlapping ownership. R4 includes all three so newly delivered cards have the agreed feedback, Depth and source navigation. Its contracts and backend work can proceed before those integrations finish. After R4, the editing, automatic-proposal, source, research, calculation and practice work can proceed independently. R10 consumes evidence and revisions already shipped. R11 does not depend on research, every media adapter or the general sandbox. R14 does not depend on all rich formats; a later format must extend its editor-access tests before being enabled for editors.

R4 is the first public Tutor release. Do not expose an Accept plan action that cannot deliver an explanation. Intermediate invitation-only or planner-only builds stay internal. Likewise, do not expose unsupported options or disabled placeholder controls merely to match a future mockup.

### 3.2 R1 Card feedback

**Legacy coverage:** M1.1–M1.6. **Owners:** UI and State, with independent verification. **Files:** `CardFeedback.jsx`, `card-feedback.js`, `card-feedback-routes.js`, `AdaptiveCanvas.jsx`, `LearnProgress.jsx` and a numbered additive feedback migration. New filenames describe planned work.

- Store one private up/down/null feedback value per learner, canvas and generated card. Authorize the board and validate that the card exists; do not write feedback into shared card JSON.
- Add the agreed hover treatment and blue selected state under generated cards. Imported source cards and unaccepted proposals have no feedback control. Preserve keyboard operability and specify its focus behavior in the UI reference rather than contradicting the hover requirement in tests.
- Show current-canvas feedback in Progress even without a personal goal. Keep these self-reports distinct from assessed evidence; no planner adaptation is implied yet.

**Acceptance and smoke:** rate a real generated card, reload, clear the rating and inspect Progress with and without a goal. A shared view exposes neither controls nor private feedback. Deleted-card feedback does not produce a broken navigation target. Use the focused card-feedback store and browser checks.

### 3.3 R2 Depth and suggestion settings

**Legacy coverage:** M2.1–M2.7. **Owners:** UI, State and Tools. **Files:** `ModeSelector.jsx`, `ask.jsx`, `chat-modes.js`, `learn-user-settings.js`, coaching store/client, `chat-depth.js`, slash dispatch and the existing explanation job.

- Persist Depth per learner/canvas and Auto-suggest per learner using additive sidecar tables. Keep Auto, Ask and Tutor. Propagate settings across open tabs without changing another learner's settings.
- Pass Depth through ordinary Chat, supported artifact paths and both explanation paths, including the v2 job record, brief and author input. Test with v2 enabled, not only the artifact fallback.
- Keep the existing composer controls. Show Auto-suggest in Auto/Tutor and hide it in Ask. Before R6, the setting governs existing permitted suggestions and, once R4 ships, its supported invitations; do not claim automatic roadmap progression is already available. If cleanup leaves no applicable suggestion behavior before R4, persist the preference but hide its toggle until it controls a deployed capability.

**Acceptance and smoke:** Overview versus Deep reaches the actual model input and changes the intended output depth. Preferences survive reload and a second canvas; Ask remains answer-only. A controls-only visual test is insufficient.

### 3.4 R3 Source passage references

**Legacy coverage:** M3, with the reusable source-reference portion of M12.3. **Owners:** UI and State. **Files:** `source-ref.js`, `source-refs.js`, `SourceRefChip.jsx`, Markdown/PDF anchor helpers, inline selection, artifact delivery and the explanation job/client.

- Carry an authorized source ID, immutable revision and passage/page anchor from a selected source through creation, job persistence and the delivered card.
- Implement card-to-passage and passage-to-explanation navigation. Use subtle existing affordances, temporary highlighting and optional connections only where useful; do not draw an arrow for every relationship.
- Detect changed, missing or inaccessible sources. Do not jump to an unrelated match. On forks, preserve/repoint only references the fork may access; private source bodies are never copied by inference.

**Acceptance and smoke:** generate from a selected Markdown passage and a supported PDF excerpt, navigate both ways after reload, then test source revision/deletion and sharing. This release does not imply full-document PDF planning.

### 3.5 R4 Complete Markdown explanation loop

**Legacy coverage:** M4's bounded-source invitation/planning foundation; M5's text/table proposal, billing, delivery and recovery; the essential pause/Cancel portion of M7.9; basic settings revision, stopping and preservation from M11; deletion/share/fork safeguards from M12.2–M12.3. Extended tools remain assigned below.

**Owners:** State, UI and Tools, integrated as one complete slice. **Files:** `roadmap-routes.js`, `roadmap-store.js`, `roadmap-jobs.js`, `roadmap-generate.js`, `roadmap-publish.js`, policy/validator/prompts, required migrations, `use-roadmap.js`, `NextStepPill.jsx`, Chat/ToC components and canvas proposal/delivery code.

- Support one readable Markdown source within a declared processing bound, or a deliberately selected passage. Read the selected scope completely. If whole-document coverage exceeds the supported bound, explain that limitation and offer clarification; never silently treat a prefix as the whole source.
- Preserve the original learner `instruction` in the create request, stored roadmap, draft/revision inputs and scorer. It overrides an inferred topic: “I already know X, teach me Y” must not become a plan to reteach X.
- Deliver the two-choice invitation in Chat, with dismissal scoped to that invitation. Create a server-owned proposed roadmap with outcome, assumptions, supported formats, finite steps and a stopping point. Revise it through the ToC conversation and require plan acceptance. Empty/title-only entry is a separately enabled R4 follow-up after its clarification and grounding tests pass; it does not block the bounded-Markdown release. Generic context asks one focused question before planning.
- Offer one selectable text/table proposal with title, description, source relationship and Accept/Cancel. Tab accepts only when that proposal owns the keyboard context. Accept creates committed generation slots; Cancel pauses automatic invitations/progression for that proposal. Plan acceptance never authorizes every future card at once.
- Implement R4 text/table delivery through the explicit roadmap-only adapter in section 4.1, reusing the existing artifact generator with a trusted server-enforced format allowlist. This is a scoped routing exception, not existing `/explain` behavior; keep typed/Quick Edit `/explain` unchanged.
- Implement stable acceptance/provider identities, atomic step reservations, bounded retries and refunds, checked publication and idempotent browser insertion. An accepted result is served only under the entitlement contract in section 4. Reload and concurrent actions restore the same state without another purchase or card.
- Provide manual Propose next step, ToC navigation, End roadmap, the ceiling/stopping point, basic Scope/Depth revisions and explicit continuation. If the pending proposal is offscreen, the compact Next step ready indicator navigates to it without accepting or generating. Ask mode pauses new Tutor initiative while accepted work can finish. A failed card has usable Retry/Replace/Omit recovery in Chat and ToC. Deletion retains the delivery record; sharing/forking removes private roadmap state.

The initial roadmap offers Explanations only. Hide the practice choice until R9. Relevant source grounding, text safety, permissions and billing checks ship here; web research, OCR, media screening and arbitrary execution are not prerequisites for this narrow capability.

**Acceptance and smoke:** drop a real bounded Markdown source; dismiss one invitation; start another, revise/accept its plan, Tab one proposal and receive an actual explanation. Then cancel, request the next independent step, navigate to an offscreen proposal, change Depth, reload, open a second device and reach the stopping point. Include duplicate acceptance, failed-card refund, stale version, learner-instruction priority, feature-flag recovery and private-share cases. A planner-only pass does not satisfy this release.

### 3.6 R5 Proposal editing and reuse of existing cards

**Legacy coverage:** M6.1–M6.8. **Owners:** UI, State and Tools. **Files:** inline AI targeting/editor, selection actions, roadmap routes/store, proposal drafts migration, `NextStepPill.jsx` and proposal composer.

- Reuse Ctrl/Cmd+K with a separate draft preview. Apply writes a new pending proposal version; Esc leaves the original unchanged. Tab accepts the step only after the editor closes. A concurrent acceptance makes an obsolete Apply fail safely.
- Add a proposal context reference to Chat and improve learner-directed proposal positioning. Preserve R4's existing offscreen-ready indicator and navigation; editing is not a prerequisite for discovering a pending proposal.
- Support learner-selected and Tutor-proposed links to an existing card when it already covers the step. Linking has an explicit zero-charge outcome. Validate the card again at acceptance; deletion requires a fresh proposal, not a broken link.

**Acceptance and smoke:** edit content/format, dismiss a preview, apply another and accept once. Add the proposal to Chat, navigate from the ready indicator and link an existing card with no debit. Old delivered cards survive different-version proposals.

### 3.7 R6 Automatic next proposals

**Legacy coverage:** M7.1, M7.7–M7.9 and proposal-side readiness/recheck logic; no M7.2 speculative charging yet. **Owners:** State, UI and Tools. **Files:** roadmap jobs/store/client, settings/mode events and proposal composer.

- Pre-compose the next proposal metadata where useful, but show it only after the currently accepted step has finished. Keep one visible pending proposal, no camera jump and no repeated Chat prompt.
- Auto-suggest off, Ask, Cancel and End stop further unsolicited work. Resume from the existing roadmap without duplicating proposals. Accepting is permission to add content, not evidence of understanding.
- Persist mode/settings facts and durable versioned notifications. Measure delivery-to-next-proposal readiness; the 1–2 second goal is a target reported with actual measurements, not grounds to omit checks.

**Acceptance and smoke:** complete a step, see one next proposal, switch modes and preferences repeatedly, cancel and resume across devices. No unaccepted card generation occurs in this release and no learner charge comes from proposal composition.

### 3.8 R7 Source coverage expansion

**Legacy coverage:** M4.20 and the long-source portions of M4.1–M4.3 and M4.6; PDF portions of D5 and the source index. M4.18's captured Visible-section scope remains in R4. **Owners:** Tools and State, with UI limitation handling. **Files:** `roadmap-source.js`, source index migration/store, index prompt, existing Markdown and paged-PDF readers.

- **R7a Long Markdown:** deterministic chunks, whole-document outline, bounded summary batches and retrieval of original evidence. Persist partial/unreadable coverage and versioned caches. Repeated headings and enormous single sections must remain addressable.
- **R7b PDF text:** reuse `context-doc-pages.js` and `pdf-pages.js`; retain page references, extraction origin and coverage. Scanned or damaged pages are unreadable until R15 supplies a qualified vision path. Do not conflate R3 passage navigation with full PDF planning.
- Keep each source adapter independently enabled and testable. A source change invalidates affected pending/prepared content while preserving previously delivered cards and their historical references.

**Acceptance and smoke:** explain a late section beyond the original bound, a headingless/oversized section and a PDF page near the end. Exhaust the budget and verify a visible limitation rather than fabricated coverage. Reject unauthorized cached reads.

### 3.9 R8 Research and calculation tools

**Legacy coverage:** M4.21 (research), M4.22 (calculator), D40 and D41. The shared M4.23 dispatcher and M4.19 safety enforcement begin in R4 and expand with each tool. **Owners:** Tools and State.

- **R8a Scoped research:** implement `roadmap-research.js` around existing `discoverSources`, `evidenceFetcher` and `EvidenceRecord`. Research a named gap, read candidate pages and keep provenance. Validate outgoing queries against private material and reserve platform quotas before calls. Unsupported/paywalled sources become limitations. Optional source-card command adapters can follow independently; research itself never requires buying a browser card.
- **R8b Calculator:** implement a restricted deterministic expression evaluator, resource bounds and computational evidence. Verify finite results and retain inputs/evaluator version. Do not use `eval`, install arbitrary packages or execute uploaded code.
- Keep both tools platform-funded and flag-controlled. Their absence does not invalidate source-supported R4 explanations; requests that need them are limited until the relevant release ships.

**Acceptance and smoke:** research an undefined public concept with fetched citations; refuse a private-data query and handle provider failure. Separately verify a derived arithmetic answer and refuse unsafe expressions. Each tool earns its own release receipt.

### 3.10 R9 Optional practice and assessed Progress

**Legacy coverage:** M9.1–M9.6, plus the practice-mode activation of M4's settings. **Owners:** State, UI and Tools. **Files:** roadmap goal/binding, attempt store/routes, existing rubric assessor, keyed quiz assessor, `LearningBlocks.jsx` and Progress.

- Add Explanations plus practice to the roadmap settings. Mix practice when context and learner signals make it useful, without a fixed two-to-one rhythm. Accepting practice does not require answering immediately or block the next context-based step.
- Bind quizzes to immutable content-addressed activity snapshots with integer revisions. Grade the question actually shown; never silently rebind an old answer. Explain-back uses the retained assessor. Unsupported keys are unscored, not negative evidence.
- Create private roadmap evidence containers without requiring Set a goal. Show assessed status separately from thumbs. Commit evidence and its notification together, deduplicate assessment replay and keep assessment free.

**Acceptance and smoke:** answer now, answer later, change a quiz after display, replay a submission and inspect private Progress. Verify one assessment and no grading debit. Flashcards may be suggested for practice, but viewing or accepting them alone is not demonstrated mastery.

### 3.11 R10 Adaptation and expanded revisions

**Legacy coverage:** M10 and the advanced portions of M11. **Owners:** Tools, State and UI. **Files:** adaptation prompt/evals, roadmap jobs/store, feedback/assessment events, Chat routing and ToC.

- Adapt the earliest unaccepted work using assessed evidence, learner instructions and self-reports with their distinct validity. A cancellation alone does not establish a knowledge gap; a wrong answer does not automatically imply the same remedial action every time.
- Add a prerequisite on the same canvas when justified, or ask one focused question. Already understood adjusts coverage without creating fabricated assessment evidence. Rabbit Holes open only by learner choice and preserve a return point.
- Incorporate a second source through an accepted revision; ask when its relationship is unclear. Different version keeps earlier delivered cards/assets, supersedes unaccepted work only, and charges only on a new acceptance. Prerequisites and delivered steps count toward the accepted ceiling.

**Acceptance and smoke:** conflicting thumbs and quiz evidence remain visible to adaptation; an irrelevant card is not re-proposed mechanically. Include a second source, revise scope and make a different version without deleting the original. Stop at the agreed outcome until explicit continuation.

### 3.12 R11 Speculative card preparation

**Legacy coverage:** M7.2–M7.6 and preparation-specific timing/expiry tests. **Owners:** State and Tools, with independent money verification. **Files:** roadmap money/result mappings, learner charge primitive, provider identity hook, jobs, expiry and owner cost report.

- Prepare only eligible N+1 content under platform usage while N is pending. Recheck the accepted context/version before reuse. Expensive media and paid planning remain acceptance-first.
- Keep checked preparation inaccessible until that result/version is accepted, its learner billing outcome is valid and access remains authorized. Reconcile every contributing provider operation and atomically charge once without adding another provider expense.
- Cancel unnecessary work on pause, cancellation or revision where possible; keep completed unaccepted results under the agreed retention rules. Expire only unaccepted assets. A pause itself does not delete anything; accepted assets follow delivered-card lifecycle rules.
- Report platform preparation expense separately from learner charges. Test crash boundaries, refunds, unknown provider outcomes, insufficient balance and simultaneous acceptance before enabling reuse.

**Acceptance and smoke:** accept one prepared card from two devices and receive one charge and one card; read attempts before acceptance are refused. Cancel another and see zero learner debit. Revisions never reuse stale content or delete old delivered media.

### 3.13 R12 Additional formats one adapter at a time

**Legacy coverage:** M8 and non-text format portions of M5. **Owners:** State, Tools and UI. Each adapter gets its own candidate and focused receipt; none waits for all other formats or R11.

- Start with the smallest existing ready adapter. Separate releases may add code snippets, graphs/diagrams, source cards and empty notebooks, then image, whiteboard, motion, interactive explanation, CAD or technical 3D. Formats are eligible only when the command and required validation are enabled. Preserve the agreed explanation/practice classification; an empty notebook may serve either purpose.
- Reuse command generation and validation rather than rebuilding those products. Bind all phases to acceptance/card identity. Keep existing agreed content-plan reviews; derive purchase authorization from Tab where approved. D2(b) keeps the explanation brief but removes the redundant roadmap Generate wait only after its explicit override is recorded.
- A longer duration, changed format or exceeded authorization bound produces an updated proposal before further spending. Preserve command-specific refunds and disclose their outcome through existing usage/error surfaces without adding Tutor price labels.
- Validate the actual supported output modality and prevent result leakage through legacy job or asset endpoints before the Tutor publication checks pass. Existing standalone command behavior remains unchanged unless explicitly required.

**Acceptance and smoke:** one real qualified result for the chosen adapter, duplicate acceptance, plan-bound change, failure/refund and relevant access cases. Do not require seven paid-command runs to release one adapter. Animation implementation remains with its existing owner; any later Tutor adapter is coordinated separately and does not authorize changes to Animation internals.

**Tutor command catalogue.** These are Tutor-enablement releases, not claims that the existing standalone command must be rebuilt. Each R12 adapter is optional and releases independently after its own checks. The learner-only `/goal` command is excluded. “Either” means the roadmap purpose selects explanation or practice; it does not imply automatic assessment.

| Command | Classification and format | First Tutor release |
| --- | --- | --- |
| `/explain` | Explanation: text, comparison table; later interactive visual | R4 text/table; separate R12 interactive adapter |
| `/practice` | Practice: explain-back, including supported multiple-choice mode | R9 |
| `/quiz` | Practice: multiple-choice question and feedback | R9 |
| `/flashcards` | Practice: question-and-answer cards | R9 |
| `/code` | Either: Python snippet as example or exercise | Individual R12 code adapter |
| `/graph` | Explanation: interactive function graph or data plot | Individual R12 graph adapter |
| `/diagram` | Explanation: node-and-arrow or Mermaid diagram | Individual R12 diagram adapter |
| `/notebook` | Either: empty notebook for code, calculations or exercises | Individual R12 notebook adapter; execution separately qualified |
| `/image` | Explanation: generated image | Individual R12 image adapter |
| `/motion` | Explanation: animated explainer video | Individual R12 motion adapter |
| `/whiteboard` | Explanation: narrated whiteboard video (`whiteboard-video`) | Individual R12 whiteboard adapter |
| `/cad` | Explanation: dimensioned CAD model | Individual R12 CAD adapter |
| `/animation` | Explanation: live interactive 3D scene | Separately coordinated R12 adapter to the existing feature |
| `/3d` | Explanation: technical 3D scene through Blender | Individual R12 technical-3D adapter |
| `/browser` | Explanation: saved webpage card | Individual R12 browser adapter |
| `/photos` | Explanation: photo search and credited photo | Individual R12 photos adapter |
| `/youtube` | Explanation: search and add an existing YouTube video | Individual R12 YouTube adapter |
| `/arxiv` | Explanation: search and add a research paper | Individual R12 arXiv adapter |
| `/wikipedia` | Explanation: search and add a Wikipedia article | Individual R12 Wikipedia adapter |

Source-card adapters use their command-specific search and retrieval paths; they do not wait for every research tool or other source-card adapter. Learners may already invoke standalone commands before Tutor integration ships. Only enabled and qualified Tutor adapters may appear in its proposals.

### 3.14 R13 Project canvases

**Legacy coverage:** M12.4 and its focused checks. **Owners:** Tools, State and UI. Reuse repository snapshots, source maps and citation/navigation components.

- Plan from authorized repository evidence with commit, path and line references. Read actual code, distinguish unindexed versions from absent information and never claim a code read that failed.
- Preserve the existing Project view. The roadmap complements ordinary headings; it does not restore retired journeys or fixed Tutor-codebase activities.
- Revalidate changed repository snapshots and support an explicit learner request without forcing a personal goal.

**Acceptance and smoke:** explain a real Project scope, navigate a cited range, change the repository revision and refuse unauthorized source reads. This release does not depend on media support.

### 3.15 R14 Editors and shared canvases

**Legacy coverage:** M12.6 and final access assertions in M12.3/M12.5. **Owners:** State with UI and independent verifier. **Files:** canvas access, board/source/job readers, roadmap/billing/attempt paths and share/fork helpers.

- Separate board owner, acting learner and payer. Resolve the shared board with owner authority while keeping the editor's roadmap, feedback, attempts, Progress and charges private to that editor.
- Recheck permission at accept, generation, delivery and resume. Handle revoked access without further unauthorized work/debits; preserve legitimate already-delivered shared content under existing rules.
- Verify owner, editor, reader, commenter, stranger, revoked member and two simultaneous editors across the entire supported flow. Readers never gain access merely by knowing a result or source ID.

**Acceptance and smoke:** the second session creates a roadmap, receives a card and answers a quiz on the shared board; only that session sees its private evidence and charges. Revocation and cross-user direct reads fail. Use the MVP path if the owner adopts D44(b), with this access matrix mandatory.

### 3.16 R15 Images notes and OCR

**Legacy coverage:** D5/D42 and the former M13 deferral. **Owners:** Tools, State and UI. Use the R7 source adapter contract and a separately registered figure/OCR role.

- Add readable notes and images as independently enabled source adapters, preserving source version, crop/page anchor and extracted-text origin.
- Inspect actual figures, captions and scanned pages. Preserve uncertain symbols and coverage gaps; do not turn guessed OCR into a factual answer or graded key.
- Apply the corresponding multimodal input/output checks and authorized caching before enabling the source type for Tutor planning.

**Acceptance and smoke:** explain a supported image/notes source, an uncertain equation and a partly unreadable scan. Confirm useful supported content is retained while limitations remain explicit.

### 3.17 R16 Sandboxed execution

**Legacy coverage:** D41 general execution and former M15. **Owners:** Tools and State with independent security verification. A separate execution service is proposed; the existing CAD isolation code is only a precedent to audit.

- Execute only explicit bounded Tutor computations in an isolated service with pinned runtime/packages, no credentials, denied network, restricted storage, process/resource limits and cleanup. Importing a file never executes it.
- Persist code/input hashes, runtime version, actual output and failure limits as computational evidence. Distinguish a displayed example from an executed program.
- Test egress, escape attempts, runaway processes, large output, cancellation and crash cleanup before making the capability available.

**Acceptance and smoke:** execute a small supported computation with reproducible output; prove network and resource restrictions; show a truthful limitation on failure. This release is not a prerequisite for the calculator or earlier code examples.

## 4 Technical architecture and state

### 4.1 Server authority and existing infrastructure

Use the existing React and Vite client, Workers JavaScript modules, D1 and R2. Add `RoadmapJobs`, one Durable Object per learner and board, to coordinate background stages. D1 holds durable decisions and records; R2 holds immutable source derivatives and generated assets. The browser renders proposals and places authorized cards. It does not own the learning plan or decide whether a charge is allowed.

Use existing model, usage and telemetry transports. New module names in this section are implementation targets, not claims that they exist on main. Do not add an agent framework or vector database for the initial release. Existing command jobs remain responsible for their own generation and rendering; the Tutor adds bounded, versioned orchestration around supported paths.

For R4, add a trusted server-only roadmap text/table adapter over existing `generateArtifact`, with a validated intersection limited to `explanation` and `table`. Reuse its schemas, renderer and usage transport. Current `/explain` dispatch is `startExplain` first and its v2 job waits for Generate; it does not already provide this narrow flow. Keep learner-typed and Quick Edit `/explain` routing unchanged, test the existing v2 and artifact paths, and do not trust public `body.allowedPrimitives` to enforce the limit. Test that other artifact families cannot escape the roadmap allowlist. Record this scoped D2 routing exception before activating R4; the later interactive adapter retains the v2 brief and has its own bound acceptance override.

Every server action receives an authenticated access object containing organization, acting learner, board identity, role and payer. Before R14, new Tutor execution uses owner-only Learn access. R14 introduces editor access with separate board-owner, acting-learner and payer identities; the board owner is never charged merely because an editor uses their canvas. Every adapter enabled after R14 must extend the editor access matrix before supporting editors. Recheck access before acceptance, generation, delivery and resume. Revocation prevents new actions and charges while preserving the audit record.

Keep `ROADMAP_ENABLED` off until the complete R4 loop is ready. When it is unset or not `true`, all roadmap routes return 404 and roadmap UI is hidden; R1–R3 remain independent. Keep the DO binding and durable records. Stop new unsolicited work. Already accepted work may complete server-side, but cannot bypass publication checks or disabled routes; the recovery release must restore delivery or refund within the bounded delivery deadline. Test flag-off during generation and after settlement, with no duplicate charge when restored. An enabled tool registry advertises only capabilities that have shipped and passed their applicable checks. Later research, source adapters, speculative generation and media use separate capability flags; disabling one leaves supported independent work usable.

### 4.2 Records and migrations

Add tables in the release that first consumes them. The integrator allocates migration numbers from current main; the old proposed numbers are not reservations. Follow the repository's additive CREATE-only migration rule. Production application remains an owner-controlled release action.

- R1 adds private per-card feedback keyed by learner, organization, board and card. It is not stored on shared card content.
- R2 adds per-user Auto-suggest settings and a per-learner, per-canvas Depth sidecar. Do not alter existing CHECK constraints or add columns through a migration that forbids them.
- R3 adds source references with source identity, immutable version, location and resolution status.
- R4 adds roadmaps, invitations, steps, proposals, generated results, action replay records, platform-call reservations and a durable event outbox. Results must exist before generation first writes them.
- R5 adds proposal-edit drafts. Applying a draft creates a new proposal version; closing the editor leaves the accepted data untouched.
- R7 adds indexed source derivatives and coverage records; R11 adds the result-to-provider-operation and learner-charge mappings needed for prepared results.
- R9 reuses goals, criteria, activities, attempts, assessments and observations. A hidden roadmap goal uses the existing `coaching` origin and a distinct ID prefix, rather than requiring the learner to create a personal goal. The Progress read model distinguishes card self-reports from assessed evidence.

Persist the learner's original `instruction`, selected scope/version, Depth and practice mode in the roadmap input. Pass the instruction unchanged into draft and revision input, retaining later explicit edits as versioned instructions. Do not replace it with the inferred source subject.

All new records carry ownership and scope. Server-generated IDs and immutable content/version fingerprints are required; a client-supplied identifier is never proof of access. Generated card metadata may include `step_id` and `source_ref`, but private roadmap, feedback and assessment data stay in learner-scoped records. Sharing and fork sanitizers ship with every new card field. Forks retain permitted source references and ordinary content, but no inherited roadmap, step relationship, observations or charges.

### 4.3 States and replay invariants

Use one shared enum/schema module in server validation, client rendering and tests. Separate concepts that v1.2 combined:

| Record | States or dimensions |
| --- | --- |
| Roadmap | `draft`, `questioning`, `proposed`, `active`, `paused`, `completed`, `ended`, `failed`; a revision has its own version and acceptance. |
| Step | `planned`, `proposed`, `generating`, `delivered`, `incomplete`, `cancelled`, `skipped`, `already_understood`. Answered and card-removed indicators are separate metadata. |
| Proposal | `checking`, `held`, `pending`, `accepted`, `cancelled`, `superseded`, `blocked`. Only a checked pending version can be accepted. |
| Result generation | `pending`, `generating`, `generated`, `failed`, `expired`. |
| Result validation | `pending`, `checking`, `passed`, `held`, `blocked`. A changed input sets `stale = true` and invalidates the relevant cached checks. |
| Result decision | `none`, `accepted`, `cancelled`, `superseded`. Record the accepted proposal and result versions explicitly. |
| Result delivery | `not_delivered`, `delivered`, `removed`, with card ID and board-save acknowledgement. |
| Billing outcome | Explicitly pending, settled, refunded, failed or zero-priced, reconciled with the existing usage records. |

One unfinished roadmap exists per learner and board, including paused and questioning states. One offered step occupies the roadmap's proposal position; a held proposal must not produce a second competing offer. Guard actions with expected roadmap revision, proposal version, unique action identity and actor/result fingerprint. The first valid action wins; repeat actions return the recorded outcome, while conflicting stale actions return 409 with current state.

The accepted result's binding remains valid after later steps or proposal versions are created. A new version must not delete an earlier delivered card. Deleting a card changes delivery metadata but does not erase its history. Undo follows normal deletion behavior and does not reverse a completed purchase. A source change invalidates affected unaccepted content and displays changed references on historical content rather than silently rewriting it.

### 4.4 Publication and placement

Before first publication, require all of the following: generation succeeded; applicable grounding, safety and format checks passed; this result version belongs to a valid accepted proposal; the billing outcome permits delivery; and the requesting actor has access. A link to existing content follows its explicit zero-price rule and still requires access.

A prepared R11 result can pass checks while its decision remains `none`. It must remain private. Polling returns only proposal metadata before acceptance, not generated text, answer keys, R2 locations or usable asset URLs. Apply the same entitlement predicate to every result and asset route, including command-specific job endpoints. Sharing and forks can expose only content already authorized for delivery and explicitly shareable.

Mint card IDs before generation. The client reserves slots, inserts each authorized card idempotently, persists the board and acknowledges placement. Reload and a second device restore the same slots/cards without another generation or debit. A charge succeeded but placement acknowledgement was lost is a delivery-reconciliation case, not a new purchase. Use saved board state to distinguish an unacknowledged delivery from a terminal failure before refunding.

## 5 Billing and durable recovery

### 5.1 Payers and identities

Rabbit Hole pays for invitations, plan drafts/revisions, proposal composition, proposal Quick Edit, research, checking and speculative preparation. Assessment remains free to the learner. Tab or Accept authorizes the accepted generation without displaying a price in the desktop Tutor flow, as already decided. A model tool call cannot supply that authorization.

Use actual usage contexts, including `withSystemUsage` for platform work. A provider-ledger label such as `provider:platform` alone does not select the payer. Reserve both platform spending and per-learner work quotas before a call; settle or release those reservations afterward. Concurrent calls count against the same limits.

Use one learner action key per accepted proposal version. Add a trusted server-only operation-ID hook to `spendTransport`; IDs distinguish proposal, version, card, stage, call and retry. A stable ID must reach the transport that performs admission, not merely an unused `attemptId` argument. Caller input cannot choose arbitrary existing operation IDs. If a provider outcome is unknown, reconcile it before retrying; a timeout does not establish zero cost.

Call lightweight text/table formats by that name. They may incur model costs and learner charges. Zero-priced means an explicitly zero-priced action, such as linking an existing card; it does not mean a format without a separate quote.

### 5.2 Ordinary accepted generation from R4

Atomically admit/reserve the whole accepted step under its aggregate authorization before consuming acceptance or dispatching any card. Insufficient allowance leaves the entire proposal pending and charges nothing; it must not partially purchase a multi-card step. Record the accepted proposal version and per-card allocation within that authorization before dispatch. Integrate the new step hold with existing per-call admission: consume or atomically transfer the allocated learner reservation rather than reserving the same amount twice. Release unused allocation on completion or terminal failure. This integration is planned work, not an existing API guarantee. Keep provider admission separate from the learner hold and use the accepted usage context. Each provider call keeps its own stable identity, result and cost. Persist stage checkpoints so a restart can resume or reconcile without blindly calling the model again.

Classify failures before retrying. A clarification, unsupported/disabled format, failed authorization or policy decision is not a transient provider failure and does not trigger a blind paid retry; clarify, replace or omit as appropriate. Reconcile an unknown provider outcome before any new call. For an eligible transient failure, the failed card's learner charges are refunded before its one automatic retry. A retry is bounded, and its provider expense remains recorded. If the retry also fails, mark the card failed and refund its affected learner charges; delivered siblings keep their valid charges. Retry, Replace and Omit in Chat or ToC resolve to the same authorized actions. Explicit later retries have a fresh operation identity and their own bounded authorization, not an endless loop hidden behind the original Tab.

When generation succeeds but checking is unavailable, withhold the result while the bounded checking retry/adjudication runs. On terminal inability to deliver, refund the affected card and retain an unavailable result for diagnosis under the retention policy. Do not leave a learner charged indefinitely for a held card. Subsequent recovery cannot silently charge or publish a refunded result; a new authorized recovery action must establish its billing outcome.

### 5.3 Prepared result charging in R11

Preparation already records provider expense under a platform context. Accepting that result must not create another provider operation. The existing `usage_attempt_detail` table has no provider-operation field. Add a CREATE-only sidecar mapping each result and learner charge to all contributing provider operations, including stage/call/retry IDs, attributed cost and price-policy version.

Reconcile provider operations before entering the charge transaction; do not hold a database transaction open across network work. Persist a reconciliation version/fingerprint that the charge transaction can guard. Implement `admitLearnerCharge` as part of a guarded D1 transaction/batch, not as an independently committed helper followed by a supposedly atomic caller. Within that atomic write boundary:

1. Validate actor, proposal/result versions, checks and the immutable accepted-content fingerprint.
2. Verify the persisted reconciliation is complete and still matches every contributing provider operation. Unknown operations leave acceptance unconsumed pending reconciliation; unusable failed preparation cannot be sold as a successful result.
3. Read any existing learner charge and refunds. Replay the actual resulting state rather than treating row existence as proof of payment.
4. Check allowance for the entire offered step and atomically admit all included prepared-card charges with its accepted decision, or reserve the whole step before per-card settlement. Insufficient funds consumes no acceptance and no charge. A genuine zero-price link records zero without a balance requirement.
5. Record the charge-to-operation mappings, accepted decision and authorization/result transition under the same guarded transaction. Do not insert another `usage_operations` row.

The settlement must integrate with the current usage balance calculation. Keep original provider expenses immutable and separate from learner price and refunds. The price calculation names which eligible calls are included; failed work already designated platform-paid must not reappear in the learner charge. After whole-step admission, settle/refund by card so actual generation or delivery failures can be recovered independently. Do not use per-card admission to create a partly purchased step because the balance ran out. Each delivered card is charged once and failed cards are refunded.

Tests must cover two concurrent accepts, crashes at every write boundary, replay after refund, settlement followed by lost placement acknowledgement, zero-price linking, insufficient allowance and partial delivery. Acceptance changes learner usage once while platform provider-spend totals remain unchanged.

### 5.4 Durable events and scheduling

An event is committed with the fact it reports. For R9 assessment, add the event inside `learn-attempt-store.js` `commitAssessment`'s guarded batch that writes observations and final assessment status. Calling it after `assessAttempt` returns leaves a crash gap. Mode changes, delivered-card records, feedback and source-version changes follow the same rule in their own stores.

Use a unique event ID and a uniqueness key including organization, actor, roadmap, fact identity and fact revision. A mode string is not a revision: Ask → Tutor → Ask must produce distinct events. Claim an event with a replayable lease; a claim is not completion. Commit the effect/state transition and processed marker together where possible. For external effects, persist a stage checkpoint, apply the effect idempotently and mark processed only after its durable outcome is known. A crash between claim and effect must not lose the event.

Pending events carry `next_at`, attempt count and deadline. A durable dispatcher owns their retry schedule. Its wake-up must already be durable when a writer can commit an event, or a bounded recurring outbox scan must recover the commit-before-notify gap. Do not rely on best-effort work after the response. The dispatcher scans pending event rows, not every idle roadmap. A daily sweep remains a last recovery mechanism and cannot be described as satisfying second/minute retry deadlines.

The roadmap DO alarms for the earliest active stage deadline or scheduled event/check retry. Waiting with no scheduled work needs no alarm. An alarm handler rereads D1, checks stage/version and performs only applicable work. Ask mode pauses proposals and speculative work; an already accepted generation may finish and deliver. Stale or duplicate notifications cannot reverse a later mode setting.

### 5.5 Retention and measured limits

Accepted delivered assets follow the card's own lifecycle, never the speculative-result expiry path. Unaccepted cancelled/superseded results expire after the configured retention period from that decision; untouched undecided preparation uses last learner activity. Pause, completion or ending is not itself immediate expiry. Keep minimal cost and decision records after deleting eligible bytes.

Use a single versioned runtime policy for call, token, quota, timeout and retention limits. Initial ceilings of 5/10/15 steps for Overview/Standard/Deep and a maximum of three cards per step remain provisional upper bounds, never quotas. The planner chooses fewer steps/cards when the outcome needs fewer. Preserve a coherent stopping point and bound each teaching task as well as the total roadmap.

Routing, indexing, planning, generation and checking have separate stage deadlines plus an overall work budget. JEV's timeout is per fetch and can include an admitted retry; the overall deadline must account for that and any adjudication. Do not combine a 30-second whole proposal deadline with unaccounted 20-second repeated screens. The 1–2 second next-proposal target is a measured readiness goal after preparation, not permission to skip checks or a promise that every cold job finishes that quickly.

## 6 Tools grounding and safety

### 6.1 Capability ladder and model roles

`roadmap-tools.js` validates typed arguments, outgoing data, access, purpose, version and budget. It returns `ok`, `partial`, `needs_clarification`, `unsupported` or `unavailable`. It exposes no general SQL, shell, credentials or arbitrary write. This limits tool authority and data egress, not legitimate educational discussion of code, file names or commands. Generation dispatch remains a server action after acceptance; only assessment writes graded observations.

| Capability | First release | Implementation |
| --- | --- | --- |
| Read source and canvas | R4 | Existing authorized file readers plus bounded Markdown passages, source references and learner-scoped canvas state. |
| Check claims and text safety | R4 | Deterministic reference checks, targeted support checking and contextual text screening before publication. |
| Long source retrieval | R7a and R7b | Bounded chunks, summaries and coverage; reuse PDF page text and lexical selection. |
| Web research | R8a | Existing `discoverSources`, `evidenceFetcher` and `EvidenceRecord` through a Tutor adapter. |
| Calculator | R8b | Restricted grammar, finite values, operation limits and recorded computation; no dynamic `eval`. |
| Read learning evidence | R9 and R10 | Existing assessment/Progress stores, keeping self-report separate from demonstrated performance. |
| Inspect figures and OCR | R15 | Dedicated vision extraction using actual images, uncertainty and retained source locations. |
| General execution | R16 | Isolated service, audited limits, no credentials/network by default; never execute uploads on import. |

Use central `LEARN_TASKS` entries and logged transports. Initial proposed models follow the repository-configured IDs: Sonnet `claude-sonnet-5-5` at low effort for subject, proposal, indexing, research and targeted support checks; Opus `claude-opus-5-5` for roadmap draft/revision and complex adaptation. Allow one bounded Opus escalation for a genuinely ambiguous support check. Keep the existing Explain-back rubric assessor. Vision extraction is a separate role, not the assessment endpoint.

Use JEV for fast routing and qualified screening. The current transport includes direct `jev-1.13.0`; configuration and actual served model must be verified at deployment. Log requested/served models, prompt/policy versions, latency, cost and outcome. These names are code configuration, not guarantees of provider availability. Model failures return a typed limitation; no silent substitution.

### 6.2 Source coverage and uncertainty

R4 accepts a readable Markdown scope that fits its declared input bound. A whole-document request exceeding that capability must offer a supported explicit scope or report the limitation; silently cutting the document is prohibited. R7 expands coverage through immutable, access-scoped indices with extractor, index and prompt versions.

Chunk by stable offsets/pages and heading ancestry, including headingless material, repeated headings and large individual sections. Bound summary batches and total document work. Retain outline coverage plus indexed, omitted and unreadable ranges. Summaries guide retrieval; actual original passages support claims. Reuse existing PDF extraction in `context-doc-pages.js` and storage/selection in `pdf-pages.js`. Record that extracted text may originate in the browser; a source hash does not prove faithful server extraction.

Use five evidence classes: `source_supported`, `externally_supported`, `computed`, `inferred`, `unresolved`. Reference validation checks access, source version, location and quote match. Semantic checking asks whether the passage supports, contradicts or fails to establish the actual material claim. Check generated text and all practice keys, not only proposal titles. Batch targeted claims and reuse content-version-bound verdicts; do not add a general quality-review loop to every sentence.

An inference needs premises and a checked derivation. An unknown claim does not become valid by calling it an inference. Unsupported quiz keys are unscored, with no negative observation. R9 binds immutable question/options/key content into the activity ID and uses an integer revision. Grade the shown snapshot or return 409 with the changed question; never silently resubmit an old answer against a new key.

Explain unfamiliar material from its definitions. Research undefined public concepts when research is enabled. Ask about private acronyms, missing appendices and consequential source conflicts. Distinguish “the source claims” from verification. If the answer remains unknown, state the missing information and continue only with independent supported content. Never invent citations, figures, code execution or results.

### 6.3 Research and execution boundaries

R8a researches named gaps inside the accepted scope. Search results are unread candidates; fetch relevant primary sources before relying on them. Preserve URL, time, hash, excerpt and limitations. Reuse the fetcher's public-network/redirect checks and no-credential behavior. PDF URLs need the supported document adapter; inaccessible/paywalled content remains unavailable. A browser card does not bypass a paywall.

Use general public query terms, not private excerpts, personal identifiers or secrets. Validate outgoing content as well as tool schemas. Source instructions can induce an otherwise valid search call to leak data; test that case. If safe query formulation is not possible, ask or limit the answer. Research costs belong to the platform and are reserved before the call. Start with bounded queries/fetches and measure limits rather than searching for every step.

R16 execution is separate from orchestration: pinned runtime, allowlisted packages, isolated temporary workspace, resource/output limits, network restrictions and process cleanup. The CAD sandbox is a precedent to audit, not a ready general-purpose runner. Before that release, code examples remain explicitly unexecuted unless an existing authorized path actually ran them.

### 6.4 Contextual safety and publication

Use the policy direction already proposed: permit educational anatomy, health, medical and historical/artistic discussion without unsolicited explicit imagery; decline explicit sexual entertainment; block sexual exploitation, sexualized minors and nonconsensual intimate generation/distribution while allowing appropriate safeguarding discussion. Treat violence, hate and extremism analytically rather than promotion or harmful instruction. Distinguish a quoted self-harm passage from the learner's own danger; personal imminent-risk signals pause automatic teaching for supportive help. High-stakes subjects carry limitations and appropriate source checking. Protect private and intimate data from research, sharing and reuse.

Reuse `webpage-screen.js` transport, chunking and response validation under a separate Tutor policy version. Its current exclusive safe/explicit/graphic choice is not multi-label: implement independent per-category questions in a supported request, or an explicit multi-label adapter. Validate category scores and uncertainty; do not reuse routing's permissive fallback.

The server enforces `allow`, `restrain`, `block` or `unknown`, with input hash, category scores, policy/model versions and coverage. Screen learner intent, quoted source, requested transformation and output modality together. Mentioning a sensitive subject alone must not block educational discussion. Unknown/malformed/timeout/incomplete coverage holds the affected work, never counts as prohibited and never permits publication.

Use one bounded retry and, where appropriate, one contextual adjudication. Continued uncertainty terminates the affected delivery with the refund rule in section 5.2. Inspect actual output and run the command's schema/static/rendering checks before publication. R4 needs text checks only; each later format adds its own adequate checks before enabling it. Media scripts alone do not establish rendered-output safety, and sampled frames have limited coverage.

Cache checks against the content, source and policy/model versions. Changed unaccepted content requires rechecking. A policy/model cache change alone does not revoke previously delivered cards; any separate remediation uses an explicit incident policy. Keep withheld assets unavailable through every route. Test both false allowances and false refusals with a small held-out corpus, plus deterministic permission, timeout, replay and asset-access tests. Record uncertainty rate, unsupported claims, latency and cost; mocked category tests do not establish classifier quality or eliminate hallucinations.

## 7 Agents and integration

Use five active roles by default. Increase concurrency only for independent work with clear ownership and a demonstrated bottleneck.

| Role | Owns | Integration boundary |
| --- | --- | --- |
| Lead and integrator | Interface contracts, migration numbering, integration branch, release candidate, deployment record and receipts | One production promotion owner; allocates shared registry, mount and configuration edits |
| State and money engineer | Roadmap routes, store, jobs, acceptance, billing, authorization, outbox and recovery | Owns ledger/schema changes; consumes tools through the agreed interface |
| UI engineer | Canvas proposals, Chat, ToC, Progress, settings and shortcuts | Works against recorded API fixtures while backend work proceeds |
| Tools and planning engineer | Source/research/calculator adapters, planning prompts, grounding/safety checks and policy validators | Explicit file ownership; no wildcard that also assigns these files to state/money |
| Independent verifier | Integrated-candidate review, focused smoke, adversarial tests and evidence quality | Implementation engineers write tests too; no separate serial advisor stage |

For every active release, maintain a short manifest listing the exact writer for each file. The lead owns shared edits to `learn-models.js`, route mounts, wrangler configuration and migration number allocation, or delegates each explicitly. Avoid simultaneous edits to `LearnPage.jsx`, `AdaptiveCanvas.jsx`, `learn-usage.js` or a shared policy file. Split UI into canvas/panel only if this helps the measured bottleneck.

Independent components, fixture work and the next ready release can progress while the current candidate is verified. Merge small coherent slices into one candidate; freeze that SHA for its checks. Rebase queued work onto the released main and recheck actual affected behavior. No agent independently pushes an overlapping production candidate. Do not batch unrelated unfinished work merely to reduce the count of commits.

Implementation and review use the same contract. A cross-file change is coordinated directly with the owner, not an additional chain of advisor approvals. Each lane reports changed behavior, files, tests, unresolved blockers and the next integration dependency.

## 8 Verification and production release

### 8.1 Required evidence for each release

Every release names its learner-visible outcome, supported capabilities, unsupported paths, focused smoke and recovery. The build and affected tests pass on the actual candidate. Money, access, source honesty and applicable content checks are part of the capability being released; later tools and unsupported modalities are not prerequisites.

- Use fast local deterministic tests and a keyless browser fixture for state, keyboard ownership, delivery, privacy and failures.
- Before the first real-model candidate, fix a short rubric covering instruction fidelity, scope coverage, nonredundancy, supported claims, useful format, stopping point and applicable safety. Unauthorized disclosure, unsupported answer keys, wrong charging and bypassed checks are critical failures. Set and record the release threshold before scoring; report first-pass and repaired outcomes separately.
- Use a small representative real-model sample for a new or changed planning/grounding/safety role, with a sealed holdout where appropriate. Record false allowances/refusals, unsupported claims, invalid output, latency and cost. Mocked categories verify enforcement, not classifier quality.
- Start with the supported R4 source/format corpus. Add long-source, PDF, research, computation, image and media cases when their adapters are introduced. Do not run the original 64-draft multi-source matrix as a prerequisite for every small early release.
- Preserve existing unaffected evidence where it remains applicable. Repeat checks when a relevant change, failure or unresolved concern justifies it. Avoid unconditional broad unit/browser suites at every small push disguised as focused validation.
- A narrow capability cannot ship with a known required-check failure. After two unsuccessful candidates for the same failure family, document the cause and proposed next change; unrelated ready releases continue. This is a diagnostic checkpoint, not permission to abandon a required fix or hide it in a passing receipt.

### 8.2 Release procedure

Use the existing explicit MVP workflow when the work has the owner's MVP label. Broad CI and the broad release gate are nonblocking and recorded as bypassed, never passed. Editor access uses the same path with the complete access matrix as a required focused check; there is no automatic ordinary-gate exception based on file class.

1. Resolve main, integrate only the complete release, and pin the exact candidate SHA/tree and build identity.
2. Run the successful build, affected tests and named feature smoke. Register tracked executable files in the check map where existing classification does not already cover them. Follow the selector's required staged handling when deleting registered checks; do not remove a needed deleting-push entry prematurely.
3. Prepare and push the required recovery branch as a strict descendant of the candidate, using the existing fast-path tooling. Run `mvp-fast-path.mjs preview --mvp` with the named smoke and recovery branch on the isolated preview.
4. Present the concrete preview/receipt for any required owner try. Prepare required migration and exact-SHA release actions together so there is one actionable handoff, not repeated general design approval.
5. Apply only authorized migrations to the named environment and verify schema identity. The production preflight does not apply migrations. Preserve the owner-controlled `MVP_ALLOWED_SHA` procedure and launcher; this document does not change who may set that variable.
6. Run `prepare --mvp`, production release and smoke, and verify served SHA/version and the new behavior. Remove temporary release authorization as required by the existing procedure. On failure, use the prepared recovery path.
7. Record what shipped and what remains disabled. Continue independent implementation under existing authorization while any release-specific owner action is pending; do not treat a ready preview as production completion.

The concrete commands and flags come from the checked repository tools. Do not invent new gate bypasses. Full CI may keep running independently; a new failure relevant to the release still requires investigation even when broad CI is nonblocking.

### 8.3 Costs and operational limits

Platform-funded invitation, planning, research, checking and unused preparation need admission limits and telemetry. They are not free to operate. Reserve quota before a call, reconcile unknown provider outcomes and make the applicable payer explicit. Assessment remains free to the learner.

Earlier v1.2 test budgets were proposals, not adopted authorization. Allocate existing authorized funds to the current release and record the amount and measured consumption. If no applicable paid-testing authorization exists, finish fixture-based implementation and present a bounded concrete paid check before spending. Do not ask for the entire future ladder's budget to open an early zero-model release.

All numeric limits are versioned defaults with a named measurement: step ceilings, cards per step, chunk size, total indexing budget, query/fetch budgets, safety/grounding deadlines and retention. Capability flags default to the deployed subset. Changing a security, billing or scope bound requires its corresponding focused verification; changing an unrelated label does not require repeating every paid evaluation.

## 9 Decision register

This register preserves D1–D45 so earlier discussions remain traceable. The current edit authorizes revision of the roadmap; it does not itself authorize production database changes, set the exact-SHA release variable, approve a new testing budget or manufacture missing owner decisions. Existing owner decisions described in this document remain effective. The implementation choices below are the revised plan's recommendations; do not reopen a settled product requirement merely because its implementation has changed.

Only decisions relevant to the next release need to be resolved before that release. Later tools, media or editor access must not block R1. A technical correction that makes an agreed requirement work is not a new product-approval round.

### 9.1 Complete decision register

| ID | Revised recommendation or retained requirement | First affected release |
| --- | --- | --- |
| D1 | Suppress independent Next Steps hooks while a roadmap is active. One teaching initiative owns the next addition. Restore ordinary hooks when no roadmap is active. | R4 |
| D2 | Proposed R4 exception: a trusted server-only roadmap text/table adapter reuses `generateArtifact` with server-validated `['explanation','table']`; public `body.allowedPrimitives` is ignored. Existing typed and Quick Edit `/explain` remain `startExplain`-first. Separately, use **(b)** for R12 interactive `/explain`: keep its brief and let bound Tab acceptance replace the extra Generate wait. Record both narrow roadmap-only overrides explicitly. | R4, interactive R12 adapter |
| D3 | Reuse a private hidden goal with `origin='coaching'` and an `lg_rm_` prefix. Add criteria for the outcome and widen the hide predicate. The learner need not create a personal goal. | R9 |
| D4 | Provide End roadmap in the ToC. Preserve delivered cards and the ended record, and allow a new roadmap. Ending does not erase learning evidence. | R4 |
| D5 | Stage source support: bounded readable Markdown in R4, long Markdown in R7a, PDF text in R7b, Projects in R13, images/notes/OCR in R15. Empty/title-only entry can ship as an R4 follow-up after its clarification path works; it does not block Markdown. | R4 onward |
| D6 | Check allowance for the aggregate accepted step before consuming acceptance. Insufficient funds leave the whole proposal pending and acceptance wholly unconsumed; use the existing credits recovery path. A balance shortage never triggers a partial purchase. | R4 |
| D7 | Undo removes delivered cards as a deletion; it does not reverse an already valid charge. Preserve the ToC delivery record and removal status. | R4 |
| D8 | A pending proposal is a private selectable overlay, not a saved board block. It is excluded from shared state, forks and canvas undo. | R4 |
| D9 | Delivered independent cards share `step_id` plus a private roadmap index. Strip private step metadata from shares/forks in the same release that introduces it. | R4 |
| D10 | Start with the registry mappings in section 6: Opus for substantial planning, Sonnet for bounded composition/summary work, separate checking roles. Benchmark representative cases; model IDs are configuration, not evidence of provider availability. | R4 |
| D11 | Store Auto-suggest as a per-learner setting in an additive sidecar table. Do not silently retain only the old per-canvas scope. | R2 |
| D12 | Store Depth per learner and canvas in an additive sidecar table. The composer and ToC control read the same value. | R2 |
| D13 | Use the learner's requested language. Otherwise use the language of their question; with a source-only entry, use the source language. Make mixed-language ambiguity a focused clarification when material. | R4 |
| D14 | Reserve platform-work quotas before calls, scoped to learner and time window. The old proposed limits are provisional, not new budget approval. Release only the counters needed by enabled capabilities. | R4, R8a, R11 |
| D15 | Report speculative provider expense through the existing owner telemetry surface. Separate platform expense from learner charges and refunds. | R11 |
| D16 | Use the existing daily cron for unaccepted-result retention. Thirty days is the carried proposed retention default. Accepted assets follow delivered-card retention, not speculative expiry. | R11 |
| D17 | Project canvases use this same roadmap flow alongside retained project content. Do not revive the retired journey/syllabus system or remove unrelated course views as an incidental change. | R13 |
| D18 | Handle plain Tab in the canvas key handler only for the selected current proposal, after ownership/busy checks and with no editor open. Leave Shift+Tab and ordinary text-field navigation unchanged. | R4 |
| D19 | Place additions around their source/anchor using free space and existing placement helpers. No compulsory side, automatic camera jump or arrows on every connection. | R4 |
| D20 | Measure readiness latency separately from accepted-card generation time. The 1–2 second suggestion target is a measured goal, not permission to skip checks. | R6, R11 |
| D21 | Emit the allowlisted `rh_roadmap_step` actions with IDs/enums and no source or learner text. Reuse existing analytics transport. | R4 |
| D22 | Show Auto-suggest in Auto and Tutor, hidden in Ask. It controls actual invitations/proposals when those capabilities exist; do not imply an unshipped capability is active. | R2, R4, R6 |
| D23 | Ask answers in Chat and does not start a roadmap, even for a teaching request. Auto/Tutor can initiate the agreed invitation/roadmap flow. | R4 |
| D24 | Preserve the agreed no-price desktop Tutor flow. Typed commands in Auto/Ask retain existing price display; step proposals never show a price. Tab can authorize the applicable charge once. | R4, R12 |
| D25 | Determine speculative eligibility from each generation path. Expensive media and its paid planning wait for acceptance; a command name alone does not establish eligibility. | R11 |
| D26 | Reuse the existing five Progress statuses and existing evidence semantics. Thumbs remain self-reports, separate from assessed demonstrations. | R9 |
| D27 | Retain eventual editor support. Until R14, roadmap execution is owner-only. R14 separates board owner, acting learner and payer, and rechecks revoked access throughout the flow. | R14 |
| D28 | Auto-suggest off also suppresses unsolicited invitations. Explicit learner requests remain available. Dismissing one invitation does not globally disable the Tutor. | R4 |
| D29 | JEV can support bounded routing; uncertainty falls back to an ordinary answer or the specified clarification. Safety uses a separate contract, deadline and `unknown` result. Neither becomes learning evidence. | R4 |
| D30 | Use D1 as durable state and one RoadmapJobs coordinator per learner/board. Versioned actions, guarded transactions and alarms govern work; the browser renders authorized results. | R4 |
| D31 | Implement the section 5 billing contract: stable provider-call identities and transactional learner charges for prepared results, with a separate one-to-many operation mapping. Never record the same provider expense twice. | R4, R11 |
| D32 | Bind quiz content to an immutable activity ID and integer revision. Grade the shown valid snapshot or require a fresh answer after a change; never silently resubmit an old option. | R9 |
| D33 | Reuse Ctrl/Cmd+K with a proposal target. Apply creates a new proposal version; Esc discards the preview; Tab accepts only after the editor closes. | R5 |
| D34 | Verify cleanup's Next Steps click forwards the exact hook text as a plain Chat turn. Do not rebuild the old Tutor caller or ship a dead control. | Cleanup receipt, R4 |
| D35 | Enable the core only with `ROADMAP_ENABLED` and capability availability. Off means no unsolicited roadmap UI/routes; preserve stored state and handle in-flight work through the release/recovery contract. | R4 |
| D36 | Use **(b)**. Main Chat and ToC reach the same authorized Retry/Replace/Omit actions. Avoid another set of suggestion buttons. | R4 |
| D37 | Show a hover-only step label derived from the actor's private roadmap index. A copied `step_id` alone must not expose private relationships. | R4 |
| D38 | Stop before spending beyond the accepted authorization. Material format/content or bound changes produce a revised proposal requiring acceptance; do not silently expand the purchase. | R4, R12 |
| D39 | Retain one measured testing-spend ledger and explicit owner-approved caps. Allocate an approved total across the smaller releases; do not multiply the old MVP caps by the new release count. | First paid evaluation |
| D40 | Use **(b), resliced to R8a**: scoped Exa discovery plus guarded evidence fetching. This early independent tool release does not block a source-supported R4. Contents extraction is an optional later adapter. | R8a |
| D41 | Use amended **(a)**: restricted deterministic calculation in R8b; arbitrary sandboxed execution in R16. Before execution exists, code examples must not claim to have run. | R8b, R16 |
| D42 | Inspect figures/scans through a dedicated vision/OCR role in R15. Until supported, explicitly report unreadable regions rather than inventing their contents. | R15 |
| D43 | Recommend the contextual Tutor policy in section 6, with probabilistic classification, deterministic enforcement, explicit unknown, publication checks and bounded refund behavior. Broader policy adoption remains an explicit owner decision. | R4, expanded per capability |
| D44 | Use **(b)** for the proposed MVP-labelled editor release, with its access matrix mandatory. A failed access check blocks that release; an unrelated broad gate is not automatically reinstated. | R14 |
| D45 | Provisional maximum three cards per step, using as few as sufficient. It is neither a quota nor a fixed explanation/practice rhythm. Start R4 with one card where sufficient. | R4 |

### 9.2 Owner records still required

The revised release structure and technical corrections are included in this document. Do not claim that the following operational or policy approvals happened merely because the owner requested the edit:

- The explicit MVP label for the revised release ladder, including R14, and any separate label for cleanup M0. The standing policy already exists; the new scope must be identified accurately.
- D2 contains two proposed narrow exceptions to record separately: R4 may use the trusted server-only `generateArtifact` text/table adapter for roadmap jobs, with its primitive set validated by the server and never authorized by a public body field; the R12 interactive-explanation adapter retains the brief but allows bound acceptance to replace the 2026-10-29 Generate wait. Existing typed and Quick Edit `/explain` remain `startExplain`-first; neither exception silently changes them.
- Adoption of the amended D43 contextual safety policy.
- Any new paid-testing cap or change to an existing cap. Measurements do not themselves authorize additional spend.
- Production migration GOs and the exact-SHA release variable required by the current release policy.
- New learner-visible strings that the repository still requires the owner to approve. Reuse approved wording; bundle only the new strings required by the imminent release.

The owner can record the first three together in one concise instruction. They do not require reopening all 45 design choices. Continue authorized independent implementation while an affected decision is pending, and present a concrete checked candidate when the remaining release action becomes necessary.

## 10 Legacy milestone coverage

R releases govern deployment order in v1.3. M identifiers remain traceability references, not a second dependency graph. In the implementation ledger, assign each old subtask a new release and a status: retained, split, satisfied by an earlier release, or intentionally deferred. A split records the boundary explicitly so neither agent assumes the other completed it.

| Previous milestone | New release coverage | Scope preserved or moved earlier |
| --- | --- | --- |
| M0 cleanup | Cleanup receipt before integration dependent on removed code | Keep the agreed archive-join/backfill ordering, plain Chat Home teach path, retired unused handoff endpoint and retained reusable capabilities. This roadmap does not perform cleanup database operations. |
| M1 thumbs | R1 | Per-card private feedback, hover behavior, selected blue state, persistence, Progress with no goal, and share privacy. |
| M2 composer | R2; roadmap wiring in R4/R6 | Depth throughout relevant generation paths, persisted user settings, Auto/Ask/Tutor controls and cross-tab/device behavior. |
| M3 source references | R3; adapter expansion R7/R13/R15 | Source/version anchors, two-way navigation, changed-source handling and metadata propagation. |
| M4 invitation and plan | R4 core; R7 index expansion; R8a research; R8b calculator; R15 OCR | The first production invitation and accepted plan already lead to a delivered explanation. No planning-only dead end. |
| M5 proposal and delivery | R4 core; practice R9; richer command adapters R12 | Tab/Cancel, private overlays, stable placement IDs, reload/replay, retries, Replace/Omit, publication entitlement and privacy ship with first delivery. |
| M6 proposal editing | R5; offscreen navigation in R4 | Inline draft versus Apply, Add to Chat, drag, “Use as my next step” and existing-card links. The existing-proposal navigation indicator ships with the first proposal in R4. |
| M7 Auto-suggest and preparation | R6 automatic proposals; R11 speculative results | Separate proposal readiness from card pre-generation. Basic Ask/Cancel/end behavior exists in R4; durable events ship at their first consumer. |
| M8 priced commands | R12a and subsequent command releases | Each format retains its own brief/review/authorization, billing and output checks. One completed adapter does not wait for all other formats. |
| M9 practice evidence | R9 | Quiz snapshots, Explain-back grading, free assessment, hidden evidence container, private Progress and assessment-commit notifications. |
| M10 adaptation | R10 | Evidence-led future steps, prerequisites, focused questions, Already understood and learner-chosen Rabbit Holes. |
| M11 revisions and limits | Basic accepted-plan revision/end/ceiling in R4; proposal editing R5; richer changes R10; speculative invalidation R11 | Do not postpone essential stopping and cancellation behavior until a late milestone. Delivered content remains preserved across revisions. |
| M12 sharing and Projects | Core share/fork/deletion privacy in R4; Projects R13; editors R14 | Privacy ships with new data, not after it has already reached production. Editor authorization is independent of completing all media adapters. |
| M13 images and notes | R15 | Include notes and image sources, figure interpretation, scanned pages, OCR uncertainty and appropriate modality checks. |
| M14 web research | R8a, with optional later extraction improvements | Reuse existing discovery/fetching first. External research is available before the final source/media milestones. |
| M15 computation | R8b calculator; R16 arbitrary execution | Numerical checking does not wait for a general execution service. |

Examples of split assignments: M4.6 supplies the core coordinator in R4 and the expanded indexing stage in R7; M5.3 supplies accepted generation in R4 while M7.2's prepared-result charge belongs to R11; M7.9's basic mode pause belongs to R4 and its speculative cancellation extension to R11; M9.5's observation event is committed with the assessment in R9, using the durable notification infrastructure already introduced when first needed. The old task sentence never overrides the corrected contracts in sections 4–6.

### 10.1 Exact legacy subtask assignments

The v1.2 source contains **98 checkbox subtasks**, all assigned below. A range includes only its listed endpoints and intervening task numbers; slash-separated releases mark an explicit scope split, not alternative owners. The corrected contracts in this document supersede stale implementation wording in the legacy task. No checkbox tasks are invented for M0 or M13–M15, which v1.2 describes outside this numbered checklist. Its numbering skips M11.2 and M12.1.

| Legacy subtask IDs | Release assignment | Split boundary or correction |
| --- | --- | --- |
| M1.1–M1.6 | R1 | Complete feedback release, including private persistence, no-goal Progress and its focused checks. |
| M2.1–M2.7 | R2; integration R4/R6 | Controls and existing answer paths first; roadmap behavior consumes them in R4, automatic proposals in R6. |
| M3.1–M3.6 | R3; extensions R7b/R13/R15 | Markdown and existing selected-PDF-excerpt anchors/navigation ship in R3. R7b adds whole-PDF planning, not the first PDF reference. Code and visual-source adapters extend the contract later. |
| M4.1–M4.3 | R4; expanded R7–R10/R15 | Measure and evaluate the bounded Markdown planner, grounding and supported safety cases in R4. Add corpus, index and tool cases with each capability; do not require every later-format case for R4. |
| M4.4–M4.8 | R4; index stage R7 | Core schema, coordinator, replay, routes, messages and durable event delivery. M4.6 adds the long-source indexing stage in R7. |
| M4.9–M4.12 | R4; practice R9; multisource R10 | Single-source invitation, accepted plan, ToC and revision conversation in R4. Practice mode becomes selectable with working practice; grouped/new-source planning expands in R10. |
| M4.13–M4.17 | R4; grouped-source cases R10 | Modes, teach intent, learner instruction and focused questions belong to the first flow. Empty/title-only entry may be an R4 follow-up; it must not claim source evidence. Expand multi-source test cases in R10. |
| M4.18 | R4 | Visible-section scope is captured with its source revision at selection time; later scrolling never changes it. |
| M4.19 | R4; expanded per capability | The contextual safety screen is required for the first supported inputs and outputs. Add modality tests before enabling later commands. |
| M4.20 | R7a/R7b; bounded subset R4 | R4 reads the supported bounded Markdown fully and reports unsupported coverage. R7a adds versioned chunks, coverage, summaries, budgets and retrieval for long Markdown; R7b adds PDF pages and unreadable-region records. |
| M4.21 | R8a | Scoped web discovery and guarded fetching; available independently of completing the media ladder. |
| M4.22 | R8b | Restricted deterministic calculator. This task does not authorize general code execution. |
| M4.23 | R4; new adapters R7/R8/R13/R15/R16 | Ship the authorization, typed-result, budget and deadline boundary with the first local-source tools; register later tools only with their release. |
| M5.1–M5.4 | R4; extensions R9/R11/R12 | First text/table proposal, versioned store and coordinator. M5.3 uses the proposed R4 server-only adapter, never public `allowedPrimitives`. R9 adds practice, R11 prepared-result accounting, R12 command stages. Corrected identity/publication contracts govern all. |
| M5.5–M5.10 | R4; modality extensions R9/R12 | Proposal display, keyboard acceptance, independent delivered cards, ToC navigation, cross-device checks and private step labels ship together. No rich-format prerequisite is implied. |
| M5.11–M5.12 | R4 | Bounded retry/refund behavior and content-free lifecycle telemetry exist on first delivery. |
| M5.13 | R4 | Retry/Replace/Omit recovery through the existing conversations is available when a card can first fail. |
| M5.14 | R4; modality extensions R9/R12 | Grounding/safety and accepted entitlement gate every publication path. Extend checks for practice keys and assets before those outputs ship. |
| M6.1–M6.3 | R5 | Draft versus Apply and proposal drag. |
| M6.4 | R4 | Offscreen Next step ready only navigates to an existing proposal; it does not generate another. R6 can therefore ship independently of R5. |
| M6.5–M6.8 | R5 | Explicit existing-card links, Add to Chat and editing checks. A link reuses a card without claiming newly generated work. |
| M7.1 | R6/R11 | Measure delivery-to-next-proposal latency in R6; separately measure speculative-result readiness and cost in R11. |
| M7.2–M7.4 | R11 | Prepared-result charging, background preparation, invalidation and bounded recheck. Provider cost is reconciled once and kept separate from the learner charge. |
| M7.5 | R4/R11 | R4 needs durable event retries and job recovery with timely alarms; the sweep is a backstop. R11 adds unaccepted-result retention/expiry. Accepted assets never expire through this path. |
| M7.6 | R11 | Owner report for platform-funded speculative work, using the established provider-cost ledger. |
| M7.7 | R6 | Automatic next proposal after delivery, with manual next preserved when Auto-suggest is off. |
| M7.8 | R6/R11 | Split automated-proposal timing tests from speculative-preparation timing and money tests. |
| M7.9 | R4/R6/R11 | R4: Ask pauses unsolicited work; already accepted generation may finish. R6: pause/resume of automatic proposals. R11: cancellation/reconciliation of speculative work. Neither pause nor resume expires accepted assets. |
| M8.1 | R12 interactive-explanation adapter | Roadmap-created interactive explanation adapter, using D2(b) only after its narrow override is recorded. Keep the ordinary explanation brief behavior. |
| M8.2 | Individual R12 command adapters | One adapter per command: image, motion, whiteboard, CAD, interactive Animation and Blender 3D; release the smallest ready adapter without requiring interactive explanation first. Preserve each existing review flow; phase identities include card identity. |
| M8.3 | R4/R12 | Core insufficient-allowance refusal is required by the first paid acceptance. Reuse and test it for every later paid adapter. |
| M8.4 | R4/R12 | R4 proposals show no prices. Extend the Tutor-specific suppression to each enabled command review without removing existing ordinary-mode behavior. |
| M8.5 | Each individual R12 adapter | Run the focused priced-path checks for the adapter being enabled; no all-media batch prerequisite. |
| M8.6 | R4/R12 | R4 binds the accepted authorization and requires new acceptance for material changes. Each later command adds its plan/quote/duration comparison before additional spend. |
| M9.1–M9.4 | R9 | Private evidence container, immutable quiz binding, free assessment, answer-later behavior and canvas-scoped Progress. |
| M9.5 | R9 | Correct v1.2: write the observation notification in the same atomic assessment commit/batch, then deliver it through the outbox. A separate route-side write after assessment leaves a crash gap. |
| M9.6 | R9 | Practice and free-assessment checks, including snapshot, replay and outbox recovery cases. |
| M10.1–M10.5 | R10 | Evidence-informed adaptation, prerequisite handling, focused questions and learner-controlled Rabbit Holes; preserve uncertainty in self-reports. |
| M11.1 | R4/R10/R11 | R4: settings revision, delivered-count ceiling and explicit continuation. R10: include/clarify additional sources. R11: invalidate only affected unaccepted prepared work. |
| M11.3 | R4/R10 | R4: editable settings, revision acceptance, pause and stopping states. R10: include-source and associated revised-plan display. |
| M11.4 | R10/R11 | R10: Different version keeps earlier delivered cards and requires fresh acceptance. R11: retain or retire unaccepted prepared results under the same rules. |
| M12.2–M12.3 | R4; access expansion R14 | Deletion/undo records, fork stripping and shared-view privacy ship before first roadmap delivery. R14 repeats and expands the matrix for editors; privacy is never deferred to R14. |
| M12.4 | R13 | Project/repository snapshot inputs and commit-bound code references. |
| M12.5 | R4/R13/R14 | Split its existing checks: fork/share in R4, Project flow in R13, editor flow in R14. |
| M12.6 | R14 | Editor authorization, actor-private state and evidence, payer separation and membership revocation throughout every participating route/job. |

Excluded from this roadmap remain phone layout, cross-user reuse of unaccepted results, reward-system implementation and automatic execution of imported code. Existing command engines are reused through adapters; this roadmap does not commission a rebuild of Animation or another separately owned feature.

## 11 Evidence and completion record

### 11.1 Source and review limits

The code baseline was checked directly against GitHub main at `4102f8ea0a0a38783e5b79144ef9748152f9ddc1`. The supplied `tutor-roadmap-v1.2.md` and the conversation's decisions are the inputs to this revision. The newer companion spec/cleanup copies cited by v1.2 were not supplied in matching full-hash form; do not claim their exact text was independently reconciled. Link their actual files and complete hashes when available. Missing companion metadata alone does not invalidate a clearly recorded product decision.

This document has been reviewed as a plan. It does not certify live provider credentials, production migration state, classifier accuracy, runtime behavior or completed implementation. Recheck relevant source changes at the implementation SHA. Inspect schema and configuration through existing preflight rather than treating repository comments as live-state proof.

### 11.2 Primary code references

All paths below are relative to the repository at the baseline. Open them at the candidate before changing them. New `roadmap-*` files named elsewhere are proposed implementations, not existing capabilities.

| Concern | Existing reference |
| --- | --- |
| MVP policy and tooling | `CLAUDE.md` MVP fast path; `scripts/mvp-fast-path.mjs`; `scripts/prod-release.mjs` |
| Model registry and logging | `packages/control-plane/src/learn-models.js` |
| Atomic provider admission | `packages/control-plane/src/learn-spend-ledger.js` |
| Learner usage and transport identity | `packages/control-plane/src/learn-usage.js`; `learn-spend.js` |
| Assessment commit and immutable activity pattern | `packages/control-plane/src/learn-attempt-store.js`; web `learn-coaching-contract.js` |
| Exa discovery and safe fetch | `packages/control-plane/src/learn-search.js`; `explain-fetch.js` |
| Evidence provenance | `packages/control-plane/src/explain-evidence.js` |
| PDF extraction and retrieval | web `context-doc-pages.js`; control-plane `pdf-pages.js` |
| Screening and asset quarantine | control-plane `webpage-screen.js`; `webpage-capture.js`; `learn-grade-jev.js` |
| Existing access and sharing | control-plane `canvases.js`; `learn-boards.js`; `shared-privacy.js` |
| Canvas and keyboard ownership | web `AdaptiveCanvas.jsx`; `inline-placement.js`; `shortcut-owner.js`; `InlineAiEditor.jsx` |
| Executable classification | `scripts/ci/check-map.test.mjs`; `scripts/ci/affected.mjs` |

Repository snapshot: https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/4102f8ea0a0a38783e5b79144ef9748152f9ddc1

### 11.3 Release receipt and next action

Keep `docs/features/explain-on-canvas/STATUS.md`, `checklist.md`, `parked.md`, evidence and receipts. Each receipt records release ID, legacy task coverage, exact SHA/build, supported and disabled capabilities, migrations/configuration actually applied, checks and their results, any model runs/cost, production smoke, recovery branch and remaining limitations. Record implemented, locally verified, release verified and production activated separately.

The lead starts by reading the current cleanup receipt/state and reconciling existing work against R1–R3. Assign exact files to the five roles, prepare R1's focused tests and use the existing authorization to implement the first ready slice. Prepare the R4 contracts concurrently. Do not start all later tools or ask the owner to re-decide the whole product before that work begins.
