// What an Animation card shows for each experience (plan section 4, AN-03): the UI model, the controls offered, the phase,
// typed values and frame text. Pure; the stub artifacts stand in for lane R's fixtures until the contract lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptsText, cardModel, cardPhase, defaultInputs, detectWebGL, failureOf, failureText, formatValue, frameView, outcomeText, parameterInput, readoutText,
  retryLabel, visibleControls, WEBGL_UNAVAILABLE, withSaved, FIXTURE_NOTE, INTERACT_LEGEND,
} from './card.js';
import { experimentArtifact, gameArtifact, inspectArtifact, watchArtifact } from './testdata/ui-stubs.mjs';

const noEllipsis = value => assert.doesNotMatch(String(value), /\.\.\.|…/);

test('watch: a seekable loop with play, restart and speed; no parameter panel, no Check', () => {
  const model = cardModel(watchArtifact());
  assert.equal(model.experience, 'watch');
  assert.deepEqual(model.loop, { duration: 10, seekable: true, speeds: [0.5, 1, 2] });
  assert.equal(model.fixture, true);
  const show = visibleControls(model);
  assert.equal(show.transport, true);
  assert.equal(show.speed, true);
  assert.equal(show.parameters, false, 'no empty parameter panel for a passive scene');
  assert.equal(show.game, false);
  assert.equal(show.reset, false, 'nothing to reset in a passive loop');
});

test('experiment: compact number and toggle rows with units, Reset, no transport', () => {
  const model = cardModel(experimentArtifact());
  assert.equal(model.loop, null, 'an experiment with no declared loop has no Play');
  assert.deepEqual(model.parameters.map(p => [p.id, p.kind, p.unit ?? null]), [['left_mass', 'number', 'kg'], ['left_distance', 'number', 'm'], ['show_forces', 'toggle', null]]);
  assert.deepEqual(defaultInputs(model), { left_mass: 2, left_distance: 1, show_forces: true });
  const show = visibleControls(model);
  assert.equal(show.transport, false);
  assert.equal(show.parameters, true);
  assert.equal(show.reset, true);
});

test('mini-game: goal, Check apart from the other actions, hint; a rule-based scene is not seekable', () => {
  const model = cardModel(gameArtifact());
  assert.deepEqual(model.goal, { objective: 'Make the beam level using one weight.', hint: 'Torque is mass times distance.', check: 'check' });
  assert.deepEqual(model.actions.map(action => action.id), ['place_left', 'place_right'], 'Check is its own control');
  const show = visibleControls(model);
  assert.equal(show.game, true);
  assert.equal(show.check, true);
  assert.equal(show.hint, true);
  assert.equal(show.transport, false);
  assert.equal(cardModel({ ...gameArtifact(), experience: 'game', behavior: { kind: 'rules', duration: 5, loop: true } }).loop.seekable, false, 'rules restart, never rewind');
  assert.deepEqual(cardModel({ ...gameArtifact(), experience: 'game', behavior: { kind: 'rules', duration: 5, loop: true } }).loop.speeds, [], 'no speed control for rules');
});

test('inspect: no Play, no panel; camera reset and Interact only with a live 3D view', () => {
  const model = cardModel(inspectArtifact());
  assert.equal(model.fixture, false);
  const show = visibleControls(model);
  assert.equal(show.transport, false);
  assert.equal(show.parameters, false);
  assert.equal(show.reset, false);
  assert.equal(show.resetView, true);
  assert.equal(show.interact, true);
  const flat = visibleControls(model, { webgl: false });
  assert.equal(flat.resetView, false);
  assert.equal(flat.interact, false);
  assert.equal(visibleControls(model, { readOnly: true }).edit, false);
});

test('the model is bounded and ignores malformed declarations', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, type: 'number', min: 0, max: 1 }));
  const model = cardModel({ experience: 'nonsense', parameters: [...many, { id: 'bad', type: 'number', min: 2, max: 1 }, { label: 'no id' }], actions: Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, label: `A${i}` })) });
  assert.equal(model.experience, 'inspect');
  assert.equal(model.parameters.length, 8);
  assert.equal(model.actions.length, 8);
  assert.equal(model.title, 'Animation');
  assert.equal(cardModel({ experience: 'game', actions: [{ id: 'go', label: 'Go' }], goal: { objective: 'x', checkAction: 'missing' } }).goal.check, null, 'Check only for a declared action');
});

test('phase: pending and failed jobs, loading, recovery, unavailable and ready', () => {
  const job = { animationJob: { id: 'j', stage: 'authoring' } };
  assert.equal(cardPhase({ block: job }), 'pending');
  assert.equal(cardPhase({ block: job, job: { stage: 'failed' } }), 'failed');
  assert.equal(cardPhase({ block: { animationJob: { stage: 'cancelled' } } }), 'failed');
  assert.equal(cardPhase({ block: { artifactRef: { id: 'a' } } }), 'loading');
  assert.equal(cardPhase({ block: { artifactRef: { id: 'a' } }, failure: failureOf('artifact', new Error('x')) }), 'recovery');
  const artifact = watchArtifact();
  assert.equal(cardPhase({ block: {}, artifact, renderer: 'loading' }), 'loading');
  assert.equal(cardPhase({ block: {}, artifact, renderer: 'ready' }), 'ready');
  assert.equal(cardPhase({ block: {}, artifact, webgl: false }), 'unavailable');
  assert.equal(cardPhase({ block: {}, artifact, renderer: 'ready', failure: failureOf('runtime', new Error('x')) }), 'recovery');
  assert.equal(cardPhase({ block: { fixtureId: 'watch', animationJob: { stage: 'authoring' } } }), 'loading', 'a fixture card never waits on a job');
});

test('typed numbers: only finite values in range, snapped to the step; toggles and selects by declared value', () => {
  const [mass, distance, forces] = cardModel(experimentArtifact()).parameters;
  assert.equal(parameterInput(mass, '3.7'), 3.5);
  assert.equal(parameterInput(mass, '3.8'), 4);
  assert.equal(parameterInput(mass, '11'), null);
  assert.equal(parameterInput(mass, '0'), null);
  assert.equal(parameterInput(mass, ''), null);
  assert.equal(parameterInput(mass, 'abc'), null);
  assert.equal(parameterInput(distance, '0.3'), 0.3, 'no floating-point tail');
  assert.equal(parameterInput(forces, 0), false);
  const select = cardModel({ parameters: [{ id: 'g', label: 'Gravity', type: 'select', options: [{ value: 9.8, label: 'Earth' }, { value: 1.6, label: 'Moon' }] }] }).parameters[0];
  assert.equal(parameterInput(select, '1.6'), 1.6);
  assert.equal(parameterInput(select, 'Mars'), null);
  assert.equal(formatValue(mass, 2), '2.0 kg');
  assert.equal(formatValue(distance, 1), '1.0 m');
});

test('frame text: readouts and goal status bounded; non-finite values dropped', () => {
  const view = frameView({ readouts: [{ id: 't', label: 'Torque', value: 2.0000001, unit: 'N m' }, { id: 'n', label: 'Bad', value: Number.NaN }, { id: 's', label: 'State', value: 'balanced' }, ...Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, label: 'R', value: i }))], goal: { status: 'success', attempts: 2 } });
  assert.equal(view.readouts.length, 24);
  assert.deepEqual(view.readouts.slice(0, 2).map(readoutText), ['2 N m', 'balanced']);
  assert.deepEqual(view.goal, { status: 'success', attempts: 2, message: '' });
  assert.equal(outcomeText(view.goal), 'Solved');
  assert.equal(attemptsText(view.goal), '2 attempts');
  assert.equal(attemptsText({ attempts: 1 }), '1 attempt');
  assert.equal(outcomeText(null), 'In progress');
  assert.equal(frameView({ goal: { status: 'hacked', attempts: 'x' } }).goal.status, 'playing');
});

test('failure words name what failed and what Retry repeats; no ellipsis anywhere', () => {
  assert.equal(retryLabel({ stage: 'renderer' }), 'Retry 3D view');
  assert.equal(retryLabel({ stage: 'artifact' }), 'Retry loading');
  assert.equal(retryLabel({ stage: 'runtime' }), 'Restart scene');
  assert.match(failureText(failureOf('runtime', new Error('worker timeout'))), /last good state is kept/);
  assert.doesNotMatch(failureText(failureOf('runtime', new Error('worker timeout'))), /worker timeout/, 'no internal diagnostics for a runtime stop');
  for (const value of [WEBGL_UNAVAILABLE, FIXTURE_NOTE, INTERACT_LEGEND, failureText({ stage: 'artifact' }), failureText(null), retryLabel(null)]) noEllipsis(value);
});

test('saved fields and the WebGL check', () => {
  assert.deepEqual(withSaved({ id: 'c', snapshot: 1 }, { camera: { a: 1 } }), { id: 'c', snapshot: 1, camera: { a: 1 } });
  assert.deepEqual(withSaved({ id: 'c' }, { snapshot: { inputs: {} } }), { id: 'c', snapshot: { inputs: {} } });
  assert.equal(detectWebGL({ createElement: () => ({ getContext: kind => (kind === 'webgl' ? {} : null) }) }), true);
  assert.equal(detectWebGL({ createElement: () => ({ getContext: () => null }) }), false);
  assert.equal(detectWebGL({ createElement: () => { throw new Error('blocked'); } }), false);
  assert.equal(detectWebGL(undefined), false);
});
