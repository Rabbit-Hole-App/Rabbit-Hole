// Professor Next Steps UI wiring (contract §1.3, §1.4): useTutor's askStep and useNextSteps, bundled with esbuild and
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
import { journeyDomain } from './learn-journey-domain.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { TIDES } from './__fixtures__/journey-synthetic-domains.mjs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dir = mkdtempSync(join(tmpdir(), 'next-steps-ui-')), outfile = join(dir, 'ui.cjs');
await esbuild.build({
  stdin: { contents: ["export { useTutor } from './LearnTutor.jsx';", "export { useNextSteps, ownedSteps } from './LearnNextSteps.jsx';", "export { TUTOR_DOMAINS } from './learn-tutor-domains.js';",
    "export { materialCommands } from './learn-slash.js';", "export { addSink } from './learn-tutor-trace.js';", "export { createElement } from 'react';", "export { renderToStaticMarkup } from 'react-dom/server';"].join('\n'),
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// A course registered only in this test's registry data, on the TIDES registry (session evidence: the dive form).
const IDS = Object.keys(TIDES.diagnostic.registry.claims).slice(0, 2);
const J = { id: 'lj_ui', state: 'active', registry: TIDES.diagnostic.registry, evidence: { seq: 0, events: [] }, active_section_id: 's1', request: { topic: TIDES.topic }, intake: { slots: {} } };
const PATH = { version: 1, goal: 'Understand tidal power', sections: [{ id: 's1', title: 'Ranges', purpose: 'p', status: 'current', expected_evidence: IDS.map(claim => ({ claim, kind: 'explain' })) }] };
const DOMAIN = journeyDomain({ journey: J, path: PATH, blocks: [], dive: { journey_id: 'lj_ui', section_id: 's1', concept_ids: [], claim_ids: IDS } });
const COURSE = { id: 'tides-ui', match: { repo: 'example/tides-ui' }, domain: DOMAIN, capabilities: { tutor: true, evidence: 'session' } };
const STEP = { v: 1, set_id: 'ns_0c0c0c0c', suggestion_id: 'ns_0c0c0c0c.1', basis: 'b', hook: 'Why do some coasts barely see a tide?', learning_goal: 'Explain how basin shape changes tidal range', concept_ids: [], claim_ids: [IDS[1]], scope: 'owned' };
const TEXT = { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Here is something to try.' }] };
const MATERIAL = B.materialCommands().find(m => !m.paid)?.command;
const ticks = async (done, n = 50) => { for (let i = 0; i < n && !done(); i++) await new Promise(resolve => setImmediate(resolve)); };
const KEY = 'small.tutor:o:e@x.com';

// course: the registry entry for this canvas (null: none). journey: a journey view on the board. card/blocks: the selection.
function rig({ plan = TEXT, artifact = null, course = COURSE, journey = null, card = null, blocks = [] } = {}) {
  const storage = new Map(), calls = [], inserted = [];
  const globals = {
    window: { dispatchEvent: () => true },
    sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    localStorage: { getItem: () => null },
    fetch: async (path, options) => {
      calls.push({ path, body: JSON.parse(options.body) });
      const reply = path === '/api/learn/tutor/plan' ? plan : path === '/api/learn/artifact' ? artifact : { status: 'error', evaluator: 'jev', events: [] };
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  let tutor = null;
  const canvasApi = { current: { blocks: () => blocks, block: id => blocks.find(b => b.id === id) || null, insertBlock: block => { inserted.push(block); return 'new-id'; }, reserve: () => 'slot', release: () => {} } };
  const registered = fn => { if (course) B.TUTOR_DOMAINS.push(course); try { return fn(); } finally { if (course) B.TUTOR_DOMAINS.splice(B.TUTOR_DOMAINS.indexOf(course), 1); } };
  const Page = () => { tutor = B.useTutor({ app: { name: 'canvas-0000test', org: 'o', email: 'e@x.com', repo: 'example/tides-ui' }, board: 'main', access: { app: 'canvas-0000test' }, canvasApi, canvasState: { card }, dive: { tree: null, suggestionCard: null }, courseCanvas: true, journey }); return null; };
  registered(() => B.renderToStaticMarkup(B.createElement(Page)));
  // The registry entry must be present while turns resolve their domain, so run() registers it again around fn.
  const run = async fn => {
    const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    if (course) B.TUTOR_DOMAINS.push(course);
    try { return await fn(tutor); } finally {
      if (course) B.TUTOR_DOMAINS.splice(B.TUTOR_DOMAINS.indexOf(course), 1);
      for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    }
  };
  return { run, calls, inserted, storage, tutor: () => tutor, planBody: () => calls.find(c => c.path === '/api/learn/tutor/plan').body, paths: () => calls.map(c => c.path) };
}
const withMaterial = { strategy: 'feynman', constraints_add: [], actions: [{ type: 'respond_text', text: 'Here is something to try.' }, { type: 'create_material', command: MATERIAL, request: 'tidal range by basin shape' }] };

test('askStep: one next_step turn, no evaluate call, the reply text; create_material runs the Learn command path', async () => {
  assert.ok(MATERIAL, 'the registry offers at least one free material command');
  const r = rig({ plan: withMaterial, artifact: { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 't', body: 'b' } } });
  const reply = await r.run(async tutor => { const text = await tutor.askStep({ selected_next_step: STEP }); await ticks(() => r.inserted.length === 1); return text; });
  assert.equal(reply, 'Here is something to try.');
  assert.deepEqual(r.paths().filter(p => p.startsWith('/api/learn/tutor/')), ['/api/learn/tutor/plan']);
  assert.equal(r.planBody().context.learner_intent.kind, 'next_step');
  assert.equal(r.planBody().context.learner_intent.raw_user_message, '');
  assert.deepEqual(r.calls.find(c => c.path === '/api/learn/artifact').body.command, MATERIAL);
  assert.equal(r.inserted.length, 1);
});

test('askStep with a paid material: the proposal waits for Generate, nothing is inserted on its own', async () => {
  const r = rig({ plan: withMaterial, artifact: { result: 'paid_proposal', primitive: 'x', message: 'This uses paid generation.', block: { type: 'explanation', title: 't' } } });
  await r.run(async tutor => { await tutor.askStep({ selected_next_step: STEP }); await ticks(() => r.calls.some(c => c.path === '/api/learn/artifact')); await ticks(() => false, 5); });
  assert.equal(r.inserted.length, 0);
});

// Owner extra test 12f: Voice Mode keeps hooks clickable; the click enters the same Tutor path as a voice turn.
test('askStep in Voice Mode: the same next_step turn, input_modality voice', async () => {
  const r = rig();
  await r.run(tutor => tutor.askStep({ selected_next_step: STEP, inputModality: 'voice' }));
  assert.deepEqual([r.planBody().context.learner_intent.kind, r.planBody().context.learner_intent.input_modality], ['next_step', 'voice']);
});

// Contract §1.4: a click is never evidence - no target block (so no practice rung), store events and seq unchanged.
test('askStep with a selected card: block null, so no target and no evidence; a typed turn still reads the card', async () => {
  const card = { id: 'k1', type: 'explanation', title: 'Basins', body: 'A narrow bay funnels the tide.' };
  const r = rig({ card, blocks: [card] });
  await r.run(tutor => tutor.askStep({ selected_next_step: STEP }));
  assert.equal(r.planBody().context.target, null);
  const stored = JSON.parse(r.storage.get(KEY));
  assert.deepEqual([stored.events, stored.seq], [[], 0]);
  const typed = rig({ card, blocks: [card] });
  await typed.run(tutor => tutor.ask({ raw: 'why is this?' }));
  assert.match(typed.planBody().context.target.description, /Basins/);
});

test('askStep on a journey canvas: never the journey resolver, no evaluate, no journey route; the journey evidence unchanged', async () => {
  const resolved = [];
  const journey = { journey: J, path: PATH, handleText: async raw => { resolved.push(raw); return { handled: false, text: raw }; } };
  const r = rig({ course: null, journey });
  await r.run(tutor => tutor.askStep({ selected_next_step: STEP }));
  assert.deepEqual([resolved, r.paths()], [[], ['/api/learn/tutor/plan']]);
  const stored = JSON.parse(r.storage.get(`${KEY}:journey:lj_ui`));
  assert.deepEqual([stored.events, stored.seq, J.evidence], [[], 0, { seq: 0, events: [] }]);
  await r.run(tutor => tutor.ask({ raw: 'what is a barrage?' }));
  assert.deepEqual(resolved, ['what is a barrage?'], 'a typed turn still goes through the resolver');
});

test('snapshot and the session id: minted once per store, stable across turns, never sent to the planner', async () => {
  const r = rig();
  await r.run(tutor => tutor.ask({ raw: 'what is a barrage?' }));
  await r.run(tutor => tutor.askStep({ selected_next_step: STEP }));
  const stored = JSON.parse(r.storage.get(KEY));
  assert.match(stored.session_id, /^ts_[0-9a-f]{16}$/);
  assert.equal(JSON.stringify(r.calls).includes(stored.session_id), false);
  const snap = await r.run(async tutor => tutor.snapshot());
  assert.deepEqual([snap.store.session_id, snap.context.source, snap.parent, snap.record], [stored.session_id, 'registry', null, null]);
  assert.deepEqual(stored.modalities, ['text', 'text'], 'one text reply per turn, oldest first');
  assert.deepEqual(stored.turns.map(t => t.next_step ?? null), [null, STEP.suggestion_id]);
});

test('telemetry: with sinks registered, askStep emits one tutor_decision after the reply; a throwing sink never fails the turn', async () => {
  const events = [], before = globalThis.__smallTutorTraceErrors || 0;
  const plain = await rig().run(tutor => tutor.askStep({ selected_next_step: STEP }));
  const off = [B.addSink(event => events.push(event)), B.addSink(() => { throw new Error('sink'); })];
  try {
    const r = rig();
    const traced = await r.run(async tutor => { tutor.showing([{ id: STEP.suggestion_id, hook: STEP.hook, selected_next_step: STEP }]); return tutor.askStep({ selected_next_step: STEP }); });
    await ticks(() => events.length > 0);
    assert.equal(traced, plain);
    const [e] = events;
    assert.deepEqual([events.length, e.event, e.decision.selected_next_step_id, e.identity.session_id], [1, 'tutor_decision', STEP.suggestion_id, JSON.parse(r.storage.get(KEY)).session_id]);
    assert.match(e.decision.selected_at, /^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(e.decision.next_step_options.map(o => [o.suggestion_id, o.set_id, o.position]), [[STEP.suggestion_id, STEP.set_id, 1]]);
    assert.equal(globalThis.__smallTutorTraceErrors, before + 1);
    assert.equal(r.calls.some(c => 'trace' in c.body || JSON.stringify(c.body).includes('tutor_decision')), false, 'nothing about the trace is sent');
  } finally { off.forEach(remove => remove()); }
});

// Ruling F4: hook turns (askStep), a carried opening and the paid proposals run where capabilities.tutor or hook_turns holds;
// typed and voice turns need capabilities.tutor. Task 10 adds hook_turns for plain canvases; a stub registry entry here.
test('F4: a hook_turns-only canvas gets askStep, opening and extras but no typed Tutor; neither capability gets no opening or extras', async () => {
  const hooksOnly = rig({ course: { ...COURSE, id: 'hooks-only', capabilities: { tutor: false, hook_turns: true, evidence: 'session' } } });
  const t = hooksOnly.tutor();
  assert.deepEqual([t.active, 'opening' in t, 'extras' in t, typeof t.askStep, t.ask, t.voiceTurn], [false, true, true, 'function', undefined, undefined]);
  assert.equal(await hooksOnly.run(tutor => tutor.askStep({ selected_next_step: STEP })), 'Here is something to try.');
  assert.equal(hooksOnly.planBody().context.learner_intent.kind, 'next_step');
  const closed = rig({ course: { ...COURSE, id: 'closed', capabilities: { tutor: false, evidence: 'session' } } });
  const c = closed.tutor();
  assert.deepEqual([c.active, 'opening' in c, 'extras' in c, typeof c.askStep, typeof c.snapshot], [false, false, false, 'function', 'function']);
  assert.deepEqual(await closed.run(tutor => tutor.askStep({ selected_next_step: STEP })), { text: '', handled: true, failed: true });
  assert.deepEqual([closed.calls, (await closed.run(async tutor => tutor.snapshot())).context], [[], null]);
  const full = rig().tutor();
  assert.deepEqual([full.active, typeof full.ask, typeof full.askStep, 'opening' in full, 'extras' in full], [true, 'function', 'function', true, true]);
});

const renderSteps = props => {
  let steps = null;
  const Page = () => { steps = B.useNextSteps({ journey: null, canvasApi: { current: { blocks: () => [] } }, canvasState: { cards: [] }, record: null, access: { app: 'a' }, title: '', graded: 0, ...props }); return null; };
  B.renderToStaticMarkup(B.createElement(Page));
  return steps;
};

test('useNextSteps: exactly the steps shape, unavailable/off without a Tutor; the module never reads the mode, evidence routes or a course', () => {
  const steps = renderSteps({ tutor: { active: false } });
  assert.deepEqual(Object.keys(steps).sort(), ['generated_at', 'options', 'reason', 'select', 'set_id', 'status']);
  assert.deepEqual([steps.status, steps.reason, steps.set_id, steps.generated_at, steps.options], ['unavailable', 'off', null, null, []]);
  assert.deepEqual(steps.select('ns_00000000.1'), { ok: false, reason: 'unknown' });
  const source = read('LearnNextSteps.jsx');
  assert.doesNotMatch(source, /voice/i, 'Voice Mode never decides whether hooks show');
  assert.doesNotMatch(source, /\/api\/learn\/tutor\/evaluate|\/api\/learn\/journey/, 'no evidence route on a hook path');
  assert.doesNotMatch(source, /nanogpt|karpathy|attention|softmax|tides|aqueduct|fixture/i, 'no runtime branch on a course, topic or fixture');
  assert.doesNotMatch(source, /from '\.\/LearningBlocks/, 'LearningBlocks.jsx cannot load under node; describe is a parameter');
  assert.match(source, /nextStepsController\(/);
  assert.match(source, /'\/api\/learn\/tutor\/next-steps'/);
  assert.match(source, /emitDecision\(hooksEvent\(/);
  assert.match(source, /emitDecision\(shownEvent\(/);
  // The update effect depends on the trigger state alone: never on a click, pan, zoom, hover or pointer movement.
  assert.match(source, /useEffect\(\(\) => \{ steps\.update\(\{ basis, stop \}\); \}, \[basis, stop\]\);/);
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
// A tutor stub with useTutor's step surface: snapshot() reads the live store and context.
function tutorStub(over = {}) {
  const shown = [];
  const t = { askStep: async () => 'ok', lastTurn: null, busy: false, store: { ...emptyStore(), session_id: 'ts_00000000000000aa' }, context: { domain: DOMAIN, capabilities: COURSE.capabilities, source: 'registry' }, record: null,
    showing: options => shown.push(options.map(o => o.id)), shown, ...over };
  t.snapshot = () => ({ context: t.context, store: t.store, parent: null, record: t.record });
  return t;
}
function stepsRig({ tutor = tutorStub(), replies = [setFor(1)], props = {} } = {}) {
  const c = clock(), bodies = [];
  const live = { tutor, journey: null, canvasApi: { current: { blocks: () => [{ id: 'k1', type: 'explanation', title: 'Basins' }] } }, canvasState: { cards: [['k1']] }, record: null, access: { app: 'canvas-0000test' }, title: 'Tidal power', graded: 0, canvasVersion: 7, board: 'main', describe: null, ...props };
  const steps = B.ownedSteps(() => live, { post: async input => { bodies.push(input); const r = await replies.shift(); if (r instanceof Error) throw r; return structuredClone(r); }, setTimer: c.setTimer, clearTimer: c.clearTimer });
  const step = () => steps.update(steps.state());
  return { c, live, steps, bodies, step, tutor };
}

test('ownedSteps: off where snapshot().context is null or there is no askStep; nothing is posted', async () => {
  for (const tutor of [tutorStub({ context: null }), { active: false }, null]) {
    const r = stepsRig({ tutor });
    assert.deepEqual(r.steps.state(), { basis: null, stop: 'off' });
    r.step(); await r.c.fire();
    assert.deepEqual([r.steps.view().status, r.steps.view().reason, r.bodies.length, r.c.pending()], ['unavailable', 'off', 0, 0]);
  }
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
  assert.deepEqual([r.bodies[0].basis, r.bodies[0].mode, r.bodies[0].goal], [basis, 'canvas', DOMAIN.subject || 'Tidal power, renamed before the debounce ends']);
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

test('ownedSteps telemetry: next_steps_computed at landing with the identity of the sent input, next_steps_shown once at first show; never when off', async () => {
  const events = [];
  const quiet = stepsRig();
  quiet.step(); await quiet.c.fire();
  assert.equal(quiet.steps.view().status, 'ready', 'no sink: the same behaviour');
  const off = [B.addSink(e => events.push(e)), B.addSink(() => { throw new Error('sink'); })];
  try {
    let release; const slow = new Promise(resolve => { release = resolve; });
    const r = stepsRig({ replies: [slow, setFor(2)] });
    r.step();
    const first = r.c.fire();
    // The live state moves on (a hole is entered, a new session store) while the first request is in flight.
    r.tutor.store = { ...r.tutor.store, session_id: 'ts_00000000000000bb', seq: 3 };
    r.tutor.record = r.live.record = { dive_id: 'canvas-0000hole', title: 'Basins' };
    r.live.canvasVersion = 8;
    r.step();
    release(setFor(1)); await first;
    await ticks(() => events.length > 0);
    assert.deepEqual(events.map(e => [e.event, e.step_id, e.flags]), [['next_steps_computed', 'ns_00000001', ['discarded']]]);
    assert.deepEqual([events[0].identity.session_id, events[0].identity.canvas_version, events[0].identity.dive_id, events[0].identity.mode, events[0].identity.canvas_id, events[0].identity.board_id],
      ['ts_00000000000000aa', 7, null, 'course', 'canvas-0000test', 'main'], 'identity from when the input was sent, not live state');
    await r.c.fire();
    await ticks(() => events.length >= 3);
    assert.deepEqual(events.map(e => [e.event, e.step_id]), [['next_steps_computed', 'ns_00000001'], ['next_steps_computed', 'ns_00000002'], ['next_steps_shown', 'ns_00000002']]);
    assert.deepEqual([events[1].identity.session_id, events[1].identity.dive_id, events[1].identity.mode, events[2].identity.dive_id, events[2].identity.canvas_version], ['ts_00000000000000bb', 'canvas-0000hole', 'dive', 'canvas-0000hole', 8]);
    assert.deepEqual(events[2].decision.next_step_options.map(o => [o.suggestion_id, o.position]), [['ns_00000002.1', 1], ['ns_00000002.2', 2], ['ns_00000002.3', 3]]);
    r.step();
    assert.equal(events.filter(e => e.event === 'next_steps_shown').length, 1, 'once per set');
    assert.equal(JSON.stringify(r.bodies).includes('ts_0000'), false, 'the session id is never sent');
  } finally { off.forEach(remove => remove()); }
});

test('LearnTutor.jsx source pins: block null and no journey resolver on a click, materials through runMaterials, trace only when tracing', () => {
  const source = read('LearnTutor.jsx');
  assert.match(source, /const block = nextStep \? null :/);
  assert.match(source, /if \(live && !slash && !opening && !skipJourney && !nextStep\)/);
  assert.match(source, /materials: nextStep \? materialCommands\(\) : \[\]/);
  assert.match(source, /trace: tracing\(\) && \{ identity: \{ canvas_version: canvasVersion \}, blocks: canvas\?\.blocks\?\.\(\) \|\| \[\], next_step_options: shown\.current, selected_at: selectedAt \}/);
  assert.match(source, /runMaterials\(result\.actions, \{/);
  assert.doesNotMatch(source, /runLearnCommand\(/, 'no second command path: runMaterials runs each create_material');
  // lastTurn and busy are React state (no re-render under renderToStaticMarkup): pinned in source; ownedSteps tests cover their use.
  assert.match(source, /setLastTurn\(\{ seq: \+\+seq\.current, turn_id: result\.turn\.turn_id, kind: intent\.kind/);
  assert.match(source, /setBusy\(true\)/);
  assert.match(source, /if \(result\.trace\) emitDecision\(result\.trace\);/);
  assert.match(source, /const askStep = \(\{ selected_next_step, signal, begin = null, inputModality = 'text', turnId = null, onSpeakable = null \}\) => answer\(/);
});
