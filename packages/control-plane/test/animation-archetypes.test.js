import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHETYPES, ARCHETYPE_NAMES, archetypeRules } from '../src/agents/animation-archetypes.js';
import { LABEL_ANCHORS, PLAN_ARCHETYPES, READOUT_KINDS, TRAIL_STYLES } from '../../web/src/animation3d/contract.js';

const { artifact } = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const text = archetypeRules('loss_surface');

test('ARCHETYPES is deeply frozen and loss_surface is its first entry', () => {
  assert.deepEqual(ARCHETYPE_NAMES, ['loss_surface']);
  assert.deepEqual([...ARCHETYPE_NAMES], [...PLAN_ARCHETYPES], 'the planner enum (contract.js) and this table name the same shapes');
  assert.equal(Object.isFrozen(ARCHETYPES) && Object.isFrozen(ARCHETYPES.loss_surface) && Object.isFrozen(ARCHETYPES.loss_surface.rules), true);
  assert.throws(() => { 'use strict'; ARCHETYPES.loss_surface.rules.push('x'); }, TypeError);
  assert.throws(() => { 'use strict'; ARCHETYPES.other = {}; }, TypeError);
});

test('archetypeRules names a shape, returns null for anything else, and inherits nothing', () => {
  assert.equal(typeof text, 'string');
  for (const name of ['', 'nope', 'toString', '__proto__', 'constructor', undefined, null, 3]) assert.equal(archetypeRules(name), null, String(name));
  assert.equal(archetypeRules('loss_surface'), text, 'pure');
});

test('loss_surface says what the plan\'s table says, in the contract\'s own words', () => {
  assert.match(text, /at least 24 by 24 heights/);
  assert.match(text, /6 to 8 contours/);
  assert.match(text, /one sphere node whose clampTo names the surface node/);
  assert.match(text, /clamps nothing/);
  assert.match(text, /trail node/);
  assert.match(text, /ghost trail node/);
  assert.match(text, /text readout named status with the words running, paused, converged and diverged/);
  assert.match(text, /offset equal to the marker radius/);
  assert.match(text, /anchor tip/);
  assert.match(text, /Two settings of the main step-size control, one that converges and one that diverges/);
  assert.ok(TRAIL_STYLES.includes('trail') && TRAIL_STYLES.includes('ghost') && LABEL_ANCHORS.includes('tip') && READOUT_KINDS.includes('text'), 'the words are the contract\'s');
});

test('archetypeRules("loss_surface") contains no number other than 24 by 24, 6 to 8 and the camera 30 to 65 degrees', () => {
  assert.deepEqual(text.match(/\d+(\.\d+)?/g), ['24', '24', '6', '8', '30', '65'], 'only the 24 by 24 grid, the 6 to 8 contours and the owner 30 to 65 degrees, in that order');
  assert.match(text, /The trail marks every step, never every Nth step: an even sampling interval hides the zig-zag\./);
  assert.match(text, /The arrow scale factor keeps the largest typical step at the default rate under a quarter of the surface width\./);
  assert.match(text, /The camera looks from 30 to 65 degrees above and keeps the whole surface and the path in view\. The steep axis spans the screen, so the zig-zag runs across the view\./);
});

test('it is data about primitives, not a scene: no code, formula or bowl, and short', () => {
  // The cap was 1,600; owner decision 29 (C10) added the azimuth sentence (1,649 bytes) and the C12 order the swings clause (1,693 bytes): it is 1,700, the least round number that holds the text.
  assert.ok(new TextEncoder().encode(text).length < 1700, 'a short block in the author user content');
  assert.ok(!/[{}[\]=]|=>|function|loss\s*=|bowl/i.test(text), 'no code, formula or bowl');
  const keys = Object.keys(ARCHETYPES.loss_surface);
  assert.deepEqual(keys, ['when', 'rules', 'comparison'], 'the shape lane d imports');
  assert.ok(typeof ARCHETYPES.loss_surface.when === 'string' && typeof ARCHETYPES.loss_surface.comparison === 'string' && ARCHETYPES.loss_surface.rules.length === 8 && ARCHETYPES.loss_surface.rules.every(rule => typeof rule === 'string'));
});

test('the golden camera satisfies the azimuth sentence: it looks across the steep axis of the surface, so that axis spans the screen', () => {
  // The steep axis, from the golden's own heights (row r runs along z, column c along x): the one whose edge midpoint rises more above the centre.
  const { heights } = artifact.scene.geometries.find(g => g.kind === 'surface'), mid = heights.length / 2, last = heights.length - 1;
  const alongX = heights[mid][last] - heights[mid][mid], alongZ = heights[last][mid] - heights[mid][mid];
  assert.notEqual(alongX, alongZ, 'the bowl has one steep axis');
  const steep = alongX > alongZ ? [1, 0] : [0, 1];
  // The camera's horizontal view direction, from its position to its target.
  const [px, , pz] = artifact.camera.position, [tx, , tz] = artifact.camera.target, view = [tx - px, tz - pz], length = Math.hypot(...view);
  assert.ok(length > 0, 'the camera is not straight above its target');
  const angle = Math.acos(Math.abs((view[0] * steep[0] + view[1] * steep[1]) / length)) * 180 / Math.PI; // 0 degrees: looking along the steep axis; 90: straight across it
  assert.ok(angle >= 60, `the camera looks ${angle.toFixed(0)} degrees from the steep axis (at least 60: across it, so the zig-zag does not run toward the camera)`);
});

test('the Diverged line says a diverging run makes several growing swings before the marker leaves the surface, and the golden does at the top of its rate control', async t => {
  assert.match(text, /Diverged: a diverging run makes several growing swings before the marker leaves the surface; the run stops\./);
  let runtime;
  try { runtime = await import('../../web/src/explain-program/runtime.js'); } catch { runtime = null; }
  if (!runtime) return t.skip('the pinned engine is not installed');
  const engine = await runtime.loadEngine();
  try {
    const top = artifact.parameters.find(p => p.id === 'learningRate').max, inputs = { learningRate: top, batchSize: '256' };
    const call = (operation, request) => { const out = runtime.runProgram(engine, { source: artifact.program.source, request: { seed: artifact.seed, time: 0, ...request }, operation }); assert.equal(out.ok, true, out.detail); return out.value; };
    let state = call('initialize', { inputs });
    const xs = [state.x];
    for (let i = 0; i < 60 && call('evaluate', { inputs, state }).readouts.status !== 'diverged'; i += 1) { state = call('reduce', { state, event: { type: 'action', action: 'step' }, inputs }); xs.push(state.x); }
    const inside = xs.slice(1, -1);
    assert.equal(call('evaluate', { inputs, state }).readouts.status, 'diverged', 'the top rate diverges');
    assert.ok(inside.length >= 4, `${inside.length} swings inside the bowl at rate ${top}`);
    assert.ok(inside.every((x, i) => Math.abs(x) < 2 && (i === 0 || (Math.abs(x) > Math.abs(inside[i - 1]) && Math.sign(x) === -Math.sign(inside[i - 1])))), 'each swing is wider than the last, on the other side');
    const growth = Math.abs(xs[2] / xs[1]);
    assert.ok(growth > 1.3 && growth < 1.9, `the growth factor at the top of the control is ${growth.toFixed(2)}`);
  } finally { engine.dispose?.(); }
});

test('the golden artifact is an instance of it', () => {
  const [px, py, pz] = artifact.camera.position, [tx, ty, tz] = artifact.camera.target;
  const elevation = Math.atan2(py - ty, Math.hypot(px - tx, pz - tz)) * 180 / Math.PI;
  assert.ok(elevation >= 30 && elevation <= 65, `the golden camera is ${elevation.toFixed(1)} degrees above the target, inside the rule's 30 to 65`);
  const geometry = id => artifact.scene.geometries.find(g => g.id === id), nodes = artifact.scene.nodes;
  const surface = artifact.scene.geometries.find(g => g.kind === 'surface');
  assert.ok(surface.heights.length >= 24 && surface.heights[0].length >= 24 && surface.contours >= 6 && surface.contours <= 8);
  const balls = nodes.filter(n => n.clampTo);
  assert.equal(balls.length, 1);
  assert.equal(geometry(nodes.find(n => n.id === balls[0].clampTo.node).geometry).kind, 'surface');
  assert.deepEqual(artifact.scene.geometries.filter(g => g.kind === 'trail').map(g => g.style).sort(), ['ghost', 'trail']);
  const status = artifact.readouts.find(r => r.id === 'status');
  assert.equal(status.kind, 'text');
  for (const word of ['running', 'paused', 'converged', 'diverged']) assert.ok(artifact.program.source.includes(`'${word}'`), word);
  // The trail marks every step: the program appends one point per step with no step % N sampling, and the path holds the last 64 steps.
  const source = artifact.program.source;
  assert.match(source, /path: s\.path\.concat\(\[\[x, z\]\]\)\.slice\(-MAX\)/);
  assert.ok(!/step\s*%|s\.step\s*%/.test(source), 'no sampling of the path by step number');
  // The arrow scale rule: the golden draws both arrows at one scale (SCALE in its program); the largest default-rate step, 0.19 (the start step 0.163 plus the 7.5% noise at batch 16 at its two sigma; sgd-golden.test.mjs measures the median over 12 runs), drawn stays under a quarter of the surface width.
  const scale = Number(source.match(/SCALE = ([\d.]+)/)[1]), width = artifact.scene.geometries.find(g => g.kind === 'surface').width;
  assert.ok(scale * 0.19 < width / 4, `scale ${scale} draws a 0.19 step ${scale * 0.19} long, a quarter of the surface width is ${width / 4}`);
  const radius = geometry(balls[0].geometry).radius;
  for (const arrow of nodes.filter(n => geometry(n.geometry)?.kind === 'arrow')) {
    assert.equal(geometry(arrow.geometry).offset, radius);
    assert.ok(nodes.some(n => n.parent === arrow.id && geometry(n.geometry)?.anchor === 'tip'));
  }
});
