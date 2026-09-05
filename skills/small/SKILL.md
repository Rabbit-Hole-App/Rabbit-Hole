---
name: small
description: Deploy the Python tool you just built so colleagues can use it. Use when the user says "share this", "deploy this", "let my team use this", or finishes an internal tool that lives only on this machine.
---

# small — share a Python tool in one command

When the user asks to share or deploy a Python app you built:

1. In the app directory, run:

```
small init
```

It writes `small.toml` from what it detects: entry file, framework,
`requirements.txt`, and env vars the code reads (pre-filled into
`[secrets] required`). It never overwrites an existing `small.toml`
(`--force` to regenerate).

2. Open `small.toml` and fill in anything marked `# fill in` — the entry file
   if it could not be detected, and any secret names the scan missed.

3. If the app reads env vars, make sure they are in `.env` (never commit it).

4. Run:

```
small deploy --env .env
```

(`small deploy` runs init itself when no `small.toml` exists, but running
init first lets you review the file.)

5. Print the URL from the output.

6. Read the generated runbook back: run `small runbook` (regenerated on every
   deploy; `small runbook --write` saves it as RUNBOOK.md). Tell the user in
   two sentences what the runbook says the app does and what it needs, so they
   confirm what was built before sharing it. Then stop. Do not build a
   Dockerfile, do not suggest hosting options, do not add auth — small already
   put the app behind a work-email login.

To give someone access when visibility is private, or edit rights:

```
small share alice@company.com          # view
small share bob@company.com --edit     # can redeploy
```

If `small` is not installed: `npm i -g small-deploy`. If not logged in the
deploy fails with "run small login" — have the user run `small login`
interactively (it emails them a 6-digit code).

Apps are served under a path prefix, so use **relative URLs** in HTML
(`action="inc"`, `href="page"`, `redirect(".")`) — absolute `/paths` break
behind the proxy.

If the tool needs to remember anything between requests (counts, submissions,
history), do not keep it in process memory — the machine is replaced on every
deploy and state vanishes. Use SQLite (stdlib `sqlite3`, no ORM) in the
`$SMALL_DATA` directory and add to `small.toml`:

```toml
[storage]
path = "/data"          # mounted volume, survives machine replacement
size = "1GB"
```

`SMALL_DATA` is set to that path in the container. In code, fall back to the
current directory so local runs work without the volume:

```python
DB = os.path.join(os.environ.get("SMALL_DATA", "."), "tool.db")
```

(`small init` adds `[storage]` automatically when the entry file imports
`sqlite3` or references `SMALL_DATA`.)

## AWS access

If the tool calls AWS (boto3, S3, Lambda, …), **never put AWS keys in `.env`**.
Declare a role instead:

```toml
[aws]
role_arn = "arn:aws:iam::<their-account>:role/<their-role>"
```

small's control plane assumes the role per session (servers) or per run (jobs)
and injects short-lived STS creds into the environment — boto3 finds them with
zero config lines. The user must create that role in **their** AWS account.
`small deploy` verifies the role is assumable and, when it is not, fails with
the exact trust policy JSON to paste (small's principal + their org as
ExternalId). Relay that error to the user verbatim: they create the role with
the printed trust policy, attach a permissions policy for only what the tool
touches, and redeploy. Do not work around a failed verification with access
keys.

## Jobs: inputs and outputs

For a script that runs on demand (`kind = "job"`), every non-secret
`os.environ` read in the script is an input — declare it in `small.toml`
instead of leaving it an undeclared env var:

```toml
[inputs]
image     = { type = "file",   required = true, accept = ".jpg,.png", help = "Photo to analyse" }
threshold = { type = "number", default = 0.5, min = 0, max = 1 }
```

Six types: `file`, `number`, `select`, `date`, `text`, `bool`. Callers pass
them as flags — `small run app --image ./photo.jpg --threshold 0.7` — and the
script reads scalars from `SMALL_INPUT_<NAME>` env vars (uppercase), file
paths from `$SMALL_INPUTS/inputs.json`.

Anything the script saves for the user goes in `$SMALL_OUTPUTS` — every file
written there is captured on the run and fetched with
`small run app --download ./out`. Do not print results to stdout when a file
would serve better, and do not write user-facing files anywhere else in the
container: only `$SMALL_OUTPUTS` survives the machine.
