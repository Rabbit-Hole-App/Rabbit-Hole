# MVP fast path

Standing owner policy, decided by the owner on 2026-11-03. The canonical statement is [CLAUDE.md](../../CLAUDE.md#mvp-fast-path); this page is the mechanism: commands, the record, and what is and is not bypassed. It applies only to work the owner labels MVP, and only when `--mvp` is passed. Ordinary work is unchanged.

## What `--mvp` bypasses, and what it keeps

| | Ordinary release | MVP (`--mvp`) |
|---|---|---|
| `verify` and `fast-e2e` runs of the exact SHA (OPS-04) | required, completed successes | not consulted; they run on their own and are information |
| Gate note (`refs/notes/gates`) and the green dev deployment behind it | required | replaced by the MVP preview record |
| Build | in the gate | **required**: `vite build` of `dist` and `dist-dev` exits 0 |
| Tests | `make test-unit` in the gate | **required**: the affected tests below, exit 0 |
| Smoke | the gate's browser stages | **required**: the caller's focused smoke command(s), exit 0 |
| Preview deploy | the stable preview, then dev | **required**: your isolated clone `rabbit-hole-web-dev-<worktree>` serves the new build |
| Commit and build identity | sha, tree, prepared build hash, approval phrase | **kept**: record sha and tree must equal the release commit's; prepare and release are unchanged |
| Secret-name and schema preflight (a pending migration blocks) | required | **kept**, same code |
| Production smoke, rollback, receipt, HOLD, stale-candidate check | required | **kept**, same code |

Broad CI and the release gate are recorded as `bypassed`, never `passed`. `dev-deploy.mjs`, `dev-deploy-gate.mjs` and `verify-evidence.mjs` are unchanged, and `deploy-dev.yml` has a comment and nothing else: an MVP candidate does not use the stable preview.

## 1. Preview

Run from the feature's worktree, at the committed SHA, with the rabbit-hole `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and `VITE_TLDRAW_LICENSE_KEY` in the environment (by name, never printed):

```bash
node scripts/mvp-fast-path.mjs preview --mvp --sha $(git rev-parse HEAD) \
  --smoke "node packages/web/e2e/<focused>-check.mjs" [--smoke "<another command>"] \
  [--worker rabbit-hole-web-dev-<worktree>] [--base <ref>] [--no-deploy]
```

- `--mvp` is required; without it the launcher refuses. `--smoke` is required: a shell command that must exit 0 (run in order, stopping at the first failure). `--worker` defaults to `rabbit-hole-web-dev-<worktree directory>`; the stable preview (`rabbit-hole-web-dev-small-parallel`), production and anything else are refused. `--base` is the ref the change is measured from (default `rabbit-hole/main`, else `origin/main`). `--no-deploy` runs the checks only; its record is never accepted.
- Order, each step stopping the run on failure: build (`dist`, `dist-dev` with `VITE_COACHING_DEV`), affected tests, smoke, then `wrangler deploy --config wrangler.dev.jsonc --name <clone>` and a wait until `GET /library` serves the new entry script twice in a row. Nothing deploys after a failed check.
- **Affected tests** (`affectedTests` in the script): a changed test file runs itself; a changed module runs the test files that import it by relative path (one hop), in `packages/web/src`, `packages/control-plane` and `scripts`. A suite whose changed files select no test runs whole, so a code change never passes on zero tests; the changed files no test imports are listed as `uncovered` in the record. Docs, browser checks (`packages/web/e2e`) and static files select no unit test. Suites run one at a time.
- It appends one JSON line to `<git common dir>/rabbit-hole-dev-deploys.jsonl` (the file `prod-release.mjs prepare` reads), also for a failed attempt, and attaches the line as a local `refs/notes/dev-deploys` note on the commit. Publishing the note is the owner's push: `git push rabbit-hole refs/notes/dev-deploys` (fetch and merge the remote notes first if it is refused).
- Start acceptance on the printed clone URL. Broad CI runs on its own.

The record (`mvp: true`): `sha`, `tree`, `base`, `build` (hash of `dist-dev`), `targets` (`worker`, `url`, `account`, `env: dev`), `checks` (`build`, `affected-tests`, `smoke`, `preview`, each with `cmd`, `exit`, `result`, and the test files `ran`), `version`, `run`, `at`, `gates`, `broad_ci` and `release_gate` all `bypassed`, and `digest` (sha256 of the rest). The digest detects an edited record. It is not a signature: whoever can rewrite the line can recompute it.

## 2. Production

The released commit must be the previewed commit (fast-forward the feature branch to `main`; a merge or squash changes the SHA and the record no longer matches).

- By hand: `node scripts/prod-release.mjs prepare --mvp --sha <sha>`, then `release` with the printed approval phrase, as in [prod-release.md](prod-release.md).
- By push: `deploy-prod.yml` reads the commit's `refs/notes/dev-deploys` note. A line with `"mvp":true` selects `prepare --mvp` and skips the CI-runs step; the note is still required. Nothing else in the workflow is conditional.
- `prepare --mvp` refuses unless the newest MVP record of the SHA has every required check passing (exit 0), the commit's own tree, `bypassed` for broad CI and the gate, a `rabbit-hole-web-dev-*` target and an intact digest. It then prints `MVP MODE: broad CI and release gate BYPASSED by owner policy` and writes the record summary into `prepared.json`. `release` prints the same line and the receipt carries `mvp: { notice, digest, worker, checks, broad_ci, release_gate }`.

## Limits

- The record is written by whoever runs the preview and travels as a git note. In MVP mode no unforgeable CI evidence (the Actions API runs) stands behind a release; the trust is in the person who pushed the note and the main commit.
- "Affected" is a path and import heuristic, one hop deep; it can miss a test that reaches the change through a re-export. The smoke command is only as good as the command given.
- The clone shares the dev D1 and has no true secrets; a feature needing one shows its no-credential path there.
- Tests: `scripts/mvp-fast-path.test.mjs` and the MVP block of `scripts/prod-release.test.mjs`. The launcher's deploy step and the workflow change cannot run offline.
