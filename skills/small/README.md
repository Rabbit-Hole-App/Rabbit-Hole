# small-skill

The agent skill for [small-deploy](https://github.com/yudhisteer/small-deploy):
teaches Claude Code / Codex to deploy the Python tool it just built behind a
work-email login in one command — and, when the tool needs AWS, to create and
maintain the IAM role itself with least privilege.

## Install

Two packages: the [small-deploy](https://www.npmjs.com/package/small-deploy)
CLI does the deploying; this skill teaches your agent to drive it.

```
npm i -g small-deploy      # the CLI (the agent runs `small ...` through it)
npx small-skill            # the skill, into this project's .claude/skills/small
npx small-skill --global   # or into ~/.claude/skills/small for every project
```

Or, with the CLI already installed: `small skill` installs the skill copy it
ships with.

## What the agent learns

- Workspace selection through `small workspaces`, `--workspace`, and
  `SMALL_WORKSPACE`; browser selection is independent of the CLI.
- `references/aws-hosting.md` — private AWS installation login, workspace
  selection, CPU jobs, configurable app grants and file inputs, plus the hosted
  dashboard's S3 folder approval. Run `small skill` in the project to use the
  installed CLI's matching bundled copy.
- `small init` → review small.toml → `small deploy` → hand back the URL. Never
  a Dockerfile, never hand-rolled hosting, never bolted-on auth.
- `references/jobs.md` — on-demand scripts: declare every env read under
  `[inputs]`, write results to `$SMALL_OUTPUTS`, cron schedules.
- `references/aws-role.md` — the `[aws]` role: created from the trust policy
  the failed deploy prints, scoped to exactly what the code touches, never
  AWS keys in `.env`.
- `references/aws-compute.md` — when the heavy part truly needs AWS: pick
  Lambda/Fargate/SageMaker/Batch from three plain questions, with the role
  map for each.
- `references/aws-production.md` — one CDK stack per tool when the MVP grows up.

This package is generated from the small-deploy monorepo (`skills/small/`),
where it is linted against the source and behaviorally evaluated with a
headless agent before publishing.
