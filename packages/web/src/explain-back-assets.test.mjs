import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ASSETS_PATH, AssetError, createExplainBackAssets, mimeOf } from './explain-back-assets.js';
import { createVoiceNote, toSavedVoice } from './explain-back-media.js';
import { validateExplainBackAnswer } from './explain-back-contract.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const OGG = (() => { const b = new Uint8Array(47); b.set([...'OggS'].map(c => c.charCodeAt(0))); b[26] = 1; b[27] = 19; b.set([...'OpusHead'].map(c => c.charCodeAt(0)), 28); return b; })();
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...[...'....webm....A_OPUS'].map(c => c.charCodeAt(0))]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

function fakeStore({ refuse = null } = {}) {
  const calls = [], blobs = new Map();
  let n = 0;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url, 'https://app.test');
    const body = init.body instanceof Blob ? new Uint8Array(await init.body.arrayBuffer()) : init.body ?? null;
    calls.push({ method: init.method || 'GET', path: parsed.pathname, query: Object.fromEntries(parsed.searchParams), type: init.headers?.['Content-Type'] ?? null, body });
    if (refuse) return Response.json({ error: refuse.code }, { status: refuse.status });
    if (init.method === 'PUT' && parsed.pathname === ASSETS_PATH) {
      const assetId = `aa_test${String(++n).padStart(8, '0')}`;
      blobs.set(assetId, body);
      return Response.json({ asset: { assetId, kind: parsed.searchParams.get('kind'), mime: init.headers['Content-Type'], bytes: body.length, sha256: hash(body), durationMs: Number(parsed.searchParams.get('durationMs')) || null } }, { status: 201 });
    }
    if (init.method === 'PUT') return Response.json({ meta: JSON.parse(body) });
    const id = parsed.pathname.split('/').pop();
    return blobs.has(id) ? new Response(blobs.get(id)) : Response.json({ error: 'unknown_asset' }, { status: 404 });
  };
  return { calls, fetchImpl };
}
const memory = () => { const map = new Map(); return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; };

test('the type comes from the bytes', async () => {
  assert.equal(await mimeOf(new Blob([PNG])), 'image/png');
  assert.equal(await mimeOf(new Blob([OGG], { type: 'audio/webm' })), 'audio/ogg', 'a wrong declared type is ignored');
  assert.equal(await mimeOf(new Blob([WEBM])), 'audio/webm');
  assert.equal(await mimeOf(new Blob(['{"v":1}'])), 'application/json');
  assert.equal(await mimeOf(new Blob(['plain'])), null);
});

test('a voice note uploads its bytes with their hash, kind and duration, and becomes a valid voice EvidenceRef', async () => {
  const store = fakeStore();
  const assets = createExplainBackAssets({ app: 'canvas-0123abcd', board: 'main', fetchImpl: store.fetchImpl, storage: memory() });
  const progress = [];
  const file = new File([OGG], 'voice-note.ogg', { type: 'audio/ogg' });
  const asset = await assets.voice.upload(file, { durationMs: 3200.4, onProgress: p => progress.push(p) });
  const [call] = store.calls;
  assert.deepEqual([call.method, call.path, call.type], ['PUT', ASSETS_PATH, 'audio/ogg']);
  assert.deepEqual(call.query, { app: 'canvas-0123abcd', board: 'main', kind: 'audio', sha256: hash(OGG), durationMs: '3200' });
  assert.deepEqual(call.body, OGG, 'the raw bytes, unchanged');
  assert.deepEqual(progress, [{ sent: 0, total: OGG.length }, { sent: OGG.length, total: OGG.length }]);
  const ref = toSavedVoice({ type: 'audio/ogg', size: OGG.length, durationMs: 3200, sha256: hash(OGG) }, asset);
  assert.equal(ref.assetId, 'aa_test00000001');
  assert.ok(validateExplainBackAnswer({ v: 1, kind: 'explain_back', text: '', voice: [ref], resources: [], assistance: [] }).ok);
  const back = await assets.voice.load(ref.assetId);
  assert.deepEqual(new Uint8Array(await back.arrayBuffer()), OGG);
  assert.equal(store.calls.at(-1).query.app, 'canvas-0123abcd', 'reads name the canvas too');
});

test('the voice controller saves through the store end to end, and the draft reference is kept per card', async () => {
  const store = fakeStore();
  const storage = memory();
  const assets = createExplainBackAssets({ app: 'canvas-0123abcd', board: 'main', fetchImpl: store.fetchImpl, storage });
  assert.equal(assets.voice.saved('q1'), null);
  const ref = { evidenceId: 'ev_voice_1', role: 'voice', media: 'audio', state: 'ready', assetId: 'aa_voice00000001', revision: 1, hash: 'a'.repeat(64), mime: 'audio/ogg', bytes: 10, durationMs: 1000 };
  assets.voice.onSaved('q1', ref);
  assert.deepEqual(assets.voice.saved('q1'), ref);
  assert.equal(assets.voice.saved('q2'), null, 'another card has its own');
  assert.equal(createVoiceNote({ saved: assets.voice.saved('q1'), load: assets.voice.load }).get().status, 'saved', 'a reload starts from the kept note');
  assets.voice.onSaved('q1', null);
  assert.equal(assets.voice.saved('q1'), null);
});

test('a Sketch capture uploads its PNG and then its marks and text, and becomes a sketch EvidenceRef', async () => {
  const store = fakeStore();
  const assets = createExplainBackAssets({ app: 'canvas-0123abcd', board: 'b2', fetchImpl: store.fetchImpl, storage: memory() });
  const block = { sketch: { strokes: [{ points: [{ x: 0, y: 0 }, { x: 4, y: 4 }] }], shapes: [], items: [] } };
  const ref = await assets.uploadSketch({ block, sketch: { image: dataUrl(PNG), text: 'Marks: 1 freehand stroke' } });
  const [png, meta] = store.calls;
  assert.deepEqual([png.query.kind, png.type, png.query.sha256, png.query.durationMs], ['image', 'image/png', hash(PNG), undefined]);
  assert.deepEqual(png.body, PNG);
  assert.equal(meta.path, `${ASSETS_PATH}/aa_test00000001`);
  assert.deepEqual(JSON.parse(meta.body), { app: 'canvas-0123abcd', board: 'b2', marks: 1, text: 'Marks: 1 freehand stroke' });
  assert.deepEqual(ref, { evidenceId: `ev_sketch_${hash(PNG).slice(0, 16)}`, role: 'sketch', media: 'image', state: 'ready', assetId: 'aa_test00000001', revision: 1, hash: hash(PNG), mime: 'image/png', bytes: PNG.length });
  assert.ok(validateExplainBackAnswer({ v: 1, kind: 'explain_back', text: '', voice: [], sketch: ref, resources: [], assistance: [] }).ok);
  await assert.rejects(assets.uploadSketch({ block, sketch: { image: 'data:image/jpeg;base64,AAAA' } }), error => error instanceof AssetError && error.code === 'invalid_asset');
});

test('the store\'s refusals surface with their code, a learner reason and whether Retry can help', async () => {
  for (const [code, status, retryable, words] of [['asset_too_large', 413, false, /larger/], ['unsupported_asset', 415, false, /format/], ['asset_hash_mismatch', 400, true, /damaged/], ['attempts_unavailable', 503, true, /Retry/]]) {
    const assets = createExplainBackAssets({ app: 'canvas-0123abcd', fetchImpl: fakeStore({ refuse: { code, status } }).fetchImpl, storage: memory() });
    await assert.rejects(assets.voice.upload(new File([OGG], 'v.ogg'), { durationMs: 1000 }), error => {
      assert.deepEqual([error.code, error.status, error.retryable], [code, status, retryable]);
      assert.match(error.message, words);
      return true;
    });
  }
  const offline = createExplainBackAssets({ app: 'canvas-0123abcd', fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, storage: memory() });
  await assert.rejects(offline.voice.load('aa_voice00000001'), error => error.code === 'network' && error.retryable);
});
