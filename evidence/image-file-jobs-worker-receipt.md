# Actual Worker image FileJobs qualification

Implementation: **3b429e7c**. Runtime was tested before commit, at 8827632c plus the exact redirect-only provider source change subsequently committed in 3b429e7c. Probe: image-file-jobs-worker-probe.mjs. Installed Miniflare 5.20260903.0-alpha/workerd, compatibility date 2026-08-01. No dependency installation, remote configuration, deployment or real provider request. Runtime disposed in finally; 30-second host watchdog.

## Final result

**7 passed / 0 failed / 0 skipped**, 3078.437 ms host wall time including startup/setup. One intercepted fake provider request; zero real provider requests and zero unexpected Worker outbound requests.

Actual shipped FileJobs class/delegation and automatic alarm ran with image route, source ACL, spend admission/settlement, provider adapter including PNG pixel decode, D1 (real local migrations 0016 and 0023), and R2 original/immutable output storage. Checks: owner refusal; private job status ACL; ready lifecycle; duplicate submission does not regenerate; owner can read artifact while another fixture identity cannot; settled reservation retains its bound when actual cost is unavailable; original bytes and board state remain unchanged.

External session and board-owner resolution are fixture-injected through the build plugin. Source access and all job/storage implementation are actual modules. Provider response is deterministic and intercepted locally; this is not real authentication, model-quality, transparency-segmentation or billing verification. Full dev-worker dispatch, cancellation races and maximum-image CPU/memory are outside this probe.

## Failure preserved and fixed

Original actual-runtime run: **2 passed / 1 failed / 4 not reached**. The job reserved spend and ended unknown/held before any provider transport. Diagnostic reruns retained this same failure. Temporary diagnostic bundle inspection exposed Workers rejecting redirect:error: edge fetch accepts follow or manual. Node fixtures did not expose that mismatch.

Fix: manual redirects, retaining existing rejection of every non-OK response. Added 301/302/307 regressions requiring one transport call to the original endpoint only. No redirect or credential forwarding; no retry. Removed temporary diagnostic bundle overrides before final successful Worker run. Adapter/coordinator Node tests after fix: **32 passed / 0 failed / 0 skipped**. The separate eleven Node integration tests remain attributed to their earlier checkpoint; sparse checkout omitted them from this invocation, so they are not counted here.

Earlier harness setup attempts failed before behavioral checks because sparse source dependencies were absent and the fixture SQL splitter mishandled semicolons in inline comments. Restored four unchanged small tracked modules and corrected only the fixture splitter. No production migration was run.
