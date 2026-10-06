# Tutor decision evaluation (offline session simulator)

**Owner:** Tutor Decision Evaluation agent.
**Branch:** `feature/tutor-decision-eval`, worktree `workspace/tutor-decision-eval`, based on main `f4b99a3b`.
**Local backup:** `backup/tutor-decision-eval-b1023a53`.

This is an evaluation project only. It does not change Tutor behaviour, has made no model calls and has spent nothing.

## Status

This branch holds only the interface-independent scaffolding, and it stays local until it is rebased onto the Learning
checkpoint. The paid 20-minute simulations wait for that checkpoint, which brings:
- Professor Next Steps / HookSet;
- `selected_next_step`;
- TutorDecisionTrace.

When the exact SHA and `docs/features/professor-next-steps.md` arrive, the steps are:
1. Rebase onto that SHA, then push once.
2. Replace the provisional adapters with the real interfaces.
3. Prove the harness calls the real `runTurn` / planner path and copies no Tutor logic.
4. Report the integration map, and stop before any paid run.

Every field marked PROVISIONAL below is the eval's own normalized view. Nothing more is built on those fields until
the checkpoint replaces them.

## 1. The production path the simulator must call (audit of main f4b99a3b)

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

The $4.00 hard ceiling covers Anthropic model spend only. JEV goes to `ledger.recordExternal` and is reported apart
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

When a hook set starts is the product's recompute policy, so it is injected as `hookStart({ decision })`. Until the
Learning contract defines it, the default (`after_evidence`) treats every set as blocking.

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
| `fixtures/` | Topic fixtures (`logistic-regression`, `photosynthesis`), simulator-only profiles, `taxonomy.provisional.json` (modalities, reason codes, relations, review thresholds) and `cost-roles.provisional.json`. |
| `tutor-session.test.mjs` | 35 tests, run by `make test-unit`. |

There is no topic or profile branch in the code, and a test enforces it:
- No harness source names a topic id, a topic title word or a profile id.
- Renamed, reordered profiles and a new topic written at test time run unchanged.
- The learner prompt builds its forbidden-label list from the profile data.

## 4. Event model (production-telemetry shaped)

The session's source of truth is append-only events. The session file bundles the events, plus the folded steps for
reading. `aggregate.json` is always recomputed from the events.

**Envelope (every event):**
- `trace_schema_version` (`tutor-trace-eval-0`, provisional), `event_id`, `seq`, `type`, `t_ms`;
- `session_id`, `user_id`, `canvas_id`;
- when known: `board_id`, `canvas_version`, `journey_id`, `section_id`, `dive_id`, `source_resource_id`.

**Identity:**
- Ids are internal. An id that looks like an email is refused, as is any key containing "email".
- Synthetic ids are opaque hashes, so a profile name cannot reach the product inside an id.

**Types:**
- Session: `session_started`, `session_ended {reason}`.
- Canvas: `canvas_context_changed`.
- Hooks: `next_steps_generation_started {hook_set_id}`, `next_steps_ready {hook_set_id, options}`, `next_step_selected {hook_set_id, option_id, position}`.
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

**Learner simulator** (`claude-sonnet-5-5`; not called yet):
- **Sees:** its hidden profile, the topic goal, the material summary, the hook texts and its own past exchange.
- **Never sees:** reasons, rationale, expected evidence, evidence state, hidden goals or answers.
- **Reply format:** `LEARNER_REPLY_SCHEMA` is used as `output_config.format`.
- **Reply checks:** `parseLearnerReply` re-checks every reply. It refuses an option that wasn't offered and any profile label.

**Session reviewer** (`claude-opus-5-5`, one call per session; not called yet):
- **Sees:** the folded trace, without the profile and without hidden reasoning (`reviewerView`).
- **Reply format:** `REVIEW_SCHEMA`.
- **Reply checks:** `parseReview` requires ten scores from 1 to 5, findings that cite recorded steps, and a judgement for each flagged sequence.

**Hidden profile:** `assertNoProfileLeak` checks every learner-originated payload and the adapter's reported planner
input. A hit ends the session (`profile_leak`).

## 8. Interfaces this eval expects to consume (from the Learning checkpoint)

Each injected function also gets a `meter`:
- `meter.guard()` checks the ceiling before a call.
- `meter.call()` records the call after it.
- The meter stamps the attribution (decision, hook set or material) and writes the cost event.

| Injected | Needs from the product |
|---|---|
| `tutor.start(meter)` | A fresh LP1 journey for the topic in this session's own `LEARN_DB`, through the real intake/path flow. The journey-creation calls are session-level cost. Its starting claim states (`deriveClaimStates` shape) and context: journey, section, board and canvas version. |
| `tutor.decide(input, meter)` | One real `runTurn` / `planTurn` decision on learner-visible input. Fields: action type, modality, card type, generic `reason_codes`, rationale summary, target concepts, `expected_evidence`, `recent_modality_history`, `estimated_learning_seconds`, available modalities, planner version. Also the exact planner input (for the leak check) and any Dive record it opened (`rabbit_hole`). |
| `tutor.observe(response, meter)` | The real evidence path (deterministic → JEV → larger evaluator) and the resulting claim states. The next `decide` must not re-evaluate it. JEV calls are metered with `provider: typesafe`. |
| `hooks(…, meter)` | The validated HookSet: 3 options (id, position, hook text, `learning_goal`) and a set id. |
| `hookStart()` | The product's recompute policy for when a hook set starts. |
| `selected_next_step` | How a picked hook reaches the next decision. |
| `materialize(…, marks, meter)` | The production material generator, up to a validated learner-facing payload. It returns `timing_source`, `cache_status`, `material_type`, `modality`, concept/claim ids, `descriptors`, subcard `structure` (counts only), `links` (the product's own edges) and `node_id`. |
| Taxonomy | The product's modality list, reason codes and link relation vocabulary, replacing `taxonomy.provisional.json`. |
| Cost roles | The product's task names for hooks, material generation and Motion/Avatar stages, replacing `cost-roles.provisional.json`. |

## 9. Provisional assumptions to reconcile

- **A1.** `next_steps_ready.options` items are `{ id, position, text, learning_goal }`. The learner view drops `learning_goal`.
- **A2.** `tutor_action_ready.decision` is `{ action_type, modality, card_type, reason_codes, rationale_summary, target_concepts, expected_evidence }`.
- **A3.** The reason codes and modality list are the owner's examples.
- **A4.** `hookStart` defaults to `after_evidence` until the product's recompute policy is known.
- **A5.** The first decision has no hooks; the opening message leads.
- **A6.** `evidence_updated` carries a full claim-state snapshot.
- **A7.** `trace_schema_version` becomes the Learning agent's TutorDecisionTrace version.
- **A8.** Cost roles: `next_steps`, `material_generation`, `material_repair`, `material_review`, `provider_asset` and `render_compute` are placeholders. The `LEARN_TASKS` names (`tutor`, `tutor_evaluator`, `journey_*`, `avatar_*`) and `jev` are the product's.
- **A9.** Link relations: the product reuses card-plan `RELATIONSHIPS` and the depth-card links, plus the owner's generic list. Hook selections are recorded as `next_step_selection`, `created_by: learner`.
- **A10.** Cardinality is NOT fixed. One decision may give one material (with subcards) or several related materials.
  - The schema, the fold and the runner support `decision → materials[] → subcards[]`; `materialize` may return `{ materials: [...] }`.
  - The fake world in the tests uses one material for most decisions and two for one.
  - The real cardinality waits for the Learning contract.
- **A11.** Material descriptors and subcard field names (`content_duration_seconds`, `question_count`, `option_count`, …) follow the owner's lists until the product's payloads are mapped.
- **A12.** `rabbit_hole_opened.opened_by` maps from the Dive record's `created_by` (`taxonomy.rabbit_hole_opened_by`): `tutor_confirmed` → `tutor_suggestion`, `learner_*` → `learner`, `shared_start` → `shared_canvas_hook`. An unknown value is recorded as `unknown`, never guessed.

## 10. Cost and models

See §12. The ceiling applies to Anthropic spend only, with the learner simulator and reviewer included, since they are API spend. JEV and other providers are logged apart (O2).

## 11. Commands

```bash
node --test tests/evals/tutor-session/*.test.mjs        # free, part of make test-unit
node tests/evals/tutor-session/run.mjs aggregate <dir>  # session files -> aggregate.json, steps.csv, table
node tests/evals/tutor-session/run.mjs events <jsonl>   # any event stream -> grouped metrics
```

No paid simulation is wired.

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

## 15. Architecture review in Figma (pending)

The owner's 15-frame review section, "Tutor Evaluation + Telemetry — Architecture Review" in Figma file
`ef9SfiemEsPQF2bd8B1os3`, is built only after the rebase onto the real Professor Next Steps + TutorDecisionTrace
checkpoint and the reconciliation of A1–A12. It uses synthetic sample traces and no paid run.
