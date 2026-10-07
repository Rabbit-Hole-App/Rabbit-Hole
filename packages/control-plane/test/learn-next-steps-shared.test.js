// Professor Next Steps on shared canvases (contract §1.4, §1.5, §2.1, §2.3): privacy tests 1-12 and the owner's cache
// rules (owner corrections 1, 9, 10; rulings F1, F2, F7, F13, F14), through the routes the app worker serves
// (shared-canvas-fixture.js, node:sqlite), the planner on its keyless fixture (JOURNEY_MODEL_STUB=fixtures) and
// caches.default as a Map. No model call for hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD, scriptModel } from './shared-canvas-fixture.js';
import { shareKey } from '../src/learn-shared-ask.js';
import { sharedInput } from '../src/learn-next-steps-routes.js';
import { fixtureModel } from '../src/learn-journey-fixtures.js';
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
function plannerInputs(t) {
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
  for (const o of got.body.options) assert.deepEqual([o.selected_next_step.scope, o.selected_next_step.source], ['shared', { share_version: 1, origin_block_id: ':root' }]);
  assert.equal(JSON.stringify(got.body.options).includes('reason_internal'), false);
  const input = sharedInput(STATE, { origin: { root: true }, version: 1, basis: 'b' });
  assert.equal('goal' in input, false, 'no goal is inferred on a shared canvas');
  assert.deepEqual(input.canvas.blocks.map(b => b.id), STATE.blocks.map(b => b.id));
  assert.equal(JSON.stringify(input).includes('Why exp?'), false, 'chat cards are not content for hooks');
  assert.deepEqual(Object.keys(input.scope.claims), REG.slice(0, 12));
  assert.deepEqual(input.canvas.blocks.find(b => b.id === 'reg1').claim_ids, REG.slice(0, 3));
});

test('privacy 1-2 (F14): the model reads the board title, version and selected card as data; never the sharer, chats or a goal', async t => {
  const f = world(t, { JOURNEY_MODEL_STUB: '' });
  const inputs = plannerInputs(t);
  const { token } = await f.shareProject({ state: STATE });
  assert.equal((await hooks(f, token, null, { origin: { block_id: 'b1' } })).status, 200);
  assert.equal(inputs.length, 1);
  const [input] = inputs;
  assert.deepEqual([input.mode, input.canvas.title, input.canvas.version, input.canvas.selected], ['shared', 'nanoGPT attention', 1, { id: 'b1', title: 'Why scale by sqrt(d)?' }]);
  assert.equal('goal' in input, false);
  assert.equal(/ana@test|Why exp\?|max trick|Half asked|Positive weights/.test(JSON.stringify(input)), false, 'no sharer identity and no chat card');
  // The root names no card.
  assert.equal((await hooks(f, token, null)).status, 200);
  assert.equal(inputs[1].canvas.selected, null);
});

test('privacy 3-4: signed-in viewer_states reach the input filtered to the server scope; sharer stamps and identity never', async t => {
  const f = world(t);
  const stamped = { ...STATE, blocks: [...STATE.blocks, { id: 'js1', type: 'explanation', title: 'Stamped', body: 'b', journey: { journey_id: 'lj_secret', section_id: 'sec-secret', step_id: 'js1', claims: [REG[0]] } }] };
  const { token } = await f.shareProject({ state: stamped });
  const got = await hooks(f, token, 'ben', { origin: null, viewer_states: { [REG[0]]: 'uncertain', 'made.up/claim': 'understood', [REG[1] ?? 'none/x']: 'not-a-state' } });
  assert.equal(got.status, 200, got.text);
  assert.deepEqual(got.body.telemetry.summary.evidence_summary.uncertain, [REG[0]]);
  assert.equal(/made\.up\/claim|not-a-state|lj_secret|sec-secret|ana@test/.test(got.text), false);
  assert.deepEqual(sharedInput(stamped, { origin: { root: true }, version: 1, basis: 'b' }).canvas.blocks.find(b => b.id === 'js1').claim_ids, [], 'a journey stamp is never read');
});

test('privacy 5 and owner extra 12g: anonymous replies come from a content-only cache that holds no viewer evidence', async t => {
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

test('owner extra 12h: personalized hooks never cross viewers; each is admitted under shared_canvas_hooks for that viewer', async t => {
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

test('privacy 6-10: a step creates the hole with its goal, a second start resumes it; origin kept; the source untouched; no fork', async t => {
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
