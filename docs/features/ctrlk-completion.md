# Ctrl+K image edit, background removal and JavaScript: supported scope, unsupported list, completion order

Written 2026-10-26 on `feat/ctrlk-complete` (base `stack/c27-batch-b2` cd1888d7). Ledger 9453f5f0 (image) and ba6304f0 (JavaScript); contract 6570266e.
Owner definition of complete: implemented and tested on the final candidate; infrastructure, secrets and configuration deployed; real production acceptance passed through the deployed paths;
enabled for the agreed users and supported settings; credits, persistence, reload recovery, duplicate submissions and failure handling verified; unsupported settings listed. A deployed-but-disabled
feature is not complete. **Today neither feature is complete: nothing is deployed enabled and no acceptance has been run.**

## What exists, by branch

| Branch | Content | Releases |
|---|---|---|
| `feat/ctrlk-complete` | Image edit settles at min(priced provider usage, reservation); both deployed acceptance commands and their tests; these docs | An ordinary release; no flag changes, so nothing becomes enabled |
| `feat/ctrlk-activate` | HELD. Two commits on top of `feat/ctrlk-complete`: one activates image edit, one activates JavaScript. Each is a few config lines plus the updated key-install test | Only on the owner's go, one at a time; config changes need the full gate |

## Image edit and background removal: supported

| Item | Supported | Where enforced |
|---|---|---|
| Source | One saved **PNG** image card, 8-bit RGB or RGBA, not interlaced, up to 4096 x 4096 and 16,777,216 pixels, file up to **5 MiB**, whose card revision equals the stored image | `inline-image-jobs.js`, `inline-image-edit-provider.js` |
| Card | Image or file-image card that is not locked and has no sources, citations or references; the canvas must be editable by the requester | `editableImage`, board access |
| Background removal | One operation: transparent background, subject kept | `remove_background` |
| Regional edit | One **rectangular** region (an RGBA PNG mask of the same dimensions, under 4 MiB, with fully transparent pixels) and a prompt of 1 to 2,000 characters | `edit_image`, `inline-regional-mask.js` |
| Result | A new immutable PNG, always **1024 x 1024**, low quality, up to 10 MiB, model `gpt-image-2.5-sunburst-2026-09-08`; the original and its position stay until the person presses **Apply**; a preview comes first | provider adapter, `RegionalImageEdit.jsx`, `BackgroundRemovalPreview.jsx` |
| Charge | The person is charged the priced provider usage, never more than the approved reservation (3 credits on the activation branch); about 1 credit expected; a cancel before dispatch charges nothing | `inline-image-edit-job.js` |
| Attempts | One attempt per job, no automatic retry; an unclear outcome is kept as unknown, never re-run; a duplicate submit returns the same job; a reused key with another request is refused | coordinator, route |
| Recovery | The job lives in a Durable Object and finishes after the tab closes; a reload offers to resume | `inline-image-job-client.js` |

## Image edit: explicitly unsupported

JPEG, WebP, GIF, HEIC or other source formats (the button is disabled unless the card is a PNG); sources over 5 MiB or over 4096 pixels on a side; 16-bit, palette or interlaced PNG; more than one image per request; non-rectangular
or freehand masks; keeping the original dimensions (output is always 1024 x 1024) or the pixels outside the region (not claimed); any quality or size other than low 1024 x 1024; model choice; locked cards and cards with citations;
read-only canvases; batch edits; automatic retry; editing a result into a card without the preview and Apply step. The person cannot see dollars. **Not verified by anyone yet:** segmentation quality and the real billed cost.

## JavaScript execution: supported

| Item | Supported | Where enforced |
|---|---|---|
| Language | **JavaScript only**, the whole Code object run as an async function body with an explicit `return`; Python and other languages are refused | `inline-code-route.js` |
| Input and output | JSON input up to **16 KiB**; source up to **32 KiB**; result up to **32 KiB**; stdout up to 16 KiB and 128 lines (a breach is an error, not truncation) | `inline-code-runtime.js` |
| Limits | CPU **1,000 ms**; wall deadline **3 s** (a timeout ends the wait, it does not claim termination); subrequests 0 | loader limits, `WALL_MS` |
| Isolation | Empty environment, `globalOutbound: null`, a synthetic request with no owner or session header, a fresh isolate per run (no state between runs) | runtime; proven only by local Miniflare until the acceptance run |
| Who | The signed-in **owner** of the canvas (a collaborator is refused), with explicit consent to the reservation | route |
| Budget | A **global lifetime** budget in the platform's own units: `INLINE_CODE_MAX_RUNS` runs of `INLINE_CODE_RESERVE_MICROS` each up to `INLINE_CODE_MAX_MICROS`; never refunded or refilled; when exhausted, new runs are refused. People are charged **no AI credits** | `inline-code-job.js` |
| Cancel, retry | A cancel wins over a late result; no automatic retry; an interrupted run becomes unknown | coordinator |

## JavaScript: explicitly unsupported

Python and every other language; network access of any kind (including this app); storage, cookies, environment variables, secrets and bindings; importing modules or packages; timers longer than the 3 s wall deadline;
programs over 3 s wall or 1 s CPU; memory limits (the runtime sets none; the platform default applies and is only observed); input or output over the limits above; running a program from a notebook cell or a read-only canvas;
concurrent-run guarantees; confirmed termination reports for a cancel or timeout (the product says termination is not confirmed); refilling the run budget without a code change.

## Conservative maxima (what activation sets)

| Setting | Value | Why |
|---|---|---|
| `INLINE_IMAGE_EDIT_RESERVED_USD` | `0.03` (3 credits) | about 3x the measured edit; the charge is clipped to it |
| Acceptance booking | US$0.05 per paid run, US$0.25 for the five paid image runs | the provider's bill is not clipped, so the booking sits well above the measured US$0.01 |
| `INLINE_CODE_MAX_RUNS` / `RESERVE_MICROS` / `MAX_MICROS` | `200` / `10000` / `2000000` (1 credit per run, 200 in all) | ceiling US$0.40 even if every run were billed as a unique worker; the acceptance uses 10 runs |
| JavaScript acceptance booking | US$0.05 once | covers Dynamic Workers usage, US$0 expected |

## Owner command order

Nothing below has been run. Every step names its precondition and rollback; stop at the first failure.

1. **Loader probe (US$0 expected, worst US$0.02).** `node C:/s/spec/day-1021/with-cf.mjs C:/Users/cyudhist/Desktop/workspace/fj-ctrlk node scripts/ctrlk-loader-probe.mjs --run --wrangler <path to wrangler 4.x bin/wrangler.js>` (dry run first: omit `--run`). Success: exit 0, `outcome pass`, `deleted and confirmed gone`. **Exit 3 = error 10195, Workers Paid is not active: JavaScript execution is blocked on that account decision; record it and skip steps 6 to 8.** A CPU-loop FAIL also blocks JavaScript.
2. **Release `feat/ctrlk-complete`** (normal release; no flag changes). Success: nothing user-visible changes; the image routes still answer unavailable.
3. **Install `OPENAI_API_KEY`** with the existing `C:/s/spec/image-activation/prod-image-secrets.mjs` (dry run first). Safe now: transcription stays off (`TRANSCRIBE_ENABLED` is `false` in main since B1). Rollback: delete the secret.
4. **Release the image activation commit** from `feat/ctrlk-activate` (`INLINE_IMAGE_EDIT_ENABLED` `true`, `INLINE_IMAGE_EDIT_RESERVED_USD` `0.03`). From here every signed-in user with credits can use it. Rollback: set the flag back to `false`.
5. **Image acceptance.** `node scripts/ctrlk-image-acceptance.mjs --dry-run`, then run it in a terminal (cookie at a hidden prompt). Reserves in `budget.mjs` first. Success: `ACCEPTANCE PASSED for 6 runs`, receipts in `C:/s/spec/ctrlk-image-accept/receipts`. Then update the docs to "production-accepted".
6. **Optional, before step 7:** `node scripts/ctrlk-code-acceptance.mjs --runs disabled-check` proves the OFF state says so and creates nothing.
7. **Release the JavaScript activation commit** (`worker_loaders` `INLINE_CODE_LOADER`, `INLINE_CODE_ENABLED` `true`, the three limits). Only after step 1 passed. Rollback: `INLINE_CODE_ENABLED` `false`.
8. **JavaScript acceptance.** `node scripts/ctrlk-code-acceptance.mjs --dry-run`, then run it. Success: `ACCEPTANCE PASSED for refusals, jobs, cancel`; it uses 10 of the 200 lifetime runs.

## What remains unproven after all of that

How the edited images look beyond the owner's glance; provider behaviour for sources the acceptance does not use; a provider failure on the deployed path (it cannot be induced without a fault switch, so only the refusal paths are shown to charge nothing);
restart recovery of the Durable Object in the middle of a job; memory exhaustion on the loader (recorded, not gated); the lifetime budget's exhaustion on the deployed path (unit-tested only, since proving it would spend the real budget); concurrent users.

## Findings the owner should decide

1. The JavaScript run budget is a lifetime ceiling with no refill; a rolling reset is a separate task.
2. The JavaScript panel says "Maximum reservation: N credits" although no AI credits are charged (a global platform budget is). Reword, or move the reservation onto the person's allowance.
3. Image edit has no allow-list: activation enables it for every signed-in user with credits. A private soak first would need a small code change.
