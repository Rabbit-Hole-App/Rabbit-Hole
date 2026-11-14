# Topic pipeline commands

Built against `docs/features/explain/topics/SPEC.md` v1.2 and `docs/features/explain/topics/SOP.md`. Operator instructions and stop rules are in `docs/features/explain/topics/README.md`.

Install with `npm ci --prefix scripts/topic-pipeline`. Configure `scripts/topic-pipeline/config.local.json` from the example, then run `node scripts/topic-pipeline/run.mjs logistic-regression`. The same command resumes saved stages. Use `--from 02 --to 02` for coverage only, `--approve-prompts` for STOP-1, and `--go` after STOP-4 for release.

Run the offline checks with `node --test scripts/topic-pipeline/**/*.test.mjs`. The standalone linter is `node scripts/topic-pipeline/checks/reference-linter.mjs <module path>`.

See [What the first runs taught](../../docs/features/explain/topics/README.md#what-the-first-runs-taught) for batching, output limits, repair ownership and the operator integration base.
