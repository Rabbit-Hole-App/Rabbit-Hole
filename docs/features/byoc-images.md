# Private AWS job images

Each app keeps its latest successful deployment. A new upload or failed build
does not replace that version. Once a replacement succeeds, older deployment
IDs cannot start new runs or file uploads; rerunning older source requires a
new deployment. There is no seven-day rollback window.

The generated Python image upgrades available Debian packages before installing
Python requirements, then removes Perl as its last `RUN`. Existing images must
be rebuilt to receive this change. Other OS findings can remain; this is not a
claim that the image has no vulnerabilities.

A customer-local Lambda checks for replaced images every five minutes. It
preserves every app's current image, unfinished builds, and images needed by
unfinished jobs. It waits at least two minutes after replacement, exceeding the
job API's 25-second execution limit, before checking run records. This protects
requests that were starting while the app changed versions, without a rollback
retention period. Unknown/missing task state preserves the image.

Deletion targets only the replaced deployment's immutable `build-N` tag, after
verifying the recorded digest. Deleting by digest could remove a concurrently
published tag for another deployment of identical code. No repository-wide
age/count or untagged lifecycle rule is installed. Source, deployment records,
run history, logs, and outputs are retained. Incomplete inventory or AWS errors
stop deletion; the next scheduled invocation retries.

The first cleanup invocation establishes a two-minute activation buffer so an
installation update cannot race requests still using the preceding API version.
Only the cleanup role can delete image tags, only in its installation repository.
It reads deployment/run metadata, not source archives or job outputs.

`GET /job` returns the current working deployment and the newest attempt
separately. Deployment status/log endpoints still expose failed and building
attempts. A lost RunTask response is marked uncertain and keeps its image;
an explicit AWS rejection remains a failed run.

ponytail: a sweep currently caps its complete inventory at 2,000 deployment/run
records. It fails closed and logs an error beyond that limit. Add an active-run
and retirement index before exceeding this MVP capacity; do not raise the cap
without measuring Lambda execution time. Unknown legacy builds or task state
require operator reconciliation before their tags can be removed.

## Release and verification (2026-09-11)

The user authorized both separate Amazon dev and live installations, dev first.
Dev `0.1.0-dev.2` and live `0.1.0-pilot.5.2` reached `UPDATE_COMPLETE`; installer
`finish` completed for both. Their existing dashboard artifacts were reused
unchanged. Account and repository identifiers remain installation configuration,
never CLI constants.

`small-deploy@0.0.11` is published on npm. Its published tarball SHA-1 is
`2d22b2bc3f3fc0a0243ad6fcf7ef6100c1024d91`, matching the tested release archive.
Install it with `npm install -g small-deploy@0.0.11` for future image builds.

- 165 Python BYOC tests plus 26 subtests passed; all 66 CLI/template Node tests
  passed. Coverage includes shared repositories, failed replacements, incomplete
  inventories, uncertain launches, identical-image tags, and activation races.
- Both dev apps were rebuilt. `dev-cpu-job` uses `build-3`; `dev-word-count`
  uses `build-5`. Both isolated image checks exited 0 after asserting Perl is
  absent and importing Python's SSL, SQLite, and zlib modules.
- Real dev runs `r-1789112283724-bb851944e335` and
  `r-1789112779853-ed52e9f64414` finished with exit 0 and `report.json` outputs.
- An intentionally failed CPU replacement (`build-4`) left `build-3` current
  and runnable. The newest attempt remains visible as failed in its history.
- An old CPU image stayed available while its synthetic hold task ran. After
  that task stopped, scheduled cleanup deleted `build-1`. The word-count
  replacement also retired `build-2`; final dev ECR tags are exactly
  `build-3` and `build-5`. Both old deployment IDs returned 409 on new runs.

These backend checks used AWS-admin-authenticated Lambda invocations with
synthetic gateway claims, not a completed human browser login. Source rebuilds
occurred inside customer AWS; only `.small/Dockerfile` changed, with every other
archive entry verified identical. Live application test runs were not performed:
automatic approval review rejected the proposed live smoke test as potentially
starting production work. Dev execution tests and live build verification are
reported separately.

All six live app rebuilds succeeded. Their current deployment images were
individually resolved in ECR after cleanup started:

| App | Deployment | Image tag |
| --- | --- | --- |
| drift-debug | `d-1789112902927-9a4fee5607e1` | `build-12` |
| oof-debug | `d-1789113242830-713fc963a02c` | `build-13` |
| overreach-debug | `d-1789113312756-e4445ca20a15` | `build-14` |
| aws-grants-proof | `d-1789113368835-f8c297cb3272` | `build-15` |
| aws-private-proof | `d-1789113426959-c0dbecfc140e` | `build-16` |
| aws-private-s3-report | `d-1789113484424-78ade744f525` | `build-17` |

Each successful build executed the final Perl-removal assertion. This verifies
image construction, not the app's full business workflow. Rebuilds kept the
existing app catalog and permissions; no live business run was triggered.

Final live ECR inventory contains exactly `build-12` through `build-17`, one
current image per app. Cleanup removed all eleven superseded tags (`build-1`
through `build-11`) with no reported deletion failures. Every current image
digest resolved after that deletion. Dev likewise retains exactly its two
current images. Sanitized metadata proof is saved on the customer dev box under
`~/small-images-rollout/`, with a local copy under ignored
`.small/byoc-private/image-proof/`.

[ECR tag deletion semantics](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_BatchDeleteImage.html)
explain why cleanup removes a specific tag and does not remove all tags by digest.
