# Coaching: decisions plus session retrieval

Generated 2026-09-10T19:36:36+00:00. Provisional automated experiment.

**Predeclared success rule: NOT MET.** Session scored 12/30; Decisions + retrieval scored 11/30. The rule requires at least the same strict answer quality, no increase in unsupported answers, and fewer input tokens including one-time extraction.

| Context | Strict passes | Required criteria covered | Unsupported answers | Citation failures | Valid JSON | Median request + retrieval time |
| --- | --- | --- | --- | --- | --- | --- |
| session | 12/30 (40.0%) | 57/60 (95.0%) | 4 | 14 | 17/30 | 15.38s |
| retrieval | 11/30 (36.7%) | 52/60 (86.7%) | 7 | 16 | 16/30 | 15.04s |

### Source-based rubric correction

Review found that r01-q3's frozen rubric incorrectly required 49 seconds as the final job test duration. The later m1242/m1261 messages report **59.81 seconds**. The benchmark author identified this after inspecting grades; it is not independent human adjudication. Both original answers were regraded against the same corrected timing criterion. No source, question text, retrieval setting, or answer was changed. [Correction and evidence](../../tests/evals/coaching/results/2026-09-10-retrieval/rubric-corrections.json).

Before this correction, the frozen-rubric strict scores were Session 12/30 and Retrieval 10/30. The table above uses the corrected grade. [Original score snapshot](../../tests/evals/coaching/results/2026-09-10-retrieval/summary-frozen-rubric.json), [grade-selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/grade-selections.json).


Strict pass requires all required criteria, no forbidden/unsupported factual claims, valid answer JSON, and citations that both resolve and support the answer. Missing answers or incomplete graders fail without shrinking the denominator. Unsupported claims are model judgments, not confirmed hallucinations from human adjudication. 27 of 60 answers failed JSON formatting, substantially limiting what the strict score says about reasoning quality alone.

### Exploratory content diagnostic

After observing answer-format failures, this diagnostic was added to separate content quality from JSON compliance. It uses the same factual rubric and judge's semantic citation check on the original visible text, without JSON/local citation parsing. It is post hoc and does not replace the predeclared strict score or decision rule.

Session: 22/30 (73.3%); Decisions + retrieval: 21/30 (70.0%).

## Token accounting

Input counts include uncached input, cache writes, cache reads and CLI auxiliary model calls. A cache hit still counts as context processed. Extraction belongs only to the Retrieval arm, amortized over six questions per session. Evaluation judges are shown separately.

| Context | Answering input | Extraction input | Total input | Total output including extraction | All tokens |
| --- | --- | --- | --- | --- | --- |
| session | 1560309 | 0 | 1560309 | 21475 | 1581784 |
| retrieval | 1444277 | 332119 | 1776396 | 48070 | 1824466 |

Answering-only input-token reduction: **7.4%**.
Total input-token reduction with extraction included: **-13.8%**.
A negative reduction means Retrieval used more input tokens. This is not a dollar-cost reduction claim.

## What ran

- Five distinct Claude Code session IDs, six frozen questions each, two fresh answers per question. None is the original pilot session. All five still come from one builder and repository.
- Session receives all retained visible conversation text plus selected historical code/docs. Retrieval receives exactly those code/docs, validated candidate decisions, and selected messages.
- Same Sonnet 5 answer instructions, high effort, 4096 output-token allowance. Tools disabled. Everything runs through the installed Claude Code subscription; no direct API-key transport.
- Local BM25 uses the question plus up to two matching decisions, selects four seeds and nearby messages, and returns at most eight complete messages / 12,000 characters in original order. It never sees scoring rubrics, reference answers or generated answers. No retrieval model calls.
- Messages are never cut midway. Oversized selections and selected IDs are recorded per question. All structurally retained decisions are available; they were not approved by the builder.
- Questions/rubrics/settings frozen before extraction or answering. A model judge scores shuffled anonymous labels; it may still infer the arm from context. The same requested model is used for capture, answers and grading. No independent human gold or repeated-run stability study.
- Timing includes the CLI wrapper and local retrieval, with two CLI processes at most in flight. It excludes the UI and one-time corpus preparation/extraction from response latency.
- Frozen corpus SHA256: `43a2412fc658a3845ab1047861edf7df7130926320d5a4f2d9ce0e203c0f8f50`.
- [Protocol](../features/coaching-retrieval-benchmark.md), [corpus](../../tests/evals/coaching/results/2026-09-10-retrieval/corpus.json), [manifest](../../tests/evals/coaching/results/2026-09-10-retrieval/manifest.json), [scores and answers](../../tests/evals/coaching/results/2026-09-10-retrieval/summary.json), [raw model calls](../../tests/evals/coaching/results/2026-09-10-retrieval/calls).

## Per-session results

| Session | Source session ID | Commit | Visible messages | Session passes | Retrieval passes | Retained decisions |
| --- | --- | --- | --- | --- | --- | --- |
| r01: Jobs and missing run logs | `964ce61b-c4b5-476d-975e-0f401bf47782` | `7f9f105` | 99 | 1/6 | 1/6 | 8/8 |
| r02: Persistent SQLite storage | `473c94ca-a511-4caa-bbfb-52342a79435b` | `808470e` | 51 | 3/6 | 3/6 | 8/8 |
| r03: Request logs | `9a9d7713-2967-4744-86e7-841788ab01c8` | `91311e9` | 36 | 2/6 | 2/6 | 8/8 |
| r04: Generated runbooks and review lifetime | `0f6aa39f-c101-41d4-a743-2114cbbf9c2c` | `241e5c9` | 51 | 3/6 | 4/6 | 7/8 |
| r05: Cron and unverified trigger delivery | `a6b56e54-f7a3-4935-96fb-26edbbd9f87d` | `7de2dc9` | 67 | 3/6 | 1/6 | 6/8 |

Paired outcomes: both pass 8; Retrieval only 3; Session only 4; both fail 15. Descriptive lift: -3.3 percentage points.

No significance or generalization claim: these are related sessions in one project, one answer per condition. Existing docs and code comments remain in both arms, even when they explain the why.

## Execution and subscription usage

| Stage | CLI attempts | Input tokens including cache/helper calls | Output tokens | API-equivalent usage |
| --- | --- | --- | --- | --- |
| capture | 5 | 332119 | 28113 | $1.6803 |
| answer | 60 | 3004586 | 41432 | $11.8866 |
| judge | 31 | 4888282 | 134722 | $20.2885 |

Direct API-key calls: **0**. CLI-reported API-equivalent usage: **$33.8554** across 96 attempts. This describes subscription allowance consumed and is not a separate API invoice. Unknown-usage attempts: 0.
Models reported by the CLI (including auxiliary work): `claude-haiku-4-5-20251001`, `claude-sonnet-5`.
Failed attempts remain in the artifacts. Answers are never regenerated for a better score.

## Question-level results

### r01-q1: job lifecycle

Why does deploying a job start nothing, and why does it use runner.py instead of guard.py?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Accurately explains deploy vs run split (fly.deploy never called for jobs; POST /api/runs starts the machine) and contrasts runner.py's finite run-to-completion, log-capture, exit-code reporting with guard.py's HTTP-serving role. Citations to small.js, generate.js, runner.py, and index.js match the quoted spec/code. No forbidden claim made. |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Correctly distinguishes deploy (image build/register, no machine start) from small run (control plane starts a machine per run via apiRunStart), citing d1/d2 and matching code. Ties runner.py to finite job execution with no port/auth wall, log batching, and exit-code reporting. No forbidden claim made. |

Retrieved: m10, m380, m970, m982, m995, m1077, m1095, m1097; 7330 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r01-q1.json).

### r01-q2: missing logs diagnosis

The script wrote its S3 result but Small kept showing running with no logs. What did this session eventually diagnose and change?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation  |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Citations list empty/omitted but claims align with evidence (m982, m1095, d4, runner.py lines); acceptable paraphrase. |

Retrieved: m10, m124, m358, m380, m387, m1077, m1095, m1261; 8765 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r01-q2.json).

### r01-q3: job verification

What did the final job integration run actually verify, and how long did that reported test run take?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | missing_citation Correctly reports the four passing checks (m1033) and cites both the 49s (m1033) and 59.81s (m1242/m1261) durations, framing them as agent-reported console output rather than new measurements. However, it fails to clearly identify 59.81s as the final reported duration — it presents the 49s run as 'the final job integration run' and only later notes the 59.81s rerun as ambiguous ('depending on which one is meant as final'), rather than affirmatively stating 59.81s is the actual final figure per the rebase/merge sequence. |
| retrieval | PASS | — |

Retrieved: m10, m358, m380, m387, m1095, m1248, m1261, m1263; 9064 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r01-q3.json).

### r01-q4: log delivery failure

Should a temporary failure to send a batch of logs terminate the user's job? What behavior should we preserve?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Accurately describes bounded retry/drop, independent exit code path, and the stderr-diagnostic addition tied to the real incident (m902-m982); final suggestion about surfacing drops to the CLI is explicitly framed as a forward-looking option, not a historical claim. |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Core retry/drop/stderr-diagnostic behavior correctly described and cited (runner.py:23-45, 70-83); one added claim about exit-code delivery reliability is contradicted by the incident evidence in context. |

Retrieved: m10, m380, m970, m982, m995, m1077, m1095, m1097; 7330 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r01-q4.json).

### r01-q5: run token duration

Was the six-hour run-token expiry chosen from measurements of customer job durations?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Correctly identifies the 6h expiry and states no rationale/measurement is recorded (with an explicitly-qualified speculative aside that doesn't overstate it as historical fact). However, one citation is inaccurate: it cites packages/control-plane/src/fly.js lines 213 for the fixed-256mb machine size comment, but that comment actually lives in packages/control-plane/src/index.js:213 — fly.js has no such content at that line. This citation does not support the claim it's attached to. |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Correctly identifies the 6h run-token expiry (index.js:207) and states no measurement/rationale is recorded; contrasts with decision d5 (machine size) only as an example of what *is* documented, not claiming it applies to token TTL. Citations (index.js:205-209, decision d5) accurately support the claims made. |

Retrieved: m10, m438, m462, m482, m496, m604, m1077, m1095; 4421 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r01-q5.json).

### r01-q6: job feature scope

Did this session ship scheduling, automatic job retries, concurrency limits, and a jobs web UI?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Output format is malformed (duplicated answer embedded as raw JSON text), but substantive content correctly defers the capabilities and separates log-POST retries from job retries; no invented claims found within its available context. |

Retrieved: m358, m380, m438, m462, m482, m496, m604, m807; 4244 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r01-q6.json).

### r02-q1: storage purpose

What failure motivated persistent storage, and why must the volume and machine stay in the same region?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | PASS | — |

Retrieved: m10, m23, m454, m790, m792, m840, m894, m912; 8754 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r02-q1.json).

### r02-q2: merge preservation

During the storage rebase, was it acceptable to replace the jobs machine configuration with the server's volume configuration?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | PASS | — |

Retrieved: m10, m23, m441, m454, m465, m790, m792, m840; 7286 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r02-q2.json).

### r02-q3: persistence evidence

The final live counter read 16. Did the persistence test require the counter to equal exactly 3, and what did it prove?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Correctly identifies the before+3 assertion and frames the 16 as session-reported cumulative evidence per m912; adds one unsupported inferred rationale but core required content is satisfied and no forbidden claims made. |
| retrieval | FAIL | Answer's available context omitted m912, so it never surfaces the before+3 assertion or the accumulation explanation for 16, and instead asserts the test required an exact value of 3 — the opposite of what the fuller historical record shows. Fails both required criteria; cited messages (m10, m454, m790) don't actually establish 'exactly 3' as the implemented assertion. |

Retrieved: m10, m23, m311, m441, m454, m465, m770, m790; 6757 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r02-q3.json).

### r02-q4: storage inference

What makes small init add storage, and should SMALL_DATA be requested from the user as a secret?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Correctly identifies the sqlite3-import/SMALL_DATA trigger and explains SMALL_* platform-injection/secrets exclusion with supporting code citations, but omits any mention of the counter's fallback to ./counter.db, leaving the second required criterion incomplete. |
| retrieval | FAIL | Correctly identifies sqlite3-import/SMALL_DATA trigger and explains SMALL_* platform-injection/secrets exclusion, but never mentions the local fallback to ./counter.db, so the second required criterion is only partially satisfied. |

Retrieved: m10, m23, m441, m454, m465, m770, m790, m792; 7211 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r02-q4.json).

### r02-q5: storage size rationale

Was 1GB selected after a measured storage-capacity study for the counter?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | PASS | — |

Retrieved: m10, m23, m441, m454, m465, m770, m790, m792; 7211 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r02-q5.json).

### r02-q6: storage boundaries

Can I tell colleagues this version includes automatic backups and shared storage across apps?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Correctly states backups/cross-app sharing were skipped per spec and describes the single-volume/single-region per-app design without presenting it as expandable now. Cited quotes (m10, m790, m912, fly.js 43-66) are accurate. Minor overreach in framing the storage ceiling as a scheduled 'later version' deferral, which isn't stated in the cited comment. |
| retrieval | FAIL | Correctly states backups/cross-app sharing were explicitly skipped and accurately describes the single-volume/single-region per-app design without implying current availability of deferred features. However, it misattributes a 'v4' future-work label to the fly.js:46 storage ponytail comment, which does not contain that label — a specific citation-source mismatch. |

Retrieved: m10, m23, m133, m138, m198, m454, m770, m790; 6593 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r02-q6.json).

### r03-q1: traffic versus machine state

Why did small logs change its default, and how can I still get the previous machine-state view?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | PASS | — |

Retrieved: m10, m30, m270, m288, m291, m327, m482, m487; 6055 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r03-q1.json).

### r03-q2: log privacy constraint

For easier debugging, should we log complete query strings, request bodies, and the asserted user on rejected direct requests?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Correctly says no to bodies/query strings (guard.py strips query, spec forbids bodies) and correctly explains rejected 403s omit user because the check returns before X-Small-User is read, directly addressing the 'no trusted attribution' point. Its added claim that the design was meant to prevent PII/secret leakage is speculative and presented as settled intent, which is not supported by the cited sources. |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Correctly identifies the query/body restriction as an explicit decision (d1) and correctly states rejected 403s log no user; explicitly and appropriately hedges that no deeper reason is recorded rather than inventing one. Explanation of why rejects have no user leans on the header being absent for direct-to-origin hits rather than explicitly stating untrusted-header-should-never-be-logged-even-if-present, but conclusion and mechanics are accurate and well cited. |

Retrieved: m10, m30, m270, m288, m291, m327, m482, m487; 6055 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r03-q2.json).

### r03-q3: request log evidence

What did the final two-user and direct-origin test report in small logs?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | PASS | — |

Retrieved: m10, m30, m270, m288, m291, m327, m482, m487; 6055 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r03-q3.json).

### r03-q4: batch timing rationale

Why exactly batch every two seconds or fifty lines? Was that interval benchmarked against one second?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Correctly states the 2s/50-line threshold as specified in m10 and implemented in guard.py; explicitly notes no benchmark or comparison against 1s exists, citing only sources present in its context (no decision objects available here, none cited). Citations accurately support the claims. |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Correctly states the 2s/50-line threshold as specified in m10/d2 and implemented in guard.py; explicitly notes no benchmark or 1s comparison exists in the record. Citations (d2, m10, guard.py line ranges) accurately support the claims. |

Retrieved: m10, m30, m270, m288, m291, m405, m482, m487; 6927 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r03-q4.json).

### r03-q5: websocket log status

A WebSocket log says status 101. Does that prove the upstream application returned a successful upgrade?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Correctly states 101 is a hard-coded assumption, not parsed from the upstream reply (matches guard.py 138-141 and docs 72-73). However it never states that the log line is emitted only after the tunnel/pump finishes (the timing detail in the criterion) — it only discusses the lack of reply-parsing, not the after-the-fact logging sequence, so the second required criterion is not fully satisfied. |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Explicitly states 101 is assumed, not parsed (guard.py 138-141, decision d6), and explicitly notes the log call happens 'after tunneling raw bytes both ways via _pump,' satisfying the timing clause, while also cautioning that a 101 only confirms the tunnel attempt, not a successful app-side upgrade. |

Retrieved: m10, m30, m270, m288, m291, m327, m482, m487; 6055 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r03-q5.json).

### r03-q6: log endpoint wiring

Why did this feature add a SMALL_LOG_URL assignment in deploy, outside the initial list of logging files?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Correctly explains the guard needs the log-ingest endpoint (which encodes the slug) to POST batches, and that old images without SMALL_LOG_URL stay stdout-only. Cites guard.py, small.js, index.js, and docs lines that support the claims. No forbidden claims made. |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Explicitly states the guard needs both the endpoint URL and its own slug to POST batches, and that old images without SMALL_LOG_URL stay stdout-only. Citations (guard.py, small.js, docs, decision d8) accurately support the claims despite unusual/duplicated formatting at the end. No forbidden claims made. |

Retrieved: m10, m30, m270, m288, m291, m327, m482, m487; 6055 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r03-q6.json).

### r04-q1: runbook purpose

Who was the generated runbook intended to help, and why reuse the deploy review call?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Both required elements (audience = colleague who didn't write the app; runbook rides the same model call/bundle rather than a new one) are satisfied and well-cited. No forbidden claim made (explicitly says single JSON response, no second call). The 'cost/efficiency and consistency' framing is an inferred rationale presented as fact rather than a recorded reason. |
| retrieval | FAIL | Both required elements are satisfied (colleague-audience framing plus explicit statement that the runbook reuses the same model call and bundle rather than a separate call). No forbidden claim made. Citations (m10, decisions d1/d2/d3/d8, review.js lines) accurately support the central claims made; the 'deliberate tradeoff' framing is an inferential gloss, not a recorded historical reason. |

Retrieved: m10, m32, m274, m279, m281, m725, m752, m754; 6056 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r04-q1.json).

### r04-q2: review lifetime correction

Why was deploy review moved out of waitUntil, and what replaced it?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Correctly reports the ~30s waitUntil ceiling discovered via live probing and the held-open POST /api/review/run replacement, correctly distinguishing the legacy waitUntil fallback for old CLIs from the new synchronous-await path. Citations (index.js, small.js, review.js, docs v8) accurately support the claims; no fabricated or contradicted facts. |
| retrieval | PASS | — |

Retrieved: m10, m32, m279, m587, m648, m660, m695, m723; 7919 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r04-q2.json).

### r04-q3: runbook storage choice

Did adding runbooks require a new D1 column or read endpoint? Where do the current and previous versions live?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Response JSON is malformed (stray bracket, 'unparsed_text' wrapper) but the substantive content correctly covers both required points and matches cited evidence. |
| retrieval | PASS | — |

Retrieved: m10, m32, m274, m279, m281, m695, m723, m752; 8012 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r04-q3.json).

### r04-q4: hand edits correction

Can I edit a saved RUNBOOK.md, and why was 'do not edit by hand' removed from its generated-by line?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Correctly states edits are allowed, explains the wording removal per user's own correction (m725), and explains the overwrite risk with the remaining 'regenerated on every deploy' warning (m752). Citations (d7, m725, m752, review.js lines) support the central claims. |

Retrieved: m10, m32, m274, m279, m281, m725, m752, m754; 6056 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r04-q4.json).

### r04-q5: route correction

The initial runbook test request named /click. Was that the actual counter endpoint used in the final test?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | PASS | — |

Retrieved: m10, m32, m279, m587, m648, m660, m695, m723; 7919 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r04-q5.json).

### r04-q6: diff algorithm rationale

Was the line-set runbook diff selected after benchmarking it against an ordered diff?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | PASS | — |

Retrieved: m10, m32, m274, m279, m281, m695, m723, m752; 8012 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r04-q6.json).

### r05-q1: cron overlap choice

What should cron do when the prior run is still active, and why not launch another machine?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | PASS | — |

Retrieved: m10, m23, m112, m135, m147, m251, m261, m263; 4540 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r05-q1.json).

### r05-q2: schedule placement correction

The test wrote a schedule into small.toml, but the control plane stored no schedule. What was wrong with the test setup?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Correctly identifies (via m671) that the appended schedule line landed inside the preceding [secrets] table rather than at the TOML root, and describes the prepend fix. Appropriately caveats the claim as an agent-reported debugging observation rather than independently verified fact, and does not conflate this with the later Cloudflare trigger-delivery issue or claim schedule was fixed by treating it as a secrets field. |
| retrieval | FAIL | Answer never identifies the actual root cause (schedule text appended after [secrets], landing inside that table) nor the prepend fix; instead it speculates a different, unverified explanation (missing kind="job") and explicitly flags it as a guess to be checked later. Cited code shows real mechanics but doesn't support the central causal claim, which is admitted speculation. |

Retrieved: m10, m23, m112, m135, m251, m261, m263, m287; 5020 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r05-q2.json).

### r05-q3: cron verification state

At the end of this session, had a real cron tick and overlap skip been successfully demonstrated?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Answer hedges without clearly asserting that the tick-dependent checks were never demonstrated; instead it constructs a false 'contradiction' by treating a pre-run test description (m261) as a reported pass, which is not supported by that message. Because available context truncates before the platform-bug discussion, it also does not address distinguishing the root-cause attribution as inference vs. fact. |

Retrieved: m10, m23, m251, m261, m458, m472, m474, m548; 5252 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r05-q3.json).

### r05-q4: late tick handling

How does the scheduler avoid double-firing when a tick is delayed or delivered again? Does it replay every missed minute after downtime?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation  |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation  |

Retrieved: m10, m23, m251, m261, m263, m472, m736, m754; 7296 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r05-q4.json).

### r05-q5: scan horizon rationale

Why does nextRun stop searching after four years? Was four years validated as the optimal performance cutoff?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | FAIL | Missing/malformed answer JSON. missing_citation Correctly identifies the 4-year scan as a guard against unsatisfiable expressions like the Feb-30 example, ties it to apiDeploy's 400 rejection at deploy time, and explicitly states no benchmark or performance comparison is recorded for the exact four-year figure. The ~2.1M-iteration estimate is a mechanical, explicitly-qualified observation (not claimed as historical rationale), so it is not counted as an invented claim. |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Meets both required points (identifies the deploy-time Feb-30 guard and explicitly denies any recorded optimality benchmark), but embeds an unstated, invented justification for why exactly four years was chosen, presented with unwarranted confidence. |

Retrieved: m10, m23, m251, m261, m263, m472, m736, m754; 7296 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r05-q5.json).

### r05-q6: pause preserves schedule

To stop further attempts while investigating trigger delivery, should I erase the cron expression? What did this session leave configured?

| Arm | Result | Failure explanation |
| --- | --- | --- |
| session | PASS | — |
| retrieval | FAIL | Missing/malformed answer JSON. missing_citation Correctly recommends pause (retain expression, set schedule_paused) with accurate citations. But its available context ends at m263 (initial build), before the actual debugging session where the schedule was paused/resumed; it never reports that the session ultimately left the test schedule paused, so it fails the second required criterion (reports only the feature's design, not the session's final state). |

Retrieved: m10, m23, m112, m135, m147, m251, m261, m263; 4540 characters. [Exact contexts and selection audit](../../tests/evals/coaching/results/2026-09-10-retrieval/context-r05-q6.json).

## Interpretation and limits

For this MVP, keep the authorized session evidence available to Coaching. This local retriever did not meet the pilot's success rule. First make answer formatting reliable, then improve retrieval of later corrections and final outcomes before testing again.

The disagreement review found concrete problems: [r05-q2](#r05-q2-schedule-placement-correction) missed the TOML placement fix, [r05-q3](#r05-q3-cron-verification-state) confused a proposed test with a successful run, and [r05-q6](#r05-q6-pause-preserves-schedule) omitted the final paused state. Some answers also supplied reasons or delivery guarantees absent from the evidence. These are observed failures of this implementation, not proof that retrieval cannot work.

The decision rule was fixed before inference. A failure to meet it does not show that all retrieval approaches fail; it evaluates this BM25/neighbor implementation and this extractor. Review disagreement rows to separate missing evidence, unsupported interpretation and output-format failures.

This experiment measures answers about historical work. It does not measure accepted changes, human time saved, live Chat behavior, permission enforcement, anchor durability, or safe ingestion of arbitrary private sessions (`ponytail:`). Source material was redacted before the run; passing redaction checks is not a general privacy guarantee. Raw tool payloads and hidden thinking were excluded, so the baseline is the full retained visible conversation, not every byte of the original session export.

## Reproduce

```powershell
python -m pytest tests/evals/coaching/test_bench.py -q -p no:cacheprovider
python tests/evals/coaching/bench.py --experiment retrieval --dry-run
python tests/evals/coaching/bench.py --experiment retrieval --run-dir tests/evals/coaching/results/new-retrieval-run --phase all
python tests/evals/coaching/bench.py --experiment retrieval --run-dir tests/evals/coaching/results/2026-09-10-retrieval --phase report
```

Report generation is offline. The capture/answers/judge phases resume only identical saved requests. Explicit finish-grading completes malformed or missing grades without changing answers.
