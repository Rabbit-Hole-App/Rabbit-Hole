# Topic pipeline

The [specification](SPEC.md) and [SOP](SOP.md) are the source documents for this pipeline. The Reviewer owns both documents and the working agent prompts. Replace supplied document revisions verbatim.

Install the web workspace dependencies and run `npm ci --prefix scripts/topic-pipeline`. Copy `scripts/topic-pipeline/config.example.json` to `config.local.json` in the same directory. Fill all keys, operator paths, prices and endpoints there. Paths are relative to the local config file. Credentials are read from that file, and the config is ignored by git. Fixture inputs and recordings belong under the topic fixture directory. Keep operator files outside the authored worktree.

Run `node scripts/topic-pipeline/run.mjs logistic-regression --from 02 --to 02`. State and outputs go under the configured topic root in `logistic-regression/`. A completed stage is skipped on resume. An explicit `--from` archives that stage and every later stage's recorded artefacts under `history/` before rerunning. A concurrent run of one topic is refused.

The four stops follow SPEC §7. `--approve-prompts` stops after 01 at STOP-1. Exhausted verification stops at STOP-2 and resumes from 03. Pack failures and audit holds stop at STOP-3 and resume from 06. Stage 08 writes READY.md and stops at STOP-4. Only `run.mjs logistic-regression --go` after STOP-4 can enter 09.

Stage 02 uses the existing live planner and the same shared selector call as the server. Planner-derived `plannedKinds` and learner-requested `requiredKinds` retain their separate live meanings. A gallery shape cannot count as REUSE. The same worked source must appear first with the expected kind at all three depths and the injected coverage judge must agree. Deliverable 1 reads judge booleans from `fixture/coverage-judge.json`. A recorded planner fixture may be configured with `planner.fixtureFile`, keyed by the exact prompt and then the live depth names. Without that fixture the planner is a model call using the local config.

In fixture mode for Lesson 04, shipped `ml-trees-*` references are excluded before topical scoring and steering. The later author loop reserves `topic/decision-trees-dryrun`, modules named `topic-decision-trees-dryrun-*`, and ids prefixed `ml-dry-trees-`, as required by SPEC §4. Its separate worktree and permission-restricted test execution are part of deliverable 3.

The bench, sets, pack exporter and slug index come from the tooling checkout named by `repo.toolingRoot` at `repo.toolingRef`, initially `38e02e612`. They are called in place. The operator updates the ref once the Reviewer reports its merge. Stage stubs fail explicitly until their deliverable is implemented.

Run the required offline suite with `node --test scripts/topic-pipeline/**/*.test.mjs`. Provider calls are mocked in tests. The reference linter joins this suite and is also a standalone command, `node scripts/topic-pipeline/checks/reference-linter.mjs <module path>`. Legacy references may report rule 6 warnings because they predate derived-number provenance. A green offline suite establishes the contracts and fixture wiring. The Reviewer supplies the Lesson 04 human scoring fixtures and reviews each push before stack operation.

Topic naming follows SPEC §2a. The unchanged config and stage examples in §§3–4 still contain lesson-named fields, modules and commit text. Runtime schemas use a topic slug and prompt origin metadata. The source spec is preserved verbatim for the Reviewer to amend.
