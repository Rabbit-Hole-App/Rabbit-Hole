import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// The real proposal handlers from index.js against SQLite, the way
// learn-chat.test.js runs apiAsk, without importing the bundled HTML.
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const names = ['appRow', 'askThreadForUser', 'apiAskThreadDelete', 'claimProposal', 'apiAskApprove'];
const functions = names.map(name => source.match(new RegExp(`async function ${name}[(][^]*?^[}]`, 'm'))[0]).join(' ');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const deps = {
  json,
  canEdit: async (env, app, email) => app.owner_email === email,
  appForUser: async () => null,
  startRun: async (env, app, startedBy) => { env.started.push({ org: app.org, app: app.name, by: startedBy }); return `r-new${env.started.length}`; },
};
const handlers = new Function(...Object.keys(deps), `${functions}; return { ${names.join(',')} };`)(...Object.values(deps));

const A = { email: 'owner@a.test', org: 'workspace-a' };
const B = { email: 'owner@b.test', org: 'workspace-b' };
const VIEWER = { email: 'viewer@a.test', org: 'workspace-a' };

// Each workspace has a job named report, owned by that workspace's user.
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const table of ['apps', 'members', 'runs', 'threads', 'messages', 'proposals']) db.exec(schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} [(][^]*?^[)];`, 'm'))[0]);
  for (const u of [A, B]) db.prepare("INSERT INTO apps (org, name, fly_app, proxy_secret, owner_email, kind, image) VALUES (?, 'report', 'fly-x', 'secret', ?, 'job', 'img')").run(u.org, u.email);
  return {
    db, started: [],
    DB: { prepare: sql => ({ bind: (...params) => ({
      first: async () => db.prepare(sql).get(...params) || null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => { const result = db.prepare(sql).run(...params); return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } }; },
    }) }) },
  };
}

function propose(env, user, tool, args, minutesOld = 0) {
  const thread = Number(env.db.prepare("INSERT INTO threads (org, user, scope) VALUES (?, ?, 'org')").run(user.org, user.email).lastInsertRowid);
  const id = `p-${tool}-${thread}`;
  env.db.prepare("INSERT INTO proposals (id, thread_id, org, user, tool, args, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))")
    .run(id, thread, user.org, user.email, tool, JSON.stringify(args), `-${minutesOld} minutes`);
  return { id, thread };
}
const post = (path, body) => new Request('https://small.example' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const approve = (env, user, id) => handlers.apiAskApprove(post('/api/ask/approve', { proposal_id: id }), env, {}, user, 'https://small.example');
const statusOf = (env, id) => env.db.prepare('SELECT status FROM proposals WHERE id = ?').get(id).status;

test('a proposal acts only in its own workspace, never on a same-named app elsewhere', async t => {
  const env = fixture(t);
  const bApp = env.db.prepare("SELECT id FROM apps WHERE org = 'workspace-b'").get().id;
  env.db.prepare("INSERT INTO runs (run_id, app_id, started_by, status) VALUES ('r-b1', ?, ?, 'finished')").run(bApp, B.email);
  // run_again names B's run; approving it in A must not start A's report
  const again = propose(env, A, 'run_again', { run_id: 'r-b1' });
  const res = await approve(env, A, again.id);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'no run r-b1' });
  // B's proposal is invisible from A, although A owns an app with the same name
  const share = propose(env, B, 'share', { app: 'report', email: 'x@a.test' });
  assert.equal((await approve(env, A, share.id)).status, 404);
  assert.deepEqual(env.started, []);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM members').get().n, 0);
});

test('the permission recheck fails with 403, the No longer allowed card state', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  const res = await approve(env, VIEWER, id);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'no edit access' });
  assert.deepEqual(env.started, []);
});

test('two concurrent approves execute once; the loser gets 409 with the status', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  const results = await Promise.all([approve(env, A, id), approve(env, A, id)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.deepEqual(await results.find(r => r.status === 409).json(), { error: 'already approved', status: 'approved' });
  assert.equal(env.started.length, 1);
  assert.equal(statusOf(env, id), 'approved');
});

test('a proposal older than 15 minutes has expired and cannot run', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' }, 16);
  const res = await approve(env, A, id);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'expired after 15 minutes - ask again', status: 'expired' });
  assert.deepEqual(env.started, []);
});

test('a refused approve reopens the proposal, so a viewer click cannot burn it', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  assert.equal((await approve(env, VIEWER, id)).status, 403);
  assert.deepEqual({ ...env.db.prepare('SELECT status, approved_by, approved_at FROM proposals WHERE id = ?').get(id) }, { status: 'proposed', approved_by: null, approved_at: null });
  assert.equal((await approve(env, A, id)).status, 200);
  assert.equal(env.started.length, 1);
});
