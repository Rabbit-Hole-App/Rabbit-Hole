// UI-15 / MOT-20: the shared generation-proposal schema (generation-proposal.js), its signature, the review rules registry, and
// the card's settings route (chat-proposal-route.js). No model call anywhere here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PROPOSAL_TOOL, WIRED, approvedProposal, motionOffered, proposalUsage, reviewRequired, reviseSettings, signProposal, validateProposalInput, verifyProposal } from '../src/generation-proposal.js';
import { chatProposalFetch } from '../src/chat-proposal-route.js';
import { validateMotionRequest } from '../src/motion-provider.js';

const env = { MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48), MOTION_ESTIMATE_USD: '1.00', MOTION_JOB_RESERVATION_USD: '8.96' };
const DESCRIPTION = 'Sunlight warms a body of water, causing evaporation. Moist air rises and cools, forming droplets that gather into clouds. The droplets grow and fall as rain. Water collects again, completing the cycle.';
const water = (over = {}) => ({ command: 'motion', title: 'Water cycle: evaporation to rain', description: DESCRIPTION, settings: { duration_seconds: 10, audio: false }, ...over });
const input = { request: '/motion explain the water cycle', concept: 'Weather' };
const sign = async (over = {}, user = 'alice@example.test') => signProposal(env, { ...validateProposalInput(water(over)), input }, user);

test('the schema: title, a description of 3 to 10 plain sentences, Motion settings (duration 5-30, audio off), known refs only', () => {
  assert.deepEqual(validateProposalInput(water()), { command: 'motion', title: 'Water cycle: evaporation to rain', description: DESCRIPTION, settings: { duration_seconds: 10, audio: false }, source_refs: [] });
  const refs = [{ sourceId: 'card:shape:a', kind: 'card', name: 'Clouds', text: 'not stored' }];
  assert.deepEqual(validateProposalInput(water({ source_ref_ids: ['card:shape:a'] }), refs).source_refs, [{ kind: 'card', sourceId: 'card:shape:a', name: 'Clouds' }]);
  const refused = [
    [water({ description: 'Water evaporates. It rains.' }), /3 to 10 complete sentences \(it has 2\)/],
    [water({ description: Array(11).fill('Water moves.').join(' ') }), /3 to 10 complete sentences \(it has 11\)/],
    [water({ description: `${DESCRIPTION} And then` }), /complete sentences/],
    [water({ description: '- Evaporation.\n- Clouds.\n- Rain.' }), /no lists or labels/],
    [water({ description: `Will show: ${DESCRIPTION}` }), /no lists or labels/],
    [water({ settings: { duration_seconds: 10, audio: true } }), /narration audio is not available yet/],
    [water({ settings: { duration_seconds: 4, audio: false } }), /5 to 30/],
    [water({ settings: { duration_seconds: 31 } }), /5 to 30/],
    [water({ settings: { duration_seconds: 12.5 } }), /whole number/],
    [water({ settings: { duration_seconds: 10, voice: 'x' } }), /settings.voice is not a Motion setting/],
    [water({ command: 'explain' }), /command must be one of motion/],
    [water({ title: '' }), /title/],
    [water({ source_ref_ids: ['card:shape:nope'] }), /card:shape:nope is not an attached material/],
    [{ ...water(), extra: 1 }, /extra is not a field/],
  ];
  for (const [proposal, why] of refused) assert.match(validateProposalInput(proposal).error, why, JSON.stringify(proposal).slice(0, 80));
  assert.deepEqual(PROPOSAL_TOOL.input_schema.properties.command.enum, ['motion']);
});

// The registry is CR-1's capability declaration (inline-ai-route.js CHAT_CAPABILITIES flow): Motion alone is proposed.
test('the review rules: Motion proposes; search, /dive, notebook, whiteboard and everything else keep their direct action', () => {
  assert.deepEqual(WIRED, ['motion']);
  assert.deepEqual(['motion', 'search', 'dive', 'notebook', 'whiteboard', 'explain', 'cad', 'youtube', 'video'].map(reviewRequired), [true, false, false, false, false, false, false, false, false]);
});

test('signed for one learner: a forged, edited, other-learner or expired proposal is refused; usage is the server\'s, in credits', async () => {
  const p = await sign();
  assert.match(p.proposal_id, /^gp-[0-9a-f]{16}$/);
  assert.deepEqual([p.version, p.settings, p.input, p.usage], [1, { duration_seconds: 10, audio: false }, input, { estimate_credits: 100, reserve_credits: 896 }]);
  assert.equal(await verifyProposal(env, p, 'alice@example.test'), null);
  assert.equal(await verifyProposal(env, p, 'ALICE@example.test'), null, 'the email is compared without case');
  assert.match(await verifyProposal(env, p, 'bob@example.test'), /not made for you/);
  assert.match(await verifyProposal(env, { ...p, title: 'Something else' }, 'alice@example.test'), /not made for you, or it was changed/);
  assert.match(await verifyProposal(env, { ...p, settings: { duration_seconds: 30, audio: false } }, 'alice@example.test'), /changed/);
  assert.match(await verifyProposal(env, { ...p, input: { ...input, request: '/motion something else' } }, 'alice@example.test'), /changed/);
  assert.match(await verifyProposal(env, { ...p, sig: 'f'.repeat(64) }, 'alice@example.test'), /changed/);
  assert.match(await verifyProposal(env, p, 'alice@example.test', p.expires_at + 1), /expired/);
  assert.match(await verifyProposal(env, p, null), /Sign in/);
  assert.match(await verifyProposal({ ...env, MOTION_ORCHESTRATOR_TOKEN: 'z'.repeat(48) }, p, 'alice@example.test'), /changed/, 'another environment\'s secret');
  assert.deepEqual(proposalUsage({}, 'motion'), { estimate_credits: null, reserve_credits: null }, 'no settings: no figure of its own');
  assert.deepEqual(approvedProposal(p), { title: p.title, duration_seconds: 10, description: DESCRIPTION });
});

test('a settings change is the next version of the same proposal, re-signed; audio on and out-of-range durations are refused', async () => {
  const p = await sign();
  const { proposal } = await reviseSettings(env, p, { duration_seconds: 20, audio: false }, 'alice@example.test');
  assert.deepEqual([proposal.proposal_id, proposal.version, proposal.settings.duration_seconds, proposal.title, proposal.input], [p.proposal_id, 2, 20, p.title, p.input]);
  assert.equal(await verifyProposal(env, proposal, 'alice@example.test'), null);
  assert.match((await reviseSettings(env, p, { duration_seconds: 20, audio: true }, 'alice@example.test')).error, /narration audio/);
  assert.match((await reviseSettings(env, p, { duration_seconds: 40 }, 'alice@example.test')).error, /5 to 30/);
  assert.match((await reviseSettings(env, p, { duration_seconds: 20 }, 'bob@example.test')).error, /not made for you/);
});

test('motion_request carries the approved proposal only for its own request, concept and card', async () => {
  const p = await sign();
  const op = { op: 'motion_request', request: input.request, location: { concept: 'Weather' }, proposal: p };
  assert.equal(validateMotionRequest(op).proposal, p);
  assert.throws(() => validateMotionRequest({ ...op, request: '/motion explain something else' }), /not the one the approved proposal is for/);
  assert.throws(() => validateMotionRequest({ ...op, location: { concept: 'Oceans' } }), /not the one the approved proposal is for/);
  assert.throws(() => validateMotionRequest({ ...op, context: { selection: { cardId: 'k1', kind: 'explanation', text: 'Clouds form.' } } }), /not the one the approved proposal is for/);
  assert.throws(() => validateMotionRequest({ ...op, proposal: { ...p, proposal_id: 'nope' } }), /not a generation proposal/);
});

test('offered only where a video can start: an orchestrator is configured and generation is not paused', () => {
  assert.equal(motionOffered(env), true);
  assert.equal(motionOffered({ ...env, MOTION_GENERATION_PAUSED: '1' }), false);
  assert.equal(motionOffered({ ...env, MOTION_ORCHESTRATOR_URL: undefined }), false);
});

test('PUT /api/learn/chat/messages/:id/proposal: the owner\'s stored proposal becomes its next version; anyone else gets a 404', async t => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8').replace(/\r/g, ''));
  sqlite.exec("INSERT INTO threads (id, org, user, scope_ref, commit_sha) VALUES ('7', 'w', 'alice@example.test', 'canvas-1', 'canvas')");
  sqlite.exec("INSERT INTO messages (id, thread_id, role, content) VALUES (40, '7', 'assistant', 'Here is a proposal.')");
  const p = await sign();
  sqlite.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, meta_json) VALUES (40, '7', 'assistant', ?)").run(JSON.stringify({ version: 1, kind: 'answer', proposal: p }));
  const LEARN_DB = { prepare: sql => { const s = sqlite.prepare(sql); return { bind: (...a) => ({ first: async () => s.get(...a) || null, all: async () => ({ results: s.all(...a) }), run: async () => ({ meta: s.run(...a) }) }) }; } };
  const put = (body, who = 'alice@example.test', id = 40) => chatProposalFetch(new Request(`https://dev.test/api/learn/chat/messages/${id}/proposal`, { method: 'PUT', body: JSON.stringify(body) }), { ...env, LEARN_DB }, { identity: async () => ({ org: 'w', email: who }) });
  const ok = await put({ settings: { duration_seconds: 25, audio: false } });
  assert.equal(ok.status, 200);
  const { proposal } = await ok.json();
  assert.deepEqual([proposal.version, proposal.settings.duration_seconds], [2, 25]);
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT meta_json FROM chat_message_meta WHERE message_id = 40').get().meta_json).proposal, proposal, 'saved over the message, so a reload restores it');
  assert.equal((await put({ settings: { duration_seconds: 25, audio: true } })).status, 400);
  assert.equal((await put({ settings: { duration_seconds: 25 } }, 'bob@example.test')).status, 404);
  assert.equal((await put({ settings: { duration_seconds: 25 } }, 'alice@example.test', 41)).status, 404);
  assert.equal(await chatProposalFetch(new Request('https://dev.test/api/learn/chat/messages/40/syllabus', { method: 'PUT' }), env), null, 'another path is not this route');
});
