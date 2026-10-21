# Blender-generated lesson scenes

The regular dev Learn Agent can create an interactive 3D asset without a starting GLB URL. `generate_3d_animation` accepts validated scene JSON, sends it to a private Blender worker, stores the exported GLB, then replaces a canvas placeholder with the existing `three-d-viewer`.

This is the agreed GLB-first increment. MP4 rendering, arbitrary Blender scripts, a Blender editor, physics simulation, meshes supplied by the model, and additional primitive families are not included.

## Contract

The shared schema is [scene-schema.json](../../packages/lesson-renderer/scene-schema.json). It is enforced in the control plane and again in the Python worker. [example-scene.json](../../packages/lesson-renderer/example-scene.json) is an illustrative test scene, not a hardcoded lesson or special compiler path.

- Primitive types: unit cube, sphere of radius 0.5, arrow with local start/end, coordinate frame, camera frustum.
- Transforms: local position, XYZ Euler rotation in degrees, scale; optional parent IDs. Unique IDs and acyclic parent relationships are required.
- Coordinates: metres, Y-up, frustum forward along local -Z. Vertical FOV is in degrees. The compiler converts through Blender's Z-up frame and exports standard Y-up GLB.
- Animation: translate, rotate or scale between explicit vectors over a bounded time interval. One animation per object/transform channel; interpolation is linear. Object tracks are combined into a playable lesson clip.
- Limits: 24 objects, eight animations, 1–10 seconds (default three), fixed 24 fps, fixed low-polygon primitive tessellation, one compilation at a time, 90-second subprocess timeout, 20 MB exported asset cap.

## Architecture

`Learn Agent JSON → authenticated dev API → durable queued job → private Fly worker → trusted bpy compiler → GLB → private R2 asset → tldraw 3D viewer`.

The worker lives in `packages/lesson-renderer`, with a dev-only Fly configuration. It uses Blender 3.4.1 from Debian Bookworm, system Python and NumPy. The renderer process runs as an unprivileged user with factory settings, automatic script execution disabled, a fixed compiler path and a clean environment without the service token. Scene JSON cannot select paths, execute commands, load add-ons or fetch external assets. Blender needs no third-party API key; the service-to-service token stays in server secrets.

The Fly machine has one shared CPU, 2 GB RAM and auto-start/stop. It is separate from user apps. Worker job files are temporary; Cloudflare Durable Objects retain job and placement state. Successful GLBs are copied into the existing R2 bucket under `learn-scene-dev/` and served only after app/workspace authentication, scoped to the requesting learner. Browser requests include credentials only for Small's same-origin scene asset endpoint; external model downloads still omit credentials.

Cost (owner 5A decision C, 2026-10-21): the platform pays for rendering on our own scene and Manim workers. Each queued render is recorded once as platform-funded usage, attributed to the learner (feature `render`, charge class `free`, cost unknown, never 0), and is kept out of the learner's monthly AI allowance. The model call that writes the scene source (`/3d`, `/animate`, board or Tutor) is still admitted against that allowance before any spending, so an exhausted allowance stops it with zero provider and zero renderer calls. Rendering is bounded by the existing job limits:

- runtime: 90-second compile, 15-minute queue wait;
- concurrency: one active job per canvas, one compile per worker machine (busy answers 429), and a fixed Fly machine pool;
- retries: deterministic keys, and an explicit retry only;
- compute budget: the fixed renderer pool. Production `rabbit-hole-lesson-renderer-prod` is one shared-cpu-1x 2 GB machine with autostop and autostart, min 0 (verified 2026-10-21). Autostart never creates machines, so the worst case is that one machine running all month.

Render fairness (owner, 2026-10-21; `learn-render-admission.js`): before a render is queued it takes a render slot of the signed-in learner, counted across all of their canvases and workspaces, on the `render` rows above (no new table). Admission is one D1 transaction, so concurrent submissions from several canvases cannot overshoot. Each renderer (scene worker, Manim) has its own limits, all server vars with defaults in code:

| Var | Default | Limit |
|---|---|---|
| `RENDER_LEARNER_ACTIVE` | 1 | queued or rendering jobs per learner, all canvases: each learner waits with one job, so no learner can fill the queue |
| `RENDER_QUEUE_MAX` | 8 | queued or rendering jobs across all learners (the worker holds 10 and compiles one at a time for at most 90 s, so 8 finish inside the 15-minute wait) |
| `RENDER_LEARNER_DAY` | 30 | renders a learner starts in a rolling 24 hours (request limit) |
| `RENDER_PLATFORM_DAY` | 400 | renders all learners start in a rolling 24 hours (compute limit: at most 400 times the per-render cap) |

A malformed value reads as the default, never as unlimited; 0 stops new renders. A duplicate submission, and a scene already rendered on that canvas, take no slot. The slot is given back when the job is ready, fails, or times out; a job that loses its renderer (a restart) is resubmitted under its key and keeps its slot; a running slot older than the queue wait (a lost Durable Object or a failed release) no longer counts. A refused render answers 429 (503 when the limits cannot be read: no learner or no store, fail closed) with code `render_limited`, a reason (`learner_active`, `queue_full`, `learner_day`, `platform_day`, `unavailable`), a sentence saying why and when to retry, and `Retry-After`. Tests: `learn-allowance.test.js`, "render fairness", "render slots", "render limits".

States are queued, rendering, ready and failed. A busy worker leaves the job queued. A restarted worker can repeat deterministic transient work using its existing job key. Definitive failures require an explicit retry; retries receive a new attempt key. End-to-end queue wait is capped at 15 minutes.

Cache keys include the scene specification with canonical object keys, duration, output type, Blender version, and a fingerprint of the compiler/validation/schema files. Display IDs, concept text and captions do not invalidate geometry assets. Existing ready jobs are reused. Retry, placeholder and placement behavior share the existing generated-video canvas controller; video requests remain unchanged.

Camera, animation state, dimensions and placement are saved with the generated scene. Generated viewers use that server placement store rather than also restoring through the browser-only graph store. Metadata retains concept, purpose, source scene specification and output type; the tutor's 3D context includes those fields.

## Verification — 2026-09-17

- [x] Shared scene validation, limits, no executable fields, hierarchy and animation checks.
- [x] Asynchronous durable jobs, cache reuse, explicit retry and authorization tests.
- [x] Real headless Blender export from generic scene JSON.
- [x] Exported world coordinates and animation verified by loading the GLB with Three.js.
- [x] Authenticated upload/download and automatic canvas placement.
- [x] Orbit, zoom, pan, play/pause, move, resize and reload through the dev UI.
- [x] Real Learn Agent-generated scene, approved by its evaluator and rendered successfully.
- [x] Existing generated-video placeholder/retry/playback/reload regression test.

60 focused JavaScript tests and four Python validator tests passed. The geometric test exported a 64,344-byte GLB; the cube's world position matched `(0, 0, -3)` within floating-point tolerance, and the ray's animated world rotation changed as specified. Blender's export includes the frame-boundary offset in its clip duration (about 2.04 seconds for the two-second test interval).

Browser evidence: `.small/learn-scene-check.json`, `.small/learn-scene.png`. Real agent evidence: `.small/learn-scene-real.json`, `.small/learn-scene-real.png`; the generated plan passed review on its first pass. Compiler evidence: `.small/scene-worker-check.json`, `.small/scene-export-check.json`. Existing-video regression used fixtures, with no paid video generation.

Testing found a Python/NumPy mismatch in the initial container. Using Debian's Python and NumPy with its Blender package fixed the GLB exporter. No changes were deployed to live Cloudflare or private Amazon BYOC.

Regular dev version: `79f67b60-5321-4536-a778-43775e001437`.

Try in Learn: **“Explain perspective projection with a new interactive 3D scene: a camera frustum, a cube and an animated ray.”** Then click **Explain on canvas**, wait for the scene, and use **Interact** or **Play animation**. (That button was removed from Learn chat answers on 2026-09-29; this walkthrough no longer runs as written.)

References: [Blender glTF export API](https://docs.blender.org/api/main/bpy.ops.export_scene.html), [Fly deployment](https://fly.io/docs/flyctl/deploy/), [existing 3D viewer](learn-three-d.md), [generated video lifecycle](learn-video.md).
