# Coaching context evaluation

This is a standalone model experiment. It never deploys or runs an app. New runs
default to the installed Claude Code subscription login; API-key fallback is blocked.
See [the protocol](../../../docs/features/coaching-benchmark.md) and
[the measured report](../../../docs/testing/coaching-benchmark-results.md).

The second experiment compares full visible session context with Decisions plus
local retrieval on five different sessions and 30 new questions (60 answers).
See its [protocol](../../../docs/features/coaching-retrieval-benchmark.md) and
[results](../../../docs/testing/coaching-retrieval-results.md).

```powershell
python tests/evals/coaching/bench.py --experiment retrieval --dry-run
python tests/evals/coaching/bench.py --experiment retrieval --run-dir tests/evals/coaching/results/new-retrieval-run --phase all
python tests/evals/coaching/bench.py --experiment retrieval --run-dir tests/evals/coaching/results/2026-09-10-retrieval --phase report
```

`prepare_retrieval.py` freezes the five identified worktree sessions and historical
source snapshots in `retrieval-corpus.json`. `retrieval.py` ranks messages locally,
preserves nearby context, and saves exactly what each answer sees. It never sees
grading rubrics during retrieval. Its report counts cached input and CLI helper
tokens, including one-time extraction, and retains incomplete outcomes.

The checked-in `corpus.json` contains five **real excerpts from one Claude Code
session**, 38 selected visible messages, historical source snapshots, 20 reference
decisions and 30 frozen questions. It is not five independent sessions or human gold.
Raw tool payloads, hidden thinking, customer job data and unrelated messages are
excluded. The selected transcript line numbers and original text hashes are saved.

```powershell
python -m pytest tests/evals/coaching/test_bench.py -q -p no:cacheprovider
python tests/evals/coaching/bench.py --dry-run

# Sign into Claude Code with your subscription first. At most 2 CLI processes in flight.
# The runner removes API-key/provider overrides from the child environment.
python tests/evals/coaching/bench.py --run-dir tests/evals/coaching/results/new-run --phase all

# Offline: regenerate the Markdown and JSON scores from saved responses.
python tests/evals/coaching/bench.py --run-dir tests/evals/coaching/results/2026-09-10-real-excerpts --phase report
```

Optional phases are `capture`, `answers`, `judge`, and `report`. A request is reused
only when its hash matches exactly. Failed calls remain saved; no silent retries.
`finish-grading` explicitly completes failed API-era graders through the subscription
and writes a selection audit without replacing the original attempts or any answers.
The initial recorded pilot used the API before the user requested subscription usage;
the report separates its $7.03 estimate from subsequent subscription consumption.
The old API transport remains available only through explicit `--transport api`, with
a $15 default ceiling and a separately supplied workspace/key. Do not use it for this
user's runs unless they change their subscription preference.
Each provider artifact includes the exact redacted request, response ID, model,
usage, latency, stop reason and cost estimate. Authentication headers are never
saved. Report generation is offline. The harness and tests use Python stdlib plus
the repository's existing pytest; no dependencies were added.

`prepare.py --session <local Claude JSONL>` can rebuild this particular corpus from
its explicit message selection and the repository's immutable historical commits.
It is a corpus preparation script, not a production session ingester. Never use a
customer session without authorization to process that material with the chosen
model service. Redaction tests and a clean boundary check do not establish that
arbitrary conversations are safe to upload.

Both experiments preserve the fixed thirty-question denominator per arm. Scoring separates
supported decisions, missing reasons, structural anchor validity, answer quality,
and response-format failures. This pilot uses model judgments and developer-authored
labels. Its numbers are provisional, and no human task-success claim is made.
