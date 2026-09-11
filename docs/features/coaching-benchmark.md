# Coaching context benchmark

Status: first measured pilot completed on 2026-09-10.
[Results, failure analysis and artifacts](../testing/coaching-benchmark-results.md).
Across 90 answers, sources plus session excerpts passed 26/30 questions, sources
plus extracted records 22/30, and sources alone 16/30. These are provisional
automated scores from five excerpts of one session, not five independent sessions.

The question is which context produces the most useful, source-backed Coaching
answers. Compare the same thirty questions under three conditions, using one
model, one answer prompt, the same source snapshot and output limit:

| Arm | Available context |
| --- | --- |
| Sources | Selected code and documentation at the episode's final commit. |
| Session | The same sources plus the selected conversation excerpt. |
| Records | The same sources plus extracted decisions and their evidence quotes. |

The corpus contains five historical build episodes from one actual Claude Code
conversation about Small. These are **five excerpts from one session**, not five
independent sessions. Select and freeze the messages, commit snapshots, reference
decisions, thirty questions, and scoring rubrics before generating answers.
Use only the selected, redacted project material. Exclude authentication output,
customer job data, hidden thinking, and unrelated conversation.

The baseline gets the same available documentation as the other arms, even when
the documentation already explains a decision. This is intentional: extraction
must add value over context that is already available.

## Measures

- Capture: supported choices / predicted choices; coverage of the frozen reference
  decisions; reason fidelity (0–3); unknown reasons; alternatives; structural
  anchors and evidence validation. Reference decisions are developer-authored,
  not exhaustive human gold. Valid additional decisions are not false positives
  merely because they were absent from the reference list.
- Answers: required facts covered; forbidden claims avoided; no unsupported
  factual claims; citations that exist in that arm and support the answer.
  Strict pass requires all of these. Missing, malformed or truncated responses
  fail; they never shrink the thirty-question denominator.
- Cost: provider-reported tokens multiplied by documented prices. Report
  extraction, answering, and grading separately; this is an estimate, not an invoice.
- Latency: request wall time, per arm. Extraction latency is reported separately.
- Comparisons: paired counts on the identical questions; all five episode rows.
  No significance or population claim from this clustered convenience sample.

An arm-hidden model judge receives the frozen rubric and original evidence, with
the three answers in a deterministic shuffled order. Its judgments and explanations
are saved for inspection. This is automated evaluation, not independent human
annotation; the answering and judging model being the same is a stated limitation.

Records must have valid code anchors. A stated reason must quote an actual
message; an unrecorded reason stays null. Structural validation is automatic and
does not prove semantic correctness. The Records arm uses those validated
candidates, **not builder-approved published knowledge**. Human review cost and
the production approval flow are outside this experiment.

Proposed future gates are 90% capture precision, 80% reference recall, valid
anchors for every retained record, and no observed secret leaks. These are
targets, not claims of results or guarantees of privacy.

## Execution checklist

- [x] Freeze the selected excerpts, matching code snapshots, references and 30 questions.
- [x] Test scoring, missing responses, context isolation, citations and redaction offline (24 tests).
- [x] Extract candidates from the five excerpts and validate them (28 of 35 retained).
- [x] Generate all 90 answers with identical model settings and fresh contexts.
- [x] Grade without arm labels; inspect failures and retain raw artifacts.
- [x] Write measured results, limitations and the next implementation decision in Markdown.

The [next comparison](coaching-retrieval-benchmark.md) tests records plus retrieval
of authorized conversation excerpts on five distinct sessions and 30 new questions.
[That comparison is complete](../testing/coaching-retrieval-results.md): this
retriever missed later corrections/outcomes and did not meet the quality/token rule.
Keep operational observations, user corrections and unknown reasons visible.
The current capture missed both proposed precision/recall targets, so records
alone are not ready to replace the original evidence. Test on independent
sessions with human-reviewed labels before choosing a production approach.

Future runs use the installed Claude Code subscription by default, with no
API-key fallback. The initial API run completed before the user requested that
switch; its $7.03 cost estimate is disclosed separately from subscription usage.

The standalone runner lives in `tests/evals/coaching/`. It does not modify the
app's Chat, sample inspection tabs, live data, or deployment. It uses no agent
tools or actions: this experiment isolates context quality. Permission checks,
ingestion, retrieval over long sessions, real human task success, and production
approval remain separate work (`ponytail:`). The existing five **synthetic**
sessions in the archived Reasoning worktree are prior smoke data, not new results.
