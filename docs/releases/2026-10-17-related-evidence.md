# Related release evidence, reconciled October 17, 2026

This sanitized companion to the [final receipt](2026-10-17-card-scroll.md) preserves original candidate attribution. Historical lane completion preceded the final production release; old statements that production migration/deployment remained pending are superseded only by the final receipt.

## UI / TOC

Final UI candidate `4f6b97f965555a348ca05e6e65404bca5199d881` is included in released `abd5f840`. Original TOC request-capture evidence: **10 passed / 0 failed / 0 skipped / 0 interrupted**, tested on the dirty TOC candidate subsequently committed as `bf14657a`, before the Release C merge. It verifies message, goal/outline/revision, Tutor mode, its own restored conversation, no inherited canvas/paper/wiki/video/image or Chat-selected file state, and preserved intentional repository identity. Canned responses prove request wiring only.

Integrated TOC also passed **10/10** on `47001585` with only the two documented Context-navigation harness changes. It remains fixture evidence, not real-model verification. Visual review at `955d946a` covered 16 screenshots including TOC, dark/narrow/phone layouts; [visual board](https://www.figma.com/design/ef9SfiemEsPQF2bd8B1os3?node-id=310-222). Later menu changes are not relabelled as a rerun of those screenshots.

## File imports / dev converter

Final Imports candidate `acdac56bb98479a48aa2c00f7381b5ff383719c0`: [release gate](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39009611285) passed all 45 stages on first attempts; [preview](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39010289978) passed. Detailed accepted scope remains in [canvas-file-imports](../features/canvas-file-imports.md).

- Runtime `4b599d844eabdcd2d50e9a9affed61e47bc6a325`, dev deployment `f3e0f0f2-2b3e-4a93-9d92-2e5f9bba9e1e`: STEP, original short-FLAC AAC fallback and PPTX each **1/1** actual converter UI scenarios passed, including visible renderer, original checksum and fresh-context reload. No page errors; model endpoints guarded/next-steps fixture. These are dev results, not production conversion proof.
- Same runtime/deployment: recovery demo 1 **6 passed / 0 failed / 0 skipped / 0 interrupted** (browser closure, persisted job/card); recovery demo 2 **7 passed / 0 failed / 0 skipped / 0 interrupted** (authorized dev converter interruption, expired 90-second lease, attempt 2, 42 derivatives, byte/hash/header validation). Dev service was restored healthy. Protocol evidence remains distinct from visible renderer acceptance.
- `47001585` plus two Context-navigation harness changes: six-family Context **46/46**, bundle owner **16/16**, bundle fork **17/17**, local failed-job Retry **1/1** passed. No duplicate source upload; reload asserted. Retry proves same-job recovery from an actual unconfigured local converter failure, not successful conversion.
- Full picker at `47001585`: **76 passed / 0 failed / 0 skipped / 0 interrupted**. Original full drop at `a5c58a80`: **227 passed / 1 failed / 0 skipped / 0 interrupted**, malformed-PDF filename missing. Narrow fix committed `53778d78` has fresh valid/malformed PDF **5/5** proof tested with the exact patch before commit. Reused drop cases plus focused fix are a cross-SHA composite, never one all-green final run.
- Representative nine-format mixed-board dev acceptance at `6dad45b2`, deployment `ad2d634d-9904-4429-8dc5-5b85174edaf2`: nine persisted cards and reload, CAD/mesh/splat ready, no page errors; not a reproduction of historical crash conditions or a GPU-memory measurement.

## Multimedia diagnosis: still open

Historical mixed-media logs reported `Target crashed` (four of five runs in the original report). A 105/105 run used three-second WAV playback/seek and does not establish FLAC or crash recovery.

Preserved original FLAC: 1,230 bytes, SHA256 `62fe28f2df8cd6705f15244d5bb3e9223fb218947429223328d875ddc5c3df10`, 8 kHz mono, 0.25 seconds, 2,000 samples. FFmpeg decoded it successfully; existing libsndfile re-encoded it byte-identically. Bare audio, single card and 25-card diagnostics on Chrome 155.0.8059.82 reached canplay then MediaError 2/failed seek, without a renderer crash. Real HTTP and blob controls on Chrome and Edge 155.0.4283.45 reproduced `FFmpegDemuxer: demuxer seek failed`; verified range responses remove mocked transport as a necessary cause.

Longer 8 kHz and short/long 44.1 kHz controls passed six HTTP/blob comparisons without errors/crashes. Single-packet structure correlates with the failure; causality is unproven. Actual application AAC fallback on the exact original fixture passed at `4b599d84`. **No fix or verified resolution of the historical renderer crashes is claimed.** Preserve the original fixture and failing logs for the next focused investigation; do not replace them with the passing WAV/long-FLAC cases.

## Search / local card checks

[Search gate](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39019459638): `e9e9a2fcbd1e0f25b5da97e55f95b5bc8e27cf8c`, 45 stages passed; Windows upload 41/41, no retried parts. Final release independently repeats Windows upload as recorded in the final receipt.

Local card integration evidence retains original identities: canvas editing **229/229** at `d668d960`; Search **22/22** and viewers **9/9** at `72fa8119`; inline editing **231/231** at `95d3724a`; fork **26/26** and clipping **14/14** at `e083c7b7` (runtime `b2bb58c0`, before preview/menu-only fixes). These results are not exact-abd5 executions. Earlier setup/transport failures remain historical failures, not inferred flakes. No model-quality claim follows from these guarded/fixture checks.
