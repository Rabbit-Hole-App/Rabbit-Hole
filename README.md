# small-deploy

Deploy a Python app for your team, behind a work-email login, in one command.
You write the tool; `small` gives it a URL only your colleagues can open. No
Dockerfile, no cloud console, no auth code.

## The fastest path: let your agent do it

If you use Claude Code or Codex, install the skill once and then just ask:

```
npx small-skill            # into this project's .claude/skills/small
npx small-skill --global   # into ~/.claude/skills/small for every project
```

Then, after the agent builds your tool, say **"deploy this"** or **"share
this with my team"**. The skill teaches the agent the whole flow:

- run `small init`, review the generated `small.toml`, fix anything marked
  `# fill in`
- run `small deploy --env .env` and hand you back the URL
- read the generated runbook back to you so you can confirm what was built
- if the tool calls AWS: create and maintain a least-privilege IAM role for
  it (never AWS keys in `.env`) — the failed deploy prints the exact trust
  policy to use
- if the tool is an on-demand script: declare its inputs so anyone can run it
  from the dashboard or CLI with validated arguments

You never need to learn the CLI yourself — but everything the agent does is
plain `small` commands you can also run by hand, below.

## By hand

```
npm i -g small-deploy
small login                     # emails you a 6-digit code
cd my-tool/
small init                      # writes small.toml from what it detects
small deploy --env .env         # preflight, build, deploy — prints the URL
```

Every step prints what it decided (`✓ entry: app.py (flask)`) so a wrong
guess is visible in one line. Deploy pre-flights before building — Python
syntax, requirement names on PyPI, env vars the code reads, secrets, the AWS
role — and stops with a one-line fix instead of failing at runtime.

Give people access and operate the app:

```
small share alice@company.com          # view access
small share bob@company.com --edit     # can redeploy
small logs                             # recent container logs
small runbook                          # the generated manual for this app
```

If the tool is a script rather than a server (`type = "job"` in
`small.toml`), it runs on demand instead of serving requests:

```
small run my-tool --image photo.jpg --threshold 0.5   # validated inputs
small runs my-tool                                    # past runs + outputs
small schedule pause my-tool                          # pause/resume its cron
```

(Schedules themselves are declared in `small.toml` — `schedule = "0 9 * * *"` —
and registered on deploy.)

Colleagues use the web dashboard for all of this too — every app, its runs,
its runbook, one login for the team.

## Where to read more

- `docs/SCOPE.md` — what the product is and deliberately is not
- `docs/PRODUCT.md` — product direction, dashboard scope
- `docs/RUNBOOK.example.md` — the canonical template every generated runbook follows
- `docs/features/` — one spec per shipped feature
- `skills/small/` — the agent skill, published to npm as `small-skill`
