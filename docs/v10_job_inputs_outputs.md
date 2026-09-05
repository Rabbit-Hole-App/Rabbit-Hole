# v10 — job inputs and outputs, AWS for jobs, deploy pre-flight (2026-09-04)

A job now declares what it takes and hands back what it made. `small run` passes
inputs as flags, the script reads them from its environment, and every file it
writes to an output directory is captured on the run and fetchable later. Jobs
with an `[aws]` role get per-run STS creds, and `small deploy` verifies
everything it can before a build starts. Full contract:
`docs/features/job-inputs.md` and `docs/features/job-aws.md`.

```toml
[inputs]
image     = { type = "file",   required = true, accept = ".jpg,.png", help = "Photo to analyse" }
threshold = { type = "number", default = 0.5, min = 0, max = 1 }

[outputs]
annotated = { path = "annotated.jpg", label = "Annotated image" }
```

## Inputs

1. Exactly six types — `file`, `number`, `select`, `date`, `text`, `bool` —
   parsed from inline TOML tables (the mini-parser in
   `packages/cli/lib/toml.js` grew quote-aware inline-table support). A seventh
   type stops `small init` and `small deploy` in one line.
2. `small run app --image ./photo.jpg --threshold 0.7 --dry-run`. One flag per
   input (`dry_run` → `--dry-run`), validated before anything uploads:
   required present, number in range, select in options, file extension in
   `accept`, text matches `pattern`, `-7d` dates resolved to `YYYY-MM-DD`.
   Validated inputs print before the run starts; input files cap at 100 MB.
3. Files ride a multipart POST to `/api/runs` (field `body` = the JSON, one
   `input:<name>` part per file) and land in R2 (`small-runs` bucket) keyed by
   run id. Scalars stay in the JSON. Inputs are stored on the run row and shown
   by `GET /api/runs/<id>`.
4. `runner.py` puts scalars in the child env as `SMALL_INPUT_<NAME>`, fetches
   files into `$SMALL_INPUTS/<name><ext>`, and writes everything to
   `$SMALL_INPUTS/inputs.json` (file values as their fetched path). An input
   fetch failure fails the run at start.
5. The `[inputs]`/`[outputs]` tables are also sent with every deploy and stored
   on the app row (migration `0010-input-schema.sql`) — the dashboard Run form
   renders from them, and `small run` fetches them to validate when run away
   from the app directory.

## Outputs

`runner.py` creates `$SMALL_OUTPUTS/` for every job and, on exit — before the
exit-code post, so "finished" means listable — uploads every file in it,
declared or not, to `POST /api/runs/<id>/outputs/<name>` (run-token auth,
100 MB cumulative cap). The CLI lists them with sizes after the run and
`small run app --download ./out` fetches the latest finished run's outputs via
`GET /api/runs/<id>/outputs[/<name>]`. `examples/yolo-job` exercises the whole
path: image + threshold in, `annotated.jpg` + `boxes.json` out.

## AWS for jobs

`[aws] role_arn` now works for `kind = "job"`: `startRun` mints one STS session
(same `assumeRole`/ExternalId path servers use) and passes the standard
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` /
`AWS_REGION` in the machine env; the job process inherits them and boto3 needs
zero config. S3-in/S3-out is script territory — URI and destination bucket are
plain `text` inputs (`examples/s3-job`). Job machines were bumped 256 MB → 2 GB
for torch-class jobs.

Discovery is the error: `/api/deploy` test-assumes the role before creating
anything and a failure prints the exact trust policy to paste (small's
principal from the `AWS_PRINCIPAL_ARN` var + the caller's org as ExternalId).
`skills/small/SKILL.md` instructs the coding agent to create and maintain the
role itself with the user's local AWS credentials — announce intent, create
with the printed trust policy, scope the inline policy to exactly the calls in
the code, never keys in `.env`.

## Deploy pre-flight

Between secrets and build, `small deploy` now verifies
(`packages/cli/lib/preflight.js`):

- every bundled `.py` compiles with the local python — hard stop with file and
  line (skipped when no python is installed)
- each `requirements.txt` name exists on PyPI — warning only (private indexes,
  network flake), but a typo surfaces before the minutes-long remote build
- bracket `os.environ["X"]` reads that are neither declared secrets, in
  `.env`, nor `SMALL_*` warn that they will be unset; a job reading
  `SMALL_INPUT_*` with no `[inputs]` section warns too

## Tests

- CLI unit (`packages/cli/test/cli.test.js`): inline-table parsing, the six
  types, every validation rule, preflight dep-name parsing and env-read scan.
  26 pass.
- Runner unit (`tests/unit_tests/packages/runtime/test_runner.py`): env vars,
  file fetch, inputs.json, outputs uploaded before the exit-code post against
  a fake control plane. 2 pass.
- Integration, all against the live worker: `yolo_job` (8 — schema stored,
  remote validation away from the app dir, run row inputs, two outputs,
  boxes.json content, `--download`, range error pre-upload) and `s3_job` (5 —
  STS read/write to the demo bucket via role `small-s3-demo`, no secret in
  logs, unassumable role stops the deploy with the trust policy).

## Gotchas hit

- The global `small` is an npm junction any worktree can repoint; a deploy
  through it bakes that worktree's stale gitignored `assets/runner.py` into
  the image (`KeyError: SMALL_INPUTS`). Integration tests pin `SMALL_BIN`.
- R2 had to be enabled on the Cloudflare account once, in the dashboard
  (error 10042) — no CLI path.
- Two parallel sessions built the schema-on-app-row contract independently;
  the dashboard's shape won (`inputs`/`outputs` columns + fields, migration
  `0010-input-schema.sql`), and the D1 bookkeeping needed manual reconciling
  again: columns applied by hand must be recorded in `d1_migrations` or the
  next `migrations apply` replays and rolls back.
