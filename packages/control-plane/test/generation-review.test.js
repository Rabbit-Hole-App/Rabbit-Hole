// UI-15.1: the v3 generation-review envelope, the edit route over the one MOT-22 state, reference resolution before dispatch, and the
// executors' view of an approved proposal. Local SQLite LEARN_DB; no model, provider or network call anywhere here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { approvedProposal, consumeProposal, envelopeFor, proposalRecord, proposalState, reviseProposal, signProposal, validateSettings, verifyProposal } from '../src/generation-proposal.js';
import { chatProposalFetch } from '../src/chat-proposal-route.js';
import { CONSUMES, blockedBody, referencesKey, resolveReferences } from '../src/generation-review-refs.js';
import { motionRequestCacheKey, validateMotionRequest } from '../src/motion-provider.js';
import { REFERENCE_KINDS, plainPrompt, removeReference, reviewHash, reviewOf, validateReview } from '../../web/src/generation-review.js';

const ALICE = 'alice@example.test', BOB = 'bob@example.test';
const env = { ANTHROPIC_API_KEY: 'a'.repeat(40), MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48), MOTION_ESTIMATE_USD: '1.00', MOTION_JOB_RESERVATION_USD: '8.96' };
const DEST = { org: 'w', app: 'canvas-1' };
const CAD = { id: 'r1', label: 'CAD · Roller assembly', kind: 'card', sourceId: 'card:cad-1', revision: 'rev-1', range: null };
const IMG = { id: 'r2', label: 'Image · Concept sketch', kind: 'image', sourceId: 'image:img-1', revision: 'rev-7', range: null };
const DESCRIPTION = 'Sunlight warms a body of water. Moist air rises and cools. Droplets fall as rain.';
const base = (over = {}) => ({ command: 'motion', title: 'Water cycle', description: DESCRIPTION, settings: { duration_seconds: 10, audio: false }, source_refs: [], input: { request: '/motion water cycle', concept: 'Weather', ...DEST }, ...over });
const v3 = (over = {}, user = ALICE) => signProposal(env, base(over), user, { envelope: 'v3' });

function stack(t, signed) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8').replace(/\r/g, ''));
  sqlite.exec("INSERT INTO threads (id, org, user, scope_ref, commit_sha) VALUES ('7', 'w', 'alice@example.test', 'canvas-1', 'canvas')");
  sqlite.exec("INSERT INTO messages (id, thread_id, role, content) VALUES (40, '7', 'assistant', 'Here is a proposal.')");
  sqlite.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, meta_json) VALUES (40, '7', 'assistant', ?)").run(JSON.stringify({ version: 1, kind: 'answer', proposal: signed, proposalState: proposalState(signed) }));
  const LEARN_DB = { prepare: sql => { const s = sqlite.prepare(sql); return { bind: (...a) => ({ first: async () => s.get(...a) || null, all: async () => ({ results: s.all(...a) }), run: async () => ({ meta: s.run(...a) }) }) }; } };
  const call = (method, body, { who = ALICE, id = 40, read } = {}) => chatProposalFetch(new Request(`https://dev.test/api/learn/chat/messages/${id}/proposal`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    { ...env, LEARN_DB }, { identity: async () => ({ org: 'w', email: who }), read });
  const stored = () => JSON.parse(sqlite.prepare('SELECT meta_json FROM chat_message_meta WHERE message_id = 40').get().meta_json);
  return { sqlite, LEARN_DB, put: (body, o) => call('PUT', body, o), get: o => call('GET', null, o), stored };
}

test('v3 is signed over the prompt, references, settings, destination and hash; any change is refused; v1 and v2 keep verifying', async () => {
  const p = await signProposal(env, base({ prompt: 'Show {{ref:r1}} turning.', references: [CAD], assumptions: ['Steel'] }), ALICE, { envelope: 'v3' });
  assert.match(p.sig, /^v3\.[0-9a-f]{64}$/);
  assert.deepEqual([p.schema_version, p.version, p.mode, p.original_request, p.destination], [1, 1, 'generate', '/motion water cycle', DEST]);
  assert.equal(p.description, 'Show CAD · Roller assembly turning.', 'the plain text older cards and executors read');
  assert.equal(p.review_hash, await reviewHash(validateReview(reviewOf(p)).value));
  assert.equal(await verifyProposal(env, p, ALICE), null);
  assert.match(await verifyProposal(env, p, BOB), /not made for you/);
  const tampered = {
    prompt: { prompt: 'Show it turning.' }, reference_revision: { references: [{ ...CAD, revision: 'rev-2' }] }, reference_source: { references: [{ ...CAD, sourceId: 'card:cad-2' }] }, reference_label: { references: [{ ...CAD, label: 'CAD · Other' }] },
    reference_added: { references: [CAD, IMG] }, settings: { settings: { duration_seconds: 60, audio: false } }, destination: { destination: { org: 'w', app: 'canvas-2' } }, hash: { review_hash: 'f'.repeat(64) },
    request: { original_request: '/motion something else' }, lists: { assumptions: ['Brass'] }, quote: { quote: { estimate_credits: 1, reserve_credits: null } }, title: { title: 'Other' }, mode: { mode: 'edit' }, version: { version: 9 },
    schema: { schema_version: 2 }, description: { description: 'Show something else entirely.' }, constraints: { visual_constraints: ['No text.'] },
  };
  for (const [name, over] of Object.entries(tampered)) assert.match(await verifyProposal(env, { ...p, ...over }, ALICE), /changed|not a generation proposal|inconsistent/, name);
  assert.match(await verifyProposal(env, { ...p, sig: p.sig.replace('v3.', 'v2.') }, ALICE), /not a generation proposal|changed/, 'a v3 body under a v2 prefix');
  assert.match(await verifyProposal(env, { ...p, sig: p.sig.replace('v3.', '') }, ALICE), /not a generation proposal|changed/, 'or under v1');
  assert.equal(await verifyProposal(env, { ...p, extra: 1 }, ALICE), 'the proposal is not a generation proposal');
  assert.equal(await verifyProposal(env, { ...p, expires_at: 1 }, ALICE) !== null, true);
  // v2 (and v1) still sign and verify as before; v3 fields on a v2 body are refused by shape
  const old = await signProposal(env, base(), ALICE);
  assert.match(old.sig, /^v2\./); assert.equal(await verifyProposal(env, old, ALICE), null);
  assert.equal(await verifyProposal(env, { ...old, prompt: 'x' }, ALICE), 'the proposal is not a generation proposal');
  const v1 = await signProposal({ MOTION_ORCHESTRATOR_TOKEN: env.MOTION_ORCHESTRATOR_TOKEN }, base(), ALICE);
  assert.equal(await verifyProposal(env, v1, ALICE), null);
  assert.equal(envelopeFor(env, DEST), 'v3'); assert.equal(envelopeFor({ MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48) }, DEST), null); assert.equal(envelopeFor(env, {}), null);
});

test('a v3 proposal needs a valid review: prompt tokens and references must agree, and the canvas must be known', async () => {
  await assert.rejects(signProposal(env, base({ prompt: 'Show {{ref:r9}}.', references: [CAD] }), ALICE, { envelope: 'v3' }), /names a reference/);
  await assert.rejects(signProposal(env, base({ prompt: 'Show it.', references: [CAD] }), ALICE, { envelope: 'v3' }), /does not say how it is used/);
  await assert.rejects(signProposal(env, base({ input: { request: '/motion x' } }), ALICE, { envelope: 'v3' }), /needs its canvas/);
  // a model description with braces and backslashes is plain text, never a pill
  const odd = await v3({ description: 'Use {{ref:r1}} and \\ slashes. It turns. Done.' });
  assert.equal(odd.references.length, 0); assert.equal(odd.description, 'Use {{ref:r1}} and \\ slashes. It turns. Done.');
  assert.equal(await verifyProposal(env, odd, ALICE), null);
});

test('the executor reads the approved prompt: Motion\'s brief is the signed description of the prompt, and each revision is its own video', async () => {
  const p = await v3();
  assert.deepEqual(approvedProposal(p), { title: 'Water cycle', duration_seconds: 10, aspect_ratio: '16:9', description: DESCRIPTION });
  const edited = (await reviseProposal(env, p, { description: 'A slow pour of milk into tea, from above.', settings: { duration_seconds: 15, audio: false } }, ALICE, DEST)).proposal;
  assert.deepEqual(approvedProposal(edited), { title: 'Water cycle', duration_seconds: 15, aspect_ratio: '16:9', description: 'A slow pour of milk into tea, from above.' });
  const op = proposal => ({ op: 'motion_request', request: '/motion water cycle', location: { concept: 'Weather' }, proposal });
  assert.equal(validateMotionRequest(op(edited)).proposal, edited, 'a v3 proposal rides motion_request');
  assert.notEqual(await motionRequestCacheKey(validateMotionRequest(op(p))), await motionRequestCacheKey(validateMotionRequest(op(edited))));
  assert.throws(() => validateMotionRequest(op({ ...edited, request: 'x', unknown: 1 })), /not a generation proposal/);
});

test('an edit is the next revision through the same compare-and-swap: saved over the message, reloaded, stale and double saves refused', async t => {
  const p = await v3({ assumptions: [] });
  const s = stack(t, p);
  assert.equal((await s.put({ description: 'A calmer take on the water cycle.' })).status, 400, 'no expected revision');
  const saved = await s.put({ expected_version: 1, description: 'A calmer take on the water cycle.', title: 'Calm water cycle' });
  assert.equal(saved.status, 200);
  const { proposal, references } = await saved.json();
  assert.deepEqual([proposal.version, proposal.title, proposal.description, proposal.prompt, proposal.original_request, references], [2, 'Calm water cycle', 'A calmer take on the water cycle.', 'A calmer take on the water cycle.', '/motion water cycle', []]);
  assert.notEqual(proposal.review_hash, p.review_hash); assert.equal(proposal.proposal_id, p.proposal_id);
  assert.equal(await verifyProposal(env, proposal, ALICE), null);
  assert.deepEqual(s.stored().proposal, proposal, 'a reload restores the saved revision');
  assert.deepEqual(s.stored().proposalState, proposalState(proposal));
  // the same click twice: the second was made from revision 1 and is stale, never a third revision
  const again = await s.put({ expected_version: 1, description: 'A calmer take on the water cycle.', title: 'Calm water cycle' });
  assert.deepEqual([again.status, (await again.json()).code], [409, 'proposal_stale']);
  // a save of the same values is still the next revision, as a settings save always was: the compare-and-swap picks the winner
  const same = await s.put({ expected_version: 2, description: 'A calmer take on the water cycle.', settings: { duration_seconds: 10, audio: false } });
  assert.deepEqual([same.status, (await same.json()).proposal.version], [200, 3]);
  assert.equal(s.stored().proposal.version, 3);
  // GET: the current revision and the used flag
  const got = await (await s.get()).json();
  assert.deepEqual([got.proposal.version, got.used, got.message_id], [3, false, '40']);
  // owner only
  assert.equal((await s.put({ expected_version: 3, title: 'x' }, { who: BOB })).status, 404);
  assert.equal((await s.get({ who: BOB })).status, 404);
  assert.equal((await s.get({ id: 41 })).status, 404);
});

test('an edit is refused in words with paths, and the stored revision is untouched: locked fields, bad settings, prompt and reference mismatches', async t => {
  const p = await v3();
  const s = stack(t, p);
  const refuse = async (body, status, why) => { const r = await s.put({ expected_version: 1, ...body }); assert.equal(r.status, status, JSON.stringify(body)); const out = await r.json(); assert.match(out.error, why); return out; };
  for (const field of ['command', 'original_request', 'destination', 'mode', 'quote', 'proposal_id', 'review_hash', 'sig', 'input']) await refuse({ [field]: 'x' }, 400, /cannot be edited/);
  await refuse({ settings: { duration_seconds: 10, audio: true } }, 400, /narration audio is not available yet/);
  await refuse({ settings: { duration_seconds: 12, audio: false } }, 400, /in steps of 5/);
  await refuse({ settings: { duration_seconds: 10, audio: false, voice: 'x' } }, 400, /settings.voice is not a Motion setting/);
  await refuse({ settings: { duration_seconds: 10, aspect_ratio: '7:3' } }, 400, /aspect_ratio must be 9:16, 1:1, 16:9/); // owner 2026-10-23: the nine Motion ratios are offered
  const unknown = await refuse({ description: 'Show {{ref:r9}}.' }, 400, /names a reference/);
  assert.equal(unknown.errors[0].path, 'prompt');
  await refuse({ description: 'Show {{ref:r1}}.', references: [] }, 400, /names a reference/);
  await refuse({ description: 'Show it.', references: [CAD] }, 400, /does not say how it is used/);
  await refuse({ description: 'bad { brace' }, 400, /not complete/);
  await refuse({ description: '' }, 400, /needs words/);
  await refuse({ visual_constraints: ['No text.'] }, 400, /visual_constraints cannot be edited/);
  assert.equal(s.stored().proposal.version, 1); assert.equal(s.stored().proposal.sig, p.sig);
  // Explain may not take Motion's fields, and CAD-only lists are not Motion's to edit
  const explain = await signProposal(env, { command: 'explain', title: 'Pendulum', description: 'One. Two. Three.', settings: {}, source_refs: [], input: { request: 'Explain a pendulum.', ...DEST, job: 'ej_1', brief_hash: 'h' } }, ALICE, { envelope: 'v3' });
  assert.match((await reviseProposal(env, explain, { settings: { duration_seconds: 10 } }, ALICE, DEST)).error, /not an explanation setting/);
  assert.equal((await reviseProposal(env, explain, { settings: { presentation: 'steps' } }, ALICE, DEST)).proposal.settings.presentation, 'steps');
  assert.equal((await reviseProposal(env, explain, { assumptions: ['Frictionless'] }, ALICE, DEST)).error, undefined, 'Explain edits its assumptions');
  assert.match((await reviseProposal(env, p, { assumptions: ['x'] }, ALICE, DEST)).error, /assumptions cannot be edited/, 'Motion declares none');
});

test('references on a Motion proposal are saved with the draft and named unsupported before dispatch; removing one removes it from the prompt and the inputs', async t => {
  const p = await v3();
  const s = stack(t, p);
  const withRef = await (await s.put({ expected_version: 1, description: 'Show {{ref:r1}} turning, coloured like {{ref:r2}}.', references: [CAD, IMG] })).json();
  assert.deepEqual(withRef.proposal.references, [CAD, IMG]);
  assert.deepEqual(withRef.references.map(r => [r.id, r.state]), [['r1', 'unsupported'], ['r2', 'unsupported']], 'the draft is kept and flagged, never dropped');
  assert.match(withRef.references[0].message, /cannot be used by this generator yet/);
  const current = reviewOf(withRef.proposal);
  const removed = removeReference(current, 'r2');
  const next = await (await s.put({ expected_version: 2, description: removed.prompt, references: removed.references })).json();
  assert.deepEqual(next.proposal.references, [CAD]);
  assert.equal(next.proposal.description, 'Show CAD · Roller assembly turning, coloured like Image · Concept sketch.');
  assert.deepEqual(next.references.map(r => r.id), ['r1']);
  assert.equal(next.proposal.prompt.includes('{{ref:r2}}'), false);
  // a v2 proposal's first edit is its v3 revision (the model description becomes the prompt)
  const old = await signProposal(env, base(), ALICE);
  const s2 = stack(t, old);
  const up = await (await s2.put({ expected_version: 1, settings: { duration_seconds: 20, audio: false } })).json();
  assert.match(up.proposal.sig, /^v3\./); assert.deepEqual([up.proposal.version, up.proposal.prompt, up.proposal.settings.duration_seconds], [2, DESCRIPTION, 20]);
});

test('resolveReferences: files and code are read under the asker\'s access, anything else is unsupported, nothing is dropped', async () => {
  const sha = 'c'.repeat(64);
  const FILE = { id: 'r1', label: 'File · Plan.pdf', kind: 'file', sourceId: `file:fs_${'1'.repeat(24)}@${sha}`, revision: sha, range: null };
  const CODE = { id: 'r2', label: 'Code · main.js', kind: 'code', sourceId: 'code:repo/main.js', revision: 'abc123', range: { path: 'main.js', start: 1, end: 9 } };
  const explain = await signProposal(env, { command: 'explain', title: 'T', description: 'One. Two. Three.', settings: {}, source_refs: [], input: { request: 'x', ...DEST, job: 'ej_1', brief_hash: 'h' },
    prompt: 'Use {{ref:r1}} and {{ref:r2}} and {{ref:r3}}.', references: [FILE, CODE, CAD].map((r, i) => ({ ...r, id: `r${i + 1}` })) }, ALICE, { envelope: 'v3' });
  const seen = [];
  const read = async (req, e, ctx, refs) => { seen.push({ ctx, refs }); return { refs: refs.map(r => ({ sourceId: r.sourceId, kind: r.kind, name: r.name, status: r.kind === 'file' ? 'extracted' : 'unavailable' })), text: 'FILE TEXT' }; };
  const ctx = { req: new Request('https://dev.test/x'), user: { org: 'w', email: ALICE }, app: 'canvas-1' };
  const found = await resolveReferences(env, explain, ctx, { read });
  assert.deepEqual(found.states.map(s => [s.id, s.state]), [['r1', 'ok'], ['r2', 'inaccessible'], ['r3', 'unsupported']]);
  assert.equal(found.text, 'FILE TEXT');
  assert.deepEqual(seen[0].refs.map(r => r.kind), ['file', 'code'], 'only what the executor reads is sent to the reader, under the asker\'s own context');
  assert.deepEqual([seen[0].ctx.user.email, seen[0].ctx.board.app], [ALICE, 'canvas-1']);
  assert.equal(found.blocked.length, 2);
  const body = blockedBody(found.states);
  assert.equal(body.code, 'reference_blocked'); assert.equal(body.references.length, 3, 'every reference is listed, none truncated');
  assert.match(body.error, /not available to you/); assert.match(body.error, /cannot be used by this generator yet/);
  // a source that moved on since it was attached
  const moved = await signProposal(env, { ...base({ command: 'explain', settings: {} }), prompt: 'Use {{ref:r1}}.', references: [{ ...FILE, revision: 'd'.repeat(64) }] }, ALICE, { envelope: 'v3' });
  assert.equal((await resolveReferences(env, moved, ctx, { read })).states[0].state, 'changed');
  // a reader that fails closes, it does not open
  assert.equal((await resolveReferences(env, explain, ctx, { read: async () => { throw new Error('down'); } })).states[0].state, 'inaccessible');
  // Motion reads none, and never calls a reader
  let called = 0;
  const motion = await v3({ prompt: 'Show {{ref:r1}}.', references: [CAD] });
  assert.equal((await resolveReferences(env, motion, ctx, { read: async () => { called++; return { refs: [] }; } })).states[0].state, 'unsupported');
  assert.equal(called, 0);
  assert.deepEqual(await resolveReferences(env, await v3(), ctx, { read }), { states: [], blocked: [], text: '', refs: [] });
  assert.deepEqual(CONSUMES, { motion: [], explain: ['file', 'code'] });
  assert.equal(referencesKey([FILE, CODE]), `r1|${FILE.sourceId}|${sha},r2|code:repo/main.js|abc123`);
});

test('Generate consumes the current revision once: a repeat of the same press is idempotent, another press and a stale revision are refused; v2 proposals still consume', async t => {
  const p1 = await v3();
  const s = stack(t, p1);
  const edited = (await (await s.put({ expected_version: 1, description: 'Pour milk into tea.' })).json()).proposal;
  assert.equal(await consumeProposal(s.LEARN_DB, p1, ALICE, DEST, 'press-1') !== null, true, 'the old revision cannot start');
  assert.equal((await consumeProposal(s.LEARN_DB, p1, ALICE, DEST, 'press-1')).code, 'proposal_stale');
  assert.equal(await consumeProposal(s.LEARN_DB, edited, ALICE, DEST, 'press-1'), null, 'the current revision starts');
  assert.equal(await consumeProposal(s.LEARN_DB, edited, ALICE, DEST, 'press-1'), null, 'the same press again: the same job, idempotent');
  assert.equal((await consumeProposal(s.LEARN_DB, edited, ALICE, DEST, 'press-2')).code, 'proposal_used', 'another press is refused: one start');
  assert.equal((await s.put({ expected_version: 2, title: 'Late edit' })).status, 409, 'nothing is editable once it started');
  assert.equal((await proposalRecord(s.LEARN_DB, ALICE, 'canvas-1', p1.proposal_id)).state.used.key, 'press-1');
  // another canvas is refused before anything is read
  assert.equal((await consumeProposal(s.LEARN_DB, edited, ALICE, { org: 'w', app: 'canvas-2' }, 'press-3')).code, 'proposal_canvas');
  // a v2 proposal made before this release consumes exactly as it did
  const old = await signProposal(env, base(), ALICE);
  const s2 = stack(t, old);
  assert.match(old.sig, /^v2\./);
  assert.equal(await consumeProposal(s2.LEARN_DB, old, ALICE, DEST, 'press-9'), null);
  assert.equal(await consumeProposal(s2.LEARN_DB, old, ALICE, DEST, 'press-9'), null);
});

test('settings validation is the schema\'s: one definition for the proposal tool, the card save and the route', () => {
  assert.deepEqual(validateSettings('motion', { duration_seconds: 60, audio: false }).value, { duration_seconds: 60, aspect_ratio: '16:9', audio: false });
  assert.match(validateSettings('motion', { duration_seconds: 65 }).error, /5 to 60/);
  assert.deepEqual(validateSettings('explain', undefined).value, {});
  assert.equal(validateSettings('cad', { units: 'mm' }).value.units, 'mm');
  assert.ok(REFERENCE_KINDS.length >= 12);
});

test('the reference kinds are the chat ContextRef kinds', () => {
  const source = readFileSync(new URL('../src/chat-modes.js', import.meta.url), 'utf8');
  const kinds = JSON.parse(/const KINDS = (\[[^\]]*\])/.exec(source)[1].replace(/'/g, '"'));
  assert.deepEqual([...REFERENCE_KINDS].sort(), [...kinds].sort());
});

test('the /explain approve route re-reads the references under the learner\'s access: blocked ones answer 409 with every state before the job hears of Generate; a client field cannot stand in for the check', async () => {
  const { explainRoute } = await import('../src/explain-job.js');
  const SHA = 'f'.repeat(64);
  const FILE = { id: 'r1', label: 'File · Notes', kind: 'file', sourceId: `file:fs_${'3'.repeat(24)}@${SHA}`, revision: SHA, range: null };
  const CARD = { id: 'r2', label: 'Card · Sketch', kind: 'card', sourceId: 'card:s1', revision: 'v1', range: null };
  const p = await signProposal(env, { command: 'explain', title: 'T', description: 'x', settings: {}, source_refs: [], input: { request: 'x', ...DEST, job: 'ej_1', brief_hash: 'h' }, prompt: 'Use {{ref:r1}} and {{ref:r2}}.', references: [FILE, CARD] }, ALICE, { envelope: 'v3' });
  const sent = [];
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ id: 'board-1', app: 'canvas-1', board: 'main' }) }) }) };
  const stub = { fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return Response.json({ job: {} }, { status: 202 }); } };
  const routeEnv = { ...env, EXPLAIN_V2_ENABLED: 'true', LEARN_DB: db, EXPLAIN_JOBS: { idFromName: n => n, get: () => stub } };
  const call = (proposal, read, extra = {}) => explainRoute('/api/learn/explain/jobs/ej_1/approve', new Request('https://dev.test/api/learn/explain/jobs/ej_1/approve', { method: 'POST', body: JSON.stringify({ boardId: 'board-1', proposal, ...extra }) }),
    routeEnv, { identity: async () => ({ org: 'w', email: ALICE }), read });
  const read = async (req, e, ctx, refs) => ({ refs: refs.map(r => ({ sourceId: r.sourceId, kind: r.kind, name: r.name, status: 'extracted' })), text: 'NOTES' });
  // a card the Explain reader cannot read is named, with the file that was fine
  const blocked = await call(p, read);
  assert.equal(blocked.status, 409);
  const out = await blocked.json();
  assert.deepEqual([out.code, out.references.map(r => [r.id, r.state])], ['reference_blocked', [['r1', 'ok'], ['r2', 'unsupported']]]);
  assert.equal(sent.length, 0, 'the job never heard of it');
  // a file the learner cannot read
  const refused = await (await call({ ...p, references: [FILE], prompt: 'Use {{ref:r1}}.' }, async (req, e, ctx, refs) => ({ refs: refs.map(r => ({ status: 'unavailable' })), text: '' }))).json();
  assert.deepEqual(refused.references.map(r => r.state), ['inaccessible']);
  // readable references reach the job as the route's own field; a client's approved_refs is discarded
  const ok = await signProposal(env, { command: 'explain', title: 'T', description: 'x', settings: {}, source_refs: [], input: { request: 'x', ...DEST, job: 'ej_1', brief_hash: 'h' }, prompt: 'Use {{ref:r1}}.', references: [FILE] }, ALICE, { envelope: 'v3' });
  assert.equal((await call(ok, read, { approved_refs: { key: 'forged', refs: [], text: 'FORGED' } })).status, 202);
  assert.deepEqual([sent[0].payload.approved_refs.key, sent[0].payload.approved_refs.text], [referencesKey([FILE]), 'NOTES']);
  // a proposal with no references (or a v2 one) adds nothing and discards a forged field too
  const none = await signProposal(env, { command: 'explain', title: 'T', description: 'x', settings: {}, source_refs: [], input: { request: 'x', ...DEST, job: 'ej_1', brief_hash: 'h' } }, ALICE);
  assert.equal((await call(none, read, { approved_refs: { key: '', refs: [], text: 'FORGED' } })).status, 202);
  assert.equal(sent[1].payload.approved_refs, undefined);
});
