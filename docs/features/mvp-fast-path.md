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
| Recovery branch (owner's MVP minimum) | none | **required**: a branch already on rabbit-hole, cut by the lane, whose tip is a strict descendant of the release commit; checked at preview, by `verify`, by `prepare --mvp` and by the owner's launcher |
| Commit and build identity | sha, tree, prepared build hash, approval phrase | **kept**: record sha and tree must equal the release commit's; prepare and release are unchanged |
| Secret-name and schema preflight (a pending migration blocks) | required | **kept**, same code |
| Production smoke, rollback, receipt, HOLD, stale-candidate check | required | **kept**, same code |

Broad CI and the release gate are recorded as `bypassed`, never `passed`. `dev-deploy.mjs`, `dev-deploy-gate.mjs` and `verify-evidence.mjs` are unchanged, and `deploy-dev.yml` has a comment and nothing else: an MVP candidate does not use the stable preview.

## 1. Preview

Run from the feature's worktree, at the committed SHA, with the rabbit-hole `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and `VITE_TLDRAW_LICENSE_KEY` in the environment (by name, never printed):

```bash
node scripts/mvp-fast-path.mjs preview --mvp --sha $(git rev-parse HEAD) \
  --smoke "node packages/web/e2e/<focused>-check.mjs" [--smoke "<another command>"] \
  --recovery <branch> [--worker rabbit-hole-web-dev-<worktree>] [--base <ref>] [--no-deploy]
```

- `--mvp` is required; without it the launcher refuses. `--recovery <branch>` is required too: the lane pre-cuts a forward-recovery branch from the release commit (for example the recovery flag flip on top of it), pushes it to rabbit-hole, and names it here. The launcher fetches that one branch, then refuses before building anything unless it exists and its tip is a **strict** descendant of the commit (a branch at the commit itself carries no recovery; `main` and `dev` are never recovery branches). `--smoke` is required: a shell command that must exit 0 (run in order, stopping at the first failure). `--worker` defaults to `rabbit-hole-web-dev-<worktree directory>`; the stable preview (`rabbit-hole-web-dev-small-parallel`), production and anything else are refused. `--base` is the ref the change is measured from (default `rabbit-hole/main`, else `origin/main`). `--no-deploy` runs the checks only; its record is never accepted.
- Order, each step stopping the run on failure: build (`dist`, `dist-dev` with `VITE_COACHING_DEV`), affected tests, smoke, then `wrangler deploy --config wrangler.dev.jsonc --name <clone>` and a wait until `GET /library` serves the new entry script twice in a row. Nothing deploys after a failed check.
- **Affected tests** (`affectedTests` in the script): a changed test file runs itself; a changed module runs the test files that import it by relative path (one hop), in `packages/web/src`, `packages/control-plane` and `scripts`. A suite whose changed files select no test runs whole, so a code change never passes on zero tests; the changed files no test imports are listed as `uncovered` in the record. Docs, browser checks (`packages/web/e2e`) and static files select no unit test. Suites run one at a time.
- It appends one JSON line to `<git common dir>/rabbit-hole-dev-deploys.jsonl` (the file `prod-release.mjs prepare` reads), also for a failed attempt, and attaches the line as a local `refs/notes/dev-deploys` note on the commit. Publishing the note is the owner's push: `git push rabbit-hole refs/notes/dev-deploys` (fetch and merge the remote notes first if it is refused).
- Start acceptance on the printed clone URL. Broad CI runs on its own.

The record (`mvp: true`): `sha`, `tree`, `base`, `build` (hash of `dist-dev`), `targets` (`worker`, `url`, `account`, `env: dev`), `checks` (`build`, `affected-tests`, `smoke`, `preview`, each with `cmd`, `exit`, `result`, and the test files `ran`), `recovery` (`branch`, and the `tip` it had at preview time), `version`, `run`, `at`, `gates`, `broad_ci` and `release_gate` all `bypassed`, and `digest` (sha256 of the rest). The digest detects an edited record. It is not a signature: whoever can rewrite the line can recompute it.

## 2. Production

The released commit must be the previewed commit (fast-forward the feature branch to `main`; a merge or squash changes the SHA and the record no longer matches).

- By hand: `node scripts/prod-release.mjs prepare --mvp --sha <sha>`, then `release` with the printed approval phrase, as in [prod-release.md](prod-release.md).
- By push: `deploy-prod.yml` reads the commit's `refs/notes/dev-deploys` note. MVP mode needs **both** a line with `"mvp":true` **and** the repository variable `MVP_ALLOWED_SHA` equal to the commit being released. Then it runs `prepare --mvp` and skips the CI-runs step. A note without the matching variable is ignored: the log says `MVP record IGNORED` (and a warning annotation), and the ordinary rules apply. The note is still required either way. Nothing else in the workflow is conditional.
- The allowance is checked again inside `prepare --mvp`: in the workflow only the variable's value (env `MVP_ALLOWED_SHA`) counts; by hand pass the explicit `--mvp-allowed-sha <sha>` (or set the env), which must equal `--sha`. Without it `prepare --mvp` refuses before it looks at the record.
- `prepare --mvp` refuses unless the newest MVP record of the SHA has every required check passing (exit 0), the commit's own tree, `bypassed` for broad CI and the gate, a `rabbit-hole-web-dev-*` target, an intact digest and a recovery branch that still exists with a tip containing the commit. It reads the local remote-tracking refs and makes no network call: the workflow's full checkout has every branch as `origin/*`; by hand, `git fetch rabbit-hole <recovery branch>` first. It then prints `MVP MODE: broad CI and release gate BYPASSED by owner policy` and writes the record summary into `prepared.json`. `release` prints the same line and the receipt carries `mvp: { notice, digest, worker, checks, broad_ci, release_gate }`.

## The owner's steps for an MVP release

The owner allows the commit, releases it, and removes the allowance. Agents never set the variable.

```
gh variable set MVP_ALLOWED_SHA --body <sha> -R Rabbit-Hole-App/Rabbit-Hole
C:\s\spec\release-queue\release-mvp.cmd <name> --check     (reads only, fetches the recovery branch; pushes nothing)
C:\s\spec\release-queue\release-mvp.cmd <name>             (publishes the record note, pushes main, watches the release run)
gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole
```

`release-mvp.sh` is owner tooling outside the repo (next to `release.sh`, which it does not replace). It has the same pins and guards: the worktree at the pinned SHA and clean, main equal to a pinned predecessor and an ancestor of the SHA (fast-forward only, never forced), dev an ancestor. It asks for no gate run and no verify or fast-e2e success. It requires that `node scripts/mvp-fast-path.mjs verify --sha <sha> --fetch` (the repository's own check; it only updates the one remote-tracking recovery branch) accepts the MVP record, recovery branch included, and that `gh variable get MVP_ALLOWED_SHA` equals the SHA. It then publishes the record as the `refs/notes/dev-deploys` note, pushes `main`, confirms the release log shows `MVP MODE` and stops loudly if the workflow ignored the record. It does not push `dev`: the MVP flow deploys the isolated clone, and a push to `dev` would only start `deploy-dev.yml`, which wants a gate note.

## Limits

- The record is written by whoever runs the preview and travels as a git note, which anyone who can push can write. A note alone releases nothing: the repository variable, which only a repository admin can set, must also name the commit. In MVP mode no CI evidence (the Actions API runs) stands behind a release; the trust is in the owner who set the variable and the person who pushed the note and the main commit.
- "Affected" is a path and import heuristic, one hop deep; it can miss a test that reaches the change through a re-export. The smoke command is only as good as the command given.
- The clone shares the dev D1 and has no true secrets; a feature needing one shows its no-credential path there.
- Tests: `scripts/mvp-fast-path.test.mjs` and the MVP block of `scripts/prod-release.test.mjs`. The launcher's deploy step and the workflow change cannot run offline.
