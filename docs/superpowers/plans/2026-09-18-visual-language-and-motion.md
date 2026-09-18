# Plan A.5 — Visual Language, Motion and Sound

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the same declarative scenes look like one coherent technical-learning system, add a semantic sound channel, and close two correctness debts — without changing evaluator semantics.

**Architecture:** A scene names *meaning* (role), *state*, *typography role*, *timing name* and *sound name*. The style system owns every pixel. Colour resolves through CSS custom properties so dark mode is automatic and `getSceneState` never returns a colour. Timing names resolve at the validation gate, so the evaluator only ever sees seconds. Sound is triggered by the transport observing crossed event boundaries, never by the evaluator.

**Tech Stack:** React 19, zod 4.5, Motion 13 (discrete states only), KaTeX, Web Audio API (no new dependency), `node:test`, Playwright.

**Spec:** [docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md](../specs/2026-09-18-visual-language-and-motion-design.md)

## Global Constraints

- `packages/web/src/animation-scene.js` imports **zod and `scene-vocab.js`, nothing else**. `scene-vocab.js` is a pure module of frozen enums with no imports of its own, so the evaluator still pulls in no renderer code, no React and no style logic. The dependency graph is:

  ```
  scene-vocab.js   (no imports)
    ├── animation-scene.js   (+ zod)
    ├── scene-style.js
    └── scene-sound.js
  ```

  This exists so the enums are declared once. Duplicating them into two modules that must agree is the failure this plan is built to avoid.
- `getSceneState` stays **pure, total and silent**: same arguments → same output; full replay from t=0; no caching; no colour in its output; no sound.
- Motion animates **discrete state only** — never position, size, opacity, rotation, values, path length, or any continuously-varying value.
- Object identity is fixed for the life of a scene.
- **No new runtime dependency.** Sound is synthesised with the Web Audio API.
- **The schema gains no free-form styling field.** No `className`, no `style`, no `css`, no colour. If a reference scene cannot be made to look right through the vocabularies, the vocabulary changes — never the scene.
- Validation errors are one line, human-readable, rendered verbatim to the learner.
- Caps stand: objects ≤ 60, timeline ≤ 200, values ≤ 256, tokens ≤ 48, duration ≤ 120 s.
- Branch `feat/canvas-block-conversations`. No branch creation, no merge, no push. Deploy only at a named gate.
- **`git add` named paths only.** Naming a path is not enough — a named file can carry unrelated hunks. Read `git diff --cached` before every commit; use `git add -p` for mixed files. Two untracked files are the user's and stay untracked: `docs/courses/nanogpt/nanogpt-lesson-03-causal-self-attention.md`, `image.png`.
- **A task's commit command must name every file in that task's Files list.** Where the two disagree, **the Files list wins** — add the missing file and say so in your report. This has already happened twice in this plan: Task 2's `git add` omitted `LearningBlocks.jsx` and Task 4's omitted `scene-vocab.js`, both files those tasks created or had to modify. The narrower command produces a commit that builds and is silently incomplete, which is the hardest kind to notice.
- Commit messages: no double quotes anywhere; no `Co-Authored-By` or `Claude-Session` trailers; single-quote the `-m` argument.
- Never `git revert`. To undo, `git reset --soft`, and report it.

## Lessons carried from Plan A — read before writing any task

Six defects reached implementers in Plan A. Three were **the plan's own code disagreeing with the plan's own test assertion**, written minutes apart. One was a requirement buried inside another step's code block, which both an implementer and a reviewer missed because it was not its own numbered step. One was a stale line number. One was a command that did not work as written.

Therefore, in this plan:

- **Every requirement is its own numbered step.** Nothing rides inside another step's code block.
- **Anchor on unique text and `grep -c` counts, never on line numbers.** Five tasks will edit `AnimatedScene.jsx`; every line number in this document is stale the moment the first one lands.
- **Where a step gives both code and a test, the test's expected value is derived from the code by hand before the step is written.** If they disagree, the step is wrong.
- **Verify from a file, not a quoted one-liner.** Shell quoting mangled three of the controller's own measurements in Plan A.

---

## Deployment gates

Two. Everything else is local against `npm run dev`.

| | After | What runs |
|---|---|---|
| **Gate 1** | Task 11 (end of A.5b) | Build, deploy to `small-cp-dev`, full `chat-block-check.mjs`. Confirms the visual system changed nothing functional. |
| **Gate 2** | Task 15 (end of A.5c) | Build, deploy, full e2e, then capture the **30 golden keyframes** and take them to the human for approval. **This is the completion gate for A.5.** |

The documented dev build procedure, copied from [coaching.md](../../features/coaching.md) — do not improvise it, and never echo the licence key:

```bash
cd packages/web
export VITE_COACHING_DEV=true VITE_BYOC_DEV=true
export VITE_TLDRAW_LICENSE_KEY=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('../../.env','utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);")
npm run build -- --outDir dist-dev
npx wrangler deploy --config wrangler.dev.jsonc
```

Wait ~20 s after the deploy returns; a new version serves 15-20 s later and probing early looks exactly like the edit not taking.

## File Structure

| File | Responsibility | This plan |
|---|---|---|
| `packages/web/src/animation-scene.js` | schema, validation, pure evaluator | modify — roles/states, timing resolution, sound field, `set_values` gate |
| `packages/web/src/scene-vocab.js` | **new** — the frozen enums every other module agrees on: `ROLES`, `STATES`, `TYPE_ROLES`, `TIMING`, `SOUNDS`, `SPACE`, `GEOMETRY`. No imports | create |
| `packages/web/src/scene-style.js` | **new** — role→token, typography, state modulation. Imports only `scene-vocab.js` | create |
| `packages/web/src/scene-style.test.mjs` | **new** | create |
| `packages/web/src/scene-legacy.js` | **new** — the pre-validation `color`→`role` adapter, with its deletion condition | create |
| `packages/web/src/scene-sound.js` | **new** — sound vocabulary, crossing calculation, Web Audio synthesis | create |
| `packages/web/src/scene-sound.test.mjs` | **new** — crossing and coalescing, no audio | create |
| `packages/web/src/AnimatedScene.jsx` | transport, pixels, sound triggering | modify throughout |
| `packages/web/src/AdaptiveCanvas.jsx` | canvas state | modify — non-snapshotting block update |
| `packages/web/src/index.css` | design tokens | modify — `--viz-*` roles, light and dark |
| `packages/web/src/demo-scenes.js` | the three demos | modify — migrate off `color` |
| `packages/web/src/reference-scenes.js` | **new** — the three A.5c scenes | create |
| `packages/web/src/LearningBlocks.jsx` | block registry | modify — register reference scenes |
| `packages/web/e2e/golden-shots.mjs` | **new** — 30-keyframe capture | create |

`scene-style.js` and `scene-sound.js` exist as plain `.js` deliberately: `node --test` cannot import `.jsx`, which is why ~100 lines of Plan A's renderer logic shipped with zero unit coverage. Every pure part of this pass lives where it can be tested.

---

# Phase A.5a — correctness debts

---

### Task 1: `set_values` is refused at the gate, not clamped in the renderer

**Files:**
- Modify: `packages/web/src/animation-scene.js`
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Produces: `validateScene` refuses a `set_values` whose target declares no `values`. The renderer clamp stays as a belt.

Plan A ruled a static cross-field check "impossible in principle" because values change over time. That was wrong: every payload is static JSON in the same scene. The live hole is narrower and worse — the length check is skipped entirely when the target has no authored `values`, which is exactly the desync its own comment says it prevents.

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/animation-scene.test.mjs`:

```js
test('set_values needs a target that already holds values', () => {
  const noValues = () => validateScene({
    id: 'empty', duration: 4,
    objects: [{ id: 'row', type: 'strip', initialState: { x: 0, y: 0, cell: 30 } }],
    timeline: [{ at: 0, action: 'set_values', target: 'row', duration: 2, value: [1, 2, 3] }],
  });
  assert.throws(noValues, /has no values to change/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL — nothing throws. Today the payload is accepted, twelve cells would draw, and `sizeOf` keeps the one-cell width it froze from the absent authored values, so the frame and the region hit-test disagree.

- [ ] **Step 3: Refuse it**

In the `set_values` block of `validateScene`, replace the `if (authored)` guard so an absent `values` is refused rather than skipped:

```js
      const authored = byId.get(event.target)?.initialState.values;
      if (!authored) throw new Error(`Timeline event at ${event.at}s: "${event.target}" has no values to change`);
      if (event.value.length !== authored.length) {
        throw new Error(`Timeline event at ${event.at}s: set_values sends ${event.value.length} values to "${event.target}", which holds ${authored.length}`);
      }
```

- [ ] **Step 4: Run the full suite**

Run: `make test-unit`
Expected: PASS. The shipped scene and all three demos author `values` on every `set_values` target — confirm that by reading, and say so in your report.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/animation-scene.test.mjs
git commit -m 'fix(learn): a set_values target must already hold values'
```

---

### Task 2: Scrubbing commits through a non-snapshotting path

**Files:**
- Modify: `packages/web/src/AdaptiveCanvas.jsx`
- Modify: `packages/web/src/LearningBlocks.jsx` — the prop crosses this file twice
- Modify: `packages/web/src/AnimatedScene.jsx`
- Test: `packages/web/e2e/chat-block-check.mjs` (extend the existing scrub check)

**The exact path the prop travels** — verified against the source, not assumed. Anchor on these call sites by text; the line numbers will drift.

```
AdaptiveCanvas.jsx   const changeBlockQuietly = …                     define it
AdaptiveCanvas.jsx   <LessonBlockCard … onChange={changeBlock} …>     pass onChangeQuiet
AdaptiveCanvas.jsx   function LessonBlockCard({ …, onChange, … })     accept it   <- LessonBlockCard lives HERE
AdaptiveCanvas.jsx     <LearningBlockBody … onChange={onChange} …>    forward it
LearningBlocks.jsx   LearningBlockBody({ block, onChange, … })        accept it
LearningBlocks.jsx     <AnimationBody … onChange={onChange} …>        forward it  <- an extra hop
LearningBlocks.jsx   function AnimationBody({ block, onChange, … })   accept it
LearningBlocks.jsx     <AnimatedScene block={block} onChange={…} …>   forward it
AnimatedScene.jsx    AnimatedScene({ block, onChange, … })            accept and use it
```

Nine touch points across three files. Do not rename or repurpose `onChange` anywhere on that path — it still carries every real edit.

**Interfaces:**
- Produces: `AdaptiveCanvas` exposes a quiet block update that does not push an undo snapshot. `AnimatedScene` commits `block.time` synchronously through it; the 150 ms debounce is removed.

Plan A debounced the time commit so scrubbing would stop pushing a full canvas snapshot per tick onto the 100-entry undo ring. It works and leaves a 150 ms window where `block.time` disagrees with the scrubber. `moveBlock` already demonstrates the correct shape — it updates without `snapshot()` because dragging is continuous.

- [ ] **Step 1: Add the quiet path**

In `AdaptiveCanvas.jsx`, beside `changeBlock`:

```js
  // A continuous gesture must not snapshot: one scrub drag would evict the whole
  // 100-entry undo ring. Same reasoning as moveBlock, which has never snapshotted.
  const changeBlockQuietly = updated => setBlocks(previous => previous.map(block => block.id === updated.id ? updated : block));
```

Thread it to the block body the same way `onChange` is threaded, as a second prop — name it `onChangeQuiet`. Find every place `onChange` is passed to a block body and pass `onChangeQuiet` alongside; do not rename or repurpose `onChange`.

- [ ] **Step 2: Use it for the time commit only**

In `AnimatedScene.jsx`, replace the debounced settle effect with a synchronous commit through the quiet path:

```js
  // The paused moment is what a question refers to, so it is committed on every
  // scrub. It goes through the quiet path because scrubbing is a view change and
  // must not be able to destroy the learner's undo history.
  useEffect(() => {
    if (playing || !scene) return;
    (onChangeQuiet || onChange)({ ...latest.current, time: Number(time.toFixed(2)) });
  }, [playing, time]);
```

Keep the `latest` ref. Keep every other `onChange` call exactly as it is — selection, region marking and clearing are real edits and must still snapshot.

- [ ] **Step 3: Verify locally**

Run: `make test-unit` → PASS. Run `npm run build` → succeeds.

Run `npm run dev`, insert an Animation block, then: draw some ink, drop a sticky, drag the scrubber end to end several times, then press Ctrl+Z repeatedly. The ink and sticky must come back. Before this task they survive because of the debounce; after it they survive because scrubbing no longer snapshots at all. Confirm the selection line follows the scrubber with no perceptible lag.

- [ ] **Step 4: Extend the e2e check**

In `packages/web/e2e/chat-block-check.mjs`, extend `a scrubbed moment is what a question refers to` with an immediate read — the debounce is gone, so no settling time is needed:

```js
  await node.locator('input[aria-label="Animation time"]').fill('5');
  await node.locator('[data-animation-selection]').getByText('5.0s', { exact: false }).waitFor({ timeout: 1500 });
```

The short timeout is the point: it would fail against the debounced version.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/AdaptiveCanvas.jsx packages/web/src/LearningBlocks.jsx packages/web/src/AnimatedScene.jsx packages/web/e2e/chat-block-check.mjs
git commit -m 'fix(learn): scrubbing commits through a path that does not snapshot undo'
```

---

# Phase A.5b — the visual system

---

### Task 3: The `--viz-*` token palette, light and dark

**Files:**
- Modify: `packages/web/src/index.css`

**Interfaces:**
- Produces: ten `--viz-<role>` custom properties plus `--viz-surface`, defined in `@theme` and overridden in `.dark`. No JavaScript changes.

This task is CSS only and renders nothing new. It defines the palette every later task resolves against.

- [ ] **Step 1: Add the roles to `:root` — NOT to `@theme`**

**Tailwind v4 prunes unused `@theme` tokens out of the production build.** Verified by experiment: a token declared in `@theme` and referenced nowhere is absent from the compiled CSS. Nothing reads `--viz-*` until Task 7, so putting them in `@theme` would silently drop the entire light-mode palette from production while dev looked fine — and `.dark` would survive, because it is plain CSS and never scanned for pruning. The failure would first appear at Task 7 as a canvas with no colour in light mode only.

Use plain `:root`, matching the `--tok-*` precedent already in this file for exactly the same reason.

```css
  /* Scene roles. A scene names meaning; these decide the pixel. Reusing the app's
     own accent/warn/success/danger where the meaning matches, so a lesson and its
     chrome are visibly the same product. */
  --viz-neutral: #787774;
  --viz-input: #2383e2;
  --viz-output: #448361;
  --viz-prediction: #9065b0;
  --viz-observed: #37352f;
  --viz-learner: #d9730d;
  --viz-tutor: #2383e2;
  --viz-code: #787774;
  --viz-warning: #d9730d;
  --viz-success: #448361;
  --viz-surface: #fbfbfa;
```

- [ ] **Step 2: Override every one in `.dark`**

In the existing `.dark` block. Each value must clear 4.5:1 against `--viz-surface` for text and 3:1 for a stroke on a fill:

```css
  --viz-neutral: #979797;
  --viz-input: #5ba3f5;
  --viz-output: #6fbf8e;
  --viz-prediction: #b79ae3;
  --viz-observed: #d4d4d4;
  --viz-learner: #e8a15c;
  --viz-tutor: #5ba3f5;
  --viz-code: #979797;
  --viz-warning: #e8a15c;
  --viz-success: #6fbf8e;
  --viz-surface: #1f1f1f;
```

- [ ] **Step 3: Check the contrast for real, against the right threshold**

Role colours and text colours have different jobs, and holding roles to a text threshold would muddy the whole palette to make every role usable as body copy — which no scene needs.

| what | threshold | against |
|---|---|---|
| a role used as a stroke, fill or semantic accent | **≥ 3:1** | `--viz-surface` |
| normal text | **≥ 4.5:1** | `--viz-surface` — and it uses the **ink** tokens, not a role |
| coloured text, if a scene ever needs it | ≥ 4.5:1 | a dedicated accessible role-text token, added only when something actually requires one |

Do not eyeball this. Write a script **to a file** — not a quoted one-liner; shell quoting produced three false readings in Plan A — that parses both blocks out of `index.css` and computes WCAG contrast for every role against its theme's surface. Report the table. Anything below 3:1 is adjusted here, not worked around later.

- [ ] **Step 4: Verify nothing moved**

Run: `make test-unit` → PASS. `npm run build` → succeeds. `npm run dev`: the canvas is visually unchanged, because nothing reads these yet.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/index.css
git commit -m 'feat(learn): a scene role palette in both themes'
```

---

### Task 4: `scene-vocab.js` and `scene-style.js` — the vocabulary and the pure style resolver

**Files:**
- Create: `packages/web/src/scene-vocab.js`, `packages/web/src/scene-style.js`, `packages/web/src/scene-style.test.mjs`

This task creates **both** modules, because the vocabulary has no other owner and every task after this one imports from it.

**Interfaces — `scene-vocab.js`, zero imports, everything frozen:**
  - `ROLES` — the ten role names
  - `STATES` — the six state names
  - `TYPE_ROLES` — the seven typography roles
  - `SPACE` — `[4, 8, 12, 16, 24, 32, 48, 64, 96]`
  - `GEOMETRY` — component dimensions on a 4px baseline, e.g. `{ nodeMinWidth: 176, nodeHeight: 56, barWidth: 28, barHeight: 120, chipHeight: 32, cellPitch: 24 }`
  - `TIMING` — `{ instant: 0, fast: 0.18, normal: 0.35, slow: 0.7, explain: 1.1 }`
  - `SOUNDS` — the fifteen sound names

**Interfaces — `scene-style.js`, importing only `scene-vocab.js`:**
  - `roleVar(role) -> 'var(--viz-input)'`
  - `tintOf(role, percent) -> 'color-mix(in srgb, var(--viz-input) 12%, transparent)'`
  - `textStyle(typographyRole) -> { fontSize, fontWeight, fill, fontFamily? }`
  - `shapeStyle(role, state) -> { fill, stroke, strokeWidth }`

Every function here is pure in its arguments. That is what makes them testable, and their absence is why ~100 lines of Plan A's renderer logic shipped with no unit coverage at all.

The test file imports the vocabulary from `scene-vocab.js` and the functions from `scene-style.js`.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/scene-style.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, STATES, TIMING, SPACE } from './scene-vocab.js';
import { roleVar, tintOf, textStyle, shapeStyle } from './scene-style.js';

test('a role resolves to a token reference, never to a colour', () => {
  for (const role of ROLES) {
    assert.equal(roleVar(role), `var(--viz-${role})`);
    assert.doesNotMatch(roleVar(role), /#|rgb|hsl/, `${role} leaked a literal colour`);
  }
  assert.equal(roleVar('nonsense'), 'var(--viz-neutral)', 'an unknown role falls back rather than breaking the frame');
});

test('a tint is a colour-mix of the role, so it follows the theme', () => {
  assert.equal(tintOf('input', 12), 'color-mix(in srgb, var(--viz-input) 12%, transparent)');
  assert.equal(tintOf('input', 0), 'transparent');
  assert.equal(tintOf('input', 100), 'var(--viz-input)', 'a full tint is the token itself');
});

test('state modulates weight and fill, never hue', () => {
  const plain = shapeStyle('prediction', {});
  const picked = shapeStyle('prediction', { selected: true });
  assert.equal(plain.stroke, picked.stroke, 'selection must not change the colour of the thing selected');
  assert.ok(picked.strokeWidth > plain.strokeWidth, 'selection reads as weight');
  assert.notEqual(plain.fill, picked.fill, 'and as fill strength');
});

test('every state composes with every role without throwing', () => {
  for (const role of ROLES) for (const state of STATES) {
    const style = shapeStyle(role, { [state]: true });
    assert.ok(style.fill && style.stroke, `${role} + ${state} produced nothing`);
  }
});

test('the scales are frozen, so nobody edits the system by accident', () => {
  for (const frozen of [ROLES, STATES, SPACE]) assert.throws(() => frozen.push('x'), TypeError);
  assert.deepEqual(SPACE, [4, 8, 12, 16, 24, 32, 48, 64, 96]);
  assert.equal(TIMING.slow, 0.7);
});

test('typography is a role, not a size', () => {
  assert.ok(textStyle('caption').fontSize < textStyle('heading').fontSize);
  assert.match(textStyle('code').fontFamily, /mono/i);
});

// Task 3 defined the tokens by hand in two separate CSS blocks. Nothing would
// catch a role added to one and not the other, and the failure is invisible
// until a learner toggles appearance. This closes that by reading the stylesheet.
test('every role has a token in both themes', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const block = name => {
    const start = css.indexOf(name);
    assert.ok(start > -1, `no ${name} block in index.css`);
    return css.slice(start, css.indexOf('}', start));
  };
  // the light roles live in their own :root block, after the --tok-* one
  const light = css.slice(css.indexOf('--viz-neutral'));
  const dark = block('.dark {');
  for (const role of ROLES) {
    assert.match(light, new RegExp(`--viz-${role}\\s*:`), `${role} has no light token`);
    assert.match(dark, new RegExp(`--viz-${role}\\s*:`), `${role} has no dark token`);
  }
  assert.match(light, /--viz-surface\s*:/);
  assert.match(dark, /--viz-surface\s*:/);
});
```

The test file needs `import { readFileSync } from 'node:fs';` for that last case. It is the only impure thing in the file and it earns its place: it is the one check that can catch a hand-maintained pair drifting apart.

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/web && node --test src/scene-style.test.mjs`
Expected: FAIL — `Cannot find module './scene-style.js'`.

- [ ] **Step 3: Write the module**

Create `packages/web/src/scene-style.js`. It imports nothing. `tintOf` must special-case 0 and 100 exactly as the tests require. `shapeStyle` composes role and state so that state never appears in the returned `stroke` colour.

- [ ] **Step 4: Run to confirm it passes**

Run: `cd packages/web && node --test src/scene-style.test.mjs` → PASS, then `make test-unit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/scene-style.js packages/web/src/scene-style.test.mjs
git commit -m 'feat(learn): a pure style resolver for roles, states, typography and spacing'
```

---

### Task 5: Roles and states in the schema

**Files:**
- Modify: `packages/web/src/animation-scene.js`
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Consumes: `ROLES`, `STATES` from `scene-vocab.js`.
- Produces: `initialState.role` (enum, default `neutral`); `initialState.color` removed; evaluated objects carry `role` and the six state booleans.

- [ ] **Step 1: Write the failing test**

```js
test('an object carries a role, and a colour is no longer a thing a scene can say', () => {
  const built = validateScene({
    id: 'roled', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: { x: 0, y: 0, role: 'prediction' } }],
    timeline: [],
  });
  assert.equal(getSceneState(built, 1).objects[0].role, 'prediction');
  assert.throws(() => validateScene({
    id: 'hexed', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: { x: 0, y: 0, color: '#2383e2' } }],
    timeline: [],
  }), /color/, 'a scene may not name a colour');
});

test('a role defaults to neutral and never to undefined', () => {
  const built = validateScene({ id: 'bare', duration: 2, objects: [{ id: 'a', type: 'box' }], timeline: [] });
  assert.equal(getSceneState(built, 1).objects[0].role, 'neutral');
});
```

- [ ] **Step 2: Run to confirm both fail**

- [ ] **Step 3: Change the schema**

Replace `color: z.string().max(24).optional()` with `role: z.enum(ROLES).default('neutral')`.

An authored `color` must be a loud error rather than a silently stripped one — zod drops unknown keys by default, and a silently ignored colour is exactly the failure this model exists to prevent. **Do not reach for `.strict()`.** Verified against the installed zod 4.5.4: `.strict()` rejects *every* unrecognised key, so it would also start refusing unrelated legacy fields on persisted blocks. Detect the one field explicitly, before parsing:

```js
  for (const object of raw.objects ?? []) {
    if (object?.initialState && 'color' in object.initialState) {
      throw new Error(`Object "${object.id}": a scene names a role, not a colour`);
    }
  }
```

Task 6 puts the legacy adapter in front of this, so a *known* legacy colour is translated before it ever reaches the check and only an unrecognised one surfaces here.

Carry `role` into the evaluated object literal beside `semanticId`.

- [ ] **Step 4: Run to confirm both pass**, then `make test-unit`. Expect failures in the shipped scene and demos — they author `color`. **Do not fix them here**; Task 6 is the adapter. Record which fail.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/animation-scene.js packages/web/src/animation-scene.test.mjs
git commit -m 'feat(learn): a scene names a role, not a colour'
```

---

### Task 6: The legacy adapter, before the gate

**Files:**
- Create: `packages/web/src/scene-legacy.js`
- Modify: `packages/web/src/animation-scene.js` (call it from `validateScene`'s entry), `packages/web/src/demo-scenes.js`, `packages/web/src/LearningBlocks.jsx`
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Produces: `adaptLegacyScene(raw) -> raw'` — maps a closed table of known hex values to roles. Runs **before** `validateScene` parses, or zod strips `color` before the adapter can see it.

- [ ] **Step 1: Write the failing test**

```js
test('a scene authored with the old hex colours still loads, through the adapter', () => {
  const built = validateScene({
    id: 'legacy', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: { x: 0, y: 0, color: '#2383e2' } }],
    timeline: [],
  });
  assert.equal(getSceneState(built, 1).objects[0].role, 'input');
});

test('a hex nobody recognises fails loudly rather than guessing', () => {
  assert.throws(() => validateScene({
    id: 'unknown', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: { x: 0, y: 0, color: '#123456' } }],
    timeline: [],
  }), /not a known legacy colour/);
});
```

Note this **contradicts** Task 5's second assertion, which required any `color` to throw. Update that assertion in the same commit: after the adapter, a *known* colour is adapted and an *unknown* one throws. Say in your report that you changed it and why.

- [ ] **Step 2: Run to confirm both fail**

- [ ] **Step 3: Write the adapter**

Create `scene-legacy.js` with the closed table — the values actually in the repo today, which you must read from `LearningBlocks.jsx` and `demo-scenes.js` rather than assume — mapping each to a role. Unknown values throw. Head the file with its deletion condition:

```js
// TEMPORARY. Delete once no shipped scene, no persisted canvas block and no test
// fixture carries a `color` field. Plan B's first task checks this condition and
// removes this file if it holds.
```

Call it at the top of `validateScene`, before `safeParse`.

- [ ] **Step 4: Run to confirm both pass**, then `make test-unit`. The shipped scene and demos now load unchanged.

- [ ] **Step 5: Migrate the four scenes off `color` anyway**

The adapter exists for persisted learner state, not as a licence for our own scenes to stay legacy. Replace every `color:` in `demo-scenes.js` and the `token-journey` scene in `LearningBlocks.jsx` with the equivalent `role:`. Re-run `make test-unit`.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/scene-legacy.js packages/web/src/animation-scene.js packages/web/src/animation-scene.test.mjs packages/web/src/demo-scenes.js packages/web/src/LearningBlocks.jsx
git commit -m 'feat(learn): adapt legacy scene colours ahead of the gate, and migrate our own scenes off them'
```

---

### Task 7: The renderer resolves roles, and `tint()` dies

**Files:**
- Modify: `packages/web/src/AnimatedScene.jsx`

**Interfaces:**
- Consumes: `roleVar`, `tintOf`, `shapeStyle` from `scene-style.js`.
- Produces: no hardcoded colour anywhere in the renderer; dark mode works.

This is the largest single task in the plan. `tint()` is string concatenation onto six-digit hex, which is precisely why a token could never be used.

- [ ] **Step 1: Count what you are removing**

Run and record: `grep -c "#[0-9a-fA-F]\{6\}" src/AnimatedScene.jsx` and `grep -n "tint(" src/AnimatedScene.jsx`. Both counts go to zero by the end of this task except inside comments. Report the before and after.

- [ ] **Step 2: Replace the colour source**

Delete `COLORS` and `tint`. Every `fill=`/`stroke=` carrying a colour becomes a `style={{ fill: … }}` / `style={{ stroke: … }}` property.

**Why `style`, accurately:** `fill="var(--c)"` does in fact resolve in current browsers — verified in Chromium, computed `rgb(255, 0, 0)`. The reason to use `style` is not that attributes are broken; it is that a presentation attribute is the weakest source in the cascade, so anything setting `fill` in CSS silently wins over it, and `style` keeps one obvious place where a colour comes from. `color-mix()` was also verified working through `style`, computing `color(srgb 1 0 0 / 0.3)`.

`#37352f`, `#787774`, `#9b9a97` are the light values of `--color-ink`, `--color-ink-2`, `--color-ink-3`; those are a 1:1 swap to `var(--color-ink*)`. The canvas background `bg-[#fbfbfa]` becomes `style={{ background: 'var(--viz-surface)' }}`. The shadow `floodColor` and the KaTeX `color` become tokens too.

- [ ] **Step 3: Keep the Motion invariant**

Plan A established that Motion may spring a value only while that value is discrete, and split the grid fill accordingly. Preserve that split exactly. A `color-mix` string whose percentage varies per frame is continuous and must be a plain attribute, never inside `animate`.

- [ ] **Step 4: Verify light and dark, locally**

`make test-unit` → PASS. `npm run build` → succeeds.

`npm run dev`: insert each of the four scenes. In light mode, compare against `e2e/shots/token-journey-baseline.png` — it will **not** be byte-identical, because colours now come from tokens; the requirement is that it reads as the same scene with no regressions in legibility. Then switch the app to dark via Settings → Appearance and confirm every scene is legible, nothing is invisible, and no fill stayed light.

Capture one light and one dark screenshot of `token-journey` and put both in your report.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/AnimatedScene.jsx
git commit -m 'feat(learn): the renderer resolves roles through tokens, in both themes'
```

---

### Task 8: Typography scale

**Files:**
- Modify: `packages/web/src/animation-scene.js` (a `text` object names a typography role), `packages/web/src/AnimatedScene.jsx`
- Test: `packages/web/src/animation-scene.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('a text object names a typography role and never a size', () => {
  const built = validateScene({
    id: 'typed', duration: 2,
    objects: [
      { id: 'h', type: 'text', initialState: { x: 0, y: 0, text: 'Attention', typography: 'heading' } },
      { id: 'b', type: 'text', initialState: { x: 0, y: 40, text: 'a caption' } },
    ],
    timeline: [],
  });
  const [heading, plain] = getSceneState(built, 1).objects;
  assert.equal(heading.typography, 'heading');
  assert.equal(plain.typography, 'body', 'the default is body, never undefined');
  assert.throws(() => validateScene({
    id: 'sized', duration: 2,
    objects: [{ id: 'h', type: 'text', initialState: { x: 0, y: 0, text: 'x', typography: 'enormous' } }],
    timeline: [],
  }), /typography/);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL — `typography` is not in the schema, so zod strips it and the first assertion reads `undefined`.

- [ ] **Step 3: Add the field and carry it through**

`typography: z.enum(TYPE_ROLES).default('body')` on `initialState`, copied into the evaluated object beside `role`.
- [ ] **Step 4: Spend it in the renderer** — every hardcoded `fontSize`/`fontWeight` in `AnimatedScene.jsx` comes from `textStyle()`. Record the `grep -c "fontSize=" src/AnimatedScene.jsx` count before and after.
- [ ] **Step 5: Verify locally** — `make test-unit`, build, and a `npm run dev` pass over all four scenes confirming hierarchy reads.
- [ ] **Step 6: Commit** — `feat(learn): text names a typography role instead of a size`

---

### Task 9: Spacing, geometry and component styling

**Files:**
- Modify: `packages/web/src/animation-scene.js` (`sizeOf` constants), `packages/web/src/AnimatedScene.jsx`
- Test: `packages/web/src/animation-scene.test.mjs`

**Two different rules, and conflating them makes things uglier to pass a test.** A spacing scale governs the space *between* and *around* things. A component's own dimensions are a different question — a node may legitimately be 176px wide because that is what its content needs, and forcing it to 160 or 192 to sit on the scale would be design by test suite.

| what | rule |
|---|---|
| gaps, padding, margins, offsets, corner radii, stroke weights | a member of `SPACE` |
| component dimensions — node width and height, bar width and height, cell pitch, chip height | a member of `GEOMETRY`, each aligned to a **4px baseline**, derived from content where content decides it |

- [ ] **Step 1: Write the failing test**

```js
import { SPACE, GEOMETRY } from './scene-vocab.js';

test('spacing sits on the scale and geometry sits on a 4px baseline', () => {
  for (const [name, value] of Object.entries(GEOMETRY)) {
    assert.equal(value % 4, 0, `GEOMETRY.${name} is ${value}, which is off the 4px baseline`);
    assert.ok(value > 0, `GEOMETRY.${name} must be positive`);
  }
  assert.deepEqual(SPACE, [4, 8, 12, 16, 24, 32, 48, 64, 96]);
  for (const value of SPACE) assert.equal(value % 4, 0, `the scale itself must sit on the baseline`);
});

test('the renderer takes its geometry from the vocabulary, not from loose constants', () => {
  assert.equal(BAR.w, GEOMETRY.barWidth);
  assert.equal(BAR.h, GEOMETRY.barHeight);
  assert.equal(CHIP.h, GEOMETRY.chipHeight);
  assert.ok(SPACE.includes(CHIP.gap), 'a gap between chips is spacing, so it is on the scale');
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/web && node --test src/animation-scene.test.mjs`
Expected: FAIL — `GEOMETRY` does not exist yet, and today `BAR.w` is 30 and `CHIP.pad` is 18, neither on a 4px baseline.

Define `GEOMETRY` in `scene-vocab.js` with values chosen for how they look, then aligned to the baseline — for example `{ nodeMinWidth: 176, nodeHeight: 56, barWidth: 28, barHeight: 120, chipHeight: 32, cellPitch: 24 }`. `CHIP.char` is a text-measurement constant, not geometry; leave it out of both.
- [ ] **Step 3: Move every constant onto the scale.** `BAR`, `CHIP`, `NODE`, `GAP`, `PAD`, the default cell pitch, corner radii, stroke weights. `sizeOf` still derives size from content; only its constants change.
- [ ] **Step 4: Style each primitive once** — radii, stroke weights, fill strengths, shadow, bar gap, chip shape. One considered default per primitive, all from the scale and `shapeStyle`.
- [ ] **Step 5: Verify locally** — all four scenes, both themes. Layouts will shift; confirm nothing collides and every label still fits. Screenshot each in your report.
- [ ] **Step 6: Commit** — `feat(learn): every default geometry sits on one spacing scale`

---

### Task 10: Timing names, resolved at the gate

**Files:**
- Modify: `packages/web/src/animation-scene.js`
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Produces: `event.duration` accepts a `TIMING` name or a number; `validateScene` resolves a name to seconds so `getSceneState` receives only numbers.

- [ ] **Step 1: Write the failing test**

```js
test('a timing name is resolved before the evaluator ever sees it', () => {
  const built = validateScene({
    id: 'timed', duration: 4,
    objects: [{ id: 'a', type: 'box', initialState: { x: 0, y: 0, opacity: 0 } }],
    timeline: [{ at: 0, action: 'appear', target: 'a', duration: 'slow' }],
  });
  assert.equal(built.timeline[0].duration, 0.7, 'the scene that reaches the evaluator carries seconds');
  assert.equal(typeof built.timeline[0].duration, 'number');
  assert.throws(() => validateScene({
    id: 'bad', duration: 4,
    objects: [{ id: 'a', type: 'box' }],
    timeline: [{ at: 0, action: 'appear', target: 'a', duration: 'leisurely' }],
  }), /not a timing/);
});
```

- [ ] **Step 2: Run to confirm it fails.**
- [ ] **Step 3: Widen the field and resolve it** — `duration: z.union([z.number().min(0).max(60), z.enum(Object.keys(TIMING))])`, resolved to a number in `validateScene` **before** the runs-past-duration check, which compares numbers.
- [ ] **Step 4: Run the suite** — `getSceneState` is untouched; every existing test must pass unmodified. Confirm that explicitly.
- [ ] **Step 5: Commit** — `feat(learn): timing names resolve at the gate so the evaluator only sees seconds`

---

### Task 11: Sound — vocabulary, crossing, synthesis

**Files:**
- Create: `packages/web/src/scene-sound.js`, `packages/web/src/scene-sound.test.mjs`
- Modify: `packages/web/src/animation-scene.js` (the `sound` field), `packages/web/src/AnimatedScene.jsx` (triggering, mute control)
- Test: `packages/web/src/animation-scene.test.mjs`

**Interfaces:**
- Produces:
  - `SOUNDS` — the fifteen names, from `scene-vocab.js`
  - `crossed(timeline, from, to) -> [event…]` — pure, no audio
  - `coalesce(events, window = 0.08) -> [event…]` — **buckets by time, then picks a winner per bucket.** Not one winner overall
  - `play(name, volume)` — Web Audio; the only impure function, and the only one not unit-tested

**The coalescing contract, stated because getting it wrong is silent.** The window collapses sounds that land *together*, so thirty cells appearing read as one event. It must not collapse sounds that are seconds apart: a dropped frame crossing 1 s, 2 s and 3 s produces **three** sounds, not one. Group into ~80 ms buckets, pick the highest tier within each bucket, earliest `at` breaking ties inside a tier.

- [ ] **Step 1: Write the failing tests for the pure half**

```js
test('only events crossed going forward are sounded', () => {
  const line = [{ at: 1, sound: 'soft_pop' }, { at: 2, sound: 'connect' }, { at: 3, sound: 'reveal' }];
  assert.deepEqual(crossed(line, 0.5, 2.5).map(e => e.sound), ['soft_pop', 'connect']);
  assert.deepEqual(crossed(line, 2.5, 0.5), [], 'a backward seek is silent');
  assert.deepEqual(crossed(line, 1, 1), [], 'standing still is silent');
});

test('an event at zero sounds on a replay, and is not swallowed by the boundary', () => {
  const line = [{ at: 0, sound: 'soft_pop' }, { at: 1, sound: 'connect' }];
  // A naive `at > from` never fires an event at 0, because playback starts there.
  assert.deepEqual(crossed(line, 0, 0.5, { start: true }).map(e => e.sound), ['soft_pop'], 'starting playback includes the boundary');
  assert.deepEqual(crossed(line, 0, 0.5).map(e => e.sound), [], 'advancing past it again does not repeat it');
});

test('coalescing collapses what lands together and keeps what does not', () => {
  const together = [{ at: 1.0, sound: 'soft_pop' }, { at: 1.03, sound: 'connect' }];
  assert.deepEqual(coalesce(together).map(e => e.sound), ['connect'], 'one bucket, higher tier wins');

  const apart = [{ at: 1.0, sound: 'soft_pop' }, { at: 1.5, sound: 'reveal' }, { at: 2.1, sound: 'tick' }];
  assert.deepEqual(coalesce(apart).map(e => e.sound), ['soft_pop', 'reveal', 'tick'], 'three buckets, three sounds - a dropped frame must not swallow two of them');

  const sameTier = [{ at: 1.0, sound: 'connect' }, { at: 1.02, sound: 'split' }];
  assert.deepEqual(coalesce(sameTier).map(e => e.sound), ['connect'], 'same tier, earliest wins');

  assert.deepEqual(coalesce([]), []);
});
```

- [ ] **Step 2: Run to confirm they fail.**
- [ ] **Step 3: Write the pure half** — `crossed`, `coalesce`, and the three tiers from the spec. `SOUNDS` lives in `scene-vocab.js`.
- [ ] **Step 4: Run to confirm they pass.**
- [ ] **Step 5: Add the schema field** — `sound: z.enum(SOUNDS).optional()` on `eventSchema`, with a test that an unknown name is refused. **`getSceneState` must not read it** — assert that the evaluated state contains no sound field.
- [ ] **Step 6: Write the synthesis** — Web Audio, ~40 lines, one `AudioContext` created or resumed **only on a user gesture**. Play is a sufficient gesture. No files, no new dependency.

- [ ] **Step 7: Give the preference one owner**

"Global mute" owned by each `AnimatedScene` is not global — three scenes on a board would each have their own. The preference belongs to the learner, not to a block:

```
learner preference (persisted once)
        ↓
   read by every AnimatedScene
```

First **look for an existing preference store** in `packages/web/src` — the app already persists an appearance setting, so there may be somewhere this belongs. Report what you found. If there is one, use it. If there is not, create the smallest possible shared module: a `localStorage`-backed value plus a subscribe hook, no dependency, no context provider.

Scene JSON stays free of this entirely. A scene says `{ "sound": "reveal" }` and never knows whether anyone can hear it.

- [ ] **Step 8: Trigger it from the transport** — in the rAF loop only, never on a scrub. Add a mute toggle to the transport row beside Play, reading and writing the shared preference, defaulting to **muted** so nobody is ambushed.
- [ ] **Step 9: Verify locally** — `make test-unit`, build. Then by hand: play a scene with sound on and confirm beats land; scrub end to end and confirm **silence**; seek backward and confirm silence; press Replay and confirm sound resumes from the start. Confirm every scene still teaches with sound muted.
- [ ] **Step 10: Commit** — `feat(learn): a semantic sound channel outside the evaluator`

---

## Gate 1 — deploy and prove A.5b changed nothing functional

- [ ] `make test-unit` → PASS.
- [ ] Build and deploy per the documented procedure above. Wait ~20 s.

- [ ] **Close Task 2's outstanding manual gate — first, before anything else.** No browser was available when Task 2 landed, so its acceptance check was reasoned rather than observed, and its reviewer flagged that as the one open item. On the deployment: insert an Animation block, draw ink, drop a sticky, drag the scrubber end to end several times, then press Ctrl+Z repeatedly. **The ink and the sticky must come back.** Then confirm the selection line follows the scrubber with no perceptible lag, and that selecting an object and marking a region are both still undoable. If any of that fails, Task 2 reopens and Gate 1 does not pass.

- [ ] Full e2e: `cd packages/web && node e2e/chat-block-check.mjs`. Report the pass/fail count against Plan A's Gate B baseline of **66 checks, 65 pass** (the one failure being the flaky external Blender render). Three checks are known-flaky — two whiteboard, one external render — and none touches the animation engine. Any *new* failure is a regression from A.5b and blocks the gate.
- [ ] Report the dev page link.

---

# Phase A.5c — reference scenes and the golden review

---

### Task 12: Causal attention

**Files:**
- Create: `packages/web/src/reference-scenes.js`
- Modify: `packages/web/src/LearningBlocks.jsx`

Authored **only** through role, state, typography role, spacing, timing name and sound name. Passive — it becomes the interactive acceptance scene once Plan B lands the input axis.

Tokens → Q/K/V → QKᵀ → causal mask → softmax → ×V → output.

- [ ] **Step 1: Author the scene**, validating it against `validateScene` as you go.
- [ ] **Step 2: Register it** in `BLOCK_TYPES` as `Reference: attention`.
- [ ] **Step 3: Verify locally** in both themes, at 0/25/50/75/100%.
- [ ] **Step 4: Record what the vocabulary could not express.** This is the task's real output. If you reached for something the vocabularies do not have, write it down rather than working around it — **do not add scene-specific styling, layout arithmetic or animation**. A gap here is a finding about the vocabulary.
- [ ] **Step 5: Commit** — `feat(learn): the causal attention reference scene`

---

## Vocabulary checkpoint — after Task 12, before Task 13

The causal-attention scene is the first real content the vocabularies have ever met. Three demos written to show off primitives prove nothing; this does.

- [ ] Read Task 12's record of **what the vocabulary could not express**.
- [ ] Decide, and say which: the gap is real and the vocabulary changes now, or the gap is authoring preference and the vocabulary stands.
- [ ] **If it changes, it changes here** — before two more scenes are authored against a vocabulary known to be short. A deficiency that propagates through all three scenes costs three migrations instead of one, and every fix after that is made under pressure to not disturb work already done.
- [ ] Record the decision in the ledger either way. "No gaps found" is a result worth writing down, because it is the evidence the vocabulary is sufficient.

---

### Task 13: VLM patch flow

**Files:**
- Modify: `packages/web/src/reference-scenes.js`, `packages/web/src/LearningBlocks.jsx`

Image → patch grid → vision encoder → visual tokens → projector → LLM. Authored **only** through role, state, typography role, spacing, timing name and sound name.

The patch grid and the visual token row are both declared up front and animated with `appear`, `move` and `connect`. Object identity is fixed for the life of a scene, so nothing is synthesised mid-timeline — "patches detach" is pre-declared objects moving, not new objects appearing.

The `image` object needs a same-origin `src` plus a `w` and `h`, all three refused at the gate if missing. Use an asset that already exists in the repo rather than adding one.

- [ ] **Step 1: Author the scene**, validating against `validateScene` as you go — run it through the gate in a throwaway script before wiring it up, the way Plan A's demo scenes were checked.
- [ ] **Step 2: Register it** in `BLOCK_TYPES` as `Reference: VLM patches`, with a `sample()` returning `type: 'animation'`.
- [ ] **Step 3: Verify locally** — `make test-unit`, build, then `npm run dev` in both themes at 0/25/50/75/100% of its duration.
- [ ] **Step 4: Record what the vocabulary could not express.** If you reached for something the vocabularies do not have, write it down. **Do not add scene-specific styling, layout arithmetic or animation** — a gap here is a finding about the vocabulary, and working around it destroys the only signal this task produces.
- [ ] **Step 5: Commit**

```bash
git add packages/web/src/reference-scenes.js packages/web/src/LearningBlocks.jsx
git commit -m 'feat(learn): the VLM patch flow reference scene'
```

---

### Task 14: World-model branching futures

**Files:**
- Modify: `packages/web/src/reference-scenes.js`, `packages/web/src/LearningBlocks.jsx`

Observation + candidate actions → predicted futures → compare costs → selected action. Authored **only** through the vocabularies.

This is the scene the pinned bar axis exists for. Predicted and actual costs share one axis that does not move, so a plan the learner never touched cannot appear to get cheaper at the moment another turns out worse. Author `peak` explicitly; `role: 'prediction'` and `role: 'observed'` carry the distinction that used to be two arbitrary hex values.

- [ ] **Step 1: Author the scene**, validating against `validateScene` as you go.
- [ ] **Step 2: Register it** in `BLOCK_TYPES` as `Reference: branching futures`, with a `sample()` returning `type: 'animation'`.
- [ ] **Step 3: Verify locally** — `make test-unit`, build, then `npm run dev` in both themes at 0/25/50/75/100%. Confirm specifically that the unchanged bars hold their height across the reveal; that property is the reason this scene is in the plan.
- [ ] **Step 4: Record what the vocabulary could not express.** Same rule as Tasks 12 and 13 — write the gap down, never work around it.
- [ ] **Step 5: Commit**

```bash
git add packages/web/src/reference-scenes.js packages/web/src/LearningBlocks.jsx
git commit -m 'feat(learn): the world-model branching futures reference scene'
```

---

### Task 15: The golden keyframes

**Files:**
- Create: `packages/web/e2e/golden-shots.mjs`

**A baseline that is gitignored is not a baseline.** `e2e/shots` is ignored, so approved goldens go somewhere tracked: `packages/web/e2e/golden/`. Thirty PNGs is a few hundred kilobytes and visual regression baselines must travel with the code, or the next pass has nothing to compare against — exactly the position Plan A was in until a baseline was captured mid-flight.

Add `packages/web/e2e/golden/` as a tracked directory; it is not covered by the `e2e/shots` ignore.

- [ ] **Step 1: Write the capture script**

Modelled on the committed `e2e/baseline-shot.mjs`. For each of the three reference scenes, at 0/25/50/75/100% of its duration, in both themes: **30 images**, named `<scene>-<pct>-<theme>.png`, written to `e2e/golden/`. Switch theme through the app's own appearance control rather than by injecting a class, so the capture exercises the real path.

- [ ] **Step 2: Test the script locally** against `npm run dev`. It must produce exactly 30 files with no missing or zero-byte images. This step is local — the deployed run happens at Gate 2, which comes after this task.

- [ ] **Step 3: Review all thirty yourself first**

Against the spec's ten criteria: hierarchy, typography, spacing rhythm, edge clarity, contrast, label collisions, stroke consistency, motion pacing, focal point, and whether the concept is visually obvious. Write the review out. **Name every problem you see** — an honest list here is worth far more than a clean one, and a reviewer who finds nothing on thirty first-pass images has not looked.

- [ ] **Step 4: Fix what your own review found**, through the vocabularies only. If a fix needs something the vocabularies lack, that is a finding — record it, do not reach for a scene-level hack.

- [ ] **Step 5: Re-run the capture** and confirm the fixes landed.

- [ ] **Step 6: Commit the script only**

```bash
git add packages/web/e2e/golden-shots.mjs
git commit -m 'test(learn): capture the golden keyframes for the reference scenes'
```

The images are committed at Gate 2, after approval — an unapproved image is not a baseline either.

---

## Gate 2 — the completion gate

- [ ] `make test-unit` → PASS.
- [ ] Build, deploy, wait ~20 s.
- [ ] Full e2e → report against the 66/65 baseline.
- [ ] Capture the 30 golden keyframes.
- [ ] **Present all thirty to the human for approval, with your own review alongside.**

**A.5 does not pass because every token is used correctly.** It passes when these three scenes are approved as production-quality examples of the target learning experience. That approval is the human's and nobody else's. If it is withheld, the fixes go through the vocabularies and the gate runs again.

- [ ] **On approval, commit the thirty images to `packages/web/e2e/golden/`** — a tracked directory, not the ignored `e2e/shots`. They are the baseline every later pass compares against, and a baseline that does not survive a clean checkout is not one.

  ```bash
  git add packages/web/e2e/golden/
  git commit -m 'test(learn): the approved golden baseline for the reference scenes'
  ```

- [ ] Report the dev page link.

---

## Done when

- Both A.5a debts are closed, each with a test that failed first.
- No colour, class or free-form style exists anywhere in the scene schema. `grep` for `color:` in the schema returns nothing outside the legacy adapter.
- No hardcoded hex remains in `AnimatedScene.jsx` outside comments.
- Every scene renders coherently in both themes with no scene-level branching.
- `getSceneState` is unchanged in semantics: still pure, still total, still silent, and carries no colour. Plan A's suite passes with only role-for-colour edits.
- Every scene teaches identically with sound muted.
- The three reference scenes are authored entirely through the vocabularies, with any gap recorded rather than worked around.
- **The thirty golden keyframes are approved by the human.**

## Next

**Plan B — the input axis.** Its first task checks the legacy adapter's deletion condition and removes it if it holds, then carries the four non-visual findings Plan A's final review deferred: `focus_camera` mis-centring circles and strokes, the data types missing from the invisibility gate, the non-data render fall-through, and the unbounded `tokens` in the tutor prompt.
