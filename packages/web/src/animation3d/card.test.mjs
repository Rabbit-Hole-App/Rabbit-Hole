// What an Animation card shows for each experience (plan section 4, AN-03), on the contract fixtures (fixtures.js): the UI model,
// the controls offered, the phase, typed values and the frame's text. Pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardModel, cardPhase, defaultInputs, detectWebGL, eventFor, failureOf, failureText, formatValue, frameView, invalidArtifact, outcomeText, parameterInput,
  readoutText, retryLabel, visibleControls, WEBGL_UNAVAILABLE, FIXTURE_NOTE, INTERACT_LEGEND, jobOf, artifactRefOf,
} from './card.js';
import { validateAnimationEvent } from './contract.js';
import { experimentArtifact, gameArtifact, inspectArtifact, validated, watchArtifact } from './testdata/ui-stubs.mjs';

const noEllipsis = value => assert.doesNotMatch(String(value), /\.\.\.|…/);
const model = artifact => cardModel(validated(artifact));

test('watch (orbit fixture): a seekable 8 s loop with play, restart and the registry\'s speeds; no parameter panel, no Reset; labelled a fixture', () => {
  const m = model(watchArtifact());
  assert.equal(m.experience, 'watch');
  assert.deepEqual(m.loop, { duration: 8, repeat: true, seekable: true, speeds: [0.25, 0.5, 1, 2] });
  assert.equal(m.fixture, true);
  const show = visibleControls(m);
  assert.equal(show.transport, true);
  assert.equal(show.speed, true);
  assert.equal(show.parameters, false, 'no empty parameter panel for a passive scene');
  assert.equal(show.game, false);
  assert.equal(show.reset, false, 'nothing to reset in a passive loop');
});

test('experiment (beam fixture): four number rows with units, readouts declared, Reset, no transport', () => {
  const m = model(experimentArtifact());
  assert.equal(m.loop, null);
  assert.deepEqual(m.parameters.map(p => [p.id, p.type, p.unit]), [['leftMass', 'number', 'kg'], ['leftDistance', 'number', 'm'], ['rightMass', 'number', 'kg'], ['rightDistance', 'number', 'm']]);
  assert.deepEqual(defaultInputs(validated(experimentArtifact())), { leftMass: 4, leftDistance: 1.5, rightMass: 2, rightDistance: 2 });
  assert.deepEqual(m.readouts.map(r => r.id), ['leftMoment', 'rightMoment', 'tilt']);
  const show = visibleControls(m);
  assert.equal(show.transport, false);
  assert.equal(show.parameters, true);
  assert.equal(show.reset, true);
});

test('mini-game (grid fixture): goal and hint, its four moves as actions, no transport', () => {
  const m = model(gameArtifact());
  assert.deepEqual(m.goal, { objective: 'Move the robot onto the target square in at most 10 moves.', hint: 'The target is 3 squares east and 2 squares south of the start.' });
  assert.deepEqual(m.actions.map(a => a.id), ['east', 'west', 'north', 'south']);
  const show = visibleControls(m);
  assert.equal(show.game, true);
  assert.equal(show.hint, true);
  assert.equal(show.actions, true);
  assert.equal(show.transport, false);
  assert.equal(show.reset, true);
});

test('a rule-based loop restarts, never rewinds: no seek and no speed', () => {
  const m = cardModel({ ...validated(gameArtifact()), timeline: { duration: 5, loop: true } });
  assert.equal(m.loop.seekable, false);
  assert.deepEqual(m.loop.speeds, []);
  assert.equal(visibleControls(m).speed, false);
});

test('inspect: no Play, no panel; Reset view and Interact only with a live 3D view; a generated scene is not a fixture', () => {
  const m = model(inspectArtifact());
  assert.equal(m.fixture, false);
  const show = visibleControls(m);
  assert.equal(show.transport, false);
  assert.equal(show.parameters, false);
  assert.equal(show.reset, false);
  assert.equal(show.resetView, true);
  assert.equal(show.interact, true);
  const flat = visibleControls(m, { webgl: false });
  assert.equal(flat.resetView, false);
  assert.equal(flat.interact, false);
  assert.equal(visibleControls(m, { readOnly: true }).edit, false);
});

test('events the card sends are the contract\'s', () => {
  const experiment = validated(experimentArtifact()), game = validated(gameArtifact());
  assert.equal(validateAnimationEvent(eventFor.parameter('leftMass', 6), experiment).ok, true);
  assert.equal(validateAnimationEvent(eventFor.action('east'), game).ok, true);
  assert.equal(validateAnimationEvent(eventFor.parameter('leftMass', 60), experiment).ok, false, 'out of range is refused by the contract too');
});

test('phase: pending and failed jobs, loading, recovery, unavailable and ready', () => {
  const job = { animation3dJob: { id: 'j', stage: 'authoring' } };
  assert.equal(cardPhase({ block: job }), 'pending');
  assert.equal(cardPhase({ block: job, job: { stage: 'failed' } }), 'failed');
  assert.equal(cardPhase({ block: { animation3dJob: { stage: 'cancelled' } } }), 'failed');
  const saved = { animation3d: { v: 1, ref: { artifactId: 'a' } } };
  assert.equal(cardPhase({ block: saved }), 'loading');
  assert.equal(cardPhase({ block: { ...saved, animation3dJob: { stage: 'authoring' } } }), 'loading', 'a regeneration keeps the saved scene');
  assert.equal(cardPhase({ block: saved, failure: failureOf('artifact', new Error('x')) }), 'recovery');
  const artifact = validated(watchArtifact());
  assert.equal(cardPhase({ block: {}, artifact, renderer: 'loading' }), 'loading');
  assert.equal(cardPhase({ block: {}, artifact, renderer: 'ready' }), 'ready');
  assert.equal(cardPhase({ block: {}, artifact, webgl: false }), 'unavailable');
  assert.equal(cardPhase({ block: {}, artifact, renderer: 'ready', failure: failureOf('runtime', new Error('x')) }), 'recovery');
  assert.equal(cardPhase({ block: { fixtureId: 'orbit-watch', animation3dJob: { stage: 'authoring' } } }), 'loading', 'a fixture card never waits on a job');
  assert.deepEqual([jobOf({ animation3dJob: { id: 'j' } }), artifactRefOf(saved)], [{ id: 'j' }, { artifactId: 'a' }], 'storage.js field names');
});

test('typed numbers: only finite values in range, snapped to the step; toggles and selects by declared value', () => {
  const [mass, distance] = model(experimentArtifact()).parameters;
  assert.equal(parameterInput(mass, '3.4'), 3);
  assert.equal(parameterInput(mass, '3.6'), 4);
  assert.equal(parameterInput(mass, '11'), null);
  assert.equal(parameterInput(mass, '0'), null);
  assert.equal(parameterInput(mass, ''), null);
  assert.equal(parameterInput(mass, 'abc'), null);
  assert.equal(parameterInput(distance, '1.3'), 1.5);
  assert.equal(parameterInput({ type: 'number', min: 0, max: 1 }, '0.333'), 0.333, 'no step: any value in range');
  assert.equal(parameterInput({ type: 'toggle' }, 0), false);
  const select = { type: 'select', options: [{ value: 9.8, label: 'Earth' }, { value: 1.6, label: 'Moon' }] };
  assert.equal(parameterInput(select, '1.6'), 1.6);
  assert.equal(parameterInput(select, 'Mars'), null);
  assert.equal(formatValue(mass, 2), '2 kg');
  assert.equal(formatValue(distance, 1), '1.0 m');
});

test('frame text: declared readouts in order with their units and decimals; the goal status and message', () => {
  const m = model(experimentArtifact());
  const view = frameView({ readouts: { tilt: 10, leftMoment: 6, rightMoment: 4 } }, m);
  assert.deepEqual(view.readouts.map(readoutText), ['6.00 kg m', '4.00 kg m', '10.0 deg']);
  assert.equal(frameView({ readouts: { tilt: 1 } }, m).readouts.length, 1, 'a readout the frame does not carry is not shown');
  const game = frameView({ readouts: { moves: 5 }, goal: { status: 'won', message: 'On target.' } }, model(gameArtifact()));
  assert.deepEqual(game.readouts.map(readoutText), ['5']);
  assert.equal(outcomeText(game.goal), 'On target.');
  assert.equal(outcomeText({ status: 'lost' }), 'Not solved');
  assert.equal(outcomeText(null), 'In progress');
});

test('failure words name what failed and what Retry repeats; no ellipsis anywhere', () => {
  assert.equal(retryLabel({ stage: 'renderer' }), 'Retry 3D view');
  assert.equal(retryLabel({ stage: 'artifact' }), 'Retry loading');
  assert.equal(retryLabel({ stage: 'runtime' }), 'Restart scene');
  assert.match(failureText(failureOf('runtime', new Error('worker timeout'))), /last good state is kept/);
  assert.doesNotMatch(failureText(failureOf('runtime', new Error('worker timeout'))), /worker timeout/, 'no internal diagnostics for a runtime stop');
  assert.match(invalidArtifact([{ code: 'unknown_id', path: 'scene.nodes.3.parent' }]).message, /unknown_id at scene\.nodes\.3\.parent/);
  for (const value of [WEBGL_UNAVAILABLE, FIXTURE_NOTE, INTERACT_LEGEND, failureText({ stage: 'artifact' }), failureText(null), retryLabel(null)]) noEllipsis(value);
});

test('a saved card\'s own words stand alone, and only retryable ones offer Retry; the WebGL check', () => {
  const missing = failureOf('artifact', Object.assign(new Error('This animation\'s saved scene is no longer available.'), { code: 'missing', retry: false }));
  assert.equal(failureText(missing), 'This animation\'s saved scene is no longer available.');
  assert.equal(missing.retry, false);
  assert.equal(failureOf('renderer', new Error('x')).retry, true);
  assert.equal(detectWebGL({ createElement: () => ({ getContext: kind => (kind === 'webgl' ? {} : null) }) }), true);
  assert.equal(detectWebGL({ createElement: () => ({ getContext: () => null }) }), false);
  assert.equal(detectWebGL({ createElement: () => { throw new Error('blocked'); } }), false);
  assert.equal(detectWebGL(undefined), false);
});
