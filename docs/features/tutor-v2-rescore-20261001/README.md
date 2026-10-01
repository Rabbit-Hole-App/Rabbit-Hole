# Tutor v2 benchmark: free semantic rescore (GO FREE RESCORE, 2026-10-01)

No model, API or provider call. The paid rows in `../tutor-v2-benchmark-20261001/` are unchanged
(`git diff 76ca7013` on that folder is empty). Order: the rubric (`rubric.md`), its scorer
(`packages/web/e2e/tutor-bench-rescore.mjs`) and mutation tests (`src/learn-tutor-rescore.test.mjs`) were
committed and pushed at `cacca65e` before any arm was re-scored; the scorer was checked only on fresh stub
rows (44/44, as with the exact scorer). Then every recorded row of A, B, D, E and F was re-scored with the
same rules. Full outputs: `rescored.json` (every turn, old and new checks, reasons), `rescore-report.md`
(all tables, the complete changed-turn list), `rescore-summary.json`.

Latency, cost, tokens, hard gates and reliability are the paid measurements, not recomputed.

## Old vs semantic accuracy (exact numerator / denominator)

| arm | actions old | actions new | evidence old | evidence new | route old | route new |
|---|---|---|---|---|---|---|
| A Opus | 41/148 (27.7%) | 96/142 (67.6%) | 58/130 (44.6%) | 63/124 (50.8%) | 31/94 (33.0%) | 52/94 (55.3%) |
| B Opus optimized | 46/148 (31.1%) | 100/142 (70.4%) | 64/130 (49.2%) | 68/124 (54.8%) | 37/94 (39.4%) | 57/94 (60.6%) |
| D Haiku + Opus | 33/148 (22.3%) | 94/142 (66.2%) | 66/130 (50.8%) | 69/124 (55.6%) | 37/94 (39.4%) | 56/94 (59.6%) |
| E Sonnet default + Opus | 45/148 (30.4%) | 100/142 (70.4%) | 59/130 (45.4%) | 65/124 (52.4%) | 29/94 (30.9%) | 51/94 (54.3%) |
| F Sonnet low + Opus | 38/148 (25.7%) | 97/142 (68.3%) | 63/130 (48.5%) | 67/124 (54.0%) | 36/94 (38.3%) | 55/94 (58.5%) |

Denominators shrink by the 6 turn instances per arm of the two scripted-fault turns (rule F: the
scripted JEV and larger-evaluator timeouts did not happen live). No turn went from pass to fail. Fail ->
pass turn instances: A 37, B 35, D 41, E 36, F 37; each with its rule in `rescore-report.md`.

What changed and why, in kind (same rules on every arm):
- Actions: extras the locked route table allows (an optional predict question, a re-representation chip, a
  transfer question on `understood`, the return chip in a hole) no longer fail an exact action bag (A5);
  a counterexample on the card counts as the Socratic move (A1); on an `uncertain_unsettled` route the one
  clarifying question is the required move (A2).
- Route: `uncertain` and `uncertain_unsettled` are one handling (R2) - the scripted evaluator was confident,
  the live one was not.
- Evidence: one unsettled pass equals the scripted settled passes (E1 multiplicity, E2 confidence). Polarity
  and state stay strict.
- Evaluation: the larger evaluator ran exactly when the escalation policy said so (all arms 94/94).

Still failing on every arm, and why (not relaxed):
- Evaluator outcomes, identical machinery in every arm: wrong-polarity or missing evidence vs the script,
  `gap` vs `uncertain` (the gap check was not confident), `misconception` not reached. These dominate the
  remaining evidence and route failures and the "missing TEXT, DIVE" action failures that follow them.
- GT-04 ("Show me the implementation"): A, B, E and F navigate to the whole implementation card in all 5
  repetitions; the script focuses its `shapes` part, and rule A3 requires the part. D navigates to a wrong
  card in 3 of 5. This is a candidate rubric question (is the part representational detail?) for the owner;
  it was NOT changed after seeing results.
- Action accuracy restricted to turns whose route was right (planner behaviour only, not a gate):
  A 76/100, B 79/105, D 74/104, E 80/99, F 77/103.

## Paired turn-level analysis vs Opus (arm A), same turn and repetition (overall turn pass)

| candidate | group | both pass | Opus only | candidate only | both fail | n/a |
|---|---|---|---|---|---|---|
| B (Opus vs Opus) | routine | 14 | 2 | 1 | 38 | 0 |
| B (Opus vs Opus) | evidence | 35 | 3 | 4 | 33 | 6 |
| B (Opus vs Opus) | structural | 3 | 2 | 2 | 11 | 0 |
| D | routine | 13 | 3 | 4 | 35 | 0 |
| D | evidence | 36 | 2 | 2 | 35 | 6 |
| D | structural | 4 | 1 | 1 | 12 | 0 |
| E | routine | 14 | 2 | 5 | 34 | 0 |
| E | evidence | 37 | 1 | 2 | 35 | 6 |
| E | structural | 2 | 3 | 1 | 12 | 0 |
| F | routine | 11 | 5 | 5 | 34 | 0 |
| F | evidence | 36 | 2 | 2 | 35 | 6 |
| F | structural | 3 | 2 | 3 | 10 | 0 |

Every candidate's disagreements with Opus run both ways in about equal numbers (F: 5 and 5 routine, 2 and 2
evidence, 2 and 3 structural). On routine turns F disagrees with Opus more often (10 of 55) than Opus with
itself (B: 3 of 55), equally in both directions, so no systematic loss shows; evidence and structural
disagreement is about the same size as B's. Per corpus turn (passing repetitions per arm) is in
`rescore-report.md`.

## Hard, reliability and cost gates (unchanged)

| | A | B | D | E | F |
|---|---|---|---|---|---|
| consent violations | 0 | 0 | 0 | 0 | 0 |
| critical policy violations | 0 | 0 | 0 | 0 | 0 |
| nonexistent-resource actions | 0 | 0 | 0 | 0 | 0 |
| fast-tier sentences spoken then replaced | 0 | 0 | 0 | 0 | 0 |
| evidence corruption | 0 | 0 | 0 | 0 | 0 |
| invalid structured plans (< 2%) | 0/154 | 0/154 | 10/167 (6.0%) | 0/154 | 1/155 (0.6%) |
| routine fast-tier escalation (< 20%) | n/a | n/a | 13/65 (20.0%) | 0/62 | 1/66 (1.5%) |
| cost / turn (<= A) | $0.0330 | $0.0258 | $0.0190 | $0.0197 | $0.0188 |
| corpus golden traces, semantic, every repetition | 4/9 | 4/9 | 5/9 | 4/9 | 3/9 |

## Recommendation under the previously locked gates

- Quality (within 2 points of A on actions; evidence and route not materially below A), semantic scores:
  B, D, E and F all pass (largest shortfall: D actions -1.4, E route -1.1). D still fails reliability
  (invalid plans 6.0%, routine escalation 20.0%).
- Golden gate: with the unit golden traces (11/11, code shared by every arm) A, B, E and F are eligible.
  With the live corpus golden traces no arm is eligible, Opus included (A 4/9): that reading would also
  reject the reference, so it cannot separate candidates; the remaining live golden failures are mostly
  evaluator outcomes and GT-04's part.
- Latency among the eligible arms (paid, unchanged; first validated sentence, all turns p50 / p95): A 8309 /
  14481, B 8049 / 15530, E 6879 / 12432, F 6347 / 15131 ms. The locked gates script compares all turns and
  reports a split: F best p50, E best p95. The fast tier only plans routine turns; evidence-dependent and
  structural turns run on Opus in E and F alike, so their part of that split is Opus run-to-run spread.
  On routine turns, the owner's primary target, F is fastest on both: p50 3643 / p95 8027 ms against E 5051
  / 10151, A 8546 / 14481, B 8950 / 16141.
- Recommendation: F (Sonnet 5.5 low effort for routine turns, Opus 5.5 for everything else), with prompt
  caching, as the fast-tier candidate - subject to the owner's call on the all-turn p50/p95 split, which the
  locked script leaves to the owner.

## Does F (Sonnet 5.5 low + Opus fallback) pass the locked gates?

Yes, with the unit golden traces as the golden gate: hard gates 0; actions 97/142 vs A 96/142 (+0.7);
evidence 67/124 vs 63/124 (+3.2); route 55/94 vs 52/94 (+3.2); invalid plans 1/155 (0.6%); routine
escalation 1/66 (1.5%); cost $0.0188 vs $0.0330 per turn. With the live corpus golden traces, no arm passes,
A included. Paid latency (unchanged): routine first validated sentence p50 ~3.6 s, p95 ~8.0 s; projected
speech end -> first audio p50 ~4.5 s, p95 ~8.8 s. Evidence-dependent turns remain Opus-bound (~7.5 s p50).

## Arm B: cost optimization vs latency optimization

- Latency: none measured. Routine p50 8950 vs A 8546 ms, all-turn p50 8049 vs 8309, p95 15530 vs 14481.
  The Opus planner thinks for ~7.5-8.5 s before any output; the first sentence arrives with it, so
  first-sentence streaming barely moves Opus turns, and caching does not change thinking time.
- Cost: real. Prompt caching cut cost per turn 22% ($0.0258 vs $0.0330; ~0.30 M cached tokens read per
  arm). Keep caching as a cost optimization, also for F's Opus fallback and Sonnet tier.
- Streaming: keep it as the integration point for Voice (Fish starts on the first validated sentence) and
  for question turns, not as a measured latency gain on Opus.

## Is another paid confirmation run necessary?

Not for the locked-gate decision: F passes on the recorded data, its disagreements with Opus run equally
in both directions (more often than Opus against itself on routine turns, 10 vs 3 of 55), and a rerun would mostly re-measure evaluator noise (the shared
JEV and larger evaluator drive most remaining failures). What a paid run cannot settle is the rubric
question on GT-04's part and the evaluator's gap-check confidence; those need owner decisions or an
evaluator change, not more samples. The next measurement worth paying for is F inside the real voice
stack (speech end -> first audio with Fish streaming), after integration.
