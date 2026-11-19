// The codebase index (codebase-index-spec.md section 2): the digest is deterministic; a stored layer costs no model call; building is polled; the overview's anchors and words are
// checked here; a repository with no README and no scripts still gets options; a typed failure is stored and retried on the next build. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { taskboard } from './learn-codebase-fixtures.js';
import { scripted, toolUse, textReply, captureLogs } from './learn-section-fixture.js';
import { SUBMIT_OVERVIEW_TOOL, digest, indexGet, runIndex, validateOverview } from '../src/learn-index.js';

const OVERVIEW = {
  summary: 'A small task board that lists tasks and shows how many are finished.',
  options: [
    { id: 'progress-number', label: 'Where the finished share comes from', what: 'How the share of finished tasks is worked out from the list.', anchors: ['src/progress.js'], kind: 'algorithm' },
    { id: 'drawing-the-list', label: 'How the list is drawn', what: 'How the task list and its header reach the screen.', anchors: ['src/TaskList.jsx', 'src/progress.js'], kind: 'structure' },
  ],
  cannot: [{ thing: 'Learning from tests', why: 'the repository has few tests to read' }],
};
function setup(t, snapshot = taskboard('v1')) {
  const { LEARN_DB, sqlite } = learnDb(t), stored = new Map();
  const env = { SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', LEARN_DB, REPOSITORY_SNAPSHOTS: { get: async key => (stored.has(key) ? { json: async () => JSON.parse(stored.get(key)) } : null), put: async (key, value) => stored.set(key, value) } };
  return { env, sqlite, stored, snapshot, repo: { repo: snapshot.repo, commit: snapshot.commit } };
}
const rows = f => f.sqlite.prepare('SELECT layer, scope, status, usd FROM repository_index').all().map(r => ({ ...r }));

test('the digest is deterministic: the same snapshot gives the same text whatever the order of its files, and it carries the README labelled as a claim', () => {
  const snapshot = taskboard('v1'), reversed = { ...snapshot, files: Object.fromEntries(Object.entries(snapshot.files).reverse()) };
  assert.equal(digest(snapshot), digest(reversed));
  assert.equal(digest(snapshot), digest(structuredClone(snapshot)));
  const text = digest(snapshot);
  assert.match(text, /^Repository: example\/taskboard\nFiles: \d+ \(/);
  assert.match(text, /README \(a claim about the code, may be out of date\):/);
  assert.match(text, /Source files/);
  assert.match(text, /most-connected symbols/);
});

test('stored: the first call builds (one model turn after one read), the second reads it free; the row says ready with what it cost', async t => {
  const f = setup(t), callModel = scripted(toolUse('read_source', { path: 'src/progress.js', start: 1, end: 6 }, 'r1'), toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW, 's1'));
  const first = await indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: f.snapshot, deps: { callModel } });
  assert.deepEqual([first.status, first.built, callModel.calls.length], ['ready', true, 2]);
  assert.deepEqual(first.value.options.map(o => o.id), ['progress-number', 'drawing-the-list']);
  assert.ok(first.value.meta.usd > 0 && first.value.meta.seconds >= 0 && first.value.meta.calls === 2);
  assert.deepEqual(rows(f).map(r => [r.layer, r.scope, r.status]), [['overview', '', 'ready']]);
  assert.ok([...f.stored.keys()].every(k => k === `learn-repositories-dev/shared/example/taskboard/${f.snapshot.commit}/index/overview.json`));
  const again = await indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: f.snapshot, deps: { callModel: scripted() } });
  assert.deepEqual([again.status, again.built, again.value.summary], ['ready', false, OVERVIEW.summary], 'no model call: the scripted model has no reply left');
});

test('building: a layer being built under two minutes ago answers building and calls nothing; an older one is built again', async t => {
  const f = setup(t);
  f.sqlite.prepare("INSERT INTO repository_index(repo,commit_sha,layer,scope,storage_key,status,usd) VALUES(?,?,'overview','','k','building',0)").run(f.repo.repo, f.repo.commit);
  const callModel = scripted();
  assert.deepEqual(await indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: f.snapshot, deps: { callModel } }), { status: 'building' });
  assert.equal(callModel.calls.length, 0);
  assert.deepEqual(await indexGet(f.env, f.repo, 'overview', '', { build: false }), { status: 'building' });
  f.sqlite.prepare("UPDATE repository_index SET created_at = datetime('now', '-3 minutes')").run();
  const rebuilt = await indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: f.snapshot, deps: { callModel: scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW)) } });
  assert.deepEqual([rebuilt.status, rebuilt.built], ['ready', true]);
});

test('the overview is checked here: unknown anchors, a path or a flag in the words, too many options, no source anchor; a cannot that talks of running is dropped', () => {
  const files = taskboard('v1').files, ok = input => validateOverview(input, files);
  assert.ok(ok(OVERVIEW).value);
  const bad = patch => ok({ ...OVERVIEW, options: [{ ...OVERVIEW.options[0], ...patch }] }).errors?.join(' | ');
  assert.match(bad({ anchors: ['src/nowhere.js'] }), /not files of this repository: src\/nowhere\.js/);
  assert.match(bad({ label: 'Reading src/progress.js closely' }), /label must have no path, file name or flag/);
  assert.match(bad({ what: 'Run it with --fast to see.' }), /what must have no path, file name or flag/);
  assert.match(bad({ label: 'One two three four five six seven' }), /at most six plain words/);
  assert.match(bad({ anchors: ['README.md'] }), /at least one anchor is a source file/);
  assert.match(bad({ id: 'Not A Slug' }), /id is unique lowercase/);
  assert.match(ok({ ...OVERVIEW, options: [] }).errors.join(' '), /one to six entries/);
  assert.match(ok({ ...OVERVIEW, options: Array.from({ length: 7 }, (_, i) => ({ ...OVERVIEW.options[0], id: `o${i}` })) }).errors.join(' '), /one to six entries/);
  assert.deepEqual(ok({ ...OVERVIEW, cannot: [{ thing: 'Running the project', why: 'no install steps' }, { thing: 'Tests', why: 'few of them' }] }).value.cannot, [{ thing: 'Tests', why: 'few of them' }]);
  assert.match(ok({ ...OVERVIEW, summary: 'See src/app.js' }).errors.join(' '), /summary must have no path/);
});

test('a repository with no README and no scripts still gets options', async t => {
  const base = taskboard('v1'), files = Object.fromEntries(Object.entries(base.files).filter(([p]) => !/readme|package\.json/i.test(p)));
  const f = setup(t, { ...base, files });
  assert.match(digest(f.snapshot), /README \(a claim about the code, may be out of date\):\n\(none\)/);
  const out = await indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: f.snapshot, deps: { callModel: scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW)) } });
  assert.deepEqual([out.status, out.value.options.length], ['ready', 2]);
});

test('a refused answer twice is failed and stored as failed; the next build call tries again', async t => {
  const f = setup(t), bad = { ...OVERVIEW, options: [{ ...OVERVIEW.options[0], anchors: ['src/nowhere.js'] }] };
  const { out, logs } = await captureLogs(() => indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: f.snapshot, deps: { callModel: scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, bad, 's1'), toolUse(SUBMIT_OVERVIEW_TOOL.name, bad, 's2')) } }));
  assert.deepEqual([out.status, out.reason], ['failed', 'invalid']);
  assert.deepEqual(rows(f).map(r => r.status), ['failed']);
  assert.equal(logs.find(l => l.event === 'learn_index').outcome, 'invalid');
  assert.deepEqual(await indexGet(f.env, f.repo, 'overview', '', { build: false }), { status: 'failed', reason: 'failed_before' });
  const retry = await indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: f.snapshot, deps: { callModel: scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW)) } });
  assert.deepEqual([retry.status, rows(f).map(r => r.status)], ['ready', ['ready']]);
});

test('the model unavailable is failed, not building forever; no key is its own answer', async t => {
  const f = setup(t);
  const down = await indexGet(f.env, f.repo, 'overview', '', { build: true, snapshot: f.snapshot, deps: { callModel: async () => new Response('', { status: 503 }) } });
  assert.deepEqual([down.status, down.reason, rows(f).map(r => r.status)], ['failed', 'unavailable', ['failed']]);
  const none = setup(t), res = await runIndex({ ...none.env, ANTHROPIC_API_KEY: '' }, { repo: { ...none.repo, id: 1 }, snapshot: none.snapshot }, { layer: 'overview' });
  assert.equal(res.status, 503);
});

test('the learn_index body: only the overview layer and a slug scope; ready, building and failed answer as the browser reads them', async t => {
  const f = setup(t), repo = { ...f.repo, id: 1 };
  assert.equal((await runIndex(f.env, { repo, snapshot: f.snapshot }, { layer: 'topic' })).status, 400);
  assert.equal((await runIndex(f.env, { repo, snapshot: f.snapshot }, { layer: 'overview', scope: 'Not A Slug' })).status, 400);
  const ready = await runIndex(f.env, { repo, snapshot: f.snapshot }, { layer: 'overview' }, { callModel: scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW)) });
  assert.equal(ready.status, 200); const body = await ready.json(); assert.deepEqual([body.status, body.index.options.length], ['ready', 2]);
  const free = await runIndex(f.env, { repo, snapshot: f.snapshot }, { layer: 'overview' }, { callModel: scripted() });
  assert.equal((await free.json()).status, 'ready');
  const g = setup(t); g.sqlite.prepare("INSERT INTO repository_index(repo,commit_sha,layer,scope,storage_key,status) VALUES(?,?,'overview','','k','building')").run(g.repo.repo, g.repo.commit);
  assert.deepEqual(await (await runIndex(g.env, { repo: { ...g.repo, id: 1 }, snapshot: g.snapshot }, { layer: 'overview' })).json(), { status: 'building' });
  const h = setup(t), failed = await runIndex(h.env, { repo: { ...h.repo, id: 1 }, snapshot: h.snapshot }, { layer: 'overview' }, { callModel: scripted(textReply('no'), textReply('no')) });
  assert.equal(failed.status, 502);
});
