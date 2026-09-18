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
