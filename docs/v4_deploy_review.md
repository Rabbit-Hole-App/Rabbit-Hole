# v4 — deploy review (2026-09-04)

Every deploy now carries an automated code review: the control plane reads the
app's source once per deploy and reports what it touches — secrets, outbound
hosts, AWS calls, shell exec, user-input flows. It is a control, not a chat:
the user can't prompt it, argue with it, or turn it off, and it can never
break a deploy.

## How it runs

1. `small deploy` builds a review bundle: every `.py` file under the app dir
   prefixed with `=== path ===`, plus `requirements.txt` and `small.toml`.
   Excluded: `.venv/`, `node_modules/`, `__pycache__/`, `tests/`, `.git/`,
   `.small/`, and `.gitignore` matches. Secret values from `.env` are redacted
   before anything leaves the machine — the model sees names and line numbers
   only. Over ~100k tokens, only files transitively imported from the entry
   file are sent; the rest go in `skipped`.
2. The bundle rides the existing `POST /api/deploy` body. After the worker
   mints the Fly token it kicks the review via `ctx.waitUntil` — concurrent
   with the CLI-side Fly build, zero wall-clock added.
3. One Anthropic call (`claude-opus-5`, `ANTHROPIC_API_KEY` Worker secret,
   fixed system prompt). Output is schema-forced JSON via
   `output_config.format` — summary, secrets, undeclared_secrets, outbound,
   aws, filesystem, shell_exec, user_input, findings, skipped. `fallbacks:
   "default"` reruns classifier declines server-side.
4. **Risk is computed by Worker code, never taken from the model:** any
   shell_exec with `user_input_reaches_it` → high; any undeclared secret →
   medium; any outbound host off the allowlist (api.stripe.com,
   *.amazonaws.com, api.openai.com, api.anthropic.com) → medium; else low.
   Findings sorted high-first. High risk is logged in the worker; deploys are
   never blocked (org policy later).
5. Stored on the app row in D1: `review`, `review_prev` (previous deploy's
   review, for diffs), `reviewed_at`, `review_model`.

## Output surfaces

- After a successful deploy the CLI prints exactly one line, e.g.
  `review: invokes 1 Lambda · 1 outbound host · no shell exec · low`
  (polls `GET /api/review` until `reviewed_at` changes, ≤30 s, else
  `review: unavailable`).
- `small review [app]` — full report: findings first, then secrets, outbound,
  aws, shell exec, filesystem, then summary + risk.
- `small review --diff` — +/− per section against the previous deploy's review.

## Failure mode

API error, refusal, invalid JSON, missing `ANTHROPIC_API_KEY`, old CLI without
the bundle — all collapse to `review: unavailable`; the deploy succeeds
regardless. Every worker failure path only logs.

## Tests

- `packages/control-plane/test/review.test.js` (node --test, API mocked, real
  CLI bundle builder on fixture apps): form field → `helpers.process()` →
  `subprocess.run` across two files asserts risk == "high" (mock model
  deliberately returns "low" to prove the worker overwrites it); undeclared
  `os.environ["FOO"]` asserts `undeclared_secrets == ["FOO"]` and risk ≥
  medium; allowlist rules; failure paths store nothing.
- `packages/cli/test/bundle.test.js`: inclusion/exclusion, `.gitignore`,
  redaction, 100k-token transitive-import fallback.
- 19 node tests + `make test-unit` (4 guard tests) green on the rebased branch.

## Issues hit

1. **Four worktrees share one live worker — deploying from a feature branch
   clobbers the union.** First worker deploy went out from pre-rebase code and
   silently dropped BYO-AWS (`/api/runtime/aws-creds`); redeployed after
   rebasing onto main. The jobs tree's uncommitted endpoints (`runs`/
   `run_logs` tables are live in D1) are still dropped — the jobs session must
   redeploy the union when its own rebase finishes. Rule captured in memory:
   never deploy small-cp from one branch's view alone.
2. Rebase onto main (BYO-AWS, CLI 0.0.6) conflicted exactly at the deploy
   seams — `apiDeploy` signature/body and the CLI deploy call — resolved by
   carrying both features (`awsRoleArn` + `review` in the same body).
3. `wrangler d1 execute --json` emits a BOM; piping into `JSON.parse` fails —
   grep the raw output instead.
4. **Two empty-secret uploads in one evening.** `flyctl` missing from the `!`
   shell's PATH and an interactive `wrangler secret put` with no TTY both
   uploaded 0-byte secrets that `wrangler secret list` happily shows as
   present. Every deploy 503'd (empty `FLY_API_TOKEN` guard) and every review
   silently skipped (`reviewStarted:false`). Rule: always pipe secrets from a
   checked source with a non-empty guard (`[ -n "$T" ]` / `[ -s file ]`).
5. **Identity-linked Anthropic keys need `anthropic-workspace-id` per
   request** (400 without it). The org's only listed workspace ("Claude
   Code") 404s for API use, and the Default Workspace's id is hidden from the
   list API. Fix: created dedicated workspace `small deploy review`
   (`wrkspc_01C8KKy5YHwzBZes1xrjiuKC`) via the Admin API, worker sends the
   header when `ANTHROPIC_WORKSPACE_ID` is set — also isolates review spend.

## Ceilings (ponytail)

- `.gitignore` parser handles the common subset only (bare names, `dir/`,
  `*.ext`, leading `/`) — no `**`, no `!` negation.
- Redaction covers `.env` values only, not arbitrary hardcoded keys.
- `migrations/0001-review.sql` is run-once (plain ALTERs, error on rerun).
- CLI tokens for review polling: 6 × 5 s then gives up as unavailable.
- Allowlist is a hardcoded const in `review.js`; org-configurable later.
- No fallback beyond `fallbacks: "default"` — any other failure is simply
  `review: unavailable` by design.

## Current state

- `feature/review` rebased onto main (`f415968` + workspace-header fix
  `91e19fc`); live worker `863a6a5a` = main + review. D1 migrated (4 review
  columns). Worker secrets: `ANTHROPIC_API_KEY` (108-char identity-linked
  key), `ANTHROPIC_WORKSPACE_ID`, fresh `FLY_API_TOKEN`.
- **Verified live end to end:** counter deploy through the wall → review
  stored (`claude-opus-5`, risk low, 3 low findings — CSRF-less POST /inc,
  unlocked global counter, proxy-dependent redirect), line reads
  `review: no AWS · no outbound · no shell exec · low`.
- `make test-unit` 4/4, `make test-integration` 10/10 (1m54s), node suites
  14 + 5 — all green on the rebased branch.
- npm still `small-deploy@0.0.6` — review CLI (bundle, review line,
  `small review`/`--diff`) unpublished; publish cumulatively per the shared
  live-state rule.
- Jobs endpoints are still dropped from the live worker (its worktree is
  mid-rebase); that session must redeploy the union when it lands.
