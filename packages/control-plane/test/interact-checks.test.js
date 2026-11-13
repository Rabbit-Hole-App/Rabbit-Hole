// INT-05: capture planning, deterministic checks from runtime traces, the independent review of the actual complete card, and bounded repair.
// Programs run in the pinned QuickJS engine in this process (the same engine the learner's card and the review browser use); roles are scripted.
// Expected numbers come from the equations of docs/features/interact.md section 7 (packages/web/src/interact-build-fixtures.js), not from the builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTURE_BUDGET, captureBudgetProblems, planHash, requiredCaptureCount } from '../../web/src/interact-plan.js';
import { resolveTimeline } from '../../web/src/interact-composition.js';
import { G, fixtureDraft, standardOracle, tossDrop } from '../../web/src/interact-build-fixtures.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { RenderError } from '../src/explain-render.js';
import { InteractModelError } from '../src/interact-models.js';
import { interactRepairTool } from '../src/agents/explain-repair.js';
import { validateBuildOutput } from '../src/interact-build.js';
import { compositionLayoutText, lenientFindingText, CHECK_LIMITS, INTERACT_REVIEW_RULES, buildPlanCaptureCases, checkRound, checkSceneAgainstPlan, classifyFailure, repairRound } from '../src/interact-checks.js';
import { fixtureCaptureCard, fixtureContext, fixtureScript } from '../src/interact-fixtures.js';

const { capabilities, plans } = await interactFixtures();
const T = tossDrop(), clone = value => structuredClone(value);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const job = async (name, extra = {}) => ({ id: `job-${name}`, plan: clone(plans[name]), planHash: await planHash(plans[name]), capabilities, ...extra });
const candidate = async (name, edit = d => d, extra = {}) => {
  const draft = fixtureDraft(name); edit(draft);
  const j = await job(name, extra), built = await validateBuildOutput(j, draft, fixtureContext());
  assert.ok(built.artifacts, `the candidate must pass the structural checks: ${JSON.stringify(built.details)}`);
  return { ...j, draft, artifacts: built.artifacts, composition: built.composition };
};
const withSource = (from, to) => d => { assert.ok(d.main.program.source.includes(from), `fixture source has ${from}`); d.main.program.source = d.main.program.source.replace(from, to); };
const capture = fixtureCaptureCard();
const ctxWith = (script = fixtureScript('standard'), extra = {}) => fixtureContext({ script, captureCard: capture, ...extra });
const caught = async (name, edit, oracle) => {
  const j = await candidate(name, edit, { oracle });
  const { cases, probes } = buildPlanCaptureCases(j.plan, j.composition, j.artifacts);
  const captures = await capture({ composition: j.composition, artifacts: j.artifacts, cases: [...cases, ...probes] });
  return { j, cases, probes, captures, ...checkSceneAgainstPlan({ plan: j.plan, composition: j.composition, artifacts: j.artifacts, captures, cases, probes, oracle }) };
};

// ---- capture planning (INT-05-C03, C13) ----
test('Standard capture cases: initial state, the three approved moments and the endpoint, each at its own resolved time', async () => {
  const j = await candidate('standard');
  const { cases, coverage } = buildPlanCaptureCases(j.plan, j.composition, j.artifacts);
  assert.deepEqual(cases.map(c => c.id), ['start', 'cp-before', 'cp-top', 'cp-after', 'end']);
  assert.deepEqual(cases.map(c => c.time), [0, T.apex - 0.1, T.apex, T.apex + 0.1, T.end]);
  assert.deepEqual([coverage.required, coverage.sampled, coverage.omitted, coverage.incomplete], [5, 5, [], false]);
  assert.deepEqual(cases[2].supports, [{ id: 'threeMoments', inputs: {}, time: 0 }], 'the support panel is a snapshot at time zero');
  assert.ok(cases.length <= CHECK_LIMITS.maxCases);
});

test('Deep capture cases resolve the endpoint independently for each tested input state, and boundary values come after the required cases', async () => {
  const j = await candidate('deep');
  const { cases, coverage } = buildPlanCaptureCases(j.plan, j.composition, j.artifacts);
  const end = u => resolveTimeline(j.composition, { launchSpeed: u }).end;
  const byId = Object.fromEntries(cases.flatMap(c => [c, ...c.aliases.map(a => ({ ...c, id: a }))]).map(c => [c.id, c]));
  assert.equal(byId['cp-trialReturn'].time, end(5)); assert.equal(byId['cp-referenceReturn'].time, end(3));
  assert.notEqual(byId['cp-trialReturn'].time, byId['cp-referenceReturn'].time);
  assert.equal(byId['bound-speed-min'].time, end(3), 'a boundary is captured at that state\'s own endpoint'); assert.equal(byId['bound-speed-max'].time, end(5));
  assert.equal(byId['cp-trialTop'].time, 5 / G); assert.deepEqual(byId['bound-speed-min'].supports[0].inputs, { trialSpeed: 3 });
  // Both boundary states are the same states as two approved moments, so they are those captures under a second name, not extra images.
  assert.deepEqual([cases.length, coverage.required, coverage.omitted], [4, 4, []]);
  assert.ok(cases.find(c => c.id === 'cp-referenceReturn').aliases.includes('bound-speed-min') && cases.find(c => c.id === 'cp-trialReturn').aliases.includes('bound-speed-max'));
  assert.equal(new Set(cases.map(c => JSON.stringify([c.inputs, c.time, c.events]))).size, cases.length, 'identical states are one capture');
});

test('the design-time capture count agrees with the build-time capture planner on every reference plan, and the budget is the review image cap', async () => {
  assert.equal(CAPTURE_BUDGET, CHECK_LIMITS.maxCases);
  let compared = 0;
  for (const name of Object.keys(plans)) {
    const plan = plans[name], j = { id: `job-${name}`, plan: clone(plan), planHash: await planHash(plan), capabilities };
    const built = await validateBuildOutput(j, fixtureDraft(name), fixtureContext()).catch(() => null);
    if (!built?.artifacts) continue; // a plan with no fixture build (the declarative Overview) has no planner to compare with
    assert.equal(requiredCaptureCount(plan), buildPlanCaptureCases(plan, built.composition, built.artifacts).coverage.required, name);
    compared += 1;
  }
  assert.ok(compared >= 3, `compared ${compared} plans`);
});

test('capture_budget: a timed plan may name budget minus two distinct checkpoints; repeated states and the start do not count', async () => {
  const base = clone(plans.standard), checkpoints = n => ({ ...base, scene: { ...base.scene, checkpoints: Array.from({ length: n }, (_, i) => ({ ...clone(base.scene.checkpoints[0]), id: `c${i}`, time: { op: 'literal', value: 0.05 * (i + 1) } })) } });
  assert.deepEqual(captureBudgetProblems(checkpoints(4)), []);
  const refused = captureBudgetProblems(checkpoints(5));
  assert.equal(refused[0].code, 'capture_budget'); assert.match(refused[0].message, /at most 6 images.*needs 7.*at most 4 checkpoints/);
  const dup = checkpoints(4); dup.scene.checkpoints.push({ ...clone(dup.scene.checkpoints[0]), id: 'again' }, { ...clone(dup.scene.checkpoints[0]), id: 'atStart', time: { op: 'literal', value: 0 } });
  assert.deepEqual(captureBudgetProblems(dup), [], 'a repeated state and a checkpoint at the start are one capture');
});

test('required coverage that does not fit the image budget is incomplete, never silently dropped; the image cap is not raised', async () => {
  const j = await candidate('standard');
  const many = clone(j.plan); // seven distinct moments: more than one review can carry
  for (let i = 0; i < 4; i += 1) many.scene.checkpoints.push({ ...clone(many.scene.checkpoints[0]), id: `extra${i}`, time: { op: 'literal', value: 0.05 * (i + 1) } });
  const { cases, coverage } = buildPlanCaptureCases(many, j.composition, j.artifacts);
  assert.equal(coverage.incomplete, true); assert.equal(cases.length, CHECK_LIMITS.maxCases); assert.ok(coverage.omitted.length >= 1);
  assert.match(coverage.omitted[0].reason, /required coverage/);
  let captured = 0;
  const ctx = ctxWith(fixtureScript('standard'), { captureCard: async () => { captured += 1; return []; } });
  const status = await checkRound({ ...j, plan: many, planHash: await planHash(many) }, ctx).catch(error => error);
  assert.equal(captured, 0, 'nothing is captured or reviewed for a plan the review cannot cover');
  assert.ok(status.status === 'incomplete' || status.code === 'plan_invalid' || status.code === 'plan_not_approved', JSON.stringify(status.status ?? status.code));
});

// ---- canonical numerical fixtures from the runtime traces (INT-04-C11, section 7) ----
test('Standard toss-and-drop: the runtime traces give +0.98/0/-0.98 m/s, -9.8 m/s^2 throughout, 0.049 m below the peak, and a held ball that does not fall before release', async () => {
  const { problems, captures, cases, coverage } = await caught('standard', d => d, standardOracle());
  assert.deepEqual(problems, []);
  assert.equal(coverage.oracle.checked, 41); assert.deepEqual(coverage.oracle.skipped, []);
  const q = id => captures.find(c => c.caseId === id).trace.quantities, r = id => captures.find(c => c.caseId === id).trace.readouts;
  for (const [id, v] of [['cp-before', 0.98], ['cp-top', 0], ['cp-after', -0.98]]) { near(q(id).velocity, v); near(r(id).tossedVelocity, v); near(q(id).acceleration, -9.8); near(r(id).tossedAcceleration, -9.8); }
  near(q('cp-before').tossedBelowPeak, 0.049); near(q('cp-after').tossedBelowPeak, 0.049); near(q('cp-top').tossedBelowPeak, 0);
  for (const id of ['start', 'cp-before', 'cp-top']) near(q(id).heldDrop, 0, 1e-12); // not falling before release, nor at the instant of release
  near(q('cp-after').heldDrop, 0.049); near(q('cp-after').heldVelocity, -0.98); near(q('end').heldDrop, T.peak);
  near(captures.find(c => c.caseId === 'cp-top').supports.threeMoments.trace.quantities.velocityBefore, 0.98);
  near(captures.find(c => c.caseId === 'cp-top').supports.threeMoments.trace.quantities.velocityAfter, -0.98);
  assert.deepEqual(cases.map(c => captures.find(x => x.caseId === c.id).trace.time), cases.map(c => c.time), 'each capture ran at the card\'s own clock');
});

test('Standard timeline numbers: internal elapsed 0 to 2u/g, display offset -u/g, scrubber about -0.306 to +0.306 s; return times 0.612245 s and 1.020408 s', async () => {
  const j = await candidate('standard'), t = resolveTimeline(j.composition, {});
  near(t.end, 0.612245); assert.equal(t.end, 2 * 3 / G); near(t.displayOffset, -0.306122); near(t.displayStart, -0.306122); near(t.displayEnd, 0.306122);
  assert.deepEqual(t.markers.map(m => m.time), [T.apex - 0.1, T.apex, T.apex + 0.1]); assert.equal(t.playbackRate, 0.1);
  const deep = await candidate('deep');
  near(resolveTimeline(deep.composition, { launchSpeed: 3 }).end, 0.612245); near(resolveTimeline(deep.composition, { launchSpeed: 5 }).end, 1.020408);
  assert.equal(resolveTimeline(deep.composition, { launchSpeed: 5 }).displayOffset, 0);
});

test('pacing never changes the science: the same physics instant draws the same frame under any playback rate', async () => {
  const slow = await candidate('standard'), fast = await candidate('standard', d => { d.main.program.manifest.timeline.playbackRate = 0.1; });
  const faster = clone(slow.plan); faster.mode.timeline.playbackRate = 2; // a different trusted rate on the same equations
  const second = { ...slow, plan: faster, planHash: await planHash(faster) };
  const built = await validateBuildOutput(second, (() => { const d = fixtureDraft('standard'); d.main.program.manifest.timeline.playbackRate = 2; return d; })(), fixtureContext());
  assert.ok(built.composition, JSON.stringify(built.details));
  const once = c => capture({ composition: c.composition, artifacts: c.artifacts, cases: [{ id: 'x', inputs: {}, time: T.apex, events: [] }] });
  const [a] = await once(slow), [b] = await once(built);
  assert.deepEqual(a.trace.quantities, b.trace.quantities); assert.equal(a.trace.frameHash, b.trace.frameHash);
  assert.notEqual(slow.composition.main.timeline.playbackRate, built.composition.main.timeline.playbackRate); assert.ok(fast.composition);
});

// ---- INT-05-C01: wrong candidates are refused ----
test('an intentionally wrong candidate is refused by the numerical checks: sign, unit, and a held ball that falls early', async () => {
  const sign = await caught('standard', withSource('velocity = U - G * t;', 'velocity = -(U - G * t);'), standardOracle());
  assert.ok(sign.problems.some(p => p.code === 'numeric_mismatch' && /velocity/i.test(p.message)), JSON.stringify(sign.problems.slice(0, 2)));
  const unit = await caught('standard', d => { d.main.program.source = d.main.program.source.replace(/-G, tossedAcceleration/g, '-G * 100, tossedAcceleration').replace('acceleration: -G,', 'acceleration: -G * 100,'); }, standardOracle());
  assert.ok(unit.problems.some(p => p.code === 'numeric_mismatch' && /acceleration/.test(p.message)), JSON.stringify(unit.problems.slice(0, 2)));
  const early = await caught('standard', withSource('const fall = Math.max(0, t - APEX)', 'const fall = t'), standardOracle());
  assert.ok(early.problems.some(p => p.code === 'numeric_mismatch' && /heldDrop/.test(p.message) && /cp-before|start/.test(p.message)), JSON.stringify(early.problems.slice(0, 3)));
  assert.match(sign.problems[0].message, /expected/, 'a mismatch says what was expected and what was traced');
});

test('without a trusted oracle the numbers are not claimed: the structural and behavioural checks run and the coverage says so', async () => {
  const { problems, coverage } = await caught('standard', d => d, null);
  assert.deepEqual(problems, []); assert.match(coverage.oracle.note, /no trusted expected values/); assert.equal(coverage.oracle.checked, 0);
  assert.deepEqual(coverage.proseOnly, ['before', 'top', 'after'], 'prose expectations are the reviewer\'s to judge, not asserted');
});

test('a control that changes nothing it claims to affect is refused (Deep launch speed ignored by the program)', async () => {
  const ok = await caught('deep', d => d, null);
  assert.deepEqual(ok.problems, []); assert.deepEqual(ok.coverage.effects.tested, ['speed']);
  const inert = await caught('deep', d => { d.main.program.source = d.main.program.source.replace('U = inputs.launchSpeed', 'U = 5'); }, null);
  assert.ok(inert.problems.some(p => p.code === 'control_no_effect' && /Launch speed/.test(p.message)), JSON.stringify(inert.problems));
});

test('stale captures, unresolved supports and a wrong clock are named, with the case they concern', async () => {
  const good = await caught('standard', d => d, null), { j, cases, probes, captures } = good, check = edit => checkSceneAgainstPlan({ plan: j.plan, composition: j.composition, artifacts: j.artifacts, cases, probes, oracle: null, captures: edit(clone(captures)) }).problems.map(p => p.code);
  assert.ok(check(c => { c[1].compositionHash = 'f'.repeat(64); return c; }).includes('stale_capture'), 'a capture of another candidate');
  assert.ok(check(c => { c[0].bundleHash = 'f'.repeat(64); return c; }).includes('stale_capture'));
  assert.ok(check(c => { delete c[1].supports.threeMoments; return c; }).includes('support_not_captured'));
  assert.ok(check(c => { delete c[2].supports.threeMoments.trace.quantities.velocityTop; delete c[2].supports.threeMoments.trace.readouts.velocityTop; return c; }).includes('readout_not_emitted'));
  assert.ok(check(c => { c[4].trace.time = T.end - 0.2; return c; }).includes('wrong_timeline_endpoint'), 'a program that stopped at an older endpoint');
  assert.ok(check(c => c.slice(1)).includes('capture_missing'));
  assert.ok(check(c => { c[0].completeCard = false; return c; }).includes('capture_not_complete'));
  assert.ok(check(c => { c[3].trace = { error: { code: 'runtime_error' } }; return c; }).includes('program_error'));
  assert.ok(check(c => { c[0].trace.quantities.velocity = NaN; return c; }).includes('quantity_not_finite'));
  assert.ok(check(c => { delete c[1].trace.quantities.velocity; return c; }).includes('quantity_not_reported'), 'a plan quantity the observations use must be in the trace');
});

// ---- INT-05-C05/C06: the reviewer sees the actual complete card of this candidate ----
test('the independent reviewer is given every capture as an image, the approved plan, and the traces; a pass is ready only after the checks', async () => {
  const j = await candidate('standard', d => d, { oracle: standardOracle() }), ctx = ctxWith();
  const out = await checkRound(j, ctx);
  assert.equal(out.status, 'ready', JSON.stringify(out.failure ?? out));
  const review = ctx.adapter.log.find(l => l.role === 'build_review');
  assert.equal(review.images, 5, 'one image per approved moment'); assert.ok(review.system.includes(INTERACT_REVIEW_RULES));
  const text = typeof review.input === 'string' ? review.input : JSON.stringify(review.input);
  assert.ok(text.includes('Approved scene plan') && text.includes(plans.standard.title) && text.includes(plans.standard.cardDescription), 'the approved plan and visible copy');
  assert.ok(text.includes(plans.standard.story.slice(0, 40)), 'the reviewer checks the description against the full Story');
  assert.match(text, /Execution traces/); assert.match(text, /tossedVelocity/); assert.match(text, /Captures to review: start, cp-before, cp-top, cp-after, end/);
  assert.ok(out.captures.every(c => c.compositionHash === j.composition.envelopeHash && c.synthetic === true));
  assert.deepEqual(out.calls.map(c => c.role), ['build_review']);
});

test('a candidate that fails a deterministic check is never sent to the reviewer, and one the reviewer fails is not ready', async () => {
  const wrong = await candidate('standard', withSource('velocity = U - G * t;', 'velocity = -(U - G * t);'), { oracle: standardOracle() }), ctx = ctxWith();
  const out = await checkRound(wrong, ctx);
  assert.equal(out.status, 'failed'); assert.equal(out.failure.stage, 'check'); assert.match(out.failure.problems[0], /numeric_mismatch/);
  assert.equal(ctx.adapter.log.filter(l => l.role === 'build_review').length, 0, 'no review of a card the checks already refused');
  const failing = ctxWith(fixtureScript('standard', { build_review: ({ input }) => ({ captures: (String(input).match(/Captures to review: (.*)/)[1].split(', ')).map((id, i) => ({ id, semantic: i === 2 ? 'fail' : 'pass', visual: 'pass',
    findings: i === 2 ? [{ verdict: 'semantic', category: 'spec', severity: 'major', object: 'velocity-arrow', message: 'The arrow at the top should vanish.', repairable: true }] : [] })) }) }));
  const review = await checkRound(await candidate('standard'), failing);
  assert.equal(review.status, 'failed'); assert.equal(review.failure.stage, 'review'); assert.equal(review.failure.findings[0].target.capture, 'cp-top'); assert.equal(review.review.accepted, false);
  const minor = ctxWith(fixtureScript('standard', { build_review: ({ input }) => ({ captures: (String(input).match(/Captures to review: (.*)/)[1].split(', ')).map(id => ({ id, semantic: 'pass', visual: 'pass', findings: id === 'end' ? [{ verdict: 'visual', category: 'spec', severity: 'blocker', message: 'clipped', repairable: true }] : [] })) }) }));
  assert.equal((await checkRound(await candidate('standard'), minor)).status, 'failed', 'a blocker overrides a claimed pass');
});

test('the layout text says the scrubber follows the inputs when the timeline is an expression of one, with the range at each bound, and says nothing extra when it does not', async () => {
  const controls = await candidate('standard', d => d, { oracle: null }), experiment = await candidate('deep');
  assert.doesNotMatch(compositionLayoutText(controls.plan, controls.composition), /recomputed from the inputs/);
  const text = compositionLayoutText(experiment.plan, experiment.composition);
  assert.match(text, /at the default inputs/); assert.match(text, /recomputed from the inputs, so judge each capture against its own inputs: Launch speed 3 reads 0 to 0\.612245 s/); assert.doesNotMatch(text, /Launch speed 5 reads/, 'a bound that equals the default range is not repeated');
});

test('a review that rejects a capture with only minor findings, or none, still hands the repairer a finding to act on (a live run died as no_progress)', async () => {
  const rejecting = findings => ctxWith(fixtureScript('standard', { build_review: ({ input }) => ({ captures: (String(input).match(/Captures to review: (.*)/)[1].split(', ')).map((id, i) => ({ id, semantic: 'pass', visual: i === 2 ? 'fail' : 'pass', findings: i === 2 ? findings : [] })) }) }));
  const minorOnly = await checkRound(await candidate('standard'), rejecting([{ verdict: 'visual', category: 'spec', severity: 'minor', object: 'label', message: 'The label touches the arrow.', repairable: true }]));
  assert.equal(minorOnly.status, 'failed'); assert.equal(minorOnly.failure.findings.length, 1); assert.match(minorOnly.failure.findings[0].message, /touches the arrow/);
  const none = await checkRound(await candidate('standard'), rejecting([]));
  assert.equal(none.status, 'failed'); assert.equal(none.failure.findings[0].target.capture, 'cp-top'); assert.match(none.failure.findings[0].message, /visual: fail without naming a finding/);
});

test('capture outages and incomplete capture are never ready: an outage recaptures later, a program error is repairable, a missing service stops', async () => {
  const j = await candidate('standard');
  let out = await checkRound(j, ctxWith(fixtureScript('standard'), { captureCard: async () => { throw new RenderError('render_unavailable', 'browser down'); } }));
  assert.equal(out.status, 'render_unavailable'); assert.equal(out.kind.kind, 'render_outage');
  out = await checkRound(j, ctxWith(fixtureScript('standard'), { captureCard: async () => { throw Object.assign(new RenderError('program_error', 'x'), { program: { code: 'runtime_error', diagnostic: 'boom' } }); } }));
  assert.equal(out.status, 'failed'); assert.equal(out.failure.stage, 'render'); assert.match(out.failure.problems[0], /boom/);
  out = await checkRound(j, fixtureContext({ script: fixtureScript('standard') }));
  assert.equal(out.status, 'render_unavailable'); assert.match(out.reason, /no capture service/);
  const partial = await checkRound(j, ctxWith(fixtureScript('standard'), { captureCard: async args => (await capture(args)).map(c => ({ ...c, completeCard: false })) }));
  assert.equal(partial.status, 'failed'); assert.match(partial.failure.problems.join(' '), /capture_not_complete/);
  const swapped = clone(j); swapped.artifacts.supporting[0].artifact.program.source += '\n// swapped';
  const tampered = await checkRound(swapped, ctxWith());
  assert.equal(tampered.status, 'failed'); assert.equal(tampered.failure.stage, 'validate'); assert.match(tampered.failure.problems.join(' '), /swapped|hash/);
  assert.equal((await checkRound(j, ctxWith(fixtureScript('standard'), { signal: AbortSignal.abort() }))).status, 'cancelled');
});

// ---- INT-05-C08/C12: bounded repair that can never change the plan ----
test('one wrong candidate is refused, one bounded repair fixes it, and the repaired candidate passes a fresh capture and review', async () => {
  const fixed = fixtureDraft('standard');
  const script = fixtureScript('standard', { build_repair: () => ({ operation: 'artifacts', main: fixed.main, supporting: fixed.supporting, reason: 'restored the sign of the velocity' }) });
  const wrong = await candidate('standard', withSource('velocity = U - G * t;', 'velocity = -(U - G * t);'), { oracle: standardOracle() });
  const ctx = ctxWith(script), failed = await checkRound(wrong, ctx);
  assert.equal(failed.status, 'failed');
  const repaired = await repairRound({ ...wrong, failure: failed.failure, round: 0, captures: [] }, ctx);
  assert.equal(repaired.status, 'repaired'); assert.equal(repaired.round, 1); assert.notEqual(repaired.composition.envelopeHash, wrong.composition.envelopeHash, 'a repair changes the composition hash');
  const sent = ctx.adapter.log.find(l => l.role === 'build_repair').input;
  assert.deepEqual(sent.approvedPlan, plans.standard, 'the repair reads the whole approved plan'); assert.match(sent.failure.problems[0], /numeric_mismatch/); assert.ok(sent.currentArtifacts.main.source.includes('-(U - G * t)'));
  assert.ok(sent.roundsLeft === 3);
  // Captures of the earlier candidate are stale for the repaired one.
  const old = await capture({ composition: wrong.composition, artifacts: wrong.artifacts, cases: buildPlanCaptureCases(wrong.plan, wrong.composition, wrong.artifacts).cases });
  const stale = checkSceneAgainstPlan({ plan: wrong.plan, composition: repaired.composition, artifacts: repaired.artifacts, captures: old, cases: buildPlanCaptureCases(wrong.plan, repaired.composition, repaired.artifacts).cases, oracle: null });
  assert.ok(stale.problems.some(p => p.code === 'stale_capture'), 'recapture is required after a repair');
  const again = await checkRound({ ...wrong, draft: repaired.draft, artifacts: repaired.artifacts, composition: repaired.composition }, ctx);
  assert.equal(again.status, 'ready');
});

test('the repair tool has no field that could change the plan, and a repair that changes renderer, drops a panel or removes the timeline is refused', async () => {
  assert.deepEqual(Object.keys(interactRepairTool().input_schema.properties), ['operation', 'main', 'supporting', 'reason']);
  const wrong = await candidate('standard', withSource('velocity = U - G * t;', 'velocity = -(U - G * t);'));
  const failure = { stage: 'check', problems: ['[numeric_mismatch] velocity'], findings: [] };
  const attempt = async edit => { const d = fixtureDraft('standard'); edit(d); return repairRound({ ...wrong, failure, round: 0 }, ctxWith(fixtureScript('standard', { build_repair: () => ({ operation: 'artifacts', main: d.main, supporting: d.supporting }) }))); };
  let r = await attempt(d => { d.supporting = []; });
  assert.equal(r.status, 'repaired_invalid'); assert.ok(r.failure.details.some(p => p.code === 'support_missing'), 'a panel cannot be dropped to pass');
  r = await attempt(d => { delete d.main.program.manifest.duration; delete d.main.program.manifest.timeline; });
  assert.equal(r.status, 'repaired_invalid'); assert.ok(r.failure.details.some(p => p.code === 'timeline_missing'), 'Over time never becomes Static to pass');
  r = await attempt(d => { d.main.program.manifest.capabilities.push('medium_visuals'); });
  assert.equal(r.status, 'repaired_invalid'); assert.ok(r.failure.details.some(p => p.code === 'seal_refused'), 'no silent switch to another SDK');
  r = await attempt(d => { d.supporting[0].artifact.program.manifest.duration = 2; });
  assert.ok(r.failure.details.some(p => p.code === 'support_clock'));
  r = await attempt(d => { d.main.program.manifest.cardDescription = 'A different description.'; });
  assert.ok(r.failure.details.some(p => p.code === 'copy_duplicated'), 'a repair cannot rewrite the approved copy');
});

test('an empty repair, a repair that changes nothing, and exhausted rounds all terminate; an exhausted run makes no call', async () => {
  const wrong = await candidate('standard', withSource('velocity = U - G * t;', 'velocity = -(U - G * t);'));
  const failure = { stage: 'check', problems: ['[numeric_mismatch] velocity'], findings: [] };
  let ctx = ctxWith(fixtureScript('standard', { build_repair: () => ({ operation: 'none', reason: 'cannot be fixed here' }) }));
  let r = await repairRound({ ...wrong, failure, round: 0 }, ctx);
  assert.equal(r.status, 'no_progress'); assert.match(r.reason, /cannot be fixed/);
  ctx = ctxWith(fixtureScript('standard', { build_repair: () => ({ operation: 'artifacts', main: wrong.draft.main, supporting: wrong.draft.supporting }) }));
  r = await repairRound({ ...wrong, failure, round: 1 }, ctx);
  assert.equal(r.status, 'no_progress'); assert.match(r.reason, /changed nothing/);
  ctx = ctxWith();
  r = await repairRound({ ...wrong, failure, round: CHECK_LIMITS.correctionRounds }, ctx);
  assert.equal(r.status, 'exhausted'); assert.equal(ctx.adapter.log.length, 0, 'the fourth correction is never requested');
  assert.equal(CHECK_LIMITS.correctionRounds, 3);
  r = await repairRound({ ...wrong, failure, round: 0 }, ctxWith(fixtureScript('standard', { build_repair: () => ({ operation: 'artifacts', main: { kind: 'program', program: { manifest: wrong.draft.main.program.manifest, source: 'export function evaluate() { throw new Error("x") }' } }, supporting: wrong.draft.supporting }) })));
  assert.ok(['repaired', 'repaired_invalid'].includes(r.status), 'a changed but broken program is judged by the same checks, not trusted');
});

test('failures are told apart: a build problem, a capability gap, a provider failure, an unknown outcome and a render outage', () => {
  assert.equal(classifyFailure(new RenderError('render_timeout', 'x')).kind, 'render_outage');
  assert.equal(classifyFailure(Object.assign(new RenderError('program_error', 'x'), { program: {} })).kind, 'build');
  assert.equal(classifyFailure(new InteractModelError('unknown_outcome', 'x', { sent: true })).kind, 'unknown_outcome');
  assert.deepEqual(classifyFailure(new InteractModelError('http_error', 'x', { sent: true })), { kind: 'provider', retryable: false, code: 'http_error', sent: true });
  assert.equal(classifyFailure(new Error('x')).kind, 'unknown');
});

// ---- INT-05-C07: visible copy against the Story ----
test('numbers in the card description that the plan does not support are reported and handed to the reviewer; supported ones are not', async () => {
  const { descriptionNumbers } = await import('../src/interact-checks.js');
  for (const name of ['standard', 'deep', 'overview', 'untimedExperiment', 'staticAdjustable']) assert.deepEqual(descriptionNumbers(plans[name]), [], `${name}: every figure in the canonical description is in its plan`);
  const loose = clone(plans.standard); loose.cardDescription = 'A ball tossed at 3.0 m/s reaches its top after 7.7 s and still accelerates at -9.8 m/s^2.';
  assert.deepEqual(descriptionNumbers(loose), [7.7]);
  const j = await candidate('standard', d => d), ctx = ctxWith();
  const { reviewRequest } = await import('../src/interact-checks.js');
  assert.match(reviewRequest(loose, j.composition), /Open check: the card description states 7\.7/);
  assert.ok(!/Open check/.test(reviewRequest(plans.standard, j.composition)));
  const { coverage } = await caught('standard', d => d, null);
  assert.deepEqual(coverage.descriptionNumbers, { unsupported: [] }); void ctx;
});

test('a scene that draws the Story or the card description as text is refused (the card shows them once, above the scenes)', async () => {
  const { j, cases, probes, captures } = await caught('standard', d => d, null);
  assert.ok(captures[0].trace.texts.length > 3, 'the capture reports the drawn text');
  const check = edit => checkSceneAgainstPlan({ plan: j.plan, composition: j.composition, artifacts: j.artifacts, cases, probes, oracle: null, captures: edit(clone(captures)) }).problems.map(p => p.code);
  assert.deepEqual(check(c => c), []);
  assert.ok(check(c => { c[1].trace.texts.push(plans.standard.cardDescription); return c; }).includes('story_in_scene'));
  assert.ok(check(c => { c[2].supports.threeMoments.trace.texts.push(plans.standard.story.slice(0, 120)); return c; }).includes('story_in_scene'));
});

test('a finding message over 400 characters does not void the whole review: the validation schema drops that limit, the legacy clamp still applies', async () => {
  const { REVIEW_TOOL } = await import('../src/explain-review.js');
  const { schemaProblems } = await import('../src/interact-model-adapters.js');
  const strict = REVIEW_TOOL.input_schema, lenient = lenientFindingText(strict);
  const reply = { captures: [{ id: 'c1', semantic: 'pass', visual: 'pass', findings: [{ verdict: 'visual', category: 'spec', severity: 'minor', message: 'x'.repeat(900), repairable: false }] }] };
  assert.ok(schemaProblems(strict, reply).length > 0, 'the strict schema refuses it');
  assert.deepEqual(schemaProblems(lenient, reply), [], 'the validation schema accepts it');
  assert.equal(JSON.stringify(strict).includes('"maxLength":400'), true, 'the original schema is not mutated');
});

test('overlap: a label drawn on a ball is a deterministic problem naming both objects, and the repairer is handed it (the check never reaches the reviewer)', async () => {
  const onBall = withSource("sdk.text('up-label', 560, 28, 'up is +')", "sdk.text('up-label', 215, 330, 'up is +')");
  const ctx = ctxWith(), out = await checkRound(await candidate('standard', onBall), ctx);
  assert.equal(out.status, 'failed'); assert.equal(out.failure.stage, 'check');
  const problem = out.failure.problems.find(p => /\[overlap\]/.test(p));
  assert.ok(problem, JSON.stringify(out.failure.problems)); assert.match(problem, /"up-label" overlaps "tossed-ball" \(text-circle/);
  assert.equal(ctx.adapter.log.filter(l => l.role === 'build_review').length, 0, 'no review of a card the checks already refused');
  assert.equal(out.failure.problems.filter(p => /\[overlap\]/.test(p) && /up-label/.test(p) && /tossed-ball/.test(p)).length, 1, 'a pair is reported once, at the first state it appears in');
});
