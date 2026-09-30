# Rabbit Hole documentation: source audit

Reviewed 2026-09-29. The public brand is Rabbit Hole; the implemented package is
still `small-deploy` and the command is still `small`. This task must not rename
the CLI or imply a new package has been published.

## Source of truth

| Area | Source | What is verified in code |
| --- | --- | --- |
| Developer panel | `packages/web/src/Sidebar.jsx` | Install/login/deploy and everyday commands; API origin comes from `window.location.origin` |
| CLI package | `packages/cli/package.json` | `small-deploy`, Node >=18, binary `small`, local version 0.0.14 |
| Command implementation | `packages/cli/bin/small.js` | login, init, deploy, run, runs, logs, share, schedule, list, workspaces, watch, review, runbook, skill, help |
| API client/auth | `packages/cli/lib/api.js`, `config.js` | Bearer token; optional `X-Small-Workspace`; `SMALL_API` overrides saved origin; saved origin overrides hosted default |
| Job inputs | `packages/cli/lib/inputs.js` | Named input flags, schema validation, defaults; missing required flags throw errors |
| Hosted API | `packages/control-plane/src/index.js` | Authenticated app/workspace/run/share/schedule/watch and request-log endpoints |
| Hosted AWS connection | `packages/control-plane/src/byoc.js` | Connection metadata, install/verify/token exchange and permission approval |
| AWS CLI | `packages/cli/lib/byoc.js`, `cognito.js`, `byoc-client.mjs` | Hosted/private routing, capability discovery, direct AWS uploads and runtime calls |
| AWS guidance | `skills/small/references/aws-hosting.md` | Current user workflow, private Cognito callback, job configuration and data boundary |
| BYOC implementation | `packages/byoc/api.py`, `private_api.py`, `template.mjs`, `private-template.mjs` | Customer-hosted build/run infrastructure and private installation |

## Differences from older Developer copy

- `small run` currently validates flags such as `--source value`; missing inputs
  produce actionable errors. Do not promise interactive input prompting just
  because the existing help text says so.
- Hosted `small logs <app>` reads request logs; `--follow` polls new lines.
  `small logs <run-id>` reads job output. `--machine` is a different hosted path.
- `small review` reads a stored deploy review; it does not submit the current
  directory for a new model review.
- `small runbook` reads the saved app runbook; `--write` writes RUNBOOK.md and
  `--diff` compares it. `small init` attempts initial generation for hosted apps.
- `small list` prints name, visibility and owner in current code. Do not promise
  that this command prints a URL for every app.
- The pasted `small-cp-dev-small-parallel` address is a different session clone.
  Examples should select the intended installation explicitly; the docs can show
  their current origin as the preview API base without changing CLI defaults.

## Proposed information architecture

Get started: Introduction, Deploy from your terminal, Workspaces.

CLI: Everyday commands, Jobs and inputs, App configuration, Logs and outputs,
Sharing and schedules, Watch and runbooks.

API: Overview and authentication; Apps and workspaces; Runs and outputs;
Request logs; Sharing and schedules. Start with documented request examples,
not a live API playground or token entry field.

AWS / BYOC: Overview; Connect your AWS account (hosted preview); Private AWS
installation; CPU job configuration; Permissions and limits.

Learning guides can remain another docs category, with content verified against
the current learning implementation before publication.

## Boundaries

Public docs must distinguish hosted API routes from the customer AWS runtime.
AWS jobs do not run through the hosted `/api/runs` path. The CLI selects the
correct path; copying a hosted run request is not a BYOC integration guide.

The hosted AWS preview and private installation have different capabilities.
Private file inputs/constants/grants depend on the installed release; installing
the CLI does not provision or upgrade infrastructure. Both target CPU jobs,
not GPU workloads or long-running web servers. Keep installation-specific
account numbers, stack IDs, bucket names, emails and private URLs out of public
examples. Use explicit placeholders supplied by the user's own administrator.

No login emails, deployments, jobs, grants, model calls or cloud mutations were
executed for this audit. `node packages/cli/bin/small.js help` was run locally.
Runtime success of copied deployment examples is not established by this audit.
