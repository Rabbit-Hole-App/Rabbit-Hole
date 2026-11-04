import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHETYPES, ARCHETYPE_NAMES, archetypeRules } from '../src/agents/animation-archetypes.js';
import { LABEL_ANCHORS, READOUT_KINDS, TRAIL_STYLES } from '../../web/src/animation3d/contract.js';

const { artifact } = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const text = archetypeRules('loss_surface');

test('ARCHETYPES is deeply frozen and loss_surface is its first entry', () => {
  assert.deepEqual(ARCHETYPE_NAMES, ['loss_surface']);
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

test('it is data about primitives, not a scene: no formula, id, coordinate or number beyond the grid and contour counts', () => {
  const numbers = text.match(/\d+(\.\d+)?/g);
  assert.deepEqual(numbers, ['24', '24', '6', '8'], 'only the 24 by 24 grid and 6 to 8 contours');
  assert.ok(new TextEncoder().encode(text).length < 1600, 'a short block in the author\'s user content');
  assert.ok(!/[{}[\]=]|=>|function|loss\s*=|bowl/i.test(text), 'no code, formula or bowl');
});

test('the golden artifact is an instance of it', () => {
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
  const radius = geometry(balls[0].geometry).radius;
  for (const arrow of nodes.filter(n => geometry(n.geometry)?.kind === 'arrow')) {
    assert.equal(geometry(arrow.geometry).offset, radius);
    assert.ok(nodes.some(n => n.parent === arrow.id && geometry(n.geometry)?.anchor === 'tip'));
  }
});
