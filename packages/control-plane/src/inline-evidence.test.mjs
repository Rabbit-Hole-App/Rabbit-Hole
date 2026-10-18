import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { inlineRepositoryEvidence } from './inline-evidence.js';
import { inlineEvidenceFetch } from './learn-inline.js';

const commit = 'a'.repeat(40), app = { name: 'repo-demo', repo: 'owner/demo' };
const input = { app: app.name, commit, query: 'call(x)' };
const snapshot = { repo: app.repo, commit, files: { 'src/main.js': 'CALL(x);\ncall(y);' }, graph: { nodes: [], edges: [] }, skipped: [] };
test('repository evidence authorizes before loading and never falls back to another revision', async () => {
  let loads = 0;
  const denied = await inlineRepositoryEvidence(null, {}, input, { authorize: async () => new Response(null, { status: 403 }), load: async () => { loads++; } });
  assert.equal(denied.status, 403); assert.equal(loads, 0);
  const stale = await inlineRepositoryEvidence(null, {}, input, { authorize: async () => app, load: async (_env, allowed, at) => { assert.equal(allowed, app); assert.equal(at, commit); return { ...snapshot, commit: 'b'.repeat(40) }; } });
  assert.equal(stale.status, 409);
});
test('literal punctuation matches carry exact source identity without treating graph metadata as code', async () => {
  const result = await inlineRepositoryEvidence(null, {}, input, { authorize: async () => app, load: async () => ({ ...snapshot, graph: { nodes: [{ id: 'function', label: 'call(x)', path: 'src/other.js', line: 8 }], edges: [] } }) });
  assert.equal(result.matches.length, 1); assert.equal(result.matches[0].line, 1);
  assert.equal(result.matches[0].sourceId, `code:owner/demo@${commit}:src/main.js`);
  assert.equal(result.metadataMatches.length, 1);
  assert.equal(result.coverage.possiblyLimited, false);
});
test('bounded results disclose the cap and line-prefix limitation', async () => {
  const result = await inlineRepositoryEvidence(null, {}, input, { authorize: async () => app, load: async () => ({ ...snapshot, files: { 'long.js': Array(30).fill(' '.repeat(310) + 'call(x)').join('\n') } }) });
  assert.equal(result.matches.length, 25); assert.equal(result.coverage.possiblyLimited, true);
  assert.equal(result.matches[0].text.length, 300);
  assert.equal(result.matches[0].textCoverage, 'line-prefix-up-to-300-characters');
});
test('invalid or implicit scope inputs are refused before authorization or storage', async () => {
  let calls = 0;
  for (const bad of [{ ...input, commit: 'main' }, { ...input, query: '' }, { ...input, query: 'x'.repeat(201) }, { ...input, app: ['repo-demo'] }, { ...input, context: {} }]) {
    const result = await inlineRepositoryEvidence(null, {}, bad, { authorize: async () => { calls++; return app; }, load: async () => { calls++; return snapshot; } });
    assert.equal(result.status, 400);
  }
  assert.equal(calls, 0);
});
test('HTTP evidence handler enforces same-origin POST and bounds before storage', async () => {
  let calls = 0;
  const deps = { authorize: async () => { calls++; return app; }, load: async () => snapshot };
  const url = 'https://example.test/api/learn/inline/evidence';
  for (const [request, status] of [
    [new Request(url), 405],
    [new Request(url, { method: 'POST', headers: { origin: 'https://other.test' }, body: JSON.stringify(input) }), 403],
    [new Request(url, { method: 'POST', body: 'x'.repeat(2049) }), 413],
    [new Request(url, { method: 'POST', body: '{' }), 400],
  ]) assert.equal((await inlineEvidenceFetch(request, {}, deps)).status, status);
  assert.equal(calls, 0);
  const response = await inlineEvidenceFetch(new Request(url, { method: 'POST', headers: { origin: 'https://example.test' }, body: JSON.stringify(input) }), {}, deps);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).kind, 'repository-evidence');
  assert.equal(calls, 1);
});
test('real repository ACL and SQLite version lookup deny foreign owners before bucket reads without writes', async t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.prepare('INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(?,?,?,?,?,?,?,?)').run(1, 'team', app.name, 'owner@test', app.repo, 'main', commit, 'ready');
  sqlite.prepare('INSERT INTO repository_versions(app_id,commit_sha,storage_key) VALUES(?,?,?)').run(1, commit, 'stored-snapshot');
  const changes = () => sqlite.prepare('SELECT total_changes() AS n').get().n;
  const before = changes(); let reads = 0;
  const env = { SMALL_ENV: 'test', LEARN_DB: { prepare(sql) { const statement = sqlite.prepare(sql); let args = []; return { bind(...values) { args = values; return this; }, first: async () => statement.get(...args) || null }; } },
    CONTROL_PLANE: { fetch: async request => request.headers.get('cookie') === 'denied' ? new Response(null, { status: 401 }) : Response.json({ org: 'team', email: request.headers.get('x-email') || 'owner@test', apps: [] }) },
    REPOSITORY_SNAPSHOTS: { get: async key => { reads++; assert.equal(key, 'stored-snapshot'); return { json: async () => snapshot }; } },
  };
  const request = headers => new Request('https://example.test/api/learn/inline/evidence', { method: 'POST', headers, body: JSON.stringify(input) });
  for (const [headers, status] of [[{ cookie: 'denied' }, 401], [{ 'x-email': 'foreign@test' }, 404], [{ 'x-small-workspace': 'foreign' }, 403]]) {
    assert.equal((await inlineEvidenceFetch(request(headers), env)).status, status);
  }
  assert.equal(reads, 0);
  const accepted = await inlineEvidenceFetch(request({}), env);
  assert.equal(accepted.status, 200); assert.equal((await accepted.json()).matches[0].sourceId, `code:owner/demo@${commit}:src/main.js`);
  assert.equal(reads, 1); assert.equal(changes(), before, 'retrieval writes neither Chat nor repository state');
});
