# Coaching: decisions plus session retrieval

Approved experiment, 2026-09-10. Builds on the [first pilot](../testing/coaching-benchmark-results.md).
Status: completed. [Measured results and artifacts](../testing/coaching-retrieval-results.md).

The success rule was not met. Session passed 12/30 strict checks; Decisions plus
retrieval passed 11/30. Retrieval reduced serving input by 7.4%, but used 13.8%
more input after extraction. It had seven answers judged to include unsupported
claims, versus four for Session. Both arms had substantial JSON-format failures
(27 of 60 answers); the separately labeled content diagnostic scored 22/30 and
21/30. These are provisional model judgments, not production or human-utility scores.

Review found one faulty frozen timing criterion: the final job test took 59.81s,
after an earlier 49s run. Both saved answers were regraded against the correction;
the original corpus, grades and score snapshot remain in the artifacts. No answers
were regenerated. All model calls used the Claude Code subscription.

Compare two arms on 30 frozen questions (six per session):

| Arm | Context |
| --- | --- |
| Session | Selected historical code/docs plus the complete normalized visible conversation. |
| Retrieval | Identical code/docs plus structurally validated decisions and locally retrieved conversation messages. |

Use five distinct Claude Code sessions from the Jobs, SQLite storage, request-log,
runbook and cron worktrees. None is the first pilot's source session. They remain
a convenience sample from one builder and repository; different session IDs do
not imply statistical independence. Exclude tool payloads, hidden thinking,
terminal-command envelopes, task notifications, and compaction-generated summaries.
Redact the retained visible text before freezing or sending it to the model.
Record every retained message's original ID, line number and content hash.

Freeze source snapshots, messages, question rubrics, prompts and retrieval settings
before inference. Both arms use Claude Sonnet 5 through the installed Claude Code
subscription, identical answer instructions and output limits, fresh contexts,
and no agent tools. API-key fallback is prohibited. Each answer is attempted once;
malformed or failed answers count as failures. No answer regeneration for scoring.

## Retrieval implementation

Use local BM25 ranking over visible messages, requiring no model or embedding call.
Expand the question with up to two relevant extracted decisions. Select up to four
matching messages, then add immediately adjacent messages where the budget permits.
Return messages in original order. Limit retrieved text to 12,000 characters and
eight messages; never cut a message in the middle. Keep all structurally validated
decision records in the Retrieval arm. Save scores, selected IDs, skipped oversized
messages and local duration for each question. Retrieval never receives the rubric,
reference answers, judge results or an answer from either arm.

This measures one simple retrieval implementation. It does not establish how a
semantic retriever or an agent with iterative search would perform.

## Score and decision rule

Use the existing strict score: every required criterion satisfied, no forbidden or
unsupported factual claim, and valid supporting citations. Grade the two answers
under anonymous labels in shuffled order using the frozen evidence/rubric. Retain
judge explanations. Explicitly complete invalid/incomplete graders while preserving
all attempts; never choose a grader based on which arm it favors.

Report 30-answer denominators, paired wins/losses, per-session results, unsupported
claims, citation/format failures, reported input/output tokens and request latency.
Count uncached and cached input tokens, plus Claude Code auxiliary calls. Show
one-time extraction separately and amortized over six questions per session.
Include local retrieval duration; extraction is preparation, not chat latency.
CLI-reported dollar values are API-equivalent usage, not a metered API invoice.

Success for this pilot means Retrieval has at least as many strict passes as
Session, no more answers with unsupported claims, and fewer total input tokens
including extraction. Also show serving-only tokens so setup amortization is clear.
No population, significance, production-readiness or human-utility claim.

## Checklist

- [x] Freeze five distinct sessions and 30 questions (304 retained visible messages).
- [x] Test ranking, neighboring context, limits, isolation and accounting (31 tests).
- [x] Extract five sets of decisions through the subscription (37 of 40 retained).
- [x] Generate 60 answers and grade all 30 pairs.
- [x] Review failures and save measured results in Markdown, including the audited timing correction.

The work stays in the standalone benchmark harness. Production ingestion, Chat
integration, permission enforcement and human-approved memory are separate work
(`ponytail:`). Records here are validated candidates, not builder-approved facts.
