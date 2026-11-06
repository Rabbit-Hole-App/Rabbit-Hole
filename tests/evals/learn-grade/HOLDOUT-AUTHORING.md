# Writing benchmark-v1-holdout

This file is for the person or separate session writing the frozen held-out
set. Spec: docs/features/jev-grading.md, section Benchmark.

Rules:
- Write it **outside this checkout** (for example under
  C:/Users/cyudhist/Desktop/workspace/small-deploy/learn-grade-holdout/) and
  keep it there until the switch evaluation. The session that builds and tunes
  the grader must never open it.
- Use the same file shape as benchmark-v1.json, with `"version": "benchmark-v1-holdout"`.
- Write 6 challenges, 3 with `mode: "challenge"` and 3 with `mode: "explain_back"`,
  each with 3-5 key ideas. At least 3 of the 6 must not appear in benchmark-v1.
- Give each challenge one answer per pattern (all 12 patterns in
  tests/evals/learn-grade/set-rules.mjs), so there are at least 30 cases per mode.
- Labels are true by construction. Each answer contains exactly the ideas its
  `gold.ideas` marks true, following the pattern rules in set-rules.mjs.
- Case ids match ^[A-Za-z0-9_-]{3,40}$ and are unique.
- Check the file (run from the small-parallel checkout, passing the holdout's absolute path):
  cd C:/Users/cyudhist/Desktop/workspace/small-parallel && node --input-type=module -e "import { readFileSync } from 'node:fs'; import { validateSet } from './tests/evals/learn-grade/set-rules.mjs'; console.log(validateSet(JSON.parse(readFileSync(process.argv[1], 'utf8'))));" <absolute-path-to-holdout.json>
  It must print [].
- Hash it with:
  node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1])).digest('hex'))" <path-to-holdout.json>
- Send only that hash. It is committed as tests/evals/learn-grade/HOLDOUT.sha256.
- The benchmark's Opus calls store prompts and answers in the test identity's
  Learn chat threads (LEARN_DB `messages`). Tuning sessions never read those
  threads, and after any holdout run the operator deletes that run's threads.
