import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// P0-B Phase 2B: every dev and review config deploys to the rabbit-hole account and binds only
// rabbit-hole dev resources (docs/features/rabbit-hole-dev.md). Production stays on its own config.
const here = new URL('.', import.meta.url);
const raw = path => readFileSync(new URL(path, here), 'utf8');
const config = path => JSON.parse(raw(path).replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s) => s || '').replace(/,(\s*[}\]])/g, '$1'));

const RABBIT_HOLE = 'c08d3dbdc53a3afd3cb09a536ac42318';
const DEV = {
  DB: ['rabbit-hole-dev', '1ad18fef-ccf9-4a2c-86c7-dc7e87b268a2'],
  LEARN_DB: ['rabbit-hole-learn-dev', '028f800f-ce8e-4461-adb2-827f417492eb'],
  BYOC_DB: ['rabbit-hole-byoc-dev', 'cae839e6-6d58-4037-9e92-d47346356c2f'],
};
const BUCKETS = { LEARN_MEDIA: 'rabbit-hole-dev-learn-media', REPOSITORY_SNAPSHOTS: 'rabbit-hole-dev-repositories' };
// Production and old personal-account identifiers that no dev config may name.
const FORBIDDEN = [
  '3a9cc077-4dc8-4fbd-8bf7-8ed3b971af8b', // production small D1
  '433385b6-dba7-49c1-98ce-d4599feef5c0', // personal small-learn-dev
  '67723b56-de7a-4b5e-af91-ae1af32cc4d8', // personal small-byoc-dev
  'small-runs', 'small-learn-media-dev', 'small-repositories-dev', 'small-learn-moments', 'small-learn-index',
];

// wrangler.*-prod.jsonc files are production (rabbit-hole-prod-config.test.js), not dev or review configs.
const WEB = readdirSync(new URL('../../web/', here)).filter(f => /^wrangler\..*\.jsonc$/.test(f) && !f.endsWith('-prod.jsonc')).map(f => `../../web/${f}`);
const CP_DEV = '../wrangler.rabbit-hole-dev.jsonc';
const DEV_CONFIGS = [...WEB, CP_DEV];

const d1 = c => Object.fromEntries((c.d1_databases || []).map(d => [d.binding, [d.database_name, d.database_id]]));
const r2 = c => Object.fromEntries((c.r2_buckets || []).map(b => [b.binding, b.bucket_name]));

test('every dev and review config deploys to the rabbit-hole account and names no production or personal resource', () => {
  assert.deepEqual(WEB.map(p => p.split('/').pop()).sort(), ['wrangler.canvas-notebook-parallel.jsonc', 'wrangler.dev.jsonc', 'wrangler.notebook-dev.jsonc', 'wrangler.parallel.jsonc']);
  for (const path of DEV_CONFIGS) {
    const c = config(path);
    assert.equal(c.account_id, RABBIT_HOLE, `${path} account_id`);
    for (const id of FORBIDDEN) assert.ok(!JSON.stringify(c).includes(id), `${path} names ${id}`);
    assert.ok(!(c.services || []).some(s => s.service === 'small-cp'), `${path} binds production small-cp`);
    assert.equal(r2(c).RUNS, undefined, `${path} binds RUNS`);
  }
});

test('dev workers bind the rabbit-hole dev databases, buckets and control plane, and no Vectorize, Queue or Workers AI', () => {
  const workers = WEB.filter(p => config(p).main === 'dev-worker.js');
  assert.deepEqual(workers.map(p => p.split('/').pop()).sort(), ['wrangler.dev.jsonc', 'wrangler.parallel.jsonc']);
  for (const path of workers) {
    const c = config(path);
    assert.deepEqual(d1(c), DEV, path);
    assert.deepEqual(r2(c), BUCKETS, path);
    assert.deepEqual(c.services, [{ binding: 'CONTROL_PLANE', service: 'rabbit-hole-cp-dev' }], path);
    // Optional: every AI, MOMENTS and INDEX_QUEUE use is guarded (learn-moment-index.js).
    assert.equal(c.ai, undefined, path); assert.equal(c.vectorize, undefined, path); assert.equal(c.queues, undefined, path);
  }
});

test('the dev control plane is its own Worker: SMALL_ENV dev, dev bindings only, no Fly, no RUNS, no crons, no preview URLs', () => {
  const c = config(CP_DEV);
  assert.equal(c.name, 'rabbit-hole-cp-dev');
  assert.equal(c.main, 'src/index.js');
  assert.equal(c.preview_urls, false);
  assert.equal(c.vars.SMALL_ENV, 'dev');
  assert.equal(c.vars.BASE_URL, 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev');
  assert.deepEqual(d1(c), DEV);
  assert.deepEqual(r2(c), BUCKETS);
  assert.equal(c.triggers, undefined, 'crons start Fly machines and send email');
  assert.equal(c.services, undefined);
  for (const key of Object.keys(c.vars)) assert.doesNotMatch(key, /^FLY_|^AWS_/, key);
});

test('production small-cp config is unchanged: its own name, SMALL_ENV production, no account pin, no dev resource', () => {
  const c = config('../wrangler.jsonc');
  assert.equal(c.name, 'small-cp');
  assert.equal(c.vars.SMALL_ENV, 'production');
  assert.equal(c.account_id, undefined);
  assert.deepEqual(d1(c), { DB: ['small', '3a9cc077-4dc8-4fbd-8bf7-8ed3b971af8b'] });
  assert.deepEqual(r2(c), { RUNS: 'small-runs' });
  assert.ok(!raw('../wrangler.jsonc').includes(RABBIT_HOLE));
});
