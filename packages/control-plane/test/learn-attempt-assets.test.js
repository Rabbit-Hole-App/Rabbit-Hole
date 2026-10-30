// Explain-back private answer media, transcripts and drafts (EB-02, learn 0034) through the real routes on node:sqlite with an
// in-memory R2. Only the uploader, on the canvas and board of the upload, can read an asset: another learner, another board or a
// fork's canvas gets 404. No model is reachable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { attemptRoute } from '../src/learn-attempt-routes.js';
import { readAttempt } from '../src/learn-attempt-store.js';
import { readAttemptAsset, readFrozenSnapshot, storeAttemptAsset, transcriptStore, transcriptsOf } from '../src/learn-attempt-assets.js';
import { canonical } from '../src/learn-attempt-store.js';
import { purgeTutorRows } from '../src/learn-coaching-store.js';
import { ANA, BEN, call, never, world } from './learn-attempt-fixture.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (head, n = 600) => { const b = new Uint8Array(n); b.set(head); for (let i = head.length; i < n; i += 1) b[i] = i % 251; return b; };
const WEBM = bytesOf([0x1a, 0x45, 0xdf, 0xa3]);
const OGG = bytesOf([...'OggS'].map(c => c.charCodeAt(0)));
const M4A = bytesOf([0, 0, 0, 0x18, ...'ftypM4A '].map(c => (typeof c === 'string' ? c.charCodeAt(0) : c)));
const PNG = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MP3 = bytesOf([...'ID3'].map(c => c.charCodeAt(0)));

function media() {
  const objects = new Map();
  return {
    objects,
    put: async (key, body, { sha256 } = {}) => { const bytes = new Uint8Array(body instanceof ReadableStream || typeof body === 'string' ? await new Response(body).arrayBuffer() : body); if (sha256 && sha(bytes) !== sha256) throw new Error('put: The SHA-256 checksum you specified did not match what we received.'); objects.set(key, bytes); },
    get: async (key, options) => {
      const bytes = objects.get(key);
      if (!bytes) return null;
      const { offset = 0, length = bytes.byteLength - offset } = options?.range || {};
      return { body: bytes.slice(offset, offset + length), size: bytes.byteLength };
    },
  };
}
const setup = t => { const LEARN_MEDIA = media(); const w = world(t, { LEARN_MEDIA }); return { ...w, media: LEARN_MEDIA }; };
const auth = actor => ({ authorize: async () => ({ kind: 'canvas', org: actor.org, user_id: actor.userId }) });
async function route(env, actor, method, path, { query = {}, raw, json: body, headers = {} } = {}) {
  const q = new URLSearchParams({ app: actor.app, board: actor.board, ...query });
  const init = { method, headers };
  if (raw) { init.body = raw; init.headers = { 'Content-Length': String(raw.byteLength), ...headers }; }
  if (body) { init.body = JSON.stringify({ app: actor.app, board: actor.board, ...body }); init.headers = { 'Content-Type': 'application/json', ...headers }; }
  const res = await attemptRoute(path, new Request(`https://app.test${path}${body ? '' : `?${q}`}`, init), env, auth(actor));
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
}
const upload = (env, actor, bytes, kind = 'audio', extra = {}) => route(env, actor, 'PUT', '/api/learn/tutor/attempts/assets', { raw: bytes, query: { kind, sha256: sha(bytes), ...(kind === 'audio' ? { durationMs: '4200' } : {}), ...extra } });
const read = (env, actor, id, headers) => route(env, actor, 'GET', `/api/learn/tutor/attempts/assets/${id}`, { headers });

test('learn 0034 is CREATE-only, re-runnable and mirrored verbatim at the end of repository-schema.sql', () => {
  const migration = readFileSync(new URL('../learn-migrations/0034-explain-back.sql', import.meta.url), 'utf8').replace(/\r/g, '');
  const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8').replace(/\r/g, '');
  for (const s of migration.replace(/--.*$/gm, '').split(';').map(x => x.trim()).filter(Boolean)) assert.match(s, /^CREATE (TABLE|(UNIQUE )?INDEX) IF NOT EXISTS /);
  assert.ok(schema.trimEnd().endsWith(migration.trim()));
  const db = new DatabaseSync(':memory:');
  db.exec(migration); db.exec(migration);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => r.name), ['learn_attempt_assets', 'learn_attempt_transcripts', 'learn_explain_drafts']);
  db.close();
});

test('audio WebM, Ogg and MP4 and a PNG snapshot are accepted by their bytes and named from the container; nothing else', async t => {
  const w = setup(t);
  const webm = await upload(w.env, ANA, WEBM);
  assert.equal(webm.status, 201, JSON.stringify(webm.body));
  assert.deepEqual({ ...webm.body.asset, assetId: undefined }, { assetId: undefined, kind: 'audio', mime: 'audio/webm', ext: 'webm', bytes: WEBM.byteLength, sha256: sha(WEBM), durationMs: 4200 });
  assert.match(webm.body.asset.assetId, /^aa_/);
  const again = await upload(w.env, ANA, WEBM);
  assert.deepEqual([again.status, again.body.asset.assetId], [200, webm.body.asset.assetId], 'a retried upload is the same asset');
  assert.equal((await upload(w.env, ANA, OGG)).body.asset.ext, 'ogg');
  assert.deepEqual([(await upload(w.env, ANA, M4A)).body.asset.mime], ['audio/mp4']);
  assert.equal((await upload(w.env, ANA, PNG, 'image')).body.asset.mime, 'image/png');
  const refused = async (res, status, error) => { const r = await res; assert.deepEqual([r.status, r.body.error], [status, error]); };
  await refused(upload(w.env, ANA, MP3), 415, 'unsupported_asset');
  await refused(upload(w.env, ANA, WEBM.slice().reverse(), 'audio'), 415, 'unsupported_asset');
  await refused(upload(w.env, ANA, PNG, 'audio'), 415, 'unsupported_asset');
  await refused(upload(w.env, ANA, WEBM, 'video'), 400, 'invalid_asset');
  await refused(upload(w.env, ANA, OGG, 'audio', { durationMs: '' }), 400, 'invalid_asset');
  await refused(route(w.env, ANA, 'PUT', '/api/learn/tutor/attempts/assets', { raw: bytesOf([0x1a, 0x45, 0xdf, 0xa3], 700), query: { kind: 'audio', sha256: 'a'.repeat(64), durationMs: '10' } }), 400, 'asset_hash_mismatch');
  const tooLong = await upload(w.env, ANA, bytesOf([0x1a, 0x45, 0xdf, 0xa3], 2 * 1024 * 1024 + 1));
  assert.deepEqual([tooLong.status, tooLong.body.error, tooLong.body.detail], [413, 'asset_too_large', { max: 2 * 1024 * 1024 }]);
  await refused(upload(w.env, ANA, bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 600 * 1024 + 1), 'image'), 413, 'asset_too_large');
  assert.equal((await upload(w.env, ANA, bytesOf([0x1a, 0x45, 0xdf, 0xa3], 2 * 1024 * 1024))).status, 201, 'exactly the cap is kept');
  // a generic board upload is untouched: WebM audio is still refused there (file-capabilities.js), only attempt assets take it
  assert.equal(w.sqlite.prepare('SELECT count(*) AS n FROM learn_attempt_assets').get().n, 5);
});

test('only the uploader on that canvas and board reads an asset; a range plays; another learner, board or fork gets 404', async t => {
  const w = setup(t);
  const id = (await upload(w.env, ANA, WEBM)).body.asset.assetId;
  const whole = await read(w.env, ANA, id);
  assert.deepEqual([whole.status, whole.headers.get('content-type'), whole.headers.get('cache-control'), whole.body.byteLength], [200, 'audio/webm', 'private, no-store', WEBM.byteLength]);
  const part = await read(w.env, ANA, id, { Range: 'bytes=10-19' });
  assert.deepEqual([part.status, part.headers.get('content-range'), [...part.body]], [206, `bytes 10-19/${WEBM.byteLength}`, [...WEBM.slice(10, 20)]]);
  for (const other of [BEN, { ...ANA, board: 'side' }, { ...ANA, app: 'canvas-fork-0001' }]) assert.equal((await read(w.env, other, id)).status, 404, JSON.stringify(other));
  assert.equal((await read(w.env, ANA, 'aa_notarealasset')).status, 404);
});

test('voice-only and Sketch-only answers submit with the learner\'s own assets; assessment reads them hash-checked with capture data', async t => {
  const w = setup(t);
  const bound = (await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts/bind', { cardId: 'card-1', prompt: 'Why?', expects: ['because'] })).body;
  const voice = (await upload(w.env, ANA, WEBM)).body.asset, png = (await upload(w.env, ANA, PNG, 'image')).body.asset;
  const meta = await route(w.env, ANA, 'PUT', `/api/learn/tutor/attempts/assets/${png.assetId}`, { json: { marks: [{ kind: 'arrow', label: 'v' }], text: 'v tangent' } });
  assert.deepEqual(meta.body.meta, { marks: [{ kind: 'arrow', label: 'v' }], text: 'v tangent' });
  assert.equal((await route(w.env, ANA, 'PUT', `/api/learn/tutor/attempts/assets/${png.assetId}`, { json: { marks: [], text: 'changed' } })).status, 400, 'capture data is set once');
  const ref = (a, role, media, evidenceId) => ({ evidenceId, role, media, state: 'ready', assetId: a.assetId, revision: 1, hash: a.sha256 });
  const answer = over => ({ v: 1, kind: 'explain_back', text: '', voice: [], resources: [], assistance: [], ...over });
  let k = 0;
  const submit = (content, actor = ANA) => call(w.env, actor, 'POST', '/api/learn/tutor/attempts', { activityId: bound.activityId, activityRevision: 1, submissionKey: `assets-key-${++k}`, submittedContent: content }, never);
  const voiceOnly = await submit(answer({ voice: [ref(voice, 'voice', 'audio', 'ev_v')] }));
  assert.equal(voiceOnly.status, 200, JSON.stringify(voiceOnly.body));
  const sketchOnly = await submit(answer({ sketch: ref(png, 'sketch', 'image', 'ev_s') }));
  assert.equal(sketchOnly.status, 200, JSON.stringify(sketchOnly.body));
  for (const bad of [answer({ voice: [{ ...ref(voice, 'voice', 'audio', 'ev_v'), hash: 'f'.repeat(64) }] }), answer({ voice: [ref(png, 'voice', 'audio', 'ev_v')] })]) {
    assert.deepEqual((await submit(bad)).body.error, 'unknown_asset');
  }
  // Ben names Ana's asset id in his own answer: not his
  const benBound = (await call(w.env, BEN, 'POST', '/api/learn/tutor/attempts/bind', { cardId: 'card-1', prompt: 'Why?', expects: ['because'] })).body;
  const ben = await call(w.env, BEN, 'POST', '/api/learn/tutor/attempts', { activityId: benBound.activityId, activityRevision: 1, submissionKey: 'ben-key-0001', submittedContent: answer({ voice: [ref(voice, 'voice', 'audio', 'ev_v')] }) }, never);
  assert.equal(ben.body.error, 'unknown_asset');

  const { attempt } = await readAttempt(w.env, ANA, sketchOnly.body.attempt.attemptId);
  const got = await readAttemptAsset(w.env, ANA, attempt, attempt.submittedContent.sketch);
  assert.deepEqual([[...got.bytes], got.mime, got.text], [[...PNG], 'image/png', 'v tangent']);
  assert.equal(await readAttemptAsset(w.env, ANA, attempt, ref(voice, 'voice', 'audio', 'ev_v')), null, 'evidence the attempt does not name');
  assert.equal(await readAttemptAsset(w.env, BEN, attempt, attempt.submittedContent.sketch), null, 'another learner');
  w.media.objects.set([...w.media.objects.keys()].find(key => key.endsWith(png.sha256)), PNG.slice(1));
  assert.equal(await readAttemptAsset(w.env, ANA, attempt, attempt.submittedContent.sketch), null, 'changed bytes are never a substitute');
});

test('transcripts are immutable per id; a failed one is replaced only by an explicit retry; only the owner\'s audio', async t => {
  const w = setup(t);
  const voice = (await upload(w.env, ANA, WEBM)).body.asset;
  const store = transcriptStore(w.env, ANA);
  const base = { transcriptId: 'tr_1', assetId: voice.assetId, hash: voice.sha256, provider: 'fixture', model: 'stt-1', version: 1, converterVersion: 'stt-v1' };
  const failed = await store.put({ ...base, text: '', status: 'failed', error: 'provider_timeout' });
  assert.equal(failed.status, 'failed');
  assert.equal((await store.put({ ...base, text: 'force inward', status: 'ready', derivativeHash: 'd'.repeat(64) })).status, 'failed', 'not without an explicit retry');
  const ready = await store.put({ ...base, text: 'force inward', status: 'ready', derivativeHash: 'd'.repeat(64) }, { retry: true });
  assert.deepEqual([ready.status, ready.text], ['ready', 'force inward']);
  const again = await store.put({ ...base, text: 'something else', status: 'ready', derivativeHash: 'e'.repeat(64) }, { retry: true });
  assert.equal(again.text, 'force inward', 'a ready transcript never changes');
  assert.deepEqual(await store.get('tr_1'), ready);
  assert.equal(await transcriptStore(w.env, BEN).get('tr_1'), null);
  await assert.rejects(transcriptStore(w.env, BEN).put({ ...base, transcriptId: 'tr_2', text: 'x', status: 'ready', derivativeHash: 'd'.repeat(64) }), /not this learner/);
  assert.equal((await transcriptsOf(w.env, ANA, voice.assetId)).length, 1);
});

test('drafts are per learner and card, conflict-protected, never overwritten by a stale tab, and cleared explicitly', async t => {
  const w = setup(t);
  const put = (actor, expectedRevision, answer) => route(w.env, actor, 'PUT', '/api/learn/tutor/attempts/drafts', { json: { cardId: 'card-1', expectedRevision, answer } });
  const get = actor => route(w.env, actor, 'GET', '/api/learn/tutor/attempts/drafts', { query: { cardId: 'card-1' } });
  const answer = text => ({ v: 1, kind: 'explain_back', text, voice: [], resources: [], assistance: [] });
  assert.deepEqual((await get(ANA)).body, { draft: null });
  const first = await put(ANA, 0, answer('first'));
  assert.equal(first.body.draft.revision, 1, JSON.stringify(first.body));
  assert.equal((await put(ANA, 1, answer('second'))).body.draft.revision, 2);
  const stale = await put(ANA, 1, answer('from an old tab'));
  assert.deepEqual([stale.status, stale.body.error, stale.body.detail.draft.answer.text], [409, 'draft_conflict', 'second']);
  assert.equal((await put(ANA, 0, answer('another new'))).status, 409, 'a second "new" draft does not replace the first');
  // a draft may hold a voice note still uploading; it is not submittable, but it is saved
  const uploading = { ...answer(''), voice: [{ evidenceId: 'ev_v', role: 'voice', media: 'audio', state: 'uploading', assetId: 'aa_pending00001', revision: 1 }] };
  assert.equal((await put(ANA, 2, uploading)).body.draft.answer.voice[0].state, 'uploading');
  assert.equal((await put(ANA, 3, { ...answer('x'), resources: [{ evidenceId: 'r', role: 'resource', media: 'card', state: 'ready', sourceKind: 'card', assetId: 'card-1', revision: 1 }] })).body.error, 'self_reference');
  assert.deepEqual((await get(BEN)).body, { draft: null });
  assert.deepEqual((await put(ANA, 3, null)).body, { draft: null });
  assert.deepEqual((await get(ANA)).body, { draft: null });
});

test('a permanent canvas delete takes its answer media rows, transcripts and drafts', async t => {
  const w = setup(t);
  const voice = (await upload(w.env, ANA, WEBM)).body.asset;
  await transcriptStore(w.env, ANA).put({ transcriptId: 'tr_1', assetId: voice.assetId, hash: voice.sha256, provider: 'f', model: 'm', version: 1, converterVersion: 'c', text: 't', status: 'ready', derivativeHash: 'd'.repeat(64) });
  await route(w.env, ANA, 'PUT', '/api/learn/tutor/attempts/drafts', { json: { cardId: 'card-1', expectedRevision: 0, answer: { v: 1, kind: 'explain_back', text: 'd', voice: [], resources: [], assistance: [] } } });
  await w.env.LEARN_DB.batch(purgeTutorRows(w.env.LEARN_DB, ANA.org, ANA.app));
  for (const table of ['learn_attempt_assets', 'learn_attempt_transcripts', 'learn_explain_drafts']) assert.equal(w.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
});

test('storeAttemptAsset seeds a fixture asset with the upload checks, and assessment reads it back', async t => {
  const w = setup(t);
  const png = await storeAttemptAsset(w.env, ANA, { bytes: PNG, mime: 'image/png', marks: [1], text: 'arrow' });
  assert.deepEqual([png.kind, png.sha256, png.bytes], ['image', sha(PNG), PNG.byteLength]);
  assert.equal((await upload(w.env, ANA, PNG, 'image')).body.asset.assetId, png.assetId, 'the same bytes are the same asset');
  await assert.rejects(storeAttemptAsset(w.env, ANA, { bytes: MP3, mime: 'audio/mpeg' }), /unsupported/);
  const attempt = { submittedContent: { sketch: { evidenceId: 'ev_s', assetId: png.assetId, hash: png.sha256 }, voice: [] } };
  assert.equal((await readAttemptAsset(w.env, ANA, attempt, attempt.submittedContent.sketch)).text, 'arrow');
});

test('board-held inputs are frozen at submission: only snapshots the answer names by hash are kept, privately', async t => {
  const w = setup(t);
  const bound = (await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts/bind', { cardId: 'card-1', prompt: 'Why?', expects: ['because'] })).body;
  const note = { type: 'note', text: 'Tension points to the pivot.' };
  const cells = { notebook: 'nb_1', path: null, cells: [{ id: 'c2', type: 'code', source: 'print(2)', outputs: [], executionCount: 1 }] };
  const ref = (evidenceId, snapshot, over = {}) => ({ evidenceId, role: 'resource', media: 'card', state: 'ready', sourceKind: 'card', assetId: evidenceId, revision: 1, hash: sha(canonical(snapshot)), ...over });
  const group = { evidenceId: 'ev_g', role: 'resource', media: 'group', state: 'ready', sourceKind: 'group', assetId: 'grp_1', revision: 1,
    members: [{ sourceKind: 'notebook', sourceId: 'nb_1', revision: 1, hash: sha(canonical(cells)), media: 'notebook', state: 'ready' }] };
  const content = { v: 1, kind: 'explain_back', text: '', voice: [], resources: [ref('ev_note', note), group], assistance: [] };
  const r = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: bound.activityId, activityRevision: 1, submissionKey: 'snap-key-0001', submittedContent: content, snapshots: [note, cells, { type: 'note', text: 'not connected' }] }, never);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal([...w.media.objects.keys()].filter(k => k.startsWith('learn-attempt-snapshots/')).length, 2, 'the unnamed snapshot is not kept');
  const { attempt } = await readAttempt(w.env, ANA, r.body.attempt.attemptId);
  assert.deepEqual(await readFrozenSnapshot(w.env, ANA, attempt, content.resources[0]), { snapshot: note });
  assert.deepEqual(await readFrozenSnapshot(w.env, ANA, attempt, group.members[0]), { snapshot: cells });
  assert.equal(await readFrozenSnapshot(w.env, BEN, attempt, content.resources[0]), null, 'another learner');
  assert.equal(await readFrozenSnapshot(w.env, ANA, attempt, { hash: sha(canonical({ type: 'note', text: 'not connected' })) }), null, 'not an input of this attempt');
  const bad = await call(w.env, ANA, 'POST', '/api/learn/tutor/attempts', { activityId: bound.activityId, activityRevision: 1, submissionKey: 'snap-key-0002', submittedContent: { ...content, text: 'x' }, snapshots: 'nope' }, never);
  assert.deepEqual([bad.status, bad.body.error], [400, 'invalid_snapshots']);
});
