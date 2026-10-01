# Tutor v2 benchmark: semantic-equivalence rubric (free rescore, 2026-10-01)

Written and committed BEFORE any arm is re-scored. It never refers to an arm, a model or a tier: every
rule reads only the scripted corpus turn (`packages/web/e2e/tutor-corpus.mjs`), the locked Tutor policy
(`tutor-v1-locked-decisions.md` §4 and the §7 route table, as implemented by `route()`), and what a
recorded row contains. It is applied identically to every recorded row of arms A, B, D, E and F
(`docs/features/tutor-v2-benchmark-20261001/`, immutable at 76ca7013). Implemented by
`packages/web/e2e/tutor-bench-rescore.mjs`.

Purpose: replace exact-script comparison with functional equivalence, NOT loosen the standard. Two
behaviours are equivalent only when a rule below says so; "both sound reasonable" is never a rule.

## What a recorded row contains (and does not)

Per turn: the accepted actions (type, mode, card, part), the route row, the new evidence events as
`claim:result` (`?` = unsettled), the state transitions caused by this turn's evaluation, the selected
claims, whether JEV / the larger evaluator ran and the escalation decision, the post-validation audit, and
errors. No action text and no full claim-state table are recorded.

## 0. Dimensions and denominators

Scored per turn, as before: selection, evaluation, evidence, route, actions. A dimension is scored only
when the turn's expectation has it (same as the old scorer). A turn passes when every scored dimension
passes. Golden traces: a corpus golden trace passes only if all its turns pass in every repetition.
Hard and reliability gates are not part of this rubric and are unchanged (section 7).

## 1. Selection (unchanged)

Deterministic code; `selected_includes` / `selected_excludes` exactly as before.

## 2. Scripted infrastructure faults

Two corpus turns are scripted around an evaluator FAULT: `B-jev-error` (JEV times out) and
`B-larger-error` (the larger evaluator times out). Their expectations (no evidence stored, a safe
answer or a clarifying question) describe what the Tutor does when the fault happens. Rule F: when the
recorded turn shows the fault did not happen (no JEV error, respectively no larger-evaluator error or
timeout), that turn's evaluation, evidence, route and action expectations are NOT APPLICABLE and leave the
denominators; selection and every hard gate still apply. When the fault did happen, the expectations
apply unchanged. The same rule for every arm; the excluded counts are reported.

## 3. Evaluation ladder

- JEV called or not: exact (deterministic: words, claims, not a slash or opening).
- Larger evaluator called or not: whether JEV was unsure is the evaluator's own (scripted) outcome.
  Invariant: the larger evaluator runs if and only if the explicit escalation policy says so. Pass when
  `larger_calls > 0` exactly when the recorded escalation reason is one of `gap`, `misconception`,
  `contradiction`.

## 4. Evidence

Invariant: the evidence has the right POLARITY for what the learner's scripted words say, and leaves the
claim in the right STATE. How confident the evaluator is, and how many identical events it emits, are
scripted evaluator outcomes, not Tutor behaviour.

- E1 Polarity: per claim, the SET of results present (pass, fail, misconception, gap, non_attempt) must
  equal the expected set. Multiplicity is ignored (two pass events for two ideas = one category "pass");
  per-idea coverage still matters through the state check E3.
- E2 Confidence: an unsettled event (`?`) matches an expected settled event of the same claim and result
  (the conservative form: unsettled evidence never changes a state in the wrong direction). The reverse
  does not hold: a settled event where the expectation is unsettled fails.
- E3 State: every claim in `expect.states` must be in exactly the expected state after the turn. No state
  equivalences. Reconstruction (no full table is recorded): the `to` of the claim's last transition in the
  trace so far; a claim with no transition keeps the state derived from the deterministic card-practice
  events alone (replayed from the scripted start, no model involved). If card practice happened after
  the claim's last transition and the turn has no transition for it, the state cannot be reconstructed:
  that claim is reported as NOT RECONSTRUCTABLE and the evidence dimension falls back to E1 and E2 alone
  for that turn.
- An expectation of `events: []` means no evidence events at all (unchanged).

## 5. Route

Invariant: the router picks pedagogically equivalent handling for the same evidence class, with the same
constraint and consent behaviour.

- R1 Exact rows match.
- R2 `uncertain` and `uncertain_unsettled` are equivalent: both handle insufficient evidence on the same
  claim without advancing (Feynman, no Rabbit Hole, no navigation), and differ only in whether the
  evaluator was confident (E2). This is the only route equivalence.
- Not equivalent (different handling): `misconception` vs `misconception_explain` (Socratic vs
  explanation), `gap` vs `gap_inline`, `not_yet_observed` vs `uncertain`, anything vs `understood`,
  `slash`, `returned`.

## 6. Actions

Each accepted action maps to a FUNCTION:
TEXT (respond_text), QUESTION (ask_question), SHOW(card) (show_authored_card, or focus_part on that card),
NEXT(card) (suggest_depth from card c in direction d, i.e. the ladder step of c; a show_authored_card in
suggest mode of the target's ladder neighbour is also NEXT of that card), PRACTICE (suggest_practice), DIVE
(suggest_dive), RETURN (return_from_dive). no_action maps to nothing. Order never matters (unchanged).

- A1 Required: every function in the expected set must be present, after normalisation, or replaced by an
  alternative the locked policy names for the ACTUAL route row:
  - `misconception` (Socrates): QUESTION and SHOW/focus on the card are alternatives ("ask_question
    (diagnose) or a counterexample on the authored card (focus_part)").
  - `understood`: NEXT and QUESTION are alternatives ("at most one suggest_depth or transfer
    ask_question").
  - No other substitutions. TEXT is never replaced by a question or a chip; DIVE, RETURN and SHOW of a
    named card are never replaced.
- A2 Equivalent-route move: when the actual row is route-equivalent (R2) to the expected row but not equal,
  the required functions are those of the actual row's locked move instead of the expected set:
  `uncertain_unsettled` requires QUESTION (one clarifying question); `uncertain` requires TEXT or SHOW
  (explain concretely or re-represent with an authored card).
- A3 Card and part: `expect.card` must be the card of the SHOW or NEXT function (focus_part on the card
  counts; NEXT counts when its ladder step is that card). Card identity is always strict.
  Part (corrected 2026-10-01 by the owner's decision ACCEPT OPTION F; a general rule for every trace and
  arm, no trace exception): `expect.part` must equal the focused part ONLY when the learner turn or its
  context identifies that specific part - the learner's words name the part (a word of four or more
  letters from the part's id or authored label, other than show, this, that, where, with, from, code,
  card, part, into), or the turn's context has that part selected (the scripted start part or selected
  object is that part). For a card-level request ("show me the implementation"), opening the correct card
  is sufficient and the expected part is not required. Originally (committed at cacca65e) the part was
  always required; that version's results stay in git history and in the delta below.
- A4 Modes (consent-relevant, strict): an expected `navigate` must be a navigating show/focus on that card
  (a suggestion chip does not honour an explicit request); an expected `suggest` must not navigate.
- A5 Extras: functions beyond the required ones are allowed only when the route row's allowed set permits
  them (the locked §7 table's optional companions: a predict question on `not_yet_observed`, a
  re-representation or explain-back on Feynman rows, the return chip inside a hole, ...). Accepted actions
  are always inside that set, so this is enforced by the validator and re-checked by the hard-gate audit.
  Forbidden whatever the set: QUESTION once the learner has stated "don't quiz me" in the trace.
- A6 `max_sentences` (words before a Rabbit Hole suggestion): no action text is recorded; satisfied when the
  turn's independent audit found no policy violation (the audit counts more than two sentences before a
  dive suggestion).

## 7. Unchanged

- Hard gates (absolute): zero consent violations, critical policy violations, nonexistent-resource
  actions, fast-tier sentences spoken then replaced, evidence corruption.
- Reliability: invalid structured plans < 2%; routine fast-tier escalation < 20% (turns routed to the
  fast tier only).
- Quality gates (locked): action accuracy no more than 2 percentage points below Opus (reference arm A),
  exact numerator / denominator; evidence and route must not regress materially (the same 2 points, as in
  the locked gates script).
- Cost per turn <= arm A. Latency: the paid measurements, unchanged and not recomputed.

## 8. Cascades

Some turns presuppose an earlier turn's outcome (the "Keep it here" turn needs the previous Rabbit Hole
suggestion; the hole's turns need the hole; a prompted answer needs the previous question). No exception:
their expectations apply as written, and the paired table shows such cascades.
