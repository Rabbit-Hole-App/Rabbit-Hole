# Curriculum evaluator-optimizer experiment — 2026-09-16

Implemented in the standalone local API only. No UI, saved course, Cloudflare
deployment, or AWS installation changed.

- [Exact curriculum returned](curriculum-evaluator-loop-generated.md)
- [Full prompts, input, candidate, evaluator findings, and telemetry](curriculum-evaluator-loop.json)
- [Workflow specification](../features/curriculum-agent.md#evaluator-optimizer-plan-and-implementation)

## Plan and completion

- [x] Separate evaluator system prompt and explicitly loaded review skill.
- [x] Complete seven-criterion checklist and consistent verdict validation.
- [x] Initial candidate plus two possible revisions; early stop on ready or needs_input.
- [x] Save drafts and reviews, including partial failures.
- [x] Focused unit and HTTP tests for the workflow and failure boundaries.
- [x] Run the same YOLO input and inspect the actual evaluator response.

The reviewer receives the original brief/evidence and candidate, but not the
generator's system prompt, examples, or self-assessment. Subsequent reviews also
receive previous findings. The generator receives the prior candidate and
feedback only when a revision is requested. Ready does not mean owner approval.

## Successful real run

Input deep equality with the previous single-call experiment passed. No desired
curriculum or mandatory algorithm list was added. The same approved minimal
app description and public documentation notes were used. No raw source,
runbook, sessions, credentials, bucket paths, account IDs, images, or logs were
sent. The generator prompt was unchanged from the example-assisted baseline.

| Step | Model | Time | Result |
|---|---|---:|---|
| Generate candidate 1 | claude-opus-5 | 53.695 s | Four modules, eight lessons |
| Evaluate candidate 1 | claude-opus-5 | 61.776 s | ready; seven checks pass, zero blocking findings, three minor findings |
| Total successful workflow | | 115.488 s | Stopped after one candidate, two role calls |

Claude Max subscription was used through Claude Code. The CLI reported small
auxiliary Haiku calls as well; the full JSON retains their telemetry. Reported
cost estimates are not a claim about subscription billing.

The first execution attempt failed during its initial subscription process,
before any candidate was produced. Its original generic diagnostic did not
identify the underlying provider/process cause. The subscription login was
confirmed valid; process code/signal and available JSON provider errors are now
preserved for subsequent failures. One explicit retry completed successfully.
There is no automatic retry that circumvents the workflow's candidate budget.

## Actual evaluator findings

All three were classified **minor by the evaluator**, not corrected by hand:

| ID | Location | Feedback |
|---|---|---|
| F1 | Module 4, CPU execution | Qualify CPU/GPU equivalence and speed claims; no deployment timing evidence was supplied. |
| F2 | Module 4, app usage | State the limited scope of app usage, or obtain invocation evidence, rather than imply the course explains an undocumented trigger/setup flow. |
| F3 | Module 1, pretrained weights | Carry the unverified deployed-label-list qualification into the actual topic rather than only the scope notes. |

Owner decisions remain: course duration/depth, depth of box-geometry coverage,
and whether the usage goal includes operational invocation details not supplied
in the test input. The ready verdict is readiness for that review. The output
still contains the minor findings because the accepted workflow does not force
revisions for optional improvements.

Manual inspection confirms weights precede architecture, the threshold is
described by its direct filtering operation, and coordinate absence is scoped
to boxes.json with visual geometry retained in annotated.jpg. A remaining
fixed-input-size generalization was not flagged by this evaluator. That is a
review limitation; its ready verdict is not factual ground truth.

## Tests and limits

**17 focused tests passed.** Coverage includes request authorization and bounds,
complete/consistent checklist validation, early ready with owner decisions,
feedback forwarding with unchanged original input, three-candidate exhaustion,
needs_input, explicit resolution of prior blockers, malformed reviews,
provider failures with preserved history, and HTTP error recovery. Syntax
checks passed.

The real run exercised generation, evaluation, and early acceptance. Revision
and exhaustion were exercised with deterministic fixtures, not a live rejected
candidate in this run. No claim is made that the evaluator improved this output:
it accepted the initial candidate and requested no revision. The prior
single-call sample took 61.067 s; these unpaired samples do not establish a
stable latency difference or quality lift. Both roles use the same model family,
so correlated errors remain possible. No independent factual verification,
cross-domain benchmark, or learner study has been performed.
