// Tutor ladder R2: the browser side of Depth and Auto-suggest (learn-settings.js), against the real server route and store
// (control-plane learn-user-settings.js) on node:sqlite, so persistence, a second canvas, a second tab, a stale tab and a second
// learner are the real thing and not a fake that agrees with itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnDb } from '../../control-plane/test/learn-grade-fixture.js';
import { userSettingsRoute } from '../../control-plane/src/learn-user-settings.js';
import { AUTO_SUGGEST_MODES, DEFAULT_SETTINGS, DEPTHS, SUGGESTION_CAPABILITIES, autoSuggestShown, createSettingsSync, depthField, depthOf, settingsSnapshot, withAutoSuggest } from './learn-settings.js';
import { effectiveControls } from './learn-coaching-client.js';
import { canCoach } from './learn-coaching-contract.js';
import { generateCommand } from './learn-slash.js';

const SCHEMA = readFileSync(new URL('../../control-plane/repository-schema.sql', import.meta.url), 'utf8');
const MARK = '-- learn-migrations/0037-learn-user-settings.sql';

// The server for one learner: api(path, init) as src/api.js calls it (a refusal throws with status and data), answered by the real route.
function server(t, { schema = SCHEMA, down = false } = {}) {
  const db = learnDb(t, schema), env = { LEARN_DB: db.LEARN_DB }, requests = [];
  const as = (user, app = 'canvas-0000aaaa') => async (path, init = {}) => {
    requests.push(`${init.method || 'GET'} ${path}${init.body ? ` ${init.body}` : ''}`);
    if (down) throw Object.assign(new Error('offline'), { status: 0 });
    const url = new URL(path, 'https://app.test');
    const res = await userSettingsRoute(url.pathname, new Request(url, init), env, { authorize: async () => ({ kind: 'canvas', org: 'ws', user_id: user, name: app }) });
    const body = await res.json();
    if (!res.ok) throw Object.assign(new Error(body.error), { status: res.status, data: body });
    return body;
  };
  return { as, requests, db };
}
const wire = () => { const refs = []; return { join: ref => refs.push(ref), send: (from, m) => refs.filter(r => r !== from).forEach(r => r.current.receive(structuredClone(m))) }; };
// A tab: a sync started against the server. wire: the browser's channel, shared by the tabs of one browser.
function open(t, srv, { user = 'u-ana', app = 'canvas-0000aaaa', board = 'main', wire: net = null } = {}) {
  const ref = { current: null };
  const sync = createSettingsSync({ scope: { app, board }, call: srv.as(user, app), channel: net ? { postMessage: m => net.send(ref, m) } : null });
  ref.current = sync;
  net?.join(ref);
  t.after(() => sync.stop());
  return { sync, started: sync.start() };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('the pure helpers: Depth rides only when chosen and Standard sends nothing', () => {
  assert.deepEqual(DEPTHS.map(([id]) => id), ['brief', 'balanced', 'detailed']);
  assert.deepEqual(depthField({ depth: 'balanced' }), {}); assert.deepEqual(depthField(null), {}); assert.deepEqual(depthField({ depth: 'detailed' }), { depth: 'detailed' });
});

test('Auto and Tutor show applicable toggle; Ask hides toggle; no capability hides inert toggle', () => {
  assert.deepEqual(AUTO_SUGGEST_MODES, ['auto', 'tutor']);
  assert.ok(SUGGESTION_CAPABILITIES.length > 0, 'this build has a deployed suggestion behavior for the switch to govern');
  assert.deepEqual(['auto', 'tutor', 'ask'].map(mode => autoSuggestShown(mode)), [true, true, false]);
  // The same modes with no deployed behavior to govern: the preference is still saved, the switch is not shown.
  assert.deepEqual(['auto', 'tutor', 'ask'].map(mode => autoSuggestShown(mode, [])), [false, false, false]);
  assert.equal(autoSuggestShown('auto', ['roadmap_invitations']), true, 'a release that adds a capability shows it');
});

test('the learner Auto-suggest setting overrides the canvas record and nothing else; the canvas record is not rewritten', () => {
  const on = { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false, revision: 3 };
  const off = { ...on, tutorEnabled: false };
  assert.deepEqual(withAutoSuggest(on, { autoSuggest: false }), off);
  assert.equal(withAutoSuggest(on, { autoSuggest: true }), on); assert.equal(withAutoSuggest(on, null), on);
  assert.deepEqual(withAutoSuggest(off, { autoSuggest: true }), on, 'On overrides a canvas record that says off (no control for it remains)');
  assert.equal(withAutoSuggest(off, { autoSuggest: false }), off);
  const coaching = { status: 'ready', controls: on, autoSuggest: false };
  assert.equal(effectiveControls(coaching, { mode: 'tutor' }).tutorEnabled, false);
  assert.equal(coaching.controls.tutorEnabled, true);
  assert.equal(effectiveControls({ ...coaching, autoSuggest: true }, { mode: 'tutor' }).tutorEnabled, true);
  assert.equal(effectiveControls({ ...coaching, controls: off, autoSuggest: true }, { mode: 'tutor' }).tutorEnabled, true, 'the canvas record is ignored');
  assert.equal(effectiveControls({ ...coaching, status: 'local', controls: { ...on, mode: 'auto' }, autoSuggest: false }, { mode: 'tutor' }).tutorEnabled, false, 'also where the controls are local');
});

test('pause remains after enable: switching Auto-suggest back on does not erase a cancellation pause', () => {
  const paused = { mode: 'tutor', tutorEnabled: true, suggestionsPaused: true, revision: 5 };
  const ready = { chatOpen: true, ready: true };
  for (const autoSuggest of [false, true]) {
    const effective = effectiveControls({ status: 'ready', controls: paused, autoSuggest }, { mode: 'tutor' });
    assert.equal(effective.suggestionsPaused, true, `Auto-suggest ${autoSuggest}: the pause is still there`);
    assert.equal(canCoach(effective, ready), false, `Auto-suggest ${autoSuggest}: a paused Tutor suggests nothing`);
  }
  assert.deepEqual(effectiveControls({ status: 'ready', controls: paused, autoSuggest: true }, { mode: 'tutor' }), paused, 'on again: exactly the saved controls');
  const live = { ...paused, suggestionsPaused: false };
  assert.equal(canCoach(effectiveControls({ status: 'ready', controls: live, autoSuggest: true }, { mode: 'tutor' }), ready), true);
  assert.equal(canCoach(effectiveControls({ status: 'ready', controls: live, autoSuggest: false }, { mode: 'tutor' }), ready), false);
});

test('a learner with nothing saved has the defaults; a change applies at once, is saved, and survives a reload', async t => {
  const srv = server(t);
  const first = open(t, srv); await first.started;
  assert.deepEqual(first.sync.view().settings, DEFAULT_SETTINGS);
  assert.deepEqual([first.sync.view().status, first.sync.view().depthRevision], ['ready', 0]);
  const saving = first.sync.set({ depth: 'detailed' });
  assert.equal(first.sync.view().depth, 'detailed', 'applied before the server answers');
  assert.equal(first.sync.view().saveStatus, 'saving');
  await saving;
  assert.deepEqual([first.sync.view().saveStatus, first.sync.view().depthRevision], ['saved', 1]);
  await first.sync.set({ autoSuggest: false });
  const reloaded = open(t, srv); await reloaded.started;
  assert.deepEqual(reloaded.sync.view().settings, { depth: 'detailed', autoSuggest: false });
  assert.equal(reloaded.sync.view().depthRevision, 1);
});

test('global update reaches second canvas, Depth stays on original canvas, and another learner is untouched', async t => {
  const srv = server(t);
  const a = open(t, srv, { app: 'canvas-0000aaaa' }); await a.started;
  await a.sync.set({ depth: 'brief' }); await a.sync.set({ autoSuggest: false });
  const b = open(t, srv, { app: 'canvas-0000bbbb' }); await b.started;
  assert.deepEqual(b.sync.view().settings, { depth: 'balanced', autoSuggest: false });
  await b.sync.set({ depth: 'detailed' });
  const aAgain = open(t, srv, { app: 'canvas-0000aaaa' }); await aAgain.started;
  assert.equal(aAgain.sync.view().depth, 'brief');
  const ben = open(t, srv, { user: 'u-ben', app: 'canvas-0000aaaa' }); await ben.started;
  assert.deepEqual(ben.sync.view().settings, DEFAULT_SETTINGS);
  await ben.sync.set({ depth: 'detailed' }); await ben.sync.set({ autoSuggest: true });
  const ana = open(t, srv, { app: 'canvas-0000aaaa' }); await ana.started;
  assert.deepEqual(ana.sync.view().settings, { depth: 'brief', autoSuggest: false }, 'Ben\'s change did not reach Ana');
});

test('open tabs follow a change: the same canvas takes Depth and Auto-suggest, another canvas takes only Auto-suggest', async t => {
  const srv = server(t), net = wire();
  const one = open(t, srv, { wire: net }), same = open(t, srv, { wire: net }), other = open(t, srv, { app: 'canvas-0000bbbb', wire: net });
  await Promise.all([one.started, same.started, other.started]);
  await one.sync.set({ depth: 'detailed' }); await one.sync.set({ autoSuggest: false });
  assert.deepEqual(same.sync.view().settings, { depth: 'detailed', autoSuggest: false });
  assert.equal(same.sync.view().depthRevision, 1, 'and the revision the next write must name');
  assert.deepEqual(other.sync.view().settings, { depth: 'balanced', autoSuggest: false });
  assert.equal(other.sync.view().depthRevision, 0, 'another canvas keeps its own revision');
  // The tab that followed writes on the revision it was told: no stale refusal.
  const before = srv.requests.length;
  await same.sync.set({ depth: 'brief' });
  assert.equal(srv.requests.slice(before).length, 1, 'one request, no retry');
});

test('other learner broadcast ignored: one browser, two learners, nothing crosses; nor does a message before the learner is known', async t => {
  const srv = server(t), net = wire();
  const ana = open(t, srv, { wire: net }), ben = open(t, srv, { user: 'u-ben', wire: net });
  await Promise.all([ana.started, ben.started]);
  await ana.sync.set({ depth: 'detailed' }); await ana.sync.set({ autoSuggest: false });
  assert.deepEqual(ben.sync.view().settings, DEFAULT_SETTINGS);
  let heard = 0; ana.sync.subscribe(() => heard++);
  ana.sync.receive({ app: 'canvas-0000aaaa', board: 'main', learner: 'someone-else', settings: { depth: 'brief', autoSuggest: true }, depthRevision: 9 });
  assert.equal(ana.sync.view().depth, 'detailed'); assert.equal(heard, 0);
  const fresh = createSettingsSync({ scope: { app: 'canvas-0000aaaa', board: 'main' }, call: srv.as('u-ana') });
  fresh.receive({ app: 'canvas-0000aaaa', board: 'main', learner: 'x', settings: { depth: 'brief', autoSuggest: false }, depthRevision: 4 });
  assert.deepEqual(fresh.view().settings, DEFAULT_SETTINGS);
});

test('a tab that missed another tab\'s change is told it is stale, adopts the revision and sends its choice once more; nothing else is lost', async t => {
  const srv = server(t);   // no channel: the second tab never hears of the first tab's change
  const one = open(t, srv), two = open(t, srv);
  await Promise.all([one.started, two.started]);
  await one.sync.set({ depth: 'detailed' });                 // server revision 1; tab two still holds 0
  assert.equal(two.sync.view().depthRevision, 0);
  const before = srv.requests.length;
  await two.sync.set({ depth: 'brief' });
  const sent = srv.requests.slice(before).map(r => JSON.parse(r.slice(r.indexOf('{'))));
  assert.deepEqual(sent.map(b => b.expectedRevision), [0, 1], 'the stale write, then the same choice on the revision it was told');
  assert.notEqual(sent[0].actionId, sent[1].actionId);
  assert.deepEqual([two.sync.view().depth, two.sync.view().depthRevision, two.sync.view().saveStatus], ['brief', 2, 'saved']);
  const check = open(t, srv); await check.started;
  assert.deepEqual([check.sync.view().depth, check.sync.view().depthRevision], ['brief', 2]);
});

test('a refused value is never sent; two settings in one call are refused; an offline save keeps the choice in this tab and says it is not saved', async t => {
  const srv = server(t);
  const { sync, started } = open(t, srv); await started;
  const before = srv.requests.length;
  for (const bad of [{ depth: 'shallow' }, { autoSuggest: 'yes' }, { depth: 'detailed', autoSuggest: false }, {}]) assert.equal(await sync.set(bad), false, JSON.stringify(bad));
  assert.equal(srv.requests.length, before, 'nothing sent');
  assert.equal(sync.view().depth, 'balanced');
  const down = server(t, { down: true });
  const offline = open(t, down); await offline.started;
  assert.equal(offline.sync.view().status, 'error');
  await offline.sync.set({ depth: 'detailed' });
  assert.deepEqual([offline.sync.view().depth, offline.sync.view().saveStatus], ['detailed', 'error']);
});

test('a database without 0037 loads as the defaults marked unsaved, and a change is reported as not saved, never as saved', async t => {
  const srv = server(t, { schema: SCHEMA.slice(0, SCHEMA.indexOf(MARK)) });
  const { sync, started } = open(t, srv); await started;
  assert.deepEqual([sync.view().status, sync.view().settings], ['unsaved', DEFAULT_SETTINGS]);
  await sync.set({ depth: 'brief' });
  assert.deepEqual([sync.view().depth, sync.view().saveStatus], ['brief', 'error']);
});

test('quick changes in one tab are sent in order, each on the revision the last one made, and end on the last choice', async t => {
  const srv = server(t);
  const one = open(t, srv); await one.started;
  const a = one.sync.set({ depth: 'brief' }), b = one.sync.set({ depth: 'detailed' }), c = one.sync.set({ depth: 'balanced' });
  assert.equal(one.sync.view().depth, 'balanced', 'the screen shows the last choice at once');
  await Promise.all([a, b, c]); await tick();
  assert.deepEqual([one.sync.view().depth, one.sync.view().depthRevision, one.sync.view().saveStatus], ['balanced', 3, 'saved']);
  const bodies = srv.requests.filter(r => r.startsWith('POST')).map(r => JSON.parse(r.slice(r.indexOf('{'))));
  assert.deepEqual(bodies.map(b => [b.depth, b.expectedRevision]), [['brief', 0], ['detailed', 1], ['balanced', 2]], 'no stale refusal among a tab\'s own writes');
});

test('a message never overwrites a tab whose save is in flight', async t => {
  const srv = server(t), net = wire();
  const one = open(t, srv, { wire: net }), two = open(t, srv, { wire: net });
  await Promise.all([one.started, two.started]);
  const saving = two.sync.set({ depth: 'brief' });
  two.sync.receive({ app: 'canvas-0000aaaa', board: 'main', learner: 'whoever', settings: { depth: 'detailed', autoSuggest: true }, depthRevision: 3 });
  assert.equal(two.sync.view().depth, 'brief');
  await saving;
  assert.equal(two.sync.view().saveStatus, 'saved');
});

test('the Depth a command takes is the learner\'s choice at the moment of submit, with its board, and a later change never alters that request', async t => {
  const srv = server(t);
  const one = open(t, srv, { board: 'second' }); await one.started;
  await one.sync.set({ depth: 'detailed' });
  assert.deepEqual(settingsSnapshot('canvas-0000aaaa'), { board: 'second', depth: 'detailed' });
  const sent = [];
  const post = (path, body) => { sent.push(body); return Promise.resolve({ result: 'clarification', question: 'Which?' }); };
  const made = generateCommand('explain', 'a pendulum', { app: 'canvas-0000aaaa', post });
  one.sync.set({ depth: 'brief' });
  await made;
  assert.deepEqual([sent[0].board, sent[0].depth], ['second', 'detailed'], 'the request was made at Deep');
  await generateCommand('explain', 'a pendulum', { app: 'canvas-0000aaaa', post });
  assert.equal(sent[1].depth, 'brief');
  await generateCommand('explain', 'a pendulum', { app: 'canvas-0000aaaa', depth: 'balanced', board: 'main', post });
  assert.deepEqual([sent[2].board, sent[2].depth], ['main', 'balanced'], 'a caller that names its own wins');
  await generateCommand('explain', 'a pendulum', { app: 'canvas-0000cccc', post });
  assert.equal('depth' in sent[3] || 'board' in sent[3], false, 'a canvas with no settings sends neither: the server treats it as Standard');
  one.sync.stop();
  assert.equal(settingsSnapshot('canvas-0000aaaa'), null, 'a closed canvas holds nothing');
});

test('depth names (owner 2026-11-08): the alias map reads all three old values from an older server, another tab and a saved value; writes always use the new names', async () => {
  assert.deepEqual(DEPTHS.map(([id]) => id), ['brief', 'balanced', 'detailed']);
  assert.equal(DEFAULT_SETTINGS.depth, 'balanced');
  for (const [old, now] of [['overview', 'brief'], ['standard', 'balanced'], ['deep', 'detailed']]) assert.equal(depthOf(old), now, old);
  assert.deepEqual(depthField({ depth: 'standard' }), {}, 'an old Balanced adds nothing to a request');
  assert.deepEqual(depthField({ depth: 'deep' }), { depth: 'detailed' });
  const sent = [];
  const call = async (path, init) => { if (init?.method === 'POST') { const body = JSON.parse(init.body); sent.push(body); return { settings: { depth: 'overview', autoSuggest: true }, depthRevision: 1, learner: 'l1' }; } return { settings: { depth: 'deep', autoSuggest: true }, depthRevision: 4, learner: 'l1' }; };
  const sync = createSettingsSync({ scope: { app: 'canvas-0000aaaa', board: 'main' }, call });
  await sync.start();
  assert.equal(sync.view().depth, 'detailed', 'an older server answering deep');
  sync.receive({ app: 'canvas-0000aaaa', board: 'main', learner: 'l1', settings: { depth: 'standard', autoSuggest: true }, depthRevision: 5 });
  assert.equal(sync.view().depth, 'balanced', 'another tab on an older build saying standard');
  assert.equal(await sync.set({ depth: 'standard' }), true);
  assert.equal(sent.at(-1).depth, 'balanced', 'the write names the new value');
  assert.equal(sync.view().depth, 'brief', 'the answer (an older server still saying overview) is read through the map');
  assert.equal(await sync.set({ depth: 'shallow' }), false);
  sync.stop();
});
