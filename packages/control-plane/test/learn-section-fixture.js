// Shared harness for the learn_section_* route tests: a learner's project canvas on the taskboard fixture repository, a started learn goal and an
// accepted plan of two chapters (sections 1.1, 1.2, 2.1), the route with an injected authorize, and a scripted model. No network.
import { learnDb } from './learn-grade-fixture.js';
import { taskboard } from './learn-codebase-fixtures.js';
import { codebaseRoute } from '../src/learn-codebase-source-map.js';
import { readCoachingState } from '../src/learn-coaching-store.js';
import { canvasApp } from '../src/canvases.js';

export const CANVAS = 'canvas-0000aaaa';
export const ACTOR = { org: 'ws', userId: 'u-ana', app: CANVAS, board: 'main' };
export const LEARN = { id: 'derived-state', label: 'Derived state', what: 'a value computed from other state instead of stored', anchors: ['src/progress.js'], kind: 'concept' };
export const PLAN_OPS = [
  { op: 'add', level: 1, key: 'c0', text: 'Where the number comes from' },
  { op: 'add', level: 2, parent: 'c0', key: 'c0s0', text: 'Counting what is finished', description: 'The share of finished tasks. [files: src/progress.js:2-6]' },
  { op: 'add', level: 2, parent: 'c0', key: 'c0s1', text: 'Asking the server', description: 'Where the list comes from. [files: src/api.js]' },
  { op: 'add', level: 1, key: 'c1', text: 'Showing it' },
  { op: 'add', level: 2, parent: 'c1', key: 'c1s0', text: 'Drawing the header', description: 'The number on screen. [files: src/TaskList.jsx]' },
];

export const scripted = (...replies) => {
  const call = async (env, body, model) => { call.calls.push({ env, body: structuredClone(body), model }); const next = replies.shift(); if (!next) throw new Error('no scripted reply left'); return typeof next === 'function' ? next(body) : next; };
  call.calls = [];
  return call;
};
export const toolUse = (name, input, id = 't1', usage = { input_tokens: 2000, output_tokens: 500 }) => Response.json({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use', usage });
export const textReply = text => Response.json({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 10 } });

export async function sectionSetup(t, { accept = true } = {}) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const first = taskboard('v1'), stored = new Map(), deps = {};
  const env = { SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', LEARN_DB, REPOSITORY_SNAPSHOTS: { get: async key => (stored.has(key) ? { json: async () => structuredClone(stored.get(key)) } : null) } };
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(7,'ws','repo-0a1b2c3d-proj','ana@test','${first.repo}','main','${first.commit}','ready');
    INSERT INTO canvases(org,name,owner_email,title,project) VALUES('ws','${CANVAS}','ana@test','Logistic Regression','repo-0a1b2c3d-proj');`);
  stored.set(`snap-${first.commit}`, first);
  sqlite.prepare('INSERT OR IGNORE INTO repository_versions(app_id,commit_sha,storage_key) VALUES(7,?,?)').run(first.commit, `snap-${first.commit}`);
  const user = { email: 'ana@test', org: 'ws', orgName: null };
  const access = () => ({ ...canvasApp(sqlite.prepare('SELECT * FROM canvases WHERE name = ?').get(CANVAS), user), user_id: 'u-ana' });
  const route = body => codebaseRoute('/api/learn/codebase', new Request('https://dev.test/api/learn/codebase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app: CANVAS, board: 'main', ...body }) }), env, { authorize: async () => access(), ...deps });
  const post = async body => { const res = await route(body); return { status: res.status, body: await res.json() }; };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('no network in this test'); };
  t.after(() => { globalThis.fetch = realFetch; });
  const { revision } = await readCoachingState(env, ACTOR);
  const started = await post({ action: 'start', goal: 'learn_concept', learn: LEARN, actionId: 'start-learn-1', expectedRevision: revision });
  if (started.status !== 200) throw new Error(`start failed: ${JSON.stringify(started.body)}`);
  if (accept) {
    const saved = await post({ action: 'learn_plan_save', plan: { ops: PLAN_OPS, revision: 'r1', acceptedAt: '2026-11-16T01:00:00.000Z', text: 'A book about a number\nIt follows the data.' } });
    if (saved.status !== 200) throw new Error(`plan save failed: ${JSON.stringify(saved.body)}`);
  }
  const learn = async () => { const state = await readCoachingState(env, ACTOR); return state.activities.find(a => a.activityId === state.activeActivityId).checkpoint.learn; };
  return { env, sqlite, deps, route, post, learn, snapshot: first };
}

// A log capture for the operator lines (console.log JSON).
export const captureLogs = async run => {
  const logs = [], log = console.log;
  console.log = line => { logs.push(String(line)); };
  try { return { out: await run(), logs: logs.map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean) }; } finally { console.log = log; }
};
