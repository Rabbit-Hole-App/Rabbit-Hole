// INT-03-C01, C02, C05 to C09 (server side): the revision-bound approval of a reviewed scene plan, through the real ExplainJobs object, the real signed
// proposal and its one atomic state, with scripted model replies only (no paid call, no network). The builder seam (ctx.buildScene) is a counter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designAuthorSchema } from '../src/agents/interact-design-author.js';
import { reviseProposal, signProposal } from '../src/generation-proposal.js';
import { ScenePlanSchema } from '../../web/src/interact-plan.js';
import { OWNER, PLAN, clone, designStack, postedProposal, review, revision, rows } from './interact-design-fixture.js';
import { BOARD_B, spent } from './explain-fixture.js';

test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

const edited = (plan, title) => ({ ...clone(plan), title });
// A stack with a reviewed plan waiting for Generate.
async function ready(t, options) {
  const s = designStack(t, options);
  const { body } = await s.create(), id = body.job.id;
  const { job } = await s.design(id);
  assert.equal(job.stage, 'awaiting_approval');
  return { s, id, proposal: postedProposal(s.sqlite, id) };
}
const proposalState = s => JSON.parse(rows(s.sqlite, 'chat_message_meta')[0].meta_json).proposalState;
const stage = (s, id) => s.state.data.get(`job:${id}`).stage;
// One alarm after Generate runs the build seam (the counter is the builder) and hands its output to the legacy validating stage.
const build = async (s, id) => { await s.actor.alarm(); return s.state.data.get(`job:${id}`); };

test('the signed proposal carries the plan identity: scene_plan_version 1, scene_plan_hash, profile_hash and the job, canvas, owner and revision bindings', async t => {
  const { s, id, proposal } = await ready(t);
  const job = s.state.data.get(`job:${id}`), d = job.design;
  assert.deepEqual([proposal.command, proposal.title, proposal.description, proposal.settings], ['explain', PLAN.standard.title, PLAN.standard.cardDescription, { presentation: 'time' }]);
  assert.deepEqual(proposal.input, { org: 'acme', app: 'canvas-a', job: id, brief_hash: d.finalHash, scene_plan_version: 1, scene_plan_hash: d.finalHash, profile_hash: job.flow.profile.hash, runtime_binding_hash: d.runtimeHash,
    approval_hash: d.approvalHash, plan_revision: 1, board: 'board-1', revision: job.revision, generation_reserve_micros: job.reservation.generationMicros, request: 'Explain a pendulum.' });
  for (const key of ['scene_plan_hash', 'runtime_binding_hash', 'approval_hash']) assert.match(proposal.input[key], /^[0-9a-f]{64}$/);
  assert.equal(proposal.usage.reserve_credits, Math.ceil(Number((job.reservation.generationMicros / 1e6 * 100).toFixed(6))), 'the card shows the new profile\'s generation bound');
  // The full validated plan is resolved through the authenticated job route, and only for its owner.
  const view = (await s.send('get', {}, id)).body;
  assert.deepEqual(view.scenePlan.plan, PLAN.standard);
  assert.equal((await s.send('get', {}, id, { ...OWNER, email: 'other@example.com' })).status, 404);
  assert.equal(proposal.input.approval_hash === d.approvalHash, true);
});

test('Steps is not a new-plan author choice; legacy Steps settings stay valid for legacy proposals', () => {
  assert.deepEqual(designAuthorSchema().properties.mode.properties.kind.enum, ['static', 'time', 'experiment']);
  const steps = clone(PLAN.standard); steps.mode.kind = 'steps';
  assert.equal(ScenePlanSchema.safeParse(steps).success, false);
});

test('early Generate is refused while the design runs: nothing is consumed and no builder is called', async t => {
  const s = designStack(t);
  const { body } = await s.create(), id = body.job.id;
  await s.actor.alarm(); await s.actor.alarm();             // designing, then reviewing
  const early = await signProposal(s.env, { command: 'explain', title: 'x', description: 'y', settings: { presentation: 'time' }, source_refs: [], input: { org: 'acme', app: 'canvas-a', job: id, scene_plan_version: 1, scene_plan_hash: 'a'.repeat(64) } }, OWNER.email);
  const refused = await s.send('approve', { proposal: early }, id);
  assert.deepEqual([refused.status, refused.body.code], [409, 'plan_not_ready']);
  assert.equal((await s.approve(id)).status, 409, 'there is no proposal to send yet');
  assert.equal(s.built.length + s.model.builder.length, 0);
  assert.deepEqual(rows(s.sqlite, 'chat_message_meta'), [], 'no proposal exists before the design is complete');
  const { job } = await s.design(id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.equal((await s.approve(id)).status, 202, 'the reviewed plan is then approvable');
});

test('only the exact current final plan is approved: an Edit voids the old approval and the new revision has its own hash', async t => {
  const { s, id, proposal: first } = await ready(t, { script: { author: (n) => (n === 1 ? clone(PLAN.standard) : edited(PLAN.standard, 'Why a ball at its top still accelerates')) } });
  const edit = await s.send('refine', { message: 'Title it as a question about acceleration.', proposal: first }, id);
  assert.deepEqual([edit.status, edit.body.job.stage], [202, 'design_authoring']);
  assert.equal(s.state.data.get(`job:${id}`).approval, null);
  const stale = await s.send('approve', { proposal: first }, id);
  assert.deepEqual([stale.status, stale.body.code], [409, 'plan_not_ready'], 'the old proposal cannot approve a plan under revision');
  const { job } = await s.design(id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.equal(s.model.log.filter(c => c.role === 'author')[1].input.edit, 'Title it as a question about acceleration.', 'the edit goes back through design with the learner\'s words');
  assert.equal(s.model.log.filter(c => c.role === 'author')[1].input.previous.title, PLAN.standard.title);
  const second = postedProposal(s.sqlite, id);
  assert.deepEqual([second.proposal_id, second.version, second.input.plan_revision], [first.proposal_id, 2, 2]);
  assert.notEqual(second.input.approval_hash, first.input.approval_hash);
  assert.notEqual(second.input.scene_plan_hash, first.input.scene_plan_hash);
  const old = await s.send('approve', { proposal: first }, id);
  assert.equal(old.status, 409, 'the first revision no longer approves');
  assert.equal(s.built.length, 0);
  const ok = await s.send('approve', { proposal: second }, id);
  assert.equal(ok.status, 202);
  assert.equal((await build(s, id)).stage, 'validating');
  assert.equal(s.built.length, 1);
  assert.equal(s.state.data.get(`job:${id}`).approval.planRevision, 2);
});

test('concurrent Edit and Generate: exactly one wins, in either order, and at most one build results', async t => {
  const a = await ready(t);
  const [generate, edit] = await Promise.all([a.s.approve(a.id), a.s.send('refine', { message: 'Make it shorter.', proposal: a.proposal }, a.id)]);
  assert.deepEqual([generate.status, edit.status, edit.body.code], [202, 409, 'brief_stale'], 'Generate landed first: the Edit finds the plan already approved');
  assert.equal((await build(a.s, a.id)).stage, 'validating');
  assert.equal(a.s.built.length, 1);
  const b = await ready(t);
  const [edit2, generate2] = await Promise.all([b.s.send('refine', { message: 'Make it shorter.', proposal: b.proposal }, b.id), b.s.approve(b.id)]);
  assert.deepEqual([edit2.status, generate2.status, generate2.body.code], [202, 409, 'plan_not_ready'], 'the Edit landed first: Generate finds the plan under revision');
  await b.s.design(b.id);
  assert.equal(b.s.built.length, 0, 'the old approval built nothing');
  const again = await b.s.approve(b.id);
  assert.equal(again.status, 202);
  await build(b.s, b.id);
  assert.equal(b.s.built.length, 1);
});

test('double Generate consumes the proposal once and starts one build, also after a restart', async t => {
  const { s, id, proposal } = await ready(t);
  const [one, two] = await Promise.all([s.approve(id), s.approve(id)]);
  assert.deepEqual([one.status, two.status], [202, 200], 'the second press finds the first and changes nothing');
  assert.equal(one.body.job.id, two.body.job.id);
  assert.deepEqual(proposalState(s).used, { version: 1, key: id }, 'consumed once, by this job\'s press key');
  const again = await s.send('approve', { proposal }, id, OWNER, s.object());
  assert.equal(again.status, 200);
  for (let i = 0; i < 2; i++) await s.actor.alarm();          // the build seam, then the legacy validating stage on its output
  assert.equal(s.built.length, 1, 'one build for all of them');
  assert.equal(s.state.data.get(`job:${id}`).counts.author, 0, 'the legacy author role was never called');
  assert.equal(s.model.builder.length, 0);
  assert.equal((await s.send('approve', { proposal }, id)).status, 200, 'a Generate after the build started is idempotent');
  assert.equal(s.built.length, 1);
});

test('zero builder calls before approval and the approval binds the job to the plan it consumed', async t => {
  const { s, id } = await ready(t);
  for (let i = 0; i < 3; i++) await s.actor.alarm();         // a waiting job does nothing
  assert.deepEqual([s.built.length, s.model.builder.length, s.model.log.length], [0, 0, 3]);
  const job = s.state.data.get(`job:${id}`);
  assert.equal(job.stage, 'awaiting_approval');
  await s.approve(id);
  const approved = s.state.data.get(`job:${id}`);
  assert.deepEqual(approved.approval, { scenePlanHash: job.design.finalHash, profileHash: job.flow.profile.hash, planRevision: 1, runtimeHash: job.design.runtimeHash, approvalHash: job.design.approvalHash, at: approved.approval.at });
  assert.deepEqual(approved.settings, { presentation: 'time' }, 'the settings are the plan\'s, not a patch from the card');
  assert.equal(approved.stage, 'authoring');
  assert.equal(s.built.length, 0, 'the build starts on the next step');
  await build(s, id);
  assert.equal(s.built.length, 1);
});

test('Cancel during the design stops later calls and a late model answer cannot revive the proposal', async t => {
  const s = designStack(t);
  const { body } = await s.create(), id = body.job.id;
  await s.actor.alarm(); await s.actor.alarm();               // author done; the reviewer is next
  const release = s.model.hold('review');
  const running = s.actor.alarm();
  for (let i = 0; i < 200 && !s.state.data.get(`job:${id}`).inFlight; i++) await new Promise(r => setTimeout(r, 10));   // until the call is parked at the provider
  assert.equal(s.state.data.get(`job:${id}`).inFlight.role, 'design_review');
  const stopped = await s.send('cancel', {}, id);
  assert.deepEqual([stopped.body.job.stage, stopped.body.job.stopReason], ['cancelled', 'stopped']);
  release(); await running;
  for (let i = 0; i < 4; i++) await s.actor.alarm();
  const job = s.state.data.get(`job:${id}`);
  assert.deepEqual([job.stage, job.design.review, job.inFlight], ['cancelled', null, null], 'the late review was dropped');
  assert.deepEqual(s.model.roles(), ['author', 'review'], 'no design call after Cancel');
  assert.equal(postedProposal(s.sqlite, id), null);
  assert.equal(s.built.length + s.model.builder.length, 0);
  assert.equal(job.calls.find(c => c.role === 'design_review').status, 'settled', 'the call that was already sent still settles');
});

test('Cancel after the proposal exists: Generate is refused and nothing builds', async t => {
  const { s, id, proposal } = await ready(t);
  await s.send('cancel', {}, id);
  const refused = await s.send('approve', { proposal }, id);
  assert.deepEqual([refused.status, refused.body.code], [409, 'plan_stale']);
  assert.equal(proposalState(s).used, null, 'the proposal was not consumed');
  for (let i = 0; i < 3; i++) await s.actor.alarm();
  assert.equal(s.built.length, 0);
});

test('a completed design reloads from storage after a restart with no model call, and is approvable', async t => {
  const { s, id, proposal } = await ready(t);
  const calls = s.model.log.length, restarted = s.object();
  const view = (await s.send('get', {}, id, OWNER, restarted)).body;
  assert.deepEqual(view.scenePlan.plan, PLAN.standard);
  assert.equal(view.job.stage, 'awaiting_approval');
  for (let i = 0; i < 3; i++) await restarted.alarm();
  assert.equal(s.model.log.length, calls, 'reload and waiting call no model');
  assert.equal((await s.send('approve', { proposal }, id, OWNER, restarted)).status, 202);
  await restarted.alarm(); await restarted.alarm();
  assert.equal(s.built.length, 1);
  assert.deepEqual(s.keys(id).map(k => k.split(':').pop()).sort(), ['draft', 'final', 'review', 'revision-1'], 'the saved design records survive');
});

test('a panel whose runtime this server does not seal, even a control-free static one, never reaches Chat: it is a design capability gap', async t => {
  const bad = clone(PLAN.standard), panel = bad.supportingVisuals[0];
  panel.runtime.programTuple = { ...panel.runtime.programTuple, sdkVersion: 'sdk-1' }; panel.runtime.sdkVersion = 'sdk-1';
  assert.deepEqual(panel.parameterBindings, []); assert.deepEqual(panel.observations.length, 1);
  const s = designStack(t, { script: { author: () => clone(bad), revise: () => revision(clone(bad)) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.deepEqual([job.stage, job.stopReason, job.failure.category], ['failed', 'capability_gap', 'capability']);
  assert.match(job.failure.gap.reason, /supportingVisuals\.0\.runtime/);
  assert.equal(postedProposal(s.sqlite, body.job.id), null);
  assert.equal(s.built.length + s.model.builder.length, 0);
});

test('Generate is refused when a panel\'s runtime is no longer buildable, consumes nothing, and works again once it is', async t => {
  const { s, id, proposal } = await ready(t);
  s.env.EXPLAIN_PROGRAM_ENABLED = 'false';                 // the program renderer was switched off after the design
  const refused = await s.send('approve', { proposal }, id);
  assert.deepEqual([refused.status, refused.body.code], [409, 'runtime_unavailable']);
  assert.equal(proposalState(s).used, null);
  assert.equal(stage(s, id), 'awaiting_approval');
  s.env.EXPLAIN_PROGRAM_ENABLED = 'true';
  assert.equal((await s.send('approve', { proposal }, id)).status, 202);
});

test('a proposal edited on its card cannot bypass the reviewed plan: title, description and Steps are refused, never patched into it', async t => {
  const { s, id, proposal } = await ready(t);
  for (const edit of [{ title: 'A title the reviewers never saw' }, { description: 'A description nobody reviewed.' }, { settings: { presentation: 'steps' } }]) {
    const { proposal: next, error } = await reviseProposal(s.env, proposal, edit, OWNER.email, { org: 'acme', app: 'canvas-a' });
    assert.equal(error, undefined, JSON.stringify(edit));
    const refused = await s.send('approve', { proposal: next }, id);
    assert.deepEqual([refused.status, refused.body.code], [409, 'plan_edited'], JSON.stringify(edit));
  }
  assert.equal(proposalState(s).used, null);
  assert.equal(s.built.length, 0);
  const swapped = { ...clone(proposal), title: 'Tampered' };
  assert.equal((await s.send('approve', { proposal: swapped }, id)).body.code, 'proposal_invalid', 'a changed signed field breaks the signature');
});

test('source, user and job access: another learner, another canvas or another job cannot approve', async t => {
  const { s, id, proposal } = await ready(t);
  assert.equal((await s.send('approve', { proposal }, id, { ...OWNER, email: 'other@example.com' })).status, 404);
  const onOtherCanvas = await s.actor.fetch(new Request('https://explain/action', { method: 'POST', body: JSON.stringify({ action: 'approve', id, payload: { proposal }, board: BOARD_B, user: OWNER, origin: 'https://dev.test' }) }));
  assert.equal(onOtherCanvas.status, 404);
  assert.equal((await s.send('approve', { proposal }, 'ej_00000000000000000000000000000000')).status, 404);
  const foreign = await signProposal(s.env, { command: 'explain', title: proposal.title, description: proposal.description, settings: proposal.settings, source_refs: [], input: { ...proposal.input, job: 'ej_other' } }, 'other@example.com');
  assert.equal((await s.send('approve', { proposal: foreign }, id)).status, 409, 'a proposal signed for another learner or job is refused');
  assert.equal(proposalState(s).used, null);
  assert.equal(stage(s, id), 'awaiting_approval');
});

test('Generate that cannot be paid for is refused before the proposal is consumed', async t => {
  const { s, id, proposal } = await ready(t);
  spent(s.sqlite, 46e6);                                    // the learner has about $4 of $50 left; the plan\'s generation bound is more
  const refused = await s.send('approve', { proposal }, id);
  assert.deepEqual([refused.status, refused.body.reason], [429, 'insufficient']);
  assert.equal(proposalState(s).used, null);
  assert.equal(stage(s, id), 'awaiting_approval');
  assert.equal(s.built.length, 0);
});

test('with no injected builder the real build runs: a reply that is not a scene fails the job clearly, and no legacy builder role is called', async t => {
  const s = designStack(t);
  s.deps.buildScene = undefined;                           // the default: interact-job.js builds with the build_author role
  const { body } = await s.create(), id = body.job.id;
  await s.design(id);
  assert.equal((await s.approve(id)).status, 202);
  await s.actor.alarm();
  const job = s.state.data.get(`job:${id}`);
  assert.deepEqual([job.stage, job.stopReason], ['failed', 'error']);
  assert.deepEqual(s.model.builder.map(c => c.tool), ['build_scene', 'build_scene'], 'the build call and its one correction, both by the new build role');
  assert.equal(job.counts.author, 0, 'the legacy author role was never called');
  assert.deepEqual(job.build.counts, { build_author: 2, build_review: 0, build_repair: 0 });
});

test('Edit is limited to five refinements, counted apart from repair rounds and from other counters', async t => {
  const { s, id, proposal: first } = await ready(t);
  let proposal = first;
  for (let i = 1; i <= 5; i++) {
    const edit = await s.send('refine', { message: `Change number ${i}.`, proposal }, id);
    assert.equal(edit.status, 202, `refinement ${i}`);
    assert.equal((await s.design(id)).job.stage, 'awaiting_approval');
    proposal = postedProposal(s.sqlite, id);
    assert.equal(proposal.version, i + 1);
  }
  const sixth = await s.send('refine', { message: 'One more.', proposal }, id);
  assert.deepEqual([sixth.status], [429]);
  const job = s.state.data.get(`job:${id}`);
  assert.deepEqual([job.design.refinements, job.design.rev, job.round, job.counts], [5, 6, 0, { brief: 0, author: 0, review: 0, repair: 0 }]);
  assert.equal(s.model.roles().filter(r => r === 'author').length, 6, 'each refinement is its own author call under its own counters');
  assert.equal((await s.send('approve', { proposal }, id)).status, 202, 'the sixth revision of the plan is still approvable');
});
