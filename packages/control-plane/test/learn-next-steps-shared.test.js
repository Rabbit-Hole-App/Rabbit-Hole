// Professor Next Steps on shared canvases (contract §1.4, §1.5, §2.1, §2.3): privacy tests 1-12 and the owner's cache
// rules (owner corrections 1, 9, 10 and the twelfth message; rulings F1, F2, F7, F13, F14), through the routes the app worker serves
// (shared-canvas-fixture.js, node:sqlite), the planner on its keyless fixture (JOURNEY_MODEL_STUB=fixtures) and
// caches.default as a Map. No model call for hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD, scriptModel } from './shared-canvas-fixture.js';
import { shareKey } from '../src/learn-shared-ask.js';
import { sha256Hex } from '../src/learn-grade-jev.js';
import { sharedInput } from '../src/learn-next-steps-routes.js';
import { fixtureModel } from '../src/learn-journey-fixtures.js';
import { NEXT_STEPS_LIMITS, NEXT_STEPS_SYSTEM } from '../src/agents/learn-next-steps.js';
import { TUTOR_DOMAINS } from '../../web/src/learn-tutor-domains.js';
import { nextStepsInput } from '../../web/src/learn-next-steps.js';
import { emptyStore } from '../../web/src/learn-tutor-evidence.js';
import { cardBlock } from '../../web/src/nanogpt/board.js';
import { NANOGPT, cardModule } from '../../web/src/learn-tutor-claims.js';
import { resolveTarget } from '../../web/src/learn-target.js';

// A board with one authored card of the public registered course, so registry claims are visible content.
const CARD = NANOGPT.cards.find(id => NANOGPT.targetClaims({ card_id: id }).length);
const REG_BLOCK = { ...cardBlock(cardModule(CARD)), id: 'reg1' };
const REG = NANOGPT.targetClaims(resolveTarget(REG_BLOCK));
const STATE = { ...BOARD, blocks: [...BOARD.blocks, REG_BLOCK] };
function edge(t) {
  const store = new Map(), had = 'caches' in globalThis, original = globalThis.caches;
  globalThis.caches = { default: { match: async key => store.get(key)?.clone(), put: async (key, response) => { store.set(key, response); } } };
  t.after(() => { if (had) globalThis.caches = original; else delete globalThis.caches; });
  return store;
}
const world = (t, vars = {}) => ({ ...setup(t, { vars: { SMALL_ENV: 'test', JOURNEY_MODEL_STUB: 'fixtures', ...vars } }), store: edge(t) });
const hooks = (f, token, as, body = { origin: null }) => f.call('POST', `/api/learn/boards/shared/${token}/next-steps`, { as, body });
const start = (f, token, as, origin, step) => f.call('POST', `/api/learn/boards/shared/${token}/rabbit-hole`, { as, body: { origin, ...(step ? { selected_next_step: step } : {}) } });
const anaBoards = f => JSON.stringify(f.sqlite.prepare("SELECT * FROM learn_boards WHERE owner_email = 'ana@test' ORDER BY id").all());
const usage = f => f.sqlite.prepare('SELECT category, viewer_email FROM shared_ask_events ORDER BY id').all().map(r => ({ ...r }));
// The planner's real request path (no fixture switch), answered by the keyless planner behind fetch: every input the model reads.
// The logged real path prints a learn_model line per call; silenced as in learn-avatar.test.js (Task 14 A-M5).
function plannerInputs(t) {
  t.mock.method(console, 'log', () => {});
  const original = globalThis.fetch, inputs = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).host, 'api.anthropic.com', `unexpected fetch ${url}`);
    const body = JSON.parse(options.body), text = body.messages[0].content;
    inputs.push(JSON.parse(text.slice(text.indexOf('input = ') + 'input = '.length)));
    return fixtureModel(null, body);
  };
  t.after(() => { globalThis.fetch = original; });
  return inputs;
}

test('privacy 1-2: 3 hooks from the visible lesson blocks; chat cards and a goal never reach the input', async t => {
  assert.ok(REG.length > 0, 'the board shows a registered claim');
  const f = world(t);
  const { token } = await f.shareProject({ state: STATE });
  const got = await hooks(f, token, null);
  assert.equal(got.status, 200, got.text);
  assert.equal(got.body.options.length, 3);
  const fingerprint = await sha256Hex('nanoGPT attention');
  for (const o of got.body.options) assert.deepEqual([o.selected_next_step.scope, o.selected_next_step.source], ['shared', { share_version: 1, origin_block_id: ':root', title_fingerprint: fingerprint }]);
  assert.equal(got.text.includes('nanoGPT attention'), false, 'the step carries a one-way fingerprint of the title, never the title');
  assert.equal(JSON.stringify(got.body.options).includes('reason_internal'), false);
  const { input } = sharedInput(STATE, { origin: { root: true }, key: 'k', version: 1 });
  assert.equal('goal' in input, false, 'no goal is inferred on a shared canvas');
  assert.deepEqual(input.canvas.blocks.map(b => b.id), STATE.blocks.map(b => b.id));
  assert.equal(JSON.stringify(input).includes('Why exp?'), false, 'chat cards are not content for hooks');
  assert.deepEqual(Object.keys(input.scope.claims), REG.slice(0, 12));
  assert.deepEqual(input.canvas.blocks.find(b => b.id === 'reg1').claim_ids, REG.slice(0, 3));
});

test('privacy 1-2 (F14): the model reads the board title and selected card as data, described in the prompt; never the version, the sharer, chats or a goal', async t => {
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { token } = await f.shareProject({ state: STATE });
  assert.equal((await hooks(f, token, null, { origin: { block_id: 'b1' } })).status, 200);
  assert.equal(inputs.length, 1);
  const [input] = inputs;
  assert.deepEqual([input.mode, input.canvas.title, input.canvas.selected], ['shared', 'nanoGPT attention', { id: 'b1', title: 'Why scale by sqrt(d)?' }]);
  assert.equal('version' in input.canvas, false, 'the version stays in the step source and telemetry');
  assert.equal('goal' in input, false);
  const state = NEXT_STEPS_SYSTEM.slice(NEXT_STEPS_SYSTEM.indexOf('<current_state>'), NEXT_STEPS_SYSTEM.indexOf('</current_state>'));
  assert.match(state, /canvas\.title[^\n]*never a goal/);
  assert.match(state, /canvas\.selected[^\n]*\{ id, title \}[^\n]*null/);
  assert.equal(/ana@test|Why exp\?|max trick|Half asked|Positive weights/.test(JSON.stringify(input)), false, 'no sharer identity and no chat card');
  // The root names no card.
  assert.equal((await hooks(f, token, null)).status, 200);
  assert.equal(inputs[1].canvas.selected, null);
});

test('sharer evidence never influences viewer hooks; signed-in viewer_states reach the input filtered to the server scope (privacy 3-4)', async t => {
  const f = world(t);
  const stamped = { ...STATE, blocks: [...STATE.blocks, { id: 'js1', type: 'explanation', title: 'Stamped', body: 'b', journey: { journey_id: 'lj_secret', section_id: 'sec-secret', step_id: 'js1', claims: [REG[0]] } }] };
  const { token } = await f.shareProject({ state: stamped });
  const got = await hooks(f, token, 'ben', { origin: null, viewer_states: { [REG[0]]: 'uncertain', 'made.up/claim': 'understood', [REG[1] ?? 'none/x']: 'not-a-state' } });
  assert.equal(got.status, 200, got.text);
  assert.deepEqual(got.body.telemetry.summary.evidence_summary.uncertain, [REG[0]]);
  assert.equal(/made\.up\/claim|not-a-state|lj_secret|sec-secret|ana@test/.test(got.text), false);
  assert.deepEqual(sharedInput(stamped, { origin: { root: true }, key: 'k', version: 1 }).input.canvas.blocks.find(b => b.id === 'js1').claim_ids, [], 'a journey stamp is never read');
  // Without the viewer's own states, nothing of the sharer's moves a claim off not_yet_observed, and the route reads no
  // journey, evidence or Tutor row of anyone's.
  const plain = await hooks(f, token, null);
  assert.deepEqual(Object.values(plain.body.telemetry.summary.evidence_summary).flat(), plain.body.telemetry.summary.evidence_summary.not_yet_observed);
  assert.equal(f.statements.some(sql => /journey|evidence|tutor/i.test(sql)), false, f.statements.filter(sql => /journey|evidence|tutor/i.test(sql)).join(' | '));
});

test('anonymous content-only hooks remain safe: the cache holds no viewer evidence (privacy 5, owner extra 12g)', async t => {
  const f = world(t);
  const { token } = await f.shareProject({ state: STATE });
  const a = await hooks(f, token, null), b = await hooks(f, token, null);
  assert.equal(a.body.set_id, b.body.set_id, 'served from the cache');
  assert.deepEqual([a.body.telemetry.cached, b.body.telemetry.cached, b.body.telemetry.calls, b.body.telemetry.cost_usd], [false, true, 0, 0], 'a hit reports no usage (F13)');
  const size = f.store.size;
  const personal = await hooks(f, token, 'ben', { origin: null, viewer_states: { [REG[0]]: 'misconception' } });
  assert.notEqual(personal.body.set_id, a.body.set_id);
  assert.equal(f.store.size, size, 'a personalized reply is never cached');
  const key = await shareKey(token);
  for (const [cacheKey, response] of f.store) {
    assert.ok(cacheKey.includes(key) && !cacheKey.includes(token), 'the one-way share key, never the raw token');
    const cached = await response.clone().json();
    assert.deepEqual(Object.values(cached.telemetry.summary.evidence_summary).flat(), cached.telemetry.summary.evidence_summary.not_yet_observed, 'content only');
    assert.equal(JSON.stringify(cached).includes('viewer_states'), false);
  }
  const anonymousEvidence = await hooks(f, token, null, { origin: null, viewer_states: { [REG[0]]: 'misconception' } });
  assert.equal(anonymousEvidence.body.set_id, a.body.set_id, 'an anonymous viewer cannot send evidence');
  const noEvidence = await hooks(f, token, 'ben', { origin: null, viewer_states: { [REG[0]]: 'not_yet_observed' } });
  assert.equal(noEvidence.body.set_id, a.body.set_id, 'not_yet_observed is no evidence: the content-only set');
});

test('two signed-in viewers never share personalized HookSets; each is admitted under shared_canvas_hooks for that viewer (owner extra 12h)', async t => {
  const f = world(t);
  const { token } = await f.shareProject({ state: STATE });
  const ben = await hooks(f, token, 'ben', { origin: null, viewer_states: { [REG[0]]: 'uncertain' } });
  const cara = await hooks(f, token, 'cara', { origin: null });
  const anonymous = await hooks(f, token, null);
  assert.equal(cara.body.set_id, anonymous.body.set_id, 'without evidence a signed-in viewer gets the content-only set');
  assert.notEqual(cara.body.set_id, ben.body.set_id);
  const caraOwn = await hooks(f, token, 'cara', { origin: null, viewer_states: { [REG[0]]: 'uncertain' } });
  assert.notEqual(caraOwn.body.set_id, ben.body.set_id, 'the same states from another viewer never reuse a reply');
  // F7: the content-only miss is admitted under the share's caps with no viewer (viewer_email ''), never billed to cara.
  assert.deepEqual(usage(f), [{ category: 'shared_canvas_hooks', viewer_email: 'ben@test' }, { category: 'shared_canvas_hooks', viewer_email: '' }, { category: 'shared_canvas_hooks', viewer_email: 'cara@test' }]);
});

test('hook to private Rabbit Hole never writes the source board: the step creates the hole with its goal, a second start resumes it, origin kept, no fork (privacy 6-10)', async t => {
  const f = world(t);
  const { token } = await f.shareProject({ state: STATE });
  const before = anaBoards(f);
  const root = (await hooks(f, token, 'ben')).body.options[0].selected_next_step;
  const made = await start(f, token, 'ben', null, root);
  assert.equal(made.status, 201, made.text);
  assert.deepEqual(made.body.next_step, root);
  const recordOf = name => JSON.parse(f.sqlite.prepare('SELECT dive_json FROM canvas_dives WHERE child = ?').get(name).dive_json);
  assert.deepEqual([recordOf(made.body.name).learning_goal, recordOf(made.body.name).origin.origin_block_id, recordOf(made.body.name).origin.parent.app], [root.learning_goal, ':root', `share:${await shareKey(token)}`]);
  const again = await start(f, token, 'ben', null, root);
  assert.deepEqual([again.status, again.body.existing, again.body.next_step], [200, true, root]);
  const card = (await hooks(f, token, 'ben', { origin: { block_id: 'b1' } })).body.options[1].selected_next_step;
  assert.equal(card.source.origin_block_id, 'b1');
  const fromCard = await start(f, token, 'ben', { block_id: 'b1' }, card);
  assert.equal(fromCard.status, 201, fromCard.text);
  assert.equal(recordOf(fromCard.body.name).origin.origin_block_id, 'b1');
  // Only the checked fields come back: anything else in the body is dropped.
  const extra = await start(f, token, 'ben', { block_id: 'b1' }, { ...card, reason_internal: 'x', viewer: 'ana@test' });
  assert.deepEqual(extra.body.next_step, card);
  // Without a step, the start is as it was: no next_step, no learning_goal.
  const plain = await start(f, token, 'cara', null);
  assert.equal(plain.status, 201);
  assert.equal('next_step' in plain.body, false);
  assert.equal('learning_goal' in recordOf(plain.body.name), false);
  assert.equal(anaBoards(f), before, 'the source learn_boards row is byte-identical');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM canvas_forks').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM learn_boards WHERE forked_from IS NOT NULL').get().n, 0);
});

test('a stale share_version answers 409 stale_hook; a mismatched origin or a malformed step 400; nothing is written for the viewer', async t => {
  const f = world(t);
  const { canvas, token } = await f.shareProject({ state: STATE });
  const step = (await hooks(f, token, 'ben')).body.options[0].selected_next_step;
  assert.equal((await start(f, token, 'ben', { block_id: 'b1' }, step)).status, 400, 'a root step on a card start');
  assert.equal((await start(f, token, 'ben', null, { ...step, basis: 'x'.repeat(401) })).status, 400, 'a basis over the limit');
  assert.equal((await start(f, token, 'ben', null, { ...step, claim_ids: ['made.up/claim'] })).status, 400, 'an id outside the board scope');
  assert.equal((await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: STATE, version: 1 } })).status, 200);
  const stale = await start(f, token, 'ben', null, step);
  assert.deepEqual([stale.status, stale.body.error], [409, 'stale_hook']);
  // The registered card leaves the board: its claims are no longer allowed, and the old step is still stale, not malformed.
  assert.equal((await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: BOARD, version: 2 } })).status, 200);
  assert.ok(step.claim_ids.length, 'the step names a registered claim');
  assert.deepEqual([(await start(f, token, 'ben', null, step)).status], [409]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM canvases WHERE owner_email = 'ben@test'").get().n, 0);
});

test('shared hooks are capped under shared_canvas_hooks and never spend the shared-ask budget', async t => {
  const f = world(t, { SHARED_ASK_VIEWER_HOUR: '1' });
  t.mock.method(console, 'log', () => {}); // the shared ask logs its learn_model line (Task 14 A-M5)
  scriptModel(t);
  const { token } = await f.shareProject({ state: STATE });
  const personal = state => hooks(f, token, 'ben', { origin: null, viewer_states: { [REG[0]]: state } });
  assert.equal((await personal('uncertain')).status, 200);
  const second = await personal('misconception');
  assert.deepEqual([second.status, second.body.limited], [429, true]);
  assert.equal((await f.ask(token, 'ben', { message: 'Why scale by sqrt(d)?' })).status, 200, 'the shared-ask budget is untouched');
});

test('F7: anonymous planner calls (cache misses only) are capped per share link; a cache hit is never counted', async t => {
  const f = world(t, { SHARED_ASK_SHARE_HOUR: '1' });
  const { token } = await f.shareProject({ state: STATE });
  assert.equal((await hooks(f, token, null)).status, 200);
  assert.equal((await hooks(f, token, null)).status, 200, 'a hit');
  const miss = await hooks(f, token, null, { origin: { block_id: 'b1' } });
  assert.deepEqual([miss.status, miss.body.limited], [429, true]);
  assert.deepEqual(usage(f), [{ category: 'shared_canvas_hooks', viewer_email: '' }]);
});

test('the route checks its body: unknown card 404, oversized body 400; a private link needs sign-in', async t => {
  const f = world(t);
  const { token } = await f.shareProject({ state: STATE });
  assert.equal((await hooks(f, token, null, { origin: { block_id: 'gone' } })).status, 404);
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/next-steps`, { raw: JSON.stringify({ origin: null, pad: 'x'.repeat(17000) }) })).status, 400);
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}/next-steps`)).status, 405);
  const closed = await f.shareProject({ state: STATE, publicView: false });
  assert.equal((await hooks(f, closed.token, null)).status, 401);
  assert.equal((await hooks(f, closed.token, 'ben')).status, 200);
});

// ---- Fix round 1 and the owner's twelfth message: the input cap, the trimmed scope at start, chat-card origins, renames. ----
// A real-size shared board: 20 authored cards of the public course with long titles (about 10.7k characters untrimmed).
const LONG = i => `Card ${i}: a long descriptive title about how this part of the lesson works, step by step`;
const BIG = { blocks: Array.from({ length: 20 }, (_, i) => ({ ...cardBlock(cardModule(NANOGPT.cards[i % NANOGPT.cards.length])), id: `card-${String(i).padStart(2, '0')}-0123456789abcdef0123`, title: LONG(i) })) };
const claimsOf = block => NANOGPT.targetClaims(resolveTarget(block));
const BIG_CLAIMS = [...new Set(BIG.blocks.flatMap(claimsOf))];
const size = input => JSON.stringify(input).length;

// A public course registered only for one test (removed after it): count claims on every authored card (every block with
// everywhere), each claim at its caps, ids of idLength characters; lead registers it first, so its claims lead the scope.
function syntheticCourse(t, { count = 12, idLength = 64, everywhere = false, lead = false } = {}) {
  const ids = Array.from({ length: count }, (_, i) => `synthetic-claim-${i}-`.padEnd(idLength, 'q'));
  const text = n => 'w'.repeat(n);
  const claims = Object.fromEntries(ids.map(id => [id, { concept: 'synthetic', statement: text(240), ideas: [text(120), text(120), text(120), text(120)], drawn: text(160), misconceptions: [], prerequisites: [] }]));
  TUTOR_DOMAINS[lead ? 'unshift' : 'push']({ id: 'synthetic-public', match: {}, domain: { claims, concepts: { synthetic: { label: 'Synthetic', names: [] } }, targetClaims: target => (everywhere || target.card_id ? ids : []) }, capabilities: { tutor: true, suppliedCourse: true } });
  t.after(() => { TUTOR_DOMAINS.splice(TUTOR_DOMAINS.findIndex(entry => entry.id === 'synthetic-public'), 1); });
  return ids;
}

test('real-size about 10-11k shared boards are trimmed to at most 9000 with Task 7 order: every registry claim Task 7 keeps survives, and so do the selected card and its claims', async t => {
  const options = { origin: { root: true }, key: 'f'.repeat(64), version: 1, title: 'nanoGPT attention' };
  const { trim } = sharedInput(BIG, options);
  assert.ok(trim.before.chars > 10000 && trim.before.chars < 11500, `untrimmed ${trim.before.chars} characters`);
  assert.ok(trim.after.chars <= NEXT_STEPS_LIMITS.input_chars && trim.after.block_count < trim.before.block_count, 'over the cap: cards were trimmed');
  // What Task 7 keeps of the same board (the owned input on the course domain).
  const owned = nextStepsInput({ context: { domain: NANOGPT, source: 'registry' }, store: emptyStore(), blocks: BIG.blocks, title: 'nanoGPT attention', basis: 'b' });
  const ownedClaims = Object.keys(owned.input.scope.claims);
  assert.deepEqual(new Set(ownedClaims), new Set(BIG_CLAIMS), 'Task 7 keeps every registry claim of this board');
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { token } = await f.shareProject({ state: BIG });
  const selected = BIG.blocks.find((b, i) => claimsOf(b).length > 1 && i < 6);
  for (const origin of [{ block_id: selected.id }, null]) assert.equal((await hooks(f, token, null, { origin })).status, 200);
  const [card, root] = inputs;
  for (const input of [card, root]) {
    assert.ok(size(input) <= NEXT_STEPS_LIMITS.input_chars, `${size(input)} characters`);
    for (const id of ownedClaims) assert.ok(Object.hasOwn(input.scope.claims, id), `the claim ${id} Task 7 keeps survives`);
    for (const b of input.canvas.blocks) assert.ok(b.claim_ids.every(id => Object.hasOwn(input.scope.claims, id)), 'block ids name only the kept scope');
  }
  assert.deepEqual(card.canvas.selected, { id: selected.id, title: LONG(BIG.blocks.indexOf(selected)).slice(0, NEXT_STEPS_LIMITS.block_title) });
  assert.deepEqual(card.canvas.blocks.find(b => b.id === selected.id)?.claim_ids, claimsOf(selected).slice(0, 3), 'the selected card survives the card trim');
  assert.equal(Object.keys(root.scope.claims)[0], BIG_CLAIMS[0], 'the root keeps its highest-priority claim first');
});

test('a selected card older than the 20 newest blocks still appears in canvas.blocks, and the blocks stay at 20', () => {
  const board = { blocks: [{ id: 'old', type: 'explanation', title: 'The oldest card' }, ...Array.from({ length: 24 }, (_, i) => ({ id: `n${i}`, type: 'explanation', title: `Card ${i}` }))] };
  const { input } = sharedInput(board, { origin: { id: 'old' }, key: 'k', version: 1, title: 't' });
  assert.equal(input.canvas.blocks.length, NEXT_STEPS_LIMITS.blocks);
  assert.deepEqual([input.canvas.blocks[0].id, input.canvas.selected], ['old', { id: 'old', title: 'The oldest card' }]);
  assert.deepEqual(input.canvas.blocks.slice(1).map(b => b.id), board.blocks.slice(-(NEXT_STEPS_LIMITS.blocks - 1)).map(b => b.id), 'then the newest');
});

test('an essential-heavy input is trimmed to at most 9000 and sent, never above it: the selected card claims go last and at least one is kept', async t => {
  const ids = syntheticCourse(t);
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { token } = await f.shareProject({ state: STATE });
  assert.equal((await hooks(f, token, 'ben', { origin: { block_id: 'reg1' } })).status, 200);
  const [input] = inputs;
  assert.ok(size(input) <= NEXT_STEPS_LIMITS.input_chars, `${size(input)} characters`);
  const kept = Object.keys(input.scope.claims);
  assert.ok(kept.length >= 1 && kept.length < REG.length + ids.length, `kept ${kept.length} claims`);
  assert.equal(kept[0], [...REG, ...ids][0], 'the first essential claim stays');
  assert.deepEqual([input.canvas.blocks, input.canvas.selected.id], [[], 'reg1'], 'Task 7 order: every card leaves before an essential claim; the selection is still named');
});

test('an input over 12000 after trimming is refused with no planner call (an essential claim whose id alone exceeds every cap)', async t => {
  syntheticCourse(t, { count: 1, idLength: NEXT_STEPS_LIMITS.input_refuse + 1000, everywhere: true });
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { token } = await f.shareProject({ state: STATE });
  for (const [as, origin] of [['ben', { block_id: 'b1' }], [null, null]]) {
    const refused = await hooks(f, token, as, { origin });
    assert.deepEqual([refused.status, refused.body.error], [400, 'input_too_large'], refused.text);
  }
  assert.deepEqual([inputs.length, usage(f), f.store.size], [0, [], 0], 'no planner call, no usage, nothing cached');
});

test('returned-hook validation uses the same trimmed scope as generation: a hook naming a claim trimmed away is refused at start; a hook on a kept claim is accepted', async t => {
  const ids = syntheticCourse(t);
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { token } = await f.shareProject({ state: STATE });
  const kept = (await hooks(f, token, 'ben')).body.options[0].selected_next_step;
  const scope = Object.keys(inputs[0].scope.claims), trimmed = ids.filter(id => !scope.includes(id));
  assert.ok(trimmed.length > 0 && kept.claim_ids.every(id => scope.includes(id)), 'the cap trimmed a claim; the hook names kept ones');
  const away = await start(f, token, 'ben', null, { ...kept, concept_ids: [], claim_ids: [trimmed[0]] });
  assert.deepEqual([away.status, away.body.error], [400, 'selected_next_step ids']);
  const made = await start(f, token, 'ben', null, kept);
  assert.deepEqual([made.status, made.body.next_step], [201, kept]);
});

test('a chat card origin reads as the root: one content-only set and cache entry, and its step starts the hole from that card', async t => {
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { token } = await f.shareProject({ state: STATE });
  const root = await hooks(f, token, null);
  const chat = await hooks(f, token, 'ben', { origin: { block_id: 'q1' } });
  assert.deepEqual([chat.status, chat.body.set_id, inputs.length, f.store.size], [200, root.body.set_id, 1, 1], 'the root set, from the cache');
  const step = chat.body.options[0].selected_next_step;
  assert.equal(step.source.origin_block_id, ':root');
  const made = await start(f, token, 'ben', { block_id: 'q1' }, step);
  assert.equal(made.status, 201, made.text);
  assert.equal(JSON.parse(f.sqlite.prepare('SELECT dive_json FROM canvas_dives WHERE child = ?').get(made.body.name).dive_json).origin.origin_block_id, 'q1');
});

test('a board rename invalidates the stale cache: hooks built on the old title are never served under the new one', async t => {
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { canvas, token } = await f.shareProject({ state: STATE });
  const before = await hooks(f, token, null);
  f.sqlite.prepare('UPDATE canvases SET title = ? WHERE name = ?').run('Renamed board', canvas.name);
  const after = await hooks(f, token, null), again = await hooks(f, token, null);
  assert.notEqual(after.body.set_id, before.body.set_id);
  assert.equal(again.body.set_id, after.body.set_id, 'the new title has its own cache entry');
  assert.deepEqual(inputs.map(input => input.canvas.title), ['nanoGPT attention', 'Renamed board']);
  assert.equal(f.store.size, 2);
});

test('no raw share token appears in any cache key: root, card and chat origins, anonymous and signed in, and a personalized reply adds none', async t => {
  const f = world(t);
  const { token } = await f.shareProject({ state: STATE });
  for (const origin of [null, { block_id: 'b1' }, { block_id: 'q1' }]) {
    assert.equal((await hooks(f, token, null, { origin })).status, 200);
    assert.equal((await hooks(f, token, 'cara', { origin })).status, 200);
  }
  const entries = f.store.size;
  assert.equal((await hooks(f, token, 'ben', { origin: null, viewer_states: { [REG[0]]: 'uncertain' } })).status, 200);
  assert.equal(f.store.size, entries);
  assert.equal(entries, 2, 'root and b1; the chat card reads as the root');
  const key = await shareKey(token);
  for (const cacheKey of f.store.keys()) assert.ok(cacheKey.includes(key) && !cacheKey.includes(token) && !cacheKey.includes(encodeURIComponent(token)), cacheKey);
});

// Fix round 1b (coordinator ruling): the board title is part of what a hook was built on, as the version is.
test('a rename between generation and click answers 409 stale_hook, never 400; the same title passes', async t => {
  const f = world(t);
  const { canvas, token } = await f.shareProject({ state: STATE });
  const step = (await hooks(f, token, 'ben')).body.options[0].selected_next_step;
  assert.equal(step.source.title_fingerprint, await sha256Hex('nanoGPT attention'));
  f.sqlite.prepare('UPDATE canvases SET title = ? WHERE name = ?').run('Renamed board', canvas.name);
  const renamed = await start(f, token, 'ben', null, step);
  assert.deepEqual([renamed.status, renamed.body.error], [409, 'stale_hook']);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM canvases WHERE owner_email = 'ben@test'").get().n, 0, 'nothing written');
  assert.equal((await start(f, token, 'ben', null, { ...step, source: { ...step.source, title_fingerprint: 'f'.repeat(64) } })).status, 409, 'any other fingerprint is stale too');
  f.sqlite.prepare('UPDATE canvases SET title = ? WHERE name = ?').run('nanoGPT attention', canvas.name);
  const made = await start(f, token, 'ben', null, step);
  assert.deepEqual([made.status, made.body.next_step], [201, step], 'the same title passes');
});

// Fix round 2: a shared step must carry the fingerprint (no opt-out), and Start Rabbit Hole reads the board name once.
test('a shared step without title_fingerprint answers 409 stale_hook; a start with a step reads the board name once', async t => {
  const f = world(t);
  const { token } = await f.shareProject({ state: STATE });
  const step = (await hooks(f, token, 'ben')).body.options[0].selected_next_step;
  const { title_fingerprint: _, ...bare } = step.source;
  const missing = await start(f, token, 'ben', null, { ...step, source: bare });
  assert.deepEqual([missing.status, missing.body.error], [409, 'stale_hook']);
  const before = f.statements.length;
  assert.equal((await start(f, token, 'ben', null, step)).status, 201);
  assert.equal(f.statements.slice(before).filter(sql => sql === 'SELECT title FROM canvases WHERE org = ? AND name = ?').length, 1);
});

// ---- Merge fix (Tasks 10 and 11): the selected card in the shared trim, essential claims without one, trim telemetry. ----
// Item b: the selected card ranks above every other card. Here every card names the same essential claims and the selected
// card sits in the oldest place, so ranking it with them made it the first card dropped.
test('the selected card is never the first card trimmed: it stays in canvas.blocks while other cards go', t => {
  syntheticCourse(t, { count: 3, everywhere: true });
  const board = { blocks: [{ id: 'old', type: 'explanation', title: 'The oldest card' }, ...Array.from({ length: 24 }, (_, i) => ({ id: `n${String(i).padStart(2, '0')}-0123456789abcdef0123`, type: 'explanation', title: LONG(i) }))] };
  const { input, trim } = sharedInput(board, { origin: { id: 'old' }, key: 'k', version: 1, title: 't' });
  assert.ok(trim.after.block_count < trim.before.block_count && trim.after.block_count > NEXT_STEPS_LIMITS.block_floor, `cards were trimmed: ${JSON.stringify(trim)}`);
  assert.ok(size(input) <= NEXT_STEPS_LIMITS.input_chars);
  assert.deepEqual([input.canvas.blocks[0].id, input.canvas.selected.id], ['old', 'old'], 'the selected card stays');
});

// Item c: a selected card with no claims keeps the first scope claim essential, as the owned input does (its first claim),
// so it is never refused while one claim fits. The leading claim fits alone but not with a card naming it.
test('a selected card with no claims is never refused while one claim fits: the first scope claim is essential', t => {
  const [id] = syntheticCourse(t, { count: 1, idLength: 4500, lead: true });
  const board = { blocks: [{ id: 'note', type: 'explanation', title: 'A note' }, REG_BLOCK] };
  const got = sharedInput(board, { origin: { id: 'note' }, key: 'k', version: 1, title: 't' });
  assert.equal(got.problem, undefined, 'never input_too_large while one claim fits');
  assert.deepEqual([Object.keys(got.input.scope.claims), got.input.canvas.blocks.map(b => b.id), got.input.canvas.selected.id], [[id], ['note'], 'note']);
  assert.ok(size(got.input) <= NEXT_STEPS_LIMITS.input_chars);
});

// Item d (owner sixth message 4): the route returns the trim counts in its reply telemetry, beside the set (the hook hands
// them to next_steps_computed as runtime.planner_input); never inside the model input or a step.
test('the shared reply telemetry carries the server trim counts; the model input and the steps never do', async t => {
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { token } = await f.shareProject({ state: BIG });
  const got = await hooks(f, token, null);
  assert.equal(got.status, 200, got.text);
  const { trim } = sharedInput(BIG, { origin: { root: true }, key: 'f'.repeat(64), version: 1, title: 'nanoGPT attention' });
  const counts = c => ({ block_count: c.block_count, claim_count: c.claim_count });
  const sent = got.body.telemetry.trim;
  assert.deepEqual([counts(sent.before), counts(sent.after), sent.trimmed], [counts(trim.before), counts(trim.after), { block_count: trim.before.block_count - trim.after.block_count, claim_count: trim.before.claim_count - trim.after.claim_count }]);
  assert.ok(sent.trimmed.block_count > 0, 'cards were trimmed');
  assert.equal(JSON.stringify(inputs[0]).includes('block_count'), false, 'never inside the model input');
  assert.equal(JSON.stringify(got.body.options).includes('block_count'), false, 'never in a step');
});

// Task 14 final review A-I1: on a SUBSCRIPTION_ONLY worker the personal subscription serves its owner alone, on the shared
// hooks route exactly as on the shared ask (learn-shared-ask.js askShared): anyone else gets that ask's 403 and body before the
// cache, the limiter and the planner, so no bridge call and no usage row; the owner is served through the bridge. A normal
// worker is unchanged.
function bridge(t) {
  const original = globalThis.fetch, hits = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).host, 'bridge.test', `unexpected fetch ${url}`);
    hits.push(new URL(url).host);
    const reply = await (await fixtureModel(null, JSON.parse(options.body))).json();
    return Response.json({ ...reply, billing: 'claude-subscription' });
  };
  t.after(() => { globalThis.fetch = original; });
  return hits;
}
test('A-I1: a SUBSCRIPTION_ONLY worker refuses shared hooks to an anonymous viewer and a non-owner as the shared ask does, with no bridge call; the owner is served', async t => {
  t.mock.method(console, 'log', () => {});
  const f = world(t, { JOURNEY_MODEL_STUB: '', SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_OWNER_EMAIL: 'ana@test', SUBSCRIPTION_BRIDGE_URL: 'https://bridge.test', SUBSCRIPTION_BRIDGE_TOKEN: 'bridge-token' });
  const hits = bridge(t);
  const { token } = await f.shareProject({ state: STATE });
  const asked = await f.ask(token, 'ben', { message: 'Why scale by sqrt(d)?' });
  assert.equal(asked.status, 403, 'the shared ask refuses a non-owner');
  for (const as of [null, 'ben']) {
    const got = await hooks(f, token, as);
    assert.deepEqual([got.status, got.body], [asked.status, asked.body], `${as ?? 'anonymous'}: the shared ask's status and body`);
  }
  assert.deepEqual([hits, usage(f)], [[], []], 'no bridge call and no usage row before the owner asks');
  const owner = await hooks(f, token, 'ana');
  assert.equal(owner.status, 200, owner.text);
  assert.equal(owner.body.options.length, 3);
  assert.ok(hits.length >= 1, 'the owner is served through the bridge');
  const after = hits.length;
  assert.equal((await hooks(f, token, null)).status, 403, 'refused before the cache: the owner set is never served to anyone else');
  assert.deepEqual([hits.length, usage(f).length], [after, 1]);
  const normal = world(t);
  const open = await normal.shareProject({ state: STATE });
  assert.equal((await hooks(normal, open.token, null)).status, 200, 'a normal worker is unchanged');
});
test('A-I1 N1: a SUBSCRIPTION_ONLY worker with no owner email refuses an anonymous viewer, with no bridge call', async t => {
  t.mock.method(console, 'log', () => {});
  const f = world(t, { JOURNEY_MODEL_STUB: '', SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_BRIDGE_URL: 'https://bridge.test', SUBSCRIPTION_BRIDGE_TOKEN: 'bridge-token' });
  const hits = bridge(t);
  const { token } = await f.shareProject({ state: STATE });
  assert.equal((await hooks(f, token, null)).status, 403);
  assert.deepEqual([hits, usage(f)], [[], []]);
});
