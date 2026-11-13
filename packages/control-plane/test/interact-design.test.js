// INT-02-C01, C02 to C08, C11, C12, C15: the Author -> Reviewer -> Reviser design flow with scripted adapters only (no paid call, no network).
// The job tests run the real ExplainJobs object, ledger, chat tables and Anthropic adapter against a scripted provider (interact-design-fixture.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { schemaProblems } from '../src/interact-model-adapters.js';
import { DESIGN_AUTHOR_SYSTEM, designAuthorSchema } from '../src/agents/interact-design-author.js';
import { DESIGN_REVIEW_SYSTEM, TUTOR_SCENE_REVIEWER_PROMPT, designReviewSchema } from '../src/agents/interact-design-review.js';
import { DESIGN_REVISE_SYSTEM, designReviseSchema } from '../src/agents/interact-design-revise.js';
import { DESIGN_BOUNDS, authorDesign, designPromptContracts, freshDesign, planDiff, reviewDesign, runtimeProblems, verifyDesignRevision } from '../src/interact-design.js';
import { INTERACT_LIMITS } from '../src/interact-models.js';
import { OWNER, PLAN, change, clone, designStack, finding, fixtures, postedProposal, review, revision } from './interact-design-fixture.js';

test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

const withText = (plan, patch) => ({ ...clone(plan), ...patch });
const blockedBy = id => (n, input) => review(input.planHash, { verdict: 'revise', findings: [finding(id)] });

// ---- INT-02-C02 to C06: the production prompts map the source guide; versions and hashes are recorded ----
const DOC = readFileSync(new URL('../../../docs/features/interact/references/tutor-scene-examples.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const between = (from, to) => DOC.slice(DOC.indexOf(from), DOC.indexOf(to, DOC.indexOf(from)) + to.length);

test('the Design Author prompt carries the whole narrative, depth and Mode/Controls guide from the examples document, for one author', () => {
  const guide = between('## How to write the story and scene', 'Use **None** when a scene has no UI controls.');
  assert.ok(guide.includes('### Expectations by depth') && guide.includes('### Controls') && guide.length > 4000);
  assert.ok(DESIGN_AUTHOR_SYSTEM.includes(guide), 'the guide is in the prompt verbatim; edit the document and this prompt together');
  assert.match(DESIGN_AUTHOR_SYSTEM, /Story, the Scene, the Mode and the Controls are all outputs of this one call/);
  assert.match(DESIGN_AUTHOR_SYSTEM, /Control selection: choose the smallest useful set/);
  assert.match(DESIGN_AUTHOR_SYSTEM, /control-free static panel still needs one/);
  assert.match(DESIGN_AUTHOR_SYSTEM, /New plans never use Steps/);
  assert.match(DESIGN_AUTHOR_SYSTEM, /reads at most 6 images and always captures the start.*at most 4 other checkpoints/);
});

test('the Design Reviewer prompt keeps the ordered two-part reviewer prompt and adds the contract, blocking semantics and control review', () => {
  const prompt = between('You are an independent reviewer of Tutor scenes.', 'Explain the reason for the order.');
  assert.equal(TUTOR_SCENE_REVIEWER_PROMPT, prompt, 'verbatim from the document');
  assert.ok(DESIGN_REVIEW_SYSTEM.startsWith(prompt));
  const part1 = DESIGN_REVIEW_SYSTEM.indexOf('Part 1. Learning outcome and transfer'), part2 = DESIGN_REVIEW_SYSTEM.indexOf('Part 2. Scene and UI quality');
  assert.ok(part1 > 0 && part2 > part1, 'Part 1 precedes Part 2');
  for (const needle of ['A blocker or major finding means the verdict is revise', 'never overrides an unsupported control', 'simplest appropriate native widget', 'range, default, step and units', 'observable effect', 'fact_needs_evidence', 'visual_needs_render', 'The reviser\'s claim that a finding is fixed is not evidence']) assert.ok(DESIGN_REVIEW_SYSTEM.includes(needle), needle);
  assert.deepEqual(Object.keys(designReviewSchema().properties).slice(0, 3), ['planHash', 'learning', 'sceneQuality'], 'the output schema keeps Part 1 before Part 2');
});

test('the Design Reviser prompt returns the complete plan with a finding-to-change record and explicit control changes', () => {
  for (const needle of ['COMPLETE updated plan, never a patch', 'Controls: preserve, remove or change each control explicitly', 'unchanged with an empty changes list', 'unresolvedFindingIds', 'the server computes the hash and the diff', 'capture_budget: the rendered review reads at most 6 images']) assert.ok(DESIGN_REVISE_SYSTEM.includes(needle), needle);
});

test('each role records a version and a content hash, and every schema accepts what its validator accepts', async () => {
  const contracts = await designPromptContracts(), again = await designPromptContracts();
  assert.deepEqual(Object.keys(contracts), ['design_author', 'design_review', 'design_revise']);
  assert.deepEqual(contracts, again, 'the hash is stable');
  for (const c of Object.values(contracts)) assert.match(c.hash, /^[0-9a-f]{64}$/);
  assert.equal(new Set(Object.values(contracts).map(c => c.hash)).size, 3);
  for (const plan of Object.values(PLAN)) assert.deepEqual(schemaProblems(designAuthorSchema(), plan), []);
  assert.deepEqual(schemaProblems(designReviewSchema(), review('a'.repeat(64))), []);
  assert.deepEqual(schemaProblems(designReviseSchema(), revision(PLAN.deep, [change('f1', 'title')])), []);
  assert.ok(schemaProblems(designAuthorSchema(), (({ mode: _m, ...rest }) => rest)(PLAN.standard)).includes('$.mode: required'));
});

test('the bounds are author 2, reviewer 4, reviser 3 per plan attempt (one extra call each is the correction of a refused answer)', () => {
  assert.deepEqual(DESIGN_BOUNDS, { author: 2, review: 4, revise: 3 });
  assert.deepEqual([INTERACT_LIMITS.calls.design_author, INTERACT_LIMITS.calls.design_review, INTERACT_LIMITS.calls.design_revise], [2, 4, 3]);
});

// ---- INT-02-C01: authorDesign and reviewDesign as units (a scripted ctx.interact, no job) ----
const unit = (output, over = {}) => ({ job: { prompt: 'Is acceleration zero at the top?', depth: 'balanced', context: null, evidence: [], design: { ...freshDesign(), ...over } }, ctx: { capabilities: fixtures.capabilities, interact: async () => ({ output }) } });

test('authorDesign rejects a plan missing Mode or Controls, or changing the requested depth, and never completes or strips it', async () => {
  const { mode: _mode, ...noMode } = PLAN.standard;
  let u = unit(noMode);
  let out = await authorDesign(u.job, u.ctx);
  assert.ok(out.problems.some(p => p.path === 'mode' && p.code === 'missing_field'), JSON.stringify(out.problems));
  const { controls: _controls, ...noControls } = PLAN.standard;
  u = unit(noControls);
  out = await authorDesign(u.job, u.ctx);
  assert.ok(out.problems.some(p => p.path === 'controls' && p.code === 'missing_field'));
  u = unit(withText(PLAN.standard, { controls: [] })); // a timed plan with no playback or scrubber
  out = await authorDesign(u.job, u.ctx);
  assert.ok(out.problems.some(p => p.code === 'timeline_controls_mismatch'));
  u = unit(clone(PLAN.deep));
  out = await authorDesign(u.job, u.ctx);
  assert.deepEqual(out.problems.map(p => p.code), ['depth_changed']);
});

test('authorDesign keeps a well-formed plan whose control the catalogue cannot back, with the binding problems for the reviser', async () => {
  const bad = clone(PLAN.standard);
  bad.controls[0].nativeControlId = 'program.invented_widget';
  const u = unit(bad), out = await authorDesign(u.job, u.ctx);
  assert.equal(out.problems, undefined);
  assert.match(out.planHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(out.bindingProblems.map(p => p.code), ['unknown_native_control']);
});

test('reviewDesign: a blocker or major finding overrides a claimed pass, and a review of a different plan is rejected', async () => {
  const hash = 'a'.repeat(64);
  let u = unit(review(hash, { verdict: 'pass', findings: [finding('f1', 'major')] }), { plan: PLAN.standard, planHash: hash });
  let out = await reviewDesign(u.job, u.ctx);
  assert.deepEqual([out.review.verdict, out.overridden], ['revise', true]);
  u = unit(review(hash, { verdict: 'pass', findings: [finding('f1', 'minor')] }), { plan: PLAN.standard, planHash: hash });
  out = await reviewDesign(u.job, u.ctx);
  assert.deepEqual([out.review.verdict, out.overridden], ['pass', false], 'a minor finding does not block');
  u = unit(review('b'.repeat(64)), { plan: PLAN.standard, planHash: hash });
  assert.equal((await reviewDesign(u.job, u.ctx)).problems[0].code, 'review_plan_mismatch');
});

// ---- INT-02-C08: the server verifies; it never trusts a model hash or a "fixed" flag ----
const verify = (revisionBody, reviewBody = review('x'), plan = PLAN.standard) => verifyDesignRevision(plan, revisionBody, reviewBody, fixtures.capabilities);

test('verifyDesignRevision computes the hash and the diff itself and decides what needs a follow-up review', async () => {
  let v = await verify(revision(clone(PLAN.standard)));
  assert.deepEqual([v.problems, v.diff, v.needsReview], [[], [], false], 'an unchanged plan with no blocking finding closes without another review');
  v = await verify(revision(withText(PLAN.standard, { title: 'Zero velocity is not zero acceleration' })));
  assert.deepEqual([v.diff, v.needsReview], [['title'], false], 'a title-only change is cosmetic');
  v = await verify(revision(withText(PLAN.standard, { cardDescription: 'A tossed ball passes through zero velocity at its top while its acceleration stays -9.8 m/s^2. Scrub through the top and compare.' })));
  assert.deepEqual([v.diff, v.needsReview], [['cardDescription'], true], 'a claim in the description changed');
  const claims = clone(PLAN.standard); claims.claims[0].text = 'Acceleration is -9.8 m/s^2 at every instant, including the top, in this idealized model.';
  assert.equal((await verify(revision(claims))).needsReview, true);
  assert.match(v.planHash, /^[0-9a-f]{64}$/);
  const blocked = await verify(revision(clone(PLAN.standard), [], []), review('x', { verdict: 'revise', findings: [finding('f1')] }));
  assert.deepEqual(blocked.problems.map(p => p.code), ['finding_ignored'], 'a blocking finding must be answered or listed unresolved');
});

test('a revision may answer one of the deterministic checks by its code, as a live reviser answered "description_fit"; any other unknown id is still refused', async () => {
  const checks = [{ path: 'cardDescription', code: 'description_fit', message: 'the description renders in 6 lines at 320 px' }];
  const changed = withText(PLAN.standard, { title: 'New title' });
  const ok = await verifyDesignRevision(PLAN.standard, revision(changed, [change('description_fit', 'title')]), review('x'), fixtures.capabilities, checks);
  assert.ok(!ok.problems.some(p => p.code === 'unknown_finding'), 'answering a deterministic check is not an unknown finding');
  const bad = await verifyDesignRevision(PLAN.standard, revision(changed, [change('invented', 'title')]), review('x'), fixtures.capabilities, checks);
  assert.ok(bad.problems.some(p => p.code === 'unknown_finding'));
});

test('verifyDesignRevision rejects a claimed change that did not happen, unknown ids, a changed depth, and a revision the catalogue cannot back', async () => {
  const f1 = review('x', { verdict: 'revise', findings: [finding('f1')] });
  let v = await verify(revision(clone(PLAN.standard), [change('f1', 'scene.description')]), f1);
  assert.deepEqual(v.problems.map(p => p.code), ['change_not_applied'], 'the reviser said it fixed f1 but the plan is identical');
  v = await verify(revision(withText(PLAN.standard, { title: 'New title' }), [change('f9', 'title')]), f1);
  assert.ok(v.problems.some(p => p.code === 'unknown_finding'));
  v = await verify(revision(clone(PLAN.deep)));
  assert.ok(v.problems.some(p => p.code === 'depth_changed'));
  const bad = clone(PLAN.standard); bad.controls[1].nativeControlId = 'spec.scrubber'; // a spec control on a program scene
  v = await verify(revision(bad));
  assert.ok(v.problems.some(p => p.code === 'incompatible_control'));
  v = await verify(revision(withText(PLAN.standard, { title: 'Fixed' }), [change('f1', 'title')], ['f1']), f1);
  assert.deepEqual(v.unresolved.map(f => f.id), ['f1'], 'listed unresolved: reported, never treated as fixed');
});

test('planDiff lists changed leaf paths and nothing else', () => {
  assert.deepEqual(planDiff(PLAN.standard, PLAN.standard), []);
  const next = clone(PLAN.standard); next.controls[0].label = 'Run'; next.assumptions.push('One more.');
  assert.deepEqual(planDiff(PLAN.standard, next), ['assumptions', 'controls.0.label']);
});

// ---- the per-panel runtime binding (owner rule) against the real sealing ----
test('every panel, including a control-free static support panel, must carry a runtime the server really seals', () => {
  for (const [name, plan] of Object.entries(PLAN)) assert.deepEqual(runtimeProblems(plan, fixtures.capabilities), [], name);
  const standard = clone(PLAN.standard), panel = standard.supportingVisuals[0];
  assert.equal(panel.title, 'Three moments around the top');
  panel.runtime.programTuple = { ...panel.runtime.programTuple, sdkVersion: 'sdk-1', schemaVersion: 1 };
  panel.runtime.sdkVersion = 'sdk-1';
  assert.deepEqual(runtimeProblems(standard, fixtures.capabilities).map(p => [p.path, p.code]), [['supportingVisuals.0.runtime.programTuple', 'tuple_mismatch']], 'sdk-1 is a supported tuple but not what this panel is sealed with');
  const medium = clone(PLAN.standard); medium.supportingVisuals[0].runtime.requiredCapabilities = ['medium_visuals'];
  assert.ok(runtimeProblems(medium, fixtures.capabilities).some(p => p.code === 'tuple_mismatch'), 'medium visuals select sdk-4');
  const helper = clone(PLAN.standard); helper.supportingVisuals[0].runtime.requiredHelpers = ['raster'];
  assert.ok(runtimeProblems(helper, fixtures.capabilities).some(p => p.code === 'unsupported_helper'));
  helper.supportingVisuals[0].runtime.requiredHelpers = ['plot', 'geometry'];
  assert.deepEqual(runtimeProblems(helper, fixtures.capabilities), []);
  const spec = clone(PLAN.overview); spec.scene.runtime.requiredHelpers = ['no_such_component'];
  assert.ok(runtimeProblems(spec, fixtures.capabilities).some(p => p.code === 'unsupported_helper'));
  assert.ok(runtimeProblems(PLAN.standard, { ...fixtures.capabilities, stateful: false }).length === 0, 'schema 1 needs no stateful switch');
});

// ---- INT-02-C09, C10, C15: the flow through the real job ----
const TRACE = new URL('./interact-design-trace.json', import.meta.url);

test('the canonical Standard toss-and-drop runs Author -> Reviewer -> Reviser -> closure to a complete plan before any proposal or builder call (trace)', async t => {
  const s = designStack(t);
  const { body } = await s.create();
  const id = body.job.id, trace = [];
  const snap = (label) => {
    const job = s.state.data.get(`job:${id}`), plan = job.design.plan;
    trace.push({ after: label, stage: job.stage, calls: s.model.roles(), saved: s.keys(id).map(k => k.split(':').slice(2).join(':')),
      plan: plan ? { story: !!plan.story, cardDescription: !!plan.cardDescription, supportingVisuals: plan.supportingVisuals.map(p => p.title), scene: !!plan.scene.description, mode: plan.mode.kind, controls: plan.controls.map(c => c.type) } : null,
      finalized: !!job.design.finalHash, proposal: !!postedProposal(s.sqlite, id), builderCalls: s.model.builder.length + s.built.length });
  };
  snap('create');
  for (let i = 0; i < 12; i++) { await s.actor.alarm(); snap(`alarm ${i + 1}`); if (s.state.data.get(`job:${id}`).stage === 'awaiting_approval') break; }
  const job = s.state.data.get(`job:${id}`);
  assert.equal(job.stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['author', 'review', 'revise'], 'three normal design roles, no conditional review');
  // The plan is complete before the proposal exists, and the proposal exists before nothing else: no builder call anywhere in the trace.
  const first = trace.findIndex(step => step.proposal);
  assert.ok(trace.slice(0, first).every(step => !step.finalized && step.builderCalls === 0));
  assert.deepEqual(trace[first], { ...trace[first], stage: 'awaiting_approval', finalized: true, builderCalls: 0, plan: { story: true, cardDescription: true, supportingVisuals: ['Three moments around the top'], scene: true, mode: 'time', controls: ['playback', 'scrubber'] } });
  const beforeProposal = trace.slice(0, first).filter(step => step.plan);
  assert.ok(beforeProposal.length >= 3 && beforeProposal.every(step => step.plan.story && step.plan.mode && step.plan.controls.length === 2), 'Story, Scene, Mode and Controls exist from the first draft on');
  assert.deepEqual(job.design.plan, PLAN.standard, 'the final plan is the validated Standard fixture, whole');
  assert.equal(s.model.builder.length + s.built.length, 0);
  const golden = JSON.stringify(trace, null, 2) + '\n';
  if (!existsSync(TRACE) || process.env.WRITE_INTERACT_TRACE) writeFileSync(TRACE, golden);
  assert.equal(golden, readFileSync(TRACE, 'utf8').replace(/\r\n/g, '\n'), 'the saved trace (test/interact-design-trace.json) is current');
});

test('each stage saves its output under its own key before the job moves on; the job record keeps only the working set', async t => {
  const s = designStack(t, { script: { revise: (n, input) => revision(withText(input.plan, { cardDescription: 'A tossed ball passes through zero velocity at its top while its acceleration stays -9.8 m/s^2. Scrub through the top and compare the arrows.' })) } });
  const { body } = await s.create(), id = body.job.id;
  await s.actor.alarm(); await s.actor.alarm();                       // queued -> design_authoring -> design_reviewing
  assert.deepEqual(s.keys(id), [`design:${id}:1:draft`], 'the draft is saved when the author is done');
  assert.deepEqual(s.stored(id, 'draft').plan, PLAN.standard);
  await s.actor.alarm();                                              // review
  assert.ok(s.stored(id, 'review').review.planHash, 'the first review is saved');
  await s.actor.alarm();                                              // revise
  assert.ok(s.stored(id, 'revision-1').revision.plan.cardDescription.startsWith('A tossed ball passes through'), 'the complete revised plan is saved, not a patch');
  assert.deepEqual(Object.keys(s.stored(id, 'revision-1').revision.plan).sort(), Object.keys(PLAN.standard).sort());
  const { job } = await s.design(id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.deepEqual(s.keys(id).map(k => k.split(':').pop()).sort(), ['draft', 'final', 'followup-2', 'review', 'revision-1']);
  assert.notEqual(s.stored(id, 'draft').planHash, s.stored(id, 'final').planHash, 'draft and final are different records');
  assert.deepEqual(Object.keys(job.design).filter(k => /draft/i.test(k)), ['draftHash'], 'the record holds the draft hash, not a copy of it');
  assert.equal(job.design.finalHash, s.stored(id, 'final').planHash);
});

test('the reviser returns the complete revised plan, which becomes the final plan after a follow-up review', async t => {
  const fixed = withText(PLAN.standard, { learningGoal: 'Explain why acceleration is not zero when velocity is zero at the top of a throw, with numbers.' });
  const s = designStack(t, { script: { review: (n, input) => (n === 1 ? review(input.planHash, { verdict: 'revise', findings: [finding('f1', 'major', { path: 'learningGoal', category: 'pedagogy' })] }) : review(input.planHash)), revise: () => revision(fixed, [change('f1', 'learningGoal')]) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['author', 'review', 'revise', 'review']);
  assert.deepEqual(job.design.plan, fixed);
  assert.deepEqual(s.model.log[3].input.plan, fixed, 'the follow-up reviewer saw the whole revised plan');
  assert.deepEqual(s.model.log[3].input.previous.changes.map(c => c.findingId), ['f1']);
  assert.equal(s.model.log[3].input.followUp, true);
  assert.deepEqual(job.design.reviews.map(r => [r.followUp, r.blocking]), [[false, 1], [true, 0]]);
});

test('the requested depth is preserved: a reviser that changes it is sent back, a plan that changes it is rejected', async t => {
  const s = designStack(t, { script: { revise: n => (n === 1 ? revision(clone(PLAN.deep)) : revision(clone(PLAN.standard))) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['author', 'review', 'revise', 'revise'], 'the second revision answers the depth problem');
  assert.ok(s.model.log[3].input.deterministicChecks.some(p => p.code === 'depth_changed'));
  assert.ok(s.stored(body.job.id, 'rejected-1').problems.some(p => p.code === 'depth_changed'));
  const wrong = designStack(t, { script: { author: () => clone(PLAN.deep) } });
  const made = await wrong.create();
  const out = await wrong.design(made.body.job.id);
  assert.deepEqual([out.job.stage, out.job.stopReason, out.job.failure.category], ['failed', 'design_invalid', 'spec']);
  assert.match(out.job.failure.message, /depth/);
  assert.equal(postedProposal(wrong.sqlite, made.body.job.id), null);
});

test('a plan missing Mode or Controls stops the design with the missing fields and publishes nothing', async t => {
  const { mode: _mode, controls: _controls, ...partial } = PLAN.standard;
  const s = designStack(t, { script: { author: () => partial } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.deepEqual([job.stage, job.stopReason], ['failed', 'design_invalid']);
  assert.match(job.failure.message, /mode: required/);
  assert.match(job.failure.message, /controls: required|\$\.controls/);
  assert.deepEqual(s.model.roles(), ['author', 'author'], 'one correction call, then no review of an incomplete plan');
  assert.equal(postedProposal(s.sqlite, body.job.id), null);
  assert.equal(s.model.builder.length + s.built.length, 0);
  assert.deepEqual((await s.job(body.job.id)).job.recovery, ['new_attempt', 'edit_request']);
});

test('a plan the schema refuses gets ONE correction call that names the problems; a corrected plan continues to review', async t => {
  const { mode: _mode, ...partial } = PLAN.standard;
  const s = designStack(t, { script: { author: n => (n === 1 ? partial : clone(PLAN.standard)) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['author', 'author', 'review', 'revise']);
  const second = s.model.log.filter(call => call.role === 'author')[1].input;
  assert.match(second.correction.instruction, /WHOLE corrected plan/);
  assert.ok(second.correction.problems.some(problem => /mode/.test(problem)), 'the correction names the missing field');
});

test('a blocking review overrides a claimed pass: the design is revised and reviewed again before it can be offered', async t => {
  const fixed = withText(PLAN.standard, { limitations: ['An idealized vertical throw; real balls feel drag, and the scene shows no drag.'] });
  const s = designStack(t, { script: { review: (n, input) => (n === 1 ? review(input.planHash, { verdict: 'pass', findings: [finding('f1', 'blocker', { path: 'limitations', category: 'fact' })] }) : review(input.planHash)), revise: () => revision(fixed, [change('f1', 'limitations')]) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['author', 'review', 'revise', 'review']);
  assert.deepEqual([job.design.reviews[0].verdict, job.design.reviews[0].overridden], ['revise', true]);
  assert.equal(s.stored(body.job.id, 'review').overridden, true);
});

test('a factual change re-reviews; a cosmetic one does not', async t => {
  const facts = designStack(t, { script: { revise: (n, input) => revision(withText(input.plan, { cardDescription: 'A ball tossed at 3.0 m/s has zero velocity at its top yet an acceleration of -9.8 m/s^2 throughout. Scrub through the top and watch the arrows.' })) } });
  const a = await facts.create();
  assert.equal((await facts.design(a.body.job.id)).job.stage, 'awaiting_approval');
  assert.deepEqual(facts.model.roles(), ['author', 'review', 'revise', 'review']);
  const cosmetic = designStack(t, { script: { revise: (n, input) => revision(withText(input.plan, { title: 'Zero velocity is not zero acceleration at the top' })) } });
  const b = await cosmetic.create();
  assert.equal((await cosmetic.design(b.body.job.id)).job.stage, 'awaiting_approval');
  assert.deepEqual(cosmetic.model.roles(), ['author', 'review', 'revise'], 'a title-only revision closes through deterministic validation');
  assert.equal(cosmetic.state.data.get(`job:${b.body.job.id}`).design.plan.title, 'Zero velocity is not zero acceleration at the top');
});

test('exhausted bounds: author 1, reviewer 4, reviser 3, then a failure that names the findings; never a loop and never a proposal', async t => {
  const s = designStack(t, { script: { review: blockedBy('f1'), revise: (n, input) => revision(withText(input.plan, { story: `${input.plan.story} Revision ${n}.` }), [change('f1', 'story')]) } });
  const { body } = await s.create(), id = body.job.id;
  const { job } = await s.design(id, 60);
  assert.deepEqual([job.stage, job.stopReason, job.failure.category], ['failed', 'design_blocked', 'spec']);
  assert.deepEqual(s.model.roles(), ['author', 'review', 'revise', 'review', 'revise', 'review', 'revise', 'review']);
  assert.deepEqual(job.design.counts, { author: 1, review: 4, revise: 3 });
  assert.match(job.failure.message, /still had 1 blocking finding.*Finding f1/);
  assert.equal(postedProposal(s.sqlite, id), null);
  assert.equal(s.model.builder.length + s.built.length, 0);
  // A further alarm makes no call: the job is terminal.
  await s.actor.alarm(); assert.equal(s.model.log.length, 8);
});

test('a reviser that declares a blocker unresolved ends the design with what is needed; nothing is fabricated', async t => {
  const f = finding('f1', 'blocker', { message: 'The launch speed of the ball is not given in the supplied material.' });
  const s = designStack(t, { script: { review: (n, input) => review(input.planHash, { verdict: 'revise', findings: [f], openChecks: [{ kind: 'fact_needs_evidence', text: 'The launch speed.' }] }), revise: (n, input) => revision(input.plan, [], ['f1']) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.deepEqual([job.stage, job.stopReason], ['failed', 'design_unresolved']);
  assert.match(job.failure.message, /launch speed of the ball is not given/);
  assert.match(job.failure.message, /Add the missing information/);
  assert.deepEqual((await s.job(body.job.id)).job.recovery, ['edit_request'], 'more information is an Edit, not a retry');
  assert.equal(postedProposal(s.sqlite, body.job.id), null);
});

test('an unsettled fact stays open and a visual check is carried to the builder; neither is called passed', async t => {
  const s = designStack(t, { script: { review: (n, input) => review(input.planHash, { openChecks: [{ kind: 'fact_needs_evidence', text: 'The drop distance rests on a 0.10 s sample.' }, { kind: 'visual_needs_render', text: 'The gate and ball must not overlap.' }] }) } });
  const { body } = await s.create(), id = body.job.id;
  const { job } = await s.design(id);
  assert.deepEqual([job.design.open, job.design.carried], [['The drop distance rests on a 0.10 s sample.'], ['The gate and ball must not overlap.']]);
  const view = (await s.send('get', {}, id)).body;
  assert.deepEqual([view.scenePlan.open.length, view.scenePlan.carried.length], [1, 1]);
  assert.ok(postedProposal(s.sqlite, id).limitations.includes('Open question: The drop distance rests on a 0.10 s sample.'));
});

test('a reviewer verdict of gap stops with a capability gap, not a repair loop', async t => {
  const s = designStack(t, { script: { review: (n, input) => review(input.planHash, { verdict: 'gap', findings: [finding('f1', 'blocker', { category: 'capability', message: 'Dragging the ball needs a target control this renderer lacks.' })] }) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.deepEqual([job.stage, job.stopReason, job.failure.category], ['failed', 'capability_gap', 'capability']);
  assert.match(job.failure.gap.reason, /target control/);
  assert.deepEqual(s.model.roles(), ['author', 'review']);
});

test('an unsupported control in the draft is revised before approval; if it cannot be, the job reports a capability gap', async t => {
  const badDraft = () => { const plan = clone(PLAN.standard); plan.controls[0].nativeControlId = 'program.invented_widget'; return plan; };
  const fixes = designStack(t, { script: { author: badDraft, review: (n, input) => (n === 1 ? review(input.planHash, { verdict: 'revise', findings: [finding('f1', 'blocker', { category: 'control', path: 'controls.0.nativeControlId' })] }) : review(input.planHash)), revise: () => revision(clone(PLAN.standard), [change('f1', 'controls.0.nativeControlId')]) } });
  const a = await fixes.create();
  const done = await fixes.design(a.body.job.id);
  assert.equal(done.job.stage, 'awaiting_approval');
  assert.ok(fixes.model.log[1].input.deterministicChecks.some(p => p.code === 'unknown_native_control'), 'the reviewer was told the control is unknown');
  const stuck = designStack(t, { script: { author: badDraft, revise: () => revision(badDraft()) } });
  const b = await stuck.create();
  const out = await stuck.design(b.body.job.id);
  assert.deepEqual([out.job.stage, out.job.stopReason, out.job.failure.category], ['failed', 'capability_gap', 'capability']);
  assert.match(out.job.failure.gap.reason, /unknown_native_control|invented_widget|catalogue/);
  assert.deepEqual(stuck.model.roles(), ['author', 'review', 'revise', 'revise', 'revise'], 'three revisions, then the gap');
});

test('the description-fit receipt gates the plan: a description outside 2 to 4 lines goes back to the reviser, and no receipt service stops the design', async t => {
  const long = withText(PLAN.standard, { cardDescription: `${PLAN.standard.cardDescription} ${PLAN.standard.cardDescription}`.slice(0, 340) });
  const s = designStack(t, { script: { author: () => long, revise: (n, input) => (n === 1 ? revision(input.plan) : revision(withText(input.plan, { cardDescription: PLAN.standard.cardDescription }))) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['author', 'review', 'revise', 'revise', 'review']);
  assert.ok(s.model.log[3].input.deterministicChecks.some(p => p.code === 'description_fit'));
  assert.equal(job.design.plan.cardDescription, PLAN.standard.cardDescription);
  assert.equal(job.design.fit.styleVersion, 'fixture-1', 'the fixture measurement stands in for INT-06-C17');
  const none = designStack(t, { fit: null });
  const b = await none.create();
  const out = await none.design(b.body.job.id);
  assert.deepEqual([out.job.stage, out.job.stopReason, out.job.failure.category], ['failed', 'description_fit_unavailable', 'internal']);
  assert.equal(postedProposal(none.sqlite, b.body.job.id), null);
});

test('capture_budget gates the plan: 7 checkpoints go back to the reviser by code, 4 are accepted', async t => {
  const withCheckpoints = n => ({ ...clone(PLAN.standard), scene: { ...clone(PLAN.standard).scene, checkpoints: Array.from({ length: n }, (_, i) => ({ ...clone(PLAN.standard.scene.checkpoints[0]), id: `c${i}`, time: { op: 'literal', value: 0.05 * (i + 1) } })) } });
  const s = designStack(t, { script: { author: () => withCheckpoints(7), revise: (n, input) => (n === 1 ? revision(input.plan) : revision(withCheckpoints(4), [change('capture_budget', 'scene.checkpoints')])) } });
  const { body } = await s.create();
  const { job } = await s.design(body.job.id);
  assert.equal(job.stage, 'awaiting_approval', JSON.stringify([job.stopReason, job.failure]));
  assert.deepEqual(s.model.roles(), ['author', 'review', 'revise', 'revise', 'review']);
  const refused = s.model.log[3].input.deterministicChecks.find(p => p.code === 'capture_budget');
  assert.match(refused.message, /needs 9/, 'the message names the count');
  assert.match(refused.message, /at most 6 images/, 'and the limit');
  assert.equal(job.design.plan.scene.checkpoints.length, 4);
});

test('a job records its flow, profile and prompt versions at creation and keeps them; the switch is per job', async t => {
  const s = designStack(t);
  const { body } = await s.create(), id = body.job.id;
  const job = s.state.data.get(`job:${id}`);
  assert.deepEqual([job.flow.version, job.flow.switch, job.flow.profile.id, job.flow.profile.version], [1, 'INTERACT_SCENE_PLAN_ENABLED', 'opus-baseline', 1]);
  assert.match(job.flow.profile.hash, /^[0-9a-f]{16}$/);
  assert.deepEqual(Object.keys(job.flow.prompts), ['design_author', 'design_review', 'design_revise']);
  assert.equal(job.stage, 'queued');
  s.env.INTERACT_SCENE_PLAN_ENABLED = 'false';                 // turned off after creation: this job keeps its flow (its calls then refuse, see below)
  assert.equal(s.state.data.get(`job:${id}`).flow.version, 1);
  const legacy = designStack(t);
  legacy.env.INTERACT_SCENE_PLAN_ENABLED = 'false';
  const made = await legacy.create();
  const old = legacy.state.data.get(`job:${made.body.job.id}`);
  assert.equal(old.flow, undefined, 'created with the switch off: the legacy path, for life');
  await legacy.actor.alarm();
  assert.equal(legacy.state.data.get(`job:${made.body.job.id}`).stage, 'preparing');
  legacy.env.INTERACT_SCENE_PLAN_ENABLED = 'true';
  assert.equal(legacy.state.data.get(`job:${made.body.job.id}`).flow, undefined, 'turning the switch on later does not move it');
  assert.equal((await legacy.job(made.body.job.id)).job.flow, undefined);
});

test('with the switch off the new flow makes no call at all (kill switch)', async t => {
  const s = designStack(t);
  const { body } = await s.create();
  s.env.INTERACT_SCENE_PLAN_ENABLED = 'false';
  const { job } = await s.design(body.job.id, 4);
  assert.equal(job.stage, 'failed');
  assert.equal(s.model.log.length, 0, 'callInteractRole refused before anything was sent');
});

test('the public job view speaks in the learner words; the plan is on the authenticated job route only after the design closes', async t => {
  const s = designStack(t);
  const { body } = await s.create(), id = body.job.id;
  await s.actor.alarm(); await s.actor.alarm();
  let view = (await s.send('get', {}, id)).body;
  assert.equal(view.job.designState, 'Reviewing scene design');
  assert.equal(view.scenePlan, undefined);
  await s.design(id);
  view = (await s.send('get', {}, id)).body;
  assert.deepEqual([view.job.designState, view.scenePlan.version, view.scenePlan.hash === s.state.data.get(`job:${id}`).design.finalHash], ['Ready to review', 1, true]);
  assert.deepEqual(view.scenePlan.plan, PLAN.standard);
  assert.equal(JSON.stringify(view.job).includes('Explain a pendulum.'), false, 'the prompt stays private');
  assert.equal((await s.send('list', {})).body.jobs.some(j => 'scenePlan' in j || 'plan' in j), false);
});

// ---- INT-02-C13: interruption and retry are bounded and keep saved work; refinements are counted apart from repairs ----
test('a call interrupted by a restart is recorded unknown and never resent; Retry resumes at the same stage with the saved plan', async t => {
  const s = designStack(t);
  const { body } = await s.create(), id = body.job.id;
  await s.actor.alarm(); await s.actor.alarm();               // the author is done; the reviewer is next
  const release = s.model.hold('review');
  const running = s.actor.alarm();
  for (let i = 0; i < 400 && !(s.state.data.get(`job:${id}`).inFlight && s.model.log.length >= 2); i++) await new Promise(r => setTimeout(r, 10)); // in flight AND sent (the poll alone raced the request under load)
  const restarted = s.object();
  await restarted.alarm();                                      // an in-flight call this object is not running was interrupted
  let job = s.state.data.get(`job:${id}`);
  assert.deepEqual([job.stage, job.failure.category, job.failure.retryable, job.calls.find(c => c.role === 'design_review').status], ['failed', 'transport', true, 'unknown']);
  assert.equal(job.calls.find(c => c.role === 'design_review').costMicros, null, 'an unknown outcome is not booked as zero');
  assert.equal((await s.send('get', {}, id)).body.job.usage.unknown, true);
  assert.equal(s.model.log.length, 2, 'nothing was resent');
  release(); await running;
  assert.equal(s.state.data.get(`job:${id}`).stage, 'failed', 'the late answer of the interrupted call is dropped');
  assert.deepEqual((await s.send('get', {}, id)).body.job.recovery, ['new_attempt', 'edit_request']);
  const retry = await s.send('retry', { expectedAttempt: job.attempt }, id, OWNER, restarted);
  assert.deepEqual([retry.status, retry.body.job.stage], [202, 'design_reviewing']);
  job = s.state.data.get(`job:${id}`);
  assert.deepEqual([job.design.plan.title, job.design.counts.review], [PLAN.standard.title, 1], 'the saved plan and the review count survive');
  for (let i = 0; i < 6 && s.state.data.get(`job:${id}`).stage !== 'awaiting_approval'; i++) await restarted.alarm();
  assert.equal(s.state.data.get(`job:${id}`).stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['author', 'review', 'review', 'revise']);
});

test('Retry after a design that stopped on its own is a fresh plan attempt with its own counts', async t => {
  const { mode: _mode, ...partial } = PLAN.standard;
  const s = designStack(t, { script: { author: n => (n <= 2 ? partial : clone(PLAN.standard)) } });
  const { body } = await s.create(), id = body.job.id;
  const first = await s.design(id);
  assert.deepEqual([first.job.stage, first.job.stopReason, first.job.design.counts.author], ['failed', 'design_invalid', 2]);
  const retry = await s.send('retry', { expectedAttempt: first.job.attempt }, id);
  assert.deepEqual([retry.status, retry.body.job.stage], [202, 'design_authoring']);
  const now = s.state.data.get(`job:${id}`);
  assert.deepEqual([now.design.counts, now.design.attempts], [{ author: 0, review: 0, revise: 0 }, 2]);
  const done = await s.design(id);
  assert.equal(done.job.stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['author', 'author', 'author', 'review', 'revise']);
  assert.equal(done.job.round, 0, 'a design attempt is not a repair round');
});
