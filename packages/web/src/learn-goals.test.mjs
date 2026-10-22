// /goal goal management in the browser (owner, 2026-10-21): typed /goal, the picker and Set a goal reach one entry
// (goals.open); the saved-goal operations (learn-goals.js) are coaching actions only, never a model call; a second press
// while saving does nothing, a retry replays its action id, a failed save keeps the learner's words with the reason, and a
// goal changed elsewhere comes back with its newer state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGoalOps, goalWords, listedGoals, refsToGoal } from './learn-goals.js';
import { createCoachingSync } from './learn-coaching-client.js';
import { runLearnCommand, pickerSections, isLearnCommand } from './learn-slash.js';
import { commandLabel, resolveCommand } from './agent/slash.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const conflict = (code, state = null, status = 409) => Object.assign(new Error(code), { status, data: { error: code, ...(state ? { state } : {}) } });
let n = 0;
const ids = () => `id-${++n}`;

test('typed /goal and /goal <words> open goal management through the page\'s goal entry, with no model and no save', async () => {
  const opened = [], posts = [];
  const canvas = { goal: words => opened.push(words), insertBlock: () => assert.fail('no card'), reserve: () => assert.fail('no skeleton') };
  const post = async (...args) => { posts.push(args); throw new Error('no model call'); };
  assert.deepEqual(await runLearnCommand('/goal', { app: 'canvas-0a1b2c3d', canvas, post, openSearch: () => assert.fail('no finder') }), { notice: null });
  assert.deepEqual(await runLearnCommand('/goal  read a balance sheet with confidence ', { app: 'canvas-0a1b2c3d', canvas, post, openSearch: () => {} }), { notice: null });
  assert.deepEqual(opened, ['', 'read a balance sheet with confidence'], 'the words prefill a new goal; nothing is saved');
  assert.deepEqual(posts, []);
  // Without a goal entry (a surface with no Progress) it says so and runs nothing.
  assert.match((await runLearnCommand('/goal x', { app: 'x', canvas: {}, post })).notice.text, /saved canvas/);
});

test('the picker lists /goal under Learn and its pill reads Goal; Set a goal calls the same entry as the command', () => {
  assert.ok(pickerSections('/')[0].items.some(item => item.name === 'goal'));
  assert.deepEqual(pickerSections('/go')[0].items.map(item => item.name), ['goal']);
  assert.ok(isLearnCommand('goal'), 'picking it makes the removable inline pill (ask.jsx setComposerInput)');
  assert.equal(commandLabel('goal'), 'Goal');
  assert.equal(resolveCommand('/goal learn chess', 'learn').arg, 'learn chess');
  // One entry: the page binds the command's goal handler to goals.open, and Set a goal (and Manage goals) call goals.open.
  assert.match(read('./LearnPage.jsx'), /goal: args => chat\.goals\?\.open\(args\)/);
  assert.match(read('./LearnProgress.jsx'), /const setGoal = \(\) => \(chat\?\.goals \? chat\.goals\.open\(''\) : composer\.focus\(\)\);/);
  assert.match(read('./LearnProgress.jsx'), /data-progress-set-goal onClick=\{setGoal\}/);
  assert.match(read('./chat-workspace.jsx'), /const openGoals = useCallback\(\(draft = ''\) => \{ showProgress\('progress'\);/);
});

test('a second press while saving does nothing, and a retry after a lost connection replays the same action id', async () => {
  const sent = [];
  let release, fail = true;
  const act = (action, payload, meta) => { sent.push([action, meta.actionId]); return new Promise((resolve, reject) => { release = () => (fail ? reject(Object.assign(new Error('offline'), { status: 0 })) : resolve({ goals: [], revision: 2 })); }); };
  const ops = createGoalOps({ act, newId: ids });
  const first = ops.run('add', 'create_goal', { label: 'Chess openings' });
  assert.equal(ops.busy('add'), true);
  assert.deepEqual(await ops.run('add', 'create_goal', { label: 'Chess openings' }), { ok: false, code: 'busy', skipped: true });
  release();
  const out = await first;
  assert.deepEqual([out.ok, out.message], [false, 'Not saved. Check your connection and try again; your words are kept.']);
  fail = false;
  const retry = ops.run('add', 'create_goal', { label: 'Chess openings' });
  release();
  assert.equal((await retry).ok, true);
  assert.deepEqual(sent.map(([, id]) => id), [sent[0][1], sent[0][1]], 'one write, sent twice with one id: the server replays it');
  // Changed words are a new write with a new id.
  const next = ops.run('add', 'create_goal', { label: 'Chess endgames' });
  release();
  await next;
  assert.notEqual(sent[2][1], sent[0][1]);
});

test('a stale canvas revision is sent again once; a goal changed elsewhere and a refusal come back with their reason', async () => {
  const newer = { goals: [{ goalId: 'g1', label: 'Changed elsewhere', lifecycle: 'open', revision: 3 }], revision: 9 };
  const replies = [conflict('revision', newer), newer];
  const act = async () => { const next = replies.shift(); if (next instanceof Error) throw next; return next; };
  assert.deepEqual(await createGoalOps({ act, newId: ids }).run('edit:g1', 'edit_goal', { goalId: 'g1', revision: 3, label: 'Mine' }), { ok: true, state: newer });
  const changed = await createGoalOps({ act: async () => { throw conflict('goal_changed', newer); }, newId: ids }).run('edit:g1', 'edit_goal', { goalId: 'g1', revision: 2, label: 'Mine' });
  assert.deepEqual([changed.ok, changed.code, changed.state], [false, 'goal_changed', newer]);
  assert.match(changed.message, /changed in another tab or device[\s\S]*your edit is kept/);
  let calls = 0;
  const twice = await createGoalOps({ act: async () => { calls += 1; throw conflict('revision', newer); }, newId: ids }).run('add', 'create_goal', { label: 'x' });
  assert.deepEqual([twice.code, calls], ['revision', 2], 'retried once, then said');
  const refused = await createGoalOps({ act: async () => { throw conflict('label must be 1-200 characters', null, 400); }, newId: ids }).run('add', 'create_goal', { label: 'x' });
  assert.match(refused.message, /^Not saved: label must be/);
  assert.match((await createGoalOps({ act: async () => { throw conflict('unknown_goal', null, 404); }, newId: ids }).run('delete:g9', 'delete_goal', { goalId: 'g9', revision: 0 })).message, /deleted elsewhere/);
});

test('goal words are checked before saving; deleted goals leave the list; a delete finds the chips that name the goal', () => {
  assert.deepEqual(goalWords({ label: '  Chess  ', outcome: ' Win more ' }), { words: { label: 'Chess', outcome: 'Win more' } });
  assert.match(goalWords({ label: '   ' }).error, /Write what you want to learn/);
  assert.match(goalWords({ label: 'x'.repeat(201) }).error, /under 200/);
  assert.deepEqual(listedGoals({ goals: [{ goalId: 'a', lifecycle: 'open' }, { goalId: 'b', lifecycle: 'archived' }, { goalId: 'c', lifecycle: 'completed' }] }).map(g => g.goalId), ['a', 'c']);
  const chip = { kind: 'progress', sourceId: 'progress:g1', range: { goalRefs: [{ goalId: 'g1', scopeVersion: 1 }] } };
  const other = { kind: 'progress', sourceId: 'progress:g2', range: { goalRefs: [{ goalId: 'g2', scopeVersion: 1 }] } };
  assert.deepEqual(refsToGoal([chip, other, { kind: 'file', sourceId: 'f' }], 'g1'), [chip]);
});

// The real coaching sync with a fake server: opening the manager and every saved-goal operation make coaching calls only.
test('add, edit, switch and delete through the coaching sync call /api/learn/coaching only: zero AI calls', async () => {
  const urls = [];
  let state = { controls: { mode: 'auto', tutorEnabled: true, suggestionsPaused: false, revision: 0 }, goals: [], activeGoalId: null, activities: [], revision: 0 };
  const call = async (url, init) => {
    urls.push(url.split('?')[0]);
    if (!init) return { state, capabilities: {} };
    const { action, payload, expectedRevision } = JSON.parse(init.body);
    assert.equal(expectedRevision, state.revision);
    const goals = state.goals.map(g => ({ ...g }));
    if (action === 'create_goal') goals.push({ goalId: `g${goals.length + 1}`, label: payload.label, outcome: '', lifecycle: 'open', revision: 0 });
    if (action === 'edit_goal') Object.assign(goals.find(g => g.goalId === payload.goalId), { label: payload.label, revision: payload.revision + 1 });
    if (action === 'delete_goal') goals.find(g => g.goalId === payload.goalId).lifecycle = 'archived';
    const active = action === 'create_goal' ? goals.at(-1).goalId : action === 'activate_goal' ? payload.goalId : action === 'delete_goal' && payload.goalId === state.activeGoalId ? null : state.activeGoalId;
    state = { ...state, goals, activeGoalId: active, revision: state.revision + 1 };
    return { state, effects: [] };
  };
  const sync = createCoachingSync({ scope: { app: 'canvas-0a1b2c3d', board: 'main' }, call, newId: ids });
  await sync.start();
  const ops = createGoalOps({ act: sync.act, newId: ids });
  await ops.run('add', 'create_goal', { label: 'Vectors' });
  await ops.run('add', 'create_goal', { label: 'Matrices' });
  await ops.run('edit:g1', 'edit_goal', { goalId: 'g1', revision: 0, label: 'Vectors and dot products' });
  await ops.run('switch:g1', 'activate_goal', { goalId: 'g1' });
  await ops.run('delete:g1', 'delete_goal', { goalId: 'g1', revision: 1 });
  const view = sync.view().state;
  assert.deepEqual([listedGoals(view).map(g => g.label), view.activeGoalId], [['Matrices'], null], 'Progress reads the saved state at once');
  assert.deepEqual([...new Set(urls)], ['/api/learn/coaching']);
  sync.stop();
});
