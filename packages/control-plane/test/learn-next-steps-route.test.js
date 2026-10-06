// The owned hook route (contract §1.5, §2.3, §2.4): fixture planner, escalation, telemetry, server limits and dedup.
// node:sqlite LEARN_DB (learn-grade-fixture.js); the model is a scripted callModel; caches.default is a Map stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';
import { planNextSteps, planSection } from '../src/learn-journey-planners.js';
import { fixtureFor, fixtureModel } from '../src/learn-journey-fixtures.js';
import { LEARN_TASKS, costUsd } from '../src/learn-models.js';
import { NO_CAP, admitUsage } from '../src/learn-shared-ask.js';
import { nextStepsOutput } from '../src/agents/learn-next-steps.js';

const claim = (concept, statement, state, over = {}) => ({ concept, statement, ideas: [`names ${concept}`], drawn: `the first ${concept} case`, state, settled_passes: 0, settled_negatives: 0, presented: false, ...over });
const INPUT = (states = {}) => ({
  mode: 'journey', basis: JSON.stringify(states), goal: 'Understand how kilns fire pottery',
  path: { current: { id: 'p2', title: 'Firing curves', purpose: 'Why temperature rises in stages.', claim_ids: ['kiln.ramp', 'kiln.soak'] }, completed: [], upcoming: ['Glazes'] },
  canvas: { blocks: [{ id: 'q9', kind: 'Explanation', title: 'Ramping the kiln', concept_ids: ['kiln'], claim_ids: ['kiln.ramp'], practice: null }] },
  scope: { concepts: { kiln: 'Kiln firing', clay: 'Clay bodies' }, claims: {
    'kiln.ramp': claim('kiln', 'Heating in slow stages stops trapped water from cracking the pot.', states.ramp || 'not_yet_observed'),
    'kiln.soak': claim('kiln', 'Holding the peak temperature lets the clay vitrify evenly.', states.soak || 'not_yet_observed'),
    'clay.water': claim('clay', 'Clay holds chemically bound water that leaves only above red heat.', states.water || 'not_yet_observed'),
  } },
  recent: { intent: 'question', transitions: [], modalities: [], practice: [] }, previous: { hooks: [], goals: [] }, constraints: { learner: [] },
});
const reply = input => Response.json({ model: 'claude-sonnet-5-5', usage: { input_tokens: 2000, output_tokens: 400 }, content: [{ type: 'tool_use', name: 'suggest_next_steps', input }] });
function scripted(replies) { const calls = []; return { calls, callModel: async (env, body, model, org, role) => { calls.push({ body, model, role }); return replies.shift()(body); } }; }

test('owner test 1: the fixture gives 3 distinct, valid hooks for a journey', async () => {
  const out = fixtureFor('suggest_next_steps', INPUT());
  assert.equal(nextStepsOutput(out, INPUT()).ok, true, JSON.stringify(nextStepsOutput(out, INPUT()).errors));
  assert.equal(new Set(out.options.map(o => o.hook)).size, 3);
});

test('owner tests 2-4: the state-aware fixture leads with a misconception or a gap; strong evidence gets a frontier hook and no repair', () => {
  const lead = states => fixtureFor('suggest_next_steps', INPUT(states)).options[0];
  assert.deepEqual(lead({ soak: 'misconception' }).claim_ids, ['kiln.soak'], 'a misconception leads');
  assert.deepEqual(lead({ ramp: 'prerequisite_gap' }).claim_ids, ['kiln.ramp'], 'a gap leads');
  const advanced = fixtureFor('suggest_next_steps', INPUT({ ramp: 'understood', soak: 'understood', water: 'understood' }));
  assert.equal(advanced.options.some(o => /repair/i.test(o.reason_internal)), false, 'strong evidence gets no repair hook');
  assert.equal(advanced.options.some(o => /frontier/i.test(o.reason_internal)), true, 'strong evidence moves on to the frontier');
});

// Ruling F6: built from input.scope alone, so renamed ids, another order, a smaller registry, an empty scope, previous
// hooks and completed sections all still pass the validator; a completed-only claim appears only to repair it.
test('the fixture is generic: any domain, any ids, completed-only claims only for repair', () => {
  const pass = (input, why) => { const out = fixtureFor('suggest_next_steps', input), checked = nextStepsOutput(out, input); assert.equal(checked.ok, true, `${why}: ${JSON.stringify(checked.errors)}`); return out; };
  const renamed = INPUT({ soak: 'misconception' });
  renamed.scope = { concepts: { c7: 'Tidal locking' }, claims: { 'c7/x': { ...renamed.scope.claims['kiln.soak'], concept: 'c7' }, 'c7/y': { ...renamed.scope.claims['kiln.ramp'], concept: 'c7' } } };
  renamed.path.current.claim_ids = ['c7/y', 'c7/x'];
  assert.deepEqual(pass(renamed, 'renamed and reordered').options[0].claim_ids, ['c7/x']);
  const one = INPUT();
  one.scope.claims = { 'kiln.ramp': one.scope.claims['kiln.ramp'] };
  pass(one, 'one claim');
  pass({ ...INPUT(), scope: { concepts: {}, claims: {} } }, 'empty scope: block titles');
  pass({ ...INPUT(), scope: { concepts: {}, claims: {} }, canvas: { blocks: [] } }, 'empty scope and canvas: the goal');
  pass({ ...INPUT(), scope: { concepts: { kiln: 'Kiln firing' }, claims: {} } }, 'concepts only');
  const first = fixtureFor('suggest_next_steps', INPUT());
  const again = pass({ ...INPUT(), previous: { hooks: first.options.map(o => o.hook), goals: [first.options[0].learning_goal] } }, 'previous hooks');
  assert.equal(again.options.some(o => first.options.some(p => p.hook === o.hook)), false, 'a repeat set never comes back');
  const done = INPUT({ water: 'understood' });
  done.path.completed = [{ id: 'p1', title: 'Clay', claim_ids: ['clay.water'] }];
  assert.equal(pass(done, 'completed section').options.some(o => o.claim_ids.includes('clay.water')), false, 'completed-only, no repair: never offered');
  const repair = INPUT({ water: 'misconception' });
  repair.path.completed = [{ id: 'p1', title: 'Clay', claim_ids: ['clay.water'] }];
  assert.deepEqual(pass(repair, 'completed section, misconception').options[0].claim_ids, ['clay.water'], 'a completed claim comes back to repair it');
  const allDone = INPUT();
  allDone.path = { current: { id: 'p3', title: 'Glazes', purpose: 'x', claim_ids: [] }, completed: [{ id: 'p1', title: 'x', claim_ids: Object.keys(allDone.scope.claims) }], upcoming: [] };
  pass(allDone, 'every claim completed: concepts carry the hooks');
});

test('planNextSteps: Sonnet first; a missing tool call, a validator failure or ambiguity escalates once to Opus', async () => {
  const good = fixtureFor('suggest_next_steps', INPUT());
  for (const [first, why, errors] of [[() => Response.json({ content: [{ type: 'text', text: 'no tool' }] }), 'no_tool', []],
    [() => reply({ options: good.options.slice(0, 2) }), 'validator', ['shape']], [() => reply({ ...good, ambiguous: true }), 'ambiguous', []]]) {
    const s = scripted([first, () => reply(good)]);
    const out = await planNextSteps({}, INPUT(), { callModel: s.callModel });
    assert.deepEqual(s.calls.map(c => c.model), [LEARN_TASKS.tutor_next_steps.model, LEARN_TASKS.tutor_next_steps_escalation.model], why);
    assert.deepEqual(s.calls.map(c => c.role), ['tutor_next_steps', 'tutor_next_steps_escalation']);
    assert.deepEqual([out.telemetry.tier, out.telemetry.escalated, out.telemetry.calls, out.telemetry.model_role, out.telemetry.errors], ['escalation', why, 2, 'tutor_next_steps_escalation', errors]);
  }
  const ok = scripted([() => reply(good)]);
  const plain = await planNextSteps({}, INPUT(), { callModel: ok.callModel });
  assert.deepEqual([plain.telemetry.tier, plain.telemetry.escalated, plain.telemetry.calls, plain.telemetry.reasons], ['routine', null, 1, 3]);
  assert.equal(ok.calls[0].body.output_config.effort, 'low');
  assert.match(plain.telemetry.prompt_version, /^[0-9a-f]{12}$/);
  assert.equal(plain.telemetry.cost_usd, costUsd({ model: 'claude-sonnet-5-5', input_tokens: 2000, output_tokens: 400 }));
  assert.deepEqual([plain.telemetry.model_role, plain.telemetry.model_id, plain.telemetry.planner_version], ['tutor_next_steps', 'claude-sonnet-5-5', 'next-steps-planner-1']);
  // Before Task 6 fix round 2: { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }. A count
  // no reply reported is unknown (null), not 0: this reply reports no cache counts.
  assert.deepEqual(plain.telemetry.usage, { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: null, cache_read_input_tokens: null });
});

test('planNextSteps: a self-contradicting claim goes straight to Opus; an Opus failure throws PlannerInvalid', async () => {
  const input = INPUT({ ramp: 'uncertain' });
  input.scope.claims['kiln.ramp'] = { ...input.scope.claims['kiln.ramp'], settled_passes: 1, settled_negatives: 1 };
  const s = scripted([() => reply(fixtureFor('suggest_next_steps', input))]);
  assert.equal((await planNextSteps({}, input, { callModel: s.callModel })).telemetry.escalated, 'contradictory');
  assert.deepEqual(s.calls.map(c => c.model), [LEARN_TASKS.tutor_next_steps_escalation.model]);
  const bad = scripted([() => reply({ options: [] }), () => reply({ options: [] })]);
  await assert.rejects(planNextSteps({}, INPUT(), { callModel: bad.callModel }), { name: 'PlannerInvalid' });
});

test('planNextSteps: no usage in a reply means cost_usd null; an HTTP failure names the hook planner, the journey ones keep theirs', async () => {
  const unreported = (await planNextSteps({}, INPUT(), { callModel: fixtureModel })).telemetry;
  assert.equal(unreported.cost_usd, null, 'a fixture reply has no usage');
  assert.deepEqual(unreported.usage, { input_tokens: null, output_tokens: null, cache_creation_input_tokens: null, cache_read_input_tokens: null }, 'and no token counts: null, never 0');
  const down = async () => new Response('{}', { status: 503 });
  await assert.rejects(planNextSteps({}, INPUT(), { callModel: down }), { message: /^The next steps planner is unavailable \(model HTTP 503\)/ });
  await assert.rejects(planSection({}, {}, { callModel: down }), { message: /^The journey planner is unavailable \(model HTTP 503\)/ });
});

test('the hook planner request: static cached system, one tool on auto, input only in the user message, never JEV', async () => {
  const s = scripted([() => reply(fixtureFor('suggest_next_steps', INPUT()))]);
  await planNextSteps({}, INPUT(), { callModel: s.callModel });
  const body = s.calls[0].body;
  assert.equal(body.tools[0].name, 'suggest_next_steps');
  assert.deepEqual(body.tool_choice, { type: 'auto' });
  assert.equal(body.system[0].cache_control.type, 'ephemeral');
  assert.ok(body.messages[0].content.startsWith('input = '));
  const plain = scripted([() => reply(fixtureFor('suggest_next_steps', INPUT()))]);
  await planNextSteps({ SUBSCRIPTION_ONLY: 'true' }, INPUT(), { callModel: plain.callModel });
  assert.equal(typeof plain.calls[0].body.system, 'string', 'no cache block under SUBSCRIPTION_ONLY');
});

function world(t, vars = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  const store = new Map(), cache = { match: async key => store.get(key)?.clone(), put: async (key, response) => { store.set(key, response); } };
  const env = { LEARN_DB, SMALL_ENV: 'test', JOURNEY_MODEL_STUB: 'fixtures', ...vars };
  const who = { org: 'team', email: 'maker@test', user_id: 'u-maker-1' };
  const post = (body, as = who, deps = {}) => tutorRoute('/api/learn/tutor/next-steps', new Request('https://dev.test/api/learn/tutor/next-steps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env,
    { authorize: async () => ({ ...as, app: body.app }), cache, ...deps });
  return { sqlite, store, post };
}

test('owned route: a HookSet without reason_internal, dedup per user, canvas and basis, and a usage event per planner call', async t => {
  const w = world(t);
  const first = await w.post({ app: 'canvas-0a1b2c3d', input: INPUT() });
  assert.equal(first.status, 200);
  const set = await first.json();
  assert.match(set.set_id, /^ns_[0-9a-f]{8}$/);
  assert.equal(set.options.length, 3);
  assert.equal(JSON.stringify(set).includes('reason_internal'), false);
  assert.equal(JSON.stringify(set).includes('fixture '), false, 'no reason text either');
  assert.equal(set.telemetry.cost_usd, null, 'the fixture reports no usage, so no cost');
  const again = await (await w.post({ app: 'canvas-0a1b2c3d', input: INPUT() })).json();
  assert.equal(again.set_id, set.set_id, 'the same user, canvas and basis reuse the reply');
  const other = await (await w.post({ app: 'canvas-0a1b2c3d', input: INPUT() }, { org: 'team', email: 'other@test', user_id: 'u-other-2' })).json();
  assert.notEqual(other.set_id, set.set_id, 'another user never gets this reply');
  assert.ok([...w.store.keys()].every(key => !key.includes('maker@test') && !key.includes('u-maker-1') && !key.includes('canvas-0a1b2c3d')), 'one-way keys');
  const rows = w.sqlite.prepare('SELECT category, viewer_email, share_key, board_id FROM shared_ask_events').all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ category: 'tutor_next_steps', viewer_email: 'maker@test', share_key: '', board_id: 'canvas-0a1b2c3d' }, { category: 'tutor_next_steps', viewer_email: 'other@test', share_key: '', board_id: 'canvas-0a1b2c3d' }]);
});

// Ruling F13: a cached reply was paid for once; serving it again reports no usage, so a cost is never counted twice.
test('owned route: a reply from the dedup cache reports zero usage and cost, flagged cached', async t => {
  const w = world(t);
  const scriptedReply = { callModel: async () => reply(fixtureFor('suggest_next_steps', INPUT())) };
  const fresh = await (await w.post({ app: 'canvas-0a1b2c3d', input: INPUT() }, undefined, scriptedReply)).json();
  assert.deepEqual([fresh.telemetry.cached, fresh.telemetry.calls, fresh.telemetry.cost_usd > 0, fresh.telemetry.usage.input_tokens], [false, 1, true, 2000]);
  const hit = await (await w.post({ app: 'canvas-0a1b2c3d', input: INPUT() }, undefined, scriptedReply)).json();
  assert.equal(hit.set_id, fresh.set_id);
  assert.deepEqual([hit.telemetry.cached, hit.telemetry.calls, hit.telemetry.cost_usd], [true, 0, 0]);
  assert.deepEqual(hit.telemetry.usage, { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
});

test('owned route: the hourly cap answers 429 limited and writes nothing more', async t => {
  const w = world(t, { TUTOR_NEXT_STEPS_HOUR: '2' });
  for (const basis of ['a', 'b']) assert.equal((await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), basis } })).status, 200);
  const third = await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), basis: 'c' } });
  assert.deepEqual([third.status, (await third.json()).limited], [429, true]);
  assert.equal(w.sqlite.prepare('SELECT COUNT(*) AS n FROM shared_ask_events').get().n, 2);
});

// Ruling F7: every limiter query filters by its own category (the reverse is in shared-canvas-v1.test.js).
test('owned route: shared-ask usage never spends the hook budget', async t => {
  const w = world(t, { TUTOR_NEXT_STEPS_HOUR: '1' });
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 5; i++) w.sqlite.prepare("INSERT INTO shared_ask_events (category, asked_at, viewer_email, share_key, board_id, owner_email, repository) VALUES ('shared_canvas_ask', ?, 'maker@test', 'k', 'b', 'o@test', 0)").run(now);
  assert.equal((await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), basis: 'a' } })).status, 200);
  assert.equal((await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), basis: 'b' } })).status, 429, 'its own cap still holds');
});

test('admitUsage: a cap left out fails loudly, never admits without a limit; NO_CAP skips a bucket explicitly', async t => {
  const { sqlite, LEARN_DB } = learnDb(t);
  await assert.rejects(admitUsage(LEARN_DB, { category: 'tutor_next_steps', viewer: 'a@test', shareKey: '', boardId: 'b', owner: 'a@test', viewerDay: 5, shareHour: NO_CAP, shareDay: NO_CAP }), TypeError);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM shared_ask_events').get().n, 0, 'nothing admitted');
  assert.equal(NO_CAP, 1e9);
});

test('admitUsage: an anonymous shared planner call is capped per share key under its own category', async t => {
  const { sqlite, LEARN_DB } = learnDb(t);
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare("INSERT INTO shared_ask_events (category, asked_at, viewer_email, share_key, board_id, owner_email, repository) VALUES ('shared_canvas_ask', ?, 'ben@test', 'share-1', 'b', 'o@test', 0)").run(now);
  const call = shareKey => admitUsage(LEARN_DB, { category: 'shared_canvas_hooks', viewer: '', shareKey, boardId: 'b', owner: 'o@test', viewerHour: NO_CAP, viewerDay: NO_CAP, shareHour: 2, shareDay: 5 });
  assert.deepEqual([await call('share-1'), await call('share-1')], [null, null], 'the shared ask row on that key is not counted');
  assert.notEqual(await call('share-1'), null, 'the third call on one key is refused');
  assert.equal(await call('share-2'), null, 'another share key has its own budget');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM shared_ask_events WHERE category = 'shared_canvas_hooks'").get().n, 3);
});

test('owned route: 400 on bad input or more than 12000 characters, 502 when the planner fails, 503 without LEARN_DB', async t => {
  const w = world(t);
  assert.equal((await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), mode: 'shared' } })).status, 400);
  assert.equal((await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), goal: 'x'.repeat(12001) } })).status, 400);
  const failing = await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), basis: 'z' } }, undefined, { callModel: async () => Response.json({ content: [] }) });
  assert.equal(failing.status, 502);
  const bare = await tutorRoute('/api/learn/tutor/next-steps', new Request('https://dev.test/x', { method: 'POST', body: JSON.stringify({ app: 'a', input: INPUT() }) }), {}, { authorize: async () => ({ org: 'o', email: 'e@x', app: 'a' }) });
  assert.equal(bare.status, 503);
});

test('owned route: a raw body over 16000 characters is refused before parsing, even when input itself is small', async t => {
  const w = world(t);
  const big = await w.post({ app: 'canvas-0a1b2c3d', input: INPUT(), pad: 'x'.repeat(16000) });
  assert.equal(big.status, 400);
  assert.match((await big.json()).error, /16000/);
  assert.equal(w.sqlite.prepare('SELECT COUNT(*) AS n FROM shared_ask_events').get().n, 0, 'no usage event');
});

test('owned route: the rule name reason_internal reaches no client, in an escalated reply or a 502', async t => {
  const w = world(t), good = fixtureFor('suggest_next_steps', INPUT());
  const bad = { ...good, options: good.options.map((o, i) => (i ? o : { ...o, reason_internal: '' })) };
  const escalated = scripted([() => reply(bad), () => reply(good)]);
  const ok = await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), basis: 'r1' } }, undefined, { callModel: escalated.callModel });
  const set = await ok.text();
  assert.equal(ok.status, 200);
  assert.deepEqual([JSON.parse(set).telemetry.escalated, JSON.parse(set).telemetry.errors], ['validator', ['reason']]);
  assert.equal(set.includes('reason_internal'), false);
  const failing = scripted([() => reply(bad), () => reply(bad)]);
  const failed = await w.post({ app: 'canvas-0a1b2c3d', input: { ...INPUT(), basis: 'r2' } }, undefined, { callModel: failing.callModel });
  const text = await failed.text();
  assert.equal(failed.status, 502);
  assert.match(text, /option 1: reason/);
  assert.equal(text.includes('reason_internal'), false);
});
