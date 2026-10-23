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

test('the schema: title, a description of 3 to 10 plain sentences, Motion settings (duration 5-60 in fives, aspect ratio, audio off), known refs only', () => {
  assert.deepEqual(validateProposalInput(water()), { command: 'motion', title: 'Water cycle: evaporation to rain', description: DESCRIPTION, settings: { duration_seconds: 10, aspect_ratio: '16:9', audio: false }, source_refs: [] });
  const refs = [{ sourceId: 'card:shape:a', kind: 'card', name: 'Clouds', text: 'not stored' }];
  assert.deepEqual(validateProposalInput(water({ source_ref_ids: ['card:shape:a'] }), refs).source_refs, [{ kind: 'card', sourceId: 'card:shape:a', name: 'Clouds' }]);
  const refused = [
    [water({ description: 'Water evaporates. It rains.' }), /3 to 10 complete sentences \(it has 2\)/],
    [water({ description: Array(11).fill('Water moves.').join(' ') }), /3 to 10 complete sentences \(it has 11\)/],
    [water({ description: `${DESCRIPTION} And then` }), /complete sentences/],
    [water({ description: '- Evaporation.\n- Clouds.\n- Rain.' }), /no lists or labels/],
    [water({ description: `Will show: ${DESCRIPTION}` }), /no lists or labels/],
    [water({ settings: { duration_seconds: 10, audio: true } }), /narration audio is not available yet/],
    [water({ settings: { duration_seconds: 4, audio: false } }), /5 to 60/],
    [water({ settings: { duration_seconds: 31 } }), /5 to 60 in steps of 5/],
    [water({ settings: { duration_seconds: 65 } }), /5 to 60/],
    [water({ settings: { duration_seconds: 12.5 } }), /whole number/],
    [water({ settings: { duration_seconds: 10, aspect_ratio: '7:3' } }), /settings.aspect_ratio must be 9:16, 1:1, 16:9/],
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
  assert.deepEqual([p.version, p.settings, p.input, p.usage], [1, { duration_seconds: 10, aspect_ratio: '16:9', audio: false }, { ...input, binding: { inputs: { duration_seconds: 10, aspect_ratio: '16:9' }, price_version: 'flat', estimate_credits: 100, policy_version: null, renderer_config: null } }, { estimate_credits: 100, reserve_credits: 896, inputs: { duration_seconds: 10, aspect_ratio: '16:9' }, price_version: 'flat' }]);
  assert.equal(await verifyProposal(env, p, 'alice@example.test'), null);
  assert.equal(await verifyProposal(env, p, 'ALICE@example.test'), null, 'the email is compared without case');
  assert.match(await verifyProposal(env, p, 'bob@example.test'), /not made for you/);
  assert.match(await verifyProposal(env, { ...p, title: 'Something else' }, 'alice@example.test'), /not made for you, or it was changed/);
  assert.match(await verifyProposal(env, { ...p, settings: { duration_seconds: 30, aspect_ratio: '16:9', audio: false } }, 'alice@example.test'), /changed/);
  assert.match(await verifyProposal(env, { ...p, input: { ...input, request: '/motion something else' } }, 'alice@example.test'), /changed/);
  assert.match(await verifyProposal(env, { ...p, sig: 'f'.repeat(64) }, 'alice@example.test'), /changed/);
  assert.match(await verifyProposal(env, p, 'alice@example.test', p.expires_at + 1), /expired/);
  assert.match(await verifyProposal(env, p, null), /Sign in/);
  assert.match(await verifyProposal({ ...env, MOTION_ORCHESTRATOR_TOKEN: 'z'.repeat(48) }, p, 'alice@example.test'), /changed/, 'another environment\'s secret');
  assert.deepEqual(proposalUsage({}, 'motion'), { estimate_credits: null, reserve_credits: null }, 'no settings: no figure of its own');
  assert.deepEqual(approvedProposal(p), { title: p.title, duration_seconds: 10, aspect_ratio: '16:9', description: DESCRIPTION });
  // A proposal signed before the ratio existed has none: the orchestrator is told the original 16:9.
  assert.equal(approvedProposal({ ...p, settings: { duration_seconds: 10, audio: false } }).aspect_ratio, '16:9');
});

test('a settings change is the next version of the same proposal, re-signed; audio on and out-of-range durations are refused', async () => {
  const p = await sign();
  const { proposal } = await reviseSettings(env, p, { duration_seconds: 20, audio: false }, 'alice@example.test');
  assert.deepEqual([proposal.proposal_id, proposal.version, proposal.settings.duration_seconds, proposal.title, proposal.input], [p.proposal_id, 2, 20, p.title, { ...p.input, binding: { ...p.input.binding, inputs: { duration_seconds: 20, aspect_ratio: '16:9' } } }]);
  assert.equal(await verifyProposal(env, proposal, 'alice@example.test'), null);
  assert.match((await reviseSettings(env, p, { duration_seconds: 20, audio: true }, 'alice@example.test')).error, /narration audio/);
  assert.match((await reviseSettings(env, p, { duration_seconds: 65 }, 'alice@example.test')).error, /5 to 60/);
  assert.equal((await reviseSettings(env, p, { duration_seconds: 60 }, 'alice@example.test')).proposal.settings.duration_seconds, 60, 'the whole 5 to 60 set is offered');
  const longer = await reviseSettings(env, p, { duration_seconds: 60, aspect_ratio: '9:16' }, 'alice@example.test');
  assert.deepEqual(longer.proposal.settings, { duration_seconds: 60, aspect_ratio: '9:16', audio: false }, 'the new keys are written, audio stays off');
  assert.deepEqual(approvedProposal(longer.proposal), { title: p.title, duration_seconds: 60, aspect_ratio: '9:16', description: DESCRIPTION }, 'what the orchestrator is told equals the saved selection');
  assert.match((await reviseSettings(env, p, { duration_seconds: 20, aspect_ratio: '2:1' }, 'alice@example.test')).error, /aspect_ratio/);
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
  assert.equal((await put({ settings: { duration_seconds: 25, audio: false } })).status, 400, 'no expected revision');
  const ok = await put({ settings: { duration_seconds: 25, audio: false }, expected_version: 1 });
  assert.equal(ok.status, 200);
  const { proposal } = await ok.json();
  assert.deepEqual([proposal.version, proposal.settings.duration_seconds], [2, 25]);
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT meta_json FROM chat_message_meta WHERE message_id = 40').get().meta_json).proposal, proposal, 'saved over the message, so a reload restores it');
  assert.equal((await put({ settings: { duration_seconds: 25, audio: true }, expected_version: 2 })).status, 400);
  const stale = await put({ settings: { duration_seconds: 5, audio: false }, expected_version: 1 });
  assert.deepEqual([stale.status, (await stale.json()).current], [409, proposal], 'a save from an old revision: 409 with the current one');
  assert.equal((await put({ settings: { duration_seconds: 25 }, expected_version: 2 }, 'bob@example.test')).status, 404);
  assert.equal((await put({ settings: { duration_seconds: 25 }, expected_version: 2 }, 'alice@example.test', 41)).status, 404);
  assert.equal(await chatProposalFetch(new Request('https://dev.test/api/learn/chat/messages/40/syllabus', { method: 'PUT' }), env), null, 'another path is not this route');
});

test('Motion settings (one schema): the twelve durations and the nine ratios; an old proposal without a ratio is 16:9; the declared ratios are the renderer\'s', async () => {
  const { validateSettings } = await import('../../web/src/generation-confirmation-schema.js');
  const { MOTION_RATIOS, MOTION_STAGE_SIZES } = await import('../src/motion-settings.js');
  const { chatCapability } = await import('../../web/src/inline-ai-route.js');
  const { ASPECT_RATIO_IDS } = await import('../../web/src/aspect-ratios.js');
  const seconds = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
  for (let s = -1; s <= 70; s++) assert.equal(!!validateSettings('motion', { duration_seconds: s }).value, seconds.includes(s), `${s}`);
  assert.deepEqual(validateSettings('motion', { duration_seconds: 35 }).value, { duration_seconds: 35, aspect_ratio: '16:9', audio: false });
  for (const ratio of MOTION_RATIOS) assert.equal(validateSettings('motion', { duration_seconds: 5, aspect_ratio: ratio }).value.aspect_ratio, ratio);
  for (const bad of ['16:10', '', 'x', 16, '9:16 ', '21:9']) assert.match(validateSettings('motion', { duration_seconds: 5, aspect_ratio: bad }).error, /aspect_ratio/, String(bad));
  // The schema declaration (the card's fields), the renderer's stage sizes and the shared table list the same Motion ratios.
  const declared = chatCapability('motion').settings.find(f => f.key === 'aspect_ratio');
  assert.deepEqual(declared.options.map(o => o.value).sort(), [...MOTION_RATIOS].sort());
  assert.deepEqual(declared.options.map(o => o.value), ASPECT_RATIO_IDS, 'Motion lists all nine of the owner table, in its order');
  assert.equal(declared.default, '16:9');
  // Every size has the ratio's exact proportions and whole, even preview dimensions at the 0.45 preview scale.
  for (const [ratio, { width, height }] of Object.entries(MOTION_STAGE_SIZES)) {
    const [w, h] = ratio.split(':').map(Number);
    assert.equal(width * h, height * w, ratio);
    for (const n of [width, height]) assert.ok(Number.isInteger(n * 0.45) && (n * 0.45) % 2 === 0, `${ratio} preview ${n}`);
  }
});

// Owner decisions 2026-10-23: every option stays visible; whether a combination may be GENERATED is the server's readiness policy,
// an allowlist of measured combinations (ratio, duration bucket, complexity classes) with a policy version, for one renderer configuration.
const policy = (entries, over = {}) => JSON.stringify({ version: 'p1', renderer_config: 'r1', entries, ...over });
const ALL9 = ['9:16', '1:1', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4'];

test('readiness: default none ready; an allowlist of measured combinations with a policy version; malformed or mismatched config fails closed', async () => {
  const { motionReadiness, readyPolicy, motionQuoteInputs, MOTION_NOT_READY } = await import('../src/motion-settings.js');
  const { proposalView } = await import('../../web/src/generation-confirmation-schema.js');
  const at = (e, seconds, aspect_ratio) => motionReadiness(e, motionQuoteInputs({ duration_seconds: seconds, aspect_ratio }));
  assert.deepEqual([at({}, 10, '16:9').ready, at({ MOTION_READY_POLICY: '' }, 10, '16:9').ready], [false, false], 'default: nothing validated, nothing ready');
  const one = { ...env, MOTION_RENDERER_CONFIG: 'r1', MOTION_READY_POLICY: policy([{ aspect_ratio: '16:9', min_seconds: 5, max_seconds: 30, complexity: ['simple', 'standard'] }, { aspect_ratio: ['1:1', '9:16'], min_seconds: 5, max_seconds: 10, complexity: ['simple'] }]) };
  assert.deepEqual([at(one, 5, '16:9').ready, at(one, 30, '16:9').ready, at(one, 35, '16:9').ready, at(one, 10, '9:16').ready, at(one, 15, '9:16').ready, at(one, 10, '4:3').ready], [true, true, false, true, false, false]);
  assert.deepEqual(at(one, 10, '16:9'), { ready: true, complexity: ['simple', 'standard'], policy_version: 'p1' });
  assert.deepEqual(at(one, 10, '9:16').complexity, ['simple'], 'each combination covers only the classes measured for it');
  assert.equal(at(one, 10).ready, true, 'a missing ratio is 16:9');
  const no = at(one, 60, '9:16');
  assert.deepEqual([no.code, no.message, no.policy_version], [MOTION_NOT_READY, 'A 60 second 9:16 video is not ready to generate yet. Pick other settings or try again later.', 'p1']);
  assert.doesNotMatch(no.message, /\$|\.\.\.|…|succeed|guarantee/i, 'credits only, no ellipsis, no promise');
  const entry = { aspect_ratio: '16:9', min_seconds: 5, max_seconds: 30, complexity: ['simple'] };
  for (const bad of ['not json', '{}', '[]', policy([entry], { version: '' }), policy([entry], { renderer_config: undefined }), policy([{ ...entry, aspect_ratio: '2:1' }]), policy([{ ...entry, min_seconds: 30, max_seconds: 5 }]), policy([{ ...entry, complexity: [] }]), policy([{ ...entry, complexity: ['huge'] }]), policy([{ ...entry, min_seconds: '5' }]), policy([null])]) {
    assert.deepEqual(readyPolicy({ MOTION_RENDERER_CONFIG: 'r1', MOTION_READY_POLICY: bad }).entries, [], String(bad).slice(0, 60));
  }
  assert.deepEqual(readyPolicy({ MOTION_RENDERER_CONFIG: 'r2', MOTION_READY_POLICY: policy([entry]) }).entries, [], 'measured on another renderer configuration: nothing is ready');
  assert.deepEqual(readyPolicy({ MOTION_READY_POLICY: policy([entry]) }).entries, [], 'no live configuration id: nothing is ready');
  // The signed proposal carries the answer for its own settings; the view blocks Generate and says why, options untouched.
  const p = await sign({ settings: { duration_seconds: 60, aspect_ratio: '9:16', audio: false } });
  assert.deepEqual(p.readiness, { ready: false, code: MOTION_NOT_READY, message: no.message, policy_version: null });
  assert.equal(await verifyProposal(env, p, 'alice@example.test'), null, 'not ready is not a forgery: the card is still a valid, signed proposal');
  const view = proposalView(p);
  assert.deepEqual(view.validation_errors.filter(e => e.path === 'readiness').map(e => e.message), [p.readiness.message]);
  assert.equal(view.allowed_actions.includes('generate'), false);
  assert.ok(view.allowed_actions.includes('edit'), 'the person can still change the settings');
  const ready = await signProposal(one, { ...validateProposalInput(water({ settings: { duration_seconds: 10, audio: false } })), input }, 'alice@example.test');
  assert.equal(ready.readiness.ready, true);
  assert.equal(proposalView(ready).allowed_actions.includes('generate'), true);
});

test('the signed binding: inputs, quote, price version, policy version and renderer configuration are part of the signature; a stale one returns the UPDATED quote', async () => {
  const { motionQuoteInputs, motionQuote, motionBinding, motionGenerationCheck, MOTION_QUOTE_STALE, MOTION_RENDERER_CHANGED } = await import('../src/motion-settings.js');
  assert.deepEqual(motionQuoteInputs({ duration_seconds: 20, audio: false }), { duration_seconds: 20, aspect_ratio: '16:9' });
  const live = { ...env, MOTION_RENDERER_CONFIG: 'r1', MOTION_READY_POLICY: policy([{ aspect_ratio: ALL9, min_seconds: 5, max_seconds: 60, complexity: ['simple'] }]) };
  const p = await signProposal(live, { ...validateProposalInput(water()), input }, 'alice@example.test');
  assert.deepEqual(p.input.binding, { inputs: { duration_seconds: 10, aspect_ratio: '16:9' }, price_version: 'flat', estimate_credits: 100, policy_version: 'p1', renderer_config: 'r1' });
  assert.deepEqual(p.usage.inputs, p.input.binding.inputs);
  assert.match(await verifyProposal(live, { ...p, input: { ...p.input, binding: { ...p.input.binding, estimate_credits: 1 } } }, 'alice@example.test'), /changed/, 'the quote cannot be edited');
  const next = (await reviseSettings(live, p, { duration_seconds: 45, aspect_ratio: '3:4', audio: false }, 'alice@example.test')).proposal;
  assert.deepEqual([next.input.binding.inputs, next.sig === p.sig], [{ duration_seconds: 45, aspect_ratio: '3:4' }, false], 'a settings change signs a new binding');
  assert.equal(motionGenerationCheck(live, { request: '/motion x', proposal: next }), null);
  // Measured buckets, versioned: the same settings under a new table are a stale quote, answered with the updated one.
  const table = (version, usd) => JSON.stringify({ version, buckets: [{ aspect_ratio: ALL9, min_seconds: 5, max_seconds: 30, estimate_usd: usd }, { aspect_ratio: ALL9, min_seconds: 35, max_seconds: 60, estimate_usd: usd * 2 }] });
  assert.deepEqual([motionQuote({ MOTION_PRICE_TABLE: table('b1', 1.5) }, { duration_seconds: 10, aspect_ratio: '16:9' }), motionQuote({ MOTION_PRICE_TABLE: table('b1', 1.5) }, { duration_seconds: 45, aspect_ratio: '16:9' })],
    [{ price_version: 'b1', estimate_credits: 150 }, { price_version: 'b1', estimate_credits: 300 }]);
  assert.deepEqual(motionQuote({ MOTION_PRICE_TABLE: 'nonsense', MOTION_ESTIMATE_USD: '1.00' }, { duration_seconds: 10 }), { price_version: 'flat', estimate_credits: 100 }, 'no valid table: today\'s flat price, unchanged');
  const priced = { ...live, MOTION_PRICE_TABLE: table('b1', 1.5) };
  const q = await signProposal(priced, { ...validateProposalInput(water()), input }, 'alice@example.test');
  assert.deepEqual([q.usage.estimate_credits, q.usage.price_version, q.input.binding.price_version], [150, 'b1', 'b1']);
  assert.equal(motionGenerationCheck(priced, { request: '/motion x', proposal: q }), null);
  const stale = motionGenerationCheck({ ...priced, MOTION_PRICE_TABLE: table('b2', 2) }, { request: '/motion x', proposal: q });
  assert.deepEqual([stale.code, stale.quote, stale.error], [MOTION_QUOTE_STALE, { price_version: 'b2', estimate_credits: 200, inputs: { duration_seconds: 10, aspect_ratio: '16:9' } }, 'The price changed to About 200 credits. Review it and press Generate again to confirm.']);
  assert.equal(motionGenerationCheck({ ...priced, MOTION_PRICE_TABLE: table('b1b', 1.5) }, { request: '/motion x', proposal: q }).code, MOTION_QUOTE_STALE, 'a new price version is stale even at the same amount');
  assert.equal(motionGenerationCheck({ ...priced, MOTION_RENDERER_CONFIG: 'r2' }, { request: '/motion x', proposal: q }).code, MOTION_RENDERER_CHANGED, 'a renderer configuration other than the card\'s refuses before any spend');
  assert.deepEqual(motionBinding(env, { duration_seconds: 5 }).renderer_config, null);
});

test('generate check: the compatibility path for a saved off-step duration is validated and still subject to readiness; nothing is clamped', async () => {
  const { motionGenerationCheck, legacyMotionSettings, MOTION_NOT_READY, MOTION_SETTINGS_INVALID } = await import('../src/motion-settings.js');
  const open = { ...env, MOTION_RENDERER_CONFIG: 'r1', MOTION_READY_POLICY: policy([{ aspect_ratio: '16:9', min_seconds: 5, max_seconds: 30, complexity: ['simple'] }]) };
  const saved = settings => ({ request: '/motion x', proposal: { settings } });
  assert.equal(motionGenerationCheck(open, saved({ duration_seconds: 12, audio: false })), null, 'a 12 second proposal made before the 5-second steps: executable, as 12 seconds');
  assert.equal(motionGenerationCheck(env, saved({ duration_seconds: 12, audio: false })).code, MOTION_NOT_READY, 'not ready is refused whatever the duration');
  assert.equal(motionGenerationCheck(open, saved({ duration_seconds: 40, audio: false })).code, MOTION_NOT_READY, 'outside the validated bucket: refused, not clamped to 30');
  assert.equal(motionGenerationCheck(open, saved({ duration_seconds: 60, audio: false })).code, MOTION_NOT_READY, '60 is refused, never clamped');
  for (const bad of [{ duration_seconds: 3, audio: false }, { duration_seconds: 12.5 }, { duration_seconds: 70 }, { duration_seconds: 12, aspect_ratio: '7:3' }, { duration_seconds: 12, audio: true }, { duration_seconds: 12, voice: 'x' }, {}, null]) {
    assert.equal(motionGenerationCheck(open, saved(bad)).code, MOTION_SETTINGS_INVALID, JSON.stringify(bad));
    assert.equal(legacyMotionSettings(bad), false);
  }
  assert.equal(motionGenerationCheck(open, { request: '/motion explain gravity in 20 seconds' }), null, 'no proposal: the seconds its words ask for');
  assert.equal(motionGenerationCheck(open, { request: '/motion explain gravity in 50 seconds' }).code, MOTION_NOT_READY);
  assert.equal(motionGenerationCheck(env, { request: '/motion explain gravity' }).code, MOTION_NOT_READY, 'the default length is not exempt');
});

test('execution terms: the orchestrator is told the live renderer configuration and the complexity classes the evidence covers', async () => {
  const { motionExecutionTerms } = await import('../src/motion-settings.js');
  const live = { MOTION_RENDERER_CONFIG: 'r1', MOTION_READY_POLICY: policy([{ aspect_ratio: '16:9', min_seconds: 5, max_seconds: 30, complexity: ['simple', 'standard'] }]) };
  assert.deepEqual(motionExecutionTerms(live, { duration_seconds: 10 }), { renderer_config: 'r1', allowed_complexity: ['simple', 'standard'] });
  assert.deepEqual(motionExecutionTerms(live, { duration_seconds: 60 }), { renderer_config: 'r1' }, 'no cover: the start is refused before this is sent');
  assert.deepEqual(motionExecutionTerms({}, { duration_seconds: 10 }), {});
  const p = await sign();
  assert.deepEqual(approvedProposal(p, motionExecutionTerms(live, p.settings)), { title: p.title, duration_seconds: 10, aspect_ratio: '16:9', description: DESCRIPTION, renderer_config: 'r1', allowed_complexity: ['simple', 'standard'] });
});
