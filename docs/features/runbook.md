# Runbook schema

The runbook is generated on every `small init` and `small deploy`. It is stored as structured
JSON on the app row and rendered to markdown. Ask and Watch read the JSON; people read the
markdown. This file defines the JSON.

## Principles the generator must follow

1. **Ordered by reader.** Purpose → use → run → structure → failure. Each section is for a
   more technical reader than the last. Anyone can stop reading when they have what they need.
2. **Every claim is checkable.** Secrets cite where they're read. Commands cite the `__main__`
   or `argparse` they came from. Limits cite a line. If a claim can't be cited, omit it.
3. **Examples come from real runs.** Never invented. The last successful run's inputs and
   outputs, linked by run id. No successful run → use defaults and mark `untested: true`.
4. **Symptoms before causes.** `if_it_breaks` maps what a person sees to what's likely wrong
   and where to look.
5. **Omit rather than fill.** An absent section means "not applicable." A section with
   invented content destroys trust in every other section.
6. **No secret values, ever.** Names and locations only.

## Schema

```jsonc
{
  // ── identity — filled by the control plane, not the model
  "name": "string",
  "kind": "server | job | scheduled | webhook",
  "owner": "email",
  "generated_at": "ISO-8601",
  "url": "string",
  "access": "string",                       // "anyone @acme.com" | "4 people"
  "deployed_from": {                        // from provenance; null if not a git repo
    "repo": "string | null", "branch": "string", "commit": "sha", "dirty": false
  },

  // ── runs on — filled by the control plane; what a colleague needs to know about cost and place
  "runs_on": {
    "where": "small hosted | your-aws",       // BYOC later
    "region": "sea",
    "memory": "1GB",
    "gpu": false,
    "cold_start": "~10s",                     // measured from the last 5 starts, or estimated
    "scales_to_zero": true,
    "python": "3.12",
    "image_size": "412 MB",
    "last_run_took": "14s | null",
    "typical_run": "12-18s | null",           // p25-p75 of the last 20 runs
    "cost_note": "string | null"              // e.g. "GPU: ~$0.60/run" once billing exists
  },

  // ── data flow — where inputs come from, where outputs go; deterministic + review
  "data_flow": {
    "inputs_from": [{                         // every place data enters
      "source": "user upload | form field | s3 | http | database | env | file | cron",
      "what": "string",
      "at": "file:line | small.toml"
    }],
    "outputs_to": [{                          // every place data leaves
      "sink": "run outputs | s3 | http | email | slack | database | stdout",
      "what": "string",
      "at": "file:line | small.toml"
    }],
    "persists": ["string"],                   // what survives between runs
    "leaves_the_org": false                   // computed, never model-written
  },

  // ── purpose — the only section most readers need
  "what_it_does": "string",                 // ≤ 2 sentences, plain English
  "who_its_for": "string",                  // ≤ 1 sentence
  "when_to_use": "string | null",           // include a negative if the code implies one

  // ── how to use it — for the person who opens the link
  "how_to_use": ["string"],                 // ≤ 5 steps, from the UI or the CLI flags
  "inputs": [{                              // jobs; from small.toml, enriched
    "name": "string", "type": "file|text|number|select|date|bool",
    "required": false, "default": "any | null",
    "constraints": { "accept": "", "min": 0, "max": 1, "options": [], "pattern": "" },  // only keys present
    "help": "string | null",
    "example": "any | null",                // from last successful run
    "example_note": "string | null"         // from AGENT.md, if the builder wrote one
  }],
  "outputs": [{
    "name": "string", "path": "string", "label": "string | null",
    "example": "string"                     // shape, not content: first JSON object, header+1 row, or one sentence for binary
  }],
  "example_run": {                          // one complete real successful run
    "command": "string",                    // exact, copy-pasteable
    "from_run": "run id | null",
    "took": "string | null",
    "produced": ["string"],
    "untested": false                       // true when built from defaults, no real run exists
  } | null,

  // ── how to run it — for the person who inherits it
  "run_locally": {
    "install": "string",                    // from deps.file / system
    "env": ["NAME"],                        // every env var read, secrets and SMALL_* alike
    "start": "string"                       // the framework runner from small.toml
  },
  "commands": [{                            // every runnable thing that exists in the code
    "what": "string", "command": "string", "from": "file:line | Makefile:target | scripts/x"
  }],
  "needs": [{                               // every secret
    "name": "NAME", "used_in": "file:line", "for": "string", "declared": true
  }],
  "storage": { "path": "string", "contains": "string" } | null,
  "talks_to": [{ "host": "string", "mode": "read|write|both", "for": "string", "at": "file:line" }],

  // ── structure — for the person who changes it
  "files": [{ "path": "string", "role": "string", "entry": false }],
  "endpoints": [{ "route": "string", "method": "string", "does": "string", "at": "file:line" }],  // servers
  "schedule": "cron string | null",         // scheduled jobs

  // ── when it breaks — for 3am
  "known_limits": [{ "text": "string", "at": "file:line" }],
  "if_it_breaks": [{
    "symptom": "string",                    // what the person sees
    "likely": "string",                     // what's probably wrong
    "look": "string"                        // a command, a file:line, or a log filter
  }],
  "ask": "email",                           // the owner, or AGENT.md override

  // ── trust — copied from the review
  "review": { "risk": "low|medium|high", "secrets": 0, "outbound": 0, "shell_exec": 0, "findings": 0 }
}
```

## Where each field comes from

| source | fields |
|---|---|
| control plane, no model | identity block, `access`, `deployed_from`, `review`, `schedule`, `example_run.from_run/took/produced`, all of `runs_on` |
| review + `small.toml` | `data_flow.inputs_from`, `data_flow.outputs_to`, `data_flow.persists`, `data_flow.leaves_the_org` (computed) |
| `small.toml` | `inputs` (base), `outputs` (base), `run_locally.start`, `storage.path`, `kind` |
| last successful run | `inputs[].example`, `outputs[].example`, `example_run.command` |
| `AGENT.md` | `inputs[].example_note`, `when_to_use` hints, `ask` override |
| the model, from the source bundle | `what_it_does`, `who_its_for`, `how_to_use`, `commands`, `needs`, `talks_to`, `files`, `endpoints`, `known_limits`, `if_it_breaks`, `outputs[].example` shape, `storage.contains` |

The model fills only the last row. Everything else is deterministic, so the model can't
contradict the platform about facts it already knows.

## Rendering to markdown

Sections in schema order, each a `##`. Identity is a two-line header under the title.
`example_run` renders as its own section after **How to use it**:

```
## Example
`small run yolo-job --image people.jpg --threshold 0.7` — from run a3f8e21, 14s.
Returns `annotated.jpg` (the input with green boxes) and `boxes.json`:
{"people": 2, "boxes": [{"x": 120, "y": 44, "w": 80, "h": 210, "conf": 0.91}]}
```

`runs_on` renders as a property line under the header, not a section:
`Runs on small (sea) · 1 GB · no GPU · ~10s cold start · typical run 12-18s`

`data_flow` renders as **Where data comes from and goes**, two short lists and one bold line
if `leaves_the_org` is true: *This app sends data outside the organisation.*

Tables for `inputs`, `needs`, `files`, `endpoints`, `commands`. Lists for everything else.
`review` is one italic line at the bottom. Absent sections are not rendered as empty
headings — they're skipped.

## Validation before storing

- Every `file:line` cited must exist in the deployed bundle. Drop the claim if not.
- Every `commands[].command` must reference a file or target that exists. Drop if not.
- Every `needs[].name` must appear in the source. Drop if not.
- `what_it_does` ≤ 2 sentences; `how_to_use` ≤ 5 items.
- If `example_run.from_run` is set, the run must exist and have exit code 0.
- Every `data_flow` entry cites `file:line` or `small.toml`; entries the review didn't see are dropped.
- `leaves_the_org` is computed, never written by the model.

A runbook that fails validation is stored with the failing fields removed and a `warnings`
array explaining what was dropped, so Watch can flag it.

The schema will grow as new project shapes appear; the runbook agent picks the applicable
sections per project from the code, small.toml, and runs. Absent stays absent.
