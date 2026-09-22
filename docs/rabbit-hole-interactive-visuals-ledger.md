# Interactive visuals — worktree ledger

Implements docs/rabbit-hole-interactive-visuals-agent-spec-v2.md. One entry per
task: what actually happened, verified against the checkout, never planned-tense.

## T00 — base and UI verification (2026-09-21)

**Worktree:** `C:\Users\cyudhist\Desktop\workspace\small-deploy`, branch
`feat/canvas-block-conversations` at `94dad46` (== origin/main). Untracked
files present and left untouched: `moment/`, `docs/courses/nanogpt/*`,
`image.png`, `packages/web/e2e/*.mjs` (e2e scripts stay untracked by policy),
the spec itself.

**Baseline gates (T00.7):** `make test-unit` exit 0 — pytest unit suite, 418
web node:test, 326 control-plane, synthetic-fixture and critic-packet gates all
green before any interactive work. No pre-existing failures to carry.

### The composer (T00.3) — verified, not guessed

- `ChatComposer.jsx:5` — the input itself; Enter submits via native form.
- `ask.jsx:312` `AskPanel` — the dock instance is `compact composerOnly`,
  mounted by `LearnPage.jsx:794` into `AdaptiveCanvas`'s `composer` prop,
  rendered at `AdaptiveCanvas.jsx:1719`.
- Send path: `ask.jsx:415` `send()`; payload built once at Send (466–484);
  endpoint `/api/learn/ask` (or `/api/learn/selection` with a lesson snapshot
  target); SSE response mirrored to canvas ChatCards via `onExchange`.
- **The attachment mechanism already exists:** `canvasTarget` chip
  (`ask.jsx:798`, `data-canvas-target`), armed by `AdaptiveCanvas.jsx:1105
  askBlock` → `describeBlock(block)` → `LearnPage askTarget`. Target is read
  at Send (`ask.jsx:443`) and inlined into `message` (479). T04 extends this;
  no new chat surface anywhere.
- Composer focus: `small:ask-focus` window event (`ask.jsx:378`); no imperative
  API needed.
- Keyboard: one window capture handler (`AdaptiveCanvas.jsx:1011–1102`) with an
  activeElement `typing` guard; card drag only from `[data-drag-zone]`; child
  controls isolate with pointer-event `stopPropagation` (existing pattern).

### Scene runtime (T00.5) — exact state today

- `getSceneState(scene, time)` — two args (`animation-scene.js:417`). No
  `evaluateScene`, no `coerceInputs`, no typed inputs, no `vec2` anywhere.
- `validateScene(raw)` (line 174): computeValueChainGroups → resolveDerived →
  adaptLegacyScene → zod → hand refusals (heat/valueScale, matrixKind,
  identity slots, image/equation/grid/arrow, timeline sanity) → valueDomain.
- Derive seam `scene-derive.js`: 9 ops (dot, matmul=A·Bᵀ, softmax, sum,
  weighted_sum, scale, elementwise, add, concat), `{defined,value}` |
  `{defined:false,reason}`; pool = exampleData + prior derivations; `$derive` /
  `{{name}}` materialised before zod; provenance stamped, both lies refused.
- **Engine B exists and works:** `scene-engine.js` (sceneSchema, registry,
  prepareScene/applyAction/sceneContext) + `scene-behaviors.js`
  (walkthrough_v1, **vector_projection_v1** with `project(a,b)` →
  `{defined, scale, vector, dot, length}` and a zero-axis refusal,
  pipeline_assembly_v1) + `InteractiveScene.jsx` (committed state on
  `block.state`, `attempts`, reset_attempt, execution-mode footer) +
  `VectorScene.jsx` (drag handles with role=slider + arrow keys, number
  fields) + `PipelineScene.jsx`. `sceneSummary(block)` already feeds the tutor.
- Canvas state: `changeBlock` (snapshots undo) vs `changeBlockQuietly`
  (gesture path, `AdaptiveCanvas.jsx:1395–1398`); 100-entry undo ring; board
  blob `{strokes,shapes,items,links,blocks}` per storage key; empty saved
  board re-seeds.
- Boards (T00.6): `BOARDS` + `BOARD_SEED_VERSIONS` (`demo-scenes.js:318,353`),
  key `${canvasKey}:${board}:s${version}` (`LearnPage.jsx:794`), unknown-name
  visible notice (`LearnPage.jsx:793`). Verified in source.
- Images: `/lesson-assets/vlm-patch-source.jpg` (used at 200×200, cell 50 —
  exact 4×4) + pre-cropped `vlm-patch-detail.png`; renderer has **no crop
  parameter** today (`preserveAspectRatio="xMidYMid slice"` only).

### Tests and deploy (T00.7/T00.8)

- Unit: `cd packages/web && npm run test:unit` (node --test src/**/*.test.mjs).
- Gates: render-freshness, matrix-kind-declared, motion-ownership, value-scale,
  distribution-display-sum, bespoke-renderer, critic-packet isolation — all in
  the unit run; commands recorded in the T00 map.
- Browser: standalone `packages/web/e2e/*.mjs` scripts (untracked), Playwright,
  auth via `https://small-cp-dev.zeroshothq.workers.dev/test/session` with
  `SMALL_TEST_BYPASS` from root `.env`; screenshots to gitignored `e2e/shots/`.
- Local port for this session: **5199** (5174–5177 are other agents' servers).
- Deploy target: **`small-cp-dev-small-deploy`** clone per
  docs/features/parallel-dev-deploys.md — never the bare shared worker.

### Architecture mapping (T00.9)

- **I01, I02, I03** ride Engine A: a new typed-input axis on animation scenes.
  New `scene-inputs.js` (declarations + coercion), `evaluateScene(scene, t,
  rawInputs) → {inputs, derived, state}` built ON TOP of the untouched
  `validateScene`/`getSceneState` (inputs join the derive pool by name; the
  scene re-resolves; passive scenes take the old two-arg path verbatim).
  Raw learner values persist on `block.inputs` + `block.inputRevision`;
  `block.state` (Engine B) and all passive blocks are untouched.
- **I04** rides Engine B: reuse `vector_projection_v1` + `VectorScene` +
  `project()` exactly as the spec's "existing named projection calculation";
  extend with scene-declared symmetric range, drag cancel, edit buffers,
  and the shared T09 check shell. No second projection implementation.
- New derive ops planned (added the day a fixture references them, per the
  seam's own rule): `row` (validated indexed row/record selector),
  `causal_mask`; `softmax`/`weighted_sum` extended to carry/skip nulls.
- Ask-about-this: extend `askBlock`/`describeBlock` so an interactive card's
  target resolves its text from the CURRENT block at Send (getter reading the
  canvas's own `present` ref), re-arms the chip on input change, and warns on
  a deleted target. One small change in `ask.jsx` (resolve a function-valued
  `target.text` at Send); no new panel.
- Board: `interactive-app-review` registered in BOARDS with seed version 1
  at T12, not before.

**T00 done:** composer integration point, scene APIs, board mechanism, gates,
port and deploy owner all named from the checkout. No product code touched.
