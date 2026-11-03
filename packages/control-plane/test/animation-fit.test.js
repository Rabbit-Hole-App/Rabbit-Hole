// FX-AN-030: the real candidate of job aj_9c453b6 (a paid 40-step SGD build whose repaired draft was refused as too large) through every
// request a build can make from it, with no provider call. The first draft was not retained: its empty-label failure is rebuilt below from
// the recorded finding. An offline replay is not generation acceptance: the job stays failed and FX-AN-026 stays open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sealArtifact, validateStage } from '../src/animation-author.js';
import { ANIMATION_DRAFT_BYTES, ANIMATION_REPAIR_SYSTEM, ANIMATION_REVIEW_SYSTEM, repairTool } from '../src/agents/animation-author.js';
import { CORRECTION_WORST, OMITTED_DEFAULTS, buildReviewContent, correctionBlock, reviewArtifactView, reviewStage, ANIMATION_REVIEW_LIMITS, artifactView } from '../src/animation-review.js';
import { REPAIR_FORWARD, fitProblems, repairContent, repairStage } from '../src/animation-repair.js';
import { ANIMATION_LIMITS, ANIMATION_ROLES, animationRequest, animationReservation, roleBoundMicros } from '../src/animation-policy.js';
import { REVIEW_TOOL } from '../src/explain-review.js';
import { enabledCapabilities } from '../src/animation-brief.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { canonicalJson } from '../../web/src/explain-program/contract.js';
import { captureManifest } from '../src/animation-render.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_9c453b6.json', import.meta.url), 'utf8'));
const env = { ANTHROPIC_API_KEY: 'offline' };
const jobOf = draft => ({ prompt: fixture.prompt, plan: fixture.plan, planHash: fixture.planHash, resultId: fixture.resultId, approval: { at: fixture.approvalAt }, draft, evidence: [], attempt: 1, repairs: 1, counts: { review: 0 },
  calls: [{ role: 'repair', status: 'settled', served: fixture.servedModel }] });
const sealedOf = async draft => {
  const sealed = await sealArtifact(draft, { artifactId: fixture.resultId, revision: 1, planHash: fixture.planHash, model: fixture.servedModel, createdAt: new Date(fixture.approvalAt).toISOString(), caps: enabledCapabilities() });
  const checked = validateAnimationArtifact(sealed, enabledCapabilities(), { draft: true });
  assert.ok(checked.ok, JSON.stringify(checked.issues?.slice(0, 3)));
  return checked.value;
};
const fake = n => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, artifactHash: 'h', data: 'AAAA', mediaType: 'image/png' }));
const worstReview = (artifact, draft) => {
  const per = Math.floor(ANIMATION_REVIEW_LIMITS.traceBytes / ANIMATION_ROLES.review.maxImages) - 32;
  return buildReviewContent({ request: fixture.prompt, plan: fixture.plan, artifact, artifactHash: 'h', captures: fake(ANIMATION_ROLES.review.maxImages).map(c => ({ ...c, trace: { pad: 'x'.repeat(per) } })), evidence: [], coverage: { sampled: [], omitted: ['x'.repeat(ANIMATION_REVIEW_LIMITS.coverageChars)] }, draft }).content;
};
const reviewBody = content => animationRequest(env, 'review', { system: ANIMATION_REVIEW_SYSTEM, tool: REVIEW_TOOL, content });
const worstFailure = { problems: Array(REPAIR_FORWARD.problems).fill('p'.repeat(REPAIR_FORWARD.text)), findings: Array(REPAIR_FORWARD.findings).fill({ category: 'spec', severity: 'major', target: { capture: 'v0-s0' }, message: 'm'.repeat(REPAIR_FORWARD.text) }) };

test('the saved candidate now passes validation and the size check, and the failed job itself is untouched by this', async () => {
  const out = await validateStage(jobOf(fixture.repairedDraft), { env });
  assert.deepEqual(out.problems ?? [], []);
  assert.match(out.artifactHash, /^[0-9a-f]{64}$/);
  assert.match(fixture.findings.at(-1).problems[0], /too large for the independent review request/, 'the recorded refusal is kept in the fixture');
});

test('the review request reproduces the mismatch with every default, and fits without them at its worst case, correction included', async () => {
  const artifact = await sealedOf(fixture.repairedDraft);
  assert.throws(() => reviewBody(worstReview(artifact, null)), { code: 'input_too_large' }, 'with every default the review still does not fit: the 40,000 bound was not moved');
  const content = worstReview(artifact, fixture.repairedDraft);
  assert.doesNotThrow(() => reviewBody(content));
  assert.doesNotThrow(() => reviewBody([...content, correctionBlock(CORRECTION_WORST)]));
  assert.equal(ANIMATION_ROLES.review.maxInputTokens, 40000);
});

test('a scene sent without its defaults is the same scene: it parses back to the artifact, and the words name the real defaults', async () => {
  const artifact = await sealedOf(fixture.repairedDraft);
  const view = reviewArtifactView(artifact, fixture.repairedDraft);
  assert.ok(JSON.stringify(view).length < JSON.stringify(artifactView(artifact)).length - 5000);
  const back = validateAnimationArtifact({ ...view, program: artifact.program }, enabledCapabilities(), { draft: true });
  assert.ok(back.ok);
  assert.equal(canonicalJson(back.value), canonicalJson(artifact));
  assert.equal(view.program.source, undefined, 'the source travels in its own block');
  for (const key of ['parameters', 'actions', 'readouts', 'assumptions', 'camera', 'scene']) assert.deepEqual(view[key], fixture.repairedDraft[key], key);
  assert.deepEqual(artifactView(artifact).scene.nodes.at(-1), artifact.scene.nodes.at(-1));
  const node = artifact.scene.nodes.at(-1);
  assert.deepEqual([node.parent, node.position, node.quaternion, node.scale, node.selectable], [null, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1], false]);
  for (const words of ['parent null', 'position [0,0,0]', 'quaternion [0,0,0,1]', 'scale [1,1,1]', 'selectable false']) assert.ok(OMITTED_DEFAULTS.includes(words), words);
  // A draft that does not parse back to this artifact is never the one sent.
  assert.deepEqual(reviewArtifactView(artifact, { ...fixture.repairedDraft, title: 'Another scene' }), artifactView(artifact));
  assert.deepEqual(reviewArtifactView(artifact, null), artifactView(artifact));
});

test('the repair request fits at its worst-case findings and images, within the raised bound and not the old one', async () => {
  const content = repairContent(jobOf(fixture.repairedDraft), worstFailure, fixture.repairedDraft, fake(ANIMATION_ROLES.repair.maxImages));
  const spec = { system: ANIMATION_REPAIR_SYSTEM, tool: repairTool({ program: true }), content };
  assert.doesNotThrow(() => animationRequest(env, 'repair', spec));
  const old = { ...ANIMATION_ROLES.repair, maxInputTokens: 40000 };
  const bytes = new TextEncoder().encode(JSON.stringify({ system: spec.system, tools: [spec.tool], content: content.map(b => (b.type === 'image' ? { ...b, source: { ...b.source, data: '' } } : b)) })).length;
  assert.ok(bytes + 1000 > old.maxInputTokens, 'the mismatch was real');
  assert.ok(bytes + 1000 <= ANIMATION_ROLES.repair.maxInputTokens);
});

test('the whole downstream path, offline: sealing, the capture manifest, review, a correction and a repair each build a request within bounds', async () => {
  const draft = fixture.repairedDraft, job = jobOf(draft);
  const out = await validateStage(job, { env });
  const manifest = captureManifest(out.artifact);
  assert.equal(manifest.entries.length <= ANIMATION_ROLES.review.maxImages, true);
  assert.ok(manifest.entries.length > 0);
  const captures = manifest.entries.map((e, i) => ({ id: `v0-s${i}`, artifactHash: out.artifactHash, data: 'AAAA', mediaType: 'image/png', view: e.view, time: e.time, inputs: e.inputs, events: e.events, ticks: e.ticks, label: e.label, trace: {} }));
  const reviewJob = { ...job, artifact: out.artifact, artifactHash: out.artifactHash, captures, coverage: manifest.coverage };
  const sent = [];
  const bad = { captures: captures.map(c => ({ id: c.id, semantic: 'pass', visual: 'pass', findings: [{ verdict: 'visual', category: 'spec', message: 'm', repairable: true }] })) };
  const good = { captures: captures.map(c => ({ id: c.id, semantic: 'pass', visual: 'pass', findings: [] })) };
  const verdict = await reviewStage(reviewJob, { env, call: async (role, spec) => { animationRequest(env, role, spec); sent.push(spec); return { input: sent.length === 1 ? bad : good, usage: {} }; } });
  assert.deepEqual([verdict.accepted, sent.length], [true, 2]);
  assert.match(sent[1].content.at(-1).text, /severity is missing/);
  const repairJob = { ...job, findings: [{ stage: 'validating', problems: worstFailure.problems }], captures: [] };
  const repaired = await repairStage(repairJob, { env, call: async (role, spec) => { animationRequest(env, role, spec); return { input: { operation: 'artifact', artifact: { ...draft, title: `${draft.title} ` } } }; } });
  assert.equal(repaired.progress, true);
});

test('boundary: the size check still refuses, one byte past the largest candidate that fits', async () => {
  const draft = fixture.repairedDraft;
  const padded = n => ({ ...draft, program: { source: `${draft.program.source}\n//${'x'.repeat(n)}` } });
  const fits = async n => { const d = padded(n), a = await sealedOf(d); return fitProblems(env, a, jobOf(d), undefined, d).length === 0; };
  assert.equal(await fits(0), true);
  let low = 0, high = 12000;
  assert.equal(await fits(high), false, 'a clearly oversized candidate is refused');
  while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (await fits(mid)) low = mid; else high = mid; }
  assert.equal(await fits(low), true);
  assert.equal(await fits(low + 1), false);
  const big = padded(12000), out = await validateStage(jobOf(big), { env });
  assert.equal(out.category, 'size_limit');
  assert.match(out.problems[0], /too large for the independent review request/);
});

test('the shared estimate holds on this plan: a draft near it fits, and it is an estimate, not a promise', async () => {
  const draft = fixture.repairedDraft, size = JSON.stringify(draft).length;
  const near = { ...draft, program: { source: `${draft.program.source}\n//${'x'.repeat(ANIMATION_DRAFT_BYTES - size - 200)}` } };
  assert.ok(JSON.stringify(near).length <= ANIMATION_DRAFT_BYTES);
  const a = await sealedOf(near);
  assert.deepEqual(fitProblems(env, a, jobOf(near), undefined, near), []);
  const longPlan = { ...fixture.plan, limitations: [...fixture.plan.limitations, 'y'.repeat(8000)] };
  const job = { ...jobOf(near), plan: longPlan };
  assert.ok(fitProblems(env, a, job, undefined, near).length > 0, 'a longer plan leaves less room: passing the estimate guarantees nothing');
});

test('the empty-label failure stays a validation problem: nothing invents the words, and the approved plan is unchanged', async () => {
  const draft = structuredClone(fixture.repairedDraft);
  draft.scene.geometries[9].text = '';
  const planBefore = JSON.stringify(fixture.plan);
  const out = await validateStage(jobOf(draft), { env });
  assert.deepEqual(out.problems, fixture.findings[0].problems);
  assert.equal(out.repairable, true);
  assert.equal(out.artifact, undefined);
  assert.equal(draft.scene.geometries[9].text, '');
  assert.equal(JSON.stringify(fixture.plan), planBefore);
});

test('the raised bound is in the hard spending limits: every role call is still bounded and the build total follows it', () => {
  const r = animationReservation();
  assert.equal(r.generationMicros, roleBoundMicros('author') + ANIMATION_LIMITS.calls.review * roleBoundMicros('review') + ANIMATION_LIMITS.calls.repair * roleBoundMicros('repair'));
  assert.deepEqual([ANIMATION_LIMITS.calls.review, ANIMATION_LIMITS.calls.repair], [3, 2]);
});
