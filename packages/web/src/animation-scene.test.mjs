import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromTemplate, getSceneState, validateScene } from './animation-scene.js';

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

test('heat changes how a grid is painted, never what the evaluator says', () => {
  const build = heat => validateScene({
    id: 'hot', duration: 4,
    objects: [{ id: 'g', type: 'grid', initialState: { x: 0, y: 0, rows: 2, cols: 2, values: [0, 1, 2, 3], ...(heat ? { heat: true } : {}) } }],
    timeline: [{ at: 0, action: 'set_values', target: 'g', duration: 2, easing: 'linear', value: [3, 2, 1, 0] }],
  });
  for (const t of [0, 0.5, 1, 1.5, 2]) {
    const plain = getSceneState(build(false), t).objects[0];
    const hot = getSceneState(build(true), t).objects[0];
    assert.deepEqual(hot.values, plain.values, `values must not depend on heat, at t=${t}`);
  }
});
