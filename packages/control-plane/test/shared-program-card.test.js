// Program cards on a share link (learn-boards.js sharedProgram, GET /api/learn/boards/shared/<token>/cards/<card id>/program).
// The link and the card id are the whole request: the card is found on the board the server saved, its saved result is read
// from that canvas's ExplainJobs object as the board owner's own (never as the visitor), and it must be the result, revision and
// bundle the card saved. The answer is the artifact, a trimmed identity and the execution decision, nothing else. Every other
// case refuses the way a card source does. The owner's job and result routes stay owner-only. No model call, no board write.
// The real ExplainJobs object on in-memory storage; results are seeded as acceptProgram stores them, with no job record (pruned).
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './shared-canvas-fixture.js';
import { ExplainJobs, explainRoute } from '../src/explain-job.js';
import { newTiming } from '../src/explain-policy.js';
import { buildProgramArtifact, programReference } from '../src/explain-program.js';
import { verifyHashes } from '../../web/src/explain-program/contract.js';

const program = (title, factor) => ({
  source: `export function evaluate({ inputs, time }) {
  const level = ${factor} * inputs.rate * time;
  return { frame: { width: 960, height: 540, objects: [{ kind: 'box', id: 'bar', x: 40, y: 200, w: Math.max(1, Math.min(800, 40 * level)), h: 60, role: 'output' }], readouts: [{ id: 'level', value: level }] }, quantities: { level } };
}`,
  manifest: { title, summary: 'A bar grows with the rate you choose.', assumptions: ['Constant rate.'], description: 'A bar whose length grows with time.',
    inputs: [{ type: 'number', id: 'rate', label: 'Rate', unit: '1/s', default: 2, min: 0, max: 10, step: 1 }], duration: 4,
    readouts: [{ id: 'level', label: 'Level', decimals: 2 }], capabilities: ['time_playback', 'number_inputs'] },
});

function world(t, vars = {}) {
  const f = setup(t, { vars: { EXPLAIN_V2_ENABLED: 'true', ...vars } });
  const stores = new Map(), actors = new Map();
  const durable = data => { let lock = Promise.resolve(); return { storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => { data.set(k, structuredClone(v)); }, delete: async k => data.delete(k), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix))), setAlarm: async () => {}, getAlarm: async () => null }, blockConcurrencyWhile: fn => { const r = lock.then(fn); lock = r.catch(() => {}); return r; } }; };
  const store = name => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  const actor = name => { if (!actors.has(name)) actors.set(name, new ExplainJobs(durable(store(name)), f.env)); return actors.get(name); };
  f.env.EXPLAIN_JOBS = { idFromName: name => name, get: name => ({ fetch: (url, init) => actor(name).fetch(new Request(url, init)) }) };
  const original = globalThis.fetch, outbound = [];
  globalThis.fetch = async url => { outbound.push(String(url)); throw new Error(`unexpected fetch ${url}`); };
  t.after(() => { globalThis.fetch = original; assert.deepEqual(outbound, [], 'a program read called out (a model?)'); });
  // An accepted program result on a board, as acceptProgram stores it, and the card the app places for it.
  const accept = async (boardId, cardId, resultId, bundle) => {
    const artifact = await buildProgramArtifact(bundle);
    const identity = { jobId: `ej_${resultId}`, resultId, cardId, canvas: { boardId }, promptRef: 'prompt-ref-0001', revision: `xr_${resultId}`, baseRevision: null, kind: 'program',
      bundleHash: artifact.bundleHash, sourceHash: artifact.sourceHash, manifestHash: artifact.manifestHash, versions: { schema: artifact.schemaVersion, runtime: artifact.runtimeVersion, sdk: artifact.sdkVersion, renderer: artifact.rendererVersion }, policyVersion: 'p1' };
    store(boardId).set(`result:${resultId}`, { kind: 'program', artifact, identity, owner: { org: 'ana-ws', email: 'ana@test' }, boardId, cardId,
      authoredBy: { requested: 'model-a', served: 'model-a' }, provenance: { request: 'prompt-ref-0001', context: 'ctx', evidence: [], edited: null } });
    return { artifact, identity, block: { id: cardId, type: 'animation', title: bundle.manifest.title, program: programReference(artifact, resultId), explain: identity } };
  };
  const boardOf = name => f.sqlite.prepare("SELECT id FROM learn_boards WHERE app = ? AND board = 'main'").get(name).id;
  const read = (token, card, as) => f.call('GET', `/api/learn/boards/shared/${token}/cards/${encodeURIComponent(card)}/program`, { as });
  const owner = (resultId, boardId, as) => explainRoute(`/api/learn/explain/jobs/results/${resultId}`, new Request(`https://app.test/api/learn/explain/jobs/results/${resultId}?board=${boardId}`, { headers: as ? { cookie: `small_session=${as}` } : {} }), f.env);
  return { ...f, store, accept, boardOf, read, owner };
}

// Two canvases of ana's: `other` holds a result of its own; `shared` holds two program cards, plus cards whose reference is off.
async function sharedBoard(f, { publicView = true } = {}) {
  const other = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Other canvas' } })).body;
  assert.equal((await f.call('PUT', `/api/learn/boards/${other.name}/main`, { as: 'ana', body: { state: { blocks: [] } } })).status, 200);
  const canvas = (await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Programs' } })).body;
  const first = await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: { blocks: [] } } });
  assert.equal(first.status, 200);
  const boardId = f.boardOf(canvas.name), otherId = f.boardOf(other.name);
  const a = await f.accept(boardId, 'card-a', 'er_a', program('Cooling A', 1));
  const b = await f.accept(boardId, 'card-b', 'er_b', program('Growth B', 2));
  const elsewhere = await f.accept(otherId, 'card-x', 'er_x', program('Elsewhere', 3));
  const unrelated = await f.accept(boardId, 'card-u', 'er_u', program('Unrelated', 4)); // on this board's object, its card not on the board
  const blocks = [
    { id: 'h', type: 'heading', text: 'Programs' }, a.block, b.block,
    { ...elsewhere.block, id: 'card-c' }, // another board's result
    { ...a.block, id: 'card-r', explain: { ...a.identity, cardId: 'card-r', revision: 'xr_other' } }, // a revision the result is not
    { ...a.block, id: 'card-h', program: { ...a.block.program, bundleHash: b.artifact.bundleHash } }, // a bundle the result is not
    { ...unrelated.block, id: 'card-f' }, // a result saved for another card
  ];
  const placed = await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: { blocks }, version: first.body.version } });
  assert.equal(placed.status, 200, placed.text);
  const shared = await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: publicView } });
  assert.equal(shared.status, 200, shared.text);
  return { canvas, boardId, token: shared.body.sharing.view, a, b };
}

const IDENTITY_KEYS = ['resultId', 'cardId', 'revision', 'kind', 'bundleHash', 'sourceHash', 'manifestHash', 'versions'];

test('signed out, a public link plays each program card on it with only its own artifact, identity and execution decision', async t => {
  const f = world(t);
  const { token, a, b, boardId } = await sharedBoard(f);
  const writes = f.statements.length;
  for (const [card, expected] of [['card-a', a], ['card-b', b]]) {
    const got = await f.read(token, card);
    assert.equal(got.status, 200, got.text);
    assert.deepEqual(Object.keys(got.body).sort(), ['artifact', 'execution', 'identity']);
    assert.deepEqual(got.body.artifact, expected.artifact, `${card} gets its own artifact`);
    assert.equal(await verifyHashes(got.body.artifact), true, 'the hashes verify as the player checks them');
    assert.deepEqual(Object.keys(got.body.identity), IDENTITY_KEYS);
    assert.deepEqual([got.body.identity.resultId, got.body.identity.cardId, got.body.identity.bundleHash], [expected.identity.resultId, card, expected.artifact.bundleHash]);
    assert.deepEqual(got.body.execution, { allowed: true });
    for (const secret of ['ana@test', 'ana-ws', boardId, 'ej_er_', 'promptRef', 'prompt-ref-0001', 'authoredBy', 'model-a', 'provenance', 'policyVersion', 'diagnostics', 'history', 'calls', 'usage', 'credits'])
      assert.equal(got.text.includes(secret), false, `${card} answered with ${secret}`);
  }
  assert.notEqual(a.artifact.bundleHash, b.artifact.bundleHash);
  // A signed-in visitor reads the same; reading wrote nothing to any board or table.
  assert.equal((await f.read(token, 'card-a', 'ben')).status, 200);
  assert.deepEqual(f.statements.slice(writes).filter(sql => !/^SELECT/i.test(sql)), [], 'a program read writes nothing');
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/cards/card-a/program`)).status, 405);
});

test('a card not on the board, another board\'s result, a revision, bundle or card the result is not, all refuse naming nothing', async t => {
  const f = world(t);
  const { token } = await sharedBoard(f);
  for (const card of ['card-c', 'card-r', 'card-h', 'card-f', 'card-u', 'card-x', 'h', 'nothing', '%E0%A4%A']) {
    const got = await f.read(token, card);
    assert.deepEqual([got.status, got.body], [404, { error: 'Not available' }], card);
  }
});

test('an invalid, revoked or sign-in-only link refuses the program read as it refuses the board', async t => {
  const f = world(t);
  const { canvas, token } = await sharedBoard(f);
  const unknown = await f.read('never-issued-token-000000000', 'card-a');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.status, (await f.call('GET', '/api/learn/boards/shared/never-issued-token-000000000')).status);
  // Revoked (shared:false): the program read dies with the link.
  assert.equal((await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: false } })).status, 200);
  const revoked = await f.read(token, 'card-a');
  assert.equal(revoked.status, 404);
  assert.deepEqual(revoked.body, (await f.call('GET', `/api/learn/boards/shared/${token}`)).body);
  // A link that is not public: signed out is sent to sign in, exactly as the board read.
  const g = world(t);
  const closed = await sharedBoard(g, { publicView: false });
  const out = await g.read(closed.token, 'card-a');
  assert.deepEqual([out.status, out.body], [401, (await g.call('GET', `/api/learn/boards/shared/${closed.token}`)).body]);
  assert.equal((await g.read(closed.token, 'card-a', 'ben')).status, 200, 'signed in, the link opens');
});

test('the /explain switch and the execution kill switch apply to the link read as to the owner route', async t => {
  const off = world(t, { EXPLAIN_V2_ENABLED: 'false' });
  const shut = await sharedBoard(off);
  assert.deepEqual([(await off.read(shut.token, 'card-a')).status, (await off.read(shut.token, 'card-a')).body], [404, { error: 'Not available' }]);
  const kill = world(t, { EXPLAIN_PROGRAM_EXECUTION_KILL: 'true' });
  const killed = await sharedBoard(kill);
  assert.deepEqual((await kill.read(killed.token, 'card-a')).body.execution, { allowed: false });
  assert.deepEqual((await (await kill.owner('er_a', killed.boardId, 'ana')).json()).execution, { allowed: false }, 'the same decision as the owner route');
});

test('the owner reads a saved card whose job was pruned through the result route; it stays owner-only', async t => {
  const f = world(t);
  const { boardId, token, a } = await sharedBoard(f);
  assert.equal(f.store(boardId).has('job:ej_er_a'), false, 'no job record: pruned');
  const mine = await f.owner('er_a', boardId, 'ana');
  assert.equal(mine.status, 200);
  const body = await mine.json();
  assert.deepEqual(body.artifact, a.artifact);
  assert.equal(await verifyHashes(body.artifact), true);
  assert.equal(body.identity.canvas.boardId, boardId);
  // Holding the link does not open the owner route: a visitor, signed in or out, is refused.
  assert.equal((await f.read(token, 'card-a', 'ben')).status, 200);
  assert.equal((await f.owner('er_a', boardId, 'ben')).status, 404, 'another account');
  assert.equal((await f.owner('er_a', boardId)).status, 401, 'signed out');
});

// ---- The visitor is explicitly NOT the owner: ben (ben@test, org ben-ws) signed in, against ana's board (ana@test, org ana-ws). ----

describe('visitor is not the owner: a signed-in non-owner on ana\'s share link', () => {
  // ana's job record for card-a, as ExplainJobs keeps it while it is not pruned, so the owner-only job route has something to refuse.
  const seedJob = (f, boardId, a) => f.store(boardId).set('job:ej_er_a', { id: 'ej_er_a', version: 1, boardId, cardId: 'card-a', owner: { org: 'ana-ws', email: 'ana@test', userId: null },
    requestClass: 'simple', stage: 'ready', attempt: 1, round: 0, stopReason: 'accepted', failure: null, inFlight: null, calls: [], counts: {}, resultId: 'er_a', result: a.identity,
    timing: newTiming('simple', Date.now()), createdAt: Date.now(), updatedAt: Date.now() });
  const job = (f, boardId, as) => explainRoute('/api/learn/explain/jobs/ej_er_a', new Request(`https://app.test/api/learn/explain/jobs/ej_er_a?board=${boardId}`, { headers: { cookie: `small_session=${as}` } }), f.env);
  const VISITOR = 'ben';

  test('(1) the public link lets the non-owner read the card\'s accepted artifact, with only the allowed fields', async t => {
    const f = world(t);
    const { token, a } = await sharedBoard(f);
    assert.notEqual(VISITOR, 'ana');
    const got = await f.read(token, 'card-a', VISITOR);
    assert.equal(got.status, 200, got.text);
    assert.deepEqual(Object.keys(got.body).sort(), ['artifact', 'execution', 'identity']);
    assert.deepEqual(Object.keys(got.body.identity), IDENTITY_KEYS);
    assert.deepEqual(got.body.artifact, a.artifact);
    assert.equal(await verifyHashes(got.body.artifact), true);
    for (const secret of ['ana@test', 'ana-ws', 'ej_er_', 'jobId', 'promptRef', 'authoredBy', 'provenance', 'diagnostics', 'history', 'calls', 'usage', 'credits', 'owner'])
      assert.equal(got.text.includes(secret), false, `answered with ${secret}`);
  });

  test('(2) the same non-owner is refused by the owner-only job and result routes for that board (the owner is not)', async t => {
    const f = world(t);
    const { boardId, token, a } = await sharedBoard(f);
    seedJob(f, boardId, a);
    assert.equal((await f.read(token, 'card-a', VISITOR)).status, 200, 'the link admits the visitor');
    assert.equal((await job(f, boardId, VISITOR)).status, 404, 'job route: not the owner');
    assert.equal((await f.owner('er_a', boardId, VISITOR)).status, 404, 'result route: not the owner');
    assert.equal((await job(f, boardId, 'ana')).status, 200, 'the owner reads the same job');
    assert.equal((await f.owner('er_a', boardId, 'ana')).status, 200, 'the owner reads the same result');
  });

  test('(3) after the owner revokes the link, the non-owner\'s program read is refused', async t => {
    const f = world(t);
    const { canvas, token } = await sharedBoard(f);
    assert.equal((await f.read(token, 'card-a', VISITOR)).status, 200);
    assert.equal((await f.call('POST', `/api/learn/boards/${canvas.name}/main/share`, { as: 'ana', body: { shared: false } })).status, 200);
    assert.equal((await f.read(token, 'card-a', VISITOR)).status, 404);
    assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: VISITOR })).status, 404, 'as the board read');
  });

  test('(4, 5) a card not on the board, another board\'s card/result pair and an unrelated private result are refused', async t => {
    const f = world(t);
    const { token } = await sharedBoard(f);
    // card-x / er_x is a result on ana's other, unshared canvas; card-c on the shared board points at it; card-u / er_u is on this
    // board's object but its card is not on the board; card-f points at er_u.
    for (const card of ['nothing', 'card-x', 'card-c', 'card-u', 'card-f', 'er_x', 'er_u']) {
      const got = await f.read(token, card, VISITOR);
      assert.deepEqual([got.status, got.body], [404, { error: 'Not available' }], card);
    }
  });

  test('(6) a non-public link: a signed-in non-owner opens the board and reads the program, exactly as the board read admits them', async t => {
    // Documented behaviour (learn-boards.js sharedAccess): a link without public_view opens for any signed-in account and sends a
    // signed-out visitor to sign in (401 { signIn: true }); the program read answers the same way.
    const f = world(t);
    const { token } = await sharedBoard(f, { publicView: false });
    const board = await f.call('GET', `/api/learn/boards/shared/${token}`, { as: VISITOR });
    const read = await f.read(token, 'card-a', VISITOR);
    assert.deepEqual([board.status, read.status], [200, 200]);
    assert.equal(board.body.access.role === 'owner', false, 'the board read does not see the visitor as the owner');
    const out = [await f.call('GET', `/api/learn/boards/shared/${token}`), await f.read(token, 'card-a')];
    assert.deepEqual(out.map(r => [r.status, r.body]), [[401, out[0].body], [401, out[0].body]]);
    assert.equal(out[0].body.signIn, true);
  });
});

// Task 9.4: a result's sources reach its owner's card from the result's private provenance (identity and what was read, never an
// excerpt), so they survive a reload; each revision answers with its own (an applied Edit, or a discarded one keeping the base);
// a share link's read names none of them.
test('the owner\'s result answer lists its sources per revision, with what was read and what to do when one was not; the link names none', async t => {
  const f = world(t);
  const { token, a, boardId } = await sharedBoard(f);
  const COMMIT = 'c'.repeat(40), FILE = `file:fs_${'1'.repeat(24)}@${'e'.repeat(64)}`;
  const record = { version: 1, id: 'ev_0123456789abcdef', kind: 'repository', location: `code:octo/heat@${COMMIT}:sim/cool.py`, revision: COMMIT, contentHash: 'sha256:abcdefgh', lines: { start: 21, end: 40 }, retrievedAt: new Date(0).toISOString(), access: 'workspace', limitations: [] };
  const base = f.store(boardId).get('result:er_a');
  f.store(boardId).set('result:er_a', { ...base, provenance: { ...base.provenance, evidence: [record.id], records: [record], sources: [
    { sourceId: `code:octo/heat@${COMMIT}:sim/cool.py`, kind: 'code', name: 'cool.py', version: COMMIT, range: { path: 'sim/cool.py', start: 25, end: 30 }, status: 'read', evidence: record.id },
    { sourceId: FILE, kind: 'file', name: 'Lab notes.pdf', version: '', range: { page: 2 }, status: 'unavailable' },
    { sourceId: 'card:c1', kind: 'card', name: 'Notes card', version: '', range: null, status: 'listed' }] } });
  // An Edit's candidate of the same card, made from the file alone: its own result and revision.
  const edited = await f.accept(boardId, 'card-a', 'er_a2', program('Cooling A, edited', 1));
  const saved = f.store(boardId).get('result:er_a2');
  f.store(boardId).set('result:er_a2', { ...saved, provenance: { ...saved.provenance, sources: [{ sourceId: FILE, kind: 'file', name: 'Lab notes.pdf', version: '', range: { page: 2 }, status: 'listed' }] } });
  const ownerRead = async resultId => (await f.owner(resultId, boardId, 'ana')).json();
  const before = await ownerRead('er_a');
  assert.deepEqual(before.sources, [
    { kind: 'code', repo: 'octo/heat', revision: COMMIT, path: 'sim/cool.py', lines: [21, 40], note: 'Read for this explanation.' },
    { kind: 'file', title: 'Lab notes.pdf', note: 'Not available to you when this explanation was made. Attach it again, or ask its owner for access.' }]);
  assert.equal(JSON.stringify(before.sources).includes('Notes card'), false, 'only the kinds an explanation reads');
  // Apply: the card now names er_a2 and reads its sources; Discard: it still names er_a and reads the base's, after any reload.
  assert.deepEqual((await ownerRead(edited.identity.resultId)).sources, [{ kind: 'file', title: 'Lab notes.pdf', note: 'Attached, but not read for this explanation.' }]);
  assert.deepEqual((await ownerRead(a.identity.resultId)).sources, before.sources);
  const link = await f.read(token, 'card-a');
  assert.equal(link.status, 200);
  assert.equal('sources' in link.body, false);
  for (const secret of ['octo/heat', 'cool.py', 'Lab notes']) assert.equal(link.text.includes(secret), false, `the link answered with ${secret}`);
});
