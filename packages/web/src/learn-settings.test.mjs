// Tutor ladder R2: the browser side of Depth and Auto-suggest (learn-settings.js), against the real server route and store
// (control-plane learn-user-settings.js) on node:sqlite, so persistence, a second canvas, a second tab and a second learner are
// the real thing and not a fake that agrees with itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnDb } from '../../control-plane/test/learn-grade-fixture.js';
import { userSettingsRoute } from '../../control-plane/src/learn-user-settings.js';
import { AUTO_SUGGEST_MODES, DEFAULT_SETTINGS, DEPTHS, createSettingsSync, depthField, withAutoSuggest } from './learn-settings.js';
import { effectiveControls } from './learn-coaching-client.js';

const SCHEMA = readFileSync(new URL('../../control-plane/repository-schema.sql', import.meta.url), 'utf8');
const MARK = '-- learn-migrations/0037-learn-user-settings.sql';

// The server for one learner: api(path, init) as src/api.js calls it, answered by the real route.
function server(t, { schema = SCHEMA, down = false } = {}) {
  const db = learnDb(t, schema), env = { LEARN_DB: db.LEARN_DB }, requests = [];
  const as = (user, app = 'canvas-0000aaaa') => async (path, init = {}) => {
    requests.push(`${init.method || 'GET'} ${path}`);
    if (down) throw Object.assign(new Error('offline'), { status: 0 });
    const url = new URL(path, 'https://app.test');
    const res = await userSettingsRoute(url.pathname, new Request(url, init), env, { authorize: async () => ({ kind: 'canvas', org: 'ws', user_id: user, name: app }) });
    const body = await res.json();
    if (!res.ok) throw Object.assign(new Error(body.error), { status: res.status, data: body });
    return body;
  };
  return { as, requests, db };
}
// Browser tabs of one browser: every message a tab posts reaches the others, not itself (BroadcastChannel).
function browser() {
  const tabs = [];
  return { tab: sync => ({ postMessage: message => tabs.filter(other => other !== sync.ref).forEach(other => other.current?.receive(structuredClone(message))) }) };
}
function open(t, srv, { user = 'u-ana', app = 'canvas-0000aaaa', board = 'main', wire = null } = {}) {
  const ref = { current: null };
  const sync = createSettingsSync({ scope: { app, board }, call: srv.as(user, app), channel: wire ? { postMessage: m => wire.send(ref, m) } : null });
  ref.current = sync;
  wire?.join(ref);
  t.after(() => sync.stop());
  return { sync, started: sync.start() };
}
const wire = () => { const refs = []; return { join: ref => refs.push(ref), send: (from, m) => refs.filter(r => r !== from).forEach(r => r.current.receive(structuredClone(m))) }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('the pure helpers: Depth rides only when chosen, Ask shows no Auto-suggest, off Auto-suggest quiets the Tutor and nothing else', () => {
  assert.deepEqual(DEPTHS.map(([id]) => id), ['overview', 'standard', 'deep']);
  assert.deepEqual(depthField({ depth: 'standard' }), {}); assert.deepEqual(depthField(null), {}); assert.deepEqual(depthField({ depth: 'deep' }), { depth: 'deep' });
  assert.deepEqual(AUTO_SUGGEST_MODES, ['auto', 'tutor']); assert.ok(!AUTO_SUGGEST_MODES.includes('ask'));
  const on = { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false, revision: 3 };
  assert.deepEqual(withAutoSuggest(on, { autoSuggest: false }), { ...on, tutorEnabled: false });
  assert.equal(withAutoSuggest(on, { autoSuggest: true }), on); assert.equal(withAutoSuggest(on, null), on);
  // effectiveControls is what every proactive decision reads; the canvas's own saved switch is not rewritten.
  const coaching = { status: 'ready', controls: on, autoSuggest: false };
  assert.equal(effectiveControls(coaching, { mode: 'tutor' }).tutorEnabled, false);
  assert.equal(coaching.controls.tutorEnabled, true);
  assert.equal(effectiveControls({ ...coaching, autoSuggest: true }, { mode: 'tutor' }).tutorEnabled, true);
  assert.equal(effectiveControls({ ...coaching, status: 'local', controls: { ...on, mode: 'auto' }, autoSuggest: false }, { mode: 'tutor' }).tutorEnabled, false, 'also where the controls are local');
});

test('a learner with nothing saved has the defaults; a change applies at once, is saved, and survives a reload', async t => {
  const srv = server(t);
  const first = open(t, srv); await first.started;
  assert.deepEqual(first.sync.view().settings, DEFAULT_SETTINGS);
  assert.equal(first.sync.view().status, 'ready');
  const saving = first.sync.set({ depth: 'deep' });
  assert.equal(first.sync.view().depth, 'deep', 'applied before the server answers');
  assert.equal(first.sync.view().saveStatus, 'saving');
  await saving;
  assert.equal(first.sync.view().saveStatus, 'saved');
  await first.sync.set({ autoSuggest: false });
  const reloaded = open(t, srv); await reloaded.started;
  assert.deepEqual(reloaded.sync.view().settings, { depth: 'deep', autoSuggest: false });
});

test('a second canvas keeps its own Depth and shares Auto-suggest; another learner is untouched', async t => {
  const srv = server(t);
  const a = open(t, srv, { app: 'canvas-0000aaaa' }); await a.started;
  await a.sync.set({ depth: 'overview', autoSuggest: false });
  const b = open(t, srv, { app: 'canvas-0000bbbb' }); await b.started;
  assert.deepEqual(b.sync.view().settings, { depth: 'standard', autoSuggest: false });
  await b.sync.set({ depth: 'deep' });
  const aAgain = open(t, srv, { app: 'canvas-0000aaaa' }); await aAgain.started;
  assert.equal(aAgain.sync.view().depth, 'overview');
  const ben = open(t, srv, { user: 'u-ben', app: 'canvas-0000aaaa' }); await ben.started;
  assert.deepEqual(ben.sync.view().settings, DEFAULT_SETTINGS);
  await ben.sync.set({ depth: 'deep', autoSuggest: true });
  const ana = open(t, srv, { app: 'canvas-0000aaaa' }); await ana.started;
  assert.deepEqual(ana.sync.view().settings, { depth: 'overview', autoSuggest: false }, 'Ben\'s change did not reach Ana');
});

test('open tabs follow a change: the same canvas takes Depth and Auto-suggest, another canvas takes only Auto-suggest, another learner nothing', async t => {
  const srv = server(t), net = wire();
  const one = open(t, srv, { wire: net }), same = open(t, srv, { wire: net }), other = open(t, srv, { app: 'canvas-0000bbbb', wire: net }), ben = open(t, srv, { user: 'u-ben', wire: net });
  await Promise.all([one.started, same.started, other.started, ben.started]);
  await one.sync.set({ depth: 'deep', autoSuggest: false });
  assert.deepEqual(same.sync.view().settings, { depth: 'deep', autoSuggest: false });
  assert.deepEqual(other.sync.view().settings, { depth: 'standard', autoSuggest: false });
  assert.deepEqual(ben.sync.view().settings, DEFAULT_SETTINGS, 'one browser, two learners: nothing crosses');
  let heard = 0; same.sync.subscribe(() => heard++);
  same.sync.receive({ app: 'canvas-0000aaaa', board: 'main', learner: 'someone-else', settings: { depth: 'overview', autoSuggest: true } });
  assert.equal(same.sync.view().depth, 'deep'); assert.equal(heard, 0);
  // A message from before this tab knew who the learner is changes nothing.
  const fresh = createSettingsSync({ scope: { app: 'canvas-0000aaaa', board: 'main' }, call: srv.as('u-ana') });
  fresh.receive({ app: 'canvas-0000aaaa', board: 'main', learner: 'x', settings: { depth: 'overview', autoSuggest: false } });
  assert.deepEqual(fresh.view().settings, DEFAULT_SETTINGS);
});

test('a refused value is never sent; an offline save keeps the choice in this tab and says it is not saved', async t => {
  const srv = server(t);
  const { sync, started } = open(t, srv); await started;
  const before = srv.requests.length;
  assert.equal(await sync.set({ depth: 'shallow' }), false);
  assert.equal(await sync.set({ autoSuggest: 'yes' }), false);
  assert.equal(srv.requests.length, before, 'nothing sent');
  assert.equal(sync.view().depth, 'standard');
  const down = server(t, { down: true });
  const offline = open(t, down); await offline.started;
  assert.equal(offline.sync.view().status, 'error');
  await offline.sync.set({ depth: 'deep' });
  assert.deepEqual([offline.sync.view().depth, offline.sync.view().saveStatus], ['deep', 'error']);
});

test('a database without 0037 loads as the defaults marked unsaved, and a change is reported as not saved, never as saved', async t => {
  const srv = server(t, { schema: SCHEMA.slice(0, SCHEMA.indexOf(MARK)) });
  const { sync, started } = open(t, srv); await started;
  assert.deepEqual([sync.view().status, sync.view().settings], ['unsaved', DEFAULT_SETTINGS]);
  await sync.set({ depth: 'overview' });
  assert.deepEqual([sync.view().depth, sync.view().saveStatus], ['overview', 'error']);
});

test('quick changes in two tabs end agreeing with the server, and a message never overwrites a tab whose save is in flight', async t => {
  const srv = server(t), net = wire();
  const one = open(t, srv, { wire: net }), two = open(t, srv, { wire: net });
  await Promise.all([one.started, two.started]);
  const a = one.sync.set({ depth: 'overview' }), b = one.sync.set({ depth: 'deep' }), c = two.sync.set({ depth: 'overview' });
  two.sync.receive({ app: 'canvas-0000aaaa', board: 'main', learner: 'whoever', settings: { depth: 'deep', autoSuggest: true } });
  assert.equal(two.sync.view().depth, 'overview', 'a save in flight is not overwritten');
  await Promise.all([a, b, c]); await tick();
  const check = open(t, srv); await check.started;
  assert.equal(one.sync.view().depth, check.sync.view().depth, 'the tabs end on what the server holds');
  assert.equal(two.sync.view().depth, check.sync.view().depth);
  assert.deepEqual([one.sync.view().saveStatus, two.sync.view().saveStatus], ['saved', 'saved']);
});
