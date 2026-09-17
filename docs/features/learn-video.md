# Generated lesson videos (regular dev)

Approved scope: a provider-neutral `generate_video` operation for concepts that benefit from motion. The existing Learn canvas and chat remain the interface. Live and private AWS installations are outside this change.

## Design

- Lesson blocks can contain `kind: "video"` with `operation: {op: "generate_video", id, prompt, purpose, duration?, aspectRatio?, style?, referenceImages?, caption?}`. The schema contains no provider parameters. Video prompts describe public concepts; equations, code, precise graphs and technical diagrams use structured primitives.
- The first backend adapter is fal Seedance Lite, selected by dev configuration. Its queue adapter implements submit/poll; a pending ticket is persisted across requests. This is the asynchronous form of the provider interface: the worker never waits for an entire clip in a lesson request.
- A dev-only Durable Object per authenticated learner/workspace/app serializes submission and stores job state and lesson placements. Background alarms poll existing tickets even after the browser closes. Finished MP4 bytes go into the existing R2 binding under `learn-video-dev/`, served through app-authorized requests including byte ranges.
- The content cache covers normalized prompt, purpose, duration, aspect ratio, style, ordered reference URLs and adapter/model/resolution version. Caption and object ID do not cause a new generation. Cache is scoped to the learner/app to avoid sharing private material. An uncertain submission never automatically retries a potentially charged POST.
- A movable, resizable placeholder appears immediately. Other explanation blocks continue writing. Ready clips use the native tldraw video shape with autoplay disabled; double-click enters its playback controls. Failed generations offer an explicit retry. Saved video placement restores on reload; ordinary unsaved canvas drawings retain their existing behavior.
- This preview permits one active video per learner/app, one video per explanation and up to 100 cached jobs. Duration defaults to 2 seconds, with 480p backend resolution. No automatic paid retries. Generation does not establish scientific accuracy; captions identify clips as generated illustrations.

## Tasks and verification

- [x] Generic operation validation and content cache key.
- [x] First provider adapter and durable background generation.
- [x] Protected stored video assets and saved placements.
- [x] Canvas placeholder, native playback, explicit retry, lesson-agent guidance.
- [x] Review and focused tests including duplicate requests, failure, access and reload.
- [x] Deploy regular dev and verify actual UI.
- [x] Generate at most one real 2-second, 480p clip; reuse it for subsequent checks.

## Results (2026-09-17)

Regular dev deployment `1c11b6ae-d640-4edb-b3b4-c2d05d894f8d`. 49 focused tests passed. The actual browser flow verified the placeholder, explicit retry after a simulated failure, continued text rendering, native playback controls, movement, resize and reload. The zero-cost fixture test is recorded in `.small/learn-video-mock.json`.

One real Seedance request completed: `01a0ae40-ace4-73e0-bed2-2303be2d2a07`, requested 2 seconds at 480p. The playable file is 2.041667 seconds (encoded frame duration). The browser played, paused, then reloaded the stored asset without submitting again. Evidence: `.small/learn-video-real.json` and `.small/learn-video-real.png`.

The first integration attempt failed before contacting fal: Worker fetch rejects a method-bound global receiver and `redirect: "error"`. A local workerd probe reproduced both errors, and fal history contained no request. The adapter now uses an unbound transport and manual redirects with status checking. The existing model-produced operation was reused for the successful test, avoiding further model calls. The failed test placeholder was hidden; its failure record remains for diagnosis.

References: [fal Seedance Lite input schema](https://fal.ai/docs/model-api-reference/video-generation-api/bytedance-seedance-v1-lite), [fal asynchronous queue](https://fal.ai/docs/documentation/model-apis/inference/queue), [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [tldraw video shapes](https://tldraw.dev/reference/tlschema/TLVideoShape).
