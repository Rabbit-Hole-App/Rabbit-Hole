# Topic pipeline — build specification for Codex (v1.2, 2026-11-12 13:20 — v1.1 + topic naming; v1.1 included the answers to Codex's six questions)

Owner: Rabbit Hole. Author of this spec: the Reviewer. Builder: Codex. Operator after approval: Claude Code (keys, stack, database, release tooling live on his machine). Nothing in this spec starts before the owner says go, and nothing is merged into a release before the 118 gate is through.

## 1. What is being built, in one paragraph

One command, `node scripts/topic-pipeline/run.mjs <topic>`, turns a curriculum lesson into worked `/explain` references and proves them live, with no human in the loop except at four stop points. It writes 12 learner prompts from the lesson page, checks which already hit an existing reference, authors the missing references with a GPT model, verifies the figures with a vision model, integrates them into the release candidate, runs the 12 prompts through live `/explain`, audits the cards against the references with a vision model, deploys the preview and stops with "READY" for the owner to record. Every stage reads and writes files in `docs/features/explain/topics/<topic>/`, is resumable, and is scored against a fixture for Lesson 04 (the lesson built by hand on 2026-11-09) so we can tell whether the automated run reproduces what the humans did.

## 2. Repository layout

### 2a. Naming — topics, not lessons (v1.2)
Every artefact is named by its **topic slug** (`decision-trees`, `logistic-regression`, …), never by a lesson number: the docs folder `docs/features/explain/topics/<topic>/`, the branch `topic/<topic>`, the modules `topic-<topic>-*.js`, the bench set `demo-<topic>.json`, the CLI `run.mjs <topic>`. A topic can serve several curriculum lessons and will later take prompts that come from no lesson at all (learner questions, owner requests). The lesson is metadata: `topics/<topic>/topic.json` = `{ topic, title, lessons: ["03"], sources: [{ kind: "curriculum", path, revision }] }`, and every prompt in `prompts.json` carries `origin: "lesson" | "learner" | "owner"` plus `lesson` when it has one. `topics/queue.json` lists `{ topic, lessons }` in run order. The shipped Lesson 04 modules keep their existing `lesson-decision-trees-*` names (exemplar; renaming shipped files is out of scope); everything the pipeline writes follows the topic rule. The `lessons` tag on registry references stays as it is today.


```
scripts/topic-pipeline/
  run.mjs                 CLI: run <topic> [--from <stage>] [--to <stage>] [--approve-prompts] [--go] [--dry-run] [--fixture]
  config.example.json     every key, path, model and URL the pipeline needs; Claude Code copies it to config.local.json (git-ignored) and fills it in
  state.mjs               read/write docs/features/explain/topics/<topic>/state.json; stage status, attempts, timestamps, artefact paths
  agents/
    client.mjs            one wrapper for both providers: call(agent, inputs) → validated JSON; retries on schema failure (≤ 2); logs tokens + cost per call to state
    schemas/*.json        JSON Schema for each agent's output
    prompts/*.md          system prompts (prompt-writer.md, author.md, verifier.md, auditor.md); the Reviewer owns their text; Codex wires them. For the first dry run Codex drafts v0 from the SOP sections cited in §5; the Reviewer replaces them before approval
  stages/
    01-prompts.mjs 02-coverage.mjs 03-author.mjs 04-verify.mjs 05-integrate.mjs 06-pack.mjs 07-audit.mjs 08-ready.mjs 09-release.mjs
  checks/
    reference-linter.mjs  the invariants in §6, runnable alone: node checks/reference-linter.mjs <module path> → exit 1 with a list
    contact-sheet.mjs     renders every preview of a lesson at 408 px into one PNG grid + numbers.json (every numeric literal in titles, captions, labels, with its source line)
    paraphrase-replay.mjs 5 paraphrases per prompt through the selector WITH planner kinds; first-pick rate
    fixture-score.mjs     compares a stage's output with docs/features/explain/topics/decision-trees/fixture/ (§9) and prints agreement
  notify.mjs              writes READY.md / STOPPED.md and posts to the webhook in config (Slack or email; the owner decides which)
docs/features/explain/topics/
  README.md               how to run, the stop rules, the folder contract
  <topic>/
    topic.json prompts.json coverage.json author/ (round-N logs) verify.json pack/ (the review pack) audit.json READY.md state.json
  decision-trees/fixture/ ground truth from the manual Lesson 04 run (provided by the Reviewer, §9)
  topic.json per topic; queue.json; SPEC.md; SOP.md
```

Topic sources: the curriculum markdown at the audited revision `e7db050e64bde3be17a9381476f748da26d85692` (`phases/02-ml-fundamentals/<slug>/docs/en.md`); the lesson queue and slugs are in `docs/features/explain-on-canvas/handoff/figure-briefs/briefs/README.md`.

## 3. Config (config.example.json — Claude Code fills the local copy)

```json
{
  "anthropic": { "apiKey": "", "reviewerModel": "claude-fable-5-1", "effort": "high" },
  "openai":    { "apiKey": "", "authorModel": "gpt-6.1-sol", "reasoningEffort": "max", "api": "responses" },
  "planner":   { "note": "the JEV/TypeSafe planner is a model call; the same key/env the control-plane uses", "apiKey": "", "endpoint": "" },
  "stack":     { "baseUrl": "http://127.0.0.1:8888", "varsFile": "<worktree>/packages/control-plane/.dev.vars", "appLog": "<persist>/app.log", "persistDir": "<persist>", "startCmd": "", "stopCmd": "" },
  "repo":      { "root": "", "releaseBranch": "release/explain-<N>", "lessonBranchPrefix": "lesson/" },
  "bench":     { "outRoot": "", "judgeCapUsd": 1.0, "capUsd": 2.0 },
  "preview":   { "deployCmd": "", "urlFile": "" },
  "notify":    { "webhookUrl": "", "channel": "" },
  "limits":    { "authorRounds": 3, "verifyRounds": 2, "regenerateOnce": true, "perLessonUsd": 15 }
}
```

The pipeline never reads a key from anywhere but this file; it never prints a key; it refuses to start if `perLessonUsd` would be exceeded by the estimate. Preflight estimate = per-agent ceilings × configured prices: prompt-writer ≤ 30k in / 8k out; coverage-judge ≤ 2k / 200 per call × 12; author ≤ 120k in / 40k out per round (reasoning tokens count as output) × `authorRounds`; verifier and auditor ≤ 60k in (images included) / 8k out per call. The same ceilings set `max_output_tokens` per call. Abort mid-run if actual spend passes 1.2 × estimate.

## 4. Stages — contracts

Every stage: `run(ctx) → { status: 'ok' | 'stop' | 'fail', artefacts: [...], notes }`. `stop` halts the pipeline at a defined stop point (§7); `fail` halts with an error. All outputs are files in the lesson folder; `state.json` records status per stage.

### 01 Prompts — agent **prompt-writer** (Anthropic, reviewer model)
- In: lesson markdown; the kinds catalogue (generated from the Zod spec: kind → one line); SOP §2.
- Out: `prompts.json` — `{ lesson, slug, toyData: { rows: [...], features: [...], label, usedBy: [ids] }, extraData?: {...}, prompts: [{ id, prompt, kind, content, keywords: [2–3 strings of ≤ 3 words], data: 'toy-exact' | 'illustrative', why }] }` (schema in `agents/schemas/prompts.json`).
- Gate: schema-valid; exactly 12 prompts, ids 1–12, prompt strings unique; kinds ∈ catalogue; ≥ 6 coordinate-plot; at most 3 prompts of any other single kind; prompts lowercase, end with `?`, ≤ 140 chars.
- With `--approve-prompts`: write the file, `stop` at **STOP-1** until `run.mjs <topic> --from 02` (the owner may edit the file first).

### 02 Coverage — script
- For each prompt: run the planner the way the live path does (`packages/control-plane/src/explanation-planner.js`, same inputs as the server, no picture provider; it is a model call, keys from `config.planner`) and call the selector **exactly as the server does**, with both planner-derived `plannedKinds` and learner-requested `requiredKinds`, for the three depths. Preferably lift the server's call into one shared helper (e.g. `selectForAuthor({ prompt, depth, plan })` in `explanation-references.js`) used by server and pipeline alike, so parity is structural; minimal change, covered by the existing selector tests.
- Out: `coverage.json` — per prompt: `firstHit`, `isWorked`, `kind`, `collision` (two worked refs of one kind would be sent), `decision: 'REUSE' | 'NEW'`. Rule: REUSE when the **same** worked reference is the first hit at all three depths, its kind equals the prompt's kind, **and** a tiny agent call (`coverage-judge`, reviewer model, schema `{ sameTeachingPoint: boolean }`, inputs: the reference's title + caption + `useWhen`, the prompt's `content`) says yes; anything else is NEW. In deliverable 1 the judge answers come from `fixture/coverage-judge.json` (prompt id → boolean); the live adapter arrives in deliverable 2.
- In `--fixture` dry-run mode the shipped Lesson 04 references (`ml-trees-*`) are **masked** from the selector here and in stage 03's replay, otherwise every prompt is REUSE and nothing is authored.
- Gate: deterministic given the agent answer; always `ok`.

### 03 Author — agent **author** (OpenAI, author model), ≤ `authorRounds`
- In: `prompts.json`, `coverage.json`, SOP §4 rules, the toy-data template, **one exemplar**: Lesson 04's `lesson-decision-trees-*.js` files and walkthrough as the pattern to follow, the Zod spec excerpt for each kind used, the token-budget rule, and on retries the verbatim linter/test output.
- Out: files, returned as `{ files: [{ path, content }] }` and written by the orchestrator onto branch `topic/<topic>` (created from the release branch; in `--fixture` dry-run mode the branch is `topic/decision-trees-dryrun`, the module is `lesson-decision-trees-dryrun-*`, and all ids carry the prefix `ml-dry-trees-` so nothing collides with the shipped Lesson 04): `packages/web/src/tutor-diagrams/topic-<topic>-data.js`, `topic-<topic>-references.js` (+ `.test.mjs` recomputing every number), `topic-<topic>-token-budgets.json`, registry wiring in `reference-library.js`, replay cases, `docs/features/explain-on-canvas/handoff/phase02-library/topic-walkthroughs/<topic>.md`, lesson-brief link. For REUSE prompts: no edit to the existing reference module — write a lesson-local overlay `topic-<topic>-overlays.js` exporting `{ [referenceId]: { prompts: [...], keywords: [...] } }`, applied when `reference-library.js` loads; the linter checks overlays too.
- Orchestrator then runs, in order: `node --test` on the topic's tests; `checks/reference-linter.mjs`; `packages/web/scripts/illustration-previews.mjs` (previews at 408/natural/960 + `spec.json`); `packages/web/scripts/explanation-svg-snapshots.mjs` (update); the selector replay with planner kinds (every prompt → its reference first at 3 depths; zero prior pick changes); `checks/paraphrase-replay.mjs` (≥ 80 % first-pick); `checks/contact-sheet.mjs`. Any failure → next round with the output appended. All green → commit "Lesson <NN>: references" (one commit per round; squash at approval).
- Gate: all checks green within `authorRounds`; else `fail`.

### 04 Verify — agent **verifier** (Anthropic, vision)
- In: the contact sheet PNG; `numbers.json`; each reference's `spec.json`; `prompts.json`; the SOP §5 checklist.
- Out: `verify.json` — per figure `{ id, verdict: 'ship' | 'fix', reasons: [...], layer: 'reference' | 'data' | 'label' }`. Must explicitly check: every stated count against the data (leaf counts vs depth, rows, draws), axis units, role words, maths delimiters, whether the figure shows what the prompt's `content` says.
- Fix list → stage 03 again (≤ `verifyRounds`), then **STOP-2** (human) if still not all ship.

### 05 Integrate — script, calling Claude Code's existing tooling
- Cherry-pick the lesson commit(s) from `topic/<topic>` into the release branch (lesson files + snapshots only; refuse if the diff touches anything outside `packages/web/src/tutor-diagrams/lesson-*` (including `topic-<topic>-overlays.js`), the lesson's previews, snapshots, token budgets, `reference-library.js`, the walkthrough and brief).
- Run: focused suites, snapshot test, selector parity, the A1 bundle property count (must stay ≤ 362), and the tier-1 smoke set via `bench.mjs --sets smoke` (set file `scripts/explain-bench/sets/smoke.json`, built by Claude Code under his two-tier-gate task; if absent, run `--sets demo-<topic>` only and record "smoke set missing").
- Gate: all green; else `fail`.

### 06 Pack — script, calling the bench
- Write `scripts/explain-bench/sets/demo-<topic>.json` from `prompts.json` (same format as `sets/demo-lesson04.json`: id, prompt, expected reference id, expected kind, depth standard).
- Run `node scripts/explain-bench/bench.mjs --base <stack> --vars <vars> --log <appLog> --persist <persist> --sets demo-<topic> --runs 1 --judge --judge-only factual --cap <capUsd>` against the stack started from the release branch (`stack.startCmd` / `stopCmd` from config).
- Export the pack with a **generalised** `scripts/explain-bench/topic-pack.mjs` (derive it from `demo-lesson04-pack.mjs`: parameterise the set name, reference lookup from the lesson branch, output folder `docs/features/explain/topics/<topic>/pack/`; keep the card.md / pipeline / visual / `reference-408.svg` / index.md format).
- Gate: intended reference sent 12/12 (from the `References sent` pipeline line); model kind = reference kind ≥ 11/12; delivered 12/12; else **STOP-3** (human) with the failing pipeline lines in `STOPPED.md`.

### 07 Audit — agent **auditor** (Anthropic, vision)
- In: per card, the model PNG and `reference-408.svg` rendered to PNG side by side, the body text, the pipeline lines (planner kind, steer, repairs, references sent), the factual judge score and reasons.
- Out: `audit.json` — per card `{ id, verdict: 'ship' | 'regenerate' | 'hold', reason, layer: 'reference' | 'selector' | 'server' | 'author-prose' | 'renderer' }`. Rules from SOP §8: ship = the reference figure (or a faithful variant), numbers right, prose consistent; regenerate = variance (schema slip repaired into another kind, wrong sibling reference, label-rebuilt card); hold = a known factual error in reference or prose.
- `regenerate` → the orchestrator reruns those prompts once (bench `--only`), re-exports, re-audits those cards. Any `hold` → **STOP-3**.
- Gate: ≥ 11/12 ship after the one regenerate, 0 hold.

### 08 Ready — script
- Deploy the preview from the release branch (`preview.deployCmd`; URL from `preview.urlFile`).
- Write `READY.md`: preview URL, the record list (ship cards), the prompt wording to type, cards skipped and why, cost so far. Notify. **STOP-4** (owner records).

### 09 Release — script, only with `--go`
- Tier-1 release of the release branch via Claude Code's launcher scripts (named in config), ledger row appended to `docs/features/explain/benchmarks/test-ledger.md`, next lesson id written to `docs/features/explain/topics/queue.json`.

## 5. Agents — models, I/O, prompt ownership

| Agent | Provider / model (config) | Output schema | System prompt file | Drafted from |
|---|---|---|---|---|
| prompt-writer | Anthropic reviewer model, high effort | `schemas/prompts.json` | `prompts/prompt-writer.md` | SOP §2 |
| verifier | Anthropic reviewer model, vision | `schemas/verify.json` | `prompts/verifier.md` | SOP §5 + §4 invariants |
| auditor | Anthropic reviewer model, vision | `schemas/audit.json` | `prompts/auditor.md` | SOP §8 |
| author | OpenAI `gpt-6.1-sol`, `reasoning.effort: max`, Responses API, structured output, no tools; overridable per run with `--author-model` / `--author-effort` | `schemas/author-files.json` | `prompts/author.md` | SOP §4 + Lesson 04 exemplar |

`client.mjs`: one function per provider (Anthropic Messages API for the reviewer model; OpenAI Responses API for the author, logging reasoning tokens separately); JSON mode / structured output where the provider supports it; validate with the schema; on failure, re-ask once with the validation errors; log `{ agent, model, inputTokens, outputTokens, usd, ms }` into `state.json`. No streaming needed. Temperature default for the reviewer model; the author model at the provider default unless the owner sets otherwise in config.

## 6. Reference linter — the invariants (checks/reference-linter.mjs; also run by Codex's own tests from now on)

For every reference in a lesson module, at all three depths:
1. Compact JSON (`JSON.stringify` without spaces) ≤ 300 cl100k tokens.
2. The lesson prompt appears **verbatim** in `prompts`; `keywords` has 2–3 entries of ≤ 3 words each, lowercase.
3. No role words in any label (`parallel`, `merge`, `decision`, `process`, `terminal`, `start`, `end` as a label prefix); roles live in the `role` field.
4. Maths only inside `$…$`; no bare `\log`, `\frac`, `^`, `_` outside delimiters.
5. Axis labels name a learner unit (degrees, %, count, probability, …); forbidden: "units", "48ths", "7.5°".
6. Every numeric literal in a title, caption or label is **derived** (comes from the data module or a computed expression), not typed — enforced by requiring the module to export `derived()` and the test to assert each caption number appears in `derived()`. Mandatory for modules the pipeline authors; a **warning** for pre-existing modules (Lesson 04 predates the rule).
7. Log axes only on series where the data spans ≥ 2 decades.
8. For one prompt, no two **worked** references of the same kind are selectable (checked with the coverage machinery).
9. Depth variants: Brief has fewer elements than Balanced; Detailed carries at least one number or formula Balanced does not.
10. Illustrative values are marked (`caption` begins with "Illustrative" or the N1 marker used by the library).
11. **Agent-authored files are data modules** (static rule, checked on the text before any import): only relative imports resolving inside `packages/web/src/tutor-diagrams/`, plus `node:test` / `node:assert` in test files; forbidden anywhere: any other `node:*` built-in, bare package imports, `require`, dynamic `import()`, `eval`, `new Function`, `fetch`, `process.`, `globalThis.`, `child_process`, `worker_threads`, `WebSocket`, `XMLHttpRequest`. Size caps: ≤ 200 KB per file, ≤ 40 files per round; paths outside the stage-05 allowlist are rejected at schema level.

Exit 1 with a list `{ id, depth, rule, detail }`.

## 6b. Isolation for stage 03 (operator machine has no container runtime)
Authored files are written into a separate git worktree for `topic/<topic>` (never the operator's main checkout). The linter (incl. rule 11) runs on the text first. Tests run in a child `node --test` under Node ≥ 24's permission model: `node --permission --allow-fs-read=<worktree> --allow-fs-write=<worktree>` (no `--allow-child-process`, no `--allow-worker`), scrubbed environment (no keys, no `.env`, no path to `config.local.json`), `cwd` = worktree, 10-minute timeout. This is process-level isolation; rule 11 is what keeps authored code from reaching the network or the shell.

## 6c. Tooling source
`repo.toolingRef` (default `38e02e612` on `explain/quality-bench`) names the checkout that supplies the bench, judge, pack exporter, sets and slug index. Claude Code is merging that SHA as a real merge commit into `release/explain-119-bench` (then bench-117, demo-lesson04, smoke-tier); when reported, the default moves to that branch, and to `main` once 119 ships.

## 7. Stop points and the `--go`

| Stop | Where | Written | Resume |
|---|---|---|---|
| STOP-1 | after 01 if `--approve-prompts` | `prompts.json` | `run.mjs <topic> --from 02` |
| STOP-2 | 04 verify not all ship after `verifyRounds` | `STOPPED.md` with the fix list | human fixes or edits prompts; `--from 03` |
| STOP-3 | 06 pack below threshold, or 07 any hold | `STOPPED.md` with pipeline lines / holds | human; `--from 06` |
| STOP-4 | after 08 | `READY.md` | owner records; `run.mjs <topic> --go` runs 09 |

Release never happens without `--go`. Any stage may be re-run with `--from`; artefacts of later stages are archived under `history/` in the lesson folder, never overwritten silently.

## 8. Existing tooling to call, not rebuild

- `scripts/explain-bench/bench.mjs` (README in the same folder): card generation + judges against a local stack; flags `--sets`, `--runs`, `--judge --judge-only factual`, `--cap`, `--log`, `--persist`, `--only`.
- `scripts/explain-bench/report.mjs` for re-scoring saved cards.
- `scripts/explain-bench/demo-lesson04-pack.mjs` → generalise to `topic-pack.mjs` (keep the per-card format: card.md with body + pipeline, `visual-1.{json,svg,png}`, `card.png`, `reference-408.svg`, `index.md`).
- `scripts/explain-bench/sets/demo-lesson04.json` as the set-file format.
- `packages/web/scripts/illustration-previews.mjs` (previews), `packages/web/scripts/explanation-svg-snapshots.mjs` (snapshots), the selector replay tests in `packages/web/src/tutor-diagrams/`, `packages/control-plane/src/explanation-references.js` (`selectDiagramReferences`) and `explanation-planner.js` (planner).
- The release launcher scripts and preview deploy are Claude Code's; the pipeline shells out to the commands named in config.

## 9. The Lesson 04 fixture and the dry run (acceptance test)

`docs/features/explain/topics/decision-trees/fixture/` (provided by the Reviewer before approval):
- `prompts.human.json` — the 13 demo prompts with kinds and content, as used on 2026-11-09.
- `references.human/` — Codex's 15 `ml-trees-*` references (specs + 408 previews) as shipped in release 118.
- `references.defective/` — the pre-fix versions extracted from git history, with `expected-verdicts.json` (id@sha → ship|fix, reason; mapping supplied by the Reviewer): `ml-trees-threshold-search`@c3e40994 ("Weighted Gini in 48ths"), `ml-trees-regression-step-fit`@5de6a499 (16 leaves labelled depth 5), `ml-trees-majority-vote`@06721c8b ("Parallel:"/"Merge:" labels), `ml-trees-gini-vs-entropy`@06721c8b (raw LaTeX caption), `ml-trees-forest-size-accuracy`@06721c8b (log ticks 3.7606/14.1421/53.183), `ml-trees-depth-overfit`@c3e40994 and `ml-trees-feature-importance`@c3e40994 (pilot fix verdicts). The verifier is scored on defective ∪ corrected.
- `verify.human.json` — the Reviewer's per-figure verdicts on the pilot (c3e40994: ship 6 / fix 4 with reasons) **and** the depth-5 mislabel that was missed by the Reviewer and caught by the judge.
- `pack.human/` — demo pack v2 (1f0f9806) and `audit.human.json` (ship 10 / regenerate 2 / hold 1 with reasons).

`run.mjs decision-trees --dry-run --fixture` runs stages 01–07 for Lesson 04 from scratch on a `topic/decision-trees-dryrun` branch (never touching the shipped Lesson 04; stage 05 integrates into a throwaway `release/dryrun-decision-trees` branch and the stack for stage 06 is started from it on Claude Code's machine) and prints, via `checks/fixture-score.mjs`:
- 01: teaching-point overlap with `prompts.human.json` (the verifier agent maps prompt↔prompt) — **target ≥ 9/12**; kind agreement on matched pairs ≥ 80 %.
- 03: linter green; paraphrase first-pick ≥ 80 %; rounds used.
- 04 (verifier run on the **human** references, not the agent's): agreement with `verify.human.json` **≥ 8/10**, and it must flag both the "48ths" axis and the depth-5/16-leaves mislabel.
- 04 (verifier on the agent's references): ship count after ≤ 2 rounds — target ≥ 10/12.
- 06: reference sent 12/12, kind ≥ 11/12 on the agent's references.
- 07 (auditor run on the **human** pack v2): agreement with `audit.human.json` **≥ 11/13**; must hold card 08 and regenerate 05 and 09.
- 07 (auditor on the agent's pack): ship ≥ 11/12, 0 hold.
Cost and wall time per stage.

Approval = all targets met, or every miss explained and accepted by the Reviewer.

## 10. Deliverables and order (push after each; the Reviewer reviews each push)

1. Skeleton: `run.mjs`, `state.mjs`, `config.example.json`, stage stubs, `notify.mjs`, README, and `docs/features/explain/topics/SOP.md` (the Reviewer's SOP text, supplied with this spec — commit it verbatim; the stage prompts cite its sections). Stage 02 working (coverage with planner kinds). `checks/reference-linter.mjs` + `contact-sheet.mjs` + `paraphrase-replay.mjs`, run on the existing Lesson 04 references (report what they flag — the linter must flag the known defects in the pre-polish commits and pass on 553a3680/ae9bf069 except where it should not).
2. Agents: `client.mjs` for both providers, schemas, v0 prompt drafts, stages 01, 04, 07 runnable on fixture inputs (`--fixture` mode uses the human references/pack as input so the agents can be scored without authoring).
3. Stage 03 author loop with the exemplar and retries; stage 06 pack via the bench and `topic-pack.mjs`; stage 05/08/09 shelling out to the config commands (no-ops with clear messages when a command is empty).
4. `run.mjs decision-trees --dry-run --fixture` end to end; `fixture-score.mjs` report; README complete.

Tests: `node --test scripts/topic-pipeline/**/*.test.mjs` — schema validation, linter rules each with a failing and a passing case, state resume, stop points, set-file generation, pack generalisation on the demo-lesson04 run dir. No live calls in tests (provider clients mocked).

## 11. Non-goals (do not build)
- No new renderer kinds or schema changes; a prompt whose kind the renderer cannot draw is written to `gaps.md` and skipped (the lesson proceeds with the rest).
- No new judges; factual-v2 only.
- No replacement for the bench, the pack exporter's format, the launcher or the preview scripts.
- No automatic release: STOP-4 always waits for `--go`.
- No handling of pictures: the smoke/pack prompts are diagram prompts.

## 12. Reporting to the Reviewer (per push)
SHA; which deliverable; what runs (`run.mjs decision-trees --from X --to Y --fixture` output); linter report on the existing Lesson 04 commits; costs of any agent calls; what you could not do and why.
