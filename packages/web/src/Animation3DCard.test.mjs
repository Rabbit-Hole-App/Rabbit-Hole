// The Animation card (AN-03), mounted: the real Animation3DCard bundled with esbuild and rendered into linkedom (as
// cad-viewer-recovery.test.mjs mounts CadPreview), on the three contract fixtures. The scene runs in lane R's real runtime
// (runtime.js over the pinned QuickJS engine, in-process Worker, manual clock); the renderer is a stand-in (no WebGL in Node). A
// saved card hydrates through lane A's storage.js. This checks what each variant offers and that its controls drive the scene; it
// is not visual or browser evidence (V's e2e/animation-mvp-check.mjs covers widths, themes, wheel/drag and focus in a browser).
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { loadEngine, realRuntimes, stubRenderers, stubRuntimes } from './animation3d/testdata/ui-stubs.mjs';
import { experimentFixture } from './animation3d/fixtures.js';
import { artifactIdentity, freshEnvelope } from './animation3d/storage.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
// React checks once, at load, that the page has an input event ('oninput' in document); linkedom does not declare it.
document.oninput = null;
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { constructor(callback) { this.callback = callback; } observe(target) { this.callback([{ isIntersecting: true, target }]); } disconnect() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
// Bundled, React's act() queues its tasks through a MessageChannel, whose ports would keep the run alive after the last test.
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };

const dir = mkdtempSync(join(tmpdir(), 'animation-card-')), outfile = join(dir, 'card.cjs');
await esbuild.build({
  stdin: { contents: "export { default as Card } from './Animation3DCard.jsx'; export { resetViewers } from './viewer-slots.js'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'assets', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
before(loadEngine);

let root = null;
async function mount(props) {
  if (root) await B.act(async () => root.unmount());
  B.resetViewers();
  document.getElementById('app').innerHTML = '';
  root = B.createRoot(document.getElementById('app'));
  const runtimes = props.runtimes ?? realRuntimes(), renderers = props.renderers ?? stubRenderers(), changes = [];
  const { runtimes: _r, renderers: _d, ...rest } = props;
  const all = { onChange: next => changes.push(['change', next]), onChangeQuiet: next => changes.push(['quiet', next]), createRuntime: runtimes.factory, createRenderer: renderers.factory, webgl: true, ...rest };
  await B.act(async () => { root.render(B.createElement(B.Card, all)); });
  await settle();
  return { runtimes, renderers, changes };
}
const settle = async (rounds = 8) => { for (let i = 0; i < rounds; i++) await B.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const card = () => $('[data-animation3d-card]');
const press = async element => { await B.act(async () => { element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); }); await settle(); };
const readouts = () => Object.fromEntries($$('[data-animation-readout]').map(node => [node.getAttribute('data-animation-readout'), node.textContent]));
const raw = () => Object.fromEntries($$('[data-animation-readout]').map(node => [node.getAttribute('data-animation-readout'), Number(node.getAttribute('data-value'))]));
const buttons = () => $$('button').map(button => button.textContent.trim());
const noEllipsis = () => assert.doesNotMatch(card().textContent, /\.\.\.|…/);
// Typed as a person types: the prototype's value setter, so React's own value tracker sees the change.
const type = async (field, value) => {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await B.act(async () => { setValue.call(field, value); field.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await settle();
};
test.after(async () => { if (root) await B.act(async () => root.unmount()); });

test('watch fixture: header, Watch badge, labelled as an example; Play, Restart, Speed, Reset view; time and frame hooks follow playback', async () => {
  const { runtimes } = await mount({ block: { id: 'w1', type: 'animation3d', fixtureId: 'orbit-watch' } });
  assert.equal(card().getAttribute('data-animation-phase'), 'ready');
  assert.match(card().textContent, /Animation/);
  assert.equal($('[data-animation-badge]').textContent, 'Watch', 'the proposal\'s word for it');
  assert.equal($('[data-animation-fixture]').textContent, 'Example');
  assert.match($('[data-animation-fixture-note]').textContent, /not generated from a request/);
  assert.equal($('[data-animation-play]'), null, 'not /explain\'s play hook');
  assert.ok($('[data-animation3d-play]'));
  assert.ok($('[data-animation-restart]'));
  assert.deepEqual($$('[data-animation-speed] option').map(option => option.value), ['0.25', '0.5', '1', '2']);
  assert.ok($('[data-animation-reset-view]'));
  assert.equal($('[data-animation-parameters]'), null, 'no empty parameter panel');
  assert.equal($('[data-animation-reset]'), null);
  assert.equal(card().getAttribute('data-animation-duration'), '8');
  assert.equal(card().getAttribute('data-animation-time'), '0.000');
  assert.deepEqual(readouts(), { angle: '0 deg' });
  assert.deepEqual(JSON.parse($('[data-animation-viewport]').getAttribute('data-animation-frame')).nodes.moon.position, [3, 0, 0]);
  await press($('[data-animation3d-play]'));
  assert.equal($('[data-animation3d-play]').getAttribute('aria-pressed'), 'true');
  await B.act(async () => { runtimes.clock.frame(2000); });
  await settle();
  assert.equal(card().getAttribute('data-animation-time'), '2.000');
  assert.equal(raw().angle, 90);
  const moon = JSON.parse($('[data-animation-viewport]').getAttribute('data-animation-frame')).nodes.moon.position;
  assert.ok(Math.abs(moon[0]) < 1e-9 && Math.abs(moon[2] - 3) < 1e-9, `the quarter-loop moon: ${moon}`);
  await press($('[data-animation3d-play]'));
  assert.equal($('[data-animation3d-play]').textContent.trim(), 'Play');
  assert.match($('[data-animation-description]').textContent, /blue planet/, 'the accessible scene description');
  noEllipsis();
});

test('an example card switches among the three built-in examples; the saved card then shows the new one', async () => {
  const { changes } = await mount({ runtimes: stubRuntimes(), block: { id: 'x2', type: 'animation3d', fixtureId: 'orbit-watch' } });
  const picker = $('[data-animation3d-example]');
  assert.deepEqual([...picker.querySelectorAll('option')].map(option => option.value), ['orbit-watch', 'beam-balance-experiment', 'grid-robot-game']);
  assert.equal(picker.value, 'orbit-watch');
  // linkedom's select.value is read-only: choose the option itself, as a person's pick does.
  for (const option of picker.querySelectorAll('option')) option.toggleAttribute('selected', option.value === 'grid-robot-game');
  await B.act(async () => { picker.dispatchEvent(new window.Event('change', { bubbles: true })); });
  const [kind, next] = changes.at(-1);
  assert.equal(kind, 'change');
  assert.deepEqual([next.fixtureId, next.title], ['grid-robot-game', 'Grid robot']);
  await mount({ runtimes: stubRuntimes(), block: next });
  assert.equal($('[data-animation-badge]').textContent, 'Mini-game');
  await mount({ runtimes: stubRuntimes(), readOnly: true, block: next });
  assert.equal($('[data-animation3d-example]').disabled, true, 'a read-only viewer sees it greyed, named');
});

test('experiment fixture: number rows with units and typed alternatives; a change moves geometry and readouts together; Reset scene restores them', async () => {
  const { renderers, changes } = await mount({ block: { id: 'e1', type: 'animation3d', fixtureId: 'beam-balance-experiment' } });
  assert.equal($('[data-animation-badge]').textContent, 'Experiment');
  assert.equal($('[data-animation3d-play]'), null, 'no transport for an experiment without a timeline');
  assert.deepEqual($$('[data-animation-parameter]').map(node => node.getAttribute('data-animation-parameter')), ['leftMass', 'leftDistance', 'rightMass', 'rightDistance']);
  const field = $('[data-animation-number="leftMass"]');
  assert.equal(field.getAttribute('aria-label'), 'Left mass in kg');
  assert.deepEqual(readouts(), { leftMoment: '6.00 kg m', rightMoment: '4.00 kg m', tilt: '10.0 deg' });
  assert.deepEqual(raw(), { leftMoment: 6, rightMoment: 4, tilt: 10 });
  assert.equal($('[data-animation-reset]').disabled, true, 'nothing to reset yet; the name stays');
  assert.equal($('[data-animation-reset]').textContent.trim(), 'Reset scene');
  await type(field, '2');
  assert.deepEqual(raw(), { leftMoment: 3, rightMoment: 4, tilt: -5 });
  const frame = renderers.made.find(made => !made.disposed).frames.at(-1);
  assert.equal(frame.readouts.tilt, -5, 'the renderer got the same frame the readouts came from');
  assert.deepEqual(frame.nodes.leftWeight.position, [-1.5, 0.25, 0]);
  assert.equal($('[data-animation-reset]').disabled, false);
  await press($('[data-animation-reset]'));
  assert.deepEqual(raw(), { leftMoment: 6, rightMoment: 4, tilt: 10 });
  assert.deepEqual(changes, [], 'an example card keeps its state in this page: no board write');
  noEllipsis();
});

test('game fixture: goal, outcome from the program, its moves as buttons, hint on request; winning and resetting', async () => {
  await mount({ block: { id: 'g1', type: 'animation3d', fixtureId: 'grid-robot-game' } });
  assert.equal($('[data-animation-badge]').textContent, 'Mini-game');
  assert.match($('[data-animation-goal]').textContent, /Move the robot onto the target square/);
  assert.equal($('[data-animation-outcome]').textContent.trim(), 'Reach the target.');
  assert.deepEqual($$('[data-animation-action]').map(node => node.textContent), ['East', 'West', 'North', 'South']);
  assert.equal($('[data-animation-hint-text]'), null, 'the hint waits until asked');
  await press($('[data-animation-hint]'));
  assert.match($('[data-animation-hint-text]').textContent, /3 squares east and 2 squares south/);
  for (const move of ['east', 'east', 'east', 'south', 'south']) await press($(`[data-animation-action="${move}"]`));
  assert.equal($('[data-animation-game]').getAttribute('data-animation-game'), 'won');
  assert.equal($('[data-animation-outcome]').textContent.trim(), 'On target.');
  assert.equal(raw().moves, 5);
  await press($('[data-animation-action="west"]'));
  assert.equal(raw().moves, 5, 'a move after winning is ignored by the rules');
  await press($('[data-animation-reset]'));
  assert.equal($('[data-animation-game]').getAttribute('data-animation-game'), 'playing');
  assert.equal(raw().moves, 0);
  noEllipsis();
});

test('Interact: entered from the footer once the 3D view is live; Done hands it back; the renderer follows', async () => {
  const { renderers } = await mount({ runtimes: stubRuntimes(), block: { id: 'i1', type: 'animation3d', fixtureId: 'orbit-watch' } });
  assert.equal($('[data-animation-interact]').textContent.trim(), 'Interact');
  await press($('[data-animation-interact]'));
  assert.equal($('[data-animation-interact]').textContent.trim(), 'Done');
  assert.equal($('[data-animation-viewport]').getAttribute('data-viewer-active'), 'true');
  assert.ok($('[data-animation-legend]'));
  assert.equal($('[data-animation-click-surface]'), null);
  await press($('[data-animation-interact]'));
  assert.equal($('[data-animation-viewport]').getAttribute('data-viewer-active'), null);
  assert.deepEqual(renderers.made[0].interactive, [true, false]);
});

test('no WebGL: the description is shown with an honest notice; no camera controls; experiment readouts still work', async () => {
  const { renderers } = await mount({ webgl: false, block: { id: 'n1', type: 'animation3d', fixtureId: 'beam-balance-experiment' } });
  assert.equal(card().getAttribute('data-animation-phase'), 'unavailable');
  assert.match($('[data-animation-webgl-unavailable]').textContent, /not available in this browser/);
  assert.equal($('[data-animation-description]').className.includes('sr-only'), false, 'the description is visible');
  assert.equal($('[data-animation-reset-view]'), null);
  assert.equal($('[data-animation-interact]'), null);
  assert.equal(renderers.made.length, 0);
  await type($('[data-animation-number="rightMass"]'), '3');
  assert.deepEqual(raw(), { leftMoment: 6, rightMoment: 6, tilt: 0 });
});

test('a 3D view that fails: a targeted Retry 3D view, never a page reload; the controls stay usable', async () => {
  let fail = true;
  const renderers = stubRenderers({ load: () => Promise.resolve(fail ? { ok: false, code: 'invalid_artifact', issues: [{ message: 'over budget' }] } : { ok: true }) });
  await mount({ renderers, runtimes: stubRuntimes(), block: { id: 'f1', type: 'animation3d', fixtureId: 'beam-balance-experiment' } });
  assert.equal(card().getAttribute('data-animation-phase'), 'recovery');
  assert.equal($('[data-animation-failure]').getAttribute('data-animation-failure'), 'renderer');
  assert.equal($('[data-animation-retry]').textContent.trim(), 'Retry 3D view');
  assert.equal($('[data-animation-number="leftMass"]').disabled, false);
  fail = false;
  await press($('[data-animation-retry]'));
  assert.equal(card().getAttribute('data-animation-phase'), 'ready');
  assert.equal(renderers.made.length, 2);
});

test('an unknown example name: an honest message and no Retry', async () => {
  await mount({ runtimes: stubRuntimes(), block: { id: 'x1', type: 'animation3d', fixtureId: 'no-such-fixture' } });
  assert.equal(card().getAttribute('data-animation-phase'), 'recovery');
  assert.match($('[data-animation-failure]').textContent, /This example is not available/);
  assert.equal($('[data-animation-retry]'), null);
});

// A saved card (storage.js envelope) of the beam-balance artifact, as an accepted result would leave it on board b1.
const savedCard = (over = {}) => ({ id: 's1', type: 'animation3d', title: 'Beam balance',
  animation3d: freshEnvelope({ ...artifactIdentity(experimentFixture.artifact), boardId: 'b1', cardId: 's1' }), ...over });
const readFixture = calls => async ref => { calls.push(ref.artifactId); return structuredClone(experimentFixture.artifact); };

test('a saved card (owner): hydrated through storage.js, its settled change written quietly into its envelope', async () => {
  const calls = [];
  const { changes } = await mount({ block: savedCard(), context: { kind: 'owner', boardId: 'b1' }, readArtifact: readFixture(calls) });
  assert.deepEqual(calls, ['fixture-beam-balance'], 'read once by its immutable id');
  assert.equal(card().getAttribute('data-animation-phase'), 'ready');
  assert.equal($('[data-animation-fixture]')?.textContent, 'Example', 'the fixture provenance still shows');
  await type($('[data-animation-number="leftMass"]'), '2');
  await new Promise(resolve => setTimeout(resolve, 500)); // storage.js SAVE_DELAY
  await settle();
  const quiet = changes.filter(([kind]) => kind === 'quiet').map(([, block]) => block);
  assert.ok(quiet.length >= 1, 'the change reached the board quietly');
  assert.equal(quiet.at(-1).animation3d.sim.inputs.leftMass, 2);
  assert.ok(!changes.some(([kind]) => kind === 'change'), 'never an undo step');
});

test('a saved card on a share link: the honest placeholder, no owner read and no Retry', async () => {
  const calls = [];
  await mount({ runtimes: stubRuntimes(), block: savedCard(), context: { kind: 'share', boardId: 'b1' }, readArtifact: readFixture(calls) });
  assert.deepEqual(calls, []);
  assert.match($('[data-animation-failure]').textContent, /shared canvases are not available yet/);
  assert.equal($('[data-animation-retry]'), null);
});

const job = (over = {}) => ({ id: 'j1', boardId: 'b1', cardId: 'p1', requestId: 'r1', sourceKey: 'k', baseRevision: null, stage: 'queued', ...over });
test('a pending job: the server\'s stage and Stop; Stop asks the server and stops waiting at once; another card\'s result is ignored', async () => {
  const calls = [];
  let answer = { job: { ...job({ stage: 'authoring' }) } };
  const fetchJson = async (path, options = {}) => { calls.push([options.method || 'GET', path]); return answer; };
  const { changes } = await mount({ fetchJson, block: { id: 'p1', type: 'animation3d', title: 'Lever', animation3dJob: job() } });
  assert.equal($('[data-animation-pending]').getAttribute('data-animation-pending'), 'authoring');
  assert.equal($('[data-animation-stage]').textContent, 'Building the scene');
  assert.deepEqual(buttons(), ['Stop']);
  assert.deepEqual(changes.at(-1)[0], 'quiet', 'the stage rides on the card quietly');
  answer = { job: job({ stage: 'ready', result: { cardId: 'other', canvas: { boardId: 'b1' }, sourceKey: 'k' } }) };
  await press($('[data-animation-stop]'));
  assert.deepEqual(calls.at(-1), ['POST', '/api/learn/animation/jobs/j1/cancel']);
  assert.equal(changes.at(-1)[1].animation3dJob.stage, 'cancelled');
  assert.ok(!changes.some(([, next]) => next.animation3d), 'another card\'s result never lands here');
});

test('a failed job: its message and the job\'s own retry', async () => {
  const fetchJson = async () => ({ job: job({ id: 'j2', cardId: 'p2', stage: 'failed', terminal: true, attempt: 1, failure: { message: 'The scene could not be checked.' }, recovery: ['new_attempt'] }) });
  await mount({ fetchJson, block: { id: 'p2', type: 'animation3d', title: 'Lever', promptUsed: '/animation a lever', animation3dJob: job({ id: 'j2', cardId: 'p2', stage: 'failed', message: 'The scene could not be checked.' }) } });
  assert.equal($('[data-animation-stage]').textContent, 'The scene could not be checked.');
  assert.match(card().textContent, /Your request: \/animation a lever/);
  assert.equal($('[data-animation-job-retry]').textContent.trim(), 'Try again');
});
