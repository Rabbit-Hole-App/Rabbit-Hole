# Professor Next Steps

Owner: Learning Path agent (hook planner, contract, Tutor turn, decision trace, server routes). UI: Parallel (the bottom-left card).
Status: contract approved by the owner with corrections (2026-10-06), first frozen for UI integration at bab01392. This revision (Task 11d) is checked against the reviewed main line `5c176ec2` (Tasks 0-12 reviewed: 0-11, 11b, 11c-A, 11c-B with its fix rounds 1 to 3, and the test-only Task 12) and consolidates the owner decisions and the shipped names, the Auto Tutor routing contract (section 4) and creator analytics (section 5). Implementation is on `feature/professor-next-steps` (from main f4b99a3b), pushed through `08c95bee` (Learning's frozen hand-off) and being integrated by Parallel on `integration/professor-next-steps` (based on main `8efb6b23`); not deployed, no migration.
Task 14 fix pass (2026-10-07): the fixes from the four final whole-branch reviews and the owner's additions of that day are folded in (item 13 below); a passage that names the fix pass describes the code after `fd60d1a6`.
Provenance: all text matches the code at `5c176ec2`, except the owner's 2026-10-07 journey decisions (4.5, 1.8 items 7 and 13, the 4.7.2 offer line), which match `a92110cc`. Task 12 touches only tests, and the only product change since the document review is Task 11c-B round 3 (the answer-moment clock read and the handoff timeout stage status), folded in here. The server half of the handoff (Task 11c-A, the route) is specified in 4.7.1 and the Tutor half (Task 11c-B) in 4.7.2.

At a useful stopping point the Tutor offers exactly three curiosity hooks. A hook is a short learner-facing question that makes the learner want to click; the precise pedagogical target behind it (`learning_goal`) stays internal. A hook says WHAT the learner wants to pursue; after the click the existing Tutor planner decides HOW to teach it, including generating real material through the existing Learn commands. A click is never evidence and never a faked learner message.

---

## Changes since bab01392 (for Parallel and the Tutor Evaluation agent)

UI-facing contract and integration points (details in 1.3, 1.4, 1.7):

1. Voice Mode: a hook click while Voice is on is `voice.say('', { nextStep, selectedAt })`, never a typed `askStep`. It takes the floor like a barge-in while the Tutor is speaking, waits while an avatar clip holds Voice (newest click wins), and is refused (shown as busy) only while a turn is thinking or Voice is off. This replaces the typed-only recipe in 1.4.
2. `tutor.extras` is a getter read when drawn: the Generate / Not now offer of a paid card the Tutor made, the notices of made material, and the turn chips (including Back up the Rabbit Hole, Research this and Start a learning path). Draw it wherever hooks are mounted: an undrawn paid offer blocks the one-at-a-time queue.
3. Mount gating: mount `useNextSteps` only when `learnPreview` is on and a composer exists, never on review boards (`reviewTools && board`). There is no title wiring: the live title is the server title inside `useTutor`, so a rename refreshes the Tutor goal and invalidates hooks.
4. Hooks also run on plain canvases and Rabbit Holes with no registry (holes from shared canvases included). A plain canvas needs a lesson card; a hole shows no hooks until its dive record and its parent journey have been read.
5. Carried hooks: `tutor.opening` is `{ key, next_step }` for a hook carried into a hole; send it once with `tutor.askStep`, never as typed text. A shared step's `source` gains `title_fingerprint`, a board rename answers `409 stale_hook` like a version change, and a chat-card origin reads as the root. `shared-rabbit-hole.js` helpers: `resumeHref(..., hookId)`, `takeResume(..., { hook: true })`, `requestRabbitHole(..., { step })`.
6. Canvas commands: the explicit Canvas overrides are `/ask` and `/teach` (`/motion` where supported; it does not exist yet). `/research` and `/do` are Home/Library workflows: remove their Canvas exposures (1.7 lists them with their lines). `learnSlash.run` must pass `ask` and `teach` to `tutor.slash(name, raw)` beside `deeper` and `simplify` (`LearnPage.jsx:500`).
7. The Auto Tutor is on every canvas: natural typing and Voice on plain canvases, plain holes and holes from shared canvases go to it (no journey needed) instead of Learn chat, so `tutor.active` is true there. The block follow-up composer must pass the Tutor too (`LearnPage.jsx:1333`, required). Pass `openResearch` to `useTutor` to enable the Research this chip (`LearnPage.jsx:558`). The Tutor may offer a learning path (`suggest_journey`) in place of the old LP1 keyword gate; no page callback. Questions that need the repository's source go through the Tutor's `repository_context` handoff on repository canvases: the Tutor plans a `handoff` action and the browser runs it through the 11c-A route; its answer is the Tutor reply, so nothing new is drawn. Pass `repository: repoAttached && canvasRepository(app)` to `useTutor` so a detached repository is honoured (`LearnPage.jsx:558`).
8. `useTutor` takes `canvasVersion` (Required wherever the page has a board revision, 1.7) and optional `openResearch`; `useNextSteps` takes optional `canvasVersion`, `board`, `describe` and keeps `title` as a fallback. Mounting `useNextSteps` adds about 19 kB raw, 7.3 kB gzip to the Learn chunk (measured at Task 9, not re-measured at `5c176ec2`).

Decision trace and planner (sections 2 and 3):

9. New event `next_steps_shown` (the impression); every option carries `suggestion_id`, `set_id`, `position`; `selected_at`, `shown_at` and `evidence_transitions` added; `command` on every action; `runtime.planner_input`; flags `cached` and `discarded`; `validation.fallback` is a category, never error text; unknown token counts are null.
10. Hook planner: the goal comes from structured sources only (the learner's words travel only as `recent.question`); completed-section claims enter only to repair; the input is trimmed to 9000 characters in a fixed order and fails as `unavailable/failed` when it cannot fit; the tool gains `ambiguous`.
11. Tutor turn: several `create_material` actions (distinct commands) are allowed within the 3-action cap; the modality history is what the Tutor put in front of the learner; the fast tier releases its first sentence when the actions are complete and checked. Natural-language Auto turns may create material, offer Research this (`suggest_research`) and offer a learning path (`suggest_journey`). Nine decision keys join the event after `estimated_learning_seconds` (`intent_mode` through `research_executed`, 3.1) and every action carries `cost_tier` and `capability`; `reading_value_dropped` is a new repair rule. A typed slash never answers an open Tutor question.
12. Task 11c-B: the `handoff` action, `capability` on every action contract, `runtime.handoff` (with `tool_errors`; the failure categories `stopped` and `invalid_action` are new), `handoff_ms` and `blocking_wait_ms` in `runtime.timing`, `grounding_status: retrieval_failed`, `repository` in `source_types_used` on success, and `TUTOR_PLANNER_VERSION` `tutor-planner-2` (4.6 to 4.9).
13. Task 14 fix pass:
    - the shared hooks route on a `SUBSCRIPTION_ONLY` worker serves only the subscription owner: anyone else, anonymous viewers included, gets the shared ask's 403 and body, after the request checks and before the cache, the limiter and the planner (1.5);
    - Tutor-made material is grounded in the turn's selected card, as a typed command with that card is (2.5);
    - a handoff that returns no answer drops the `create_material` planned beside it, recorded as a decision (4.7.2);
    - both browser hook posts give up after 60 s (on a shared canvas one signal also covers a signed-in viewer's `/api/me` read), so a hung call is `failed` for its basis and newer bases proceed (2.3);
    - `runtime.handoff.prompt_version` and `decision.offered_actions` complete trace v1 (3.1);
    - `tutor_handoff` usage rows record `repository` 1 (4.7.1);
    - Voice speaks a handoff answer through the plain-speech path, never its code, markup or URLs (1.7, 4.7.2);
    - the planner-tier rule is written down as the owner decided it (4.1.1).

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
  source?: { share_version, origin_block_id, title_fingerprint }   shared only: the board version, the card id or ':root', and a one-way hash of the board title
}
```

- The hook planner's tool is exactly `suggest_next_steps { options: [3 x { hook, learning_goal, concept_ids, claim_ids, reason_internal }], ambiguous? }`. `ambiguous` is an optional top-level boolean beside the options: the planner sets it when the evidence can be read more than one way, and `true` escalates once (2.4). It is not an option field and never reaches a HookSet. The server mints each option's `id`. The hook planner never chooses a modality.
- `reason_internal` never leaves the server: it is validated, counted in telemetry, and stripped from every response. Its validator rule is named `reason`, so the field name never appears in a client-visible error or in telemetry.
- One shape everywhere: Learning Journey canvas, a registered course, a plain owned canvas, a Rabbit Hole, and a shared canvas. Only `scope` and `source` differ.

### 1.2 Statuses

| status | meaning | UI |
|---|---|---|
| `loading` | a request is in flight and no set exists for the current basis | placeholder or nothing |
| `ready` | `options` holds 3 hooks for the current basis | show 3 buttons |
| `stale` | the basis changed; the set last on screen is kept until the new set lands | buttons disabled |
| `unavailable` | nothing to show. `reason`: `not_now` (not a stopping point), `failed` (the planner failed after escalation, the reply was malformed, the request timed out after 60 s, or the input could not be trimmed to fit, `input_too_large`), `limited` (server rate limit, or the per-mount safety ceiling, 2.3), or `off` (no Tutor context here; also a hole whose dive record or parent journey has not been read yet) | show nothing |

Not a stopping point (`not_now`): the Tutor is answering; a Tutor question is waiting for an answer; the return-from-hole check is pending; the journey tray, intake, diagnostic or path review owns the choices; a section is being built or the journey has a pending action; the canvas has no goal and no blocks (the goal is the live one the hook input is built from, `goalOf` over the Tutor snapshot, never the page's `title` prop alone). A plain canvas (no registry, not a hole) with no lesson card is `not_now` whatever its title: a title alone never grounds hooks. Chat exchanges are not canvas blocks (`canvasApi.blocks()` returns lesson blocks only), so chat alone never grounds them either.

Voice Mode is not a reason to hide hooks: while Voice is on, hooks stay visible and clickable, a click enters the same Tutor path, and the Tutor's reply follows the existing Voice behaviour. v1 adds no voice command for choosing a hook.

The hook keeps one outcome per basis (a set or a failure). A basis is never requested twice; returning to a basis whose set already landed shows it again with no request; a 429 stays `limited` until the basis changes. A reply counts as ready only when `options` is exactly 3 objects, each with an `id` string, a `hook` string and a `selected_next_step` object (not an array), with distinct ids; anything else is `unavailable/failed`. `select()` refuses in this order: `unknown` (the id is not in the current or last shown set), `busy` (a Tutor turn is running, or any stop is set), `stale`.

### 1.3 Integration hook API (no UI included)

```
// owned canvases (LearnPage; Rabbit Holes included)
const tutor = useTutor({ ..., canvasVersion, openResearch?, repository? })  // canvasVersion: the board revision (Required, 1.7); openResearch(request): the Research this chip (4.5); repository: false to refuse the handoff (4.7.2); no title param
const steps = useNextSteps({ tutor, journey, canvasApi, canvasState, record, access, title, graded,
                             canvasVersion?, board?, describe? })

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

Both hooks live in `packages/web/src/LearnNextSteps.jsx`. `select()` only validates the click and returns the payload (a copy); it never runs a turn. `canvasVersion` is telemetry only; `board` defaults to `main`; `describe` is `describeBlock` and supplies card titles, never a card's answers (a `text` or `heading` card with no title, which `describe` does not name, travels as its first 80 characters, 2.1); `title` is a fallback: the live title is the server title inside `useTutor` (1.7).

`useTutor` always returns `askStep`, `snapshot`, `lastTurn`, `busy` and `showing`, also where the Tutor is not active, so `useNextSteps` can tell whether hooks belong there; the last four are internal to `useNextSteps`. It returns `ask` and `voiceTurn` only where the resolved capabilities have `tutor`; it returns `opening` and `extras` where `tutor` or `capabilities.hook_turns` holds (`hook_turns`: hook clicks and the paid offers they raise, no typed or voice turns; `tutorContext` returns such an entry like a `tutor` one). A canvas with no registry entry (a plain canvas, a plain hole, a hole from a shared canvas) gets the generic canvas domain with `{ tutor: true, hook_turns: true }`: hook clicks, typed text and Voice Mode all reach the Auto Tutor (section 4.2), so `useTutor` returns `ask` and `voiceTurn` there. `hook_turns` without `tutor` stays possible only for a registered entry that asks for it; none does today. `ownedSteps` and `sharedSteps` are internal, exported only for node tests: not part of this contract.

### 1.4 Sending a click

**Owned canvas** (journey, registered course, plain canvas, Rabbit Hole), Voice off:

```
const r = steps.select(hook.id)
if (r.ok) await tutor.askStep({ selected_next_step: r.selected_next_step, signal, begin })
// same return contract as tutor.ask(): resolves to the reply text or { handled }
// askStep also takes inputModality, turnId and onSpeakable; it stamps selectedAt (the click time) itself
```

- One Tutor turn of kind `next_step`: the step travels as structured data; the learner message is empty.
- No `/api/learn/tutor/evaluate` call and no journey action, so the click writes no evidence. The turn has no target block (no practice rung), no journey resolver runs, and a waiting `/deeper` stays for the next typed turn. The click is consent for navigation actions.
- The Tutor may answer with any supported action, including new material made through the existing Learn commands (a paid one still asks Generate / Not now first). `askStep` runs those actions; the UI adds nothing but drawing `tutor.extras`.
- The dock may draw the chosen hook as a selection chip (visibly a choice, not typed text).

**Voice Mode on**: never fall back to `askStep`; a typed reply would not be spoken and old audio would keep playing.

```
const r = steps.select(id)
if (!r.ok) return                                    // stale, unknown or busy
const selectedAt = new Date().toISOString()           // the click time
if (voice?.on) {
  if (!voice.say('', { nextStep: r.selected_next_step, selectedAt })) { /* refused: treat as busy */ }
  return
}
await tutor.askStep({ selected_next_step: r.selected_next_step, signal, begin })
```

- `say('', { nextStep, selectedAt })` runs a voice `next_step` turn (`tutor.voiceTurn` with the step and no words). It is spoken and captioned like any voice reply, never a chat bubble, and it never consumes an armed card.
- Listening: it runs now. Starting: queued until listening. Speaking: it barges in (stops the audio, ends and aborts the old turn, then runs). Held by an avatar clip: queued, the newest click wins, run once when the hold ends (a click queued while Voice starts survives a hold). Thinking, or Voice off: refused (`say` returns false); leaving Voice drops a queued click.

**Shared canvas** (read-only viewer): the click starts or resumes the viewer's private Rabbit Hole through the existing Start Rabbit Hole route.

```
POST /api/learn/boards/shared/<token>/rabbit-hole
{ origin: <rabbitOrigin(...) as today>, selected_next_step }
-> 201 new / 200 existing { name, title, url, existing?, source?, next_step }   next_step = the server-checked step
-> 409 { error: 'stale_hook' }     the board version changed or the board was renamed: start again without it
-> 400                              a malformed step, wording, ids, scope or origin
-> 401 { error, signIn: true }       signed out: sign in first (requestRabbitHole returns { signIn: true })
-> 404                              the origin card is not on this shared canvas
```

- Origin: the selected shared card, else the root, exactly as today. No fork, no copy, no write to the shared board. A chat card is not content: as an origin it reads as the root.
- The step is checked before anything is read or written for the viewer, in this order: the version and title fingerprint (409), then wording and ids against the same trimmed input that generated the hook (2.1), then the origin. Only the checked fields are echoed as `next_step`.
- The selected hook's `learning_goal` becomes the new hole's initial goal (`learning_goal` on its dive record).
- Before navigating to `url`: `carryStep(sessionStorage, name, next_step)` (from `learn-next-steps.js`). The hole's first Tutor turn opens the hook once instead of the usual opening question: where hook turns run, the hole's opening effect takes the carried step once (`takeCarriedStep`) and `tutor.opening` becomes `{ key: dive_id, next_step }`; the page sends it once with `tutor.askStep`, not as typed text, or with `voice.say('', { nextStep: tutor.opening.next_step })` while Voice is on (as any click, above). A canvas-domain hole sends it once the hole's Tutor context has resolved.
- `requestRabbitHole(token, origin, { step })` (in `shared-rabbit-hole.js`) sends the step and returns `{ url, existing }` (plus `name` and `next_step` when the server echoed a step), `{ stale: true }` on 409 `stale_hook`, or `{ signIn: true }`; other refusals throw.
- Signed out: `keepPendingStep(sessionStorage, token, selected_next_step)`, then `resumeHref(pathname, cardId, hook.id)` gives `/login?next=<path>?rabbit=<card|root>&hook=<id>`. After sign-in `takeResume(location, history, { hook: true })` returns `{ origin, hook }` (`undefined` when there is nothing to resume); `takePendingStep(sessionStorage, token, hook)` gives back the kept step once, only for the same link and hook id. Send it with the rabbit-hole POST. A missing step or a `stale_hook` reply starts the hole without it.

### 1.5 Where sets come from (the hooks call these; the UI does not)

- Owned: `POST /api/learn/tutor/next-steps { app, input }` -> `HookSet` plus `telemetry`. A separate call, never part of a Tutor turn. The planner is `planNextSteps` (2.4).
- Shared: `POST /api/learn/boards/shared/<token>/next-steps { origin: { block_id } | null, viewer_states? }` -> `HookSet` plus `telemetry`. Built per request, never stored with the board, nothing written to the source. `viewer_states` is sent only when the viewer is signed in and has evidence (2.1). Anonymous on public links, sign-in (401) on private ones.
- `telemetry` is the planner's telemetry (tier, escalation reason, calls, ms, versions, model role and id, usage, cost, rule names; shared adds `share_key`, a structural `summary` of the input and the trim counts `trim` (`{ before, after, trimmed }`, counts only, beside the set and never in the model input); `cached: true` with zero calls, usage and cost on a cache hit). The hook consumes it only to build the decision events (section 3); it is never part of `steps`.
- Stored telemetry (owner 2026-10-08, `learn-migrations/0012-next-steps-telemetry.sql`): each planned set, owned or shared, also writes one `next_steps_telemetry` row: `scope` (`owned` or `shared`), `user_id` (users.id: the owner, or a signed-in shared viewer; null for an anonymous one), `board` (the owned app id, or the one-way share key) and `telemetry_json`, the reply's `telemetry` as-is. Never a hook, the input, an email or a share token. A set whose Opus escalation fails too (502) also writes its row, with `failed: true` and `escalation_errors` (the escalation's own rule names, `[]` with no tool call); the 502 body is unchanged (Tutor eval run A, 2026-10-08; 0012's header predates this). The telemetry carries `rejected_words`: the word count of each hook in a routine reply the validator refused, numbers only, else null. A cache hit and a refusal write no row; the write is best effort (`keepTelemetry`, `learn-next-steps-routes.js`), so a failed write never costs the reply. Rows are not pruned yet. Production waits for a release GO.
- Statuses: 200; 403 on a `SUBSCRIPTION_ONLY` worker for anyone but the subscription owner (owned: `tutorRoute`'s gate; shared, Task 14: every viewer but the owner, anonymous ones included, with the shared ask's status and body, after the request checks and before the cache, the limiter and the planner, so no bridge call and no usage row); 400 (input problem: shape, a forbidden key, a body over 16000 characters, an input over 12000 characters, and on the shared route an input the trim cannot fit, `input_too_large`); 404 (shared: an unknown card); 429 `{ limited: true }` past the server limits (section 2.3), which the hook reports as `unavailable/limited`; 502 when the planner fails after escalation (`unavailable/failed`); 503 when the worker has no Learn database (owned).

### 1.6 The UI must never

- Show `learning_goal`, ids, `basis` or anything else in `selected_next_step`. Only `hook` is rendered, verbatim.
- Send a hook, or any sentence built from one, as a typed or composer message, or as `raw` to `tutor.ask`.
- Reword, reorder, or show fewer or more than 3 hooks.
- Request sets on click, pan, zoom, hover or mouse movement. The hook decides when (section 2.3).
- Call any evidence route on a click.
- Render or store a decision trace (section 3).
- Mount the hooks where there is no composer, or on a review board (`?board=` on a course app).

### 1.7 Parallel-owned integration points

- `ask.jsx`:
  - the selection chip;
  - the hook click: the owned and Voice recipes in 1.4;
  - `tutor.opening.next_step` (a hook carried into a new hole): send it once with `tutor.askStep({ selected_next_step: tutor.opening.next_step, ... })`, keyed by `opening.key`, never as typed text; with Voice on, `voice.say('', { nextStep: tutor.opening.next_step })` instead, as in 1.4. This branch and SharedBoardPage's `carryStep` land together: the hole's opening effect takes a carried step once, so a carry with no branch to send it loses both the hook and the hole's opening;
  - draw `tutor.extras` wherever hooks are mounted (the Generate / Not now offer of a paid card, the notices of made material, the turn chips such as Back up the Rabbit Hole). It is read when drawn; reading it once at spread time loses later changes.
- `LearnPage.jsx`:
  - **Required**: mount `useNextSteps({ tutor, journey, canvasApi, canvasState, record: dive.tree?.dive || null, access: askScope, title, graded, canvasVersion, board: boardName, describe: describeBlock })` (today `LearnPage.jsx` does not mount it);
  - **Required**, mount gating: only when `learnPreview` is on and a composer exists, and not on review boards (`reviewTools && board`): `useTutor` cannot tell a review board from a canvas. Mount and `tutor.extras` land together;
  - **No wiring needed** for the title: no title wiring for `useTutor`: its live title is the server title of this level (the last title of `dive.tree.path`, reloaded by Dive on a rename, with `app.title` last), never `canvasTitle`, which is a localStorage copy. `useNextSteps` keeps its `title` prop as a fallback;
  - **Required** wherever the page has a board revision: pass `canvasVersion` to `useTutor`. It is telemetry only, but until it is passed every `tutor_decision` carries `identity.canvas_version` null, so an owned Tutor event cannot be linked to the canvas revision (owner third message);
  - **Required**: a `graded` counter bumped when `gradeCanvasAnswer` resolves;
  - **No change needed**: since Task 11b a plain canvas and a hole are `tutor.active`, so the dock's `tutor={tutor.active ? tutor : null}` already carries `tutor.extras`, `tutor.opening` and `tutor.askStep`, and `useVoiceSession` follows `tutor.active` too. `hook_turns` without `tutor` (clicks only, no typed turn) is a registered-entry case with no entry today. The voice `TutorCaption` reads `tutor.extras` regardless of `active`;
  - **Required**: route `/ask` and `/teach` to the Tutor: `LearnPage.jsx:500` is `['deeper', 'simplify'].includes(parsed.name)` and must become `['deeper', 'simplify', 'ask', 'teach']` (or use `SLASHES` / `MODE_SLASHES`). Without it the command word never reaches `tutor.slash`, so the turn is an ordinary Auto turn with no explicit override. `research` and `do` are not passed (section 4.3). `/motion` when that command exists;
  - **Required for the Research this chip** (without it no Research offer exists): wire Research this: `useTutor` at `LearnPage.jsx:558` takes `openResearch: request => <open the existing Home/Library Research workflow seeded with request>`. Until it is passed no Research offer exists: the router never allows `suggest_research` without it (4.5);
  - **Required**, selected card plus natural typing must reach the Auto Tutor in a block follow-up too (owner eleventh message 6): `LearnPage.jsx:1333` `renderBlockComposer` passes `tutor={journey.journey || (tutor.active && dive.tree?.dive?.journey) ? tutor : null}`, which keeps "Follow up in this block" on the Learn chat outside journeys. Pass `tutor.active ? tutor : null`, as the dock does;
  - **Visual check**: the floating Rabbit Hole suggestion card (`LearnPage.jsx:1333`, `dive.suggestionCard && !tutor.active`) is now hidden on plain canvases; the same card draws inside `tutor.extras` instead, as on course canvases. A visual check is advised;
  - **Required** to honour a repository detach: honour the repository detach for the handoff: pass `repository: repoAttached && canvasRepository(app)` in the `useTutor` call at `LearnPage.jsx:558` (`repoAttached` is `LearnPage.jsx:489`; `canvasRepository` is exported from `LearnTutor.jsx`). Learn chat stops sending `repository_context` when the learner detaches the repository source; until the prop is passed the Tutor still offers the handoff on a repository app after a detach (the default is the app's own `canvasRepository(app)`);
  - **Visual check**: a handoff answer in the dock: it is Learn-chat-style text (it may hold markdown and a `Sources: path:lines` line) drawn through the existing Tutor reply rendering in `ask.jsx`;
  - **Built** (owner addition, Task 14; nothing to wire): in Voice Mode a handoff answer is spoken through the established plain-speech path, `speakable` in `voice-tts.js`, which every `tts.speak` applies: fenced blocks, inline code, math, markdown syntax, HTML tags and URLs are never read aloud (link text stays), and each spoken clip ends at about 600 characters, at a sentence end (the cap is per `tts.speak` clip: after an early lead-in the continuation has its own cap, so a turn can speak the lead-in plus about 600 more). The caption and the dock show the full answer, code included. A failed handoff speaks the plain failure line. No prompt or model call was added;
  - **No wiring needed**: `suggest_journey` needs no page callback: `useTutor` calls the `journey.start` it already receives, so keep passing `journey` to `useTutor` (`LearnPage.jsx:558` does);
  - **Required**: remove or hide the Canvas exposures of `/research` and `/do` (owner thirteenth message; flagged here, not preserved as a Tutor requirement; Parallel owns the edits). Found at 5c176ec2:
    - `agent/slash.js` lines 21-22 (the `research` and `do` commands, `places: ALL`; narrow to `['home', 'project']`; the module is shared with the Agent Bar, see `docs/features/rabbit-hole-commands.md`), line 63 (the comment that `/ask`, `/teach` and `/do` stay available), line 65 (`LEARN_MENU.learn` lists `research`) and line 87 (`reviewOff` keeps research on for `kind === 'canvas'`);
    - `learn-slash.js` line 44 (`EXAMPLES.research`) and line 49 (`EXAMPLES.do`; `ask` and `teach` on that line stay);
    - `SlashCommandsSheet.jsx` lines 27 (research) and 29 (do);
    - tests: `agent/slash.test.mjs` lines 11, 55 and 110, `agent/bar.test.mjs` line 157, `learn-slash.test.mjs` line 20 and `e2e/slash-sheet-check.mjs` line 65;
    - not Canvas, so unchanged: `e2e/rabbit-hole-check.mjs` lines 724 and 1402-1408 (the Home Agent Bar) and `e2e/learn-handoff-check.mjs` (the Home to Learn research handoff).
- `AdaptiveCanvas.jsx`: an `attempts` count (sum of practice attempt logs) in `onState`. Until it is reported, a practice attempt changes the basis only once its evidence lands.
- `SharedBoardPage.jsx`:
  - mount `useSharedNextSteps({ token, card: <selected card id or null>, version: shared.version, signedIn: !!shared.viewer })` and render the 3 hooks verbatim when `ready` (disabled when `stale`);
  - click: `const r = steps.select(hook.id)`; if `r.ok`, `requestRabbitHole(token, rabbitOrigin(state, card, describe), { step: r.selected_next_step })`. `{ url, name, next_step }`: `carryStep(sessionStorage, name, next_step)` then navigate to `url`. `{ stale: true }`: start again without the step (on a rename-only change the same set stays until reload; the restart navigates away anyway). `{ signIn: true }`: `keepPendingStep(sessionStorage, token, r.selected_next_step)` and go to `resumeHref(location.pathname, card, hook.id)`;
  - after sign-in: `const back = takeResume(location, history, { hook: true })`; if `back`, `const step = back.hook ? takePendingStep(sessionStorage, token, back.hook) : null` and send it with the rabbit-hole POST (a missing step or a stale reply starts the hole without it).
- `shared-rabbit-hole.js`: provided by the Learning lane, backward compatible, so the existing callers are unchanged: `requestRabbitHole(..., { step })`, `resumeHref(pathname, cardId, hookId)`, `takeResume(location, history, { hook: true })` returning `{ origin, hook }`. The SharedBoardPage wiring stays Parallel's.
- Already provided by the Learning lane: `voice-session.js` `say('', { nextStep, selectedAt })`, `LearnVoice.jsx` (a hook click never consumes the armed card).
- Bundle: nothing from the hook modules is in the shipped Learn chunk until `useNextSteps` is mounted; mounted, it adds about 19 kB raw, 7.3 kB gzip (measured at Task 9, not re-measured at `5c176ec2`).
- The repository handoff needs no new drawing: its answer is the Tutor reply, in the dock and in Voice. Do not add a second path to the repository reader. The page items for it are in the `LearnPage.jsx` list above.

### 1.8 Known limits (v1)

1. Opaque, not hidden: the browser receives `learning_goal` and the ids inside `selected_next_step`, because the Tutor turn is assembled in the browser. Hiding them needs server-held sets or a signing secret; neither is in v1.
2. On owned canvases a stale click is refused in the browser; on shared canvases the server refuses it too (409 `stale_hook`, also after a board rename).
3. The owned reply cache keys one-way on user, canvas and basis. On `*.workers.dev` hostnames the edge cache does not take effect, so dev clones may miss it (a known dev limitation, owner fourth message). The per-user caps in the database are authoritative; verify duplicate-reply behaviour on the custom domain at deployment time.
4. `askStep` stamps `selectedAt` itself at call time and ignores a passed value; the Voice path forwards the one it is given.
5. Every plain canvas waits for its dive record (one small GET) before hooks, because only that record says whether the canvas is a hole; a failed read keeps it hook-less.
6. A shared board's hooks use only claims of public registered courses (entries with `suppliedCourse`); other boards get content-grounded hooks with empty id lists.
7. Review boards other than the slice board are not registered courses, so they resolve as plain canvases: typed text there goes to the Auto Tutor instead of the Learn chat (`tutorContext`, `learn-tutor-domains.js`). Hooks stay unmounted on them (1.7). Owner decision 2026-10-07: the Auto Tutor stays on dev/review boards, isolated from real learner boards: a review board is its own board name (`?board=`, dev/review builds only), and its journey rows, journey requests, evaluate writes and Tutor session store are keyed by that board (`learn-journey-route.test.js` and `learn-journey-ui.test.mjs`, owner 2026-10-07 (g)).
8. A plain hole is `tutor.active`, so its automatic opening question is a Tutor turn: one planner call per new hole, on the learner's own Go down, with no material offered (`turnOffers` gives `[]` for an automatic opening; a carried hook opening is a `next_step` turn and keeps them).
9. A repository canvas (a `repo-*` app, or a canvas with a project) can hand a source question to the repository reader (4.7); every other canvas answers from the supplied context only. The Auto Tutor has no web research and no canvas-editing agent: research is only offered (section 4.5) and the Do agent not at all (section 4.10). Two limits of the handoff are in 4.10: no handoff in a repository Rabbit Hole in v1, and a selected card that cites a different repository gets the honest failure.
10. A notice from a slow `create_material` command can land under the next turn's reply (informative; a `ponytail:` note in `LearnTutor.jsx`), a Generate that throws still clears its offer and lets the next one show (`decide` in `useTutor`), and a clarification question from a command is shown as a notice that cannot be answered in place. All three are accepted for v1.
11. The handoff answer is the turn's `tutor` text in the session store, so the next turns' `recent_turns` (the last 2 reach the planner) can carry it: up to about 10k characters each (the chat answer limit is 2400 tokens), under the 60000-character planner context cap.
12. `select()` records the goal as selected (the next hook input's `previous.goals`) when it validates a click, before the page sends it, so a send that Voice refuses (thinking) or an immediate Stop still counts it. The refusal window is a few milliseconds; a stopped click still counts as chosen. Accepted for v1 (Task 14 C-M7).
13. Evaluator limits are listed where they arise: 4.5 (contextual answers inside an open journey tray, and switching subject during setup through the chip and continue-or-start; owner decisions 2026-10-07), 4.7.2 (stopped turns only in the bench event; a cap eviction the plan's words may not reflect), 4.8 (the worst-case wait) and 4.10 (capability gaps).

---

## 2. Hook planner

### 2.1 Input (structured state, never a chat dump; at most 9000 characters)

| field | content |
|---|---|
| `mode` | `journey`, `dive` or `canvas` (owned), `shared` |
| `basis` | the staleness key (2.3) |
| `goal` | built from structured sources only. Journey: the journey goal. A hole: its `learning_goal` (the hook that opened it), else `<parent goal> - <title>` (the parent goal is the journey goal for a journey hole and the course subject for a course hole), else its title. Otherwise the course subject or the canvas title (the live title). The learner's own words never enter the goal; their latest question or request travels only as `recent.question`. Shared: absent unless the viewer has an explicit, reliable structured goal (none exists in v1) |
| `path` (journey) | current section `{ id, title, purpose, claim_ids }`, completed sections `{ id, title, claim_ids }` (newest 6), upcoming section titles only (4) |
| `canvas.blocks` | up to 20 `{ id, kind, title, concept_ids, claim_ids, practice }`. `kind` is the block type (the name `canvas_summary.kinds` uses); the title comes from `describe` (quiz and challenge cards are named by their question or prompt, flashcards by their count, `<n> cards`, never their answers); a `text` or `heading` card with no title, which `describe` does not name, is named by the first 80 characters of its text; `practice` is the last attempt's result, `open`, or null. A chat card, if one is ever a block, is `kind: chat`, titled by its question (80 characters) and never read for its answer: it grounds but never defines the topic (a format-like message such as quiz me never makes a format word valid) |
| `scope.concepts` / `scope.claims` | up to 12 claims with statement, ideas, drawn case, evidence state (one of the five), misconception id, prerequisite, settled counts, and whether it is presented on the canvas; priority: current section or hole claims, then the newest blocks' claims, then claims with evidence, then prerequisites, then completed-section claims that need repair. A claim only in completed sections enters only when it needs repair (below); an understood completed claim never takes a place. Built by one builder (`nextStepsScope`) shared with the shared route |
| `recent` | last intent kind; the learner's own last question (only for a question or request, at most 300 characters); state transitions (6); recent modalities (8); practice results (4). Transitions and practice name only claims and cards still kept after trimming |
| `previous` | the last hooks shown (6) and goals selected (3), so hooks do not repeat |
| `dive` (holes) | title, concept, claims, parent goal and section, parent claim states (read only) |
| `constraints` | learner constraints from the session and the journey (depth, minutes, coding, math) |

Never in the input: intake familiarity or background, raw intake answers, transcripts, answer keys, expected answers, or any level or score.

Needs repair (the one rule, in browser and validator): a misconception, a prerequisite gap, or an uncertain claim with at least one settled fail or misconception (passes alone, or unsettled evidence, are not repair); or the concept a prerequisite gap claim in scope names (a missing prerequisite). Every completed section counts for this rule, although `path.completed` lists the newest 6. A missing prerequisite leaves with its gap claim.

Cap and trim. Over 9000 characters the browser trims by structured priority only, never by titles or text. Cards go first, the lowest rank first and the oldest among equals, down to 6 (highest rank is kept longest: the current section heading and cards naming an essential claim; then cards naming any kept claim and the newest card; every other card goes first). Then the lowest-priority claims that are not essential. Then the remaining cards. The section's or hole's claims (the first claim when there are none) go last of all, and at least one claim is always kept. A card's `claim_ids`, `recent` and a missing prerequisite follow what is kept. If trimming would leave no claim where the registry offered some, or the input still does not fit, no request is made and the hook is `unavailable/failed` (`input_too_large`). The server refuses an input over 12000 characters (400). The trim counts travel beside the request body for telemetry (`runtime.planner_input`, 3.1), never inside it. The shared input uses the same trim helper (`trimToFit` in `agents/learn-next-steps.js`; the selected card ranks above every other card and its claims are essential, falling back to the first scope claim when it names none), and Start Rabbit Hole rebuilds the same trimmed input, so generation and the click validate against the same scope.

Shared input is built on the server from the shared board's visible content only: lesson block titles (at most 20 blocks, the selected card always among them), the selected card `{ id, title }` or null for the root, the board title (as data, never a goal), and concepts and claims of public registered courses visible in that content (selected card first). The board version is not in the model input; it travels in each step's `source`. A signed-in viewer may add their own claim states (`viewer_states`, filtered to the server-built scope, the five states, `not_yet_observed` dropped because it is no evidence, at most 12). Never the sharer's journey, evidence, Tutor store, chats or identity; chat cards on the board are excluded, and a chat card used as the origin reads as the root; no goal is inferred (not even from the viewer's earlier Rabbit Hole from the same share, which matters only when that hole is resumed). Anonymous viewers get hooks from content only.

### 2.2 Validation (server; a failure escalates, never loosens)

- Exactly 3 options; each hook 4-12 words, at most 90 characters, one line, no code.
- Never a command or course label (learn, explain, study, continue, next lesson ...), never a format name (quiz, flashcards, animation, Motion, video, diagram, card, Explain Back ...) unless the canvas topic is that thing, no clickbait. Motion is caught as the product name (capitalised, or all caps MOTION), as motion graphic, clip or video, and as `with motion` within three words after a show, shown, explain, see, seen, watch, animate, illustrate, demonstrate or visualise verb (shown, seen and MOTION since Task 14); plain lowercase motion as physics vocabulary passes.
- Answer reveal: a deterministic first gate rejects a hook containing 5 consecutive words of its claims' statements, ideas or drawn case, or of its own `learning_goal`. It catches copying only; the hook planner's prompt carries the semantic rule (never state the answer). No topic-specific answer lists.
- No level, mastery or ability wording in a hook or goal.
- `concept_ids` and `claim_ids` only from the input scope; at least one id per option when the scope is not empty; both empty when it is.
- Completed-section claims only to repair a misconception, prerequisite gap or uncertain claim (the repair rule in 2.1).
- Three distinct hooks (different text, different goals, not the same claims with the same goal) that repeat nothing from `previous`.

Rule names (the only validator text that reaches telemetry; never the hook): `shape`, `hook_words`, `hook_chars`, `hook_line`, `hook_code`, `command`, `format_word`, `clickbait`, `level_label`, `answer_reveal`, `learner_words`, `goal`, `ids`, `ungrounded`, `completed_only`, `reason`, `duplicate_hook`, `duplicate_goal`, `repeat`.

### 2.3 Recompute triggers, staleness and limits

The basis changes, and the shown set turns `stale` immediately, on:

- a finished Tutor turn (typed, voice, slash, opening, or a hook click);
- a new evidence event (including an option answer outside a turn);
- a path change, a section change, or a section materialized;
- a card added or removed (not moved, selected or zoomed);
- a practice attempt; a graded canvas answer;
- entering or leaving a Rabbit Hole;
- a change of the effective Tutor context (journey, Rabbit Hole, course or plain canvas), of the parent journey or section a hole stands on, or of the canvas title where it grounds the goal (a plain canvas yes, a registered course no), or of a hole's live title (every hole's hook input carries it, so a rename recomputes even when a `learning_goal` is the goal): a rename or the parent journey arriving recomputes. The live title is the server title of that level, never a copy.

The owned basis is a short hash of that state (`nb_` and 8 hex; the server caps a basis at 400 characters). It never reads selection, camera, hover, typing, busy or Voice state.

Shared canvases: only a change of the selected card or root, of the shared board version, or of the signed-in state (viewer evidence becoming available). The basis is the share key, card and version; a board rename is a new cache entry and a stale hook (below).

Browser: 1200 ms debounce after the last change (an implementation default; an identical update does not restart it); one request in flight; a reply for an old basis is stored for its basis and discarded for display; never two requests for the same basis; changes during a Tutor turn wait for it to end; 60 requests per page mount (a canvas visit: one controller per mount, and the no-repeat memory `previous` and the outcomes reset with it) as a safety ceiling, not a target. Each request gives up after 60 s (Task 14; on a shared canvas one signal, made before a signed-in viewer's `/api/me` read, covers that read and the hook request): a hung call records its basis `failed` (never asked again) and frees the one request in flight, so newer bases are posted, and its late reply can never replace a newer basis's set, loading, ready, shown or stale. The server planner has no deadline of its own (a `ponytail:` note in `planNextSteps` names the ceiling: the Opus escalation starts however long Sonnet took). An owned hook is `unavailable/off`, with no request, until the Tutor context has resolved: a hole whose dive record has not loaded, or whose record names a journey whose parent read has not settled, has none (a settled refusal keeps the canvas domain). No temporary plain-canvas set ever exists to be replaced later.

Server (the browser counter is not relied on):
- Owned: a reply is reused for a repeat of the same signed-in user, canvas and basis (edge cache keyed by a one-way hash, never the raw values), and each user has an hourly and a daily cap (60 and 300; the worker vars `TUTOR_NEXT_STEPS_HOUR` and `TUTOR_NEXT_STEPS_DAY` override), recorded as usage events with the existing atomic-insert rate limiter (category `tutor_next_steps`). The limiter throws unless every cap is passed (`NO_CAP` skips a bucket), so a forgotten cap is a loud error and never an unlimited admission. Only a capped bucket is counted: a `NO_CAP` bucket adds no count clause, so it never scans the platform-wide rows of its kind (Task 14). The raw body is refused over 16000 characters before parsing.
- Shared, anonymous or without viewer evidence: one content-only reply per one-way share key (the existing `shareKey`, never the raw token), board version, origin card or `:root`, and a one-way hash of the board title (a rename without a version bump is a new entry), from the edge cache. It never contains viewer evidence. A miss is admitted under the share link's caps with no viewer; a hit costs nothing.
- Shared, signed in with viewer evidence: never cached and never served to anyone else; admitted under the shared-canvas limiter (category `shared_canvas_hooks`, billed to the viewer, never the sharer, with the shared-ask cap values and a separate budget so the shared-ask budget is untouched).

### 2.4 Model routing

| role (`LEARN_TASKS`) | model | use |
|---|---|---|
| `tutor_next_steps` | Sonnet 5.5, effort low | routine |
| `tutor_next_steps_escalation` | Opus 5.5 | once, on a missing tool call (`no_tool`), a validator failure (`validator`), or `ambiguous: true` (`ambiguous`); directly when a claim's evidence contradicts itself (`contradictory`) |

Model ids live only in `learn-models.js`. The hook planner never calls JEV or an evaluate route. An Opus failure returns 502 and the hook shows `unavailable/failed`. A Sonnet HTTP error does not escalate: it is a 502 straight away.

### 2.5 The Tutor turn: after a click, and material on every turn

- The existing router picks the row from the selected claims' evidence states, exactly as for any turn (the selected claims alone, not the rest of the canvas); the Tutor planner then chooses the action and the material. A click on a routine row (an off-slice, not-yet-observed, understood or gap row) is planned on the fast tier; every other row (misconception, uncertain, a return from a hole) on Opus.
- Any turn the page offers materials to (a hook click, a typed turn or a Voice turn) may include `create_material { command, request }`, on every row except those whose existing rule fixes the move: `returned` (a return re-asks its question), `uncertain_unsettled` (one clarifying question) and `slash` (`/deeper` and `/simplify` navigate authored cards). No hook click can reach those rows. `command` is one of the Learn commands that can make a card right now (sent as `context.available_materials`, the last key of the planner context and present only when the route allows `create_material`: a list of `{ command, cards, paid }` from the existing command registry: for example an interactive scene, Motion, code, a notebook, flashcards, an image, a graph, a video). Materials are offered from structural page state, never from the learner's words: none on a hole's automatic opening turn (the learner has not asked yet; a carried hook opening is a `next_step` turn and keeps them) and none while a journey is in setup (no card before the path is accepted). The browser runs it through the existing Learn command path (`runLearnCommand`, `/api/learn/artifact`, via `runMaterials`); a paid one shows the existing Generate / Not now proposal. There is no second artifact generator.
- The material is grounded in the turn's selected card, as a typed command with that card armed is (Task 14): `runMaterials` passes the selected block to `runLearnCommand` as its target, so `/api/learn/artifact` receives `selection { kind: 'card', id, title }` and the card's text as `context`. The text is the Tutor's card text (`cardContext` in `learn-tutor.js`, the handoff's card text, 4.7.2: title, body, brief and code; a code exercise's title, brief, setup and starter, never the learner's draft; an animation's description; cut at 8000), not the page's `describeBlock` text, which the Tutor cannot load. A hook click has no selected card, so its material carries none.
- Several `create_material` actions may be planned within the 3-action cap, only when the turn genuinely needs more than one, each with a different command (the same command twice is refused). `request` is at most 1000 characters in plain words: no backticks and no `=>` (angle brackets, braces and maths are fine). Free cards are made in plan order; paid proposals are offered one at a time and never hold up the free cards behind them; a command that fails reports a notice and the next one still runs.
- Every other supported action stays available as the row allows: an explanation, a question (predict, transfer, Explain Back), an existing card or part, practice, a Rabbit Hole, the offers `suggest_research` and `suggest_journey` (4.5), the repository `handoff` (4.7.2) and the Avatar Teacher when enabled.
- Natural-language Auto turns may respond directly or generate pedagogically appropriate learning material through the same Tutor planner. Explicit slash commands constrain intent; explicit expensive modalities retain their spending confirmation boundary (section 4.5).
- Prompt blocks. The shared cached prefix is the planner policy (`LINES` in `agents/learn-tutor.js`): line 16 the `create_material` meaning, 17 a simple answer is often enough and material is never for its own sake, 18 and 19 the grounding rules (4.6), 20 the reading fields (4.4), 21 `suggest_journey` (4.5). Up to three optional uncached system blocks follow it, in this order, each only on its own turns, so a request without them reads the same cached prefix: `NEXT_STEP_SYSTEM` on a hook click (its hook-specific line only), `EXPLICIT_MODE` on an explicit `/ask` or `/teach` (4.3) and `HANDOFF_SYSTEM` when the route allows the handoff (4.7.2); they coexist.
- On a canvas with no registry, the turn has no claims in scope (row `off_slice`: `respond_text`, plus `create_material`, `suggest_research`, `suggest_journey` and `handoff` when offered (4.7.2), and `return_from_dive` in a hole); the Tutor answers typed words, Voice and a hook alike, and may make material. It gets the generic canvas domain: planner context key `canvas_context { goal, origin, cards? }` (the goal is the hole's `learning_goal`, else the live canvas title, else a hole's own title; the origin is the shared canvas a hole came from; `cards` are up to 6 of the newest blocks other than the selected card, in canvas order, each `{ id, kind, title, text }` with the title cut to 80 characters and the text, the start of the card's body, text or caption, to 200; a chat card gives its question as the title and `text` null; the key is absent when there are none) and a canvas prompt (`CANVAS_SYSTEM`) chosen by that key. The selected card is `context.target` (its title and text, no sources). The prompt names exactly what a turn supplies: the target, those cards and the switched-on context documents; nothing else of the canvas is in context, so the Tutor is told never to describe, invent or point at other cards, parts or sources. The cards are never part of the hook basis. The canvas has its own session store; no turn there writes evidence (no claims are in scope). In a hole, an accepted `return_from_dive` draws the Back up the Rabbit Hole chip in `tutor.extras`, with no journey-only variant.

### 2.6 Recent modality history

Every Tutor turn's planner context carries `recent_modalities`: the modalities of the last 8 actions the Tutor put in front of the learner (offers and paid proposals included, whether or not the learner took them), oldest first, as generic names (section 3.2); the last key of `recent_relevant_context`. It is evidence for the planner, which decides; there is no sequencing rule, the router ignores it, and a modality is never required or banned by it. Learning fit comes first; variety is secondary.

### 2.7 First-sentence latency (fast tier)

The planner writes the control fields, then the actions, then `reason_codes` and `reason`, then the reading fields (4.4) last. On the fast tier the first spoken sentence is held until the streamed actions are complete and pass the fast-plan check, then released; it never waits for the reason or reading fields. Once released it is never taken back: the checked actions and `explicit_request` stand whatever the remainder repeats, a cut or unparsable remainder leaves `reason` and `reason_codes` null, the reading fields absent (traced as `missing`) and sets `telemetry.tail_lost` (a cut inside the reading fields alone drops `reason` and `reason_codes` too), and an invalid fast plan releases nothing and escalates to Opus, which streams its own sentence. The validated plan (its cards and other actions) completes about 50-80 output tokens later than before the reason fields existed, on every tier; that cost is real.

---

## 3. TutorDecisionTrace: a versioned decision telemetry contract

One structured event for every meaningful Tutor planning step: each Tutor turn (`tutor_decision`), each hook recompute as it lands (`next_steps_computed`: every recomputation, including a set that landed after its basis moved on), and each set's first impression (`next_steps_shown`). Today it is consumed by the evaluation harness; later the same events, unchanged in shape, will be persisted for real learners. It is decision metadata, not chain-of-thought.

Rules:
- Telemetry on or off gives the same planner requests (byte for byte) and the same results; the product never reads an event.
- Building or emitting an event never fails a Tutor turn or a hook recompute: every sink runs after the result is final, and any error inside telemetry is swallowed (counted in `globalThis.__smallTutorTraceErrors`). Events are deep copies: a sink can never mutate product state.
- Never in an event: the learner's raw words, transcripts, chat history, model prompts, answer keys, `reason_internal`, or chain-of-thought. Raw debug payloads, if ever needed, are a separate, explicitly enabled debug path with its own retention; not part of this contract.
- Analytics identity is the stable internal `user_id`, never an email.
- Shared canvases: the event belongs to the viewer. It may carry the share's one-way key, board version and origin as provenance; it never carries the sharer's identity, journey, evidence or chats.

### 3.1 Schema (`trace_schema_version: 1`)

Version 1 is the key set delivered at the integration checkpoint. The Task 14 fix pass added `decision.offered_actions` and `runtime.handoff.prompt_version` before any consumer had received an event, so they belong to v1. Any later key change bumps `trace_schema_version`.

```
TutorDecisionEvent {
  trace_schema_version: 1,
  event: 'tutor_decision' | 'next_steps_computed' | 'next_steps_shown',
  decision_id,                    "td_<16 hex>", unique per event
  step_id,                        tutor_decision: the turn id; the two hook events: the set_id
  generated_at,                   ISO-8601

  identity: {
    user_id: string | null,       stable internal user id (null for an anonymous shared viewer; the harness sink stamps it from GET /api/me)
    session_id,                   the Tutor session id: ts_<16 hex>, minted once per canvas session store, never sent to a planner
    canvas_id,                    the canvas (app) the decision happened on; the viewer's hole canvas once inside a hole (shared hook events: null)
    board_id: string | null,      the board name inside the canvas (for example main), not a learn_boards row id
    canvas_version: number | null,  the owned board revision when the page passes canvasVersion, else null; null on shared hook events (the shared version is source.share_version)
    journey_id: string | null,
    section_id: string | null,
    dive_id: string | null,
    source: { share_key, share_version, origin_block_id } | null,   shared provenance (one-way key only)
    scope: 'owned' | 'shared',
    mode: 'journey' | 'dive' | 'course' | 'canvas' | 'shared'
  },

  versions: {
    planner_version,              Tutor: TUTOR_PLANNER_VERSION (tutor-planner-2 since Task 11c-B); hooks: NEXT_STEPS_PLANNER_VERSION (bumped by hand with any routing or planning change)
    prompt_version: string | null,   sha256 prefix (12 hex) of every system block sent, joined with a newline, plus the tools; null when no model was called
    model_role: string | null,       the LEARN_TASKS role used; null when no model was called
    model_id: string | null          the served model id, as reported by the API
  },

  decision: {
    current_goal: { id: string | null, summary: string | null },
    current_section_id: string | null,
    target_concept_ids: [string],
    target_claim_ids: [string],
    evidence_summary: { understood: [], uncertain: [], misconception: [], prerequisite_gap: [], not_yet_observed: [] },   claim ids by state
    evidence_transitions: [{ claim_id, from, to }],      the turn's claim state changes, ids and states only; [] on hook events
    canvas_summary: { blocks: number, kinds: { [block type]: number }, presented_claim_ids: [string] },
    recent_modality_history: [modality],          at most 8, oldest first (what the planner saw)
    next_step_options: [{ suggestion_id, set_id, position, hook, learning_goal, concept_ids, claim_ids }],   all 3 of the set computed, shown, or on screen with the turn; position is 1-3 in screen order; [] when none
    shown_at: string | null,                      next_steps_shown only: when the set was first on screen
    selected_next_step_id: string | null,
    selected_at: string | null,                   tutor_decision on a hook click: the click time (the Node harness: the turn start)
    route: { row, strategy, intent } | null,
    chosen_action: { action_type, command, capability, modality, cost_tier, target_concept_ids, target_claim_ids } | null,   capability: 'repository_context' on a handoff, else null
    actions: [{ action_type, command, capability, modality, cost_tier, target_concept_ids, target_claim_ids }],             same shape
    reason_codes: [reason_code],                  0-3
    reason_source: 'planner' | 'router' | null,
    rationale_summary: string | null,             at most 2 sentences, at most 300 characters
    expected_evidence: [{ claim_id, via: 'answer' | 'explain_back' | 'practice' | 'interaction' }],
    estimated_learning_seconds: number | null,
    intent_mode: 'auto' | 'explicit_slash',        what the learner typed (4.4)
    inferred_intent: 'ask' | 'teach' | 'research' | 'do' | null,   the planner's reading, or the command on /ask and /teach; never an executed action
    explicit_modality_override: 'motion' | null,   the planner's reading of an explicit request for that format
    intent_status: 'declared' | 'missing' | 'explicit',
    clarification_requested: boolean | null,      the planner asked a clarification instead of acting
    grounding_status: 'grounded' | 'partially_grounded' | 'insufficient_evidence' | 'retrieval_failed' | null,   retrieval_failed only when a handoff did not return an answer (4.6)
    source_types_used: ['canvas' | 'selected_material' | 'repository' | 'attached_document' | 'model_knowledge'] | null,
    research_offered: boolean,                    the accepted plan offers Research this (4.5)
    research_executed: boolean,                   false on every Tutor event in v1
    offered_actions: [action_type],               the conditional actions the router offered this turn (Task 14): handoff, suggest_journey, suggest_research, create_material
  },

  runtime: {
    timing: { total_ms, planner_ms: number | null, first_text_ms: number | null, handoff_ms: number | null, blocking_wait_ms: number | null },   // 4.8
    model: { tier: string | null, escalated: boolean, calls: number },    tier: Tutor fast | opus; hooks routine | escalation
    usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd: number | null },
    validation: { ok: boolean, dropped_actions: number, repairs: [string], fallback: string | null },
    planner_input: { before: { block_count, claim_count }, after: { block_count, claim_count }, trimmed: { block_count, claim_count }, current_section_claims_kept: boolean | null, repair_claims_kept: boolean | null } | null,
    handoff: { started_at, completed_at, ms, outcome: 'ok' | 'failed' | 'refused', failure: string | null, model_id: string | null, usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd } | null, tool_errors: number | null, prompt_version: string | null } | null   // 4.7.2; null without a handoff
  },

  flags: [string]                 vary_modality_alone, cached, discarded
}
```

A field the step does not have is null or [], never omitted, so every event has the same keys. The key set is exact and tested at every level. Exactly these keys, in this order, on all three event types (`learn-tutor-trace.test.mjs` asserts them, and so will the Task 13 harness check N3 once it is merged):

- top level (10): `trace_schema_version`, `event`, `decision_id`, `step_id`, `generated_at`, `identity`, `versions`, `decision`, `runtime`, `flags`;
- `identity` (11): `user_id`, `session_id`, `canvas_id`, `board_id`, `canvas_version`, `journey_id`, `section_id`, `dive_id`, `source`, `scope`, `mode`;
- `versions` (4): `planner_version`, `prompt_version`, `model_role`, `model_id`;
- `decision` (30): `current_goal`, `current_section_id`, `target_concept_ids`, `target_claim_ids`, `evidence_summary`, `evidence_transitions`, `canvas_summary`, `recent_modality_history`, `next_step_options`, `shown_at`, `selected_next_step_id`, `selected_at`, `route`, `chosen_action`, `actions`, `reason_codes`, `reason_source`, `rationale_summary`, `expected_evidence`, `estimated_learning_seconds`, then the nine keys Task 11b added: `intent_mode`, `inferred_intent`, `explicit_modality_override`, `intent_status`, `clarification_requested`, `grounding_status`, `source_types_used`, `research_offered`, `research_executed`, then `offered_actions` (Task 14);
- `runtime` (6): `timing`, `model`, `usage`, `validation`, `planner_input`, `handoff` (the last key Task 11c-B added);
- one level down: `current_goal` `{ id, summary }`; `evidence_summary` the five states in the order `understood`, `uncertain`, `misconception`, `prerequisite_gap`, `not_yet_observed`; `evidence_transitions` entries `{ claim_id, from, to }`; `canvas_summary` `{ blocks, kinds, presented_claim_ids }`; `next_step_options` entries `{ suggestion_id, set_id, position, hook, learning_goal, concept_ids, claim_ids }`; `route` `{ row, strategy, intent }`; each `chosen_action` and `actions` entry `{ action_type, command, capability, modality, cost_tier, target_concept_ids, target_claim_ids }`; `expected_evidence` entries `{ claim_id, via }`; `timing` `{ total_ms, planner_ms, first_text_ms, handoff_ms, blocking_wait_ms }`; `model` `{ tier, escalated, calls }`; `usage` `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd }`; `validation` `{ ok, dropped_actions, repairs, fallback }`; `planner_input` null or `{ before, after, trimmed, current_section_claims_kept, repair_claims_kept }` with `before`, `after` and `trimmed` each `{ block_count, claim_count }`; `handoff` null or `{ started_at, completed_at, ms, outcome, failure, model_id, usage, tool_errors, prompt_version }` (9 keys) with `usage` null or `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd }`; `source` null or `{ share_key, share_version, origin_block_id }`.

This is the whole v1 event: the event at `5c176ec2` plus the two Task 14 keys.

Field rules:
- `actions` are the turn's production action contracts (`result.contracts`, 3.2), never recomputed. `command` is the Learn command name for `create_material` and null for every other action; `capability` is the handoff's capability and null for every other action; `cost_tier` is `none`, `model` or `paid` (4.4), and `model` for a handoff. `chosen_action` is the handoff when one ran, else the turn's first action that is not `respond_text`, else its text reply; null for hook events. `expected_evidence` merges the actions' entries without duplicates; `estimated_learning_seconds` is their sum, null when none has a number.
- `offered_actions` (Task 14, owner messages 3 and 14): the conditional actions this turn's route allowed (`allowed_actions`), limited to `handoff`, `suggest_journey`, `suggest_research` and `create_material`, in that order. Action types only, never text; [] on both hook events and on a `plan: false` turn. Beside `actions` it lets the evaluator compute the missed-handoff and missed-offer rates from events alone, for example a turn that offered `handoff` and ran none.
- A `plan: false` diagnostic turn is traced too: `route` null, `actions` [], `offered_actions` [], `chosen_action` null, `reason_codes` [], `reason_source` null, `prompt_version`, `model_role` and `model_id` null, `calls` 0; the reading fields are null, `intent_mode` is `auto`, `intent_status` `missing`, `research_offered` and `research_executed` false, and `runtime.handoff` null.
- `current_goal`: Tutor: `id` is the selected hook's suggestion id, `summary` its `learning_goal`, else the domain's goal, capped at 200; hooks: `id` null, `summary` the input goal.
- `evidence_summary`: Tutor: the selected claims only (`turn.evidence`); hooks: every scope claim by state.
- `identity.mode` (Tutor): `journey` for journey evidence, else `dive` for any hole (journey holes included), else `canvas` for the canvas domain (`contextKey: 'canvas_context'`), else `course`. The Tutor's `scope` is always `owned`; a hole started from a share is `owned` with `source`. Hooks take `scope` and `mode` from the caller (`course` for a registry canvas; `shared` and `shared` for shared hooks).
- `prompt_version` is computed before the call, so an error or invalid outcome carries it; a cached hook reply carries the producing call's value, not null. `model_role` is `tutor` for every Tutor call (the fast tier and Opus share the role) and `tutor_next_steps` or `tutor_next_steps_escalation` for hooks. A failed hash gives null and never fails the turn.
- `usage` sums the answering call and, after an escalation, the fast attempt; `cost_usd` is priced at each call's requested model and is null when no call reported usage. A token count no call reported is null, never 0. A cached hook reply: `cost_usd` 0, usage zero, `calls` 0, `total_ms` and `planner_ms` null, flag `cached`. A `next_steps_shown` event is zero usage, `cost_usd` 0, `calls` 0 and null timing, with the versions of the set it shows, so an impression is never a double count. A hook event's `total_ms` and `planner_ms` are the planner's `ms`.
- `validation.ok` is true when no action was dropped and nothing was repaired (hooks: no validator errors). `repairs` are rule names, never text. Tutor: `downgraded_navigation`, `citations_removed`, `shortened_before_dive`, `explicit_request_unquoted`, `learning_goal_dropped`, `rationale_dropped`, `reading_value_dropped` (a reading field outside its enum or type became null, 4.4). Hooks: the hook validator's rule names (2.2). `fallback` is a low-cardinality category: `escalated:<category>`, else `tail_lost`, else `router_reason`, else null; never raw error text. The hook planner's categories are its own escalation reasons (`no_tool`, `validator`, `ambiguous`, `contradictory`); the Tutor's are `invalid_plan` (an action outside the allowed types), `no_words`, `no_tool` (no turn returned) and `model_error` (any other model or network failure, for hooks too).
- `reason_codes` are the planner's, known codes only, once each, at most 3. When the planner gives none, the router's code is used and `reason_source` is `router` (`fallback: router_reason`): the route row's generic code; a hook click leads with `follow_learner_interest` and adds the row's code (omitted when it is `respond_to_question`); slash `deeper` gives `deepen_mechanism` and `simplify` gives `reduce_cognitive_load`; no route gives none. A lone planner `vary_modality` becomes up to two router codes plus `vary_modality`, `reason_source` stays `planner`, and the flag `vary_modality_alone` marks it.
- `rationale_summary` is dropped (repair `rationale_dropped`) when it repeats 5 consecutive words of this turn's message, or holds the whole message (two words or more) as whole words in order, whatever the punctuation or spacing; a one-word reply is not quotable. Only this turn's words are checked; earlier turns rely on the prompt rule.
- `runtime.planner_input` is on `next_steps_computed` only (null elsewhere): the structured counts of the trim (2.1), never the input. An input that cannot be trimmed to fit makes no request and no event.
- `flags`: `vary_modality_alone` (3.2); `cached` (a hook reply served from the edge cache); `discarded` (a hook set that landed after its basis moved on). A discarded set is traced when it lands; its `next_steps_shown` fires only if its basis returns and it is shown, and a set never shown never fires one.
- `next_steps_shown` fires once per set, the first time it is on screen (ready, no stop). `next_steps_computed` fires at landing for every recomputation, so all 3 hooks are recorded each time.
- The reading fields (`inferred_intent`, `explicit_modality_override`, `clarification_requested`, `grounding_status`, `source_types_used`) are the planner's own reading, written last and bounded by the validator (4.4); the two hook events carry the same keys with `intent_mode` `auto`, `intent_status` `missing`, the readings null, `research_offered` and `research_executed` false, and `handoff_ms`, `blocking_wait_ms` and `runtime.handoff` null.

### 3.2 Vocabularies and the action contract

- `reason_code` (generic; no topic codes): `advance_goal`, `deepen_mechanism`, `repair_misconception`, `fill_prerequisite_gap`, `check_understanding`, `test_transfer`, `consolidate`, `respond_to_question`, `follow_learner_interest`, `increase_interactivity`, `vary_modality`, `reduce_cognitive_load`, `resume_context`. `vary_modality` is never accepted as the only code: the event then adds the route row's code and the flag `vary_modality_alone`.
- `action_type`: the Tutor's existing action types (`respond_text`, `ask_question`, `show_authored_card`, `focus_part`, `suggest_depth`, `suggest_practice`, `suggest_dive`, `open_dive`, `return_from_dive`, `suggest_avatar_clip`, `create_material`, `no_action`), plus the two offers `suggest_research` and `suggest_journey` (4.5) and the `handoff` (4.7.2).
- `modality`: the product's existing names. `text` (a Tutor reply), `question`, `explain_back`, `practice`, `depth`, `rabbit_hole`, `avatar`, and for a shown, focused or made card its existing block type (for example `explanation`, `scene`, `animation`, `snippet`, `code`, `notebook`, `flashcards`, `quiz`, `challenge`, `image`, `graph`, `video`, `paper`; an Explain Back challenge is `explain_back`). No card type is invented for the trace. A made card's modality is the block type its command inserts, decided before the card exists (the command's first card). Where a command's palette name is not a block type: `explainBack` is `explain_back`, `plot` is `graph`, `walkthrough` is `scene`, `videoGenerate` and `mathAnimation` are `video`. So a Motion made with `animate` and a generated clip made with `video` both read `video`, and are told apart by `command` (likewise `walkthrough` and `3d` both read `scene`).
- `cost_tier`, on every action contract (4.4): `none` for what the turn does itself (words, a question, a card shown or focused, any suggestion or offer, including `suggest_research` and `suggest_journey`) and for a made card whose command inserts without the model; `model` for a made card whose command is free (one more model call); `paid` for a made card whose command can end in a paid proposal. A paid card still spends only after Generate. A `handoff` is `model` (one capability call). The offers `suggest_research` and `suggest_journey` have `modality` null and `estimated_learning_seconds` null; a `handoff` has `modality` `text` and `estimated_learning_seconds` null, because the answer's length is unknown when the plan is made.
- `expected_evidence`, by action and block type alone, so a shown card and a made card of the same type expect the same: `ask_question` gives `answer` (`explain_back` for an Explain Back purpose); `suggest_practice` gives `practice`; an Explain Back challenge gives `explain_back`; challenge, quiz, flashcards, code, notebook, graph, scene, animation, whiteboard and model3d give `interaction`; every passive type (explanation, table, snippet, flow, mermaid, image, video, paper, audio, knowledge), a reply and every other action give `[]`.
- `target_claim_ids`: the action's own valid claim, else its card's claims (for `suggest_depth`, the next rung's), else the turn's claims (at most 3) for `respond_text`, `create_material` and `handoff`, else `[]`; `target_concept_ids` are those claims' concepts plus an action's own `concept` or `to_concept` the registry knows.
- `estimated_learning_seconds` is rough and generic (a `ponytail:` note in the code): text about 180 words a minute (at least 5), question 60, explain_back 120, practice 120, depth 60, avatar its `max_duration_seconds` else 30, any card 90, null for a Rabbit Hole suggestion or an unknown modality.

The planner writes `reason_codes` and `reason` (the rationale) and then the reading fields (4.4) at the end of every turn's tool call, after the actions, so the first spoken sentence is not delayed. When it gives no codes, the route row's code is used (`reason_source: 'router'`).

### 3.3 Location, sinks and access

- Module: `packages/web/src/learn-tutor-trace.js`: pure builders `decisionEvent`, `hooksEvent` and `shownEvent`, `inputSummary`, the guard `safely`, `newSessionId`, `ROW_REASON` (the router's row-to-code map), and the sinks `addSink`, `tracing`, `emitDecision` and `harnessSink`. The action contracts (`actionContract`, `modalityOf`, `blockModality`, `reasonCodes`) live in `packages/web/src/learn-tutor-actions.js`. `REASON_CODES`, `TRACE_SCHEMA_VERSION` and `TUTOR_PLANNER_VERSION` live in `packages/control-plane/src/agents/learn-tutor.js`, so a future server-side store validates the same contract.
- Node (simulation harness): `runTurn({ ..., trace })` with `trace: true` or `{ identity, blocks, next_step_options, selected_at }` returns `result.trace` (a `tutor_decision` event, or null when building failed; no `trace` key when off); `hooksEvent(hookSet, { input, trim, identity, scope, mode, discarded })` builds a `next_steps_computed` event and `shownEvent(hookSet, options)` a `next_steps_shown`.
- Browser sinks: `emitDecision(event)` hands the event to every registered sink after the result is final. v1 registers one sink, only when the harness sets `globalThis.__SMALL_TUTOR_TRACE__ = true` before the page loads: it stamps `identity.user_id` from `GET /api/me` (the stable internal user id, never the email), appends to `globalThis.__smallTutorTraces` (the newest 500) and dispatches a `small:tutor-trace` window event. Off by default; nothing is sent anywhere in v1. The events are built only while a sink is registered: `useTutor` emits each Tutor turn's event, `useNextSteps` emits `next_steps_computed` as each set lands and `next_steps_shown` the first time it is on screen, and `useSharedNextSteps` does the same with `scope: 'shared'`, `mode: 'shared'`, the one-way share key from the server telemetry and the viewer's own session `user_id` (never the sharer's).
- Later persistence adds a sink that posts events to a server route; the server stamps `user_id` from the session (ignoring the client's) and stores the event as-is. That route, its table and its retention are a separate, owner-approved change (a migration), not part of v1.

---

## 4. Auto Tutor routing

Built and checked against the code at `5c176ec2` (Task 11b: the Auto Tutor on every canvas; Task 11c-A: the handoff route; Task 11c-B: the Tutor handoff action). It is written from the owner decisions of 2026-10-06 (the eighth, ninth, eleventh, thirteenth to sixteenth and nineteenth messages).

### 4.1 Principle: Auto is the primary interface

- The learner expresses intent in natural language or Voice. The learner never needs to know which agent, modality, tool or slash command exists. Given the message, the selected card, the current canvas, the repository context, the goal and path, the evidence and the recent modality history, the Auto Tutor decides: the learner's intent; whether a simple answer suffices; whether extra context or a capability is needed; the pedagogical action; the modality; and whether a Rabbit Hole is useful.
- Slash commands are optional expert shortcuts. No core function is reachable only through a slash command wherever that capability is meant to exist; the gaps are listed in 4.10.
- Routing is never keyword-based. No Auto-path product module tests the learner's words for intent, format, research or teaching vocabulary. A test (`learn-tutor-auto.test.mjs`, J) gives the same plan words full of that vocabulary and asserts the same route, actions and trace intent, and greps those modules for a regex or string test of motion, research, teach, quiz and flashcards. Its allowed matches are the explicit don't-quiz-me constraint (`STATED_NO_QUIZ` in `learn-tutor-validate.js`) and LP1's journey word rules, which never take a Tutor turn (4.5). The older `learnerIntent` kind (question, request, explanation) and the card place-hold (`wantsCard`) still read the first words of a turn, as before; neither sets `inferred_intent`, a modality, material or a handoff. The kind also picks the planner tier (4.1.1). A topic word that names a format is not a request for that format (explain projectile motion is not a Motion request), and research this variable needs no external research when the answer is in the selected local context.
- Uncertain about a high-cost or destructive action, the Tutor asks one concise clarification or proposes the action; it never runs an expensive or destructive capability silently. Paid material keeps Generate / Not now: choosing Motion is not permission to spend, and no confirmation is needed merely to recommend it. A paid material already asks the learner first, so the Tutor never confirms twice.
- Evaluation measures Auto routing quality on natural-language prompts: inferred intent, the capability or handoff selected, the chosen action and modality, whether a clarification was needed, routing correctness, the unnecessary expensive-routing rate, the missed-handoff rate, and the latency and cost routing adds.

#### 4.1.1 Planner tier (owner decision, 2026-10-07)

- The decision: the existing planner-tier rule is carried onto plain canvases unchanged (owner decision, 2026-10-07). The rule dates from v2 (owner OPTION F, 2026-10-01: routine turns on Sonnet 5.5 low, Opus for everything else) and applied only where the Tutor ran, the registered course and LP1 journeys. Since Task 11b typed and Voice text on a plain canvas reaches `runTurn`, so the same rule picks its planner. The word lists are not expanded and routing is not redesigned.
- The conditions: `plannerTier(context)` in `learn-tutor-routes.js`, called once per planned Tutor turn while the fast tier is on (the default). The fast tier (Sonnet 5.5, effort low) only when the router row is in `ROUTINE_ROWS` (`slash`, `off_slice`, `not_yet_observed`, `understood`, `gap`, `gap_inline`) and the learner intent kind is in `ROUTINE_INTENTS` (`question`, `request`, `slash`, `opening`, `next_step`); otherwise Opus 5.5. A fast plan that fails `fastPlanProblem` is re-planned on Opus (telemetry `escalated`).
- The kind: `learnerIntent(turn)` in `packages/web/src/learn-tutor.js`, the first that holds, in this order: a clicked hook gives `next_step`; a fixed slash `slash`; a hole opening `opening`; a return from a hole `returned`; an answer to the Tutor's open question `answer`; words that start, after an optional `please `, `can you `, `could you ` or `just `, with show, take, give, explain, tell, walk, go, simplify, don't (or dont), do not, no more or stop give `request`; words that end with `?`, or start with why, how, what, when, where, which, who, is, are, does, do, can, could, should or would, give `question`; anything else `explanation`. `/ask` and `/teach` keep the kind their words give.
- Examples, measured on 2026-10-07 by driving the real `runTurn` and the real `plannerTier` on a plain canvas with no card selected (nanoGPT gives the same tiers with no card selected, row `off_slice`):

| Learner input | Kind | Row | Planner |
|---|---|---|---|
| What is a tensor? | question | off_slice | Sonnet 5.5 (fast) |
| Explain projectile motion | request | off_slice | Sonnet 5.5 (fast) |
| Show me another way | request | off_slice | Sonnet 5.5 (fast) |
| Tell me why the loss spikes | request | off_slice | Sonnet 5.5 (fast) |
| Can you draw it? | question | off_slice | Sonnet 5.5 (fast) |
| Teach me backpropagation from scratch. | explanation | off_slice | Opus 5.5 |
| I still dont get attention. Show me another way. | explanation | off_slice | Opus 5.5 |
| I think gradients flow backwards through the graph | explanation | off_slice | Opus 5.5 |
| The mask stops tokens seeing the future | explanation | off_slice | Opus 5.5 |
| thanks | explanation | off_slice | Opus 5.5 |
| /ask What is a tensor? | question | off_slice | Sonnet 5.5 (fast) |
| /teach The mask stops tokens seeing the future | explanation | off_slice | Opus 5.5 |

  On a registered course or a journey with matching claims the row matters too: a misconception, an uncertain or unsettled state, or a return from a hole always goes to Opus, whatever the words.
- The caveat: these measurements establish routing behaviour, not model-quality equivalence between the two planners for these phrasings.
- Follow-up (not in this checkpoint): evaluate routing quality, latency and cost across equivalent phrasings and acknowledgements (Teach me X against Explain X; thanks or ok against a question; a statement against the same content asked as a question). The Tutor Evaluation agent owns it, on the integration SHA.
- The confirmation: the kind decides no teaching action, mastery evidence or handoff eligibility. Every reader of `learnerIntent(turn).kind`:

| Reader | What it decides | On a plain canvas |
|---|---|---|
| `plannerTier` | which model plans; a failing fast plan escalates to Opus | applies (this decision) |
| `fastPlanProblem` and the sentence release | when a held fast-tier first sentence may be spoken | applies; timing only |
| `criticalPath` | whether the evaluation is awaited before planning | never runs: no claims, so no evaluation |
| `wantsCard` | whether a card place is held before the plan | never runs: the canvas domain has `showCard` |
| `setLastTurn` (`LearnTutor.jsx`) | whether the question joins the hook input as the last turn | applies; hook context only |
| the planner prompts | read as model input | the model decides |

  The allowed actions come from the router row and the structural offers (no route or offer reads the learner's words); evaluation runs for any words when the domain has claims, whatever the kind, and JEV decides the evidence; the handoff is offered only from the structural repository flag.

### 4.2 Where it applies

- Every Tutor canvas: a journey, a registered course, a plain canvas, a Rabbit Hole. Natural typing and Voice take the same Auto Tutor path (`useVoiceSession` follows `tutor.active`); a selected card grounds the turn. A journey adds a persistent goal, path and evidence; it is not a prerequisite: a question on a blank plain canvas (why does gradient descent overshoot?) gets an Auto Tutor turn.
- The canvas domain's capabilities are `{ tutor: true, hook_turns: true }` (`learn-tutor-domains.js`). A registered entry that refuses the Tutor still refuses it, and the Learn chat stays there. The tests that pinned plain-canvas typed turns to the Learn chat were rewritten, not preserved (`learn-tutor-auto.test.mjs`).
- A plain canvas's Tutor sees the selected card as `context.target` and up to six of the newest other cards as `canvas_context.cards` (2.5); nothing else of the canvas.
- Hooks on a plain canvas keep the grounding rule (2.1): a lesson card or a selected card, or no hooks; a goal is never invented because no journey exists.
- A journey is never started by a word rule on a Tutor canvas: the Tutor may offer one (4.5).

### 4.3 Canvas command contract

| input | Canvas | meaning |
|---|---|---|
| natural typing, Voice | yes, primary | the Auto Tutor decides |
| `/ask` | yes | explicit ask override: answer the question rather than build an extended teaching sequence unless needed to answer properly |
| `/teach` | yes | explicit teach override: actively teach (the Tutor still chooses the pedagogy and material) |
| `/deeper`, `/simplify` | yes (existing) | the turn's slash on a depth ladder (the nanoGPT course); elsewhere an ordinary turn from the composer's words |
| `/motion` | where supported | does not exist yet: a limitation; a natural-language Motion request is read as `modality_override` (4.4) |
| `/research`, `/do` | no | Home/Library workflows, not Canvas commands |

- `tutor.slash(name, raw)` accepts the names in `SLASHES` (`deeper`, `simplify`, `dive`, `ask`, `teach`); any other name (`/research`, `/do`) leaves the turn an Auto turn with no override. `/ask` and `/teach` are a marker on an ordinary turn: `turn.mode` and `learner_intent.slash` beside the kind the words gave. The composer's words, not `/ask ...`, are the message, and they keep their claim selection, evaluation and planner tier exactly as the same words without the slash, with one exception: a typed slash never answers an open Tutor question (below). While a question is open, the same words without the slash would be an answer, which takes a blocking answering evaluation and the Opus tier; with the slash they keep the kind their words give, take no answering evaluation and may run on the fast tier. The differences are the uncached system block `EXPLICIT_MODE`, appended to the planner request on those turns (2.5), the trace (4.4) and, on a live journey, that an explicit Tutor command skips the journey's tray resolver, as Ask the Tutor does (it is not a tray answer). There is one Tutor and one `runTurn`: a slash overrides Auto intent without a second path, and Auto never literally invokes a slash command.
- `/deeper` and `/simplify` fix the move (row `slash`, the typed command read in place of the words) only where the domain has a depth ladder; on a plain canvas or a journey they are ordinary turns from the composer's words, `intent_mode` `auto`, with no slash marker.
- A typed slash never answers an open Tutor question: `buildTurn` keeps `open` null whenever a slash was typed (`/deeper`, `/simplify`, `/dive`, `/ask`, `/teach`, on a ladder or not). The question stays open, and the same words without a slash answer it.
- Superseded: the earlier lists that named `/research` and `/do` as Canvas overrides beside `/ask`, `/teach` and `/motion` (owner eighth and ninth messages) no longer apply; the thirteenth message replaces them with the table above.
- `/research` and `/do` stay as Home/Library commands. Where the Canvas UI or its tests expose them (1.7), they are flagged to Parallel, not preserved as a Tutor requirement. On a Canvas the Tutor adds no behaviour for them beyond intent telemetry: a research-like or do-like request is answered within the Tutor's context and allowed actions, research may be offered (4.5), and the Tutor never says or implies that the Research workflow ran or that a canvas edit or the Do agent ran.

### 4.4 Learner intent versus executed action

- `TUTOR_TOOL` has five optional reading fields after `reason_codes`, written last (2.7): `inferred_intent` (`ask`, `teach`, `research`, `do`), `modality_override` (`motion`, only when the learner explicitly asks for that format, never for a topic word), `clarification_requested` (boolean: the Tutor asked a concise clarification instead of acting), `grounding_status` (`grounded`, `partially_grounded`, `insufficient_evidence`) and `source_types_used` (at most 5 of `canvas`, `selected_material`, `repository`, `attached_document`, `model_knowledge`; `research` is left out of the list by design: a canvas never executes research in this checkpoint, it is only offered (`research_offered`) and `research_executed` records that nothing ran, so a source that never ran cannot be a source used, and the nineteenth message forbids presenting research as run). The prompt asks for them as the planner's reading (4.6 for the grounding pair).
- The validator bounds them (`readingOf` in `learn-tutor-validate.js`): a value outside its enum or type becomes null (a list keeps its known entries), the log names the field and never the value, and the trace maps it to the repair `reading_value_dropped`. The turn never fails.
- They are telemetry. No code reads them to choose a route, an allowed action, validation or an executed action: `runTurn` returns them as `reading`, and only the trace module reads that (a test changes them and asserts nothing else changes). `inferred_intent` is never a deterministic router: teach may yield an explanation, an interaction or Motion, depending on the learner's evidence.
- Decision fields on `tutor_decision` (key order in 3.1):

| turn | `intent_mode` | `inferred_intent` | `intent_status` |
|---|---|---|---|
| explicit `/ask` or `/teach` | `explicit_slash` | the command; the planner's own field never overwrites it | `explicit` |
| any other slash that fixes the move (`/deeper`, `/simplify` on a ladder) | `explicit_slash` | the planner's reading | `declared` or `missing` |
| Auto (typed or Voice) | `auto` | the planner's declared value, or null | `declared`, or `missing` (the field is absent, cut or unknown: never a guess from words) |
| hook click | `auto` | as declared, or null | `declared` or `missing` |
| `next_steps_computed`, `next_steps_shown` | `auto` | null | `missing` |

- `explicit_modality_override` is the planner's `modality_override`; `clarification_requested`, `grounding_status` and `source_types_used` are copied from the reading and are null when it is absent. `research_offered` is true only when the accepted plan offers `suggest_research`; `research_executed` is false on every event in v1. The two hook events carry the same keys with every reading null and both research flags false.
- The executed action stays in `actions` and `chosen_action` (what ran), and learner intent never implies it: `inferred_intent: research` with `chosen_action: respond_text` does not mean research ran, and `inferred_intent: do` never means an action was executed.
- Every action contract carries `cost_tier` (3.2), in `actions` and `chosen_action`: `none` for in-turn actions and offers and for a made card that inserts without the model (notebook, whiteboard, image: `insertsWithoutModel` in `learn-slash.js`), `model` for a made card whose command is free, `paid` for one whose command can end in a paid proposal (`mayConfirmPaid`, carried as `materials[].paid`). A paid card still spends only after Generate. A handoff is `model`: one capability call, no confirmation.
- Present on every natural-language turn, for the evaluator: `inferred_intent`, `intent_status`, `clarification_requested`, `chosen_action` (with `cost_tier` and `capability`), the modality, and the planner, handoff and blocking-wait timing (4.8).

### 4.5 Material and offers from natural typing

- Typed and Voice Auto turns may respond directly or create material through the same planner (`create_material`, 2.5). A simple answer is often enough: respond-only stays a valid plan, and the Tutor creates material only when it meaningfully improves the learning action, never for its own sake and never every message. Lightweight material is created directly under the existing cost policy, with no extra confirmation; paid material keeps Generate / Not now. The prompt carries these rules in the shared prefix.
- The offers a turn may carry come from structural page state alone (`turnOffers` in `LearnTutor.jsx`), never from the learner's words: materials (not on a hole's automatic opening, not in journey setup), `research` (only where the page wired `openResearch`, never in setup) and `journeyOffer` (only where `journey.start` exists, never inside a hole; in setup too, owner decision 2026-10-07) and `repository` (the handoff, 4.7.2: only where the canvas reads a repository, never in setup). In journey setup a turn therefore allows `respond_text` and `suggest_journey` only, and the journey prompt's setup line says so: `respond_text only (plus suggest_journey when allowed), no cards` (`JOURNEY_SYSTEM`, `agents/learn-tutor.js`).
- `suggest_research { request }` is an offer, never an execution. The router allows it on every row, typed, Voice and hook, but only when the page can open Research (`turn.research_offer`, set from `useTutor({ openResearch })`). It is bounded like `create_material`'s request (1-1000 characters, plain words, no backticks or `=>`) and allowed once per turn. `executeActions` renders it as a Research this chip that calls `openResearch(request)`, the page's way into the existing Home/Library Research workflow; with no callback there is no chip and no offer. Nothing runs inside the turn. Until Parallel wires `openResearch` (`LearnPage.jsx:558`, 1.7) no Research offer can be accepted and none is attempted, so `research_offered` is false on every trace; for an insufficient-evidence answer the honesty signal is then `grounding_status` with the reply's own words.
- `suggest_journey { request }` replaces the LP1 keyword gate on every canvas where a Tutor is active. The gate no longer takes a Tutor turn: `journeyStartsHere` opens with `!tutor` and `handleText` skips its second-broad-intent check when the Tutor calls it (`LearnJourney.jsx`; `LearnTutor.jsx` passes `tutor: true`). Instead the Tutor may offer a learning path: `suggest_journey { request }`, the subject in plain words, bounded like the other requests, once per turn, `cost_tier` `none`. The router allows it only where `journeyOffer` holds, on a canvas with no journey yet, on a live journey or on one in setup, never inside a hole, on every row and every turn kind. `executeActions` renders a Start a learning path chip; its click calls `journey.start(startRequest(request))`, the existing journey start (`startRequest`: a start request stays as it is, a bare topic becomes `Teach me <topic>`). Nothing starts on its own, and on a live journey or one in setup the click meets LP1's own continue-or-start choice (below). A start the route refuses shows the notice that the request cannot start a learning path here. No page callback is needed.
- Revertible by owner decision, and not one line (the comment above `journeyStartsHere` in `LearnJourney.jsx` lists it): (1) let a plain-canvas Tutor through `journeyStartsHere` with `(!tutor || tutor.plain === true)` and re-expose `plain` in `useTutor`'s return (`context?.source === 'canvas'`); (2) call `handleText` without `tutor: true` in `LearnTutor.jsx`; (3) optionally drop `journeyOffer` from `turnOffers`.
- Contextual answers inside an open journey tray (owner decision 2026-10-07): a real answer to the tray still advances it, and a question gets a Tutor answer without advancing or dismissing it. Inside an open tray `handleText` (`LearnJourney.jsx`) reads the words first, as the answer to the question the interface just asked: an exact option label, an ordinal, accept or cancel (rules 1-4, `learner-intent-journey.js`) and the path-edit rule during setup; otherwise the model's rule 5 (`resolve`) decides. `tray_answer` answers and advances the tray; `unrelated_question` (a question or request that does not answer the tray) hands the turn to the Tutor, which answers it while the same tray stays open, unchanged and answerable; `clarification_needed` (two readings fit equally well, or the resolver could not be reached) shows the chooser over the tray, whose Ask the Tutor gives the same words to the Tutor and brings the tray back unadvanced. A clear question is never sent to the chooser by a word rule: which reading the words have is rule 5's call. Outside an open tray on a live journey the words reach the Tutor, open no tray and start nothing.
- Switching subject during setup (owner decision 2026-10-07), only through the Tutor-offered Start a learning path chip; no global keyword rule. Typing alone never replaces the journey: a new-subject request typed during setup (Teach me SQL) is a Tutor turn after rules 1-5, which may answer the tray, answer the words or offer the chip. The chip's click is the journey start; the setup journey is the board's current (unarchived) journey, so the route answers 409 `live_journey` and the click opens LP1's continue-or-start tray, the confirmation, naming the current and the proposed subjects (`Continue <current> or start <proposed>?`). Continue keeps the current setup and sends nothing. Start sends one `start` with `replace: <the current journey id>`: the route archives that journey and inserts the new one in one D1 batch (`createJourney`, `learn-journey-store.js`), so the new setup starts with the canvas content untouched, and a start that fails (refused, a database error, the network) keeps the current setup live and its tray answerable, with the line `Could not start <proposed>, so <current> stays as it was.` and Try again (the same start). A replace naming a journey that is no longer this board's live one archives nothing, and the 409 asks again naming the journey now live. The same one-start replace serves continue-or-start on a live journey (LP1's archive-then-start is gone; the route's `archive` action stays, unused by the page). A fast start (skip setup) that replaces a journey, in setup or already active (owner decision 2026-10-07, D2, option A), keeps the old journey live until the replacement is planned: the route makes the new row under the board's staged name (`stagedScope`, a board name no request can use), outside the board's one-live-journey index, runs its path and section 1 planners there, and only then archives the old journey and moves the new one onto the board in one D1 batch (`activateStaged`). A planner failure drops the staged row and its path versions (`dropStaged`) and answers 502 with the old journey, still live with its answers, evidence, path and drawn sections; the canvas is untouched; the page shows the same line, `Could not start <proposed>, so <current> stays as it was.`, and Try again sends the same replace start. A staged row a cancelled worker left is dropped by the next replace, so a Retry never makes a second one; if another journey went live on the board meanwhile, nothing is swapped and the 409 asks again naming it. A replace that plans nothing (a start into intake) stays the one-batch swap above. Skipping a question is not a replacement: `cancel` is that step's skip (`intake_skip`, `diagnostic_skip`) and continues the same journey (same id and request, nothing archived). A fast start with no journey to replace keeps today's behaviour: a planner failure keeps the new journey with its own Try again.
- Not done: on a live journey or in setup the `suggest_journey` line does not say that accepting the offer leaves the current path (a prompt change that would need a full review); two explicit clicks, the chip and then LP1's choice, bound the risk.

### 4.6 Grounding and uncertainty (owner nineteenth message)

The Tutor never invents missing facts. If the available context does not reliably support an answer, it does not produce a plausible-sounding one.

- The grounding order is in every Tutor prompt (lines 18 and 19 of the shared prefix, 2.5): the selected card or object, the canvas and its material, attached or source documents, repository context where supplied, the journey or course context, then reliable general knowledge. It says never to invent facts the context does not support; with partial evidence, to say what is known and bound the uncertainty in words, never as a number (no fake confidence percentages); and when something may be newer than or absent from what the Tutor knows, to say so briefly and offer Research this when `context.allowed_actions` lists it.
- Retrieval happens only through an action `allowed_actions` lists in that turn. Without one, the Tutor never says I found or current research shows and never cites anything outside the supplied sources; the validator still strips any citation to a card or source that was not supplied (repair `citations_removed`). When the handoff is allowed the plan's own words still never claim retrieval or inspection; only the handoff answer reports what the source says (4.7.2).
- Research v1: the Tutor may offer Research this (`suggest_research`, 4.5), and the UI routes that explicit choice into the existing Research capability. Research is never launched silently from a Canvas turn, so `research_executed` is false on every Tutor event; a false retrieval phrase in the reply is covered by the prompt and the evaluator, not by a keyword filter.
- The planner writes `grounding_status` (`grounded`, `partially_grounded`, `insufficient_evidence`) and `source_types_used` (4.4) as its reading. They are telemetry only.
- Handoff outcome (owner nineteenth message addendum; 4.7.2). The planner cannot declare `retrieval_failed`: it is not in its enum, and the trace sets it. When a turn ran a handoff and it did not return an answer (outcome `failed` or `refused`), `grounding_status` is `retrieval_failed`, overriding the planner's own value, and a `repository` the planner declared in `source_types_used` is removed, so a failure never reads as code-grounded (a null list stays null). This includes `invalid_action` (an offered handoff the validator dropped, 4.7.2). A handoff the learner stopped (failure `stopped`) is the exception: nothing was retrieved and nothing failed, so it forces no `retrieval_failed` and never lists `repository`; it also leaves no decision event at all (4.7.2). When the handoff returned an answer, `repository` is added to `source_types_used` (once) and the planner's `grounding_status` stands. A turn with no handoff keeps the planner's two fields unchanged, so `repository` there is only the planner's own declaration.

### 4.7 The `repository_context` handoff

The only handoff in this checkpoint, and the first of a generic mechanism: no Research or Do handoff, no multi-agent orchestrator, no second Tutor, and no copy of repository-reading logic into the Tutor. It is built in two halves: the server route (Task 11c-A, 4.7.1) and the Tutor action that uses it (Task 11c-B, 4.7.2).

#### 4.7.1 The route (Task 11c-A)

`POST /api/learn/tutor/handoff` (`packages/control-plane/src/learn-tutor-handoff.js`, dispatched from `tutorRoute` in `learn-tutor-routes.js`). The browser calls it only through the Tutor action in 4.7.2.

- What it reuses. The route composes the read functions the shared-canvas ask is built from, unchanged: `boardRevision` (the canvas repository, a repo-* board or a canvas-* board through its project, at the owner's current commit), `repositorySnapshot`, `repositoryTool` with `REPOSITORY_TOOLS` and `REPOSITORY_SYSTEM`, and `researchAnswer` on the Learn chat task with the Auto model and `arxiv: false`, so the model gets exactly the repository tools and no paper tool or research prompt text. The reader's system prompt ends with `HANDOFF_READER_RULE`: if a repository read fails or the source does not contain the answer, say so plainly and never answer from memory as if the code had been read (the research prompt that carried such a line is left out by `arxiv: false`). It does not call `repositoryAsk`, which writes threads and messages. A fork's inherited repository pin is not read (a `ponytail:` note in the code; owned Learn chat does not read it either).
- Gates, in order (the same as the other Tutor routes): method POST (405); the raw body at most 64000 characters, checked before parsing (400 `{ error, failure: 'too_large' }`; access and the model are never reached); JSON (400); board authorization (`authorizedBoardApp`: its own response); origin (403); `subscriptionOwnerRefusal` (403); then the capability (400), the request (400), the selection (400) and the context (400) are checked before anything is read or any budget is spent.
- Request body: `{ app, capability, request, selection?, context? }`.
  - `app`: the board app. The route reads only that canvas's repository; the id never comes from the selection.
  - `capability`: a string that is an own key of `HANDOFF_CAPABILITIES`, which holds exactly one entry, `repository_context` (a dispatch table: a later capability adds an entry `{ selectionProblem, run }` and the request contract stays the same). Anything else, including `research`, `do`, a case variant and `__proto__`, is 400.
  - `request`: a string, non-empty after trim, at most `HANDOFF_REQUEST_MAX` (1000) characters. That constant is exported by `agents/learn-tutor.js` and read by both the route and `handoffProblem`, so the protocol has one bound; the action schema's `maxLength` equals it.
  - `selection`: optional; null counts as absent, and any other non-object (false, 0, an empty string, an array) is 400. `{ repository, revision, file, symbol?, line_range?: { start, end } }`: `repository` 1-200 characters, `revision` 1-100, `file` 1-500, `symbol` 1-200, `line_range` exactly `start` and `end`, integers with `1 <= start <= end`; an unknown key is 400.
  - `context`: optional; exactly `{ card: { id, title?, text } }` with `id` 1-200 characters, `title` at most 300 and `text` 1-8000 (`CANVAS_TARGET_LIMIT`; refused over the cap, never cut). It reaches the reader as the canvas target section of the context (untrusted data, evidence, never instructions) through `appendCanvasTarget`; the question stays only the request.
- What the selection can and cannot drive: grounding only, never intent. The route never parses a selection out of the request text, and a keyword creates none.
  - `repository` must equal the snapshot's repository (`owner/repo`, the form code-card sources carry), else `no_repository_context`.
  - `revision` becomes the commit passed to `repositorySnapshot`; it can pick any indexed version of the canvas repository, and an unindexed one is `no_repository_context`.
  - `file` with `line_range` becomes the `read_source` range and is placed as the selected code, with the existing `Selected code: path:start-end (commit X)` line.
  - `symbol` is used as the `get_relationships` node id when it is an exact graph node id.
  - What the reader cannot take as structure stays in the question as grounding text: a file with no range (`Selected file: path (commit X)`), a range `read_source` refuses (over its 120-line window, or a file not in the snapshot; `Selected file: path:start-end (commit X)`), and a symbol that is not a node id (`Selected symbol: X`).
- Limits are the Learn chat repository ask's own (the 64 KB body, the research step cap, the chat answer tokens, 120 source lines) plus a per-user cap, because the handoff is a paid, model-initiated call: category `tutor_handoff` through `admitUsage`, `HANDOFF_CAPS` 30 per hour and 150 per day per signed-in user (the worker vars `TUTOR_HANDOFF_HOUR` and `TUTOR_HANDOFF_DAY` override). The usage row is admitted just before the first model call, so a turn that resolves no repository spends no budget; it is the route's only write, and it records `repository` 1 (Task 14: the handoff reads repository code). Over the cap: 429 `{ error, limited: true, capability, answer: null, telemetry }` with `outcome` `refused`, `failure` `limited` and `calls` 0, and nothing written.
- Timeout: `HANDOFF_TIMEOUT_MS` 45000, under the browser's 60 s Tutor turn limit (`TURN_TIMEOUT_MS` in `LearnTutor.jsx`). The race does not abort the in-flight model request: the deadline flag stops the research loop at its next model call, and an admission that outlasts the deadline answers `timeout` with no model call (the row it wrote stays).
- Response, 200 for every executed handoff: `{ capability, answer, telemetry }`.
  - `telemetry`: `started_at` and `completed_at` (ISO strings), `ms` (their difference), `outcome` (`ok`, `failed` or `refused`), `failure`, `served_model` (the last served), `calls`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cost_usd`, `tool_errors` and `prompt_version` (Task 14: `promptVersion` of the reader's system text and `REPOSITORY_TOOLS`, 12 hex, the same on every reply of a deploy, failures included; null if hashing fails). Tokens and calls are summed over every model call; `tool_errors` counts the repository tool calls that throw inside the handoff's `runTool` (a failed read is returned to the model as an error result and the loop goes on, so the outcome can still be `ok`); a tool that returns a not-found status, or a tool name the reader was not given, is not counted; tokens are 0 when no call was made and null once an ok reply carried no usage; a non-ok reply adds a call and no usage, so what was already billed stays counted. `cost_usd` is priced per call and is null when any served model has no price entry (the Auto model has none, so it is usually null in production: a price is never guessed).
  - `answer` is the reader's text only when `outcome` is `ok`; on every failure it is null and the response carries no upstream error text.
  - `failure` is null or one of: `no_repository_context` (the canvas has no repository, `LEARN_DB` is missing, the revision is not indexed, or the selection names another repository; no model call is made), `retrieval_error` (a storage error while resolving the repository or admitting the call: D1, R2, a stored snapshot gone, a limiter error), `timeout`, `model_error` (a model HTTP failure, a thrown transport error, an empty answer or the research step limit), `refused` (the final stop reason is a refusal, with or without text; `outcome` `refused`), `too_large` (the answer was cut at the chat answer tokens; the raw-body guard uses the same category on its 400) and `limited` (the cap above; `outcome` `refused`).
- Read-only: no write to any repository, snapshot, thread, message, moment, canvas or evidence table beyond the usage row. It does not stream: it answers JSON.
- A null or undefined thrown by the model transport answers `model_error`, like any other transport error (`error?.category`).

#### 4.7.2 The Tutor action (built, Task 11c-B)

Implemented on the reviewed main line at `5c176ec2` (Task 11c-B and its fix rounds 1 to 3).

- The action: `handoff { capability, request }`.
  - `capability` is an enum with exactly one value, `repository_context` (`HANDOFF_CAPABILITY_NAMES` in `agents/learn-tutor.js`). A test keeps that list equal to the keys of the route's dispatch table (`HANDOFF_CAPABILITIES`, 4.7.1), so a future capability adds one entry to both and never a new action. `request` is the question for the source reader: the existing action field, non-blank and at most `HANDOFF_REQUEST_MAX` (1000) characters, the same constant the route uses (4.7.1). It may name functions, files and symbols; backticks, code, identifiers, file names and `=>` are allowed (unlike the requests of `create_material`, `suggest_research` and `suggest_journey`).
  - It matches the route body in 4.7.1: `capability` and `request` are the route's own. `app`, `selection` and `context` are not planner fields; the browser adds them from structured state (below).
  - The schema is a derived tool, not part of the base `TUTOR_TOOL`: `tutorTool(avatar, handoff)` returns the base (or avatar) tool with `handoff` added to the action `type` enum and a `capability` property. `plannerRequest` sends that tool, and the uncached `HANDOFF_SYSTEM` block, only on a turn whose `context.allowed_actions` lists `handoff`. Every other request is byte-identical to before. A turn that sends the derived tool caches under its own tool schema, a separate prompt-cache entry from one that sends the base tool.
  - The uncached extra system blocks are now an ordered list: `NEXT_STEP_SYSTEM` (a hook click), `EXPLICIT_MODE` (`/ask`, `/teach`), `HANDOFF_SYSTEM` (the handoff is allowed). They coexist, and a request with one block is the same as before.
  - One shared rule decides whether a handoff action is valid, `handoffProblem` in `agents/learn-tutor.js`: a known capability and a non-blank request of at most 1000 characters. The browser validator and `fastPlanProblem` both use it, so the fast tier counts a handoff as the reply only when it is valid; an invalid one escalates to Opus like a plan with no words. The validator knows `handoff` only on a turn whose route allows it, allows at most one per turn (a second is dropped) and trims the request.
  - The 3-action cap never drops the handoff. A valid handoff that meets three accepted actions makes room by dropping the last accepted non-text action (the plan's lowest priority; the log says the handoff is kept). When only text actions (`respond_text`, `ask_question`) are ahead of it, nothing can be dropped cleanly, so the handoff is dropped and the turn is recorded as `invalid_action` (below). Evaluator note (v1): when the cap evicts a card to keep the handoff, the plan's own words may still mention the evicted card (for example a reply that names a diagram that was dropped). The eviction is recorded in the turn's decisions and bench rejections, in the log, and in `validation.dropped_actions` (so `validation.ok` is false), and that is how the evaluator can tell.
- The router offer. `route()` adds `handoff` to a turn's allowed actions when the turn carries the structural flag `handoff_offer`, on typed, Voice and hook turns alike, except on the rows whose rule fixes the move (`returned`, `uncertain_unsettled`, `slash`). Nothing reads the learner's words.
  - The flag comes from `turnOffers({ repository })` in `LearnTutor.jsx`: the repository signal and not in journey setup (setup allows words, plus the Start a learning path offer since 2026-10-07; never the handoff). `useTutor({ repository })` uses the page's value when it passes one, else `canvasRepository(app)`: the app's name starts with `repo-` or the app has a `project`. That is app data only, and exactly the two forms the route resolves (`boardRevision`: a repo-* board, or a canvas through its project).
  - A plain canvas, or a repository source the learner detached (once the page passes the flag, 1.7), is never offered the handoff, so a planned one is dropped by the validator and no route call is made.
- `HANDOFF_SYSTEM` (summary, four lines): what the action is (it hands the turn to a capability that answers after the turn; `repository_context` reads the canvas repository's source and answers from it; the request is the question in plain words and may name the functions, files and symbols it is about, and the selected card travels with it); when to use it (only when answering correctly needs the repository's source, that is what code does, where something is defined or called, how a value flows or why the code is written a certain way, and the supplied context does not already contain it; never because words like code, function or repository appear; when the supplied context suffices, respond normally); the limits (at most one per turn, optionally after a short `respond_text` lead-in that frames the question and never guesses the answer); and the honesty rule (an allowed handoff changes nothing for the plan's own words: they never claim retrieval or inspection, only the handoff answer reports what the source says, and when retrieval fails the learner is told the source context could not be retrieved). It settles the conditional wording of line 19 of the shared prefix (4.6).
- Execution. Right after the plan is validated (an evaluation that blocks the planner has already settled before it; a pending one keeps running beside the handoff), `runTurn` starts the accepted handoff (trace stage `handoff`) through the injected `post` to `POST /api/learn/tutor/handoff`, the route in 4.7.1. The body is `{ app (from the page's access), capability, request }` plus grounding taken from the selected block only, never from the learner's words:
  - `selection`: the block's first well-formed code source (`validSources`: kind `code`, `repo` as `owner/name`, a 40-character revision, a repository-relative path, lines `[start, end]`) in the route's form `{ repository, revision, file, line_range: { start, end } }`. `symbol` is never sent, because no card data carries one.
  - `context.card`: `{ id, title (at most 300 characters), text (at most 8000) }`. The text is the card's own words, joined and cut at 8000: a snippet sends its title, brief and code; a code exercise (`type` `code`) sends its title, brief, setup and starter and never `draft` (the learner's own work), `checks` or `hint`; any other card sends its title, body, brief and code where it has them; an animation sends its description instead. It is grounding, never intent. The planner's own target text is unchanged.
  - No selected block, no grounding. A message that names a file and lines creates no selection.
  - The call uses the turn's `post`, so it carries the browser's 60 s limit and the Stop signal.
  - The handoff never depends on evidence and does not wait for an evaluation that is still running beside the planner: it starts straight after validation, runs beside that evaluation, and the turn awaits both before the session record.
- The reply on success. The reply text is the plan's own words (`respond_text` and `ask_question`), then the handoff answer. It reaches the dock through the usual Tutor reply path and Voice through the turn's `speech` (the existing Voice behaviour; an early lead-in may already have been spoken while the handoff runs). Voice speaks it through the plain-speech path (no code, markup or URLs aloud, about 600 characters per clip; 1.7), and the caption keeps the full answer. The answer also becomes that turn's `tutor` text in the session store, so the next planner turn sees what the learner was told. The handoff writes no evidence; the turn's own words are evaluated exactly as on any turn (on a journey or course canvas whose claims they touch, the posts are evaluate, plan and handoff).
- The reply on failure. `runHandoff` never throws. An answer counts only when the route says `outcome` `ok` and sends non-empty text. Anything else keeps only the plan's own words and adds the fixed line "The source context could not be retrieved, so I cannot answer this from the code right now." (it is the whole reply when the plan had no words). The plan's words are kept because the prompt bounds them to supplied context and forbids claiming retrieval; the failure line is always added, so the learner always knows the source was not read. Text that arrives with a non-ok outcome is never shown.
- Companion material (Task 14). When the handoff gives no answer (outcome `failed` or `refused`, any failure category, or `invalid_action`), `runTurn` drops that turn's `create_material` actions: each is a decision `{ type: 'create_material', accepted: false, stage: 'handoff', reason: 'the handoff returned no source' }` and a log line, so `actions`, the contracts, the trace (`validation.dropped_actions`) and `runMaterials` agree, and no card is made from the request alone beside a reply that says the source was not read. A turn left with nothing is `no_action` (the reply is the failure line). An answered handoff keeps its material. A Stop already ends the turn. No prompt change.
- Failure categories, the full list: those of the route (4.7.1: `no_repository_context`, `retrieval_error`, `timeout`, `model_error`, `refused`, `too_large`, `limited`) plus three browser-only categories: `request_error` (a network error, or an HTTP error that carries no route telemetry), `stopped` (the learner pressed Stop or barged in during the handoff) and `invalid_action` (the turn offered the handoff and the plan proposed one, but the validator dropped it). Mapping: a route reply with telemetry uses its own `outcome` and `failure`; a 429 carries the route telemetry (`refused`, `limited`); the 400 for an oversized body carries `too_large`; the browser's own timeout (`TimeoutError`) is `timeout`; an abort (`AbortError`) is `stopped`; an `ok` reply with blank text is `model_error`; anything else without route telemetry is `request_error`.
- `invalid_action`. When the turn offered the handoff and the plan proposed one that the validator did not keep (an unknown capability, a blank or over-long request, or a cap drop with only text ahead of it), no route call is made. The reply gets the failure line, the record is `{ started_at, completed_at (the same instant), ms: 0, outcome: 'failed', failure: 'invalid_action', model_id: null, usage: null, tool_errors: null, prompt_version: null }`, and the trace records `grounding_status` `retrieval_failed` with no `repository` source (4.6). A second handoff after a first that ran is not a failure, and a handoff proposed on a turn that did not offer it is dropped silently.
- Stop or barge-in. A Stop during the handoff ends the turn exactly as a Stop during the planner does: the `AbortError` rejects the turn (carrying the turn trace and, for the handoff, its record), so the page saves nothing, runs no canvas action, makes no `create_material` card or model call, and emits no decision event; nothing is requested after the abort. The stopped handoff rejects inside its trace stage, and the turn rethrows it after any evaluation still pending has landed. The record is `outcome` `failed`, `failure` `stopped`, `ms` measured until the stop. It never records `retrieval_failed` or a `repository` source. The same holds for a Stop pressed after the plan or the handoff has resolved but before the turn's actions run (for example while an evaluation is still landing): right after `runTurn` returns, an aborted turn signal ends the turn like any Stop, on both the plan-only path and the handoff path, with no action, material or save. The turn trace (the bench event's `trace`, not the decision event) reads the stage status `stopped` for a Stop during the planner or the handoff (`planner:stopped`, `handoff:stopped`); a planner timeout reads `planner:timeout`, and a handoff timeout, the route's or the browser's, reads `handoff:timeout`. Every other handoff failure that reached the stage keeps stage status `ok` with its failure category as the stage result (an `invalid_action` never runs the stage). A Stop after both have resolved adds no `stopped` status: each stage keeps the status it finished with, and the bench event's `error` `AbortError` (with the completed handoff record, if any) is the only sign. Because the turn emits no decision event, v1 has a limit for the evaluator: a stopped turn is visible only in the page's bench event (`small:tutor-bench`, with `error` `AbortError`, the `trace` and `handoff.failure` `stopped` when a handoff was running), not in the decision trace. Whether the page shows anything after a Stop is `ask.jsx`'s.
- The trace.
  - Action contracts gain `capability`, right after `command`: `repository_context` on a handoff and null on every other action. A handoff contract is `action_type` `handoff`, `command` null, `modality` `text`, `cost_tier` `model`, target claims as a reply's (the turn's first three), `expected_evidence` `[]` and `estimated_learning_seconds` null (the answer's length is unknown at plan time). `actions` and `chosen_action` carry it, and `chosen_action` is the handoff whenever one ran, whatever else the plan holds (`create_material`, `suggest_journey`, `suggest_research`).
  - `runtime.handoff` (last key of `runtime`) is `{ started_at, completed_at, ms, outcome: 'ok' | 'failed' | 'refused', failure, model_id, usage, tool_errors, prompt_version }`, null on a turn with no handoff, on both hook events and on a `plan: false` turn. `started_at` and `completed_at` are browser wall-clock ISO times; `ms` is the round trip on the turn clock, the same clock as `planner_ms`; `failure` is the category above or null; `model_id` is the route's served model; `usage` is `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd }` from the route telemetry (a missing count is null; the whole object is null when no telemetry came back; `cost_usd` is usually null, because the Auto model has no price entry, 4.7.1); `tool_errors` is the route telemetry's count of repository tool calls that threw inside the reader loop, null when the route did not report it (including `invalid_action` and runs with no route telemetry), and it changes neither `grounding_status` nor `source_types_used`; `prompt_version` (Task 14) is the route telemetry's reader prompt version, null without route telemetry or a route call. The event never carries the request or the answer.
  - `runtime.timing` gains `handoff_ms` and `blocking_wait_ms` (4.8). `grounding_status` and `source_types_used` follow the handoff (4.6). `reason_codes` stay the planner's generic codes, and learner intent stays apart from what ran (4.4).
  - `versions.planner_version` is `tutor-planner-2` (`TUTOR_PLANNER_VERSION`; it was `tutor-planner-1` before this task). `prompt_version` is unchanged on every request that does not allow the handoff.

### 4.8 Latency boundaries

Measured, and never folded into one aggregate (owner thirteenth message): the evaluator can tell Tutor planning latency, repository handoff latency and the learner's total blocking wait apart. All are on the turn clock (`performance.now`) and are tested on a stubbed clock for a typed turn, a Voice turn with an early lead-in and a turn with no handoff.

- `runtime.timing` is `{ total_ms, planner_ms, first_text_ms, handoff_ms, blocking_wait_ms }`.
  - `planner_ms`: the Tutor planner stage. `first_text_ms`: the first thing the learner hears or reads (a spoken lead-in counts). `total_ms`: from the start of `runTurn` to the end of the turn. All three keep their meaning.
  - `handoff_ms`: the handoff round trip, equal to `runtime.handoff.ms` (0 for `invalid_action`); null when no handoff ran. For a stopped handoff the time until the stop is the bench event's `handoff.ms`; there is no decision event and so no `handoff_ms` (4.7.2).
  - `blocking_wait_ms`: from the turn start until the reply actually appears. `first_text_ms` and `blocking_wait_ms` come from one clock read of the answer moment (the turn's end, after any pending evaluation has landed and the session record is written), so `blocking_wait_ms >= first_text_ms` holds exactly, and the two are equal when the reply appears at that moment. With a handoff the answer, or the failure line, is drawn only after both the handoff and any pending evaluation have finished, so an evaluation that outlasts the handoff counts in the learner's wait; the handoff itself does not wait for the evaluation to start. `first_text_ms` is that same read unless a lead-in was spoken early, in which case it is the lead-in's time. Without a handoff `blocking_wait_ms` is `first_text_ms`. So on a typed turn the two are equal, with or without a handoff, and in Voice with an early lead-in and a handoff `blocking_wait_ms` is the later one.
  - Both hook events (`next_steps_computed`, `next_steps_shown`) and a `plan: false` turn carry `handoff_ms` and `blocking_wait_ms` null.
- Worst case: the planner can take up to the browser's 60 s limit and the handoff up to the server's 45 s timeout (4.7.1), so a learner can wait about 105 s, or about 114 s when the turn first waits for a blocking evaluation (the evaluator's 0.8 s and the larger check's 8 s are awaited before the planner). `handoff_ms` and `blocking_wait_ms` make that visible. Whether the handoff timeout should be shorter is still open.

### 4.9 Failure honesty

The owner rule: if the handoff fails (an error, a timeout, a refusal, or no repository context), the Tutor never fabricates a repository-grounded answer and never claims code was inspected. It falls back only when its own plan already answered honestly from the supplied context; otherwise the learner gets a plain message that the source context could not be retrieved.

- Route side: a failed handoff returns no answer text and no upstream error text, only the `outcome` and the `failure` category (4.7.1).
- Tutor side: the failure reply, the categories and the mapping are in 4.7.2. The plan's own words are kept only because the prompt bounds them to the supplied context and forbids claiming retrieval; the failure line is always appended, and the trace records `grounding_status` `retrieval_failed` and never `repository` as a source (4.6), including for `invalid_action`; a stopped handoff is not a retrieval failure and leaves no event.
- Regressions covered by tests: a repository retrieval failure never yields a code-grounded answer and records `retrieval_failed`; an offered handoff the validator drops is an `invalid_action` failure with the failure line; a plain canvas and a detached source are never offered the handoff; the reader's answer is told never to answer from memory when a read fails.

### 4.10 Known capability gaps

- `/motion` does not exist yet; natural-language Motion requests use `modality_override` and keep the Generate / Not now boundary.
- `/research` and `/do` are not Canvas capabilities. The Tutor never runs the Research workflow or the Do agent; it may offer Research this once the page wires `openResearch` (4.5), and a research-like or do-like request is otherwise answered within the Tutor's context. The Auto Tutor has no web research and no canvas-editing agent.
- Every Learn command that makes a card by itself is reachable in ordinary language through `create_material` (`materialCommands()` in `learn-slash.js`: a command with no action, or the notebook and whiteboard inserts, that has a ready card family; paid ones keep Generate / Not now). `/dive` is reachable through `suggest_dive` and `/deeper` and `/simplify` through `suggest_depth` on a depth ladder or through words. The commands that need the learner's own action are not: `/source` (opens the Source inspector) and `/paper` (opens a known arXiv paper or the picker) have no ordinary-language route, at most a Research offer; `/more` opens the tool catalogue and is not a learning capability. These gaps are listed for the owner and are not built.
- A repository question has an ordinary-language route on a repository canvas (the handoff, 4.7.2). Two limits: (a) a canvas gets the offer only where `canvasRepository(app)` holds, the two forms the route resolves, a Rabbit Hole is created as a canvas with no project (`dives.js`), so neither the offer nor the route's repository resolution applies: there is no handoff in a repository Rabbit Hole in v1; (b) a selected code card that cites a different repository than the canvas's still sends that selection, the route reads only the canvas repository and answers `no_repository_context`, so the learner gets the honest failure line although the canvas repository exists (the browser does not know the canvas's `owner/repo` on project canvases, so it does not filter).
- Real judgement quality (intent, pedagogy, routing correctness) is measured by the Tutor Evaluation agent after the final SHA; the stand-in tests only check the plumbing and the obvious constraints.

---

## 5. Creator analytics (future aggregator)

Nothing is persisted or aggregated in v1. This section fixes what the v1 events must keep so a later aggregator can answer two creator questions, and the privacy rules it must follow (owner, tenth message). It is a separate, owner-approved change (a migration), not part of v1, and it never feeds the Tutor.

### 5.1 What v1 events retain

For every option of every set: `suggestion_id`, `set_id`, `position` (1-3), `hook`, `learning_goal`, `concept_ids`, `claim_ids` (on `next_steps_computed` and `next_steps_shown`); on a click: `selected_next_step_id` and `selected_at` (on the `tutor_decision`); and the impression time `shown_at`. Together these say which option was shown, in which position, whether it was selected, and which concept and goal it represented.

### 5.2 Most selected hook

- The analytics identity of a hook is `learning_goal` plus `concept_ids` plus `claim_ids`, so semantically equivalent hooks aggregate across wording.
- Selections are read against impressions by position, so there is no position-bias blind spot: a hook shown first and clicked often is not confused with the best hook.
- Personalized hook copy never leaks learner-specific text into creator analytics: aggregate by the structured goal and concepts and expose a safe representative copy, taken from content-only (anonymous shared) sets or from the most common wording once the cohort threshold is met.

### 5.3 Most difficult concept

- Difficulty is aggregated from viewer sessions using the existing evidence model: misconception, prerequisite gap, repeated uncertain evidence, failed practice, Explain Back fail or partial, repeated clarification, repair actions (the repair reason codes, for example `repair_misconception` and `fill_prerequisite_gap`), and the time to evidence improvement. The events carry `evidence_transitions`, `reason_codes` and `clarification_requested`; practice and Explain Back results come from the evidence model itself, not from the event.
- Never long dwell time as confusion, and never one wrong answer as a misconception.
- The creator-facing result is an aggregate (most difficult concept: X), never an individual's evidence.

### 5.4 Privacy and separation

- Aggregation is server-side only. A publisher never receives a learner's private evidence record; only aggregates cross the boundary.
- A minimum cohort applies before any difficulty or selection metric is exposed: default 10 distinct viewers.
- Shared canvases: events belong to the viewer (section 3), so a creator's view of their shared canvas is an aggregate over viewers, never a viewer's record.
- Creator analytics is kept separate from Tutor decision inputs: the Tutor and the hook planner never read it.
