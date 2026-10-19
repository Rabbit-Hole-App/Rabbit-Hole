import { decide, jevDecideRequest, modelDecideRequest } from '../src/learn-inline-route.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { inlineSourceRanges } from '../src/inline-source-ranges.js';
import { inlineDecideFetch, inlineGenerateFetch } from '../src/learn-inline.js';
import { KEY_ENV, jevSays } from './learn-inline-fixture.js';
const id = `fs_${'1'.repeat(24)}`, rev = 'a'.repeat(64), sourceId = `file:${id}@${rev}`;
const req = new Request('https://test');
const access = { name: 'canvas-12345678', org: 'test', email: 'owner@test' };
const request = () => ({ kind: 'selection', mode: 'explain', targetIds: ['pdf'], context: { sourceRanges: [{ targetId: 'pdf', sourceId, range: { page: 2 } }] } });
const row = { id: 'board', state_json: JSON.stringify({ blocks: [{ id: 'pdf', fileRef: { family: 'pdf', source: { id, rev }, meta: { name: 'paper.pdf' } } }] }) };
test('explicit page scope passes exact immutable ref and authorized row without attached context', async () => {
  const result = await inlineSourceRanges(req, {}, { request: request(), access }, { loadBoard: async () => row, read: async (_req, _env, refs, options) => {
    assert.deepEqual(options, { row });
    assert.deepEqual(refs, [{ kind: 'file', sourceId, range: { page: 2 }, name: 'paper.pdf' }]);
    return { blocks: ['[p. 2] selected text'], coverage: new Map([[`${sourceId}|{"page":2}`, 'partial']]) };
  } });
  assert.equal(result.readings[0].coverage, 'partial');
  assert.deepEqual(result.blocks, [{ type: 'text', text: '[p. 2] selected text' }]);
});
test('malformed ranges and Edit refuse before reading; changed source refuses before extraction', async () => {
  for (const change of [r => { r.mode = 'edit'; }, r => { r.context.sourceRanges[0].targetId = 'other'; }, r => { r.context.sourceRanges[0].range = null; }, r => { r.context.sourceRanges[0].range = { page: 0 }; }, r => { r.context.sourceRanges[0].range.url = 'https://other'; }, r => { r.context.sourceRanges.push(r.context.sourceRanges[0]); }]) {
    const value = request(); change(value);
    assert.equal((await inlineSourceRanges(req, {}, { request: value, access }, { loadBoard: () => assert.fail('must not load') })).status, 400);
  }
  const value = request(); value.context.sourceRanges[0].sourceId = `file:${id}@${'b'.repeat(64)}`;
  assert.equal((await inlineSourceRanges(req, {}, { request: value, access }, { loadBoard: async () => row, read: () => assert.fail('must not read') })).status, 409);
});
test('unreadable page fails closed and absent explicit scope reads nothing', async () => {
  assert.deepEqual(await inlineSourceRanges(req, {}, { request: { context: {} }, access }), { blocks: [], readings: [] });
  for (const coverage of ['unavailable', 'listed', 'omitted']) {
    const response = await inlineSourceRanges(req, {}, { request: request(), access }, { loadBoard: async () => row, read: async () => ({ blocks: [], coverage: new Map([[`${sourceId}|{"page":2}`, coverage]]) }) });
    assert.equal(response.status, 409);
  }
});
test('actual fileContext and source authorization read only selected page; revoked indexed access refuses', async t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE file_sources(id TEXT,sha256 TEXT,status TEXT);
    CREATE TABLE file_source_refs(source_id TEXT,board_id TEXT);
    CREATE TABLE file_derivatives(id TEXT,source_id TEXT,source_sha256 TEXT,kind TEXT,status TEXT,media_type TEXT,r2_key TEXT,converter_version TEXT,updated_at INTEGER);`);
  db.prepare('INSERT INTO file_sources VALUES (?,?,?)').run(id, rev, 'stored');
  db.prepare('INSERT INTO file_source_refs VALUES (?,?)').run(id, row.id);
  db.prepare('INSERT INTO file_derivatives VALUES (?,?,?,?,?,?,?,?,?)').run('derivative', id, rev, 'text', 'ready', 'application/json', 'text-only', 'fixture', 1);
  let reads = 0;
  const env = { LEARN_DB: { prepare(sql) { let values = []; return { bind(...args) { values = args; return this; }, async first() { return db.prepare(sql).get(...values) || null; } }; } }, LEARN_MEDIA: { async get(key) {
    reads++; assert.equal(key, 'text-only');
    return { text: async () => JSON.stringify({ v: 1, complete: true, units: [{ loc: { page: 1 }, text: 'UNSELECTED PAGE' }, { loc: { page: 2 }, text: 'SELECTED PAGE' }] }) };
  } } };
  const result = await inlineSourceRanges(req, env, { request: request(), access }, { loadBoard: async () => row });
  assert.match(result.blocks[0].text, /SELECTED PAGE/);
  assert.doesNotMatch(result.blocks[0].text, /UNSELECTED PAGE/);
  assert.equal(result.readings[0].coverage, 'extracted');
  assert.equal(reads, 1);
  db.exec('DELETE FROM file_source_refs');
  assert.equal((await inlineSourceRanges(req, env, { request: request(), access }, { loadBoard: async () => row })).status, 409);
  assert.equal(reads, 1);
});
test('HTTP checks pages before validator and again before generation, returning actual coverage', async () => {
  const post = body => new Request('https://test/api/learn/inline/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = request(); value.prompt = 'Compare this page with the selected explanation'; value.context.target = { ids: ['pdf'] };
  const body = { app: access.name, request_id: 'request-123', request: value, enabled: ['note'] };
  let calls = 0, reads = 0;
  const sourceRangeDeps = { loadBoard: async () => row, read: async () => { reads++; return { blocks: ['[p. 2] EXTRACTED SENTINEL'], coverage: new Map([[`${sourceId}|{"page":2}`, 'partial']]) }; } };
  const deps = { authorize: async () => access, sourceRangeDeps, ask: jevSays('proceed'), callModel: async (_env, prompt) => {
    calls++; assert.match(JSON.stringify(prompt.messages), /EXTRACTED SENTINEL/);
    assert.match(prompt.system, /Partial coverage/);
    return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'The excerpt on p. 2 supports this comparison; the remaining PDF was not read.' }] });
  } };
  const verdict = await (await inlineDecideFetch(post(body), KEY_ENV, deps)).json();
  assert.ok(verdict.token); assert.equal(reads, 1);
  const output = await (await inlineGenerateFetch(post({ ...body, token: verdict.token }), KEY_ENV, deps)).text();
  assert.match(output, /"sourceReadings"/); assert.match(output, /"coverage":"partial"/);
  assert.equal(reads, 2); assert.equal(calls, 1);
  const unavailable = { ...deps, sourceRangeDeps: { ...sourceRangeDeps, loadBoard: async () => null }, ask: () => assert.fail('no validator on inaccessible source'), callModel: () => assert.fail('no model on inaccessible source') };
  assert.equal((await inlineDecideFetch(post(body), KEY_ENV, unavailable)).status, 409);
  assert.equal((await inlineGenerateFetch(post({ ...body, token: verdict.token }), KEY_ENV, unavailable)).status, 409);
  assert.equal((await inlineGenerateFetch(post({ ...body, board: 'another', token: verdict.token }), KEY_ENV, deps)).status, 400);
});
test('mixed PDF-page and image selection sends both authorized contexts to note comparison', async () => {
  const post = body => new Request('https://test/api/learn/inline/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = request(); value.targetIds = ['pdf', 'image']; value.prompt = 'Compare this PDF page with the selected image';
  value.context.target = { ids: ['pdf', 'image'] }; value.context.image = { id: 'image' };
  const body = { app: access.name, request_id: 'request-123', request: value, enabled: ['note'] };
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'fixture-pixels' } };
  const deps = { authorize: async () => access, ask: jevSays('proceed'), images: async () => ({ blocks: [image] }),
    sourceRangeDeps: { loadBoard: async () => row, read: async () => ({ blocks: ['[p. 2] PDF PAGE CONTENT'], coverage: new Map([[`${sourceId}|{"page":2}`, 'extracted']]) }) },
    callModel: async (_env, prompt) => {
      const content = prompt.messages[0].content;
      assert.ok(content.some(block => block.type === 'text' && block.text.includes('PDF PAGE CONTENT')));
      assert.ok(content.some(block => block.type === 'image' && block.source.data === 'fixture-pixels'));
      return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'This compares the selected page excerpt and image.' }] });
    } };
  const decision = await (await inlineDecideFetch(post(body), KEY_ENV, deps)).json();
  assert.ok(decision.token);
  const output = await (await inlineGenerateFetch(post({ ...body, token: decision.token }), KEY_ENV, deps)).text();
  assert.match(output, /"kind":"note"/);
  assert.match(output, /"coverage":"extracted"/);
});

test('explicit PDF comparison routes to note and conflicting fixed output refuses before validation', async () => {
  const value=request();value.prompt='Compare these pages';value.context.target={ids:['pdf']};
  const jev=jevDecideRequest(value,null,'fixture');assert.match(jev.state.explicitPageReading,/route note only/);
  assert.match(modelDecideRequest(value,null).system,/page selections support note only/);
  let calls=0;
  const verdict=await decide(KEY_ENV,{app:access.name,requestId:'request-123',request:value,enabled:['note','equation']},{transport:'direct',ask:async(...args)=>{calls++;return jevSays('proceed')(...args);}});
  assert.equal(verdict.body.route.capability,'note');assert.equal(calls,1);
  for(const conflicting of [{output:'equation'},{revising:'equation'}]) {
    const blocked=await decide(KEY_ENV,{app:access.name,requestId:'request-123',request:{...value,...conflicting},enabled:['note','equation']},{ask:()=>assert.fail('no paid validation')});
    assert.equal(blocked.body.decision,'unsupported');assert.equal(blocked.called,false);
  }
});
