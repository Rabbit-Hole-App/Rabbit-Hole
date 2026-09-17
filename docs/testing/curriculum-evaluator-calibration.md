# Curriculum evaluator calibration

## Plan registered before model runs

This is a small synthetic development study, not independently annotated gold
or a public benchmark. Cases and expected judgments are authored by the coding
agent before any review calls. The evaluator never receives the case labels,
expected verdicts, defect descriptions, or development/holdout split.

1. [x] Freeze ten cases: six development cases, four held-out cases.
2. [x] Evaluate the six development cases with the current prompt.
3. [x] Manually match findings to known defects and measure misses, severity
   errors, and false rejections. Refine general rubric rules from those results.
4. [x] Repeat development checks and run the frozen held-out cases. Do not tune
   on held-out results and still call them held out.
5. [x] Feed a flawed candidate through the real evaluator/revision workflow.
6. [x] Rerun yolo-s3-job with the same minimal input; preserve returned drafts,
   reviews, verdicts, and available telemetry. The failed initial generation
   exposes a telemetry limitation documented below.

Four development defects cover prerequisite ordering, contradicted app claims,
unnecessary topics, and incomplete goal coverage. Two acceptable development
cases cover experienced learners and an honest time/depth choice. Held-out cases
cover an unrealistic time promise, an output-scope error, and two acceptable
curricula. None prescribes a vision syllabus or mandatory algorithm.

Known defects caught means a finding actually identifies the labelled defect,
not merely that the review rejects for some unrelated reason. Report detection
at either severity separately from blocking detection. A minor classification
of a blocking labelled defect is a severity miss. False rejection means a
labelled acceptable curriculum is not ready; inspect the reason rather than
automatically assuming the label is correct. Provider/validation failures are
errors, not passes or semantic judgments. Counts will state their denominators.

The general prompt may be refined using development findings and the already
observed YOLO review limitations. Expected curricula will not be changed to
make results look better. One held-out run does not establish generalization.

Artifacts: [cases](../../tests/evals/curriculum/cases.mjs),
[calibration runner](../../scripts/calibrate-curriculum-evaluator.mjs).
Only synthetic examples and the previously approved minimal app description
are sent through the user's Claude subscription. No app deployment is planned.

## Calibration results

Run date: September 16, 2026 (Pacific). Separate Claude calls used the existing
subscription. The fixture source checksum is identical in both reports. The
refined prompt was frozen before running any held-out case; no changes were
made from held-out feedback.

| Review set | Cases | Known defects blocked | Acceptable drafts rejected | Provider/validation errors |
| --- | ---: | ---: | ---: | ---: |
| Baseline, development | 6 | 4 / 4 | 0 / 2 | 0 |
| Refined, same development | 6 | 4 / 4 | 0 / 2 | 0 |
| Refined, held out | 4 | 2 / 2 | 0 / 2 | 0 |

Every seeded defect was identified by a matching finding at blocking severity;
there were no missed targets or severity misses in these runs. Rejecting for
another reason would not have counted. The acceptable cases all received
`ready`, sometimes with optional minor feedback.

The baseline already classified its six cases correctly. **These results do not
demonstrate an accuracy improvement.** Baseline feedback motivated general
rubric changes: classify factual errors by their effect on understanding, not
the length of the fix; do not ask owners to reconfirm explicit goals; treat
topic bullets as coverage commitments rather than complete scripts; ground
objections narrowly without invented timing claims. Prior real-app feedback
also motivated stricter treatment of unsupported categorical assertions.

In the repeat, C04 requests a revision to cover running the report instead of
asking whether that explicit goal belongs in the course. C03 no longer claims
the remaining material takes "well under" ten minutes. Feedback is still not
perfect: C02 adds interpretive consequences beyond the sufficient direct
contradiction, and several reviews suggest small details that can wait for
lesson design. No further tuning was performed to polish these results.

This is ten short, deliberately clear synthetic cases with one run per prompt
and case. Held-out cases reuse subject families from development. The same
coding agent authored labels and matched findings, so this is neither
independent annotation nor evidence of generalization to unfamiliar domains.
It establishes that this evaluator recognized these defects without rejecting
these valid alternatives. It does not measure learner outcomes.

Saved evidence:

- [Baseline reviews and exact prompt](curriculum-calibration-baseline.json).
- [Refined reviews, exact prompt, and frozen case checksum](curriculum-calibration-refined.json).
- [Finding-to-defect adjudication](curriculum-calibration-adjudication.json).
- [Computed counts](curriculum-calibration-metrics.json).

Reproduce with the current prompt:

```powershell
node scripts/calibrate-curriculum-evaluator.mjs all .small/curriculum-calibration-rerun.json
node scripts/run-curriculum-repair.mjs C04 .small/curriculum-repair-rerun
node scripts/run-curriculum-experiment.mjs .small/curriculum-outline-request-minimal.json .small/curriculum-yolo-rerun
```

The last command requires the explicitly reviewed local input file. Reruns are
new measurements, not deterministic reproductions. Use saved prompt snapshots
when comparing versions; the current runner does not load the old baseline.

## Real rejection and repair

The C04 test started with a **seeded synthetic candidate**, not a model-generated
initial draft. All review calls and the subsequent generator revision were real
Claude subscription calls. No expected label or target defect was supplied to
either role.

1. Candidate 1: `revise`. F1 blocked missing coverage of producing a grouped
   report despite the explicit goal. F2 suggested consolidating redundant topics.
2. Candidate 2: `ready`. The generator added selecting the category field,
   pressing Run, and how that selection defines the result groups. It ordered
   these after rows/fields and before interpretation. The evaluator marked F1
   and F2 resolved. I checked those changes in the actual candidate.

Elapsed workflow time: **77.082 seconds**, comprising two reviews and one model
revision. The final review retained one minor question about how the summed
field is determined. Ready means suitable for owner review, not a proof of
teaching quality or an automatically approved course.

- [Full repair history, prompts, and model telemetry](curriculum-calibration-repair.json).
- [Unedited revised curriculum](curriculum-calibration-repair-generated.md).

## Real-app rerun: first attempt

The first yolo-s3-job call produced nine lessons, exceeding the API's eight-lesson
limit. The limit was present in both prompt and validator. Validation rejected
it before any evaluator call; the API returned 502. This is a **failed generation**,
not an evaluator rejection or a passing curriculum. The returned candidate is
preserved. Its failed-call model usage/time were not retained by the current
error serializer, so no telemetry is invented for that call.

- [Failed candidate and error](curriculum-calibration-yolo-attempt1-failure.json).
- [Exact input and prompts](curriculum-calibration-yolo-attempt1-request.json).

One explicit retry uses identical input and prompts, a separate output path,
and the same three-candidate workflow limit. It does not replace this failure
in the record. No automatic retries or validator relaxation were introduced.

## Real-app retry: evaluator accepted, manual review disagrees

The retry returned `ready` after one candidate and one review in **102.512
seconds**. **This is the
model's verdict, not my approval.** The generated curriculum is preserved without
manual corrections. It covers images and detection; learned weights before
convolutional features; YOLO backbone/neck/head and postprocessing; then app
inputs and outputs. It flags that the conceptual scope needs more than the
requested 20 minutes, asking the owner to choose a longer session or overview.
It does not insert logistic regression as a mandatory prerequisite.

The reviewer found two issues but classified both as minor:

1. F1: "Why a model needs a fixed input size" presents an implementation
   convention as an architectural requirement. The review itself says this can
   teach a beginner the wrong mechanism and that supplied evidence does not
   establish the requirement. **This is a severity miss under our refined
   rubric**, which explicitly makes misleading mechanism claims blocking.
   Because the reviewer returned ready, the generator never revised it.
2. F2: the run sequence remains implicit in the input/output topics. This is
   arguably optional outline clarity, rather than the complete omission in C04.
   I did not count it as a second established severity miss.

The reviewer also repeats the candidate's claim that adding precision/recall
concepts requires a measured test set. That conflates teaching the concepts
with measuring this app's performance. It remains an unresolved scope concern,
not a topic requirement added to the brief or a post-hoc calibration label.

The saved first attempt failed schema validation and the explicit retry passed
schema validation; only the retry reached evaluation. Reporting only the retry
would conceal a generation reliability problem. The error serializer's missing
failed-call telemetry is also recorded rather than reconstructed.

- [Complete retry input, prompts, candidate, review, and telemetry](curriculum-calibration-yolo.json).
- [Unedited generated curriculum](curriculum-calibration-yolo-generated.md).

## Review conclusion and next decision

The workflow can reject a real candidate, pass actionable feedback, obtain a
revision, and resolve the original finding. The ten synthetic cases did not
expose false rejections or missed seeded defects. **The real-app test still
exposed a severity error that prevents automatic readiness from being trusted.**
The app and its saved courses were not changed or deployed.

Next, use the actual YOLO wording and varied cross-domain equivalents as a new
development set for the distinction between misleading claims and optional
clarity. Include acceptable qualified counterparts. Any cases used to tune
become development cases; keep new independent examples for a later check.
Do not conceal the defect by manually editing the returned course or forcing
every minor suggestion into a revision. Separately, a bounded schema-repair
step could address malformed generator output; it is not part of this change.

Verification: 19 focused tests passed across the outline/API, workflow, and
calibration tests. They cover fixture shape and label exclusion, correct
scoring of matching defects versus unrelated rejection, severity misses,
provider failures, and existing workflow stop/validation rules. Calibration
and repair traces were also inspected directly; no UI testing was needed.
