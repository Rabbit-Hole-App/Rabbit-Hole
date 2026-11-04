// AN-20 Gate 1 (C3', run gate1-sgd): 5 of 20 author calls ended "invalid_turn: The author returned no artifact" (billed, 20 to 30 credits each), 1 returned a behavior
// that was prose, 1 a null timeline. The shape the model returned for the five was NOT kept, so the cause is a hypothesis: the archetype exemplar was sent as a bare artifact, not in
// the tool-call shape the model must answer in. These tests hold the code change made on that hypothesis (FX-AN-056); the Gate 1 rerun confirms or refutes it.
// Offline: fake calls, no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANIMATION_AUTHOR_SYSTEM } from '../src/agents/animation-author.js';
import { EXEMPLARS, archetypeContent, authorStage, exemplarDraft, ARTIFACT_CORRECTION } from '../src/animation-author.js';
import { draftOf } from '../src/animation-repair.js';
import { ANIMATION_LIMITS } from '../src/animation-policy.js';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { canonicalJson, sha256Hex } from '../../web/src/explain-program/contract.js';

const golden = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const plan = { ...golden.plan, archetype: 'loss_surface' };
const job = { prompt: 'Show me how stochastic gradient descent works.', plan, features: [...ANIMATION_CLIENT_FEATURES], evidence: [], context: null };
const draft = draftOf(golden.artifact);
// A fake ctx.call: replies in order; records every spec it was given.
const calls = replies => { const seen = []; return { seen, call: async (role, spec) => { seen.push({ role, spec }); const input = replies[seen.length - 1]; if (input === undefined) throw new Error('unexpected call'); return { input }; } }; };

test('FX-AN-056: the exemplar is sent in the tool-call shape, and its frozen hash is still over the draft', async () => {
  const content = JSON.parse((await (async () => { const c = calls([{ kind: 'capability_gap', gap: { reason: 'offline' } }]); await authorStage(job, c); return c.seen[0].spec; })()).content);
  assert.deepEqual(Object.keys(content.archetype.exemplar), ['kind', 'artifact']);
  assert.equal(content.archetype.exemplar.kind, 'artifact');
  assert.deepEqual(content.archetype.exemplar.artifact, exemplarDraft(golden.artifact), 'the draft inside the wrapper is the frozen exemplar, unchanged');
  assert.equal(await sha256Hex(canonicalJson(content.archetype.exemplar.artifact)), EXEMPLARS.loss_surface.sha256);
  assert.equal((await archetypeContent('loss_surface')).exemplar.kind, 'artifact');
});

test('FX-AN-056: a reply with kind artifact and an artifact is taken as it always was, with one call', async () => {
  const c = calls([{ kind: 'artifact', artifact: draft }]);
  const out = await authorStage(job, c);
  assert.deepEqual(out.draft, draft);
  assert.equal(c.seen.length, 1);
  assert.equal(out.askedAgain, undefined);
});

test('FX-AN-056: a flattened reply (the artifact fields at the top level, kind artifact or absent) is the artifact, with one call', async () => {
  for (const flat of [{ kind: 'artifact', ...draft }, { ...draft }]) {
    const c = calls([flat]);
    const out = await authorStage(job, c);
    assert.deepEqual(out.draft, draft);
    assert.equal(c.seen.length, 1, 'no second ask for a reply that carries the artifact');
  }
  // The program travels with it, wherever the reply put it (withProgram's rule).
  const { program, ...rest } = draft, c = calls([{ kind: 'artifact', ...rest, program }]);
  assert.deepEqual((await authorStage(job, c)).draft.program, program);
  // A reply of another kind is never read as an artifact.
  const gap = calls([{ kind: 'capability_gap', ...draft }]);
  await assert.rejects(authorStage(job, gap), { code: 'invalid_turn' });
});

test('FX-AN-056: with neither shape, the author is asked once more with the correction, inside a second author call', async () => {
  assert.equal(ANIMATION_LIMITS.calls.author, 1, 'the author ceiling is unchanged: the job admits the one more ask beyond it (spec.again), see the job test below');
  for (const bad of [{ kind: 'artifact' }, { kind: 'artifact', artifact: '{"title": "cut off' }, { kind: 'artifact', title: 'only a title' }, {}]) {
    const c = calls([bad, { kind: 'artifact', artifact: draft }]);
    const out = await authorStage(job, c);
    assert.deepEqual(out.draft, draft);
    assert.equal(out.askedAgain, true);
    assert.equal(c.seen.length, 2);
    const [first, second] = c.seen.map(s => s.spec);
    assert.equal(first.system, ANIMATION_AUTHOR_SYSTEM);
    assert.equal(second.system, ANIMATION_AUTHOR_SYSTEM, 'the system prompt gets no new sentence');
    assert.deepEqual(second.content, [{ type: 'text', text: first.content }, { type: 'text', text: ARTIFACT_CORRECTION }], 'the same content, then the correction');
    assert.deepEqual([first.again, second.again], [undefined, true]);
  }
  // Two bad replies: still the one error, after exactly two asks.
  const two = calls([{ kind: 'artifact' }, { kind: 'artifact' }, { kind: 'artifact', artifact: draft }]);
  await assert.rejects(authorStage(job, two), { code: 'invalid_turn', message: 'The author returned no artifact.' });
  assert.equal(two.seen.length, 2);
  // A gap is an answer, not a slip: no second ask.
  const gap = calls([{ kind: 'capability_gap', gap: { reason: 'needs a thing' } }]);
  assert.equal((await authorStage(job, gap)).gap.reason, 'needs a thing');
  assert.equal(gap.seen.length, 1);
});

// The job admits the author's one more ask beyond its ceiling of one (paidCall, spec.again), and nothing else: not a third, not for another role.
import { animationPipeline } from '../src/animation-job.js';
import { experimentFixture } from '../../web/src/animation3d/fixtures.js';
import { animationStack } from './animation-fixture.js';

const planReply = (fixture, extra = {}) => { const { schema: _s, sourceRefs: _r, ...p } = fixture.plan; return { ...p, requested: { features: [] }, ...extra }; };
async function authoring(t, authorReply) {
  const s = animationStack(t, { pipeline: animationPipeline, reply: (role, n) => (role === 'brief' ? planReply(experimentFixture) : role === 'author' ? authorReply(n) : {}) });
  const { body } = await s.create(); await s.run(body.job.id);
  await s.approve(body.job.id);
  for (let i = 0; i < 6; i++) { await s.actor.alarm(); const j = s.stored(body.job.id); if (j.draft || j.stage === 'failed') break; }
  return { s, job: s.stored(body.job.id) };
}
test('FX-AN-056 in the job: no artifact in the first reply, a good one in the second: two author calls, the draft is kept', async t => {
  const { s, job } = await authoring(t, n => (n === 1 ? { kind: 'artifact' } : { kind: 'artifact', artifact: draftOf(experimentFixture.artifact) }));
  assert.ok(job.draft, JSON.stringify(job.failure));
  assert.equal(job.counts.author, 2);
  assert.deepEqual(s.model.roles().filter(r => r === 'author').length, 2);
  assert.equal(job.calls.filter(c => c.role === 'author' && c.status === 'settled').length, 2, 'both are recorded and billed');
});
test('FX-AN-056 in the job: a good first reply is one call; two replies without an artifact end the job after exactly two calls, never three', async t => {
  const one = await authoring(t, () => ({ kind: 'artifact', artifact: draftOf(experimentFixture.artifact) }));
  assert.equal(one.job.counts.author, 1);
  const two = await authoring(t, () => ({ kind: 'artifact' }));
  assert.equal(two.job.stage, 'failed');
  assert.equal(two.job.failure.code, 'invalid_turn');
  assert.equal(two.job.counts.author, 2);
  assert.equal(two.s.model.roles().filter(r => r === 'author').length, 2);
});
