# Tutor architecture v2 (NanoGPT Attention slice)

Branch `feature/tutor-architecture-v2`, worktree `tutor-architecture-v2`. Not merged to `main`; the
owner approves that separately. Builds on Tutor v1 (`tutor-v1-locked-decisions.md`,
`tutor-v1-implementation-map.md`) and on Baseline A (`main` 36eb783b: planner and larger evaluator
pinned to `claude-opus-5-5`, route telemetry, the per-turn bench record, `e2e/tutor-bench.mjs`).

## Target pipeline

```
Learner -> LearnerTurn -> Intent/Target Resolver -> Claim Candidate Selector (B)
  -> Deterministic Practice Evidence -> JEV -> Explicit Escalation Policy (C)
  -> (only when necessary) Opus 5.5 Larger Evaluator -> Evidence Reconciler (D) -> Evidence Store
  -> Deterministic Pedagogy Router -> Compact Teaching State (E) -> Opus 5.5 Tutor Planner
  -> Action Validator / Policy Gate (F) -> TutorActions -> Chat / Canvas / /dive
```

Evaluation != pedagogy != planning != execution. The router stays deterministic; the planner
implements its strategy inside the allowed actions; the validator has the last word on what runs.
JEV keeps its locked 800 ms budget. No stage adds an autonomous agent.

## Stages (all pushed to `origin/feature/tutor-architecture-v2`)

| Stage | Change | Main code | SHA |
|---|---|---|---|
| A | Baseline A merged from `main` 36eb783b | - | `4e5f81a1` |
| B | Claim candidate selector; JEV and the router work on the selected claims | `learn-tutor-select.js` | `cf0ced90` |
| C | Explicit escalation policy | `agents/learn-tutor-escalation.js`, `learn-tutor-routes.js` | `3d21d20f` |
| D | Evidence reconciler | `learn-tutor-evidence.js` `reconcile()` | `87349353` |
| E | Compact Teaching State (+ the slice check reading it, `697bb4f3`) | `learn-tutor.js` `plannerContext()` | `b8424cdf` |
| F | Action validator / policy gate | `learn-tutor-validate.js` | `a17e67b0` |
| trace | Turn-level tracing wired through every stage, guarded `--live` corpus runner | `learn-tutor-trace.js` | `f4eddade` |

### Turn tracing

Every turn's `bench` record (the `small:tutor-bench` event) carries `trace`: a `trace_id`,
`started_at`, and per stage `{ stage, start_ms, ms, status: ok|error|timeout, result }` for
target_resolution, practice_evaluation, claim_selection, evaluate, jev and larger (the worker's own
timings from Baseline A's route telemetry, with the escalation reason), evidence_reconciliation,
router, planner, action_validation; and marks `reply_ready` and `canvas_action_complete` from the
UI. A failed planner call carries the partial trace on its error. Results are categories and counts,
never learner text or secrets. `tutor-bench.mjs` measures the first visible reply in the DOM.

### B. Claim candidate selector

Candidates: the turn's claims (target card / part / selected object, the open question's claim, the
returned-from claim, else the hole's concept) and their prerequisite concepts' claims. Kept: claims
with a cue phrase in the learner's words (matched at word starts, so "already" is not "read"), then
a concept name ("softmax") for a concept none of whose claims matched a cue (a name inside a matched
cue, "after softmax", does not count), plus the forced claims. No match at all keeps the target
claims (JEV's engaged check still gives an untouched claim no events). JEV evaluates, and the router
routes on, the selected claims; a turn without words (slash, opening) keeps the turn's claims.
`ponytail:` hand-written cues over 10 claims; a learned or JEV-side selector when the registry grows.

Locked semantic rule: evaluate ideas the learner actually attempted; questions and requests are not
failed explanations; untouched ideas never receive fail evidence.

### C. Explicit escalation policy

| JEV result | Decision |
|---|---|
| error / timeout | no larger evaluator; nothing stored from the failed evaluation; the Tutor answers safely |
| settled | no larger evaluator |
| uncertain, low consequence (an idea, transfer or attempt check) | keep JEV's events unsettled; one clarifying question (router row `uncertain_unsettled`) |
| uncertain gap check | larger evaluator (it decides a Rabbit Hole suggestion) |
| uncertain named misconception whose id already has one settled event on the claim | larger evaluator (a second one starts Socrates) |
| confident pass beside an uncertain or confident misconception on one claim, or the reverse | larger evaluator (contradiction) |

The browser sends `prior_misconceptions` per claim; the worker stores nothing. The escalation reason
is in the route telemetry (`larger.reason`). This supersedes GT-08's "JEV uncertain -> larger
evaluator" (owner spec 2026-09-30).

### D. Evidence reconciler

`reconcile(store, evaluation, ref)` is the one place evaluator observations become store events; the
locked derivation (`deriveClaimStates`) turns all events into the five states. A failed evaluation
adds nothing. It returns the per-claim state transitions for the trace. The v1 derivation already
met the spec (one fail is never a misconception; a later settled transfer pass supersedes;
conflicting evidence is uncertain; no percentages), so D is an explicit boundary plus tracing, with
tests for those rules; no behaviour changed.

### E. Compact Teaching State

The planner input is exactly `{ learner_intent, target, relevant_evidence, route, allowed_actions,
relevant_authored_content, learner_constraints, recent_relevant_context, dive_context }`:
the routed and selected claims (at most 4) and their concepts' states only; the cards that bear on
the turn (the target, its ladder neighbours when it is on the ladder, the cards teaching those
concepts) instead of the whole catalogue; two recent turns; the hole and the return context.
`learner_intent.kind` is deterministic (slash, opening, returned, answer, request, question,
explanation). The planner system prompt names the new fields.

### F. Action validator / policy gate

Per proposed action, in order: schema -> route permission (+ the explicit-request row, no_quiz, one
question, at most 3) -> resource existence (card, part, ladder step, practice task, cited source) ->
consent (navigation only on the learner's words, a slash or "Keep it on this canvas"; a Rabbit Hole
is only ever suggested). One decision `{ type, accepted, stage, reason }` each; the bench record
carries the rejections. New over v1: a constraint stated in this very message ("Don't quiz me")
binds this turn; `suggest_depth` with no ladder step, `suggest_practice` on a card with no practice
and citations to missing sources are rejected rather than silently ignored.

## Corpus and runners

`packages/web/e2e/tutor-corpus.mjs`: 27 traces, 39 turns. The 11 golden traces (GT-01, 02, 03, 04,
06, 07, 11, 12 and GT-D1/D2/D3 as one trace) plus: correct explanation (transfer), partial,
ambiguous, misconception once, repeated misconception, questions and requests, "explain another
way", explicit implementation / part request, `/deeper`, `/simplify`, prerequisite gap, Rabbit Hole
suggestion with a long reply, child turn, return to parent, practice pass/fail, evaluator
disagreement (uncertain gap, uncertain second misconception, contradiction), JEV error,
larger-evaluator error, selection ("Why is this zero?"), `no_quiz`, invalid planner actions. Each
turn carries stub answers and the TARGET behaviour, so every stage is scored against the same
expectations.

- `node e2e/tutor-corpus-run.mjs --stage X --out dir` (free): runs the corpus through `runTurn` and
  the worker's real `/evaluate` path with stubbed models. Scores selection, evaluation, evidence,
  route, actions; counts calls, JEV questions, planner input tokens (estimate: characters / 4),
  rejections by stage, authored/generated rates; records each turn's trace.
- `--live` (PAID): the same corpus on the real models with latency, tokens and cost
  (`--price-in/--price-out`). Refused unless `TUTOR_BENCH_PAID=GO`.
- `e2e/tutor-bench.mjs` (Baseline A): the golden turns through the real UI; `--stub` is free.

The golden traces stay the unit gate (`src/learn-tutor.test.mjs`, 11/11 at every stage).

## Results (stub, free)

Stub corpus, 39 turns, the same runner on every stage SHA:

| Stage | pass | golden corpus traces | selection | evaluation | evidence | route | actions | JEV q/call | claims sel/avail | larger calls/turn | escalation rate | planner in-tokens est p50 / p95 | rejected (by stage) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 0.795 | 6/9 | 0.714 | 0.962 | 0.968 | 0.923 | 0.973 | 9.36 | 1.69 / all | 0.103 | 0.111 | 3106 / 3347 | 8 |
| B | 0.923 | 9/9 | 1.000 | 0.962 | 0.968 | 1.000 | 0.973 | 8.89 | 1.56 / 3.03 | 0.103 | 0.111 | 3106 / 3347 | 8 |
| C | 0.949 | 9/9 | 1.000 | 1.000 | 0.968 | 1.000 | 0.973 | 8.89 | 1.56 / 3.03 | 0.077 | 0.083 | 3106 / 3347 | 8 |
| D | 0.949 | 9/9 | 1.000 | 1.000 | 0.968 | 1.000 | 0.973 | 8.89 | 1.56 / 3.03 | 0.077 | 0.083 | 3106 / 3347 | 8 |
| E | 0.949 | 9/9 | 1.000 | 1.000 | 0.968 | 1.000 | 0.973 | 8.89 | 1.56 / 3.03 | 0.077 | 0.083 | 2447 / 2777 | 8 |
| F | 1.000 | 9/9 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 8.89 | 1.56 / 3.03 | 0.077 | 0.083 | 2447 / 2777 | 9 (route 5, consent 2, resource 2) |

UI (`tutor-bench.mjs --stub`, 9 golden turns): A, E and F all 9/9 as expected, no errors, hangs or
error UI; `tutor-slice-check.mjs` (stub) passes on the scratch B-F build and on E and F.

What moved each number:
- B: route 0.923 -> 1 (GT-07#1, GT-D#3: an understood claim was routed as `not_yet_observed`
  because an untouched sibling claim came first); selection 0.714 -> 1 (GT-12, GT-D#3, partial,
  "why does softmax make these weights sum to one?"); JEV questions per call -5%.
- C: evaluation 0.962 -> 1 and escalation 0.111 -> 0.083 (the ambiguous "kind of in the middle"
  answer gets a clarifying question instead of an Opus call).
- E: planner input -21% (p50 3106 -> 2447 estimated tokens); no quality change.
- F: actions and evidence -> 1 ("Don't quiz me" no longer gets a question in the same turn, so the
  next message is not read as an answer).
- Stub authored-reuse / generated-text rates (0.231 / 0.538) are fixed by the scripted plans; only
  a live run measures them.

Limits of the stub numbers: model latency, tokens, real JEV uncertainty (hence the real escalation
rate) and planner action accuracy need the paid runs.

## Paid benchmark proposal (needs GO BENCHMARK)

Baseline A (`4e5f81a1`) vs Candidate F (`f4eddade`), each: `tutor-bench.mjs` x 3 runs (9 UI turns,
first run cold) and `tutor-corpus-run.mjs --live` x 2 (39 turns). 2 x (27 + 78) = 210 Tutor turns.

| | A | F | total |
|---|---|---|---|
| Tutor turns | 105 | 105 | 210 |
| JEV calls (0.89-0.92 per turn) | ~96 | ~96 | ~192 |
| Opus larger-evaluator calls | ~11 (stub rate) - 96 (every JEV uncertain) | ~8 - ~40 | ~19 expected, 192 worst case |
| Opus planner calls | 105 | 105 | 210 |

Cost, Anthropic only, at Opus 5.5 $4 / MTok in and $20 / MTok out (claude-api skill model table,
cached 2026-09-25, first-party rates): planner ~2.4-3.1k input tokens (estimate) and an unknown
output (tool call plus always-on thinking at the default `medium` effort; assumed 0.5-2k) ->
$0.02-0.05 per call, $4-11 for 210 calls; larger evaluator ~$0.01-0.04 per call, $0.2-0.8 expected,
~$7 worst case. Total expected ~$5-12, worst case ~$18. JEV (TypeSafe) price unknown: ~192 calls.

## Open questions for the owner

- "Untouched ideas never receive fail evidence": implemented at claim level (B + JEV's engaged
  check). Inside a claim the learner engaged, an unstated idea still gets a fail event (v1). Reading
  the rule per idea would drop those fails; it changes no state on the corpus but would let a
  one-idea transfer pass mark a claim understood. Kept v1; needs a decision.
- Opus 5.5 thinking is always on (effort default `medium`); planner latency depends on it. Baseline A
  does not set effort. Worth measuring in the paid run before tuning.
