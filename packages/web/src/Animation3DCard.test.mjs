// The Animation card (AN-03), mounted: the real Animation3DCard bundled with esbuild and rendered into linkedom (as
// cad-viewer-recovery.test.mjs mounts CadPreview), on the three contract fixtures with stub runtime and renderer factories
// (animation3d/testdata/ui-stubs.mjs). It checks what each variant offers and that its controls drive the scene; it is not
// visual or browser evidence (lane V's browser checks cover widths, themes, wheel/drag and focus in a real browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { stubRenderers, stubRuntimes } from './animation3d/testdata/ui-stubs.mjs';

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

let root = null;
async function mount(props) {
  if (root) await B.act(async () => root.unmount());
  B.resetViewers();
  document.getElementById('app').innerHTML = '';
  root = B.createRoot(document.getElementById('app'));
  const runtimes = props.runtimes ?? stubRuntimes(), renderers = props.renderers ?? stubRenderers(), changes = [];
  const all = { onChange: next => changes.push(['change', next]), onChangeQuiet: next => changes.push(['quiet', next]), createRuntime: runtimes.factory, createRenderer: renderers.factory, webgl: true, ...props };
  await B.act(async () => { root.render(B.createElement(B.Card, all)); });
  await settle();
  return { runtimes, renderers, changes };
}
const settle = async () => { for (let i = 0; i < 6; i++) await B.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const card = () => $('[data-animation3d-card]');
const press = async element => { await B.act(async () => { element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); }); await settle(); };
const readouts = () => Object.fromEntries($$('[data-animation-readout]').map(node => [node.getAttribute('data-animation-readout'), node.textContent]));
const buttons = () => $$('button').map(button => button.textContent.trim());
const noEllipsis = () => assert.doesNotMatch(card().textContent, /\.\.\.|…/);
test.after(async () => { if (root) await B.act(async () => root.unmount()); });

test('watch fixture: Animation header, Loop badge, labelled as an example; Play, Restart, Speed and Reset view; no parameters, no Reset scene', async () => {
  const { runtimes } = await mount({ block: { id: 'w1', type: 'animation3d', fixtureId: 'orbit-watch' } });
  assert.equal(card().getAttribute('data-animation-phase'), 'ready');
  assert.match(card().textContent, /Animation/);
  assert.equal($('[data-animation-badge]').textContent, 'Loop');
  assert.equal($('[data-animation-fixture]').textContent, 'Example');
  assert.match($('[data-animation-fixture-note]').textContent, /not generated from a request/);
  assert.ok($('[data-animation-play]'));
  assert.ok($('[data-animation-restart]'));
  assert.deepEqual($$('[data-animation-speed] option').map(option => option.textContent), ['0.25x', '0.5x', '1x', '2x']);
  assert.ok($('[data-animation-reset-view]'));
  assert.equal($('[data-animation-parameters]'), null, 'no empty parameter panel');
  assert.equal($('[data-animation-reset]'), null);
  assert.equal($('[data-animation-game]'), null);
  assert.equal(readouts().angle, '0 deg');
  await press($('[data-animation-play]'));
  assert.equal($('[data-animation-play]').textContent.trim(), 'Pause');
  assert.deepEqual(runtimes.log, ['play']);
  assert.match($('[data-animation-description]').textContent, /blue planet/, 'the accessible scene description');
  noEllipsis();
});

test('experiment fixture: number rows with units and typed alternatives; a change moves geometry and readouts together; Reset scene restores them', async () => {
  const { renderers, changes } = await mount({ block: { id: 'e1', type: 'animation3d', fixtureId: 'beam-balance-experiment' } });
  assert.equal($('[data-animation-badge]').textContent, 'Experiment');
  assert.equal($('[data-animation-play]'), null, 'no transport for an experiment without a timeline');
  assert.deepEqual($$('[data-animation-parameter]').map(node => node.getAttribute('data-animation-parameter')), ['leftMass', 'leftDistance', 'rightMass', 'rightDistance']);
  const field = $('[data-animation-number="leftMass"]');
  assert.equal(field.getAttribute('aria-label'), 'Left mass in kg');
  assert.deepEqual(readouts(), { leftMoment: '6.00 kg m', rightMoment: '4.00 kg m', tilt: '10.0 deg' });
  assert.equal($('[data-animation-reset]').disabled, true, 'nothing to reset yet; the name stays');
  assert.equal($('[data-animation-reset]').textContent.trim(), 'Reset scene');
  // Typed as a person types: the prototype's value setter, so React's own value tracker sees the change.
  const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set ?? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await B.act(async () => { setValue.call(field, '2'); field.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await settle();
  assert.deepEqual(readouts(), { leftMoment: '3.00 kg m', rightMoment: '4.00 kg m', tilt: '-5.0 deg' });
  const frame = renderers.made[0].frames.at(-1);
  assert.equal(frame.readouts.tilt, -5, 'the renderer got the same frame the readouts came from');
  assert.equal($('[data-animation-reset]').disabled, false);
  await press($('[data-animation-reset]'));
  assert.deepEqual(readouts(), { leftMoment: '6.00 kg m', rightMoment: '4.00 kg m', tilt: '10.0 deg' });
  assert.ok(changes.length === 0 || changes.every(([kind]) => kind === 'quiet'), 'settled state saves quietly, never an undo step per change');
  noEllipsis();
});

test('game fixture: goal, outcome from the scene, its moves as buttons, hint on request; winning and resetting', async () => {
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
  assert.equal(readouts().moves, '5');
  await press($('[data-animation-reset]'));
  assert.equal($('[data-animation-game]').getAttribute('data-animation-game'), 'playing');
  assert.equal(readouts().moves, '0');
  noEllipsis();
});

test('Interact: entered from the footer once the 3D view is live; Done hands it back; the renderer follows', async () => {
  const { renderers } = await mount({ block: { id: 'i1', type: 'animation3d', fixtureId: 'orbit-watch' } });
  const interact = $('[data-animation-interact]');
  assert.equal(interact.textContent.trim(), 'Interact');
  await press(interact);
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
  assert.deepEqual(readouts(), { leftMoment: '6.00 kg m', rightMoment: '4.00 kg m', tilt: '10.0 deg' });
});

test('a 3D view that fails: a targeted Retry 3D view, never a page reload; the controls stay usable', async () => {
  let fail = true;
  const renderers = stubRenderers({ load: () => (fail ? Promise.reject(new Error('context lost')) : Promise.resolve({ ok: true })) });
  await mount({ renderers, block: { id: 'f1', type: 'animation3d', fixtureId: 'beam-balance-experiment' } });
  assert.equal(card().getAttribute('data-animation-phase'), 'recovery');
  assert.equal($('[data-animation-failure]').getAttribute('data-animation-failure'), 'renderer');
  assert.equal($('[data-animation-retry]').textContent.trim(), 'Retry 3D view');
  assert.equal($('[data-animation-number="leftMass"]').disabled, false);
  fail = false;
  await press($('[data-animation-retry]'));
  assert.equal(card().getAttribute('data-animation-phase'), 'ready');
  assert.equal(renderers.made.length, 2);
});

test('an unknown example name fails as unreadable with Retry loading', async () => {
  await mount({ block: { id: 'x1', type: 'animation3d', fixtureId: 'no-such-fixture' } });
  assert.equal(card().getAttribute('data-animation-phase'), 'recovery');
  assert.equal($('[data-animation-retry]').textContent.trim(), 'Retry loading');
});

test('a pending job: the server\'s stage, Stop; a ready result for this card replaces it once; another card\'s result is ignored', async () => {
  const calls = [];
  let answer = { job: { id: 'j1', cardId: 'p1', boardId: 'b1', requestId: 'r1', stage: 'authoring' } };
  const fetchJson = async (path, options = {}) => { calls.push([options.method || 'GET', path]); return answer; };
  const { changes } = await mount({ fetchJson, block: { id: 'p1', type: 'animation3d', title: 'Lever', animationJob: { id: 'j1', boardId: 'b1', stage: 'queued', requestId: 'r1' } } });
  assert.equal($('[data-animation-pending]').getAttribute('data-animation-pending'), 'authoring');
  assert.equal($('[data-animation-stage]').textContent, 'Building the scene');
  assert.deepEqual(buttons(), ['Stop']);
  assert.deepEqual(changes.at(-1)[0], 'quiet', 'the stage rides on the card quietly');
  answer = { job: { id: 'j1', cardId: 'p1', boardId: 'b1', requestId: 'r1', stage: 'cancelled' }, result: { cardId: 'other', boardId: 'b1', artifactRef: { id: 'a1', boardId: 'b1' } } };
  await press($('[data-animation-stop]'));
  assert.deepEqual(calls.at(-1), ['POST', '/api/learn/animation/jobs/j1/cancel']);
  assert.ok(!changes.some(([kind, next]) => kind === 'change' && next.artifactRef), 'another card\'s result never lands here');
});

test('a failed job: its message and the job\'s own retry', async () => {
  const fetchJson = async () => ({ job: { id: 'j2', cardId: 'p2', boardId: 'b1', stage: 'failed', terminal: true, attempt: 1, failure: { message: 'The scene could not be checked.' }, recovery: ['new_attempt'] } });
  await mount({ fetchJson, block: { id: 'p2', type: 'animation3d', title: 'Lever', promptUsed: '/animation a lever', animationJob: { id: 'j2', boardId: 'b1', stage: 'failed' } } });
  assert.equal($('[data-animation-stage]').textContent, 'The scene could not be checked.');
  assert.match(card().textContent, /Your request: \/animation a lever/);
  assert.equal($('[data-animation-job-retry]').textContent.trim(), 'Try again');
});
