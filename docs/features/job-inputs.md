# Job inputs and outputs

A job declares what it takes; `small run` passes it; the script reads it; whatever it
writes to an output directory is captured on the run.

Schema in `small.toml`:

```toml
[inputs]
image     = { type = "file",   required = true, accept = ".jpg,.png", help = "Photo to analyse" }
threshold = { type = "number", default = 0.5, min = 0, max = 1 }
account   = { type = "select", options = ["acme", "globex"] }
since     = { type = "date",   default = "-7d" }
label     = { type = "text",   pattern = "^[a-z0-9-]*$" }
dry_run   = { type = "bool",   default = false }

[outputs]
report = { path = "report.pdf", label = "Weekly report" }
```

Exactly six types: `file`, `number`, `select`, `date`, `text`, `bool`. Anything else is
rejected at `small init` and `small deploy` with a one-line error.

## CLI

`small run <app> --image ./photo.jpg --threshold 0.7 --dry-run`. One flag per input
(underscores become dashes: `dry_run` → `--dry-run`), validated against the schema before
anything is uploaded: required present, number in range, select in options, file extension
in `accept`, text matches `pattern`. Relative dates (`-7d`) resolve to `YYYY-MM-DD` at
validation so the script gets a concrete date. The schema is read from the local
`small.toml`; passing input flags without one is an error.

Validated inputs print before the run starts:

```
✓ inputs: image=photo.jpg (48 KB) · threshold=0.7 · dry_run=true
```

Input files are capped at 100 MB total per run, checked before upload. After the run
finishes the CLI lists output files with sizes and the fetch command:

```
outputs:
  annotated.jpg  214 KB
  boxes.json     2 KB
fetch: small run yolo-job --download ./out
```

`small run <app> --download ./out` downloads every output of the latest finished run.

## Wire contract (between the three halves)

- `POST /api/runs` — unchanged JSON `{ app, inputs?: { name: value } }` when there are no
  file inputs. With files: multipart form with field `body` holding that same JSON string,
  plus one file part per file input named `input:<name>` (original filename preserved).
  File inputs appear in `inputs` as their original filename string.
- Inputs are stored on the run row as JSON. Uploaded files go to R2 keyed by run id.
- `GET /api/runs/<id>/outputs` → `{ outputs: [{ name, size }] }`
- `GET /api/runs/<id>/outputs/<name>` → the file bytes.
- Uploads capped at 100 MB per run.

## Runtime

`runner.py` receives inputs (`SMALL_RUN_INPUTS` env, set per run by the control plane)
and writes: scalars as `SMALL_INPUT_<NAME>` env vars (uppercase; bools as `true`/`false`),
files to `$SMALL_INPUTS/<name><ext>` (fetched from the control plane with the run token),
and everything to `$SMALL_INPUTS/inputs.json` (file values as their fetched path). Creates
`$SMALL_OUTPUTS/` for every job. On exit, uploads every file in it to the control plane,
declared or not — before the exit-code post, so "finished" means outputs are listable.
An input fetch failure fails the run with a `runner: inputs failed` log line.

## Control plane

Inputs JSON on the run row (migration `0005-inputs.sql`; also in `GET /api/runs/<id>`),
files in R2 bucket `small-runs` (binding `RUNS`) keyed `runs/<run_id>/{inputs,outputs}/<name>`,
`GET /api/runs/<id>/outputs` + `GET /api/runs/<id>/outputs/<name>` (CLI auth, canView),
`GET .../inputs/<name>` + `POST .../outputs/<name>` (run-token auth, runner only),
100 MB cap enforced on both input parts and cumulative outputs. Job machines now get
2 GB (was 256 MB — torch jobs need it; still a fixed size, ponytail-marked).

## Example

`examples/yolo-job`: takes `image` and `threshold`, writes `annotated.jpg` and
`boxes.json` to `$SMALL_OUTPUTS`. The Gradio one stays.

## Skill

`skills/small/SKILL.md`: every non-secret `os.environ` read in a job is an input —
declare it. Anything the script saves for the user goes in `$SMALL_OUTPUTS`.

## Skipped

- Web run form — ponytail: the CLI flags cover job runs; form belongs to the dashboard work.
- Multiple selects — ponytail: single select covers the known apps; add `multiple = true` when one needs it.
- Outputs over 100 MB — ponytail: flat cap; raise or stream to R2 multipart when a real job hits it.
- Input presets — ponytail: rerun-with-tweak is retyping one flag; presets when runs grow past a handful of inputs.
