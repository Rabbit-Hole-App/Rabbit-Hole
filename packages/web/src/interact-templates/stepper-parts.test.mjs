import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as rail from './step-rail.js';
import * as picture from './fixed-picture.js';
import * as callout from './active-callout.js';
import * as readouts from './readouts.js';
import * as ghost from './ghost-previous.js';
import * as status from './status-line.js';
import * as scene from './stepper-scene.js';
import { programSdkSource } from '../explain-program/sdk.js';
import { CONTRACT_LIMITS, parseFrame } from '../explain-program/contract.js';
import { frameLook } from '../explain-program/frame-look.js';
import { frameOverlaps } from '../explain-program/frame-overlap.js';
import { loadEngine, runProgram } from '../explain-program/runtime.js';

const reference = name => JSON.parse(readFileSync(new URL(`../../../../docs/features/interact/references/${name}-stepper-merge-sort.composition.json`, import.meta.url), 'utf8'));
const brief = reference('overview');
const balanced = reference('standard');
const sdk = runInNewContext(`${programSdkSource('sdk-8')}\nsdk`);
const plain = value => JSON.parse(JSON.stringify(value));
const ctx = (composition = brief, index = 0) => {
  const variant = composition.data.variants[0];
  return { composition, variant, state: variant.states[index], previous: index ? variant.states[index - 1] : null, index, words: { completed: 'Completed' } };
};
const bindingError = fn => assert.throws(fn, error => error.code === 'part_binding' && typeof error.path === 'string');
const parts = [rail, picture, callout, readouts, ghost, status];

test('the six parts publish typed bindings and their drawing functions need no module closures', () => {
  assert.deepEqual(parts.map(part => part.id), ['step-rail', 'fixed-picture', 'active-callout', 'readouts', 'ghost-previous', 'status-line']);
  assert.deepEqual(rail.bindingTypes, { items: 'State[]', active: 'Integer', aha: 'StateId' });
  assert.deepEqual(picture.bindingTypes, { regions: 'Region[]', links: 'Link[]', active: 'RegionId[]' });
  assert.deepEqual(callout.bindingTypes, { target: 'RegionId', text: 'Text', reason: 'Text?' });
  assert.deepEqual(readouts.bindingTypes, { values: 'Readout[]' });
  assert.deepEqual(ghost.bindingTypes, { regions: 'RegionId[]', predecessor: 'StateId?' });
  assert.deepEqual(status.bindingTypes, { text: 'Text', source: 'StateId' });
  for (const part of parts) {
    assert.equal(part.default.draw, part.draw);
    const emitted = runInNewContext(`(${part.draw.toString()})`);
    assert.deepEqual(plain(emitted(ctx(), sdk)), plain(part.draw(ctx(), sdk)), part.id);
  }
});

test('rail reads the same integer selection as the state list and keeps the aha item addressable', () => {
  for (let index = 0; index < 4; index++) {
    const objects = rail.draw(ctx(brief, index), sdk);
    assert.equal(objects.length, 4);
    assert.deepEqual(objects.map(o => o.id), brief.data.variants[0].states.map(s => `rail.${s.id}`));
    assert.deepEqual(objects.filter(o => o.role === 'input').map(o => o.id), [`rail.${brief.data.variants[0].states[index].id}`]);
    assert.ok(objects.some(o => o.id === `rail.${brief.aha.stateId}`));
  }
  bindingError(() => rail.draw({ ...ctx(), index: 0.5 }, sdk));
  bindingError(() => rail.draw({ ...ctx(), state: brief.data.variants[0].states[1] }, sdk));
  bindingError(() => rail.draw({ ...ctx(), composition: { ...brief, aha: { stateId: 'missing' } } }, sdk));
});

test('completed trace is a rail presentation derived from the same cursor', () => {
  const context = { ...ctx(brief, 2), presentation: 'completed-trace' };
  const objects = rail.draw(context, sdk);
  assert.equal(objects[0].text, 'Completed');
  assert.deepEqual(objects.filter(o => o.kind === 'line' && o.role === 'input').map(o => o.id), ['trace.split.rule', 'trace.singles.rule']);
  bindingError(() => rail.draw({ ...context, words: {} }, sdk));
});

// Measure painted orthogonal line unions by role. Subdividing into half-pixel
// intervals makes packing independent of path order, direction and retracing.
const shaftInk = objects => {
  const ink = new Set();
  for (const object of objects) {
    const points = object.kind === 'polyline' ? object.points : object.kind === 'arrow' ? [[object.from.x, object.from.y], [object.to.x, object.to.y]] : [];
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]], dx = b[0] - a[0], dy = b[1] - a[1];
      assert.ok(dx === 0 || dy === 0, 'packing never introduces a diagonal');
      const length = Math.abs(dx || dy), count = Math.round(length * 2);
      for (let j = 0; j < count; j++) {
        const x = a[0] + Math.sign(dx) * (j / 2 + 0.25), y = a[1] + Math.sign(dy) * (j / 2 + 0.25);
        ink.add(`${object.role}:${object.opacity}:${x},${y}`);
      }
    }
  }
  return [...ink].sort();
};
const positions = { input: [135, 30, 156, 40], left: [32, 83, 160, 40], right: [236, 83, 160, 40], singles: [32, 136, 364, 40], mergeLeft: [32, 189, 160, 40], mergeRight: [236, 189, 160, 40], output: [135, 242, 156, 40] };
const rawLinks = context => context.variant.links.flatMap(link => {
  const a = positions[link.from], b = positions[link.to], from = [a[0] + a[2] / 2, a[1] + a[3]], to = [b[0] + b[2] / 2, b[1]], mid = (from[1] + to[1]) / 2;
  const style = { role: context.state.active.includes(link.to) ? 'input' : 'neutral', opacity: 1 };
  const id = `link.${link.from}.${link.to}`;
  return [sdk.polyline(`${id}.shaft`, [from, [from[0], mid], [to[0], mid]], style), sdk.arrow(id, to[0], mid, to[0], to[1], style)];
});
const arrowHeads = objects => [...new Set(objects.filter(o => o.kind === 'arrow').map(o => `${o.role}:${o.opacity}:${o.from.x},${o.from.y}:${o.to.x},${o.to.y}`))].sort();

test('picture shaft packing preserves every path union and final arrow per role in all Brief states', () => {
  for (let index = 0; index < 4; index++) {
    const context = ctx(brief, index), objects = picture.draw(context, sdk), links = objects.filter(o => o.id.startsWith('link.'));
    assert.deepEqual(shaftInk(links), shaftInk(rawLinks(context)), `state ${index}: every painted shaft remains`);
    assert.deepEqual(arrowHeads(links), arrowHeads(rawLinks(context)), `state ${index}: every painted arrowhead remains`);
    for (const link of context.variant.links) assert.ok(links.some(o => o.id === `link.${link.from}.${link.to}`), 'each semantic link id survives on an arrow or shared shaft');
    assert.equal(objects.filter(o => !o.id.startsWith('link.')).length, 37, 'all boxes, labels, values and dividers survive');
  }
  const bad = structuredClone(ctx()); bad.state.active = ['missing'];
  bindingError(() => picture.draw(bad, sdk));
  const wrongLink = structuredClone(ctx()); wrongLink.variant.links[0].to = 'missing';
  bindingError(() => picture.draw(wrongLink, sdk));
});

test('callout binds its existing anchor and retains the complete sentence, including fifth line with title', () => {
  for (let index = 0; index < 4; index++) {
    const context = ctx(brief, index), objects = callout.draw(context, sdk), sentences = objects.filter(o => /^callout.active.s\d+$/.test(o.id));
    assert.equal(sentences.map(o => o.text).join(' '), context.state.sentence);
    assert.equal(objects.find(o => o.id === 'callout.active.title').text, context.state.label);
    assert.equal(sentences.length, 4);
    const p = positions[context.state.calloutRegion], path = objects.find(o => o.id === 'callout.anchor');
    assert.deepEqual(plain(path.points[0]), [p[0] + p[2] / 2, p[1] + p[3]]);
    assert.ok(objects.some(o => o.id === 'callout.active.l0' && !o.text));
  }
  bindingError(() => callout.draw({ ...ctx(), state: { ...ctx().state, calloutRegion: 'missing' } }, sdk));
  bindingError(() => callout.draw({ ...ctx(), state: { ...ctx().state, sentence: 3 } }, sdk));
});

test('readouts retain numeric/string source values without rounding or a fabricated counter', () => {
  const context = ctx(balanced, 5), objects = readouts.draw(context, sdk);
  assert.deepEqual(objects.filter(o => o.id.endsWith('.value')).map(o => o.text), ['5', '4 / 4']);
  assert.deepEqual(objects.filter(o => o.id.endsWith('.label')).map(o => o.text), context.state.readouts.map(r => r.label));
  assert.deepEqual(readouts.draw(ctx(), sdk), []);
  const wrong = structuredClone(context); wrong.state.readouts[0].value = Number.NaN;
  bindingError(() => readouts.draw(wrong, sdk));
  const source = structuredClone(context); source.state.readouts[0].source = 'input';
  bindingError(() => readouts.draw(source, sdk));
});

test('ghost has no first-state predecessor and rejects wrong predecessor bindings before unsupported styling', () => {
  assert.deepEqual(ghost.draw(ctx(), sdk), []);
  bindingError(() => ghost.draw({ ...ctx(), previous: ctx().state }, sdk));
  bindingError(() => ghost.draw({ ...ctx(brief, 2), previous: brief.data.variants[0].states[0] }, sdk));
  assert.throws(() => ghost.draw(ctx(balanced, 1), sdk), error => error.code === 'part_unrepresentable' && /dash/.test(error.message));
});

test('status copy is optional, selected-state data and uses only an approved or supplied anchor', () => {
  assert.deepEqual(status.draw(ctx(), sdk), []);
  const context = { ...ctx(), statusPosition: { x: 24, y: 249, w: 386, h: 27, textX: 217, textY: 267 } };
  context.state = { ...context.state, status: { id: 'connected', text: 'Server has not yet heard Client', source: context.state.id } };
  const objects = status.draw(context, sdk);
  assert.equal(objects.find(o => o.kind === 'text').text, context.state.status.text);
  bindingError(() => status.draw({ ...context, state: { ...context.state, status: { ...context.state.status, source: 'other' } } }, sdk));
  bindingError(() => status.draw({ ...context, statusPosition: null }, sdk));
});

test('Brief assembly parses the actual complete frames under 60 objects with owned containers and no moved drawing', () => {
  assert.deepEqual(scene.roles, []);
  assert.deepEqual(scene.normalize({ unbound: 'unused' }), {});
  assert.deepEqual(scene.states({}), {});
  const range = { composition: brief }; assert.equal(scene.geometry(range), range);
  const counts = [];
  for (let index = 0; index < 4; index++) {
    const frame = scene.assembleFrame(brief, { step: index }, sdk, {}), parsed = parseFrame(plain(frame));
    assert.equal(parsed.ok, true, JSON.stringify(parsed.error));
    assert.deepEqual(parsed.fitted ?? [], []);
    counts.push(frame.objects.length);
    assert.ok(frame.objects.length < CONTRACT_LIMITS.objects);
    assert.deepEqual(frameOverlaps(plain(frame)), []);
    const looked = frameLook(plain(frame.objects), frame);
    assert.deepEqual(looked.objects, plain(frame.objects), 'ID normalization alone does not move text or change renderer treatment');
  }
  assert.deepEqual(counts, [59, 58, 59, 58]);
  bindingError(() => scene.assembleFrame(brief, { step: 4 }, sdk, {}));
  assert.throws(() => scene.assembleFrame(balanced, { step: 0, option: '0' }, sdk, {}), error => error.code === 'stepper_depth_unavailable');
  assert.throws(() => scene.source({ geometry: { composition: balanced } }), error => error.code === 'stepper_depth_unavailable');
});

test('the generated Brief program runs in the frozen SDK-8 sandbox and reproduces every host-assembled frame', async () => {
  const source = scene.source({ geometry: { composition: brief, words: {} } });
  assert.ok(Buffer.byteLength(source) < CONTRACT_LIMITS.sourceBytes, `${Buffer.byteLength(source)} source bytes`);
  assert.equal(/\bimport\s/.test(source), false);
  assert.equal(/\btime\b/.test(source), false, 'the cursor introduces no clock or autoplay');
  const engine = await loadEngine();
  for (let index = 0; index < 4; index++) {
    const out = runProgram(engine, { source, request: { inputs: { step: index }, time: 0, seed: 1, state: null }, sdkVersion: 'sdk-8' });
    assert.equal(out.ok, true, out.detail);
    assert.deepEqual(out.value, { frame: plain(scene.assembleFrame(brief, { step: index }, sdk, {})), quantities: {} });
    assert.equal(parseFrame(out.value.frame).ok, true);
  }
});

test('Brief TCP is rejected before source generation or frame assembly for the first canonical slice', () => {
  const tcp = JSON.parse(readFileSync(new URL('../../../../docs/features/interact/references/overview-stepper-tcp-handshake.composition.json', import.meta.url), 'utf8'));
  const canonicalError = error => error.code === 'stepper_canonical_unavailable' && error.path === 'composition.canonical';
  assert.throws(() => scene.source({ geometry: { composition: tcp } }), canonicalError);
  assert.throws(() => scene.assembleFrame(tcp, { step: 0 }, sdk, {}), canonicalError);
});
