# Professor Next Steps

Owner: Learning Path agent (hook planner, contract, Tutor turn, decision trace, server routes). UI: Parallel (the bottom-left card).
Status: contract approved by the owner with corrections (2026-10-06), frozen for UI integration at this commit; Task 0 (generic Tutor availability) is ff3edfb8 + 40dbd592. Implementation in progress on `feature/professor-next-steps` (from main f4b99a3b). Not deployed; no migration.

At a useful stopping point the Tutor offers exactly three curiosity hooks. A hook is a short learner-facing question that makes the learner want to click; the precise pedagogical target behind it (`learning_goal`) stays internal. A hook says WHAT the learner wants to pursue; after the click the existing Tutor planner decides HOW to teach it, including generating real material through the existing Learn commands. A click is never evidence and never a faked learner message.

---

## 1. Contract (for Parallel UI)

### 1.1 Objects

```
HookSet {
  set_id        "ns_<8 hex>"           minted by the server per planner response
  generated_at  ISO-8601 string
  basis         string                 staleness key the set was computed for (opaque to the UI)
  options       [Hook, Hook, Hook]     exactly 3, or no set is shown at all
}

Hook {
  id                  "<set_id>.<1|2|3>"   stable within its set (= suggestion_id)
  hook                string               button text: 4-12 words, at most 90 characters; render verbatim
  selected_next_step  SelectedNextStep     opaque to the UI: send it back unchanged, never read or render it
}

SelectedNextStep {                          read only by the Tutor code and the server
  v: 1,
  set_id, suggestion_id,                    suggestion_id = Hook.id
  basis,
  hook,                                     the button text the learner saw (not learner prose)
  learning_goal,                            at most 120 characters, never shown
  concept_ids [<=3], claim_ids [<=3],       registry ids in scope; [] on a canvas with no registry
  scope: 'owned' | 'shared',
  source?: { share_version, origin_block_id }   shared only: the board version, and the card id or ':root'
}
```

- The hook planner's tool is exactly `suggest_next_steps { options: [3 x { hook, learning_goal, concept_ids, claim_ids, reason_internal }] }`. The server mints each option's `id`. The hook planner never chooses a modality.
- `reason_internal` never leaves the server: it is validated, counted in telemetry, and stripped from every response.
- One shape everywhere: Learning Journey canvas, a registered course, a plain owned canvas, a Rabbit Hole, and a shared canvas. Only `scope` and `source` differ.

### 1.2 Statuses

| status | meaning | UI |
|---|---|---|
| `loading` | a request is in flight and no set exists for the current basis | placeholder or nothing |
| `ready` | `options` holds 3 hooks for the current basis | show 3 buttons |
| `stale` | the basis changed; the old options are kept until the new set lands | buttons disabled |
| `unavailable` | nothing to show. `reason`: `not_now` (not a stopping point), `failed` (the planner failed after escalation), `limited` (server rate limit), or `off` (no Tutor context here) | show nothing |

Not a stopping point (`not_now`): the Tutor is answering; a Tutor question is waiting for an answer; the return-from-hole check is pending; the journey tray, intake, diagnostic or path review owns the choices; a section is being built; the canvas has no goal and no blocks.

Voice Mode is not a reason to hide hooks: while Voice is on, hooks stay visible and clickable, a click enters the same Tutor path, and the Tutor's reply follows the existing Voice behaviour. v1 adds no voice command for choosing a hook.

### 1.3 Integration hook API (no UI included)

```
// owned canvases (LearnPage; Rabbit Holes included)
const steps = useNextSteps({ tutor, journey, canvasApi, canvasState, record, access, title, graded })

// shared canvases (SharedBoardPage)
const steps = useSharedNextSteps({ token, card, version, signedIn })

steps -> {
  status: 'loading' | 'ready' | 'stale' | 'unavailable',
  reason: null | 'not_now' | 'failed' | 'limited' | 'off',
  set_id: string | null,
  generated_at: string | null,
  options: [{ id, hook, selected_next_step }],      // [] unless ready or stale
  select(id) -> { ok: true, selected_next_step } | { ok: false, reason: 'stale' | 'unknown' | 'busy' },
}
```

Both hooks live in `packages/web/src/LearnNextSteps.jsx`. `select()` only validates the click and returns the payload; it never runs a turn.

### 1.4 Sending a click

**Owned canvas** (journey, registered course, plain canvas, Rabbit Hole):

```
const r = steps.select(hook.id)
if (r.ok) await tutor.askStep({ selected_next_step: r.selected_next_step, signal, begin })
// same return contract as tutor.ask(): resolves to the reply text or { handled }
```

- One Tutor turn of kind `next_step`: the step travels as structured data; the learner message is empty.
- No `/api/learn/tutor/evaluate` call and no journey action, so the click writes no evidence.
- The Tutor may answer with any supported action, including new material made through the existing Learn commands (a paid one still asks Generate / Not now first). `askStep` runs those actions; the UI adds nothing.
- The dock may draw the chosen hook as a selection chip (visibly a choice, not typed text).

**Shared canvas** (read-only viewer): the click starts or resumes the viewer's private Rabbit Hole through the existing Start Rabbit Hole route.

```
POST /api/learn/boards/shared/<token>/rabbit-hole
{ origin: <rabbitOrigin(...) as today>, selected_next_step }
-> 200/201 { url, name, title, existing, source, next_step }   next_step = the server-checked step
-> 409 { error: 'stale_hook' }                                   start again without it, then show fresh hooks
```

- Origin: the selected shared card, else the root, exactly as today. No fork, no copy, no write to the shared board.
- The selected hook's `learning_goal` becomes the new hole's initial goal.
- Before navigating to `url`: `carryStep(sessionStorage, name, next_step)` (from `learn-next-steps.js`). The hole's first Tutor turn opens the hook once instead of the usual opening question.
- Signed out: `keepPendingStep(sessionStorage, token, selected_next_step)`, then `resumeHref(pathname, cardId, hook.id)` gives `/login?next=<path>?rabbit=<card|root>&hook=<id>`. After sign-in `takeResume()` returns `{ origin, hook }`; send the kept step whose `suggestion_id === hook` with the rabbit-hole POST. A missing step or a `stale_hook` reply starts the hole without it.

### 1.5 Where sets come from (the hooks call these; the UI does not)

- Owned: `POST /api/learn/tutor/next-steps { app, input }` -> `HookSet`. A separate call, never part of a Tutor turn.
- Shared: `POST /api/learn/boards/shared/<token>/next-steps { origin: { block_id } | null, viewer_states? }` -> `HookSet`. Built per request, never stored with the board, nothing written to the source.
- Both answer 429 `{ limited: true }` past the server limits (section 2.3); the hook then reports `unavailable/limited`.

### 1.6 The UI must never

- Show `learning_goal`, ids, `basis` or anything else in `selected_next_step`. Only `hook` is rendered, verbatim.
- Send a hook, or any sentence built from one, as a typed or composer message, or as `raw` to `tutor.ask`.
- Reword, reorder, or show fewer or more than 3 hooks.
- Request sets on click, pan, zoom, hover or mouse movement. The hook decides when (section 2.3).
- Call any evidence route on a click.
- Render or store a decision trace (section 3).

### 1.7 Parallel-owned integration points

- `ask.jsx`: the selection chip; `tutor.askStep` for hook clicks and for `opening.next_step` (a hook carried into a new hole).
- `LearnPage.jsx`: mount `useNextSteps`; a `graded` counter bumped when `gradeCanvasAnswer` resolves.
- `AdaptiveCanvas.jsx`: an `attempts` count (sum of practice attempt logs) in `onState`.
- `SharedBoardPage.jsx`: mount `useSharedNextSteps`; the `selected_next_step` body field, `carryStep`, and the `hook` resume key.
- `shared-rabbit-hole.js`: `requestRabbitHole(..., { step })`, `resumeHref(pathname, cardId, hookId)`, `takeResume()` returning `{ origin, hook }`.

### 1.8 Known limits (v1)

1. Opaque, not hidden: the browser receives `learning_goal` and the ids inside `selected_next_step`, because the Tutor turn is assembled in the browser. Hiding them needs server-held sets or a signing secret; neither is in v1.
2. On owned canvases a stale click is refused in the browser; on shared canvases the server refuses it too (409 `stale_hook`).

---

## 2. Hook planner

### 2.1 Input (structured state, never a chat dump; at most 9000 characters)

| field | content |
|---|---|
| `mode` | `journey`, `dive` or `canvas` (owned), `shared` |
| `basis` | the staleness key (2.3) |
| `goal` | owned: the journey goal; a hole's goal (its parent goal and title, or the hook that opened it); otherwise the course subject or canvas title plus the learner's latest request. Shared: absent unless the viewer has an explicit, reliable structured goal (none exists in v1) |
| `path` (journey) | current section `{ id, title, purpose, claim_ids }`, completed sections `{ id, title, claim_ids }` (newest 6), upcoming section titles only (4) |
| `canvas.blocks` | up to 20 `{ id, kind, title, concept_ids, claim_ids, practice }` |
| `scope.concepts` / `scope.claims` | up to 12 claims with statement, ideas, drawn case, evidence state (one of the five), misconception id, prerequisite, settled counts, and whether it is presented on the canvas; priority: current section or hole claims, then the newest blocks' claims, then claims with evidence, then prerequisites, then completed-section claims in a repair state |
| `recent` | last intent kind; the learner's own last question (only for a question or request); state transitions (6); recent modalities (8); practice results (4) |
| `previous` | the last hooks shown (6) and goals selected (3), so hooks do not repeat |
| `dive` (holes) | title, concept, claims, parent goal and section, parent claim states (read only) |
| `constraints` | learner constraints from the session and the journey |

Never in the input: intake familiarity or background, raw intake answers, transcripts, answer keys, expected answers, or any level or score.

Shared input is built on the server from the shared board's visible content only: lesson block titles, the selected card or root, the board title and version, and concepts and claims of public registered courses visible in that content. A signed-in viewer may add their own claim states (filtered to the server-built scope). Never the sharer's journey, evidence, Tutor store, chats or identity; chat cards on the board are excluded; no goal is inferred (not even from the viewer's earlier Rabbit Hole from the same share, which matters only when that hole is resumed). Anonymous viewers get hooks from content only.

### 2.2 Validation (server; a failure escalates, never loosens)

- Exactly 3 options; each hook 4-12 words, at most 90 characters, one line, no code.
- Never a command or course label (learn, explain, study, continue, next lesson ...), never a format name (quiz, flashcards, animation, Motion, video, diagram, card, Explain Back ...) unless the canvas topic is that thing, no clickbait.
- Answer reveal: a deterministic first gate rejects a hook containing 5 consecutive words of its claims' statements, ideas or drawn case, or of its own `learning_goal`. It catches copying only; the hook planner's prompt carries the semantic rule (never state the answer). No topic-specific answer lists.
- No level, mastery or ability wording in a hook or goal.
- `concept_ids` and `claim_ids` only from the input scope; at least one id per option when the scope is not empty; both empty when it is.
- Completed-section claims only to repair a misconception, prerequisite gap or uncertain claim.
- Three distinct hooks (different text, different goals, not the same claims with the same goal) that repeat nothing from `previous`.

### 2.3 Recompute triggers, staleness and limits

The basis changes, and the shown set turns `stale` immediately, on:

- a finished Tutor turn (typed, voice, slash, opening, or a hook click);
- a new evidence event (including an option answer outside a turn);
- a path change, a section change, or a section materialized;
- a card added or removed (not moved, selected or zoomed);
- a practice attempt; a graded canvas answer;
- entering or leaving a Rabbit Hole.

Shared canvases: only a change of the selected card or root, of the shared board version, or of the signed-in state (viewer evidence becoming available).

Browser: 1200 ms debounce after the last change (an implementation default); one request in flight; a reply for an old basis is discarded; never two requests for the same basis; changes during a Tutor turn wait for it to end; 60 requests per canvas per tab as a safety ceiling, not a target.

Server (the browser counter is not relied on):
- Owned: a reply is reused for a repeat of the same signed-in user, canvas and basis (edge cache keyed by a one-way hash, never the raw values), and each user has an hourly and a daily cap, recorded as usage events with the existing atomic-insert rate limiter (category `tutor_next_steps`).
- Shared, anonymous or without viewer evidence: one content-only reply per one-way share key (the existing `shareKey`, never the raw token), board version and origin card or root, from the edge cache. It never contains viewer evidence.
- Shared, signed in with viewer evidence: never cached and never served to anyone else; admitted under the shared-canvas limiter (category `shared_canvas_hooks`, billed to the viewer, never the sharer).

### 2.4 Model routing

| role (`LEARN_TASKS`) | model | use |
|---|---|---|
| `tutor_next_steps` | Sonnet 5.5, effort low | routine |
| `tutor_next_steps_escalation` | Opus 5.5 | once, on a missing tool call, a validator failure, or an ambiguous reading; directly when a claim's evidence contradicts itself |

Model ids live only in `learn-models.js`. The hook planner never calls JEV or an evaluate route. An Opus failure returns 502 and the hook shows `unavailable/failed`.

### 2.5 After the click: the `next_step` Tutor turn

- The existing router picks the row from the selected claims' evidence states, exactly as for any turn; the Tutor planner then chooses the action and the material.
- On a `next_step` turn the allowed actions also include `create_material { command, request }`. `command` is one of the Learn commands that can make a card right now (sent as `context.available_materials`, from the existing command registry: for example an interactive scene, Motion, code, a notebook, flashcards, an image, a graph, a video). The browser runs it through the existing Learn command path (`runLearnCommand`, `/api/learn/artifact`); a paid one shows the existing Generate / Not now proposal. There is no second artifact generator.
- Every other supported action stays available as the row allows: an explanation, a question (predict, transfer, Explain Back), an existing card or part, practice, a Rabbit Hole, and the Avatar Teacher when enabled.
- Typed turns are unchanged: `create_material` is offered only on a hook click.
- On a canvas with no registry, the turn has no claims in scope; the Tutor still answers the hook and may make material.

### 2.6 Recent modality history

Every Tutor turn's planner context carries `recent_modalities`: the modalities of the last 8 actions the learner experienced from the Tutor, oldest first, as generic names (section 3.2). It is evidence for the planner, which decides; there is no sequencing rule. Learning fit comes first; variety is secondary.

---

## 3. TutorDecisionTrace: a versioned decision telemetry contract

One structured event for every meaningful Tutor planning step: each Tutor turn (`tutor_decision`) and each hook recompute (`next_steps_computed`). Today it is consumed by the evaluation harness; later the same events, unchanged in shape, will be persisted for real learners. It is decision metadata, not chain-of-thought.

Rules:
- Telemetry on or off gives the same planner requests and the same results; the product never reads an event.
- Building or emitting an event never fails a Tutor turn or a hook recompute: every sink runs after the result is final, and any error inside telemetry is swallowed (counted in `globalThis.__smallTutorTraceErrors`).
- Never in an event: the learner's raw words, transcripts, chat history, model prompts, answer keys, `reason_internal`, or chain-of-thought. Raw debug payloads, if ever needed, are a separate, explicitly enabled debug path with its own retention; not part of this contract.
- Analytics identity is the stable internal `user_id`, never an email.
- Shared canvases: the event belongs to the viewer. It may carry the share's one-way key, board version and origin as provenance; it never carries the sharer's identity, journey, evidence or chats.

### 3.1 Schema (`trace_schema_version: 1`)

```
TutorDecisionEvent {
  trace_schema_version: 1,
  event: 'tutor_decision' | 'next_steps_computed',
  decision_id,                    "td_<16 hex>", unique per event
  step_id,                        tutor_decision: the turn id; next_steps_computed: the set_id
  generated_at,                   ISO-8601

  identity: {
    user_id: string | null,       stable internal user id (null for an anonymous shared viewer)
    session_id,                   the Tutor session id (one per canvas session store)
    canvas_id,                    the canvas (app) the decision happened on; the viewer's hole canvas once inside a hole
    board_id: string | null,
    canvas_version: number | null,  board revision, or the shared board version
    journey_id: string | null,
    section_id: string | null,
    dive_id: string | null,
    source: { share_key, share_version, origin_block_id } | null,   shared provenance (one-way key only)
    scope: 'owned' | 'shared',
    mode: 'journey' | 'dive' | 'course' | 'canvas' | 'shared'
  },

  versions: {
    planner_version,              PLANNER_VERSION of the Tutor or hook planner code (bumped by hand with any routing or planning change)
    prompt_version: string | null,   sha256 prefix (12 hex) of the system prompt and tool actually sent; null when no model was called
    model_role: string | null,       the LEARN_TASKS role used
    model_id: string | null          the served model id, as reported by the API
  },

  decision: {
    current_goal: { id: string | null, summary: string | null },
    current_section_id: string | null,
    target_concept_ids: [string],
    target_claim_ids: [string],
    evidence_summary: { understood: [], uncertain: [], misconception: [], prerequisite_gap: [], not_yet_observed: [] },   claim ids in scope, by state
    canvas_summary: { blocks: number, kinds: { [kind]: number }, presented_claim_ids: [string] },
    recent_modality_history: [modality],          at most 8, oldest first (what the planner saw)
    next_step_options: [{ id, hook, learning_goal, concept_ids, claim_ids }],   all 3 of the set computed (next_steps_computed) or shown (tutor_decision); [] when none
    selected_next_step_id: string | null,
    route: { row, strategy, intent } | null,
    chosen_action: { action_type, modality, target_concept_ids, target_claim_ids } | null,
    actions: [{ action_type, modality, target_concept_ids, target_claim_ids }],
    reason_codes: [reason_code],                  0-3
    reason_source: 'planner' | 'router' | null,
    rationale_summary: string | null,             at most 2 sentences, at most 300 characters
    expected_evidence: [{ claim_id, via: 'answer' | 'explain_back' | 'practice' | 'interaction' }],
    estimated_learning_seconds: number | null
  },

  runtime: {
    timing: { total_ms, planner_ms: number | null, first_text_ms: number | null },
    model: { tier: string | null, escalated: boolean, calls: number },
    usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd: number | null },
    validation: { ok: boolean, dropped_actions: number, repairs: [string], fallback: string | null }
  },

  flags: [string]                 for example vary_modality_alone
}
```

`chosen_action` is the turn's first action that is not plain text when there is one, else its text reply; null for `next_steps_computed`. A field the step does not have is null or [], never omitted, so every event has the same keys.

### 3.2 Vocabularies

- `reason_code` (generic; no topic codes): `advance_goal`, `deepen_mechanism`, `repair_misconception`, `fill_prerequisite_gap`, `check_understanding`, `test_transfer`, `consolidate`, `respond_to_question`, `follow_learner_interest`, `increase_interactivity`, `vary_modality`, `reduce_cognitive_load`, `resume_context`. `vary_modality` is never accepted as the only code: the event then adds the route row's code and the flag `vary_modality_alone`.
- `action_type`: the Tutor's existing action types (`respond_text`, `ask_question`, `show_authored_card`, `focus_part`, `suggest_depth`, `suggest_practice`, `suggest_dive`, `open_dive`, `return_from_dive`, `suggest_avatar_clip`, `create_material`, `no_action`).
- `modality`: the product's existing names. `text` (a Tutor reply), `question`, `explain_back`, `practice`, `depth`, `rabbit_hole`, `avatar`, and for a shown, focused or made card its existing block type (for example `explanation`, `scene`, `animation`, `snippet`, `code`, `notebook`, `flashcards`, `quiz`, `challenge`, `image`, `graph`, `video`, `paper`; an Explain Back challenge is `explain_back`). No card type is invented for the trace.

The planner writes `reason_codes` and `reason` (the rationale) at the end of every turn's tool call, after the actions, so the first spoken sentence is not delayed. When it gives no codes, the route row's code is used (`reason_source: 'router'`).

### 3.3 Location, sinks and access

- Module: `packages/web/src/learn-tutor-trace.js`: pure builders `decisionEvent` and `hooksEvent`, and `emitDecision`. `REASON_CODES` and `TRACE_SCHEMA_VERSION` live in `packages/control-plane/src/agents/learn-tutor.js`, so a future server-side store validates the same contract.
- Node (simulation harness): `runTurn({ ..., trace: true })` returns `result.trace` (a `tutor_decision` event); `hooksEvent(hookSet, snapshot)` builds a `next_steps_computed` event.
- Browser sinks: `emitDecision(event)` hands the event to every registered sink after the result is final. v1 registers one sink, only when the harness sets `globalThis.__SMALL_TUTOR_TRACE__ = true` before the page loads: it appends to `globalThis.__smallTutorTraces` (the newest 500) and dispatches a `small:tutor-trace` window event. Off by default; nothing is sent anywhere in v1.
- Later persistence adds a sink that posts events to a server route; the server stamps `user_id` from the session (ignoring the client's) and stores the event as-is. That route, its table and its retention are a separate, owner-approved change (a migration), not part of v1.
