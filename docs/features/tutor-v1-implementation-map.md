# Tutor v1 — implementation map (NanoGPT Attention slice)

Status: accepted by the owner, 2026-09-30. Code archaeology and a build plan only. It changes no
application code, no card, no `/dive` code and nothing on `feature/final-integration`.

**Sequencing (locked).** `ask.jsx`, `LearnPage.jsx` and `AdaptiveCanvas.jsx` overlap heavily with
`feature/dive-v1`. So `/dive` is merged and integrated first, and the Tutor implementation branch
starts from that integrated baseline. No Tutor application code starts against `af572dcc`.

Locked sources, not reopened here:
- `docs/features/adaptive-tutor-v1.md`
- `docs/features/tutor-golden-traces-nanogpt.md` (GT-*, G*)
- `docs/features/tutor-v1-locked-decisions.md` (§1–§10)

Code facts are read from `feature/final-integration` at `af572dcc`. Paths are under
`packages/web/src/` unless they start with `packages/`. `/dive` facts are read from
`feature/dive-v1` at `0305395e` (in progress; Parallel owns it) and are marked **WAITING ON
feature/dive-v1**.

Identity rule, kept everywhere below: runtime `scene.id` (on the block) is not the authored
`evidence.card` (on the card module). They are equal only on the 18 depth cards and c06. Measured
at `af572dcc`: 43 card modules, 43 unique `scene.id`, 43 unique `evidence.card`, `evidence` and
`evidence.learningQuestion` on all 43.

---

## 1. LearnerTurn wiring

What exists today: a block's live description rides a Learn ask as `canvas_target` text
(`ask.jsx:526`). Nothing builds structured fields. Every row below is read by a deterministic
builder in the browser (§1 of the locked doc); none needs a card change.

| LearnerTurn field | Current source | File · function | Available today? | Adapter needed |
|---|---|---|---|---|
| `turn_id` | none | — | no | `crypto.randomUUID()` in the builder |
| `raw_user_message` | the composer text, before @-chips are prefixed | `ask.jsx:446` `send(raw)` → `message` | yes | take `raw.trim()`, not `message` (which has `@app` chips in front) |
| `slash` | `parseSlash(text)` → `{ name, args }` | `learn-slash.js:72` | yes | map `deeper` / `simplify` / `dive` to the field. Today `/deeper` and `/simplify` are chat prompts (`agent/slash.js:32-33`); the Tutor path intercepts them before `runLearnCommand` sends the prompt |
| `answering` | none | — | no | the Tutor store's open `ask_question` `action_id`, set when the next non-slash message arrives |
| `dive_choice` | **WAITING ON feature/dive-v1**: `DiveSuggestion` has Go down / Keep here, but `onKeep` only clears the card (`Dive.jsx` `suggestionCard`) | — | no | a Keep-here callback that tells the Tutor `{ concept, choice: 'inline' }` |
| `canvas.app` | `app.name` | `LearnPage.jsx` props; `canvasKey` at `:172` | yes | — |
| `canvas.board` | `board` (slugged `?board=`) or `'main'` | `LearnPage.jsx:184`, `boardName` at `:446` | yes | — |
| `canvas.dive` | **WAITING ON feature/dive-v1**: a pending hole carries `hole.dive` (the Dive record) in sessionStorage; a persisted hole's record comes back with the dive tree | `Dive.jsx` `usePendingHole`, `useDive().tree` | no | read the record; its origin identities must follow the locked contract (B-2) |
| (removed) `pending_dive` | — | — | — | not part of the LearnerTurn: R-10 now anchors a no-selection `/dive <topic>` on a new topic card, so nothing waits for a card selection. The pending child hole of R-4 is unrelated and belongs to `/dive` |
| `target.block_id` | the armed Ask target (`askTarget.id`); a plain selection is not armed | `LearnPage.jsx:441`, `AdaptiveCanvas.jsx:1824` `armTarget` | partly | use the armed target, else the one selected card. The selected card reaches the page only on dive-v1 (`onState.card`) |
| `target.scene_id` | `block.scene.id` | block shape from `nanogpt/board.js:64` `cardBlock` | yes, on the block | read the block by id. Today the page has no block accessor; dive-v1 adds `canvasApi.block(id)` |
| `target.card` | `evidence.card` exists only on the card module; `cardBlock` does not copy it | module lists `nanogpt/board.js:33,42`, `nanogpt/depth/board.js:29` | no (G1) | Tutor card registry `scene.id → module` |
| `target.depth` | `module.evidence.depth` (`Overview` / `Guided` / `Deep dive`); absent on deep-dive cards | card modules | no (not on the block) | registry; `null` when absent |
| `target.part_id` | describe text gives "Showing sub-card i of n: label" only | `scene-describe.js:111` | no (G2) | registry: `module.partIds[inputs[pager.name] ?? pager.default]`; `null` on unpaged cards (only the 6 Deep modules have `partIds`) |
| `target.selected_object` | `block.selectedObject` (a `semanticId`), set by pick or by a marked region's first target; cleared when the pager changes | `AnimatedScene.jsx:770,773`; `scene-evaluate.js:112` | yes | — |
| `target.concepts` | `conceptId` of visible objects; computed inside `describeAnimation` but returned only as text | `scene-describe.js:72,118` | as text only | selected object's `conceptId`, else visible objects' `conceptId`s via `evaluateScene` (`scene-evaluate.js:56`), the same call `describeAnimation` makes |
| `card_state.inputs` | `block.inputs` holds only values the learner changed | block | partly | fill defaults with `coerceInputs(declarations, block.inputs, exampleData)` (`scene-inputs.js:204`); skip `hidden` inputs as `describeAnimation` does |
| `card_state.input_revision` | `block.inputRevision` | `scene-evaluate.js:89` | yes | `?? 0` |
| `practice.task_id` | `block.activity.id` (`cardBlock` copies `activity`) | `nanogpt/board.js:64` | yes | — |
| `practice.status` | `checkStatus(block)`, `isPracticing(block)` | `scene-activity.js:65,103` | yes | map: `submitted` → `submitted`; practising and open → `open`; otherwise `none` |
| `practice.attempts[].seq` | none: `attemptLog` entries have no order field (G3) | `scene-activity.js:156-164` | no | the Tutor store assigns `seq` when it first sees an entry |
| `practice.attempts[].answer_id` | `attemptLog[i].answer` | `scene-activity.js:158` | yes | — |
| `practice.attempts[].answer_label` | `block.activity.answer.options[].label` | block | no (G6) | look up the label by option id |
| `practice.attempts[].result` | `attemptLog[i].result` (`passed` / `failed`) | `scene-activity.js:162` | yes | — |
| (never sent) `expected` | `block.activity.expected` is on the block | block | — | the adapter never copies it; `describeActivity` already omits it |
| `evidence` | none | — | no (G15) | Tutor evidence store (§2 of the locked doc) |
| `constraints` | none | — | no | session list in the Tutor store; the planner reports `constraints_add` / `constraints_remove` |
| `returned_from` | **WAITING ON feature/dive-v1**: `climb()` writes a return point without `dive_id` or concept | `Dive.jsx` `climb`, `takeReturn` | no | the Tutor store remembers the dive it was last in; the first parent turn whose canvas is that dive's parent gets `returned_from` |
| `recent_turns` | canvas exchanges `{ question, answer }`, kept in localStorage per board | `LearnPage.jsx:187` `chatKey`, `:422` `placeExchange` | yes | last 4 |
| `recent_actions` | none | — | no | Tutor store, last 3 |

## 2. Existing card and chat context functions

| Function / flow | File | What it exposes today | Tutor use |
|---|---|---|---|
| `describeAnimation(block)` | `scene-describe.js:46` | `{ kind, title, text }`. Text: title and duration; paused time; "Experiment inputs (revision n)"; "Showing sub-card i of n: label"; derived values referenced by visible objects; `describeActivity`; "Concepts: …"; "Selected object: …"; "State at that moment: [{id, highlighted, values, tokens, cellHighlight}]". Never throws. No card id, no part id | Planner context (§9), unchanged |
| `describeActivity(block)` | `scene-activity.js:185` | prompt; status (`no answer yet` / `in progress` / `submitted and passed|failed (attempt n)`); last committed answer id. No option labels, no expected value | Planner context; structured attempts come from the adapter instead |
| `describeBlock(block)` | `LearningBlocks.jsx:1638` | dispatch per block type; animation → `describeAnimation` | the Ask target text |
| `cardBlock(module)` | `nanogpt/board.js:64` | block `{ id (uuid), type 'animation', title, scene, time, selectedObject, marked, activity?, sources?, sequence? }`. No `evidence`, `plan`, `partIds`, `transitions` | `show_authored_card` inserts through it |
| `partIndex(module, partId)` | `nanogpt/depth/board.js:52` | pager index, or `null` (open the whole card) | `focus_part`, `part_id` |
| `DEPTH_LADDER`, `DEPTHS` | `nanogpt/depth/board.js:27,29` | concept → `[overview, guided, deep]` modules | depth order for `suggest_depth` (G12: ladder order, no pairwise transitions) |
| Practice reducers | `scene-activity.js` | `enterPractice`, `setActivityAnswer`, `applyCheck` (appends `{taskVersion, answer, practiceInputs?, inputRevision, result}` and closes), `applyNewAttempt`, `checkStatus`, `lockedInputNames` | deterministic evidence; `suggest_practice` |
| `applyInputToBlock(block, name, value)` | `scene-evaluate.js:89` | the one input write path; bumps `inputRevision`; a pager change clears `selectedObject` and `marked` | `focus_part` |
| Selection | `AdaptiveCanvas.jsx:1108` `selection` (ids); `AnimatedScene.jsx:770,773` object pick / region | canvas selection stays inside the canvas. Only an armed Ask target reaches the page | target resolution |
| Ask target arming | `AdaptiveCanvas.jsx:1810-1859` `liveAskText`, `armTarget`, re-arm effect; `:1862` `askRegion` | `{ id, kind, title, text }` with `text` a getter resolved at send; a deleted block becomes a warning target | `target.block_id`; its text is the planner's card description |
| Learn send | `ask.jsx:446` `send` → `/api/learn/ask` (`:373`) | payload `{ message, canvas_target, outline, thread_id, scope, … }`; SSE reply mirrored as a canvas exchange (`onExchange`) | the Tutor path branches here; reply rendering is reused |
| `canvas_target` | `learn-ask-target.js` `canvasTargetField`; server `packages/control-plane/src/learn-ask-context.js:61` `validateCanvasTarget`, `appendCanvasTarget` | id, kind, title, text (32k cap client, 8k to the model) | unchanged for normal chat; the Tutor sends its own bounded context |
| Learn slash | `learn-slash.js:86` `runLearnCommand`; `LearnPage.jsx:408` `learnSlash` | `{ prompt }` / `{ notice }` / `{ proposal }` / `{ catalog }`; `/deeper`, `/simplify` return `{ prompt }` | intercept `deeper` / `simplify`; `/dive` is dive-v1's |
| Canvas commands | `AdaptiveCanvas.jsx:1414` `apiRef.current = commandsRef.current` | `insertBlock` (`:1326`), `focusBlock` (`:1346`), `removeBlock`, `deselect`, `showSection`, … No read of blocks, no block update | see §4 missing primitives |
| Challenge grading | `LearnPage.jsx:583` `gradeCanvasAnswer` → `learn-grade.js:15` `gradeAnswer` → `POST /api/learn/assess`; JEV shadow via `shadowGrade` | a prose verdict "VERDICT: good|partial" for challenge / explain-back blocks | evaluator plumbing (§6) |

## 3. G1–G6 implementation candidates

None edits a card module, the renderer, `attemptLog` or a serializer.

**Shared resolver (recommended).** G1, G2 and the concept lookup are needed by both `/dive` (the
Dive origin, B-2) and the Tutor (the LearnerTurn target). They go in one small pure module that
depends on neither:
- File: `packages/web/src/card-target.js` with a test, next to the existing `card-plan.js` and
  `card-sources.js`.
- Contents: the card registry, and `resolveCardTarget(block)` →
  `{ block_id, scene_id, card_id, part_id, concept_ids, selected_object, depth }`, following the
  locked origin identity contract (locked decisions §6.1).
- Imports: only the card module lists and `evaluateScene`. Never Tutor or `/dive` code, so there is
  no circular dependency.
- Users: `dive.js` `diveRecord` and the Tutor turn builder.
- Bundle cost: none new. `LearnPage.jsx` already loads every card module through `demo-scenes.js:12-13`.

G3–G6 stay Tutor-side.

**G1 — authored card identity**
- Need: `evidence.card` for the target, and for relationships and transitions.
- Existing: `block.scene.id`; the module lists `NANOGPT_FIRST_BATCH`, `NANOGPT_LATER_BATCHES` (`nanogpt/board.js:33,42`) and `DEPTH_LADDER` (`nanogpt/depth/board.js:29`); `evidence.card` on all 43 modules.
- Candidate: a registry built once from those lists: `byScene: Map(scene.id → module)`, `byCard: Map(evidence.card → module)`. Resolution is `block.scene.id → module → module.evidence.card`. A block whose `scene.id` is not in the registry has `target.card = null` and is not a slice target.
- Files: `card-target.js` (shared).

**G2 — stable part id**
- Need: `part_id` on the six Deep modules.
- Existing: `module.partIds`; the pager input (`presentation: 'pager'`, e.g. Attention Deep `{ name: 'part', of: 'parts', default: 0 }`); `block.inputs`.
- Candidate: `partId(block, module) = module.partIds?.[index] ?? null`, with `index = block.inputs?.[pager.name] ?? pager.default`. The inverse is the existing `partIndex`.
  Never the selected object's `semanticId`.
- Files: `card-target.js` (shared).

**G3 — ordering signal**
- Need: newer versus older evidence.
- Existing: `attemptLog` is append-only (`scene-activity.js:164`), so array order is attempt order within one block.
- Candidate: the evidence store keeps a per-block cursor `{ [block_id]: entriesSeen }` and a monotonic `seq`. New entries get the next `seq` values in log order; free-text events get theirs when the evaluator returns. Both live in session-scoped browser storage (§2 of the locked doc).
- Caveat: attempts made between two messages get their `seq` at the next turn. Their relative order is exact; their order against a free-text event made in the same gap is not observable. v1 accepts this.
- Files: new `learn-tutor-evidence.js`.

**G4 — concept and claim tag on attempts**
- Need: each attempt maps to a concept and claim.
- Existing: `block.activity.id` and `attemptLog[i].taskVersion`.
- Candidate: the claim registry keys practice tasks by `(evidence.card, activity.id, taskVersion)` → `{ concept, claim, transfer: boolean, misconceptions: { [optionId]: misconception_id } }`. Example: c11 `c11-practice` v1 → `causal-mask/reads-self-and-earlier`, `target` → `reads-next-target`, `all` → `no-mask`.
- Files: new `learn-tutor-claims.js` (data).

**G5 — claim ids**
- Need: claims for the slice concepts `attention`, `causal-mask`, `score-scaling`, `softmax`, `attention-output`.
- Existing: object `conceptId`s only.
- Candidate: a Tutor-owned data module. Per concept, 2–4 claims `{ id, statement, expects[] (JEV ideas), misconceptions[] {id, check}, prerequisites[] (concepts) }`, plus the G4 task map. Nothing is copied into card data.
- Files: `learn-tutor-claims.js`.

**G6 — answer label**
- Need: the option label ("0 to 100") beside the id (`target`), never the expected answer.
- Existing: `block.activity.answer.options[] { id, label }`.
- Candidate: the adapter maps `answer_id → label` when it builds `card_state.practice.attempts`. `describeActivity` is left unchanged.
- Files: `learn-tutor.js` (`cardState`).

## 4. TutorAction wiring

| Action | Existing primitive | Missing primitive | Likely file |
|---|---|---|---|
| `respond_text` | the exchange mirror: `onExchange` → `placeExchange` puts a movable answer card on the canvas, and the sheet renders it with `Md` (`ask.jsx`, `LearnPage.jsx:422`); `cites` → `card-sources.js` and `openCanvasFile` | the Tutor reply arrives whole (like `/api/learn/assess`), not streamed | `ask.jsx` (Tutor branch in `send`) |
| `ask_question` | same as `respond_text` | the open-question record (`action_id`, `claim`), cleared on answer; refused under `no_quiz` | `learn-tutor-evidence.js` (store), `learn-tutor.js` (enforcement) |
| `show_authored_card` | `cardBlock(module)` + `canvasApi.insertBlock` (`AdaptiveCanvas.jsx:1326`); `focusBlock(id)` (`:1346`) when already present | find a block by `scene.id` (the page cannot list blocks); a suggestion chip for `mode: 'suggest'` | `AdaptiveCanvas.jsx` (a read-only `blocks()` command); chip in `ask.jsx` |
| `focus_part` | `partIndex` + `applyInputToBlock(block, pager.name, index)` + `focusBlock`; `null` opens the whole card (GT-13) | a canvas command that updates one block (`updateBlock(id, fn)`, with undo snapshot); chip | `AdaptiveCanvas.jsx`, `learn-tutor.js` |
| `suggest_depth` | `DEPTH_LADDER` order | chip → `show_authored_card` navigate on click | `learn-tutor.js`, `ask.jsx` |
| `suggest_practice` | `enterPractice(block)` (`scene-activity.js:107`) + `focusBlock` | `updateBlock`; chip (the click is the learner's action, so practice stays learner-driven) | `AdaptiveCanvas.jsx`, `ask.jsx` |
| `suggest_dive` | **WAITING ON feature/dive-v1**: `window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail: { blockId, topic } }))` shows `DiveSuggestion` with **Go down a Rabbit Hole** / **Keep it on this canvas**; Go down → `dive(topic, 'tutor_confirmed', { id: blockId })` | Keep-here → `dive_choice: inline` for the next turn (today `onKeep` only closes). `from: { block_id }` sends `blockId`; `from: { anchor: { topic } }` sends no `blockId`, and dive-v1 then creates the topic anchor card on Go down (`diveFromTopic`), which is the same primitive as a learner's no-selection `/dive <topic>` (R-10) | `Dive.jsx` (dive-v1), `learn-tutor.js` |
| `open_dive` | **WAITING ON feature/dive-v1**: learner `/dive` and Ctrl+K run inside `useDive` (`dive.run`), with no Tutor involvement | the Tutor's opening turn in a new hole: a signal when a hole with a Dive record is entered | `Dive.jsx` / `LearnPage.jsx` (dive-v1), `learn-tutor.js` |
| `return_from_dive` | **WAITING ON feature/dive-v1**: navigator `climb(path.length - 2)` restores viewport, selects the origin block and puts the pending question back in the composer | chip → `climb`; `returned_from` (see §1) | `Dive.jsx` (dive-v1), `ask.jsx` |
| `no_action` | — | — | — |

Authority enforcement (§5 of the locked doc) is one pure function over the planner output: drop
unknown types; downgrade `mode: 'navigate'` without a slash or `explicit_request` to a chip and log
it; strip `ask_question` under `no_quiz` / `just_answer`; keep only the router's allowed types. It
lives in `learn-tutor.js`.

## 5. First vertical-slice file plan

Repo conventions followed: flat `packages/web/src/learn-*.js` modules with a `*.test.mjs` beside
them (`npm run test:unit` = `node --test "src/**/*.test.mjs"`). Pure prompt and schema modules sit
in `packages/control-plane/src/agents/` and are imported by both the browser and the worker (as
`agents/learn-grade.js` is). Dev routes mount in `packages/web/dev-worker.js`. Model tasks are
declared in `LEARN_TASKS` (`packages/control-plane/src/learn-models.js:25`).

New:

| File | Holds | Pure? |
|---|---|---|
| `card-target.js` (shared with `/dive`) | card registry (G1), `partId` (G2), `resolveCardTarget(block)` with concepts; the locked origin identity contract | yes |
| `learn-tutor-claims.js` | slice claim registry and practice-task map (G4, G5): data only | yes |
| `learn-tutor-evidence.js` | session store (events, `seq`, cursors, open question, constraints, recent actions, last dive); `deriveClaimStates(events)` with the locked thresholds; deterministic evaluator (`attemptLog` diff → events) | yes, storage injected |
| `learn-tutor.js` | `buildTurn(…)` (§1) using `resolveCardTarget`, `cardState(block)` with labels (G6), `route(turn, states)` (§7 table), `enforce(response, route, turn)` (§5), `runActions(actions, canvas)` (canvas injected, as `runLearnCommand` does) | yes, canvas and fetch injected |
| `packages/control-plane/src/agents/learn-tutor.js` | planner system prompt; `TutorResponse` tool schema (closed action list); Tutor JEV question builder (idea, named-misconception and gap checks); larger-evaluator instruction | yes |
| `packages/control-plane/src/learn-tutor-routes.js` | `POST /api/learn/tutor/evaluate` (JEV, then the larger evaluator on uncertain; returns events) and `POST /api/learn/tutor/plan` (one forced-tool planner call; returns `TutorResponse`) | no |
| tests: `card-target.test.mjs`, `learn-tutor-*.test.mjs` ×3, `packages/control-plane/test/learn-tutor.test.js`, `packages/web/e2e/tutor-slice-check.mjs` | see §7 | — |

Changed (small, all outside card data):

| File | Change |
|---|---|
| `ask.jsx` | a `tutor` prop, like `slash`: when set, `send` builds the turn and calls the Tutor instead of `/api/learn/ask`; renders reply and chips. **Also touched by dive-v1** (the `/` button) |
| `LearnPage.jsx` | pass `tutor` to the dock `AskPanel` only on the slice board; supply canvas, board, exchanges. **Also touched by dive-v1** |
| `AdaptiveCanvas.jsx` | commands `blocks()` (read-only) and `updateBlock(id, fn)`. dive-v1 already adds `block(id)`, `getView`, `setView`, `select` and `onState.card`; the Tutor reuses those |
| `demo-scenes.js` | `BOARDS['nanogpt-attention-tutor']`: the seven slice cards via `cardBlock` (unchanged modules), plus a `BOARD_SEED_VERSIONS` entry |
| `packages/web/dev-worker.js` | mount the two Tutor routes (dev worker only, as `/api/learn/assess` is at `:161`) |
| `packages/control-plane/src/learn-models.js` (+ its test) | `LEARN_TASKS.tutor` (planner) |

Not built: no D1 table or migration (evidence is session-scoped), no new card, no change to
`/api/learn/ask`, no generation action.

## 6. Evaluation path

| Rung | What exists | What must be built |
|---|---|---|
| Deterministic | the grade is already in the log: `applyCheck` runs the closed predicate once and stores `result` (`scene-activity.js:145-164`); nothing is re-graded | the `attemptLog` diff and cursor (G3), the claim mapping (G4), the "transfer only on the first attempt of a transfer task" rule. Returns `settled` |
| JEV | `askJev(env, request, { transport, timeoutMs })` (`learn-grade-jev.js:134`), `THRESHOLDS` (`:21`), `JevError`; keys are worker secrets (`TYPESAFE_API_KEY` direct, `VERCEL_TYPESAFE_API_KEY` gateway) | a Tutor request builder. `jevRequest` / `gradeQuestions` (`:47,57`) are fixed to the grader protocol: idea checks plus one generic misconception and one non-attempt question, pinned by `GRADER_PROTOCOL_FINGERPRINT`. Named-misconception and gap checks need their own question set, sent through `askJev` with `timeoutMs: 800`. The retry on 429/529 waits up to 1 s, so the Tutor call must not retry. Status: every check ≥ 0.7 or ≤ 0.3 → `settled`; any in between → `uncertain`; `JevError` or timeout → `error` |
| Larger evaluator | `POST /api/learn/assess` (`learn-grade-routes.js` `assessAnswer`, mounted only on the dev worker, `dev-worker.js:161`): one call on `LEARN_TASKS.grading`, no tools, returns SSE with a prose "VERDICT: good|partial" | a structured instruction (per check: yes / no / unclear, as JSON) on the same grading task, reusing `assessText`'s call-and-replay loop; 8 s timeout; on error, the events are stored unsettled |
| Evidence merge | none | `deriveClaimStates` in `learn-tutor-evidence.js`, run on every append (§2 thresholds) |

Order per turn:
1. Build the turn.
2. Run the deterministic step in the browser.
3. If there is free text on a slice target, call `/api/learn/tutor/evaluate`. The server runs JEV and, only on `uncertain`, the larger evaluator.
4. Append the events and derive the states.
5. Route.
6. Call `/api/learn/tutor/plan`.
7. Enforce the response, then run its actions.

That is two requests, because routing needs the updated states.

## 7. Acceptance slice checklist

Legend:
- **Prereq**: the runtime facts the trace depends on, all verified at `af572dcc`.
- **Build**: the missing Tutor functionality.
- **Visible**: the expected learner-visible behaviour.
- **Test**: the automated test opportunity. `unit` means a `node:test` over the pure modules with scripted blocks and a stubbed planner and evaluator. `e2e` means `e2e/tutor-slice-check.mjs` on the slice board, with the Tutor routes stubbed through Playwright request interception wherever a model is involved.

| Trace | Prereq | Build | Visible | Test |
|---|---|---|---|---|
| **GT-01** Overview understood → Guided | `depth-attention-overview` block, `scene.id = evidence.card`, depth Overview, concepts `attention, attention-weights, context, causal-mask`; no practice | turn builder, JEV evaluate, derivation (`demonstrated_here` → `uncertain`), router, `suggest_depth` chip | short reply; a chip for the Guided card; no navigation, no label | unit: event is `demonstrated_here`, state `uncertain`, response has `suggest_depth` and no `navigate`. e2e: chip click shows and focuses the Guided card |
| **GT-02** practice fail once | c11 `c11-practice` v1, `choice_equals`, fixed `{mask: true}`; a failed entry in `attemptLog` | deterministic evaluator, G3 cursor, G4 map, G6 label | the card's own `feedbackFail`; the Tutor adds nothing, or one question on the table | unit: one `fail` event with `misconception_id: reads-next-target`; state `uncertain`, not `misconception` |
| **GT-03** same wrong model twice | two identical failed entries, then a message | second event with the same `misconception_id`; JEV named-misconception check | a Socratic question anchored on the c11 table; never the same explanation again | unit: two settled events give `misconception`; router picks Socrates; `enforce` keeps one `ask_question` |
| **GT-04** "Don't simplify… show me the implementation" | Overview block; `depth-attention-deep` module with `partIds` `shapes, causal-mask, memory, scaling` | planner reports constraints and `explicit_request`; `show_authored_card` navigate; `cites` | the Deep card appears or is focused at part `shapes`; the reply cites its sources | unit: a navigate with `explicit_request` is executed, the same action without it becomes a chip. e2e: Deep card focused, pager at index 0 |
| **GT-06** softmax prerequisite gap | Guided block; `softmax` concept on Guided and c21; no softmax card | JEV gap check (registry prerequisites of the target claims), `prerequisite_gap` derivation, router → `suggest_dive` with the Guided block as origin | a two-sentence reply and the dive suggestion (Go down / Keep here) anchored to the Guided card | unit: gap event → `prerequisite_gap: softmax`; the response is `respond_text` + `suggest_dive` with `origin.block_id`. e2e: **WAITING ON feature/dive-v1** for the suggestion card |
| **GT-07** strong transfer | c11 after GT-03; optional passing third attempt | transfer JEV pass → `understood`; the pass after a failed attempt is `demonstrated_here` | brief acknowledgement; at most one `suggest_depth` (c12 or Deep part `causal-mask`); no more practice | unit: the settled transfer pass supersedes the earlier fails; the router forbids `suggest_practice` |
| **GT-11** pass, weak explain-back | first attempt `self` passed; the explain-back says the mask comes after softmax | JEV checks on `applied-before-softmax`; conflict → `uncertain` | one hint on the card's step ② ("weights: 0 → score −∞ → weight 0") via `focus_part` or text | unit: pass + misconception check → `uncertain`, never `understood` |
| **GT-12** fail, strong explanation | first attempt `before` failed; the explanation is correct | JEV passes on two claims + deterministic fail → `uncertain` | one question: "Does position 99 read itself?" | unit: state `uncertain`, not `misconception`; the response is one `ask_question` |
| **GT-D1** explicit dive into softmax | **WAITING ON feature/dive-v1** (`/dive`, pending hole, Dive record) | the Tutor's opening turn in the hole with `canvas.dive`; evidence keyed by concept, so it is visible in the child | the hole opens; the Tutor answers the pending question there | unit: a turn built inside a hole carries `canvas.dive` and the parent's `softmax` states. e2e after dive-v1 merges. **See B-2** |
| **GT-D2** Tutor suggests the dive | **WAITING ON feature/dive-v1** (`small:dive-suggest`) | `suggest_dive` → event with `blockId`; Keep here → `dive_choice: inline` | nothing is created until Go down is clicked | unit: no navigation without the choice. e2e: Keep here keeps the canvas and the next turn carries `dive_choice` |
| **GT-D3** return from the child | **WAITING ON feature/dive-v1** (`climb`, return point) | `returned_from` on the first parent turn; one `ask_question` on the blocked claim; no auto-upgrade | parent restored at the origin card; the Tutor asks one question | unit: `returned_from` present once; the parent claim stays `prerequisite_gap` / `uncertain` until a new settled pass arrives |

## 8. Blockers and corrections

- **B-1: RESOLVED (owner, 2026-09-30).**
  - `feature/dive-v1`'s no-selection anchor-card behaviour (`0305395e`) is authoritative.
  - With no card selected, `/dive <topic>` creates a topic/question anchor card on the parent canvas and dives from it.
  - A bare `/dive` uses the conversation when the topic is unambiguous, and otherwise asks.
  - The locked R-10 is corrected to match (locked decisions, "docs(tutor): update dive origin contract"). `pending_dive` is removed from the LearnerTurn.
  - Tutor-created dives use the same primitive: an existing origin card, or a topic anchor and then the dive (`DiveFrom` in locked §4).
- **B-2: /dive implementation bug. Open, handed to Parallel; I have not changed their code.**
  - At `0305395e`, `diveRecord` (`packages/web/src/dive.js`) stores:
    - `origin.card` = `block?.card || card.id`, which is the block uuid, since blocks have no `card` field;
    - `origin.scene_id` = the block uuid;
    - `origin.part_id` and `return_point.part_id` = `block.selectedObject`, a semantic object id;
    - `origin.concepts` = `[]`.
  - The required contract (locked decisions §6.1) keeps these fields separate:

    | Field | Must hold | Must never hold |
    |---|---|---|
    | `origin_block_id` | the canvas block's internal identity (`block.id`) | — |
    | `origin_scene_id` | the runtime `block.scene.id` | the block uuid |
    | `origin_card_id` | the authored `evidence.card`, found by `scene.id` in the card registry | the block uuid; `scene.id` assumed equal to it |
    | `origin_part_id` | the actual `partId` (`partIds[pager value]`), when the card is paged; else `null` | the selected object's `semanticId` |
    | `origin_concept_ids` | `conceptId`s resolved from the selected object, else the shown part or card | `[]` when the card has concepts; words from the topic text |

  - For a topic anchor card or any non-registry block: scene, card and part are `null`, and concepts are `[]` unless its objects carry `conceptId`s. The topic stays in the Dive `title` / `concept`.
  - Recommended fix: `diveRecord` calls the shared `resolveCardTarget(block)` from `card-target.js` (§3). This is the same resolver the Tutor will use, and it depends on neither module, so there is no circular Tutor dependency. It can land on `feature/dive-v1` before the merge, or as its first follow-up.
- **C-1: CORRECTED (factual, in locked §3).**
  - The existing JEV client, `askJev`, and `THRESHOLDS` are reused.
  - The Tutor needs its own question builder and protocol, because the grader's `jevRequest` / `gradeQuestions` send a fixed question set pinned by `GRADER_PROTOCOL_FINGERPRINT`.
  - The larger evaluator's route is `/api/learn/assess`, not `/api/learn/ask`. Its response is prose ("VERDICT: good|partial"), so Tutor v1 adds a structured evaluator instruction and output contract on that grading model task.
  - The ladder, thresholds and timeouts are unchanged.
- **R-1: secrets on the per-session clone.**
  - The planner (Anthropic) and JEV (TypeSafe) keys are wrangler secrets, and secrets do not clone (CLAUDE.md, parallel-dev deploys).
  - Before relying on a clone for a live check, list its secret names with `npx wrangler secret list --name small-cp-dev-<worktree>`, run from `packages/web` so it reads `wrangler.dev.jsonc`.
  - Without them, JEV returns `error` (events stay unsettled) and the planner route fails visibly. The e2e above stubs both routes, so acceptance does not depend on the secrets.
- **R-2: merge overlap, closed by the locked sequencing** at the top of this document: `/dive` first, then the Tutor branch from the integrated baseline.

## 9. Size of the first vertical slice

| Part | New lines (approx.) |
|---|---|
| `card-target.js` (shared) | 80 |
| `learn-tutor-claims.js` (data, 5 concepts × 2–4 claims, 3 practice tasks) | 150 |
| `learn-tutor-evidence.js` | 170 |
| `learn-tutor.js` (builder, card state, router, enforce, actions) | 260 |
| `agents/learn-tutor.js` (prompt, schema, JEV questions, evaluator instruction) | 150 |
| `learn-tutor-routes.js` | 150 |
| Edits to `ask.jsx`, `LearnPage.jsx`, `AdaptiveCanvas.jsx`, `demo-scenes.js`, `dev-worker.js`, `learn-models.js` | 120 |
| Unit tests (web ×4, control-plane ×1) | 450 |
| `e2e/tutor-slice-check.mjs` | 250 |
| **Total** | **≈ 1,800** |

That is about 1,100 lines of product code and 700 of tests: one focused build sprint.
- Non-dive traces (GT-01 to GT-12 above) land first, on the integrated /dive baseline.
- GT-D1 to GT-D3 follow once B-2 is fixed.
