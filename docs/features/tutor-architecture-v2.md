# Tutor architecture v2 (NanoGPT Attention slice)

Branch `feature/tutor-architecture-v2`, worktree `tutor-architecture-v2`. Not merged to `main`; the
owner approves that separately. Builds on Tutor v1 (`tutor-v1-locked-decisions.md`,
`tutor-v1-implementation-map.md`) and on Baseline A (the telemetry and `tutor-bench.mjs` harness
from `main`).

## Target pipeline

```
Learner -> LearnerTurn -> Intent/Target Resolver -> Claim Candidate Selector (B)
  -> Deterministic Practice Evidence -> JEV -> Explicit Escalation Policy (C)
  -> (only when necessary) Opus 5.5 Larger Evaluator -> Evidence Reconciler (D) -> Evidence Store
  -> Deterministic Pedagogy Router -> Compact Teaching State (E) -> Opus 5.5 Tutor Planner
  -> Action Validator / Policy Gate (F) -> TutorActions -> Chat / Canvas / /dive
```

Evaluation != pedagogy != planning != execution. The planner never redefines the router's policy;
the validator has the last word on what runs.

Models: the Tutor Planner and the larger evaluator use `claude-opus-5-5` (pinned on `main` by
Baseline A, no silent fallback). JEV stays the first-stage evaluator with its locked 800 ms budget.

## Stages

| Stage | Change | Code | SHA | Stub corpus | Golden (unit) |
|---|---|---|---|---|---|
| A | Baseline A from `main` (telemetry, bench harness) | main | pending merge | see Results | 11/11 |
| B | Claim candidate selector | `learn-tutor-select.js` | - | - | - |
| C | Explicit escalation policy | `agents/learn-tutor-escalation.js` | - | - | - |
| D | Evidence reconciler | - | - | - | - |
| E | Compact Teaching State | - | - | - | - |
| F | Strengthened action validator | - | - | - | - |

### B. Claim candidate selector

`packages/web/src/learn-tutor-select.js`. Candidates: the turn's claims (target card / part /
selected object, the open question's claim, the returned-from claim, else the hole's concept) and
their prerequisite concepts' claims. Kept: claims with a cue phrase in the learner's words (matched
at word starts), then a concept name ("softmax") for a concept none of whose claims matched a cue,
plus the forced claims (open question, returned-from). No match at all keeps the target claims, so
an explanation in unusual words is still evaluated; JEV's own engaged check still gives an
untouched claim no events. Measured per turn: claims available, claims selected, selection ms, JEV
questions per call.

Locked semantic rule: evaluate ideas the learner actually attempted; questions and requests are not
failed explanations; untouched ideas never receive fail evidence.

### C. Explicit escalation policy

`packages/control-plane/src/agents/learn-tutor-escalation.js`, called by the worker after JEV:

| JEV result | Decision |
|---|---|
| error / timeout | no larger evaluator; no evidence from the failed evaluation; the Tutor answers safely |
| settled | no larger evaluator |
| uncertain, low consequence (an idea, transfer or attempt check) | keep JEV's events unsettled; route to one clarifying question |
| uncertain gap check | larger evaluator (it decides a Rabbit Hole suggestion) |
| uncertain named-misconception check whose id already has one settled event on the claim | larger evaluator (a second one starts Socrates) |
| a confident pass beside an uncertain or confident misconception on the same claim (or the reverse) | larger evaluator (contradiction) |

The browser sends `prior_misconceptions` per claim (it holds the evidence; the worker stores none).
Key metric: `larger_evaluator_escalation_rate` = turns with a larger call / turns with a JEV call.
This supersedes GT-08's "JEV uncertain -> larger evaluator" (owner spec, 2026-09-30).

## Corpus

`packages/web/e2e/tutor-corpus.mjs`: 27 traces, 39 turns. The 11 golden traces (GT-01, 02, 03, 04,
06, 07, 11, 12 and GT-D1/D2/D3 as one trace), plus correct (transfer), partial, ambiguous,
misconception once, repeated misconception, question/request, "explain another way", explicit
implementation / part request, `/deeper`, `/simplify`, prerequisite gap, Rabbit Hole suggestion with
a long reply, child turn, return to parent, practice pass/fail, evaluator disagreement (uncertain
gap, uncertain second misconception, contradiction), JEV error, larger-evaluator error, selection
("Why is this zero?"), `no_quiz`, invalid planner actions. Every turn carries stub answers and the
TARGET behaviour (stage F), so each stage is scored against the same expectations.

`packages/web/e2e/tutor-corpus-run.mjs` (free): runs the corpus through `runTurn` and the worker's
real `/evaluate` path with stubbed models, writes `corpus-stub-<stage>.jsonl` and
`.summary.json`. It scores selection, evaluation ladder, evidence, route and actions, and counts
JEV / larger / planner calls, JEV questions per call, planner input tokens (estimate: characters / 4),
authored reuse and generated-text rates. It measures no model latency; paid runs do.

## Results

Stub corpus (39 turns), code at `abc32fd2` before any stage change:

| | pass | golden traces | selection | evaluation | evidence | route | actions | JEV q/call | larger rate | planner tokens est p50 |
|---|---|---|---|---|---|---|---|---|---|---|
| v1 (abc32fd2) | 0.795 | 6/9 corpus traces | 0.714 | 0.962 | 0.968 | 0.923 | 0.973 | 9.36 | 0.111 | 3106 |

Failures on v1 and the stage expected to fix each:
- GT-07#1, GT-D#3 route: an understood claim routes as `not_yet_observed` because an untouched
  sibling claim on the card is first in the router's list (B: route on the selected claims).
- GT-12, GT-D#3, B-partial, B-question-softmax selection: untouched claims sent to JEV (B).
- B-ambiguous evaluation: a low-consequence uncertain answer calls the larger evaluator (C).
- B-no-quiz#0 actions: "Don't quiz me" still gets a question in the same turn (F); #1 evidence:
  the next message is read as an answer to that question.
