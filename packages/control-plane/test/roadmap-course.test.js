// Create a course (owner 2026-11-14): Generate course makes every card of the accepted plan with no per-card approval. Real routes, store, money, outbox, board save and
// generation (roadmap-workflow-fixture.js); only the outside is doubled. Cards are made one at a time (BE.12) and each next step starts when the card in hand is made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { courseOf } from '../src/roadmap/roadmap-course.js';
import { validateFacts } from '../src/agents/roadmap-facts.js';
import { PLAN, STEPS, deliver, explanation, started, status, table, workflow } from './roadmap-workflow-fixture.js';

const start = (h, view, who = 'alice') => h.send(who, 'POST', `/api/learn/roadmap/${view.roadmap.id}/course/start`, { boardId: h.boards[who], revision: view.roadmap.revision });
const stop = (h, view, who = 'alice') => h.send(who, 'POST', `/api/learn/roadmap/${view.roadmap.id}/course/stop`, { boardId: h.boards[who], revision: view.roadmap.revision });
const stepStates = h => h.rows('SELECT position, state FROM learn_roadmap_steps ORDER BY position').map(r => r.state);
const made = h => h.rows("SELECT id, delivery FROM learn_step_results WHERE decision = 'accepted' AND generation = 'generated' ORDER BY slot_index, created_at");
// Run the outbox until quiet; then place every card made and not yet placed, as the browser does. Repeat until nothing moves.
async function drain(h, { places = true, rounds = 40 } = {}) {
  for (let i = 0; i < rounds; i += 1) {
    await h.run();
    const waiting = places ? made(h).filter(r => r.delivery === 'not_delivered') : [];
    for (const r of waiting) assert.equal((await deliver(h, r.id)).status, 200);
    if (!waiting.length && !(await h.run())) break;
  }
}

test('Generate course makes every card with no per-card approval: one author call per step, one at a time, and the roadmap completes once all are placed', async t => {
  const h = await workflow(t);
  h.facts = { facts: ['Gini impurity was introduced by an Italian statistician in 1912.', 'A node with every sample in one class has a Gini impurity of zero.', 'Entropy is measured in bits when the logarithm is base two.'] };
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h); // Accept plan: the first offer is pending and nothing has been generated or charged
  assert.equal(h.authorCalls.length, 0);
  const began = await start(h, view);
  assert.equal(began.status, 200, JSON.stringify(began.body).slice(0, 300));
  assert.equal(began.body.course.running, true);
  assert.equal(began.body.course.total, STEPS.length);
  await drain(h);
  assert.deepEqual(h.handlerErrors, []);
  assert.equal(h.authorCalls.length, STEPS.length, 'one author call per step, none repeated');
  assert.deepEqual(h.rows("SELECT state FROM learn_step_proposals").map(r => r.state), Array(STEPS.length).fill('accepted'), 'every proposal was accepted by the course, none by a learner click');
  assert.deepEqual(stepStates(h), Array(STEPS.length).fill('delivered'));
  assert.equal(h.rows('SELECT state FROM learn_roadmaps')[0].state, 'completed');
  assert.deepEqual(h.network, [], 'no network call escaped');
});

test('the next step starts when the card in hand is made, not when it is placed: with nothing placed, every step is still made one after another', async t => {
  const h = await workflow(t);
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h);
  assert.equal((await start(h, view)).status, 200);
  await drain(h, { places: false });
  assert.equal(h.authorCalls.length, STEPS.length, 'all five cards were made though the browser placed none');
  assert.equal(made(h).length, STEPS.length);
  assert.equal(made(h).filter(r => r.delivery === 'delivered').length, 0);
  assert.equal(h.rows('SELECT state FROM learn_roadmaps')[0].state, 'active', 'not completed while cards wait to be placed');
  await drain(h);
  assert.equal(h.rows('SELECT state FROM learn_roadmaps')[0].state, 'completed');
});

test('the view tells the progress overlay how far the course is and carries the fun facts', async t => {
  const h = await workflow(t);
  h.facts = { facts: ['Fact one about trees is a plain sentence.', 'Fact two about splits is a plain sentence.', 'Fact three about entropy is a plain sentence.'] };
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h);
  assert.equal((await start(h, view)).status, 200);
  await drain(h, { places: false });
  const after = await status(h);
  assert.equal(after.course.total, STEPS.length);
  assert.equal(after.course.made, STEPS.length);
  assert.equal(after.course.running, true);
  assert.deepEqual(after.course.facts, h.facts.facts, 'the facts for the wait');
  assert.ok(after.steps.every(s => typeof s.section === 'undefined'), 'a plan without sections shows none');
  assert.equal(JSON.stringify(after).includes('micros'), false, 'no prices in the view');
});

test('Cancel stops new cards: the card being made finishes and is placed, the rest are not made', async t => {
  const h = await workflow(t);
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h);
  assert.equal((await start(h, view)).status, 200);
  const cancelled = await stop(h, await status(h));
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body).slice(0, 300));
  assert.equal(cancelled.body.course.running, false);
  assert.equal(cancelled.body.course.stopped, 'cancelled');
  await drain(h);
  const calls = h.authorCalls.length;
  assert.ok(calls >= 1 && calls < STEPS.length, `the run stopped early (${calls} cards)`);
  assert.equal(h.rows("SELECT delivery FROM learn_step_results WHERE decision = 'accepted'").every(r => r.delivery === 'delivered'), true, 'cards already made were placed');
  assert.ok(h.rows("SELECT state FROM learn_roadmap_steps").some(r => r.state === 'planned'), 'the rest stay planned');
  assert.equal(h.rows('SELECT state FROM learn_roadmaps')[0].state, 'active', 'the roadmap stays open so the learner can generate the rest');
});

test('a second Generate course while one runs is refused', async t => {
  const h = await workflow(t);
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h);
  assert.equal((await start(h, view)).status, 200);
  const again = await start(h, await status(h));
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'course_running');
});

test('Generate course is refused before the plan is accepted', async t => {
  const h = await workflow(t);
  const { explain } = await import('./roadmap-workflow-fixture.js');
  await explain(h);
  const view = await status(h);
  const res = await start(h, view);
  assert.equal(res.status, 409);
  assert.equal(h.authorCalls.length, 0);
});

test('facts: valid ones are trimmed and deduplicated, prices and too few are refused', () => {
  assert.deepEqual(validateFacts({ facts: [' One  fact here. ', 'one fact here.', 'Two fact here.', 'Three fact here.'] }), { ok: true, facts: ['One fact here.', 'Two fact here.', 'Three fact here.'] });
  assert.equal(validateFacts({ facts: ['A.', 'B.', 'It costs 5 credits.'] }).ok, false, 'a price word drops the fact and leaves too few');
  assert.equal(validateFacts({}).ok, false);
  assert.equal(courseOf({ scope_json: '{"course":{"running":true}}' }).running, true);
  assert.equal(courseOf({ scope_json: 'not json' }), null);
  assert.ok(PLAN.steps.length === STEPS.length);
});
