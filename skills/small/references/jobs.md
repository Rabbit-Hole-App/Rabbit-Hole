# Jobs — inputs and outputs

Read this when the tool is a script that runs on demand (`kind = "job"`).

Every non-secret `os.environ` read in a job is an input — declare it in
`small.toml` instead of leaving it an undeclared env var:

```toml
[inputs]
image     = { type = "file",   required = true, accept = ".jpg,.png", help = "Photo to analyse" }
threshold = { type = "number", default = 0.5, min = 0, max = 1 }

[outputs]
annotated = { path = "annotated.jpg", label = "Annotated image" }
```

Six types: `file`, `number`, `select`, `date`, `text`, `bool`. Callers pass
them as flags — `small run app --image ./photo.jpg --threshold 0.7` — and the
dashboard renders a Run form from the same declaration. In the script:

- scalars arrive as `SMALL_INPUT_<NAME>` env vars (uppercase; bools are the
  strings `true`/`false`)
- file paths come from `$SMALL_INPUTS/inputs.json` (each file value is the
  path it was fetched to)

Anything the script saves for the user goes in `$SMALL_OUTPUTS` — every file
written there is captured on the run, shown in the dashboard, and fetched with
`small run app --download ./out`. Do not print results to stdout when a file
would serve better, and do not write user-facing files anywhere else in the
container: only `$SMALL_OUTPUTS` survives the machine.

## Schedules

A job that should run itself carries a standard 5-field cron expression, UTC:

```toml
kind = "job"
schedule = "0 9 * * 1-5"
```

Deploy validates it (bad or never-firing expressions stop with a one-line
fix) and prints the next run. `small schedule pause app` /
`small schedule resume app` flip it without losing the expression; `small
runs` shows cron runs with a `⏱ cron` marker. Scheduled runs pass **no
inputs at all** (not even defaults — those are applied by the CLI): a
scheduled job's script must fall back in code,
`os.environ.get("SMALL_INPUT_THRESHOLD", "0.5")`, or not be scheduled.

S3 in/out: declare the URI and destination bucket as `text` inputs and use
boto3 in the script — see references/aws-role.md for the role.
