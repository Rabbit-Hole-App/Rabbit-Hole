# /explain program support

What a generated /explain program card supports, its limits, how it recovers and how it is rolled back. Plan:
[2026-10-29-explain-tasks-8-11.md](../superpowers/plans/2026-10-29-explain-tasks-8-11.md) (Tasks 10-11). Status of each
item: [explain-sandbox-checklist.md](explain-sandbox-checklist.md). Times are PT. Written 2026-10-29 from code and
receipts; "not released" means not on `main`.

## Note for Claude Code

### 2026-11-08: Phase 02 written Explanation library

The approved **four new kinds and nine existing-kind extensions are implemented** on `chatgpt/explain-phase02-library`, based on `748e561eda37a269e277d913cdc1f9099fe9bf94`. This addition concerns written `/explain` and its `tutor-diagrams` JSON→SVG path; the `/interact` program/SDK sections below describe a separate renderer and remain unchanged.

- [Implementation and dev acceptance handoff](explain-on-canvas/handoff/phase02-library/README.md)
- [All 130 reference SVG/JSON pairs and all 21 lesson mappings](explain-on-canvas/handoff/phase02-library/references/README.md)
- [Executable source/extension guide](../../packages/web/src/tutor-diagrams/README.md)
- [Plan and completed implementation checklist](../superpowers/plans/2026-11-08-explain-phase02-library.md)

These examples now reach the actual written-Explanation author and its repair context through `explanation-references.js`; they are no longer just test fixtures. Fixed JSON/reference checks and the web build are local evidence. Live model choice, provider acceptance of the expanded schema, browser rendering, saved generated-card reopen and production deployment remain separate pending checks. Preserve the ongoing binary-tree selection work and three-visual release when integrating shared backend files.

## Versions

A card runs only when its artifact matches a supported tuple exactly. Nothing matches by major version, and no fingerprint
is ignored. An artifact sealed for anything else gets the fixed "could not run" message, and no Worker starts.

| Schema | Engine | SDK / renderer / policy / permissions | Operations | State |
|---|---|---|---|---|
| 1 | `quickjs-release-sync@0.32.0` (WASM `105c3bed...`) | `sdk-1` (`055af456...`) / `renderer-1` / `policy-1` / `perm-1` | `evaluate` | none (`state: null`) |
| 2 | same | same | `initialState`, `reduce`, `evaluate` | JSON state, see below |

- Schema 1 is on `main` and in production. Every accepted card so far is schema 1, including cooling, sorting and
  gravity.
- Schema 2 is R3, which carries 8.1 `86d746e0d`, 8.2 `137018604`, 8.3 `0ee34e70c` and the owner-review fixes. It is on `main`
  and production-released in `d3d50986e` (3:11 PM PT), with `EXPLAIN_PROGRAM_STATEFUL=true`. `stamps.js SUPPORTED_PROGRAM_TUPLES` lists both
  tuples; schema 2 seals with `STATEFUL_PROGRAM_STAMPS`.
- New drafts seal as schema 1 by default. A draft that declares a viewport, actions or targets uses schema 2 when
  `EXPLAIN_PROGRAM_STATEFUL` is on and exports `initialState`, `reduce` and `evaluate`. The server selects the SDK and renderer
  from the supported stamps based on the declared capability.
- The learner's card and the review renderer (`render/program-render.jsx`) both run through `host.js createProgramHost`, so
  both resolve the same tuple.
- Evidence (`packages/web/src/explain-program/retention.test.mjs`, 6 tests): the saved sandbox-ex1-b cooling artifact
  resolves and runs unchanged. An artifact sealed for another engine, SDK or renderer is `version_unavailable` before a
  Worker starts. An unknown schema is `invalid_program` at load. Corrupted source or a corrupted stored hash is
  `version_unavailable`. A missing WASM or Worker script is `version_unavailable`. All 6 pass on `main`, on a local merge
  of `86d746e0d`, and on a local merge of R3 `6b52ee7ea`. Neither merge was committed.
- Rollback compatibility: a build without 8.1 refuses a schema 2 artifact the same way it refuses an unknown schema, with
  the fixed message. It never runs it as schema 1. So a rollback past 8.3 strands schema 2 cards (unavailable, kept)
  until the newer build returns.

## Interactive visual SDK

The interactive kit seals ordinary new programs with `sdk-2` for both schemas. It adds
`sdk.plot`, `sdk.graph`, `sdk.grid`, `sdk.geometry`, `sdk.timeline`, and `sdk.readout`.
Each helper returns ordinary frame objects. Author and repair calls keep the same
request limits, and all helpers share the existing frame limits.

The heat-grid capability seals a separate `sdk-3` and `renderer-2` tuple for either schema. The author declares
`heat_grid` in the manifest and uses `sdk.heatGrid(id, { x, y, cell, rows, cols, values, domain })` to return one frame object.
Values are finite and in row-major order. The increasing `[min, max]` domain drives the existing sequential heat renderer
while labels can retain the original units. A comparison uses the same domain in every setting.

Saved `sdk-1` and `sdk-2` programs keep their original guest source and supported tuples. The server, learner player and
review renderer need a compatible build for a new tuple. Rolling back to a player that predates a tuple makes its cards
unavailable until a compatible build returns.

### Medium interactive visuals

Programs using the Medium helpers declare `medium_visuals` in their manifest and
seal with `sdk-4`. The server and player retain the earlier SDK tuples. The helpers
use the existing card controls, state and shared scene renderer.

| Helper | What it supports | Dev fixture ID |
|---|---|---|
| `sdk.trace` | Intervals, nested and overlapping calls, dependencies, a shared clock and selection details | `fixture-medium-trace` |
| `sdk.field` | Sampled scalar contours and vector fields with explicit scales and units | `fixture-medium-field` |
| `sdk.evidence` | Wrapped source text, stable UTF-16 offsets and the selected excerpt and citation label | `fixture-medium-evidence` |
| `sdk.expandableGraph` | Branch selection in a bounded rooted tree, with stable positions as branches open | `fixture-medium-tree` |
| `sdk.imageRegions` | Selectable rectangles in normalized image coordinates | `fixture-medium-image-regions` |
| `sdk.imageViews` | An overview and synchronized crops of the selected region | `fixture-medium-image-views` |

The image helpers accept the bundled `vlm-patch-source` asset ID. The renderer
resolves that ID to a repository-owned raster. User attachments require a
permission-aware asset binding before they can appear in these views. The guest
cannot supply an image URL. The dev fixtures are hand-authored card inputs for
verification.

### Linked selection and comparison

Bounded linked comparisons compose the existing geometry, grid and readout helpers
with schema 2 selection state. Keep one selected record ID in state. Map each
plot-point target and its corresponding row target to that ID, then derive the
highlighted point, highlighted row and displayed value from the same record.
Every declared target remains present across selections.

The dev fixture `fixture-medium-linked-comparison` demonstrates three records,
selection from either view, a shared value readout and clearing the selection.
It uses the existing saved-state handling. This is a reusable composition example;
the broader inventory's seven linked-comparison designs still describe potential
applications of that pattern.

### Cyclic networks

Programs declare `cyclic_networks` to seal with `sdk-5`. The new source appends
`sdk.cyclicGraph` while retaining the exact SDK 1, 2 and 4 sources and tuples.
Both schemas use the existing renderer; no new frame object kind is introduced.
Declare `medium_visuals` as well if using Medium image objects.

```js
sdk.cyclicGraph(id, {
  x, y, w, h,
  nodes: [{ id, label, x, y, role }],
  edges: [{ from, to, label, via: [[x, y]], labelAt: [x, y] }],
  selected: null,
})
```

`role`, `via`, `labelAt`, and `selected` are optional. Node positions are centers
in local pixel coordinates; route waypoints and label positions are local too.
Use 2–8 nodes and 1–12 directed edges. Labels are required: up to 24 characters
for nodes and 14 for relationships. Cycles, reciprocal edges and self-loops are
supported. Reciprocal links separate automatically; a self-loop routes above its
node unless an explicit route is supplied. Route points, node boxes and labels
must fit the supplied rectangle. Crowded layouts fail with a specific diagnostic;
this is a bounded teaching helper, not an automatic layout for dense networks.

The selected node and its outgoing arrows use the existing learner color.
Selection preserves positions and object IDs. Node targets are
`<graphId>.node.<nodeId>`; edges use `<graphId>.e.<from>:<to>` with primitive
suffixes `.p`, `.a`, `.l`. At most 44 objects are emitted, within the existing
60-object frame budget; other scene content shares that budget.

`fixture-cyclic-network` in `cyclic-fixture.js` shows Plan → Act → Observe → Plan.
It uses the existing card selection, persistence and Reset handling. The author
and repair context both describe the helper. Focused checks cover routing,
invalid input, sealing/version compatibility, every node selection, restoration
and reset. All 50 affected checks passed, and the dev web build passed. A static
render of the shared Frame was inspected with Observe selected (SVG color-mix
and context-stroke resolved for the offline rasterizer only). This is not browser
interaction evidence. Deployed generation and live browser interaction remain unverified;
this environment has no authorized deployment credentials or working browser
capture. No planner mapping, repair-budget or browser-assertion changes are part
of this implementation.

### Numeric raster images and segmentation masks

Programs declare `raster_visuals` and seal with SDK 6 / renderer 4. The earlier
SDK sources and supported tuples remain unchanged. The shared `Frame` renders
numeric RGBA rasters with nearest-neighbor scaling and transparent alpha, using
bounded horizontal SVG runs. Guest URLs, markup and image decoders are not added.

- `sdk.raster(id,{x,y,w,h,rows,cols,pixels})` returns **one** frame object. Pixels
  are a flat row-major array of RGBA integer bytes (0–255), four per pixel.
- `sdk.mask(id,{x,y,w,h,rows,cols,values,color?,opacity?})` returns one RGBA raster.
  Each value is coverage 0–1. Color is `#RRGGBB`, default `#E5AA46`; opacity defaults
  to 1. Alpha is rounded coverage × opacity × 255. Zero alpha paints nothing,
  including holes within a region. Draw after the source using matching bounds
  and pixel grid; multiple masks can represent different classes within the limits.
- Each raster has 1–64 rows/columns and at most 4096 pixels. A frame permits at
  most 8192 raster pixels total. Existing 256 KiB output, object, viewport and
  execution budgets still apply. A raster counts as one frame object, but its
  pixel workload is independently bounded. Resizing scales the pixel grid; it
  does not recompute a higher-resolution segmentation.

Examples are in `raster-fixtures.js`, available through the normal dev fixture
resolver and existing select controls:

| Fixture | Behavior |
| --- | --- |
| `fixture-raster-mask` | Select ring, rectangle or none on a synthetic 24 × 24 image. The ring mask keeps its center transparent. |
| `fixture-raster-transform` | Switch original, 3 × 3 box blur, or Laplacian edges. Numeric pixels are recomputed by the sandbox. |

Both examples are explicitly synthetic, not model predictions. Author and repair
contexts include the signatures and limits. This closes bounded raster/mask
rendering support, not full-resolution photo processing, learner attachment
binding, automatic segmentation inference or GPU model execution. Those remain
separate integrations. The other four deferred capability groups are unchanged.

Verification: helper validation, real QuickJS fixture execution, capability/version
gates, preserved SDK fingerprints, exact filter pixels, transparency and holes,
shared-scene conversion, and unchanged external-image rejection are checked by
focused tests: 61 integration/helper/compatibility checks passed, as did the shared
scene checks and dev web build. Static shared-Frame output was inspected for the
ring mask and blur (offline SVG export maps transparent paint to none). Raster
selection uses whole-object bounds, not per-pixel hit testing.
Dev deployment and live browser interaction remain pending because
this environment lacks the authorized dev credentials and working browser capture.

### AI teaching examples

Three hand-authored examples compose the existing 2D SDK in normal program cards.
They are exported together by `ai-teaching-fixtures.js`, admitted only through the
existing dev fixture gate. They are reusable source examples, not a new automatic
lesson-routing system and not proof of LLM generation quality.

| Fixture | Teaching mechanism | Source |
| --- | --- | --- |
| `fixture-ai-convolution` | Move a 3 × 3 kernel across a small synthetic image and inspect the calculated response. Uses the CNN cross-correlation convention. | `ai-convolution-fixture.js` |
| `fixture-ai-attention` | Select a query and causal masking; compare scaled scores, normalized weights and their weighted value output. Numbers are synthetic. | `ai-attention-fixture.js` |
| `fixture-ai-gradient` | Vary learning rate and update count for a known quadratic loss; compare convergence, overshoot and divergence. | `ai-gradient-fixture.js` |

All source paths above are under `packages/web/src/explain-program/`. The examples
reuse `ProgramScene`, shared `Frame`, existing input controls and their persistence
and Reset behavior. No new SDK version, planner mapping or repair budget is added.
Focused tests check the numerical mechanisms independently and exercise the real
QuickJS and frame-normalization paths. The normal fixture resolver and saved input
round trips have their own integration checks. Verification: all 14 focused AI
tests pass; the dev web build passes. Shared-Frame SVG renders were inspected for
all three scenes (offline rasterization does not render the gradient's KaTeX
foreignObject formulas). This is static scene inspection, not browser acceptance.
Live browser/dev acceptance and
real model generation remain pending; the authorized deployment environment is
not available here.

## Dev verification evidence (integrated branch, 2026-11-08)

One branch carries the heat-grid line (SDK 3), Medium (SDK 4), linked comparison, cyclic networks (SDK 5), raster and masks (SDK 6) and the three AI teaching examples. Each SDK line keeps its own
stamp tuple and source bytes. Verified on the dev clone `rabbit-hole-web-dev-tc-s7d2` (deployed from commit `a1804bc8f`; hand-authored fixtures, no model call unless stated). Strictly 2D.

| Capability | Fixture | Checked in a browser | Result |
|---|---|---|---|
| Medium: trace, field, evidence, expandable tree, image regions, image views | the six `fixture-medium-*` | render, change a control or selection, reload, fresh browser context | pass (7 of 7 with linked comparison, repeated on the integrated build) |
| Linked selection and comparison | `fixture-medium-linked-comparison` | select from the plot and from a row, reopen | pass; both views highlight and the readout updates |
| Cyclic networks | `fixture-cyclic-network` | select each node, arrow highlight and note, reload and fresh reopen, Reset and reload, clipping | pass (10 of 10); labels sit about 80 px from their arrows because the fixture places them explicitly |
| Raster and masks | `fixture-raster-mask`, `fixture-raster-transform` | pixel-level: every cell's colour against the expected class or filter, source unchanged, reload, fresh reopen, Reset, resize from the corner grip | pass at default and wide sizes (mask covers exactly its selected pixels, ring hole transparent, filters match their formulas on all 576 cells); resized width is saved. At narrow widths the drawing keeps its legible size and the card scrolls, as for every program card |
| AI teaching examples | `fixture-ai-convolution`, `fixture-ai-attention`, `fixture-ai-gradient` | render, change every control, reload, fresh reopen, Reset and reload; hand-computed values compared with the drawn numbers | pass (convolution 10 of 10, gradient 10 of 10, attention 9 of 9; for query C the causal and unmasked views are identical by construction) |

One real `/interactive` request (Opus, dev clone, about $0.61) produced a card that calls `sdk.trace`, declares `medium_visuals` and seals `sdk-4`; a control change survived a reload and a fresh browser context.
Before the author rule named the Medium helpers the same request drew the trace by hand (`sdk-2`).

Integration decisions (flagged for review):
- The Medium, cyclic, raster and heat-grid helper docs are authoring-only: the repair request carries the program and the validator's problems. With all four stacked a maximal program no longer fits the repair request.
- The fixed author request is 41,010 bytes with all four families. The sanity line in `explain-program-budget.test.js` moved from 40,000 to 44,000 bytes (the pinned role ceilings are unchanged). Selecting helper docs per family is the lasting fix before more families.
- Both guard tests that listed exact capability sets were updated to the stacked sets, and the board-link reader registry lists the field helper's contour links.

Not verified: a plain-words Tutor request routing to `/interactive` on the dev clone (it lacks the chat router key, so the router answers in text); production behaviour; the heat-grid fixture in a browser on this branch (SDK 3 compatibility is covered by unit tests only).

Generation access: the fixtures are resolved only by `program-card.js` from a saved card's `program.fixtureId`, and only in dev builds (`fixturesAdmitted`). The author, brief and example selection do not import them, so the generation workflow cannot use them. The author is taught the helper signatures (authoring context only).

## Limits (main: `contract.js CONTRACT_LIMITS`, `limits.js LIMITS`)

| Limit | Value |
|---|---|
| Source / manifest | 16 KiB / 4 KiB |
| Guest output | 256 KiB serialized, depth 32 |
| Frame | 60 objects, 2,000 points per object, 10,000 points total, coordinates ±100,000, size 2,000, text 200, 16 runs |
| Heat grids | At most 256 cells across a frame, with each grid fully inside its viewport |
| Inputs | 4 controls; a select has at most 8 options; at most 64 option combinations |
| Readouts / quantities / assumptions | 8 / 32 / 8 |
| Duration | at most 120 s |
| Time | 50 ms per operation, inside the guest (source load, call and serialization); 250 ms host watchdog, then `Worker.terminate`; 2 s engine boot |
| Memory | 32 MiB WASM cap per Worker; 16 MiB QuickJS heap; 256 KiB stack |
| Workers | at most 2 live across all cards; an idle one is evicted for a card that needs to run; one unused for 30 s is terminated |
| State (schema 2, R3) | 32 KiB canonical UTF-8, depth 32, finite numbers only (`LIMITS.stateBytes`; one rule in `contract.js stateProblem`) |
| Actions / targets / viewport (schema 2, R3) | 8 / 8 / width x height at most `viewportPixels` 963,200 (1120 x 860), the per-capture size the review reserves; every stateful frame has the declared viewport |
| Pending events (schema 2, R3) | 16 (`interaction.js ACTION_QUEUE_CAP`); buttons are greyed, names kept, while it is full |

## Controls and state

Released (schema 1):
- Play advances real simulation time, and Pause holds it. The scrubber and Replay jump in time, and a frame from before a
  jump is never drawn after it.
- The inputs are numeric sliders and selects. Reset restores the defaults and time zero.
- The owner's inputs and paused moment are saved quietly to the board. Viewers and share-link guests keep theirs in
  memory, and nothing is written to the source board.
- With reduced motion, Play shows the end state instead of animating.

R3, schema 2 only (released in `d3d50986e`):
- Controls:
  - Declared buttons and selectable drawing objects use the existing button style and work from the keyboard.
  - Clicking a declared target in the drawing sends the same select event as its button.
  - Events are `{type:'action'}`, `{type:'select'}` and `{type:'input'}`, each declared in the manifest. `drag_*` events
    are `unsupported_capability`; 8.4 adds dragging.
- Order:
  - Events apply one at a time, in order, and none is dropped. Only consecutive changes of the same input coalesce.
  - A dispatch refused because the queue is full saves nothing.
- Commit:
  - A new state commits only after its frame validates at the current moment.
  - Each transition is checked, committed and drawn with its own input snapshot (`programState.inputs`), so a newer input
    never fails an older transition.
  - A failed transition keeps the last accepted state.
  - Until a change commits, the controls show the pending values.
- Reset:
  - Reset and initialization check the new initial state before replacing anything.
  - A failed Reset keeps the last good state, in memory and as saved.
  - A completed Reset is one save: the defaults plus the checked initial state, with the original seed.
- Restart and reload:
  - Both restore the committed state with exactly its input snapshot, without initializing again.
  - A change that never committed is neither rebuilt nor retried.
  - Restart never generates.
- Time:
  - Scrubbing evaluates the current state at another time; it does not replay events.
  - The frame key includes the committed state's bundle and revision, so an older state's frame never draws after a newer
    one.
- Saving:
  - `block.programState = { bundleHash, state, revision, seed, inputs }`. It never holds source and is used only for the
    same artifact.
  - Apply of a new revision drops it; Discard keeps it.
  - Owners save settled states through the quiet board save. Viewers and share-link guests keep theirs in memory.
- Review:
  - The capture manifest samples bounded event sequences from the initial state, at most 4 events each: each button once,
    each target once, then a run of the first button. They fit within the six captures; what does not fit is listed as
    omitted.
  - The review page replays a sequence the way the card plays it (`interaction.js replayTransitions`). It initializes,
    reduces each event, and checks the initial state and every later state before the next event. A sequence the learner
    could not get past fails review at that step, with its code and phase.
  - Each capture is bound to the sealed bundle hash, seed, events, state hash and pixels.
  - A candidate whose captures exceed the render reservation goes to bounded repair with the measured reason.
- Switch: `EXPLAIN_PROGRAM_STATEFUL`.
  - Without it, generation stays schema 1: no stateful author tool, brief buttons or repair contract is offered.
  - `b6caa951c` sets it to true in `wrangler.rabbit-hole-prod.jsonc` and `wrangler.dev.jsonc`, pinned in
    `rabbit-hole-prod-config.test.js`.
  - Reverting that one commit turns stateful generation off. Schema 2 cards already accepted keep running, because the
    tuple stays supported.

## Frame overrun

Owner decision 2026-10-29, option A: `fix/explain-frame-overrun` `3648d595b`, on `main` and production-released in
`70b7425ed` (2:39 PM PT).
- A frame that misses the 50 ms deadline is skipped. The last frame stays, and the newest moment is asked for again.
- A drawn frame resets the count. The third overrun in a row stops the card.
- The watchdog, the boot deadline, and the memory and output limits still stop the card at once.
- The review capture player does not use this scheduler, and still fails a capture on one overrun.

## Offscreen and lifecycle (Task 10.1)

On `feat/explain-offscreen-pause` `35410272d` (based on `release/chain-overrun` `f676fd95c`), released in R4 `d92cc18d5` (production run 40977367647); the card check timing fix `2c8be1452` is not in it yet:
- A playing card pauses when its tab is hidden or the card leaves the viewport (`playback.js watchSeen`, an
  IntersectionObserver). A card in Focus counts as seen wherever its canvas position is.
- While paused, no frame is requested. Coming back shows the same moment, paused, with no fast-forward. Play intent is not
  kept, matching the existing hidden-tab behavior.
- Hosts are disposed when a card is deleted or the user navigates in-app (the same unmount path). The Proposed/Current
  switch and artifact replacement are covered by `explain-program-card-check.mjs` step 17 on that branch (14 on `main`; the existing Edit preview
  step).

Measurements: headless Chromium 151 under Playwright on the local stack (Windows 11 workstation), not a device
benchmark.

| Measurement | Result | Source |
|---|---|---|
| Growth fixture playing at 1600x1000 | 57 frames drawn in 59 animation frames over 1006 ms | card check step 14 |
| In-app navigation to a canvas, until its program card's first frame (cold Worker) | 1057 ms | card check step 16 |
| Three playing cards on the two-Worker budget (unit, real engine) | peak 2 live Workers, at most 1 outstanding request per card, 0 Workers left after closing | `lifecycle.test.mjs` |

## Recovery

| What the learner sees | Cause | Recovery |
|---|---|---|
| "exceeded its runtime limit" + Restart explanation | 50 ms deadline (three in a row with the overrun fix), watchdog, boot or memory | Restart starts a fresh host on the same saved artifact. It never generates. |
| "needs a capability that is not available yet" | unknown capability, or execution kill | Kept on the canvas. It runs again when the kill is lifted, or on a build that has the capability. |
| "could not run. Your saved version is kept." | unknown version or schema, hash mismatch, missing WASM, result route failure | Kept. Nothing is rewritten to make it parse. |

## Rollback controls

These are four separate controls. Each needs exact-SHA `verify` and `fast-e2e`, plus the gate, before use.

| Control | Effect | Current pin | State |
|---|---|---|---|
| Generation off | `EXPLAIN_PROGRAM_ENABLED=false`. No new programs, and Edit of a program card is refused. Accepted cards keep running. | `9859c2406` (cut on `d3d50986e`) | **Stale after R4**; the integrator re-cuts it on the final main. |
| Execution kill | `EXPLAIN_PROGRAM_EXECUTION_KILL=true`. A card that loads afterwards refuses to run. A card already open keeps running until it is reloaded (the check runs at result load; `retention.test.mjs` pins this). Generation and charges continue. | `c0dc41daa` (cut on `d3d50986e`) | **Stale after R4**; re-cut on the final main. |
| Stateful generation off | `EXPLAIN_PROGRAM_STATEFUL` unset or false. New requests author schema 1 only. Accepted schema 2 cards keep running, because execution does not read this switch. | `4105d5023` (cut on `d3d50986e`; it reverts `b6caa951c`) | Live control since R3. The cut is **stale after R4**; re-cut on the final main. |
| Emergency Worker rollback | Both production Workers go back to the recorded pre-release pair. This also stops new generation. | `C:/s/spec/explain-sandbox/prod/state/prev-worker.txt` | Stale: it records the pair from before `fc31f723a`. It must be re-recorded at the next release, or it would roll back every release since. |

`C:/s/spec/explain-sandbox/prod/generation-off.pins` and `kill.pins` still name the pre-MVP cuts `9f7060d47` and
`31f349d60`. Refresh them with the re-cut SHAs.

## Five-subject transfer evidence (Task 10.4)

This table uses only existing genuine runs. Model identity comes from the job diagnostics' `requested`/`served` fields,
never from an agent's claim. Spend is in the ledger `C:/s/spec/budget/budget-explain-sandbox.json`.

| # | Case | Request | Model (receipt) | Bundle | Review | Interaction evidence | Spend | Timing | Limitations |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cooling, physics, schema 1 (sandbox-ex1-b, dev, 2026-10-28) | "I put a cup of hot coffee in a cold room. Show me how it cools down over time, and let me change the temperature of the room..." | author, review, repair, review: requested and served `claude-opus-5-5` | `62c202e9...` (hashes re-verified) | accepted, round 1 (one repair), result `er_a5e59350...` | Deployed check on dev `fc31f723a`: Play animates, the room slider is reachable, shared view, desktop and 390 px, board unchanged (`runs/deployed-fc31f723a`) | US$0.346126 (settled) | job 115 s from create to ready | The harness lost its connection (`fetch failed`) and collected afterwards. The earlier attempt sandbox-ex1-a failed (US$0.44). |
| 2 | Sorting, computing (non-physics), schema 1 (sandbox-ex2-a, dev, 2026-10-28 10:58 PM) | "Walk me through how bubble sort and selection sort each put the same short list of numbers in order, one step at a time..." | 4 calls, requested and served `claude-opus-5-5` | `b39fe01b...` | accepted, round 1 (one repair), result `er_f2d73f14...` | Automated: the algorithm select switches the drawing and the totals (9 vs 10 comparisons), no generation call, board unchanged. Stepping redraws: one manual capture (`check/sorting-step21.png`) | US$0.42 (settled) | 144 s processing | Time is a "step" slider (0-21), and there is no Play. The check's Play and time asserts failed because no transport exists, so stepping is not an automated assert. |
| 3 | Gravity, physics, schema 1 (owner, production) | Not recorded (the receipt keeps only `promptRef a4e6dab2...`). Card title: "Gravity on Earth and on the Moon". | not exposed: the read-only routes carry no model identity | `3ed2d2ab...` (stored, recomputed, card and identity all match) | accepted, round 0, 2 calls, result `er_0f9a7032...` | none in the receipt (read-only). The owner's own check is not written down. | 21 credits on the owner's production account (US$0.21 at the 1 credit = US$0.01 rate the dev runs show; not in the sandbox ledger) | 67.9 s processing | Receipt `C:/s/spec/explain-sandbox/prod/receipts/explain-prod-receipt-20261029-094422.json` (09:44 AM): 14 of 15 checks pass. The verdict is FAIL only because the script's release pin was stale (expected `fc31f723a`, served `f421cc5de`, release 5 from 09:26). Correction to the 8-11 brief: this receipt exists. |
| 4 | Stack versus queue, computing (non-physics), schema 2, chosen after R3 was implemented (t811-c4-b, dev preview `d3d50986e`, 2026-10-29) | "Help me understand how a stack and a queue are different. Give me buttons to add a new item and to take one out, and show me which item comes out of each one every time I press." | brief, author, repair, review: requested and served `claude-opus-5-5` | `7ea95f64...` (hashes re-verified on `d3d50986e`); 3 actions (Add next item, Remove one item, Start over), no targets or inputs | accepted, round 1 (one repair), result `er_55ab7c30...` | Deployed owner board: each button changes the drawing and the Notes values; a non-initial state survives reload; Reset returns to the initial state; only the board's own save was written. Phone: drawn, controls visible. Shared viewer: a press changes only the viewer's drawing, reload returns to the saved card, the shared board is unchanged. 16 ok, 0 failed, 2 not testable (no number input; Restart appears only on the failure view) | US$0.36 (36 credits) | job 120.7 s | The first attempt t811-c4-a (US$0.02) stopped at the brief because the driver had no Generate step. The driver's poll lost one GET ('fetch failed'), and the evidence was collected afterwards with GET-only calls. |
| 5 | pH of water, chemistry, a slider together with buttons under schema 2, chosen after R3 was implemented (t811-c5-a, dev preview `d3d50986e`) | "Show me how the pH of a glass of water changes as I add drops of vinegar or baking soda. Let me add drops with buttons, and let me slide how strong the vinegar is to see how that changes things." | brief, author, repair, review: requested and served `claude-opus-5-5` | none accepted (the author's draft omitted `manifest.targets`; the repaired candidate was `d52567be...`) | **failed**: review rejected round 1, `unsupported_repair` (category spec); not retried | none (no card) | US$0.41 (41 credits) | job 129 s | All 9 findings were minor: crowded axis labels, and spaces collapsed in one text line (5 findings). Two findings were about review coverage, not the program: the sampled captures never moved the slider (rf3), and Reset was sampled only from the initial state (rf9). This matches R3's capture plan: each button once, each target once, then a run of the first button, and no input. Continuous control under schema 2 is therefore not reviewed. |
| 6 | A cold spreading through a class, biology/epidemiology (non-physics, non-chemistry), a slider together with buttons under schema 2, chosen after R4 was implemented (t811-c6-a, dev preview `d92cc18d5`, 2026-10-29 5:07 PM PT) | "Show me how a cold spreads through a class of 30 pupils. Give me a button to vaccinate a few pupils at a time and a button to move on to the next day, and let me slide how easily the cold passes from one pupil to another." | brief, author, repair, review: requested and served `claude-opus-5-5` | `647f0bca...` (hashes re-verified on `d92cc18d5`); 3 actions (Vaccinate 3 pupils, Next day, Start again), one number input, no targets | accepted, round 1 (one repair: the author's draft again omitted `manifest.targets`), result `er_840b01b6...` | Deployed owner board: each button changes the values (for example Vaccinate: Healthy 29 to 26, Vaccinated 0 to 3; Next day: day 1, Sick 4); the slider changes the drawing; a non-initial state survives reload; Reset returns to the start; only the board's own save was written. Phone: drawn, controls visible. Shared viewer: presses stay local, reload returns to the saved card, the shared board is unchanged. 17 ok, 0 failed, 1 not testable (Restart appears only on the failure view) | US$0.42 (42 credits) | job 128 s | The review accepted it with 3 minor findings, including two coverage notes: the slider's minimum and maximum were not sampled, and only one day of spread was sampled. |

Five qualifying subjects:
- Cooling, sorting and gravity are schema 1.
- Stack/queue (case 4, buttons) and the spreading cold (case 6, a slider together with buttons) are schema 2.
- Both schema 2 cases are non-physics, were chosen after implementation, and were checked deployed for owner and viewer.

Case 5 (pH) failed review on R3 and was not retried. Its two coverage findings were then fixed in R4 `d92cc18d5`, where
review moves every number input and samples Reset from a changed state; case 6 ran on R4.

Tasks 8-11 spend is US$1.21 of US$5.00: t811-c4-a 0.02, t811-c4-b 0.36, t811-c5-a 0.41, t811-c6-a 0.42.

Limits of this evidence:
- One genuine card per schema 2 shape.
- No genuine card with selectable targets or with a drag.
- Both schema 2 authors omitted `manifest.targets` on their first draft, so each needed one repair round.

Budget (owner, 2026-10-29; recorded in `C:/s/spec/budget/ledger.md`):
- The cap is US$5.00 for Tasks 8-11 runs only. The earlier US$1.2061 does not count.
- Run ids start with `t811-`, so the Tasks 8-11 total is the sum of those entries in `budget-explain-sandbox.json`.
- Before each run, reserve its worst case of US$3.31328, the policy generation ceiling (`explain-policy.js
  explainReservation`, the driver's `RESERVE_USD`).
- One run at a time, with no automatic retry.
- Two worst cases (US$6.63) exceed the cap, so case 5 starts only if case 4 settles at US$1.68672 or less. Past runs settled
  at 0.35-0.44.
- Recompute the ceiling if R3's prompts change it.
- Run plan: `C:/s/spec/explain-sandbox/genuine/t811-plan.md`.

## Test plan: lifecycle and support matrix (Tasks 10.1, 10.2)

Browser checks run in approved CI (`fast-e2e`) or under the owner's /explain local exception, on an exact build. Mark each
cell passed, failed or not tested, with the build SHA.

- 10.1, implemented on `feat/explain-offscreen-pause`:
  - Card check 14: a playing card panned out of view pauses, draws nothing while away, and returns at the same moment.
    Verified to fail without the observer (it returned at 4 s after leaving at 1.5 s).
  - Card check 15: deleting a card closes its Worker.
  - Card check 16: in-app navigation closes the old canvas's Workers.
  - Card check 17: the Proposed/Current switch.
  - Unit tests: `playback.test.mjs` (watchSeen, Focus, settling while paused) and `lifecycle.test.mjs` (three cards on two
    Workers).
  - Still to add after 8.3: a stateful card offscreen keeps its committed state and its queue, and drops no actions.
- 10.2 matrix, run 2026-10-29 between 4:46 and 4:55 PM PT on https://preview.digrabbithole.com.
  - The served commit, read from the Cloudflare version chain before and after the run, was `d3d50986e` (R3).
  - Saved cards only: cooling (sandbox-ex1-b, schema 1), sorting (sandbox-ex2-a, schema 1) and stack/queue (t811-c4-b,
    schema 2). No generation call was made.
  - Browser: headless Google Chrome under Playwright on a Windows 11 workstation.
  - Script `C:/s/spec/explain-sandbox/genuine/matrix-check.mjs`. Overall: 2 cells FAILED on visual findings; the automated checks were 65 ok, 0 failed, 1 not testable. Log
    `C:/s/spec/explain-sandbox/matrix-d3d50986e.out`; measured facts in `C:/s/spec/explain-sandbox/matrix/d3d50986e/matrix.json`. I looked at the screenshots myself.
  - A control counts as "reachable" when its centre is on screen and on top after panning the canvas to it, as a learner would.
  - **390x844 is a Chromium viewport with touch emulation. It is not an iPhone, Safari or WebKit test.**

Results by cell. **Panning** says whether the card's first control was reachable at the view the page opened with
(`C:/s/spec/explain-sandbox/genuine/pan-probe.mjs`, run at 5:03 PM PT, preview still at `d3d50986e`). The opening view is
the canvas camera saved at that moment, so "needed" means a learner had to pan before using the control.

| Cell | Card | Result | Panning | Screenshots (`C:/s/spec/explain-sandbox/matrix/d3d50986e/`) |
|---|---|---|---|---|
| 1440x900, owner, light | cooling | **FAILED**: Focus placement (visual finding 1) | not needed | `d1440-owner-light-cooling-*` |
| 1440x900, owner, light | sorting | passed | needed (off-screen) | `d1440-owner-light-sorting-*` |
| 1440x900, owner, light | stack | passed | needed (off-screen) | `d1440-owner-light-stack-*` |
| 1440x900, owner, keyboard only | cooling | passed | not needed | `d1440-owner-keyboard-cooling-*` |
| 1440x900, owner, keyboard only | sorting | passed | needed (off-screen) | `d1440-owner-keyboard-sorting-*` |
| 1440x900, owner, keyboard only | stack | **FAILED**: focused Add hidden by the minimap (visual finding 2) | needed (off-screen) | `d1440-owner-keyboard-stack-*` |
| 1440x900, owner, dark | all three | passed | as the light rows | `d1440-owner-dark-*` |
| 1440x900, owner, reduced motion | cooling | passed | not needed | `d1440-owner-reduced-motion-*` |
| 1280x720, owner, Chat open | all three | passed | needed for all three (off-screen) | `d1280-owner-chat-*` |
| 390x844, owner, light (Chromium only) | all three | passed | needed for all three (off-screen) | `m390-owner-light-*` |
| 1440x900, shared, signed-out (simulated) | cooling | passed | not needed | `d1440-shared-signedout-*` |
| 1440x900, shared, signed-out (simulated) | sorting, stack | passed | needed (off-screen) | `d1440-shared-signedout-*` |
| 390x844, shared, signed-out (simulated, Chromium only) | cooling | passed | needed (covered by the canvas Find control) | `m390-shared-signedout-*` |
| 390x844, shared, signed-out (simulated, Chromium only) | sorting, stack | passed | needed (off-screen) | `m390-shared-signedout-*` |

**Automated check results** (`matrix-check.mjs`; 65 ok, 0 failed, 1 not testable; every control was checked after panning to it):
- 1440 owner light:
  - Cooling: Play advances the time and the drawing; Pause holds it; scrubbing to 15 s redraws and the label reads 15.0s;
    the room slider changes the curve; Notes opens with the drawing at 545 px tall before and after; Focus and Back keep the
    time, the room setting and the drawing.
  - Sorting: the step slider and the algorithm select redraw.
  - Stack: Add twice redraws, and Reset returns to the initial drawing.
- 1440 keyboard:
  - Cooling: Enter plays, Space pauses, Tab goes from Play to the time slider, arrow keys move both sliders, Enter on Reset
    works.
  - Sorting: Enter on an option presses it.
  - Stack: Enter and Space on Add both act, and Tab goes from Add to Remove.
  - Not testable: selectable targets. No genuine card has them; the fixture check `explain-program-state-check.mjs`
    covers them.
- 1440 dark: the page is in dark theme. 1440 reduced motion: Play jumps to 20.0 s and the button reads Replay.
- 1280 with Chat open, 390 owner, and the 1440 and 390 signed-out shares: the first control of each card is reachable and
  acts. A signed-out visitor writes nothing; only the app's own RUM and Curious next-steps calls were made, and they were
  aborted.
- Every cell: no generation call and no page error.

**Visual findings** (from the screenshots; the automated checks do not see these):
1. **Focus placement** (1440 owner light, cooling): **FAILED**.
   - The focused card was drawn shifted left. The y-axis, its labels and the left end of the controls were off-screen
     (`d1440-owner-light-cooling-05-focus.png`).
   - It happened in 2 of 2 full runs, after: Play, Pause, scrub to 15 s, room slider to maximum, Notes open, then Focus from
     the card menu.
   - It did not happen in two shorter probes: Focus from zoom-to-fit, and Focus from a panned view with Notes open
     (`focus-1440x900-fit-settled.png`, `focus-1440x900-panned-settled.png`). Back kept the state every time.
   - Cause not isolated.
2. **Keyboard focus obscured** (1440 keyboard, stack): **FAILED**.
   - The keyboard-focused Add button was covered by the canvas minimap
     (`d1440-owner-keyboard-stack-01-add-focused.png`). The canvas does not pan to a focused control.
   - This fails "focus not obscured" for keyboard users.
3. Cosmetic, not counted as failures: a card wider than the canvas needs panning to see its right side (with Chat open,
   and at 390 px); the canvas map label sits over a card's title at some pan positions.

Not tested:
- Signed-in shared viewer, as opposed to the simulated signed-out visitor.
- Dark theme at 1280 and 390.
- Real mobile devices.
- WebKit and Firefox.
- A schema 2 card with selectable targets or with a number input. No genuine card has passed review with them yet.
- R4 (`9846cc0a5`), which the preview did not serve during the run.


## Known gaps

| Gap | Owner | Next step |
|---|---|---|
| Card check steps 14 and 17 timing fix not released | integrator | Offscreen pause is released in R4 `d92cc18d5`; the check fix `2c8be1452` is in the R5 candidate `2aaa8744b` (in its gate) |
| Two interaction tests (`interaction.test.mjs`, the reset cases) failed once under the full web suite on a local merge of R3 and offscreen; both passed alone twice | runtime lane | Treat as intermittent and unresolved; recheck on the next candidate |
| Optional improvement, not a closeout requirement: the stateful author's first draft omits `manifest.targets` when a card has none (t811-c5-a, t811-c6-a), costing one repair round | runtime/author lane | Deferred: default an absent `targets` to none, or state it in the author contract |
| LIMITATION: review samples a number input at one value only, and one step of a sequence (t811-c6-a minor findings) | runtime/review lane | Stated as a limitation; widening the sampling is optional |
| LIMITATION: no genuine card with selectable targets or a drag; one genuine card per schema 2 shape | qualification lane | Optional coverage, not a closeout requirement; no further generation planned. The failed pH case t811-c5-a and its diagnostics stay as recorded evidence. |
| Three playing cards on two Workers trade Workers on almost every frame (59 Worker starts in the unit run). Correct, but each trade is a cold boot. Offscreen pause removes most real contention. | runtime lane | Measure in the browser before changing eviction |
| Execution kill does not stop already-open cards | integrator | Accepted as documented; an immediate stop needs a new mechanism (not planned) |
| Rollback pins stale (above) | integrator | Re-cut generation-off and kill on the final main; re-record the emergency pair at release |
| Gravity: request text, model identity and interaction evidence not recorded | owner | None needed unless 10.4 counts gravity as an interaction case |
| 10.2 FAILED cells: Focus placement after a played, scrubbed card; keyboard focus under the minimap | card/Focus lane | `fix/explain-focus-matrix` in progress; the cells stay FAILED until it is deployed and re-verified |
| 10.2 rows still not tested (above) | qualification lane | Rerun `matrix-check.mjs` when the preview serves R4; the rows not tested need a signed-in viewer, real devices or other engines |
