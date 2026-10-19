# Explicit image and code handoff checkpoint

Candidate `dc2c714f`, dev version `31032c37-36b9-4adf-adc4-488143a0de10`. Build 8.51 seconds; deployment upload 8.96 seconds and triggers 0.50 seconds. Original build attempt was blocked by absent sparse tracked design entry files, restored from exact branch HEAD without overwriting existing files.

Natural-language image Edit returns a request-bound `image_action` preview. Review image action rechecks the full frozen image and current permissions, opens existing background confirmation or rectangular-region selection, and preserves the original user prompt. It never creates a job directly. Regional selection Escape now closes that selector. Request-bound handoffs are not reused from generic result cache.

Affected session/image/code fixtures: **58 passed**, zero skipped. Natural-image browser run1: **4 passed / 1 failed**, ordinary `/api/learn/inline/telemetry` incorrectly blocked by inherited test tripwire. Corrected only that route allowance; unchanged candidate run2: **5 passed / 0 failed / 0 skipped / 0 interrupted**, 21.911 seconds. Evidence: `e2e/shots/ctrlk-image-action-run1/` and `ctrlk-image-action-run2/`. Dev canvas: https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev/apps/canvas-24ec6d09.

Model decisions/generation and image jobs were fixtures; actual mask storage/pixels, frozen source checks, preview/Apply, retention, Undo/Redo and reload exercised. No paid requests, no real-model routing or image edit quality claim.

The same candidate integrates the existing isolated JavaScript coordinator/actor through FILE_JOBS and dev routes, with no new namespace or loader activation. Native JavaScript Code boxes expose explicit JSON input and Review execution. Opening fetches availability only; Run requires explicit reservation consent. Saved tickets bind owner/canvas/source and input hashes; Resume never resubmits, output is read-only, and there is no canvas Apply. Execution configuration remains OFF. Actual-app code UI checks at the follow-up snapshot fix are recorded below; leaf runtime probes retain their original attribution and do not establish deployed execution.

## Code snapshot recovery follow-up

Review found a completed ticket keyed only by owner/canvas/source prevented reviewing changed source or input. Fix `60c79d02283cc9a9159a9d95be673d8c78b0ad1b` adds a SHA-256 snapshot suffix, retaining old tickets without storing raw source/input in the key. Asynchronous panel setup revalidates current code, input and access. Client tests **8/8**; this adds one focused regression to the preceding58 checks.

Deployed version `49d7697c-4c7c-458a-ba9e-be3db3b62cad`; build9.21s, upload8.53s, triggers0.37s. Code browser **6 passed / 0 failed / 0 skipped / 0 interrupted**,15.008s: actual disabled quote; explicit fixture reservation; persistence before POST; reload/explicit Resume without resubmission; read-only stdout/result without canvas mutation; changed source and changed JSON input offer fresh consent while old tickets remain. Canvas https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev/apps/canvas-e3db5260. Evidence `e2e/shots/ctrlk-code-run1/`, `code-browser-run1.log`. All execution jobs intercepted; **no deployed runtime execution**. Existing local Worker runtime/actor probe receipts remain separately attributed.

Supplementary region-selector keyboard check at `dc2c714f`: **1/1 passed**, `e2e/shots/ctrlk-region-escape/`, verifies Escape closes only the selector while preserving the inline editor. This supplements the earlier5 natural-image checks, not an additional full run.
