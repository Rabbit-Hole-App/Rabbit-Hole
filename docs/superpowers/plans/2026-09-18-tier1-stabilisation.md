# Tier 1 Plan A — Stabilisation and Renderer Honesty

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four live correctness bugs in the animation engine, make the web unit tests actually run, and make the existing renderer draw everything its schema already claims to support — with no new concepts and no schema semantics beyond loud failure.

**Architecture:** `packages/web/src/animation-scene.js` is a zod schema plus a pure evaluator `getSceneState(scene, t)` that replays a sorted timeline from t=0. `AnimatedScene.jsx` draws that state as plain SVG attributes and owns the transport. This plan touches only those two files, one extracted serialiser, the test wiring and the e2e suite. It introduces no new object types, no new actions, and no new arguments.

**Tech Stack:** React 19, zod 4.5, Motion 13 (discrete states only), KaTeX 0.16 (already eager), `node:test`, Playwright 1.62.

**Spec:** [docs/superpowers/specs/2026-09-18-tier1-visual-library-design.md](../specs/2026-09-18-tier1-visual-library-design.md)

## Global Constraints

- `animation-scene.js` imports **nothing but zod**. Not React, not tldraw, not a renderer.
- `getSceneState` stays **pure and total**: same arguments, same output; full replay from t=0; arbitrary seeking and backward scrubbing stay exact.
- **Object identity is fixed** for the life of a scene. The object map is built once from `scene.objects`. Never synthesise an object mid-timeline.
- **No new runtime dependency.** GSAP is installed and stays unused.
- Motion animates **discrete lit/unlit state only** — never x, y, w, h, opacity, rotation, values or path length.
- Existing caps stand: objects ≤ 60, timeline ≤ 200, values ≤ 256, tokens ≤ 48, duration ≤ 120 s.
- Validation errors are **one line, human-readable**, and rendered verbatim to the learner.
- Commit messages: no double quotes, no `Co-Authored-By` or `Claude-Session` trailers.
- `git add` **named paths only** — never `git add -A` or `git add .`; the working tree has untracked files that must stay untracked. **Naming the path is not enough:** a named file can itself carry unrelated uncommitted hunks, so read `git diff --cached` before every commit and stage hunks with `git add -p` when a file is mixed. This is not hypothetical — Task 1 staged `packages/web/package.json` by name and swept in an unrelated `gsap` dependency line with it.
- Work happens on branch `feat/canvas-block-conversations`.

## Deployment gates

Deploying per task would cost eight rollouts for work that is almost entirely local. There are **two** gates.

| | After | What runs |
|---|---|---|
| **Gate A** | Task 5 | Build, deploy to `small-cp-dev`, full `chat-block-check.mjs`. Task 5 fixes deployed React persistence behaviour and its check needs the running environment. |
| **Gate B** | Task 12 | Build, deploy, full `chat-block-check.mjs`, plus a final visual comparison of `token-journey` against the pre-Plan-A screenshot. |

**Correctness is never postponed — only the remote rollout is.** Every task from 6 to 12 must still, before its own commit:

1. pass `make test-unit`;
2. pass `npm run build` where it touches a renderer file;
3. pass its own focused local check against `npm run dev`.

Local verification means `cd packages/web && npm run dev`, then opening the Learn canvas and inserting the Animation block. The dev server proxies `/api` to the control plane from the repo `.env`, so the canvas and its blocks work without a deploy.

**Before starting Task 6**, capture the baseline: with the Gate A build deployed, screenshot the Animation block and save it as `packages/web/e2e/shots/token-journey-baseline.png`. Tasks 6 to 12 each claim the shipped scene is visually unchanged; that file is what the claim is checked against, and Gate B compares to it one final time.

## Deviations from the spec's ordering, and why

The spec orders stabilisation as bugs → persistence compatibility → test execution. This plan runs **test execution first** (Task 1), because every task after it ends with "run the tests", and without the runner each one runs by hand. Same intent, earlier payoff.

**Persistence compatibility is not in this plan.** It converts `block.state` into `block.inputs`, and `block.inputs` does not exist until Plan B. Building the converter now would be a converter for a shape nothing writes. It is Task 1 of Plan B, which still satisfies the constraint that it lands *before* any writer migrates.

## File Structure

| File | Responsibility | This plan |
|---|---|---|
| `packages/web/src/animation-scene.js` | schema, validation, pure evaluator | modify — totality, `set_values` rules, type-enum honesty |
| `packages/web/src/animation-scene.test.mjs` | evaluator contract | modify — new cases per task |
| `packages/web/src/scene-describe.js` | **new** — the one tutor serialiser for animation scenes; pure, imports `animation-scene.js` only | create |
| `packages/web/src/scene-describe.test.mjs` | **new** — serialiser contract | create |
| `packages/web/src/AnimatedScene.jsx` | transport and pixels | modify — camera, new type branches, reduced motion, time commit |
| `packages/web/src/LearningBlocks.jsx` | block registry and `describeBlock` | modify — delegate the animation branch |
| `packages/web/package.json` | scripts | modify — add `test:unit` |
| `run.sh` | repo task runner | modify — `test:unit` runs the JS suites too |
| `packages/web/e2e/chat-block-check.mjs` | deployed-canvas checks | modify — new checks |

`scene-describe.js` exists because `describeBlock` lives in a `.jsx` file that `node --test` cannot parse, and because the spec requires one serialiser shared by both tutor paths. Extracting it makes the live bug in Task 4 testable at all.

---

### Task 1: Web unit tests run under `make test-unit`

**Files:**
- Modify: `packages/web/package.json:6-11`
- Modify: `run.sh:99-101`

**Interfaces:**
- Consumes: nothing.
- Produces: `make test-unit` runs the Python suite, then `packages/web`'s `node:test` suite, then `packages/control-plane`'s. Every later task's verification step is `make test-unit`.

Today `npm test` in `packages/web` is Playwright, so `animation-scene.test.mjs`, `chart-data.test.mjs` and `scene-engine.test.mjs` only ever run by hand. `run.sh test:unit` is pytest and nothing else, so `make test-unit` — which CLAUDE.md requires before every commit — cannot fail on a broken web test. There is no CI in this repository, so `make test-unit` is the only gate there is.

- [ ] **Step 1: Confirm the current state fails the goal**

Run: `cd packages/web && npm test -- --list 2>&1 | head -5`
Expected: Playwright output, not `node:test`. This is the problem being fixed.

Run: `make test-unit`
Expected: pytest output only. No mention of `animation-scene.test.mjs`.

- [ ] **Step 2: Add the script**

In `packages/web/package.json`, the `scripts` block becomes:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "playwright test",
    "test:unit": "node --test src/",
    "preview": "vite preview"
  },
```

`node --test src/` rather than a glob: npm scripts run under `cmd` on Windows, where `src/*.test.mjs` is not expanded. Node's runner discovers `**/*.test.mjs` under a directory on every platform.

- [ ] **Step 3: Verify the script finds all three suites**

Run: `cd packages/web && npm run test:unit`
Expected: PASS, with `# tests` counting all three files (13 from `animation-scene.test.mjs` plus the others). If a file is missing, the directory argument is wrong.

- [ ] **Step 4: Wire it into the repo runner**

In `run.sh`, replace the `test:unit` function at lines 99-101:

```sh
# fast tests only (no network): Python guard proxy, plus both JS suites.
# run.sh sets -e, so the first failing suite stops the run with its own exit code.
function test:unit {
    uv run pytest "$THIS_DIR/tests/unit_tests/"
    (cd "$THIS_DIR/packages/web" && npm run test:unit)
    (cd "$THIS_DIR/packages/control-plane" && npm test)
}
```

- [ ] **Step 5: Verify the gate now catches a broken web test**

Temporarily break one assertion — in `packages/web/src/animation-scene.test.mjs:26`, change `assert.deepEqual(first, second)` to `assert.notDeepEqual(first, second)`.

Run: `make test-unit`
Expected: FAIL, naming `the evaluator is deterministic`, with a non-zero exit code.

Revert that edit. Run `make test-unit` again.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/package.json run.sh
git commit -m 'test(web): make test-unit runs the JS suites, not only pytest'
```

---

### Task 2: The evaluator is total for any time value

**Files:**
- Modify: `packages/web/src/animation-scene.js:95` (dead conditional), `:120` (time clamp)
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Consumes: Task 1's `make test-unit`.
- Produces: `getSceneState(scene, time)` returns a valid state for any `time`, including `NaN`, `undefined` and a non-numeric string.

`block.time` round-trips through `localStorage` with no validation (`AdaptiveCanvas.jsx:343`). A non-numeric value makes the clamp at `animation-scene.js:120` produce `NaN`; `event.at > at` is then false for every event, so the early break never fires, every event applies, and the tutor is handed an end state for a scene the learner is watching from the start.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/animation-scene.test.mjs`:

```js
test('a time that is not a number evaluates as the start', () => {
  const built = scene();
  assert.deepEqual(getSceneState(built, NaN), getSceneState(built, 0));
  assert.deepEqual(getSceneState(built, undefined), getSceneState(built, 0));
  assert.deepEqual(getSceneState(built, 'six'), getSceneState(built, 0));
  assert.deepEqual(getSceneState(built, Infinity), getSceneState(built, built.duration), 'a huge time still clamps to the end');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL on the `NaN` case. The reported state has `time: NaN` and every object already visible, rather than matching the state at 0.

- [ ] **Step 3: Clamp the time**

In `packages/web/src/animation-scene.js`, replace line 120:

```js
  const at = Math.max(0, Math.min(scene.duration, time));
```

with:

```js
  // Time arrives from persisted learner state, so it can be anything. A scene
  // that cannot be evaluated at a moment is worse than one evaluated at zero:
  // NaN makes every `event.at > at` false, so the whole timeline applies at once.
  const requested = Number(time);
  const at = Number.isNaN(requested) ? 0 : Math.max(0, Math.min(scene.duration, requested));
```

`Number(time)` rather than `Number.isFinite(time)`: `Infinity` must keep clamping to `scene.duration`, which is already correct today and must not regress.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: PASS, all 14 tests.

- [ ] **Step 5: Remove the dead conditional**

In `packages/web/src/animation-scene.js`, lines 93-98 currently read:

```js
  for (const event of scene.timeline) {
    for (const key of ['target', 'from', 'to']) {
      if (event[key] && !ids.has(event[key]) && !(event.action === 'connect' || event.action === 'disconnect' ? false : false)) {
        if (!ids.has(event[key])) throw new Error(`Timeline event at ${event.at}s refers to unknown object "${event[key]}"`);
      }
    }
```

`!(cond ? false : false)` is always `true`, and the check it guards is repeated on the next line. Replace with:

```js
  for (const event of scene.timeline) {
    for (const key of ['target', 'from', 'to']) {
      if (event[key] && !ids.has(event[key])) throw new Error(`Timeline event at ${event.at}s refers to unknown object "${event[key]}"`);
    }
```

- [ ] **Step 6: Verify nothing changed behaviourally**

Run: `make test-unit`
Expected: PASS. `a scene referring to an unknown object is refused` (`animation-scene.test.mjs:83`) still passes — it is the test that pins this behaviour.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/animation-scene.test.mjs
git commit -m 'fix(learn): the evaluator is total for any persisted time value'
```

---

### Task 3: `set_values` is strict about shape and explicit about blanks

**Files:**
- Modify: `packages/web/src/animation-scene.js:91` (id map), `:93-100` (validation), `:195-198` (evaluation)
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Consumes: Task 2's evaluator.
- Produces: `validateScene` refuses a `set_values` whose payload is not an array, whose length disagrees with the target's authored `values`, or whose entries are not numbers or `null`. `null` in a payload means **blank this cell**, and the evaluator writes it through.

Today a scalar payload is a silent no-op (`Array.isArray` fails, the case does nothing) and a length mismatch silently truncates or freezes: 5-into-3 drops two values, 2-into-5 leaves three bars showing authored data that is indistinguishable from real output. Verified safe to tighten — the only shipped scene, `token-journey`, is already length-matched at `LearningBlocks.jsx:461` and `:464`.

`null` becomes the suppression channel the spec calls for. `AnimatedScene.jsx:54` already guards `value != null` before drawing a numeral, so a blank cell costs nothing to render and replaces any need for a separate mask action.

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/src/animation-scene.test.mjs`:

```js
const valued = (values, event) => validateScene({
  id: 'valued', duration: 4,
  objects: [{ id: 'row', type: 'strip', initialState: { x: 0, y: 0, cell: 30, values } }],
  timeline: [{ at: 0, action: 'set_values', target: 'row', duration: 2, easing: 'linear', ...event }],
});

test('set_values refuses a payload that is not an array of numbers', () => {
  assert.throws(() => valued([0, 0], { value: 0.42 }), /set_values needs an array/);
  assert.throws(() => valued([0, 0], { value: 'lots' }), /set_values needs an array/);
  assert.throws(() => valued([0, 0], { value: [1, 'two'] }), /numbers or null/);
});

test('set_values refuses a length that disagrees with the object', () => {
  assert.throws(() => valued([0, 0, 0], { value: [1, 2, 3, 4, 5] }), /sends 5 values .* which holds 3/);
  assert.throws(() => valued([0, 0, 0], { value: [1, 2] }), /sends 2 values .* which holds 3/);
});

test('set_values needs a target', () => {
  assert.throws(() => validateScene({
    id: 'aimless', duration: 4,
    objects: [{ id: 'row', type: 'strip', initialState: { x: 0, y: 0, values: [0] } }],
    timeline: [{ at: 0, action: 'set_values', value: [1] }],
  }), /set_values needs a target/);
});

test('null blanks a cell instead of tweening it to a fake zero', () => {
  const built = valued([4, 4], { value: [8, null] });
  assert.deepEqual(getSceneState(built, 0.0).objects[0].values, [4, 4]);
  assert.deepEqual(getSceneState(built, 1.0).objects[0].values, [6, null], 'the blank is immediate; there is nothing to tween towards');
  assert.deepEqual(getSceneState(built, 2.0).objects[0].values, [8, null]);
});

test('a blanked cell grows back from zero, never from null', () => {
  const built = validateScene({
    id: 'refill', duration: 6,
    objects: [{ id: 'row', type: 'strip', initialState: { x: 0, y: 0, values: [null] } }],
    timeline: [{ at: 0, action: 'set_values', target: 'row', duration: 2, easing: 'linear', value: [10] }],
  });
  assert.deepEqual(getSceneState(built, 1).objects[0].values, [5]);
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL. The refusal tests fail because nothing throws; the `null` tests fail because `target[index] ?? current` turns `null` into "keep this value", so the blank never appears.

- [ ] **Step 3: Allow `null` in the schema**

In `packages/web/src/animation-scene.js`, line 30, replace:

```js
    values: z.array(z.number()).max(256).optional(),
```

with:

```js
    // null is a blank cell, not a zero: a masked or not-yet-computed entry
    // must read as absent rather than as a real measurement of nothing.
    values: z.array(z.number().nullable()).max(256).optional(),
```

- [ ] **Step 4: Validate the payload**

In `packages/web/src/animation-scene.js`, replace line 91:

```js
  const ids = new Set(scene.objects.map(object => object.id));
```

with:

```js
  const byId = new Map(scene.objects.map(object => [object.id, object]));
  const ids = new Set(byId.keys());
```

Then, inside the `for (const event of scene.timeline)` loop, after the existing unknown-object check and before the runs-past-duration check, insert:

```js
    if (event.action === 'set_values') {
      if (!event.target) throw new Error(`Timeline event at ${event.at}s: set_values needs a target`);
      if (!Array.isArray(event.value)) throw new Error(`Timeline event at ${event.at}s: set_values needs an array of numbers`);
      if (event.value.some(entry => entry !== null && !Number.isFinite(entry))) {
        throw new Error(`Timeline event at ${event.at}s: set_values takes numbers or null, nothing else`);
      }
      // The object's own size is frozen from its authored values at build time
      // and the region hit-test reads that size, so a payload of a different
      // length would desynchronise the picture from what the learner can click.
      const authored = byId.get(event.target)?.initialState.values;
      if (authored && event.value.length !== authored.length) {
        throw new Error(`Timeline event at ${event.at}s: set_values sends ${event.value.length} values to "${event.target}", which holds ${authored.length}`);
      }
    }
```

- [ ] **Step 5: Write `null` through the evaluator**

In `packages/web/src/animation-scene.js`, replace lines 195-198:

```js
      case 'set_values': if (object && Array.isArray(event.value)) {
        const target = event.value;
        object.values = (object.values || target.map(() => 0)).map((current, index) => current + ((target[index] ?? current) - current) * progress);
      } break;
```

with:

```js
      case 'set_values': if (object && Array.isArray(event.value)) {
        const target = event.value;
        object.values = (object.values || target.map(() => 0)).map((current, index) => {
          // Nothing has happened until the event is under way, in either
          // direction: a blank does not fill in and a value does not blank.
          // The guard belongs above both branches, not inside one of them.
          if (progress === 0) return current;
          const goal = target[index];
          if (goal === null) return null;             // blanked; there is nothing to tween towards
          if (goal === undefined) return current;     // untouched
          const from = current == null ? 0 : current; // a blank cell grows back from zero
          return from + (goal - from) * progress;
        });
      } break;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `make test-unit`
Expected: PASS. All existing cases still pass — `token-journey` is length-matched, so nothing in the shipped scene is refused.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/animation-scene.test.mjs
git commit -m 'fix(learn): set_values refuses a wrong shape and treats null as a blank cell'
```

---

### Task 4: The tutor reads the same scene the canvas draws

**Files:**
- Create: `packages/web/src/scene-describe.js`
- Create: `packages/web/src/scene-describe.test.mjs`
- Modify: `packages/web/src/LearningBlocks.jsx:1480`

**Interfaces:**
- Consumes: `validateScene` and `getSceneState` from `animation-scene.js`.
- Produces: `describeAnimation(block) -> { kind, title, text }`. Never throws. `LearningBlocks.jsx`'s `describeBlock` delegates its `animation` branch to it.

This is the live bug. `describeBlock` at `LearningBlocks.jsx:1480` calls `getSceneState(block.scene, …)` on **raw** JSON. Raw objects have no defaulted `opacity`, so `object.initialState.opacity > 0` is `undefined > 0` — false — and `.filter(object => object.visible)` yields `[]`. The tutor is told `State at that moment: []` while the canvas shows the full scene. An object with no `initialState` key at all throws outright, and `describeBlock` is called from `AdaptiveCanvas.jsx:509` inside a plain click handler with no `try`/`catch` and no error boundary, so a throw there is a dead Ask button with no message anywhere.

The shipped `token-journey` scene hides this because every one of its objects sets `opacity` explicitly.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/scene-describe.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAnimation } from './scene-describe.js';

// Authored the way an author actually writes: no explicit opacity, because
// the schema defaults it to 1. The canvas validates; the tutor must too.
const block = (overrides = {}) => ({
  type: 'animation',
  title: 'One token, all the way through',
  time: 2,
  scene: {
    id: 'journey', duration: 8,
    objects: [
      { id: 'chars', type: 'tokens', semanticId: 'tokens', conceptId: 'tokenisation', initialState: { x: 40, y: 58, tokens: ['h', 'e'] } },
      { id: 'table', type: 'grid', semanticId: 'embedding-table', initialState: { x: 40, y: 140, rows: 2, cols: 2, values: [1, 2, 3, 4] } },
    ],
    timeline: [{ at: 1, action: 'highlight', target: 'table' }],
  },
  ...overrides,
});

test('an authored scene with defaulted opacity is reported as visible', () => {
  const described = describeAnimation(block());
  assert.match(described.text, /tokens/, 'the token row is on screen and must be named');
  assert.match(described.text, /embedding-table/);
  assert.doesNotMatch(described.text, /State at that moment: \[\]/);
});

test('the described state is the state at the paused moment', () => {
  assert.match(describeAnimation(block()).text, /"highlighted":true/, 'the highlight at 1s is active at 2s');
  assert.doesNotMatch(describeAnimation(block({ time: 0.5 })).text, /"highlighted":true/);
});

test('an unusable scene degrades to a sentence and never throws', () => {
  // `{ id: 'a', type: 'box' }` would NOT belong here: initialState carries
  // .default({}) and every inner field defaults, so it validates. An unknown
  // type is what actually fails the enum.
  for (const broken of [{ scene: null }, { scene: {} }, { scene: { id: 'x', duration: 2, objects: [{ id: 'a', type: 'nonsense' }], timeline: [] } }]) {
    const described = describeAnimation(block(broken));
    assert.equal(typeof described.text, 'string');
    assert.match(described.text, /cannot be read|Invalid animation/);
  }
});

test('concept ids reach the tutor', () => {
  assert.match(describeAnimation(block()).text, /tokenisation/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/web && node --test src/scene-describe.test.mjs`
Expected: FAIL with `Cannot find module './scene-describe.js'`.

- [ ] **Step 3: Write the serialiser**

Create `packages/web/src/scene-describe.js`:

```js
import { getSceneState, validateScene } from './animation-scene.js';

// What the tutor is told about an animation. The canvas renders a VALIDATED
// scene, so this must validate too: raw JSON leaves every default unapplied,
// and an object with no authored opacity then reads as invisible - which is
// how the tutor came to be told that a full canvas was empty.
//
// It never throws. Its one caller is a click handler with no error boundary,
// so a throw here is a dead Ask button with no message for the learner.

const NEWLINE = String.fromCharCode(10);

export function describeAnimation(block) {
  const title = block.title || 'Animation';
  let state = null;
  let problem = '';
  try { state = getSceneState(validateScene(block.scene), block.time ?? 0); }
  catch (failure) { problem = failure.message; }

  if (!state) {
    return { kind: 'Animation', title, text: [`Animation: ${title}`, `This animation cannot be read: ${problem}`].join(NEWLINE) };
  }

  const shown = state.objects.filter(object => object.visible);
  const concepts = [...new Set(state.objects.map(object => object.conceptId).filter(Boolean))];
  return {
    kind: 'Animation',
    title,
    text: [
      `Animation: ${title} (${block.scene.duration}s)`,
      `Paused at: ${state.time.toFixed(1)}s`,
      concepts.length ? `Concepts: ${concepts.join(', ')}` : '',
      block.selectedObject ? `Selected object: ${block.selectedObject}` : '',
      `State at that moment: ${JSON.stringify(shown.map(object => ({
        id: object.semanticId,
        highlighted: object.highlighted,
        ...(object.values ? { values: object.values } : {}),
        ...(object.tokens ? { tokens: object.tokens } : {}),
        ...(object.cellHighlight != null ? { cellHighlight: object.cellHighlight } : {}),
      })))}`,
    ].filter(Boolean).join(NEWLINE),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/web && node --test src/scene-describe.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Delegate from `describeBlock`**

In `packages/web/src/LearningBlocks.jsx`, add to the imports near the top of the file, beside the existing `animation-scene.js` import:

```js
import { describeAnimation } from './scene-describe.js';
```

Then replace line 1480 in full:

```js
  if (block.type === 'animation') return { kind: 'Animation', title: block.title, text: [`Animation: ${block.title} (${block.scene.duration}s)`, `Paused at: ${(block.time ?? 0).toFixed(1)}s`, block.selectedObject ? `Selected object: ${block.selectedObject}` : '', `State at that moment: ${JSON.stringify(getSceneState(block.scene, block.time ?? 0).objects.filter(object => object.visible).map(object => ({ id: object.semanticId, highlighted: object.highlighted })))}`].join(NEWLINE) };
```

with:

```js
  if (block.type === 'animation') return describeAnimation(block);
```

- [ ] **Step 6: Remove the import that is now unused, if it is**

Run: `cd packages/web && grep -n 'getSceneState' src/LearningBlocks.jsx`

If `getSceneState` no longer appears anywhere in the file, remove it from that file's import of `./animation-scene.js`. If it still appears, leave the import alone. Do not remove any other import.

- [ ] **Step 7: Verify the build and suites**

Run: `make test-unit`
Expected: PASS.

Run: `cd packages/web && npm run build`
Expected: build succeeds, no unresolved import.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/scene-describe.js packages/web/src/scene-describe.test.mjs packages/web/src/LearningBlocks.jsx
git commit -m 'fix(learn): the tutor reads a validated scene, so a full canvas stops reporting empty'
```

---

### Task 5: A scrubbed moment is the moment a question refers to

**Files:**
- Modify: `packages/web/src/AnimatedScene.jsx:250`
- Test: `packages/web/e2e/chat-block-check.mjs` (new check after line 659)

**Interfaces:**
- Consumes: Task 4's serialiser, which reads `block.time`.
- Produces: `block.time` matches the scrubber whenever playback is paused.

`block.time` is committed only by the effect keyed on `[playing]`. Scrub while paused and nothing commits, so `describeAnimation` reads a stale `block.time` and answers about a different moment than the canvas shows. The on-screen selection line hides this, because it falls back to live `time` via `block.time ?? time`.

This is a React state-commit behaviour, so the honest test drives the deployed canvas.

- [ ] **Step 1: Write the failing check**

In `packages/web/e2e/chat-block-check.mjs`, insert after the `pausing and marking a region asks about that moment` check (which ends at line 659):

```js
await check('a scrubbed moment is what a question refers to', async () => {
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('input[aria-label="Animation time"]').fill('9');   // commit one moment
  await node.locator('[data-animation-object="tokens"]').click();       // selection line now visible
  await node.locator('[data-animation-selection]').getByText('9.0s', { exact: false }).waitFor({ timeout: 3000 });
  await node.locator('input[aria-label="Animation time"]').fill('3');   // scrub again, still paused
  await node.locator('[data-animation-selection]').getByText('3.0s', { exact: false }).waitFor({ timeout: 3000 });
  await node.locator('[data-animation-clear]').click();
});
```

- [ ] **Step 2: Run it against the currently deployed build to confirm it fails**

The dev deployment is still pre-fix, so the failing run costs no rollout. Run this **before** touching `AnimatedScene.jsx`.

Run: `cd packages/web && node e2e/chat-block-check.mjs`
Expected: `FAIL: a scrubbed moment is what a question refers to`. The line keeps reading `9.0s` after the scrub to 3, because `block.time` never re-committed. Record the full pass/fail count — Gate A compares against it.

If this check *passes* against the pre-fix build, stop and say so: either the check is not exercising the bug, or the bug is not what the plan claims. Do not proceed to Step 3.

- [ ] **Step 3: Commit on every paused time change**

In `packages/web/src/AnimatedScene.jsx`, replace line 250:

```js
  useEffect(() => { if (!playing && scene) onChange({ ...block, time: Number(time.toFixed(2)) }); }, [playing]);
```

with:

```js
  // The paused moment is what a question refers to, so it is committed - on
  // every scrub, not only when playback stops. While playing, `playing` is
  // true and nothing commits, so the rAF loop never writes per frame.
  useEffect(() => { if (!playing && scene) onChange({ ...block, time: Number(time.toFixed(2)) }); }, [playing, time]);
```

- [ ] **Step 4: Verify what can be verified without a rollout**

Run: `make test-unit`
Expected: PASS.

Run: `cd packages/web && npm run build`
Expected: succeeds.

Run `npm run dev`, insert an Animation block, scrub to 9, click the token row, then scrub to 3. Expected: the selection line reads `3.0s`. This is the same property the e2e check asserts, verified locally.

The deployed confirmation is **Gate A**, immediately after this task. Do not deploy here.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/AnimatedScene.jsx packages/web/e2e/chat-block-check.mjs
git commit -m 'fix(learn): scrubbing while paused commits the moment a question refers to'
```

---

## Gate A — deploy and prove the stabilisation

Tasks 1 to 5 are done. Everything from here is renderer-local.

- [ ] Full suite: `make test-unit` → PASS.
- [ ] Build and deploy:
  The dev build needs three build-time flags, and the config lives in `packages/web`, not
  `packages/control-plane`. Procedure copied from [coaching.md](../../features/coaching.md); do not
  improvise it. The licence key is read from the repo `.env` and must never be echoed.

  ```bash
  cd packages/web
  export VITE_COACHING_DEV=true VITE_BYOC_DEV=true
  export VITE_TLDRAW_LICENSE_KEY=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('../../.env','utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);")
  npm run build -- --outDir dist-dev
  npx wrangler deploy --config wrangler.dev.jsonc
  ```

  Stop if the build fails. `dist-dev` is a separate output, so the live `dist` artifact is untouched,
  and `wrangler.dev.jsonc` deploys only `small-cp-dev`.
  Wait ~20 s — a new version serves 15-20 s after the deploy returns, and probing early looks exactly like the edit not taking.
- [ ] Full e2e: `cd packages/web && node e2e/chat-block-check.mjs`. Report the pass/fail count. Every previously passing check must still pass, and `a scrubbed moment is what a question refers to` must now pass.
- [ ] **Capture the baseline** the next seven tasks are checked against: run `node e2e/baseline-shot.mjs`, which writes `packages/web/e2e/shots/token-journey-baseline.png` at t=12.5s — the end state, every object on screen, nothing mid-tween. `e2e/shots` is gitignored, so the **script** is the committed artifact and the image is local and regenerable; do not force a binary past `.gitignore`. Re-run the same script at Gate B so both images come from identical conditions.
- [ ] Report the dev page link.

---

### Task 6: The camera drives the viewBox and the region hit-test

**Files:**
- Modify: `packages/web/src/animation-scene.js:62` (camera schema), `:148` (camera resolution), `:202` (`focus_camera`)
- Modify: `packages/web/src/AnimatedScene.jsx:132-140` (`find`), `:141` (insert `origin`/`span`/`view`), `:153` (viewBox)
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Consumes: `state.camera` from `getSceneState`, which is already computed and already correct.
- Produces: `focus_camera`, `pan_camera` and `zoom_camera` visibly move the frame, and a marked region still names the objects underneath it.

`focus_camera`, `pan_camera` and `zoom_camera` are three fully implemented actions whose output is read **zero** times — `viewBox` is hardcoded to the scene box. This is the highest-leverage line in the plan: one attribute turns three dead actions live and gives the brief its `zoom_into_component` for free.

The hit-test must move with it, or a learner marking a region in a zoomed frame selects objects from somewhere else entirely.

**The camera means a centre, and today it does not.** `scene.camera` defaults to `{x: 0, y: 0, zoom: 1}`, and a viewBox centred on `(0, 0)` would put an existing scene's origin in the middle of the frame — every shipped scene silently re-framed. `focus_camera` has the same flaw in miniature: it sets `camera.x = object.x`, the object's top-left, so focusing would park the object's corner at the centre. Both are fixed here, before the renderer reads any of it.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/animation-scene.test.mjs`:

```js
test('an unset camera sits at the centre of the scene', () => {
  const built = validateScene({
    id: 'unset', duration: 2, width: 800, height: 400,
    objects: [{ id: 'a', type: 'box', initialState: { x: 10, y: 10 } }],
    timeline: [],
  });
  assert.deepEqual(getSceneState(built, 1).camera, { x: 400, y: 200, zoom: 1 }, 'so the default view is the whole scene, unmoved');
});

test('the camera follows its events and settles on an object centre', () => {
  const built = validateScene({
    id: 'looked', duration: 6, width: 800, height: 400,
    objects: [{ id: 'far', type: 'box', initialState: { x: 600, y: 300, w: 100, h: 40, label: 'over here' } }],
    timeline: [
      { at: 1, action: 'zoom_camera', value: { zoom: 2 }, duration: 1, easing: 'linear' },
      { at: 3, action: 'focus_camera', target: 'far', value: { zoom: 2 } },
    ],
  });
  assert.equal(getSceneState(built, 0).camera.zoom, 1);
  assert.equal(getSceneState(built, 1.5).camera.zoom, 1.5, 'zoom interpolates');
  assert.equal(getSceneState(built, 2.5).camera.zoom, 2);
  const focused = getSceneState(built, 4).camera;
  assert.deepEqual({ x: focused.x, y: focused.y }, { x: 650, y: 320 }, 'focus centres the object, not its top-left corner');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL on both — the unset camera reports `{x: 0, y: 0}`, and focus reports the object's top-left `{x: 600, y: 300}`.

- [ ] **Step 3: Make the camera mean a centre**

In `packages/web/src/animation-scene.js`, change the `camera` field at line 62 so an unset coordinate is distinguishable from a deliberate zero:

```js
  camera: z.object({ x: z.number().nullable().default(null), y: z.number().nullable().default(null), zoom: z.number().positive().max(8).default(1) }).default({}),
```

Replace line 148:

```js
  let camera = { ...scene.camera };
```

with:

```js
  // The camera names the point the frame is centred on. Unset means the middle
  // of the scene, so a scene that never mentions a camera is framed exactly as
  // it was before the camera did anything at all.
  let camera = { x: scene.camera.x ?? scene.width / 2, y: scene.camera.y ?? scene.height / 2, zoom: scene.camera.zoom };
```

and replace the `focus_camera` case at line 202:

```js
      case 'focus_camera': if (object) camera = { ...camera, x: object.x, y: object.y, zoom: event.value?.zoom ?? camera.zoom }; break;
```

with:

```js
      case 'focus_camera': if (object) camera = { ...camera, x: object.x + (object.w ?? 0) / 2, y: object.y + (object.h ?? 0) / 2, zoom: event.value?.zoom ?? camera.zoom }; break;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `make test-unit`
Expected: PASS. No existing test asserts camera coordinates, so nothing else moves.

- [ ] **Step 5: Read the camera in the renderer**

In `packages/web/src/AnimatedScene.jsx`, replace line 153:

```js
      <svg viewBox={`0 0 ${scene.width} ${scene.height}`} className="h-full w-full bg-[#fbfbfa]">
```

with:

```js
      <svg viewBox={view} className="h-full w-full bg-[#fbfbfa]">
```

and add, immediately above the `return (` of `Frame` (after the `find` definition at line 140):

```js
  // The evaluator owns where the camera is; this only spends it. Zoom is about
  // the frame centre, so focusing an object does not also shove it off-screen.
  const span = { w: scene.width / state.camera.zoom, h: scene.height / state.camera.zoom };
  const origin = { x: state.camera.x - span.w / 2, y: state.camera.y - span.h / 2 };
  const view = `${origin.x} ${origin.y} ${span.w} ${span.h}`;
```

- [ ] **Step 6: Move the hit-test with it**

In the same file, replace the body of `find` at lines 132-140:

```js
  const find = at => {
    // Which authored object sits under the marked region, by semantic id.
    const inside = state.objects.filter(object => object.visible && object.w && object.h).filter(object => {
      const left = object.x / scene.width, top = object.y / scene.height;
      const right = (object.x + object.w) / scene.width, bottom = (object.y + object.h) / scene.height;
      return at.x < right && at.x + at.w > left && at.y < bottom && at.y + at.h > top;
    });
    return inside.map(object => object.semanticId);
  };
```

with:

```js
  const find = at => {
    // Which authored object sits under the marked region, by semantic id. The
    // region arrives in frame fractions, so it is measured against what the
    // camera is currently showing, not against the whole scene.
    const inside = state.objects.filter(object => object.visible && object.w && object.h).filter(object => {
      const left = (object.x - origin.x) / span.w, top = (object.y - origin.y) / span.h;
      const right = (object.x + object.w - origin.x) / span.w, bottom = (object.y + object.h - origin.y) / span.h;
      return at.x < right && at.x + at.w > left && at.y < bottom && at.y + at.h > top;
    });
    return inside.map(object => object.semanticId);
  };
```

`find` is defined before `origin`/`span` in source order but only ever called from `onPointerUp`, after render, so the `const` bindings are initialised by then.

- [ ] **Step 7: Verify the shipped scene is unmoved**

Run: `cd packages/web && npm run build`
Expected: succeeds.

Run: `cd packages/web && npm run dev`, open the Learn canvas, insert the Animation block.

Expected, all three:
1. `token-journey` authors no camera events, so it must fill the frame **exactly** as before — compare against `e2e/shots/token-journey-baseline.png`. A scene shifted by half its width means Step 3 was skipped.
2. Marking a region still selects the objects under it.
3. A temporary `{ at: 1, action: 'zoom_camera', value: { zoom: 2 }, duration: 1 }` added to `token-journey`'s timeline visibly zooms the frame, and marking a region **while zoomed** still names the object under the rectangle. Revert that edit before committing.

Check 3 is the one that matters: the viewBox and the hit-test must move together, and only a zoomed frame can show that they do.

Deployed e2e for this task runs at **Gate B**.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/AnimatedScene.jsx packages/web/src/animation-scene.test.mjs
git commit -m 'feat(learn): the camera actions drive the frame and the region hit-test'
```

---

### Task 7: `arrow` and `line` draw

**Files:**
- Modify: `packages/web/src/animation-scene.js:121-146` (evaluated fields)
- Modify: `packages/web/src/AnimatedScene.jsx:175-194` (render branches)
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Consumes: `initialState.from` and `initialState.to`, which the `vector` schema already parses at `animation-scene.js:7` and `:25-26`.
- Produces: an `arrow` or `line` object renders as an SVG line between `from` and `to`, with an arrowhead on `arrow`.

Both types are in the enum. Neither has a render branch, so both fall through to the generic `<rect>` with `width` and `height` undefined and draw nothing. `from` and `to` are parsed and copied nowhere. This is a shipped proof of the silent-extension-point failure: an author can write an object that validates and is invisible.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/animation-scene.test.mjs`:

```js
test('an arrow carries its endpoints into evaluated state', () => {
  const built = validateScene({
    id: 'pointed', duration: 4,
    objects: [{ id: 'a', type: 'arrow', semanticId: 'residual', initialState: { from: { x: 10, y: 20 }, to: { x: 90, y: 20 } } }],
    timeline: [],
  });
  const object = getSceneState(built, 1).objects[0];
  assert.deepEqual(object.from, { x: 10, y: 20 });
  assert.deepEqual(object.to, { x: 90, y: 20 });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL — `object.from` is `undefined`; the evaluator never copies it.

- [ ] **Step 3: Carry the endpoints through**

In `packages/web/src/animation-scene.js`, inside the object literal built at lines 121-146, add after the `color` line:

```js
    from: object.initialState.from ?? null,
    to: object.initialState.to ?? null,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: PASS.

- [ ] **Step 5: Render them**

In `packages/web/src/AnimatedScene.jsx`, after line 177 (`const isData = …`), add:

```js
          const isStroke = object.type === 'arrow' || object.type === 'line';
```

Then in the shape ternary at lines 188-194, insert a branch before `isCircle`:

```js
              {isData
                ? <DataShape object={object} colour={colour} />
                : isStroke
                ? <line x1={object.from?.x ?? object.x} y1={object.from?.y ?? object.y}
                    x2={object.to?.x ?? object.x} y2={object.to?.y ?? object.y}
                    stroke={chosen ? '#b42318' : colour} strokeWidth={chosen ? 3.5 : 2.5} strokeLinecap="round"
                    markerEnd={object.type === 'arrow' ? 'url(#animation-arrow)' : undefined} />
                : isCircle
```

Finally, exclude strokes from the centred-label placement by including `isStroke` alongside `isData || isText` in the `<text>` block at lines 195-203 — a stroke's label belongs at its `from` point, not at a box centre it does not have:

```js
              <text
                x={isData || isText || isStroke ? (isStroke ? object.from?.x ?? object.x : object.x) : centre.x}
                y={isData ? object.y - 10 : isText ? object.y : isStroke ? (object.from?.y ?? object.y) - 8 : centre.y}
                textAnchor={isData || isText || isStroke ? 'start' : 'middle'}
                dominantBaseline={isData || isText || isStroke ? 'auto' : 'central'}
```

Leave the remaining `<text>` attributes unchanged.

- [ ] **Step 6: Verify**

Run: `make test-unit`
Expected: PASS.

Run: `cd packages/web && npm run build`
Expected: succeeds.

Run `npm run dev` and insert an Animation block. `token-journey` authors no `arrow` or `line`, so it must be pixel-identical to `token-journey-baseline.png`.

Then verify the new branch actually draws: temporarily add `{ id: 'res', type: 'arrow', semanticId: 'residual', initialState: { from: { x: 320, y: 120 }, to: { x: 620, y: 120 }, color: '#b45309' } }` to the scene's objects. Expected: a visible arrow with a head at the right end. Revert before committing.

Deployed e2e runs at **Gate B**.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/AnimatedScene.jsx packages/web/src/animation-scene.test.mjs
git commit -m 'feat(learn): arrow and line draw instead of validating into nothing'
```

---

### Task 8: `image` renders under a source policy

**Files:**
- Modify: `packages/web/src/animation-scene.js` (schema, validation, evaluated fields)
- Modify: `packages/web/src/AnimatedScene.jsx` (render branch)
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Consumes: Task 7's render-branch structure.
- Produces: `initialState.src` on an `image` object, restricted to a same-origin relative path, rendered as `<image>`. Scene B needs this.

`src` is bounded by **policy**, not only by length. A length cap alone would let a scene reference a third-party origin — a tracking and exfiltration path out of a lesson — or inline a multi-megabyte `data:` URI into persisted block state.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/animation-scene.test.mjs`:

```js
const pictured = src => validateScene({
  id: 'shown', duration: 4,
  objects: [{ id: 'photo', type: 'image', initialState: { x: 0, y: 0, w: 200, h: 150, src } }],
  timeline: [],
});

test('an image takes a same-origin path and nothing else', () => {
  assert.equal(getSceneState(pictured('/api/assets/frame-7.png'), 1).objects[0].src, '/api/assets/frame-7.png');
  for (const bad of ['https://example.com/x.png', '//example.com/x.png', 'data:image/png;base64,AAAA', 'blob:abc', 'http://localhost/x.png', '../../etc/passwd']) {
    assert.throws(() => pictured(bad), /same-origin path/, `accepted ${bad}`);
  }
});

test('an image needs a source', () => {
  assert.throws(() => validateScene({
    id: 'blank', duration: 4,
    objects: [{ id: 'photo', type: 'image', initialState: { x: 0, y: 0, w: 10, h: 10 } }],
    timeline: [],
  }), /image needs a src/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL — `src` is not in the schema, so zod strips it and the first assertion reads `undefined`.

- [ ] **Step 3: Add the field, the policy and the evaluated value**

In `packages/web/src/animation-scene.js`, add to the `initialState` shape after `tokens`:

```js
    src: z.string().max(300).optional(),
```

Add above `validateScene`:

```js
// An image source is a policy, not a length. A third-party origin would make a
// lesson a tracking beacon, and a data: URI would put megabytes into the
// learner's persisted canvas. One leading slash, no scheme, no traversal.
const SAME_ORIGIN = /^\/[A-Za-z0-9._~\-/]*$/;
```

Inside `validateScene`, after the object-id uniqueness check, add:

```js
  for (const object of scene.objects) {
    if (object.type !== 'image') continue;
    const src = object.initialState.src;
    if (!src) throw new Error(`Object "${object.id}": an image needs a src`);
    if (!SAME_ORIGIN.test(src) || src.includes('..') || src.startsWith('//')) {
      throw new Error(`Object "${object.id}": an image src must be a same-origin path beginning with a single /`);
    }
  }
```

In the evaluated object literal, add beside the `from`/`to` lines from Task 7:

```js
    src: object.initialState.src ?? null,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: PASS.

- [ ] **Step 5: Render it**

In `packages/web/src/AnimatedScene.jsx`, add after the `isStroke` line from Task 7:

```js
          const isImage = object.type === 'image';
```

and insert a branch in the shape ternary, before `isStroke`:

```js
              {isData
                ? <DataShape object={object} colour={colour} />
                : isImage
                ? <image href={object.src} x={object.x} y={object.y} width={object.w} height={object.h}
                    preserveAspectRatio="xMidYMid slice"
                    stroke={chosen ? '#b42318' : 'none'} strokeWidth={chosen ? 3 : 0} />
                : isStroke
```

**Extract the label placement instead of adding a fourth term.** After Task 7 the `<text>` element carries a compound condition on `x`, `y`, `textAnchor` and `dominantBaseline`, with a nested ternary inside `x`. Task 10 adds equations to the same element. Adding `isImage` as another term would make four tasks' worth of conditions unreadable, so lift it out once, here.

Add above `Frame`:

```js
// Where a label sits depends on what it is labelling: a box or circle centres it,
// a stroke pins it to its start, and everything that owns a frame - data grids,
// images - hangs it above the top edge. One place, so the next type added does
// not grow a fifth condition into four attributes.
const labelAt = (object, kind, centre) => {
  if (kind.stroke) return { x: object.from?.x ?? object.x, y: (object.from?.y ?? object.y) - 8, anchor: 'start', baseline: 'auto' };
  if (kind.above) return { x: object.x, y: object.y - 10, anchor: 'start', baseline: 'auto' };
  if (kind.text) return { x: object.x, y: object.y, anchor: 'start', baseline: 'auto' };
  return { x: centre.x, y: centre.y, anchor: 'middle', baseline: 'central' };
};
```

In the object map, replace the four compound expressions with one call:

```js
          const label = labelAt(object, { stroke: isStroke, above: isData || isImage, text: isText }, centre);
```

and in the `<text>` element use `x={label.x} y={label.y} textAnchor={label.anchor} dominantBaseline={label.baseline}`. Leave `fontSize`, `fontWeight`, `fill` and `style` exactly as they are — an image caption takes the data weight and colour, which is what they already give it.

Check the order carefully: `stroke` must be tested before `above`, and a `text` object must keep `object.y` rather than `object.y - 10`. Getting the order wrong moves labels on scenes that work today, which is the regression the baseline image exists to catch.

- [ ] **Step 6: Verify**

Run: `make test-unit`
Expected: PASS.

Run: `cd packages/web && npm run build`
Expected: succeeds.

Run `npm run dev`. The shipped scene authors no `image`, so it must match `token-journey-baseline.png`.

Then verify the branch draws and the policy bites: temporarily add an `image` object with `src: '/favicon.svg'` (a real same-origin asset) — expected, it renders. Change that `src` to `https://example.com/x.png` — expected, the whole block is replaced by the one-line validation error, not a broken image. Revert before committing.

Deployed e2e runs at **Gate B**.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/AnimatedScene.jsx packages/web/src/animation-scene.test.mjs
git commit -m 'feat(learn): image objects render from a same-origin path only'
```

---

### Task 9: A grid reads as a heatmap, and a bar axis holds still

**Files:**
- Modify: `packages/web/src/AnimatedScene.jsx:39-74` (grid/strip fill), `:75-98` (bars)
- Modify: `packages/web/src/animation-scene.js` (`heat` and `peak` fields)
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Consumes: Task 3's `null` blanks.
- Produces: `initialState.heat` maps a cell's fill alpha from its value; `initialState.peak` pins the bar axis so it stops rescaling mid-tween.

Grid cells are filled binary today — `tint(colour, '33')` when lit, `'0a'` otherwise — so a distribution reads as a table of numerals rather than a shape. That is `Heatmap`, and it is the existing branch plus an alpha.

Separately, `bars` recomputes `peak` from its own tweening values every frame at `AnimatedScene.jsx:77`. During a reveal from `[4,3,9]` to `[4,3,14]` the axis rescales continuously and the two unchanged bars visibly shrink to about two-thirds height while their printed numbers stay 4 and 3 — the learner watches their own prediction get cheaper at the moment of reveal. Scene C depends on this not happening.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/animation-scene.test.mjs`:

```js
test('a pinned peak survives into evaluated state so the axis holds still', () => {
  const built = validateScene({
    id: 'revealed', duration: 4,
    objects: [{ id: 'cost', type: 'bars', initialState: { x: 0, y: 0, values: [4, 3, 9], peak: 14 } }],
    timeline: [{ at: 0, action: 'set_values', target: 'cost', duration: 2, easing: 'linear', value: [4, 3, 14] }],
  });
  assert.equal(getSceneState(built, 0).objects[0].peak, 14);
  assert.equal(getSceneState(built, 2).objects[0].peak, 14, 'the axis does not move when the values do');
});

test('heat is carried so a grid can read as a distribution', () => {
  const built = validateScene({
    id: 'hot', duration: 2,
    objects: [{ id: 'g', type: 'grid', initialState: { x: 0, y: 0, rows: 2, cols: 2, values: [0, 1, 2, 3], heat: true } }],
    timeline: [],
  });
  assert.equal(getSceneState(built, 1).objects[0].heat, true);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL — neither field is in the schema.

- [ ] **Step 3: Add both fields**

In `packages/web/src/animation-scene.js`, add to the `initialState` shape:

```js
    heat: z.boolean().optional(),
    peak: z.number().positive().max(1e6).optional(),
```

and to the evaluated object literal:

```js
    heat: object.initialState.heat ?? false,
    peak: object.initialState.peak ?? null,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: PASS.

- [ ] **Step 5: Spend both in the renderer**

In `packages/web/src/AnimatedScene.jsx`, inside the `grid`/`strip` branch of `DataShape`, replace the `lit` line at line 48 and the `motion.rect` fill at line 52. Add above the cell loop:

```js
    // A heat grid reads as a distribution: fill carries the value, so the shape
    // is visible before a single numeral is read.
    const hottest = object.heat ? Math.max(...(object.values || []).map(entry => Math.abs(entry ?? 0)), 0.0001) : 0;
    const alpha = value => {
      if (!object.heat || value == null) return '0a';
      const share = Math.min(1, Math.abs(value) / hottest);
      return Math.round(10 + share * 150).toString(16).padStart(2, '0');
    };
```

and change the `motion.rect` `animate` to:

```js
              animate={{ fill: lit ? tint(colour, '33') : tint(colour, alpha(value)), stroke: lit ? colour : tint(colour, '33'), strokeWidth: lit ? 1.4 : 0.6 }}
```

In the `bars` branch, replace line 77:

```js
    const peak = Math.max(...values.map(Math.abs), 0.0001);
```

with:

```js
    // An authored peak pins the axis. Without it the scale is recomputed from
    // the tweening values, so bars that never changed visibly shrink while a
    // neighbour grows - the learner watches their own answer move.
    const peak = object.peak ?? Math.max(...values.map(entry => Math.abs(entry ?? 0)), 0.0001);
```

and make the two `values.map`/`Math.max` uses at lines 83-84 null-safe, since Task 3 allows blanks:

```js
          const tall = value == null ? 0 : Math.max(1, (Math.abs(value) / peak) * (height - 4));
          const lit = marked(object, 0, index, index) || (object.cellHighlight === 'max' && value != null && value === Math.max(...values.map(entry => entry ?? -Infinity)));
```

- [ ] **Step 6: Verify**

Run: `make test-unit`
Expected: PASS.

Run: `cd packages/web && npm run build`
Expected: succeeds.

Run `npm run dev`. The shipped scene sets neither `heat` nor `peak`, so its grid stays binary-filled and its bars keep their computed axis — match against `token-journey-baseline.png`.

Then verify both new fields, because both are about something you can only see moving:
1. Add `heat: true` to the `table` grid. Expected: cells take a range of fill strengths from their values rather than two.
2. Add `peak: 0.5` to the `scores` bars and play through the `set_values` at 9.6s. Expected: bars that are not changing hold their height. Remove `peak` and replay — expected: they visibly shrink as the winner grows. That difference is the bug this fixes.

Revert both before committing.

Deployed e2e runs at **Gate B**.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/AnimatedScene.jsx packages/web/src/animation-scene.test.mjs
git commit -m 'feat(learn): value-mapped grid fill and a bar axis that holds still through a reveal'
```

---

### Task 10: Equations are set, and code looks like code

**Files:**
- Modify: `packages/web/src/AnimatedScene.jsx:175` (`isText`), `:195-205` (text block)
- Test: manual, on the dev deployment

**Interfaces:**
- Consumes: `katex` 0.16, already an eager dependency via `MathText.jsx`.
- Produces: an `equation` object renders typeset maths; a `code` object renders in the monospace stack.

`equation` and `code` are both in the type enum and both fold into `isText`, rendering as proportional `<text>` with `fontFamily: 'inherit'` — `code` does not even get the `MONO` constant that already exists at line 14 and is already applied to circles and data numerals.

`katex.renderToString` is synchronous and pure, so the render path stays synchronous. No new dependency, no marginal bundle cost — KaTeX is already on the critical path.

- [ ] **Step 1: Render code in the monospace stack**

In `packages/web/src/AnimatedScene.jsx`, add after the `isText` line at 175:

```js
          const isCode = object.type === 'code';
          const isEquation = object.type === 'equation';
```

and change the `style` on the `<text>` at line 203 from:

```js
                style={{ fontFamily: isCircle ? MONO : 'inherit' }}>{shown}</text>
```

to:

```js
                style={{ fontFamily: isCircle || isCode ? MONO : 'inherit' }}>{shown}</text>
```

- [ ] **Step 2: Typeset equations**

Add to the imports at the top of `packages/web/src/AnimatedScene.jsx`:

```js
import katex from 'katex';
```

Add above `Frame`:

```js
// KaTeX is synchronous and pure, so a frame can be typeset in the render pass
// and a scrub never waits on anything. An expression that will not parse shows
// itself rather than throwing the whole animation away.
const typeset = expression => {
  try { return katex.renderToString(expression, { throwOnError: false, displayMode: false, output: 'html' }); }
  catch { return null; }
};
```

Inside the object map in `Frame`, beside the other `const` declarations for this object (after `isEquation`), add:

```js
          const maths = isEquation ? typeset(shown) : null;
```

Then, before the `<text>` element, add:

```js
              {maths && (
                <foreignObject x={object.x} y={object.y} width={object.w} height={object.h}>
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontSize: 15, color: '#37352f' }}
                    dangerouslySetInnerHTML={{ __html: maths }} />
                </foreignObject>
              )}
```

and suppress the plain `<text>` when the equation was typeset by wrapping the `<text>` element in `{!maths && (…)}`. Typesetting once per object per frame, not three times: this runs inside the render pass on every scrub step.

`dangerouslySetInnerHTML` is safe here and only here: the input is KaTeX's own output, and KaTeX with `throwOnError: false` emits markup, never script. It must never be pointed at a raw scene string.

- [ ] **Step 3: Require a size for an equation**

An equation with no `w`/`h` would render an empty `foreignObject`. In `packages/web/src/animation-scene.js`, add to the per-object loop written in Task 8:

```js
    if (object.type === 'equation' && !(object.initialState.w && object.initialState.h)) {
      throw new Error(`Object "${object.id}": an equation needs a width and height to be set in`);
    }
```

- [ ] **Step 4: Verify**

Run: `make test-unit`
Expected: PASS.

Run: `cd packages/web && npm run build`
Expected: succeeds, and KaTeX adds no new chunk — it is already eager via `MathText.jsx`.

Run `npm run dev`. The shipped scene has no `equation` or `code` object, so it must match `token-journey-baseline.png`.

Then verify both branches by temporarily adding to `token-journey` in `LearningBlocks.jsx`:
1. `{ id: 'eq', type: 'equation', initialState: { text: '\\sigma(x) = \\frac{1}{1 + e^{-x}}', x: 400, y: 30, w: 220, h: 44 } }` — expected: typeset maths with a real fraction bar, not a literal backslash.
2. `{ id: 'snip', type: 'code', initialState: { text: 'logits = q @ k.T', x: 400, y: 90 } }` — expected: monospace.
3. Change the equation's text to `\\frac{1}{` (unbalanced) — expected: KaTeX's own error rendering or the plain text fallback, and the rest of the animation still plays. A broken expression must not take the scene down.

Revert all three before committing.

Deployed e2e runs at **Gate B**.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/AnimatedScene.jsx packages/web/src/animation-scene.js
git commit -m 'feat(learn): equations are typeset and code renders monospace'
```

---

### Task 11: Reduced motion is respected

**Files:**
- Modify: `packages/web/src/AnimatedScene.jsx:2` (import), `:18` (`POP`), `:237-248` (rAF)
- Test: manual, on the dev deployment

**Interfaces:**
- Consumes: `useReducedMotion` from `motion/react`, already a dependency.
- Produces: with `prefers-reduced-motion: reduce`, springs settle instantly and playback jumps to the end rather than animating.

Nothing honours reduced motion today. The evaluator is already time-in/state-out, so instant seeking is free — the whole fix is one transition constant and one branch in the transport.

- [ ] **Step 1: Import the hook**

In `packages/web/src/AnimatedScene.jsx`, change line 2:

```js
import { motion } from 'motion/react';
```

to:

```js
import { motion, useReducedMotion } from 'motion/react';
```

- [ ] **Step 2: Make the spring conditional**

`POP` is a module constant used by seven `motion` elements inside `DataShape`. Thread it through rather than duplicating the decision. Change the `DataShape` signature at line 37:

```js
function DataShape({ object, colour }) {
```

to:

```js
function DataShape({ object, colour, pop }) {
```

and replace every `transition={POP}` inside `DataShape` with `transition={pop}` — there are exactly six, at lines 53, 67, 86, 88, 108 and 110. Verify with `grep -c 'transition={POP}' src/AnimatedScene.jsx` before and after: 6, then 0.

In `Frame`, add `pop` to the props at line 123 and pass it to `DataShape` at line 189:

```js
                ? <DataShape object={object} colour={colour} pop={pop} />
```

In `AnimatedScene`, add after line 224:

```js
  // The evaluator is time-in, state-out, so honouring reduced motion costs a
  // constant and a branch: states settle where they already were going.
  const still = useReducedMotion();
  const pop = still ? { duration: 0 } : POP;
```

and pass `pop={pop}` to `<Frame …>` at line 261.

- [ ] **Step 3: Jump rather than animate**

In `AnimatedScene`, replace the play handler at line 256:

```js
  const play = () => { if (atEnd && !playing) setTime(0); setPlaying(value => !value); };
```

with:

```js
  const play = () => {
    if (still) { setTime(atEnd ? 0 : scene.duration); return; }   // no motion: show the end, do not travel to it
    if (atEnd && !playing) setTime(0);
    setPlaying(value => !value);
  };
```

and the replay handler at line 257:

```js
  const replay = () => { setTime(0); setPlaying(true); };
```

with:

```js
  const replay = () => { setTime(0); if (!still) setPlaying(true); };
```

- [ ] **Step 4: Verify**

Run: `make test-unit`
Expected: PASS — `animation-scene.js` is untouched.

Run: `cd packages/web && npm run build`
Expected: succeeds.

Run `npm run dev`. In Chrome DevTools open Rendering and set `Emulate CSS media feature prefers-reduced-motion` to `reduce`. Insert an Animation block:

- Play must jump straight to the final frame, not travel to it.
- Cells must change state without springing.
- The scrubber must still seek exactly — reduced motion removes the animation, never the determinism.

Set it back to `no-preference` and confirm normal playback returns unchanged.

Deployed e2e runs at **Gate B**. Playwright does not set the reduced-motion preference by default, so the normal path is what the suite exercises.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/AnimatedScene.jsx
git commit -m 'feat(learn): reduced motion settles states instantly and skips playback'
```

---

### Task 12: An unrenderable object fails loudly

**Files:**
- Modify: `packages/web/src/animation-scene.js` (per-object validation)
- Modify: `packages/web/src/AnimatedScene.jsx` (DataShape fall-through)
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Consumes: the render branches from Tasks 7, 8 and 10.
- Produces: every type in the enum has a render branch, and `DataShape` refuses a data type it does not know instead of drawing it as token chips.

This is the task that stops the plan's own additions becoming the next `arrow`. After Tasks 7, 8 and 10 every enum member renders — this pins that property so the next person to widen the enum without a branch finds out at the gate. `DataShape`'s token branch is an unguarded fall-through: any future `DATA_TYPES` member with no branch silently renders as chips.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/animation-scene.test.mjs`:

```js
// Asserting a literal list against the exported list would pin nothing - both
// sides would be constants. Build a real object of every declared type and put
// it through the gate: that catches a type added to the enum without the fields
// its renderer needs, which is how arrow, line and image shipped invisible.
const SAMPLE = {
  box: {}, text: { text: 'hi' }, circle: { w: 40 },
  arrow: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
  line: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
  equation: { text: 'x = 1', w: 80, h: 30 },
  code: { text: 'x = 1' },
  image: { src: '/favicon.svg', w: 40, h: 40 },
  grid: { rows: 2, cols: 2, values: [1, 2, 3, 4] },
  strip: { values: [1, 2] },
  bars: { values: [1, 2] },
  tokens: { tokens: ['a', 'b'] },
};

test('every declared type has a sample the gate accepts', () => {
  assert.deepEqual([...RENDERED_TYPES].sort(), Object.keys(SAMPLE).sort(), 'a new type needs a sample here and a branch in AnimatedScene.jsx');
  for (const type of RENDERED_TYPES) {
    const built = validateScene({
      id: `sample-${type}`, duration: 2,
      objects: [{ id: 'one', type, initialState: { x: 10, y: 10, ...SAMPLE[type] } }],
      timeline: [],
    });
    assert.equal(getSceneState(built, 1).objects[0].type, type, `${type} did not survive the gate`);
  }
});
```

Add `RENDERED_TYPES` to the existing import line at the top of the test file.

This pins the schema side. The renderer side is held by two things that already exist in this task: the `DataShape` guard in Step 5, which refuses to draw a data type it does not know, and the manual check in Step 6. A `.jsx` file cannot be imported by `node --test`, so there is no honest unit assertion for "a branch exists" — say so rather than writing one that looks like there is.

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL — `RENDERED_TYPES` is not exported.

- [ ] **Step 3: Export the list and drive the enum from it**

In `packages/web/src/animation-scene.js`, above `objectSchema`:

```js
// Every type here has a branch in AnimatedScene.jsx. Adding a member without
// one produces an object that validates and draws nothing, which is how arrow,
// line and image shipped invisible. The renderer's own test reads this list.
export const RENDERED_TYPES = ['box', 'text', 'circle', 'arrow', 'line', 'equation', 'code', 'image', 'grid', 'strip', 'bars', 'tokens'];
```

and change the type field at line 12 to:

```js
  type: z.enum(RENDERED_TYPES),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: PASS.

- [ ] **Step 5: Close the same silent failure in the schema's own defaults**

An object authored with no `initialState` key **passes validation and then draws nothing**. Verified:

```
validateScene({ objects: [{ id: 'a', type: 'box' }] })  ->  initialState: {}
getSceneState(...)                                      ->  visible: false, x: undefined, opacity: undefined
```

The cause is a zod 4 pitfall: `.default(value)` supplies that value **literally and unparsed** when the key is absent, so the inner field defaults never run — and neither does inner validation. `.prefault(value)` runs it through the schema instead. Change both uses in `packages/web/src/animation-scene.js`:

```js
  }).prefault({}),                                                     // objectSchema.initialState
  camera: z.object({ ... }).prefault({}),                              // replaces .default({ zoom: 1 })
```

Add the test that pins it:

```js
test('an object authored without an initialState is still a real object', () => {
  const built = validateScene({ id: 'bare', duration: 2, objects: [{ id: 'a', type: 'box' }], timeline: [] });
  const object = getSceneState(built, 1).objects[0];
  assert.equal(object.visible, true, 'it validated, so it must draw');
  assert.equal(object.opacity, 1);
  assert.deepEqual({ x: object.x, y: object.y }, { x: 0, y: 0 });
});
```

Run it RED first — it fails on `visible: false` — then apply the change. `camera` moves to the same idiom in the same commit: its current `.default({ zoom: 1 })` is a hand-maintained literal that bypasses `.max(8)`, so a later edit to `{ zoom: 20 }` would not be caught at parse time.

- [ ] **Step 6: Refuse a stroke with no endpoints**

The third member of the same family, and the last one outstanding. An `arrow` or `line` with no `from`/`to` falls back to its own `x`/`y` for both ends — a finite zero-length line, never NaN, but an object that validated and is invisible. Exactly what this task exists to stop.

Add to the same per-object loop, as a sibling of the image and equation blocks:

```js
    // A stroke with no endpoints falls back to its own x/y for both ends, which
    // is a finite zero-length line - no NaN, but an invisible object that
    // validated. That is the failure this whole pass exists to stop.
    if (['arrow', 'line'].includes(object.type) && !(object.initialState.from && object.initialState.to)) {
      throw new Error(`Object "${object.id}": an ${object.type} needs a from and a to`);
    }
```

with its test:

```js
test('a stroke needs both endpoints or it is an invisible zero-length line', () => {
  const stroke = (type, state) => () => validateScene({
    id: 'strokes', duration: 2,
    objects: [{ id: 's', type, initialState: { x: 10, y: 10, ...state } }],
    timeline: [],
  });
  assert.throws(stroke('arrow', {}), /an arrow needs a from and a to/);
  assert.throws(stroke('line', { from: { x: 0, y: 0 } }), /a line needs a from and a to/);
  assert.doesNotThrow(stroke('arrow', { from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }));
});
```

Note this makes Task 7's `object.from?.x ?? object.x` fallbacks unreachable for a validated scene. Leave them — they still guard the `describeBlock` path, which evaluates blocks that may predate this rule.

- [ ] **Step 7: Close the `DataShape` fall-through**

`DataShape` currently ends with an unguarded token render, so any future `DATA_TYPES` member with no branch of its own silently draws as chips. In `packages/web/src/AnimatedScene.jsx`, replace the `let offset = 0;` line at 99 with:

```js
  // Everything past here draws token chips. A data type that reaches this
  // point without being `tokens` has no renderer, and chips would be a
  // confident wrong picture - say so and draw nothing.
  if (object.type !== 'tokens') {
    console.error(`AnimatedScene: no renderer for data type "${object.type}"`);
    return null;
  }
  let offset = 0;
```

- [ ] **Step 8: Verify**

Run: `make test-unit`
Expected: PASS.

Run: `cd packages/web && npm run build`
Expected: succeeds.

Run `npm run dev` and insert an Animation block. Expected: it matches `token-journey-baseline.png`, and the browser console shows no `no renderer for data type` line.

Then confirm the guard fires: temporarily add `'patches'` to `RENDERED_TYPES` and to `DATA_TYPES` in `AnimatedScene.jsx`, author an object of that type, and check the console logs `no renderer for data type "patches"` and nothing is drawn — rather than token chips appearing. Revert both edits before committing; the unit test from Step 1 will fail until you do, which is the point of it.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/AnimatedScene.jsx packages/web/src/animation-scene.test.mjs
git commit -m 'feat(learn): the type enum and the renderer cannot drift apart'
```

---

## Gate B — deploy and prove the renderer batch

Tasks 6 to 12 are done and each passed locally. This is the one rollout for all seven.

- [ ] Full suite: `make test-unit` → PASS.
- [ ] Build and deploy, as in Gate A. Wait ~20 s.
- [ ] Full e2e: `cd packages/web && node e2e/chat-block-check.mjs`. Report the pass/fail count against Gate A's numbers — any check that passed at Gate A and fails here is a regression introduced by Tasks 6-12, and the batch does not ship until it is found.
- [ ] **Visual regression:** screenshot the Animation block and compare against `e2e/shots/token-journey-baseline.png`. `token-journey` authors no camera, arrow, line, image, `heat`, `peak`, equation or code, so seven tasks of renderer work must leave it identical. Any difference is an unintended change and must be explained before the batch ships.
- [ ] Report the dev page link.

---

## Done when

- `make test-unit` runs the Python and both JS suites, and fails if any one of them fails.
- The four live bugs are fixed, each with a test that fails before its fix.
- `getSceneState` is total for any persisted time value.
- Every type in the schema enum draws, and a new one cannot be added without a branch.
- `node e2e/chat-block-check.mjs` reports no regressions at **both** gates, and the scrubbed-moment check passes from Gate A onward.
- The shipped `token-journey` scene is visually unchanged throughout, checked against `e2e/shots/token-journey-baseline.png` locally at every renderer task and once more at Gate B. It is the regression easiest to miss and worst to ship.
- Exactly **two** deploys happened.

## Next

**Plan B — the input axis** (T1.1, T1.2), beginning with the `block.state` → `block.inputs` compatibility layer, which must land before any writer migrates.
