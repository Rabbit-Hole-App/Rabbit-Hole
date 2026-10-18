# Native image interpretation dev receipt

Implementation: `4b0bb015ca646190503f4e8323370865b07272cc`, following `6e049db1`.
Separate from qualified core checkpoint `b788d143` and [PR #4](https://github.com/Rabbit-Hole-App/Rabbit-Hole/pull/4).

[Dev app](https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev/apps/canvas-d0dd10c4), deployment version `004a0ea2-b3ab-40ee-b027-c990a216a3e2`.

## Scope

Explain can preview image-derived native equations and diagrams on the editable owner main canvas. Preview shows model-reported uncertainty and explicitly says recognition is unverified. Accept checks selected source identity, permissions and current file revision before checking placement and applying one native transaction. Modern source references are retained with provenance; original image objects remain unchanged. Legacy asset receipts verify bounded bytes but do not promise that deleting the original later retains its raw asset. Other canvas scopes and card extraction are not part of this checkpoint.

## Verification

- Focused source/transaction/session tests: **36 passed, 0 failed, 0 skipped**.
- Dev build: **passed, 10.75 seconds**. Upload 9.61 seconds; trigger update 0.33 seconds.
- Deployed fixture browser run3: **4 passed, 0 failed, 0 skipped, 0 interrupted**, 11.914 seconds. Actual dev file reads/storage and canvas persistence; deterministic model responses only. Checks cover equation uncertainty, source retention/reload, stale source revision refusal, diagram provenance/reload and no overlap with the source image.
- Local logs: `ctrlk-extraction-unit-run2.log`, `ctrlk-extraction-build-run3.log`, `ctrlk-extraction-deploy-run2.log`; browser receipt/screenshots `e2e/shots/ctrlk-extraction-run3/`.
- No provider requests or model-quality verification. OCR, mathematical correctness, graph fidelity and arbitrary image reconstruction remain unverified.

## Preserved failures and corrections

At `6e049db1`, browser runs1 and2 each recorded **2 passed, 1 failed, 0 skipped, 1 interrupted**. The first diagnosis suspected a required relocation confirmation; the repeated run demonstrated a product defect: diagram placement excluded the selected image from obstacles, while acceptance rejected overlap with that image, creating repeated relocation. `4b0bb015` includes the source in placement obstacles. It also moves asynchronous source verification before synchronous placement and transaction checks, closing the reviewed obstacle-change race.

First build attempt lacked sparse-excluded tracked design entries. Only absent exact HEAD entries were restored; build then passed. Tests and meaningful assertions were not weakened. No main push or production action occurred.
