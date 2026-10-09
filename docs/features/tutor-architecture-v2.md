# Tutor architecture v2 (NanoGPT Attention slice)

Branch `feature/tutor-architecture-v2`, worktree `tutor-architecture-v2`. Not merged to `main`; the
owner approves that separately. Builds on Tutor v1 (`tutor-v1-locked-decisions.md`,
`tutor-v1-implementation-map.md`) and on Baseline A (`main` 36eb783b: planner and larger evaluator
pinned to `claude-opus-5-5`, route telemetry, the per-turn bench record, `e2e/tutor-bench.mjs`).

## Voice latency brief (owner, 2026-10-01)

Voice latency is now the primary requirement: speech end -> first useful Tutor audio, baseline about
11.8 s (Opus 5.5 planner ~7.7 s, larger evaluator ~4.15 s on ~25% of turns, JEV ~188 ms, STT commit
~602 ms, Fish first byte ~210 ms). Targets: under 2 s on routine voice turns, 3-4 s on graded turns,
first canvas action under 2-3 s, with evidence correctness unchanged. The brief's checkpoints A-I
map onto this branch as follows (the stage letters in the sections further down are the earlier,
pre-brief ones):

| Brief checkpoint | Change | Earlier stage | SHA |
|---|---|---|---|
| sync | `origin/main` ce856371 merged; `make test-unit` green, 11 golden traces, corpus 39/39 | - | `6cc903ee` |
| A | Baseline telemetry: Baseline A + turn traces + guarded `--live` runner | A + trace | `4e5f81a1`, `f4eddade` |
| B | Claim candidate selector | B | `cf0ced90` |
| C | Critical-path evaluation policy | new | `094a7896` |
| D | Explicit escalation policy | C | `3d21d20f` |
| E | Evidence reconciler | D | `87349353` |
| F | Compact Teaching State (+ the action validator, earlier F) | E, F | `b8424cdf`, `a17e67b0` |
| G | Optimized Opus planner | new | `729ba135` |
| H | Tiered planner candidate | new | `81bab0ea` |
| I | First-sentence streaming candidate | new | `c2fd4b5c` |
| bench | The paid runner prices each call by its model | - | `58be8fe3` |

Nothing is merged to `main`, nothing deployed, no paid call made. Every new knob is off by default,
so the dev worker on this branch behaves as checkpoint F plus C and G's schema and prompt.

### C. Critical-path evaluation policy (`criticalPath` in `learn-tutor.js`)

Decided before any model call, from the deterministic intent and the evaluation spec:

| Turn | Evaluation |
|---|---|
| an answer to the Tutor's question | blocks the reply |
| an explanation (anything not a request or a "?" question, so "When it reads a character it looks back..." blocks) | blocks |
| a request, or a question ending in "?", whose claims carry a prerequisite check | blocks: a gap turns the reply into a Rabbit Hole suggestion (GT-06) |
| any other request or "?" question; a turn back from a hole (its route ignores evidence) | runs beside the planner; its evidence is stored when it lands |

Off the critical path the router uses the prior evidence; when the evaluation lands it is reconciled
like any other, and if the route it would have produced differs, the trace records a critical-path
miss (`bench.critical_path.miss`). Slashes and hole openings were never evaluated. `ponytail:` a
stated belief phrased as a question ("Isn't the mask after softmax?") is routed on prior evidence; the
miss count shows whether the rule needs tightening. runTurn still returns after the evaluation lands
(the store must hold it before the next turn); only the spoken first sentence (I) is earlier.

### G. Optimized Opus planner

- `tutor_response` lists `actions` first and requires only `actions` and `strategy`; `move` and
  `reason` are optional (nothing reads them). The prompt asks for respond_text as the first action
  with a first sentence that stands alone, so the speakable sentence comes early in the output.
- `TUTOR_PLANNER_EFFORT` (low, medium, high, xhigh, max) sets `output_config.effort`; unset keeps the
  model default (medium on Opus 5.5, whose thinking cannot be switched off). Planner input stays the
  compact Teaching State (F); the new prompt line adds ~50 estimated tokens.
- The corpus now scores action types in any order (the planner writes respond_text first).

### H. Tiered planner candidate

With `TUTOR_PLANNER_FAST_MODEL` set to `claude-haiku-4-5` or `claude-sonnet-5-5` (optional
`TUTOR_PLANNER_FAST_EFFORT`), `plannerTier(context)` sends a routine turn - a question, request,
slash or hole opening on the rows `slash`, `off_slice`, `not_yet_observed`, `understood`, `gap`,
`gap_inline` - to the fast model with the same system prompt, Teaching State, route and allowed
actions; it cannot change policy, and the browser's validator gates its plan like any other. Opus 5.5
plans everything else (misconceptions, uncertain or unsettled evidence, returns, every explanation
and answer), and re-plans a fast turn whose plan errors, has an action outside the allowed types or
has no words to say (`telemetry.escalated`, with the fast call's own telemetry).

### I. First-sentence streaming candidate

`POST /api/learn/tutor/plan` with `stream: true` answers NDJSON: `{type:'sentence', text}` as soon as
the plan's first sentence exists, then `{type:'plan', ...}` or `{type:'error', ...}`. The worker
streams the planner with `eager_input_streaming` and parses the tool input strictly at the end
(invalid JSON is an invalid turn). `firstSentence` gives a sentence only when the final gate cannot
drop or cut it: it is the first respond_text, every action before it is typed and not respond_text,
it is within the first three actions, and it has ended (". " inside the text, or the closed text ends
on . ! or ?). The browser speaks it only if `speakable(sentence, routed)`: respond_text is allowed by
the route itself (not only by an explicit request that arrives later in the plan) and it is prose (2-300
characters, no code). `runTurn({ onSpeakable })` asks for the stream and passes `{ onSentence }` as a
third `post` argument; `readPlanStream(response, onSentence)` is the client reader for that post. The
trace marks `first_sentence`, and `bench.spoken.consistent` checks that the validated reply opens with
the spoken sentence. Under `SUBSCRIPTION_ONLY` (text-only replay) the planner does not stream and
nothing is spoken early. `LearnTutor.jsx` is unchanged: the text chat does not use it; the voice client
wires it (see "Voice MVP conflicts").

## Decisions 1-7 (owner, 2026-10-01)

Implemented with free/scripted tests only; no paid call. Checkpoints (pushed, no force):

| Checkpoint | Decision | SHA |
|---|---|---|
| B | D1 evaluation dependency | `8223fc31` |
| C | D4 constraint-first questions, D2 held fast-tier sentences, D3 exact model ids | `3d6c42e3` |
| D | D7 per-idea evidence (merge of the sub-agent branch) | `644f6955` |
| E | D5A prompt-caching request construction | `a460108e` |
| F | D5B Opus 5.5 fast-mode arm (documented support), D5C evaluator fixed | `629d851a` |
| G | Benchmark arms A-E, groups, decision-6 gates | `d8906c2f` |
| H | Owner's final answers A-D: late-evidence tests and metrics, arm F, routine x5 | see git log |

### D1. Evaluation dependency

- `criticalPath(intent, spec, priorRow)`: a request or "?" question that the PRIOR evidence routes to an
  evidence row (`EVIDENCE_ROWS`: gap, gap_inline, misconception, misconception_explain, uncertain,
  uncertain_unsettled) now blocks (`evidence_row`): a gap-, misconception- or uncertainty-specific
  intervention waits for this turn's evaluation. Off the path remain neutral answers, clarification,
  simple requests, show-card requests, slashes (never evaluated) and returns.
- While evaluation is pending, only an evidence-independent sentence is spoken (`speakable`), and the
  evidence actions (`EVIDENCE_ACTIONS`: suggest_dive, suggest_practice, suggest_depth, ask_question) are
  released only after the evaluation lands. If it changed the route (a critical-path miss) they are
  dropped (decision stage `evidence`); the words stay. `ponytail:` dropped, not re-planned.
- `bench.ms` measures separately `to_first_safe_sentence`, `to_evidence_ready` and
  `to_first_evidence_action`; the corpus summary reports them as `evaluation_dependency`.
- Stub corpus: off-path turns 5 -> 3 of 36 (GT-03#0 and GT-07#0, a belief phrased as a question on a
  prior misconception, GT-D#1 on gap_inline and both B-no-quiz turns on uncertain now wait), no misses,
  pass 1.000, golden 9/9.

### D2. Fast tier vs Opus replacement

`planTurn` holds a fast-tier sentence until the fast plan's actions are complete in the stream and pass
`fastPlanProblem` (Professor Next Steps: `move`, `reason` and `reason_codes` are written after the actions,
so they never hold it; a plan with nothing after its actions releases at its end). Only then is it released
(telemetry `first_sentence_ms` = release, `sentence_written_ms` = when the fast model wrote it). The released
head stands: its actions and `explicit_request` are the plan's, whatever the remainder repeats; the
remainder adds only its own fields, and if it is cut, unparsable or lost the plan keeps the spoken actions
with `reason` and `reason_codes` null and telemetry `tail_lost`. An invalid or escalated fast plan speaks
nothing; Opus re-plans and its own first sentence streams under the same rules. No speculative speech, no
rollback. `bench.spoken` now carries `action` and `tier`, and `consistent` checks the whole validated reply
(text actions in order).

### D3. Models

Exact ids, never substituted: fast tier `claude-haiku-4-5-20251001` or `claude-sonnet-5-5`
(`FAST_PLANNER_MODELS`), planner and larger evaluator `claude-opus-5-5` (`LEARN_TASKS`).

### D4. Constraint-first questions (option B)

- `TUTOR_TOOL` order: `constraints_add` (required, may be empty), `constraints_remove`, `explicit_request`,
  `strategy`, then `actions`; the prompt asks for that order and for the first-heard action first.
- `firstSentence` offers the first text action's first sentence (respond_text or ask_question) as
  `{ text, action, constraints_add, explicit_request }`; a question only when `constraints_add` was written
  before the actions and adds neither no_quiz nor just_answer. The NDJSON `sentence` event carries the
  same fields; `readPlanStream` hands the whole event to `onSentence`.
- The browser speaks a question early only if `questionBlocked` finds nothing: evidence pending,
  route without ask_question, constraints unknown, no_quiz / just_answer (session, plan, or the learner's
  own words: `statedConstraints`, which now also binds the final gate and the session), the Socratic-turn
  limit (`misconception_explain`: explain first, then ask), a conflicting explicit request (request or
  slash intent, or explicit_request), and the per-turn question budget (only the first question, within
  the first three actions). A return-to-parent re-check question does not wait for evidence (its route
  ignores evidence). Every check is at least as strict as the final gate.
- Tests: `learn-tutor-questions.test.mjs` (the six regression cases plus Socratic limit, explicit request
  and late constraints), D2 cases in `learn-tutor-stream.test.js`.
- Stub corpus: early sentence 0.769 -> 0.974 of planner turns; question turns 9/9 early (none before);
  consistency 1.0; sentence ready at p50 0.582 / p95 0.905 of the tool output (control fields first).

### D7. Per-idea evidence (built by a sub-agent on a local branch, merged here)

- JEV (and the larger evaluator, same checks) gets one contradiction check per idea, `c{c}_contra{i}`.
  Per idea of an engaged claim: stated -> pass, contradicted -> fail, untouched or unsure -> no event,
  for prompted and unprompted explanations alike; questions and requests stay non-attempts. Free-text
  events carry `idea`. Misconception events still need the named wrong idea asserted.
- `understood` additionally needs coverage: every idea has a settled pass, or a claim-level settled pass
  (deterministic practice, no `idea`). One idea passed in transfer leaves the claim `uncertain`.
- Completeness exception: deterministic card practice stays claim-level, so an incomplete enumeration
  (c11 "0 to Q-1", which leaves out the position itself) is still a fail. Conversational explanations
  never fail an idea they leave out.
- Escalation reads `contra`: an uncertain contradiction check alone is low consequence; one idea both
  stated and contradicted is a contradiction. The router's `unclear` check includes `contra`.
- Tests: control-plane evaluationFrom (owner's softmax example, contradiction, prompted answer touching
  one idea, misconception only) and escalation; web reconcile (coverage, practice, completeness).
- Corpus +4 traces / 5 turns (44 turns). Stub, same 44 turns before -> after: free-text fail events 23 ->
  1 (the one is the deliberate contradiction turn; 20 -> 0 on the original 40 turns), misconception
  events 10 -> 10, larger-evaluator escalation 0.073 -> 0.073, evidence dimension 0.944 -> 1.0. Cost:
  JEV questions per call 9.05 -> 12.05 (one more check per idea); its latency effect needs the paid run.

### D5A. Prompt caching (request construction only)

`TUTOR_PLANNER_CACHE=on` (off by default; never under `SUBSCRIPTION_ONLY`, whose bridge's handling of a
cached system block is unverified) sends the system prompt as one block with
`cache_control: { type: 'ephemeral' }`. Render order is tools -> system -> messages, so that single
breakpoint caches exactly the stable material: the `tutor_response` tool schema and the fixed Tutor policy
prompt (~1.4k tokens). The Teaching State and the canvas's context documents stay in the uncached user
message. Minimum cacheable prefix (claude-api skill, cached 2026-09-25): 512 tokens on Opus 5.5 and
Sonnet 5.5, 4096 on Haiku 4.5, so Haiku requests silently do not cache. Prices: write 1.25x input (5-minute
TTL), read $0.20 / MTok on Opus 5.5 and Sonnet 5.5, 0.1x on Haiku. Telemetry gains
`cache_creation_input_tokens` / `cache_read_input_tokens` only when caching is on (Baseline telemetry
unchanged). Tests (`learn-tutor-speed.test.js`, no model call): the prefix is byte-identical across
learners, no marker inside the learner message, context and documents stay out of the cached prefix, off
and subscription mode keep the Baseline string system, the fast tier caches the same prefix. No latency
gain is claimed: the paid run measures cold (write) vs warm (read) requests, tokens, cost and latency.

### D5B. Opus 5.5 fast mode: SUPPORTED (documented), arm C

Documented without a live call (claude-api skill, cached 2026-09-25, "Fast Mode" and platform
availability): a research preview for Claude Opus 5.5 (also Opus 5 / 4.8) on the first-party Claude API
only (not Bedrock, Vertex, Foundry or Claude Platform on AWS); every request needs the beta
`fast-mode-2026-02-01` and the top-level `speed: "fast"`; $8 / $40 per MTok (2x); up to 2.5x output
tokens per second; own rate limit; `usage.speed` reports the speed used; switching speed invalidates the
prompt cache. `TUTOR_PLANNER_SPEED=fast` (off by default) adds both to the Opus planner request only
(never the fast tier, never under `SUBSCRIPTION_ONLY`); `ask.js anthropic()` lifts `body.betas` into the
`anthropic-beta` header. Telemetry keeps `requested_speed` and the served `speed`, so a standard-speed
answer is visible. Not knowable without a call: whether the dev key's organisation has the research
preview. If the paid run gets a rejection, arm C is reported as failed; nothing is retried with other
parameters. Fast mode must pass the same gates as every arm (no quality assumption).

### D5C. Larger evaluator fixed

The larger evaluator stays `claude-opus-5-5` with its frozen request in every arm: a test sends every
planner knob (cache, fast mode, fast tier, effort) and checks the evaluator request carries none of them.
A faster evaluator is a separate, later benchmark on the same JEV-uncertain cases.

### G. Benchmark harness: arms, groups and the decision-6 gates

- `tutor-corpus-run.mjs --live --candidate A|B|C|D|E|F [--group routine]` (PAID, refused without
  `TUTOR_BENCH_PAID=GO`): A Opus 5.5 as Baseline A (no streaming, no cache), B optimized Opus
  (streaming + cache), C B + fast mode, D B + Haiku 4.5 fast tier with Opus escalation, E B + Sonnet 5.5
  fast tier at default effort with Opus escalation, F the same at Sonnet effort low. Opus effort stays at the model default everywhere; JEV and the larger evaluator are
  identical in every arm. The runner refuses a planner or evaluator other than `claude-opus-5-5` or an
  unknown fast model, and reports `served_model_mismatches` and `speed_mismatches`.
- Every turn row carries its `group` (routine / evidence / structural, `GROUP_OF` by category; an
  ungrouped category stops the run), an independent post-validation `audit` (consent, policy,
  nonexistent resource), `evidence_corruption`, `planner_invalid`, `cost_usd` (cache writes 1.25x, reads
  at the model's cache price, fast mode 2x), and the D1 timings. The summary adds `groups`,
  `gate_inputs`, `latency_by_group` (first validated sentence and full plan: p50, p95, mean, max) and
  `cache` (cold write vs warm read requests).
- `e2e/tutor-bench-gates.mjs --arm A=a1.jsonl,a2.jsonl,a3.jsonl --arm B=... [--reference A]
  [--baseline A]` pools every repetition and applies decision 6 in order: hard gates (golden traces pass
  in every repetition; zero consent, policy, nonexistent-resource, spoken-then-replaced and
  evidence-corruption counts), quality (actions, evidence, route as exact numerator/denominator, at most
  2 pp below the Opus reference), reliability (invalid structured plans < 2%; routine fast-tier
  escalation < 20%, counted only on turns routed to the fast tier), cost per turn <= the baseline arm,
  then latency. The winner is the eligible arm fastest on BOTH p50 and p95 of the first validated
  speakable sentence; a split is reported for the owner, never resolved silently; nothing eligible means
  no fast tier ships. `learn-tutor-gates.test.mjs` covers each gate.
- Stub corpus at G: 33 traces, 44 turns (routine 11, evidence 27, structural 6), pass 1.000, golden
  9/9 corpus traces (the 11 golden traces, GT-D1/D2/D3 as one), every gate input 0.

### Owner's final answers (2026-10-01, checkpoint H)

- A. Late evidence: the concurrency model stays. When evidence that lands after planning changes the
  route, the spoken neutral sentence is never retracted, the dependent actions it invalidated are dropped
  (already so since B), there is no automatic second planner call, and the evidence is stored and
  reconciled so the next turn routes on it. Tests: `learn-tutor-critical.test.mjs` "A: late evidence"
  (all five points). Measured per run as `late_evidence` (off-path turns, turns whose evidence landed,
  route changed, dependent actions dropped) and pooled by the gates script.
- B. No session-level question budget: one question per turn, the two-Socratic-turn misconception limit,
  "don't quiz me" and D4's constraint-first validation stay as they are.
- C. Repetitions: routine turns x5 (3 full-corpus runs + 2 `--group routine` runs, which run only the
  traces made entirely of routine turns: exactly the 11 routine turns), evidence-dependent and
  structural turns x3. The gates script reports N, mean, p50, p95 and max per group and per category.
- D. Sonnet effort: arm E is Sonnet 5.5 at its default effort, arm F Sonnet 5.5 at effort low
  (documented for Sonnet 5.5). Haiku 4.5 takes no effort parameter; the runner refuses one.
- A refused request is never retried: a planner HTTP 4xx other than 429, a refused fast-tier call, or
  arm C answered at a speed other than fast stops that run; its rows are stamped `run_aborted` and the
  gates mark the arm unavailable.
- Free results preserved at H: corpus 44 turns, pass 1.000, 9/9 corpus golden traces (11/11 unit golden
  traces), every hard-gate input 0, every quality dimension 1.0, early sentence 0.977, early questions
  9/9, free-text fail events 1, JEV 12.05 checks per call.

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
| uncertain, low consequence (an idea or attempt check) | keep the events that rest on it unsettled; a clarifying question (router row `uncertain_unsettled`), at most 2 on one claim until its evidence progresses |
| uncertain transfer check only | no larger evaluator; the answer's passes settle as `demonstrated_here` with `transfer_unsure: true`, so the claim stays `uncertain`, never `understood` (router row `uncertain`) |
| uncertain gap check | larger evaluator (it decides a Rabbit Hole suggestion) |
| uncertain named misconception whose id already has one settled event on the claim | larger evaluator (a second one starts Socrates) |
| confident pass beside an uncertain or confident misconception on one claim, or the reverse | larger evaluator (contradiction) |
| one idea both stated (yes or unsure) and contradicted (yes), every check confident or not (beta item 5a, owner 2026-10-09) | larger evaluator (contradiction); the idea is a fail marked `contested`, never a pass, so never an uncontested transfer pass or understood |

Settled per idea (Tutor eval runs A and A2, `tutor-decision-eval.md` 18.1 and 18.3; owner 2026-10-08, r29): an event is settled when the checks it rests on are confident. A pass or fail on idea i rests on the attempt check and idea i's own two checks (stated, contradicted); a pass also on its claim's misconception checks. A misconception rests on the attempt check and its own check; a gap event on its own check. An unsure check on another idea or another claim never unsettles it: an idea the answer did not engage, or whose checks JEV could not settle, gets no event and stays not observed. The transfer check only names a pass's kind (an unsure one keeps `demonstrated_here` with `transfer_unsure: true`). The evaluation's `status` is `settled` when every check but transfer is confident (`evaluationFrom`). `understood` reads current evidence (beta item 5b, owner 2026-10-09): each idea's latest settled event decides it - a pass on it (or a claim-level pass, a probe or practice) covers it, a fail on it or a claim-level fail or named misconception counts against it, so a later fail uncovers an earlier pass and a later pass covers again; `understood` is every idea currently passed plus a settled transfer pass with no later settled negative (`claimCoverage`, `learn-tutor-evidence.js`, the one rule the state, section completion, the planner and the hooks read; it also reports `failed_ideas`). So pass A, fail A, transfer pass B is not understood and completes no section; stating A again does. Unsettled events decide nothing. The planner sees it: each `relevant_evidence.claims[]` carries `coverage { settled_ideas, missing_ideas, transfer_needed }` (idea texts), and shared line 22 tells it to check or teach a missing idea, or ask for a new case, and never to re-check a settled idea; missing evidence is never a pass. The repeated-question limit (`route`, `QUESTION_LIMIT` 2, `store.probes`): at most two Tutor questions on an uncertain claim until its evidence progresses (a new state, a newly settled idea or a new transfer pass, checked before routing); then the `uncertain` row without `ask_question` (explain, a worked example, an authored card, practice or material). An explanation turn is no progress, so it never resets the count. It changes no evidence, completes no section and advances nothing.

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
- `--live` (PAID): the same corpus on the real models with latency, tokens and cost (each call
  priced by its model). `--candidate` picks the planner knobs (G-default, G-low, H-haiku, H-sonnet),
  `--stream` the first-sentence path (also free, on the stubs). Refused unless `TUTOR_BENCH_PAID=GO`.
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

## Results for the voice checkpoints (stub, free)

Same 39-turn corpus, same runner (`--stream` from I on):

| Checkpoint | pass | golden | evaluation off the critical path | misses | planner in-tokens est p50 / p95 | fast-tier share | early speakable sentence | sentence ready at (share of tool output) p50 / p95 |
|---|---|---|---|---|---|---|---|---|
| sync `6cc903ee` | 1.000 | 9/9 | 0 / 36 | - | 2447 / 2777 | - | - | - |
| C `094a7896` | 1.000 | 9/9 | 5 / 36 (0.139) | 0 | 2447 / 2777 | - | - | - |
| G `729ba135` | 1.000 | 9/9 | 5 / 36 | 0 | 2499 / 2828 | - | - | - |
| H `81bab0ea` | 1.000 | 9/9 | 5 / 36 | 0 | 2499 / 2828 | 0.359 (14 / 39) | - | - |
| I `c2fd4b5c` | 1.000 | 9/9 | 5 / 36 | 0 | 2499 / 2828 | 0.359 | 0.769 (30 / 39), all consistent | 0.573 / 0.802 |

Critical-path reasons on the corpus: explanation 18, gap check 10, answer 3, question 2, request 2,
return 1. Escalation rate unchanged at 0.083 of JEV turns (stub). The 9 turns with no early sentence
are Socratic or clarifying turns whose route allows only `ask_question`.

Modeled (not measured) speech end -> first audio, from Baseline A's live component means with the
planner held at 7707 ms: 9012 ms mean (p50 8707) when evaluation always blocks, 8988 ms with C. Taking
JEV off the path saves ~25 ms on average: as the brief says, the planner is the bottleneck, and only
G-I (effort, tiering, the early sentence) can move the headline number. Their effect needs real model
timings: the stub cannot measure thinking time, time to first tool-input byte or output speed.

What the free numbers cannot say: real planner latency per tier and effort, time to the first
sentence, real JEV uncertainty (hence the real escalation rate and the critical-path misses), fast
planner action accuracy and escalation rate, and output tokens after G's schema change.

## Paid benchmark results (GO BENCHMARK 2026-10-01; code dd580111, planner as 6f948c69)

Raw rows, per-run summaries, the driver log, `report.md` (every table) and `gates.json` are in
`docs/features/tutor-v2-benchmark-20261001/` (`node e2e/tutor-bench-report.mjs <dir>` rebuilds them).
Corpus: 18:01-19:45 UTC, one run at a time, 924 planned observations; arm C unavailable. UI reference:
Baseline A code (`main` ce856371), `tutor-bench.mjs`, 3 x 9 golden turns on a private local stack.

Spend: corpus $17.92 (A 5.08, B 3.97, D 2.93, E 3.04, F 2.90, C $0 plus 5 larger-evaluator calls whose
tokens were not recorded, ~$0.10) + UI reference ~$1.21 = ~$19.2 Anthropic (JEV not priced). Calls:
Opus 5.5 planner 591, Opus 5.5 larger evaluator 119 corpus + 14 UI, Haiku 4.5 65, Sonnet 5.5 128 (E 62,
F 66), Opus fast mode 33 attempts all refused, JEV 736 corpus + 24 UI, plus 24 UI Opus planner calls.

Arm C: the organisation has no fast-mode quota (HTTP 429 "rate limit of 0 fast mode input tokens per
minute"). The first run's 33 planner attempts were all refused before the runner treated that 429 as a
refusal (fixed after the run, `refused()`); C was then stamped unavailable and never retried.

First validated speakable sentence, ms from the turn start (N / mean / p50 / p95 / max):

| group | A Opus | B Opus opt. | D Haiku | E Sonnet default | F Sonnet low |
|---|---|---|---|---|---|
| routine | 55 / 9586 / 8546 / 14481 / 16968 | 55 / 9562 / 8950 / 16141 / 18646 | 55 / 5264 / 3573 / 11722 / 15076 | 55 / 5594 / 5051 / 10151 / 10740 | 55 / 4264 / 3643 / 8027 / 10753 |
| evidence | 81 / 8741 / 8082 / 15307 / 20002 | 81 / 8633 / 7671 / 14032 / 17046 | 81 / 8621 / 7701 / 16884 / 19991 | 81 / 8147 / 7514 / 14113 / 16244 | 81 / 8583 / 7458 / 15990 / 22395 |
| structural | 18 / 8690 / 7760 / 13195 / 13195 | 18 / 8312 / 7734 / 15226 / 15226 | 18 / 7731 / 7074 / 17563 / 17563 | 18 / 8472 / 8227 / 11955 / 11955 | 18 / 6897 / 6432 / 15435 / 15435 |
| all | 154 / 9037 / 8309 / 14481 / 20002 | 154 / 8927 / 8049 / 15530 / 18646 | 154 / 7318 / 6745 / 15806 / 19991 | 154 / 7273 / 6879 / 12432 / 16244 | 154 / 6844 / 6347 / 15131 / 22395 |

Full planner, routine p50 / p95: A 8507 / 12194, B 8589 / 13903, D 3150 / 10080, E 4713 / 7437, F 3345 /
4279. On every arm the first planner output arrives with the first sentence and the turn ends right after:
the planner's time is spent before any visible output (thinking, omitted display), so streaming saves
little. Routine evidence-ready p95 is 3.6-4.6 s (max 8.1 s): routine questions with a prerequisite check
wait for an uncertain gap check's larger evaluator.

Quality (exact counts; the corpus expectations are the scripted TARGETS, which real models rarely meet
exactly, so absolute rates are low on every arm, Opus included):

| | A | B | D | E | F |
|---|---|---|---|---|---|
| actions | 41/148 | 46/148 | 33/148 | 45/148 | 38/148 |
| evidence | 58/130 | 64/130 | 66/130 | 59/130 | 63/130 |
| route | 31/94 | 37/94 | 37/94 | 29/94 | 36/94 |
| corpus golden traces, every repetition | 0/9 | 1/9 | 0/9 | 0/9 | 0/9 |
| invalid structured plans | 0/154 | 0/154 | 10/167 | 0/154 | 1/155 |
| routine fast-tier escalation | - | - | 13/65 | 0/62 | 1/66 |
| hard gates (consent, policy, resources, spoken-then-replaced, corruption) | 0 | 0 | 0 | 0 | 0 |
| cost / turn | $0.0330 | $0.0258 | $0.0190 | $0.0197 | $0.0188 |

Winner under the locked gates: none of the fast tiers. With the live corpus golden traces as the golden
gate no arm is eligible (Opus included). With the unit golden traces (11/11, code shared by every arm) A
and B are eligible; D fails actions (5.4 pp), invalid plans (6.0%) and routine escalation (20.0%); E
fails route by 2.1 pp (29/94 vs 31/94); F fails actions by 2.0 pp (38/148 vs 41/148, 2.03). Between A and
B the gate script reports a split: B best p50, A best p95. The Opus-vs-Opus spread (A vs B: 5 actions,
6 routes) is larger than the 2 pp gate at this N.

JEV: 736 corpus calls at 12.04 checks per call: 0 timeouts, 1 error (891 ms, the first call of the first
run), mean 133-145 ms, p95 200-259 ms by arm; Baseline A UI: 24 calls at 5-9 checks, mean 129 ms, p95
184 ms, 0 timeouts. The ~33% more checks did not add timeouts. Larger-evaluator escalation 14-18% of JEV
turns (Baseline A UI 58% on its evaluation-heavy golden turns). Late evidence: 16 off-path turns per arm,
3 with evidence landing late, 0 route changes, 0 dependent actions dropped. Early sentence 96-99% on the
streamed arms; early questions 100% of question-opening turns. Caching: 151-154 warm reads per cached
arm, ~0.30M cached tokens each; cost -22% (B vs A), no measurable latency change.

## Accepted architecture: F (owner decision ACCEPT OPTION F, 2026-10-01)

The branch is the F-ready candidate. With no planner knobs set (`PLANNER_DEFAULTS` in
`learn-tutor-routes.js`): routine turns (a question, request, slash or hole opening on the rows `slash`,
`off_slice`, `not_yet_observed`, `understood`, `gap`, `gap_inline`) are planned by `claude-sonnet-5-5` at
effort low; every other turn, and any fast plan that fails its check (an error, invalid JSON, an action
outside the allowed types, no words), is planned by `claude-opus-5-5` at its default effort; prompt caching
is on. The fast-tier sentence is held until its plan passes (D2); the evaluator path (JEV, explicit
escalation, the Opus 5.5 larger evaluator), critical-path policy, late-evidence handling, constraint-first
questions and per-idea evidence are unchanged. No Haiku; optimized Opus is not a latency strategy.
Opt-outs: `TUTOR_PLANNER_FAST_MODEL=off` (Opus only), `TUTOR_PLANNER_CACHE=off`,
`TUTOR_PLANNER_FAST_EFFORT=default`. The benchmark runner sets every knob per arm, so arms A-F reproduce
what was measured. Rubric correction: a part is required only when the learner or the context names it
(`docs/features/tutor-v2-rescore-20261001/`).

## Free semantic rescore (GO FREE RESCORE, 2026-10-01)

The paid rows re-scored with a semantic-equivalence rubric committed before any arm was scored
(`docs/features/tutor-v2-rescore-20261001/`: `rubric.md`, `README.md` = the revised report). No model call;
paid data, latency, cost and the hard and reliability gates unchanged. Semantic accuracy vs A (actions /
evidence / route): A 96/142, 63/124, 52/94; B 100, 68, 57; D 94, 69, 56; E 100, 65, 51; F 97, 67, 55. With
the unit golden traces as the golden gate, A, B, E and F pass the locked gates; D fails reliability.
Routine first validated sentence (paid): F p50 3.6 s / p95 8.0 s, fastest on both; the all-turn
comparison is a p50 (F) / p95 (E) split left to the owner. F (Sonnet 5.5 low + Opus) is the recommended
fast tier. B: caching is a 22% cost saving, no latency gain.

## Paid benchmark plan (final; run 2026-10-01, results above)

No paid call has run. The interrupted GO BENCHMARK of 2026-10-01 made none: the earlier agent was
stopped at 16:27:25 after a memory check and source greps; no `--live` or UI bench command ran, no
`tutor-bench-out` or `corpus-live-*` exists under workspace/, and the stored results are stub runs.

Arms (larger evaluator fixed at `claude-opus-5-5` in all; Opus planner effort at the model default,
medium, in all; JEV unchanged):

| Arm | Planner | Effort / mode | Streaming | Cache |
|---|---|---|---|---|
| A | `claude-opus-5-5` | default (medium), standard speed | no | no |
| B | `claude-opus-5-5` | default, standard | yes | yes |
| C | `claude-opus-5-5` | default, fast mode (`speed: "fast"`, beta `fast-mode-2026-02-01`); unavailable if refused | yes | yes |
| D | `claude-haiku-4-5-20251001` routine tier + Opus escalation | Haiku: no effort parameter; Opus default | yes | yes (Haiku below its 4096-token minimum: not cached) |
| E | `claude-sonnet-5-5` routine tier + Opus escalation | Sonnet default (high); Opus default | yes | yes |
| F | `claude-sonnet-5-5` routine tier + Opus escalation | Sonnet low; Opus default | yes | yes |

Plus the true Baseline A anchor on `main` ce856371: `tutor-bench.mjs`, 9 golden turns x 3 = 27 UI turns.

Corpus: 33 traces, 44 turns. Per arm: 3 full-corpus runs + 2 `--group routine` runs = 154 observations:
- routine x5 = 55: question_request 30, explicit_implementation 10, slash_deeper 5, slash_simplify 5,
  action_validation 5
- evidence-dependent x3 = 81: repeated_misconception 15, evaluator_disagreement 15, correct_explanation
  12, partial_explanation 12, practice_evidence 9, misconception 6, evaluator_error 6, prerequisite_gap 3,
  ambiguous_explanation 3
- structural x3 = 18: rabbit_hole 6, rabbit_hole_keep 3, child_entry 3, child_turn 3, return_to_parent 3
Six arms: 924 corpus turns, plus 27 UI turns. A p95 on 55 routine observations is about the 3rd-worst
value; per-category percentiles on 3-15 observations are descriptive only.

Expected calls (stub rates: 15 of 44 full-corpus turns and 9 of 11 routine turns go to the fast tier;
fast-tier escalation assumed 0-20%; larger-evaluator escalation 7-45% of JEV turns, ~25% live):
- Haiku: 63 (D). Sonnet default effort: 63 (E). Sonnet low effort: 63 (F).
- Opus planner, normal speed: A 154 + B 154 + D/E/F 91 each + escalations 0-39 (expected ~18) =
  581-620, expected ~600; plus 27 for the UI anchor.
- Opus planner, fast mode: 154 (C), unless refused at its first call.
- Larger evaluator (Opus 5.5): ~54 low / ~186 expected / ~384 high, plus 2-7 UI.
- JEV (TypeSafe, not priced here): ~846 + ~25.

Expected tokens: Opus planner ~780 calls x ~3.0k input = ~2.3M input, of which ~0.84M are cache reads
(arms B-F); Opus output 0.4-2k per call (tool call plus thinking at medium) = ~0.3-1.6M (expected ~0.7M);
fast tiers ~0.57M input, ~0.15M output; larger evaluator ~0.22M input, ~0.13M output. Total about 3.1M
input and 0.5-2.0M output (expected ~1.0M).

Expected cost (first-party $/MTok: Opus 5.5 4 / 20, cache read 0.20, cache write 1.25x; fast mode
8 / 40; Sonnet 5.5 2 / 10, cache read 0.20; Haiku 4.5 1 / 5), low / expected / high per arm:
A $2.9 / 5.2 / 10.6, B 2.1 / 4.4 / 9.7, C 4.1 / 8.1 / 17.2, D 1.5 / 3.3 / 7.7, E 1.9 / 4.3 / 9.4,
F 1.7 / 3.6 / 8.6. Total: low ~$15, expected ~$30, high ~$65, plus ~$1-2 for the UI anchor. If arm C is
refused, subtract its cost (a single refused call).

Runtime: ~8-10 s per Opus-planned turn, less on C-F routine turns; about 105 minutes for the 924 corpus
turns plus ~10 minutes for the UI anchor, run one at a time: about 2-2.5 hours.

Commands, per arm X in A..F (after GO BENCHMARK only):
`TUTOR_BENCH_PAID=GO node e2e/tutor-corpus-run.mjs --live --candidate X --stage X-r{1,2,3} --out <dir>`,
then `... --group routine --stage X-routine-r{4,5}`, then
`node e2e/tutor-bench-gates.mjs --arm A=<A files> ... --arm F=<F files> --reference A --baseline A`.

Metrics produced, per arm, pooled across repetitions, never collapsed across groups (gates script):
availability (refusal); hard gates (golden traces in every repetition, consent, policy, nonexistent
resources, spoken-then-replaced, evidence corruption); action / evidence / route accuracy as numerator /
denominator and pp vs Opus; invalid structured plans; routine fast-tier escalation; cost per turn; first
validated speakable sentence and full-plan latency with N, mean, p50, p95 and max for all turns, per
group and per category; late evidence (off-path turns, evidence landed, route changed, dependent actions
dropped); the winner, or the p50/p95 split. Per run (`summary.json`): JEV / larger / planner ms (mean,
p50, p95, max), timeouts and errors; planner input / output / cache tokens; cold vs warm cache
requests; time to first safe sentence, evidence ready and first evidence-dependent action; question-turn
early rate and timing; fast-tier share and escalations; critical-path skip rate; free-text negative
events; larger-evaluator escalation rate; cost per turn and per 100 turns; model calls per turn;
served-model and speed mismatches. Speech end -> first audio = STT commit + first validated sentence +
Fish first byte.

## Earlier paid benchmark plans (superseded)

The 2026-10-01 plan (F reference, G-default, G-low, H-haiku, H-sonnet, 444 turns, ~$12) and the earlier
A-vs-F proposal (210 turns) are superseded by the decisions 1-7 plan above.

## Open questions for the owner

Resolved by decisions 1-7 and the final answers A-D: evidence rows on the critical path and late
evidence (D1, A); early questions and no session question budget (D4, B); held fast-tier sentences (D2);
model ids (D3); caching and fast mode (D5); repetitions (C); Sonnet effort as its own arm (D); per-idea
evidence (D7). Remaining:

- D7: JEV questions per call rise ~33% (12.05 vs 9.05) for the contradiction checks; JEV keeps its
  800 ms budget, and the paid run shows whether timeouts rise.
- Arm A is Baseline A's planner settings on the v2 pipeline (compact state, critical path); true
  Baseline A code is the UI anchor on `main`.
- Fast mode is a research preview: whether the dev organisation has it is known only at run time.

## Voice MVP conflicts (`feature/voice-tutor-mvp` 2b96f0df, read-only; not merged)

- `agents/learn-tutor.js` PLANNER_SYSTEM: voice adds one line reading `context.turn.input_modality`
  ("at most two short sentences ... show cards rather than narrate"); v2 has no `turn` in the planner
  context and rewrote the neighbouring output-order line (D4: control fields first, first-heard action
  first). On merge: one voice line reading `context.learner_intent.input_modality`.
- `web/src/learn-tutor.js`: voice threads `inputModality` and `turnId` through `buildTurn` / `runTurn`,
  adds `input_modality` to the bench, rewrites the v1 `plannerContext` (v2 replaced it), nulls
  `suggested.question` on voice turns, and stops logging the quoted explicit_request in v1 `enforce`
  (v2 moved it to `learn-tutor-validate.js`, which still logs the quote: port that). Expect textual
  conflicts in `runTurn` (D1 hold/release, D4 `onSentence`) and in the bench.
- Integration points (not built): the voice `turnId` and the v2 `trace.trace_id` become one id (pass the
  voice id into `turnTrace` / `buildTurn`); `LearnTutor.jsx` posts `{ stream: true }`, reads it with
  `readPlanStream` and passes `onSpeakable(text)` to start Fish streaming on the first validated
  sentence. The NDJSON `sentence` event is now `{ text, action, constraints_add, explicit_request }`
  and may be a question; `onSpeakable` still receives the text only.
