# Background removal dev checkpoint

Implementation `62e4d9306a3f230797afeb685e032b63a9348238`, dev version `2e303dfe-1401-4b9a-b48f-cd064fdff584` at [session dev app](https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev). Provider configuration remains disabled. No paid requests were made.

## Implemented scope

An editable, saved PNG image can open a background-removal preview. Opening reads availability; an available configured service requires explicit maximum-reservation confirmation before submitting once. The owner/canvas/card/source-bound ticket is persisted before submission; an uncertain submission is never automatically repeated. Reopening offers explicit Resume without another submission. Ready output is separately owned stored PNG, rechecked before the existing image revision transaction applies it. The original source is retained. Closing stops local waiting; it does not promise remote cancellation or a refund. Actual billing is not inferred from the reservation.

Other formats require explicit normalization and saving first. Regional image editing, real-provider pixel quality and general image reconstruction are not covered by this UI checkpoint.

## Verification so far

- Combined job/provider/client/controller/revision focused fixtures: **77 passed, 0 failed, 0 skipped** before the final origin guard.
- Final public-route origin checks: **13 passed, 0 failed, 0 skipped**.
- Dev build passed in **9.64 seconds**. Earlier build failed because the handed-off component contained a Windows1252 ellipsis byte; the one-line UTF-8 correction is `ae5dec42`. Original static render passes were not build proof.
- Existing isolated Worker and composition results retain their original SHAs in [Worker job receipt](../../evidence/image-file-jobs-worker-receipt.md) and [Worker decoder receipt](../../evidence/image-worker-probe-receipt.md).
- Deployed actual-app browser: **5 passed, 0 failed, 0 skipped, 0 interrupted**. The actual disabled quote refuses generation; fixture jobs verify explicit consent, saved-ticket Resume without duplicate submission, stale-source refusal, actual stored derivative Apply/original retention with no duplicate upload, one Undo/Redo and reload. Job/provider responses are fixtures; no segmentation-quality or real-provider claim.

Logs: `ctrlk-background-focused.log`, `ctrlk-background-origin-unit.log`, `ctrlk-background-build.log`, `ctrlk-background-build-run2.log`, `ctrlk-background-deploy.log`. No main push, production action, provider activation or paid verification occurred.

Browser receipt: `e2e/shots/ctrlk-background-run1/results.json`, elapsed 20.465 seconds, canvas `canvas-783cdcb3`. Harness originates from `c40303f`. Implementation remained exactly `62e4d930` throughout.
