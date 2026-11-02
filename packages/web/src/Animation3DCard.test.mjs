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
import { experimentFixture, gameFixture } from './animation3d/fixtures.js';
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
  stdin: { contents: "export { default as Card } from './Animation3DCard.jsx'; export { resetViewers } from './viewer-slots.js'; export { AnimationBoard } from './animation3d/board-context.js'; export { leadControls, Toolbar } from './animation3d/Controls.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
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
  assert.equal($('[data-animation-primary-readout]'), null, 'a watch scene has no prominent readout');
  assert.equal($('[data-animation-readout="angle"]').closest('details'), null, 'its readouts stay in the plain list');
  assert.equal($('[data-animation-more]'), null, 'nothing collapsed');
  assert.equal($('[data-animation-restart]').textContent.trim(), 'Restart', 'a seekable loop restarts keeping its settings');
  // One toolbar under the viewport: playback, its status, then the view's own controls.
  assert.deepEqual($$('[data-animation-toolbar] button').map(button => button.textContent.trim()), ['Play', 'Restart', 'Reset view', 'Interact']);
  assert.equal($('[data-animation-playback-status]').textContent, 'Paused');
  assert.equal($('[data-animation-labels]'), null, 'no optional labels declared by this renderer: no Labels toggle');
  assert.deepEqual(JSON.parse($('[data-animation-viewport]').getAttribute('data-animation-frame')).nodes.moon.position, [3, 0, 0]);
  await press($('[data-animation3d-play]'));
  assert.equal($('[data-animation3d-play]').getAttribute('aria-pressed'), 'true');
  assert.equal($('[data-animation-playback-status]').textContent, 'Playing');
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

test('experiment fixture: number rows with units and typed alternatives; the first leads, the rest collapsed; a change moves geometry and readouts together; Reset experiment restores them', async () => {
  const { renderers, changes } = await mount({ block: { id: 'e1', type: 'animation3d', fixtureId: 'beam-balance-experiment' } });
  assert.equal($('[data-animation-badge]').textContent, 'Experiment');
  assert.equal($('[data-animation3d-play]'), null, 'no transport for an experiment without a timeline');
  assert.deepEqual($$('[data-animation-parameter]').map(node => node.getAttribute('data-animation-parameter')), ['leftMass', 'leftDistance', 'rightMass', 'rightDistance']);
  const field = $('[data-animation-number="leftMass"]');
  assert.equal(field.getAttribute('aria-label'), 'Left mass in kg');
  assert.deepEqual(readouts(), { leftMoment: '6.00 kg m', rightMoment: '4.00 kg m', tilt: '10.0 deg' });
  assert.deepEqual(raw(), { leftMoment: 6, rightMoment: 4, tilt: 10 });
  // The plan's first parameter and first readout lead; the rest wait collapsed under their own labels.
  const more = $('[data-animation-more="settings"]');
  assert.equal(field.closest('details'), null, 'the primary control is never collapsed');
  assert.equal(more.hasAttribute('open'), false);
  assert.equal(more.querySelector('summary').textContent, 'More settings');
  assert.deepEqual([...more.querySelectorAll('[data-animation-parameter]')].map(node => node.getAttribute('data-animation-parameter')), ['leftDistance', 'rightMass', 'rightDistance']);
  assert.ok($('[data-animation-viewport] [data-animation-readout="leftMoment"]'), 'the first readout over the scene');
  const moreReadouts = $('[data-animation-more="readouts"]');
  assert.equal(moreReadouts.hasAttribute('open'), false);
  assert.equal(moreReadouts.querySelector('summary').textContent, 'More readouts');
  assert.deepEqual([...moreReadouts.querySelectorAll('[data-animation-readout]')].map(node => node.getAttribute('data-animation-readout')), ['rightMoment', 'tilt']);
  assert.equal($('[data-animation-playback-status]'), null, 'no playback, no status');
  assert.equal($$('[data-animation-reset]').length, 1, 'one state reset');
  assert.equal($('[data-animation-reset]').disabled, true, 'nothing to reset yet; the name stays');
  assert.equal($('[data-animation-reset]').textContent.trim(), 'Reset experiment');
  assert.ok($('[data-animation-reset]').closest('[data-animation-parameters]'), 'beside the settings it affects');
  assert.match(document.getElementById($('[data-animation-reset]').getAttribute('aria-describedby')).textContent, /starting value.*camera stays/);
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
  assert.ok($$('[data-animation-action]').every(node => !node.closest('details')), 'a game\'s moves are its primary controls, never collapsed');
  assert.equal($('[data-animation-parameters]'), null, 'no parameters, no settings section');
  assert.ok($('[data-animation-viewport] [data-animation-readout="moves"]'), 'its first readout (its moves) over the scene');
  assert.equal($$('[data-animation-reset]').length, 1, 'one state reset');
  assert.equal($('[data-animation-reset]').textContent.trim(), 'Reset game');
  assert.ok($('[data-animation-reset]').closest('[data-animation-actions]'), 'no settings: beside the moves');
  assert.equal($('[data-animation-restart]'), null, 'nothing to rewind');
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

// Directional keys (owner 2026-11-01): a scene that declares keys (fixtures.js gameFixture: up north, down south, left west, right
// east) is played with WASD or the arrow keys while its card interacts, through the buttons' own path.
const keydown = async (target, key, over = {}) => {
  const event = Object.assign(new window.Event('keydown', { bubbles: true, cancelable: true }), { key, repeat: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...over });
  await B.act(async () => { target.dispatchEvent(event); });
  await settle();
  return event;
};
const gameState = (scope = document) => ({
  robot: JSON.parse(scope.querySelector('[data-animation-viewport]').getAttribute('data-animation-frame')).nodes.robot.position,
  moves: Number(scope.querySelector('[data-animation-readout="moves"]').getAttribute('data-value')),
  status: scope.querySelector('[data-animation-game]').getAttribute('data-animation-game'),
});
const gameBlock = (id = 'k1') => ({ id, type: 'animation3d', fixtureId: 'grid-robot-game' });
const actionsSent = log => log.filter(event => event?.type === 'action').map(event => event.action);
const interacting = (scope = document) => scope.querySelector('[data-animation-viewport]').hasAttribute('data-viewer-active');
const KEYS = ['w', 'ArrowUp', 'a', 'ArrowLeft', 'd', 'ArrowRight', 's', 'ArrowDown', 'D'];
const MOVES = ['north', 'north', 'west', 'west', 'east', 'east', 'south', 'south', 'east'];

test('game keys: WASD and the arrow keys press the declared moves on the buttons\' own path: the same events, frames, moves and win', async () => {
  await mount({ block: gameBlock() });
  const byButton = [];
  for (const move of MOVES) { await press($(`[data-animation-action="${move}"]`)); byButton.push(gameState()); }
  await mount({ block: gameBlock() });
  await press($('[data-animation-interact]'));
  const byKey = [];
  for (const key of KEYS) { const event = await keydown($('[data-animation-viewport]'), key); assert.equal(event.defaultPrevented, true, `${key} is taken`); byKey.push(gameState()); }
  assert.deepEqual(byKey, byButton, 'every key step matches the button step');
  assert.deepEqual(byKey.at(-1), { robot: [3, 0.3, 2], moves: 9, status: 'won' });
  assert.equal((await keydown($('[data-animation-viewport]'), 'ArrowLeft')).defaultPrevented, true);
  assert.deepEqual(gameState(), byKey.at(-1), 'a move after winning is ignored by the rules, as a button press is');
  // The runtime hears exactly what the buttons send.
  const sent = async drive => { const runtimes = stubRuntimes(); await mount({ runtimes, block: gameBlock() }); await drive(); return actionsSent(runtimes.log); };
  const buttons = await sent(async () => { for (const move of MOVES) await press($(`[data-animation-action="${move}"]`)); });
  const keys = await sent(async () => { await press($('[data-animation-interact]')); for (const key of KEYS) await keydown($('[data-animation-viewport]'), key); });
  assert.deepEqual(buttons, MOVES);
  assert.deepEqual(keys, buttons);
});

test('game keys: only while interacting; a held key moves once; chords and other keys pass; nothing while the moves are disabled; the hint only with bindings', async () => {
  const runtimes = stubRuntimes();
  await mount({ runtimes, block: gameBlock() });
  const viewport = () => $('[data-animation-viewport]');
  assert.equal((await keydown(viewport(), 'ArrowRight')).defaultPrevented, false, 'before Interact the key is the page\'s');
  assert.deepEqual(actionsSent(runtimes.log), []);
  await press($('[data-animation-interact]'));
  assert.equal($('[data-animation-keys-hint]').textContent, 'Move: WASD / arrow keys · Esc to exit');
  assert.ok($('[data-animation-keys-hint]').closest('[data-animation-legend]'));
  await keydown(viewport(), 'ArrowRight');
  const held = await keydown(viewport(), 'ArrowRight', { repeat: true });
  await keydown(viewport(), 'd', { repeat: true });
  assert.equal(held.defaultPrevented, true, 'a repeat is still taken (no page scroll)');
  assert.deepEqual(actionsSent(runtimes.log), ['east'], 'one move per press; auto-repeat sends nothing');
  for (const [key, over] of [['ArrowRight', { ctrlKey: true }], ['d', { metaKey: true }], ['a', { altKey: true }], ['x', {}], [' ', {}], ['Enter', {}], ['PageDown', {}]]) {
    assert.equal((await keydown(viewport(), key, over)).defaultPrevented, false, `${key} ${JSON.stringify(over)} passes`);
  }
  assert.deepEqual(actionsSent(runtimes.log), ['east']);
  // The moves disabled (the runtime stopped): the keys send nothing either.
  await B.act(async () => { runtimes.made[0].fail(Object.assign(new Error('stopped'), { code: 'timeout' })); });
  await settle();
  assert.equal($('[data-animation-action="east"]').disabled, true);
  await keydown(viewport(), 'd');
  assert.deepEqual(actionsSent(runtimes.log), ['east'], 'a disabled move is not sent by a key');
  // A scene with no bindings: no hint, and the arrows stay the page's.
  await mount({ runtimes: stubRuntimes(), block: { id: 'e1', type: 'animation3d', fixtureId: 'beam-balance-experiment' } });
  await press($('[data-animation-interact]'));
  assert.ok($('[data-animation-legend]'));
  assert.equal($('[data-animation-keys-hint]'), null);
  assert.equal((await keydown(viewport(), 'ArrowUp')).defaultPrevented, false);
});

test('game keys: fields, sliders, selects, editable text and dialogs inside the card keep their keys; a field outside never moves it', async () => {
  const runtimes = stubRuntimes();
  await mount({ runtimes, block: gameBlock() });
  await press($('[data-animation-interact]'));
  const make = html => { const holder = document.createElement('div'); holder.innerHTML = html; return holder.firstChild; };
  const inside = [
    ['<input type="text">'], ['<textarea></textarea>'], ['<select><option>a</option></select>'], ['<input type="range">'],
    ['<div contenteditable="true"></div>', node => node], ['<div role="dialog"><button type="button">OK</button></div>', node => node.firstChild],
    ['<div aria-modal="true"><button type="button">OK</button></div>', node => node.firstChild],
  ];
  for (const [html, pick = node => node] of inside) {
    const node = make(html);
    $('[data-animation-controls]').appendChild(node);
    for (const key of ['ArrowLeft', 'd']) assert.equal((await keydown(pick(node), key)).defaultPrevented, false, `${html} keeps ${key}`);
    node.remove();
  }
  const chat = document.createElement('textarea');
  document.body.appendChild(chat);
  await keydown(chat, 'ArrowRight');
  chat.remove();
  assert.deepEqual(actionsSent(runtimes.log), [], 'no key typed in a field moved the scene');
  assert.equal(interacting(), true, 'still interacting');
  await keydown($('[data-animation-action="east"]'), 'ArrowDown');
  assert.deepEqual(actionsSent(runtimes.log), ['south'], 'a key with the focus on a move button still plays: the card is the one interacting');
});

test('game keys: two cards on one canvas: only the interacting card moves; switching cards, Escape, blur and a hidden tab leave nothing held', async () => {
  if (root) await B.act(async () => root.unmount());
  B.resetViewers();
  document.getElementById('app').innerHTML = '';
  root = B.createRoot(document.getElementById('app'));
  const runtimes = realRuntimes(), renderers = stubRenderers();
  const props = block => ({ key: block.id, block, onChange() {}, onChangeQuiet() {}, createRuntime: runtimes.factory, createRenderer: renderers.factory, webgl: true });
  await B.act(async () => { root.render(B.createElement('div', null, B.createElement(B.Card, props(gameBlock('ka'))), B.createElement(B.Card, props(gameBlock('kb'))))); });
  await settle();
  const [a, b] = $$('[data-animation3d-card]');
  const at = (card, selector) => card.querySelector(selector);
  await press(at(a, '[data-animation-interact]'));
  await keydown(at(a, '[data-animation-viewport]'), 'd');
  assert.deepEqual([gameState(a).moves, gameState(b).moves], [1, 0]);
  await press(at(b, '[data-animation-interact]'));
  assert.deepEqual([interacting(a), interacting(b)], [false, true], 'entering one card ends the other');
  assert.equal((await keydown(at(a, '[data-animation-viewport]'), 'd')).defaultPrevented, false, 'the card left behind takes no key');
  await keydown(at(b, '[data-animation-viewport]'), 's');
  assert.deepEqual([gameState(a).robot, gameState(b).robot], [[1, 0.3, 0], [0, 0.3, 1]], 'each card moved only by its own keys');
  await B.act(async () => { window.dispatchEvent(Object.assign(new window.Event('keydown', { bubbles: true, cancelable: true }), { key: 'Escape' })); });
  await settle();
  assert.equal(interacting(b), false, 'Escape ends the interaction');
  assert.equal((await keydown(at(b, '[data-animation-viewport]'), 's')).defaultPrevented, false, 'after Escape the keys are the page\'s again');
  assert.equal(gameState(b).moves, 1);
  // Window blur and a hidden tab while a key is down: the key's repeats after coming back move nothing; the next press moves once.
  await press(at(b, '[data-animation-interact]'));
  for (const lose of [() => window.dispatchEvent(new window.Event('blur')), () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
    delete document.hidden;
  }]) {
    const before = gameState(b).moves;
    await B.act(async () => { lose(); });
    await settle();
    await keydown(at(b, '[data-animation-viewport]'), 'd', { repeat: true });
    assert.equal(gameState(b).moves, before, 'a held key does not keep moving');
    await keydown(at(b, '[data-animation-viewport]'), 'd');
    assert.equal(gameState(b).moves, before + 1, 'a fresh press moves once');
  }
  assert.equal(gameState(a).moves, 1, 'the other card never moved');
});

// The primary/secondary split (owner 2026-10-31): the plan's first parameter leads (a game's moves instead); a prominent readout
// only for an experiment (its first) or a game (its first, if any), never a watch or inspect scene.
test('leadControls: first parameter primary, the rest secondary; a prominent readout by experience; none when empty', () => {
  const p = id => ({ id, type: 'number', label: id, min: 0, max: 1, default: 0 });
  const model = (experience, parameters, actions = [], readouts = []) => ({ experience, parameters, actions, readouts });
  const a = p('a'), b = p('b'), c = p('c'), r = [{ id: 'r1' }, { id: 'r2' }];
  assert.deepEqual(B.leadControls(model('experiment', [a, b, c], [], r)), { primary: a, secondary: [b, c], readout: 'r1' });
  assert.deepEqual(B.leadControls(model('experiment', [])), { primary: null, secondary: [], readout: null }, 'no parameters, no readouts: nothing leads');
  assert.deepEqual(B.leadControls(model('watch', [a], [], r)), { primary: a, secondary: [], readout: null }, 'a watch scene: no prominent readout');
  assert.equal(B.leadControls(model('inspect', [], [], r)).readout, null, 'nor an inspect scene');
  assert.deepEqual(B.leadControls(model('game', [a, b], [{ id: 'east' }], [{ id: 'moves' }])), { primary: null, secondary: [a, b], readout: 'moves' }, 'the moves lead, every setting waits');
  assert.deepEqual(B.leadControls(model('game', [a, b])), { primary: a, secondary: [b], readout: null }, 'a game without moves or readouts');
});

// A loop that cannot rewind (a rule-based timeline): no Restart rather than one that resets the settings; the status is shown
// only while the runtime is ready.
test('Toolbar: Restart only where the loop can rewind; the playback status only once the runtime is ready', async () => {
  const draw = async props => { if (root) await B.act(async () => root.unmount()); document.getElementById('app').innerHTML = ''; root = B.createRoot(document.getElementById('app'));
    await B.act(async () => { root.render(B.createElement(B.Toolbar, { show: { transport: true, resetView: true, interact: true }, onLabels: () => {}, ...props })); }); };
  await draw({ seekable: false, status: true });
  assert.equal($('[data-animation-restart]'), null);
  assert.ok($('[data-animation3d-play]'));
  assert.equal($('[data-animation-playback-status]').textContent, 'Paused');
  await draw({ seekable: true, status: false, playing: true });
  assert.equal($('[data-animation-restart]').textContent.trim(), 'Restart');
  assert.equal($('[data-animation-playback-status]'), null, 'loading or failed: no status');
  await draw({ status: true, live: true, interacting: true, optionalLabels: true, labels: false });
  assert.equal($('[data-animation-interact]').getAttribute('aria-pressed'), 'true');
  assert.equal($('[data-animation-labels]').getAttribute('aria-pressed'), 'false');
  await draw({ show: { transport: false, resetView: false, interact: false } });
  assert.equal($('[data-animation-toolbar]'), null, 'a scene with nothing to play or turn has no toolbar');
});

test('optional labels: the toggle shows only when the scene has some; it reaches the renderer and holds through a change', async () => {
  const renderers = stubRenderers({ optionalLabels: true });
  await mount({ renderers, runtimes: stubRuntimes(), block: { id: 'l1', type: 'animation3d', fixtureId: 'beam-balance-experiment' } });
  const toggle = $('[data-animation-labels]');
  assert.equal(toggle.closest('[data-animation-toolbar]') !== null, true, 'with the view controls');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(renderers.made[0].labels, [true], 'applied once the scene loaded');
  await press(toggle);
  assert.equal($('[data-animation-labels]').getAttribute('aria-pressed'), 'false');
  await type($('[data-animation-number="leftMass"]'), '2');
  assert.equal($('[data-animation-labels]').getAttribute('aria-pressed'), 'false', 'a parameter change keeps the choice');
  assert.deepEqual(renderers.made[0].labels, [true, false]);
});

test('Interact: in the toolbar once the 3D view is live; pressed and named Done while active; Done hands it back; the renderer follows', async () => {
  const { renderers } = await mount({ runtimes: stubRuntimes(), block: { id: 'i1', type: 'animation3d', fixtureId: 'orbit-watch' } });
  assert.ok($('[data-animation-interact]').closest('[data-animation-toolbar]'));
  assert.equal($('[data-animation-interact]').textContent.trim(), 'Interact');
  assert.equal($('[data-animation-interact]').getAttribute('aria-pressed'), 'false');
  await press($('[data-animation-interact]'));
  assert.equal($('[data-animation-interact]').textContent.trim(), 'Done');
  assert.equal($('[data-animation-interact]').getAttribute('aria-pressed'), 'true');
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

// Owner 2026-11-01: a game generated before the rule (C:/s/spec/animation/accepted game-* declare { id: 'reset', label: 'Reset' }) still
// loads; its own Reset is not drawn and no key presses it, so the card shows one Reset game and Reset view.
test('a saved game with its own Reset action: it loads, shows only the card\'s Reset game and Reset view, and no key reaches the hidden action', async () => {
  const old = structuredClone(gameFixture.artifact);
  old.artifactId = 'old-game'; old.provenance = { origin: 'generated' };
  old.actions.push({ id: 'reset', label: 'Reset' }, { id: 'again', label: 'Start over' });
  old.keys = { up: 'north', down: 'south', left: 'west', right: 'reset' };
  const runtimes = stubRuntimes();
  await mount({ runtimes, context: { kind: 'owner', boardId: 'b1' }, readArtifact: async () => structuredClone(old),
    block: { id: 's2', type: 'animation3d', title: 'Old game', animation3d: freshEnvelope({ ...artifactIdentity(old), boardId: 'b1', cardId: 's2' }) } });
  assert.equal(card().getAttribute('data-animation-phase'), 'ready');
  assert.deepEqual($$('[data-animation-action]').map(node => node.textContent), ['East', 'West', 'North', 'South']);
  assert.deepEqual(buttons().filter(name => /reset|start over|restart/i.test(name)), ['Reset view', 'Reset game']);
  await press($('[data-animation-interact]'));
  assert.equal((await keydown($('[data-animation-viewport]'), 'd')).defaultPrevented, false, 'right is bound only to the hidden action: not taken');
  await keydown($('[data-animation-viewport]'), 'w');
  assert.deepEqual(actionsSent(runtimes.log), ['north'], 'the shown bindings still play');
  assert.ok(!runtimes.log.includes('reset'), 'no key reset the game');
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
  const bar = $('[data-animation-progress]');
  assert.equal(bar.getAttribute('role'), 'progressbar');
  assert.deepEqual([bar.getAttribute('aria-valuemin'), bar.getAttribute('aria-valuemax'), bar.getAttribute('aria-valuenow')], ['1', '4', '1']);
  assert.match(bar.getAttribute('aria-valuetext'), /Build.*Building the scene/);
  assert.deepEqual([...document.querySelectorAll('[data-animation-progress-step]')].map(step => step.getAttribute('data-animation-progress-step')), ['current', 'todo', 'todo', 'todo']);
  assert.match(card().textContent, /Step 1 of 4/);
  assert.equal(document.querySelector('[data-animation-pending] svg.animate-spin, [data-animation-pending] svg[class*="animate-spin"]'), null, 'the bar replaces the spinner');
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

test('a Retry the server refuses (its offer changed): the server\'s reason, and the card shows the offer as it is now', async () => {
  let offer = ['new_attempt', 'edit_request'];
  const fetchJson = async (path, options = {}) => {
    if (options.method === 'POST') { offer = ['edit_request']; throw Object.assign(new Error('This choice is no longer available. The card shows what you can do now.'), { status: 409, data: { code: 'recovery_stale' } }); }
    return { job: job({ id: 'j7', cardId: 'p7', stage: 'failed', terminal: true, attempt: 1, failure: { message: 'The AI service was busy.' }, recovery: offer }) };
  };
  await mount({ fetchJson, block: { id: 'p7', type: 'animation3d', title: 'X', animation3dJob: job({ id: 'j7', cardId: 'p7', stage: 'failed' }) } });
  await press($('[data-animation-job-retry]'));
  assert.match($('[role="alert"]').textContent, /no longer available/);
  assert.equal($('[data-animation-job-retry]'), null);
});

test('a failed job offering only Edit shows no retry; after a reload the card asks the server before offering one', async () => {
  let answer = null;
  const calls = [];
  const fetchJson = async (path, options = {}) => { calls.push([options.method || 'GET', path]); return answer; };
  answer = { job: job({ id: 'j4', cardId: 'p4', stage: 'failed', terminal: true, attempt: 1, failure: { message: 'The scene was too large to check.' }, recovery: ['edit_request'] }) };
  await mount({ fetchJson, block: { id: 'p4', type: 'animation3d', title: 'SGD', animation3dJob: job({ id: 'j4', cardId: 'p4', stage: 'failed', message: 'Old words.' }) } });
  assert.deepEqual(calls, [['GET', '/api/learn/animation/jobs/j4?board=b1']], 'read once, not polled');
  assert.equal($('[data-animation-stage]').textContent, 'The scene was too large to check.', 'the server\'s current words');
  assert.equal($('[data-animation-job-retry]'), null);
  // The read failing: the saved words stay, and no action is guessed.
  answer = null;
  const failing = async () => { throw Object.assign(new Error('Not available'), { status: 503 }); };
  await mount({ fetchJson: failing, block: { id: 'p4', type: 'animation3d', title: 'SGD', animation3dJob: job({ id: 'j4', cardId: 'p4', stage: 'failed', message: 'Old words.' }) } });
  assert.equal($('[data-animation-stage]').textContent, 'Old words.');
  assert.equal($('[data-animation-job-retry]'), null);
});

test('Revise plan: one press, one request naming the action; the card waits on the new job the server answered and polls it', async () => {
  const calls = [];
  const failed = job({ id: 'j5', cardId: 'p5', stage: 'failed', terminal: true, attempt: 1, failure: { message: 'The scene was too large to check.' }, recovery: ['revise_plan', 'edit_request'] });
  const fetchJson = async (path, options = {}) => {
    calls.push([options.method || 'GET', path, options.body ? JSON.parse(options.body) : null]);
    if (path.endsWith('/retry')) { await new Promise(resolve => setTimeout(resolve, 20)); return { job: job({ id: 'j6', cardId: 'p5', stage: 'queued', attempt: 1 }) }; }
    return path.includes('/j6') ? { job: job({ id: 'j6', cardId: 'p5', stage: 'awaiting_approval' }) } : { job: failed };
  };
  const { changes } = await mount({ fetchJson, block: { id: 'p5', type: 'animation3d', title: 'SGD', promptUsed: '/animation sgd', animation3dJob: job({ id: 'j5', cardId: 'p5', stage: 'failed', message: 'x' }) } });
  const button = $('[data-animation-job-retry]');
  assert.equal(button.textContent.trim(), 'Revise plan');
  assert.equal(button.getAttribute('data-animation-job-retry'), 'revise_plan');
  await B.act(async () => { button.dispatchEvent(new window.Event('click', { bubbles: true })); button.dispatchEvent(new window.Event('click', { bubbles: true })); });
  await settle();
  const retries = calls.filter(([method]) => method === 'POST');
  assert.deepEqual(retries, [['POST', '/api/learn/animation/jobs/j5/retry', { boardId: 'b1', expectedAttempt: 1, action: 'revise_plan' }]]);
  const quiet = () => changes.filter(([kind]) => kind === 'quiet').map(([, block]) => block).at(-1);
  const bound = quiet().animation3dJob;
  assert.deepEqual([bound.id, bound.stage, bound.requestId, bound.sourceKey, bound.message], ['j6', 'queued', 'r1', 'k', undefined]);
  assert.equal($('[data-animation-job-retry]'), null, 'no second press while the new job works');
  // The canvas saves the rebound card and renders it: the card now observes the new job.
  await B.act(async () => { root.render(B.createElement(B.Card, { block: quiet(), onChange: next => changes.push(['change', next]), onChangeQuiet: next => changes.push(['quiet', next]), fetchJson, webgl: true })); });
  await settle();
  assert.ok(calls.some(([method, path]) => method === 'GET' && path === '/api/learn/animation/jobs/j6?board=b1'), 'the new job is read');
  assert.equal(quiet().animation3dJob.stage, 'awaiting_approval');
  assert.equal(calls.filter(([method]) => method === 'POST').length, 1);
  assert.ok(!changes.some(([kind]) => kind === 'change'), 'never an undo step');
});

// Owner 2026-11-02: a saved card still says failed while its server job moved on (a Retry from another tab, a Retry whose answer was
// lost, Revise plan's new job). The card follows it through the same resume, poll and ready paths, with GETs only.
test('a stale saved failed card follows its job: running, awaiting review through Revise plan\'s new job, or ready; never a new job, one result', async () => {
  const art = structuredClone(experimentFixture.artifact);
  const saved = (id, over = {}) => ({ id: 'p8', type: 'animation3d', title: 'Lever', animation3dJob: job({ id, cardId: 'p8', stage: 'failed', message: 'Old words.', ...over }) });
  const failedJob = (id, over = {}) => job({ id, cardId: 'p8', stage: 'failed', terminal: true, attempt: 1, failure: { message: 'An AI step was interrupted.' }, recovery: ['new_attempt', 'edit_request'], ...over });
  // The canvas: each change is saved and the card rendered with it (AdaptiveCanvas).
  const open = async (block, answer) => {
    const calls = [], changes = [];
    const fetchJson = async (path, options = {}) => {
      calls.push([options.method || 'GET', path]);
      if (path.includes('/results/')) return { artifact: structuredClone(art), execution: { allowed: true } };
      return answer(path.match(/jobs\/([^/?]+)/)[1], options);
    };
    const runtimes = stubRuntimes(), renderers = stubRenderers();
    const draw = next => root.render(B.createElement(B.Card, { block: next, fetchJson, webgl: true, createRuntime: runtimes.factory, createRenderer: renderers.factory,
      onChange: n => { changes.push(['change', n]); draw(n); }, onChangeQuiet: n => { changes.push(['quiet', n]); draw(n); } }));
    await mount({ block, fetchJson, onChange: n => { changes.push(['change', n]); draw(n); }, onChangeQuiet: n => { changes.push(['quiet', n]); draw(n); }, runtimes, renderers });
    return { calls, changes, posts: () => calls.filter(([method]) => method === 'POST') };
  };
  const bound = changes => changes.filter(([kind]) => kind === 'quiet').at(0)?.[1].animation3dJob;

  // Retried from another tab: the same job is building.
  let s = await open(saved('j8'), () => ({ job: job({ id: 'j8', cardId: 'p8', stage: 'authoring', attempt: 2 }) }));
  assert.deepEqual([bound(s.changes).id, bound(s.changes).stage, bound(s.changes).message], ['j8', 'authoring', undefined]);
  assert.equal($('[data-animation-stage]').textContent, 'Building the scene');
  assert.deepEqual(buttons(), ['Stop']);
  assert.equal(s.calls.filter(([, path]) => path.includes('/j8?')).length, 2, 'read, then polled once rebound');
  assert.deepEqual(s.posts(), []);

  // Revise plan from another tab: the failed job names its successor, whose plan awaits review; the card waits on that job.
  s = await open(saved('j9'), id => ({ job: id === 'j9' ? failedJob('j9', { successor: 'j10', recovery: ['revise_plan', 'edit_request'] }) : job({ id: 'j10', cardId: 'p8', stage: 'awaiting_approval' }) }));
  assert.deepEqual([bound(s.changes).id, bound(s.changes).stage, bound(s.changes).requestId, bound(s.changes).sourceKey], ['j10', 'awaiting_approval', 'r1', 'k']);
  assert.equal($('[data-animation-stage]').textContent, 'Review the scene plan above the chat box');
  assert.equal($('[data-animation-job-retry]'), null, 'no Revise plan on the old job');
  assert.deepEqual(s.posts(), []);
  // Revise plan's job failed in turn: the card binds it, so its Retry acts on that job, not the old one.
  s = await open(saved('j9'), id => ({ job: id === 'j9' ? failedJob('j9', { successor: 'j10' }) : failedJob('j10', { failure: { message: 'The build ran out of time.' } }) }));
  assert.deepEqual([bound(s.changes).id, bound(s.changes).stage, bound(s.changes).message], ['j10', 'failed', 'The build ran out of time.']);
  await press($('[data-animation-job-retry]'));
  assert.deepEqual(s.posts().map(([, path]) => path), ['/api/learn/animation/jobs/j10/retry']);

  // Render again whose answer was lost before the reload: the job is ready; its result is read and lands once.
  const ready = job({ id: 'j11', cardId: 'p8', stage: 'ready', terminal: true, result: { resultId: art.artifactId, cardId: 'p8', canvas: { boardId: 'b1' }, requestRef: 'rr', planHash: art.planHash } });
  s = await open(saved('j11', { sourceKey: 'rr' }), () => ({ job: ready }));
  const landed = s.changes.filter(([kind]) => kind === 'change').map(([, block]) => block);
  assert.equal(landed.length, 1, 'one result, one undo step');
  assert.deepEqual([landed[0].animation3d.ref.artifactId, landed[0].animation3dJob], [art.artifactId, undefined]);
  assert.equal(s.calls.filter(([, path]) => path.includes('/results/')).length, 1);
  assert.deepEqual(s.posts(), []);

  // A Retry in this tab whose answer is lost: the card reads the job and waits on it; no second Retry is sent.
  let accepted = false;
  s = await open(saved('j12'), (id, options) => {
    if (options.method === 'POST') { accepted = true; throw new Error('Failed to fetch'); }
    return { job: accepted ? job({ id: 'j12', cardId: 'p8', stage: 'authoring', attempt: 2 }) : failedJob('j12') };
  });
  await press($('[data-animation-job-retry]'));
  assert.deepEqual([bound(s.changes).id, bound(s.changes).stage], ['j12', 'authoring']);
  assert.deepEqual(buttons(), ['Stop']);
  assert.equal(s.posts().length, 1);

  // Stopped on this card: never read or resumed, whatever the server says.
  s = await open(saved('j13', { stage: 'cancelled' }), () => ({ job: job({ id: 'j13', cardId: 'p8', stage: 'authoring', attempt: 2 }) }));
  assert.deepEqual([s.calls, s.changes], [[], []]);
  assert.equal($('[data-animation-stage]').textContent, 'Stopped');
});

test('a ready job lands on its card once (the artifact read and mapped to the board reference); the saved card then plays it', async () => {
  const art = structuredClone(experimentFixture.artifact);
  const answers = { job: { id: 'j3', boardId: 'b1', cardId: 'p3', stage: 'ready', terminal: true, result: { resultId: art.artifactId, cardId: 'p3', canvas: { boardId: 'b1' }, requestRef: 'rr', planHash: art.planHash } } };
  const calls = [];
  const fetchJson = async path => { calls.push(path); return path.includes('/results/') ? { artifact: structuredClone(art), execution: { allowed: true } } : answers; };
  const waiting = { id: 'j3', boardId: 'b1', cardId: 'p3', requestId: 'r3', sourceKey: 'rr', baseRevision: null, stage: 'reviewing' };
  const { changes } = await mount({ fetchJson, block: { id: 'p3', type: 'animation3d', title: 'Lever', animation3dJob: waiting } });
  const landed = changes.filter(([kind]) => kind === 'change').map(([, block]) => block);
  assert.equal(landed.length, 1, 'one undo step: the new scene');
  assert.equal(landed[0].animation3d.ref.artifactId, 'fixture-beam-balance');
  assert.equal(landed[0].animation3dJob, undefined);
  assert.deepEqual(calls, ['/api/learn/animation/jobs/j3?board=b1', '/api/learn/animation/jobs/results/fixture-beam-balance?board=b1']);
  // The owner's canvas provides its board (LearnPage, AnimationBoard): the saved card reads its scene and runs it.
  root && await B.act(async () => root.unmount());
  B.resetViewers();
  document.getElementById('app').innerHTML = '';
  root = B.createRoot(document.getElementById('app'));
  const runtimes = realRuntimes(), renderers = stubRenderers();
  await B.act(async () => { root.render(B.createElement(B.AnimationBoard.Provider, { value: { kind: 'owner', boardId: 'b1' } },
    B.createElement(B.Card, { block: landed[0], onChange: () => {}, onChangeQuiet: () => {}, fetchJson, createRuntime: runtimes.factory, createRenderer: renderers.factory, webgl: true }))); });
  await settle();
  assert.equal(card().getAttribute('data-animation-phase'), 'ready');
  assert.deepEqual(raw(), { leftMoment: 6, rightMoment: 4, tilt: 10 });
});

test('the kill switch (execution not allowed): the saved card never runs and says so, with Retry', async () => {
  const fetchJson = async () => ({ artifact: structuredClone(experimentFixture.artifact), execution: { allowed: false } });
  const runtimes = stubRuntimes();
  await mount({ runtimes, fetchJson, block: savedCard(), context: { kind: 'owner', boardId: 'b1' } });
  assert.equal(card().getAttribute('data-animation-phase'), 'recovery');
  assert.match($('[data-animation-failure]').textContent, /turned off right now/);
  assert.ok($('[data-animation-retry]'));
  assert.equal(runtimes.made.length, 0, 'nothing ran');
});

// AdaptiveCanvas placeAnimation, read from its source as explain-client.test.mjs reads placeExplain: one card per job card id.
test('the canvas places an /animation job\'s card once under its own id, never on a read-only canvas, and only an animation3d card', async () => {
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const body = canvas.match(/placeAnimation: ([\s\S]*?),\r?\n      placeExplain:/)[1];
  const factory = new Function('alive', 'readOnlyRef', 'blocksRef', 'snapshot', 'insertAtView', `return (${body})`);
  const blocks = { current: [] }, inserted = [];
  const place = (readOnly = false) => factory({ current: true }, { current: readOnly }, blocks, () => {}, block => { inserted.push(block); return block.id; });
  const pending = { id: 'a1', type: 'animation3d', title: 'Lever', animation3dJob: { id: 'j1', stage: 'queued' } };
  assert.equal(place()(pending), 'a1');
  assert.equal(place()(pending), 'a1', 'a resent press finds the same card');
  assert.deepEqual(inserted.map(block => block.id), ['a1']);
  assert.equal(place(true)({ ...pending, id: 'a2' }), null);
  assert.equal(place()({ ...pending, type: 'animation', id: 'a3' }), null);
});
