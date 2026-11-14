// Create a course (owner 2026-11-14): Generate course makes every card of the accepted plan with no per-card approval. Real routes, store, money, outbox, board save and
// generation (roadmap-workflow-fixture.js); only the outside is doubled. Cards are made one at a time (BE.12) and each next step starts when the card in hand is made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNPLACED_MAX, courseOf } from '../src/roadmap/roadmap-course.js';
import { validateFacts } from '../src/agents/roadmap-facts.js';
import { MIN_WORDS, proseCheck, proseStats } from '../src/roadmap/roadmap-preflight.js';
import { routes } from '../../web/src/roadmap-client.js';
import { KEY, PLAN, STEPS, acceptPlan, calm, deliver, explain, explanation, httpError, started, status, table, unsafe, workflow } from './roadmap-workflow-fixture.js';

const start = (h, view, who = 'alice') => h.send(who, 'POST', `/api/learn/roadmap/${view.roadmap.id}/course/start`, { boardId: h.boards[who], revision: view.roadmap.revision });
const stop = (h, view, who = 'alice') => h.send(who, 'POST', `/api/learn/roadmap/${view.roadmap.id}/course/stop`, { boardId: h.boards[who], revision: view.roadmap.revision });
const stepStates = h => h.rows('SELECT position, state FROM learn_roadmap_steps ORDER BY position').map(r => r.state);
const made = h => h.rows("SELECT id, delivery FROM learn_step_results WHERE decision = 'accepted' AND generation = 'generated' AND validation = 'passed' ORDER BY slot_index, created_at");
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

test('the next step starts when the card in hand is made, not when it is placed, until three made cards wait: then the run waits for the browser (back-pressure)', async t => {
  const h = await workflow(t);
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h);
  assert.equal((await start(h, view)).status, 200);
  await drain(h, { places: false });
  assert.equal(UNPLACED_MAX, 3);
  assert.equal(h.authorCalls.length, UNPLACED_MAX, 'three cards were made though the browser placed none, then the run waited: an absent browser never costs forty cards');
  assert.equal(made(h).filter(r => r.delivery === 'delivered').length, 0);
  assert.equal(h.rows('SELECT state FROM learn_roadmaps')[0].state, 'active', 'not completed while cards wait to be placed');
  await drain(h); // each placement wakes the run
  assert.equal(h.authorCalls.length, STEPS.length);
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
  assert.equal(after.course.made, UNPLACED_MAX);
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

// --- before a course is planned (owner 2026-11-14) -------------------------------------------------------------------------------------------------------------------------

test('a file with under 100 words of prose, or mostly code, is refused in the create request: no roadmap, no model call', async t => {
  const short = await workflow(t, { md: '# Notes\n\nA few words only.\n' });
  const tooShort = await explain(short);
  assert.equal(tooShort.status, 422);
  assert.equal(tooShort.body.code, 'source_too_short');
  assert.match(tooShort.body.error, /too short/);
  assert.deepEqual([short.rows('SELECT id FROM learn_roadmaps').length, short.plannerCalls.length, short.classifierCalls], [0, 0, 0]);
  const code = await workflow(t, { md: `# Script\n\n\`\`\`python\n${'value = compute(value, 3)\n'.repeat(80)}\`\`\`\n\nRun it.\n` });
  const notProse = await explain(code);
  assert.equal(notProse.status, 422);
  assert.equal(notProse.body.code, 'source_not_prose');
});

test('proseStats and proseCheck: prose outside fences counts, front matter, links and code do not, CJK counts two characters a word', () => {
  const body = Array.from({ length: MIN_WORDS }, (_, i) => `word${i}`).join(' ');
  assert.equal(proseCheck(body), null);
  assert.equal(proseCheck(body.split(' ').slice(0, MIN_WORDS - 1).join(' '))?.code, 'source_too_short');
  assert.equal(proseStats(`---\ntitle: x\n---\n${body}`).words, MIN_WORDS, 'front matter is not prose');
  assert.equal(proseStats(`${body}\n\`\`\`js\nconst a = 1;\n\`\`\`\n`).words, MIN_WORDS, 'a fenced block is not prose');
  assert.equal(proseStats(`${body} [site](https://example.com/page) ![pic](a.png)`).words, MIN_WORDS + 1, 'a link keeps its text, not its address');
  assert.equal(proseStats('这是一个很短的句子'.repeat(30)).words, 135, 'CJK: two characters a word');
  assert.equal(proseCheck(`\`\`\`\n${'x = 1\n'.repeat(1200)}\`\`\`\n${body}`)?.code, 'source_not_prose', 'mostly code wins over the word count');
  assert.equal(proseCheck('', {})?.code, 'source_too_short');
  assert.equal(proseCheck('tiny', { minWords: 0 }), null, 'a test seam');
});

test('JEV screens the source once before the first plan: a block is a limitation with no plan and no card; calm plans normally', async t => {
  const blocked = await workflow(t, { classifier: async ({ role }) => (role === 'source' ? unsafe : calm) });
  assert.equal((await explain(blocked)).status, 202);
  const view = await status(blocked);
  assert.equal(view.limitation.code, 'source_unsafe');
  assert.equal(view.planDraft?.steps?.length ?? 0, 0, 'no plan');
  assert.equal(blocked.plannerCalls.filter(c => c.role === 'roadmap_draft').length, 0, 'no planner call was paid for');
  const fine = await workflow(t);
  assert.equal((await explain(fine)).status, 202);
  assert.equal((await status(fine)).planDraft.steps.length, STEPS.length);
  assert.equal(fine.classifierCalls, 1, 'one screen of the source');
});

// --- one course per canvas --------------------------------------------------------------------------------------------------------------------------------------------------

test('Create a course on a new file replaces an unfinished roadmap that is not being made, and never one that is', async t => {
  const h = await workflow(t);
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h); // a plan accepted, no card made
  const second = await explain(h, { key: 'create2' });
  assert.equal(second.status, 202, JSON.stringify(second.body).slice(0, 200));
  assert.deepEqual(h.rows('SELECT state FROM learn_roadmaps ORDER BY created_at, rowid').map(r => r.state), ['ended', 'proposed'], 'the old roadmap is ended, the new one is planned (its plan waits for Accept)');
  assert.equal(h.authorCalls.length, 0, 'nothing was made or charged for the replaced plan');
  assert.notEqual((await status(h)).roadmap.id, view.roadmap.id);
  // A course being made is never replaced.
  const h2 = await workflow(t);
  h2.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const running = await started(h2);
  assert.equal((await start(h2, running)).status, 200);
  const refused = await explain(h2, { key: 'create2' });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, 'course_running');
  assert.equal(h2.rows("SELECT state FROM learn_roadmaps WHERE state = 'ended'").length, 0);
});

test('a plan that was paused can still Generate course: the first offer resumes it', async t => {
  const h = await workflow(t);
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h);
  assert.equal((await h.route('alice', routes.cancelProposal(view, KEY('cancel')))).status, 200);
  assert.equal(h.rows('SELECT state FROM learn_roadmaps')[0].state, 'paused');
  assert.equal((await start(h, await status(h))).status, 200);
  await drain(h);
  assert.equal(h.authorCalls.length, STEPS.length - 1, 'the cancelled first step stays cancelled; the other four are made');
  assert.deepEqual(h.handlerErrors, []);
});

// --- stop rules, Try again ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a card that could not be made leaves the course open with Try again; Try again makes only that card and the roadmap then completes', async t => {
  const h = await workflow(t);
  h.script.push(explanation(), httpError(500), explanation(), explanation(), explanation());
  const view = await started(h);
  assert.equal((await start(h, view)).status, 200);
  await drain(h);
  const after = await status(h);
  assert.equal(after.roadmap.state, 'active', 'not completed while a card is missing');
  assert.equal(after.course.running, false);
  assert.equal(after.course.stopped, 'incomplete');
  assert.equal(after.course.failed, 1);
  assert.equal(after.course.made, STEPS.length - 1);
  assert.equal(h.authorCalls.length, STEPS.length);
  h.script.push(table()); // step 2 is the table
  const again = await h.send('alice', 'POST', `/api/learn/roadmap/${after.roadmap.id}/course/retry`, { boardId: h.boards.alice, revision: after.roadmap.revision });
  assert.equal(again.status, 200, JSON.stringify(again.body).slice(0, 300));
  assert.equal(again.body.course.running, true, JSON.stringify({ course: again.body.course, steps: stepStates(h), rows: h.rows('SELECT position, state FROM learn_roadmap_steps ORDER BY position') }));
  await drain(h);
  assert.equal(h.authorCalls.length, STEPS.length + 1, 'only the missed card was made again');
  assert.deepEqual(stepStates(h), Array(STEPS.length).fill('delivered'));
  assert.equal(h.rows('SELECT state FROM learn_roadmaps')[0].state, 'completed');
});

test('three cards in a row that could not be made stop the course (a provider outage), with the rest still planned', async t => {
  const h = await workflow(t);
  h.script.push(httpError(500), httpError(500), httpError(500), explanation(), explanation());
  const view = await started(h);
  assert.equal((await start(h, view)).status, 200);
  await drain(h);
  const after = await status(h);
  assert.equal(after.course.stopped, 'failures');
  assert.equal(after.course.running, false);
  assert.equal(h.authorCalls.length, 3, 'no fourth attempt');
  assert.equal(stepStates(h).filter(s => s === 'planned').length, 2, JSON.stringify(stepStates(h)));
});

test('cards withheld for safety stop the course after two in a row; a learner\'s own signs of danger stop it at once', async t => {
  const twice = await workflow(t, { classifier: async ({ role }) => (role === 'output' ? unsafe : calm) });
  twice.script.push(explanation(), table(), explanation(), explanation(), explanation());
  assert.equal((await start(twice, await started(twice))).status, 200);
  await drain(twice);
  assert.equal((await status(twice)).course.stopped, 'safety');
  assert.equal(twice.authorCalls.length, 2, 'two withheld cards, then the run stopped');
  const danger = await workflow(t, { classifier: async ({ role }) => (role === 'learner' ? { ...calm, scores: { ...calm.scores, self_harm_personal: 0.95 } } : calm) });
  danger.script.push(explanation(), table(), explanation(), explanation(), explanation());
  assert.equal((await start(danger, await started(danger))).status, 200);
  await drain(danger);
  assert.equal((await status(danger)).course.stopped, 'safety');
  assert.equal(danger.authorCalls.length, 1, 'one card, then no more');
});

test('a file edited after the plan stops the course with its own reason', async t => {
  const h = await workflow(t);
  h.script.push(explanation(), table(), explanation(), explanation(), explanation());
  const view = await started(h);
  assert.equal((await start(h, view)).status, 200);
  await drain(h, { places: false }); // three made, the run waits
  h.sqlite.prepare("UPDATE file_sources SET sha256 = 'changed-after-the-plan'").run();
  await drain(h);
  const after = await status(h);
  assert.equal(after.course.stopped, 'source_changed');
  assert.equal(after.course.running, false);
});

// --- found on the first live run (owner 2026-11-14): a course card must be priced and authored on Gemini Flash whatever the global /explain profile is ----------------------------------------

test('a roadmap card is quoted and priced on Gemini Flash even when EXPLANATION_MODEL_PROFILE is a fast-chain profile (it was unpriced, so no card could start)', async () => {
  const rec = { format: 'explanation', passageText: 'A decision tree asks questions.', documentText: 'A decision tree asks questions. '.repeat(20), stepTitle: 'Decision Tree Basics', stepGoal: 'Know what a tree is', claimsToCover: ['A tree asks questions'], outcome: 'Explain trees',
    learnerInstruction: { original: '', revisions: [] }, teachingScope: { kind: 'whole' }, depth: 'balanced', sourceRef: null };
  const { quoteRoadmapCard } = await import('../src/roadmap/roadmap-generate.js');
  for (const profile of [undefined, 'google-low', 'fireworks-low', 'cerebras-medium']) {
    const quote = await quoteRoadmapCard({ EXPLANATION_MODEL_PROFILE: profile, GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', CEREBRAS_API_KEY: 'x' }, rec);
    assert.equal(quote.outcome, 'quoted', `${profile}: ${quote.code}`);
    assert.deepEqual([quote.provider, quote.model], ['google', 'gemini-3.5-flash-lite'], String(profile));
    assert.ok(quote.boundMicros > 0);
    assert.equal(quote.profile.id, 'plan-gemini', 'the accepted request binds the roadmap card profile');
  }
});
