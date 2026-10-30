# Rabbit Hole /animation — MVP-first implementation and completion plan

> **For Parallel and agentic workers:** execute this plan task by task using the repository's established parallel-worker workflow (or `superpowers:subagent-driven-development` / `superpowers:executing-plans` when available). Checkboxes are implementation work, not evidence of completion. Read current `CLAUDE.md` and `AGENTS.md` first.

**Goal:** let a user or Tutor propose a useful 3D experience, review it before generation, and create a durable canvas card that can be watched, explored, manipulated or played.

**Architecture:** reuse Rabbit Hole's routing, proposal, job, storage, model, sandbox and viewer foundations. Add a separate versioned 3D scene contract and trusted Three.js renderer adapter. Generated behavior runs in bounded QuickJS; it never receives application, DOM, WebGL, network or unrestricted Three.js access. Add optional trusted Rapier physics after MVP approval.

**Tech stack:** existing React/Vite/JavaScript, Zod, Three.js, QuickJS/WASM workers, Cloudflare Workers/Durable Objects/D1/R2 and existing model transport; existing Node tests and approved CI browser checks. No new backend service or external 3D-generation provider.

**Spec:** sections 1–8 of this document are the product/technical specification; sections 9–16 are the execution and acceptance plan. Keep them together in the repository at `docs/superpowers/plans/2026-10-30-animation.md`.

**Baseline:** source inspected on 30 October 2026 at `a3376817f003a9c41824fc5b76b644778bc9c6e3` in `Rabbit-Hole-App/Rabbit-Hole`. This is a source inventory, not a completed implementation or production receipt. Fetch main and relevant active branches again at kickoff; record full SHAs and reconcile intervening work.

## 1. Owner decisions and the approval boundary

1. This document covers **all tasks through full feature completion**. Build **MVP first**.
2. Push and deploy the MVP to an isolated dev preview for owner feedback. **Do not implement the post-MVP tasks until the owner explicitly approves continuing.** A commit, green check, elapsed time, silence or previous release GO is not that approval.
3. While MVP approval is pending, finish MVP verification, fix MVP defects, improve recovery and keep its evidence current. Do not start later feature development, disguised as preparation. If all authorized MVP work is complete, report the approval boundary and wait; do not manufacture activity.
4. Before this boundary, proceed without repeated permission requests for routine implementation, tests, coherent branch pushes and authorized isolated dev deployment. Work does not wait for this reviewer's feedback.
5. **No Meshy for now.** No other text/image-to-mesh provider, generative asset service, rigging service or new paid provider is included in any phase of this plan.
6. The LLM/JEV recommends the most effective experience for the user's goal and available capabilities. It does not choose solely from a keyword or mechanically obey the requested presentation when another supported format would explain it better. Show its recommendation and reason; respect the user's explicit changes.
7. Do not hardcode the feature to CAD, torque, pendulums, planets or the examples below. Build reusable geometry, behavior, controls and evidence contracts. Examples are tests, not topic-specific product branches.
8. Do not overpolish. Ship functional slices early. Cosmetic refinements, elaborate materials and marketing examples never delay a usable preview.
9. New paid testing allowance, production promotion, infrastructure and shared migrations are **not automatically authorized by this planning document**. Reuse actual authorization already recorded for the relevant operation; do not transfer Explain-back's $10 or Motion's budget. Log a genuinely missing authorization and continue independent work.
10. MVP approval permits the remaining feature implementation; it is not automatically a production GO. Follow the existing release procedure. When a production GO is later supplied, honor the repo's deployment/activation/verification scope without asking for the same routine GO again.

### Product boundaries

| Capability | Purpose |
|---|---|
| `/animation` | A live 3D scene, loop, experiment, small game, assembly or walkthrough |
| `/explain` | Existing explanation and 2D scene/program workflow; preserve it |
| `/cad` | Dimensioned CAD generation/editing and manufacturing exports; preserve it |
| `/motion` | Rendered video; preserve it |
| Tutor | Can recommend an Animation material and discuss its activity evidence; does not bypass its generation review |

The old image-to-CAD/assembly document is background for existing asset and assembly semantics. This plan supersedes its CAD-only routing and scope **for `/animation`**. Image-to-CAD reconstruction, dimension rebuilds, STEP/STL/3MF export and manufacturing validation are a separate project.

## 2. Scope: the MVP and the completed feature

| Capability | MVP before approval | After MVP approval, required for full completion |
|---|---|---|
| Entry and proposal | `/animation`, JEV route, editable proposal with explanation and capabilities | Tutor entry, selected-context refinements and component scope |
| Scene creation | Procedural primitives, groups, curves/lines/arrows and labels; original generated logic | Richer curves, tubes, lathe/extrusion, bounded instancing and reference-image interpretation |
| View/watch | Inspect/orbit; play, pause, restart, loop; supported speed control | Additional camera presets and compatible imported animation clips |
| Experiment | Sliders/numbers/toggles/selects/actions; computed readouts | Direct object manipulation and richer interactions |
| Mini-game | A small bounded single-player challenge with objective, action, hint, outcome and reset | Pointer placement/drag tasks, keyboard movement where useful, Tutor evidence integration |
| Existing assets | Contract reserves immutable source references; no fake CAD replacement | Authorized attached models/CAD GLBs, multiple instances and source provenance |
| Assemblies | No assembly implementation required for MVP | Prescribed connected-part movement, scoped selection/editing, explicit joints and limits |
| Walkthrough | Not advertised as available | Focused WASD/right-drag camera, touch equivalents, bounded navigation |
| Physics | Analytical formulas and prescribed animation only; no physics-engine claim | Lazy Rapier rigid bodies, collision, supported joints, forces and bounded worlds |
| Save/reload/revision | Save accepted artifact, inputs, state and paused time; reset/retry; no late-response overwrite | Asset-aware revisions, sharing/fork permissions, safe physics restore policy |
| Reliability | Sandbox limits, bounded rendering, focus isolation, cancellation, last-good-state recovery | Multi-card lifecycle, imported-asset recovery, physics exhaustion/context-loss checks |

**MVP is a vertical product slice, not a UI-only mock.** It must generate and persist an original procedural scene from a real request, after proposal confirmation, and demonstrate a watch experience, an adjustable experiment and a simple game. Fixtures enable parallel development, but fixtures alone do not establish real-generation acceptance.

**Full completion means all required post-MVP tasks and their acceptance checks pass.** Do not mark the feature complete because those controls are hidden. Unsupported future capabilities may be absent; required planned capabilities remain open.

Not in this plan: multiplayer, game marketplace, general game engine/editor, arbitrary imported scripts/shaders, cinematic character animation/rigging, photoreal reconstruction, CFD/fluids/soft-body science simulation, unlimited terrain, video export, manufacturing CAD edits or new billing products.

## 3. User flow and proposal schema

1. User types `/animation` with a goal and optional explicit source chips. Bare command uses the existing command help/clarification behavior, not a paid blank generation.
2. An explicit `/animation` selects the capability directly; ordinary-language routing uses existing JEV. The semantic planner then decides what would help: inspect, watch, experiment, game, assembly or walkthrough; behavior may be prescribed, analytical, rule-based or physics. Avoid an unnecessary routing call for an explicit command.
3. Show one active generation proposal in the existing review area above the composer. Preserve the original request and chips. Missing indispensable information uses that area's existing clarification flow.
4. User edits the recommendation through shared settings or conversational Edit. No generation occurs on hover, edit, reload, selection or merely showing the proposal.
5. Generate confirms the latest saved version, sources, cost disclosure and capabilities. Repeated clicks/retries resolve to one job and one result card.
6. Display pending/progress/error in that result card. Keep completed good revisions during a failed refinement.
7. Ready card exposes only controls meaningful for the proposed experience. Users may watch without entering interaction. Explicit interaction captures scene controls; Escape exits to the canvas.
8. Edit/revise uses the same reviewed generation path. Keep the current usable scene until its replacement validates and is accepted. Tutor discussion belongs in the existing right-side conversation panel.

### Required proposal content

| Field | Requirement |
|---|---|
| Title and scene description | What will appear, with identifiable objects and intended outcome |
| Recommended experience + reason | One supported primary experience; concise reason connected to the user's goal |
| Interactions | What can be changed, selected, moved or attempted; passive is valid |
| Control profile | Inspect, manipulate or walk; mouse/touch/keyboard legend generated from supported profiles |
| Behavior | Prescribed, analytical, rule-based or rigid-body physics; name meaningful simplifications |
| Assets/references | Procedural elements and exact attached source revisions; explicitly state unavailable inputs |
| Parameters | Labels, type, range/step/options, units, defaults and intended effects |
| Learning/game goal | Optional; challenge success is not automatically demonstrated understanding |
| Limitations/assumptions | For example idealized beam or approximate image interpretation; avoid long generic disclaimers |
| Duration/loop | Relevant to watch output; no forced video-duration/aspect-ratio settings for every live scene |
| Usage | Existing server-derived credit estimate/maximum/hold when applicable; never invent zero cost or dollars |

Use `GenerationProposalCard.jsx` and `generation-confirmation-schema.js`. Do not create a competing confirmation widget. Only expose ready capability values in MVP. A user-requested unsupported capability produces an honest limitation or proposed supported alternative before spending; no silent downgrade.

### Planner contract (new, proposed)

`AnimationPlan` has `schema: 'animation-plan/1'`, `title`, `description`, `experience`, `reason`, `behavior`, `controlProfile`, `sourceRefs`, `parameters`, `interactions`, `assumptions`, `limitations`, optional `learningGoal`, and `requiredCapabilities`.

- `experience`: `inspect | watch | experiment | game | assembly | walkthrough`.
- `behavior`: `prescribed | analytical | rules | physics`.
- `controlProfile`: `inspect | manipulate | walk`.
- Proposal envelope, actor binding, revision/hash, expiry and consumption belong to the existing proposal service; do not invent a second signature scheme.
- Runtime capability registry is versioned and server authoritative. Planner output must be checked against the currently enabled phase, including cross-field combinations. `physics` is not permitted merely because the schema enum exists.
- A change to sources, parameters, format or capabilities invalidates the prior approval and estimate. No user change is overwritten by a delayed planner response.

## 4. Card UI/UX and controls

Reference: `rabbit-hole-animation-card-ui.html`, updated with six visible preview selectors:
https://chatgpt.com/library?file_id=libfile_491ec88af2dc8191a792dfdbf9d2728b&account_id=personal

Parallel may not be able to open the owner's Library. The written specification below is sufficient to start. If the HTML is supplied, copy it to `docs/features/animation/reference-ui.html`. Do not wait idle for it. The HTML is a UI reference with locally drawn illustrative scenes, not production Three.js, generation, persistence or assessment code. Its six top buttons are **demo navigation**, not six buttons to copy onto every production card. Proposal is a workflow stage, not a sixth output engine.

### Shared card shell

- Header: **Animation**, title, concise experience badge, existing drag/selection affordances and existing prompt disclosure behavior. Use product components, typography and themes.
- Main scene: real Three.js canvas, readable labels and optional compact readouts. Keep a useful working viewport; do not apply the text-card natural-height clamp to this interactive surface. Resizing preserves state/camera and connector bounds.
- Toolbar: only relevant play/pause/restart/speed/camera controls; accessible names for icons; no cosmetic disabled buttons pretending unfinished actions work.
- Local parameter/action area below the viewport. Compact parameter rows, clear units, keyboard-accessible number alternatives to sliders. Do not add an empty parameter panel to a passive scene.
- Footer: Edit, Ask Tutor/context action, source access where applicable; reset and interaction entry where needed. Keep prompt text distinct from title/scene explanation.
- Pending, stopped, failed, saved-ready and recovery states use existing product patterns. Retry is targeted; never reload the whole page and discard unrelated edits.
- Controls and labels fit narrow card widths and light/dark themes. Required interactions work without hover. Any added right panel uses the existing resizable panel component.
- Include a concise accessible scene description and text readouts. If WebGL is unavailable, retain the poster/description and an honest unavailable-interaction state; do not show a blank successful card.

### Variants

| Variant | Necessary UI | What must actually work |
|---|---|---|
| Inspect | Object title/labels; camera reset; optional selection details | Orbit/zoom and readable labels; no pointless Play button |
| Loop/watch | Play/pause, restart; speed when supported | Continuous loop without resetting inputs; pause preserves the visible moment |
| Experiment | Parameters, units, readouts; reset | Changes affect both geometry and numbers through the same state/model |
| Mini-game | Goal, actionable controls, Check/Submit when meaningful, hint, attempts/outcome, reset | Rules derive from actual state; reset restores seed and declared starting conditions |
| Assembly | Source parts/instances, select/highlight, joint/driver controls, reset; explode only if declared | Actual attached geometry, constrained component motion and meaningful part identity |
| Walkthrough | Enter interaction, control legend, reset view; touch controls | Focused movement/look; Escape releases; no movement while typing elsewhere |

### Stable control profiles

| Action | Inspect/manipulate | Walk/play |
|---|---|---|
| Left click | Select a declared selectable object | Declared action/select; do not invent a different binding per scene |
| Left drag | Draggable object: constrained manipulation; otherwise orbit | Action only when declared; movement uses keys/touch |
| Right drag | Pan camera | Look around |
| Wheel / pinch | Zoom within scene bounds | Adjust view only if declared; otherwise do not steal page scrolling |
| WASD / arrows | Not required; object manipulation has numeric/button alternatives | Move only while scene interaction owns focus |
| Escape | Release pointer/keys, exit scene interaction | Same; never trap keyboard or pointer lock |
| Touch | Tap select; one-finger declared drag/orbit; two-finger camera gesture | Visible movement pad + drag-to-look, no right-click dependency |

Resolve hit testing once: active object drag wins over camera orbit and outer canvas pan; empty-space orbit wins only when inner interaction is active. Context menu suppression is local to the active scene and right-drag gesture. No global keyboard listeners that consume text-entry keystrokes. Release held keys on blur, tab hide, unmount, interaction exit and modal opening. Only one card owns inner interaction at a time.

Timeline scrubbing is offered only for a seekable prescribed/analytical scene. Rule-based or physics state is not generally seekable. Do not fake rewinding; provide restart and explicit state reset.

## 5. Scene, behavior and persistence architecture

### Naming and compatibility

Existing persisted `animation` is `/explain`'s 2D scene/program. **Do not repurpose it.** Use new internal block/primitive discriminator `animation3d` and schema `animation-scene/1`; public command remains `/animation`. Reconcile the exact primitive registry naming at kickoff and record any necessary alternate internal name before workers diverge. Preserve legacy `animation`, `/3d`, removed `/animate` semantics and old saved documents.

The current sandbox host also checks an exact artifact/SDK/renderer/policy tuple. Give the new path distinct identifiers (proposed `animation_program`, schema `1`, `animation-sdk-1`, `animation-renderer-1`, `animation-policy-1`) and verify their hash/policy stamps at admission. Do not widen `explain_program` schema 1/2 or silently reinterpret `renderer-1`. Reuse audited low-level runtime/worker mechanisms through a separate validated adapter. Existing signatures worth starting from are `runProgram(engine,{source,request,operation},limits)` and `createProgramHost({artifact,limits,createWorker})`; the latter's current artifact admission must not be bypassed.

### Shared interfaces to freeze in AN-01

These are proposed new interfaces, not claims that the repo already exports them:

| Module | Interface and ownership |
|---|---|
| `packages/web/src/animation3d/contract.js` | `validateAnimationPlan(value, capabilities)`; `validateAnimationArtifact(value, capabilities)`; `validateAnimationFrame(value, artifact)` → validated value or structured issues. Pure modules must remain importable by server tests. |
| `packages/web/src/animation3d/capabilities.js` | `ANIMATION_CAPABILITIES` version/phase, supported geometry/events/controls/behavior and limits. Server chooses enabled phase; browser cannot enable it. |
| `packages/web/src/animation3d/runtime.js` | `createAnimationRuntime({artifact, workerFactory, onFrame, onError})` → `ready: Promise`, `dispatch(event): Promise<accepted-or-rejected>`, `play()`, `pause()`, `reset(): Promise`, `seek(time): Promise`, `setSpeed(speed)`, `snapshot()`, `dispose()`. Seek/speed reject unsupported behavior capabilities; no silent emulation. Reuse audited QuickJS core; add typed adapter. |
| `packages/web/src/animation3d/renderer.js` | `createAnimationRenderer({container, assetResolver, onSelect, onGesture, onCameraChange})` → async `load(artifact,{signal,generation})`, `applyFrame(frame)`, `setCamera(camera)`, `getCamera()`, `capturePoster()`, `dispose()`. Load resolves ready or a structured error; abort/dispose/generation change discards and frees late objects. Uses shared Three.js lifecycle/slots. |
| `packages/web/src/animation3d/state.js` | Snapshot validation and `commitAnimationStep(previous, candidate, stamp)`; reject stale/invalid results before changing inputs, state, frame or durable data. |
| `packages/control-plane/src/animation-job.js` | Same durable job/status/cancellation semantics as `/explain`, with animation-specific policies and artifacts; route adapters conform to existing job API. |
| `packages/web/src/animation3d/physics.js` (post-MVP) | `createPhysicsWorld(config)` → `step(dt, commands)`, `reset()`, `dispose()`; fixed trusted instruction vocabulary, no generated host code. |

**Artifact:** `schema`, immutable artifact/revision ID, approved plan hash, capability version, source revision refs, `scene` (stable node/material/geometry IDs and hierarchy), `parameters`, `controls`, `behavior`, optional QuickJS `program`, initial state/seed, camera, assumptions and provenance. Persist a small card reference/state envelope; store large source/scene payloads through the existing artifact store rather than copying source into every canvas save.

**Frame:** allowlisted object transforms/visibility/material scalar updates, bounded labels/readouts, current selection and optional goal status. All IDs must belong to the artifact; all numbers finite; quaternions normalized and scales bounded/positive. No HTML, URLs, arbitrary properties, class names, shader source or JS callbacks. Initial geometry is validated once and compiled by trusted code; a frame cannot allocate unbounded meshes/textures.

**Behavior program:** preserve existing QuickJS isolation, fresh-context and deterministic seed behavior. Supply a 3D-specific SDK/data adapter; no Three.js imports in generated source. Expose pure initial-state/evaluate/reduce operations following existing runtime conventions. Add a bounded fixed-step event for time-dependent rules only where needed; analytic scenes can evaluate at time without mutating state. `evaluate` never secretly advances saved state.

**Event:** versioned discriminated union: parameter/action/select; object drag start/move/end; optional bounded `step` for an approved MVP rule-based scene; and post-MVP normalized movement/physics intent. Prefer event-driven games for MVP. Validate values, object IDs and ranges at the boundary. Camera orbit is presentation state; do not call the model or reducer for every camera pixel. Coalesce drag/movement input snapshots, serialize state transitions and use monotonic event/revision stamps. Do not flood the current 16-entry reducer queue with raw pointer/key events.

For stepped non-physics rules, the host owns a fixed `dt = 1/30 s` and monotonic tick index; simulated time is tick × dt. Process at most two sequential steps per displayed frame; do not coalesce/drop simulation steps and thereby change results. On sustained overload pause with an actionable message, preserving the last accepted step; do not catch up indefinitely. Seek/speed are capability-declared (initially prescribed/analytical only). Looping maps presentation time into the declared duration; it does not silently reset game progress.

### Proposed feature limits

These are implementation defaults chosen for this plan, not measured performance promises. Lower them if a representative supported device fails the acceptance target; record why. Do not increase existing global limits casually.

- Retain existing QuickJS limits: 16 KiB generated source, 256 KiB output, 32 KiB state, 50 ms generated operation, 250 ms worker watchdog, 16 MiB heap/32 MiB WASM/256 KiB stack, maximum 2 live program workers.
- Retain shared viewer policy: maximum 3 live WebGL viewers, one active inner interaction. Offscreen cards retain posters and persisted state; they do not retain unnecessary GPU resources or physics ticking.
- Animation-specific default: 256 authored logical nodes (wrappers/groups included), 100,000 procedural triangles after expansion, 8 exposed parameters, 8 actions, 24 labels/readouts, 8 attached sources and 16 instantiated source roots. Imported descendants additionally count against a scene-wide 5,000-node ceiling; 256 is not permission to hide unlimited descendants under one imported root.
- Full-scene imported+procedural aggregate ceilings: 1,000,000 rendered triangles, 1,500,000 rendered vertices, 128 MiB decoded textures and 50 MiB unique stored source bytes. Per-file/source limits also apply; use the stricter constraint. Shared geometry/texture memory is counted once when actually shared, while rendered triangles/vertices count every visible instance. Recheck post-load decoded counts and abort/dispose if metadata underestimated them.
- Render scheduling target: one requested frame per animation tick, custom reducer steps capped at 30 Hz and coalesced; prefer lower-frequency event-driven reductions. No model requests inside the playback/interaction loop. Frame rate can be adaptive without changing the simulated clock or readout semantics.
- No default shadow maps, postprocessing, external texture fetch, imported shader code or high-cost reflections. Use built-in materials/lights and a restrained scene. Add complexity only for a demonstrated learning need within budget.
- Post-MVP physics: at most 16 dynamic bodies, 32 total colliders and 16 joints; fixed 1/60 s step, at most 4 catch-up steps per displayed frame. Clamp long elapsed intervals; pause on tab hide rather than simulating minutes of catch-up. One foreground physics world ticks at a time.

### State and recovery rules

- One atomic simulation snapshot contains artifact revision, inputs, program state, seed and paused time. Presentation has its own revision for camera and selected object; merge the newest presentation into the durable envelope independently. A worker reply must never replace a newer orbit/selection, and camera saves need no reducer evaluation. Scene Reset restores simulation defaults but preserves camera; Reset view changes only camera. Accepting a new artifact uses its camera preset unless its stable scene identity explicitly permits preserving the prior camera. Build on `/explain` state-stamp fixes, verifying relevant branch work before reuse.
- Normal parameter changes and reset take the same validation path as playback. A failing initial state, reset or late worker result cannot replace a good revision or newer user input.
- Save on meaningful settled changes with bounded debouncing and explicit flush on navigation; not on every render frame. Restore paused, with the same artifact and accepted state. Visible user edits win over delayed hydration.
- Generation/refinement job results bind to board, card, source set, artifact revision and request identity. Switching boards/chat or deleting a card prevents late results from appearing in the wrong destination.
- Cancellation stops further model stages and application of late results; release unused reservations using existing billing rules. Retry resumes/restarts the intended stage with bounded retries and preserved good artifacts, never a silent new charge loop.
- Physics restore initially persists controls, selected sources and seed; reload/restart returns the physical world to its approved starting conditions and clearly indicates restart. Reset physics-dependent game progress/readouts/time together, so an old success state is never attached to a new world. Do not claim exact mid-contact physics replay. Non-physics game progress remains restorable.
- Declare exactly one transform authority per moving node: analytical/program, prescribed driver, imported clip or physics. Reject conflicting bindings. In a physics scene, normalized input produces bounded behavior commands, the trusted world advances fixed steps, then authoritative transforms/readouts form a validated frame. Generated code cannot overwrite dynamic-body transforms after physics; it may issue only permitted forces/kinematic targets. Use one host-owned scene clock, not independent competing RAF clocks.

## 6. Assets and physics after MVP approval

### Procedural creation

Use trusted Three.js primitives/composites and geometry builders. MVP: box, sphere, cylinder, cone, plane, groups, bounded lines/curves/arrows and text labels. Post-MVP: tubes along curves, extruded 2D shapes, lathed profiles, bounded repeated instances and a tested parametric-surface builder. Apply triangle/segment caps before allocation. Support recognizable objects without forcing the author to build every object from cubes.

A user image may later inform a **simplified procedural interpretation** using the existing vision-capable model/input path. Keep actual-read provenance and disclose inferred/unknown dimensions. This is not exact image-to-mesh or CAD reconstruction. If the important shape cannot be represented, say so in the proposal instead of fabricating fidelity.

### Attached models and CAD

Reuse `model-import.js`, `model-storage.js`, `model-loaders.js`, `model-formats.js`, `three-d-asset.js` and existing source authorization. Do not create another upload service.

- Reference stored file/source IDs and immutable revisions, not expiring fetch URLs. Resolve authorization on the server for generation and on reopen/share/fork.
- Preserve true geometry, source names, declared units, transforms and materials. Unknown units are unknown; do not derive manufacturing dimensions from an image or bounding box. A visually scaled source must say so.
- Keep stable instance IDs when the same model is reused several times. Source node/part IDs, instance IDs and scene node IDs must be distinguishable.
- Do not imply a monolithic generated/imported mesh has independently movable components. Bind real source nodes/parts; where absent, ask for separable components or propose a whole-object movement.
- Existing self-contained GLB path has a 20 MiB file limit; imported model registry uses a separate 25 MiB entry limit and aggregate GPU limits. Respect the actual path's stricter applicable limits. Do not globally raise either to make an example pass.
- Existing import supports Meshopt but does not establish Draco/KTX2 decoding. Preserve honest unsupported-format messages; do not add codecs or network fetches incidentally.
- Multi-model assemblies use scoped loaders and checked references; external resources may only resolve through existing permitted local bundle rules. No arbitrary generated URLs.

### Prescribed assemblies

Define generic instances, local frames, axes, joint limits, drivers and couplings. MVP is not blocked by this work. Full release must support a small multi-part assembly with selection and constrained rotation/translation. A gear demonstration can use declared ratio coupling; it must not pretend tooth collision was physically simulated. Preserve local-to-world transforms and source units. Ctrl+K scoped edits identify the selected instance or whole scene, show the proposed change and create a revision; originals remain unchanged.

### Optional real physics

Add `@dimforge/rapier3d-compat` lazily behind `physics.js` only when an approved plan uses `behavior: physics`. There is **no Rapier dependency in the inspected repo lockfile**. At implementation time verify the current stable version/API from official Rapier documentation/npm metadata, pin the exact version and record it with the lockfile change. Do not reuse an old document's version assertion as current verification.

Implement box/sphere/capsule/cylinder colliders first; static triangle meshes only through validated supported paths. Explicit mass, friction, restitution, gravity, fixed/kinematic/dynamic bodies and supported fixed/revolute/prismatic joints are validated. Movement that is prescribed uses a kinematic driver; impulses/forces are distinct commands. Joint limits, collider budgets, invalid mass and runaway velocities have defined errors/recovery. Physics is not a universal model for electronics, chemistry, fluids or orbital mechanics.

Keep Rapier/WASM out of ordinary watch/experiment bundles until requested. Test actual deployed lazy loading and disposal. Scientific labels/readouts must state whether they are analytical, measured from the simulation, authored or illustrative.

## 7. Existing files and stack to reuse

The paths below were checked against the repository inventory/current source at the baseline. Read relevant contents before editing; a path's presence does not establish feature readiness.

| Existing files | Purpose / required integration |
|---|---|
| `CLAUDE.md`, `AGENTS.md`, `docs/features/parallel-dev-deploys.md`, `docs/features/rabbit-hole-production.md` | Current worktree, dev, shared-data, browser and release rules |
| `packages/web/src/agent/slash.js`, `learn-slash.js`, `slash-sheet.js` | Command registry, dispatch, help/example and available capability behavior |
| `packages/web/src/inline-ai-route.js`; `packages/control-plane/src/chat-capability-route.js` | JEV/capability routing; no subject-word routing shortcuts |
| `packages/web/src/generation-confirmation-schema.js`, `GenerationProposalCard.jsx`, `generation-proposal-chat.js`, `generation-proposal-status.js`, `proposal-capabilities.js` | One proposal schema/presentation, conversational edits, real job states |
| `packages/control-plane/src/generation-proposal.js`, `chat-proposal-route.js` | Signed v3 proposals, revision concurrency, consumption and repeat-job idempotency |
| `packages/control-plane/src/explain-job.js`, `explain-brief.js`, `explain-author.js`, `explain-review.js`, `explain-repair.js`, `explain-policy.js`, `explain-program-stage.js` | Durable prepare/review/generate flow, bounded provider calls and artifact acceptance; do not copy entire pipeline blindly |
| `packages/control-plane/src/agents/explain-brief.js`, `agents/explain-author.js`, `agents/explain-repair.js`, `learn-models.js` | Prompts/task roles, configured model transport and allowance accounting |
| `packages/control-plane/src/explain-context-refs.js`, `explain-evidence.js`, `explain-history.js` | Authorized actual-read context, revision/evidence history |
| `packages/control-plane/src/generation-review-refs.js`, `explain-program.js`; `packages/web/src/canvas-persist.js` | Source resolution; immutable artifact hashes/references and independently authorized result loading; `persistBoard`, `flushBoard`, pending-work navigation protection |
| `packages/web/src/explain-program/runtime.js`, `contract.js`, `sdk.js`, `limits.js`, `worker.js`, `page-worker.js`, `host.js` | QuickJS isolation, 2D-only contract and host/worker lifecycle; new 3D adapter needed |
| `packages/web/src/explain-program/interaction.js`, `stamps.js`, `playback.js`, `use-program-state.js`, `ProgramScene.jsx` | Serialized interaction, stale-result guards, state and focus conventions; assess current fixes before extending |
| `packages/web/src/three-d-renderer.js`, `viewer-slots.js`, `ThreeDShape.jsx` | Existing Three.js lifecycle, loading, camera, posters, visibility and interaction ownership |
| `packages/web/src/three-d-asset.js`, `three-d-context.js` | Validated asset boundaries and selected-object context extension |
| `packages/web/src/model-import.js`, `model-storage.js`, `model-loaders.js`, `model-formats.js`, `model-cad.js`, `CadCard.jsx` | Stored attachments, bundles, source revisions, imported/CAD display; no parallel importer |
| `packages/web/src/AdaptiveCanvas.jsx`, `LearningBlocks.jsx`, `card-layout.js` | Block dispatch, layout, connectors and persistence hooks; integration owner only |
| `packages/web/src/SelectionActions.jsx`, `selection-ref.js`, `chat-context.js` | Explicit selection/ref scoping, Add to chat and Quick Edit |
| `packages/control-plane/src/learn-tutor-routes.js` | Tutor route integration; `learn-tutor-handoff.js` is repository-context retrieval and is not the material generator |
| `packages/control-plane/src/agents/learn-tutor.js`; `packages/web/src/learn-tutor.js`, `learn-tutor-actions.js` | Existing `create_material`, `cardContext`/`plannerContext`, modality and action-contract integration |
| `packages/web/dev-worker.js`, `app-worker.js`; `packages/control-plane/src/learn-boards.js` | Actual app route, bindings and stored board integration; inspect import graph before deployment |
| `docs/superpowers/plans/2026-10-28-explain-sandbox.md`, `2026-10-29-explain-tasks-8-11.md`, `2026-10-30-explain-back.md`; related feature checklists/fix logs | Reuse decisions and failure patterns; do not reopen unchanged historical work |
| `.github/workflows/verify.yml`, `fast-e2e.yml`, `deploy-dev.yml`, `deploy-prod.yml`; `scripts/dev-deploy.mjs`, `dev-deploy-gate.mjs` | Exact-SHA checks and existing release chain; no new deployment workaround |
| `scripts/ci/check-map.json` | Register/select new browser checks so a green workflow actually exercises the new feature |

### Dependency and model policy

- Inspected web stack: React `^19.2.8`, Three.js `^0.186.0` (lock: `0.186.0`), Zod `^4.5.4`, Zustand `^4.5.7`; QuickJS core/WASM `0.32.0`. Keep installed compatible versions and lockfile authoritative. Do not upgrade unrelated dependencies.
- Existing `/explain` role defaults are `claude-opus-5-5`: brief 4,000, author 10,000, review 3,000, repair 6,000 max output tokens in `learn-models.js`. These are observed repo configuration, not an assertion about a public model catalog.
- Existing JEV configuration is gateway `typesafe-ai/jev` or direct `jev-1.13.0` in `learn-grade-jev.js`. Reuse the configured route and its uncertainty/timeout behavior. Do not substitute the generic artifact task's different Auto-model default for the dedicated Animation pipeline.
- Proposed `/animation` default: same configured provider/model through dedicated `animation_brief`, `animation_author`, `animation_review`, `animation_repair` task keys and existing billing transport. Begin with equivalent token ceilings; the cost/reservation computation must reflect the actual bounded stage/retry graph. No silent model fallback or automatic stronger-model escalation.
- Use deterministic validators before model review. One author result, up to two bounded reviews, and at most one repair per confirmed build by default: author → validate/render/review → optional repair → validate/render/final review. Include both reviews/capture rounds in the worst-case admission and actual call accounting. A repaired artifact is never accepted without final re-review. Semantic proposal revisions are separately accounted user actions, not an infinite internal loop.
- Preserve truthful accounting semantics: the current `/explain` worst-case admission check is **not a parent reservation**; individual calls are admitted/charged through existing transport. Animation must enforce its declared combined call/spend bound and reconcile actual per-call holds without presenting an admission check as reserved funds. If strict parent reservation requires new billing work, document the exact change instead of claiming it already exists.
- Routine tests use fixtures. Real-generation acceptance uses verified authorized access and a feature-specific spend ledger. Missing paid authority does not block UI/runtime/fixture progress, but real-generation acceptance remains unverified.
- No React Three Fiber, Drei, XState, new Python CAD backend, rendering server, asset marketplace or general-purpose JS iframe engine is required.

Official implementation references (verify against pinned versions when implementing):
- Three.js: https://threejs.org/docs/ — GLTFLoader, OrbitControls, Raycaster, InstancedMesh, TubeGeometry, ExtrudeGeometry, LatheGeometry.
- Rapier JavaScript: https://rapier.rs/docs/user_guides/javascript/getting_started_js/
- Prior procedural authoring reference only: https://github.com/rohitg00/ai-engineering-from-scratch/blob/fe6c657dfb8d02cc898fcee7d4cfbf663aae1416/skills/lesson-screen/references/build.md

## 8. New files, ownership and no-idle execution

Use **six agents total: Parallel + five workers**. More agents touching the same registries/renderer will slow integration. Each works in an isolated worktree from the frozen kickoff SHA; Parallel records branch names and full SHAs in the checklist. Use equivalent available worker names if necessary; preserve ownership.

| Agent | Owns | Independent work while dependencies land |
|---|---|---|
| P — Parallel/integration | All existing shared registry/canvas/route/package/lockfile edits; plan/checklist/fix log; release candidates | Integrate small commits, reconcile overlaps, run required checks, maintain preview and receipts |
| R — runtime/renderer | New `animation3d/contract.js`, `capabilities.js`, `runtime.js`, `renderer.js`, `state.js` and colocated tests | Contract fixtures, malicious/oversized cases, lifecycle and deterministic simulation |
| G — generation | New server `animation-brief.js`, `animation-author.js`, `animation-render.js`, `animation-review.js`, `animation-repair.js`, `animation-job.js`, `animation-policy.js`; tests | Fake-transport pipeline, source/approval/cost validation, later approved model acceptance |
| U — UI/interaction | New `Animation3DCard.jsx`, `animation3d/Controls.jsx`, `animation3d/interaction.js`, `animation3d/client.js` and tests | Build card against frozen fixtures; narrow-width, focus and loading/recovery checks |
| A — assets/context | New `animation3d/storage.js`, `animation3d/assets.js`, `animation3d/context.js`; post-MVP `assembly.js`, `geometry.js`, `physics.js` with tests | MVP state persistence/revision adapter and reference contract; after approval asset/assembly/physics work |
| V — verification/Tutor | New server `animation-evidence.js`; `packages/web/e2e/animation-*-check.mjs`; acceptance fixture/receipt assets | Independent oracles, proposal races, saved-state/permission cases, registered browser checks |

Shared files have **one writer: P**. Workers deliver new modules plus small integration instructions/patches; P applies shared-file changes. R owns renderer API; A implements later geometry/assembly/physics adapters behind that API, not competing edits to `three-d-renderer.js`. V proposes Tutor route hooks; P integrates them. A conflict-resolution commit is a new reviewed artifact.

Freeze only the interfaces and small contract fixture in AN-01, then start R/G/U/A/V concurrently. Do not wait for perfect abstractions. If one task is blocked, log the exact dependency, timebox one focused diagnosis (about 20–30 minutes), and take another authorized task in the same phase. A worker should not spin on a missing API when it can implement against the frozen fixture. Do not bypass the MVP approval gate to keep workers busy.

## 9. Milestones and mandatory push points

Targets below are working-order goals, not promised elapsed delivery times. At kickoff P provides estimates based on actual reuse and staffing, updates them only when evidence changes, and never substitutes a time estimate for a working preview.

| Milestone | Required tasks | What the owner can try | Mandatory push/receipt |
|---|---|---|---|
| M0 — kickoff contract | AN-01 | Plan/task inventory and declared capability contract | Push branch, plan, checklist and `fix.md` immediately |
| M1 — first visible slice | AN-02 + AN-03 fixture integration | Real 3D watch/experiment/game card shells and working local controls | Push/dev preview as soon as usable; explicitly labelled fixture examples |
| M2 — generated slice | AN-04 + AN-05 + AN-06 integration | Request → recommendation → edit → confirm → generated original scene → save/reload | Push working vertical slice; show real vs fixture evidence and spend |
| M3 — MVP ready for decision | AN-07 | All MVP acceptance flows and recovery | Freeze candidate; push complete MVP receipt and ask owner to approve continuing |
| **APPROVAL GATE** | **Owner explicitly approves MVP and continuation** | Owner feedback may adjust the following scope | **Record approval; no AN-08 onward implementation beforehand** |
| M4 — assets and richer scenes | AN-08 + AN-09 | Image-informed procedural scene; attached model in a scene | Push both independently useful slices |
| M5 — direct interaction | AN-10 + AN-11 | Multi-part assembly and focused walkthrough/game controls | Push each working flow; no physics dependency for prescribed motion |
| M6 — physics | AN-12 | Bounded real collision/joint experiment with reset | Push physics slice and lazy-load/performance evidence |
| M7 — connected product | AN-13 + AN-14 | Tutor activity discussion, scoped revisions, permitted share/fork | Push integrated full candidate |
| M8 — complete release | AN-15 + AN-16 | All agreed flows in the deployed, enabled release | Exact-SHA checks, activation/user-flow evidence, remaining owner actions only |

Do not save all pushes for milestones. Each independently tested coherent change gets committed and pushed immediately to its worker branch, linked to an AN task. P integrates ready slices continuously. Keep long release gates sequential and freeze their candidate SHA; other authorized development/checks continue. Do not continuously rebase/restart passing gates for cosmetic changes.

## 10. MVP tasks — execute now

### AN-01 — kickoff, compatibility and shared contracts (P + R)

**Files:** create `animation3d/contract.js`, `capabilities.js`, `fixtures.js`, corresponding tests; P creates plan/checklist/fix log and owns registry adjustments.

- [ ] Fetch main/active branches; read current instructions; inspect `/explain`, Explain-back and current sizing/state fixes so completed work is not duplicated. Record overlaps and acquire shared-file ownership.
- [ ] Define the proposed plan/artifact/frame/event/snapshot interfaces in section 5, actual serializable types and phase-capability validation. Add stable IDs, finite/range checks, hierarchy cycle/unknown-ID rejection and aggregate allocation limits.
- [ ] Add fixtures for watch, experiment and game with independently calculable expected states; prove invalid physics/asset/walk capability requests are rejected in MVP. Pin `animation3d` compatibility and old `animation` load unchanged.
- [ ] Push M0, with exact schema fixture shared by all workers. No broad refactor or mandatory migration before a demonstrated need.

**Accept:** all workers can consume one fixture/contract; malformed output cannot reach rendering; legacy discriminator regression passes.

### AN-02 — trusted 3D viewer and procedural geometry (R)

**Files:** `animation3d/renderer.js`, renderer/contract tests; P makes minimal shared-viewer extension if required.

- [ ] Implement bounded primitives/groups, lines/curves/arrows and labels, default camera/light/materials; resource allocation follows validated budgets.
- [ ] Load the fixture, update object transforms/readouts without rebuilding the entire scene, capture a poster, dispose resources and honor shared visibility/viewer slots.
- [ ] Verify resize, camera reset, context loss/recovery and no WebGL accumulation across repeated mount/unmount. Test budget rejection before allocation, hierarchy transforms and valid bounds.
- [ ] Push real rendered M1 fixtures. A screenshot of a drawing is not acceptance of a Three.js renderer.

**Accept:** actual procedural 3D is inspectable; stale frames and undeclared objects cannot mutate it.

### AN-03 — card, proposal settings and focused controls (U; P shared integration)

**Files:** `Animation3DCard.jsx`, `animation3d/Controls.jsx`, `interaction.js`, `client.js`; P changes the existing canvas/proposal/command schema.

- [ ] Build shared card layout and watch/experiment/game variants from fixtures; expose only needed controls. Show current format and compact legend.
- [ ] Implement inspect focus ownership, camera/object gesture arbitration, accessible parameter controls, play/pause/restart, meaningful goal/hint/outcome and recoverable loading/error UI.
- [ ] Register `/animation` help/example/pill, internal block, capability and proposal settings in existing registries; ensure one request enters history once. Use the existing proposal component, not a copied demo form.
- [ ] Add focused UI checks: narrow/wide card, light/dark, resized viewport, outer canvas wheel/drag, typing unaffected, Escape and blur release. Push M1 preview before model integration is complete.

**Accept:** the owner can exercise the three MVP fixture variants; they are visibly fixtures and not claimed as generated results.

### AN-04 — sandbox behavior, looping and atomic state (R + U)

**Files:** `animation3d/runtime.js`, `state.js`, behavior tests; integration with U's controls.

- [ ] Reuse QuickJS isolation and bounded worker lifecycle through a 3D adapter. Add watch looping separately from `/explain`'s duration-stop behavior; do not globally change `/explain` playback.
- [ ] Implement pure evaluate and validated serialized reductions; parameters, game rules, reset and any required normalized step event update one atomic accepted snapshot.
- [ ] Check rapid input, drag coalescing, reset during pending evaluate, invalid initial/reset output, timeouts, queue pressure and stale worker messages. Preserve last good state on failure.
- [ ] Verify numerical oracle values independently: beam balance uses mass × distance, experiment geometry/readout agree, looping does not drift or erase inputs. Push runtime slice.

**Accept:** custom generated logic can express an unseen simple rule/experiment without native JS execution, frame/model calls or subject-specific handlers.

### AN-05 — planner, authoring, review and durable generation (G; P routes)

**Files:** server `animation-{brief,author,render,review,repair,job,policy}.js`, tests; P integrates task keys, JEV, job endpoints and proposal consume path.

- [ ] Add dedicated task roles using the existing model transport; planner receives capability registry and authorized actual-read sources. Prompt requires recommended experience/reason and honest limitations.
- [ ] Prepare signed editable proposals; consume the exact latest version only. Validate source/actor/revision/capability at both proposal and generation stages; idempotent repeats return the existing job/card.
- [ ] Author a new procedural artifact and sandbox program, validate deterministically, render bounded sample states, review against the approved goal, perform at most the bounded repair, then rerun validation/render/final review before acceptance. Use the existing `explain-render.js` / `env.BROWSER` capture seam via `animation-render.js`, not a new rendering service: capture up to two declared views at up to three parameter/time states per review round, with execution traces and numerical readouts. Scope the review route/token to the candidate; no generated URL navigation. Missing required capture/binding is an explicit blocker, not a fake passed visual review. Do not generate a canned fixture selected by keywords.
- [ ] Test fake-transport model failures, malformed output, stale/expired/duplicate approvals, stop/retry, wrong board/actor/source and provider reservation boundaries. Run targeted real cases only under actual authorized access; log model, tokens, spend and resulting artifact hash.
- [ ] Push M2 backend slice and exact route/test evidence. A model text response is not accepted until the scene renders and its behavior passes checks.

**Accept:** real request → reviewed proposal → original validated artifact works; no silent fallback, duplicate job, unbounded repair or incorrect permission.

### AN-06 — persistence, versions, cancellation and hydration (A; P board integration)

**Files:** `animation3d/storage.js`, `assets.js` reference-only MVP portion, `context.js` minimal provenance, tests; existing artifact/board paths integrated by P.

- [ ] Save artifact references and atomic snapshot using existing artifact/source and canvas persistence patterns. Assess schema needs; prefer existing extensible payloads, not a speculative new database.
- [ ] Implement reload paused at accepted state/time, reset, cancel, failed regeneration preserving current version, and late-job/late-hydration guards.
- [ ] Verify save while navigating, two fast parameter edits, refresh after settled save with **zero new model calls**, deleted/replaced card, board switch and missing artifact. Check durable result reads independently of job records, cross-user/cross-canvas denial and artifact/hash/runtime-stamp mismatch. Never replace newer edits with delayed data.
- [ ] Until AN-14 enables full share/fork handling, unsupported MVP share/fork contexts show an honest unavailable scene placeholder; never fall through to owner APIs or embed executable source into board JSON.
- [ ] If a migration is actually needed, prepare exact additive migration/rollback assessment, coordinate dev database ownership and log required authority. Continue unaffected work. Push durable M2 slice.

**Accept:** owner refreshes and keeps the accepted scene, parameters and game state; stale results cannot create/update the wrong card.

### AN-07 — MVP qualification and explicit owner decision (V + P)

**Files:** new `packages/web/e2e/animation-mvp-check.mjs`, fixture/oracle tests and MVP receipt.

- [ ] Register browser checks in the actual CI discovery/runner, not merely an unexecuted file. Verify nonzero executed counts, artifacts and exact candidate SHA.
- [ ] Exercise real generated watch, experiment and mini-game cases; at least one fresh prompt outside the development fixtures. Check visual meaning and computed behavior, not just valid JSON.
- [ ] Run focused regressions for existing `/explain`, `/3d`/CAD viewer, proposal revision and card sizing/focus. Use existing passing evidence where applicable; broaden only for changed shared code or concrete failures.
- [ ] Deploy the isolated MVP dev preview through the authorized procedure; publish a short try-it path, implemented/tested/deployed state, full SHA, limitations, spend and unresolved blockers.
- [ ] **Stop at M3 and request owner approval to continue post-MVP.** Fix MVP issues during review; do not implement AN-08 through AN-16 feature work yet.

**Accept:** M3 is marked `ready_for_owner_review` only with real flow evidence; if real model/browser access is unavailable, state which acceptance remains unverified. Post-MVP starts only after recorded explicit owner approval.

## 11. Post-MVP tasks — blocked on owner approval of MVP

### AN-08 — richer procedural vocabulary and image references (R + A; G prompts)

**Files:** new `animation3d/geometry.js`, contract/fixtures extension; G's context/author modules.

- [ ] Add bounded tubes, extrusions, lathed profiles, instancing and parametric surfaces with segment/triangle accounting; parameters meaningfully affect geometry.
- [ ] Interpret explicitly attached images through the existing authorized vision/context path into a reviewed simplified procedural design; preserve actual-read source refs and uncertainty.
- [ ] Test a nontrivial curved object plus repeated elements; reject excessive topology, invalid profiles and false precise dimensions. Push M4 procedural slice.

**Accept:** useful generated scenes extend beyond basic solids; image interpretation is honest and does not require external mesh generation.

### AN-09 — attached models and immutable source binding (A)

**Files:** `animation3d/assets.js`, source adapter tests; P integrates existing importer/store authorization seams.

- [ ] Resolve real GLB/CAD/imported model sources and local bundles by immutable refs, with aggregate resource budgets and no arbitrary external URL loads.
- [ ] Support multiple instances/material preservation, stable source/part identity and declared-unit conversion; handle unsupported codecs and deleted/unavailable sources without losing a previous good artifact.
- [ ] Test two different attached components, duplicate instances, missing units, cross-account denial, signed-link expiry and a viewer-only shared source. Push M4 asset slice.

**Accept:** actual supplied geometry appears; source references survive reload and permission changes are honored.

### AN-10 — prescribed assemblies and component editing (A + U; P Quick Edit hooks)

**Files:** new `animation3d/assembly.js`, joint/coupling tests, selection/control additions.

- [ ] Implement generic instance/local-frame graph, fixed/revolute/prismatic prescribed joints, finite axes/limits and explicit ratio couplings; no mechanism-specific runtime route.
- [ ] Add component picking, constrained dragging, numeric alternatives, part/source list, reset and optional declared explode view. Preserve outer canvas gesture ownership.
- [ ] Ctrl+K targets a selected instance or whole scene through a revised proposal; replace only after successful validation/acceptance. Preserve previous revision and original CAD source.
- [ ] Test a rotating linkage or slider-crank and an unrelated assembly; verify limits, coordinate/unit transforms and source identity. Push M5 assembly slice.

**Accept:** genuine multi-component interaction, not visually similar stand-in cubes or guessed hidden movable parts.

### AN-11 — walkthrough and richer mini-game input (U + R)

**Files:** interaction/runtime contract extensions and movement/game browser checks.

- [ ] Add `walk` profile: normalized movement state, bounded speed/scene limits, right-drag look, keyboard release and touch movement/look equivalents. No pointer-lock dependency.
- [ ] Add declared object placement/drag actions and optional game objectives with structured attempts/outcomes. Keep keyboard input coalesced and independent of text fields.
- [ ] Test switching two scene cards, typing in Chat, blur/tab hide, Escape, mobile, reset and an unreachable/invalid objective. Distinguish ordinary free navigation from collision-constrained physics movement.
- [ ] Push M5 walkthrough/game slice; learning games remain single-player, bounded and usable without mouse-only precision.

**Accept:** WASD works only where useful and only in focused scene interaction; no stuck movement or canvas shortcut theft.

### AN-12 — optional Rapier physics (A + R; P dependency/lockfile)

**Files:** new `animation3d/physics.js`, pure configuration tests, integration/browser physics checks; exact pinned dependency.

- [ ] Verify and pin stable Rapier API; lazy-load one trusted adapter. Add explicit bodies/colliders/joints/forces with capability validation and the limits in section 5.
- [ ] Run fixed-step scheduling, collision/joint simulation, bounded forces/velocities, reset/disposal and the declared reload restart policy. Keep kinematic/prescribed behavior separate.
- [ ] Test falling/stacking bodies, an impulse, a constrained joint, invalid/excessive worlds, tab suspension, reset during load, lazy-load failure and slot eviction. Check reasonable physical relationships/tolerances rather than claiming universal scientific accuracy.
- [ ] Push M6 with deployed WASM-load proof, resource/step measurements and a non-physics bundle regression. No hardcoded outcome pretending to be physics.

**Accept:** the physics option runs an actual bounded engine, and ordinary scenes do not pay its startup/resource cost.

### AN-13 — Tutor integration and activity evidence (V + G; P shared hooks)

**Files:** `animation-evidence.js`, `animation3d/context.js`, server tests; existing Tutor routes integrated by P.

- [ ] Tutor can recommend an Animation material through the shared proposal pathway, with supported format/cost/capability information. No hidden generation or autonomous spending on every Tutor turn.
- [ ] Capture bounded semantic evidence: artifact revision, goal, parameter/action changes, attempts/outcomes, selected object, relevant readouts and limitations. Coalesce continuous gestures; never send raw per-frame telemetry or key logs.
- [ ] Ask Tutor/selection context uses the correct saved revision and real activity. Successful puzzle completion is activity evidence, not an automatic mastery score. When understanding matters, Tutor can ask for an explanation using existing Practice/Explain-back.
- [ ] Test both helpful evidence and no-evidence cases, failed/random success, stale revision and unknown scientific assumptions. Push M7 Tutor slice.

**Accept:** Tutor explains what the learner actually did and does not fabricate understanding or invoke a model per interaction tick.

### AN-14 — revisions, sharing, forks and final product integration (A + P)

**Files:** storage/context/source tests and focused share/fork browser checks.

- [ ] Finish selected-object/scene refinement, accepted-revision history, recovery and source-dependent rebuild semantics. No edits to another card or silent overwrite of a live good scene.
- [ ] Use existing share/fork rules and capability-limited loaders; read-only viewers cannot call owner source/rebuild APIs. A fork obtains an authorized durable snapshot/copy or clearly reports inaccessible references.
- [ ] Verify document round-trip, shared view, authorized fork, deleted source policy, insufficient permission and old `/explain` animations. Keep scene input state distinct from mutation authority.
- [ ] Push integrated M7 candidate, help/examples and truthful availability declarations for all full-phase experiences.

**Accept:** the feature is part of ordinary Rabbit Hole lifecycle/context/permissions, not an isolated demo route.

### AN-15 — full qualification and regression closeout (V + P)

**Files:** `animation-full-check.mjs`, security/lifecycle oracles and final evidence receipt.

- [ ] Run the full matrix in section 12 on the frozen candidate. Include fresh unseen prompts across multiple domains, all five output families plus inspect, and mixed procedural/imported scenes.
- [ ] Check sandbox escape attempts, aggregate allocations, invalid transforms, malformed imports, stale async results, multi-card GPU/worker limits and focus/accessibility. Fix demonstrated release blockers; log cosmetic issues as deferred.
- [ ] Compare every AN task/subtask and accepted owner correction with actual code/call paths and results; identify any unreviewed integration commits.
- [ ] Push a complete implementation receipt with remaining release-only/owner-only actions separated. No blanket “all done” from green CI alone.

**Accept:** required behavior is implemented and tested, meaningful limitations are recorded, and no critical correctness/security/budget blocker is open.

### AN-16 — release, activation and final verification (P)

**Files:** current release tooling/config; final receipt/checklist/fix log only as necessary.

- [ ] Prepare the final candidate with exact-SHA checks and prescribed serialized gate. Obtain only genuinely outstanding release authority; do not repeat prior authorized routine steps.
- [ ] Deploy/activate through the user's existing launcher/process. Keep feature flags coherent between client/server; kill switch/rollback protects previously saved artifacts and older cards.
- [ ] Verify real enabled production flows for generation, controls, refresh, selected asset, physics and Tutor using authorized access. An HTTP health check is not user-flow verification. If signed-in access blocks this, explicitly retain that unverified status and consolidate the owner's action once.
- [ ] Update fix/task/deployment evidence, clean only merged worktrees according to repo rules and deliver final concise handoff. Do not claim production completion while disabled or user flows remain unverified.

**Accept:** full feature implemented, exact-SHA checks passed, deployed, enabled and production user flows verified—or accurately reported as awaiting the one remaining step.

## 12. Acceptance matrix and review focus

Each case must reference a task, candidate SHA, actual result and evidence. Mocked and real-provider results are separate columns in the receipt.

| Case | Expected evidence | Owner task |
|---|---|---|
| New `/animation` request; duplicated submit; changed proposal | One current approval, one job/card, edited format preserved | AN-03/05 |
| Novel passive loop | Correct 3D scene, start/pause/restart and looping without state loss | AN-02/04/07 |
| Parameter experiment | Minimum/default/maximum inputs produce independently checked geometry/readouts | AN-04/07 |
| Simple game | Wrong/correct actions, hint, attempts, reset and restored state agree | AN-04/06/07 |
| Late responses and rapid input | Latest accepted edits win; invalid/reset/late output preserves prior state | AN-04/06 |
| Save/reload/cancel/delete/board switch | Correct card/revision only; no duplicate job or lost good artifact | AN-05/06 |
| Legacy compatibility | Existing `/explain` animation, CAD/3D viewers and shared proposal still work | AN-01/07/14 |
| Image-informed procedural object | Actual source read; approximation/unknown dimensions stated | AN-08 |
| Two attached models and repeated instance | True geometry/material/units with distinct instance identity | AN-09/10 |
| Prescribed assembly | Selected component, finite axis/limits, driver and reset work | AN-10 |
| Walkthrough and mobile | Focused WASD/right-drag, touch equivalence, typing unaffected, Escape releases | AN-11 |
| Physics | Collision/joint/force, bounded world, lazy load, suspension/reset and reload policy | AN-12 |
| Tutor | Structured evidence and limits; no automatic mastery claim or per-frame call | AN-13 |
| Share/fork permissions | Authorized durable read, denied owner mutations, explicit missing-source behavior | AN-14 |
| Resource exhaustion/context loss | Watchdog/budget rejection, posters/recovery/disposal, no whole-app crash | AN-02/04/12/15 |

Five high-risk review areas: stale async results overwriting edits; incorrect derived values despite plausible animation; nested gesture/key capture; imported-source permission/revision drift; unbounded provider/GPU/worker allocation. The tasks above include explicit tests for all five.

### Verification commands and evidence rules

Verified existing command meanings (recheck current package scripts at kickoff):

- From `packages/web`: `npm run test:unit` runs Node tests; `npm run build` builds Vite using required target flags.
- From `packages/control-plane`: `npm test` runs Node tests. For new focused files, use e.g. `node --test test/animation-job.test.js test/animation-policy.test.js` after those files are created.
- For new web modules: from `packages/web`, `node --test 'src/animation3d/*.test.mjs'`. Verify the runner actually executes tests; zero tests is not a pass.
- Repo release suite: `make test-unit`, only as required by the current procedure. The retired integration suite is not meaningful acceptance.
- In `packages/web`, `npm test` means browser automation. Current `CLAUDE.md` restricts Claude-run browser automation; use approved CI/release browser runners and register the new scripts with their harness. Do not bypass restrictions using another agent or equivalent tool.
- Follow `verify`, `fast-e2e`, production bundle/gate and dev-deploy requirements for the exact candidate. Read current scripts/workflow rules rather than inventing a release command, target or gate exemption.
- Existing suites to reuse: `explain-program/{runtime,contract,contract-safety,interaction,lifecycle,playback,state-contract,use-program-state}.test.mjs`; `model-{formats,import,storage}.test.mjs`; `generation-proposal-card.test.mjs`; server `generation-proposal.test.js`, `explain-{proposal,job,program-budget,provider-cap,context-refs,tutor}.test.js`; browser `explain-program-*-check.mjs`, `model-viewer-check.mjs`, `slash-3d-check.mjs`.

## 13. Tracking files Parallel must create and push

1. `docs/superpowers/plans/2026-10-30-animation.md` — this full plan, including later owner decisions.
2. `docs/features/animation/checklist.md` — one live task/subtask/milestone index, branch ownership and receipt links.
3. **`docs/features/animation/fix.md`** — the requested new Animation blocker/fix log (singular `fix.md`). Link it from the checklist and index its open IDs in existing root `fixes.md`; do not maintain competing duplicate descriptions.
4. `docs/features/animation/receipts/<milestone>-<shortsha>.md` — short factual snapshots, not polished reports.
5. `docs/features/animation/spend.md` — authorization reference, scope, test/call identity, model, estimate/reservation/actual and total. No secrets or raw cookies.

### Checklist row

`Task/subtask | phase | owner | dependency | branch | implemented SHA | focused test/CI link | preview/release | status | next action`

Use explicit states: `not_started`, `in_progress`, `blocked`, `pushed`, `tested`, `preview_ready`, `ready_for_owner_review`, `owner_approved`, `deployed`, `enabled`, `production_verified`, `deferred`. Do not combine implemented, tested and deployed into one checkbox.

Record the M3 approval verbatim with date/time and scope in the checklist. Before it exists, AN-08 onward remains `blocked: owner MVP approval`, even if its contracts have reserved future enum values.

### `fix.md` entry template

```markdown
### FX-AN-001 — concise problem
- Task / phase:
- First observed at full SHA / environment:
- Actual behavior / expected behavior:
- Evidence: file:line, test/run link or reproducible steps
- Severity / blocks MVP, later slice, production, or neither:
- Owner / branch:
- Attempted fixes and outcome:
- Next concrete action / dependency:
- Owner action needed: none, or exact decision/authorization
- Fixing full SHA:
- Validation result / deployed and enabled state:
- Status: open | mitigated | fixed-unverified | verified | deferred
```

Create the file even if it initially says no blockers found. Retain resolved entries with fixing SHA. Log failed checks and real limitations; do not hide a failed acceptance case behind a disabled control. Cosmetic issues are `deferred` with no release-blocking flag.

## 14. Push and review contract

Push work so it can be reviewed remotely; a local SHA, screenshot or agent summary is insufficient. Each milestone handoff contains:

- Integration/worker branch names and **full pushed SHAs**; compare/commit links and parent/base.
- Changed AN IDs/subtasks, actual implemented behavior and deferred scope.
- Working isolated dev preview, feature activation and a 3–5 step try-it path.
- Targeted test command/count/result and exact-SHA CI/gate links; distinguish source review, fixtures, browser use and real generation.
- Real model/asset acceptance outputs with artifact hashes/source revision IDs, spend and remaining allowance.
- Open `fix.md` IDs, next owner/action and any unreviewed commits.
- At M3: one clear MVP approval request. At final release: one consolidated list of genuinely unavoidable owner-only actions.

The reviewing assistant will compare pushed task claims against this plan, changed code/call paths, fix entries and exact-SHA checks. It must report “not reviewed” where evidence is missing. A green job title or commit message does not prove compliance. Reviews prioritize data loss, functional correctness, permissions, budgets, runtime isolation and missing required behavior—not visual polish. Review is not a new permission gate for development/pushes; only the owner's explicit MVP approval gate and existing release rules apply.

If hourly review is configured, that is periodic inspection, not guaranteed instant review of every push. Keep an explicit pending-review commit list, deduplicate commits across branches and review conflict resolutions separately. No automatic reviewer may spend model credits, modify source, deploy, trigger/rerun workflows or send instructions externally unless separately authorized.

## 15. Parallel's kickoff message

> I will build `/animation` in six lanes with one integration owner, using the existing proposal, model, sandbox and Three.js foundations. I will push a fixture-backed interactive preview early, then an original generated and saved MVP. I will not copy the preview's demo selector or replace `/explain`'s existing animation type. I will keep `docs/features/animation/fix.md` and the checklist pushed, report real evidence and spend, and keep independent MVP work moving. After the complete MVP preview is ready, I will wait for your explicit approval before implementing the remaining feature tasks. Minor polish will not delay delivery.

## 16. Completion checklist for the handoff itself

- [x] Owner's latest MVP-first **approval gate** is explicit and overrides no-idle language.
- [x] MVP and full completion tasks, subtasks, owners, dependencies and push points are included.
- [x] All discussed UI families, proposal behavior and stable input profiles are specified.
- [x] Procedural assets, attached models, image interpretation and no-Meshy boundary are separated.
- [x] Existing 2D animation naming and sandbox limitations are called out; new 3D interfaces are labelled proposed.
- [x] Models/libraries are distinguished as inspected existing configuration or future verified additions.
- [x] Persistence, source permissions, state races, scientific correctness and resource/spend limits have acceptance cases.
- [x] Relevant existing files, proposed files, actual test command meanings and release rules are mapped.
- [x] New `fix.md`, checklist, receipts, spend ledger and remote review evidence are required.
- [x] No production GO, new paid budget or unperformed verification is falsely claimed.

## 17. Owner decisions recorded at kickoff (2026-10-30, ~12:45 PM PT)

The owner approved A1, B1, C1 and D1:

- **A — $10 total approved for `/animation` dev testing.** One shared spend ledger across all agents
  (`docs/features/animation/spend.md`). Fixtures for routine checks; real calls for targeted acceptance. Planning,
  authoring, review and repair count toward the combined cap, including concurrent calls before they start. At the cap,
  stop paid calls and continue unpaid work. Separate from every other feature budget.
- **B — coordinated additive dev migrations approved if needed.** Reuse existing storage where adequate. Confirm the
  exact dev database and available migration number, coordinate with other sessions, announce, apply and verify.
  Production migrations remain through the owner's release launcher.
- **C — start `/animation` now in parallel.** Six-agent team, isolated worktrees, explicit shared-file ownership,
  sequential release gates. Explain-back's handoff finishes as soon as its checks pass.
- **D — start from section 4's written UI spec.** Do not wait for the HTML. If supplied later, copy it to
  `docs/features/animation/reference-ui.html` and reconcile relevant differences without unnecessary redesign.
- Internal name `animation3d`; existing 2D `animation` and `/3d` behavior preserved.
- `env.BROWSER` checked at kickoff (section 18). Required visual review stays unverified until it actually runs.
- **Build and push Tasks 1-7 (AN-01..AN-07) first. Do not implement Tasks 8-16 until the owner explicitly approves the
  MVP.** During review, continue MVP fixes and checks.
- Push usable slices as soon as possible; no overpolishing, no waiting for intermediate feedback. Keep
  `docs/features/animation/fix.md` and the checklist pushed and current. Each milestone needs its full SHA, working
  preview, short try-it path, test evidence, spend and remaining blockers.

**Ctrl+K clarification (applies to AN-10 and AN-14, after MVP approval):** Ctrl+K editing applies across Animation
scenes: loops, experiments, mini-games, walkthroughs and assemblies. Selecting the card targets the whole scene;
selecting a component targets that component. Show the target and the proposed change, validate before replacement, and
preserve the previous revision and source assets.

## 18. Kickoff inventory (2026-10-30)

- Kickoff base: main `a3376817f003a9c41824fc5b76b644778bc9c6e3` (unchanged from the plan's baseline). Integration branch
  `feat/animation`, worktree `animation`. Explain-back release 24-eb (`ff0fff36a`, branch `feat/practice-final`) is
  pending on the owner's launcher; it touches `LearningBlocks.jsx`, `card-layout.js` and e2e checks, so P rebases onto
  main once it lands.
- `env.BROWSER`: declared as a Browser Rendering binding (`"browser": { "binding": "BROWSER" }`) in
  `packages/web/wrangler.dev.jsonc`, `wrangler.parallel.jsonc` and `wrangler.rabbit-hole-prod.jsonc`; used by
  `control-plane/src/explain-render.js` and `explain-job.js`. Bindings (unlike secrets) apply to an isolated dev clone,
  so the review capture seam is configured; it counts as verified only after a real capture runs on the preview.
- Naming: no existing `animation3d` block, primitive or schema in `packages/`; legacy `animation` (LearningBlocks
  BLOCK_TYPES) is `/explain`'s 2D scene and stays unchanged.
