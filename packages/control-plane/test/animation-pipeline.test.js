// AN-05: the real /animation stages (plan, author, validate, render, review, repair) end to end in the real job, on a fake provider
// transport and a fake Browser Rendering session. The scenes are lane R's contract fixtures (animation3d/fixtures.js) handed back
// as the model's draft; nothing selects them from a request. No model, browser or network is reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_FIXTURES, experimentFixture, gameFixture, watchFixture } from '../../web/src/animation3d/fixtures.js';
import { hashAnimationPlan } from '../../web/src/animation3d/contract.js';
import { animationPipeline } from '../src/animation-job.js';
import { approvedPlan, prepareStage, unsupportedRequests } from '../src/animation-brief.js';
import { artifactHashOf, artifactIntact, planProblems, sealArtifact, validateStage } from '../src/animation-author.js';
import { captureManifest, allowedAsset, interceptor, renderStage } from '../src/animation-render.js';
import { buildReviewContent } from '../src/animation-review.js';
import { draftOf, fitProblems, repairStage } from '../src/animation-repair.js';
import { NEEDS_PROPOSAL, TASKS, animationStack, postedProposal } from './animation-fixture.js';

const planReply = (fixture, extra = {}) => { const { schema: _s, sourceRefs: _r, ...plan } = fixture.plan; return { ...plan, requested: { features: [] }, ...extra }; };
const captureIds = body => (/Captures to review: ([^\n]+)/.exec(body.messages[0].content[0].text)?.[1] || '').split(', ').filter(Boolean);
const verdict = (pass, body) => ({ captures: captureIds(body).map(id => ({ id, semantic: pass ? 'pass' : 'fail', visual: 'pass', findings: pass ? [] : [{ verdict: 'semantic', category: 'spec', severity: 'major', message: 'the readout disagrees with the beam', repairable: true }] })) });

// A puppeteer-shaped session whose review page answers every capture with the candidate it was given and the events asked for.
function fakeBrowser({ result = request => ({ ok: true, artifactHash: request.artifactHash, trace: { inputs: request.inputs, time: request.time, events: request.events, readouts: {} } }) } = {}) {
  const state = { evaluated: [], gotos: [], closed: false };
  const page = { setRequestInterception: async () => {}, on: () => {}, emulateMediaFeatures: async () => {}, goto: async url => { state.gotos.push(url); }, waitForFunction: async () => {}, setViewport: async () => {},
    evaluate: async (_fn, request) => { state.evaluated.push(request); return result(request); }, $: async () => ({ screenshot: async () => new Uint8Array([137, 80, 78, 71, state.evaluated.length]) }), close: async () => {} };
  return { state, browser: { newPage: async () => page, close: async () => { state.closed = true; } } };
}
function media() {
  const objects = new Map();
  return { objects, put: async (key, value) => { objects.set(key, new Uint8Array(value)); }, get: async key => (objects.has(key) ? { arrayBuffer: async () => objects.get(key).buffer } : null) };
}
const ASSETS = { fetch: async () => new Response('ok') };

function stack(t, { fixture = experimentFixture, reviews = [true], repair = null, browser = fakeBrowser(), env = {}, brief } = {}) {
  const pipeline = { ...animationPipeline, render: renderStage({ browser: browser.browser }) };
  const reply = (role, n, body) => {
    if (role === 'brief') return brief ? brief(n) : planReply(fixture);
    if (role === 'author') return { kind: 'artifact', artifact: draftOf(fixture.artifact) };
    if (role === 'review') return verdict(reviews[n - 1], body);
    if (role === 'repair') return repair ? repair(n) : { operation: 'none', reason: 'no fix' };
    return {};
  };
  return { ...animationStack(t, { pipeline, reply, env: { ASSETS, BROWSER: {}, LEARN_MEDIA: media(), ...env } }), browser };
}

test('every contract fixture runs the real pipeline to a sealed, reviewed and intact result with bounded captures', { skip: NEEDS_PROPOSAL }, async t => {
  for (const fixture of ANIMATION_FIXTURES) {
    const s = stack(t, { fixture });
    const { done } = await s.generated();
    assert.equal(done.stage, 'ready', `${fixture.name}: ${JSON.stringify(done.failure || done.findings.at(-1))}`);
    assert.deepEqual(s.model.roles(), ['brief', 'author', 'review']);
    // Host fields are the host's: the plan the learner approved, this phase, this result's id, a program hash it computed.
    assert.deepEqual([done.artifact.planHash, done.artifact.capabilityVersion, done.artifact.artifactId, done.artifact.provenance.origin], [await hashAnimationPlan(done.plan), 'animation-capabilities/1', done.resultId, 'generated']);
    assert.equal(done.artifactHash, await artifactHashOf(done.artifact));
    assert.equal(await artifactIntact(done.artifact, done.artifactHash), true);
    // At most 2 views x 3 states, each echoing exactly this candidate; the review saw every one of them as an image.
    assert.ok(done.captures.length <= 6 && done.captures.length >= 2);
    assert.ok(s.browser.state.evaluated.every(r => r.artifactHash === done.artifactHash));
    assert.equal(s.model.calls.find(c => c.role === 'review').images, done.captures.length);
    assert.deepEqual(s.browser.state.gotos, ['https://render.invalid/render/animation3d.html'], 'only the review entry is navigated to');
    const read = await s.send('result', {}, done.resultId);
    assert.deepEqual([read.status, read.body.artifact.program?.sourceHash], [200, done.artifact.program?.sourceHash]);
  }
});

test('missing capture binding is an explicit blocker at rendering: the artifact is kept, nothing is reviewed or accepted', { skip: NEEDS_PROPOSAL }, async t => {
  const s = animationStack(t, { pipeline: animationPipeline, reply: (role, n, body) => (role === 'brief' ? planReply(experimentFixture) : role === 'author' ? { kind: 'artifact', artifact: draftOf(experimentFixture.artifact) } : verdict(true, body)) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.failure.stage, done.failure.category, done.failure.code, done.result], ['failed', 'rendering', 'renderer', 'render_unavailable', null]);
  assert.ok(done.artifact && done.artifactHash);
  assert.deepEqual(s.model.roles(), ['brief', 'author']);
  assert.deepEqual((await s.job(id)).job.recovery, ['retry_render', 'edit_request']);
  // Retry rendering on a worker that now has the binding renders the SAME artifact (no new author call) and reviews it.
  const browser = fakeBrowser();
  s.env.BROWSER = {}; s.env.ASSETS = ASSETS; s.env.LEARN_MEDIA = media();
  const object = new (s.actor.constructor)(s.state, s.env, { ...animationPipeline, render: renderStage({ browser: browser.browser }) }, { tasks: TASKS });
  assert.equal((await s.send('retry', { expectedAttempt: 1 }, id, undefined, object)).status, 202);
  const ready = await s.run(id, object);
  assert.deepEqual([ready.stage, ready.artifactHash], ['ready', done.artifactHash]);
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'review']);
});

test('a page answer about another artifact or event sequence is never reviewed', async () => {
  const artifact = experimentFixture.artifact, artifactHash = await artifactHashOf(artifact), job = { id: 'aj_1', artifact, artifactHash };
  const env = { ASSETS, BROWSER: {}, LEARN_MEDIA: media() };
  const other = fakeBrowser({ result: r => ({ ok: true, artifactHash: 'f'.repeat(64), trace: { events: r.events } }) });
  await assert.rejects(renderStage({ browser: other.browser })(job, { env }), { code: 'render_failed', category: 'renderer' });
  const game = gameFixture.artifact, gameHash = await artifactHashOf(game);
  const replay = fakeBrowser({ result: r => ({ ok: true, artifactHash: r.artifactHash, trace: { events: [] } }) });
  await assert.rejects(renderStage({ browser: replay.browser })({ id: 'aj_2', artifact: game, artifactHash: gameHash }, { env }), { code: 'render_failed' });
  // A program that fails on the page is the candidate's problem: repairable, not an outage.
  const crash = fakeBrowser({ result: () => ({ programError: { code: 'runtime_error', phase: 'evaluate', diagnostic: 'x is not defined' } }) });
  const out = await renderStage({ browser: crash.browser })(job, { env });
  assert.deepEqual([out.repairable, /x is not defined/.test(out.problems[0])], [true, true]);
  // No binding, no assets: the explicit blocker, before any browser.
  await assert.rejects(renderStage()(job, { env: { ASSETS } }), { code: 'render_unavailable', category: 'renderer' });
  await assert.rejects(renderStage()(job, { env: { BROWSER: {} } }), { code: 'render_unavailable' });
});

test('the capture manifest samples at most 2 views x 3 states and says what it left out', () => {
  for (const fixture of ANIMATION_FIXTURES) {
    const { entries, coverage } = captureManifest(fixture.artifact);
    assert.ok(entries.length <= 6, fixture.name);
    assert.deepEqual(coverage.views, ['default', 'side']);
    assert.ok(entries.every(e => e.events.length <= 4 && e.ticks <= 90));
  }
  const game = captureManifest(gameFixture.artifact);
  assert.deepEqual(game.coverage.sampled.map(s => s.events), [0, 1, 4]);
  const watch = captureManifest(watchFixture.artifact);
  assert.deepEqual(watch.coverage.sampled.map(s => s.time), [0, Number((8 / 3).toFixed(3)), Number((16 / 3).toFixed(3))]);
  const experiment = captureManifest(experimentFixture.artifact);
  assert.deepEqual(experiment.coverage.sampled.map(s => s.label), ['initial', 'every parameter at its low end', 'every parameter at its high end']);
  // Interception admits only the entry and hashed build files; a generated URL is refused.
  for (const url of ['https://render.invalid/render/animation3d.html', 'https://render.invalid/static/app-1.js']) assert.equal(allowedAsset(new URL(url)), true);
  for (const url of ['https://render.invalid/render/scene.html', 'https://evil.test/x.js', 'https://render.invalid/static/a.js?x=1', 'https://render.invalid/api/learn/boards']) assert.equal(allowedAsset(new URL(url)), false);
  assert.equal(typeof interceptor(ASSETS, { served: [], blocked: [] }), 'function');
});

test('a rejected review repairs once; the repaired artifact is sealed, rendered and reviewed again before it is accepted', { skip: NEEDS_PROPOSAL }, async t => {
  const fixed = draftOf(experimentFixture.artifact);
  fixed.description = `${fixed.description} The readout updates with the beam.`.slice(0, 600);
  const s = stack(t, { reviews: [false, true], repair: () => ({ operation: 'artifact', artifact: fixed, reason: 'aligned the readout' }) });
  const { done } = await s.generated();
  assert.equal(done.stage, 'ready');
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'review', 'repair', 'review']);
  assert.equal(done.artifact.description, fixed.description);
  assert.equal(done.result.artifactHash, await artifactHashOf(done.artifact));
  const reviewed = [...new Set(s.browser.state.evaluated.map(r => r.artifactHash))];
  assert.equal(reviewed.length, 2, 'both candidates were rendered');
  assert.equal(reviewed[1], done.artifactHash, 'the accepted hash is the one rendered last and reviewed last');
  // The repair saw the failing capture's pixels.
  assert.ok(s.model.calls.find(c => c.role === 'repair').images >= 1);
});

test('a repair that returns the same artifact, or none, stops without a second review', { skip: NEEDS_PROPOSAL }, async t => {
  const same = stack(t, { reviews: [false], repair: () => ({ operation: 'artifact', artifact: draftOf(experimentFixture.artifact) }) });
  const a = await same.generated();
  assert.deepEqual([a.done.stage, a.done.stopReason], ['failed', 'no_progress']);
  const none = stack(t, { reviews: [false] });
  const b = await none.generated();
  assert.deepEqual([b.done.stage, b.done.stopReason], ['failed', 'no_progress']);
  assert.deepEqual(none.model.roles(), ['brief', 'author', 'review', 'repair']);
});

test('the planner: an unsupported request gets the server\'s own limitation, a plan using a disabled capability is refused', async () => {
  const call = reply => async () => ({ input: reply });
  const job = { prompt: 'Walk through a physics lab', evidence: [], context: null };
  const out = await prepareStage(job, { call: call(planReply(experimentFixture, { requested: { experience: 'walkthrough', behavior: 'physics', features: ['attached_models', 'parameters'] } })) });
  assert.deepEqual(out.plan.limitations.slice(0, 3), [
    'You asked for a walkthrough, which is not available yet; this plan uses experiment experience instead.',
    'You asked for real physics simulation, which is not available yet; this plan uses analytical behavior instead.',
    'You asked for attached models, which is not available yet; this plan works without it.']);
  assert.equal(out.plan.experience, 'experiment');
  await assert.rejects(prepareStage(job, { call: call(planReply(experimentFixture, { experience: 'walkthrough' })) }), { code: 'invalid_turn' });
  await assert.rejects(prepareStage(job, { call: call(planReply(experimentFixture, { behavior: 'physics' })) }), { code: 'invalid_turn' });
  assert.deepEqual((await prepareStage(job, { call: call({ ...planReply(experimentFixture), gap: { reason: 'needs fluids' } }) })).gap.reason, 'needs fluids');
  assert.deepEqual(unsupportedRequests({ experience: 'watch', features: ['loop'] }, experimentFixture.plan), []);
  // At Generate: the learner's experience applies when enabled; a disabled one is refused with its reason.
  const plan = experimentFixture.plan;
  assert.equal(approvedPlan(plan, { title: 'Mine', description: plan.description, settings: { experience: 'watch' } }).experience, 'watch');
  assert.throws(() => approvedPlan(plan, { title: 'Mine', description: plan.description, settings: { experience: 'walkthrough' } }), /not available/);
});

test('validation: the host seals every binding field, holds the artifact to the approved plan and to the contract', async () => {
  const fixture = experimentFixture, planHash = await hashAnimationPlan(fixture.plan);
  const job = { prompt: 'p', plan: fixture.plan, planHash, resultId: 'ar_1', calls: [], evidence: [] };
  const ok = await validateStage({ ...job, draft: { ...draftOf(fixture.artifact), planHash: 'f'.repeat(64), capabilityVersion: 'animation-capabilities/9' } }, { env: {}, tasks: TASKS });
  assert.deepEqual([ok.artifact.planHash, ok.artifact.capabilityVersion, ok.artifact.program.sourceHash === fixture.artifact.program.sourceHash], [planHash, 'animation-capabilities/1', true]);
  const bad = async (draft, pattern) => { const out = await validateStage({ ...job, draft }, { env: {}, tasks: TASKS }); assert.ok(out.problems?.some(p => pattern.test(p)), `${pattern}: ${JSON.stringify(out.problems)}`); assert.equal(out.repairable, true); };
  const d = draftOf(fixture.artifact);
  await bad({ ...d, experience: 'watch' }, /approved plan says experiment/);
  await bad({ ...d, parameters: [] }, /parameter .* is missing/);
  await bad({ ...d, program: { source: 'function evaluate() { return {}; }' } }, /must export evaluate/);
  await bad({ ...d, program: { source: 'import x from "y";\nexport function evaluate() { return {}; }' } }, /no import/);
  await bad({ ...d, shader: 'void main(){}' }, /unknown_field/);
  await bad({ ...d, scene: { ...d.scene, nodes: [...d.scene.nodes, { id: 'ghost', parent: 'nobody' }] } }, /unknown_id/);
  assert.deepEqual(planProblems(fixture.artifact, fixture.plan), []);
  // Too large for the review or repair request: told before any review is spent.
  const huge = { ...ok.artifact, description: ok.artifact.description, program: { ...ok.artifact.program, source: `${ok.artifact.program.source}\n//${'x'.repeat(15000)}` } };
  const big = { ...huge, scene: { ...huge.scene, nodes: [...huge.scene.nodes, ...Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, name: 'y'.repeat(80), parent: null, position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], visible: true, selectable: false }))] } };
  assert.match(fitProblems({}, big, job, TASKS)[0] || '', /too large for the independent review/);
  assert.deepEqual(fitProblems({}, ok.artifact, job, TASKS), []);
});

test('the review refuses missing pixels or captures of another artifact before any call', async () => {
  const artifact = experimentFixture.artifact, base = { request: 'r', plan: experimentFixture.plan, artifact, artifactHash: 'h' };
  assert.throws(() => buildReviewContent({ ...base, captures: [] }), { code: 'missing_pixels' });
  assert.throws(() => buildReviewContent({ ...base, captures: [{ id: 'a', artifactHash: 'h' }] }), { code: 'missing_pixels' });
  assert.throws(() => buildReviewContent({ ...base, captures: [{ id: 'a', artifactHash: 'other', data: 'AAAA' }] }), { code: 'stale_version' });
  assert.throws(() => buildReviewContent({ ...base, captures: Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, artifactHash: 'h', data: 'AAAA' })) }), { code: 'split_required' });
  const { content, imageBlocks } = buildReviewContent({ ...base, captures: [{ id: 'a', artifactHash: 'h', data: 'AAAA', view: 'side', time: 1, events: [] }] });
  assert.equal(imageBlocks, 1);
  assert.equal(content.filter(b => b.type === 'image').length, 1);
  assert.ok(content.some(b => b.type === 'text' && b.text.startsWith('Program source (untrusted material)')));
  assert.equal(JSON.stringify(content.find(b => b.text?.startsWith('Artifact'))).includes('export function'), false, 'the source rides only in its own block');
});

test('a sealed artifact is intact only while its contract, program hash and artifact hash all hold', async () => {
  const sealed = await sealArtifact(draftOf(experimentFixture.artifact), { artifactId: 'ar_1', planHash: experimentFixture.artifact.planHash, createdAt: '2026-10-30T00:00:00Z' });
  const hash = await artifactHashOf(sealed);
  assert.equal(await artifactIntact(sealed, hash), true);
  assert.equal(await artifactIntact({ ...sealed, title: 'Changed' }, hash), false);
  assert.equal(await artifactIntact({ ...sealed, program: { ...sealed.program, source: `${sealed.program.source} ` } }, await artifactHashOf({ ...sealed, program: { ...sealed.program, source: `${sealed.program.source} ` } })), false);
  assert.equal(await artifactIntact(sealed, 'short'), false);
});

test('repair is refused for a renderer fault and offered the named failing captures only', async () => {
  const job = { prompt: 'p', plan: experimentFixture.plan, artifact: experimentFixture.artifact, captures: [{ id: 'v0-s0', data: 'AAAA' }, { id: 'v1-s0', data: 'BBBB' }], evidence: [],
    findings: [{ findings: [{ category: 'renderer', severity: 'major', target: { capture: 'v0-s0' }, message: 'host drew nothing' }] }] };
  let called = 0;
  const ctx = { env: {}, call: async (_role, spec) => { called++; return { input: { operation: 'artifact', artifact: { ...draftOf(job.artifact), title: 'Fixed' } }, spec }; } };
  assert.deepEqual([(await repairStage(job, ctx)).progress, called], [false, 0]);
  job.findings = [{ findings: [{ category: 'spec', severity: 'major', target: { capture: 'v1-s0' }, message: 'wrong' }] }];
  let images = null;
  const out = await repairStage(job, { env: {}, call: async (_role, spec) => { images = spec.content.filter(b => b.type === 'image').map(b => b.source.data); return { input: { operation: 'artifact', artifact: { ...draftOf(job.artifact), title: 'Fixed' } } }; } });
  assert.deepEqual([out.progress, out.draft.title, images], [true, 'Fixed', ['BBBB']]);
});

test('Generate on a plan whose experience the learner changed builds that experience', { skip: NEEDS_PROPOSAL }, async t => {
  const s = stack(t, { fixture: watchFixture });
  const { body } = await s.create();
  await s.run(body.job.id);
  const p = postedProposal(s.sqlite, body.job.id);
  assert.equal(p.settings.experience, 'watch');
  assert.ok(p.limitations.includes('Sizes and distances are not to scale.'));
});
