# small-deploy

Deploy a Python app for your team, behind a work-email login, in one command.

```
npm i -g small-deploy

small login                 # email → 6-digit code
small init                  # scaffold small.toml + a first runbook
small deploy --env .env     # detect app, build remotely, print URL
```

Working with an AI coding agent? Run `small skill` in the project to install
the instructions bundled with your CLI, including the private AWS workflow.
The separately published `small-skill` package also provides agent instructions.

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
  login [--api <url>]       hosted email login or private AWS Cognito login
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

Install `small-deploy@0.0.9` or newer from npm and run `small skill` in your
app directory to refresh its agent instructions. The hosted AWS dashboard
remains a dev preview. For a customer-hosted Small installation, use the
private AWS instructions below and that installation's own URL.

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

## Private AWS installation (CLI 0.0.10)

Use the Small URL supplied by your company's administrator. The existing
customer AWS installation must have CPU jobs enabled; release `0.1.0-pilot.5.1`
adds configurable app grants and file uploads. Installing this CLI does not
install or update that stack. Existing single-folder S3 configurations remain compatible.

```sh
npm install -g small-deploy@0.0.10
small login --api https://small.example.com
small workspaces
small skill
```

Replace the example URL with your installation's HTTPS origin. Set `SMALL_API`
to that same origin if the shell already overrides it. In each app's `small.toml`,
use `type = "job"` and `[deploy] target = "aws"`. Preserve its name and Python
entry, then run `small deploy --workspace <slug-from-workspaces>`.

Source uploads, builds, runs, logs, and outputs use customer AWS. Private login
uses Cognito and a temporary callback at `http://127.0.0.1:8766/auth/callback`.
Keep the login command running and open its link on the same computer. When the
CLI runs over SSH, forward port `8766` to that host before signing in;
`--no-browser` prints the login link but does not set up forwarding.

The private AWS pilot supports CPU jobs, scalar inputs, files (up to five,
10 MiB each), and exact per-app AWS grants. Declare `[aws] grants` as a single-line
array of `{ action = "...", resource = "..." }` entries. Deployment waits for
approval in Settings > Connections > AWS. The customer administrator controls
available actions through the stack's `AppGrantActions` parameter; adding an
action never broadens an app's existing approval. Additional services may need
customer-configured VPC endpoints. The hosted dev preview retains its existing
single-folder S3 permission flow.

App secrets, system packages, schedules, persistent volumes, and sharing changes
are outside this pilot. `small skill` installs the complete
`references/aws-hosting.md` guide, including file flags, grant syntax, and limits.

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
