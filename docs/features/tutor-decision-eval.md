# Tutor decision evaluation (offline session simulator)

**Owner:** Tutor Decision Evaluation agent.
**Branch:** `feature/tutor-decision-eval`, worktree `workspace/tutor-decision-eval`, rebased onto the Learning baseline
`08c95bee` (`origin/feature/professor-next-steps`; contract: `docs/features/professor-next-steps.md` at that SHA).
**Local backups:** `backup/tutor-decision-eval-b1023a53`, `backup/tutor-decision-eval-4488ae35` (the four commits before the rebase).

This is an evaluation project only. It does not change Tutor behaviour, has made no model calls and has spent nothing.

## Status

Rebased onto the Learning baseline `08c95bee` with all four evaluator commits, then integrated with the real interfaces
(the post-rebase commit on this branch):
- `product.mjs` runs the real product behind the harness: the LP1 journey route, `runTurn`, the worker's evaluate, plan and
  next-steps routes, the hook controller and input builder, the stopping-point rule, `turnOffers` and the TutorDecisionTrace
  builders, all imported (§8).
- Free tests stub only the provider boundary: `globalThis.fetch` answers Anthropic and JEV from a script and refuses every
  other host (§16).
- A1-A12 are reconciled (§9); creator analytics and the 10-learner cohort rule are validated offline (§17).
- No paid run: the proposed real-model evaluation and the phrasing comparison wait for the owner's review (§18).

**Implemented, not deployed.** Everything the eval reads at this baseline is implemented on the Learning feature branch,
not on main and not deployed. The TutorDecisionTrace has no production sink (contract §3.3: v1 registers only a harness
sink; persistence is a separate, owner-approved migration), so no event from a real learner exists anywhere yet.
Passing on this feature baseline does not certify the later integrated tree: the gates run again on Parallel's integrated
SHA (§19).

## 1. The production path the simulator calls (audit of main f4b99a3b, updated for 08c95bee in §8)

One learner turn in the product runs through `packages/web/src/learn-tutor.js` `runTurn` (line 323):

1. **Deterministic rung.** `practiceEvents` turns new card attempts into evidence events.
2. **Evaluation.** `POST /api/learn/tutor/evaluate`, routed by `tutorRoute` in `control-plane/src/learn-tutor-routes.js`:
   - **nanoGPT domain.** `validateEvaluateBody` → `evaluateFreeText`:
     - JEV first (`jevRung`; Typesafe AI, `jev-1.13.0` direct or `typesafe-ai/jev` through the gateway);
     - then the escalation policy;
     - then the larger evaluator (`claude-opus-5-5`, `LEARN_TASKS.tutor_evaluator`).
   - **Journey domain (LP1).** `journeyEvaluate` stores the evidence server-side in `LEARN_DB`.
3. **Router and planner.**
   - `route` → `plannerContext`.
   - `POST /api/learn/tutor/plan` runs `planTurn`. Defaults (`PLANNER_DEFAULTS`):
     - a fast tier (`claude-sonnet-5-5`, effort low) on routine rows;
     - `claude-opus-5-5` for everything else and for escalations;
     - prompt cache on.
4. **Enforcement.** `validateActions` (`learn-tutor-validate.js`) produces the validated actions.

How the harness calls it without a copy: `packages/web/e2e/tutor-corpus-run.mjs` already runs the real `runTurn` in
Node.
- Its `post` is routed straight to the worker's own `validateEvaluateBody` / `evaluateFreeText` / `planTurn`.
- There is no HTTP, no second planner and no second prompt.
- The eval's Tutor adapter uses the same pattern.

**Gaps on main that the Learning checkpoint is expected to fill.**
- The planner's output is a `strategy` plus actions from `ACTION_TYPES` (`agents/learn-tutor.js:130`) and `suggest_avatar_clip`.
- It has no modality, reason codes, expected evidence or estimated learning time.
- There are no Professor Next Steps hooks.

All of these are filled at the Learning baseline `08c95bee`: action contracts with modality and `cost_tier`, generic
reason codes, expected evidence, estimated learning seconds, HookSets and the TutorDecisionTrace (contract §1-§3).
§8 maps what the harness now calls.

## 2. Owner decisions (2026-10-06)

### O1. Real LP1 journey state, one throwaway database per session

Logistic regression runs through the real LP1 journey and Tutor path; there is no eval-only domain. Each simulated
learner gets its own isolated:
- `user_id`, `journey_id` and canvas/board;
- evidence;
- Tutor session state.

`freshLearnDb()` builds that database:
- It is the LP1 tests' own in-memory `node:sqlite` `LEARN_DB`, built from `repository-schema.sql` by `control-plane/test/learn-grade-fixture.js` `learnDb`. It is reused, not copied.
- Each session gets one and closes it at the end.
- A test proves two sessions share no rows, the LP1 tables exist, and a closed database is gone.

The simulator profiles stay hidden in the learner simulator. The three sessions never share evidence.

### O2. JEV cost

The $4.00 ceiling covers Anthropic model spend only; it is enforced as a conservative reservation guard, not a guaranteed billing cap (§18). JEV goes to `ledger.recordExternal` and is reported apart
from it. Each call records:
- calls, latency and ok/failed;
- provider, model and version;
- billing metadata only when the provider returns it.

The cost rules:
- **No reported cost:** `cost_usd: null`, `cost_status: "unknown"`. The ledger never invents a price.
- **Some calls reported:** `cost_status: "partial"`, with the reported part shown separately.

Today:
- The gateway transport returns `provider_metadata.gateway.cost`, which `askJev` / `readJevMeta` read.
- The Tutor's `jevRung` keeps only `body`.
- `TYPESAFE_API_KEY` selects the direct transport first.

The adapter can therefore record a cost only by wrapping the real `askJev` through the existing `deps.ask` hook, and
only when the provider reports one. Any authoritative or configured JEV price found before the live run is reported to
the owner before spending.

### O3. Hook backend time is not learner waiting

The timeline records background work that overlaps learner activity.

- **Passive material.** Hooks may start as soon as the material is ready, while the learner reads.
  - If they are ready before the learner finishes, the perceived wait is 0.
- **Active exercise.** The state is stable only once the answer is evaluated and committed.
  - The remaining evaluation and generation time is blocking.

When a hook set starts is the product's recompute policy, so it is injected as `hookStart({ decision, decided })`.

Reconciled with the contract (§2.3, §1.2). The product requests hooks only at a stopping point, 1200 ms (`debounce_ms`)
after a finished turn changed the basis, while the learner reads. It never waits for evidence first: a Tutor question
waiting for an answer is not a stopping point, and the learner's answer is itself a turn whose end recomputes the hooks.
- The real adapter's `hookStart` is the product's `stoppingPoint`: `with_material` (after `HOOK_DEBOUNCE_MS`) or `none`.
- The fake world keeps a blocking policy, renamed `after_consumption` (hooks once the learner is done), so blocking waits
  stay testable. `after_evidence` is gone: no product path waits for evidence before hooks.

Per step:
- `hook_backend_generation_ms` and `hook_perceived_wait_ms`;
- `hook_background_overlap_ms`, `state_wait_before_options_ms`, `options_blocking_ms`;
- `hook_state_changed_after_start`: a background set was generated before the learner's answer changed the evidence.

Per session:
- `total_backend_generation_seconds`: hooks, decisions, measured material, evaluation and measured assets;
- `total_learner_blocking_wait_seconds`;
- `blocking_wait_seconds_by_source`.

## 3. What is built

All files are in `tests/evals/tutor-session/`. Everything is generic and tested on synthetic fixtures.

| File | What it holds |
|---|---|
| `events.mjs` | The event stream, its validation, the fold into one record per decision (with its provider calls and materials), timing (backend vs perceived), grouping, and the shared helpers. |
| `cost.mjs` + `pricing.json` (+ `reading-estimate.json`) | Versioned prices (and the versioned reading-time estimate), one priced cost line per provider call, and cost metrics with attribution (§12). |
| `materials.mjs` | Material / card records, the five durations, per-type telemetry and content shape (subcards) (§13). |
| `graph.mjs` | The learning graph, topology, Rabbit Holes and Next Steps as candidate edges (§14). |
| `harness.mjs` | Fixtures, the hidden-profile guard, the session loop on the session timeline (with a cost meter per stage), learner and reviewer views, prompts, reply schemas and strict parsers, the cost ledger, and `freshLearnDb`. Every product dependency is injected. |
| `metrics.mjs` | Every metric as a pure function over segments (lists of folded steps). One implementation serves a session, canvas, board, user×canvas, journey, section, source resource, planner version and the global aggregate. Also `aggregate.json`, the terminal table and the steps CSV. |
| `run.mjs` | Free CLI. `aggregate <dir>` writes `aggregate.json`, `steps.csv` and the table; `events <file.jsonl>` prints grouped metrics for any event stream. |
| `product.mjs` | The real product behind the injected interface (§8) and the provider boundary (§16). It only wires and renames: no Tutor logic. |
| `creator.mjs` | Creator analytics with the 10-learner cohort rule at every level (§17). |
| `fixtures/` | Topic fixtures (`logistic-regression`, `photosynthesis`), simulator-only profiles, `taxonomy.json` (the eval's labels over the product's modality names, its reason-code checks, relations, review thresholds) and `cost-roles.json` (product roles; the material roles still provisional). |
| `tutor-session.test.mjs` | 35 tests on the scripted fake world (the generic harness, metrics, cost, materials, graph). |
| `product.test.mjs` | 12 tests on the real product path: the end-to-end path, provider isolation, tracing on/off (seeded, and under the product's normal randomness), the production validators, the stopping point, no copied logic, taxonomy names, mapping, the Next Steps report (escalation reasons and validator rule names from the product's own hook traces), the paid transport offline (a fake fetch: Anthropic and JEV pass-through, other hosts refused, the eval's calls around the boundary), every typed turn's evaluation recorded without text. |
| `budget.test.mjs` | 8 tests: complete-request worst cases, reservations, the ceiling's scope, the simulator and reviewer requests, a mid-session refusal on an active journey, every product request reserved, the reviewer's holdback (a ceiling-stopped session still reviewed), a review that outgrows its holdback refused unsent. |
| `creator.test.mjs` | 7 tests: suppression, the cohort at every cut, no double counting, no learner identity, the public profile, impressions from the product's events. |

All 62 run in `make test-unit`. They are scripted: they establish the plumbing, routing, validation and evidence rules, never real-model teaching quality (every bundle carries `coverage`, §19).

There is no topic or profile branch in the code, and a test enforces it:
- No harness source names a topic id, a topic title word or a profile id.
- Renamed, reordered profiles and a new topic written at test time run unchanged.
- The learner prompt builds its forbidden-label list from the profile data.

## 4. Event model (production-telemetry shaped)

The session's source of truth is append-only events. The session file bundles the events, plus the folded steps for
reading. `aggregate.json` is always recomputed from the events.

**Two streams, kept apart.** The product emits only the three TutorDecisionTrace events (contract §3: `tutor_decision`,
`next_steps_computed`, `next_steps_shown`, `trace_schema_version: 1`). The eval's stream carries each one verbatim as
`trace` on the event that records it (`tutor_action_ready`, `next_steps_ready`, `next_steps_shown`); `validateEvent`
checks its version and exact top-level keys. Everything else in the stream is eval-only: the learner simulation, the
materials, the learning graph, the cost lines and the publication events.

**Envelope (every event):**
- `eval_schema_version` (`tutor-session-eval-1`, the eval's own stream), `event_id`, `seq`, `type`, `t_ms`;
- `session_id`, `user_id`, `canvas_id`;
- when known: `board_id`, `canvas_version`, `journey_id`, `section_id`, `dive_id`, `source_resource_id`.

**Identity:**
- Ids are internal. An id that looks like an email is refused, as is any key containing "email".
- Synthetic ids are opaque hashes, so a profile name cannot reach the product inside an id.

**Types:**
- Session: `session_started`, `session_ended {reason}`.
- Canvas: `canvas_context_changed`.
- Hooks: `next_steps_generation_started {hook_set_id}`, `next_steps_ready {hook_set_id, options, trace?}`, `next_steps_shown {hook_set_id, trace?}` (the impression), `next_step_selected {hook_set_id, option_id, position}`.
- Learner:
  - `learner_consumption_started/finished {decision_id, timing_source}`: `estimated` when the reading time is the Tutor's estimate, `measured` for real users.
  - `learner_message {kind, input, decision_id?}`: the `decision_id` is present when it answers that decision's material.
- Evidence: `evidence_updated {claims, cause}`.
- Decision: `tutor_decision_started {decision_id, trigger: opening|hook|typed}`, `tutor_action_ready {decision_id, decision, estimated_learning_seconds, available_modalities, planner, planner_version}`.
- Material:
  - `material_generation_started`, `material_first_ready`;
  - `material_complete {material_id, timing_source, cache_status, cache_origin, asset_applicable, durations?, material_type, modality, concept_ids, claim_ids, expected_evidence, descriptors, structure, fresh_generation_cost_usd?}`;
  - `material_failed`, `provider_asset_generated` (t9);
  - learner side: `material_visibility {visible}`, `material_interaction {interaction, meaningful, control_id?, result?, active_ms?, position_seconds?, played_seconds?}`, `material_completed`, `material_abandoned`.
- Cost: `model_call_started`, `model_call_completed`, `model_call_failed` (§12).
- Graph: `material_node_created`, `material_link_created`, `material_link_removed`, `rabbit_hole_opened`, `rabbit_hole_returned` (§14).
- EVAL-ONLY publication events (§17; the product has none): `publication_opened {publication: {org, canvas, creator_id}, source_access_mode}`, `canvas_forked {publication}`.

**Concurrency:**
- Events are appended in the order they are written but are not serial. Background hook generation is appended with its own earlier `t_ms`.
- The fold orders by `(t_ms, seq)`, so real-user events arriving in any order fold the same.

**Privacy:**
- Analytics need ids and structured fields only.
- Learner words and material text exist only under `debug`: on for synthetic learners, off in the production shape (`debugText: false`).
- `validateEvent` refuses, at any depth:
  - credential-like keys (`token`, `api_key`, `secret`, `password`, `authorization`, `cookie`);
  - hidden reasoning (`thinking`, `chain_of_thought`);
  - email fields;
  - learner text outside `debug`.
- Usage token counts are exempt.

**Fold:**
- `foldSessions(events)` works on any number of sessions in any arrival order.
- It produces one record per decision:
  - the evidence before and after, the hook set shown, the pick, and whether a typed request overrode the hooks;
  - the decision, the estimated learning seconds and the available modalities;
  - the learner response kind, the timeline, the derived timing and the waits.
- A decision that never produced a validated action, for example after a cost stop, is listed in `meta.incomplete_decisions`.

## 5. Timing

**Timeline:**
- `t0_state_ready`, `t1_hooks_start`, `t2_hooks_ready`, `t3_hook_selected`, `t4_tutor_plan_start`, `t5_tutor_action_ready`;
- `t6_material_generation_start`, `t7_first_material_ready`, `t8_material_complete`;
- `t9_asset_ready`, only when an asset applies and was really produced;
- plus `t_learner_ready` (the learner finished the previous material or sent the message) and `t_prev_consumption_started`.

**Derived per step:**
- the hook fields above;
- `hook_to_tutor_start_ms`, `tutor_decision_ms`;
- `material_first_ready_ms`, `material_complete_ms`;
- `decision_to_first/complete_material_ms`, `click_to_first/complete_material_ms`;
- `asset_generation_ms`, `click_to_asset_ready_ms`;
- `evaluation_ms`, `backend_generation_ms`.

**Sources:**
- Every duration has a source: `measured`, `cached` (a recorded earlier measurement), `estimated` or `not_run`.
- `sources` gives it per phase; `timing_source` is the material phase's source.
- Cached or estimated material carries durations, never timestamps. `not_run` leaves them null.
- A latency built on an estimated part is itself estimated. For example, a perceived hook wait that depends on simulated reading time is `estimated`.
- Statistics are per source and never pooled. `not_run` is only counted.
- Each step also records `cache_status` (`miss`, `hit`, `partial`, `not_applicable`) and `cache_origin` (`fresh`, `product_cache`, `canonical_asset`, `session_asset`).

**One learner move per decision (the product's rule, contract §1.4).** After a Tutor turn the learner reads or attempts its
material, then either clicks a hook shown (the next turn is a `next_step` turn: no words, no evidence) or types (the next
turn is a typed turn, whose words are evaluated before they are planned). Never both: a click is never evidence and never
a faked message. The provisional loop sent a typed reply and a click in one step; the contract forbids that.
- The simulator moves once it is done and has seen the options it is given, so a typed reply after visible options
  overrides them, and waiting for them is a wait (`t_learner_ready` is when it finished reading; `t_learner_message` when
  it sent its words; the after-click wait of a typed turn runs from the message).
- A typed turn's evaluation is part of that turn: blocking evaluation ends before the plan starts (t4), so the decision
  was made on it; evaluation off the critical path lands during the turn.

**The simulator's session timeline:**
- Backend calls advance it by their measured duration.
- The learner's reading or attempt advances it by the Tutor's estimated learning time.
- The learner simulator's own latency never enters it.
- A selection is instant once the options are visible and the learner is done.

**Waits** (each one an entry in the histogram):
- **before_options:** learner ready → options visible.
- **after_click:** click, or learner ready → first material. When material was not run, it runs to the validated action instead and is flagged as a lower bound.

**Session latency:**
- mean / p50 / p95 per source for the decision, hook backend, hook perceived wait, options blocking, evaluation, and first and complete material;
- the same by modality, by action type and by cache status;
- total backend generation vs total learner blocking wait;
- `learner_wait_fraction` = blocking / (blocking + estimated learning);
- the longest wait;
- buckets: <2 s, 2-5, 5-10, 10-30, 30-60, >60;
- `time_to_first_active_learning`, with its measured-wait and estimated-learning parts kept apart.

Motion, Avatar and video stay `not_run` in the first experiment unless separately approved. A measured t9 plugs in
without a schema change.

## 6. Metrics

- **Modality:**
  - counts and percentages, distinct, switch rate, same-modality repetition, repeated within the previous 3;
  - the maximum run with its step range, the most-common percentage, active/passive;
  - modality chosen per evidence state of the targets;
  - evidence outcome per modality (improved, regressed, unchanged).
  - Normalized entropy divides by log(K), where K is the modalities available in those steps. An unavailable Avatar or Motion is never a diversity failure.
- **Repetition:**
  - longest identical card-type run, explanation-only and quiz-only sequences;
  - near-duplicate activities, labelled `duplicate_method`: a heuristic (same `material_signature`, else token Jaccard of summaries), structural or lexical, never semantic;
  - longest passive run and longest high-effort run.
  - Flagged sequences carry `justified: null` until the reviewer decides.
- **Hooks:**
  - distinctness, repeated from the previous set, repeated `learning_goal`, generic commands, curiosity questions, answer-revealing hooks;
  - selection rate, position bias, overrides by a typed request;
  - stale-set rate, sets unchanged after an evidence change, sets generated before the evidence changed, hooks repeatedly ignored.
  - Distinctness and the hook flags are lexical heuristics, labelled `distinctness_method` / `flags_method`, never semantic. The reviewer scores quality.
- **Reason codes:** deterministic checks.
  - `repair_misconception` needs a misconception on a target.
  - `fill_prerequisite_gap` needs a gap on, or for, a target.
  - `vary_modality` needs a repeated modality in the previous three.
  - `advance_goal` needs an unfinished target.
  - Unknown codes are listed as unchecked. The code-to-rule map is data.
- **Evidence:**
  - concepts encountered, claims tested, transitions (by type and by claim);
  - misconception and prerequisite repair latency, plus the unresolved ones;
  - time on already-understood targets, the progression/remediation ratio;
  - claims not observed at the end, and decisions unchanged after the evidence changed.
- **Engagement:** meaningful learner actions, learning time before the first active step, the gaps between active steps, and active-opportunity candidates.
- **Completion:** end reasons and the drop-off point.
- **Variety with purpose:** `fit * (diversity + (1 - diversity) * justified_rate)`, where `fit` is the reviewer's `modality_appropriateness` on 0-1.

`aggregateEvents(events)` folds the events into sessions and returns `global`, `completion`, and
`groups.{session, canvas, board, user_canvas, user, journey, section, source_resource, planner}`. The same
`groupMetrics` runs at every level. `aggregate(bundles)` produces the eval's `aggregate.json` per simulated profile.

## 7. The simulated learner and the reviewer

**Learner simulator** (`claude-sonnet-5-5`, effort `low`, `max_tokens` 1500 so its default thinking leaves room for the
JSON; `modelLearner` through `evalCall`: scripted in the free suite, `anthropicTransport` on the paid run):
- **Sees:** its hidden profile, the topic goal, the material summary, the hook texts and its own past exchange.
- **Never sees:** reasons, rationale, expected evidence, evidence state, hidden goals or answers.
- **Reply format:** `LEARNER_REPLY_SCHEMA` is used as `output_config.format`: one move, an offered option id (a click) or
  null with typed words. Nullable fields use `anyOf` with `null`, a documented structured-output form.
- **Reply checks:** `parseLearnerReply` re-checks every reply. It refuses an option that wasn't offered and any profile label.

**Session reviewer** (`claude-opus-5-5`, one call per session, default effort, `max_tokens` 8000 for thinking plus the
JSON; runSession's `reviewer` through `evalCall`: scripted in the free suite, `anthropicTransport` on the paid run; its
budget is held from the session's start, §18):
- **Sees:** the folded trace, without the profile and without hidden reasoning (`reviewerView`).
- **Reply format:** `REVIEW_SCHEMA`.
- **Reply checks:** `parseReview` requires ten scores from 1 to 5, findings that cite recorded steps, and a judgement for each flagged sequence.

**Hidden profile:** `assertNoProfileLeak` checks every learner-originated payload and the adapter's reported planner
input. A hit ends the session (`profile_leak`).

## 8. Interfaces consumed (the real product at 08c95bee)

`product.mjs` `productWorld({ topic, ids, boundary })` gives the harness its injected functions. Each one runs production
code. The adapter only wires the browser half to the worker half in one Node process, as `e2e/tutor-corpus-run.mjs` and
`e2e/next-steps-check.mjs` do, and renames fields.

| Injected | Production code it runs |
|---|---|
| `tutor.start` | `journeyRoute` (`control-plane/src/learn-journey.js`). It sends `start` with the topic's opening message, then the setup steps the learner skips (intake and diagnostic, so no level ever reaches the Tutor), then `accept` of the drafted path. The LP1 planners run (`journey_diagnostic`, `journey_path`, `journey_section`), all in the session's own LEARN_DB (O1). |
| `tutor.decide` | `runTurn` (`web/src/learn-tutor.js`) over `tutorContext` (`learn-tutor-domains.js`, the journey domain). It takes `turnOffers` from `LearnTutor.jsx` (bundled with esbuild, as next-steps-check does) and `trace: { identity, blocks, next_step_options }`. Its `post` goes to the worker's `tutorRoute`: `/evaluate` runs `journeyEvaluate`, then `evaluateFreeText`, then the real `askJev`, with the larger evaluator on escalation; `/plan` runs `planTurn` (the fast tier and Opus, `plannerRequest`, the validator). A hook click is the `nextStep` from the controller's `select()`. |
| `hooks` | `nextStepsController` with `nextStepsBasis` and `nextStepsInput` (`web/src/learn-next-steps.js`): one request per basis, the no-repeat memory and the `select()` goal memory. It posts to `tutorRoute` `/next-steps`, which runs `ownedNextSteps`, then `planNextSteps` (its validator and escalation), then `mintSet`. `hooksEvent` and `shownEvent` (`learn-tutor-trace.js`) build the two hook events. |
| `hookStart` | `stoppingPoint` (contract §1.2) after each turn. When it is a stopping point, the set is requested `HOOK_DEBOUNCE_MS` (the product's `debounce_ms`, 1200) into the learner's reading. |
| `materialize` | The turn's `create_material` contracts (the product's materials; several per turn are allowed). Generation is not wired yet: each is `not_run` (§19). |
| evidence snapshot | `deriveClaimStates` over the Tutor store (journey events adopted from the server), as the page derives it. |
| decision fields | The `tutor_decision` event itself, carried verbatim. `decisionOf` renames its fields (§9 A2). |
| available modalities | `modalityOf` over every action the route allowed, every material offered and every card the domain shows. |
| cost lines | One per provider request at the boundary. The role is read from the request (`roleOf`: the one tool the product sends, and its model to tell the routine hook role from the escalation role). |
| taxonomy | `REASON_CODES`, the product's modality names (§3.2) and `actionContract`'s expected evidence (checked by test). |

The adapter repeats only this page glue:
- the `lastTurn` object `LearnTutor.jsx` keeps for the hook input (`setLastTurn`: turn id, intent kind, the question words, transitions);
- the journey view `{ journey, path, start }`;
- the canvas session id from `newSessionId`.

## 9. Assumptions A1-A12, reconciled at 08c95bee

Every row marked "confirmed" or "mapped" is confirmed by the implementation at `08c95bee`, which is a feature branch. None
of it is on main or deployed, and no production sink collects these events (see Status).

| # | Assumption | Now | Classification |
|---|---|---|---|
| A1 | `next_steps_ready.options` items are `{ id, position, text, learning_goal }`; the learner view drops `learning_goal`. | The HookSet option `{ id, hook, selected_next_step }` goes through `optionOf`: `id`; `position` (screen order 1-3, as the trace's `next_step_options`); `text` = `hook`, verbatim; `set_id`; and `learning_goal`, `concept_ids`, `claim_ids` from `selected_next_step`. The learner sees `id`, `position` and `text` only (contract §1.6 confirms: never `learning_goal`). | Renamed / mapped to production fields |
| A2 | `tutor_action_ready.decision` is `{ action_type, modality, card_type, reason_codes, rationale_summary, target_concepts, expected_evidence }`. | The `tutor_decision` event is carried as `trace`. `decisionOf` renames: `chosen_action` (`action_type`, `command`, `capability`, `modality`, `cost_tier`, target ids); `actions`; `reason_codes`; `reason_source`; `rationale_summary`; `expected_evidence` (`[{ claim_id, via }]`); the route row; and the intent fields. `card_type` has no product field: a card's modality is its block type (§3.2), so `card_type` is that modality on a card action. | Renamed / mapped; `card_type` removed as a separate field |
| A3 | Reason codes and modality list are the owner's examples. | Now `REASON_CODES` (13 generic codes) and the product's modality names. `taxonomy.json` keeps only the eval's own labels over those names and its evidence checks for four codes. Active/passive is checked against `actionContract`; effort, family and expensive are the eval's labels. A test keeps every key a product code. | Removed (replaced by production) |
| A4 | `hookStart` defaults to `after_evidence`. | The product's policy (O3): a stopping point after a finished turn, a 1200 ms debounce, one request per basis, and never while a Tutor question waits. | Replaced by production (`stoppingPoint`, `nextStepsController`) |
| A5 | The first decision has no hooks; the opening message leads. | The opening is the first typed turn. Hooks need a finished turn (a basis) and a stopping point. | Confirmed by production |
| A6 | `evidence_updated` carries a full claim-state snapshot. | The trace carries only the turn's claims (`evidence_summary`) and its `evidence_transitions`. The eval derives the snapshot with the product's own `deriveClaimStates` over the Tutor store; it never computes one itself. | Safely derivable (eval event built from a production function) |
| A7 | `trace_schema_version` becomes the Learning agent's version. | Each carried event keeps the product's `trace_schema_version: 1` (checked). The eval's own stream is renamed `eval_schema_version: tutor-session-eval-1`. | Renamed / mapped |
| A8 | Cost roles: `next_steps`, `material_*`, `provider_asset`, `render_compute` are placeholders. | `tutor`, `tutor_evaluator`, `tutor_next_steps`, `tutor_next_steps_escalation`, `journey_*` (LEARN_TASKS) and `jev` are read from each request. `material_generation`, `material_repair`, `material_review`, `provider_asset` and `render_compute` stay placeholders: the artifact route and the Motion/Avatar stages are not exercised. | Partly confirmed; the material roles are still provisional |
| A9 | Link relations reuse card-plan `RELATIONSHIPS`, the depth-card links and the owner's list; a hook selection is `next_step_selection`. | The product emits no node or link events and has no link vocabulary. `next_step_selection` is the eval's edge, built from `selected_next_step_id`. | Still provisional: no production link telemetry |
| A10 | Cardinality is not fixed: decision -> materials[] -> subcards[]. | Contract §2.5 allows several `create_material` actions per turn (distinct commands, within the 3-action cap), so a decision's materials are its `create_material` contracts. No product payload is mapped for subcards. | Confirmed for materials; subcards still provisional |
| A11 | Material descriptors and subcard field names follow the owner's lists. | The artifact payloads are not mapped, and generation is not run. | Still provisional |
| A12 | `rabbit_hole_opened.opened_by` maps from the Dive record's `created_by`. | The values are the product's: `tutor_confirmed`, `learner_slash`, `learner_ctrl_k`, `learner_dblclick` (`Dive.jsx`) and `shared_start` (`learn-boards.js`). The category mapping is the eval's. Holes are not exercised in the free path. | Values confirmed; the mapping is the eval's; not exercised |

**Still provisional:**
- A8 (material roles);
- A9 (links);
- A10 (subcards);
- A11 (material payloads);
- the A12 mapping.

They wait for the material generator to be wired (§19) and for product link telemetry.

## 10. Cost and models

See §12. The ceiling applies to Anthropic spend only, with the learner simulator and reviewer included, since they are API spend. JEV and other providers are logged apart (O2).

## 11. Commands

```bash
node --test "tests/evals/tutor-session/*.test.mjs"      # free, from the repository root; part of make test-unit
node tests/evals/tutor-session/run.mjs aggregate <dir>  # session files -> aggregate.json, steps.csv, table
node tests/evals/tutor-session/run.mjs events <jsonl>   # any event stream -> grouped metrics
node tests/evals/tutor-session/run.mjs paid <dir> <env file> <topic>   # PAID (owner-approved run A, §18), then aggregate
```

The free suite installs only the stub provider boundary (§16). `paid` swaps it for `realAnswers`: the product's own
Anthropic and JEV requests go to the real providers unchanged, still reserved (Anthropic) and metered (both) at the
boundary; every other host stays refused. Only `ANTHROPIC_API_KEY`, `TYPESAFE_API_KEY` and `VERCEL_TYPESAFE_API_KEY` are
read from the env file (names printed, values never), and the product picks its own JEV transport. Without a JEV key the
product sends no JEV request and typed answers are never evaluated; `coverage` records which. `aggregate.json` carries `next_steps` (`nextStepsReport`): sets requested and shown, unavailable reasons,
the escalation rate over sets that called a planner (a set whose escalation also failed has no trace but still counts),
escalation reasons, the first reply's validator rule names, set latency and cost per planner role. It also carries
`evidence` (`evidenceReport`): every typed turn's evaluation as the product returned it, without text (`evaluationOf`, on
the `evidence_updated` event): status, the rung, the escalation policy's reason, the kinds of check it was unsure about,
event results and kinds settled or not, and the router row each decision took.

## 12. Cost / API usage

**One cost line per provider call** (`model_call_completed` / `model_call_failed`). It carries:
- `call_id`, `provider`, `model_id`, `model_role` (a product task name), and the attribution (`decision_id`, `hook_set_id` or `material_id`) plus the envelope ids;
- `usage` (input, output, cache read and cache write tokens, and thinking tokens when a provider exposes them);
- `provider_reported_cost_usd`, `computed_cost_usd`, `cost_usd`, `cost_status` (`provider_reported`, `computed`, `partial` or `unknown`);
- `pricing_version`, `pricing_effective_date`, `prompt_cache_saved_usd`;
- `latency_ms`, `retry_number`, `escalation`, `fallback`, `output_accepted` and a `request_id` when safe.

**Pricing.**
- `pricing.json` is versioned. A cost is computed with the version in force on the call's date, so historical costs never change.
- A model with no price has no computed cost.
- Thinking is billed inside output tokens and is never added twice.

**Attribution: each call counts once.**
- A hook set's calls belong to the decision that consumed it.
- A material's calls belong to its decision.
- Calls with no decision (journey creation) are session-level.
- `decision_shared_cost_usd` covers planning, hooks and evidence. It is shared by the decision and is never part of a material's direct cost.
- `decision_material_cost_usd` covers the decision's materials. `decision_total_cost_usd` is their sum.
- A material's cost:
  - **direct:** `direct_material_cost_usd`, split into generation, review, downstream provider and compute;
  - **shared:** the decision's `decision_shared_cost_usd`, plus a labelled `allocated_shared_cost_usd` with `allocation_method: "equal_split"`;
  - **attributed:** `material_attributed_total_cost_usd` = direct + allocated, which answers "roughly what did this card cost?";
  - wasted cost, fresh vs actual cost, and the estimated saving on a cache hit.
- Session, canvas, user×canvas and global totals always sum cost lines, never allocations, so shared cost is never counted twice.
- Across one decision's materials, the attributed totals add up to the decision's total.

**Failures count.**
- A failed call, a rejected draft (`output_accepted: false`) and the calls of a failed material are all wasted, and they still count in `attempted_cost_usd`.
- Example: an invalid $0.45 draft plus a $0.28 repair gives a $0.73 material.

**Unknown is never $0.**
- A group whose calls all have unknown cost has `usd: null`, with `unknown_cost_calls` and `lower_bound: true`.
- JEV stays `unknown` unless the provider reports a cost.

**Metrics** (every grouping level):
- the total and its split: model, evaluator, material generation, downstream provider, compute;
- by category, model (calls, tokens, escalations, materials influenced, cost per material), role, provider, session, canvas, user×canvas, journey, section, action type, modality and material type (count, successful, mean/p50/p95 per material, cost per successful material);
- cost per decision, plus per material, per successful and per completed material (these use the attributed totals, labelled `per_material_allocation_method: equal_split`, beside `mean_direct_cost_per_material`);
- cost per learning minute and per active-learning minute;
- attempted, wasted and successful spend;
- material and prompt-cache savings;
- the highest-cost decision and material;
- descriptive (never causal): cost per evidence improvement, per misconception repaired and per active-learning event.

The learner simulator and reviewer calls are `eval_only`. They are reported apart and never counted as product cost.

The ledger never infers a remaining account balance. A provider balance API, if one ever exists, would be stored as separate billing telemetry.

## 13. Materials, cards and content shape

**Records.**
- One record per logical material (`material_id`). Subcards are its structure, never extra materials or decisions.
- Each record holds: ids (user, canvas, session, decision, journey, section, concepts, claims), `material_type`, `modality`, status (generated / failed), cache status and cost.

**Five durations, never interchanged:**
- **authored:** media `content_duration_seconds` (source `authored`), else the card's reading estimate, else the Tutor's estimate (source `estimated`), with its basis;
- **generation:** with its own source;
- **dwell:** visible intervals;
- **active:** only from client-reported `active_ms`; never guessed, so `null` in the simulator;
- **completion:** first visible → completed.

**Learner signals.** These come from generic `material_interaction` kinds. One record shape covers every type:
- attempts, correctness, hints and retries;
- runs and successes;
- edits;
- playback (a 15 s video watched twice stays 15 s long, with 27 s played; replays, pauses, seeks, `watched_to_end`);
- flips and known/missed;
- ask-about-this;
- voice paused/resumed;
- meaningful vs raw state changes.
- Visibility is exposure, never "read": only an attempt completes a material.
- Simulator learner signals are tagged `estimated`.

**Derived** (descriptive proxies, never causal):
- engagement ratio, completion ratio, cost per engaged minute;
- `generation_time_to_content_time_ratio` (420 s to make a 15 s video = 28x);
- learning value per second and per dollar (value = claims improved).

**Per-type summaries** are generic, so a new type needs no code:
- stats of every numeric field and a rate for every boolean, by modality and by material type.

**Content shape.**
- Subcards carry counts and hashes only, never text. `describeText` and `contentHash` run on the producer side.
- Reading time is an estimate.
  - `reading-estimate.json` holds the rate: `words_per_minute: 230`, `estimate_version: reading-v1`, `source: evaluation_default`. It is configurable and versioned.
  - Every subcard records the `reading_estimate` it used, and each material lists its `reading_estimate_versions`.
  - It is not learner truth or production behaviour. Measured dwell and engagement supersede it wherever they exist.
- Per material:
  - subcard count, ids, sequence and split reason (`unknown` unless the product states it);
  - character, word and sentence totals and per-subcard mean/median/max/min;
  - explanation subcards, longest text-only and text-heavy runs, modality transitions;
  - subcards and reading load before the first active element.
- Aggregate:
  - card-size distributions per subcard type (stats of every numeric field plus a character histogram);
  - average subcards and explanation subcards per decision;
  - characters per learning minute and per engaged minute;
  - reading seconds per active interaction, text-to-interaction ratio;
  - reading load before the first active element per session.
- Review flags carry `justified: null`:
  - a very long explanation card;
  - an explanation subcard run;
  - excessive fragmentation;
  - repeated content;
  - a high reading load before anything active.

## 14. Learning graph and topology

**Nodes and edges.**
- One node per logical material.
- Edges are explicit events (`relation_type`, `created_by` tutor / learner / system, `reason_codes`, a concise `rationale_summary`), never inferred from canvas positions.
- `learningGraph(events, { until })` rebuilds the graph at any point of a session, and the session bundle includes its `learning_graph` snapshot.

**Next steps.**
- Offered hooks are candidate options, never nodes.
- A selection becomes a committed `next_step_selection` edge from the previous node to the node the Tutor then created (`selection_to_material_node_id`).
- A selection whose decision produced no material commits to nothing.

**Topology.**
- Counts: nodes, edges, roots, leaves; depth (max, mean, median) and breadth by depth.
- Branching: mean branching factor, branch nodes and rate, longest linear run, main-path length.
- Connectivity: orphans, components, cross-links, `linear_edge_ratio`, `breadth_depth_ratio`.
- Descriptive shape: linear, mostly_linear, branching or highly_branching.
- Edges by relation and by creator, and branching by creator (Tutor vs learner).
- Position share: main path, side branch, Rabbit Hole.
- Cards before the first branch and before the first learner choice.
- Modality by depth, and evidence outcome by position.
- Topology grouped by material type, modality, reason code, concept, section and planner version.

**Rabbit Holes.**
- Recorded: count, per session, per decision, depth (as recorded, else nesting), nodes per hole, opened_by, return and unfinished rates, time in holes, learning share in holes, and evidence transitions in holes.
- `time_spent_method` and `return_method` mark the time and return figures as heuristic until the production contract gives a stronger return signal.
- Next Steps: selection rate, unselected-option rate, repeated-unselected-goal rate.

**Review flags** (`justified: null`):
- a deep linear chain without a learner choice;
- a very wide branch;
- repeated nested holes;
- a node without a relation;
- branches to equivalent concepts;
- a branch never visited;
- a remediation branch that never returns (`method: heuristic`: the target is a leaf off the main path; there is no explicit return signal yet);
- side explorations dominating the session.

## 15. Architecture review in Figma

**Where.** The section "Tutor Evaluation + Telemetry — Architecture Review" is node `275:222` on page
`WP4 · deployed review` of `ef9SfiemEsPQF2bd8B1os3`: 15 frames, built from synthetic traces, with no paid run.

**First review (owner, 2026-10-07).** Reviewed at evaluator `adc3057f`. The owner asked for:
- the validation rerun on Parallel's integrated candidate;
- tracing equivalence under the product's normal randomness;
- complete-request budget enforcement in place of chars/3.

The commit after `adc3057f` answers the last two; frames 01, 08, 12 and 15 carry its status. The integrated rerun waits
for Parallel's candidate SHA.

## 16. Isolation and the proofs (free tests)

**The provider boundary.** `providerBoundary(answers)` replaces `globalThis.fetch` for the run:
- Requests to `https://api.anthropic.com/v1/messages` and to the JEV origins (`JEV_TRANSPORTS`) are answered from a
  script. The product's own `anthropic()` transport, `loggedModel`, `askJev` and every caller above them run unchanged.
- Any other host throws `OUTBOUND_BLOCKED` and is recorded.
- A missing key alone would not stop a request. The boundary does, and a test puts a tripwire `fetch` under it and
  proves the tripwire is never reached in a whole session.
- Only request bodies are recorded, never headers. The worker env holds placeholder strings, never a key.
- The script answers:
  - the Tutor planner from a test's `plan(context)`;
  - the hook planner and the LP1 planners from the product's own keyless fixtures (`fixtureFor`, the
    `JOURNEY_MODEL_STUB=fixtures` replies);
  - JEV from a test's `jev(request)`.
- Every cost line says `transport: stub`, so stub usage can never be read as spend.
- The meter never fails a product call. A meter error is kept and asserted empty: one such error, a JEV reply with no
  usage, once made the real JEV client report the provider unreachable.

**What the tests prove** (`product.test.mjs`):
- **The real path, end to end.**
  - The LP1 journey is created by its route's planners.
  - Typed turns are evaluated by JEV through the real client before the plan.
  - A hook click is a `next_step` turn with no words and no JEV request.
  - Hook sets come through the controller and the owned route.
  - Each `tutor_decision`'s `prompt_version` equals the hash of the request the planner really sent.
  - Hooks start `HOOK_DEBOUNCE_MS` into the reading.
- **Tracing on or off, under the product's normal randomness.** Nothing is patched: real crypto and the real clock.
  - Opaque values the product mints or derives from its random source are renamed in order of first appearance across
    the run's whole transcript: the journey id, the hook basis hashed from it, hook-set and suggestion ids, session and
    decision ids, and any UUID. Wall-clock timestamps become `<time>`.
  - After renaming, three turns and a hook set give identical provider requests, identical product results and identical
    hook sets. The product results compared are actions, contracts, text, reason codes, readings, states, transitions,
    route and store. The raw ids differ between the runs.
  - A recurring value keeps one name, so references survive: the clicked suggestion id travels into later planner requests
    under the same name in both runs.
  - The comparison is not vacuous: different learner words give a different transcript.
  - With tracing off, no event is built.
- **Tracing on or off, byte for byte (seeded).** Randomness and the clock are seeded, and the trace module draws its ids
  from its own stream.
  - Limitation: the split is found by inspecting the caller's file on the stack. The byte equality holds only under that
    split, not under the product's single shared random source, where the trace's draws shift every later id.
  - A refactor that mints trace ids in another module would change the split without any test failing.
  - Date and crypto are patched globally for the run.
  - The normalized comparison above is the one that holds under the product's own wiring.
- **Production validators and escalations run,** as no eval copy could:
  - a planned action the route does not allow is dropped (`validation.dropped_actions`, `ok: false`);
  - a routine hook reply that opens with a command and has no ids escalates (`escalated:validator`, rule names
    `command`, `ungrounded`, 2 calls, the escalation role).
- **The stopping point.** A Tutor question waiting for an answer gets no hook set, and the learner types.
- **No Tutor logic is copied.**
  - The real functions are imported from `packages/` (checked by import).
  - No eval source defines a function with a production name (35 names checked).
  - No eval source pastes a product prompt line (`PLANNER_SYSTEM`, `NEXT_STEPS_SYSTEM`), the action list or the
    reason-code list.

**A gate fix found here.** On Windows, `node --test "$THIS_DIR/tests/evals/.../*.test.mjs"` (an absolute `/c/...` glob)
matches nothing and passes with 0 tests. This eval's line in `run.sh` now runs a relative glob from the repository root.
- The same pattern on the `learn-grade` line also ran 0 tests on this machine (26 tests exist).
- That line is not this lane's, so it is reported to Parallel rather than changed here.

## 17. Creator analytics (validated offline)

The product persists and aggregates nothing yet (contract §5). `creator.mjs` is the eval's aggregator over its own event
stream, so the owner's rules can be proven before any store exists.

**Cohort rule.**
- A protected metric needs at least 10 unique learners at every level it is cut by: publication, creator and global, and
  each concept, hook, position and time-range filter. Below that it is
  `{ value: null, suppressed: true, suppression_reason: 'insufficient_cohort', minimum_unique_learners: 10 }`, never 0.
- Protected metrics:
  - average active learning time (client `active_ms` only; unknown for simulated learners);
  - concept exploration rate (the share of learners who reached two or more concepts);
  - deeper-branch rate (the share who clicked a hook or opened a Rabbit Hole);
  - Start Rabbit Hole and fork conversion rates;
  - the highest-friction concept;
  - the Next Steps selection rate, overall and by position;
  - per-concept friction and per-hook selection.
- Friction is never measured from dwell time. It counts a misconception or prerequisite-gap state (from the product's
  derived states), a repair reason code, or a clarification the Tutor asked.

**Always visible, as plain counts:**
- total opens;
- the public fork count;
- raw Rabbit Hole starts;
- the published canvas count;
- unique learners: a bare count below the cohort, with no percentage built on it.

**No double counting.**
- A session belongs to exactly one publication (a session naming two is refused) and is counted once at every level.
- A learner is counted once per level: a creator's unique learners are deduplicated across their canvases, and opens are
  summed.

**Identity and privacy.**
- Publication identity is the canonical Explore key: `canvas_publications` on main (`0007`) is `(org, canvas)`, plus the
  owner's internal creator id.
- It is never a `share:<shareKey>` and never the publication's read token, which changes on every publish. An event
  carrying any other publication field, or an email as creator id, is refused.
- The output carries no learner id, email or handle, no evidence row, no individual misconception, no Rabbit Hole path
  and no hook history.
- A hook is keyed by a one-way hash of its structured identity (`learning_goal` and ids, §5.2). Its goal and a
  representative wording are shown only once the cohort stands behind it.

**Public creator profile.** It reads plain counts over listed explainers only: `public_explainer_count`,
`aggregate_unique_learners`, `aggregate_fork_count`. A removed or trashed publication counts toward nothing public.

**The events these metrics need**, as the product stands at `08c95bee`:

| Needed | Status | Where |
|---|---|---|
| Next Steps shown (impression, position) | Available, not persisted | `next_steps_shown` (trace v1); harness sink only |
| Next Step selected | Available, not persisted | `tutor_decision.selected_next_step_id`, `selected_at` |
| Concepts touched, repair reasons, clarification | Available, not persisted | `tutor_decision` decision fields |
| Evidence states (misconception, prerequisite gap) | Safely derivable | `deriveClaimStates` over the learner's store; the trace has transitions only |
| Hole return | Partly derivable | `return_from_dive` action, route row `returned`; no explicit return event |
| Fork | Safely derivable as rows | `canvas_forks` (`0004`): rows, not events; no publication identity on them |
| Publication opened / session on a publication | Needs production telemetry | no event; Explore `/e/<token>` (main) logs no open |
| Start Rabbit Hole from a publication | Needs production telemetry | a shared start records the share key (`source.share_key`), which must not identify a publication |
| Creator / publication identity on events | Needs production telemetry | the trace carries `canvas_id` and a shared `source`, not a publication key |
| Active learning time | Needs production telemetry | no client `active_ms` event |

`publication_opened` and `canvas_forked` are EVAL-ONLY shapes, marked as such in `events.mjs`. No production telemetry is
added by this lane. The Explore publication table is on main, not in this baseline, so the identity is re-checked on
the integrated SHA.

## 18. Real-model runs

**A. Three-profile session evaluation (logistic regression).**
- **Profiles.** One session per profile: novice, intermediate, advanced. The labels stay in the simulator.
- **Path.** Each session runs on the real LP1 journey path and its own LEARN_DB. The budget is 20 minutes of the
  Tutor's estimated learning time, capped at 15 decisions.
- **Models.**
  - Learner simulator: Sonnet 5.5, one call per decision.
  - Reviewer: Opus 5.5, one call per session.
- **Transport.** The same `providerBoundary` with `realAnswers` (the real Anthropic API and, owner 2026-10-08 "JEV where
  needed", the real JEV), and `anthropicTransport` for the simulator and the reviewer.
- **Budget enforcement: a conservative reservation guard, not a guaranteed hard billing ceiling.** Built and tested
  offline in `budget.test.mjs`; chars/3 is gone. It refuses any request whose worst case does not fit, and it never sends
  a refused request. It cannot cap what Anthropic bills, for these reasons:
  - the token bound rests on an unpublished tokenizer assumption (below);
  - a request already sent cannot be recalled, so the overshoot of the request that breaks a bound, and of any request
    in flight beside it, is spent before the session stops;
  - a request whose answer is lost is counted at its reservation, but what the provider billed is not known;
  - prices come from the versioned table, not from the bill.
  - **Worst case of one request** (`requestWorstCase`):
    - Input tokens are bounded by the complete serialized request's UTF-8 bytes plus 1000 tokens of API overhead.
    - Output is bounded by the request's own `max_tokens` (thinking included).
    - Input is priced at the cache-write rate when the request marks a cache breakpoint; fast mode doubles the price.
    - A request is refused, since it has no bound, when it has no `max_tokens`, no priced model (a server-side default),
      an image, or a non-text document.
  - **The tokenizer assumption.** The bound assumes at least one byte per token. That is not a published guarantee, so
    every settled line carries its `reserved_usd`, and a reported cost above it is a bound violation that stops the
    session.
  - **Reservations.** Every request is reserved at the boundary before it is sent.
    - Requests in flight together, such as an evaluation beside the planner, count together.
    - A retry or an escalation is another request and reserves again.
    - The simulator and the reviewer send complete requests (`learnerRequest`, `reviewerRequest`) through the same ledger.
    - A failure with no reported usage keeps its whole reservation as spend.
    - A parent ledger holds the run's limit over each session's own limit.
  - **Stopping.** A refusal or a violation stops the session even when the product turned it into a 502: the stop reason
    is read from the ledger.
  - **Scope.** The ceiling covers Anthropic only. JEV is outside it, and its cost is unknown unless the provider reports
    one. The all-provider total therefore stays null, with a lower bound beside it; a JEV cost is never counted as $0.
- **Ceiling.** Reservation limits of $4.00 of Anthropic spend for the run and $1.30 per session, so all three profiles get
  coverage. A session whose next reservation does not fit stops with `cost_ceiling` and keeps every event.
  - **Proved on the real path:** with an active journey and a run ledger that earlier sessions nearly exhausted, decision
    1 completes. Decision 2's planner request is then refused before it reaches the transport, and the session stops with
    `cost_ceiling`.
- **Does the budget permit the run?** Measured on the real path in a free 15-decision session, with every request
  reserved, including the simulator's:
  - **Startup:** permitted. The LP1 start's three requests settle at most $0.47 even at their full worst case, well
    inside $1.30.
  - **The reviewer's holdback (built, owner 2026-10-07).** Before the session's first request, runSession reserves the
    reviewer's worst case for a trace of every step the session may record (`reviewHoldback`: 6000 request bytes per
    step, plus one step's worth; a real 15-step stub trace measured about 4.2 kB per step). The holdback is an open
    reservation, so every session request is refused before the review could stop fitting. At the end it is given
    back and the real review request reserved in the same tick. A review whose request outgrows the holdback reserves
    again and is recorded as `refused`, unsent, when that does not fit. A limit below the holdback stops the session
    before it sends anything. For 15 decisions the holdback is $0.56 of the $1.30 (reviewer `max_tokens` 8000).
  - **At full worst-case usage** (every request costing its whole bound): without the holdback the session stops
    after 3 of 15 decisions at $1.18 and the review no longer fits. With it, the session stops with `cost_ceiling`
    after 1 decision and is reviewed: $0.91 in all, the review $0.19.
  - **At low usage** (the stub's token counts): all 15 decisions complete and are reviewed, $0.60 in all (the review
    reserved $0.41 and cost $0.06).
  - **So the evaluation may stop before all planned decisions finish.** How far it gets depends on real usage, which
    only the paid run shows; the holdback trades decisions for a guaranteed review.
- **Materials.** `create_material` stays `not_run` in this first run; material generation is a separate approval.
- **Sizing.** `requestWorstCase` at the 2026-09-25 price table, applied to:
  - the complete requests the product built in a free 15-decision run (the largest of each kind);
  - the larger evaluator's largest possible request (6 claims, 4 gaps, a 4000-character message), built by the product's
    `largerRung`;
  - the simulator and reviewer requests at their largest.

| Per session | Worst case | Expected |
|---|---|---|
| LP1 start: `journey_diagnostic`, `journey_path`, `journey_section` | $0.50 | $0.15 |
| Tutor planner, 15 turns (every fast plan escalating to Opus) | $2.70 | $0.30 |
| Larger evaluator, every typed turn | $1.58 | $0.06 |
| Hooks, 14 sets, every set escalating | $2.38 | $0.20 |
| Learner simulator, 15 calls (1500 `max_tokens`) | $0.41 | $0.10 |
| Reviewer, 1 call (8000 `max_tokens`) | $0.38 | $0.08 |
| **Session** | **$7.95** | **about $0.90** |

- **Expected total:** about $2.70 for three sessions. This is an estimate of real usage that only the paid run measures.
- **The worst case is not reachable through the guard:** reservations stop every session at its limit and the run at
  $4.00, within the guard's limits stated above.
- **Early stops:** near a ceiling, a request is refused whenever its worst case does not fit, so a session can stop with
  real headroom left.
- **Readiness (all built):** the simulator and reviewer calls (`modelLearner`, runSession's `reviewer`, through
  `evalCall`), the reviewer's worst case held from each session's start, the real transport (`realAnswers`,
  `anthropicTransport`) and `run.mjs paid`. Owner approval 2026-10-08 ("Tutor's paid real-model evaluation run", the dev
  Anthropic workspace, $10/month). Results: §18.1.

### 18.1 Run A results (2026-10-08, evaluator 6fd6b3c0 on main 5484e38d)

One session per profile on `logistic-regression`, real Anthropic (dev workspace) and real JEV, 15:43-15:52Z.

- **Spend:** $1.61 Anthropic metered (78 calls, 0 refused, 0 bound violations, 0 outbound blocked) of the $4.00 run
  limit. JEV: 29 calls, all ok, p50 about 140 ms, cost unknown (not reported by the provider). An earlier Anthropic-only
  attempt (fc332fc7) was stopped after about 5 minutes when JEV was approved; its bundle was not written, so its spend is
  unmetered, at most $0.74 (the session limit minus the unspent reviewer holdback).
- **Sessions:**

| Profile | Stop | Decisions | Anthropic | Review |
|---|---|---|---|---|
| novice | max_decisions | 15 | $0.77 | ok |
| intermediate | max_decisions | 15 | $0.75 | ok |
| advanced | error at the LP1 accept: `journey_section` returned an invalid plan (check c2: key needs correct, misconception mapping), 502 | 0 | $0.09 | skipped |

- **Professor Next Steps** (`aggregate.json` `next_steps`; only the novice session reached a stopping point):
  - 4 sets requested, 3 shown, 1 failed (its escalation was refused by the validator too: reason and rules unknown,
    no trace).
  - Escalation rate 0.75 (3 of 4 sets called Opus). Reasons: `escalated:validator` 2, plus the failed set.
  - Failing validator rules of the routine reply: `hook_words` 2.
  - Latency per set: routine 3.8 s, escalated 13.1-14.3 s. Per call: Sonnet p50 3.7 s, Opus p50 10.2 s.
  - Cost: $0.094 in all, about $0.023 per set (routine $0.032 for 4 calls, escalation $0.061 for 3).
- **Tutor planner:** $0.33 (novice) and $0.40 (intermediate) for 15 turns each; p50 8.6 s and 10.2 s per turn.
- **What the sessions showed** (reviewer findings and the traces, one simulated learner each, not a learning outcome):
  - The learners answered correctly turn after turn, yet the targeted claim stayed `uncertain`, and the Tutor kept asking
    near-identical weighted-sum questions (intermediate: 15 of 15 decisions `ask_question`, one modality).
  - A waiting Tutor question is not a stopping point, so the intermediate session never offered Next Steps.
  - The intermediate learner's repeated question (how a score becomes a probability) was deferred to a later section
    each time.
  - Reviewer scores: `progress_toward_goal` 1 and `pacing` 1 in both reviewed sessions.
- **Cause (from the recorded router rows, then reproduced offline):** every typed answer after the first evaluation took
  the router row `uncertain_unsettled` (novice decisions 4-13, intermediate 2-15), which allows `ask_question` only.
  `evaluationFrom` settles a typed turn's events only when every JEV answer in the batch is confident; one unsure check
  leaves them all unsettled, the escalation policy calls that `low_consequence` (no larger evaluator: none ran), and the
  router's "one clarifying question" has no limit. A scripted JEV unsure on the transfer check alone (0.5, every other
  check confident) keeps 6 of 6 turns on `uncertain_unsettled` with the claim `uncertain`; the same session with the
  transfer check at 0.95 settles and reaches `understood` on the first answer. Run A did not record which check was
  unsure; `evidence` records it from 2026-10-08 on. Proposed product fixes (Learning): settle per claim, escalate an
  unsure transfer check on a `test_transfer` turn, cap the clarifying question, answer a question the learner repeats;
  retry `journey_section` once on a validator failure, as Next Steps does.

### 18.2 Confirmation run (prepared; runs once on r27)

The single paid confirmation run the owner approved on 2026-10-08. It runs once, after Parallel confirms Learning's fixes are
integrated in r27 and its required gate is green; there is no automatic rerun. It is a diagnostic confirmation, not proof
of real-user learning outcomes or launch readiness.

- **Comparable to run A:** the same `run.mjs paid` command, topic (`logistic-regression`), three profiles, limits ($1.30 per
  session with the reviewer holdback, $4.00 for the run), simulator (Sonnet 5.5, effort low, 1500 `max_tokens`), reviewer
  (Opus 5.5, default effort, 8000) and real JEV. Differences: Learning's fixes (the point of the run); every typed turn's
  evaluation recorded (`evidence`, no behaviour change); `run.json` records the tested commit and tree, whether the
  checkout was clean, the limits and every model setting (the product's `LEARN_TASKS` included).
- **Run A baseline in the same measures** (`evidence.sessions`, `next_steps`): the longest run of consecutive
  `uncertain_unsettled` decisions on one claim was 14 (intermediate) and 10 (novice); each session reached one section;
  intermediate made 15 `ask_question` actions in 15 decisions; Next Steps showed 3 sets, all in the novice session, with
  hooks of 10-12 words; the advanced setup failed.
- **Criteria:**
  - **Evidence:** correct taught-case answers get credit (settled `demonstrated_here` passes in `evidence.events`), and an
    unsure transfer check stays explicit (in `unsure_checks`, the claim not `understood` on it).
  - **Loop recovery:** at most two consecutive `uncertain_unsettled` decisions on the same claim, followed by a change of
    teaching strategy that helps (the row and actions after each run, read with the transcript).
  - **Progress:** intermediate and advanced advance when their demonstrated understanding supports it (the claims
    understood when each section is entered); advancement alone is not a pass.
  - **Novice support:** uncertainty may remain, but the learner gets help, not repeated equivalent questions (action mix,
    flagged repetition, transcript).
  - **Advanced setup:** the section plan completes.
  - **Next Steps:** coverage per session, relevance and usefulness (read, with the reviewer's `hook_quality`), escalation,
    validator failures, hook word counts, latency and cost.
  - **Reviewer:** 3/5 is the provisional minimum for `pacing` and `progress_toward_goal`, backed by transcript evidence;
    scores alone do not establish success.
- **Not tested here: practice-card delivery.** The harness materializes no section content, so no card or practice
  activity reaches the canvas, and the path where the Tutor hands an unsettled claim to a practice card (whose graded
  answers become settled, deterministic evidence, including transfer) is untested end to end. The separate check: a browser
  run on the local stack (Learning with Parallel's gate) that materializes a section with a transfer practice card, answers
  it right and wrong, and asserts the claim settles (`demonstrated_in_transfer`), the path advances, and the Tutor stops
  re-asking once the claim is settled.

### 18.3 Confirmation run results (2026-10-08, r27 01a7a508)

The full report is in Figma: https://www.figma.com/design/nLAIEGoObdPUPegoytFO2j/?node-id=16-3 ("Rabbit Hole — Reviews",
page "Tutor confirmation run r27 · 2026-10-08").

- **Tested:** main / r27 `01a7a508`, tree `a05d6759`, clean checkout, 18:09-18:23Z. The configuration matched run A.
  Novice and advanced stopped at the $1.30 session limit after 12 decisions.
- **Met:**
  - at most 2 `uncertain_unsettled` turns in a row on one claim (run A: 10 and 14);
  - the advanced setup completed;
  - Next Steps reached every session (19 sets requested, 14 shown).
- **Not met:**
  - no claim reached *understood* and no session left section 1;
  - reviewer pacing 1/2/1 and progress 1/2/1, against the provisional minimum of 3;
  - repeated deferral of the learner's forward questions, a readiness failure (fix 4 was excluded).
- **New cause:** JEV was unsure on the same claim's idea checks in 15 of 25 evaluations, which leaves that claim's clear
  passes unsettled, and *understood* needs every idea covered (novice: ideas 0 and 2 settled in transfer, idea 1 never).
  The planner is not told which idea is missing.
- **Next Steps:** escalation rate 0.58; routine rule failures `hook_words` 5 and `goal` 2; 9 of 27 rejected routine hooks
  had 13-16 words; 5 sets failed in escalation too; p50 latency 3.9 s routine and 14.3 s escalated; $0.41 in all. The hooks
  used a different example than the Tutor and offered no way forward.
- **Costs:** Anthropic $2.2439 metered. JEV: 26 calls, cost unavailable.
- **Untested:** practice-card delivery (§18.2 names the separate check).
- **Correction (after a code survey of r28):** at r27 the product had no section advancement at all. The learning-path
  route had no advance or complete action, the active section was set only when the path was accepted, and section
  completion was planned for LP2. So no session could leave section 1 whatever the evidence, and the progress criterion
  could not be met at r27. "No claim reached *understood*" stands. Practice on a learning-path canvas also produced no
  evidence (`journeyDomain.practice` returned null). r29 adds a learner-started `next_section` (completed when the
  section's completion evidence is met, skipped otherwise). The next evaluation reports evidence-based advancement and
  learner-requested skipping separately, and a skip never satisfies the understanding criterion. Practice cards inside
  learning-path sections are LP4, untested; `e2e/practice-card-check.mjs` covers the rest.
- **Aggregation fix:** after the run, `readSessions` read `run.json` as a session. It now skips it; aggregation only, nothing
  rerun.

### 18.4 r29 wiring: moving to the next section (for the next confirmation run)

- **Typed move-on.** An accepted `next_section` action, which the validator keeps only when `explicit_request` quotes the
  learner's words, makes the route call the page makes after the turn (`executeActions`). That call is the journey
  route's `next_section` at the journey's revision, replayed once at the re-read revision on a stale-revision 409.
- **Next-section hook.** A click moves on with no Tutor turn (LearnPage `onPick`: `step.section`). The learner then reads
  the new section (its title: section content is not materialized here) and types the next move. The hook's text carries
  its note, as the card shows it: "Next section", or "Next section - skips this section".
- **Recording.** Each move is a `section_changed` event: from and to section, `completed` or `skipped` from the route's
  reply (`path.sections[left].status`, `change.reason`), and the trigger (`tutor` or `hook`).
- **Reporting.** `evidence.sessions` reports `sections_completed` (the section's completion evidence was met) apart from
  `sections_skipped` (the learner moved on before it was). A skip never counts toward understanding: claim states come from
  evidence only.
- **Open question for Learning:** whether the page re-reads the journey after a typed turn. Until it does, the section hook
  can appear only after a reload, in the page and here alike.

**B. Equivalent phrasings: quality, latency and cost** (contract §4.1.1 follow-up).
- **Pairs:**
  - `Teach me X` vs `Explain X`;
  - `thanks` / `ok` vs a question;
  - a statement vs the same content asked as a question;
  - `I still don't get X. Show me another way.` vs `Show me another way to see X.`
- **Contexts.** A plain canvas and an active LP1 journey, on two topics (no topic overfitting).
- **Free half (ready, not run).** Intent kind, router row, planner tier and allowed actions per phrasing. These are
  deterministic, because the planner's tier is tagged by the real `plannerTier` with stubbed providers.
- **Paid half.**
  - Each phrasing is one real Tutor turn on the same state: 6 pairs × 2 variants × 2 contexts × 2 topics × 1 repeat =
    48 turns.
  - Measured: tier, `planner_ms`, `first_text_ms`, `blocking_wait_ms`, tokens and cost (trace usage), actions, modality,
    intent and clarification.
  - A blind Opus judge compares each pair (24 judgments) on a fixed rubric: did it answer the learner's need, was the
    pedagogy fitting, was nothing expensive done that was not needed.
- **Cost.** Expected about $1.70; cap $2.00, separate from A.

## 19. Gaps and unresolved

1. **Integration.** This is a feature baseline. Parallel's integrated SHA needs the free gates rerun there, and that run
   alone certifies the integrated tree.
2. **Materials.** Generation is not run (`runMaterials`, `/api/learn/artifact`), so `create_material` decisions are
   `not_run` and record no material events. A8 (material roles), A10 (subcards) and A11 (payloads) stay provisional.
3. **Section blocks.** Section materialization is not run either. The journey canvas has no blocks, so hooks ground on
   the journey goal and `canvas_summary` is empty.
4. **The tray resolver.** LP1's tray resolver (`live.handleText`) is not run before typed turns. It matters only inside
   an open tray or setup, which the eval skips.
5. **Streaming.** Turns are not streamed (no `onSpeakable`), so the fast-tier first-sentence release is not measured.
6. **Not exercised:**
   - Rabbit Holes and returns, shared canvases and Voice;
   - the repository handoff;
   - the larger evaluator's answer (the stub answers tool calls only);
   - the owned reply edge cache (no `caches.default` in Node, as on `*.workers.dev`).

   Every session bundle lists these under `coverage.not_exercised` (`product.mjs` `COVERAGE`), with
   `teaching_quality: not established`: scripted answers never measure real-model teaching quality.
7. **Stopped turns.** A stopped turn leaves no decision event (contract §4.7.2), so the eval cannot see Stop.
8. **No production sink.** The decision trace has none: nothing from real learners exists, and persistence is a
   separate, owner-approved migration.
9. **Creator-analytics events.** The production events of §17 are missing (publication opened, publication identity on
   holes and forks, active time). They are modelled as eval-only shapes.
10. **The `learn-grade` gate line** in `run.sh` ran 0 tests on Windows (§16), and so did the motion line. Parallel confirmed
    both and made them relative on `infra/provider-tripwire` `1f06597b`, which lands with #67.
11. **The keyless hook fixture** repeats itself after a few sets, so free sessions see later hook sets fail validation as
    repeats. That is the product's validator doing its job on a stub, not a product finding.
