# small-deploy

Deploy a Python app for your team, behind a work-email login, in one command.

```
npm i -g small-deploy

small login                 # email → 6-digit code
small init                  # scaffold small.toml + a first runbook
small deploy --env .env     # detect app, build remotely, print URL
```

Working with an AI coding agent? `npx small-skill` installs the agent skill
(same as `small skill`) so Claude Code/Codex deploys through small instead
of hand-rolling Docker.

Your app is served at `https://<control-plane>/a/<org>/<app>/` behind a
magic-link login. Only people at your email domain (or explicitly shared
emails) get in. The container itself refuses any request that did not come
through the auth wall.

Every deploy also lands the app on a web dashboard: run form, live logs,
AI code review, an editable runbook (with a process-flow diagram), and a
chat agent that has read the code, the runs and the outputs. Connect Slack
and `/small run` works from there too, with results posted back to the thread.

## Commands

```
start
  login                    sign in with a one-time email code
  init                     scaffold small.toml and a runbook in this project
  deploy                   ship the current directory

everyday
  run <app>                start a job (prompts for its inputs, --download for results)
  runs <app>               recent runs: status, duration, who started them
  logs <app>               tail what an app printed
  list                     your apps and their URLs
  workspaces               list accessible workspace slugs
  watch [app]              what the nightly watch pass found

sharing & schedule
  share <email> [--edit]   give a teammate access (--app name to pick the app)
  schedule pause <app>     pause its cron (resume to restart)

more
  review                   AI code review of the current directory
  runbook                  the app's runbook (--write saves RUNBOOK.md, --diff)
  skill                    install the agent skill into .claude/skills
  help                     this list
```

Use `--workspace <slug>` on a command to select a workspace from
`small workspaces`, or set `SMALL_WORKSPACE` for the shell. The flag takes
precedence. With neither set, commands use the login's email workspace.
Selecting a workspace in the browser does not select it in the CLI. Unknown
slugs fail before app requests rather than falling back to a different workspace.
The CLI also verifies that the server activated the selection. A server without
the CLI workspace authentication update stops the command before app access.

## AWS hosting (dev preview)

The updated CLI currently comes from this repository. Public npm publication
is held while the feature is reviewed on dev. From the repository root, run
`node packages/cli/scripts/sync-guard.js` to prepare its bundled runtime/skill,
then `npm install -g ./packages/cli` to install the local CLI. Run `small skill`
in your app directory to refresh its agent instructions.

In the [dev dashboard](https://small-cp-dev.zeroshothq.workers.dev/apps), open
the desired workspace's **Settings → Connections → AWS**. Enter the customer's
account ID and first app name, approve the installation in their AWS console,
and return to **Finish connecting**. Additional apps reuse that connection.

In the app's `small.toml`, set `type = "job"` and `[deploy] target = "aws"`
before running `small init`. Then, in PowerShell:

```powershell
$env:SMALL_API = 'https://small-cp-dev.zeroshothq.workers.dev'
small workspaces
# Replace <slug> with an accessible slug returned above.
small deploy --workspace <slug>
small run aws-test-job --workspace <slug>
```

The CLI prints the workspace, AWS account, and region before source upload.
Source, inputs, logs, and outputs go directly between the client and customer
AWS. The normal app sidebar, Run form, and Logs panels show the job.

This preview supports multiple CPU jobs on one connection per workspace in
`us-east-1`, with text, number, bool, and select inputs. App secrets, extra AWS
roles, system packages, persistent storage, schedules, file/date inputs, GPU
jobs, web servers, and hosted review/runbook/Coaching are not supported yet.
The connection installer can deploy; workspace members can run and inspect.

## App detection

In order: `small.toml` (`entry`), `--entry` flag, framework hint
(`Flask(`, `FastAPI(`, `import streamlit`, `import gradio`), filename
convention (`app.py`/`main.py`/`server.py`), only `.py` file. Every deploy
prints what was chosen.

## small.toml

```toml
name = "detect"
entry = "job.py"
type = "job"              # omit for web apps: flask | fastapi | streamlit | gradio
schedule = "0 9 * * 1-5"  # optional cron, UTC

[deps]
file = "requirements.txt"
system = []               # apt packages

[inputs]                  # jobs: the run form, CLI flags and Slack all feed these
source    = { type = "text", required = true, help = "s3://bucket/key" }
threshold = { type = "number", default = 0.5 }

[outputs]
annotated = { path = "annotated.jpg", label = "Annotated image" }

[secrets]
required = []             # deploy fails if any are missing from .env

[aws]
role_arn = ""             # per-run STS credentials; never put AWS keys in .env

[storage]
path = "/data"            # persistent volume, survives redeploys ($SMALL_DATA)

[access]
visibility = "domain"     # domain | private
```

Only `entry` is required.

## Notes

- Builds run on Fly.io remote builders — no Docker. `small deploy` installs
  `flyctl` itself on first use if it is missing.
- Apps live under a path prefix: use relative URLs in your HTML.
- `.env` values are sent to the runtime as secrets, never baked into the image.
- Job inputs arrive as env vars, files written to the outputs folder become
  downloadable run outputs — same contract for every trigger (form, CLI,
  Slack, cron, chat agent).
