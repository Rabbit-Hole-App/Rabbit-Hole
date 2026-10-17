# CAD dev handoff — 2026-10-17

Implementation: **`049f284549596f10f7aa904710340edc030ea827`**. [Review PR #2](https://github.com/Rabbit-Hole-App/Rabbit-Hole/pull/2) remains unmerged. [Isolated dev app](https://rabbit-hole-web-dev-cad-integration.tryrabbithole.workers.dev), Worker version `8088d472-d32e-4a2c-9c3d-dc32b36eab84`, runs that implementation. Later documentation commits do not change the deployed implementation. Main remains `abd5f840`; no production deployment or production D1 command was performed.

The dev deployment is now for reviewing saved artifacts. The approved model checks finished, its `CAD_MODEL_API_KEY` was deleted, generation/executor variables were removed, and the dedicated Fly executor was destroyed at **13:24:25 Pacific**. Creating new geometry requires separately authorized executor configuration. Existing cards, downloads and saved measurements do not require the executor or a model call.

## Delivered path and boundaries

`/cad` in Chat and Ctrl+K → explicit confirmation → durable per-canvas job → isolated pinned Python CAD execution → trusted STEP validation → checksummed STEP/GLB/thumbnail → saved interactive card. Edits retain the accepted model until explicit Accept. Recorded-measurement Explain reads authorized, revision-matched server artifacts; it can attach the accepted thumbnail without an extra model round trip. This Explain addition is fixture-verified, not an extra paid-model scenario.

The executor used cadgen **0.7.21**, skill revision `24573128ceaab564f497d7c12f995c41784c9539`, build123d **0.11.1**, OCP **7.9.3.1.1**, Python **3.13.5**, Playwright **1.63.0** and the [recorded image digest](runtime-receipt-2026-10-17.md). It uses existing dev D1/file tables and R2; only the isolated clone received the new Durable Object binding/migration. No new D1 schema or production binding was applied.

## Evidence and exact attribution

| Evidence | Result | Candidate / limitations |
| --- | --- | --- |
| Final `make test-unit` | Python **31 passed**; Node **5,180 passed / 0 failed / 38 skipped / 0 cancelled**; exit 0, 102.161 seconds | `2ff803e8` plus the cancellation fix committed unchanged as `049f2845`. Skips: web 6, control plane 1, motion 31. These are not integration coverage. |
| Production build, bundle check, dev build | Passed | Frontend shipped in `2ff803e8`, unchanged in `049f2845`; 15.510s / 0.884s / 29.229s in the final build pass. |
| CAD browser fixtures | **9 passed / 0 failed / 0 skipped / 0 interrupted** | `0d7234d5` plus the owner-preview correction committed as `9e24ea7b`. Earlier local and deployed fixture histories remain in [verification](../cad-verification.md). |
| Existing Slash commands browser check | **36 passed / 0 failed / 1 skipped** | `9e24ea7b` plus the help marker/assertion correction committed in `2ff803e8`. Skip is Desmos graph in the keyless build. An earlier dialog-bootstrap timeout remains unexplained. |
| Existing focused regressions | Card Edit **7/7**, slash core **18/18**, keyboard **3/3**, canvas context **34/34** | Original dirty implementation attribution retained in [verification](../cad-verification.md); fixtures, not additional model calls. |
| Four approved real-model scenarios | **4 passed / 0 failed / 0 skipped / 0 blocked scenarios / 0 interrupted** | **`2ff803e8`**, [114.484-second recovery receipt](final-model-recovery.json). Individual unmeasured assertions remain blocked despite scenario-level passes. Existing first-part artifacts were reused. |
| First real saved-card browser | **5 passed / 0 failed / 0 skipped / 0 interrupted** | **`9e24ea7b`**, [receipt](first-real-browser.md); corrected observable persistence wait, with the initial failed run retained. |
| Real runtime | **6 execution phases passed**, **5 geometry assertions passed** | Exact original image/source identity in [runtime receipt](runtime-receipt-2026-10-17.md); fixture source, real Linux execution. STL/3MF exported from the same STEP. |
| Runtime timeout and cancellation | **2 passed / 0 failed / 0 skipped** | Same image, [process-tree cleanup evidence](linux-control-probe-2026-10-17.json). Does not establish hostile resource-exhaustion behavior. |
| Cancellation before model admission | Baseline **0 passed / 2 failed**; corrected **2 passed / 0 failed / 0 skipped** | Baseline `2ff803e8` invoked the fixture provider after Cancel/hide; `049f2845` preserves cancellation with no calls/reservations. No additional real-model request was used. |

Final deployed saved-card browser: **5 passed / 0 failed / 0 skipped / 0 interrupted** at **`049f2845`**, both real models. [Receipt](final-stored-browser.md) preserves the initial camera-navigation harness failure and its focused correction. `make test-integration` was not run: the repository's legacy deploy integration suite is not CAD feature coverage and is still required by policy before any eventual main merge. This pass does not authorize that merge or production release.

CI on **`2ff803e8`** passed [unit/build verification](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39066064720) and [all six fast browser groups](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39066061524). The final PR head's checks are visible in [PR checks](https://github.com/Rabbit-Hole-App/Rabbit-Hole/pull/2/checks); do not attribute earlier results to a later SHA. CAD paid/manual checks never run automatically in CI.

## Usage and cleanup

[The settled ledger](usage-ledger.json) records **8 provider requests and $0.117674**, including the malformed featured-part review and its explicit retry; zero unknown operations. This is usage-ledger cost, not an independently verified provider invoice. All calls used the authorized CAD-only Anthropic route after subscription configuration was found unavailable. No further paid checks were run; unused request/budget allowance was not spent.

[Infrastructure evidence](runtime-receipt-2026-10-17.md): one image build; four capped service attempts; less than 51 minutes of machine lifetime; six MiB left in the conservative application transfer allowance. Registry content, the full reserved application allowance and known small diagnostic transfers fit the documented conservative one-GiB accounting; actual provider wire traffic is unavailable. Estimated infrastructure cost is **under $0.25**, not verified billing. Autostart was disabled, the machine stopped, and `rabbit-hole-cad-dev` destroyed. Existing converter/renderers/stacks were not changed. The task-owned local Vite on 5442 was stopped after its checks; worktrees and evidence are preserved.

## Remaining limitations and next actions

- **Geometry proof:** trusted checks cover bounds, volume, solid count and circular-edge diameter. Mesh heights and a 200 mm³ volume decrease corroborate the requested pocket edit, but do not certify hole centers, through-hole depth, pocket depth or unchanged STEP topology. Extend trusted kernel checks before claiming those assertions passed. See [independent model inspection](final-model-inspection.md).
- **Inspection/context:** Explain supplies recorded measurements and the accepted preview; arbitrary geometry queries and automatic CAD-preview/private-reference attachment to general Chat remain unavailable. Detached copied cards support viewing/download/Explain, not editable-model adoption. Structured assumptions can be refined through Edit; no separate pre-build field editor exists.
- **Unverified paths:** real-model image interpretation and the new Explain preflight; hostile fork/resource exhaustion; a full deployed user-initiated cancellation across the browser and service; broader responsive/multi-card stress checks. Existing fixtures or runtime probes must not be presented as those missing checks.
- **Historical failures:** initial publication HTTP 500, malformed model review, initial Slash-dialog timeout, and the ENOSPC interruption remain documented. Publication concurrency and recovery were corrected; their success does not retrospectively prove the exact initial HTTP 500 cause. The zero-byte ENOSPC receipt was preserved and [reconstruction](reconstructed-featured-failure.json) is explicitly labelled.
- **Environment:** disk pressure required sparse checkout of clean duplicate assets and restoring exact test inputs. Two failed unit attempts from missing fixture assets and one local bundle-write failure are environment failures, not passes. The final gate passed after the inputs were restored; assertions were unchanged.

See [scope](../cad-scope.md), [remaining acceptance matrix](../cad-final-gaps.md), [architecture](../cad.md), [executor](../cad-executor.md) and [verification history](../cad-verification.md). Pinned Study, legacy `.doc`, production converter hosting and all production actions remain outside this pass.
