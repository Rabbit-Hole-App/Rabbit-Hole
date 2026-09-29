import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { learnMedia } from '../src/learn-storage.js';
import { putUploadedMedia, readUploadedMedia } from '../src/learn-media.js';
import { writeNegative, readMomentRecord } from '../src/learn-moment-index.js';

const here = new URL('.', import.meta.url);
const read = path => readFileSync(new URL(path, here), 'utf8');
// JSONC: drop comments outside strings, then trailing commas.
const config = path => JSON.parse(read(path).replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, string) => string || '').replace(/,(\s*[}\]])/g, '$1'));
const buckets = path => Object.fromEntries((config(path).r2_buckets || []).map(entry => [entry.binding, entry.bucket_name]));

const DEV = ['../../web/wrangler.dev.jsonc', '../../web/wrangler.parallel.jsonc'];
const PRODUCTION = '../wrangler.jsonc';

test('dev and review workers put Learn media in their own bucket; production config is unchanged', () => {
  const production = buckets(PRODUCTION);
  assert.deepEqual(production, { RUNS: 'small-runs' }, 'production binds only the live bucket');
  for (const path of DEV) {
    const dev = buckets(path);
    assert.equal(dev.LEARN_MEDIA, 'small-learn-media-dev', path);
    assert.ok(!Object.values(production).includes(dev.LEARN_MEDIA), `${path}: LEARN_MEDIA must not be a production bucket`);
    // The live outputs binding stays, read-only, for App/Job bundles and run outputs.
    assert.equal(dev.RUNS, 'small-runs', path);
  }
});

test('no Learn module touches RUNS directly; chat attachments go through learnMedia too', () => {
  const src = new URL('../src/', here);
  for (const name of readdirSync(src).filter(file => /^learn-.*\.js$/.test(file) && file !== 'learn-storage.js')) {
    assert.ok(!/\bRUNS\b/.test(readFileSync(new URL(name, src), 'utf8')), `${name} must use learnMedia(env)`);
  }
  const index = read('../src/index.js');
  assert.ok(!index.split('\n').some(line => line.includes('ask-uploads') && line.includes('env.RUNS')));
  assert.match(read('../../web/dev-worker.js'), /if \(!env\.LEARN_MEDIA\) return Response\.json/);
});

test('with LEARN_MEDIA bound, Learn writes never reach the live bucket; without it (production) they use RUNS', async () => {
  const live = { get: async () => { throw new Error('live bucket touched'); }, put: async () => { throw new Error('live bucket touched'); }, list: async () => { throw new Error('live bucket touched'); } };
  const store = new Map();
  const dev = { put: async (key, bytes, options) => store.set(key, { bytes, ...options }), get: async key => { const hit = store.get(key); return hit && { arrayBuffer: async () => hit.bytes.buffer ?? hit.bytes, json: async () => JSON.parse(hit.bytes), httpMetadata: hit.httpMetadata, customMetadata: hit.customMetadata }; } };
  const env = { RUNS: live, LEARN_MEDIA: dev };
  assert.equal(learnMedia(env), dev);
  const me = { org: 'o', email: 'a@b.c' };
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const { id } = await putUploadedMedia(env, me, { name: 'x.png', arrayBuffer: async () => png.buffer });
  assert.equal((await readUploadedMedia(env, me, id)).contentType, 'image/png');
  await writeNegative(env, 'dQw4w9WgXcQ', 'blocked');
  assert.equal((await readMomentRecord(env, 'dQw4w9WgXcQ')).reason, 'blocked');
  assert.equal(store.size, 2);
  assert.equal(learnMedia({ RUNS: live }), live);
});
