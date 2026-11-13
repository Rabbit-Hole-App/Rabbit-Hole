// /interact I1 integration (INT-02 to INT-07B wired end to end): the REAL ExplainJobs object and its routes, the real ledger and admission, the real Anthropic adapter
// over a scripted provider (globalThis.fetch is replaced: no network, no paid call), the real build/check/repair code of interact-build.js and interact-checks.js,
// and the REAL capture path (captureCardFor -> renderStates -> the render entry's request interception) over a fake browser whose page runs the sealed programs in the
// pinned QuickJS engine, as render/program-render.jsx does. What this cannot show: real pixels, a real Browser Rendering session, a real model (the dev run's job).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainRoute } from '../src/explain-job.js';
import { RENDER_ENTRY, RENDER_ORIGIN } from '../src/explain-render.js';
import { explainStack } from './explain-fixture.js';
import { REVIEW_TOOL } from '../src/explain-review.js';
import { INTERACT_BUILD_TOOL_NAME } from '../src/agents/explain-author.js';
import { INTERACT_REPAIR_TOOL_NAME } from '../src/agents/explain-repair.js';
import { evaluateRequestFor } from '../../web/src/explain-program/program-card.js';
import { parseGuestResult } from '../../web/src/explain-program/contract.js';
import { verifyComposition } from '../../web/src/interact-composition.js';
import { deepOracle, fixtureDraft, overviewOracle, pendulumOracle, standardOracle } from '../../web/src/interact-build-fixtures.js';
import { undeliverable } from '../src/interact-job.js';
import { checkSceneAgainstPlan, buildPlanCaptureCases } from '../src/interact-checks.js';
import { deepTossDropOracle, interactOracle, overviewDropOracle, pendulumPeriodOracle, standardTossDropOracle } from '../src/interact-oracle.js';
import { OWNER, BOARD, PLAN, clone, designStack, postedProposal } from './interact-design-fixture.js';

test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

// ---- the fake render browser: the page of render/program-render.jsx, with the real engine ---------------------------------------------------
let engine = null;
async function evaluateProgram(request) {
  const [{ loadEngine, runProgram }, { LIMITS }] = await Promise.all([import('../../web/src/explain-program/runtime.js'), import('../../web/src/explain-program/limits.js')]);
  engine ??= await loadEngine();
  const program = request.program, asked = evaluateRequestFor(program.manifest, { inputs: request.inputs, seed: 0 }, request.time ?? 0, 1, null, request.composition ?? null);
  const out = runProgram(engine, { source: program.source, request: asked, sdkVersion: program.sdkVersion }, { ...LIMITS, interruptMs: LIMITS.watchdogMs });
  if (!out.ok) return { ok: false, programError: { code: out.code, diagnostic: out.detail } };
  const parsed = parseGuestResult(out.value, program.manifest, program.sdkVersion);
  if (!parsed.ok) return { ok: false, programError: { code: parsed.error.code, diagnostic: parsed.issue } };
  const { frame, quantities } = parsed.value;
  return { ok: true, fonts: { missing: [] }, bundleHash: program.bundleHash, drawn: { objects: frame.objects.length },
    trace: { inputs: asked.inputs, time: asked.time, quantities, metrics: { ms: 1 },
      ...(request.composition ? { readouts: Object.fromEntries(frame.readouts.map(r => [r.id, r.value])), texts: frame.objects.filter(o => o.kind === 'text' && o.text).map(o => o.text) } : {}) } };
}
function fakeBrowser() {
  const state = { sessions: 0, evaluated: [], closed: false };
  const page = {
    setRequestInterception: async () => {}, emulateMediaFeatures: async () => {}, setViewport: async () => {}, waitForFunction: async () => {}, close: async () => {},
    on: (event, handler) => { if (event === 'request') state.handler = handler; },
    goto: async url => { const r = { url: () => url, abort() {}, continue() {}, respond() {} }; await state.handler(r); },
    evaluate: async (fn, request) => { state.evaluated.push({ id: request.program.manifest.title, time: request.time, inputs: request.inputs }); return evaluateProgram(request); },
    $: async () => ({ screenshot: async () => new TextEncoder().encode(`png:${state.evaluated.length}`) }),
  };
  return { state, browser: { newPage: async () => { state.sessions += 1; return page; }, close: async () => { state.closed = true; } } };
}
const media = () => { const data = new Map(); return { data, put: async (key, bytes) => { data.set(key, bytes); }, get: async key => (data.has(key) ? { arrayBuffer: async () => data.get(key).buffer.slice(data.get(key).byteOffset, data.get(key).byteOffset + data.get(key).byteLength) } : null) }; };

// ---- the scripted build providers (over the design stack's own scripted provider) -------------------------------------------------------------
const reply = (name, input) => Response.json({ model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'tb', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 2000, output_tokens: 900 } });
const wrong = (n = 1) => d => { d.main.program.source = d.main.program.source.replace('velocity = U - G * t', `velocity = G * t - U + ${n}`); return d; };
// script: { build(n, input), repair(n, input), review(n, input, images) } -> the role's tool input (or a Response)
function buildProvider(t, script = {}, depth = 'standard') {
  const real = globalThis.fetch, calls = { build: [], review: [], repair: [] };
  const defaults = {
    build: () => ({ kind: 'scene', ...fixtureDraft(depth) }),
    repair: () => ({ operation: 'artifacts', ...fixtureDraft(depth) }),
    review: (n, text) => ({ captures: ((text.match(/Captures to review: (.*)/)?.[1] ?? '').split(', ').filter(Boolean)).map(id => ({ id, semantic: 'pass', visual: 'pass', findings: [] })) }),
  };
  const roles = { [INTERACT_BUILD_TOOL_NAME]: 'build', [INTERACT_REPAIR_TOOL_NAME]: 'repair', [REVIEW_TOOL.name]: 'review' };
  const design = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), tool = body.tools?.[0]?.name, role = roles[tool];
    if (!role) return design(url, options);
    const blocks = body.messages[0].content, text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n\n'), images = blocks.filter(b => b.type === 'image').length;
    const n = calls[role].push({ text, images, system: typeof body.system === 'string' ? body.system : body.system?.[0]?.text, max: body.max_tokens }) ;
    const out = (script[role] || defaults[role])(n, role === 'review' ? text : JSON.parse(text), images);
    return out instanceof Response ? out : reply(tool, out);
  };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

// A new-flow stack with the REAL build: the switch on, no legacy builder seam, the fake render browser and a media store.
function interactStack(t, { design, build, fit, depth = 'standard', plan = depth } = {}) {
  const s = designStack(t, { script: plan === 'standard' ? design : { author: () => clone(PLAN[plan]), ...design }, fit });
  const browser = fakeBrowser(), store = media();
  s.deps.buildScene = undefined;
  s.deps.render = { browser: browser.browser };
  Object.assign(s.env, { ASSETS: { fetch: async () => new Response('x') }, LEARN_MEDIA: store });
  const calls = buildProvider(t, build, { overviewProgram: 'overview', pendulum: 'pendulum' }[plan] ?? depth);
  const jobOf = id => s.state.data.get(`job:${id}`);
  // Press Generate on the posted plan, then advance one alarm at a time to a stop; returns the stages seen.
  const generate = async (id, max = 30) => {
    assert.equal((await s.approve(id)).status, 202);
    return drive(id, max);
  };
  const drive = async (id, max = 30) => {
    const seen = [jobOf(id).stage]; // the stage the press or the Retry moved it to
    for (let i = 0; i < max; i++) {
      await s.actor.alarm();
      const job = jobOf(id);
      if (seen.at(-1) !== job.stage) seen.push(job.stage);
      if (['ready', 'failed', 'cancelled'].includes(job.stage) && !job.inFlight) break;
    }
    return { job: jobOf(id), seen };
  };
  const route = async (path, who = OWNER, actor = s.actor) => {
    const env = { ...s.env, EXPLAIN_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => actor.fetch(new Request(url, init)) }) } };
    const response = await explainRoute(`/api/learn/explain/jobs${path.split('?')[0]}`, new Request(`https://dev.test/api/learn/explain/jobs${path}`), env, { identity: async () => who });
    return { status: response.status, body: await response.json() };
  };
  return { ...s, browser, store, calls, jobOf, generate, drive, route };
}
const designed = async (t, build, depth = 'standard', plan = depth) => {
  const s = interactStack(t, { build, depth, plan });
  const { body } = await s.create(depth === 'balanced' ? {} : { depth }), id = body.job.id;
  const { job } = await s.design(id);
  assert.equal(job.stage, 'awaiting_approval', JSON.stringify([job.stopReason, job.failure]));
  return { s, id, proposal: postedProposal(s.sqlite, id) };
};

// ---- the whole flow, clean pass ------------------------------------------------------------------------------------------------------------
test('prompt -> design -> Review scene plan -> Generate -> build, capture, check, review -> a saved Standard card with its composition -> reopen with no model call', async t => {
  const { s, id, proposal } = await designed(t);
  assert.deepEqual(s.calls.build.concat(s.calls.review, s.calls.repair), [], 'zero builder, reviewer or repair calls before approval');
  assert.equal(s.model.count('author'), 1);
  const view = (await s.route(`/${id}?board=${BOARD.id}`)).body;
  assert.equal(view.scenePlan.hash, proposal.input.scene_plan_hash, 'the plan resolves through the authenticated job route, at the hash the proposal carries');
  assert.deepEqual(view.scenePlan.plan, PLAN.standard);

  const { job, seen } = await s.generate(id);
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.equal(job.stopReason, 'accepted');
  assert.deepEqual(job.build.counts, { build_author: 1, build_review: 1, build_repair: 0 });
  assert.equal(job.counts.author, 0, 'the legacy author, review and repair roles were never called');
  assert.equal(s.model.builder.length, 0);
  assert.deepEqual([s.calls.build.length, s.calls.review.length, s.calls.repair.length], [1, 1, 0]);
  assert.equal(s.calls.build[0].max, 16000, 'the new-flow build limit');
  assert.ok(JSON.parse(s.calls.build[0].text).approvedPlan.title === PLAN.standard.title, 'the builder reads the whole approved plan');
  // The reviewer was shown real pixels: the five planned states of the main scene and the supporting panel, with the layout as trusted text and the honest rule set.
  assert.equal(s.calls.review[0].images, 6);
  assert.match(s.calls.review[0].text, /Trusted card layout, top to bottom/);
  assert.match(s.calls.review[0].system, /NOT the composed card/);
  assert.match(s.calls.review[0].text, /Captures to review: start, cp-before, cp-top, cp-after, end, panel-threeMoments/);
  // The capture went through the existing render path: one session, the main program at each planned time and the support panel once.
  const times = s.browser.state.evaluated.filter(e => e.id !== 'Three moments around the top').map(e => e.time);
  assert.deepEqual(times, [0, 3 / 9.8 - 0.1, 3 / 9.8, 3 / 9.8 + 0.1, 6 / 9.8]);
  assert.equal(s.browser.state.evaluated.filter(e => e.id === 'Three moments around the top').length, 1);

  // The saved result: main and supporting artifacts, the composition, hashed together; the result says no complete card was captured.
  const saved = s.state.data.get(`result:${job.resultId}`);
  assert.equal(saved.kind, 'interact');
  assert.equal(saved.composition.version, 1);
  assert.deepEqual(saved.supporting.map(x => x.id), ['threeMoments']);
  assert.deepEqual(await verifyComposition(saved.composition, { main: { kind: 'program', program: saved.artifact }, supporting: saved.supporting.map(x => ({ id: x.id, artifact: { kind: 'program', program: x.artifact } })) }), []);
  assert.equal(job.result.interact.completeCard, false);
  assert.equal(job.result.interact.planHash, proposal.input.scene_plan_hash);
  assert.equal(job.result.interact.envelopeHash, saved.composition.envelopeHash);
  assert.equal(job.result.kind, 'program');
  // Standard's composition: the card order, the displayed time origin, the pacing and the three approved markers.
  assert.deepEqual(saved.composition.order, ['title', 'description', 'supporting', 'main', 'transport']);
  const tl = saved.composition.main.timeline;
  assert.deepEqual([tl.label, tl.playbackRate, tl.initialPlayback], ['Time from the apex', 0.1, 'paused']);
  assert.deepEqual(saved.composition.main.controls.map(c => c.type), ['playback', 'scrubber']);
  assert.equal(saved.artifact.manifest.cardDescription, undefined, 'the description appears once: in the composition, not in the manifest');
  assert.equal(saved.composition.cardDescription, PLAN.standard.cardDescription);

  // The job route's block is the bounded versioned reference; the full Story stays in the design record only.
  const got = (await s.route(`/${id}?board=${BOARD.id}`)).body;
  assert.equal(got.job.stage, 'ready');
  assert.equal(got.block.type, 'animation');
  assert.deepEqual(got.block.interact, { version: 1, planHash: proposal.input.scene_plan_hash, composition: saved.composition });
  assert.deepEqual(got.block.program, { kind: saved.artifact.kind, resultId: job.resultId, bundleHash: saved.artifact.bundleHash });
  assert.equal(JSON.stringify(got.block).includes(PLAN.standard.story.slice(0, 40)), false, 'the Story is not on the block');
  assert.equal(JSON.stringify(got.block).includes('"source"'), false, 'no program source on the block');
  assert.ok(s.state.data.get(`design:${id}:1:final`).plan.story === PLAN.standard.story, 'the Story is in the design record');

  // The result route: the main program with the composition, and a SUPPORT artifact addressed by panel id.
  const main = await s.route(`/results/${job.resultId}?board=${BOARD.id}`);
  assert.equal(main.status, 200);
  assert.equal(main.body.artifact.bundleHash, saved.artifact.bundleHash);
  assert.deepEqual(main.body.composition, saved.composition);
  const panel = await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=threeMoments`);
  assert.equal(panel.status, 200);
  assert.equal(panel.body.panel, 'threeMoments');
  assert.equal(panel.body.artifact.bundleHash, saved.composition.supporting[0].artifact.hash, 'the panel served is the one the composition names');
  assert.notEqual(panel.body.artifact.bundleHash, main.body.artifact.bundleHash);
  assert.equal((await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=nope`)).status, 404);
  assert.equal((await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=bad%20id`)).status, 404);
  assert.equal((await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=main`)).body.artifact.bundleHash, saved.artifact.bundleHash);
  // Access: the owner only, unchanged.
  assert.equal((await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=threeMoments`, { ...OWNER, email: 'other@example.com' })).status, 404);

  // Reload (a new object over the same storage): the same card, the same composition, zero extra role calls, zero extra renders.
  const roleCalls = () => [s.model.log.length, s.model.builder.length, s.calls.build.length, s.calls.review.length, s.calls.repair.length, s.browser.state.evaluated.length];
  const before = roleCalls(), fresh = s.object();
  const again = (await s.route(`/${id}?board=${BOARD.id}`, OWNER, fresh)).body, panelAgain = await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=threeMoments`, OWNER, fresh);
  assert.deepEqual(again.block, got.block);
  assert.equal(panelAgain.body.artifact.bundleHash, panel.body.artifact.bundleHash);
  await fresh.alarm();
  assert.deepEqual(roleCalls(), before);
});

test('a swapped supporting artifact is refused when the card is read (the composition names each panel by hash)', async t => {
  const { s, id } = await designed(t);
  const { job } = await s.generate(id);
  const key = `result:${job.resultId}`, saved = s.state.data.get(key);
  saved.supporting[0].artifact = { ...saved.supporting[0].artifact, source: saved.supporting[0].artifact.source.replace('0.10 s before', '0.20 s before') };
  s.state.data.set(key, saved);
  const read = await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=threeMoments`);
  assert.deepEqual([read.status, read.body.code], [409, 'version_unavailable']);
});

// ---- repair ------------------------------------------------------------------------------------------------------------------------------------
test('a wrong candidate is refused by the numerical check, one bounded repair fixes it, and the repaired candidate is recaptured and reviewed on its own composition', async t => {
  const { s, id } = await designed(t, { build: () => ({ kind: 'scene', ...wrong()(fixtureDraft('standard')) }) });
  const { job, seen } = await s.generate(id);
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'repairing', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.deepEqual([job.round, job.build.counts], [1, { build_author: 1, build_review: 1, build_repair: 1 }]);
  assert.equal(s.calls.review.length, 1, 'the wrong candidate was never shown to the reviewer: the trusted check refused it first');
  const refused = job.findings.find(f => f.stage === 'rendering');
  assert.ok(refused.problems.some(p => /numeric_mismatch/.test(p)), JSON.stringify(refused));
  const repairInput = JSON.parse(s.calls.repair[0].text);
  assert.equal(repairInput.roundsLeft, 3, 'the first repair has all three rounds');
  assert.ok(repairInput.failure.problems.some(p => /velocity/.test(p)));
  assert.equal(repairInput.currentArtifacts.main.kind, 'program');
  assert.equal(job.candidates.length, 1);
  const saved = s.state.data.get(`result:${job.resultId}`);
  assert.ok(saved.artifact.source.includes('velocity = U - G * t'), 'the delivered card is the repaired one');
  assert.equal(job.build.envelopeHash, saved.composition.envelopeHash, 'the review accepted the composition that was delivered');
});

test('an exhausted candidate is never a ready card: three repairs that stay wrong end the job with no result and no card', async t => {
  const { s, id } = await designed(t, { build: () => ({ kind: 'scene', ...wrong(1)(fixtureDraft('standard')) }), repair: n => ({ operation: 'artifacts', ...wrong(n + 1)(fixtureDraft('standard')) }) });
  const { job, seen } = await s.generate(id);
  assert.equal(job.stage, 'failed');
  assert.equal(job.stopReason, 'rounds');
  assert.equal(job.round, 3);
  assert.deepEqual(job.build.counts, { build_author: 1, build_review: 0, build_repair: 3 });
  assert.equal(job.result, null);
  assert.equal(s.state.data.get(`result:${job.resultId}`), undefined);
  assert.equal((await s.route(`/${id}?board=${BOARD.id}`)).body.block, undefined);
  assert.equal((await s.route(`/results/${job.resultId}?board=${BOARD.id}`)).status, 404);
  assert.equal(s.calls.review.length, 0, 'no candidate that failed the trusted checks reached the reviewer');
});

test('a rejected review (a blocker the checks cannot see) is repaired within the same three rounds', async t => {
  const finding = { verdict: 'visual', category: 'spec', severity: 'blocker', message: 'The velocity label overlaps the ball.', repairable: true };
  const { s, id } = await designed(t, {
    review: (n, text) => ({ captures: (text.match(/Captures to review: (.*)/)[1].split(', ')).map((cid, i) => ({ id: cid, semantic: 'pass', visual: n === 1 && i === 2 ? 'fail' : 'pass', findings: n === 1 && i === 2 ? [finding] : [] })) }),
    repair: () => ({ operation: 'artifacts', ...(d => { d.main.program.manifest.summary += ' x'; return d; })(fixtureDraft('standard')) }) });
  const { job, seen } = await s.generate(id);
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'reviewing', 'repairing', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.equal(job.round, 1);
  assert.deepEqual(job.build.counts, { build_author: 1, build_review: 2, build_repair: 1 });
  const repairInput = JSON.parse(s.calls.repair[0].text);
  assert.deepEqual(repairInput.failure.findings.map(f => [f.severity, f.target.capture]), [['blocker', 'cp-top']]);
  assert.equal(s.calls.repair[0].images, 1, 'the failing capture the review named is sent as an image');
});

test('a render outage keeps the candidate: Retry rendering captures again with no model call and no correction round', async t => {
  const { s, id } = await designed(t);
  const working = s.deps.render;
  s.deps.render = { launch: async () => { throw new Error('no browser session'); } };
  const { job } = await s.generate(id);
  assert.deepEqual([job.stage, job.failure.stage, job.failure.category, job.round], ['failed', 'rendering', 'renderer', 0]);
  assert.deepEqual(s.jobOf(id).build.counts, { build_author: 1, build_review: 0, build_repair: 0 });
  assert.ok((await s.send('get', {}, id)).body.job.recovery.includes('retry_render'));
  s.deps.render = working;
  const calls = s.calls.build.length;
  assert.equal((await s.send('retry', { expectedAttempt: job.attempt }, id)).status, 202);
  const { job: done, seen } = await s.drive(id);
  assert.deepEqual(seen, ['rendering', 'reviewing', 'ready']);
  assert.deepEqual([s.calls.build.length, calls, done.round, done.build.counts], [1, 1, 0, { build_author: 1, build_review: 1, build_repair: 0 }]);
});

test('double Generate builds once; a Stop during the build ends it with no card', async t => {
  const { s, id, proposal } = await designed(t);
  const [one, two] = await Promise.all([s.approve(id), s.approve(id)]);
  assert.deepEqual([one.status, two.status], [202, 200]);
  assert.equal((await s.send('approve', { proposal }, id)).status, 200);
  await s.actor.alarm();
  assert.equal(s.calls.build.length, 1, 'one build for all of them');
  assert.equal((await s.send('cancel', {}, id)).body.job.stage, 'cancelled');
  for (let i = 0; i < 5; i++) await s.actor.alarm();
  assert.equal(s.jobOf(id).stage, 'cancelled');
  assert.equal(s.state.data.get(`result:${s.jobOf(id).resultId}`), undefined);
  assert.equal(s.calls.build.length, 1);
});

test('a plan with a declarative panel is refused before any model call (ponytail: program panels only)', () => {
  assert.match(undeliverable(PLAN.overview), /main scene was approved as a declarative scene/);
  assert.equal(undeliverable(PLAN.standard), null);
  assert.equal(undeliverable(PLAN.deep), null);
});

// ---- the capture seam and the checks it feeds ----------------------------------------------------------------------------------------------------
test('captures are honest: no complete card, so the strict rule refuses them unless the documented flag says the render service cannot compose it', async t => {
  const { s, id } = await designed(t);
  const { job } = await s.generate(id);
  const saved = s.state.data.get(`result:${job.resultId}`), plan = PLAN.standard;
  const composition = saved.composition, artifacts = { main: { kind: 'program', program: saved.artifact }, supporting: saved.supporting.map(x => ({ id: x.id, artifact: { kind: 'program', program: x.artifact } })) };
  const { cases, probes } = buildPlanCaptureCases(plan, composition, artifacts, { limit: 5 });
  const captures = await (await import('../src/interact-job.js')).captureCardFor(s.env, { jobId: 'direct', browser: s.browser.browser })({ composition, artifacts, cases: [...cases, ...probes] });
  assert.ok(captures.every(c => c.completeCard === false && c.compositionHash === composition.envelopeHash && c.sha256 && c.key && c.supports.threeMoments.sha256));
  const strict = checkSceneAgainstPlan({ plan, composition, artifacts, captures, cases, probes, oracle: standardTossDropOracle(plan) });
  assert.ok(strict.problems.some(p => p.code === 'capture_not_complete'), 'default behaviour stays strict');
  const flagged = checkSceneAgainstPlan({ plan, composition, artifacts, captures, cases, probes, oracle: standardTossDropOracle(plan), allowPartialCard: true });
  assert.deepEqual(flagged.problems, []);
  assert.ok(flagged.coverage.oracle.checked >= 20, `the production oracle checked ${flagged.coverage.oracle.checked} values`);
});

test('the production Standard oracle is computed from the equations, agrees with the fixture oracle where they overlap, and exists for no other plan', () => {
  const production = standardTossDropOracle(PLAN.standard), fixture = standardOracle();
  assert.ok(production.expect.length >= 20);
  for (const e of production.expect) {
    const same = fixture.expect.find(f => f.case === e.case && f.panel === e.panel && f.name === e.name);
    assert.ok(same, `${e.case} ${e.panel}.${e.name} is in the fixture oracle`);
    assert.ok(Math.abs(same.expected - e.expected) < 1e-12, `${e.case} ${e.name}`);
  }
  assert.deepEqual([production.expect.find(e => e.case === 'cp-before' && e.name === 'velocity').expected.toFixed(2), production.expect.find(e => e.case === 'cp-after' && e.name === 'velocity').expected.toFixed(2)], ['0.98', '-0.98']);
  for (const other of ['overview', 'deep', 'untimedExperiment', 'staticAdjustable']) assert.equal(standardTossDropOracle(PLAN[other]), null, other);
  const notThree = clone(PLAN.standard); notThree.mode.fixedValues.launchSpeed = 4;
  assert.equal(standardTossDropOracle(notThree), null, 'a plan is never matched by guessing');
});

// ---- the switch, legacy, the description-fit flag -------------------------------------------------------------------------------------------------
test('switch off: a new request takes the legacy flow (no design roles, no scene plan); the switch is read once, at creation', async t => {
  const s = interactStack(t);
  delete s.env.INTERACT_SCENE_PLAN_ENABLED;
  const { body } = await s.create(), id = body.job.id;
  const job = s.jobOf(id);
  assert.equal(job.flow, undefined);
  assert.equal(job.design, undefined);
  await s.actor.alarm();
  assert.equal(s.jobOf(id).stage, 'preparing');
  assert.equal(s.model.log.length, 0, 'no design role was called');
  s.env.INTERACT_SCENE_PLAN_ENABLED = 'true';
  assert.equal(s.jobOf(id).flow, undefined, 'a job keeps the flow it was made with');
});

test('the description fit fails closed unless INTERACT_DESCRIPTION_FIT=estimate, and the estimate receipt is labelled estimate; the 2 to 4 line rule is not weakened', async t => {
  const short = clone(PLAN.standard);
  short.cardDescription = 'A ball tossed at 3.0 m/s has zero velocity at its top, yet its acceleration stays -9.8 m/s^2 there and at every instant of the flight.';
  const run = async (env, plan) => {
    const s = designStack(t, { script: { author: () => clone(plan) } });
    delete s.deps.descriptionFit;
    Object.assign(s.env, env);
    const { body } = await s.create(), id = body.job.id;
    return { s, id, ...(await s.design(id)) };
  };
  const closed = await run({}, short);
  assert.deepEqual([closed.job.stage, closed.job.stopReason], ['failed', 'description_fit_unavailable'], 'default off: no guessed measurement ever enables Generate');
  const ok = await run({ INTERACT_DESCRIPTION_FIT: 'estimate' }, short);
  assert.equal(ok.job.stage, 'awaiting_approval');
  assert.equal(ok.job.design.fit.styleVersion, 'card-description-v1:estimate', 'labelled estimate in the stored receipt');
  assert.deepEqual(ok.job.design.fit.widths.map(w => w.lines >= 2 && w.lines <= 4), [true, true, true]);
  const view = (await ok.s.send('get', {}, ok.id)).body;
  assert.equal(view.scenePlan.fit.styleVersion, 'card-description-v1:estimate');
  const long = await run({ INTERACT_DESCRIPTION_FIT: 'estimate' }, PLAN.standard);
  assert.notEqual(long.job.stage, 'awaiting_approval', 'the canonical copy renders in 6 lines at 320 px by the estimate: the rule stands, the copy must change');
});

// ---- hardening of the build roles (interact-harden.test.js has the unit-level proofs) ----------------------------------------------------------------
const tooLong = d => { d.main.program.manifest.summary = 'The ball is tossed and falls back. '.repeat(14); return d; };
const category = name => (n, text) => ({ captures: (text.match(/Captures to review: (.*)/)[1].split(', ')).map((cid, i) => ({ id: cid, semantic: 'pass', visual: 'pass', findings: n === 1 && i === 0 ? [{ verdict: 'visual', category: name, severity: 'minor', message: 'Small labels.', repairable: true }] : [] })) });

test('a build refused for one over-long manifest field is corrected once, in the same stage, and the job goes on to a ready card', async t => {
  const { s, id } = await designed(t, { build: n => ({ kind: 'scene', ...(n === 1 ? tooLong(fixtureDraft('standard')) : fixtureDraft('standard')) }) });
  const { job, seen } = await s.generate(id);
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.deepEqual(job.build.counts, { build_author: 2, build_review: 1, build_repair: 0 });
  assert.equal(s.calls.build.length, 2);
  const correction = JSON.parse(s.calls.build[1].text).correction;
  assert.match(correction.instruction, /WHOLE corrected reply/);
  assert.ok(correction.problems.some(p => /manifest\.summary/.test(p) && /longer than 400/.test(p)));
  assert.equal(job.round, 0, 'a correction call is not a correction round');
});

test('a build refused twice ends the job with the refusal after exactly two calls', async t => {
  const { s, id } = await designed(t, { build: () => ({ kind: 'scene', ...tooLong(fixtureDraft('standard')) }) });
  const { job } = await s.generate(id);
  assert.equal(job.stage, 'failed');
  assert.deepEqual([s.calls.build.length, job.build.counts.build_author], [2, 2]);
  assert.match(job.failure.message, /manifest\.summary/);
});

test('a build nested under one undefined key is read as the build it is, with no second call', async t => {
  const { s, id } = await designed(t, { build: () => ({ build_scene: { kind: 'scene', ...fixtureDraft('standard') } }) });
  const { job } = await s.generate(id);
  assert.equal(job.stage, 'ready');
  assert.equal(s.calls.build.length, 1);
});

test('a repair refused twice spends its round but not the job: the next round repairs the same failure and the card is delivered', async t => {
  const { s, id } = await designed(t, { build: () => ({ kind: 'scene', ...wrong()(fixtureDraft('standard')) }),
    repair: n => ({ operation: 'artifacts', ...(n < 3 ? tooLong(fixtureDraft('standard')) : fixtureDraft('standard')) }) });
  const { job, seen } = await s.generate(id);
  assert.equal(job.stage, 'ready', JSON.stringify(job.failure));
  assert.deepEqual([job.round, job.build.counts.build_repair, s.calls.repair.length], [2, 3, 3], 'round 1: the repair and its correction; round 2: the repair');
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'repairing', 'validating', 'rendering', 'reviewing', 'ready'], 'the refused repair stays in the repairing stage for its second round');
  const second = JSON.parse(s.calls.repair[2].text);
  assert.match(second.failure.problems[0], /previous repair reply was refused/);
  assert.ok(second.failure.problems.some(p => /velocity/.test(p)), 'the original failure is still named');
  assert.equal(second.roundsLeft, 2);
});

test('a review with an invented category is asked once more and the corrected review decides; a missing support picture is never accepted', async t => {
  const { s, id } = await designed(t, { review: category('layout') });
  const { job } = await s.generate(id);
  assert.equal(job.stage, 'ready');
  assert.deepEqual([job.build.counts.build_review, s.calls.review.length], [2, 2]);
  assert.match(s.calls.review[1].text, /category/);

  const gone = await designed(t);
  const g = gone.s;
  assert.equal((await g.approve(gone.id)).status, 202);
  for (let i = 0; i < 30 && g.jobOf(gone.id).stage !== 'reviewing'; i++) await g.actor.alarm();
  assert.equal(g.jobOf(gone.id).stage, 'reviewing');
  const supportKey = g.state.data.get(`build:${gone.id}:captures`)[0].supports.threeMoments.key;
  assert.ok(g.store.data.delete(supportKey), 'the support panel picture was stored');
  await g.actor.alarm();
  const failed = g.jobOf(gone.id);
  assert.deepEqual([failed.stage, failed.failure.category], ['failed', 'renderer']);
  assert.equal(g.calls.review.length, 0, 'a review without the support picture was never sent');
});

// ---- Deep / Experiment (I2, INT-10-C03 I-B2) --------------------------------------------------------------------------------------------------------
// The same real ExplainJobs, routes, ledger, build/check/repair code and capture path as the Standard flow above, for the canonical Deep plan: launch speed
// 3.0..5.0 m/s (default 5.0, step 0.1), the main timeline "Time since launch" (displayOffset 0, elapsed 0..2u/g), a "Compare the two peaks" support panel bound to
// the speed input, and the production Deep oracle computed from the equations. What this cannot show: real pixels and a real model (the dev run's job).
const DEEP_G = 9.8, DEEP_TITLE = 'Does a faster throw change the motion around its peak?';
const staleEnd = d => { d.main.program.source = d.main.program.source.replace('const end = 2 * U / G, t', 'const end = 2 * 5 / G, t'); return d; }; // a hard-coded 5.0 m/s flight

test('the Deep oracle is computed from the equations, agrees with the fixture oracle, and exists for no other plan', () => {
  const production = deepTossDropOracle(PLAN.deep), fixture = deepOracle();
  assert.equal(production.id, 'toss-drop-deep');
  assert.ok(production.expect.length >= 40, `${production.expect.length} expected values`);
  for (const e of production.expect) {
    const same = fixture.expect.find(f => f.case === e.case && f.panel === e.panel && f.name === e.name);
    assert.ok(same, `${e.case} ${e.panel}.${e.name} is in the fixture oracle`);
    assert.ok(Math.abs(same.expected - e.expected) < 1e-12, `${e.case} ${e.panel}.${e.name}`);
    assert.equal(e.tol, 1e-6, 'absolute tolerance 1e-6 for a raw quantity');
  }
  const at = (kase, panel, name) => production.expect.find(e => e.case === kase && e.panel === panel && e.name === name).expected;
  assert.equal(at('cp-referenceReturn', 'main', 'trialTime').toFixed(6), '0.612245', 'the return time at 3.0 m/s is 2u/g');
  assert.equal(at('cp-trialReturn', 'main', 'trialTime').toFixed(6), '1.020408', 'the return time at 5.0 m/s');
  assert.equal(at('bound-speed-min', 'main', 'peakHeight').toFixed(6), (9 / (2 * DEEP_G)).toFixed(6), 'the peak height at 3.0 m/s is u^2/(2g)');
  assert.equal(at('end', 'main', 'trialPeak').toFixed(6), (25 / (2 * DEEP_G)).toFixed(6));
  for (const kase of ['start', 'cp-referenceReturn', 'cp-trialReturn']) for (const name of ['referenceOffset', 'trialOffset']) assert.ok(Math.abs(at(kase, 'comparePeaks', name) - 0.049) < 1e-12, `0.20 s window, ${name}: 0.049 m below its own peak at ${kase}`);
  assert.ok(Math.abs(at('cp-referenceReturn', 'comparePeaks', 'trialPeak') - 9 / (2 * DEEP_G)) < 1e-12, 'the trial peak in the comparison follows the bound speed');
  for (const other of ['overview', 'standard', 'untimedExperiment', 'staticAdjustable']) assert.equal(deepTossDropOracle(PLAN[other]), null, other);
  assert.equal(standardTossDropOracle(PLAN.deep), null);
  assert.deepEqual([interactOracle(PLAN.standard).id, interactOracle(PLAN.deep).id, interactOracle(PLAN.overview)], ['toss-drop-standard', 'toss-drop-deep', null]);
  const wider = clone(PLAN.deep); wider.controls.find(c => c.id === 'speed').max = 6;
  assert.equal(deepTossDropOracle(wider), null, 'a different admitted range is never matched by guessing');
  const shifted = clone(PLAN.deep); shifted.mode.timeline.displayOffset = { op: 'literal', value: -0.5 };
  assert.equal(deepTossDropOracle(shifted), null, 'Deep never shows a negative origin');
  const half = clone(PLAN.deep); half.mode.timeline.end = { op: 'divide', left: { op: 'input', id: 'launchSpeed' }, right: { op: 'literal', value: DEEP_G } };
  assert.equal(deepTossDropOracle(half), null, 'an endpoint that is not the full flight 2u/g');
});

test('Deep: prompt -> design -> Generate -> build, capture at each launch speed, check against the oracle, review -> a saved Deep card whose endpoint follows the speed', async t => {
  const { s, id, proposal } = await designed(t, undefined, 'deep');
  assert.deepEqual(s.calls.build.concat(s.calls.review, s.calls.repair), [], 'zero builder, reviewer or repair calls before approval');
  const { job, seen } = await s.generate(id);
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.equal(job.stopReason, 'accepted');
  assert.deepEqual(job.build.counts, { build_author: 1, build_review: 1, build_repair: 0 });
  assert.deepEqual([s.calls.build.length, s.calls.review.length, s.calls.repair.length], [1, 1, 0]);
  assert.equal(JSON.parse(s.calls.build[0].text).approvedPlan.mode.timeline.label, 'Time since launch', 'the builder reads the whole approved Deep plan');

  // The production oracle ran against real traces of the sealed program at 3.0 and at 5.0 m/s.
  const oracle = job.build.check.oracle;
  assert.ok(oracle.checked >= 20, `the Deep oracle checked ${oracle.checked} values`);
  assert.deepEqual(oracle.skipped, []);
  const mainRuns = s.browser.state.evaluated.filter(e => e.id === DEEP_TITLE);
  const ran = (speed, time) => mainRuns.some(e => e.inputs.launchSpeed === speed && Math.abs(e.time - time) < 1e-9);
  assert.ok(ran(5, 0) && ran(5, 5 / DEEP_G) && ran(5, 10 / DEEP_G), 'start, the trial top and the return of the 5.0 m/s flight');
  assert.ok(ran(3, 6 / DEEP_G), 'the 3.0 m/s flight is captured at ITS OWN return, 0.612245 s, not at the 5.0 m/s endpoint');
  assert.equal(mainRuns.some(e => e.inputs.launchSpeed === 3 && e.time > 6 / DEEP_G + 1e-9), false, 'no capture of the short flight past its own end');
  const supportRuns = s.browser.state.evaluated.filter(e => e.id === 'Compare the two peaks');
  assert.deepEqual(supportRuns.map(e => e.inputs.trialSpeed).sort(), [3, 5], 'the comparison is evaluated once per distinct bound launch speed, at time zero');
  assert.ok(supportRuns.every(e => e.time === 0));
  assert.match(s.calls.review[0].text, /panel-comparePeaks/);

  // The saved composition: card order, Time since launch with no negative origin, pacing, the marker that moves with the speed, the controls.
  const saved = s.state.data.get(`result:${job.resultId}`), composition = saved.composition;
  assert.deepEqual(composition.order, ['title', 'description', 'supporting', 'main', 'transport', 'controls']);
  assert.deepEqual(composition.supporting.map(x => x.id), ['comparePeaks']);
  assert.deepEqual(composition.supporting[0].parameterBindings, [{ fromInputId: 'launchSpeed', toInputId: 'trialSpeed' }]);
  assert.deepEqual(composition.main.controls.map(c => [c.type, c.row]), [['playback', 'transport'], ['scrubber', 'transport'], ['number', 'controls'], ['reset', 'controls']]);
  assert.deepEqual([composition.main.mode, composition.main.onInputChange, composition.main.inputDefaults], ['experiment', 'reset_pause', { launchSpeed: 5 }]);
  const speed = composition.main.controls.find(c => c.type === 'number');
  assert.deepEqual([speed.min, speed.max, speed.default, speed.step, speed.unit], [3, 5, 5, 0.1, 'm/s']);
  const { resolveTimeline } = await import('../../web/src/interact-composition.js');
  const short = resolveTimeline(composition, { launchSpeed: 3 }), long = resolveTimeline(composition, {});
  assert.ok(Math.abs(short.end - 0.612245) < 1e-6 && Math.abs(long.end - 1.020408) < 1e-6, 'the endpoint follows the input');
  assert.deepEqual([short.displayOffset, long.displayOffset, short.displayStart, long.label], [0, 0, 0, 'Time since launch']);
  assert.ok(Math.abs(short.markers[0].time - 3 / DEEP_G) < 1e-12 && Math.abs(long.markers[0].time - 5 / DEEP_G) < 1e-12, 'Trial top at u/g');
  assert.equal(saved.artifact.manifest.duration, 10 / DEEP_G, 'manifest.duration is the longest endpoint over the range');
  assert.equal(saved.artifact.manifest.cardDescription, undefined);
  assert.equal(JSON.stringify(composition).includes('Maya'), false, 'the Story stays in the design record');

  // The job route's block is the bounded versioned reference; the support panel is served by id, and the card reopens with no model or render call.
  const got = (await s.route(`/${id}?board=${BOARD.id}`)).body;
  assert.deepEqual(got.block.interact, { version: 1, planHash: proposal.input.scene_plan_hash, composition });
  assert.equal((await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=comparePeaks`)).body.artifact.bundleHash, composition.supporting[0].artifact.hash);
  const before = [s.model.log.length, s.calls.build.length, s.calls.review.length, s.browser.state.evaluated.length], fresh = s.object();
  assert.deepEqual((await s.route(`/${id}?board=${BOARD.id}`, OWNER, fresh)).body.block, got.block);
  await fresh.alarm();
  assert.deepEqual([s.model.log.length, s.calls.build.length, s.calls.review.length, s.browser.state.evaluated.length], before);
});

test('Deep: a program that keeps the 5.0 m/s endpoint at 3.0 m/s is refused by the oracle, one bounded repair fixes it, and the repaired card is the delivered one', async t => {
  const { s, id } = await designed(t, { build: () => ({ kind: 'scene', ...staleEnd(fixtureDraft('deep')) }) }, 'deep');
  const { job, seen } = await s.generate(id);
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'repairing', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.equal(s.calls.review.length, 1, 'the wrong candidate was never shown to the reviewer');
  const refused = job.findings.find(f => f.stage === 'rendering');
  assert.ok(refused.problems.some(p => /numeric_mismatch/.test(p) && /trialTime|flightTime/.test(p) && /0\.612245/.test(p)), JSON.stringify(refused));
  assert.ok(JSON.parse(s.calls.repair[0].text).failure.problems.some(p => /0\.612245/.test(p)), 'the repairer is told the exact expected return time');
  assert.ok(s.state.data.get(`result:${job.resultId}`).artifact.source.includes('const end = 2 * U / G'));
});

test('Deep: a main scene or a comparison that ignores the launch speed is refused (oracle, effect and binding checks) before the reviewer sees it', async t => {
  const ignoresSpeed = d => { d.main.program.source = d.main.program.source.replace('U = inputs.launchSpeed', 'U = 5'); return d; };
  const ignoresBinding = d => { d.supporting[0].artifact.program.source = d.supporting[0].artifact.program.source.replace('U = inputs.trialSpeed', 'U = 5'); return d; };
  for (const wrongDraft of [ignoresSpeed, ignoresBinding]) {
    const { s, id } = await designed(t, { build: () => ({ kind: 'scene', ...wrongDraft(fixtureDraft('deep')) }) }, 'deep');
    const { job } = await s.generate(id);
    const refused = job.findings.find(f => f.stage === 'rendering');
    assert.ok(refused.problems.some(p => /numeric_mismatch|control_no_effect|binding_no_effect/.test(p)), JSON.stringify(refused.problems));
    assert.equal(s.calls.review.length, job.stage === 'ready' ? 1 : 0, 'the refused candidate was never reviewed');
    assert.equal(job.stage, 'ready', 'the bounded repair delivers the correct card');
  }
});

// ---- Overview / Static (I3): the static program scene through the same job ------------------------------------------------------------------------------------
test('the Overview oracle is computed from the equations and exists only for the static program Overview', () => {
  const production = overviewDropOracle(PLAN.overviewProgram), fixture = overviewOracle();
  assert.deepEqual(production.expect.map(e => [e.case, e.name]), [['default', 'drop'], ['default', 'dropReadout']]);
  for (const e of production.expect) assert.ok(Math.abs(fixture.expect.find(f => f.name === e.name).expected - e.expected) < 1e-12 && Math.abs(e.expected - 0.049) < 1e-12);
  assert.equal(overviewDropOracle(PLAN.overview), null, 'the declarative Overview has no program to compare');
  for (const other of ['standard', 'deep', 'untimedExperiment', 'staticAdjustable']) assert.equal(overviewDropOracle(PLAN[other]), null, other);
  assert.equal(interactOracle(PLAN.overviewProgram).id, 'toss-drop-overview');
});

test('Overview: prompt -> design -> Generate -> a saved static card with no timeline and no controls, checked against the oracle', async t => {
  const { s, id } = await designed(t, undefined, 'overview', 'overviewProgram');
  assert.deepEqual(s.calls.build.concat(s.calls.review, s.calls.repair), []);
  const { job, seen } = await s.generate(id);
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.equal(job.build.check.oracle.checked, 2);
  const saved = s.state.data.get(`result:${job.resultId}`), composition = saved.composition;
  assert.deepEqual([composition.order, composition.main.mode, composition.main.timeline, composition.main.controls, composition.supporting], [['title', 'description', 'main'], 'static', null, [], []]);
  assert.equal(saved.artifact.manifest.duration, undefined, 'a static scene declares no duration');
  const runs = s.browser.state.evaluated;
  assert.equal(runs.length >= 1 && runs.every(r => r.time === 0), true, 'one state, captured at time zero');
  const got = (await s.route(`/${id}?board=${BOARD.id}`)).body;
  assert.equal(got.job.stage, 'ready');
  assert.equal(got.block.interact.composition.main.mode, 'static');
});

// ---- Durable, access and accounting properties of the new flow (I3, INT-10-C04 on the actual routes) --------------------------------------------------------------
const ledger = s => ({ actions: s.sqlite.prepare('SELECT feature, status FROM usage_actions').all().map(r => ({ ...r })), attempts: s.sqlite.prepare('SELECT kind, status, cost_micros FROM usage_attempts').all().map(r => ({ ...r })) });
const OTHER = { ...OWNER, email: 'other@example.com', userId: 'u-2' };

test('a restart in the middle of the build resumes the same candidate on a new object: no second model call, no second render, one settlement', async t => {
  const { s, id } = await designed(t);
  assert.equal((await s.approve(id)).status, 202);
  for (let i = 0; i < 30 && !['rendering', 'reviewing'].includes(s.jobOf(id).stage); i++) await s.actor.alarm();
  assert.ok(['rendering', 'reviewing'].includes(s.jobOf(id).stage), 'the build is done and the candidate is stored');
  const builds = s.calls.build.length, fresh = s.object();
  for (let i = 0; i < 30 && !['ready', 'failed'].includes(s.jobOf(id).stage); i++) await fresh.alarm();
  const job = s.jobOf(id);
  assert.equal(job.stage, 'ready');
  assert.deepEqual([s.calls.build.length, builds, s.calls.review.length, s.calls.repair.length], [1, 1, 1, 0], 'the restarted object never builds again');
  assert.deepEqual(job.build.counts, { build_author: 1, build_review: 1, build_repair: 0 });
  const settled = ledger(s);
  assert.ok(settled.attempts.every(a => a.status === 'settled'), 'nothing is left reserved');
  for (let i = 0; i < 5; i++) await fresh.alarm();
  await s.actor.alarm(); // the old object, late
  assert.deepEqual(ledger(s), settled, 'late alarms on either object settle nothing twice');
  assert.equal(s.jobOf(id).stage, 'ready');
});

test('a build call whose outcome is unknown (the connection dropped after the request was sent) is not resent and is not booked as a free call', async t => {
  const { s, id } = await designed(t, { build: () => { throw new TypeError('network connection lost'); } });
  const { job } = await s.generate(id);
  assert.notEqual(job.stage, 'ready');
  assert.equal(s.calls.build.length, 1, 'no automatic resend of a call that may have been billed');
  assert.equal(s.state.data.get(`result:${job.resultId}`), undefined, 'no card');
  assert.equal(s.calls.review.length + s.calls.repair.length, 0);
  for (let i = 0; i < 4; i++) await s.actor.alarm();
  assert.equal(s.calls.build.length, 1, 'late alarms do not resend either');
  assert.deepEqual([job.stage, job.failure.category, job.failure.stage], ['failed', 'transport', 'authoring']);
  assert.match(job.failure.message, /not resent and its cost is unknown/);
  const unknown = ledger(s).attempts.filter(x => x.status === 'failed');
  assert.deepEqual(unknown, [{ kind: 'generation', status: 'failed', cost_micros: null }], 'the call stays on the ledger with an unknown cost, never as zero and never as settled');
  assert.ok((await s.send('get', {}, id)).body.job.recovery.includes('new_attempt'), 'the learner can start a new attempt'); 
});

test('another learner cannot read, cancel or approve the job, its plan, its result or its support panel; the answer is the same as for a job that does not exist', async t => {
  const { s, id, proposal } = await designed(t);
  const { job } = await s.generate(id);
  const missing = await s.route(`/no-such-job?board=${BOARD.id}`);
  for (const path of [`/${id}?board=${BOARD.id}`, `/results/${job.resultId}?board=${BOARD.id}`, `/results/${job.resultId}?board=${BOARD.id}&panel=threeMoments`]) {
    const got = await s.route(path, OTHER);
    assert.deepEqual([got.status, got.body], [404, { error: 'Not available' }], path);
  }
  assert.equal(missing.status, 404);
  assert.equal((await s.send('cancel', {}, id, OTHER)).status, 404);
  assert.equal((await s.send('approve', { proposal }, id, OTHER)).status, 404);
  assert.equal(s.jobOf(id).stage, 'ready', 'the owner card was not touched');
  assert.equal((await s.route(`/results/${job.resultId}?board=${BOARD.id}&panel=threeMoments`)).status, 200, 'the owner still reads it');
});

test('a late render result after Stop is fenced: the cancelled job keeps no capture, no result and no extra review', async t => {
  const { s, id } = await designed(t);
  assert.equal((await s.approve(id)).status, 202);
  for (let i = 0; i < 30 && s.jobOf(id).stage !== 'rendering'; i++) await s.actor.alarm();
  assert.equal(s.jobOf(id).stage, 'rendering');
  assert.equal((await s.send('cancel', {}, id)).body.job.stage, 'cancelled');
  for (let i = 0; i < 6; i++) await s.actor.alarm();
  const job = s.jobOf(id);
  assert.equal(job.stage, 'cancelled');
  assert.equal(s.calls.review.length, 0, 'a cancelled job asks the reviewer for nothing');
  assert.equal(s.state.data.get(`result:${job.resultId}`), undefined);
  assert.equal((await s.route(`/${id}?board=${BOARD.id}`)).body.block, undefined, 'no card is offered');
});

// ---- A different subject through the same job and card (I3) ------------------------------------------------------------------------------------------------------
test('the pendulum oracle is computed from T = 2 pi sqrt(L / g) and exists only for the pendulum plan', () => {
  const production = pendulumPeriodOracle(PLAN.pendulum), fixture = pendulumOracle();
  assert.ok(production.expect.length >= 10);
  for (const e of production.expect) assert.ok(Math.abs(fixture.expect.find(f => f.case === e.case && f.name === e.name).expected - e.expected) < 1e-12, `${e.case} ${e.name}`);
  const at = (kase, name) => production.expect.find(e => e.case === kase && e.name === name).expected;
  assert.equal(at('cp-short', 'period').toFixed(4), '1.0035'); assert.equal(at('cp-long', 'period').toFixed(4), '2.0071');
  assert.ok(Math.abs(at('cp-long', 'period') - 2 * at('cp-short', 'period')) < 1e-12, 'four times the length, twice the period');
  for (const other of ['overview', 'overviewProgram', 'standard', 'deep', 'untimedExperiment', 'staticAdjustable']) assert.equal(pendulumPeriodOracle(PLAN[other]), null, other);
  for (const other of ['pendulum']) for (const oracle of [standardTossDropOracle, deepTossDropOracle, overviewDropOracle]) assert.equal(oracle(PLAN[other]), null);
  assert.equal(interactOracle(PLAN.pendulum).id, 'pendulum-period');
});

test('Pendulum: another subject takes the same stages, checks and card: untimed Experiment, a number control, the period compared with 2 pi sqrt(L / g) at three lengths', async t => {
  const { s, id } = await designed(t, undefined, 'standard', 'pendulum');
  assert.deepEqual(s.calls.build.concat(s.calls.review, s.calls.repair), []);
  const { job, seen } = await s.generate(id);
  assert.deepEqual(seen, ['authoring', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.ok(job.build.check.oracle.checked >= 6, `the oracle checked ${job.build.check.oracle.checked} values`);
  const runs = s.browser.state.evaluated;
  for (const length of [0.25, 0.5, 1]) assert.ok(runs.some(r => r.inputs.length === length && r.time === 0), `captured at ${length} m`);
  const composition = s.state.data.get(`result:${job.resultId}`).composition;
  assert.deepEqual([composition.order, composition.main.mode, composition.main.onInputChange, composition.main.timeline, composition.supporting], [['title', 'description', 'main', 'controls'], 'experiment', 'recompute_still', null, []]);
  assert.deepEqual(composition.main.controls.map(c => [c.type, c.row]), [['number', 'controls'], ['reset', 'controls']]);
  assert.equal((await s.route(`/${id}?board=${BOARD.id}`)).body.block.interact.composition.main.inputDefaults.length, 0.5);
  // The same defect class is caught for this subject: a program that ignores the length is refused and one repair fixes it.
  const wrong = await designed(t, { build: () => ({ kind: 'scene', ...(d => { d.main.program.source = d.main.program.source.replace('L = inputs.length', 'L = 0.5'); return d; })(fixtureDraft('pendulum')) }) }, 'standard', 'pendulum');
  const second = await wrong.s.generate(wrong.id);
  assert.deepEqual(second.seen, ['authoring', 'validating', 'rendering', 'repairing', 'validating', 'rendering', 'reviewing', 'ready']);
  assert.ok(second.job.findings.find(f => f.stage === 'rendering').problems.some(p => /numeric_mismatch|control_no_effect/.test(p)));
  assert.equal(wrong.s.calls.review.length, 1, 'the wrong program was never shown to the reviewer');
});

test('an Edit of a composed card is refused with the existing honest message: no job, no model call, the saved card is untouched (Current / Proposed for an /interact card is not built)', async t => {
  const { s, id } = await designed(t);
  const { job } = await s.generate(id);
  const block = (await s.route(`/${id}?board=${BOARD.id}`)).body.block;
  s.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ?').run(JSON.stringify({ blocks: [block] }), BOARD.id);
  const before = [s.model.log.length, s.calls.build.length, s.calls.review.length, s.calls.repair.length, s.state.data.size, s.browser.state.evaluated.length];
  const edit = await s.create({ requestId: 'req-00000002', requestClass: 'edit', cardId: block.id, baseRevision: block.explain.revision, prompt: 'Make the tossed ball red.' });
  assert.deepEqual([edit.status, edit.body.code], [409, 'edit_unsupported']);
  assert.match(edit.body.error, /cannot be edited this way yet/);
  await s.actor.alarm();
  assert.deepEqual([s.model.log.length, s.calls.build.length, s.calls.review.length, s.calls.repair.length, s.state.data.size, s.browser.state.evaluated.length], before, 'nothing was started or stored');
  assert.equal(s.state.data.get(`result:${job.resultId}`).composition.envelopeHash, block.interact.composition.envelopeHash);
});

test('the owner diagnostics (detail=1) carry the benchmark ledger row: the oracle count, the timed capture and check, the model that authored, one repair', async t => {
  const { s, id } = await designed(t, { build: n => ({ kind: 'scene', ...(n === 1 ? wrong()(fixtureDraft('standard')) : fixtureDraft('standard')) }) });
  s.env.EXPLAIN_DIAGNOSTICS = 'true';
  const { job } = await s.generate(id);
  assert.equal(job.stage, 'ready');
  const { ledger } = (await s.route(`/${id}?board=${BOARD.id}&detail=1`)).body.diagnostics;
  assert.deepEqual([ledger.jobId, ledger.result, ledger.depth, ledger.repairs, ledger.authorModel, ledger.fallbackFired], [id, 'ready', 'balanced', 1, 'claude-opus-5-5', false]);
  assert.ok(ledger.oracleChecked >= 6 && ledger.oracleFailed >= 1, JSON.stringify(ledger));
  assert.equal(ledger.oracleId, 'toss-drop-standard');
  assert.ok(ledger.msRun >= 0 && ledger.msCheck >= 0 && ledger.msAuthor >= 0 && ledger.msTotal >= 0, 'the capture and the check are timed apart');
  assert.ok(ledger.costUsd > 0);
  const authoring = (await s.route(`/${id}?board=${BOARD.id}&detail=1`)).body.diagnostics.timing.stages.find(x => x.stage === 'authoring');
  assert.deepEqual([authoring.model.requested, authoring.fallback, authoring.repairRound], ['claude-opus-5-5', false, 0]);
  assert.equal((await s.route(`/${id}?board=${BOARD.id}`)).body.diagnostics, undefined, 'without detail=1 nothing of it is shown');
});
