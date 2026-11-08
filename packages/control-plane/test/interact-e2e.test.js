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
import { fixtureDraft, standardOracle } from '../../web/src/interact-build-fixtures.js';
import { undeliverable } from '../src/interact-job.js';
import { checkSceneAgainstPlan, buildPlanCaptureCases } from '../src/interact-checks.js';
import { standardTossDropOracle } from '../src/interact-oracle.js';
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
function buildProvider(t, script = {}) {
  const real = globalThis.fetch, calls = { build: [], review: [], repair: [] };
  const defaults = {
    build: () => ({ kind: 'scene', ...fixtureDraft('standard') }),
    repair: () => ({ operation: 'artifacts', ...fixtureDraft('standard') }),
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
function interactStack(t, { design, build, fit } = {}) {
  const s = designStack(t, { script: design, fit });
  const browser = fakeBrowser(), store = media();
  s.deps.buildScene = undefined;
  s.deps.render = { browser: browser.browser };
  Object.assign(s.env, { ASSETS: { fetch: async () => new Response('x') }, LEARN_MEDIA: store });
  const calls = buildProvider(t, build);
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
const designed = async (t, build) => {
  const s = interactStack(t, { build });
  const { body } = await s.create(), id = body.job.id;
  const { job } = await s.design(id);
  assert.equal(job.stage, 'awaiting_approval');
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
