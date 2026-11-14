# Secret check, 2026-11-14 03:50 PT (overnight brief section 1d)

Result: **PASS.** No secret value from `small-deploy/.env` (57 keys with a value of 8 or more characters), and no value of `HF_TOKEN`, is in any committed file, evidence folder, or untracked file under the repo. No token-shaped string is in the files or the history of the checked branches. Paths only below; no value was printed or written anywhere (the scripts read the values locally and print key names and file paths).

## What was searched

| Scope | Method | Result |
|---|---|---|
| This worktree (`docs`, `scripts`, `packages`, tracked and untracked, evidence folders included; `node_modules`, `dist`, `dist-dev` skipped) | `git grep --untracked -F` with each value | see "Hits" |
| The shared checkout `feature-interactive` (`docs`, `scripts`, `packages`, including its untracked evidence folders) | `grep -rF` with each value | same hits as the worktree, nothing extra |
| The shared checkout's untracked `.tmp/` (34 MB of logs and scratch) | `grep -rF` with each value and the token-shape regexes | two identifier hits (below), no token shape |
| Tips of `design/fast-path`, `design/pick`, `design/toss-mvp`, `interact/capture-budget` (all files) | `git grep -F` with each value | same hits as the worktree |
| History of those four branches since `main` | `git log -G` with the token shapes `hf_[A-Za-z0-9]{20,}`, `sk-ant-`, `AIza`, `tgp_`, `Bearer <30+ chars>` | no commit |
| Files at the four tips | `git grep -E` with the same shapes | no file |
| `HF_TOKEN` | the value from the shell that printed it (it is not in `.env`), searched in the worktree, the shared checkout and the four tips | no hit; and the `hf_` shape scan above found nothing |

The 57 keys include every API key, token, client secret and signing secret in the file (Anthropic, Gemini, Fireworks, Cerebras, Celeris, Recraft, Slack, Resend, Cloudflare API token and S3 keys, GitHub and Google OAuth, AWS keys, Fly, NPM, PostHog personal key, Sentry, HeyGen, OpenAI, Exa, Fal, ElevenLabs, Fish Audio, Pexels, Desmos, the TypeSafe key, the dev test bypass and the smoke-test client secret). Each of those: **no hit**.

## Hits (7 keys, none a secret)

Seven keys have a value that appears in the repo. Each is an identifier or a public value by nature, and is in the repo on purpose (config, docs, tests):

| Key | What the value is | Where it appears |
|---|---|---|
| `SMALL_API` | a service URL | docs, `packages/cli`, `wrangler` configs, tests |
| `AWS_ACCOUNT_ID` | a 12-digit account id | BYOC docs, tests, `wrangler` configs |
| `AWS_DEFAULT_REGION` | a cloud region name | BYOC docs and code |
| `S3_BUCKET` | a bucket name | `docs/v3_byo_aws.md` only |
| `CLOUDFLARE_ACCOUNT_ID` | a 32-hex account id (pinned in the dev configs by design, see CLAUDE.md) | docs, `wrangler` configs, tests, the clone scripts |
| `POSTHOG_PROJECT_TOKEN` | the public project key (`phc_` prefix, shipped to browsers) | `wrangler.rabbit-hole-prod.jsonc`, `scripts/prod-release.mjs` |
| `POSTHOG_HOST` | a service URL | docs, tests, the prod config |

`.tmp/` (untracked, not committed): the AWS account id and region name in six deploy logs, nothing else.

## Not covered

- The Claude session transcript is not part of the repo and is not scanned. `HF_TOKEN` was printed once into it (by a shell environment dump); the owner rotates it.
- Other branches and the full history of `main` were not scanned; the history check is limited to `main..<branch>` of the four branches above.
- Scratch files outside the repo (`C:\s\...`) were not scanned.
