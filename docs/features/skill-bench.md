# skill-bench — a benchmark for skills/small

Turn the pass/fail eval (`tests/evals/eval_skill.py`) into a benchmark with
numbers we can track across skill edits, following the SkillsBench methodology
(arXiv 2602.12670) on our own tasks: measured skill lift, per-assertion pass
rates, cost, all committed as JSON baselines.

## Why

The eval answers "does the skill work today" once, binarily. It cannot answer:
did this SKILL.md edit make the skill better or worse, does the skill still
steer a weaker model, is the skill worth its tokens? A benchmark answers all
three with the same infrastructure the eval already has.

## Metrics (per scenario, per arm, per model)

- **Success rate** — fraction of reps where every assertion passed.
- **Per-assertion rate** — which specific behavior is flaky (e.g.
  `no-dockerfile 4/5`).
- **Skill lift** — success rate with skill minus without skill, in percentage
  points. The headline number.
- **Efficiency** — median cost (USD), wall seconds, and agent turns per rep,
  parsed from `claude -p --output-format json` (`total_cost_usd`,
  `duration_ms`, `num_turns`).
- **No-skill violations** — count of Dockerfiles written, AWS keys placed in
  `.env`, hand-rolled hosting attempts in the without-skill arm. This is the
  safety story the lift number doesn't show.

## Scenarios (v1 = 6)

S1–S3 are the existing eval scenarios, unchanged: plain flask, vague ask,
boto3 job with the IAM create-role loop.

New:

- **S4 adapter** — a working script plus "deploy this, don't rewrite it".
  Pass: original file byte-identical after the run, a thin adapter entry
  exists reading `SMALL_INPUT_*`, deploy ran. (Covers the "code already
  exists" section; flagged as a coverage gap twice.)
- **S5 jobs contract** — a script reading two env vars, asked to be runnable
  by teammates. Pass: both declared under `[inputs]`, results written to
  `$SMALL_OUTPUTS`, no print-only results.
- **S6 aws-hosting** — `small.toml` already carries `[deploy] target = "aws"`;
  fake `small workspaces` returns two slugs. Pass: deploy called with
  `--workspace <slug from output>`, target not silently changed, no Fly path
  taken. (Covers `references/aws-hosting.md`.)

Prompts stay human-authored and never leak assertion wording (SkillsBench
leakage policy). Shims stay deterministic.

## Scenarios added after v1

- **S7 knowledge** — one run answers platform Q&A, graded per question by a
  cheap judge model against reference facts (haiku by default; questions never
  contain their answers). Covers Run-form widgets, batching, defaults,
  outputs, storage, input types, and — after the constants/tooltip skill
  update — `SMALL_CONSTANTS` delivery, read-only Run > Constants (change =
  redeploy), tooltip being explanatory-only, image retirement, and
  installation-reported region.
- **S8 constants** — a detector whose logic consumes two module constants,
  plus two decoys the skill's rules exclude (platform plumbing named like
  `RUN_LIMIT_MB`, a never-read tag). Pass: both consumed values under
  `[constants]`, decoys excluded, code reads `SMALL_CONSTANTS`, values not
  re-offered as editable inputs, no placeholder/example-account copied,
  deploy through the workspace slug.
- **S9 grants** — exactly two SDK calls (`s3.get_object` on a named bucket,
  `lambda.invoke` on a named function). Pass: grants trace to exactly those
  actions/resources with the installation's account, no wildcards, no
  untraced extra actions, grants on one physical line, no placeholder copied.
- **plain** additionally asserts the SKILL.md handback checklist: runbook
  read back, AGENT.md written.
- **violations()** (no-skill damage report) additionally counts angle-bracket
  placeholders and the example AWS account id copied into `small.toml`.

## Arms and matrix

- **skill** — `.claude/skills/small` installed from the working tree, as the
  eval does today.
- **noskill** — identical temp project and PATH shims, no skill directory.
  The agent may still find `small --help` on its own; that is the honest
  baseline.
- Models: `claude-sonnet-5` is the default matrix; `claude-haiku-4-5` as a
  second column when asked (weak models are where skill wording earns money).
- Reps: 5 per cell by default (`-n` to change). v1 full run = 6 scenarios ×
  2 arms × 5 reps = 60 headless runs ≈ $10–20 on sonnet. Hand-triggered only,
  never CI.

## Harness

`tests/evals/bench_skill.py`, reusing the eval's shims and helpers (shared
bits move to `tests/evals/scenarios.py`; `eval_skill.py` keeps its CLI and
stays the fast pre-publish gate).

- `--dry-run` prints the planned grid and estimated cost, runs nothing.
- Reps run 4-wide in a thread pool; each rep is the existing
  temp-dir + `claude -p --output-format json` flow.
- Results append to `tests/evals/results/bench-<date>-<skillhash8>.json`:
  one record per rep (scenario, arm, model, per-assertion booleans, usd,
  seconds, turns) plus a summary block. The skill hash is the sha256 of the
  packaged skill files, so a result file pins exactly what was measured.
- Report: a terminal table (scenario × arm: rate, lift, median $ and s) and
  the same table as markdown appended to the results file. Result files are
  committed — the git history of `results/` is the trend line.

## Not in v1 (ponytail)

- No CI hook, no dashboard, no statistical significance at n=5 — raw rates
  only, read with judgment.
- No external SkillAudit/SkillTester integration until those tools stabilize;
  the results JSON is shaped so a later exporter is trivial.
- No multi-skill support; small is the only skill measured.

## Plan

1. Extract shared scenario/shim code into `tests/evals/scenarios.py`; add
   S4–S6 with their shims and assertions. → verify: `eval_skill.py` still
   ALL PASS (S1–S3 behavior unchanged).
2. Build `bench_skill.py` (arms, reps, json parsing, results file, table).
   → verify: `--dry-run` grid correct; smoke run `-n 1 --scenario plain`
   produces one valid results record with cost fields.
3. Full sonnet run, commit the results file as the first baseline.
   → verify: lift computed for all 6 scenarios; no assertion errors.
4. Before each `small-skill` npm publish: quick eval as today, full bench
   when SKILL.md changed materially. Haiku column on demand.
