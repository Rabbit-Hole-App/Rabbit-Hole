# Tutor decision evaluation (offline session simulator)

Owner: Tutor Decision Evaluation agent. Branch `feature/tutor-decision-eval`, worktree `workspace/tutor-decision-eval`,
based on main `f4b99a3b`. This is an evaluation project only. It does not change Tutor behaviour, has made no model
calls and has spent nothing.

**Status: interface-independent scaffolding.** The paid 20-minute simulations wait for the Learning agent's checkpoint
(Professor Next Steps / HookSet, `selected_next_step`, TutorDecisionTrace). Every field marked PROVISIONAL below is
the eval's own normalized view. It is replaced by the real contract once that SHA lands, and nothing further is built
on it until then.

## 1. The production path the simulator must call (audit of main f4b99a3b)

One learner turn in the product, all in `packages/web/src/learn-tutor.js` `runTurn` (line 323):

1. **Deterministic rung.** `practiceEvents`: new card attempts become evidence events.
2. **Evaluation.** `POST /api/learn/tutor/evaluate`, handled by `tutorRoute` in `control-plane/src/learn-tutor-routes.js`:
   - **nanoGPT domain.** `validateEvaluateBody` then `evaluateFreeText`: JEV (`typesafe-ai/jev`, Typesafe AI) first, then the escalation policy, then the larger evaluator (`claude-opus-5-5`, `LEARN_TASKS.tutor_evaluator`).
   - **Journey domain (LP1).** `journeyEvaluate` stores the evidence server-side in `LEARN_DB`.
3. **Router and planner.**
   - `route` then `plannerContext`.
   - `POST /api/learn/tutor/plan` runs `planTurn`. Defaults (`PLANNER_DEFAULTS`):
     - a fast tier (`claude-sonnet-5-5`, effort low) on routine rows;
     - `claude-opus-5-5` for everything else and for escalations;
     - prompt cache on.
4. **Enforcement.** `validateActions` in `learn-tutor-validate.js` produces the validated actions.

How to call it without a copy: `packages/web/e2e/tutor-corpus-run.mjs` already runs the real `runTurn` in Node.
- Its `post` is routed straight to the worker's own `validateEvaluateBody` / `evaluateFreeText` / `planTurn`.
- There is no HTTP and no second planner or prompt.
- The eval's Tutor adapter will use that same pattern.

Gaps on main that the Learning checkpoint is expected to fill:
- The planner's output has `strategy` plus `actions` from `ACTION_TYPES` (`agents/learn-tutor.js:130`), plus `suggest_avatar_clip`.
- It has no modality, no reason codes, no expected evidence and no estimated learning time. There are no Professor Next Steps hooks.
- A topic outside nanoGPT needs a TutorDomain. Today that means a journey domain, whose evidence lives in `LEARN_DB`.
  - An offline run needs a local D1, or whatever generic domain the checkpoint provides. Open question O1 below.

## 2. What is built (all generic, synthetic-fixture tested)

All files are in `tests/evals/tutor-session/`:

| File | What it holds |
|---|---|
| `events.mjs` | The event stream, its validation, the fold into one step per Tutor decision, timing derivation, grouping. |
| `harness.mjs` | Fixture loading, the hidden-profile guard, the session loop, learner/reviewer views, prompts and strict parsers, the cost ledger, result files. Every product dependency is injected. |
| `metrics.mjs` | Every metric as a pure function over segments (lists of folded steps). The same code serves a session, a canvas, user×canvas, a journey, a section, a planner version and the global aggregate. Also: `aggregate.json`, the terminal table, the steps CSV. |
| `run.mjs` | Free CLI: `aggregate <dir>` writes `aggregate.json`, `steps.csv` and the table; `events <file.jsonl>` prints grouped metrics for any event stream. |
| `fixtures/` | Topic fixtures (`logistic-regression`, `photosynthesis`), simulator-only learner profiles, and `taxonomy.provisional.json`. |
| `tutor-session.test.mjs` | 22 tests. They run in `make test-unit`. |

There is no topic or profile code branch anywhere. Two topics run through the same code.

## 3. Event model (production-telemetry shaped)

The session's source of truth is an append-only stream of events. The session file bundles the events, plus the
folded steps for reading; `aggregate.json` is always recomputed from the events.

**Envelope (every event):**
- `trace_schema_version` (`tutor-trace-eval-0`, provisional), `event_id`, `seq`, `type`, `t_ms` (monotonic from session start);
- `session_id`, `user_id`, `canvas_id`;
- when known: `canvas_version`, `journey_id`, `section_id`, `dive_id`.
- Synthetic ids are opaque hashes. A profile name inside a user id would reach the product.

**Types:**
- session: `session_started`, `session_ended {reason}`;
- canvas and holes: `canvas_context_changed`, `rabbit_hole_entered`, `rabbit_hole_left {dive_id}`;
- hooks: `next_steps_generation_started {hook_set_id}`, `next_steps_ready {hook_set_id, options}`, `next_step_selected {hook_set_id, option_id, position}`;
- learner and evidence: `learner_message {kind, input: typed|activity, chars}`, `evidence_updated {claims, cause}`;
- decision: `tutor_decision_started {decision_id, trigger: opening|hook|typed}`, `tutor_action_ready {decision_id, decision, estimated_learning_seconds, available_modalities, planner}`;
- material: `material_generation_started`, `material_first_ready`, `material_complete {timing_source, cache_status, cache_origin, asset_applicable, durations?, material_signature?}`, `material_failed`, `asset_ready`.

**Privacy:**
- Analytics need ids and structured fields only.
- Learner words and material text exist only under `debug`. They are on for synthetic learners and off in a production shape (`debugText: false`).
- `validateEvent` refuses any key that looks like a credential or hidden reasoning (`token`, `api_key`, `secret`, `password`, `authorization`, `cookie`, `thinking`, `chain_of_thought`), at any depth. The usage token counts are exempt.
- It also refuses learner text outside `debug`.

**Fold:**
- `foldSessions(events)` works on any number of sessions in any arrival order, ordered by `seq`. It returns one record per decision.
- A record holds:
  - the evidence before and after, the hook set shown and the pick, and whether a typed request overrode the hooks;
  - the decision, the estimated learning seconds and the available modalities;
  - the learner response kind, the timeline, the derived timing and the waits.
- A decision that never produced a validated action, for example after a cost stop, is listed in `meta.incomplete_decisions`, not as a step.

## 4. Timing

**Timeline:** `t0_state_ready`, `t1_hooks_start`, `t2_hooks_ready`, `t3_hook_selected`, `t4_tutor_plan_start`,
`t5_tutor_action_ready`, `t6_material_generation_start`, `t7_first_material_ready`, `t8_material_complete`, and
`t9_asset_ready` only when an asset applies and was really produced.

**Derived per step:**
- `hooks_ms`, `hook_to_tutor_start_ms`, `tutor_decision_ms`;
- `material_first_ready_ms`, `material_complete_ms`;
- `decision_to_first/complete_material_ms`, `click_to_first/complete_material_ms`;
- `asset_generation_ms`, `click_to_asset_ready_ms`, `evaluation_ms`.

**Sources:**
- Every duration has a source: `measured`, `cached` (a recorded earlier measurement), `estimated` or `not_run`.
- `timing_source` is the material phase's source. `sources` gives it per phase.
- Cached or estimated material carries durations, never timestamps.
- `not_run` leaves the durations null.
- A click-to-material latency built on an estimated material is itself `estimated`.
- Statistics are computed per source and never pooled. `not_run` is only counted.
- Each step also records `cache_status` (`miss`, `hit`, `partial`, `not_applicable`) and `cache_origin` (`fresh`, `product_cache`, `canonical_asset`, `session_asset`).

**Waits** are the stretches the learner sits through:
- **before_hooks:** the previous answer's evaluation plus hook generation. These are counted as blocking (ponytail: drop them if the contract generates hooks while the learner reads).
- **for_material:** click to first material. When material was not run, this is click to validated action, flagged as a lower bound.
- The learner simulator's own thinking time is never a wait.

**Session latency:**
- mean / p50 / p95 per source for decision, hooks, first material and complete material;
- the same by modality, by action type and by cache status;
- total waiting time and the wait-to-learning ratio;
- `learner_wait_fraction` = wait / (wait + estimated learning);
- the longest wait;
- wait buckets: <2 s, 2-5, 5-10, 10-30, 30-60, >60;
- `time_to_first_active_learning`, which keeps its measured-wait part and its estimated-learning part apart.

## 5. Metrics

- **Modality:**
  - counts and percentages, distinct modalities, switch rate, same-modality repetition rate, repeated within the previous 3;
  - the maximum run with its step range, the most-common percentage, active/passive;
  - modality chosen per evidence state of the targets;
  - evidence outcome per modality (improved, regressed, unchanged).
  - Normalized entropy divides by log(K), where K is the modalities AVAILABLE in those steps. An unavailable Avatar or Motion is never a diversity failure.
- **Repetition:**
  - longest identical card-type run, near-duplicate activities (by material signature, or debug-summary Jaccard), explanation-only and quiz-only sequences;
  - longest passive run and longest high-effort run.
  - Flagged sequences (length ≥ `boring_run_length`) carry `justified: null` until the session reviewer decides.
- **Hooks:**
  - distinctness (mean pairwise 1 - Jaccard), repeated from the previous set, repeated `learning_goal`, generic commands ("Learn softmax"), curiosity questions ("What if every score were identical?") and answer-revealing hooks;
  - selection rate, position bias, overrides by a typed request, stale-set rate, sets unchanged after an evidence change, and hooks repeatedly ignored.
  - The checks are lexical heuristics. The reviewer scores quality.
- **Reason codes:** deterministic checks.
  - `repair_misconception` needs a misconception on a target.
  - `fill_prerequisite_gap` needs a gap on, or for, a target.
  - `vary_modality` needs a repeated modality in the previous three decisions.
  - `advance_goal` needs an unfinished target.
  - Unknown codes are listed as unchecked, never guessed. The code-to-rule map is data in the taxonomy.
- **Evidence:**
  - concepts encountered, claims tested, transitions (by type and by claim);
  - misconception and prerequisite repair latency, plus the unresolved ones;
  - time on already-understood targets, the progression/remediation ratio;
  - claims still not observed at the end, and decisions left unchanged after the evidence changed.
- **Engagement:**
  - meaningful learner actions, learning time before the first active step, the gaps between active steps;
  - active-opportunity candidates (passive after passive while an active modality was available). These are candidates only.
- **Completion:** end reasons and the decisions and learning time at the end (drop-off).
- **Variety with purpose:** `fit * (diversity + (1 - diversity) * justified_rate)`.
  - `fit` is the reviewer's `modality_appropriateness` rescaled to 0-1.
  - A diverse but unfit session scores low. A repetitive session whose repetitions are all justified keeps its fit.

`aggregateEvents(events)` folds the events into sessions and returns `global`, `completion`, and `groups.{session,
canvas, user_canvas, user, journey, section, planner}`. Every level uses the same `groupMetrics`. `aggregate(bundles)`
produces the eval's `aggregate.json` per simulated profile, with the owner's sections.

## 6. The simulated learner and the reviewer

**Learner simulator** (`claude-sonnet-5-5` recommended; not called yet):
- **Sees:** its hidden profile, the topic goal, the material summary, the hook texts and its own past exchange.
- **Never sees:** reason codes, rationale, expected evidence, evidence state, hidden learning goals or answers (`learnerView`).
- **Reply parsing:** `parseLearnerReply` is strict. It refuses an option that wasn't offered and any profile label in its text.

**Hidden profile:** the Tutor never receives "novice", "intermediate" or "advanced".
- `assertNoProfileLeak` checks every learner-originated payload and the adapter's reported planner input. A hit ends the session (`profile_leak`).
- Ids are opaque.

**Session reviewer** (`claude-opus-5-5`, one call per session; not called yet):
- `reviewerView` passes the folded trace, without the profile and without hidden reasoning.
- `parseReview` requires ten scores from 1 to 5, findings that cite recorded steps, and a justified/unjustified judgement for each flagged sequence.

## 7. Interfaces this eval expects to consume (from the Learning checkpoint)

These plug into the injected functions of `runSession`:

| Injected | Needs from the product |
|---|---|
| `tutor.start()` | The learner's starting evidence for the topic, as claim states (`deriveClaimStates` shape) with concepts, plus canvas/journey/section context. |
| `tutor.decide(input)` | One real `runTurn` / `planTurn` decision on learner-visible input. The decision fields: action type, modality, card type, generic `reason_codes`, rationale summary, target concepts, `expected_evidence`, `estimated_learning_seconds`, available modalities, planner model and version. Also the exact planner input, for the leak check. |
| `tutor.observe(response)` | The real evidence path on the learner's answer (deterministic, then JEV, then the larger evaluator), and the resulting claim states. It must not be re-evaluated by the next `decide`. |
| `hooks()` | The validated HookSet: 3 options with id, position, hook text and `learning_goal`, plus a set id. |
| How a selection enters the Tutor | `selected_next_step`: how the chosen hook reaches the next decision (input to `decide`). |
| `materialize()` | The production material generator up to a validated learner-facing payload, with `timing_source` and `cache_status`. Motion, Avatar and video stay `not_run` unless separately approved. |
| Taxonomy | The product's modality list (active/passive, effort, family) and reason codes, to replace `taxonomy.provisional.json`. |

## 8. Provisional assumptions to reconcile

- **A1.** `next_steps_ready.options` items are `{ id, position, text, learning_goal }`. The learner view drops `learning_goal`.
- **A2.** `tutor_action_ready.decision` is `{ action_type, modality, card_type, reason_codes, rationale_summary, target_concepts, expected_evidence }`, with `estimated_learning_seconds` and `available_modalities` beside it.
- **A3.** Reason codes and their meanings are the owner's examples (`repair_misconception`, `fill_prerequisite_gap`, `vary_modality`, `advance_goal`). The modality list is the owner's examples.
- **A4.** Hooks are generated after the learner's answer is evaluated, and the learner waits for them (`before_hooks` counts as blocking).
- **A5.** The first decision has no hooks: the learner's opening message leads.
- **A6.** Evidence is a full claim-state snapshot per `evidence_updated`, not a delta.
- **A7.** `trace_schema_version` `tutor-trace-eval-0` becomes the Learning agent's TutorDecisionTrace version.

## 9. Cost and models

- **Ledger.** `createLedger(ceiling)` guards every call against its worst case (input characters / 3 + `max_tokens`) before the call is made, and records the real usage after it.
- **Prices.** USD per MTok: Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, cache read $0.20, cache write 1.25x input (claude-api skill, cached 2026-09-25).
- **Unpriced models.** A model with no price refuses to be recorded, so an unbounded call cannot slip under the ceiling.
- **Ceiling.** $4.00 for the first three-session experiment.
- **O2.** JEV (Typesafe AI) has no price in the ledger. Its calls need a price, or an owner decision that they sit outside the $4 ceiling.

## 10. Open questions

- **O1.** How the offline run gets a topic domain for logistic regression. The options are a journey created through the real LP1 path, with a local D1, or the checkpoint's generic domain.
- **O2.** JEV pricing for the ceiling (above).
- **O3.** Whether hooks are generated while the learner reads (A4).

## 11. Commands

```bash
node --test tests/evals/tutor-session/*.test.mjs        # free, in make test-unit
node tests/evals/tutor-session/run.mjs aggregate <dir>  # session files -> aggregate.json, steps.csv, table
node tests/evals/tutor-session/run.mjs events <jsonl>   # any event stream -> grouped metrics
```

No paid simulation is wired. It needs the checkpoint SHA and then the integration map reviewed by the owner.
