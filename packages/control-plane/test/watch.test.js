import assert from 'node:assert';
import { test } from 'node:test';
import { runWatchPass, weeklyWatchEmail } from '../src/watch.js';

// ---------- tiny in-memory D1: answers exactly the queries watch.js makes ----------

const T = (ms) => new Date(ms).toISOString().slice(0, 19).replace(' ', 'T').replace('T', ' ');

function fakeDb(state) {
  const match = (sql, s) => sql.includes(s);
  return {
    prepare(sql) {
      const stmt = {
        // unbound statements (no placeholders) go straight through
        all: () => stmt.bind().all(),
        first: () => stmt.bind().first(),
        run: () => stmt.bind().run(),
        bind(...args) {
          return {
            async all() {
              if (match(sql, 'FROM apps WHERE deleted_at IS NULL')) return { results: state.apps };
              if (match(sql, 'FROM checks WHERE enabled = 1')) return { results: state.checks.map((key) => ({ key })) };
              if (match(sql, 'FROM runs WHERE app_id = ?')) return { results: state.runs.slice(0, 20) };
              if (match(sql, 'SELECT email FROM members WHERE app_id = ?')) return { results: state.members || [] };
              if (match(sql, 'FROM observations WHERE org = ? AND slug = ? AND resolved_at IS NULL')) {
                return { results: state.observations.filter((o) => o.org === args[0] && o.slug === args[1] && !o.resolved_at) };
              }
              if (match(sql, 'JOIN apps a ON')) {
                // weekly email query
                const now = args[0];
                return {
                  results: state.observations
                    .filter((o) => !o.resolved_at && (!o.dismissed_until || o.dismissed_until < now))
                    .map((o) => ({ slug: o.slug, check: o.check, text: o.text, last_seen: o.last_seen, owner_email: state.apps[0].owner_email, org: o.org })),
                };
              }
              throw new Error(`unexpected all(): ${sql.slice(0, 80)}`);
            },
            async first() {
              if (match(sql, 'FROM request_logs WHERE org = ? AND slug = ?') && match(sql, 'COUNT(*)')) {
                return { total: state.reqTotal || 0, last_at: state.reqLastAt || null };
              }
              if (match(sql, 'MAX(last_request_at) AS last')) return { last: null, peak: null };
              if (match(sql, 'MAX(ts) AS last FROM request_logs')) return { last: null };
              if (match(sql, 'FROM org_settings WHERE org = ?')) return state.orgSettings ?? null;
              throw new Error(`unexpected first(): ${sql.slice(0, 80)}`);
            },
            async run() {
              if (match(sql, 'INSERT INTO baselines')) { state.baselineWrites = (state.baselineWrites || 0) + 1; return { meta: {} }; }
              if (match(sql, 'INSERT INTO observations')) {
                state.observations.push({
                  id: state.observations.length + 1,
                  org: args[0], slug: args[1], check: args[2], first_seen: args[3], last_seen: args[4],
                  evidence: args[5], text: args[6], resolved_at: null, dismissed_until: null,
                });
                return { meta: {} };
              }
              if (match(sql, 'UPDATE observations SET last_seen')) {
                const o = state.observations.find((x) => x.id === args[2]);
                o.last_seen = args[0];
                o.evidence = args[1];
                return { meta: {} };
              }
              if (match(sql, 'UPDATE observations SET resolved_at')) {
                const o = state.observations.find((x) => x.id === args[1]);
                o.resolved_at = args[0];
                return { meta: {} };
              }
              throw new Error(`unexpected run(): ${sql.slice(0, 80)}`);
            },
          };
        },
      };
      return stmt;
    },
  };
}

const NOW = Date.parse('2026-09-05T03:00:00Z');
const at = (daysAgo, extraMs = 0) => T(NOW - daysAgo * 86400000 + extraMs);
const run = (id, status, startDaysAgo, durSecs) => ({
  run_id: id,
  status,
  exit_code: status === 'finished' ? 0 : 1,
  started_at: at(startDaysAgo),
  finished_at: at(startDaysAgo, durSecs * 1000),
});

function baseState() {
  return {
    apps: [{
      id: 1, org: 'gmail-com', name: 'yolo-s3-job', kind: 'job', owner_email: 'owner@gmail.com',
      schedule: null, schedule_paused: 0, review: null, repo_public: 0, agent_md: null, runbook: 'detects objects',
      deployed_at: at(30), created_at: at(40),
    }],
    checks: ['schedule_missed', 'run_slow', 'run_failing', 'server_silent', 'never_opened', 'secret_drift', 'stale_deploy', 'access_unused'],
    // newest first: 3 consecutive failures, the newest also 4× slower than the 50s median
    runs: [
      run('r-f3', 'failed', 1, 200),
      run('r-f2', 'failed', 2, 50),
      run('r-f1', 'failed', 3, 50),
      run('r-ok4', 'finished', 4, 50),
      run('r-ok5', 'finished', 5, 50),
      run('r-ok6', 'finished', 6, 50),
      run('r-ok7', 'finished', 7, 50),
    ],
    members: [],
    observations: [],
  };
}

let modelCalls = 0;
function withMockModel(fn) {
  const real = globalThis.fetch;
  modelCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.anthropic.com')) {
      modelCalls++;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'yolo-s3-job has failed 3 times; the last run took 200s.' }] }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return fn().finally(() => { globalThis.fetch = real; });
}

const env = (state) => ({ DB: fakeDb(state), ANTHROPIC_API_KEY: 'k' });

test('run_failing and run_slow fire once with correct evidence; refire bumps last_seen only', async () => {
  const state = baseState();
  await withMockModel(async () => {
    await runWatchPass(env(state), NOW);
    const open = state.observations.filter((o) => !o.resolved_at);
    assert.equal(open.length, 2, JSON.stringify(state.observations));
    const failing = open.find((o) => o.check === 'run_failing');
    const slow = open.find((o) => o.check === 'run_slow');
    const fe = JSON.parse(failing.evidence);
    assert.equal(fe.count, 3);
    assert.deepEqual(fe.run_ids, ['r-f3', 'r-f2', 'r-f1']);
    const se = JSON.parse(slow.evidence);
    assert.equal(se.run_id, 'r-f3');
    assert.equal(se.median_secs, 50);
    assert.ok(se.duration_secs >= 199);
    assert.equal(modelCalls, 2); // one sentence per NEW observation
    assert.match(failing.text, /failed 3 times/);

    // second pass: same state — no new rows, no model calls, last_seen advances
    const before = state.observations.map((o) => o.last_seen);
    await runWatchPass(env(state), NOW + 86400000);
    assert.equal(state.observations.length, 2);
    assert.equal(modelCalls, 2);
    assert.notDeepEqual(state.observations.map((o) => o.last_seen), before);
  });
});

test('a success on top resolves run_failing (and run_slow when the last run is normal)', async () => {
  const state = baseState();
  await withMockModel(async () => {
    await runWatchPass(env(state), NOW);
    state.runs.unshift(run('r-good', 'finished', 0, 50));
    await runWatchPass(env(state), NOW + 86400000);
    const failing = state.observations.find((o) => o.check === 'run_failing');
    const slow = state.observations.find((o) => o.check === 'run_slow');
    assert.ok(failing.resolved_at, 'run_failing should be resolved');
    assert.ok(slow.resolved_at, 'run_slow should be resolved');
  });
});

test('weekly email includes open observations, excludes dismissed, respects notify_weekly', async () => {
  const state = baseState();
  await withMockModel(() => runWatchPass(env(state), NOW));
  // dismiss run_slow for 30 days
  const slow = state.observations.find((o) => o.check === 'run_slow');
  slow.dismissed_until = T(NOW + 30 * 86400000);

  const sent = [];
  const send = async (_env, to, subject, text) => sent.push({ to, subject, text });
  const n = await weeklyWatchEmail(env(state), NOW + 3 * 86400000, send);
  assert.equal(n, 1);
  assert.equal(sent[0].to, 'owner@gmail.com');
  assert.match(sent[0].text, /run_failing/);
  assert.doesNotMatch(sent[0].text, /run_slow/);

  // org opted out → nothing
  state.orgSettings = { notify_weekly: 0 };
  sent.length = 0;
  assert.equal(await weeklyWatchEmail(env(state), NOW + 3 * 86400000, send), 0);
  assert.equal(sent.length, 0);
});
