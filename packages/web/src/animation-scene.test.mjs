import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromTemplate, getSceneState, RENDERED_TYPES, validateScene } from './animation-scene.js';
import { GEOMETRY, HEAT_DIVERGING, SPACE } from './scene-vocab.js';

const scene = () => validateScene({
  id: 'transformer-flow',
  duration: 8,
  objects: [
    { id: 'tokens', type: 'box', semanticId: 'token-ids', initialState: { label: 'Token IDs', x: 100, y: 150 } },
    { id: 'embedding', type: 'box', semanticId: 'embedding', initialState: { label: 'Embeddings', x: 350, y: 150, opacity: 0 } },
    { id: 'transformer', type: 'box', semanticId: 'transformer-block', initialState: { label: 'Transformer', x: 600, y: 150, opacity: 0 } },
  ],
  timeline: [
    { at: 0, action: 'appear', target: 'tokens' },
    { at: 1, action: 'appear', target: 'embedding', duration: 0.5 },
    { at: 1.3, action: 'connect', from: 'tokens', to: 'embedding', duration: 0.7 },
    { at: 3, action: 'highlight', target: 'embedding' },
    { at: 4, action: 'appear', target: 'transformer', duration: 0.5 },
    { at: 4.3, action: 'connect', from: 'embedding', to: 'transformer', duration: 0.7 },
  ],
});

test('the evaluator is deterministic', () => {
  const first = getSceneState(scene(), 4.35);
  const second = getSceneState(scene(), 4.35);
  assert.deepEqual(first, second);
});

test('objects appear when their event says so', () => {
  const built = scene();
  assert.equal(getSceneState(built, 0.5).objects.find(object => object.id === 'embedding').visible, false);
  assert.equal(getSceneState(built, 1.6).objects.find(object => object.id === 'embedding').visible, true);
  assert.equal(getSceneState(built, 1.25).objects.find(object => object.id === 'embedding').opacity > 0, true, 'fades in over its duration');
});

test('a connection draws over its duration and finishes exactly at 1', () => {
  const built = scene();
  const midway = getSceneState(built, 1.65).connections.find(connection => connection.key === 'tokens->embedding');
  assert.ok(midway.progress > 0 && midway.progress < 1, `partial path, got ${midway.progress}`);
  assert.equal(getSceneState(built, 2.0).connections.find(connection => connection.key === 'tokens->embedding').progress, 1);
});

test('highlight state follows the timeline', () => {
  const built = scene();
  assert.equal(getSceneState(built, 2.9).objects.find(object => object.id === 'embedding').highlighted, false);
  assert.equal(getSceneState(built, 3.1).objects.find(object => object.id === 'embedding').highlighted, true);
});

test('semantic ids survive into the evaluated state', () => {
  const state = getSceneState(scene(), 5);
  assert.deepEqual(state.objects.map(object => object.semanticId), ['token-ids', 'embedding', 'transformer-block']);
});

test('time is clamped to the scene', () => {
  const built = scene();
  assert.equal(getSceneState(built, -3).time, 0);
  assert.equal(getSceneState(built, 99).time, 8);
  assert.deepEqual(getSceneState(built, 99), getSceneState(built, 8), 'the end state is stable');
});

test('typing reveals text progressively without changing the label', () => {
  const built = validateScene({
    id: 'typed', duration: 4,
    objects: [{ id: 'note', type: 'text', initialState: { text: '', x: 0, y: 0 } }],
    timeline: [{ at: 1, action: 'type_text', target: 'note', value: 'an id is an index', duration: 2 }],
  });
  const half = getSceneState(built, 2);
  assert.equal(half.objects[0].label, 'an id is an index', 'the final text is known up front so layout never shifts');
  assert.ok(half.objects[0].textProgress > 0 && half.objects[0].textProgress < 1);
  assert.equal(getSceneState(built, 3.5).objects[0].textProgress, 1);
});

test('a move interpolates and settles on the target', () => {
  const built = validateScene({
    id: 'moved', duration: 3,
    objects: [{ id: 'dot', type: 'circle', initialState: { x: 0, y: 0 } }],
    timeline: [{ at: 0, action: 'move', target: 'dot', value: { x: 100, y: 50 }, duration: 2, easing: 'linear' }],
  });
  assert.deepEqual(getSceneState(built, 1).objects[0].x, 50);
  assert.deepEqual(getSceneState(built, 2.5).objects[0], { ...getSceneState(built, 2.5).objects[0], x: 100, y: 50 });
});

test('a scene referring to an unknown object is refused', () => {
  assert.throws(() => validateScene({
    id: 'broken', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: {} }],
    timeline: [{ at: 0, action: 'appear', target: 'ghost' }],
  }), /unknown object "ghost"/);
});

test('an event running past the scene is refused', () => {
  assert.throws(() => validateScene({
    id: 'overrun', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: {} }],
    timeline: [{ at: 1.8, action: 'appear', target: 'a', duration: 1 }],
  }), /runs past/);
});

test('duplicate object ids are refused', () => {
  assert.throws(() => validateScene({
    id: 'dupes', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: {} }, { id: 'a', type: 'box', initialState: {} }],
    timeline: [],
  }), /unique id/);
});

test('templates lay out nodes and wire them in order', () => {
  const built = fromTemplate({
    template: 'flow', id: 'vlm', title: 'Image to answer', duration: 8,
    nodes: [{ id: 'image', label: 'Image' }, { id: 'encoder', label: 'Vision encoder' }, { id: 'projector', label: 'Projector' }, { id: 'llm', label: 'LLM' }],
  });
  assert.equal(built.objects.length, 4);
  assert.ok(built.objects[1].initialState.y > built.objects[0].initialState.y, 'stacked vertically by the renderer, not the agent');
  assert.equal(built.timeline.filter(event => event.action === 'connect').length, 3);
  const end = getSceneState(built, built.duration);
  assert.equal(end.objects.every(object => object.visible), true, 'every node is on screen by the end');
  assert.equal(end.connections.length, 3);
});

test('the same engine renders a different subject with new json only', () => {
  const llm = fromTemplate({ template: 'flow', id: 'llm', duration: 8, nodes: [{ id: 'ids', label: 'Token IDs' }, { id: 'emb', label: 'Embeddings' }, { id: 'tr', label: 'Transformer' }, { id: 'logits', label: 'Logits' }] });
  const vlm = fromTemplate({ template: 'flow', id: 'vlm', duration: 8, nodes: [{ id: 'img', label: 'Image' }, { id: 'enc', label: 'Vision encoder' }, { id: 'proj', label: 'Projector' }, { id: 'llm', label: 'LLM' }] });
  assert.equal(getSceneState(llm, 8).objects.length, getSceneState(vlm, 8).objects.length);
  assert.notDeepEqual(llm.objects.map(object => object.initialState.label), vlm.objects.map(object => object.initialState.label));
});

test('a time that is not a number evaluates as the start', () => {
  const built = scene();
  assert.deepEqual(getSceneState(built, NaN), getSceneState(built, 0));
  assert.deepEqual(getSceneState(built, undefined), getSceneState(built, 0));
  assert.deepEqual(getSceneState(built, 'six'), getSceneState(built, 0));
  assert.deepEqual(getSceneState(built, Infinity), getSceneState(built, built.duration), 'a huge time still clamps to the end');
});

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
  assert.deepEqual(getSceneState(built, 0).objects[0].values, [null], 'an authored blank is still blank before its event starts');
  assert.deepEqual(getSceneState(built, 1).objects[0].values, [5]);
});

test('a change of quantity is a replacement, never a tween', () => {
  const built = validateScene({
    id: 'domains', duration: 6,
    objects: [{ id: 'row', type: 'strip', initialState: { values: [2.3, 1.1, -0.4] } }],
    timeline: [{ at: 2, action: 'replace_values', target: 'row', value: [0.72, 0.21, 0.07], duration: 1 }],
  });
  const at = time => getSceneState(built, time).objects[0].values;
  assert.deepEqual(at(1.9), [2.3, 1.1, -0.4], 'before the switch, the old quantity');
  assert.deepEqual(at(2.05), [0.72, 0.21, 0.07], 'at the switch, the new one');
  assert.deepEqual(at(5), [0.72, 0.21, 0.07]);
  // the whole point: no sampled moment may show a value from neither set
  const legal = new Set([2.3, 1.1, -0.4, 0.72, 0.21, 0.07]);
  for (let t = 0; t <= 6; t += 0.05) {
    for (const value of at(Number(t.toFixed(2)))) {
      assert.ok(legal.has(value), `t=${t.toFixed(2)} invented the value ${value}`);
    }
  }
});

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

test('an image needs a size it can be drawn at', () => {
  assert.throws(() => validateScene({
    id: 'unsized', duration: 4,
    objects: [{ id: 'photo', type: 'image', initialState: { x: 0, y: 0, src: '/favicon.svg' } }],
    timeline: [],
  }), /needs a width and height/);
  assert.throws(() => validateScene({
    id: 'halfsized', duration: 4,
    objects: [{ id: 'photo', type: 'image', initialState: { x: 0, y: 0, w: 40, src: '/favicon.svg' } }],
    timeline: [],
  }), /needs a width and height/);
});

test('an equation needs a size it can be drawn at', () => {
  assert.throws(() => validateScene({
    id: 'unsized', duration: 4,
    objects: [{ id: 'eq', type: 'equation', initialState: { x: 0, y: 0, text: 'x^2' } }],
    timeline: [],
  }), /an equation needs a width and height/);
  assert.throws(() => validateScene({
    id: 'halfsized', duration: 4,
    objects: [{ id: 'eq', type: 'equation', initialState: { x: 0, y: 0, w: 40, text: 'x^2' } }],
    timeline: [],
  }), /an equation needs a width and height/);
});

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
    objects: [{ id: 'g', type: 'grid', initialState: { x: 0, y: 0, rows: 2, cols: 2, values: [0, 1, 2, 3], heat: true, valueScale: 'local', matrixKind: 'input' } }],
    timeline: [],
  });
  assert.deepEqual(getSceneState(built, 1).objects[0].heat, { mode: 'magnitude' }, 'heat: true is shorthand for magnitude, not a bare boolean');
});

test('heat: false and an unauthored heat both evaluate to null, never to false', () => {
  const built = validateScene({
    id: 'cold', duration: 2,
    objects: [
      { id: 'off', type: 'grid', initialState: { x: 0, y: 0, rows: 1, cols: 1, values: [1], heat: false, matrixKind: 'input' } },
      { id: 'unset', type: 'grid', initialState: { x: 0, y: 0, rows: 1, cols: 1, values: [1], matrixKind: 'input' } },
    ],
    timeline: [],
  });
  const [off, unset] = getSceneState(built, 1).objects;
  assert.equal(off.heat, null);
  assert.equal(unset.heat, null);
});

test('a signed or sequential heat mode survives the gate untouched', () => {
  for (const mode of ['signed', 'sequential']) {
    const built = validateScene({
      id: `hot-${mode}`, duration: 2,
      objects: [{ id: 'g', type: 'grid', initialState: { x: 0, y: 0, rows: 1, cols: 2, values: [1, -1], heat: { mode }, valueScale: 'local', matrixKind: 'input' } }],
      timeline: [],
    });
    assert.deepEqual(getSceneState(built, 1).objects[0].heat, { mode }, `${mode} did not survive the gate`);
  }
});

test('a heat mode outside the closed vocabulary is refused', () => {
  assert.throws(() => validateScene({
    id: 'bad-heat', duration: 2,
    objects: [{ id: 'g', type: 'grid', initialState: { x: 0, y: 0, rows: 1, cols: 1, values: [1], heat: { mode: 'rainbow' }, valueScale: 'local', matrixKind: 'input' } }],
    timeline: [],
  }), /heat/i);
});

// Mirrors the role-token parity check in scene-style.test.mjs: a token added
// to one theme and not the other must fail as loudly for heat as for a role.
test('every heat token has a value in both themes', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const light = css.slice(css.indexOf('--viz-neutral'), css.indexOf('.dark {'));
  const dark = css.slice(css.indexOf('.dark {'), css.indexOf('}', css.indexOf('.dark {')));
  for (const token of HEAT_DIVERGING) {
    assert.match(light, new RegExp(`--viz-${token}\\s*:`), `${token} has no light value`);
    assert.match(dark, new RegExp(`--viz-${token}\\s*:`), `${token} has no dark value`);
  }
});

test('heat changes how a grid is painted, never what the evaluator says', () => {
  const build = heat => validateScene({
    id: 'hot', duration: 4,
    objects: [{ id: 'g', type: 'grid', initialState: { x: 0, y: 0, rows: 2, cols: 2, values: [0, 1, 2, 3], matrixKind: 'input', ...(heat ? { heat: true, valueScale: 'local' } : {}) } }],
    timeline: [{ at: 0, action: 'set_values', target: 'g', duration: 2, easing: 'linear', value: [3, 2, 1, 0] }],
  });
  for (const t of [0, 0.5, 1, 1.5, 2]) {
    const plain = getSceneState(build(false), t).objects[0];
    const hot = getSceneState(build(true), t).objects[0];
    assert.deepEqual(hot.values, plain.values, `values must not depend on heat, at t=${t}`);
  }
});

test('a grid can name its rows and columns', () => {
  const built = validateScene({
    id: 'labelled', duration: 2,
    objects: [{ id: 'm', type: 'grid', initialState: {
      rows: 2, cols: 3, values: [1, 2, 3, 4, 5, 6], matrixKind: 'relational',
      rowLabels: ['q1', 'q2'], columnLabels: ['k1', 'k2', 'k3'],
    } }],
    timeline: [],
  });
  const [grid] = getSceneState(built, 1).objects;
  assert.deepEqual(grid.rowLabels, ['q1', 'q2']);
  assert.deepEqual(grid.columnLabels, ['k1', 'k2', 'k3']);
});

test('a label array that does not match the grid is refused at the gate', () => {
  const scene = extra => ({
    id: 'bad', duration: 2,
    objects: [{ id: 'm', type: 'grid', initialState: { rows: 2, cols: 3, values: [1, 2, 3, 4, 5, 6], matrixKind: 'relational', ...extra } }],
    timeline: [],
  });
  assert.throws(() => validateScene(scene({ rowLabels: ['only one'] })), /2/, 'the message names the expected count');
  assert.throws(() => validateScene(scene({ columnLabels: ['a', 'b'] })), /3/);
});

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
  grid: { rows: 2, cols: 2, values: [1, 2, 3, 4], matrixKind: 'input' },
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

test('an object authored without an initialState is still a real object', () => {
  const built = validateScene({ id: 'bare', duration: 2, objects: [{ id: 'a', type: 'box' }], timeline: [] });
  const object = getSceneState(built, 1).objects[0];
  assert.equal(object.visible, true, 'it validated, so it must draw');
  assert.equal(object.opacity, 1);
  assert.deepEqual({ x: object.x, y: object.y }, { x: 0, y: 0 });
});

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

test('a camera event that would blank the frame is refused', () => {
  const cam = (action, value) => () => validateScene({
    id: 'cam', duration: 4, objects: [{ id: 'a', type: 'box', initialState: { x: 10, y: 10 } }],
    timeline: [{ at: 1, action, target: action === 'focus_camera' ? 'a' : undefined, value }],
  });
  for (const bad of [{ zoom: 0 }, { zoom: -3 }, { zoom: 'big' }, { zoom: 99 }]) {
    assert.throws(cam('zoom_camera', bad), /camera zoom must be a number/, `accepted ${JSON.stringify(bad)}`);
  }
  assert.throws(cam('focus_camera', { zoom: 0 }), /camera zoom must be a number/);
  assert.throws(cam('pan_camera', { zoom: 2 }), /pan_camera needs an x and a y/);
  assert.throws(cam('pan_camera', { x: 10 }), /pan_camera needs an x and a y/);
  assert.doesNotThrow(cam('zoom_camera', { zoom: 2 }));
  assert.doesNotThrow(cam('pan_camera', { x: 10, y: 20 }));
  assert.doesNotThrow(cam('focus_camera', undefined), 'focus with no zoom keeps the current one');
});

test('set_values needs a target that already holds values', () => {
  const noValues = () => validateScene({
    id: 'empty', duration: 4,
    objects: [{ id: 'row', type: 'strip', initialState: { x: 0, y: 0, cell: 30 } }],
    timeline: [{ at: 0, action: 'set_values', target: 'row', duration: 2, value: [1, 2, 3] }],
  });
  assert.throws(noValues, /has no values to change/);
});

test('an object carries a role, and a colour is no longer a thing a scene can say', () => {
  const built = validateScene({
    id: 'roled', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: { x: 0, y: 0, role: 'prediction' } }],
    timeline: [],
  });
  assert.equal(getSceneState(built, 1).objects[0].role, 'prediction');
  // A known legacy colour is adapted rather than refused - see the adapter
  // tests below. Only a colour outside the closed table still fails loudly.
  const adapted = validateScene({
    id: 'hexed', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: { x: 0, y: 0, color: '#2383e2' } }],
    timeline: [],
  });
  assert.equal(getSceneState(adapted, 1).objects[0].role, 'input', 'a known legacy colour adapts to its role rather than refusing');
  assert.throws(() => validateScene({
    id: 'unrecognised', duration: 2,
    objects: [{ id: 'a', type: 'box', initialState: { x: 0, y: 0, color: '#000000' } }],
    timeline: [],
  }), /not a known legacy colour/, 'a colour outside the closed table still fails loudly');
});

test('a role defaults to neutral and never to undefined', () => {
  const built = validateScene({ id: 'bare', duration: 2, objects: [{ id: 'a', type: 'box' }], timeline: [] });
  assert.equal(getSceneState(built, 1).objects[0].role, 'neutral');
});

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

test('every shipped scene still loads and evaluates', async () => {
  const demos = await import('./demo-scenes.js');
  for (const [name, scene] of Object.entries(demos).filter(([, value]) => value?.objects)) {
    const built = validateScene(scene);
    assert.ok(getSceneState(built, built.duration).objects.length, `${name} evaluated to nothing`);
  }
});

// token-journey lives inside a sample() factory in a .jsx file, so node:test
// cannot import it. The next best guarantee is that it cannot carry a colour.
// LearningBlocks.jsx also hosts unrelated blocks (a manim plot spec, a
// three.js scene) that legitimately author raw hex for their own renderers -
// scanning the whole file would flag those false positives, so the token
// journey scene is checked by name, not the file at large.
test('no shipped scene authors a colour', () => {
  const demoSource = readFileSync(new URL('./demo-scenes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(demoSource, /\bcolor:\s*'#/, './demo-scenes.js still authors a hex colour');
  const blocksSource = readFileSync(new URL('./LearningBlocks.jsx', import.meta.url), 'utf8');
  const start = blocksSource.indexOf("id: 'token-journey'");
  const end = blocksSource.indexOf('animationAxis:', start);
  assert.ok(start > -1 && end > start, 'could not locate the token-journey scene to check');
  assert.doesNotMatch(blocksSource.slice(start, end), /\bcolor:\s*'#/, 'the token-journey scene still authors a hex colour');
});

// This one passes already - Task 4 built GEOMETRY on the baseline. It stays as a
// guard, because the next person to add a value is the one it is written for.
test('spacing sits on the scale and geometry sits on a 4px baseline', () => {
  for (const [name, value] of Object.entries(GEOMETRY)) {
    assert.equal(value % 4, 0, `GEOMETRY.${name} is ${value}, which is off the 4px baseline`);
    assert.ok(value > 0, `GEOMETRY.${name} must be positive`);
  }
  assert.deepEqual(SPACE, [4, 8, 12, 16, 24, 32, 48, 64, 96]);
});

test('an object with no authored size takes its size from the geometry vocabulary', () => {
  const built = validateScene({ id: 'sized', duration: 2, objects: [{ id: 'a', type: 'box' }], timeline: [] });
  const [box] = getSceneState(built, 1).objects;
  assert.equal(box.w, GEOMETRY.nodeMinWidth, 'a node width is a vocabulary value, not a loose constant');
  assert.equal(box.h, GEOMETRY.nodeHeight);
});

test('a data cell falls back to the vocabulary pitch', () => {
  const built = validateScene({
    id: 'celled', duration: 2,
    objects: [{ id: 'g', type: 'grid', initialState: { rows: 2, cols: 2, values: [1, 2, 3, 4], matrixKind: 'input' } }],
    timeline: [],
  });
  assert.equal(getSceneState(built, 1).objects[0].cell, GEOMETRY.cellPitch);
});

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

test('a timeline event may name a sound from the closed vocabulary, and nothing else', () => {
  const built = validateScene({
    id: 'sounded', duration: 2,
    objects: [{ id: 'a', type: 'box' }],
    timeline: [{ at: 0, action: 'appear', target: 'a', sound: 'reveal' }],
  });
  assert.equal(built.timeline[0].sound, 'reveal');
  assert.throws(() => validateScene({
    id: 'unsounded', duration: 2,
    objects: [{ id: 'a', type: 'box' }],
    timeline: [{ at: 0, action: 'appear', target: 'a', sound: 'kaboom' }],
  }), /sound/);
});

// The governing invariant of the whole sound channel: getSceneState is pure,
// total and silent. A scene authoring `sound` on every action it knows must
// still evaluate to a state tree with no sound field anywhere - the evaluator
// is not where a sound is decided to have played.
test('getSceneState never carries a sound field, no matter what the scene authors', () => {
  const built = validateScene({
    id: 'noisy', duration: 4,
    objects: [{ id: 'a', type: 'box' }, { id: 'b', type: 'box' }],
    timeline: [
      { at: 0, action: 'appear', target: 'a', sound: 'soft_pop' },
      { at: 1, action: 'highlight', target: 'a', sound: 'select' },
      { at: 2, action: 'connect', from: 'a', to: 'b', sound: 'connect' },
    ],
  });
  const state = getSceneState(built, 3);
  const holdsSound = value => {
    if (value == null || typeof value !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(value, 'sound')) return true;
    return Object.values(value).some(entry =>
      Array.isArray(entry) ? entry.some(holdsSound) : holdsSound(entry));
  };
  assert.equal(holdsSound(state), false, 'evaluated state must never carry a sound field, at any depth');
});
