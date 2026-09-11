# Run constants

Declare a flat `[constants]` table in `small.toml` for private AWS CPU jobs.
The MVP accepts strings, finite numbers, and booleans: at most 20 named values,
2 KiB of compact JSON. Names start with a letter and use letters, digits, and
underscores, up to 40 characters. Numeric values must fit JavaScript's safe range.
Constants are visible to app viewers and must not contain secrets.
Each constant must be read by the underlying application and affect its behavior
or the interpretation of its results. Display-only copies, including model names
the job does not consume, are excluded because they can drift from the real code.
Platform and adapter limits are excluded as well.

Constants may also use `threshold = { value = 0.85, tooltip = "Minimum score accepted." }`.
The optional tooltip uses the input information-icon component, supports up to
2000 characters of plain text, and counts toward the existing 2 KiB declaration
limit. Deployments preserve the explanation; run snapshots and `SMALL_CONSTANTS`
contain only scalar values. Scalar declarations remain supported. The CLI checks
the installation's `constant_tooltips` capability before uploading this syntax.
CLI 0.0.13 includes this extension.

Inputs may declare optional `tooltip` text, up to 2000 characters. Run shows an
information icon beside the field label; hover, click, or keyboard focus reveals
the plain text. `help` remains visible below the input. Tooltip text explains an
input or its profile choices and does not define or alter job behavior.

```toml
[inputs]
profile = { type = "select", default = "prod", options = ["prod", "sensitive"], help = "Choose a detection profile.", tooltip = "Prod: arm elevation 90 degrees and cooldown 7 frames. Sensitive: arm elevation 80 degrees and cooldown 5 frames." }
```

```toml
[constants]
threshold = 0.85
region = "us-east-1"
enabled = true
```

Run > Constants displays the current successful deployment's values as read-only
rows. No section appears when an app declares none. Changing constants requires
redeploying. The API saves the values with the deployment, snapshots them in each
run, and passes that snapshot as `SMALL_CONSTANTS` JSON to the job's environment.
Run inputs cannot override constants. Existing deployments use an empty object.

```python
import json
import os

constants = json.loads(os.environ["SMALL_CONSTANTS"])
threshold = constants["threshold"]
```

The CLI validates constants before upload and requires a private installation
advertising constants support. Unsupported hosting/installations stop with an
upgrade instruction rather than ignoring the declaration. This does not extract
hardcoded Python assignments or change unrelated runtime environment variables.

Verification covers CLI and API validation, deployment storage, read-only UI,
typed runtime values, rejected overrides, and compatibility with older apps.

## Verification and rollout

### Constant tooltips

- CLI validation/transport: 10 focused tests passed, including rejecting older
  installations before upload and preserving the tooltip in deployment requests.
- API: 21 focused tests passed, including persisted explanations, malformed
  definitions, scalar runtime values, and old deployments.
- Private dev browser: the Constants tooltip opens on keyboard focus and the
  Run request contains only editable inputs; focused scenario passed.
- Dev release `0.1.0-dev.10` is the tooltip rollout. CLI `0.0.13` carries the
  declaration syntax and updated Small skill.
- `small-deploy@0.0.13` is published as npm `latest`; registry shasum
  `0468eac58d501e02a848a6affeba531a27853bf4` matches the inspected archive.
- Real dev run `r-1789152190114-9d1e7da6498b` finished with exit `0`. The
  deployment retained the threshold tooltip, while the runtime result contained
  only `threshold = 0.85`, `region = "us-east-1"`, and `enabled = true`.

### Scalar constants and input tooltips

- 181 BYOC tests and 26 subtests passed, including typed constants, invalid and
  oversized declarations, deployment storage, runtime environment, rejected
  run overrides, and old deployments without constants.
- 60 CLI tests passed, including private deployment transport and rejection of
  an installation without constants support before any access request/upload.
- All 15 private dev browser scenarios passed. Three focused live-build
  scenarios passed for Constants, output controls, and Logs chat/history.
- CLI `0.0.12` was published for this earlier rollout. Its inspected 33-file archive
  contains the updated skill and AWS reference; the registry shasum
  `c8561c5c893c09029ef7fb5e4e041fc43aefa351` matches the reviewed archive.
- Dev `0.1.0-dev.9` and live `0.1.0-pilot.6.8` each have 209 verified files.
  Changed AWS resources are the API, job API, and cleanup Lambda (which bundles
  the job API helpers). No IAM policy or customer connection changes are needed.
- Both stacks reached `UPDATE_COMPLETE`; installer `finish` published each
  dashboard and the CloudFront index matched its packaged file byte for byte.
- Real dev app `constants-proof` deployment
  `d-1789145008362-ec6c942787b1` is ready. Run
  `r-1789145468692-42ced02f4801` exited `0`; `result.json` preserved the exact
  boolean, number, and string constants and evaluated score `0.9` as accepted.

The example at `examples/byoc-constants` declares a threshold, region, and boolean
flag. Its job reads `SMALL_CONSTANTS` and writes the exact values and score result
to `result.json`. The deployed dev app remains available at
https://dviorrcko52ft.cloudfront.net/apps/constants-proof for visual review.
