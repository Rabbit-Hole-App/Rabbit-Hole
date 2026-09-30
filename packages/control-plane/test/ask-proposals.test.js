import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// The real proposal handlers from index.js against SQLite, the way
// learn-chat.test.js runs apiAsk, without importing the bundled HTML.
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const names = ['appRow', 'askThreadForUser', 'apiAskThreadDelete', 'proposalTarget', 'claimProposal', 'closedProposal', 'apiAskApprove', 'apiAskReject'];
const functions = names.map(name => source.match(new RegExp(`^(?:async )?function ${name}[(][^]*?^[}]`, 'm'))[0]).join(' ');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const deps = {
  json,
  canEdit: async (env, app, email) => app.owner_email === email,
  appForUser: async () => null,
  startRun: async (env, app, startedBy) => { await env.hold; if (env.failRun) throw new Error(env.failRun); env.started.push({ org: app.org, app: app.name, by: startedBy }); return `r-new${env.started.length}`; },
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
const reject = (env, user, id) => handlers.apiAskReject(post('/api/ask/reject', { proposal_id: id }), env, user);

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

test('a refused approve never claims the proposal, so a viewer click cannot burn it', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  assert.equal((await approve(env, VIEWER, id)).status, 403);
  assert.deepEqual({ ...env.db.prepare('SELECT status, approved_by, approved_at FROM proposals WHERE id = ?').get(id) }, { status: 'proposed', approved_by: null, approved_at: null });
  assert.equal((await approve(env, A, id)).status, 200);
  assert.equal(env.started.length, 1);
});

test('cancel is final: approve after reject is 409 and nothing runs', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  assert.equal((await reject(env, B, id)).status, 404);
  const res = await reject(env, A, id);
  assert.deepEqual([res.status, await res.json()], [200, { ok: true, status: 'rejected' }]);
  assert.deepEqual({ ...env.db.prepare('SELECT status, approved_by FROM proposals WHERE id = ?').get(id) }, { status: 'rejected', approved_by: A.email });
  const again = await approve(env, A, id);
  assert.deepEqual([again.status, await again.json()], [409, { error: 'cancelled', status: 'rejected' }]);
  assert.equal((await reject(env, A, id)).status, 409);
  assert.deepEqual(env.started, []);
});

test('deleting a thread invalidates its open proposals; approved ones stay as the log', async t => {
  const env = fixture(t);
  const { id, thread } = propose(env, A, 'run', { app: 'report' });
  env.db.prepare("INSERT INTO proposals (id, thread_id, org, user, tool, args, status) VALUES ('p-done', ?, ?, ?, 'share', '{}', 'approved')").run(thread, A.org, A.email);
  assert.equal((await handlers.apiAskThreadDelete(env, A, thread)).status, 200);
  assert.deepEqual({ ...env.db.prepare('SELECT status, approved_by FROM proposals WHERE id = ?').get(id) }, { status: 'invalidated', approved_by: A.email });
  assert.equal(statusOf(env, 'p-done'), 'approved');
  const res = await approve(env, A, id);
  assert.deepEqual([res.status, await res.json()], [409, { error: 'its chat was deleted', status: 'invalidated' }]);
  assert.deepEqual(env.started, []);
});

// ---- WP3 review (workflow wf_91c02478-fb6): a claim is never undone ----
// Hold an approve inside its tool (after the claim), let a Cancel or a chat delete arrive, then let the tool fail.
function held(env) { let release; env.hold = new Promise(resolve => { release = resolve; }); return () => { env.hold = null; release(); }; }

test('a Cancel that arrives while an approve runs is never undone when the tool then fails', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  const release = held(env); env.failRun = 'machine did not start';
  const running = approve(env, A, id);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await reject(env, A, id)).status, 409);
  release();
  assert.equal((await running).status, 400);
  assert.equal(statusOf(env, id), 'failed');
  env.failRun = null;
  const later = await approve(env, A, id);
  assert.deepEqual([later.status, await later.json()], [409, { error: 'failed - ask again', status: 'failed' }]);
  assert.deepEqual(env.started, []);
});

test('a chat deleted while an approve runs stays deleted: the failed proposal can never run later', async t => {
  const env = fixture(t);
  const { id, thread } = propose(env, A, 'run', { app: 'report' });
  const release = held(env); env.failRun = 'machine did not start';
  const running = approve(env, A, id);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await handlers.apiAskThreadDelete(env, A, thread)).status, 200);
  release();
  assert.equal((await running).status, 400);
  env.failRun = null;
  assert.equal((await approve(env, A, id)).status, 409);
  assert.deepEqual(env.started, []);
});

test('a tool that fails after the claim closes the proposal as failed; a refusal before it leaves the proposal open', async t => {
  const env = fixture(t);
  const bad = propose(env, A, 'share', { app: 'report', email: 'not-an-email' });
  const res = await approve(env, A, bad.id);
  assert.equal(res.status, 400); assert.match((await res.json()).error, /bad email/);
  assert.equal(statusOf(env, bad.id), 'failed');
  const missing = propose(env, A, 'run', { app: 'no-such-app' });
  assert.deepEqual([(await approve(env, A, missing.id)).status, statusOf(env, missing.id)], [400, 'proposed']);
});

test('deleting a chat invalidates only its own workspace proposals', async t => {
  const env = fixture(t);
  const { thread } = propose(env, A, 'run', { app: 'report' });
  env.db.prepare("INSERT INTO proposals (id, thread_id, org, user, tool, args) VALUES ('p-b', ?, ?, ?, 'run', '{}')").run(thread, B.org, B.email);
  assert.equal((await handlers.apiAskThreadDelete(env, A, thread)).status, 200);
  assert.deepEqual({ ...env.db.prepare("SELECT status, approved_by FROM proposals WHERE id = 'p-b'").get() }, { status: 'proposed', approved_by: null });
});

// Cancel is an action (user decision 2026-09-28, T02 7.3): the requester or an editor of the target app.
test('only the requester or an editor of the target app can cancel; anyone else gets 403 and the proposal stays open', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  const res = await reject(env, VIEWER, id);
  assert.deepEqual([res.status, await res.json()], [403, { error: 'no edit access' }]);
  assert.equal(statusOf(env, id), 'proposed');
  assert.equal((await reject(env, A, id)).status, 200); // A owns report: editor
  const own = propose(env, VIEWER, 'run', { app: 'report' });
  assert.equal((await reject(env, VIEWER, own.id)).status, 200); // the requester, even without edit access
  const bRun = env.db.prepare("SELECT apps.id FROM apps WHERE org = 'workspace-a'").get().id;
  env.db.prepare("INSERT INTO runs (run_id, app_id, started_by, status) VALUES ('r-a1', ?, ?, 'finished')").run(bRun, A.email);
  const again = propose(env, A, 'run_again', { run_id: 'r-a1' });
  assert.equal((await reject(env, VIEWER, again.id)).status, 403); // run_again resolves its target app through the run
  assert.deepEqual(env.started, []);
});

// WP4 review: the editor half of the Cancel policy, and closed proposals answer with their state.
test('an editor who did not ask can cancel someone else\'s proposal', async t => {
  const env = fixture(t);
  const theirs = propose(env, VIEWER, 'run', { app: 'report' });
  const res = await reject(env, A, theirs.id); // A edits report but did not ask
  assert.deepEqual([res.status, await res.json()], [200, { ok: true, status: 'rejected' }]);
  assert.equal(statusOf(env, theirs.id), 'rejected');
});

test('cancelling a proposal that is already closed answers with its state, whoever asks', async t => {
  const env = fixture(t);
  const old = propose(env, A, 'run', { app: 'report' }, 16);
  const expired = await reject(env, VIEWER, old.id);
  assert.deepEqual([expired.status, await expired.json()], [409, { error: 'expired after 15 minutes - ask again', status: 'expired' }]);
  const done = propose(env, A, 'run', { app: 'report' });
  assert.equal((await reject(env, A, done.id)).status, 200);
  const again = await reject(env, VIEWER, done.id);
  assert.deepEqual([again.status, await again.json()], [409, { error: 'cancelled', status: 'rejected' }]);
  assert.equal(statusOf(env, old.id), 'proposed'); // nothing written for the expired one
});
