// Experiment controls (r2-contract.md, EXP-T26 acceptance): component-declared controls compile into B2's saved-scene
// experiment presentation with every admitted state enumerated and checked.
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateScene } from '../scene-evaluate.js';
import { compileVisual } from './compile.js';
import { period } from './components/pendulum.js';
import { EXAMPLES } from './examples/index.js';
import { catalogue } from './registry.js';

const at = (compiled, inputs) => new Map(evaluateScene(structuredClone(compiled.scene), compiled.scene.duration, inputs).state.objects.map(object => [object.id, object]));
const withExperiments = (spec, experiments) => ({ ...spec, presentation: { ...spec.presentation, experiments } });
const pendulum = EXAMPLES['pendulum-experiment'];
const [lengthExperiment, massExperiment] = pendulum.presentation.experiments;

test('pendulum: a quarter of the length gives half the period in the geometry, the readout and the plot', () => {
  const compiled = compileVisual(pendulum);
  const values = compiled.scene.exampleData.pend_length_values;
  assert.deepEqual(values, ['0.25 m', '1 m', '4 m']);
  const [quarter, one, four] = [0, 1, 2].map(index => at(compiled, { pend_length: index }));
  // L is measured to the bob's centre: 80 px per metre, to scale; the string ends at the top of the bob.
  const pivotToBob = state => state.get('pend.bob').y - state.get('pend.string').from.y;
  assert.deepEqual([quarter, one, four].map(pivotToBob), [20, 80, 320]);
  for (const state of [quarter, one, four]) assert.equal(state.get('pend.string').to.y, state.get('pend.bob').y - state.get('pend.bob').w / 2, 'the bob hangs from the string');
  assert.ok(Math.abs(period(0.25) / period(1) - 0.5) < 1e-12 && Math.abs(period(4) / period(1) - 2) < 1e-12);
  assert.deepEqual([quarter, one, four].map(state => state.get('pend.periodText').label), ['Period T = 1.00 s', 'Period T = 2.01 s', 'Period T = 4.01 s']);
  // The plot point's height above the axis is proportional to the period (within the 1 px of rounding).
  const axisY = one.get('pend.xAxis').from.y;
  const rise = state => axisY - state.get('pend.marker').y;
  assert.ok(Math.abs(rise(quarter) - rise(one) / 2) <= 1, `${rise(quarter)} vs ${rise(one)}`);
  assert.ok(Math.abs(rise(four) - rise(one) * 2) <= 1, `${rise(four)} vs ${rise(one)}`);
  // One sample point per admitted length; the marker sits on the current one.
  for (const [index, state] of [quarter, one, four].entries()) {
    const sample = state.get(`pend.sample${index}`);
    assert.deepEqual([state.get('pend.marker').x, state.get('pend.marker').y], [sample.x, sample.y]);
  }
});

test('pendulum: mass is a declared invariant: the period and plot stay, the bob and its readout change', () => {
  const compiled = compileVisual(pendulum);
  const states = [0, 1].map(index => at(compiled, { pend_mass: index }));
  for (const id of ['pend.periodText', 'pend.marker', 'pend.lengthText']) assert.equal(new Set(states.map(state => JSON.stringify(state.get(id)))).size, 1, id);
  assert.equal(new Set(states.map(state => state.get('pend.bob').w)).size, 2);
  assert.equal(new Set(states.map(state => state.get('pend.massText').label)).size, 2);
  assert.deepEqual(compiled.scene.presentation.experiments[1], { id: 'mass', input: 'pend_mass', purpose: massExperiment.purpose, affects: ['pend.periodText', 'pend.marker'], contrasts: massExperiment.contrasts, invariant: true });
});

test('every admitted state is enumerated, default first, and counted', () => {
  const compiled = compileVisual(pendulum);
  const states = compiled.coverage.stateInputs;
  assert.equal(states.length, 6);
  assert.equal(compiled.coverage.states, 6);
  assert.deepEqual(states[0], { pend_length: 1, pend_mass: 0 });
  assert.equal(new Set(states.map(state => JSON.stringify(state))).size, 6);
  // A static card without controls is one state.
  assert.deepEqual(compileVisual(EXAMPLES['pendulum-law']).coverage.stateInputs, [{}]);
});

test('the compiler holds experiments to B2\'s gate rule, naming what actually changed', () => {
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...massExperiment, invariant: false }])), /says pend.mass changes "pend.periodText", but it draws the same.*objects that change at every value: pend.string, pend.bob, pend.massText/);
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...massExperiment, affects: ['pend.bob'] }])), /declares "pend.bob" invariant, but it changes with pend.mass/);
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, affects: ['pend.law'] }])), /changes "pend.law", but it draws the same/);
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, affects: ['pend.nope'] }])), /affects names no object "pend.nope"/);
  // A bare component id lists that component's objects that change at every value.
  const whole = compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, affects: ['pend'] }]));
  assert.deepEqual(whole.scene.presentation.experiments[0].affects, ['pend.string', 'pend.bob', 'pend.lengthText', 'pend.periodText', 'pend.marker']);
});

test('controls are refused outside what the component declares', () => {
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, input: 'pend.gravity' }])), /pendulum has no control "gravity" \(its controls: length, mass\)/);
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, input: 'law.text' }])), /callout has no control "text" \(it declares none\)/);
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, input: 'length' }])), /must name a component's control as instance.control/);
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, domain: { values: [1, 8] } }])), /value 8 is not allowed: parameter "length" must be at most 4/);
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, domain: { values: [0.5, 2] } }])), /own length 1 must be one of the admitted values/);
  assert.throws(() => compileVisual(withExperiments(pendulum, [lengthExperiment, { ...lengthExperiment, id: 'again' }])), /another experiment already uses pend.length/);
  // A range domain expands by its step into finite states.
  const ranged = compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, domain: { min: 0.5, max: 2, step: 0.5 } }]));
  assert.deepEqual(ranged.scene.exampleData.pend_length_values, ['0.5 m', '1 m', '1.5 m', '2 m']);
  assert.throws(() => compileVisual(withExperiments(pendulum, [{ ...lengthExperiment, domain: { min: 0.1, max: 4, step: 0.05 } }])), /admit 79 states .*over the 64/);
});

test('flow cases: a cache hit dims the database steps, a miss runs every step', () => {
  const compiled = compileVisual(EXAMPLES['cache-paths']);
  assert.deepEqual(compiled.scene.inputs.map(input => [input.name, input.default]), [['req_case', 0]]);
  assert.deepEqual(compiled.scene.exampleData.req_case_values, ['Cache hit: the answer comes straight from the cache', 'Cache miss: read the database, then keep a copy']);
  const [hit, miss] = [0, 1].map(index => at(compiled, { req_case: index }));
  assert.deepEqual(['req.step0', 'req.step2', 'req.step3', 'req.step4', 'req.edge1', 'req.edge3'].map(id => hit.get(id).opacity), [1, 0.3, 0.3, 1, 0.3, 0.3]);
  for (const id of ['req.step2', 'req.step3', 'req.edge1', 'req.edge3']) assert.equal(miss.get(id).opacity, 1, id);
  // The hit goes round the skipped steps, from Look up the cache (1) to Send the answer (4); a miss has no route.
  const route = state => ['down', 'across', 'up'].map(part => state.get(`req.skip0${part}`));
  assert.deepEqual(route(hit).map(object => object.opacity), [1, 1, 1]);
  assert.deepEqual(route(miss).map(object => object.opacity), [0, 0, 0]);
  const [step1, step4, [down, across, up]] = [hit.get('req.step1'), hit.get('req.step4'), route(hit)];
  assert.deepEqual([down.from.x, up.to.x], [step1.x + step1.w / 2, step4.x + step4.w / 2]);
  assert.ok(across.from.y > step1.y + step1.h && up.to.y === step4.y + step4.h, 'under the row, into the bottom of step 4');
  assert.notEqual(hit.get('req.case').label, miss.get('req.case').label);
  // A flow without cases is unchanged: no opacity written, no caption.
  const plain = compileVisual(EXAMPLES.pipeline);
  assert.ok(plain.scene.objects.every(object => object.initialState.opacity === undefined && !object.id.endsWith('.case')));
});

test('the author catalogue exposes each control with its parameter, and only declared params can be controls', () => {
  const byName = Object.fromEntries(catalogue().map(entry => [entry.name, entry]));
  assert.deepEqual(Object.keys(byName.pendulum.controls), ['length', 'mass']);
  assert.equal(byName.pendulum.controls.mass.param, 'mass');
  assert.match(byName.pendulum.controls.mass.invariant, /period/);
  assert.equal(byName.flow.controls.case.optionsFrom, 'cases');
  assert.deepEqual(byName.module.controls, {});
});

test('the real scene gate agrees: the compiled experiments pass it, a tampered affects list is refused', async () => {
  const { presentationProblem } = await import('../../../control-plane/src/learn-scene-gates.js');
  const { scene } = compileVisual(pendulum);
  assert.equal(presentationProblem(scene), null);
  const tampered = structuredClone(scene);
  tampered.presentation.experiments[0].affects.push('law.box');
  assert.match(presentationProblem(tampered), /experiment "length" says "pend_length" changes "law.box"/);
});
