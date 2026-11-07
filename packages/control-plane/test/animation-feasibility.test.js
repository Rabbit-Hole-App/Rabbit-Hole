// FX-AN-031: the checks before Generate and the Chat explanation after a failure. Deterministic, stub pipeline and fake provider only: no model
// is reached. test/fixtures/animation-saved-plans.json holds the plans of real dev jobs with what the author really wrote for them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGED, GAP_ALTERNATIVES, GAP_FALLBACK, clarificationFor, draftLimit, estimateDraftBytes, learnerReason, planAlternatives, sizeCheck, trailConflicts } from '../src/animation-feasibility.js';
import { ANIMATION_DRAFT_BYTES } from '../src/agents/animation-author.js';
import { ANIMATION_SEED_PATH, animationRoute, failureClass, failureText, publicAnimationJob, recoveryOf } from '../src/animation-job.js';
import { seededJobs } from '../src/animation-outcomes-fixture.js';
import { newTiming } from '../src/explain-policy.js';
import { validateAnimationPlan } from '../../web/src/animation3d/contract.js';
import { ANIMATION_CAPABILITIES } from '../../web/src/animation3d/capabilities.js';
import { NEEDS_PROPOSAL, PLAN, STUB_PIPELINE, TASKS, animationStack, postedProposal, rows } from './animation-fixture.js';

const skip = NEEDS_PROPOSAL;
const SAVED = JSON.parse(readFileSync(new URL('./fixtures/animation-saved-plans.json', import.meta.url), 'utf8'));
const saved = id => SAVED.find(j => j.job === id);
const env = { ANTHROPIC_API_KEY: 'offline' };
const REQUEST = 'Show me how stochastic gradient descent works. Let me change the learning rate and batch size to see what happens.';
const sizeOf = (plan, prompt = REQUEST) => sizeCheck(env, { prompt, evidence: [] }, plan, TASKS);
const stubGap = (reason = 'A walkable world with real fluid physics needs a game engine these scenes do not have') => STUB_PIPELINE({ prepare: async (job, ctx) => { await ctx.call('brief', { system: 'brief', tool: { name: 'x', input_schema: { type: 'object' } }, content: job.prompt }); return job.refinement ? { plan: PLAN } : { gap: { capability: 'animation', needs: ['other'], source: 'brief', reason, message: 'This animation needs something that is not available yet, so edit the request.' } }; } });
const oversized = over => STUB_PIPELINE({ prepare: async (job, ctx) => { await ctx.call('brief', { system: 'brief', tool: { name: 'x', input_schema: { type: 'object' } }, content: job.prompt }); return { plan: job.refinement ? PLAN : over }; } });
const chat = s => rows(s.sqlite, 'messages');
const choiceOf = s => rows(s.sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json).animationChoice).filter(Boolean).at(-1);
const pick = (s, id, choice) => s.send('choose', { choice, key: choiceOf(s).key }, id);
const explained = s => chat(s).filter(m => /was not finished/.test(m.content));
const NEAR = { ...PLAN, behavior: 'rules', description: 'A ball leaves a trail over 170 steps.', interactions: [] };

// Calibration, on every saved plan with a known outcome. These are the numbers the report quotes; a change to the estimate must face them.
test('the estimate on saved jobs: its error on the plans with a saved draft, and which plans it flags', () => {
  const known = SAVED.filter(j => j.draftBytes);
  const errors = known.map(j => (estimateDraftBytes(j.plan).bytes - j.draftBytes) / j.draftBytes);
  assert.ok(Math.max(...errors.map(Math.abs)) < 0.2, `worst error ${Math.max(...errors.map(Math.abs))}`);
  assert.ok(errors.reduce((t, e) => t + Math.abs(e), 0) / errors.length < 0.13, 'mean absolute error');
  // aj_9c453b6: 82 markers declared in its 13,252 B repaired draft; the words of its plan say 40 points, kept, so 80.
  const sgd40 = estimateDraftBytes(saved('aj_9c453b6').plan);
  assert.deepEqual([sgd40.stated, sgd40.retained, sgd40.drawn], [40, true, 80]);
  assert.ok(Math.abs(sgd40.bytes - 13252) / 13252 < 0.1, `${sgd40.bytes}`);
  // Flagged: only the 150-step plan with a kept path, whose author call used its whole output limit (aj_51ec6a0, no draft exists).
  const flagged = SAVED.filter(j => sizeOf(j.plan).over).map(j => j.job);
  assert.deepEqual(flagged, ['aj_51ec6a0'], 'no accepted or fitting plan is flagged');
  assert.equal(sizeOf(saved('aj_51ec6a0').plan).keep, false, 'clearly over: not offered as planned');
  // A plan's data set is not a trail: 64 data points never count as markers; its 150 steps do.
  assert.equal(estimateDraftBytes(saved('aj_51ec6a0').plan).stated, 150);
  assert.equal(estimateDraftBytes(saved('aj_78cc3d3').plan).drawn, 0, 'a pendulum draws no trail');
});
test('honest limits of the estimate: a false negative and a false alarm are possible, and neither is a guarantee', () => {
  // False negative on record: aj_283c19f's author wrote 10,914 B against an estimate about 16% lower. Under the limit, this says nothing about passing.
  const under = estimateDraftBytes(saved('aj_283c19f').plan);
  assert.ok(under.bytes < saved('aj_283c19f').draftBytes);
  // False alarm by construction: a plan's words can name many steps the scene never marks one by one. It is flagged, and the learner may keep it when not clearly over.
  const verdict = sizeOf(NEAR);
  assert.deepEqual([verdict.over, verdict.keep], [true, true]);
  assert.match(verdict.why, /By our estimate/);
  assert.match(verdict.why, /An estimate can be wrong/);
});
test('the limit is per plan, through the authoritative check and the shared constant', () => {
  const short = draftLimit(env, { prompt: REQUEST, evidence: [], plan: PLAN }, TASKS);
  assert.ok(short <= ANIMATION_DRAFT_BYTES && short > ANIMATION_DRAFT_BYTES - 100, `${short}`);
  const long = { ...PLAN, assumptions: Array(8).fill('x'.repeat(2000)), limitations: Array(8).fill('y'.repeat(2000)) };
  assert.ok(draftLimit(env, { prompt: REQUEST, evidence: [], plan: long }, TASKS) < short - 1000, 'a longer plan leaves less room');
});

test('an alternative keeps every control and the rule, says exactly what changes, and is estimated to fit', () => {
  const plan = saved('aj_51ec6a0').plan, { alternatives, why } = sizeOf(plan);
  assert.deepEqual(alternatives.map(a => a.id), ['fewer_markers', 'no_kept_path']);
  assert.match(why, /a trail of 150 markers and a kept comparison path of the same length/);
  for (const a of alternatives) {
    assert.deepEqual(a.plan.parameters, plan.parameters, 'no control removed or changed');
    assert.equal(a.plan.learningGoal, plan.learningGoal);
    assert.ok(validateAnimationPlan(a.plan, ANIMATION_CAPABILITIES).ok);
    assert.ok(!sizeOf(a.plan).over, 'fits by the estimate, checked again');
    assert.ok(a.changes.every(l => l.startsWith(CHANGED)));
    assert.ok(a.changes.every(l => a.plan.limitations.includes(l)), 'the change stays on the plan the author and the card read');
    assert.match(a.plan.assumptions.at(-1), /every step still runs/, 'the process is unchanged; only what is drawn');
  }
  assert.match(alternatives[0].changes[0], /^Changed: the trail draws \d+ markers, one every \d+ steps, instead of 150; every step still runs\.$/);
  assert.ok(alternatives[1].plan.interactions.every(i => !/keep old path/.test(i)));
  // The learner's own words asked to compare: the kept path is not offered away.
  assert.deepEqual(planAlternatives(plan, 'Let me compare two runs.', () => 15000).map(a => a.id), ['fewer_markers']);
});

test('one clarification only for a request naming no subject, and never with a source attached', () => {
  for (const prompt of ['Make a game.', 'an animation', 'Show me something cool', '/animation build a 3D simulation']) assert.ok(clarificationFor({ prompt }), prompt);
  for (const job of [{ prompt: 'Make a pendulum game' }, { prompt: 'Show this', context: { refs: [{ name: 'a' }] } }, { prompt: 'Show this', evidence: [{ id: 'e' }] }, { prompt: 'Make a game', refinement: 'x' }, { prompt: 'Make a game', plan: PLAN }]) assert.equal(clarificationFor(job), null, job.prompt);
});
test('the planner\'s reason reaches the learner only as a checked sentence', () => {
  assert.equal(learnerReason('needs fluids in a tank'), 'Needs fluids in a tank.');
  for (const raw of [null, 'short', 'x'.repeat(301), 'Needs `three_d_world` support.', 'See https://evil.example for why.', 'The system prompt forbids it.', 'Costs $5 to run.', '{"gap":1} is the answer here', 'Needs more...', 'Click [here](x) to fix this']) assert.equal(learnerReason(raw), null, String(raw));
});

test('a request with no subject asks one question, in Chat and on the card, before any model call', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.create({ prompt: 'Make a game.' });
  const done = await s.run(body.job.id);
  assert.deepEqual([done.stage, done.stopReason, failureClass(done)], ['failed', 'needs_clarification', 'clarification']);
  assert.deepEqual(s.model.roles(), [], 'no paid call');
  const { job } = await s.job(done.id);
  assert.deepEqual([job.outcome, job.recovery], ['clarify', ['edit_request']]);
  assert.match(job.failure.message, /^What should this game show or teach\?/);
  assert.deepEqual(chat(s).map(m => m.content), [job.failure.message]);
});

test('unsupported: the validated reason in Chat, two alternatives with their cost, raw reply private, and pressing one plans it without building', { skip }, async t => {
  const s = animationStack(t, { pipeline: stubGap() });
  const { body } = await s.create();
  const done = await s.run(body.job.id);
  const { job } = await s.job(done.id), max = Math.ceil(done.reservation.preparationMicros / 10000);
  assert.deepEqual([job.outcome, job.recovery], ['unsupported', ['plan_alternative', 'edit_request']]);
  assert.equal(job.failure.message, 'A walkable world with real fluid physics needs a game engine these scenes do not have. Choose an alternative in Chat, or edit the request to start a new animation.');
  assert.equal(job.failure.gap, undefined, 'the raw reason stays out of the learner view');
  assert.deepEqual(chat(s).map(m => m.content), [`This animation cannot be made as asked. ${job.failure.message} Your request is kept.`]);
  const choice = choiceOf(s);
  assert.deepEqual(choice.alternatives.map(a => [a.id, a.credits]), GAP_ALTERNATIVES.map(a => [a.id, max]));
  // A press, twice: one new job, one plan call, nothing built before Generate; the message records the choice.
  const [a, b] = [await s.send('retry', { expectedAttempt: 1, action: 'plan_alternative', alternative: 'watch' }, done.id), await s.send('retry', { expectedAttempt: 1, action: 'plan_alternative', alternative: 'watch' }, done.id)];
  assert.equal(b.body.job.id, a.body.job.id);
  const next = await s.run(a.body.job.id);
  assert.deepEqual([next.stage, s.model.roles()], ['awaiting_approval', ['brief', 'brief']]);
  assert.equal(choiceOf(s).chosen, 'watch');
  // Another tab pressing the other alternative answers the same new job and never relabels the choice.
  const other = await s.send('retry', { expectedAttempt: 1, action: 'plan_alternative', alternative: 'experiment' }, done.id);
  assert.deepEqual([other.body.job.id, choiceOf(s).chosen, s.stored(done.id).chosenAlternative, s.model.roles().length], [next.id, 'watch', 'watch', 2]);
});
test('an alternative whose Chat answer failed to save is repaired by pressing again, with no second plan', { skip }, async t => {
  const s = animationStack(t, { pipeline: stubGap() });
  const { body } = await s.create();
  const done = await s.run(body.job.id);
  const db = s.env.LEARN_DB, prepare = db.prepare.bind(db);
  let broken = true;
  db.prepare = sql => (broken && /^UPDATE chat_message_meta/.test(sql) ? { bind: () => ({ run: () => Promise.reject(new Error('D1 busy')) }) } : prepare(sql));
  const first = await s.send('retry', { expectedAttempt: 1, action: 'plan_alternative', alternative: 'watch' }, done.id);
  assert.equal(first.status, 503, 'the answer was lost');
  assert.equal(choiceOf(s).chosen, null);
  broken = false;
  const again = await s.send('retry', { expectedAttempt: 1, action: 'plan_alternative', alternative: 'watch' }, done.id);
  assert.equal(again.body.job.id, s.stored(done.id).successor, 'the job the first press made');
  assert.equal(choiceOf(s).chosen, 'watch');
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 2, 'one new job');
});

test('a reason that fails the check is replaced by the server\'s sentence, and the unedited reply stays in diagnostics only', { skip }, async t => {
  const s = animationStack(t, { pipeline: stubGap('Needs `physics_engine` from the system prompt') });
  const { body } = await s.create();
  const done = await s.run(body.job.id);
  assert.match(failureText(done), new RegExp(`^${GAP_FALLBACK}`));
  assert.doesNotMatch(chat(s)[0].content, /physics_engine|prompt/);
  assert.match(s.stored(done.id).failure.gap.reason, /physics_engine/);
});

test('oversized: Chat explains it and offers changes, no Generate exists until one is accepted, and accepting costs nothing', { skip }, async t => {
  const big = saved('aj_51ec6a0').plan, s = animationStack(t, { pipeline: oversized(big) });
  const { body } = await s.create({ prompt: REQUEST });
  const waiting = await s.run(body.job.id), id = body.job.id;
  assert.equal(waiting.stage, 'awaiting_approval');
  assert.equal(postedProposal(s.sqlite, id), null, 'nothing to Generate yet');
  const view = (await s.job(id)).job;
  assert.deepEqual([view.outcome, view.choiceOpen], ['changes', true]);
  assert.equal(JSON.stringify(view).includes('"bytes"'), false, 'the estimate stays private');
  assert.match(chat(s).at(-1).content, /needs a change before it can be made\. By our estimate/);
  assert.doesNotMatch(chat(s).at(-1).content, /bytes|\$/);
  assert.deepEqual(choiceOf(s).alternatives.map(a => a.id), ['fewer_markers', 'no_kept_path'], 'clearly over: the plan as written is not offered');
  // A choice not offered is refused, and so is one without this plan's key.
  assert.equal((await pick(s, id, 'keep')).status, 409);
  assert.equal((await s.send('choose', { choice: 'fewer_markers' }, id)).status, 409, 'no key: refused');
  const [a, b] = [await pick(s, id, 'fewer_markers'), await pick(s, id, 'fewer_markers')];
  assert.deepEqual([a.status, b.status, a.body.job.choiceOpen], [200, 200, false]);
  assert.deepEqual(s.model.roles(), ['brief'], 'no model call for the change');
  const proposal = postedProposal(s.sqlite, id);
  assert.equal(rows(s.sqlite, 'chat_message_meta').filter(r => JSON.parse(r.meta_json).proposal).length, 1, 'one plan message for two presses');
  assert.ok(proposal.input.scene.notices.some(n => n.startsWith(CHANGED)), 'the review card keeps the change in view');
  assert.ok(proposal.input.scene.parameters.length === big.parameters.length);
  assert.equal(chat(s).at(-1).content, '', 'the plan card alone; what changed is on its review card (notices above)');
  assert.equal(choiceOf(s).chosen, 'fewer_markers');
  assert.equal((await pick(s, id, 'no_kept_path')).status, 409, 'the other choice is gone');
  // Generate is then the existing action on the changed plan, and its cost is on the card (usage.max_credits).
  assert.ok(proposal.usage.max_credits > 0);
  assert.equal((await s.approve(id)).status, 202);
  assert.equal(s.stored(id).stage, 'authoring');
});
test('near the limit the learner may keep the plan; with no change the server can make, a simpler plan is a paid plan call with its cost', { skip }, async t => {
  const s = animationStack(t, { pipeline: oversized(NEAR) });
  const { body } = await s.create();
  await s.run(body.job.id);
  assert.ok(choiceOf(s).alternatives.some(a => a.id === 'keep'));
  assert.equal((await pick(s, body.job.id, 'keep')).status, 200);
  assert.equal(postedProposal(s.sqlite, body.job.id).input.plan_hash, s.stored(body.job.id).planHash);
  const crowd = { ...PLAN, description: 'A grid of 300 particles drifts.' };
  const c = animationStack(t, { pipeline: oversized(crowd) });
  const made = await c.create();
  const id = made.body.job.id;
  const before = await c.run(id);
  const simpler = choiceOf(c).alternatives.find(a => a.id === 'simpler');
  assert.equal(simpler.credits, Math.ceil(before.reservation.preparationMicros / 10000));
  assert.equal((await pick(c, id, 'simpler')).status, 202);
  const after = await c.run(id);
  assert.deepEqual([after.stage, c.model.roles()], ['awaiting_approval', ['brief', 'brief']]);
  assert.ok(postedProposal(c.sqlite, id));
});
// Owner 2026-11-02: an edit made in the review card is checked again at Generate; the accepted decision is bound to one plan.
test('Generate on an edited plan that is now too large: the edit is kept, its choices are posted, nothing is admitted or consumed; a stale button cannot pick; an accepted Keep is not asked again', { skip }, async t => {
  const EDIT = 'A ball leaves a trail over 190 steps.';
  const s = animationStack(t, { pipeline: { ...oversized(NEAR), approvedPlan: plan => ({ ...plan, description: EDIT }) } });
  const { body } = await s.create(), id = body.job.id;
  await s.run(id);
  const keyA = choiceOf(s).key;
  assert.equal((await pick(s, id, 'keep')).status, 200);
  const first = postedProposal(s.sqlite, id);
  const pressed = await s.approve(id, first);
  assert.deepEqual([pressed.status, pressed.body.job.stage, pressed.body.job.choiceOpen], [200, 'awaiting_approval', true], 'the edited plan needs a change first');
  const stored = s.stored(id);
  assert.deepEqual([stored.plan.description, stored.approval, stored.proposal], [EDIT, null, null], 'the edit is kept; nothing approved');
  assert.equal(rows(s.sqlite, 'chat_message_meta').filter(r => JSON.parse(r.meta_json).proposalState?.used).length, 0, 'the proposal was not consumed');
  const keyB = choiceOf(s).key;
  assert.notEqual(keyB, keyA);
  assert.equal((await s.approve(id, first)).status, 409, 'the earlier proposal is stale now');
  assert.equal((await s.send('choose', { choice: 'keep', key: keyA }, id)).status, 409, 'a button from the earlier plan does not pick on this one');
  assert.equal(s.stored(id).sizeChoice.open, true);
  assert.equal((await pick(s, id, 'keep')).status, 200);
  const second = postedProposal(s.sqlite, id);
  assert.match(second.description, /190 steps/);
  const go = await s.approve(id, second);
  assert.deepEqual([go.status, s.stored(id).stage], [202, 'authoring'], 'the accepted Keep is not asked again');
  assert.deepEqual(s.model.roles(), ['brief'], 'no plan call and no build before this Generate');
  assert.equal(chat(s).filter(m => /needs a change before it can be made/.test(m.content)).length, 2, 'one choice message per plan');
});
test('a choice whose Chat answer failed to save: the plan stands, and the same press repairs the answer without another plan', { skip }, async t => {
  const s = animationStack(t, { pipeline: oversized(NEAR) });
  const { body } = await s.create(), id = body.job.id;
  await s.run(id);
  const db = s.env.LEARN_DB, prepare = db.prepare.bind(db);
  let broken = true;
  db.prepare = sql => (broken && /^UPDATE chat_message_meta/.test(sql) ? { bind: () => ({ run: () => Promise.reject(new Error('D1 busy')) }) } : prepare(sql));
  assert.equal((await pick(s, id, 'keep')).status, 503);
  assert.deepEqual([s.stored(id).sizeChoice.chosen, choiceOf(s).chosen], ['keep', null], 'the choice took effect; its answer was lost');
  broken = false;
  assert.equal((await pick(s, id, 'keep')).status, 200);
  assert.equal(choiceOf(s).chosen, 'keep');
  assert.equal(rows(s.sqlite, 'chat_message_meta').filter(r => JSON.parse(r.meta_json).proposal).length, 1, 'one plan message');
  assert.deepEqual(s.model.roles(), ['brief']);
});

test('supported: the usual plan message; the outcome says what the checks found, and no words promise a fit', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.create();
  await s.run(body.job.id);
  assert.equal((await s.job(body.job.id)).job.outcome, 'supported');
  assert.equal(chat(s).at(-1).content, '', 'the plan card alone, no canned sentence');
  assert.doesNotMatch(JSON.stringify(postedProposal(s.sqlite, body.job.id)), /guarante|will fit/i);
});

test('the Chat explanation arrives after a failed write, once, and a lost answer writes no second message', { skip }, async t => {
  const s = animationStack(t, { pipeline: STUB_PIPELINE({ author: async () => { throw Object.assign(new Error('x'), { stopReason: 'deadline', status: 409 }); } }) });
  const db = s.env.LEARN_DB, batch = db.batch.bind(db);
  let broken = true;
  db.batch = statements => (broken ? Promise.reject(new Error('D1 busy')) : batch(statements));
  const { id, done } = await s.generated();
  assert.equal(done.stage, 'failed');
  assert.equal(explained(s).length, 0);
  assert.equal((await s.job(id)).job.chatPending, true);
  assert.ok(failureText(done), 'the card has the words meanwhile');
  broken = false;
  s.stored(id).reportAt = 0; // its retry is due
  await s.actor.alarm();
  assert.equal(explained(s).length, 1);
  assert.equal((await s.job(id)).job.chatPending, false);
  // Crash after the write, before the save: the next try finds its own message.
  const stored = s.stored(id);
  Object.assign(stored, { reported: undefined, reportTries: 1, reportAt: 0 });
  await s.actor.alarm(); await s.object().alarm();
  assert.equal(explained(s).length, 1);
  assert.equal(s.stored(id).reported, stored.attempt);
});
test('more than five failed Chat writes: delivery stays pending with a capped backoff, a status read recovers it, and exactly one message lands with no paid work', { skip }, async t => {
  const s = animationStack(t, { pipeline: STUB_PIPELINE({ author: async () => { throw Object.assign(new Error('x'), { stopReason: 'deadline', status: 409 }); } }) });
  const db = s.env.LEARN_DB, batch = db.batch.bind(db);
  let broken = true;
  db.batch = statements => (broken ? Promise.reject(new Error('down')) : batch(statements));
  const { id, done } = await s.generated();
  const paid = s.model.roles().length;
  for (let i = 0; i < 9; i++) { s.stored(id).reportAt = 0; await s.actor.alarm(); }
  assert.ok(s.stored(id).reportTries > 5, `${s.stored(id).reportTries} tries`);
  assert.equal(s.stored(id).reported, undefined, 'still undelivered');
  const wait = s.stored(id).reportAt - Date.now();
  assert.ok(wait > 30000 && wait <= 30 * 60000, `capped backoff ${wait}`);
  // Due later: an alarm now does not write.
  broken = false;
  await s.actor.alarm();
  assert.equal(explained(s).length, 0, 'not due yet');
  // A status read (the card's poll, a reopen) tries at once.
  assert.equal((await s.job(id)).job.chatPending, false);
  await s.job(id); await s.actor.alarm(); await s.object().alarm();
  assert.equal(explained(s).length, 1, 'exactly one message');
  assert.deepEqual([s.stored(id).stage, s.stored(id).failure.stage, s.model.roles().length], ['failed', done.failure.stage, paid], 'the job and its evidence as they were; no paid work');
});


// The words every class shows and the action it offers. Literal on purpose: the report quotes this table.
test('each failure class has its own words and its own next action, on the records the dev fixtures seed', () => {
  const base = name => { const { plan = null, fields } = seededJobs()[name]; return { attempt: 1, repairs: 0, counts: { brief: 1, author: 1, review: 0, repair: 0 }, findings: [], calls: [], reservation: { preparationMicros: 254800 }, plan, ...fields }; };
  const expected = {
    clarify: ['clarification', ['edit_request'], /^What should this game show or teach\?/],
    unsupported: ['capability', ['plan_alternative', 'edit_request'], /^A walkable world with real fluid physics needs a game engine these scenes do not have\. Choose an alternative in Chat/],
    size_limit: ['size_limit', ['revise_plan', 'edit_request'], /^The scene was too large to check\. It was corrected automatically once, but it still did not pass\. Revise plan prepares a simpler plan .* using up to 26 AI credits/],
    output_limit: ['output_limit', ['revise_plan', 'edit_request'], /^The scene builder reached its output limit before it finished\. That does not prove your request is impossible; a smaller plan may fit\. It used 36 AI credits\. Revise plan/],
    scene_quality: ['checks', ['revise_plan', 'edit_request'], /^The visual review found 1 serious problem with how the scene is drawn or computed\. It was corrected automatically once, but it still did not pass\. Revise plan/],
    invalid_review: ['review_validation', null, /^The visual review returned an answer in the wrong form/],
    temporary: ['transient', ['new_attempt', 'edit_request'], /^The AI service was busy\. You have not been charged\. It was retried automatically\. Try again continues/],
    credits: ['credits', ['new_attempt', 'edit_request'], /^Not enough AI credits\. Try again continues/],
  };
  for (const [name, [kind, actions, words]] of Object.entries(expected)) {
    const job = base(name);
    assert.equal(failureClass(job), kind, name);
    if (actions) assert.deepEqual(recoveryOf(job), actions, name);
    assert.match(failureText(job), words, name);
    assert.doesNotMatch(failureText(job), /\$|bytes|\.\.\.|…/, name);
    assert.equal(publicAnimationJob({ ...job, id: 'aj', boardId: 'b', cardId: 'c', timing: newTiming('simple', 0), createdAt: 0, updatedAt: 0 }).failure.gap, undefined, name);
  }
});

test("a provider's own failure text stays private, and Try again says what it may use", () => {
  const job = { stage: 'failed', stopReason: 'error', attempt: 1, repairs: 0, counts: { author: 1 }, bounds: { generation: 1000000 }, findings: [], calls: [], approval: { at: 1 }, reservation: { generationMicros: 3000000 }, failure: { stage: 'authoring', category: 'internal', code: 'model_http_400', message: 'provider says: secret workspace detail', retryable: true } };
  assert.equal(failureClass(job), 'transient');
  assert.doesNotMatch(failureText(job), /provider|secret/);
  assert.match(failureText({ ...job, failure: { ...job.failure, category: 'transport' }, draft: {} }), /using up to 200 AI credits/);
});
test('the dev fixtures seed every outcome through the real report and choice paths, with no model call, and exist only under ANIMATION_DIAGNOSTICS', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.send('seed');
  assert.deepEqual(body.jobs.map(j => j.name), Object.keys(seededJobs()));
  assert.deepEqual(s.model.roles(), [], 'no model call');
  const outcomes = Object.fromEntries(await Promise.all(body.jobs.map(async j => [j.name, (await s.job(j.id)).job.outcome])));
  assert.deepEqual([outcomes.supported, outcomes.oversized, outcomes.unsupported, outcomes.clarify], ['supported', 'changes', 'unsupported', 'clarify']);
  assert.equal(chat(s).length, body.jobs.length, 'one Chat message per fixture');
  assert.ok(postedProposal(s.sqlite, body.jobs.find(j => j.name === 'supported').id));
  assert.equal(postedProposal(s.sqlite, body.jobs.find(j => j.name === 'oversized').id), null);
  for (const extra of [{}, { ANIMATION_ENABLED: 'true' }]) {
    const off = await animationRoute(ANIMATION_SEED_PATH, new Request(`https://dev.test${ANIMATION_SEED_PATH}`, { method: 'POST', body: '{}' }), extra);
    assert.equal(off.status, 404);
  }
});

// Owner 2026-11-02 (aj_ad936ec, aj_ba11d5a): a shortened trail must be said the same way everywhere in the plan, and the step count is read
// from the plan's words about steps, not from any number near the word "step".
const SGD = JSON.parse(readFileSync(new URL('./fixtures/animation-sgd-trail.json', import.meta.url), 'utf8'));
const ruleOf = plan => plan.limitations[0].match(/draws (\d+) markers, one every (\d+) steps, instead of (\d+)/).slice(1).map(Number);
test('the shortened plan the build ran with contradicted itself; a shortened plan now restates every trail sentence or is not offered', () => {
  const ran = SGD.find(x => x.job.startsWith('aj_ad936ec')).changed, [shown, every, from] = ruleOf(ran);
  assert.deepEqual([shown, every, from], [37, 7, 256], 'the saved plan, as it was built: 256 was a batch size');
  assert.ok(trailConflicts(ran, 40, every, shown).some(s => /one for each step/.test(s)), 'it still said one trail point for each step');
  for (const x of SGD) {
    for (const limit of [11500, 13000, 14992]) for (const a of planAlternatives(x.original, 'Show me how stochastic gradient descent works.', () => limit)) {
      const [n, k, of] = ruleOf(a.plan);
      assert.deepEqual(trailConflicts(a.plan, of, k, n), [], `${x.job} ${a.id} at ${limit}`);
      const said = [a.plan.description, ...a.plan.interactions, ...a.plan.assumptions].join(' ');
      assert.doesNotMatch(said, /one for each step|one per step|adds one trail point/, `${x.job} ${a.id}`);
      assert.ok(!new RegExp(`\b${of} (?:points|markers)\b`).test(said), `${x.job} ${a.id}: the old count is gone`);
      if (a.id === 'no_kept_path') assert.ok(a.plan.interactions.every(i => !/keep (?:old )?path|restarts from the same point/i.test(i)), 'the kept-path action goes whole, not a fragment of it');
    }
  }
});
// The two sentences of aj_ad936ec's saved plan that were read as counts: together they took its estimate from 12,370 B to 42,700 B.
test('a parameter value or a decimal is never a count: "At 256 every step" is no 256 steps, "0.25 the ball" no 25 balls', () => {
  const plan = sentence => ({ ...PLAN, behavior: 'rules', description: `A ball moves and leaves a trail. ${sentence}`, interactions: [] });
  for (const sentence of ['At 256 every step follows the exact slope.', 'Above 0.25 the ball zigzags across the steep direction.']) {
    assert.ok(SGD[0].original.interactions.some(i => i.includes(sentence)), `the saved plan has: ${sentence}`);
    const e = estimateDraftBytes(plan(sentence));
    assert.deepEqual([e.stated, e.objects], [0, 0], sentence);
  }
  // A count still reads as one when the words state it.
  for (const [sentence, stated, objects] of [['A run lasts up to 40 steps.', 40, 0], ['It leaves a trail of up to 40 points, one for each step.', 40, 0], ['A 150-step run.', 150, 0], ['A grid of 300 particles drifts.', 0, 300]]) {
    const e = estimateDraftBytes(plan(sentence));
    assert.deepEqual([e.stated, e.objects], [stated, objects], sentence);
  }
});
test('calibration on the saved SGD jobs: the 40-step plan is read as 40 steps and not flagged; the 300-step plan with a kept path is; the drafts written from the shortened plans', () => {
  const [ad, ba] = ['aj_ad936ec', 'aj_ba11d5a'].map(id => SGD.find(x => x.job.startsWith(id)));
  const forty = estimateDraftBytes(ad.original);
  assert.deepEqual([forty.stated, forty.retained, forty.drawn], [40, true, 80], 'was 256 steps: "at 256 every step follows the exact slope"');
  assert.equal(sizeOf(ad.original).over, false, 'its shape fits the real check: aj_9c453b6 wrote 13,252 B for the same 40 steps with a kept path, and fitProblems accepts it');
  assert.ok(Math.abs(forty.bytes - 13252) / 13252 < 0.15, `${forty.bytes}`);
  const many = sizeOf(ba.original);
  assert.equal(many.over, true, '300 steps with a kept path is 600 markers, past the 256 nodes a scene may declare');
  assert.ok(many.alternatives.length > 0);
  // Measured, both ways (the report quotes these): the estimate over-counts when the author draws fewer markers than the plan says
  // (aj_ad936ec drew 20 for a cap of 37 with a kept path), and under-counts a larger program (aj_ba11d5a's 15,097 B draft was refused by the
  // real review-size check while its plan was estimated under the limit: a false negative, caught by fitProblems before any review).
  const over = (estimateDraftBytes(ad.changed).bytes - Math.max(...ad.drafts)) / Math.max(...ad.drafts), under = (estimateDraftBytes(ba.changed).bytes - Math.max(...ba.drafts)) / Math.max(...ba.drafts);
  assert.ok(over > 0.3 && under < 0, `${over} ${under}`);
  assert.equal(sizeOf(ba.changed).over, false);
});
// The same rules on other subjects (owner 2026-11-02: general to the pipeline, SGD only the regression case). No string here is special-cased.
test('other subjects: values beside a per-step phrase and decimals are no counts; frames are a step unit; a shortened trail is restated in its own unit', () => {
  const plan = (description, interactions = []) => ({ ...PLAN, behavior: 'rules', description, interactions });
  for (const [sentence, stated, objects] of [['At 0.5 the pendulum swings wide.', 0, 0], ['With 100 every frame the cells divide.', 0, 0], ['A box holds 40 particles.', 0, 40], ['It leaves a trail over 600 frames.', 600, 0], ['A 90-tick run leaves a trail.', 90, 0]]) {
    const e = estimateDraftBytes(plan(`A bob moves and leaves a dotted trail. ${sentence}`));
    assert.deepEqual([e.stated, e.objects], [stated, objects], sentence);
  }
  const swing = plan('A pendulum bob swings and leaves a dotted trail of 600 points, one for each frame. The swing runs for 600 frames.',
    ['Watch the bob add one trail point per frame.', 'Keep the old trail and swing again: the previous trail stays faded.']);
  const alternatives = planAlternatives(swing, 'Show a pendulum swinging.', () => 9000);
  assert.deepEqual(alternatives.map(a => a.id), ['fewer_markers', 'no_kept_path']);
  for (const a of alternatives) {
    const [shown, every] = a.plan.limitations[0].match(/draws (\d+) markers, one every (\d+) frames/).slice(1).map(Number);
    assert.deepEqual(trailConflicts(a.plan, 600, every, shown, 'frame'), []);
    assert.match(a.plan.description, new RegExp(`trail of ${shown} points, one every ${every} frames\. The swing runs for 600 frames\.`), 'the count and density change; the run does not');
    assert.ok(a.plan.interactions.some(i => i === `Watch the bob add one marker every ${every} frames.`));
    assert.equal(a.plan.assumptions.at(-1), `The trail draws one marker every ${every} frames, at most ${shown} markers; every frame still runs.`);
  }
  // A sentence the rules cannot restate keeps the alternative from being offered at all.
  const stubborn = plan('A bob leaves a dotted trail of 600 points. Every frame without exception gets its own dot on the trail.');
  assert.deepEqual(planAlternatives(stubborn, 'Show a pendulum swinging.', () => 9000), []);
});
