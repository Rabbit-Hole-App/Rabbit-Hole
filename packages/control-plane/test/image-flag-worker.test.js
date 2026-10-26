// IMG-01 off through the deployed entry points (gap review C:/s/spec/image-regression/r3-gap-review.md item 3): each committed web
// config's own Worker (its `main`: app-worker.js in production, dev-worker.js in dev and parallel), with that config's vars, routes
// POST /api/learn/image-jobs and POST /api/learn/chat/image-proposals to a 503 image_generation_disabled. Nothing reaches a provider
// (every outbound fetch is recorded and refused), the ImageJobs object is never addressed, and no usage, thread or message row is
// written to a real SQLite LEARN_DB built from repository-schema.sql. image-jobs.test.js and image-int.test.js prove the same of the
// route functions; this proves the dispatch in front of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appWorker, devWorker } from './worker-import.js';
import { liveDb, liveRuns, memoryBucket, readOnlyControlPlane } from './live-storage-spy.js';

const workers = { 'app-worker.js': (await appWorker()).default, 'dev-worker.js': (await devWorker()).default };
const here = new URL('.', import.meta.url);
// The same JSONC reading as rabbit-hole-prod-config.test.js.
const config = path => JSON.parse(readFileSync(new URL(path, here), 'utf8').replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s) => s || '').replace(/,(\s*[}\]])/g, '$1'));
const CONFIGS = ['../../web/wrangler.rabbit-hole-prod.jsonc', '../../web/wrangler.dev.jsonc', '../../web/wrangler.parallel.jsonc'];
const APP = 'canvas-abcdef12', THREAD = 'canvaschat-11111111-2222-3333-4444-555555555555';
const PROPOSAL = { proposal_id: 'gp-0123456789abcdef', version: 1, command: 'generate-image', title: 'Fox', description: 'A red fox standing in fresh snow at dawn.',
  settings: { model: 'gemini-nano-banana-2.1', aspect_ratio: '1:1', resolution: '1K' }, references: [], sig: `v3.${'a'.repeat(64)}` };

function stack(t, vars) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', here), 'utf8'));
  const LEARN_DB = { prepare(text) {
    let args = []; const statement = () => sqlite.prepare(text);
    return { bind(...v) { args = v; return this; }, first: async () => statement().get(...args) || null, all: async () => ({ results: statement().all(...args) }),
      run: async () => ({ meta: { changes: statement().run(...args).changes } }) };
  }, batch: async () => { throw new Error('no batch expected'); } };
  const addressed = [];
  const IMAGE_JOBS = { idFromName: name => { addressed.push(`idFromName ${name}`); return name; }, get: name => { addressed.push(`get ${name}`); return { fetch: async () => { throw new Error('ImageJobs reached'); } }; } };
  const outbound = [], original = globalThis.fetch;
  globalThis.fetch = async url => { outbound.push(String(url?.url ?? url)); throw new Error(`unexpected network call: ${url}`); };
  t.after(() => { globalThis.fetch = original; });
  const env = { ...vars, LEARN_DB, LEARN_MEDIA: memoryBucket(), DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: readOnlyControlPlane(), IMAGE_JOBS,
    GEMINI_API_KEY: 'fixture-gemini-not-a-key', OPENAI_API_KEY: 'fixture-openai-not-a-key' };
  const count = table => sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
  return { env, addressed, outbound, count };
}

// Public activation (owner GO): production is the one config with the public flag on; every other committed config keeps it off and is refused.
test('only the production config has public image generation on', () => assert.deepEqual(CONFIGS.filter(path => config(path).vars.IMAGE_GENERATE_ENABLED === 'true'), [CONFIGS[0]]));
for (const path of CONFIGS.filter(path => config(path).vars.IMAGE_GENERATE_ENABLED === 'false')) {
  test(`${path.split('/').pop()}: both image routes answer 503 image_generation_disabled through its own Worker; no provider, no ImageJobs, no row`, async t => {
    const c = config(path);
    assert.equal(c.vars.IMAGE_GENERATE_ENABLED, 'false', 'the committed config keeps image generation off');
    const worker = workers[c.main];
    assert.ok(worker, `a known entry: ${c.main}`);
    const s = stack(t, c.vars);
    const post = (p, body) => worker.fetch(new Request(`https://app.example${p}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'small_session=s', origin: 'https://app.example' }, body: JSON.stringify(body) }), s.env, { waitUntil() {} });
    for (const [route, body] of [
      ['/api/learn/image-jobs', { generationId: `img-${PROPOSAL.proposal_id}`, proposal: PROPOSAL, app: APP }],
      ['/api/learn/chat/image-proposals', { app: APP, thread_id: THREAD, prompt: PROPOSAL.description, settings: PROPOSAL.settings }],
    ]) {
      const res = await post(route, body);
      const out = await res.json();
      assert.deepEqual([res.status, out.code], [503, 'image_generation_disabled'], `${c.main} ${route}`);
    }
    assert.deepEqual(s.outbound, [], 'no provider or other network call');
    assert.deepEqual(s.addressed, [], 'the ImageJobs object was never addressed');
    assert.deepEqual(['usage_operations', 'usage_attempts', 'threads', 'messages', 'chat_message_meta', 'file_sources'].map(table => [table, s.count(table)]),
      [['usage_operations', 0], ['usage_attempts', 0], ['threads', 0], ['messages', 0], ['chat_message_meta', 0], ['file_sources', 0]], 'nothing reserved or written');
    assert.deepEqual([s.env.DB.calls, s.env.RUNS.calls, s.env.CONTROL_PLANE.refused], [[], [], []], 'no control-plane database, runs bucket or control-plane write');
  });
}
