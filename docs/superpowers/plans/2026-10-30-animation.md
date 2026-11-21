# Rabbit Hole /animation — MVP-first implementation and completion plan

**Status reconciled 7 November 2026 against `main` at `19f933c2`.** The original v3.1 plan records the 3 November kickoff. Section 8 records the delivered scope and the gate outcomes.

## Start here

- **MVP1 shipped on 3 November.** AN-01 through AN-07 shipped at `caf7ee9bc` with limited acceptance on a generated grid game. See sections 7 and 13.2.
- **The scoped ladder shipped on 4 November at 12:08 PM PT.** C14b (`18d92571`) includes the AN-17 transport, repair and billing changes, the AN-18/19 scene contract and renderer, the AN-20 authoring changes, and the AN-21 qualification harness. The release succeeded, and the read-only checks confirmed the deployed build and activation. [Production run 41903737638](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41903737638) · [Verify](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41902324893) · [Fast-e2e](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41902325006) · [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)
- **SGD qualification is parked.** C14 validated 20/20 SGD drafts and 8/9 regression drafts. C13 Gate 2 accepted 7/9 against the required 8/9, and both targeted C14 reruns were rejected. Decision 38 closed the ladder with the SGD capability claim and weekly canary parked. [Decision 38](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/superpowers/plans/2026-10-30-animation.md#L1122) · [C13/C14 evidence](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/evidence/README.md#L125)
- **Rendering.** The model supplies a structured 3D scene and, for moving scenes, a behavior program. `/animation` draws it in a live WebGL canvas with Three.js and takes PNG stills for review. Written `/explain` diagrams and playable 2D `/interactive` scenes use their own SVG renderers. [Three.js renderer](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/19f933c286bdf118f3dc9a6e20c712509174e92d/packages/web/src/animation3d/renderer.js#L23-L54) · [Explanation SVG renderer](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/19f933c286bdf118f3dc9a6e20c712509174e92d/packages/web/src/tutor-diagrams/TutorDiagram.js#L11-L31) · [Interactive SVG renderer](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/19f933c286bdf118f3dc9a6e20c712509174e92d/packages/web/src/AnimatedScene.jsx#L522)

Use the [checklist](../../features/animation/checklist.md) for the task status and [section 8](#8-sgd-qualification-ladder--an-17-to-an-21-owner-approved-3-november-2026) for the delivered scope.

| MVP1 production identity (historical) | Recorded value |
|---|---|
| Application commit | `caf7ee9bc7355ba6d76f971d00872b0da8a1254b` |
| Release time | 3:09 PM PT, 3 November 2026 (workflow log: completion at 3:08:39 PM PT) |
| Build | `a661e0ea0f9717e6` |
| `rabbit-hole-app` version | `56df36da-8637-4839-b848-9e5920c48fae` |
| `rabbit-hole-cp` version | `eea10533-f761-4d33-b819-1b839286d58e` |
| Production workflow | [41736512175, successful](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41736512175) |
| Qualification boundary | Limited grid-game acceptance passed; SGD qualification failed and open; signed-in production smoke awaiting owner evidence |

**How to read this plan:** sections 1–5 are what a worker needs of the specification (decisions, scope, architecture, files and stack, lanes); 6 the milestones; 7 the released MVP1 tasks; **8 the SGD ladder, the work that starts now**; 9 the blocked post-MVP tasks; 10–12 acceptance, tracking and push rules; **13 where everything stands, with Parallel's receipts**; 14 the appendix: historical records, the full subtask lists of AN-01 to AN-16, and the three specification sections (user flow, card UI, assets and physics) that describe released or blocked scope. Checkboxes in section 8 are work to do; checkboxes in the appendix record what was done. Source present, tests passed, preview ready, release deployed and user-flow acceptance are distinct states.

**Policy precedence:** the owner's explicit MVP policy (3 November) makes broad CI and the full release gate optional and nonblocking for an explicitly selected MVP release, with build, affected tests, focused smoke, commit/build identity, environment/schema checks and a usable recovery path still required. **The `--mvp` implementation is not in this production commit** (branch `feat/mvp-fast-path`, 13.2); Release 1 used the ordinary gate. Section 8 says which ladder slices may use the fast path once it exists. The ladder is a scoped exception to the AN-08 gate (owner decision 15); the rest of AN-08 to AN-16 stays blocked.

> **For Parallel and agentic workers:** execute this plan task by task using the repository's established parallel-worker workflow (or `superpowers:subagent-driven-development` / `superpowers:executing-plans` when available). Checkboxes are implementation work, not evidence of completion. Read current `CLAUDE.md` and `AGENTS.md` first.

**Goal:** let a user or Tutor propose a useful 3D experience, review it before generation, and create a durable canvas card that can be watched, explored, manipulated or played.

**Architecture:** reuse Rabbit Hole's routing, proposal, job, storage, model, sandbox and viewer foundations. Add a separate versioned 3D scene contract and trusted Three.js renderer adapter. Generated behavior runs in bounded QuickJS; it never receives application, DOM, WebGL, network or unrestricted Three.js access. Add optional trusted Rapier physics after MVP approval.

**Tech stack:** existing React 19 / Vite / JavaScript, Zod 4, Three.js 0.186, QuickJS 0.32 WASM workers, Cloudflare Workers / Durable Objects / D1 / R2 and the existing model transport (Anthropic `claude-opus-5-5` for every Animation role); Node tests beside each module and approved CI browser checks. No new backend service or external 3D-generation provider.

**Original design baseline (historical):** source inspected on 30 October 2026 at `a3376817f003a9c41824fc5b76b644778bc9c6e3`. This is a source inventory, not a completed implementation or production receipt.

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
10. Production GO for the MVP was supplied and the MVP has been released at the production commit above. Do not request the same routine GO again. Approval to implement AN-08 onward remains separate and is not established by the MVP release. For explicitly selected MVP releases, apply the owner's lightweight release policy in section 13; ordinary/full-feature releases retain their applicable policy unless separately changed.

**Owner decisions of 3 November 2026, about 3:00 to 3:30 PM PT, given in chat for the SGD qualification ladder (section 8). Each lane cites the decision it relies on in its commit message and updates any conflicting doc in the same change.**

11. **Reverse the no-clamp rule of 2 November.** A sphere bound to a surface is clamped at the surface's top by the renderer and reported as diverged; readouts keep the true value; the camera fit ignores the unclamped position. This replaces the "draw it where it is" and off-plot edge-marker instructions in `SIZE_RULES`. *Approved.*
12. **Un-defer the native trail and surface primitives** that FX-AN-030 set aside. Five client features behind flags, the way `curve_radius` was done: height-grid surface, updatable trail, text readout, arrow offset and tip anchor, clamp. *Approved.* This pulls the parametric-surface item forward out of AN-08.
13. **Allow a scene archetype block.** The universal author and planner rules stay general (decision 7 stands). A small table of archetypes, written as data about which primitives a scene shape uses and what its comparison states are, carries the subject-specific sentences now hidden inside `SIZE_RULES`; the planner names one when it fits. An archetype is added only when a shape recurs, never per request, and never selects a canned scene. *Approved.*
14. **Qualification budget.** Paid attempts for the ladder's two gates are approved; the budget is raised as needed. Recorded in `spend.md` as a new authorization line dated 3 November. *Approved; "raise the budget if needed and paid attempts are approved."*
15. **Continuation scope.** The ladder is a **scoped exception** to the AN-08 gate: AN-17 to AN-21 may proceed; AN-08 to AN-16 remain blocked on a separate continuation approval. *Approved, option (a).*
16. **Repair budget.** `animation_repair` goes to 24,000 output tokens at medium effort, accepting the higher displayed credit ceiling that follows from the worst-case bound. A patch-style repair bound to the base artifact hash (section 13, follow-up 2) is the better long-term design and stays in the ladder as later work. *Approved, option (a) for now.*
17. **Defaults the owner has not yet overturned** (recommended by the reviewing assistant, in force until the owner says otherwise): release mode per slice is the ordinary gate for contract and renderer slices and the fast path, once it exists, only for prompt-only and copy-only slices; billing, as decided by the owner on 3 November 2026 (it replaces the recommended full refund): the plan stage stays charged; the generation stage is escrowed and released on failure, up to 5 free failures per learner per day; the failure message is "You have not been charged."; on a retry only the final attempt is charged (built on `feat/animation-escrow`, `docs/features/animation/billing-escrow.md`).

20. **Answers to Parallel's eight questions (owner 3 November 2026, all as recommended).** (1) The billing item of AN-17 is satisfied by the escrow commit, and the plan text is updated. (2) AN-17 splits into **MVP2a** (escrow, copy line, Explore Top; ordinary gate; now) and **MVP2b** (streaming author call limited to the Animation roles behind a role flag, deadline, same-job retry, FX-AN-040 and FX-AN-043, repair at 24,000 tokens, strict-output evaluation; its own candidate; ordinary gate). (3) The copy line rides in MVP2a. (4) Explore Top is not held for AN-21: it is approved to go once Animation is live, and it rides in MVP2a. (5) Streaming is limited to the Animation roles, behind a role flag. (6) Gate 2 uses a second test session through the dev bypass, read by name. (7) Paid batches: announce the size and cost before each one and proceed; stop to ask only if cumulative spend would pass the plan's worst-case figure (about US$45 for both gates); a second Gate 1 batch does not need to ask. (8) The `--mvp` branch follows the escrow release, then takes a merge of `main`; AN-20 may use it once the owner sets `MVP_ALLOWED_SHA` (Parallel tells the owner when). In addition: MVP2b's receipt reports the new displayed credit ceiling from the 24,000-token repair (decision 16 stands; AN-22 brings it back down). *Approved.*
21. **Collapse the gates onto frozen candidates (owner, 3 November 2026).** Gates run on the dev preview of a **frozen** candidate, never after a release: Gate 1 on MVP3's frozen candidate while MVP3 releases; Gate 2 on MVP4's frozen candidate. Gate samples run in parallel across up to five dev test sessions (which also covers the per-user allowance); the dev platform day cap (US$40 on the dev clone) paces the batches. If Gate 2 passes the same day as Gate 1, MVP4 and MVP5 release as **one** release. *Approved.*
22. **Gate 1 carry-over rule (owner, 3 November 2026).** Gate 1 = author drafts under the AN-20 prompt files (imported into the harness at a frozen hash, with the golden exemplar at a frozen hash) against MVP3's contract and renderer on MVP3's preview. The preview's own server prompts are **not** what Gate 1 measures: the harness builds the author request itself through the admitted dev transport; the prompts release later as MVP4. Two conditions make the measurement carry over: (1) every Gate 1 table records three identities: the MVP3 candidate SHA, the prompt-files hash and the golden artifact hash; (2) MVP4's candidate is MVP3's release SHA plus the AN-20 branch with exactly those hashes, verified before Gate 2 starts; any difference means Gate 1 reruns on the real candidate, no exceptions. *Approved.*

23. **One combined fast-path release (owner, 3 November 2026).** One combined fast-path release carries MVP2b, MVP3, MVP4 and MVP5 after the `--mvp` branch and both gates pass. There is no separate MVP2b or MVP3 release. There is one integration branch and `main` is merged once, at the end. Gate 2 starts the moment MVP4's preview is up. If Gate 1 fails, the whole candidate is held and fixed; nothing partial ships. **Order change (owner, 3 November 2026, evening):** the final tree is one, so C4 = C5: the prompts, the harness, the AN-21 scripts, the copy-and-claim commit, the smoke and recovery tooling and the recovery-branch cut are all in it. Its isolated dev-clone preview is deployed immediately after the push, before CI is green, and both gates start on it; **the gates stand only if CI is green on that SHA.** Gates run on that preview of a frozen candidate (decision 21); they do not wait for the release.

24. **Decision 24 (owner, 4 November 2026).** Keep the 8-of-9 Gate 2 bar for one more cycle. C7 = C6 + the repair-slot fix for the correction ask + two `loss_surface` archetype lines (data only: the arrow scale keeps the largest typical step at the default rate under a quarter of the surface width; the camera line is "elevation 30 to 65 degrees, no azimuth, the whole surface and the path in view") + `framing.js` minimum camera elevation of 25 degrees for any scene with a surface node (the authored azimuth is kept). The golden is not changed tonight: its hash stays `1837a72b6366ee8a8bc78d66f05ea749a56088f413d981a5a7bd4ca9316265dc`. Gate 2 reruns clean on C7 (all ten jobs, the guard retuned: `--typical author=45,review=20,repair=45`). Gate 1 reruns because the prompt-files hash changes. Strict tool output is parked with AN-22 as a schema-restructure item (55 optional parameters against the limit of 24); the lenient parse is the fix for now.

Candidate lineage (4 November 2026): C8 = C7 + FX-AN-098, the review page's readout strip no longer drops text readouts (`card.js` `readoutLines`, `animation3d-render.js` `showOverlay`), so the reviewers see the Status word. No prompt file changed; the golden is unchanged.

Candidate lineage (4 November 2026): C9 = C8 + evidence + the owner's C9 list: the gate evidence for C3', C4, C6 and C7 (docs only, `docs/features/animation/evidence/`), camera floor 35 degrees, label caps and hiding a label when its arrow is too short, trail polylines as label obstacles, a ball-under-the-surface check, stripping fields that are irrelevant to the object kind, a trail-every-step archetype line, `pathLength` at the default step count, and the review role at 8,000 output tokens (decision 28). The prompt-files hash changes with it; the golden hash `1837a72b6366ee8a8bc78d66f05ea749a56088f413d981a5a7bd4ca9316265dc` does not.

Candidate lineage (4 November 2026): C10 = C9 + decision 29 azimuth line + decision 30 rim hold + label distance cap + primitives-check CI fix; platform day cap raised on the clone (decision 31); primitives-check fix: identical-frame redraw skip in session.js (FX-AN-107), fail-fast check. The prompt-files hash changes with the archetype file; the golden hash `1837a72b6366ee8a8bc78d66f05ea749a56088f413d981a5a7bd4ca9316265dc` does not.

Candidate lineage (4 November 2026): C11 = C10 + decision 34: the golden (the exemplar) retuned after the job-0 control rejected it (arrow scale, Full-batch step arrow and label, arrow colours, rim-consistent path); exemplar pin re-pinned (golden file ae82facb429a..., exemplar draft 9ae7fe47...); C10 CI green; golden and prompt-files hashes change; primitives check renamed slopeArrow->fullArrow.

Correction (owner, 5 Nov 2026): C11's first Gate 2 attempt (10:44-10:55 PM PT, release-gate2-c11b) was not wholly void. Jobs 1, 2 and 4 were REJECTED on their first review (majors in reviews.json attempt 1); only their repair reviews hit the provider workspace limit. First-round score on C11: 2 of 5 reviewed jobs accepted (jobs 3 and 5). CI for C11: verify 41787302354, fast-e2e 41787302348 (green after one rerun of e2e (4), ctrlk-handoff flake). C11 second attempt (8:22 AM PT, release-gate2-c11r, fresh users, job 0 passed): FAIL, 4 of the first 7 accepted; first-round: 1 of 6 (job 6); jobs 8 and 9 not run.

Candidate lineage: C12 = C11 + (a) golden gradual divergence + archetype clause + (c) trail tube cap + (d) rim-held marker y on the surface + g1 per-kind repair counters (run 2, review 2; calls.repair 4, calls.review 4, render rounds 5) + (b) three render-stage trace checks + (e) arrow-through-surface check; Generate line (new): "Generate: up to 591 credits; most animations use 50–100; a failed one is refunded." (the number is the server's max_credits); displayed ceiling 385 -> 591 credits (owner decision 35, approved); first-round and post-repair columns in the Gate 2 report; plan stage still charged on a failed build (about 5-19 credits); C13 = C12 + golden rounds 3-4 (trail point on the surface; noise scales with the rate, does not fade at the minimum; converged only at the lowest point within the noise).

Candidate lineage (4 November 2026): C12 g1 (feat/an20-g1) = C11 + decision 35 (owner-approved): the repairs are capped per kind, two for a validation or render problem and two for a review rejection, so a run problem no longer takes a slot the review needs (FX-AN-123); calls review 3 to 4 and repair 2 to 4; the displayed Generate maximum rises from 385 to 591 credits (5,905,440 micro-USD, derived by animationReservation; planning unchanged at 56) and the /animation card says "Generate: up to 591 credits; most animations use 50–100; a failed one is refunded."; Gate 1 prompt-files hash changes (animation-policy.js is in the list; the author request hash does not).

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
| Scene creation | Procedural primitives, groups, curves/lines/arrows and labels; original generated logic; bounded tube curves added as an MVP correction | Richer builders, lathe/extrusion, bounded instancing and reference-image interpretation |
| View/watch | Inspect/orbit; play, pause, restart, loop; supported speed control | Additional camera presets and compatible imported animation clips |
| Experiment | Sliders/numbers/toggles/selects/actions; computed readouts; declared selection and constrained drag are enabled in the MVP capability registry | Richer interactions and post-MVP component/asset manipulation |
| Mini-game | A small bounded single-player challenge with objective, actions, hint, outcome and reset; authored directional key bindings for focused games | Richer placement/drag tasks, walkthrough movement and Tutor evidence integration |
| Existing assets | Contract reserves immutable source references; no fake CAD replacement | Authorized attached models/CAD GLBs, multiple instances and source provenance |
| Assemblies | No assembly implementation required for MVP | Prescribed connected-part movement, scoped selection/editing, explicit joints and limits |
| Walkthrough | Not advertised as available | Focused WASD/right-drag camera, touch equivalents, bounded navigation |
| Physics | Analytical formulas and prescribed animation only; no physics-engine claim | Lazy Rapier rigid bodies, collision, supported joints, forces and bounded worlds |
| Save/reload/revision | Save accepted artifact, inputs, state and paused time; reset/retry; no late-response overwrite | Asset-aware revisions, sharing/fork permissions, safe physics restore policy |
| Reliability | Sandbox limits, bounded rendering, focus isolation, cancellation, last-good-state recovery | Multi-card lifecycle, imported-asset recovery, physics exhaustion/context-loss checks |
| Field and path scenes (added 3 Nov, section 8) | A continuous surface drawn from a height grid, a path that grows as the scene runs, a status word, vectors anchored off a moving marker, and a marker that cannot leave the drawn region; qualified first on gradient descent on a loss surface | Extrusions, lathes, instancing and image references stay in AN-08 |

**MVP is a vertical product slice, not a UI-only mock.** It must generate and persist an original procedural scene from a real request, after proposal confirmation, and demonstrate a watch experience, an adjustable experiment and a simple game. Fixtures enable parallel development, but fixtures alone do not establish real-generation acceptance.

**Full completion means all required post-MVP tasks and their acceptance checks pass.** Do not mark the feature complete because those controls are hidden. Unsupported future capabilities may be absent; required planned capabilities remain open.

Not in this plan: multiplayer, game marketplace, general game engine/editor, arbitrary imported scripts/shaders, cinematic character animation/rigging, photoreal reconstruction, CFD/fluids/soft-body science simulation, unlimited terrain, video export, manufacturing CAD edits or new billing products.

## 3. Scene, behavior and persistence architecture

### Naming and compatibility

Existing persisted `animation` is `/explain`'s 2D scene/program. **Do not repurpose it.** Use new internal block/primitive discriminator `animation3d` and schema `animation-scene/1`; public command remains `/animation`. Reconcile the exact primitive registry naming at kickoff and record any necessary alternate internal name before workers diverge. Preserve legacy `animation`, `/3d`, removed `/animate` semantics and old saved documents.

The current sandbox host also checks an exact artifact/SDK/renderer/policy tuple. Give the new path distinct identifiers (proposed `animation_program`, schema `1`, `animation-sdk-1`, `animation-renderer-1`, `animation-policy-1`) and verify their hash/policy stamps at admission. Do not widen `explain_program` schema 1/2 or silently reinterpret `renderer-1`. Reuse audited low-level runtime/worker mechanisms through a separate validated adapter. Existing signatures worth starting from are `runProgram(engine,{source,request,operation},limits)` and `createProgramHost({artifact,limits,createWorker})`; the latter's current artifact admission must not be bypassed.

### Shared interfaces to freeze in AN-01

This table preserves the original interface design. The MVP now has implementation modules; use section 13 and the pinned source for current exports and behavior. Do not create a second runtime/renderer merely to reproduce a proposed signature below:

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

**Contract additions in AN-18 (3 November, decisions 11 to 13), each behind an `ANIMATION_CLIENT_FEATURES` flag and refused for a client that did not declare it:** geometry kinds `surface` (a rows-by-cols height grid with contour lines) and `trail` (a polyline whose `points` a frame may update, with a fixed `trail` or `ghost` style); readouts with `kind: "text"` whose frame value is a short string; arrow `offset` and label `anchor: "tip"` for a label whose parent is an arrow; a sphere node's `clampTo` naming a surface node, applied by the renderer after the program's frame. The frame's node update gains `points` for trail nodes only. Every limit above still applies; the new kinds count against triangles and line points through `triangleCost` and `linePoints`.

**Behavior program:** preserve existing QuickJS isolation, fresh-context and deterministic seed behavior. Supply a 3D-specific SDK/data adapter; no Three.js imports in generated source. Expose pure initial-state/evaluate/reduce operations following existing runtime conventions. Add a bounded fixed-step event for time-dependent rules only where needed; analytic scenes can evaluate at time without mutating state. `evaluate` never secretly advances saved state.

**Event:** versioned discriminated union: parameter/action/select; object drag start/move/end; optional bounded `step` for an approved MVP rule-based scene; and post-MVP normalized movement/physics intent. Prefer event-driven games for MVP. Validate values, object IDs and ranges at the boundary. Camera orbit is presentation state; do not call the model or reducer for every camera pixel. Coalesce drag/movement input snapshots, serialize state transitions and use monotonic event/revision stamps. Do not flood the current 16-entry reducer queue with raw pointer/key events.

For stepped non-physics rules, the host owns a fixed `dt = 1/30 s` and monotonic tick index; simulated time is tick × dt. Process at most two sequential steps per displayed frame; do not coalesce/drop simulation steps and thereby change results. On sustained overload pause with an actionable message, preserving the last accepted step; do not catch up indefinitely. Seek/speed are capability-declared (initially prescribed/analytical only). Looping maps presentation time into the declared duration; it does not silently reset game progress.

### Current MVP limits and retained post-MVP design limits

At the production baseline, `animation3d/capabilities.js` selects phase `mvp`: 256 logical nodes, 100,000 procedural triangles, 4,096 line points, 8 parameters, 8 actions, 24 labels/readouts, 16 KiB program source and **zero attached source references**. Attached/imported-asset and physics limits below are retained design limits for later tasks, not enabled MVP capabilities. These are bounds, not measured performance promises. Do not increase global limits casually.

- Retain existing QuickJS limits: 16 KiB generated source, 256 KiB output, 32 KiB state, 50 ms generated operation, 250 ms worker watchdog, 16 MiB heap/32 MiB WASM/256 KiB stack, maximum 2 live program workers.
- Retain shared viewer policy: maximum 3 live WebGL viewers, one active inner interaction. Offscreen cards retain posters and persisted state; they do not retain unnecessary GPU resources or physics ticking.
- Current MVP: 256 authored logical nodes (wrappers/groups included), 100,000 procedural triangles after expansion, 4,096 line points, 8 parameters, 8 actions, 24 labels/readouts and zero attached sources. Post-MVP design: up to 8 attached sources and 16 instantiated source roots; imported descendants additionally count against a scene-wide 5,000-node ceiling.
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

## 4. Existing files and stack to reuse

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
| `.github/workflows/verify.yml`, `fast-e2e.yml`, `deploy-dev.yml`, `deploy-prod.yml`; `scripts/dev-deploy.mjs`, `dev-deploy-gate.mjs`, `prod-release.mjs` | Actual deployment enforcement. At the baseline these still require CI/gate evidence. The owner has authorized an explicit MVP exception covering both workflow waits and scripts; its implementation is a separate open task, not already part of this commit. |
| `scripts/ci/check-map.json` | Register/select new browser checks so a green workflow actually exercises the new feature |

### Animation modules at `caf7ee9bc` — read these before any AN-17 to AN-21 edit

Line numbers are at the production commit; they move as soon as a lane edits the file, so re-read before citing. Paths are under `packages/control-plane/src/` (server) and `packages/web/src/animation3d/` (web) unless given in full.

| File (lines) | What it owns | Touched by |
|---|---|---|
| `agents/animation-author.js` (162) | `ANIMATION_AUTHOR_SYSTEM`, `ANIMATION_REPAIR_SYSTEM`, `ANIMATION_REVIEW_SYSTEM`; `ARTIFACT_DRAFT` tool schema; `SIZE_RULES` at line 94 (the no-clamp sentences); `COMPACT_RULES` at 97 with `ANIMATION_DRAFT_BYTES` 14,500 at 83; `requireProgram` at 54 | AN-20 (prompts, archetype), AN-18 (schema fields), AN-17 (repair tool) |
| `agents/animation-brief.js` (116) | Planner prompt `PLANNER_BASE`, `PLAN_TOOL`, `PLAN_PARAMETER`; shared rule constants `HONESTY_RULES`, `HOST_CONTROL_RULES`, `WORK_RULES`, `ACCURACY_RULES`, `MOTION_RULES` | AN-20 (archetype field, assertions) |
| `animation-author.js` (116) | `authorStage`, `sealArtifact`, `programProblems`, `planProblems` at 72 (experience, behavior, controlProfile, parameters, timeline only), `clientProblems` at 94 (the client-feature refusal pattern), `validateStage` at 102 | AN-18 (`clientProblems` for five flags), AN-20 (plan assertions) |
| `animation-repair.js` (131) | `withProgram`, `draftOf`, `repairContent` (the repair is shown the program in its own block), `repairStage`, `fitProblems` at 117 (the review- and repair-request size preflight) | AN-17 (retry, diagnostic), AN-20 (re-measured bound) |
| `animation-review.js` (143) | `buildReviewContent`, `loadCaptures`, `repairableFindings`, `ANIMATION_REVIEW_LIMITS`, `reviewArtifactView` | AN-19 (trace shows true and clamped values), AN-20 (severity) |
| `animation-render.js` (232) | `captureManifest`, `captureStates`: which states are captured (up to 6, 4 action events each, 90 host steps) | AN-19 |
| `animation-policy.js` (195) | `ANIMATION_MODEL` 'claude-opus-5-5' at 20; `ANIMATION_ROLES` with `maxInputTokens` and `maxImages` at 26; `ANIMATION_LIMITS` at 34 (`calls`, `repairs`, `deadlines.callMs` 120,000 at 49, read nowhere); `animationRequest`, `checkAnimationRequest`, `callAnimationRole` at 181 (`output_limit` on `max_tokens`), `roleFailure` at 150, `replyDiagnostics` at 170 (`partialTool` only on a refused reply) | AN-17 |
| `animation-job.js` (1046) | The `AnimationJobs` Durable Object: stages, counters, attempts, recovery list, `paidCall`, the settle path for credits | AN-17 (billing, retry) |
| `learn-models.js` (95–104) | Role settings: brief 4,000 medium; author 24,000 medium; review 6,000; repair 12,000 low | AN-17 (repair 24,000 medium) |
| `ask.js` (291–366) | `anthropic()` chokepoint; `anthropicTransport` with the non-streaming `fetch` to the Messages API at 344, `signal: env.CAD_MODEL_ABORT_SIGNAL` only | AN-17 (streaming, deadline) |
| `contract.js` (414) | `GEOMETRY_KINDS` at 31; `ANIMATION_PROGRAM_CONTRACT` at 51 (`labels` at 54: a label is a child at its object's edge); geometry schema 99–111 (arrow at 107: `{length}` along +Y from the node origin); node schema 113; readouts 132 (number only); `FrameSchema` 145–152 (node update: position, quaternion, scale, visible, text; readouts `record(id, number)`; `goal` games only); `triangleCost` 177; `validateAnimationArtifact` 290; `validateAnimationFrame` 349 | AN-18 |
| `capabilities.js` | `ANIMATION_CAPABILITIES` (phase, limits: 256 nodes, 100,000 triangles, 4,096 line points, 24 labels and readouts, 16 KiB source); `ANIMATION_CLIENT_FEATURES` `['curve_radius', 'action_motion']` | AN-18 |
| `scene.js` (399) | `meshGeometry` at 168 (curve: `TubeGeometry` with radius, else a 1 px line); `buildAnimationScene` at 188; arrow composed at 210–214 (shaft from the node origin, no offset); `layoutLabels`, `declutterLabels`, `LABEL_PIXELS` | AN-19 |
| `framing.js` (236) | `FRAMING` at 35; `sampleAnimationFrames` at 46; `subjectPoints` at 102 (the camera fits to what moved, so an unclamped diverged ball widens the view); `fitCameraToPoints` 181 | AN-19 |
| `renderer.js` (244), `session.js` (311), `review.js` (132), `runtime.js`, `state.js` | Three.js lifecycle; host clock and actions; the review page's two views and capture; QuickJS adapter; snapshot commit | AN-19 |
| `Animation3DCard.jsx`, `animation3d/Controls.jsx`, `client.js` | The card, its controls, the client feature declaration | AN-17 (copy line, failure message), AN-18 (features) |
| `fixtures.js` (245), `learning-examples.js`, `testdata/` (`fx025-game-candidate.json`, `stepped-game.mjs`) | Fixtures; the golden SGD artifact lands in `testdata/` | AN-19 |
| `*.test.mjs` beside each web module; `packages/control-plane/test/animation-*.test.js` (`animation-fit.test.js` measures the request bounds) | Existing suites to extend, never replace | all |
| `docs/features/animation/fix.md` (FX-AN-001 to 042), `spend.md` (to 2 Nov), `checklist.md` (stale), `old-client-compatibility.md`, `planner-eval.md`, `mvp1-correction-evidence.md`, `receipts/` | The ledgers this plan requires; new fix entries start at **FX-AN-044** (FX-AN-043 is the prepared repair-retry patch) | all |
| `scripts/ci/check-map.json`; `packages/web/e2e/animation-mvp-check.mjs` | Browser check registration and the MVP check (steps 21 and 42 intermittent) | AN-19, AN-21 |
| Outside the repository: `C:/s/spec/animation/sgd-mvp1-acceptance/` (`export-4/` to `export-6/`, `final-fix3/FX-AN-040.patch`, `final-fix4/trace-repair1.json`, `spend-ledger.md`, `ACCEPTANCE-RESULT*.md`), `C:/s/spec/animation/release/` | Retained job exports, prepared patches, today's spend ledger, release tooling | AN-17, AN-19, AN-21 |

### Dependency and model policy

- Inspected web stack: React `^13.2.8`, Three.js `^0.186.0` (lock: `0.186.0`), Zod `^4.5.4`, Zustand `^4.5.7`; QuickJS core/WASM `0.32.0`. Keep installed compatible versions and lockfile authoritative. Do not upgrade unrelated dependencies.
- Historical design-baseline `/explain` configuration was `claude-opus-5-5` with brief 4,000, author 10,000, review 3,000 and repair 6,000 max output tokens. Do not apply those old values to the implemented Animation roles. Current Animation settings are recorded below from `learn-models.js` at the production commit.
- Existing JEV configuration is gateway `typesafe-ai/jev` or direct `jev-1.13.0` in `learn-grade-jev.js`. Reuse the configured route and its uncertainty/timeout behavior. Do not substitute the generic artifact task's different Auto-model default for the dedicated Animation pipeline.
- Implemented `/animation` roles use Anthropic `claude-opus-5-5` through the existing billing transport: brief 4,000 output tokens / medium effort; author 24,000 / medium; review 6,000 / model-default effort; repair 12,000 / low. These are source settings at the pinned commit, not provider usage measurements. Tool choice is `auto`; exactly one returned tool call is checked by the host. No silent fallback or automatic model escalation.
- **Changes the ladder makes to the above (AN-17):** repair becomes 24,000 / medium (owner decision 16); the author and repair calls stream and accumulate the message instead of one non-streaming `fetch`, with an abort deadline (author 300,000 ms); a 524 or `provider_unavailable` on the author call is retried once in the same job without consuming the author ceiling; the author's and repair's required-field enforcement is evaluated against the provider's strict tool-use option, verified in the current API documentation before any flag is set, because the recorded `missing_program` case was a normal `tool_use` stop at 6,053 of 12,000 tokens with the field simply absent. Model identity stays `claude-opus-5-5` for every role; a model comparison for the author role is permitted only inside the AN-20 offline harness, as a labelled experiment, and changes nothing in production without an owner decision.
- Measured on today's runs: a settled SGD author call is about 13,700 output tokens and 87 to 126 seconds; the grid game's whole accepted job settled 24.76 credits (plan 5.01, author 11.53, review 8.22); a failed SGD job settles 100 to 133 credits.
- Use deterministic validators before model review. The implemented per-job ceilings are brief 1, author 1, repair 2 and review 3; the review allowance includes the bounded malformed/prose-review retry. Validation/run repair and review repair share the bounded job policy; retries do not reset it. Rendering allows up to 3 rounds with 2 views × 3 states = 6 captures per round. Repair receives at most 2 images. A repaired candidate is revalidated, rendered and reviewed before acceptance. The 120-second call deadline constant exists but FX-AN-041 reports it is not wired as an author-call timeout; do not claim it is enforced.
- Preserve truthful accounting semantics: the current `/explain` worst-case admission check is **not a parent reservation**; individual calls are admitted/charged through existing transport. Animation must enforce its declared combined call/spend bound and reconcile actual per-call holds without presenting an admission check as reserved funds. If strict parent reservation requires new billing work, document the exact change instead of claiming it already exists.
- Routine tests use fixtures. Real-generation acceptance uses verified authorized access and a feature-specific spend ledger. Missing paid authority does not block UI/runtime/fixture progress, but real-generation acceptance remains unverified.
- No React Three Fiber, Drei, XState, new Python CAD backend, rendering server, asset marketplace or general-purpose JS iframe engine is required.

Official implementation references (verify against pinned versions when implementing):
- Three.js: https://threejs.org/docs/ — GLTFLoader, OrbitControls, Raycaster, InstancedMesh, TubeGeometry, ExtrudeGeometry, LatheGeometry.
- Rapier JavaScript: https://rapier.rs/docs/user_guides/javascript/getting_started_js/
- Prior procedural authoring reference only: https://github.com/rohitg00/ai-engineering-from-scratch/blob/fe6c657dfb8d02cc898fcee7d4cfbf663aae1416/skills/lesson-screen/references/build.md

## 5. New files, ownership and no-idle execution

The original kickoff used **six ownership lanes: Parallel + five workers**, shown below. Preserve ownership for continuing work; this historical staffing plan does not require starting another team to update documentation or repeat completed implementation. New work uses the current release baseline and applicable project instructions.

| Agent | Owns | Independent work while dependencies land |
|---|---|---|
| P — Parallel/integration | All existing shared registry/canvas/route/package/lockfile edits; plan/checklist/fix log; release candidates | Integrate small commits, reconcile overlaps, run required checks, maintain preview and receipts |
| R — runtime/renderer | New `animation3d/contract.js`, `capabilities.js`, `runtime.js`, `renderer.js`, `state.js` and colocated tests | Contract fixtures, malicious/oversized cases, lifecycle and deterministic simulation |
| G — generation | New server `animation-brief.js`, `animation-author.js`, `animation-render.js`, `animation-review.js`, `animation-repair.js`, `animation-job.js`, `animation-policy.js`; tests | Fake-transport pipeline, source/approval/cost validation, later approved model acceptance |
| U — UI/interaction | New `Animation3DCard.jsx`, `animation3d/Controls.jsx`, `animation3d/interaction.js`, `animation3d/client.js` and tests | Build card against frozen fixtures; narrow-width, focus and loading/recovery checks |
| A — assets/context | New `animation3d/storage.js`, `animation3d/assets.js`, `animation3d/context.js`; post-MVP `assembly.js`, `geometry.js`, `physics.js` with tests | MVP state persistence/revision adapter and reference contract; after approval asset/assembly/physics work |
| V — verification/Tutor | New server `animation-evidence.js`; `packages/web/e2e/animation-*-check.mjs`; acceptance fixture/receipt assets | Independent oracles, proposal races, saved-state/permission cases, registered browser checks |

Shared files have **one writer: P**. Workers deliver new modules plus small integration instructions/patches; P applies shared-file changes. R owns renderer API; A implements later geometry/assembly/physics adapters behind that API, not competing edits to `three-d-renderer.js`. V proposes Tutor route hooks; P integrates them. A conflict-resolution commit is a new reviewed artifact.

**Lanes for the SGD ladder (AN-17 to AN-21), using the same letters.** Each is a worktree off `main` at `caf7ee9bc`, one owner, a hand-back per `CLAUDE.md`. The shared contract (AN-18) has one writer; every other lane consumes the committed interface.

| Lane | Task | Starts | Depends on |
|---|---|---|---|
| G + P | AN-17 honest failure, transport, repair, billing, copy | now | nothing; releases first (MVP2a, then MVP2b) |
| R | AN-18 contract primitives | now | nothing |
| R + V | AN-19 renderer, framing, golden artifact | after AN-18 lands | AN-18 |
| G + V | AN-20 prompts, archetype, assertions, offline harness, Gate 1 | prompt cut and harness now; archetype and exemplar after AN-19 | AN-19 for the exemplar |
| V + P | AN-21 full-pipeline qualification, release, canary | after Gate 1 passes | AN-17 to AN-20 |

Freeze only the interfaces and small contract fixture in AN-01, then start R/G/U/A/V concurrently. Do not wait for perfect abstractions. If one task is blocked, log the exact dependency, timebox one focused diagnosis (about 20–30 minutes), and take another authorized task in the same phase. A worker should not spin on a missing API when it can implement against the frozen fixture. Do not bypass the MVP approval gate to keep workers busy.

## 6. Milestones and mandatory push points

Targets below are working-order goals, not promised elapsed delivery times. At kickoff P provides estimates based on actual reuse and staffing, updates them only when evidence changes, and never substitutes a time estimate for a working preview.

| Milestone | Required tasks | What the owner can try | Mandatory push/receipt |
|---|---|---|---|
| M0 — kickoff contract | AN-01 | Plan/task inventory and declared capability contract | Push branch, plan, checklist and `fix.md` immediately |
| M1 — first visible slice | AN-02 + AN-03 fixture integration | Real 3D watch/experiment/game card shells and working local controls | Push/dev preview as soon as usable; explicitly labelled fixture examples |
| M2 — generated slice | AN-04 + AN-05 + AN-06 integration | Request → recommendation → edit → confirm → generated original scene → save/reload | Push working vertical slice; show real vs fixture evidence and spend |
| M3 — MVP ready for decision | AN-07 | All MVP acceptance flows and recovery | Freeze candidate; push complete MVP receipt and ask owner to approve continuing |
| **MVP1 — released 3 Nov, 3:09 PM PT** | AN-01 to AN-07, limited scope | Games and mechanisms generate, run, save and reload in production; SGD does not | Done: `caf7ee9bc`, run 41736512175. Open: owner signed-in smoke (section 13) |
| **MVP2a — honest failure, now (section 8, AN-17, decision 20)** | AN-17 (billing escrow, copy line) with Explore Top | A failed generation says "You have not been charged." and is refunded, and a retried job is charged only its final attempt; the request says loss surfaces and optimizers are not supported yet; Explore Top goes out | Built on `feat/animation-escrow`; one candidate; ordinary gate (billing is server code), now |
| **MVP2b — transport and repair (section 8, AN-17, decision 20)** | AN-17 (the rest) | The author call streams with a deadline and one same-job retry; FX-AN-040 and FX-AN-043 applied; repair at 24,000 tokens; strict output evaluated; an author timeout no longer ends the job | Its own candidate; ordinary gate |
| **MVP3 — the five primitives (AN-18 + AN-19)** | AN-18, AN-19 | The golden SGD scene renders on the dev preview as a labelled fixture: smooth surface, clamped diverged ball, trail and ghost, status word, visible arrows | Push contract and renderer together; ordinary gate; owner looks at the fixture; Gate 1 runs on its frozen candidate's dev preview while it releases (decisions 21 and 22) |
| **MVP4 — prompts and Gate 1 (AN-20)** | AN-20 | The AN-20 prompts, archetype, assertions and harness on MVP3's release SHA. Gate 1 (decision 22): 20 author-only samples on a pinned SGD plan, plus a regression set of three known-good plans, drafted under the AN-20 prompt files against MVP3's contract and renderer on MVP3's preview; the owner looks at the captures. MVP4 is the frozen candidate Gate 2 runs on | MVP4 is MVP3's release SHA plus the AN-20 branch with the hashes Gate 1 recorded, verified before Gate 2 starts; fast path allowed once it exists (prompt-only), else ordinary gate; releases with MVP5 as one when both gates pass the same day (decision 21) |
| **MVP5 — SGD qualified (AN-21)** | AN-21 | Gate 2: ten full-pipeline SGD jobs on MVP4's frozen candidate's dev preview, 8 of 10 accepted; SGD returns to the claimed list; weekly canary | Push after Gate 2; ordinary gate; owner `!` command to `main`; one release with MVP4 when both gates pass the same day (decision 21) |
| **APPROVAL GATE** | **Owner explicitly approves continuation beyond the ladder** | Owner feedback may adjust the following scope | **Record approval; no AN-08 onward implementation beforehand** |
| M4 — assets and richer scenes | AN-08 + AN-09 | Image-informed procedural scene; attached model in a scene | Push both independently useful slices |
| M5 — direct interaction | AN-10 + AN-11 | Multi-part assembly and focused walkthrough/game controls | Push each working flow; no physics dependency for prescribed motion |
| M6 — physics | AN-12 | Bounded real collision/joint experiment with reset | Push physics slice and lazy-load/performance evidence |
| M7 — connected product | AN-13 + AN-14 | Tutor activity discussion, scoped revisions, permitted share/fork | Push integrated full candidate |
| M8 — complete release | AN-15 + AN-16 | All agreed flows in the deployed, enabled release | Exact-SHA checks, activation/user-flow evidence, remaining owner actions only |

**Release plan as of decision 23.** MVP2b, MVP3, MVP4 and MVP5 are not released one by one: they ship together as one fast-path release carrying the final tree (C4 = C5, see decision 23), after the `--mvp` branch has landed and Gate 1 and Gate 2 have passed on its frozen candidate's preview. The rows above keep their task content and acceptance; read their "release" cells through this paragraph.

Do not save all pushes for milestones. Each independently tested coherent change gets committed and pushed immediately to its worker branch, linked to an AN task. P integrates ready slices continuously. Keep each release candidate identifiable and avoid restarting qualification for cosmetic or unrelated changes. For explicit MVP releases, broad CI/full gates are nonblocking under section 14; run them independently when useful. Ordinary/full-feature release requirements continue to apply outside that explicit mode.

## 7. MVP1 tasks AN-01 to AN-07 — implemented and released at `caf7ee9bc`

Nothing here is new work. The full subtask lists, with each implemented item checked, are in 14.7. What is still open from these tasks is either an owner action (13.7) or part of the SGD ladder (section 8).

| Task | What it built | State at `caf7ee9bc` | Still open |
|---|---|---|---|
| AN-01 kickoff, compatibility, shared contracts (P + R) | `contract.js`, `capabilities.js`, `fixtures.js`, tests; `animation3d` internal name; legacy `animation` preserved | Implemented, released | Documentation sync of the repository plan and checklist (AN-17's first commit) |
| AN-02 trusted 3D viewer and procedural geometry (R) | `renderer.js`, scene compilation, labels, review capture path, tube curves | Implemented, released | Owner's signed-in visual check in production (13.7) |
| AN-03 card, proposal settings, focused controls (U; P) | `Animation3DCard.jsx`, `Controls.jsx`, `interaction.js`, `client.js`; `/animation` registry entries; playback badge; reset separation; directional keys | Implemented, released | Owner smoke (13.7) |
| AN-04 sandbox behavior, looping, atomic state (R + U) | QuickJS adapter `runtime.js`, `state.js`, `session.js`; one-step actions (`startsMotion`) | Implemented, released | Clamp semantics for a surface-bound marker (AN-19) |
| AN-05 planner, authoring, review, durable generation (G; P) | `animation-{brief,author,render,review,repair,job,policy}.js`; the Durable Object `AnimationJobs`; client features `curve_radius`, `action_motion` | Implemented, released; grid game accepted through the real pipeline | SGD never accepted (section 8); FX-AN-040, 041, 043 (AN-17); rejected-generation billing (AN-17) |
| AN-06 persistence, versions, cancellation, hydration (A; P) | `storage.js`, `assets.js` (reference-only), `context.js`; durable result reads | Implemented, released | Owner's reload-without-a-new-job check (13.7) |
| AN-07 MVP qualification and owner decision (V + P) | `animation-mvp-check.mjs` registered; dev preview; limited acceptance on the grid game; production release and read-only checks | Limited acceptance passed; MVP1 released | Real generated watch and experiment cases beyond fixtures (the SGD ladder covers experiment); full qualification stays AN-15; continuation approval for AN-08 onward not given |

## 8. SGD qualification ladder — AN-17 to AN-21 (owner-approved 3 November 2026)

**Closeout.** Decision 38 superseded the kickoff release sequence below. The implementation shipped in C14b under the MVP fast path. Checked items describe delivered or verified work. Open qualification items are parked under that decision. [Decision 38](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/superpowers/plans/2026-10-30-animation.md#L1122) · [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)

**Original goal.** Qualify SGD generation on a frozen candidate. Gate 1 requires at least 16 of 20 valid, owner-accepted SGD captures and 9 of 9 clean regressions. Gate 2 requires at least 8 of the first 9 full jobs accepted and a wrong-subject control that does not silently become SGD.

### Why SGD fails — read against the code at `caf7ee9bc`

The author obeys its rules. The rules and the contract produce the scene the reviewer rejects. Each recurring reviewer finding has one cause in the code:

| Reviewer's recurring major finding | Cause in the code | Where |
|---|---|---|
| The diverged ball is drawn at its true height (about 5.6 against a rim at 2), floats above the bowl, and the bowl shrinks in the frame | `SIZE_RULES` (owner, 2 November) says never clamp a drawn position; draw a value outside the drawn area where it is and let the card fit the view. `subjectPoints` then fits the camera to whatever moved, so the ball at y=5.6 drives the fit. The plan promised "very large losses are capped on screen"; the author followed the system prompt over the plan; the reviewer rejected the result. Three roles, contradictory instructions. | `agents/animation-author.js:94`, `framing.js:102` |
| The surface has only 3 to 4 rings plus 2 cross-sections | There is no surface geometry. `GEOMETRY_KINDS` is box, sphere, cylinder, cone, plane, line, curve, arrow, label. A bowl is hand-built from tube curves, one geometry and one node per ring, inside the 14,500-byte budget `COMPACT_RULES` sets for the whole artifact and program. The review prompt then says to fail "a surface drawn as a few thin rings". | `contract.js:31`, `animation-author.js:83,97,158-159` |
| Trail and ghost dots pile up; the current path cannot be told from the kept one | A frame may update a node's position, quaternion, scale, visible and text only; curve points are static. A trail is N pre-declared sphere nodes at about 65 bytes each. FX-AN-030 measured 82 of 98 nodes as trail markers and wrote that the native-trail redesign was not needed for that candidate. | `contract.js:145`, `fix.md` FX-AN-030 |
| Status shown as a numeric code, not a word | Readouts are `record(id, number)`. `goal.message` is refused outside games ("only a game reports a goal"). The only text channel is a label's `text`, which `LABEL_RULES` tell the author to avoid for changing values and which the layout hides when crowded. | `contract.js:149,162` |
| Arrows start at the ball's centre and are hidden inside it | The arrow shaft is composed from the node origin along +Y with no offset. Parented to the ball, its tail is inside the sphere. | `scene.js:210-214` |
| Arrow labels sit at the ball, not at the tips | `ANIMATION_PROGRAM_CONTRACT.labels`: a label is a child node of the object it names, at that object's edge. A child of the arrow node sits at the arrow's origin. | `contract.js:54` |
| The plan promised a cap the program does not implement | `planProblems` checks experience, behavior, controlProfile, parameters and timeline only. Nothing compares the plan's prose promises with the program, and the author's own rules forbade the cap. | `animation-author.js:72` |

**The loop behind all of it.** Every incident (aj_283c19f, aj_086fd46, aj_ad936ec1, aj_ba11d5a, accept-2, accept-3, accept-5) became a sentence in `ANIMATION_AUTHOR_SYSTEM`. The prompts grew; the review and repair requests grew with them; `ANIMATION_DRAFT_BYTES` had to fall to 14,500 (its own comment at line 83 says "once the review and repair prompts grew"); drafts got sparser; the reviewer found more; more sentences followed. Decision 7 ("never subject-specific") is kept in letter only: `SIZE_RULES` is about gradients, updates, bowls and off-plot markers, written as universal law.

**What this means for the fix.** The finding list is closed by the contract and the renderer, not by the prompt. A finding becomes a contract default, a renderer behavior, a validator check or an archetype line, in that order of preference. The universal prompt gets shorter from this work, and the draft budget goes back up on its own. Section 13's four follow-ups (13.6) map onto the ladder: follow-up 1 (strict tool output) is in AN-17; follow-up 3 (reusable visualization helpers) is AN-18 and AN-19; follow-up 4 (numerical and visual-review calibration) is AN-20; follow-up 2 (patch-style repair) stays after the ladder as AN-22, listed in section 9.

### Rules for the ladder

- No new sentence in `ANIMATION_AUTHOR_SYSTEM` or `ANIMATION_REPAIR_SYSTEM` for an individual finding.
- No raising a role's `maxInputTokens`, no shrinking a plan's step count, no telling the author to use fewer nodes. A draft that does not fit means the contract is still too verbose.
- No full-pipeline SGD job until Gate 1 passes. The retained drafts, the offline harness and the dev preview's review page are the iteration loop.
- The harness never changes under a measurement. Freeze the candidate SHA before Gate 1 and before Gate 2; a change to `contract.js`, `scene.js`, the prompts or the capture text restarts the gate it was in.
- Reviewer severity is about the learner: a finding that would not stop a learner reading the idea is minor and never blocks.
- The golden SGD artifact is a fixture and an exemplar. It is never served as a canned result (decision 7; section 13 follow-up 3).
- Every paid run gets a `spend.md` row with the candidate SHA; every unit gets a `fix.md` entry from **FX-AN-044**; the ledger gets a child UUID per unit under one ladder UUID.
- Each MVP is pushed, released and verified before the next starts its release. Development overlaps; releases serialize.

### The ladder at a glance

| Task | Delivered | Recorded verification or remaining status |
|---|---|---|
| AN-17 | Generation escrow, streaming and deadlines, same-job retry, repair fixes and 24,000-token repair cap | Focused coverage and release CI. Strict-output evaluation complete. Schema redesign parked under AN-22. |
| AN-18 | Surface grids, trail points, text readouts, arrow anchors and clamping | Contract tests and old-client HTTP 409 coverage. |
| AN-19 | Three.js renderer, camera framing, traces and the labeled golden SGD fixture | Browser fixture check and C14 product-review acceptance for the golden. |
| AN-20 | Shorter prompts, loss-surface archetype, assertions and author harness | C14 validated 20/20 SGD and 8/9 regression drafts. Full Gate 1 acceptance remains open. |
| AN-21 | Qualification harness, request copy update and scoped C14b release | C13 Gate 2 accepted 7/9. Both C14 targeted reruns were rejected. Qualification, capability claim and canary parked. |

[C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md) · [C13/C14 evidence](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/evidence/README.md#L125)

### AN-17 — Honest failure, transport, repair and billing (G + P) — MVP2a and MVP2b

**Status:** Billing escrow shipped first. The remaining transport and repair work shipped with C14b. Strict-output evaluation is complete. The schema redesign is parked under AN-22.

**Files:** `animation-job.js` (settle path, retry), `animation-policy.js` (`deadlines`, `roleFailure`, `callAnimationRole`), `ask.js` (`anthropicTransport`), `learn-models.js`, `agents/animation-author.js` (repair tool only), `animation-repair.js`, `Animation3DCard.jsx` and the request UI (copy, failure message), `docs/features/animation/fix.md`, `spend.md`, `checklist.md`, this plan under `docs/superpowers/plans/`.

**MVP2a**

- [x] Commit this plan (v3) to `docs/superpowers/plans/2026-10-30-animation.md`; sync `checklist.md` (it still named candidate `c9d0c5509`); add the 3 November budget line and today's runs (from `C:/s/spec/animation/sgd-mvp1-acceptance/spend-ledger.md`, 538.10 credits against the 620 acceptance cap) to `spend.md`. One commit, no code. *Done on `feat/animation-escrow` (owner decisions 11 to 17 and 20, 3 November 2026).*
- [x] Ship the original MVP2a request copy. C14b superseded the temporary loss-surface limitation sentence with the final Decision 38 wording.
- [x] Billing on a rejected generation. *Built on `feat/animation-escrow`; the owner's final design (3 November 2026, replacing the recommended full refund): the plan stage stays charged; the generation stage is escrowed, its calls settle as they run and an attempt that fails or is stopped has them released at once; at most 5 refunded failed attempts per learner per day, counted per attempt; the failure message is "You have not been charged."; a job that fails, is retried and then succeeds is charged only its final attempt (the job's attempt at ready); the platform ledger keeps the provider cost; jobs made before the change keep the old rules. Unit tests: a rejected job leaves only the plan charged, an accepted job its calls, a retried job only its final attempt, replays change nothing. No migration. Design, states and risks: `docs/features/animation/billing-escrow.md`.*

**MVP2b**

- [x] Stream author and repair calls by default, with Animation role deadlines and a recovery flag. The streaming call deadline is 300 seconds.
- [x] Retry transient failures in the same job after the configured delay without counting a refused call against the author limit (FX-AN-041).
- [x] Apply the label-rendering fix and its legibility test (FX-AN-040).
- [x] Retry a repair reply that omits the program and retain the raw reply in diagnostics (FX-AN-043).
- [x] Raise repair output to 24,000 tokens at medium effort and recompute the credit bound. See the fix log for the updated bound.
- [x] Evaluate strict tool output against the current schema. The repair schema exceeds the supported optional-field limit. AN-22 tracks the redesign.
- [x] Record release verification. C14b verify and fast-e2e passed, and the production read-only check confirmed the final request copy.

**Release evidence.** See the [fix log](../../features/animation/fix.md) for the implementation fixes and [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md) for the release CI and read-only production checks. The signed-in production SGD smoke belongs to the parked qualification work.

### AN-18 — Contract primitives and client compatibility (R) — MVP3, first half

**Status:** Implemented and released in C14b, with contract and old-client compatibility coverage.

**Files:** `contract.js`, `capabilities.js`, `animation-author.js` (`clientProblems`), `agents/animation-author.js` (`GEOMETRY`, `NODE`, readout and arrow fields in `ARTIFACT_DRAFT`), `client.js` (declares the features), `contract.test.mjs`, `fixtures.js`, `docs/features/animation/old-client-compatibility.md`.

Each feature is a new entry in `ANIMATION_CLIENT_FEATURES`; `clientProblems` refuses it for a client that did not declare it; an older stored artifact that uses it answers 409 `client_update_required` as `curve_radius` does.

| Flag | Schema change | Validator rule |
|---|---|---|
| `surface_grid` | geometry `{kind:"surface", heights: number[][], width, depth, contours?: int}` | 4 to 64 rows and cols, rectangular; `triangleCost` = 2(rows−1)(cols−1); contours 0 to 16 count against line points |
| `trail_points` | geometry `{kind:"trail", max: int, radius?, style: "trail" or "ghost"}`; frame node update gains `points?: vec3[]`, accepted only on a trail node | `points.length` ≤ `max` ≤ 512; `style` fixes the material (trail: the node's material, solid; ghost: 40% opacity, half radius); points count against line points at `max` |
| `text_readout` | readout gains `kind?: "number" or "text" (default number)`; frame readouts accept a string of at most 40 characters for a text readout | a text readout carries no `unit` or `decimals`; a number for a text readout, or a string for a number readout, is `invalid_value` |
| `arrow_anchor` | arrow gains `offset?: number`; label gains `anchor?: "origin" or "tip"`, honoured when the label's parent is an arrow node | `offset` < `length`; `anchor` on a non-arrow parent is `invalid_value` |
| `clamp` | node gains `clampTo?: {node: <surface node id>, max?: number}` | the node is a sphere; the target is a surface node; one clamp per node |

- [x] Extend the artifact contract, validators and cost checks for the five scene capabilities. Existing artifact fields remain compatible.
- [x] Declare the five capabilities in current clients and return HTTP 409 `client_update_required` when an older client lacks one a scene needs.
- [x] Extend the author tool schema to match the artifact contract.
- [x] Cover the new fields, validation bounds, old artifacts and missing client capabilities in contract and route tests.
- [x] Add a fixture that exercises all five features and document the compatibility rules.

**Verification.** See [old-client compatibility](../../features/animation/old-client-compatibility.md) and the C14b release receipt.

### AN-19 — Renderer, framing and the golden SGD artifact (R + V) — MVP3, second half

**Status:** Implemented and released in C14b. The labeled golden fixture passed C14 product review.

**Files:** `scene.js`, `framing.js`, `session.js`, `review.js`, `renderer.js`, `animation-render.js` and `animation-review.js` (trace content), their tests, `testdata/sgd-golden.json`, `fixtures.js`, a new `packages/web/e2e/animation-primitives-check.mjs` registered in `scripts/ci/check-map.json`.

- [x] Render height fields and contours, reuse trail geometry, and place offset arrows and tip-anchored labels in the Three.js scene.
- [x] Hold a clamped marker at the displayed surface or explicit maximum and keep true coordinates in the trace. The readouts preserve the true value.
- [x] Frame the drawn scene using the clamped marker. Deterministic frame tests cover the out-of-bounds case.
- [x] Include clamp information in the review capture and reviewer prompt.
- [x] Validate and render the checked-in golden SGD artifact. The product reviewer accepted the golden on C13 and C14.
- [x] Expose the golden as a labeled fixture card.
- [x] Add and register `animation-primitives-check.mjs` for the fixture's rendering, motion, clamp and compatibility checks. A separate route test verifies the real old-client HTTP 409.

**Verification.** The golden is a hand-authored fixture. The receipt records its product-review results separately from generated SGD jobs. [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)

### AN-20 — Prompts, archetype, plan assertions and the offline harness; Gate 1 (G + V) — MVP4

**Status:** Authoring changes and harness shipped. The C14 batch validated 20/20 SGD drafts and 8/9 regression drafts. Full Gate 1 acceptance remains open.

**Files:** `agents/animation-author.js`, `agents/animation-brief.js`, `animation-author.js` (`planProblems`), `contract.js` (plan `archetype` and `assertions` fields), `animation-repair.js` (`fitProblems` re-measured), `packages/control-plane/test/animation-fit.test.js`, new `scripts/animation/author-sample.mjs` and `author-sample-report.mjs`, `docs/features/animation/planner-eval.md`.

- [x] Trim the universal author prompt to the general sizing and geometry rules.
- [x] Add the `loss_surface` archetype and use the pinned golden as an authoring exemplar.
- [x] Validate the plan's clamp, comparison range and path-length assertions before review.
- [x] Update the reviewer prompt to separate visual polish and renderer behavior from author errors.
- [x] Measure fit and raise the draft cap from 14,500 to 15,700 bytes. The original target was 20 KB.
- [x] Add `author-sample.mjs`, its report tool, and the pinned regression plans. Record the C13 and C14 author batches.
- [ ] **Regression acceptance (parked).** C14 validated 8/9, below the required 9/9.
- [ ] **Full Gate 1 acceptance (parked).** C14 validated 20/20 SGD drafts. Full acceptance also requires the regression pass and at least 16 owner-approved captures. [C13/C14 evidence](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/evidence/README.md#L125)

**Release evidence.** The authoring changes shipped in the scoped C14b release under Decision 38. [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)

### AN-21 — Full-pipeline qualification, release and canary (V + P) — MVP5

**Status:** The harness and scoped release are complete. Gate 2, the SGD capability claim and the canary are parked under Decision 38.

**Files:** new `scripts/animation/sgd-qualify.mjs`, the product copy touched in AN-17, `docs/features/animation/` ledgers and receipts, a scheduled task for the canary, `checklist.md`.

- [x] Add `sgd-qualify.mjs` and record the C13 full-pipeline batch and C14 targeted reruns.
- [ ] **Gate 2 (failed and parked).** C13 accepted 7/9 against the required 8/9. Both C14 targeted reruns were rejected. The harness stopped the wrong-subject control before generation when its plan carried SGD markers. [C13/C14 evidence](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/evidence/README.md#L125)
- [x] Ship C14b (`18d92571`) under the MVP fast path and record read-only production verification. Release CI and fast-e2e passed. Gate 2 was waived for this release. [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)
- [x] Remove the temporary loss-surface limitation sentence from the request box. The final copy describes the broader 3D feature.
- [ ] **SGD capability claim and signed-in production acceptance (parked).** The scoped release has no SGD qualification claim.
- [ ] **Weekly production SGD canary (parked).** It was never created.
- [x] Reconcile the plan, tracker and release checklist with the pinned receipt and evidence. [Closeout and remaining issues](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/fix.md#L465)

### Gates and budget (original qualification criteria and estimates)

| Gate | What runs | Passes when | Settled cost (estimate, from today's measurements) | Allowance it needs |
|---|---|---|---|---|
| Gate 1 (AN-20) | 20 author-only SGD samples plus 9 regression samples, on the dev preview | 16 of 20 validate, meet assertions and pass the owner's eyes; 9 of 9 regressions clean | about 25 credits per SGD author call and 12 per regression call: roughly 600 credits (US$6) per batch; a second batch doubles it | fits the dev test user's remaining monthly allowance (about 790 credits after today's runs) for one batch only |
| Gate 2 (AN-21) | 10 full-pipeline SGD jobs on the candidate's preview | 8 of the first 9 accepted; the control does not become SGD | 100 to 133 credits per failed job, less for an accepted one: 1,000 to 1,350 credits (US$10 to 14) | **exceeds the dev test user's remaining allowance; needs a second test session from `rabbit-hole-cp-dev` `/test/session`, or a raised `AI_LEGACY_ALLOWANCE_USD` on the dev clone, before it starts** |

Worst-case bounds (what admission checks, not what settles): about US$1 per author call and US$1.35 per full job, so about US$45 for both gates. Decision 14 covers it; the dev preview's platform day cap is US$40 per day, which paces the batches (decision 21): gate samples run in parallel across up to five dev test sessions, which also covers the per-user allowance, so neither gate needs the owner to raise the cap. Parallel records each batch in `spend.md` before and after with the candidate SHA. No production spend until the one post-release SGD request in AN-21.

### Release order (recorded)

MVP2a shipped first. C14b then shipped the combined implementation under Decision 38. The earlier release sequence required both qualification gates. Decision 38 closed the ladder after the recorded results and scoped the release to the implemented machinery. [Decision 38](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/superpowers/plans/2026-10-30-animation.md#L1122) · [C14b release receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/200a4c6d453901d030cf1add53f69ffa7b4fede6/docs/features/animation/ladder-release-receipt.md)

## 9. Post-MVP tasks AN-08 to AN-16 and AN-22 — blocked on continuation approval

**AN-08 to AN-16 remain subject to explicit continuation approval**, separate from decision 15; no such approval is given by the MVP release or by the ladder. Their complete subtasks and acceptance criteria are preserved in 14.8. Do not start them, and do not prepare them under another name.

| Task | Remaining full-feature scope | Current boundary |
|---|---|---|
| AN-08 richer procedural vocabulary and image references (R + A; G) | Extrusions, lathes, bounded instancing, image references | The surface and trail primitives moved to AN-18 under decision 12; the rest is blocked. A tube-curve correction does not complete this task. |
| AN-09 attached models and immutable source binding (A) | Authorized GLB/CAD sources by immutable refs, instances, units, budgets | MVP source-reference limit is zero. |
| AN-10 prescribed assemblies and component editing (A + U; P) | Instance graph, joints, couplings, component picking, Ctrl+K scoped edits | Not enabled by the MVP release. |
| AN-11 walkthrough and richer game input (U + R) | `walk` profile, placement and drag tasks, touch equivalents | Focused directional keys do not establish walkthrough support. |
| AN-12 optional Rapier physics (A + R; P) | Lazy bounded rigid bodies, colliders, joints, forces | `physics` is not an enabled behavior; no Rapier dependency exists. |
| AN-13 Tutor integration and activity evidence (V + G; P) | Tutor recommendation through the proposal path; bounded semantic evidence | Ask Tutor does not establish this integration. |
| AN-14 revisions, sharing, forks, product integration (A + P) | Scoped refinement, revision history, share and fork rules | MVP persistence does not establish the full lifecycle. |
| AN-15 full qualification and regression closeout (V + P) | The full matrix in section 10 on a frozen candidate | Neither the grid-game acceptance nor the SGD ladder completes this. |
| AN-16 release, activation and final verification (P) | Final candidate, activation, production user-flow verification | The MVP1 and MVP5 receipts are distinct milestones, not full-feature completion. |

### AN-22 — patch-style repair bound to the base artifact (G) — after the ladder, before AN-08

**Status:** proposed (13.6, follow-up 2); not authorized by the ladder; listed here so decision 16's "better long-term design" has a home.

- [ ] A repair tool that returns bounded edits (replace a node, a geometry, a readout, or the program source by exact-match quote) bound to the base artifact's hash; the host applies them deterministically, rejects a stale or ambiguous edit, and then validates, renders and reviews the whole resulting candidate as today.
- [ ] Omitted fields keep their values by contract; a repair can no longer drop the program. The repair's output budget falls back toward 12,000 tokens and the displayed credit ceiling with it.
- [ ] Measured against the full-rewrite repair on the retained SGD drafts before it replaces it.
- [ ] Schema restructure for strict tool output (FX-AN-046, parked 4 Nov 2026): the author and repair tools have 55 optional parameters against the provider's limit of 24 for strict tool use; a patch-style repair schema is small enough to fit, and the author's artifact schema would need per-kind objects with no optional members. Until then the lenient parse and the one correction ask are the fix.

**Accept:** the same repairs as today at a lower bound, with no field ever silently lost.

## 10. Acceptance matrix and review focus

Each case must reference a task, candidate SHA, actual result and evidence. Mocked and real-provider results are separate columns in the receipt. This matrix covers MVP and the later full feature: post-MVP rows are not new blockers on the already released limited MVP. Current SGD failure and unverified production user flows remain visible; release does not turn them into passes.

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
| Rejected generation (added 3 Nov) | The plan stage stays charged and the generation stage is released: the message is "You have not been charged."; a retried job is charged only its final attempt; at most 5 refunded failed attempts per learner per day; the platform ledger keeps the provider cost (decision 17 as amended 3 November) | AN-17 |
| Author call timeout | A 524 on the author call retries once in the same job; the job continues; category `provider_unavailable` | AN-17 |
| Old client and a new primitive | A stored artifact using `surface`, `trail`, a text readout, `offset`/`anchor` or `clampTo` answers 409 `client_update_required` to a client that did not declare the flag | AN-18 |
| Loss-surface experiment | Smooth surface, clamped diverged ball with the true value in a readout, trail distinguishable from ghost, status word, visible arrows with tip labels, at learning rates 0.1 and 1.5 | AN-19/20/21 |
| Prompt regression | The grid game, pendulum and projectile plans author correctly under the shortened prompts (three samples each) | AN-20 |
| SGD qualification | 16 of 20 offline samples (Gate 1) and 8 of 10 full-pipeline jobs (Gate 2), on frozen candidates, with job ids, credits and artifact hashes | AN-20/21 |

Five high-risk review areas: stale async results overwriting edits; incorrect derived values despite plausible animation; nested gesture/key capture; imported-source permission/revision drift; unbounded provider/GPU/worker allocation. The tasks above include explicit tests for all five.

### Verification commands and evidence rules

Verified existing command meanings (recheck current package scripts at kickoff):

- From `packages/web`: `npm run test:unit` runs Node tests; `npm run build` builds Vite using required target flags.
- From `packages/control-plane`: `npm test` runs Node tests. For new focused files, use e.g. `node --test test/animation-job.test.js test/animation-policy.test.js` after those files are created.
- For new web modules: from `packages/web`, `node --test 'src/animation3d/*.test.mjs'`. Verify the runner actually executes tests; zero tests is not a pass.
- Repo release suite: `make test-unit` where the applicable release mode requires it. For explicit MVP mode, use successful build, affected tests and a focused feature smoke; broad CI/full gates can run independently. The retired integration suite is not meaningful acceptance.
- In `packages/web`, `npm test` means browser automation. Current `CLAUDE.md` restricts Claude-run browser automation; use approved CI/release browser runners and register the new scripts with their harness. Do not bypass restrictions using another agent or equivalent tool.
- Owner policy, 3 November 2026: explicit MVP releases may bypass mandatory `verify`, `fast-e2e` and broad release-gate waits. The bypass must be explicit in workflows and deployment/preparation tools, bind to the exact tested commit/build, and record skipped checks as bypassed. Preserve environment/schema/secret checks, deployment smoke and a usable recovery path. At the production baseline this mode is not implemented; the recorded release passed the ordinary chain. Do not advertise a runnable `--mvp` option until it exists. A demonstrated functional failure is not waived by a CI exception.
- Existing suites to reuse: `explain-program/{runtime,contract,contract-safety,interaction,lifecycle,playback,state-contract,use-program-state}.test.mjs`; `model-{formats,import,storage}.test.mjs`; `generation-proposal-card.test.mjs`; server `generation-proposal.test.js`, `explain-{proposal,job,program-budget,provider-cap,context-refs,tutor}.test.js`; browser `explain-program-*-check.mjs`, `model-viewer-check.mjs`, `slash-3d-check.mjs`.

## 11. Tracking files Parallel must create and push

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

Numbering as of 3 November: the pinned `fix.md` ends at FX-AN-042; FX-AN-043 is the prepared repair-retry patch (applied in AN-17). Ladder entries start at **FX-AN-044**, one per AN-17 to AN-21 unit, each citing the section 1 decision it relies on.

## 12. Push and review contract

Push work so it can be reviewed remotely; a local SHA, screenshot or agent summary is insufficient. Each milestone handoff contains:

- Integration/worker branch names and **full pushed SHAs**; compare/commit links and parent/base.
- Changed AN IDs/subtasks, actual implemented behavior and deferred scope.
- Working isolated dev preview, feature activation and a 3–5 step try-it path.
- Targeted test command/count/result and exact-SHA CI/gate links; distinguish source review, fixtures, browser use and real generation.
- Real model/asset acceptance outputs with artifact hashes/source revision IDs, spend and remaining allowance.
- Open `fix.md` IDs, next owner/action and any unreviewed commits.
- At M3: one clear MVP approval request. At final release: one consolidated list of genuinely unavoidable owner-only actions.

The reviewing assistant will compare pushed task claims against this plan, changed code/call paths, fix entries and the verification evidence required by the selected release mode. It must distinguish this updated document from the still-stale repository checklist at the baseline. It must report “not reviewed” where evidence is missing. A green job title or commit message does not prove compliance. Reviews prioritize data loss, functional correctness, permissions, budgets, runtime isolation and missing required behavior—not visual polish. Review is not a new permission gate for development/pushes; the owner's explicit post-MVP continuation boundary and applicable release mode apply; later owner MVP exceptions supersede older blanket CI/gate wording.

If hourly review is configured, that is periodic inspection, not guaranteed instant review of every push. Keep an explicit pending-review commit list, deduplicate commits across branches and review conflict resolutions separately. No automatic reviewer may spend model credits, modify source, deploy, trigger/rerun workflows or send instructions externally unless separately authorized.

## 13. Where we are — 3 November 2026, 3:55 PM PT

Facts here are either inspected directly (the repository at `caf7ee9bc`, its gate note, the branch tips) or quoted from Parallel's answers of 3:26 PM PT, marked as such. Historical records are in section 14.

### 13.1 Production record

The reconciliation baseline is **`caf7ee9bc7355ba6d76f971d00872b0da8a1254b`** (`caf7ee9bc`), whose change is FX-AN-042. `release/animation-mvp1`, `dev` and `main` are all at that commit; `main` fast-forwarded from `1cc0116e91d6312ddf778a2525afec30f4088538`. The gate note on the commit (`refs/notes/gates`) ends `INT35-DONE` with every check passing: 5,038 unit tests, the browser checks, journeys J1 to J8, and both bundle checks.

The production workflow's release-job log records the identity in the header table, outcome `released`, run `41736512175.1`, and five passing signed-out smoke checks (homepage and new-build entry, its script, login redirect, invalid shared route, `/api/me` authorization). That is evidence of deployment and those smoke checks, not of a signed-in user completing generation, controls, billing and reload.

| Evidence | State / scope |
|---|---|
| [Verify 41726730791](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41726730791) | Passed for this application commit. |
| [Fast-e2e 41726730765](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41726730765) | Passed for this application commit. Does not establish a new SGD scene. |
| [Full gate 41729568276](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41729568276) | Successful, attempt 2. Attempt 1 failed in `analytics-ui-check` step 20, an event absent from the owner's read within 30 seconds; latency versus real intermittent loss is not established. The gate note on `caf7ee9bc` is `INT35-DONE`. |
| [Production release 41736512175](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41736512175) | Successful at application SHA `caf7ee9bc`; receipt and five deployment smoke results inspected. |
| Limited generated acceptance | **Passed.** Receipt in 13.2. |
| SGD qualification | **FAILED / OPEN.** Latest job `aj_77ff45ba15754ef5972994f8e564cbb6` ended after two review rejections and two repairs. No accepted SGD result exists. Causes in section 8. |
| Production read-only checks | Parallel reports all eight passed: both served Worker identities, flags, binding and migration tag, Animation chunk and both client features in the bundle, jobs route 401 signed out, five diagnostic and seed routes 404. |
| Production signed-in user flow | **Awaiting owner evidence**: generate once, use controls, reload without a new job, verify the credit change, remove the test canvas. |

**Ladder ledger (3 November 2026):** ladder UUID `857a0d92-9bb6-4b9b-9739-ae85d7df3d27`, children AN-17 `b8a06a01-84bf-40af-bccb-9c548e55ef57`, AN-18 `951e8c49-67ee-4f3a-8264-6bff7b67478e`, AN-19 `e6ab6c6c-a7e2-4685-9010-02e15b8a412c`, AN-20 `54823918-c7a9-47d6-8dcc-0a2029be508b`, AN-21 `d7a65dd9-906e-46db-9be7-f3881353f6f1`.

### 13.2 Receipts and facts Parallel supplied at 3:26 PM PT (quoted)

**Grid-game acceptance, the limited MVP acceptance.** Job `aj_1f8eed916ce34942a086deb5654c2ea5` on `canvas-a083a79c`, result `ar_2e1fff9aa8074c13b633d566fe4841d3`, titled "Token to Goal: 3 by 3 Grid Puzzle". A real pipeline run on candidate `caf7ee9bc7355ba6d76f971d00872b0da8a1254b`, preview version `0fd062bf-f9e4-4099-8894-2d2924e94d6b`. Settled credits 24.76 (plan 5.01, author 11.53, one review 8.22); accepted at the first review with 0 repairs. Artifact hash (SHA-256 of `artifact.json`) `f16222a22c0dfb69a3a14a13a476f6111a677a26b36bfcfa48275567ad32229d`. Export folder `C:/s/spec/animation/sgd-mvp1-acceptance/export-6/` (job, `artifact.json`, `game-model.json`); screenshots and browser results in `acceptance-game/` and `acceptance-game-run1/`; `ACCEPTANCE-RESULT-6.md`; `logs/run6-game.out.txt`. Today's spend ledger is `C:/s/spec/animation/sgd-mvp1-acceptance/spend-ledger.md`, not in the repository; `spend.md` on `main` ends at 2 November. The acceptance total was 538.10 credits against the 620 cap.

**Run 5 (`aj_77ff45ba15754ef5972994f8e564cbb6`), repair 1, the `missing_program` case.** There is no `partialTool` in that export: `animation-policy.js:176` records it only when a reply is refused at the call level, and repair 1 completed normally with stop reason `tool_use`. The call used 6,053 output tokens against the 12,000 ceiling, so the token ceiling is ruled out. The draft was rebuilt offline from the stored candidate: its tool input keys are `operation` and `artifact`, with 13 artifact fields and `program` absent; feeding it through the parser and validator reproduces exactly `missing_program` (trace: `final-fix4/trace-repair1.json`). Not retained: the raw reply, any text blocks, the model's reason. The FX-AN-043 patch adds that diagnostic. (Consequence for the ladder: the model omitted a required field and the API did not enforce the schema; AN-17 evaluates strict tool output for exactly this.)

**The `--mvp` fast path.** Branch `feat/mvp-fast-path`, pushed to `rabbit-hole`, head `d40a8ca16`, two commits on top of `1cc0116e9`, not merged; being updated with a merge of `main` at `caf7ee9bc`, allowlist hardening and a separate MVP release script; it goes through the ordinary gate when ready. Allowlist variable `MVP_ALLOWED_SHA`, a repository variable read as `vars.MVP_ALLOWED_SHA`; MVP mode applies only if it equals the commit being released; the owner sets it with `gh variable set MVP_ALLOWED_SHA --body <sha> -R Rabbit-Hole-App/Rabbit-Hole`. This is the plan as briefed, not yet built or verified.

**Platform cap and allowance.** `USAGE_PLATFORM_DAY_USD` is a secret binding on both Workers and cannot be read from the repository; it is in the Cloudflare dashboard. The dev preview clone uses US$40 per day. Production grants 2,500 AI credits a month (`AI_MONTHLY_ALLOWANCE_USD` 25); accounts that already used AI keep `AI_LEGACY_ALLOWANCE_USD` 50 until the November 2026 cutover. The remaining production allowance is a runtime counter in the production database, not mapped. The dev test user's usage counter after run 6 was 1,706.52 credits, so about 790 remain this month: enough for one Gate 1 batch, not for Gate 2 (section 8, Gates and budget).

### 13.3 Enabled production scope

Pinned production app configuration sets `ANIMATION_ENABLED: "true"` and `ANIMATION_EXECUTION_KILL: "false"`; it does not set `ANIMATION_DIAGNOSTICS`. `ANIMATION_JOBS` binds `AnimationJobs` with migration tag `animation-jobs-1`. The control plane has no Animation binding. The feature is available to all signed-in users without an allowlist, which is why AN-17 releases first: an SGD request today runs, fails, and settles 100 to 133 credits.

The MVP registry enables `inspect`, `watch`, `experiment`, `game`; behaviors `prescribed`, `analytical`, `rules`; profiles `inspect`, `manipulate`; client features `curve_radius`, `action_motion`. Assembly, walkthrough, physics, attached models and image-reference generation remain outside the enabled registry.

Recovery branches `rollback/animation-disable` (`73eb20153`) and `rollback/animation-kill` (`bcae892b6`) exist on this commit; recovery is always a forward release because Cloudflare cannot roll a Worker back across `animation-jobs-1`. Never remove Durable Object bindings, migration tags or stored results.

### 13.4 MVP release policy (owner, 3 November)

Explicit MVP releases may bypass mandatory broad CI and full-gate waits. Minimum checks: successful build, affected tests, focused feature smoke, exact commit and build identity, correct target environment, applicable schema and secret preflights, a usable recovery path. Broad checks can run asynchronously and must be recorded as bypassed, never as passed, when omitted. A functional failure is a defect, not a CI waiver. The fast path covers workflow-level waits and the deployment and production-preparation tools; its wording is to be reconciled in root `CLAUDE.md`, `AGENTS.md` and the release docs. This release went through the normal gate; the fast-path task must not rewrite that receipt. Ordinary mode keeps its checks. Section 8 says which ladder slices may use the fast path once it exists (prompt-only and copy-only slices; contract, renderer and billing slices use the ordinary gate unless the owner overturns decision 17).

### 13.5 Paid testing

The original US$10 approval (section 14.3) and the 620-credit acceptance cap are historical. Owner decision 14 (3 November) approves paid attempts for the ladder's two gates and raises the budget as needed; AN-17's documentation commit recorded it as a new `spend.md` line dated 3 November and copied today's rows from the spend ledger outside the repository. Under decision 20 (point 7) each paid batch is announced with its size and cost and then proceeds; the owner is asked only if cumulative spend would pass the plan's worst-case figure (about US$45 for both gates). Reconcile intervening costs before each gate batch. Gate 2 needs a second dev test session or a raised dev allowance (13.2). No production spend until AN-21's one post-release SGD request.

### 13.6 The four technical follow-ups, now placed in the ladder

Recorded on 3 November as proposed improvements. They are not established as the single root cause; section 8's table is the causal account read from the code, and the follow-ups map onto it:

1. **Tool and schema enforcement.** The author and repair tools require a program where needed but do not enable strict output; the host normalizes and later validates. Evaluate provider-enforced structured output with a provider-compatible schema while keeping full local validation; the current schema has constraints the strict subset may not support, so do not add the flag blindly. **→ AN-17**, with the 13.2 finding as its evidence.
2. **Targeted repairs that preserve working code.** A bounded patch contract bound to the base artifact hash instead of a complete rewrite; omitted fields keep their values by contract. **→ AN-22**, after the ladder (decision 16).
3. **Reusable visualization helpers.** First reuse the existing arrows, curves, tubes and label layout; where the saved failures show a gap, add small general helpers for surface sampling, vector and label anchors, truthful off-plot display and distinguishable current and saved paths; any clipping is disclosed and consistent, with true readouts kept. No subject-name branch, no canned SGD replacement. **→ AN-18 and AN-19**, with the clamp disclosed in the trace and the golden artifact a fixture only.
4. **Numerical and visual-review calibration.** Deterministic checks on retained drafts; compare known-good and known-flawed scenes against the reviewer; occluded information and unreadable paths are defects, while a correctly scaled small arrow or a ring-count preference is not automatically major. **→ AN-20** (plan assertions, reviewer severity, the three-plan regression set).

### 13.7 Immediate closeout and corrections

| Item | Status | Next concrete action |
|---|---|---|
| Signed-in production smoke | Pending owner evidence | As `@yuvish_demo`, generate the limited grid game once, use controls, reload and confirm no new job, inspect the credit change, trash the test canvas. |
| Rejected-generation charge | Built on `feat/animation-escrow` (MVP2a); awaiting its gate and release | Plan stage charged; generation stage escrowed and released on failure; 5 free failures per learner per day, counted per attempt; "You have not been charged."; a retry charges only the final attempt. Owner settled it on 3 November (decisions 17 and 20). |
| SGD not supported, said nowhere | Built on `feat/animation-escrow` (MVP2a); awaiting its gate and release | The copy line rides in MVP2a (decision 20). |
| SGD qualification | Failed / open | Section 8. |
| FX-AN-041 author 524 recovery | Open | AN-17 (MVP2b): streaming, deadline, same-job retry. |
| FX-AN-040, FX-AN-043 | Prepared patches outside the frozen commit | AN-17 (MVP2b) applies both with tests; fixing SHA recorded; FX-AN-043's diagnostic retains the raw repair reply. |
| Resume-probe reviewer text and tests | Open follow-up | AN-20 reviewer prompt edit; keep the periodic and paused-clock cases. |
| Explicit MVP fast path | In progress on `feat/mvp-fast-path` | Finish, validate ordinary versus MVP behavior, publish the invocation and `MVP_ALLOWED_SHA` requirement. Not on the ladder's critical path. |
| Intermittent checks | Open | `animation-mvp-check` steps 21 and 42, `signup-email-preferences-check` (transient 401 under SQLITE_BUSY, check-only patch ready), `analytics-ui-check` step 20. Each costs a gate attempt; keep every failed run id; no blanket reruns. |
| Documentation sync | Done in the MVP2a candidate: this plan, `checklist.md` and `spend.md` | None. |
| Temporary release permission rules | Owner cleanup | Remove the two `release.sh 37-animation` rules when the owner chooses. |

Parallel's coordination queue also names Explore Top (approved by the owner on 3 November 2026 to go once Animation is live; it rides in the MVP2a candidate, decision 20), a signup check patch and the Creator Analytics cleanup check after 8:00 PM PT. These are outside Animation's task scope and never change this feature's release identity or acceptance status.

### 13.8 Evidence index

- [Repository plan at the baseline](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/docs/superpowers/plans/2026-10-30-animation.md) · [checklist (stale)](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/docs/features/animation/checklist.md) · [fix log to FX-AN-042](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/docs/features/animation/fix.md) · [MVP correction evidence](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/docs/features/animation/mvp1-correction-evidence.md)
- [capabilities.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/web/src/animation3d/capabilities.js) · [contract.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/web/src/animation3d/contract.js) · [scene.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/web/src/animation3d/scene.js) · [framing.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/web/src/animation3d/framing.js) · [Animation3DCard.jsx](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/web/src/Animation3DCard.jsx) · [Controls.jsx](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/web/src/animation3d/Controls.jsx)
- [learn-models.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/control-plane/src/learn-models.js) · [animation-policy.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/control-plane/src/animation-policy.js) · [animation-repair.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/control-plane/src/animation-repair.js) · [agents/animation-author.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/control-plane/src/agents/animation-author.js) · [ask.js](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/control-plane/src/ask.js)
- [Production configuration](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/caf7ee9bc7355ba6d76f971d00872b0da8a1254b/packages/web/wrangler.rabbit-hole-prod.jsonc) · [release job and receipt](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41736512175/job/126266984233)
- References behind the follow-ups (supporting, not proof of root cause): [Anthropic strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use) · [structured-output schema subset](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) · [Anthropic text editing](https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool) · [Aider edit formats](https://aider.chat/docs/more/edit-formats.html) · [SceneCraft](https://proceedings.mlr.press/v235/hu24g.html) · [Anthropic on evals for agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)

### 13.9 What changed in version 3.1

Version 3 (3:40 PM PT) added owner decisions 11 to 17, the ladder (now section 8) with its causal account read from the code, the AN-18 contract additions in sections 2, 3 and 14.11, the Animation module inventory with line numbers in section 4, the model-policy changes, the ladder lanes in section 5, MVP2 to MVP5 in section 6, AN-22, seven acceptance rows and the FX-AN-044 numbering; it consolidated the earlier status sections into one and quoted Parallel's 3:26 PM receipts. Version 3.1 (3:55 PM PT) put a Start here page at the top with the push points and the kickoff instruction, collapsed the released AN-01 to AN-07 into a status table (section 7) with their subtasks checked in 14.7, collapsed the blocked AN-08 to AN-16 into their table (section 9) with their subtasks in 14.8, moved the user-flow, card-UI and assets-and-physics specification sections to 14.9 to 14.11, removed the repeated production identity and status text, and renumbered the sections (the active plan is sections 1 to 13). Every specification section and every original task and subtask is retained. No application source, remote branch, deployment, paid call, workflow or external message was changed by either update.

### 13.10 What changed in the repository copy (owner 3 November 2026)

This copy of version 3.1 carries the owner's later decisions of 3 November 2026 and nothing else: (a) decision 17's billing half is replaced by the escrow (plan stage charged; generation stage escrowed and released on failure; up to 5 free failures per learner per day; the failure message "You have not been charged."; only the final attempt charged on a retry), its release-mode half kept; (b) decision 20 records the owner's answers to Parallel's eight questions; (c) every statement that Explore Top waits for SGD or AN-21 now says it was approved to go once Animation is live and rides in MVP2a; (d) AN-17 is split into MVP2a and MVP2b, its billing, copy and documentation subtasks are checked as built on `feat/animation-escrow`, and section 6, the ladder at a glance and the order of work follow the same split; (e) the ladder ledger UUIDs are recorded in 13.1; (f) decisions 21 and 22 (gates run on the dev preview of a frozen candidate, never after a release; Gate 1's carry-over rule), with section 6, the ladder at a glance, AN-20, AN-21, the order of work and the budget note following. The link to the owner's private Library file in 14.10 is not reproduced. Nothing else was changed.

## 14. Appendix — historical records

Retained for the record. Nothing here is a current instruction; sections 1, 8 and 13 govern.

### 14.1 Parallel's kickoff message (30 October 2026)

> I will build `/animation` in six lanes with one integration owner, using the existing proposal, model, sandbox and Three.js foundations. I will push a fixture-backed interactive preview early, then an original generated and saved MVP. I will not copy the preview's demo selector or replace `/explain`'s existing animation type. I will keep `docs/features/animation/fix.md` and the checklist pushed, report real evidence and spend, and keep independent MVP work moving. After the complete MVP preview is ready, I will wait for your explicit approval before implementing the remaining feature tasks. Minor polish will not delay delivery.

### 14.2 Completion checklist for the original handoff (30 October 2026)

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

### 14.3 Owner decisions recorded at kickoff (30 October 2026, about 12:45 PM PT)

Historical record retained from the repository copy. Section 1 (decisions 11 to 17) and section 13 record the later decisions. The original $10 cap, initial stage ceilings and pending production authority below are not current instructions for the released MVP.

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
- **D — start from the written UI spec (now 14.10).** Do not wait for the HTML. If supplied later, copy it to
  `docs/features/animation/reference-ui.html` and reconcile relevant differences without unnecessary redesign.
- Internal name `animation3d`; existing 2D `animation` and `/3d` behavior preserved.
- `env.BROWSER` checked at kickoff (14.4). Required visual review stays unverified until it actually runs.
- **Build and push Tasks 1-7 (AN-01..AN-07) first. Do not implement Tasks 8-16 until the owner explicitly approves the
  MVP.** During review, continue MVP fixes and checks.
- Push usable slices as soon as possible; no overpolishing, no waiting for intermediate feedback. Keep
  `docs/features/animation/fix.md` and the checklist pushed and current. Each milestone needs its full SHA, working
  preview, short try-it path, test evidence, spend and remaining blockers.

**Ctrl+K clarification (applies to AN-10 and AN-14, after MVP approval):** Ctrl+K editing applies across Animation
scenes: loops, experiments, mini-games, walkthroughs and assemblies. Selecting the card targets the whole scene;
selecting a component targets that component. Show the target and the proposed change, validate before replacement, and
preserve the previous revision and source assets.

### 14.4 Kickoff inventory (30 October 2026)

These are kickoff observations, not current branch, preview or production status. Use section 13 for the production baseline.

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


### 14.5 MVP corrections implemented before release that the original plan did not record (3 November 2026)

| Area | Source behavior at the production baseline / evidence limit |
|---|---|
| Playback status and controls | Compact Playing/Paused badge in the scene viewport; transport and view controls separated; one state reset appropriate to the experience. Restart retains settings where seeking is supported; Reset view affects camera. |
| Primary controls/readouts | Primary parameter and result are prominent; secondary settings/readouts can be disclosed. Some readouts require scrolling on small cards; existing evidence records this limitation. |
| Math text | `Animation3DCard.jsx` renders assumptions through `MdInline` with `mathOnly`, rather than plain strings. This source fact is not blanket visual verification of every generated formula. |
| Stepped actions | `startsMotion: false` lets state-only actions change state once while leaving a paused scene paused. Launch-type actions retain continuous stepping. The corrected saved fixture's new-run action waits for Play. Future generated output must actually declare the correct semantics; fixture success does not prove that. |
| Tube curves and old clients | `curve_radius` and `action_motion` client features are declared and negotiated. Incompatible stored results require update/reload rather than silent reinterpretation. Historical fixture receipts report old-tab data preservation; a pre-release tab may show an empty frame until reload. |
| Labels | Existing screen-space sizing, bounds handling, optional-label control, priority/decluttering and arrow/marker obstacle handling are present. Their presence does not establish that every generated anchor/camera/layout is readable. |
| Directional games | Authored directional key/action mappings are handled while the card owns interaction focus. This is not the post-MVP free walkthrough profile. |
| Status/recovery | Card status polling has retry/backoff paths and targeted job recovery. Transient-read and stale-status fixes are part of the implementation history; same-job recovery after an author 524 remains open as FX-AN-041. |
| Review sampling | Two views and bounded states can exercise parameters and a developed path comparison. Advance/resume entries preserve ordering; the resume probe observes drawn-node changes. Its documented limitations and reviewer-text/test follow-up remain visible. |
| Repair/request sizing | Compact drafts and deduplicated findings preserve targeted repair context within bounded requests. FX-AN-042 removes repeated capture wording and refers repeated states to their first caption, restoring the prior reviewable-size margin. This does not prove authored-scene quality. |

### 14.6 Discrepancies resolved by the 3 November reconciliation

1. **Commit/branches:** the current application baseline and observed branch tips are recorded above, including `main` after release.
2. **Repository additions:** the repository plan's historical kickoff sections (now 14.3 and 14.4) are incorporated into this downloadable plan.
3. **Downloadable copy:** the old October 30 sections 1–16-only copy is replaced with this reconciled version, retaining the complete MVP and post-MVP tasks.
4. **Stale repository checklist:** at this commit, `docs/features/animation/checklist.md` still names older candidate `c9d0c5509126b277603a778fbcdc2b376a08ab42` and an earlier ready-for-owner-review preview. AN-17's first commit syncs it.

### 14.7 MVP1 subtasks, AN-01 to AN-07, as implemented at `caf7ee9bc`

A checked box means the item is implemented and released at `caf7ee9bc` (source present, exact-SHA `verify`, `fast-e2e` and gate green, production release 41736512175). An unchecked box is acceptance that still rests on a real generated case or the owner's signed-in smoke; section 7 names each. Do not rebuild any of these.

#### AN-01 — kickoff, compatibility and shared contracts (P + R)

**Status at `caf7ee9bc`:** Contract/capability/fixture modules are present in the production source. This document reconciles the baseline; the repository plan, checklist and instruction-file sync remain explicit documentation work, not an instruction to rebuild contracts.

**Files:** create `animation3d/contract.js`, `capabilities.js`, `fixtures.js`, corresponding tests; P creates plan/checklist/fix log and owns registry adjustments.

- [x] Fetch main/active branches; read current instructions; inspect `/explain`, Explain-back and current sizing/state fixes so completed work is not duplicated. Record overlaps and acquire shared-file ownership.
- [x] Define the proposed plan/artifact/frame/event/snapshot interfaces in section 3, actual serializable types and phase-capability validation. Add stable IDs, finite/range checks, hierarchy cycle/unknown-ID rejection and aggregate allocation limits.
- [x] Add fixtures for watch, experiment and game with independently calculable expected states; prove invalid physics/asset/walk capability requests are rejected in MVP. Pin `animation3d` compatibility and old `animation` load unchanged.
- [x] Push M0, with exact schema fixture shared by all workers. No broad refactor or mandatory migration before a demonstrated need.

**Accept:** all workers can consume one fixture/contract; malformed output cannot reach rendering; legacy discriminator regression passes.

#### AN-02 — trusted 3D viewer and procedural geometry (R)

**Status at `caf7ee9bc`:** Renderer, scene compilation, labels and review capture path are present, including tube curves. Current production signed-in visual verification is still awaiting owner evidence; source/fixture results are not blanket visual acceptance.

**Files:** `animation3d/renderer.js`, renderer/contract tests; P makes minimal shared-viewer extension if required.

- [x] Implement bounded primitives/groups, lines/curves/arrows and labels, default camera/light/materials; resource allocation follows validated budgets.
- [x] Load the fixture, update object transforms/readouts without rebuilding the entire scene, capture a poster, dispose resources and honor shared visibility/viewer slots.
- [x] Verify resize, camera reset, context loss/recovery and no WebGL accumulation across repeated mount/unmount. Test budget rejection before allocation, hierarchy transforms and valid bounds.
- [x] Push real rendered M1 fixtures. A screenshot of a drawing is not acceptance of a Three.js renderer.

**Accept:** actual procedural 3D is inspectable; stale frames and undeclared objects cannot mutate it.

#### AN-03 — card, proposal settings and focused controls (U; P shared integration)

**Status at `caf7ee9bc`:** Card, proposal, focused controls, playback badge, reset separation, math-aware assumptions and declared game keys are implemented in source. Verify the deployed signed-in flow rather than recreate these components.

**Files:** `Animation3DCard.jsx`, `animation3d/Controls.jsx`, `interaction.js`, `client.js`; P changes the existing canvas/proposal/command schema.

- [x] Build shared card layout and watch/experiment/game variants from fixtures; expose only needed controls. Show current format and compact legend.
- [x] Implement inspect focus ownership, camera/object gesture arbitration, accessible parameter controls, play/pause/restart, meaningful goal/hint/outcome and recoverable loading/error UI.
- [x] Register `/animation` help/example/pill, internal block, capability and proposal settings in existing registries; ensure one request enters history once. Use the existing proposal component, not a copied demo form.
- [x] Add focused UI checks: narrow/wide card, light/dark, resized viewport, outer canvas wheel/drag, typing unaffected, Escape and blur release. Push M1 preview before model integration is complete.

**Accept:** the owner can exercise the three MVP fixture variants; they are visibly fixtures and not claimed as generated results.

#### AN-04 — sandbox behavior, looping and atomic state (R + U)

**Status at `caf7ee9bc`:** QuickJS runtime/state/session modules and one-step action semantics are present. Saved-fixture/session checks do not establish numerical correctness of the failed generated SGD draft.

**Files:** `animation3d/runtime.js`, `state.js`, behavior tests; integration with U's controls.

- [x] Reuse QuickJS isolation and bounded worker lifecycle through a 3D adapter. Add watch looping separately from `/explain`'s duration-stop behavior; do not globally change `/explain` playback.
- [x] Implement pure evaluate and validated serialized reductions; parameters, game rules, reset and any required normalized step event update one atomic accepted snapshot.
- [x] Check rapid input, drag coalescing, reset during pending evaluate, invalid initial/reset output, timeouts, queue pressure and stale worker messages. Preserve last good state on failure.
- [x] Verify numerical oracle values independently: beam balance uses mass × distance, experiment geometry/readout agree, looping does not drift or erase inputs. Push runtime slice.

**Accept:** custom generated logic can express an unseen simple rule/experiment without native JS execution, frame/model calls or subject-specific handlers.

#### AN-05 — planner, authoring, review and durable generation (G; P routes)

**Status at `caf7ee9bc`:** Generation/review/repair pipeline is deployed. Limited grid-game acceptance is reported passed. SGD qualification failed; the missing-program repair, failure charges, timeout recovery and visual findings remain diagnosis/follow-up work.

**Files:** server `animation-{brief,author,render,review,repair,job,policy}.js`, tests; P integrates task keys, JEV, job endpoints and proposal consume path.

- [x] Add dedicated task roles using the existing model transport; planner receives capability registry and authorized actual-read sources. Prompt requires recommended experience/reason and honest limitations.
- [x] Prepare signed editable proposals; consume the exact latest version only. Validate source/actor/revision/capability at both proposal and generation stages; idempotent repeats return the existing job/card.
- [x] Author a new procedural artifact and sandbox program, validate deterministically, render bounded sample states, review against the approved goal, perform at most the bounded repair, then rerun validation/render/final review before acceptance. Use the existing `explain-render.js` / `env.BROWSER` capture seam via `animation-render.js`, not a new rendering service: capture up to two declared views at up to three parameter/time states per review round, with execution traces and numerical readouts. Scope the review route/token to the candidate; no generated URL navigation. Missing required capture/binding is an explicit blocker, not a fake passed visual review. Do not generate a canned fixture selected by keywords.
- [x] Test fake-transport model failures, malformed output, stale/expired/duplicate approvals, stop/retry, wrong board/actor/source and provider reservation boundaries. Run targeted real cases only under actual authorized access; log model, tokens, spend and resulting artifact hash.
- [x] Push M2 backend slice and exact route/test evidence. A model text response is not accepted until the scene renders and its behavior passes checks.

**Accept:** real request → reviewed proposal → original validated artifact works; no silent fallback, duplicate job, unbounded repair or incorrect permission.

#### AN-06 — persistence, versions, cancellation and hydration (A; P board integration)

**Status at `caf7ee9bc`:** Durable result/storage and hydration modules are present. Existing fixture/CI evidence remains valid within its scope; owner production controls/save/reload/no-new-job verification is still pending.

**Files:** `animation3d/storage.js`, `assets.js` reference-only MVP portion, `context.js` minimal provenance, tests; existing artifact/board paths integrated by P.

- [x] Save artifact references and atomic snapshot using existing artifact/source and canvas persistence patterns. Assess schema needs; prefer existing extensible payloads, not a speculative new database.
- [x] Implement reload paused at accepted state/time, reset, cancel, failed regeneration preserving current version, and late-job/late-hydration guards.
- [x] Verify save while navigating, two fast parameter edits, refresh after settled save with **zero new model calls**, deleted/replaced card, board switch and missing artifact. Check durable result reads independently of job records, cross-user/cross-canvas denial and artifact/hash/runtime-stamp mismatch. Never replace newer edits with delayed data.
- [x] Until AN-14 enables full share/fork handling, unsupported MVP share/fork contexts show an honest unavailable scene placeholder; never fall through to owner APIs or embed executable source into board JSON.
- [x] If a migration is actually needed, prepare exact additive migration/rollback assessment, coordinate dev database ownership and log required authority. Continue unaffected work. Push durable M2 slice.

**Accept:** owner refreshes and keeps the accepted scene, parameters and game state; stale results cannot create/update the wrong card.

#### AN-07 — MVP qualification and explicit owner decision (V + P)

**Status at `caf7ee9bc`:** MVP production release is recorded in section 13. Limited acceptance is reported passed for a real 3×3 grid game. SGD remains failed/open and the production signed-in smoke remains pending. This is not full AN-07/all-prompts qualification or AN-08 onward approval.

**Files:** new `packages/web/e2e/animation-mvp-check.mjs`, fixture/oracle tests and MVP receipt.

- [x] Register browser checks in the actual CI discovery/runner, not merely an unexecuted file. Verify nonzero executed counts, artifacts and exact candidate SHA.
- [ ] Exercise real generated watch, experiment and mini-game cases; at least one fresh prompt outside the development fixtures. Check visual meaning and computed behavior, not just valid JSON.
- [x] Run focused regressions for existing `/explain`, `/3d`/CAD viewer, proposal revision and card sizing/focus. Use existing passing evidence where applicable; broaden only for changed shared code or concrete failures.
- [x] Deploy the isolated MVP dev preview through the authorized procedure; publish a short try-it path, implemented/tested/deployed state, full SHA, limitations, spend and unresolved blockers.
- [ ] Record the already authorized/deployed MVP release and its actual acceptance scope. Obtain explicit owner continuation approval only before AN-08 through AN-16 feature work; do not repeat the completed MVP production GO.

**Accept:** M3 is marked `ready_for_owner_review` only with real flow evidence; if real model/browser access is unavailable, state which acceptance remains unverified. Post-MVP starts only after recorded explicit owner approval.


### 14.8 Post-MVP subtasks, AN-08 to AN-16, preserved in full

Blocked on continuation approval (section 9). Preserved so nothing is lost; not a work queue.

#### AN-08 — richer procedural vocabulary and image references (R + A; G prompts)

**Status, 3 November:** the parametric-surface builder and the trail primitive moved to AN-18 under owner decision 12 (scoped exception). Extrusions, lathes, bounded instancing and image references remain here and remain blocked.

**Files:** new `animation3d/geometry.js`, contract/fixtures extension; G's context/author modules.

- [ ] Add bounded tubes, extrusions, lathed profiles, instancing and parametric surfaces with segment/triangle accounting; parameters meaningfully affect geometry.
- [ ] Interpret explicitly attached images through the existing authorized vision/context path into a reviewed simplified procedural design; preserve actual-read source refs and uncertainty.
- [ ] Test a nontrivial curved object plus repeated elements; reject excessive topology, invalid profiles and false precise dimensions. Push M4 procedural slice.

**Accept:** useful generated scenes extend beyond basic solids; image interpretation is honest and does not require external mesh generation.

#### AN-09 — attached models and immutable source binding (A)

**Files:** `animation3d/assets.js`, source adapter tests; P integrates existing importer/store authorization seams.

- [ ] Resolve real GLB/CAD/imported model sources and local bundles by immutable refs, with aggregate resource budgets and no arbitrary external URL loads.
- [ ] Support multiple instances/material preservation, stable source/part identity and declared-unit conversion; handle unsupported codecs and deleted/unavailable sources without losing a previous good artifact.
- [ ] Test two different attached components, duplicate instances, missing units, cross-account denial, signed-link expiry and a viewer-only shared source. Push M4 asset slice.

**Accept:** actual supplied geometry appears; source references survive reload and permission changes are honored.

#### AN-10 — prescribed assemblies and component editing (A + U; P Quick Edit hooks)

**Files:** new `animation3d/assembly.js`, joint/coupling tests, selection/control additions.

- [ ] Implement generic instance/local-frame graph, fixed/revolute/prismatic prescribed joints, finite axes/limits and explicit ratio couplings; no mechanism-specific runtime route.
- [ ] Add component picking, constrained dragging, numeric alternatives, part/source list, reset and optional declared explode view. Preserve outer canvas gesture ownership.
- [ ] Ctrl+K targets a selected instance or whole scene through a revised proposal; replace only after successful validation/acceptance. Preserve previous revision and original CAD source.
- [ ] Test a rotating linkage or slider-crank and an unrelated assembly; verify limits, coordinate/unit transforms and source identity. Push M5 assembly slice.

**Accept:** genuine multi-component interaction, not visually similar stand-in cubes or guessed hidden movable parts.

#### AN-11 — walkthrough and richer mini-game input (U + R)

**Files:** interaction/runtime contract extensions and movement/game browser checks.

- [ ] Add `walk` profile: normalized movement state, bounded speed/scene limits, right-drag look, keyboard release and touch movement/look equivalents. No pointer-lock dependency.
- [ ] Add declared object placement/drag actions and optional game objectives with structured attempts/outcomes. Keep keyboard input coalesced and independent of text fields.
- [ ] Test switching two scene cards, typing in Chat, blur/tab hide, Escape, mobile, reset and an unreachable/invalid objective. Distinguish ordinary free navigation from collision-constrained physics movement.
- [ ] Push M5 walkthrough/game slice; learning games remain single-player, bounded and usable without mouse-only precision.

**Accept:** WASD works only where useful and only in focused scene interaction; no stuck movement or canvas shortcut theft.

#### AN-12 — optional Rapier physics (A + R; P dependency/lockfile)

**Files:** new `animation3d/physics.js`, pure configuration tests, integration/browser physics checks; exact pinned dependency.

- [ ] Verify and pin stable Rapier API; lazy-load one trusted adapter. Add explicit bodies/colliders/joints/forces with capability validation and the limits in section 3.
- [ ] Run fixed-step scheduling, collision/joint simulation, bounded forces/velocities, reset/disposal and the declared reload restart policy. Keep kinematic/prescribed behavior separate.
- [ ] Test falling/stacking bodies, an impulse, a constrained joint, invalid/excessive worlds, tab suspension, reset during load, lazy-load failure and slot eviction. Check reasonable physical relationships/tolerances rather than claiming universal scientific accuracy.
- [ ] Push M6 with deployed WASM-load proof, resource/step measurements and a non-physics bundle regression. No hardcoded outcome pretending to be physics.

**Accept:** the physics option runs an actual bounded engine, and ordinary scenes do not pay its startup/resource cost.

#### AN-13 — Tutor integration and activity evidence (V + G; P shared hooks)

**Files:** `animation-evidence.js`, `animation3d/context.js`, server tests; existing Tutor routes integrated by P.

- [ ] Tutor can recommend an Animation material through the shared proposal pathway, with supported format/cost/capability information. No hidden generation or autonomous spending on every Tutor turn.
- [ ] Capture bounded semantic evidence: artifact revision, goal, parameter/action changes, attempts/outcomes, selected object, relevant readouts and limitations. Coalesce continuous gestures; never send raw per-frame telemetry or key logs.
- [ ] Ask Tutor/selection context uses the correct saved revision and real activity. Successful puzzle completion is activity evidence, not an automatic mastery score. When understanding matters, Tutor can ask for an explanation using existing Practice/Explain-back.
- [ ] Test both helpful evidence and no-evidence cases, failed/random success, stale revision and unknown scientific assumptions. Push M7 Tutor slice.

**Accept:** Tutor explains what the learner actually did and does not fabricate understanding or invoke a model per interaction tick.

#### AN-14 — revisions, sharing, forks and final product integration (A + P)

**Files:** storage/context/source tests and focused share/fork browser checks.

- [ ] Finish selected-object/scene refinement, accepted-revision history, recovery and source-dependent rebuild semantics. No edits to another card or silent overwrite of a live good scene.
- [ ] Use existing share/fork rules and capability-limited loaders; read-only viewers cannot call owner source/rebuild APIs. A fork obtains an authorized durable snapshot/copy or clearly reports inaccessible references.
- [ ] Verify document round-trip, shared view, authorized fork, deleted source policy, insufficient permission and old `/explain` animations. Keep scene input state distinct from mutation authority.
- [ ] Push integrated M7 candidate, help/examples and truthful availability declarations for all full-phase experiences.

**Accept:** the feature is part of ordinary Rabbit Hole lifecycle/context/permissions, not an isolated demo route.

#### AN-15 — full qualification and regression closeout (V + P)

**Files:** `animation-full-check.mjs`, security/lifecycle oracles and final evidence receipt.

- [ ] Run the full matrix in section 10 on the frozen candidate. Include fresh unseen prompts across multiple domains, all five output families plus inspect, and mixed procedural/imported scenes.
- [ ] Check sandbox escape attempts, aggregate allocations, invalid transforms, malformed imports, stale async results, multi-card GPU/worker limits and focus/accessibility. Fix demonstrated release blockers; log cosmetic issues as deferred.
- [ ] Compare every AN task/subtask and accepted owner correction with actual code/call paths and results; identify any unreviewed integration commits.
- [ ] Push a complete implementation receipt with remaining release-only/owner-only actions separated. No blanket “all done” from green CI alone.

**Accept:** required behavior is implemented and tested, meaningful limitations are recorded, and no critical correctness/security/budget blocker is open.

#### AN-16 — release, activation and final verification (P)

**Files:** current release tooling/config; final receipt/checklist/fix log only as necessary.

- [ ] Prepare the final candidate with exact-SHA checks and prescribed serialized gate. Obtain only genuinely outstanding release authority; do not repeat prior authorized routine steps.
- [ ] Deploy/activate through the user's existing launcher/process. Keep feature flags coherent between client/server; kill switch/rollback protects previously saved artifacts and older cards.
- [ ] Verify real enabled production flows for generation, controls, refresh, selected asset, physics and Tutor using authorized access. An HTTP health check is not user-flow verification. If signed-in access blocks this, explicitly retain that unverified status and consolidate the owner's action once.
- [ ] Update fix/task/deployment evidence, clean only merged worktrees according to repo rules and deliver final concise handoff. Do not claim production completion while disabled or user flows remain unverified.

**Accept:** full feature implemented, exact-SHA checks passed, deployed, enabled and production user flows verified—or accurately reported as awaiting the one remaining step.


### 14.9 to 14.11 — specification sections moved out of the active plan

These three sections describe scope that is either released (user flow, card UI) or blocked (assets, physics). They are unchanged; they moved so the active plan stays short.

#### 14.9 Former section 3 — User flow and proposal schema (released scope)

1. User types `/animation` with a goal and optional explicit source chips. Bare command uses the existing command help/clarification behavior, not a paid blank generation.
2. An explicit `/animation` selects the capability directly; ordinary-language routing uses existing JEV. The semantic planner then decides what would help: inspect, watch, experiment, game, assembly or walkthrough; behavior may be prescribed, analytical, rule-based or physics. Avoid an unnecessary routing call for an explicit command.
3. Show one active generation proposal in the existing review area above the composer. Preserve the original request and chips. Missing indispensable information uses that area's existing clarification flow.
4. User edits the recommendation through shared settings or conversational Edit. No generation occurs on hover, edit, reload, selection or merely showing the proposal.
5. Generate confirms the latest saved version, sources, cost disclosure and capabilities. Repeated clicks/retries resolve to one job and one result card.
6. Display pending/progress/error in that result card. Keep completed good revisions during a failed refinement.
7. Ready card exposes only controls meaningful for the proposed experience. Users may watch without entering interaction. Explicit interaction captures scene controls; Escape exits to the canvas.
8. Edit/revise uses the same reviewed generation path. Keep the current usable scene until its replacement validates and is accepted. Tutor discussion belongs in the existing right-side conversation panel.

#### Required proposal content

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

#### Planner contract (new, proposed)

`AnimationPlan` has `schema: 'animation-plan/1'`, `title`, `description`, `experience`, `reason`, `behavior`, `controlProfile`, `sourceRefs`, `parameters`, `interactions`, `assumptions`, `limitations`, optional `learningGoal`, and `requiredCapabilities`.

- `experience`: `inspect | watch | experiment | game | assembly | walkthrough`.
- `behavior`: `prescribed | analytical | rules | physics`.
- `controlProfile`: `inspect | manipulate | walk`.
- Proposal envelope, actor binding, revision/hash, expiry and consumption belong to the existing proposal service; do not invent a second signature scheme.
- Runtime capability registry is versioned and server authoritative. Planner output must be checked against the currently enabled phase, including cross-field combinations. `physics` is not permitted merely because the schema enum exists.
- A change to sources, parameters, format or capabilities invalidates the prior approval and estimate. No user change is overwritten by a delayed planner response.

#### 14.10 Former section 4 — Card UI/UX and controls (released scope)

Reference: `rabbit-hole-animation-card-ui.html`, updated with six visible preview selectors:
(a link to the owner's private Library file, not reproduced in the repository)

Parallel may not be able to open the owner's Library. The written specification below is sufficient to start. If the HTML is supplied, copy it to `docs/features/animation/reference-ui.html`. Do not wait idle for it. The HTML is a UI reference with locally drawn illustrative scenes, not production Three.js, generation, persistence or assessment code. Its six top buttons are **demo navigation**, not six buttons to copy onto every production card. Proposal is a workflow stage, not a sixth output engine.

#### Shared card shell

- Header: **Animation**, title, concise experience badge, existing drag/selection affordances and existing prompt disclosure behavior. Use product components, typography and themes.
- Main scene: real Three.js canvas, readable labels and optional compact readouts. Keep a useful working viewport; do not apply the text-card natural-height clamp to this interactive surface. Resizing preserves state/camera and connector bounds.
- Toolbar: only relevant play/pause/restart/speed/camera controls; accessible names for icons; no cosmetic disabled buttons pretending unfinished actions work.
- Local parameter/action area below the viewport. Compact parameter rows, clear units, keyboard-accessible number alternatives to sliders. Do not add an empty parameter panel to a passive scene.
- Footer: Edit, Ask Tutor/context action, source access where applicable; reset and interaction entry where needed. Keep prompt text distinct from title/scene explanation.
- Pending, stopped, failed, saved-ready and recovery states use existing product patterns. Retry is targeted; never reload the whole page and discard unrelated edits.
- Controls and labels fit narrow card widths and light/dark themes. Required interactions work without hover. Any added right panel uses the existing resizable panel component.
- Include a concise accessible scene description and text readouts. If WebGL is unavailable, retain the poster/description and an honest unavailable-interaction state; do not show a blank successful card.

#### Variants

| Variant | Necessary UI | What must actually work |
|---|---|---|
| Inspect | Object title/labels; camera reset; optional selection details | Orbit/zoom and readable labels; no pointless Play button |
| Loop/watch | Play/pause, restart; speed when supported | Continuous loop without resetting inputs; pause preserves the visible moment |
| Experiment | Parameters, units, readouts; reset | Changes affect both geometry and numbers through the same state/model |
| Mini-game | Goal, actionable controls, Check/Submit when meaningful, hint, attempts/outcome, reset | Rules derive from actual state; reset restores seed and declared starting conditions |
| Assembly | Source parts/instances, select/highlight, joint/driver controls, reset; explode only if declared | Actual attached geometry, constrained component motion and meaningful part identity |
| Walkthrough | Enter interaction, control legend, reset view; touch controls | Focused movement/look; Escape releases; no movement while typing elsewhere |

#### Stable control profiles

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

#### 14.11 Former section 6 — Assets and physics after MVP approval (blocked scope)

#### Procedural creation

Use trusted Three.js primitives/composites and geometry builders. Current MVP: box, sphere, cylinder, cone, plane, groups, bounded lines/curves/arrows, text labels and radius-bearing tube curves negotiated through `curve_radius`. **AN-18 (approved 3 November):** a height-grid `surface` with contours and an updatable `trail`, which together replace the hand-built ring-and-cross-section bowls and the one-node-per-point trails that FX-AN-030 measured as 82 of 98 nodes in an SGD draft. Post-MVP (AN-08, still blocked): extruded 2D shapes, lathed profiles, bounded repeated instances. The tube correction and the AN-18 primitives do not mean AN-08 is complete or authorized. Apply triangle/segment caps before allocation. Support recognizable objects without forcing the author to build every object from cubes.

A user image may later inform a **simplified procedural interpretation** using the existing vision-capable model/input path. Keep actual-read provenance and disclose inferred/unknown dimensions. This is not exact image-to-mesh or CAD reconstruction. If the important shape cannot be represented, say so in the proposal instead of fabricating fidelity.

#### Attached models and CAD

Reuse `model-import.js`, `model-storage.js`, `model-loaders.js`, `model-formats.js`, `three-d-asset.js` and existing source authorization. Do not create another upload service.

- Reference stored file/source IDs and immutable revisions, not expiring fetch URLs. Resolve authorization on the server for generation and on reopen/share/fork.
- Preserve true geometry, source names, declared units, transforms and materials. Unknown units are unknown; do not derive manufacturing dimensions from an image or bounding box. A visually scaled source must say so.
- Keep stable instance IDs when the same model is reused several times. Source node/part IDs, instance IDs and scene node IDs must be distinguishable.
- Do not imply a monolithic generated/imported mesh has independently movable components. Bind real source nodes/parts; where absent, ask for separable components or propose a whole-object movement.
- Existing self-contained GLB path has a 20 MiB file limit; imported model registry uses a separate 25 MiB entry limit and aggregate GPU limits. Respect the actual path's stricter applicable limits. Do not globally raise either to make an example pass.
- Existing import supports Meshopt but does not establish Draco/KTX2 decoding. Preserve honest unsupported-format messages; do not add codecs or network fetches incidentally.
- Multi-model assemblies use scoped loaders and checked references; external resources may only resolve through existing permitted local bundle rules. No arbitrary generated URLs.

#### Prescribed assemblies

Define generic instances, local frames, axes, joint limits, drivers and couplings. MVP is not blocked by this work. Full release must support a small multi-part assembly with selection and constrained rotation/translation. A gear demonstration can use declared ratio coupling; it must not pretend tooth collision was physically simulated. Preserve local-to-world transforms and source units. Ctrl+K scoped edits identify the selected instance or whole scene, show the proposed change and create a revision; originals remain unchanged.

#### Optional real physics

Add `@dimforge/rapier3d-compat` lazily behind `physics.js` only when an approved plan uses `behavior: physics`. There is **no Rapier dependency in the inspected repo lockfile**. At implementation time verify the current stable version/API from official Rapier documentation/npm metadata, pin the exact version and record it with the lockfile change. Do not reuse an old document's version assertion as current verification.

Implement box/sphere/capsule/cylinder colliders first; static triangle meshes only through validated supported paths. Explicit mass, friction, restitution, gravity, fixed/kinematic/dynamic bodies and supported fixed/revolute/prismatic joints are validated. Movement that is prescribed uses a kinematic driver; impulses/forces are distinct commands. Joint limits, collider budgets, invalid mass and runaway velocities have defined errors/recovery. Physics is not a universal model for electronics, chemistry, fluids or orbital mechanics.

Keep Rapier/WASM out of ordinary watch/experiment bundles until requested. Test actual deployed lazy loading and disposal. Scientific labels/readouts must state whether they are analytical, measured from the simulation, authored or illustrative.

