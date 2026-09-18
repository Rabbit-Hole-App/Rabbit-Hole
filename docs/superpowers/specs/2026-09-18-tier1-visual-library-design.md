# Tier 1 — a deterministic interactive teaching runtime

Source brief: [interactive-technical-learning-visual-library.md](../../interactive-technical-learning-visual-library.md).

The brief asks for a component library. The repository says the useful thing is a runtime. Tier 1
builds the runtime; the components become data on top of it.

## What already exists

Two scene engines, built at different times, sharing nothing.

**Engine A — timeline.** `packages/web/src/animation-scene.js` and `AnimatedScene.jsx`. A zod schema
for objects plus a timeline, and a pure `getSceneState(scene, t)` that replays the sorted timeline
from t=0 on every call. Twelve object types, twenty-two actions. It imports nothing but zod so the
live canvas and a future exporter read the same state for the same time. Two non-React callers
depend on that purity: the requestAnimationFrame render path and the chat-context serialiser
`describeBlock` at `LearningBlocks.jsx:1480`.

**Engine B — behaviours.** `scene-engine.js`, `scene-behaviors.js`, `InteractiveScene.jsx`. A
validated envelope, a registry of reviewed behaviours with `start`/`reduce`/`describe`/`progress`,
and `sceneContext` for the tutor. It already holds `EXECUTION_MODES`, which is the brief's four
provenance values under other names.

Engine A has a generic data-driven renderer and no interaction. Engine B has interaction and no
generic renderer — each behaviour ships a bespoke component (`VectorScene.jsx`, `PipelineScene.jsx`).
That is the brief's own failure mode, "the agent invents raw React per lesson", moved one level up
to the human.

Of the brief's ten Tier 1 items, six exist. Item 9, the animation action engine, is Engine A. Item
10, the semantic interaction event system, is Engine B — including the brief's own worked examples,
`set_vector` and `place_item`. Items 1, 2 and 3 ship as the `tokens`, `strip` and `grid` types.

Of the 77 requested animation actions, roughly 45 rename the existing 22. Of the 79 primitives, most
collapse: `text` plus a role covers nine, `box` plus a tone covers seventeen, `grid`/`strip` cover
seven. Building the lists literally would be writing a synonym dictionary.

## Scope

Tier 1 is T1.0 through T1.3. The control-plane tool that lets a lesson agent emit scenes is T1.4,
the next milestone, and is out of scope here. Everything below is authored by hand or by the
existing dev-only insert menu.

## Acceptance

Five conditions. All must hold.

1. The LLM, VLM and world-model scenes from the brief's First Acceptance Test all render, animate,
   accept interaction and expose tutor context through one engine, from declarative specs, with no
   per-scene React and no per-scene behaviour implementation.
2. A scene moves between passive, interactive and activity modes without a new renderer or a bespoke
   behaviour.
3. Interactive blocks saved under the old state shape survive a reload and behave identically after
   migration.
4. `getSceneState` stays pure, total and scrubbable; the same arguments always produce the same
   state, and the tutor is never told something the canvas does not show.
5. No new runtime dependency.

## Architecture

### One frame function

```
inputs ──► derive(scene.derive, inputs) ──► derived
                                              │
scene, t, inputs, derived ──► getSceneState ──► visual state ──► render
                                              │
inputs, derived ──► check(scene.check) ──────► { passed } | { passed, reason }
```

Four boundaries, and the whole design rests on keeping them apart:

- the **evaluator** answers *what should be visible*;
- **derive** answers *what values can be calculated*;
- **check** answers *did the learner satisfy a concrete state objective*;
- the **tutor** answers *did the learner understand it*.

`getSceneState(scene, t, inputs = {}, derived = null)` keeps its defaults, so every existing
two-argument call site stays correct and the thirteen tests in `animation-scene.test.mjs` pass
unedited.

### Mode is not an argument to the evaluator

The same scene, time, inputs and derived values produce the same visual state in every mode. Mode
selects only the shell:

| mode | affordances | inputs | transport | check |
|---|---|---|---|---|
| `passive` | hidden | declared defaults | shown | none |
| `interactive` | exposed | learner-mutable | shown | none |
| `activity` | exposed | learner-mutable | shown | evaluated |

A passive scene is an interactive scene with the affordances hidden. A scene gains activity-ness by
adding a `check`, never by changing type. **A check must not mutate scene state** — a failed check
produces tutor and progress feedback only. Otherwise mode leaks back into visual state indirectly
and condition 2 becomes a claim rather than a property.

`mode` lives on the **block**, not on the scene, so the identical scene JSON can be dropped into a
lesson passively and into an activity without being re-authored. That is what condition 2 asks for.

### Inputs

Declared, bounded, defaulted learner state.

```js
const inputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bool'),    name: NAME, label: LABEL, default: z.boolean() }),
  z.object({ type: z.literal('index'),   name: NAME, label: LABEL, of: z.string().max(64), default: z.number().int().min(0) }),
  z.object({ type: z.literal('choice'),  name: NAME, label: LABEL, options: z.array(z.string().max(40)).min(2).max(12), default: z.number().int().min(0) }),
  z.object({ type: z.literal('indices'), name: NAME, label: LABEL, of: z.string().max(64), default: z.array(z.number().int().min(0)).max(48) }),
  z.object({ type: z.literal('vec2'),    name: NAME, label: LABEL, range: z.number().positive().max(1000), default: z.tuple([z.number(), z.number()]) }),
]);
```

A discriminated union, not twelve flat optionals — an author cannot write `{type:'index', options:
[...]}` and have it silently accepted. `of` names the object whose cell, chip or value count is the
index domain; `validateScene` checks that the named object exists and that the default is inside it.

Widgets are keyed on input **type**, not on a scene or behaviour id, so `box` later lands as one
shared widget rather than a fourth bespoke renderer:

| type | affordance |
|---|---|
| `bool` | toggle |
| `index` | click a cell or chip on the object named by `of`, plus a stepper |
| `choice` | segmented picker |
| `indices` | multi-click on the object named by `of` |
| `vec2` | drag handle |

`box` (x, y, w, h) is deliberately deferred to Tier 2. It is one union member and one widget, not an
architecture change — that is the test this design has to pass and the earlier candidate failed.

An event late-binds with `{"$input": "query"}` and gates with `when: {"input": "mask", "is": true}`.

**Learner values are a separate trust tier and must never fail the authored parse.** They are clamped
by `coerceInputs` inside `getSceneState`, not validated in `validateScene` — `describeBlock` bypasses
validation, so anything placed in the validator is bypassable on the one path whose output reaches a
model prompt. Persisted input state is read leniently; a stale or hand-edited value clamps to its
domain instead of red-boxing the whole animation.

### Derive

A seam, not a framework. One entry today.

```js
const DERIVATIONS = {
  vector_projection: {
    derive: deriveVectorProjection,
    outputs: ['projection.x', 'projection.y', 'projection.length', 'projection.scale', 'projection.dot'],
  },
};
```

Rules, from day one and regardless of how small it stays:

- pure, deterministic, named and allowlisted;
- takes `(inputs, scene)` and **no `t`** — that is what stops a calculator becoming a second clock;
- independently testable under `node:test` with no DOM;
- no arbitrary JS from scene specs, no rendering, no timeline or motion;
- returns `{defined: true, value}` or `{defined: false, reason}` — never throws. The frame stays
  alive and the learner gets a sentence.

`project_vector` moves verbatim from `scene-behaviors.js:56`, including its refusal to divide by a
zero-length axis and draw a plausible arrow. `iou`, `matmul_small` and `normalize_box` are **not
written** until a scene references one. Promote to a registry at entry two or three.

Rounding is central, not per-calculator, and normalises negative zero:

```js
const round = value => { const r = Math.round(value * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };
```

`Math.round(-0.0001 * 1000) / 1000` is `-0`. `node:assert/strict` treats `-0 !== 0`, and
`JSON.stringify` washes it to `"0"`, so a browser frame and a round-tripped frame would differ
invisibly.

A scene references a derived value with `{"$derived": "projection.length"}`. `validateScene` checks
the **entire declared path** against the active derivation's `outputs`, not just the root key —
`"projection.lenght"` must fail at the gate.

### A missed reference drops the whole value

```
bad $derived or $input path
  → the whole resolved event.value is undefined
  → the event is skipped
  → the authored object is unchanged
```

Never per-key nulls. `{x: null, y: null}` is truthy, so the existing `if (object && event.value)`
guard does not skip it and `move` computes `x + (null - x) * 1 = 0` — an object authored at (40, 60)
silently snaps to the origin and draws. A plausible arrow at 0,0 is precisely what this boundary
exists to prevent.

### Action value shapes

`event.value` is `z.any()` today, with each of the twenty-two cases hand-guarding its own payload.
That is the single largest silent-failure surface and it is where late binding goes wrong.

`marked()` at `AnimatedScene.jsx:27` reads a bare number as a **flat index**. An author who writes
`{"$input": "query"}` instead of `{"row": {"$input": "query"}}` gets, on a 6×6 grid with query 4, one
lit cell at (row 0, col 4) — the scene validates, renders, and teaches that the fifth key is the
query while the distribution below belongs to a row the learner was never shown.

Tier 1 gives each action an explicit value schema, validated at `validateScene`, so a dropped nesting
level is a one-line error at the gate. That is also what makes `$input` safe to resolve at any depth
rather than at the top level only.

### Check

Closed, allowlisted, pure, never throws. Returns `{passed: true}` or `{passed: false, reason}`.

```
input_equals   input_includes   input_all_equal
derived_equals derived_at_least derived_at_most derived_between
all            any
```

```json
{ "buildGoal": "Move the prediction until IoU is at least 0.7.",
  "check": { "type": "derived_at_least", "path": "iou.score", "value": 0.7 } }
```

`derived_equals` compares post-`round` values, since `derive` already quantises to three decimals —
otherwise it is a predicate nobody can satisfy. `all` and `any` take a list of predicates and nest
one level; there is no third level and no expression language. Paths and input names are checked at
`validateScene` against the same declarations `$input` and `$derived` use.

Semantic grading stays out. "Explain why the causal mask prevents leakage" belongs to the existing
tutor verdict path and the `explainBack` block, not to a predicate.

### Tutor context and provenance

One serialiser, shared by both tutor paths, reporting learner-controlled and computed state as
separate fields so provenance means something:

```js
{ componentId, componentType, conceptIds, mode, provenance,
  selectedObject, inputs, derived, currentStep, state, check }
```

`conceptId` is already parsed, already carried through the evaluator, and read by nothing today —
free. `currentStep` comes from the `pause` action, which is in the enum and currently dead.
`EXECUTION_MODES` moves **down** into `animation-scene.js` and `scene-engine.js` imports it, deleting
the duplication rather than creating a second one; the strings carry no imports, so the zod-only rule
holds.

A predict-then-reveal scene gates its reveal on a committed **input**, never on time. `derive`
returns `{defined: false, reason}` until the commit, so the answer is absent from state at every `t`
— and therefore absent from the tutor prompt — until the learner commits. A commit is a one-way door
until `reset_attempt`.

## Work

### Pre-T1 — stabilisation

Each item is independently revertible and lands before any convergence work.

1. **Existing bugs.**
   - `describeBlock` (`LearningBlocks.jsx:1480`) prepares and validates before `getSceneState`. Today
     it passes raw `block.scene`, so objects without an explicit `opacity` evaluate to
     `visible: false` and the tutor is handed `[]` for a scene that is fully on screen; an object with
     no `initialState` throws outright. Land this one first and alone.
   - `block.time` persists on scrub while paused. It is committed only in the effect keyed on
     `[playing]` (`AnimatedScene.jsx:250`), so the tutor answers about a different moment than the
     canvas shows.
   - `set_values` refuses a scalar and refuses a length mismatch, at `validateScene`. Today a scalar
     is a silent no-op and 5-into-3 drops two values while 2-into-5 leaves three bars on authored data
     indistinguishable from real output. Verified safe: the one shipped scene, `token-journey`, is
     already length-matched at `LearningBlocks.jsx:461` and `:464`.
   - `getSceneState` clamps `at` to a finite number. `block.time` returns from localStorage
     unvalidated (`AdaptiveCanvas.jsx:343`); a non-finite time makes `event.at > at` false for every
     event, so the early break never fires and the tutor receives a NaN end state.
   - Remove the dead conditional at `animation-scene.js:95` — `!(cond ? false : false)` is always
     true and the check it guards is repeated on the next line.

2. **Persistence compatibility, before any writer moves.** Read the old `block.state` shape, map it
   into `block.inputs`, keep old artifacts loading through a reload. Only then migrate writers.
   `e2e/chat-block-check.mjs:492-600` holds nine Playwright checks bound to `[data-scene-action]`,
   `[data-scene-step]`, `[data-piece]`, `[data-slot]`, `[data-vector-handle]`, `[data-projection]`,
   plus three `page.reload()` persistence assertions. This is the only irreversible part of the work.

3. **Real unit-test execution.** `npm test` in `packages/web` is Playwright, so the thirteen
   `node:test` files only ever run by hand; `make test-unit` is Python-only. Add `test:unit`, put it
   in CI, keep Playwright separate.

### T1.0 — renderer honesty

Nothing new; make what exists true.

- Wire the camera. `state.camera` is fully computed by three actions and read **zero** times — the
  `viewBox` is hardcoded at `AnimatedScene.jsx:153`. One attribute plus the matching region hit-test
  transform unlocks pan, zoom, focus and the brief's `zoom_into_component`.
- Render `arrow` and `line`. Both are in the type enum with no render branch and fall through to a
  generic `<rect>` with undefined width and height; `initialState.from`/`to` are parsed and read by
  nothing. The arrowhead marker already exists.
- Render `image` with a bounded `src`, for Scene B.
- Value-mapped cell alpha on `grid` — that is `Heatmap`, about two lines in the existing branch, and
  `bars` already computes `peak` the same way.
- `null` inside a `set_values` array blanks a cell rather than showing a fake zero.
  `AnimatedScene.jsx:54` already guards `value != null`, so this is free, and it removes any need for
  a separate mask action.
- Freeze the `bars` axis across a tween. `peak` is recomputed from the object's own tweening values
  every frame (`AnimatedScene.jsx:77`), so during a reveal the axis rescales and unchanged bars
  visibly shrink while their printed numbers stay put.
- KaTeX for `equation` and `MONO` for `code`. Both fold into `isText` today and render as
  proportional text. KaTeX is already an eager dependency; `renderToString` is synchronous and pure,
  so the render path stays synchronous.
- Reduced motion, via `useReducedMotion` on the one `POP` spring plus a transport that jumps to the
  end.
- Unknown types fail loudly. A type in the enum with no render branch currently produces an invisible
  rectangle, and `DataShape`'s token branch is an unguarded fall-through.

### T1.1 — the input axis

`scene.inputs[]`, `object.input`, `{$input}` resolved at depth, `when` gates, `coerceInputs` at the
trust boundary, per-action value schemas, and `getSceneState(scene, t, inputs, derived)`.

`duration` stays `.positive()`. Relaxing it to `.min(0)` for an input-only scene is a trap: at
duration 0 the clamp pins `at` to 0, `phase()` returns 0 for every `at: 0` event, and progress is 0
forever — `highlight` never fires, `change_text` never fires, and `set_values` returns its initial
value. Hide the transport on a short duration instead.

`set_values` pins its length to what the scene authored, never to the event payload. `sizeOf` freezes
an object's width from `initialState.values` at Map-build time and the region hit-test reads that
frozen width, so a payload-derived length desyncs the picture from the learner's clickable area and
reports "no authored object" to the tutor for cells that are plainly on screen.

### T1.2 — tutor context, provenance, modes

The shared serialiser, `mode` on the block, `EXECUTION_MODES` moved down, `chapters(scene)` exported
once and consumed by both the transport and the serialiser so the stage number cannot disagree with
what the learner is looking at.

### T1.3 — the genuinely missing capabilities

- **Sequence growth.** A window (`start`, `length`) on sequence-bearing objects. `tokens` and
  `values` are fixed-length at authoring and `set_values` maps over the current array, so a sequence
  cannot grow or shrink. This is the most-requested LLM visual and the only capability with no
  expression at all today.
- **The `derive` seam** and `project_vector`.
- **The `check` predicates**.
- `pause` carries a step label instead of falling through to `default: break`.
- `masking` and `branching_futures` as `fromTemplate` cases. The brief forbids the agent emitting
  pixel coordinates for standard templates and names both; without them every acceptance scene
  hand-places about ten x/y pairs.

### The acceptance scenes

Not a numbered stage — this is how T1.0–T1.3 are proved. (T1.4 is the control-plane tool, out of
scope.) Scene A (attention), Scene B (patch flow), Scene C (branching futures), each authored as
scene JSON, each run in all three modes.

Scene A note: with a fixed Q the attention weights are authored values under `provenance:
illustration` and need no calculator. The moment Q becomes learner-editable they must be derived, and
that is what the seam is for.

Scene B note: patches do not detach as new objects. Object identity is fixed for the life of a scene
— the object map is built once — so the patch grid and the visual token row are both declared up
front and the flow is `appear`, `move` and `connect`. Runtime object synthesis would break the React
keys, the region hit-test and the determinism test.

## Migration

`walkthrough_v1` and `pipeline_assembly_v1` do no arithmetic. They are step state and placement
state, which become declared inputs with no behaviour and no calculator. `vector_projection_v1` is
the only behaviour whose logic crosses the seam, and only its `project()` does.

Engine B stops growing. Its existing blocks keep working through the compatibility layer until their
scenes are re-authored; nothing is deleted in Tier 1. Deleting working, tested, shipped code to serve
acceptance scenes that do not exist yet is the trade this design refuses.

## Testing

- `node:test` for the evaluator, the input coercion, the derive seam and the check predicates. No
  DOM, no fixtures.
- The determinism test extends to the new arguments: same `(scene, t, inputs, derived)` in, same
  state out, and stable past the end.
- Assert with `Object.is` or `assert.deepEqual`, never `JSON.stringify`, which is blind to the `-0`
  the rounding policy can produce.
- Playwright keeps the nine existing interactive-block checks passing throughout, and gains one
  mode-portability check per acceptance scene: the same scene JSON rendered `passive`, then
  `interactive`, then `activity`, with the visual state at a fixed `t` identical in all three.

## Deliberately not in Tier 1

- The control-plane tool that emits scenes. That is T1.4 as a milestone, and it needs a second
  hand-written validator because `packages/control-plane` is zero-dependency and its
  `validateToolInput` subset silently ignores `pattern`, `anyOf` and `const` — it fails open.
- Structural transformations: `split`, `merge`, `duplicate`, `group`, `stack`, `partition`. The
  brief's own split example pre-declares `head1` and `head2`, which is `appear` plus `move` today.
- The 45 action names that rename the existing 22, and the primitives that collapse into `text` plus
  a role or `box` plus a tone.
- GSAP. It is installed and imported from nowhere. Its product is the timeline, and the evaluator is
  already one; a second authority over the same properties with progress held in mutable tween state
  would cost exact scrubbing and screenshot reproducibility. Motion keeps its current narrow job,
  discrete lit states only.
- Plotly, React Flow, ELK, tldraw and three at Tier 1 runtime. Each owns its own store, clock or
  async solver, so none can answer "what is the frame at t". ELK is allowed offline as an authoring
  step that freezes coordinates into scene JSON.
- `box` as an input type, and `iou`, `matmul_small`, `normalize_box` as derivations. Tier 2, on the
  day a scene names one.

## Risks

- **Silent extension points.** Adding an enum member without a render branch produces an invisible
  object today, and `arrow`, `line` and `image` are three shipped proofs. T1.0 makes these loud
  first, before anything widens the vocabulary.
- **Caps.** Sixty objects, two hundred events, 256 values, 48 tokens, 120 seconds. They are deliberate
  untrusted-input posture. Answer overflow with scene composition, not higher caps.
- **`tint()` and design tokens.** `AnimatedScene.jsx:121` builds eight-digit hex by string
  concatenation, so it cannot consume a CSS custom property, which blocks both the brief's design-token
  requirement and dark mode inside the canvas. Not in Tier 1, but it is the reason the canvas will stay
  light while the chrome flips.
- **Two engines during migration.** Condition 3 is what keeps that honest; without the compatibility
  layer, a perfect new engine still breaks saved lessons.
