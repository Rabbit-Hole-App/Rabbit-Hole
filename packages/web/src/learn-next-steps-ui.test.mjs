
// Professor Next Steps UI wiring (contract §1.3, §1.4): useTutor's askStep and useNextSteps (which reads nothing of the Tutor's state any more, Tutor cleanup P1), bundled with esbuild and
// rendered once on the server as learn-tutor-domains.test.mjs does (effects never run). useNextSteps' logic (ownedSteps) runs
// here through the real controller with a fake clock. A fake fetch answers the routes; no network, no model, no Send. One
// bundle, so the registry, the sinks and the hooks share module instances.
import test from 'node:test';

import assert from 'node:assert/strict';

import { createRequire } from 'node:module';

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

import { TIDES } from './__fixtures__/journey-synthetic-domains.mjs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const dir = mkdtempSync(join(tmpdir(), 'next-steps-ui-')), outfile = join(dir, 'ui.cjs');
await esbuild.build({
  stdin: { contents: ["export { useNextSteps, ownedSteps, useSharedNextSteps, sharedSteps } from './LearnNextSteps.jsx';", "export { createElement } from 'react';", "export { renderToStaticMarkup } from 'react-dom/server';"].join('\n'),
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});

const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const IDS = Object.keys(TIDES.diagnostic.registry.claims).slice(0, 2);

const ticks = async (done, n = 50) => { for (let i = 0; i < n && !done(); i++) await new Promise(resolve => setImmediate(resolve)); };

// Review fix 2: the web bundle never pulls the journey agent for the hook validator's label list.
test('useNextSteps graph: the label list comes from a leaf module, never the planner prompts', async () => {
  const built = await esbuild.build({ stdin: { contents: "export { useNextSteps } from './LearnNextSteps.jsx';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
    bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', external: ['react', 'react-dom'], metafile: true, logLevel: 'silent' });
  const inputs = Object.keys(built.metafile.inputs);
  assert.ok(inputs.some(i => i.endsWith('agents/learn-labels.js')), 'the leaf label module');
  assert.equal(inputs.some(i => /learn-journey/.test(i)), false);
});

const renderSteps = props => {
  let steps = null;
  const Page = () => { steps = B.useNextSteps({ journey: null, canvasApi: { current: { blocks: () => [] } }, canvasState: { cards: [] }, record: null, access: { app: 'a' }, title: '', graded: 0, ...props }); return null; };
  B.renderToStaticMarkup(B.createElement(Page));
  return steps;
};

test('useNextSteps: exactly the steps shape, unavailable/off without a Tutor; the module never reads the mode, evidence routes or a course', () => {
  const steps = renderSteps({ tutor: { active: false } });
  // request: the View > Curious empty state's explicit ask (owner brief 2026-10-21 message 25 item 2).
  assert.deepEqual(Object.keys(steps).sort(), ['generated_at', 'options', 'reason', 'refresh', 'request', 'select', 'set_id', 'status']);
  assert.deepEqual([steps.status, steps.reason, steps.set_id, steps.generated_at, steps.options], ['unavailable', 'off', null, null, []]);
  assert.deepEqual(steps.select('ns_00000000.1'), { ok: false, reason: 'unknown' });
  const source = read('LearnNextSteps.jsx');
  assert.doesNotMatch(source, /voice/i, 'Voice Mode never decides whether hooks show');
  assert.doesNotMatch(source, /\/api\/learn\/tutor\/evaluate|\/api\/learn\/journey/, 'no evidence route on a hook path');
  assert.doesNotMatch(source, /nanogpt|karpathy|attention|softmax|tides|aqueduct|fixture/i, 'no runtime branch on a course, topic or fixture');
  assert.doesNotMatch(source, /from '\.\/LearningBlocks/, 'LearningBlocks.jsx cannot load under node; describe is a parameter');
  assert.match(source, /nextStepsController\(/);
  assert.match(source, /'\/api\/learn\/tutor\/next-steps'/);
  // Owner task 2: a Refresh's operation id rides beside the input, on the owned and the shared post.
  assert.match(source, /JSON\.stringify\(\{ \.\.\.read\(\)\.access, input, \.\.\.extra \}\)/);
  assert.match(source, /JSON\.stringify\(\{ \.\.\.body, \.\.\.extra, /);
  assert.match(source, /internal[^\n]*not part of contract §1\.3/, 'ownedSteps is documented as internal');
  assert.doesNotMatch(source, /learn-tutor-trace|learn-tutor-evidence|emitDecision|viewerStates/, 'the hooks read no Tutor state and emit no decision events');
  // The update effect depends on the trigger state alone: never on a click, pan, zoom, hover or pointer movement. The
  // semantic snapshot (owner task 2) rides along with the basis its fingerprint is in, never as a trigger of its own.
  assert.match(source, /useEffect\(\(\) => \{ steps\.update\(\{ basis, stop, semantic, settling \}\); \}, \[basis, stop, settling\]\);/);
  assert.match(source, /useSyncExternalStore\(steps\.subscribe, steps\.view, steps\.view\)/);
});

// ---- ownedSteps: useNextSteps' logic through the real controller, a fake clock and a fake post. ----
function clock() {
  const timers = [];
  return { setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    fire: async () => { const t = timers.filter(x => x.fn).at(-1); const fn = t?.fn; if (t) t.fn = null; await fn?.(); await new Promise(r => setImmediate(r)); }, pending: () => timers.filter(x => x.fn).length };
}

const setFor = n => ({ set_id: `ns_0000000${n}`, generated_at: '2026-10-06T10:00:00.000Z', basis: 'x', telemetry: { tier: 'routine', calls: 1, ms: 700, planner_version: 'p1', model_role: 'tutor_next_steps', model_id: 'm', prompt_version: 'abc', usage: {}, cost_usd: 0.001 },
  options: [1, 2, 3].map(i => ({ id: `ns_0000000${n}.${i}`, hook: `Hook ${n}.${i} about basins?`, selected_next_step: { v: 1, set_id: `ns_0000000${n}`, suggestion_id: `ns_0000000${n}.${i}`, basis: 'x', hook: `Hook ${n}.${i} about basins?`, learning_goal: `goal ${n}.${i}`, concept_ids: [], claim_ids: [IDS[0]], scope: 'owned' } })) });

// A stub with the optional step surface useNextSteps still reads from a Tutor ({ busy, lastTurn, showing }).
function tutorStub(over = {}) {
  const shown = [];
  const t = { lastTurn: null, busy: false, record: null,
    showing: options => shown.push(options.map(o => o.id)), shown, ...over };
  return t;
}

function stepsRig({ tutor = tutorStub(), replies = [setFor(1)], props = {} } = {}) {
  const c = clock(), bodies = [];
  const live = { tutor, canvasApi: { current: { blocks: () => [{ id: 'k1', type: 'explanation', title: 'Basins' }] } }, canvasState: { cards: [['k1']] }, record: null, access: { app: 'canvas-0000test' }, title: 'Tidal power', graded: 0, describe: null, ...props };
  const steps = B.ownedSteps(() => live, { post: async input => { bodies.push(input); const r = await replies.shift(); if (r instanceof Error) throw r; return structuredClone(r); }, setTimer: c.setTimer, clearTimer: c.clearTimer });
  const step = () => steps.update(steps.state());
  return { c, live, steps, bodies, step, tutor };
}

test('ownedSteps: off while a hole\'s record is still loading (recordPending); nothing is posted; a Tutor is not needed', async () => {
  const pending = stepsRig({ props: { recordPending: true } });
  assert.deepEqual(pending.steps.state(), { basis: null, stop: 'off' });
  pending.step(); await pending.c.fire();
  assert.deepEqual([pending.steps.view().status, pending.steps.view().reason, pending.bodies.length, pending.c.pending()], ['unavailable', 'off', 0, 0]);
  for (const tutor of [{ active: false }, null]) {
    const r = stepsRig({ tutor, replies: [setFor(1)] });
    assert.equal(r.steps.state().stop, null, JSON.stringify(tutor));
    r.step(); await r.c.fire();
    assert.deepEqual([r.steps.view().status, r.bodies.length, r.bodies[0].mode], ['ready', 1, 'canvas'], JSON.stringify(tutor));
  }
});

// Task 10 fix rounds 1-3 (owner eleventh message 3, 8; probe E): a plain canvas with no lesson card asks nothing - its title
// alone never grounds hooks - and a rename re-asks with the new goal. Modelled as it happens: Dive reloads the dives path
// with the server title and useTutor re-renders; app.title and the page title prop never change.
const withSession = async fn => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), storage = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) }, configurable: true, writable: true });
  try { return await fn(); } finally { if (saved) Object.defineProperty(globalThis, 'sessionStorage', saved); else delete globalThis.sessionStorage; }
};

// Owner 2026-10-08 (reversing the eleventh message 8): a blank plain canvas gets hooks at rest, grounded in its title; a card
// or a rename re-asks. An uninformative title (Untitled, an auto name) is no goal: three distinct starter hooks (the planner).
// Owner task 2 (2026-10-13): the title travels as background (canvas.title), never as the goal. A rename: Dive reloads the dives
// path with the server title (liveTitle); app.title and the page title prop never change.
test('ownedSteps on a plain canvas: a blank canvas asks at rest with its title as background; a card and a rename re-ask', async () => {
  const card = [{ id: 'k1', type: 'explanation', title: 'Starter culture' }];
  const r = stepsRig({ replies: [setFor(1), setFor(2), setFor(3)], props: { title: 'Created as', liveTitle: 'Sourdough', canvasApi: { current: { blocks: () => [] } }, canvasState: { cards: [] }, access: { app: 'canvas-0000abcd' } } });
  assert.equal(r.steps.state().stop, null, 'nothing waits on a first question');
  r.step(); await r.c.fire();
  assert.deepEqual([r.bodies.length, r.bodies[0].mode, r.bodies[0].goal, r.bodies[0].canvas.title, r.bodies[0].canvas.blocks, Object.keys(r.bodies[0].scope.claims)], [1, 'canvas', '', 'Sourdough', [], []]);
  r.live.canvasApi = { current: { blocks: () => card } };
  r.live.canvasState = { cards: [['k1']] };
  const { basis } = r.steps.state();
  assert.equal(r.steps.state().stop, null);
  r.step(); await r.c.fire();
  assert.deepEqual([r.bodies.length, r.bodies[1].mode, r.bodies[1].canvas.title, r.bodies[1].canvas.blocks.length], [2, 'canvas', 'Sourdough', 1], 'a card re-asks');
  r.live.liveTitle = 'Sourdough, renamed';
  assert.notEqual(r.steps.state().basis, basis, 'the renamed title is in the input');
  r.step(); await r.c.fire();
  assert.deepEqual([r.bodies.length, r.bodies[2].canvas.title], [3, 'Sourdough, renamed']);
});

test('ownedSteps on a blank canvas with an uninformative title: asked at rest with no goal, so the planner suggests distinct starters', async () => {
  for (const title of ['Untitled canvas', 'untitled', '', 'canvas-0000abcd']) {
    const r = stepsRig({ replies: [setFor(1)], props: { title, liveTitle: title, canvasApi: { current: { blocks: () => [] } }, canvasState: { cards: [] }, access: { app: 'canvas-0000abcd' } } });
    assert.equal(r.steps.state().stop, null, JSON.stringify(title));
    r.step(); await r.c.fire();
    assert.deepEqual([r.bodies.length, r.bodies[0].mode, r.bodies[0].goal, r.bodies[0].canvas.blocks], [1, 'canvas', '', []], JSON.stringify(title));
    assert.equal(r.steps.view().status, 'ready');
  }
});

// Fix round 4 (owner eleventh message 3): a hole's dive title is in its hook input, so renaming a hole with a learning_goal
// re-asks too - its goal stays the learning_goal and the new set carries the new dive title. Renamed as it happens: Dive
// reloads the dives path with the server title (liveTitle); the record keeps its creation title.
test('ownedSteps on a renamed learning_goal hole: the basis changes, the goal stays, the next input carries the new dive title', async () => {
  const card = [{ id: 'k1', type: 'explanation', title: 'Starter culture' }];
  const record = { dive_id: 'canvas-0000abce', title: 'Hole as created', learning_goal: 'Explain why a starter needs feeding', origin: { parent: { app: 'share:0f0f', board: 'main' } }, source: { title: 'Bread science' } };
  const r = stepsRig({ replies: [setFor(1), setFor(2)], props: { record, title: 'Hole as created', liveTitle: 'Hole as created', canvasApi: { current: { blocks: () => card } }, canvasState: { cards: [['k1']] }, access: { app: 'canvas-0000abce' } } });
  const { basis } = r.steps.state();
  r.step(); await r.c.fire();
  assert.deepEqual([r.bodies[0].mode, r.bodies[0].goal, r.bodies[0].dive.title], ['dive', 'Explain why a starter needs feeding', 'Hole as created']);
  r.live.liveTitle = 'Starter notes';
  assert.notEqual(r.steps.state().basis, basis, 'the dive title grounds the input');
  r.step(); await r.c.fire();
  assert.deepEqual([r.bodies.length, r.bodies[1].goal, r.bodies[1].dive.title], [2, 'Explain why a starter needs feeding', 'Starter notes']);
});

// Probe D, as recordPending (LearnPage: a canvas named like a hole whose dives record has not landed): nothing is posted and no
// set is shown until the record lands; the first set is the hole's (mode dive), never a temporary plain one.
test('probe D: a hole whose record lands late - no post and no set until it settles, never a temporary plain set', async () => {
  const record = { dive_id: 'canvas-0000d0d0', title: 'Falls up close' };
  const r = stepsRig({ replies: [setFor(1)], props: { recordPending: true, record: null, title: 'Falls up close' } });
  const seen = [];
  r.steps.subscribe(() => seen.push(r.steps.view().status));
  r.step(); await r.c.fire();                                       // the dives GET has not answered
  assert.deepEqual([r.bodies.length, r.steps.view().status, r.steps.view().reason], [0, 'unavailable', 'off']);
  Object.assign(r.live, { recordPending: false, record });
  r.step(); await r.c.fire();                                       // the record landed
  assert.deepEqual([r.bodies.length, r.bodies[0].mode, r.steps.view().status], [1, 'dive', 'ready']);
  assert.equal(seen.slice(0, seen.indexOf('ready')).every(status => status !== 'ready' && status !== 'stale'), true, JSON.stringify(seen));
  assert.equal(r.bodies.some(body => body.mode === 'canvas'), false, 'never a temporary plain set');
});

test('ownedSteps: the trigger state, the input from the live snapshot at send time, ready with exactly the contract keys, and select', async () => {
  const r = stepsRig();
  const { basis, stop } = r.steps.state();
  assert.match(basis, /^nb_[0-9a-f]{8}$/);
  assert.equal(stop, null);
  assert.equal(r.steps.state().basis, basis, 'the same state, the same basis: a re-render (pan, zoom, hover) asks nothing');
  r.live.canvasState = { cards: [['k1']], camera: { x: 9, zoom: 2 }, card: { id: 'k1' } };
  assert.equal(r.steps.state().basis, basis, 'camera and selection are never inputs');
  r.step();
  r.live.title = 'Tidal power, renamed before the debounce ends';
  await r.c.fire();
  assert.equal(r.bodies.length, 1);
  assert.deepEqual([r.bodies[0].basis, r.bodies[0].mode, r.bodies[0].goal], [basis, 'canvas', '']);
  const v = r.steps.view();
  assert.deepEqual(Object.keys(v), ['status', 'reason', 'set_id', 'generated_at', 'options']);
  assert.deepEqual([v.status, v.set_id, v.options.map(o => Object.keys(o))], ['ready', 'ns_00000001', [['id', 'hook', 'selected_next_step'], ['id', 'hook', 'selected_next_step'], ['id', 'hook', 'selected_next_step']]]);
  assert.equal(r.steps.view(), v, 'the view is cached per change: the same object until the controller changes');
  assert.deepEqual(r.tutor.shown, [[], ['ns_00000001.1', 'ns_00000001.2', 'ns_00000001.3']], 'loading shows none; then the Tutor knows which hooks are on screen');
  assert.deepEqual(r.steps.select('ns_00000001.2'), { ok: true, selected_next_step: setFor(1).options[1].selected_next_step });
  r.tutor.busy = true;
  assert.deepEqual(r.steps.select('ns_00000001.2'), { ok: false, reason: 'busy' });
  r.step();
  assert.deepEqual([r.steps.view().status, r.steps.view().reason, r.tutor.shown.at(-1)], ['unavailable', 'not_now', []], 'a turn in flight hides them');
  assert.notEqual(r.steps.view(), v);
});

// Review fix 3: an effect re-run (StrictMode, Fast Refresh) disposes the controller and uses it again; it must come back.
test('ownedSteps survives dispose: subscribe and update again build a fresh controller that asks, lands and notifies', async () => {
  const r = stepsRig({ replies: [setFor(1), setFor(2)] });
  const seen = [];
  const off = r.steps.subscribe(() => seen.push(r.steps.view().status));
  r.step(); await r.c.fire();
  assert.equal(r.steps.view().status, 'ready');
  off(); r.steps.dispose();
  assert.equal(r.c.pending(), 0, 'disposed: no timer left');
  r.steps.subscribe(() => seen.push(`again ${r.steps.view().status}`));
  r.step(); await r.c.fire();
  assert.deepEqual([r.steps.view().status, r.steps.view().set_id, r.bodies.length], ['ready', 'ns_00000002', 2]);
  assert.ok(seen.includes('again ready'), JSON.stringify(seen));
  assert.deepEqual(r.steps.select('ns_00000002.1').ok, true);
});

test('ownedSteps: a finished turn changes the basis and the shown set turns stale until the new one lands', async () => {
  const r = stepsRig({ replies: [setFor(1), setFor(2)] });
  r.step(); await r.c.fire();
  r.tutor.lastTurn = { seq: 1, turn_id: 't-1', kind: 'next_step', transitions: [] };
  r.step();
  assert.deepEqual([r.steps.view().status, r.steps.view().set_id], ['stale', 'ns_00000001']);
  await r.c.fire();
  assert.deepEqual([r.steps.view().status, r.steps.view().set_id, r.bodies.length], ['ready', 'ns_00000002', 2]);
  assert.deepEqual(r.bodies[1].previous.hooks, setFor(1).options.map(o => o.hook), 'the shown hooks are not offered again');
});

// ---- Shared canvases (Task 11): useSharedNextSteps and its logic (sharedSteps) through the real controller. ----
test('useSharedNextSteps: off without a token; posts the origin only', () => {
  let steps = null;
  const Page = () => { steps = B.useSharedNextSteps({ token: null, card: null, version: 1, signedIn: false }); return null; };
  B.renderToStaticMarkup(B.createElement(Page));
  assert.deepEqual(Object.keys(steps).sort(), ['generated_at', 'options', 'reason', 'refresh', 'request', 'select', 'set_id', 'status']);
  assert.deepEqual([steps.status, steps.reason], ['unavailable', 'off']);
  const source = read('LearnNextSteps.jsx');
  assert.match(source, /\/api\/learn\/boards\/shared\/\$\{encodeURIComponent\(\w+\)\}\/next-steps/);
  assert.match(source, /origin: card \? \{ block_id: card \} : null/);
  assert.doesNotMatch(source, /viewer_states|learn-tutor-evidence/, 'no viewer evidence rides on the shared post');
  assert.match(source, /useEffect\(\(\) => \{ shared\.update\(\{ basis, stop \}\); \}, \[basis, stop\]\);/, 'the update effect reads the trigger state alone');
});

const sharedSet = n => ({ ...setFor(n), basis: 'k:1::root', telemetry: { ...setFor(n).telemetry, share_key: 'f00d'.repeat(16), cached: false,
  summary: { evidence_summary: { understood: [], uncertain: [IDS[0]], misconception: [], prerequisite_gap: [], not_yet_observed: [] }, canvas_summary: { blocks: 2, kinds: { explanation: 2 }, presented_claim_ids: [IDS[0]] }, target_concept_ids: ['c'], target_claim_ids: [IDS[0]] } },
  options: setFor(n).options.map(o => ({ ...o, selected_next_step: { ...o.selected_next_step, scope: 'shared', source: { share_version: 4, origin_block_id: 'k1' } } })) });

function sharedRig({ props = {}, replies = [sharedSet(1)] } = {}) {
  const c = clock(), bodies = [], live = { token: 'tok-abc', card: 'k1', version: 4, signedIn: true, ...props };
  const shared = B.sharedSteps(() => live, { post: async body => { bodies.push(body); const r = await replies.shift(); if (r instanceof Error) throw r; return structuredClone(r); }, setTimer: c.setTimer, clearTimer: c.clearTimer });
  return { c, live, shared, bodies, step: () => shared.update(shared.state()) };
}

// Owner R3 decision (2026-10-16, rel-a.md A2 item 4): a signed-out viewer gets no generation, so signed out is off.
test('sharedSteps: off signed out; recomputes only on the selected card or the board version; posts only the origin; select validates', async () => {
  for (const props of [{ token: null }, { signedIn: false }]) {
    const off = sharedRig({ props });
    off.step(); await off.c.fire();
    assert.deepEqual([off.shared.view().status, off.shared.view().reason, off.bodies.length], ['unavailable', 'off', 0], JSON.stringify(props));
  }
  const r = sharedRig({ replies: [sharedSet(1), sharedSet(2), sharedSet(3)] });
  r.step(); await r.c.fire();
  assert.deepEqual(r.bodies, [{ origin: { block_id: 'k1' } }]);
  assert.deepEqual([r.shared.view().status, r.shared.view().set_id], ['ready', 'ns_00000001']);
  assert.equal('telemetry' in r.shared.view(), false, 'telemetry never reaches the steps');
  // Pan, zoom, hover and anything else that is not a trigger: the same state, no request.
  const same = r.shared.state();
  r.step(); await r.c.fire();
  assert.deepEqual([r.shared.state(), r.bodies.length, r.c.pending()], [same, 1, 0]);
  for (const [change, origin] of [[() => { r.live.card = null; }, null], [() => { r.live.version = 5; }, null]]) {
    change(); r.step();
    assert.equal(r.shared.view().status, 'stale');
    await r.c.fire();
    assert.deepEqual(r.bodies.at(-1), { origin });
  }
  assert.equal(r.bodies.length, 3);
  const picked = r.shared.select('ns_00000003.2');
  assert.deepEqual([picked.ok, picked.selected_next_step.source], [true, { share_version: 4, origin_block_id: 'k1' }]);
  assert.deepEqual(r.shared.select('ns_00000001.1'), { ok: false, reason: 'unknown' });
  // Signing out hides the hooks and asks nothing more.
  r.live.signedIn = false; r.step(); await r.c.fire();
  assert.deepEqual([r.shared.view().status, r.shared.view().reason, r.bodies.length], ['unavailable', 'off', 3]);
});

test('sharedSteps survives dispose; a 429 is limited', async () => {
  const r = sharedRig({ replies: [Object.assign(new Error('paused'), { status: 429 }), sharedSet(2)] });
  r.shared.dispose();
  let told = 0;
  r.shared.subscribe(() => { told += 1; });
  r.step(); await r.c.fire();
  assert.deepEqual([r.shared.view().status, r.shared.view().reason, told > 0], ['unavailable', 'limited', true]);
});

// Owner priority 1 (2026-10-21, "/b Next steps charging credits automatically"): a trigger only reads the saved set; with none
// the card offers Suggest (curious_empty), and only request() posts generate: true, for the trigger on screen.
test('sharedSteps: a view never asks to generate; idle is the Suggest state; request() alone posts generate, for that card', async () => {
  const idle = () => Object.assign(new Error('No saved suggestions'), { reason: 'curious_empty' });
  const r = sharedRig({ replies: [idle(), sharedSet(2), idle()] });
  r.step(); await r.c.fire();
  assert.deepEqual(r.bodies, [{ origin: { block_id: 'k1' } }]);
  assert.deepEqual([r.shared.view().status, r.shared.view().reason], ['unavailable', 'curious_empty']);
  r.step(); await r.c.fire();
  assert.equal(r.bodies.length, 1, 'a re-render asks nothing more');
  r.shared.request(); await r.c.fire();
  assert.deepEqual(r.bodies.at(-1), { origin: { block_id: 'k1' }, generate: true });
  assert.deepEqual([r.shared.view().status, r.shared.view().set_id], ['ready', 'ns_00000002']);
  r.live.card = 'k2'; r.step(); await r.c.fire();
  assert.deepEqual([r.bodies.at(-1), r.bodies.length, r.shared.view().reason], [{ origin: { block_id: 'k2' } }, 3, 'curious_empty'], 'another card is a view again');
});

// Fix round 1 items 4 and 7: the real request (sharedSteps' default post) with fetch and sessionStorage stubbed.
function wire(t, { me = [] } = {}) {
  const calls = [], m = new Map(), had = { fetch: globalThis.fetch, storage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage') }, w = { calls, status: 200 };
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } });
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url === '/api/me') { const who = me.shift(); return who ? Response.json(who) : new Response('no', { status: 503 }); }
    return Response.json(w.idle ? { idle: true } : w.status === 200 ? sharedSet(calls.length) : { error: 'paused', limited: true }, { status: w.status });
  };
  t.after(() => { globalThis.fetch = had.fetch; if (had.storage) Object.defineProperty(globalThis, 'sessionStorage', had.storage); else delete globalThis.sessionStorage; });
  return w;
}

function realRig(props) {
  const c = clock(), live = { token: 'tok/abc', card: null, version: 4, signedIn: false, ...props };
  const shared = B.sharedSteps(() => live, { setTimer: c.setTimer, clearTimer: c.clearTimer });
  return { c, live, shared, step: () => shared.update(shared.state()) };
}

test('sharedPost: signed out sends nothing at all; signed in sends only the origin; a 429 is limited', async t => {
  const w = wire(t, { me: [{ org: 'ben-ws', email: 'ben@test' }] });
  const out = realRig();
  out.step(); await out.c.fire();
  assert.deepEqual([w.calls, out.shared.view().status, out.shared.view().reason], [[], 'unavailable', 'off'], 'owner R3 decision: no request signed out');
  const signed = realRig({ signedIn: true, card: 'k1' });
  signed.step(); await signed.c.fire();
  assert.deepEqual(w.calls.map(call => call.url), ['/api/me', '/api/learn/boards/shared/tok%2Fabc/next-steps']);
  assert.deepEqual(w.calls.at(-1).body, { origin: { block_id: 'k1' } });
  w.status = 429;
  const limited = realRig({ signedIn: true });
  limited.step(); await limited.c.fire();
  assert.deepEqual([w.calls.length, limited.shared.view().status, limited.shared.view().reason], [4, 'unavailable', 'limited']);
});

// Owner priority 1 (2026-10-21): the real request. A view sends no generate; idle is the Suggest state; the explicit ask sends
// generate, and a reload in the same tab shows that set with no hook request (the edge cache is per data center).
test('sharedPost: a view never sends generate; the explicit ask does; a reload shows the saved set of this tab without a hook request', async t => {
  const ben = { org: 'ben-ws', email: 'ben@test' };
  const w = wire(t, { me: [ben, ben, ben] });
  w.idle = true;
  const view = realRig({ signedIn: true, card: 'k1' });
  view.step(); await view.c.fire();
  assert.deepEqual([w.calls.at(-1).body, view.shared.view().status, view.shared.view().reason], [{ origin: { block_id: 'k1' } }, 'unavailable', 'curious_empty']);
  w.idle = false;
  view.shared.request(); await view.c.fire();
  assert.deepEqual(w.calls.at(-1).body, { origin: { block_id: 'k1' }, generate: true });
  const shown = view.shared.view().set_id;
  assert.equal(view.shared.view().status, 'ready');
  const reload = realRig({ signedIn: true, card: 'k1' });
  reload.step(); await reload.c.fire();
  assert.deepEqual(w.calls.map(call => call.url).slice(4), ['/api/me'], 'the saved set: no hook request');
  assert.deepEqual([reload.shared.view().status, reload.shared.view().set_id], ['ready', shown]);
});

test('sharedPost: a failed /api/me is never cached, and each request reads the identity signed in now; no body ever carries viewer_states', async t => {
  const ben = { org: 'ben-ws', email: 'ben@test' }, cara = { org: 'cara-ws', email: 'cara@test' };
  const w = wire(t, { me: [null, ben, cara] });
  const r = realRig({ signedIn: true });
  r.step(); await r.c.fire();
  r.live.card = 'k1'; r.step(); await r.c.fire();
  r.live.card = 'k2'; r.step(); await r.c.fire();
  assert.equal(w.calls.filter(call => call.url === '/api/me').length, 3, 'the failure was not kept: each request asks again');
  assert.deepEqual(w.calls.filter(call => call.body).map(call => call.body), [{ origin: null }, { origin: { block_id: 'k1' } }, { origin: { block_id: 'k2' } }]);
});

test('LearnNextSteps.jsx: one controller lifecycle shared by ownedSteps and sharedSteps', () => {
  const source = read('LearnNextSteps.jsx');
  assert.equal(source.match(/nextStepsController\(/g).length, 2, 'each hook configures its controller');
  assert.equal(source.match(/ctl\.subscribe\(/g).length, 1, 'the view cache and listeners live in one helper');
  assert.equal(source.match(/ctl\?\.dispose\(\)/g).length, 1, 'one dispose');
  assert.doesNotMatch(source, /viewerOnce|let me\b/, 'no module-level identity cache');
});

// ---- Task 14 A-M1 (owner addition 3): both hook posts carry a 60 s AbortSignal.timeout. Driven through the real default
// posts and a fetch that honours its signal: the timeout records that basis failed and releases the one request in flight, so
// the next basis is posted; a response for the timed-out basis that arrives later never replaces the newer basis's hooks,
// whether that set is loading, ready or shown (and later stale). ----
function hookTimeouts(t) {
  const made = [], had = AbortSignal.timeout, fetched = globalThis.fetch, store = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), calls = [];
  AbortSignal.timeout = ms => { const c = new AbortController(); made.push({ ms, signal: c.signal, fire: () => c.abort(new DOMException('The operation timed out.', 'TimeoutError')) }); return c.signal; };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: () => null } });
  // As the real fetch: an already aborted signal rejects at once and sends nothing; a GET (/api/me) has no body.
  globalThis.fetch = (url, init = {}) => new Promise((resolve, reject) => {
    if (init.signal?.aborted) return reject(init.signal.reason);
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, signal: init.signal, answer: data => resolve(Response.json(data)) });
    init.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  t.after(() => { AbortSignal.timeout = had; globalThis.fetch = fetched; if (store) Object.defineProperty(globalThis, 'localStorage', store); else delete globalThis.localStorage; });
  return { made, calls };
}

const settle = () => ticks(() => false, 10);

test('A-M1 owned: a hung post times out at 60 s, its basis records failed, the next basis is posted, and its late reply never replaces newer hooks', async t => {
  const { made, calls } = hookTimeouts(t);
  const c = clock(), tutor = tutorStub();
  const live = { tutor, journey: null, canvasApi: { current: { blocks: () => [{ id: 'k1', type: 'explanation', title: 'Basins' }] } }, canvasState: { cards: [['k1']] }, record: null, access: { app: 'canvas-0000test' }, title: 'Tidal power', graded: 0, canvasVersion: 7, board: 'main', describe: null };
  const steps = B.ownedSteps(() => live, { setTimer: c.setTimer, clearTimer: c.clearTimer });
  const step = () => steps.update(steps.state());
  step(); c.fire(); await settle(); // not awaited: this request hangs until its timeout fires
  assert.deepEqual([calls.length, calls[0]?.url, made.map(m => m.ms), calls[0]?.signal === made[0]?.signal], [1, '/api/learn/tutor/next-steps', [60000], true], 'the post carries the 60 s timeout signal');
  tutor.lastTurn = { seq: 1, turn_id: 't-1', kind: 'question', transitions: [] };
  step();
  assert.deepEqual([c.pending(), steps.view().status], [0, 'loading'], 'basis B waits behind the request in flight');
  made[0].fire(); await settle();
  assert.equal(c.pending(), 1, 'the timeout released the request slot: basis B is scheduled');
  c.fire(); await settle(); // B is answered below
  assert.deepEqual([calls.length, steps.view().status], [2, 'loading'], 'basis B is posted');
  calls[0].answer(setFor(9)); await settle();
  assert.deepEqual([steps.view().status, steps.view().set_id, tutor.shown.flat().some(id => id.startsWith('ns_00000009'))], ['loading', null, false], 'loading: the late reply is ignored');
  calls[1].answer(setFor(2)); await settle();
  assert.deepEqual([steps.view().status, steps.view().set_id, tutor.shown.at(-1)], ['ready', 'ns_00000002', setFor(2).options.map(o => o.id)], 'ready and shown: basis B');
  calls[0].answer(setFor(9)); await settle();
  assert.deepEqual([steps.view().status, steps.view().set_id], ['ready', 'ns_00000002'], 'ready and shown: still basis B');
  tutor.lastTurn = { seq: 2, turn_id: 't-2', kind: 'question', transitions: [] };
  step();
  calls[0].answer(setFor(9)); await settle();
  assert.deepEqual([steps.view().status, steps.view().set_id], ['stale', 'ns_00000002'], 'the shown set stays the stale fallback');
  tutor.lastTurn = null;
  step(); await c.fire();
  assert.deepEqual([steps.view().status, steps.view().reason, calls.length], ['unavailable', 'failed', 2], 'the timed-out basis records failed and is never asked again');
  assert.equal(tutor.shown.flat().some(id => id.startsWith('ns_00000009')), false, 'the timed-out set never reached the screen');
  steps.dispose();
});

// Signed in (the only viewer who posts since the owner R3 decision): /api/me answers, and the hook request itself hangs.
test('A-M1 shared: the shared hook post carries the 60 s timeout; a timeout is failed for that basis and the next basis is posted', async t => {
  const { made, calls } = hookTimeouts(t);
  const c = clock(), live = { token: 'tok-abc', card: null, version: 4, signedIn: true };
  const shared = B.sharedSteps(() => live, { setTimer: c.setTimer, clearTimer: c.clearTimer });
  const step = () => shared.update(shared.state());
  step(); c.fire(); await settle();
  calls[0].answer({}); await settle(); // not awaited: the hook request hangs until its timeout fires
  assert.deepEqual([calls.map(call => call.url), made.map(m => m.ms), calls[1]?.signal === made[0]?.signal], [['/api/me', '/api/learn/boards/shared/tok-abc/next-steps'], [60000], true]);
  live.card = 'k1'; step();
  assert.equal(c.pending(), 0, 'the next basis waits behind the request in flight');
  made[0].fire(); await settle();
  c.fire(); await settle();
  calls[2].answer({}); await settle(); // answered below
  assert.deepEqual([calls.length, calls[3].body], [4, { origin: { block_id: 'k1' } }], 'the next basis is posted');
  calls[3].answer(sharedSet(2)); await settle();
  calls[1].answer(sharedSet(9)); await settle();
  assert.deepEqual([shared.view().status, shared.view().set_id], ['ready', 'ns_00000002']);
  live.card = null; step(); await c.fire();
  assert.deepEqual([shared.view().status, shared.view().reason, calls.length], ['unavailable', 'failed', 4], 'the timed-out basis records failed');
  shared.dispose();
});

// Task 14 fix-pass re-review C-R1: a signed-in viewer's post first reads /api/me; one 60 s signal covers that read and the
// hook request, so a hung identity read also records its basis failed and lets the next basis post.
test('C-R1 shared, signed in: a hung /api/me times out with the hook request; that basis is failed and the next basis is posted', async t => {
  const { made, calls } = hookTimeouts(t);
  const c = clock(), live = { token: 'tok-abc', card: null, version: 4, signedIn: true };
  const shared = B.sharedSteps(() => live, { setTimer: c.setTimer, clearTimer: c.clearTimer });
  const step = () => shared.update(shared.state());
  step(); c.fire(); await settle(); // /api/me hangs
  assert.deepEqual([calls.map(call => call.url), made.map(m => m.ms)], [['/api/me'], [60000]], 'one timeout, made before the identity read');
  assert.equal(calls[0].signal, made[0].signal, 'the identity read carries it');
  live.card = 'k1'; step();
  assert.equal(c.pending(), 0, 'the next basis waits behind the request in flight');
  made[0].fire(); await settle();
  assert.equal(c.pending(), 1, 'the timeout released the request slot: the next basis is scheduled');
  c.fire(); await settle();
  assert.deepEqual(calls.map(call => call.url), ['/api/me', '/api/me'], 'the timed-out hook request was never sent; the next basis reads /api/me');
  calls[1].answer({}); await settle();
  assert.deepEqual([calls.length, calls[2].url, calls[2].body, calls[2].signal === calls[1].signal], [3, '/api/learn/boards/shared/tok-abc/next-steps', { origin: { block_id: 'k1' } }, true], 'the next basis is posted under its own one signal');
  calls[2].answer(sharedSet(2)); await settle();
  assert.deepEqual([shared.view().status, shared.view().set_id], ['ready', 'ns_00000002']);
  live.card = null; step(); await c.fire();
  assert.deepEqual([shared.view().status, shared.view().reason, calls.length], ['unavailable', 'failed', 3], 'the timed-out basis records failed');
  shared.dispose();
});

// Task 14 C-M2: the not-a-stopping-point goal check reads the live goal the hook input is built from (goalOf over the Tutor
// snapshot), never the page's title fallback prop: an empty learning_goal hole asks for hooks whatever that prop holds.
test('C-M2 ownedSteps: an empty learning_goal hole is not a stopping point whatever the title prop holds; the goal is the live one', async () => {
  const goal = 'Explain why a starter needs feeding';
  for (const title of ['', 'Sourdough notes']) {
    const t = { lastTurn: null, busy: false, showing: () => {} };
    const record = { dive_id: 'dv_1', learning_goal: goal, title: 'Starter' };
    t.snapshot = () => ({ context: { domain: { kind: 'canvas', subject: goal, concepts: {}, claims: {}, context: { goal, origin: null }, contextKey: 'canvas_context', sectionId: null, evidence: { mode: 'session' } }, capabilities: { tutor: true, hook_turns: true }, source: 'canvas' }, store: t.store, parent: null, record, liveTitle: 'Starter' });
    const r = stepsRig({ tutor: t, props: { title, record, canvasApi: { current: { blocks: () => [] } }, canvasState: { cards: [] } } });
    assert.equal(r.steps.state().stop, null, `title prop ${JSON.stringify(title)}: the live goal grounds the hooks`);
    r.step(); await r.c.fire();
    assert.equal(r.bodies[0]?.goal, goal, 'the input goal is the same live goal');
  }
});

// ---- Curious context (owner task 2, 2026-10-13): the semantic fingerprint is in the basis; the request carries its snapshot. ----
const { curiousSnapshot } = await import('./curious-context.js');

// The reported case: a board titled Linked List, with no lesson cards, about a binary search tree.
const treeBoard = () => ({
  shapes: [{ id: 's1', kind: 'ellipse', x1: 0, y1: 0, x2: 40, y2: 40, text: '8' }, { id: 's2', kind: 'ellipse', x1: -80, y1: 100, x2: -40, y2: 140, text: '3' }],
  items: [{ id: 't1', kind: 'text', x: 200, y: 0, w: 220, text: 'binary search tree: left < root < right' }],
  links: [], blocks: [], groups: [], exchanges: [{ id: 'c1', question: 'what is a linked list?', answer: 'A chain of nodes.' }],
});

const semanticRig = (replies = [setFor(1), setFor(2), setFor(3), setFor(4)]) => {
  const canvas = { board: treeBoard(), focus: [] };
  const semantic = () => { const snapshot = curiousSnapshot(canvas.board, canvas.focus); return { snapshot, fingerprint: snapshot.fingerprint }; };
  const r = stepsRig({ replies, props: { title: 'Linked List', canvasApi: { current: { blocks: () => canvas.board.blocks, semantic } }, canvasState: { cards: [] }, access: { app: 'canvas-0000abcd' } } });
  return { ...r, canvas };
};

test('Curious: native content reaches the planner beside the background title; the request carries the fingerprint in its basis', () => withSession(async () => {
  const r = semanticRig();
  r.step(); await r.c.fire();
  const [body] = r.bodies;
  assert.deepEqual([body.goal, body.canvas.title, body.canvas.blocks], ['', 'Linked List', []]);
  assert.deepEqual(body.canvas.objects.map(o => o.text), ['8', '3', 'binary search tree: left < root < right']);
  assert.equal(body.canvas.fingerprint, curiousSnapshot(r.canvas.board).fingerprint, 'the request names the snapshot it carries');
  assert.equal(/linked list\?|chain of nodes/i.test(JSON.stringify(body)), false, 'chat cards stay out, as before');
}));

test('Curious: a same-id text edit and a relation change re-ask with the new content; a move, a selection or a chat answer do not', () => withSession(async () => {
  const r = semanticRig();
  r.step(); await r.c.fire();
  const first = r.steps.state().basis;
  // Moved where they touch nothing new (a move onto the text box would make it a label: a real change).
  r.canvas.board = { ...r.canvas.board, shapes: r.canvas.board.shapes.map(s => ({ ...s, y1: s.y1 + 300, y2: s.y2 + 300 })) };
  r.canvas.focus = ['s2'];
  r.canvas.board.exchanges = [{ id: 'c1', question: 'what is a linked list?', answer: 'Streaming a longer answer now.' }];
  assert.equal(r.steps.state().basis, first, 'movement, selection and a chat answer leave the basis');
  r.step(); await r.c.fire();
  assert.equal(r.bodies.length, 1, 'no planning call');
  r.canvas.board = { ...r.canvas.board, items: [{ ...r.canvas.board.items[0], text: 'AVL tree: rotations keep it balanced' }] };
  const edited = r.steps.state().basis;
  assert.notEqual(edited, first, 'same ids and counts, new words: a new basis');
  r.step(); await r.c.fire();
  assert.equal(r.bodies.length, 2);
  assert.ok(r.bodies[1].canvas.objects.some(o => o.text === 'AVL tree: rotations keep it balanced'));
  r.canvas.board = { ...r.canvas.board, links: [{ id: 'l1', from: 's1', to: 's2', label: 'left child' }] };
  assert.notEqual(r.steps.state().basis, edited, 'a new connector relation: a new basis');
  r.step(); await r.c.fire();
  assert.deepEqual(r.bodies[2].canvas.relations.map(x => [x.from, x.to, x.label, x.source]), [['s1', 's2', 'left child', 'connector']]);
}));

test('Curious: while the canvas reports its words settling, the shown set is stale and unclickable; nothing is asked until they settle', () => withSession(async () => {
  const r = semanticRig();
  r.step(); await r.c.fire();
  assert.equal(r.steps.view().status, 'ready');
  r.live.canvasState = { cards: [], semanticSettling: true };
  r.step();
  assert.equal(r.steps.view().status, 'stale');
  assert.equal(r.steps.select(r.steps.view().options[0].id).ok, false);
  assert.equal(r.c.pending(), 0);
  r.canvas.board = { ...r.canvas.board, items: [{ ...r.canvas.board.items[0], text: 'heap: parent above children' }] };
  r.live.canvasState = { cards: [] };
  r.step(); await r.c.fire();
  assert.deepEqual([r.bodies.length, r.steps.view().status], [2, 'ready']);
  assert.ok(r.bodies[1].canvas.objects.some(o => o.text === 'heap: parent above children'));
}));
