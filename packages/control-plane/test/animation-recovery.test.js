// The /animation recovery flow (owner MVP blocker, 2026-11-01): every failure class ends with one plain explanation in the canvas
// Chat and on the card, from recorded data only, and with actions that work: an automatic retry of a transient stage, Try again or
// Render again where the build can go on, and Revise plan (a new job with its own ceiling, its plan reviewed and Generate admitted
// again) where it cannot. Stub pipeline and fake provider only: no model is reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { failureClass, failureText } from '../src/animation-job.js';
import { sha256Hex } from '../src/learn-grade-jev.js';
import { AnimationPolicyError } from '../src/animation-policy.js';
import { NEEDS_PROPOSAL, PLAN, STUB_PIPELINE, animationStack, postedProposal, rows } from './animation-fixture.js';

const skip = NEEDS_PROPOSAL;
// aj_41cfeac (the owner's SGD request): both candidates failed only validateStage's request-fit preflight.
const SGD_PROBLEMS = ['this artifact (18714 bytes with its program) is too large for the repair request: use fewer nodes, shorter labels or a shorter program'];
const tooLarge = () => STUB_PIPELINE({ validate: async () => ({ problems: SGD_PROBLEMS, category: 'spec', repairable: true }) });
const failures = s => rows(s.sqlite, 'messages').filter(m => /was not finished/.test(m.content));

test('size limit after its one correction: the saved SGD failure explained once in Chat and on the card, with Revise plan', { skip }, async t => {
  const s = animationStack(t, { pipeline: tooLarge() });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason, done.repairs, failureClass(done)], ['failed', 'rounds', 1, 'size_limit']);
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'repair'], 'the same unsuccessful repair is never sent again');
  const { job } = await s.job(id);
  assert.deepEqual(job.recovery, ['revise_plan', 'edit_request']);
  assert.equal(job.failure.message, `The scene was too large to check. It was corrected automatically once, but it still did not pass. Revise plan prepares a simpler plan from your request for you to review, using up to ${Math.ceil(done.reservation.preparationMicros / 10000)} AI credits; nothing is built until you press Generate.`);
  const posted = failures(s);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].content, `"${PLAN.title}" was not finished. ${job.failure.message} Your request and plan are kept.`);
  assert.equal(posted[0].thread_id, done.threadId, 'in the thread that holds the plan');
  assert.doesNotMatch(posted[0].content, /bytes|repair request|\$|nodes/, 'no raw finding, size or dollar amount');
  // Polling, a reload (a new object on the same storage) and its alarms never post it again.
  await s.job(id); await s.run(id); await s.run(id, s.object());
  assert.equal(failures(s).length, 1);
});

test('Revise plan: one new job for the same card and request, its revised plan reviewed in Chat, Generate admitted again; repeated presses make no second job', { skip }, async t => {
  let revisedFor = null;
  const s = animationStack(t, { pipeline: tooLarge(), reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { id, done } = await s.generated();
  // The fixed pipeline from here: the planner drops the parameter, and the new build passes.
  s.actor.pipeline = STUB_PIPELINE({ prepare: async (job, ctx) => { revisedFor = job.refinement; await ctx.call('brief', { system: 'brief', tool: { name: 'x', input_schema: { type: 'object' } }, content: job.prompt }); return { plan: { ...job.plan, parameters: [] } }; } });
  const [a, b] = [await s.send('retry', { expectedAttempt: 1, action: 'revise_plan' }, id), await s.send('retry', { expectedAttempt: 1, action: 'revise_plan' }, id)];
  assert.deepEqual([a.status, b.status, a.body.job.stage, a.body.job.cardId], [202, 200, 'queued', done.cardId]);
  assert.equal(b.body.job.id, a.body.job.id, 'the same new job');
  const next = a.body.job.id;
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 2);
  assert.equal(s.state.data.get('request:req-00000001').id, next, 'the request now names the new job');  // The card's request repeated (a client retry of create) answers the new job, not a third.
  assert.equal((await s.create()).body.job.id, next);
  const waiting = await s.run(next);
  assert.equal(waiting.stage, 'awaiting_approval');
  assert.match(revisedFor, /was too large to check/);
  assert.match(revisedFor, /Keep the learning goal and every parameter/);
  assert.equal(waiting.plan.limitations[0], 'You asked for the Left mass control; this revised plan leaves it out so the animation can be built.');
  const proposal = postedProposal(s.sqlite, next);
  assert.ok(proposal.input.scene.notices.includes(waiting.plan.limitations[0]), 'the dropped control stays in view on the review card');
  assert.ok(rows(s.sqlite, 'messages').some(m => m.content === 'Here is a revised plan for your animation. Generate makes it.'));
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'repair', 'brief'], 'nothing is built before Generate');
  const pressed = await s.approve(next);
  assert.equal(pressed.status, 202);
  const ready = await s.run(next);
  assert.equal(ready.stage, 'ready', JSON.stringify([ready.failure, ready.findings]));
  // The same request reference the card was bound to when it was placed, so the result lands on that card.
  assert.equal(ready.result.requestRef, (await sha256Hex('req-00000001|Show why a lever balances.')).slice(0, 16));
  assert.equal(ready.result.cardId, done.cardId);
  // The failed job keeps its record; a press after the new job finished still answers that job, never a third.
  assert.equal(s.stored(id).stage, 'failed');
  assert.equal((await s.send('retry', { expectedAttempt: 1, action: 'revise_plan' }, id)).body.job.id, next);
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 2);
});

test('an action the job no longer offers is refused, never swapped for another; Try again is not offered past the ceiling', { skip }, async t => {
  const s = animationStack(t, { pipeline: tooLarge() });
  const { id } = await s.generated();
  for (const action of ['new_attempt', 'retry_render', 'edit_request']) {
    const r = await s.send('retry', { expectedAttempt: 1, action }, id);
    assert.deepEqual([r.status, r.body.code], [409, 'recovery_stale'], action);
  }
  // An older client (no action) is never moved into a paid revision.
  assert.equal((await s.send('retry', { expectedAttempt: 1 }, id)).status, 409);
  assert.equal(s.stored(id).successor, undefined);
  // A capability gap offers only Edit.
  const g = animationStack(t, { pipeline: STUB_PIPELINE({ author: async () => ({ gap: { capability: 'animation', needs: ['other'], source: 'author', reason: 'x', message: 'This animation needs something that is not available yet, so edit the request.' } }) }) });
  const gap = await g.generated();
  assert.deepEqual((await g.job(gap.id)).job.recovery, ['edit_request']);
  assert.equal((await g.send('retry', { expectedAttempt: 1, action: 'revise_plan' }, gap.id)).status, 409);
  assert.equal(failures(g).length, 1);
});

test('review rejections after both corrections: the review findings by area, never their text', { skip }, async t => {
  let validations = 0;
  const s = animationStack(t, { reply: role => (role === 'review' ? { accepted: false } : {}),
    pipeline: STUB_PIPELINE({ validate: async (...a) => (validations++ === 0 ? { problems: ['nodes.d0 is not a node of this artifact'], repairable: true } : STUB_PIPELINE().validate(...a)) }) });
  const { id } = await s.generated();
  const { job } = await s.job(id);
  assert.deepEqual([job.stopReason, job.recovery], ['rounds', ['revise_plan', 'edit_request']]);
  assert.match(job.failure.message, /^The visual review found 1 serious problem with how the scene is drawn or computed\. It was corrected automatically twice, but it still did not pass\. Revise plan/);
  assert.doesNotMatch(failures(s)[0].content, /wrong|nodes\.d0/);
});

test('a sample render that fails is rendered once more by itself; failing again it offers Render again, which keeps the artifact', { skip }, async t => {
  let renders = 0;
  const flaky = n => STUB_PIPELINE({ render: async (...a) => { if (renders++ < n) throw Object.assign(new Error('The animation could not be rendered for review (render_failed). Retry rendering.'), { status: 503, code: 'render_failed', category: 'renderer' }); return STUB_PIPELINE().render(...a); }, review: async job => ({ accepted: true, findings: [], artifactHash: job.artifactHash }) });
  const once = animationStack(t, { pipeline: flaky(1) });
  assert.equal((await once.generated()).done.stage, 'ready');
  renders = 0;
  const s = animationStack(t, { pipeline: flaky(2) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.failure.stage, failureClass(done)], ['failed', 'rendering', 'transient']);
  const { job } = await s.job(id);
  assert.deepEqual(job.recovery, ['retry_render', 'edit_request']);
  assert.equal(job.failure.message, 'The sample views could not be rendered. It was retried automatically. Render again renders the built scene again.');
  assert.equal((await s.send('retry', { expectedAttempt: 1, action: 'retry_render' }, id)).status, 202);
  const ready = await s.run(id);
  assert.equal(ready.stage, 'ready');
  assert.deepEqual(s.model.roles(), ['brief', 'author'], 'no reauthoring');
  assert.equal(failures(s).length, 1, 'one message for the one failure');
});

test('budget stops: the build limit offers a revised plan; credits running out keeps the server\'s own words', { skip }, async t => {
  const s = animationStack(t, { pipeline: STUB_PIPELINE({ review: async (job, ctx) => { for (let i = 0; i < 4; i++) await ctx.call('review', { system: 'review', tool: { name: 'x', input_schema: { type: 'object' } }, content: 'x' }); return { accepted: true, artifactHash: job.artifactHash }; } }) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stopReason, failureClass(done)], ['budget', 'limit']);
  assert.deepEqual((await s.job(id)).job.recovery, ['revise_plan', 'edit_request']);
  assert.match((await s.job(id)).job.failure.message, /^The build reached its spending limit\. Revise plan/);
  const c = animationStack(t, { pipeline: STUB_PIPELINE({ author: async () => { throw Object.assign(new Error('Not enough AI credits.'), { status: 429, code: 'spend_refused' }); } }) });
  const out = await c.generated();
  assert.equal(failureClass(out.done), 'credits');
  const { job } = await c.job(out.id);
  assert.deepEqual(job.recovery, ['new_attempt', 'edit_request']);
  assert.equal(job.failure.message, 'Not enough AI credits. Try again continues from where it stopped.');
});

test('an interrupted call is never resent by itself: Try again within the ceiling, explained once', { skip }, async t => {
  const s = animationStack(t, { reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { body } = await s.create();
  await s.run(body.job.id);
  await s.approve(body.job.id);
  // The isolate died during the author call: its record says running, nothing in this object is running it.
  await s.actor.alarm();
  const stuck = s.state.data.get(`job:${body.job.id}`);
  Object.assign(stuck, { inFlight: { key: 'k', role: 'author', at: Date.now() } });
  stuck.calls.push({ key: 'k', role: 'author', phase: 'generation', status: 'running', boundMicros: 1 });
  const done = await s.run(body.job.id, s.object());
  assert.deepEqual([done.stage, failureClass(done), done.autoRetried], ['failed', 'transient', undefined]);
  const { job } = await s.job(body.job.id);
  // Uncertain settlement: the call's outcome was never recorded (status unknown), so its charge is not known and zero is not promised.
  assert.equal(s.stored(body.job.id).calls.at(-1).status, 'unknown');
  assert.equal(job.failure.message, 'An AI step was interrupted. It may have used AI credits. Try again continues from where it stopped.');
  assert.deepEqual(failures(s).map(m => m.content), [`"${PLAN.title}" was not finished. ${job.failure.message} Your request and plan are kept.`]);
});

// Owner 2026-11-02: a billed reply the job cannot use (output limit, invalid turn) is not an interruption, and its credits stay used.
test('a billed reply that cannot be used says so and names the credits its call settled, on the card and in Chat alike', { skip }, async t => {
  const s = animationStack(t);
  const inner = globalThis.fetch; // the fake provider; restored by its own t.after
  globalThis.fetch = async (url, options) => {
    const response = await inner(url, options), body = JSON.parse(options.body);
    return (body.system[0]?.text ?? body.system) === 'author' ? Response.json({ ...(await response.json()), stop_reason: 'max_tokens' }) : response;
  };
  const { id, done } = await s.generated();
  const call = done.calls.find(c => c.role === 'author');
  assert.deepEqual([done.failure.category, done.failure.code, failureClass(done), call.status], ['model_output', 'output_limit', 'transient', 'failed']);
  assert.ok(call.costMicros > 0, 'the reply was billed and its cost recorded');
  // The usage record agrees: the learner's attempt settled at that cost, nothing refunded.
  const attempt = rows(s.sqlite, 'usage_attempts').at(-1); // brief, then author
  assert.deepEqual([attempt.cost_state, attempt.cost_micros], ['settled', call.costMicros]);
  const used = Math.ceil(call.costMicros / 10000);
  const { job } = await s.job(id);
  assert.match(job.failure.message, new RegExp(`^The AI answer could not be used\\. It used ${used} AI credits?\\. Revise plan`));
  assert.doesNotMatch(job.failure.message, /not charged|interrupted/);
  assert.deepEqual(failures(s).map(m => m.content), [`"${PLAN.title}" was not finished. ${job.failure.message} Your request and plan are kept.`]);
  // The same for a reply whose call settled and whose content the stage then refused (animation-author.js: no artifact).
  const tool = { name: 'animation_out', input_schema: { type: 'object' } };
  const a = animationStack(t, { pipeline: STUB_PIPELINE({ author: async (j, ctx) => { await ctx.call('author', { system: 'author', tool, content: 'x' }); throw new AnimationPolicyError('invalid_turn', 'The author returned no artifact.'); } }) });
  const refused = (await a.generated()).done;
  assert.deepEqual([refused.failure.category, refused.calls.at(-1).status], ['model_output', 'settled']);
  assert.match(failureText(refused), /^The AI answer could not be used\. It used \d+ AI credits?\./);
});

test('failureText on saved records maps every class without quoting stored findings', () => {
  const base = { stage: 'failed', counts: { author: 1, review: 0, repair: 1 }, repairs: 1, findings: [], approval: { at: 1 }, plan: PLAN, reservation: { preparationMicros: 254800 }, attempt: 1 };
  assert.equal(failureText({ ...base, stopReason: 'deadline', failure: { stage: 'reviewing', category: 'internal', message: 'This animation reached its time limit.' } }),
    'The build ran out of time. It was corrected automatically once. Revise plan prepares a simpler plan from your request for you to review, using up to 26 AI credits; nothing is built until you press Generate.');
  assert.equal(failureText({ ...base, approval: null, stopReason: 'error', failure: { stage: 'preparing', category: 'transport', message: 'No AI model is configured here.', retryable: false } }),
    'An AI step was interrupted. It was corrected automatically once.', 'no call recorded for the step: nothing is said about charges');
  assert.equal(failureText({ ...base, stopReason: 'no_progress', failure: { stage: 'validating', category: 'spec', message: 'x' } }).split('. ').slice(0, 2).join('. '),
    'The scene did not pass its structure checks. An automatic correction changed nothing');
});
