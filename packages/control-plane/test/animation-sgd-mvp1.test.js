// aj_086fd46 (2026-11-02, dev preview at 51b6560cf): an SGD experiment failed after one repair with 10 serious findings
// (C:/s/spec/animation/sgd-mvp1-evidence/ROOT-CAUSE.md). The MVP1 correction (owner instruction and answers, 2026-11-02), checked on the
// saved job and on non-SGD cases: repair forwarding keeps every distinct finding whole and names what did not fit; the planner, author,
// repair and review describe curved surfaces the same way; the shared rules; the review sampler; tube curves gated on the browser.
// These prove requests, rules and gates only: whether a new paid build passes its review is not established here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM, ANIMATION_REVIEW_SYSTEM, repairTool } from '../src/agents/animation-author.js';
import { ANIMATION_BRIEF_SYSTEM, PLAN_TOOL } from '../src/agents/animation-brief.js';
import { distinctFindings, repairContent, repairStage } from '../src/animation-repair.js';
import { SURFACES, prepareStage } from '../src/animation-brief.js';
import { authorStage, clientProblems, validateStage } from '../src/animation-author.js';
import { captureManifest, middleOf } from '../src/animation-render.js';
import { reviewTicksOf } from '../../web/src/animation3d/review.js';
import { animationRequest, checkAnimationRequest } from '../src/animation-policy.js';
import { animationRoute } from '../src/animation-job.js';
import { BOARD, OWNER, TASKS, animationStack } from './animation-fixture.js';
import { experimentFixture, gameFixture } from '../../web/src/animation3d/fixtures.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_086fd46.json', import.meta.url), 'utf8'));
const env = { ANTHROPIC_API_KEY: 'offline' };
const TUBES = ['curve_radius'];
const jobOf = (draft, features = TUBES) => ({ prompt: fixture.prompt, plan: fixture.plan, planHash: fixture.planHash, resultId: fixture.resultId, approval: { at: fixture.approvalAt }, draft, evidence: [], features, attempt: 1, calls: [{ role: 'repair', status: 'settled', served: fixture.servedModel }] });
const sentOf = content => JSON.parse(content[0].text);
// The repair request's own check, as repairStage uses it.
const fitsReal = content => { try { animationRequest(env, 'repair', { system: ANIMATION_REPAIR_SYSTEM, tool: repairTool({ program: true }), content }, TASKS); return true; } catch (e) { if (e?.code === 'input_too_large') return false; throw e; } };
const f = (object, capture, message, severity = 'major') => ({ category: 'spec', severity, target: { capture, object }, message });
// Every input finding is forwarded with its exact words and target, or named in omitted with its target: nothing is lost or cut silently.
const accounted = (sent, findings) => findings.every(x => sent.findings.some(s => s.message === x.message && s.targets.some(t => t.capture === (x.target.capture ?? null) && t.object === (x.target.object ?? null)))
  || (sent.omitted?.findings || []).some(o => o.severity === x.severity && o.targets.some(t => t.capture === (x.target.capture ?? null) && t.object === (x.target.object ?? null))));
const tubed = a => ({ ...a, scene: { ...a.scene, geometries: a.scene.geometries.map(g => (g.kind === 'curve' ? { ...g, radius: 0.05 } : g)) } });

test('forwarding: all twelve findings of review 1 reach the repair whole, each with its capture and object, and the request fits', () => {
  const findings = fixture.findings[0].findings, content = repairContent(jobOf(fixture.authorDraft), { findings }, fixture.authorDraft, [], fitsReal), sent = sentOf(content);
  assert.equal(findings.length, 12);
  assert.deepEqual(sent.findings.map(s => s.message).sort(), findings.map(x => x.message).sort(), 'every message exactly, none cut');
  assert.ok(accounted(sent, findings));
  assert.equal(sent.omitted, undefined);
  assert.ok(sent.findings.some(s => /passes through the data/.test(s.message)), 'the disclosed missing readout, which review 2 raised six times as major');
  assert.deepEqual(content.forwarded, { findings: 12, problems: 0 });
  assert.ok(fitsReal(content));
});

test('forwarding: two issues on one object stay two whole entries (the correction review\'s regression), and identical words on two objects stay one issue with both', () => {
  const pad = s => s.padEnd(300, '.');
  const nine = [f('bob', 'v0-s0', pad('ISSUE-A: the bob is outside the view.')), f('bob', 'v0-s1', pad('ISSUE-B: velocity readout disagrees with motion.')), ...Array.from({ length: 7 }, (_, i) => f(`part${i}`, `v${i % 2}-s${i % 3}`, pad(`OTHER-${i}: a distinct defect.`)))];
  const sent = sentOf(repairContent(jobOf(fixture.authorDraft), { findings: nine }, fixture.authorDraft, [], fitsReal));
  assert.equal(sent.findings.length, 9);
  assert.ok(nine.every(x => sent.findings.some(s => s.message === x.message)), 'ISSUE-B is not swallowed by ISSUE-A');
  assert.equal(sent.omitted, undefined);
  const same = sentOf(repairContent(jobOf(fixture.authorDraft), { findings: [f('leftBall', 'v0-s0', 'The ball is hidden.'), f('rightBall', 'v1-s0', 'The ball is hidden.')] }, fixture.authorDraft));
  assert.deepEqual(same.findings.map(s => s.targets), [[{ capture: 'v0-s0', object: 'leftBall' }, { capture: 'v1-s0', object: 'rightBall' }]]);
  assert.deepEqual(distinctFindings([f('x', 'v0-s0', 'm'), f('x', 'v0-s0', 'm'), f('x', 'v0-s0', 'm', 'minor')]).map(i => [i.severity, i.targets.length]), [['major', 1], ['minor', 1]], 'a minor and a major with the same words are two issues');
});

test('forwarding: when findings do not fit, the lowest ranked go whole, are named with their targets, and the named list fits too', () => {
  const flood = Array.from({ length: 14 }, (_, i) => f(`obj${i}`, `v${i % 2}-s${i % 3}`, `${i}: ${'a distinct, long defect description. '.repeat(12)}`.slice(0, 400), i < 6 ? 'major' : 'minor'));
  const empty = repairContent(jobOf(fixture.authorDraft), { findings: [] }, fixture.authorDraft)[0].text.length;
  const tight = content => content[0].text.length <= empty + 2400; // a small allowance, counted on the serialized block
  const content = repairContent(jobOf(fixture.authorDraft), { findings: flood }, fixture.authorDraft, [], tight), sent = sentOf(content);
  assert.ok(tight(content), 'what is sent, the omission list included, is within the limit');
  assert.ok(sent.findings.length > 0 && sent.findings.length < flood.length);
  assert.ok(sent.findings.every(s => flood.some(x => x.message === s.message)), 'no forwarded message is cut');
  assert.equal(sent.findings.length + sent.omitted.findings.length, flood.length);
  assert.ok(accounted(sent, flood));
  assert.deepEqual(sent.findings.map(s => s.message), distinctFindings(flood).slice(0, sent.findings.length).map(i => i.message), 'the highest ranked are kept, the lowest dropped');
  assert.match(sent.omitted.note, /did not fit/);
  assert.deepEqual(content.forwarded.omitted, sent.omitted, 'the job records the same');
});

test('forwarding: the real repair request limit decides, end to end through repairStage, and the job records what was sent', async () => {
  const flood = Array.from({ length: 60 }, (_, i) => f(`object-${i}`.padEnd(64, 'x'), `v${i % 2}-s${i % 3}`, `${i}: ${'z'.repeat(390)}`));
  let request = null;
  const job = { ...jobOf(fixture.authorDraft), findings: [{ repairs: 0, stage: 'reviewing', findings: flood }], captures: [] };
  const out = await repairStage(job, { env, tasks: TASKS, call: async (role, spec) => { request = spec; return { input: { operation: 'none', reason: 'offline' } }; } });
  assert.ok(checkAnimationRequest(env, 'repair', animationRequest(env, 'repair', request, TASKS), TASKS).boundMicros > 0, 'the request sent is within the repair role\'s bound');
  const sent = sentOf(request.content);
  assert.ok(sent.findings.length > 1 && sent.findings.length < flood.length, `${sent.findings.length} whole findings fit`);
  assert.equal(sent.findings.length + sent.omitted.findings.length, flood.length);
  assert.ok(accounted(sent, flood));
  assert.deepEqual(out.forwarded, { findings: sent.findings.length, problems: 0, omitted: sent.omitted });
  const onemore = repairContent(job, { findings: flood }, fixture.authorDraft, [], c => sentOf(c).findings.length <= sent.findings.length + 1);
  assert.equal(fitsReal(onemore), false, 'one more whole finding (with the rest named) would not have fitted');
});

test('representation: the planner (input data only), author, repair and review describe curved surfaces as tube wireframes; an older browser gets the legacy line', async () => {
  const sha = s => createHash('sha256').update(s).digest('hex');
  assert.equal(sha(ANIMATION_BRIEF_SYSTEM), '90e8ab906a62c72e931e917b0de182e380f25029e569e92b96a93b8fa5b3f22a', 'the planner prompt is 51b6560cf\'s');
  assert.equal(sha(JSON.stringify(PLAN_TOOL)), 'a98018efadf0eb09f738be9a593d94fc4e909729f471ea5fb057cdaddb827a56', 'the plan schema is 51b6560cf\'s');
  const told = async features => {
    const seen = {};
    await prepareStage({ prompt: fixture.prompt, refinement: null, plan: null, context: null, evidence: [], features }, { call: async (role, spec) => { seen.brief = JSON.parse(spec.content).capabilities; return { input: { gap: { reason: 'offline' } } }; } });
    await authorStage(jobOf(fixture.authorDraft, features), { call: async (role, spec) => { seen.author = JSON.parse(spec.content).capabilities; return { input: { kind: 'artifact', artifact: fixture.authorDraft } }; } });
    seen.repair = sentOf(repairContent(jobOf(fixture.authorDraft, features), { findings: [] }, fixture.authorDraft)).capabilities;
    return seen;
  };
  const tubes = await told(TUBES), legacy = await told(null);
  for (const stage of ['brief', 'author', 'repair']) { assert.equal(tubes[stage].surfaces, SURFACES.tubes, stage); assert.equal(legacy[stage].surfaces, SURFACES.legacy, stage); }
  assert.deepEqual(tubes.brief.geometry, ['box', 'sphere', 'cylinder', 'cone', 'plane', 'line', 'curve', 'arrow', 'label']);
  assert.match(SURFACES.tubes, /wireframe of tube curves/);
  // AN-20 (owner decisions 11, 12): the reviewer no longer judges a surface by its tube wireframe; a host-drawn surface, trail or clamp is category renderer; polish is minor.
  assert.doesNotMatch(ANIMATION_REVIEW_SYSTEM, /tube-curve wireframes|a few thin rings/);
  assert.match(ANIMATION_REVIEW_SYSTEM, /minor only for polish that does not hinder reading \(a dot size, a label slightly off, a contour count\)/);
  assert.match(ANIMATION_REVIEW_SYSTEM, /a surface, trail or clamp the host draws is the host's, category renderer/);
  assert.match(ANIMATION_REVIEW_SYSTEM, /a physical part drawn as a hairline/, 'the reviewer still fails hairlines');
  for (const system of [ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM]) { assert.match(system, /A curved surface is a `surface` geometry; a path is a `trail`; a changing word is a text readout\./); assert.doesNotMatch(system, /capabilities\.surfaces|tubes about 1%/); }
});

test('client gating: tube curves validate only for a browser that declared them; a scene without tubes validates either way', async () => {
  assert.deepEqual(clientProblems(tubed(fixture.repairedDraft), { features: TUBES }), []);
  assert.equal(clientProblems(tubed(fixture.repairedDraft), {}).length, 3, 'three curve geometries with a radius, each named');
  const legacy = await validateStage(jobOf(tubed(fixture.repairedDraft), null), { env });
  assert.ok(legacy.problems.some(p => /cannot draw tube curves; remove radius/.test(p)));
  assert.ok((await validateStage(jobOf(tubed(fixture.repairedDraft)), { env })).artifact, 'the same draft passes for a current browser');
  for (const features of [TUBES, null]) assert.ok((await validateStage(jobOf(fixture.repairedDraft, features), { env })).artifact);
});

test('client gating at the routes: a request keeps only the features this server knows; reading a tube scene without them answers client_update_required', async t => {
  const s = animationStack(t);
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const deps = { identity: async () => OWNER, readRefs: async () => ({ refs: [], evidence: [] }) };
  const routeEnv = { ...s.env, ANIMATION_JOBS: namespace };
  const post = body => animationRoute('/api/learn/animation/jobs', new Request('https://dev.test/api/learn/animation/jobs', { method: 'POST', body: JSON.stringify({ boardId: BOARD.id, prompt: 'Animate a lever.', ...body }) }), routeEnv, deps);
  const made = await (await post({ requestId: 'req-00000021', cardId: 'card-0021', features: ['curve_radius', 'teleport'] })).json();
  assert.deepEqual(s.stored(made.job.id).features, ['curve_radius']);
  const old = await (await post({ requestId: 'req-00000022', cardId: 'card-0022' })).json();
  assert.deepEqual(s.stored(old.job.id).features, [], 'none declared: an older browser build');
  assert.equal((await post({ requestId: 'req-00000023', cardId: 'card-0023', features: 'curve_radius' })).status, 400);
  s.actor.pipeline = { ...s.actor.pipeline, intact: async () => true };
  s.state.data.set('result:ar_tube', { owner: { email: OWNER.email }, boardId: BOARD.id, artifact: tubed(fixture.repairedArtifact), identity: {} });
  s.state.data.set('result:ar_old', { owner: { email: OWNER.email }, boardId: BOARD.id, artifact: fixture.repairedArtifact, identity: {} });
  const read = async (id, q = '') => { const r = await animationRoute(`/api/learn/animation/jobs/results/${id}`, new Request(`https://dev.test/api/learn/animation/jobs/results/${id}?board=${BOARD.id}${q}`), routeEnv, deps); return { status: r.status, body: await r.json() }; };
  const legacy = await read('ar_tube');
  assert.deepEqual([legacy.status, legacy.body.code], [409, 'client_update_required']);
  assert.match(legacy.body.error, /Reload the page to update it/);
  assert.equal((await read('ar_tube', '&features=curve_radius')).status, 200);
  for (const q of ['', '&features=curve_radius']) assert.equal((await read('ar_old', q)).status, 200, `an older scene opens ${q || 'without features'}`);
});

test('rules: the approved plan\'s readouts bind the author and the repair (the plan listed four; a three-readout rule made the draft drop one)', () => {
  assert.match(fixture.plan.assumptions[5], /^Readouts: step number \(out of 40\), passes through the data .*, full-data loss, and distance from the lowest point\.$/);
  assert.ok(fixture.authorDraft.assumptions.some(a => /left out to keep three readouts/.test(a)), 'the author dropped the fourth by rule and said so');
  assert.equal(fixture.repairedDraft.assumptions.some(a => /passes through the data/i.test(a)), false, 'the repair, never told, dropped the disclosure');
  for (const system of [ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM]) {
    assert.match(system, /Readouts: every readout the approved plan lists/);
    assert.equal(system.includes('then at most two that support it;'), false);
  }
});

test('rules: arrows keep their magnitudes with no minimum and no size demand a zero cannot meet; updates are not called the gradient; the clamp and off-plot sentences are gone from the universal prompt', () => {
  // The saved programs: arrows floored at 0.3 (author) and 0.5 (repair); positions clamped coordinate by coordinate to |b| <= 2.
  assert.match(fixture.authorDraft.program.source, /Math\.max\(m,0\.3\)/);
  assert.match(fixture.repairedDraft.program.source, /b=cl\(s\.b,2\)/);
  for (const system of [ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM]) {
    for (const gone of ['stacked, translucent filled discs', 'a magnitude arrow at least 8%', 'at the default starting state is at least 8%']) assert.equal(system.includes(gone), false, gone);
    assert.match(system, /one constant scale factor, the same for every arrow compared with it, chosen from a typical nonzero magnitude/);
    assert.match(system, /An arrow whose magnitude is zero is hidden and its quantity is shown as 0/);
    assert.match(system, /must not look like a vector \(no arrowhead\)/);
    assert.match(system, /an update or step \(a rate times a gradient\) is never called the gradient/);
    // AN-20 (owner decisions 11, 13): the clamp, off-plot and divergence sentences left the universal prompt; the renderer clamps a bound sphere.
    for (const cut of ['never clamp a drawn position', 'marked at the point where its path actually crosses', 'Leaving the drawn area is not divergence']) assert.equal(system.includes(cut), false, cut);
  }
  assert.match(ANIMATION_REVIEW_SYSTEM, /fail a minimum length, mixed scales, an update called the gradient, or an off-plot marker off the edge crossing/);
  const rules = ANIMATION_AUTHOR_SYSTEM.slice(ANIMATION_AUTHOR_SYSTEM.indexOf('Sizes:'), ANIMATION_AUTHOR_SYSTEM.indexOf('The finished artifact'));
  assert.doesNotMatch(rules, /learning rate|bowl|loss|SGD|batch/i, 'general: no subject named');
});

test('sampler: an experiment varies its main control one setting at a time, comparison controls on: initial, middle after steps and every action, high end; the low end is listed as not sampled', () => {
  const { entries, coverage } = captureManifest(fixture.repairedArtifact);
  assert.deepEqual(coverage.sampled.map(s => s.label), ['initial', 'learningRate at 0.16: oneStep, 48 steps, then keepPath, then oneStep if idle, then 30 steps', 'learningRate at its high end (2.5), after oneStep, then 90 steps']); // an older draft whose actions declare nothing: its first action starts the motion (the host starts the clock after any), so it is pressed first, runs, then the others act on what it drew
  assert.deepEqual(coverage.omitted.slice(0, 3), ['learningRate at its low end (0.01), after oneStep, then 90 steps', 'every parameter at its low end', 'every parameter at its high end']);
  const byLabel = l => entries.find(e => e.view.name === 'default' && e.label === l);
  assert.deepEqual(byLabel(coverage.sampled[1].label).inputs, { learningRate: 0.16, batchSize: '4', showTrueGradient: true }, 'the others held at their defaults, the comparison arrow on');
  assert.deepEqual(byLabel(coverage.sampled[2].label).inputs, { learningRate: 2.5, batchSize: '4', showTrueGradient: true });
  assert.deepEqual(byLabel(coverage.sampled[1].label).events, [{ type: 'action', action: 'oneStep' }, { type: 'advance', ticks: 48 }, { type: 'action', action: 'keepPath' }, { type: 'resume', action: 'oneStep', probe: 12 }]);
  assert.equal(entries.length, 6, 'the budget is unchanged: 2 views x 3 states');
  assert.ok(entries.every(e => e.events.filter(x => x.type !== 'advance').length <= 4 && reviewTicksOf(e) <= 90));
  assert.deepEqual([middleOf({ type: 'number', min: 0.01, max: 2.5, step: 0.01 }), middleOf({ type: 'number', min: 0, max: 10, step: 0.5 }), middleOf({ type: 'select', options: [{ value: 'a' }, { value: 'b' }, { value: 'c' }] }), middleOf({ type: 'toggle', default: true })], [0.16, 5, 'b', true]);
  // Not SGD: the lever experiment varies its first parameter the same way; a game keeps its action and sequence order.
  const [lever] = experimentFixture.artifact.parameters;
  assert.deepEqual(captureManifest(experimentFixture.artifact).coverage.sampled.map(s => s.label), ['initial', `${lever.id} at ${middleOf(lever)}`, `${lever.id} at its high end (${lever.max})`]);
  assert.equal(captureManifest(gameFixture.artifact).coverage.sampled[0].label, 'initial');
  const picked = { ...experimentFixture.artifact, scene: { ...experimentFixture.artifact.scene, nodes: experimentFixture.artifact.scene.nodes.map((n, i) => (i === 1 ? { ...n, selectable: true } : n)) } };
  const pick = picked.scene.nodes[1].id, middleState = captureManifest(picked).coverage.sampled[1];
  assert.deepEqual([middleState.label, middleState.events], [`${lever.id} at ${middleOf(lever)}, then select ${pick}`, 1], 'a selectable node is pressed in the middle state too');
});

test("client gating leaves the dev result probe working: it declares this build's features, so a tube result is read, not refused", async t => {
  const { ANIMATION_RESULT_PROBE_PATH } = await import('../src/animation-job.js');
  const s = animationStack(t);
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const env = { ...s.env, ANIMATION_DIAGNOSTICS: 'true', ANIMATION_JOBS: namespace };
  s.actor.pipeline = { ...s.actor.pipeline, intact: async () => true };
  s.state.data.set('result:ar_tube', { owner: { email: OWNER.email }, boardId: BOARD.id, artifact: tubed(fixture.repairedArtifact), identity: {} });
  const probe = await animationRoute(ANIMATION_RESULT_PROBE_PATH, new Request(`https://dev.test${ANIMATION_RESULT_PROBE_PATH}`, { method: 'POST', body: JSON.stringify({ boardId: BOARD.id, resultId: 'ar_tube' }) }), env, { identity: async () => OWNER });
  const out = await probe.json();
  // No browser on this stack: the read passed (a refused read answers 409 with read and code), and rendering is what is unavailable.
  assert.deepEqual([probe.status, out.read, out.code], [502, undefined, undefined]);
  assert.match(out.error, /render_unavailable/);
});
