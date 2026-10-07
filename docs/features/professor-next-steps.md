# Professor Next Steps

Owner: Learning Path agent (hook planner, contract, Tutor turn, decision trace, server routes). UI: Parallel (the bottom-left card).
Status: contract approved by the owner with corrections (2026-10-06), first frozen for UI integration at bab01392. This revision (Task 11d draft) consolidates the owner decisions and the shipped names of Tasks 3-11 and adds the Auto Tutor routing contract (section 4) and creator analytics (section 5). Implementation in progress on `feature/professor-next-steps` (from main f4b99a3b): Tasks 0-9 are merged at a29b8041 (Task 0, generic Tutor availability, is ff3edfb8 + 40dbd592). Not deployed; no migration.
Provenance: untagged text matches code merged at a29b8041. `[T10]` is implemented on `pns/t10` (d916cdb7, final re-review pending) and `[T11]` on `pns/t11` (43cd1b74, one fix round still open); neither is merged. `[11b]` and `[11c]` are written from the task briefs and the owner decisions and are not built. Every tagged item is PROVISIONAL until its task merges; the final pass (Task 11d) confirms or corrects each one against the code. A name the briefs leave open is marked `[unfixed]`.

At a useful stopping point the Tutor offers exactly three curiosity hooks. A hook is a short learner-facing question that makes the learner want to click; the precise pedagogical target behind it (`learning_goal`) stays internal. A hook says WHAT the learner wants to pursue; after the click the existing Tutor planner decides HOW to teach it, including generating real material through the existing Learn commands. A click is never evidence and never a faked learner message.

---

## Changes since bab01392 (for Parallel and the Tutor Evaluation agent)

UI-facing contract and integration points (details in 1.3, 1.4, 1.7):

1. Voice Mode: a hook click while Voice is on is `voice.say('', { nextStep, selectedAt })`, never a typed `askStep`. It takes the floor like a barge-in while the Tutor is speaking, waits while an avatar clip holds Voice (newest click wins), and is refused (shown as busy) only while a turn is thinking or Voice is off. This replaces the typed-only recipe in 1.4.
2. `tutor.extras` is a getter read when drawn: the Generate / Not now offer of a paid card the Tutor made, the notices of made material, and the turn chips (including Back up the Rabbit Hole). Draw it wherever hooks are mounted: an undrawn paid offer blocks the one-at-a-time queue. `[T10]` It is also present where only hook clicks run.
3. Mount gating: mount `useNextSteps` only when `learnPreview` is on and a composer exists, never on review boards (`reviewTools && board`). Pass the live canvas title (`canvasTitle || app.title`) to `useTutor` and `useNextSteps` `[T10]`, so a rename refreshes the Tutor goal and invalidates hooks.
4. `[T10]` Hooks also run on plain canvases and Rabbit Holes with no registry (holes from shared canvases included). A plain canvas needs a lesson card; a hole shows no hooks until its dive record and its parent journey have been read.
5. `[T11]` Carried hooks: `tutor.opening` is `{ key, next_step }` for a hook carried into a hole; send it once with `tutor.askStep`, never as typed text. A shared step's `source` gains `title_fingerprint`, a board rename answers `409 stale_hook` like a version change, and a chat-card origin reads as the root. `shared-rabbit-hole.js` helpers: `resumeHref(..., hookId)`, `takeResume(..., { hook: true })`, `requestRabbitHole(..., { step })`.
6. `[11b]` Canvas commands: the explicit Canvas overrides are `/ask` and `/teach` (`/motion` where supported; it does not exist yet). `/research` and `/do` are Home/Library workflows: remove their Canvas exposures (1.7). `learnSlash.run` passes `ask` and `teach` to `tutor.slash(name, raw)` beside `deeper` and `simplify`.
7. `[11b]` Auto Tutor: natural typing and Voice on plain canvases go to the Auto Tutor (no journey needed) instead of Learn chat. `[11c]` Questions that need the repository's source go through the Tutor's `repository_context` handoff; its answer arrives as the Tutor reply, so nothing new is drawn.
8. `useTutor` takes optional `canvasVersion` and `title`; `useNextSteps` takes optional `canvasVersion`, `board`, `describe`. Mounting `useNextSteps` adds about 19 kB raw, 7.3 kB gzip to the Learn chunk.

Decision trace and planner (sections 2 and 3):

9. New event `next_steps_shown` (the impression); every option carries `suggestion_id`, `set_id`, `position`; `selected_at`, `shown_at` and `evidence_transitions` added; `command` on every action; `runtime.planner_input`; flags `cached` and `discarded`; `validation.fallback` is a category, never error text; unknown token counts are null.
10. Hook planner: the goal comes from structured sources only (the learner's words travel only as `recent.question`); completed-section claims enter only to repair; the input is trimmed to 9000 characters in a fixed order and fails as `unavailable/failed` when it cannot fit; the tool gains `ambiguous`.
11. Tutor turn: several `create_material` actions (distinct commands) are allowed within the 3-action cap; the modality history is what the Tutor put in front of the learner; the fast tier releases its first sentence when the actions are complete and checked. `[11b]` Natural-language Auto turns may create material. `[11b]` `intent_mode`, `inferred_intent`, `explicit_modality_override`, `intent_status`, `clarification_requested` and `cost_tier` join the event; `[11c]` `capability` and `runtime.handoff` join it.

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
  source?: { share_version, origin_block_id, title_fingerprint }   shared only [T11]: the board version, the card id or ':root', and a one-way hash of the board title
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
| `unavailable` | nothing to show. `reason`: `not_now` (not a stopping point), `failed` (the planner failed after escalation, the reply was malformed, or the input could not be trimmed to fit, `input_too_large`), `limited` (server rate limit), or `off` (no Tutor context here; `[T10]` also a hole whose dive record or parent journey has not been read yet) | show nothing |

Not a stopping point (`not_now`): the Tutor is answering; a Tutor question is waiting for an answer; the return-from-hole check is pending; the journey tray, intake, diagnostic or path review owns the choices; a section is being built or the journey has a pending action; the canvas has no goal and no blocks. `[T10]` A plain canvas (no registry, not a hole) with no lesson card is `not_now` whatever its title: a title alone never grounds hooks. Chat exchanges are not canvas blocks (`canvasApi.blocks()` returns lesson blocks only), so chat alone never grounds them either.

Voice Mode is not a reason to hide hooks: while Voice is on, hooks stay visible and clickable, a click enters the same Tutor path, and the Tutor's reply follows the existing Voice behaviour. v1 adds no voice command for choosing a hook.

The hook keeps one outcome per basis (a set or a failure). A basis is never requested twice; returning to a basis whose set already landed shows it again with no request; a 429 stays `limited` until the basis changes. A reply counts as ready only when `options` is exactly 3 objects, each with an `id` string, a `hook` string and a `selected_next_step` object (not an array), with distinct ids; anything else is `unavailable/failed`. `select()` refuses in this order: `unknown` (the id is not in the current or last shown set), `busy` (a Tutor turn is running, or any stop is set), `stale`.

### 1.3 Integration hook API (no UI included)

```
// owned canvases (LearnPage; Rabbit Holes included)
const tutor = useTutor({ ..., canvasVersion?, title? })        // title: the live canvas title [T10]
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

Both hooks live in `packages/web/src/LearnNextSteps.jsx`. `select()` only validates the click and returns the payload (a copy); it never runs a turn. `canvasVersion` is telemetry only; `board` defaults to `main`; `describe` is `describeBlock` and supplies card titles only (a card's text never travels).

`useTutor` always returns `askStep`, `snapshot`, `lastTurn`, `busy` and `showing`, also where the Tutor is not active, so `useNextSteps` can tell whether hooks belong there; the last four are internal to `useNextSteps`. It returns `ask` and `voiceTurn` only where the resolved capabilities have `tutor`; it returns `opening` and `extras` where `tutor` or `capabilities.hook_turns` holds (`hook_turns`: hook clicks and the paid offers they raise, no typed or voice turns; `tutorContext` returns such an entry like a `tutor` one). `[T10]` A canvas with no registry entry gets the generic canvas domain with `{ tutor: false, hook_turns: true }`: hook clicks run there, while typed text stays Learn chat and Voice Mode does not exist. `[11b]` Superseded for typed and voice turns: they go to the Auto Tutor (section 4.2). `ownedSteps` and `sharedSteps` are internal, exported only for node tests: not part of this contract.

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
-> 409 { error: 'stale_hook' }     the board version changed or the board was renamed [T11]: start again without it, then show fresh hooks
-> 400                              a malformed step, wording, ids, scope or origin
```

- Origin: the selected shared card, else the root, exactly as today. No fork, no copy, no write to the shared board. A chat card is not content: as an origin it reads as the root `[T11]`.
- The step is checked before anything is read or written for the viewer, in this order: the version and title fingerprint (409), then wording and ids against the same trimmed input that generated the hook (2.1), then the origin. Only the checked fields are echoed as `next_step`.
- The selected hook's `learning_goal` becomes the new hole's initial goal (`learning_goal` on its dive record).
- Before navigating to `url`: `carryStep(sessionStorage, name, next_step)` (from `learn-next-steps.js`). The hole's first Tutor turn opens the hook once instead of the usual opening question: where hook turns run, the hole's opening effect takes the carried step once (`takeCarriedStep`) and `tutor.opening` becomes `{ key: dive_id, next_step }` `[T11]`; the page sends it once with `tutor.askStep`, not as typed text. `[T10]` A canvas-domain hole sends it once the hole's Tutor context has resolved.
- `requestRabbitHole(token, origin, { step })` (in `shared-rabbit-hole.js`) sends the step and returns `{ url, existing }` (plus `name` and `next_step` when the server echoed a step), `{ stale: true }` on 409 `stale_hook`, or `{ signIn: true }`; other refusals throw.
- Signed out: `keepPendingStep(sessionStorage, token, selected_next_step)`, then `resumeHref(pathname, cardId, hook.id)` gives `/login?next=<path>?rabbit=<card|root>&hook=<id>`. After sign-in `takeResume(location, history, { hook: true })` returns `{ origin, hook }` (`undefined` when there is nothing to resume); `takePendingStep(sessionStorage, token, hook)` gives back the kept step once, only for the same link and hook id. Send it with the rabbit-hole POST. A missing step or a `stale_hook` reply starts the hole without it.

### 1.5 Where sets come from (the hooks call these; the UI does not)

- Owned: `POST /api/learn/tutor/next-steps { app, input }` -> `HookSet` plus `telemetry`. A separate call, never part of a Tutor turn. The planner is `planNextSteps` (2.4).
- Shared: `POST /api/learn/boards/shared/<token>/next-steps { origin: { block_id } | null, viewer_states? }` -> `HookSet` plus `telemetry`. Built per request, never stored with the board, nothing written to the source. `viewer_states` is sent only when the viewer is signed in and has evidence (2.1). `[T11]` Anonymous on public links, sign-in (401) on private ones.
- `telemetry` is the planner's telemetry (tier, escalation reason, calls, ms, versions, model role and id, usage, cost, rule names; shared adds `share_key` and a structural `summary` of the input; `cached: true` with zero calls, usage and cost on a cache hit). The hook consumes it only to build the decision events (section 3); it is never part of `steps`.
- Statuses: 200; 400 (input problem: shape, a forbidden key, a body over 16000 characters, an input over 12000 characters, and on the shared route `[T11]` an input the trim cannot fit, `input_too_large`); 404 (shared: an unknown card); 429 `{ limited: true }` past the server limits (section 2.3), which the hook reports as `unavailable/limited`; 502 when the planner fails after escalation (`unavailable/failed`); 503 when the worker has no Learn database (owned).

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
  - `tutor.opening.next_step` (a hook carried into a new hole `[T11]`): send it once with `tutor.askStep({ selected_next_step: tutor.opening.next_step, ... })`, keyed by `opening.key`, never as typed text;
  - draw `tutor.extras` wherever hooks are mounted (the Generate / Not now offer of a paid card, the notices of made material, the turn chips such as Back up the Rabbit Hole). It is read when drawn; reading it once at spread time loses later changes.
- `LearnPage.jsx`:
  - mount `useNextSteps({ tutor, journey, canvasApi, canvasState, record: dive.tree?.dive || null, access: askScope, title, graded, canvasVersion, board: boardName, describe: describeBlock })`;
  - mount gating: only when `learnPreview` is on and a composer exists, and not on review boards (`reviewTools && board`): `useTutor` cannot tell a review board from a canvas. Mount and `tutor.extras` land together;
  - pass the live canvas title to both hooks, `useTutor({ ..., title: canvasTitle || app.title })` and `useNextSteps({ ..., title })` `[T10]`: a real rename changes `canvasTitle`, never `app.title`. Until it does, the creation-time `app.title` is used. Optionally pass `canvasVersion` to `useTutor`;
  - a `graded` counter bumped when `gradeCanvasAnswer` resolves;
  - `[T10]` where only hook clicks run (plain canvases, holes), the dock is passed `tutor={tutor.active ? tutor : null}`, so `tutor.extras` and `tutor.opening` are never drawn there: draw `tutor.extras` and run `tutor.askStep` for clicks without making the composer the Tutor. The voice `TutorCaption` already reads `tutor.extras` regardless of `active`;
  - `[11b]` `learnSlash.run` passes the mode commands `ask` and `teach` to `tutor.slash(name, raw)` as it does `deeper` and `simplify` (today `LearnPage.jsx:500`, `['deeper', 'simplify']`; `/motion` when that command exists). `research` and `do` are not passed (section 4.3);
  - `[11b]` remove or hide the Canvas exposures of `/research` and `/do`. Found at a29b8041: `agent/slash.js` lines 21-22 (the `research` and `do` commands, `places: ALL`, with Canvas descriptions) and line 65 (`LEARN_MENU.learn` includes `research`); `learn-slash.js` lines 44 and 49 (`EXAMPLES.research`, `EXAMPLES.do`). The 11b report lists the final file and line locations; Parallel owns the edits.
  - `[11b]` Voice Mode and natural typing on plain canvases reach the same Auto Tutor; the selected card is passed as the turn's target, as on journey canvases.
- `AdaptiveCanvas.jsx`: an `attempts` count (sum of practice attempt logs) in `onState`. Until it is reported, a practice attempt changes the basis only once its evidence lands.
- `SharedBoardPage.jsx` `[T11]`:
  - mount `useSharedNextSteps({ token, card: <selected card id or null>, version: shared.version, signedIn: !!shared.viewer })` and render the 3 hooks verbatim when `ready` (disabled when `stale`);
  - click: `const r = steps.select(hook.id)`; if `r.ok`, `requestRabbitHole(token, rabbitOrigin(state, card, describe), { step: r.selected_next_step })`. `{ url, name, next_step }`: `carryStep(sessionStorage, name, next_step)` then navigate to `url`. `{ stale: true }`: start again without the step, then show fresh hooks. `{ signIn: true }`: `keepPendingStep(sessionStorage, token, r.selected_next_step)` and go to `resumeHref(location.pathname, card, hook.id)`;
  - after sign-in: `const back = takeResume(location, history, { hook: true })`; if `back`, `const step = back.hook ? takePendingStep(sessionStorage, token, back.hook) : null` and send it with the rabbit-hole POST (a missing step or a stale reply starts the hole without it).
- `shared-rabbit-hole.js` `[T11]`: provided by the Learning lane, backward compatible, so the existing callers are unchanged: `requestRabbitHole(..., { step })`, `resumeHref(pathname, cardId, hookId)`, `takeResume(location, history, { hook: true })` returning `{ origin, hook }`. The SharedBoardPage wiring stays Parallel's.
- Already provided by the Learning lane: `voice-session.js` `say('', { nextStep, selectedAt })`, `LearnVoice.jsx` (a hook click never consumes the armed card).
- Bundle: nothing from the hook modules is in the shipped Learn chunk until `useNextSteps` is mounted; mounted, it adds about 19 kB raw, 7.3 kB gzip.
- `[11c]` Nothing new to draw for the repository handoff: its answer is the Tutor reply (spoken in Voice Mode). Do not add a second path to the repository reader.

### 1.8 Known limits (v1)

1. Opaque, not hidden: the browser receives `learning_goal` and the ids inside `selected_next_step`, because the Tutor turn is assembled in the browser. Hiding them needs server-held sets or a signing secret; neither is in v1.
2. On owned canvases a stale click is refused in the browser; on shared canvases the server refuses it too (409 `stale_hook`, also after a board rename `[T11]`).
3. The owned reply cache keys one-way on user, canvas and basis. On `*.workers.dev` hostnames the edge cache does not take effect, so dev clones may miss it (a known dev limitation, owner fourth message). The per-user caps in the database are authoritative; verify duplicate-reply behaviour on the custom domain at deployment time.
4. `askStep` stamps `selectedAt` itself at call time and ignores a passed value; the Voice path forwards the one it is given.
5. `[T10]` Every plain canvas waits for its dive record (one small GET) before hooks, because only that record says whether the canvas is a hole; a failed read keeps it hook-less.
6. A shared board's hooks use only claims of public registered courses (entries with `suppliedCourse`); other boards get content-grounded hooks with empty id lists.

---

## 2. Hook planner

### 2.1 Input (structured state, never a chat dump; at most 9000 characters)

| field | content |
|---|---|
| `mode` | `journey`, `dive` or `canvas` (owned), `shared` |
| `basis` | the staleness key (2.3) |
| `goal` | built from structured sources only. Journey: the journey goal. A hole: its `learning_goal` (the hook that opened it), else `<parent goal> - <title>` (the parent goal is the journey goal for a journey hole and the course subject for a course hole), else its title. Otherwise the course subject or the canvas title (`[T10]` the live title). The learner's own words never enter the goal; their latest question or request travels only as `recent.question`. Shared: absent unless the viewer has an explicit, reliable structured goal (none exists in v1) |
| `path` (journey) | current section `{ id, title, purpose, claim_ids }`, completed sections `{ id, title, claim_ids }` (newest 6), upcoming section titles only (4) |
| `canvas.blocks` | up to 20 `{ id, kind, title, concept_ids, claim_ids, practice }`. `kind` is the block type (the name `canvas_summary.kinds` uses); the title comes from `describe`, never a card's text (answer keys live there); `practice` is the last attempt's result, `open`, or null. A chat card, if one is ever a block, is `kind: chat`, titled by its question (80 characters) and never read for its answer: it grounds but never defines the topic (a format-like message such as quiz me never makes a format word valid) |
| `scope.concepts` / `scope.claims` | up to 12 claims with statement, ideas, drawn case, evidence state (one of the five), misconception id, prerequisite, settled counts, and whether it is presented on the canvas; priority: current section or hole claims, then the newest blocks' claims, then claims with evidence, then prerequisites, then completed-section claims that need repair. A claim only in completed sections enters only when it needs repair (below); an understood completed claim never takes a place. Built by one builder (`nextStepsScope`) shared with the shared route |
| `recent` | last intent kind; the learner's own last question (only for a question or request, at most 300 characters); state transitions (6); recent modalities (8); practice results (4). Transitions and practice name only claims and cards still kept after trimming |
| `previous` | the last hooks shown (6) and goals selected (3), so hooks do not repeat |
| `dive` (holes) | title, concept, claims, parent goal and section, parent claim states (read only) |
| `constraints` | learner constraints from the session and the journey (depth, minutes, coding, math) |

Never in the input: intake familiarity or background, raw intake answers, transcripts, answer keys, expected answers, or any level or score.

Needs repair (the one rule, in browser and validator): a misconception, a prerequisite gap, or an uncertain claim with at least one settled fail or misconception (passes alone, or unsettled evidence, are not repair); or the concept a prerequisite gap claim in scope names (a missing prerequisite). Every completed section counts for this rule, although `path.completed` lists the newest 6. A missing prerequisite leaves with its gap claim.

Cap and trim. Over 9000 characters the browser trims by structured priority only, never by titles or text. Cards go first, the lowest rank first and the oldest among equals, down to 6 (highest rank is kept longest: the current section heading and cards naming an essential claim; then cards naming any kept claim and the newest card; every other card goes first). Then the lowest-priority claims that are not essential. Then the remaining cards. The section's or hole's claims (the first claim when there are none) go last of all, and at least one claim is always kept. A card's `claim_ids`, `recent` and a missing prerequisite follow what is kept. If trimming would leave no claim where the registry offered some, or the input still does not fit, no request is made and the hook is `unavailable/failed` (`input_too_large`). The server refuses an input over 12000 characters (400). The trim counts travel beside the request body for telemetry (`runtime.planner_input`, 3.1), never inside it. `[T11]` The shared input uses the same trim helper (ruled for the open T11 fix round; the selected card's claims are essential), and Start Rabbit Hole rebuilds the same trimmed input, so generation and the click validate against the same scope.

`[T11]` Shared input is built on the server from the shared board's visible content only: lesson block titles (at most 20 blocks, the selected card always among them), the selected card `{ id, title }` or null for the root, the board title (as data, never a goal), and concepts and claims of public registered courses visible in that content (selected card first). The board version is not in the model input; it travels in each step's `source`. A signed-in viewer may add their own claim states (`viewer_states`, filtered to the server-built scope, the five states, `not_yet_observed` dropped because it is no evidence, at most 12). Never the sharer's journey, evidence, Tutor store, chats or identity; chat cards on the board are excluded, and a chat card used as the origin reads as the root; no goal is inferred (not even from the viewer's earlier Rabbit Hole from the same share, which matters only when that hole is resumed). Anonymous viewers get hooks from content only.

### 2.2 Validation (server; a failure escalates, never loosens)

- Exactly 3 options; each hook 4-12 words, at most 90 characters, one line, no code.
- Never a command or course label (learn, explain, study, continue, next lesson ...), never a format name (quiz, flashcards, animation, Motion, video, diagram, card, Explain Back ...) unless the canvas topic is that thing, no clickbait. Motion is caught as the product name (capitalised), as motion graphic, clip or video, and as `with motion` within three words after a show, explain, see, watch, animate, illustrate, demonstrate or visualise verb; plain lowercase motion as physics vocabulary passes.
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
- `[T10]` a change of the effective Tutor context (journey, Rabbit Hole, course or plain canvas), of the parent journey or section a hole stands on, or of the canvas title where it grounds the goal (a plain canvas or a hole without a `learning_goal` yes, a registered course no): a rename or the parent journey arriving recomputes.

The owned basis is a short hash of that state (`nb_` and 8 hex; the server caps a basis at 400 characters). It never reads selection, camera, hover, typing, busy or Voice state.

Shared canvases: only a change of the selected card or root, of the shared board version, or of the signed-in state (viewer evidence becoming available). The basis is the share key, card and version; a board rename is a new cache entry and a stale hook (below).

Browser: 1200 ms debounce after the last change (an implementation default; an identical update does not restart it); one request in flight; a reply for an old basis is stored for its basis and discarded for display; never two requests for the same basis; changes during a Tutor turn wait for it to end; 60 requests per canvas per tab as a safety ceiling, not a target. `[T10]` An owned hook is `unavailable/off`, with no request, until the Tutor context has resolved: a hole whose dive record has not loaded, or whose record names a journey whose parent read has not settled, has none (a settled refusal keeps the canvas domain). No temporary plain-canvas set ever exists to be replaced later.

Server (the browser counter is not relied on):
- Owned: a reply is reused for a repeat of the same signed-in user, canvas and basis (edge cache keyed by a one-way hash, never the raw values), and each user has an hourly and a daily cap (60 and 300; the worker vars `TUTOR_NEXT_STEPS_HOUR` and `TUTOR_NEXT_STEPS_DAY` override), recorded as usage events with the existing atomic-insert rate limiter (category `tutor_next_steps`). The limiter throws unless every cap is passed (`NO_CAP` skips a bucket), so a forgotten cap is a loud error and never an unlimited admission. The raw body is refused over 16000 characters before parsing.
- Shared, anonymous or without viewer evidence: one content-only reply per one-way share key (the existing `shareKey`, never the raw token), board version, origin card or `:root`, and a one-way hash of the board title `[T11]` (a rename without a version bump is a new entry), from the edge cache. It never contains viewer evidence. A miss is admitted under the share link's caps with no viewer; a hit costs nothing.
- Shared, signed in with viewer evidence: never cached and never served to anyone else; admitted under the shared-canvas limiter (category `shared_canvas_hooks`, billed to the viewer, never the sharer, with the shared-ask cap values and a separate budget so the shared-ask budget is untouched).

### 2.4 Model routing

| role (`LEARN_TASKS`) | model | use |
|---|---|---|
| `tutor_next_steps` | Sonnet 5.5, effort low | routine |
| `tutor_next_steps_escalation` | Opus 5.5 | once, on a missing tool call (`no_tool`), a validator failure (`validator`), or `ambiguous: true` (`ambiguous`); directly when a claim's evidence contradicts itself (`contradictory`) |

Model ids live only in `learn-models.js`. The hook planner never calls JEV or an evaluate route. An Opus failure returns 502 and the hook shows `unavailable/failed`. A Sonnet HTTP error does not escalate: it is a 502 straight away.

### 2.5 After the click: the `next_step` Tutor turn

- The existing router picks the row from the selected claims' evidence states, exactly as for any turn (the selected claims alone, not the rest of the canvas); the Tutor planner then chooses the action and the material. A click on a routine row (an off-slice, not-yet-observed, understood or gap row) is planned on the fast tier; every other row (misconception, uncertain, a return from a hole) on Opus.
- On a `next_step` turn the allowed actions also include `create_material { command, request }`, on every row. `command` is one of the Learn commands that can make a card right now (sent as `context.available_materials`, a list of `{ command, cards, paid }` from the existing command registry: for example an interactive scene, Motion, code, a notebook, flashcards, an image, a graph, a video). The browser runs it through the existing Learn command path (`runLearnCommand`, `/api/learn/artifact`, via `runMaterials`); a paid one shows the existing Generate / Not now proposal. There is no second artifact generator.
- Several `create_material` actions may be planned within the 3-action cap, each with a different command (the same command twice is refused). `request` is at most 1000 characters in plain words: no backticks and no `=>` (angle brackets, braces and maths are fine). Free cards are made in plan order; paid proposals are offered one at a time and never hold up the free cards behind them; a command that fails reports a notice and the next one still runs.
- Every other supported action stays available as the row allows: an explanation, a question (predict, transfer, Explain Back), an existing card or part, practice, a Rabbit Hole, and the Avatar Teacher when enabled.
- `[11b]` Natural-language Auto turns may respond directly or generate pedagogically appropriate learning material through the same Tutor planner. Explicit slash commands constrain intent; explicit expensive modalities retain their spending confirmation boundary (section 4.5). Until 11b merges, typed turns are unchanged: `create_material` is offered only on a hook click.
- The hook turn's prompt block (`NEXT_STEP_SYSTEM`) is a second, uncached system block appended only on hook turns, so a hook turn reads the typed turns' cached prefix. `[11b]` The `create_material` meaning moves into the shared prefix and `NEXT_STEP_SYSTEM` keeps only the hook-specific lines.
- On a canvas with no registry, the turn has no claims in scope (row `off_slice`: `respond_text` and `create_material`, plus `return_from_dive` in a hole); the Tutor still answers the hook and may make material. `[T10]` It gets the generic canvas domain: planner context key `canvas_context { goal, origin }` (the goal is the hole's `learning_goal`, else the live canvas title, else a hole's own title; the origin is the shared canvas a hole came from) and a canvas prompt (`CANVAS_SYSTEM`) chosen by that key. The planner never sees the canvas's cards there, so it is told never to invent cards, parts or sources. The canvas has its own session store; a hook click writes no evidence there either. In a hole, an accepted `return_from_dive` draws the Back up the Rabbit Hole chip in `tutor.extras`, with no journey-only variant.

### 2.6 Recent modality history

Every Tutor turn's planner context carries `recent_modalities`: the modalities of the last 8 actions the Tutor put in front of the learner (offers and paid proposals included, whether or not the learner took them), oldest first, as generic names (section 3.2); the last key of `recent_relevant_context`. It is evidence for the planner, which decides; there is no sequencing rule, the router ignores it, and a modality is never required or banned by it. Learning fit comes first; variety is secondary.

### 2.7 First-sentence latency (fast tier)

The planner writes the control fields, then the actions, then `reason_codes` and `reason` last. On the fast tier the first spoken sentence is held until the streamed actions are complete and pass the fast-plan check, then released; it never waits for the reason fields. Once released it is never taken back: the checked actions and `explicit_request` stand whatever the remainder repeats, a cut or unparsable remainder leaves `reason` and `reason_codes` null and sets `telemetry.tail_lost`, and an invalid fast plan releases nothing and escalates to Opus, which streams its own sentence. The validated plan (its cards and other actions) completes about 50-80 output tokens later than before the reason fields existed, on every tier; that cost is real.

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
    canvas_version: number | null,  board revision, or the shared board version
    journey_id: string | null,
    section_id: string | null,
    dive_id: string | null,
    source: { share_key, share_version, origin_block_id } | null,   shared provenance (one-way key only)
    scope: 'owned' | 'shared',
    mode: 'journey' | 'dive' | 'course' | 'canvas' | 'shared'
  },

  versions: {
    planner_version,              Tutor: TUTOR_PLANNER_VERSION; hooks: NEXT_STEPS_PLANNER_VERSION (bumped by hand with any routing or planning change)
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
    chosen_action: { action_type, command, modality, target_concept_ids, target_claim_ids } | null,   [11b] + cost_tier, [11c] + capability
    actions: [{ action_type, command, modality, target_concept_ids, target_claim_ids }],             same shape
    reason_codes: [reason_code],                  0-3
    reason_source: 'planner' | 'router' | null,
    rationale_summary: string | null,             at most 2 sentences, at most 300 characters
    expected_evidence: [{ claim_id, via: 'answer' | 'explain_back' | 'practice' | 'interaction' }],
    estimated_learning_seconds: number | null,
    // [11b] intent_mode, inferred_intent, explicit_modality_override, intent_status, clarification_requested (section 4.4); key positions [unfixed]
  },

  runtime: {
    timing: { total_ms, planner_ms: number | null, first_text_ms: number | null },   // [11c] the blocking wait, and runtime.handoff (section 4.7); field names [unfixed]
    model: { tier: string | null, escalated: boolean, calls: number },    tier: Tutor fast | opus; hooks routine | escalation
    usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd: number | null },
    validation: { ok: boolean, dropped_actions: number, repairs: [string], fallback: string | null },
    planner_input: { before: { block_count, claim_count }, after: { ... }, trimmed: { ... }, current_section_claims_kept: boolean | null, repair_claims_kept: boolean | null } | null
  },

  flags: [string]                 vary_modality_alone, cached, discarded
}
```

A field the step does not have is null or [], never omitted, so every event has the same keys. The key set is exact and tested at every level.

Field rules:
- `actions` are the turn's production action contracts (`result.contracts`, 3.2), never recomputed. `command` is the Learn command name for `create_material` and null for every other action. `chosen_action` is the turn's first action that is not plain text when there is one, else its text reply; null for hook events. `expected_evidence` merges the actions' entries without duplicates; `estimated_learning_seconds` is their sum, null when none has a number.
- A `plan: false` diagnostic turn is traced too: `route` null, `actions` [], `chosen_action` null, `reason_codes` [], `reason_source` null, `prompt_version`, `model_role` and `model_id` null, `calls` 0.
- `current_goal`: Tutor: `id` is the selected hook's suggestion id, `summary` its `learning_goal`, else the domain's goal, capped at 200; hooks: `id` null, `summary` the input goal.
- `evidence_summary`: Tutor: the selected claims only (`turn.evidence`); hooks: every scope claim by state.
- `identity.mode` (Tutor): `journey` for journey evidence, else `dive` for any hole (journey holes included), else `canvas` for the canvas domain (`contextKey: 'canvas_context'` `[T10]`), else `course`. The Tutor's `scope` is always `owned`; a hole started from a share is `owned` with `source`. Hooks take `scope` and `mode` from the caller (`course` for a registry canvas; `shared` and `shared` for shared hooks).
- `prompt_version` is computed before the call, so an error or invalid outcome carries it; a cached hook reply carries the producing call's value, not null. `model_role` is `tutor` for every Tutor call (the fast tier and Opus share the role) and `tutor_next_steps` or `tutor_next_steps_escalation` for hooks. A failed hash gives null and never fails the turn.
- `usage` sums the answering call and, after an escalation, the fast attempt; `cost_usd` is priced at each call's requested model and is null when no call reported usage. A token count no call reported is null, never 0. A cached hook reply: `cost_usd` 0, usage zero, `calls` 0, `total_ms` and `planner_ms` null, flag `cached`. A `next_steps_shown` event is zero usage, `cost_usd` 0, `calls` 0 and null timing, with the versions of the set it shows, so an impression is never a double count. A hook event's `total_ms` and `planner_ms` are the planner's `ms`.
- `validation.ok` is true when no action was dropped and nothing was repaired (hooks: no validator errors). `repairs` are rule names, never text. Tutor: `downgraded_navigation`, `citations_removed`, `shortened_before_dive`, `explicit_request_unquoted`, `learning_goal_dropped`, `rationale_dropped`. Hooks: the hook validator's rule names (2.2). `fallback` is a low-cardinality category: `escalated:<category>`, else `tail_lost`, else `router_reason`, else null; never raw error text. The hook planner's categories are its own escalation reasons (`no_tool`, `validator`, `ambiguous`, `contradictory`); the Tutor's are `invalid_plan` (an action outside the allowed types), `no_words`, `no_tool` (no turn returned) and `model_error` (any other model or network failure, for hooks too).
- `reason_codes` are the planner's, known codes only, once each, at most 3. When the planner gives none, the router's code is used and `reason_source` is `router` (`fallback: router_reason`): the route row's generic code; a hook click leads with `follow_learner_interest` and adds the row's code (omitted when it is `respond_to_question`); slash `deeper` gives `deepen_mechanism` and `simplify` gives `reduce_cognitive_load`; no route gives none. A lone planner `vary_modality` becomes up to two router codes plus `vary_modality`, `reason_source` stays `planner`, and the flag `vary_modality_alone` marks it.
- `rationale_summary` is dropped (repair `rationale_dropped`) when it repeats 5 consecutive words of this turn's message, or holds the whole message (two words or more) as whole words in order, whatever the punctuation or spacing; a one-word reply is not quotable. Only this turn's words are checked; earlier turns rely on the prompt rule.
- `runtime.planner_input` is on `next_steps_computed` only (null elsewhere): the structured counts of the trim (2.1), never the input. An input that cannot be trimmed to fit makes no request and no event.
- `flags`: `vary_modality_alone` (3.2); `cached` (a hook reply served from the edge cache); `discarded` (a hook set that landed after its basis moved on). A discarded set is traced when it lands; its `next_steps_shown` fires only if its basis returns and it is shown, and a set never shown never fires one.
- `next_steps_shown` fires once per set, the first time it is on screen (ready, no stop). `next_steps_computed` fires at landing for every recomputation, so all 3 hooks are recorded each time.

### 3.2 Vocabularies and the action contract

- `reason_code` (generic; no topic codes): `advance_goal`, `deepen_mechanism`, `repair_misconception`, `fill_prerequisite_gap`, `check_understanding`, `test_transfer`, `consolidate`, `respond_to_question`, `follow_learner_interest`, `increase_interactivity`, `vary_modality`, `reduce_cognitive_load`, `resume_context`. `vary_modality` is never accepted as the only code: the event then adds the route row's code and the flag `vary_modality_alone`.
- `action_type`: the Tutor's existing action types (`respond_text`, `ask_question`, `show_authored_card`, `focus_part`, `suggest_depth`, `suggest_practice`, `suggest_dive`, `open_dive`, `return_from_dive`, `suggest_avatar_clip`, `create_material`, `no_action`), `[11c]` plus `handoff`.
- `modality`: the product's existing names. `text` (a Tutor reply), `question`, `explain_back`, `practice`, `depth`, `rabbit_hole`, `avatar`, and for a shown, focused or made card its existing block type (for example `explanation`, `scene`, `animation`, `snippet`, `code`, `notebook`, `flashcards`, `quiz`, `challenge`, `image`, `graph`, `video`, `paper`; an Explain Back challenge is `explain_back`). No card type is invented for the trace. A made card's modality is the block type its command inserts, decided before the card exists (the command's first card). Where a command's palette name is not a block type: `explainBack` is `explain_back`, `plot` is `graph`, `walkthrough` is `scene`, `videoGenerate` and `mathAnimation` are `video`. So a Motion made with `animate` and a generated clip made with `video` both read `video`, and are told apart by `command` (likewise `walkthrough` and `3d` both read `scene`).
- `expected_evidence`, by action and block type alone, so a shown card and a made card of the same type expect the same: `ask_question` gives `answer` (`explain_back` for an Explain Back purpose); `suggest_practice` gives `practice`; an Explain Back challenge gives `explain_back`; challenge, quiz, flashcards, code, notebook, graph, scene, animation, whiteboard and model3d give `interaction`; every passive type (explanation, table, snippet, flow, mermaid, image, video, paper, audio, knowledge), a reply and every other action give `[]`.
- `target_claim_ids`: the action's own valid claim, else its card's claims (for `suggest_depth`, the next rung's), else the turn's claims (at most 3) for `respond_text` and `create_material`, else `[]`; `target_concept_ids` are those claims' concepts plus an action's own `concept` or `to_concept` the registry knows.
- `estimated_learning_seconds` is rough and generic (a `ponytail:` note in the code): text about 180 words a minute (at least 5), question 60, explain_back 120, practice 120, depth 60, avatar its `max_duration_seconds` else 30, any card 90, null for a Rabbit Hole suggestion or an unknown modality.

The planner writes `reason_codes` and `reason` (the rationale) at the end of every turn's tool call, after the actions, so the first spoken sentence is not delayed. When it gives no codes, the route row's code is used (`reason_source: 'router'`).

### 3.3 Location, sinks and access

- Module: `packages/web/src/learn-tutor-trace.js`: pure builders `decisionEvent`, `hooksEvent` and `shownEvent`, `inputSummary`, the guard `safely`, `newSessionId`, `ROW_REASON` (the router's row-to-code map), and the sinks `addSink`, `tracing`, `emitDecision` and `harnessSink`. The action contracts (`actionContract`, `modalityOf`, `blockModality`, `reasonCodes`) live in `packages/web/src/learn-tutor-actions.js`. `REASON_CODES`, `TRACE_SCHEMA_VERSION` and `TUTOR_PLANNER_VERSION` live in `packages/control-plane/src/agents/learn-tutor.js`, so a future server-side store validates the same contract.
- Node (simulation harness): `runTurn({ ..., trace })` with `trace: true` or `{ identity, blocks, next_step_options, selected_at }` returns `result.trace` (a `tutor_decision` event, or null when building failed; no `trace` key when off); `hooksEvent(hookSet, { input, trim, identity, scope, mode, discarded })` builds a `next_steps_computed` event and `shownEvent(hookSet, options)` a `next_steps_shown`.
- Browser sinks: `emitDecision(event)` hands the event to every registered sink after the result is final. v1 registers one sink, only when the harness sets `globalThis.__SMALL_TUTOR_TRACE__ = true` before the page loads: it stamps `identity.user_id` from `GET /api/me` (the stable internal user id, never the email), appends to `globalThis.__smallTutorTraces` (the newest 500) and dispatches a `small:tutor-trace` window event. Off by default; nothing is sent anywhere in v1. The events are built only while a sink is registered: `useTutor` emits each Tutor turn's event, `useNextSteps` emits `next_steps_computed` as each set lands and `next_steps_shown` the first time it is on screen, and `useSharedNextSteps` does the same with `scope: 'shared'`, `mode: 'shared'`, the one-way share key from the server telemetry and the viewer's own session `user_id` (never the sharer's) `[T11]`.
- Later persistence adds a sink that posts events to a server route; the server stamps `user_id` from the session (ignoring the client's) and stores the event as-is. That route, its table and its retention are a separate, owner-approved change (a migration), not part of v1.

---

## 4. Auto Tutor routing (PROVISIONAL until 11b/11c)

Everything in this section is PROVISIONAL. It is written from the owner decisions (2026-10-06: the eighth, ninth, eleventh and thirteenth to sixteenth messages) and the Task 11b and 11c briefs; none of it is built at a29b8041, so no name here is verified against code. A name the briefs leave open is marked `[unfixed]`.

### 4.1 Principle: Auto is the primary interface

- The learner expresses intent in natural language or Voice. The learner never needs to know which agent, modality, tool or slash command exists. Given the message, the selected card, the current canvas, the repository context, the goal and path, the evidence and the recent modality history, the Auto Tutor decides: the learner's intent; whether a simple answer suffices; whether extra context or a capability is needed; the pedagogical action; the modality; and whether a Rabbit Hole is useful.
- Slash commands are optional expert shortcuts. No core function is reachable only through a slash command: if one were removed, its useful behaviour must still be reachable in ordinary language wherever that capability is meant to exist. The 11b report carries the slash-only audit (4.9).
- Routing is never keyword-based. No product code derives intent, a modality override, material or a handoff from words such as motion, research, teach, quiz, flashcards, code, function or repository; a test greps for it. A topic word that names a format is not a request for that format (explain projectile motion is not a Motion request), and research this variable needs no external research when the answer is in the selected local context.
- Uncertain about a high-cost or destructive action, the Tutor asks one concise clarification or proposes the action; it never runs an expensive or destructive capability silently. Paid material keeps Generate / Not now: choosing Motion is not permission to spend, and no confirmation is needed merely to recommend it.
- Evaluation measures Auto routing quality on natural-language prompts: inferred intent, the capability or handoff selected, the chosen action and modality, whether a clarification was needed, routing correctness, the unnecessary expensive-routing rate, the missed-handoff rate, and the latency and cost routing adds.

### 4.2 Where it applies

- Every Tutor canvas: a journey, a registered course, a plain canvas, a Rabbit Hole. Natural typing and Voice take the same Auto Tutor path; a selected card grounds the turn. A journey adds a persistent goal, path and evidence; it is not a prerequisite: a question on a blank plain canvas (why does gradient descent overshoot?) gets an Auto Tutor turn.
- `[11b]` The canvas domain's capabilities become `tutor: true` (today `{ tutor: false, hook_turns: true }` `[T10]`). A registered entry that refuses the Tutor still refuses it. The Task 0 and Task 10 assertions whose purpose was to prove that plain-canvas typed turns cannot reach the Tutor are deliberately rewritten, not preserved: that baseline was acceptable only until 11b.
- Hooks on a plain canvas keep the grounding rule (2.1): a lesson card or a selected card, or no hooks; a goal is never invented because no journey exists.

### 4.3 Canvas command contract

| input | Canvas | meaning |
|---|---|---|
| natural typing, Voice | yes, primary | the Auto Tutor decides |
| `/ask` | yes | explicit ask override: answer the question rather than build an extended teaching sequence unless needed to answer properly |
| `/teach` | yes | explicit teach override: actively teach (the Tutor still chooses the pedagogy and material) |
| `/deeper`, `/simplify` | yes (existing) | the turn's slash, unchanged |
| `/motion` | where supported | does not exist on this branch: a limitation; a natural-language Motion request is read as `modality_override` (4.4) |
| `/research`, `/do` | no | Home/Library workflows, not Canvas commands |

- An explicit slash is known before generation and is passed with the same Tutor request as an input constraint: `tutor.slash(name, raw)` for `ask` and `teach`, as for `deeper` and `simplify`; the learner intent kind stays `slash` and carries the slash name. An uncached system block `EXPLICIT_MODE` (the `NEXT_STEP_SYSTEM` pattern) is appended only on those turns. There is one Tutor and one `runTurn`: a slash overrides Auto intent without a second path, and Auto never literally invokes a slash command.
- Superseded: the earlier lists that named `/research` and `/do` as Canvas overrides beside `/ask`, `/teach` and `/motion` (owner eighth and ninth messages, and item 4 of the 11b brief) no longer apply; the thirteenth message replaces them with the table above.
- `/research` and `/do` stay as Home/Library commands. Where the Canvas UI or its tests exposed them (1.7), they are flagged to Parallel, not preserved as a Tutor requirement. On a Canvas the Tutor adds no behaviour for them beyond intent telemetry: a research-like or do-like request is answered within the Tutor's context and capabilities, and the Tutor never says or implies that the Research workflow ran or that a canvas edit or the Do agent ran.

### 4.4 Learner intent versus executed action

- The planner reads the learner's request and writes `inferred_intent` (`ask`, `teach`, `research`, `do`), `modality_override` (`motion`, only when the learner explicitly asks for that format) and `clarification_requested` (boolean: it asked a concise clarification instead of acting) after the actions, together with `reason_codes` and `reason`, so first-sentence latency is unchanged (2.7). The validator bounds the enums: an unknown value drops to null with a repair rule name `[unfixed]`, and never fails the turn.
- They are telemetry. No code reads them to choose a route, an allowed action, validation or an executed action (a test changes them and asserts nothing else changes). `inferred_intent` is never a deterministic router: teach may yield an explanation, an interaction or Motion, depending on the learner's evidence.
- Decision fields on `tutor_decision` (positions `[unfixed]`):

| field | values |
|---|---|
| `intent_mode` | `auto`, `explicit_slash` |
| `inferred_intent` | `ask`, `teach`, `research`, `do`, or null |
| `explicit_modality_override` | `motion`, or null |
| `intent_status` | `declared` (an Auto turn whose planner wrote the field), `missing` (an Auto turn where the field is absent or truncated: `inferred_intent` null, never a guess from words), `explicit` (a slash turn: `inferred_intent` is the command, and the planner's own field never overwrites it) |
| `clarification_requested` | boolean, or null |

- Hook clicks and the two hook events: `intent_mode` `auto`, `inferred_intent` null, `intent_status` `missing`, unless the plan declared one.
- The executed action stays in `actions` and `chosen_action` (what ran), and learner intent never implies it: `inferred_intent: research` with `chosen_action: respond_text` does not mean research ran, and `inferred_intent: do` never means an action was executed.
- Every action carries `cost_tier`, in `actions` and `chosen_action`: `none` for in-turn actions (text, question, card focus, suggestions), `model` for a `create_material` whose command is free or for a handoff, `paid` for a `create_material` whose command can end in a paid proposal (the registry's `mayConfirmPaid`). A paid card still spends only after Generate.
- Present on every natural-language turn, for the evaluator: `inferred_intent`, `intent_status`, `clarification_requested`, `chosen_action` (with `cost_tier` and, after 11c, `capability`), the modality, and the planner timing.

### 4.5 Material from natural typing

- Typed and Voice Auto turns may respond directly or create material through the same planner: `create_material` is offered whenever materials are available, on every row except where a row's existing rules forbid generation (the `returned` row and the slash `deeper` and `simplify` rows stay as they are; the 11b report states that reading).
- A simple answer is often enough. Respond-only stays a valid plan; the Tutor creates material only when it meaningfully improves the learning action, never for its own sake and never every message. Lightweight material (an explanation card, a quiz, a challenge, Explain Back, a lightweight interaction, a graph, code within the normal budget) is created directly under the existing cost policy, with no extra confirmation. Paid material keeps Generate / Not now. The prompt carries these rules in the shared prefix; changing it re-pins the prefix hashes only after a written review of each changed pin (old value, new value, the intentional change, the semantic difference, a no-pedagogy-regression verdict).

### 4.6 The `repository_context` handoff

The only handoff in this checkpoint, and the first of a generic mechanism: no Research or Do handoff, no multi-agent orchestrator, no second Tutor, and no copy of repository-reading logic into the Tutor.

- Action: `handoff { capability, request }` in the Tutor tool. `capability` is an enum with exactly one value, `repository_context`; `request` is the question in plain words for the source reader, bounded like `create_material`'s. The action name and schema are capability-generic (never a repository or course name); the executing code dispatches on the capability through a small table, so a future capability adds an entry without redesigning the action. The trace's `action_type` is `handoff`, `command` null, `modality` `text`, `capability` `repository_context` (the field is null on every other action), `cost_tier` `model`.
- Offered by the router only where the canvas has repository context available (structured capability state, never words), on typed, voice and hook turns alike. At most one handoff per turn; it may follow a short `respond_text` lead-in, which may speak first.
- When: the Tutor decides from the request and the available context. Hand off only when answering correctly needs the repository's source (what code does, where something is defined or called, how a value flows, why the code is written a certain way) and the supplied context does not already contain it. Never because words like code, function or repository appear: respond normally when the supplied context suffices (what does a function mean in mathematics gets no handoff, and on a conceptual canvas with no repository context it is not even offered).
- Source selection: the handoff accepts an optional structured selection as grounding, never as intent: `{ repository, revision, file, symbol?, line_range?: { start, end } }`, built from structured canvas and card data (a selected code card's source identity, the canvas repository and its pinned revision), never parsed from the learner's words, and passed to the existing repository-reading path in whatever form it already accepts. A field the existing path cannot use stays in the request text as grounding (the 11c report says which). Highlighted code is grounding, not learner intent.
- Execution is server-side: the browser runs the handoff after the plan (as `runMaterials` runs `create_material`) through a Tutor route, for example `POST /api/learn/tutor/handoff { app, capability, request, selection }` (the path is `[unfixed]`: the brief says for example). It sits behind the same gates as the other Tutor routes (method, JSON, board authorization, origin, subscription-owner refusal, a raw size guard) and calls the existing repository-reading function the Learn chat path already uses, with the request, the selected card's text if any, and the canvas repository context. Read-only: it never writes to the repository, the canvas or evidence. It returns the answer text plus telemetry (served model, tokens, cost, ms, outcome). Limits follow the existing Learn chat limits for that path; a new usage category with explicit caps only if that path has none.
- The answer is shown as the Tutor reply in the dock (and spoken in Voice Mode through the existing behaviour). It never writes evidence, and the answer text is never in the event. The reason codes come from the generic vocabulary (for example `respond_to_question`, `deepen_mechanism`).

### 4.7 Latency boundaries

Measured and never folded into one aggregate:

- `planner_ms`: the Tutor planner call (today `runtime.timing.planner_ms`).
- `handoff_ms`: the repository handoff, in `runtime.handoff { started_at, completed_at, ms, outcome: 'ok' | 'failed' | 'refused', failure: <category> | null }` (null when no handoff ran). The key's place in `runtime` is `[unfixed]`.
- Total learner blocking wait: from the turn start to the first learner-visible answer text (a lead-in sentence counts only if it is the answer). The field name is `[unfixed]`.
- Today's `total_ms` and `first_text_ms` keep their meaning. Tests measure the three with stubbed timers.

### 4.8 Failure honesty

If the handoff fails (an error, a timeout, a refusal, or no repository context), the Tutor never fabricates a repository-grounded answer and never claims code was inspected. It falls back only when its own plan already answered honestly from the supplied context; otherwise the learner gets a plain message that the source context could not be retrieved. The event records `outcome` `failed` or `refused` and a low-cardinality `failure` category, never error text.

### 4.9 Known capability gaps

- `/motion` does not exist on this branch; natural-language Motion requests use `modality_override` and keep the Generate / Not now boundary.
- `/research` and `/do` are not Canvas capabilities: the Tutor never runs the Research workflow or the Do agent, and a research-like or do-like request is answered within the Tutor's context. When typed text moves from Learn chat to the Tutor, web research and the `/do` canvas agent are not reachable through the Auto Tutor on a canvas; only the repository reader is kept, through the handoff.
- The 11b slash-only audit lists every Canvas slash behaviour (deeper, simplify, dive, the create commands, ask, teach, research, do, notebook, whiteboard, paper, image, video, 3d, source, compare, example, practice, quiz and the rest) and whether ordinary language reaches the same behaviour through the Auto Tutor (yes, via `create_material`, via `suggest_dive`, or no and a gap); gaps are listed for the owner and not built.
- A structured source field the existing repository reader cannot use stays in the request text (4.6).
- Voice Mode does not exist on plain canvases today `[T10]`; under 11b it reaches the same Auto Tutor.
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

- Difficulty is aggregated from viewer sessions using the existing evidence model: misconception, prerequisite gap, repeated uncertain evidence, failed practice, Explain Back fail or partial, repeated clarification, repair actions (the repair reason codes, for example `repair_misconception` and `fill_prerequisite_gap`), and the time to evidence improvement. The events carry `evidence_transitions`, `reason_codes` and, after 11b, `clarification_requested`; practice and Explain Back results come from the evidence model itself, not from the event.
- Never long dwell time as confusion, and never one wrong answer as a misconception.
- The creator-facing result is an aggregate (most difficult concept: X), never an individual's evidence.

### 5.4 Privacy and separation

- Aggregation is server-side only. A publisher never receives a learner's private evidence record; only aggregates cross the boundary.
- A minimum cohort applies before any difficulty or selection metric is exposed: default 10 distinct viewers.
- Shared canvases: events belong to the viewer (section 3), so a creator's view of their shared canvas is an aggregate over viewers, never a viewer's record.
- Creator analytics is kept separate from Tutor decision inputs: the Tutor and the hook planner never read it.
