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
| `events.mjs` | The event stream, its validation, the fold into one record per decision, timing (backend vs perceived), and grouping. |
| `harness.mjs` | Fixtures, the hidden-profile guard, the session loop on the session timeline, learner and reviewer views, prompts, reply schemas and strict parsers, the cost ledger with its separate external log, and `freshLearnDb`. Every product dependency is injected. |
| `metrics.mjs` | Every metric as a pure function over segments (lists of folded steps). One implementation serves a session, canvas, board, user×canvas, journey, section, source resource, planner version and the global aggregate. Also `aggregate.json`, the terminal table and the steps CSV. |
| `run.mjs` | Free CLI. `aggregate <dir>` writes `aggregate.json`, `steps.csv` and the table; `events <file.jsonl>` prints grouped metrics for any event stream. |
| `fixtures/` | Topic fixtures (`logistic-regression`, `photosynthesis`), simulator-only profiles, and `taxonomy.provisional.json`. |
| `tutor-session.test.mjs` | 28 tests, run by `make test-unit`. |

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
- Canvas and holes: `canvas_context_changed`, `rabbit_hole_entered/left {dive_id}`.
- Hooks: `next_steps_generation_started {hook_set_id}`, `next_steps_ready {hook_set_id, options}`, `next_step_selected {hook_set_id, option_id, position}`.
- Learner:
  - `learner_consumption_started/finished {decision_id, timing_source}`: `estimated` when the reading time is the Tutor's estimate, `measured` for real users.
  - `learner_message {kind, input, decision_id?}`: the `decision_id` is present when it answers that decision's material.
- Evidence: `evidence_updated {claims, cause}`.
- Decision: `tutor_decision_started {decision_id, trigger: opening|hook|typed}`, `tutor_action_ready {decision_id, decision, estimated_learning_seconds, available_modalities, planner, planner_version}`.
- Material:
  - `material_generation_started`, `material_first_ready`;
  - `material_complete {timing_source, cache_status, cache_origin, asset_applicable, durations?, material_signature?}`;
  - `material_failed`, `asset_ready`.

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
  - longest identical card-type run, near-duplicate activities, explanation-only and quiz-only sequences;
  - longest passive run and longest high-effort run.
  - Flagged sequences carry `justified: null` until the reviewer decides.
- **Hooks:**
  - distinctness, repeated from the previous set, repeated `learning_goal`, generic commands, curiosity questions, answer-revealing hooks;
  - selection rate, position bias, overrides by a typed request;
  - stale-set rate, sets unchanged after an evidence change, sets generated before the evidence changed, hooks repeatedly ignored.
  - These are lexical heuristics; the reviewer scores quality.
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

| Injected | Needs from the product |
|---|---|
| `tutor.start()` | A fresh LP1 journey for the topic in this session's own `LEARN_DB`, through the real intake/path flow. Its starting claim states (`deriveClaimStates` shape) and context: journey, section, board and canvas version. |
| `tutor.decide(input)` | One real `runTurn` / `planTurn` decision on learner-visible input. Fields: action type, modality, card type, generic `reason_codes`, rationale summary, target concepts, `expected_evidence`, `recent_modality_history`, `estimated_learning_seconds`, available modalities, planner version. Also the exact planner input, for the leak check. |
| `tutor.observe(response)` | The real evidence path (deterministic → JEV → larger evaluator) and the resulting claim states. The next `decide` must not re-evaluate it. JEV calls go to `recordExternal`. |
| `hooks()` | The validated HookSet: 3 options (id, position, hook text, `learning_goal`) and a set id. |
| `hookStart()` | The product's recompute policy for when a hook set starts. |
| `selected_next_step` | How a picked hook reaches the next decision. |
| `materialize()` | The production material generator, up to a validated learner-facing payload, with `timing_source` and `cache_status`. |
| Taxonomy | The product's modality list (active/passive, effort, family) and reason codes, replacing `taxonomy.provisional.json`. |

## 9. Provisional assumptions to reconcile

- **A1.** `next_steps_ready.options` items are `{ id, position, text, learning_goal }`. The learner view drops `learning_goal`.
- **A2.** `tutor_action_ready.decision` is `{ action_type, modality, card_type, reason_codes, rationale_summary, target_concepts, expected_evidence }`.
- **A3.** The reason codes and modality list are the owner's examples.
- **A4.** `hookStart` defaults to `after_evidence` until the product's recompute policy is known.
- **A5.** The first decision has no hooks; the opening message leads.
- **A6.** `evidence_updated` carries a full claim-state snapshot.
- **A7.** `trace_schema_version` becomes the Learning agent's TutorDecisionTrace version.

## 10. Cost and models

- **Ledger.** `createLedger(4.00)` guards every Anthropic call against its worst case (input characters / 3 + `max_tokens`) before the call, and records the real usage after.
- **Prices.** USD per MTok: Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, cache read $0.20, cache write 1.25x input (claude-api skill, cached 2026-09-25).
- **Unpriced models.** An Anthropic model with no price is refused.
- **JEV.** Logged separately (O2).

## 11. Commands

```bash
node --test tests/evals/tutor-session/*.test.mjs        # free, part of make test-unit
node tests/evals/tutor-session/run.mjs aggregate <dir>  # session files -> aggregate.json, steps.csv, table
node tests/evals/tutor-session/run.mjs events <jsonl>   # any event stream -> grouped metrics
```

No paid simulation is wired.
