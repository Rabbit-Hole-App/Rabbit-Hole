// AN-05: the /animation durable job with its real handlers, storage, ledger and proposal state, on a fake provider transport and a
// stub pipeline (animation-fixture.js). Covers approval (stale, expired, duplicate, wrong canvas or actor), the bounded build graph
// (one repair, final re-review), stop/retry, late results and the admission check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { animationRoute, planLines } from '../src/animation-job.js';
import { animationReservation } from '../src/animation-policy.js';
import { signProposal } from '../src/generation-proposal.js';
import { BOARD, NEEDS_PROPOSAL, OWNER, PLAN, STUB_PIPELINE, TASKS, animationStack, postedProposal, rows } from './animation-fixture.js';

const OTHER = { ...OWNER, email: 'other@example.com', userId: 'u-2' };
const skip = NEEDS_PROPOSAL;

test('a request prepares one plan and waits: the signed proposal carries the recommendation, its reason and the plan, nothing is generated', { skip }, async t => {
  const s = animationStack(t);
  const { status, body } = await s.create();
  assert.equal(status, 202);
  assert.equal(s.model.calls.length, 0, 'submission alone calls nothing');
  const waiting = await s.run(body.job.id);
  assert.equal(waiting.stage, 'awaiting_approval');
  assert.deepEqual(s.model.roles(), ['brief']);
  const p = postedProposal(s.sqlite, body.job.id);
  assert.deepEqual([p.command, p.settings, p.input.job, p.input.plan_hash, p.sig.startsWith('v3.')], ['animation', { experience: 'experiment' }, body.job.id, waiting.planHash, true]);
  assert.deepEqual(p.requirements, planLines(PLAN));
  assert.match(p.requirements[0], /^Recommended: experiment\. Changing the masses/);
  // The most it can cost is the build's worst case; nothing is shown as held.
  assert.deepEqual([p.usage.max_credits, p.usage.reserve_credits], [Math.ceil(animationReservation(TASKS).generationMicros / 10000), null]);
  for (let i = 0; i < 3; i++) await s.actor.alarm();
  assert.equal(s.model.calls.length, 1, 'waiting for Generate spends nothing');
});

test('duplicate submits make one job; a reused id with other words, or a second job on the card, is refused', async t => {
  const s = animationStack(t);
  const [a, b] = await Promise.all([s.create(), s.create()]);
  assert.deepEqual([a.status, b.status].sort(), [200, 202]);
  assert.equal(a.body.job.id, b.body.job.id);
  assert.equal((await s.create({ prompt: 'Something else.' })).status, 409);
  assert.equal((await s.create({ requestId: 'req-00000002' })).status, 409);
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 1);
});

test('Generate runs author -> validate -> render -> review to one result bound to canvas, card, plan, sources and artifact', { skip }, async t => {
  const s = animationStack(t, { reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { id, done } = await s.generated();
  assert.equal(done.stage, 'ready');
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'review']);
  assert.ok(s.model.calls.every(c => c.model === 'claude-opus-5-5' && c.toolChoice.type === 'auto'));
  const view = await s.job(id);
  const r = view.job.result;
  assert.deepEqual([r.cardId, r.canvas.boardId, r.planHash, r.artifactHash, typeof r.sources, r.experience], ['card-0001', BOARD.id, done.planHash, done.artifact.artifactHash, 'string', 'experiment']);
  // The card keeps a reference only: no draft, program or scene on the canvas.
  assert.deepEqual(view.block, { type: 'animation3d', id: 'card-0001', title: 'Lever balance', animation3d: { resultId: r.resultId, artifactHash: r.artifactHash, revision: r.revision, experience: 'experiment' } });
  assert.equal(JSON.stringify(view).includes('Show why a lever balances'), false, 'the prompt stays private to the job');
  // Calls settle under one generation action; the review is an evaluation.
  const paid = rows(s.sqlite, 'usage_attempts').filter(a => a.provider === 'anthropic');
  assert.deepEqual(paid.map(a => [a.kind, a.cost_state]), [['generation', 'settled'], ['generation', 'settled'], ['evaluation', 'settled']]);
  assert.equal(new Set(paid.slice(1).map(a => a.action_id)).size, 1);
  // Repeats: the same request returns the same job; another Generate of the same job is idempotent; nothing more is called.
  assert.equal((await s.create()).body.job.result.resultId, r.resultId);
  assert.equal((await s.approve(id)).status, 200);
  assert.equal(s.model.calls.length, 3);
});

test('the result is read only by its owner on its canvas, and only while its artifact is intact', { skip }, async t => {
  const s = animationStack(t, { reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { done } = await s.generated();
  const read = await s.send('result', {}, done.resultId);
  assert.equal(read.status, 200);
  assert.deepEqual([read.body.artifact.artifactHash, read.body.execution], [done.artifact.artifactHash, { allowed: true }]);
  assert.equal((await s.send('result', {}, done.resultId, OTHER)).status, 404);
  assert.equal((await s.send('result', {}, done.resultId, OWNER, s.actor, { ...BOARD, id: 'board-2' })).status, 404);
  assert.equal((await s.send('result', {}, 'ar_unknown')).status, 404);
  assert.equal((await s.send('get', {}, done.id, OTHER)).status, 404);
  assert.equal((await s.send('cancel', {}, done.id, OTHER)).status, 404);
  const saved = s.state.data.get(`result:${done.resultId}`);
  s.state.data.set(`result:${done.resultId}`, { ...saved, artifact: { ...saved.artifact, draft: { scene: 'tampered' } } });
  assert.deepEqual([(await s.send('result', {}, done.resultId)).status, (await s.send('result', {}, done.resultId)).body.code], [409, 'version_unavailable']);
  assert.deepEqual((await s.send('result', {}, done.resultId, OWNER, s.actor)).body.artifact, undefined);
  const killed = animationStack(t, { env: { ANIMATION_EXECUTION_KILL: 'true' }, reply: role => (role === 'review' ? { accepted: true } : {}) });
  const k = await killed.generated();
  assert.deepEqual((await killed.send('result', {}, k.done.resultId)).body.execution, { allowed: false });
});

test('a rejected review gets exactly one repair, and the repaired artifact is accepted only after its own final review', { skip }, async t => {
  const s = animationStack(t, { reply: (role, n) => (role === 'review' ? { accepted: n === 2 } : {}) });
  const { done } = await s.generated();
  assert.equal(done.stage, 'ready');
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'review', 'repair', 'review']);
  const reviews = done.findings.filter(f => f.stage === 'reviewing');
  assert.deepEqual(reviews.map(f => f.accepted), [false, true]);
  assert.ok(done.artifact.draft.repaired, 'the accepted artifact is the repaired one');
  assert.equal(done.result.artifactHash, done.artifact.artifactHash);
  assert.equal(done.repairs, 1);
});

test('a second failure after the one repair stops the job: no second repair, no third review', { skip }, async t => {
  const s = animationStack(t, { reply: role => (role === 'review' ? { accepted: false } : {}) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason, done.result], ['failed', 'rounds', null]);
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'review', 'repair', 'review']);
  assert.equal(s.state.data.has(`result:${done.resultId}`), false);
  // Validation problems use the same single repair: a repaired draft that still fails validation stops before any review.
  const v = animationStack(t, { pipeline: STUB_PIPELINE({ validate: async () => ({ problems: ['node n1 is not declared'], repairable: true }) }) });
  const bad = await v.generated();
  assert.deepEqual([bad.done.stage, bad.done.stopReason], ['failed', 'rounds']);
  assert.deepEqual(v.model.roles(), ['brief', 'author', 'repair']);
});

test('an unrepairable finding or a repair that changes nothing stops with its reason', { skip }, async t => {
  const s = animationStack(t, { reply: role => (role === 'review' ? { accepted: false, repairable: false } : {}) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason], ['failed', 'unsupported_repair']);
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'review']);
  const n = animationStack(t, { reply: role => (role === 'review' ? { accepted: false } : {}), pipeline: STUB_PIPELINE({ repair: async (job, ctx) => { await ctx.call('repair', { system: 'repair', tool: { name: 'x', input_schema: { type: 'object' } }, content: 'fix' }); return { progress: false, reason: 'no change' }; } }) });
  const none = await n.generated();
  assert.deepEqual([none.done.stage, none.done.stopReason], ['failed', 'no_progress']);
});

test('a verdict about another artifact never accepts the candidate', { skip }, async t => {
  const s = animationStack(t, { pipeline: STUB_PIPELINE({ review: async () => ({ accepted: true, findings: [], artifactHash: 'deadbeefdeadbeef' }) }) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.failure.stage, done.failure.code], ['failed', 'reviewing', 'review_stale']);
  assert.equal(done.result, null);
  // A capture of another artifact is not reviewed either.
  const c = animationStack(t, { pipeline: STUB_PIPELINE({ render: async () => ({ captures: [{ id: 'v0-s0', artifactHash: 'other' }], renders: [{ ok: true }] }) }) });
  const captured = await c.generated();
  assert.deepEqual([captured.done.stage, captured.done.failure.code], ['failed', 'captures_missing']);
  assert.deepEqual(c.model.roles(), ['brief', 'author']);
});

test('Generate is refused, consuming nothing, for a stale plan, another job, a tampered or expired proposal, another learner or canvas', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.create();
  await s.run(body.job.id);
  const p = postedProposal(s.sqlite, body.job.id);
  const refused = async (proposal, code) => { const r = await s.approve(body.job.id, proposal); assert.equal(r.status, 409, JSON.stringify(r.body)); if (code) assert.equal(r.body.code, code); };
  await refused({ ...p, title: 'Changed' }, 'proposal_invalid');
  await refused(await signProposal(s.env, { command: 'animation', title: p.title, description: p.description, settings: p.settings, input: { ...p.input, plan_hash: '0'.repeat(16) } }, OWNER.email, { envelope: 'v3' }), 'plan_stale');
  await refused(await signProposal(s.env, { command: 'animation', title: p.title, description: p.description, settings: p.settings, input: { ...p.input, job: 'aj_other' } }, OWNER.email, { envelope: 'v3' }), 'plan_stale');
  await refused(await signProposal(s.env, { command: 'animation', title: p.title, description: p.description, settings: p.settings, input: p.input }, OWNER.email, { envelope: 'v3', now: Math.floor(Date.now() / 1000) - 2 * 86400 }), 'proposal_invalid');
  await refused(await signProposal(s.env, { command: 'animation', title: p.title, description: p.description, settings: p.settings, input: p.input }, OTHER.email, { envelope: 'v3' }), 'proposal_invalid');
  // Signed for this learner and job, but bound to another canvas: refused by the proposal's one state.
  await refused(await signProposal(s.env, { command: 'animation', title: p.title, description: p.description, settings: p.settings, input: { ...p.input, app: 'canvas-b' } }, OWNER.email, { envelope: 'v3' }), 'proposal_canvas');
  // An unsupported experience chosen on the card is refused before anything is consumed.
  const strict = animationStack(t, { pipeline: STUB_PIPELINE({ approvedPlan: (plan, proposal) => { if (proposal.settings.experience === 'walkthrough') throw new Error('Walkthrough is not available yet.'); return plan; } }) });
  const j = (await strict.create()).body.job.id; await strict.run(j);
  const q = postedProposal(strict.sqlite, j);
  const walk = await signProposal(strict.env, { command: 'animation', title: q.title, description: q.description, settings: { experience: 'walkthrough' }, input: q.input }, OWNER.email, { envelope: 'v3' });
  assert.deepEqual([(await strict.approve(j, walk)).body.code], ['plan_invalid']);
  // Nothing was consumed: the current proposal still generates.
  assert.equal((await s.approve(body.job.id)).status, 202);
  assert.equal(s.model.calls.length, 1, 'no refused Generate called anything');
});

test('a refinement is the next version; Generate on the earlier version is stale, and a Generate on the current one wins once', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.create();
  await s.run(body.job.id);
  const first = postedProposal(s.sqlite, body.job.id);
  assert.equal((await s.send('refine', { message: 'heavier masses', proposal: { proposal_id: first.proposal_id, version: first.version } }, body.job.id)).status, 202);
  const again = await s.run(body.job.id);
  const second = postedProposal(s.sqlite, body.job.id);
  assert.deepEqual([second.proposal_id, second.version, again.plan.title], [first.proposal_id, 2, 'Lever balance (heavier masses)']);
  const old = await s.approve(body.job.id, first);
  assert.deepEqual([old.status, old.body.code], [409, 'plan_stale']);
  // A refinement naming a version that is no longer current is refused.
  assert.equal((await s.send('refine', { message: 'x', proposal: { proposal_id: first.proposal_id, version: 1 } }, body.job.id)).body.code, 'plan_stale');
  assert.equal((await s.approve(body.job.id, second)).status, 202);
  assert.equal((await s.send('refine', { message: 'x' }, body.job.id)).body.code, 'plan_stale', 'no change after Generate');
});

test('Generate is refused for allowance before the proposal is consumed; the build worst case is what is checked', { skip }, async t => {
  const s = animationStack(t, { used: 50e6 - animationReservation(TASKS).generationMicros + 1 });
  const { body } = await s.create();
  await s.run(body.job.id);
  const refused = await s.approve(body.job.id);
  assert.deepEqual([refused.status, refused.body.reason], [429, 'insufficient']);
  assert.equal(s.stored(body.job.id).stage, 'awaiting_approval');
  assert.equal(s.stored(body.job.id).proposal, null);
  assert.deepEqual(s.model.roles(), ['brief']);
});

test('Stop during a call: it settles, its late result is dropped, no later stage runs, and a restart keeps it stopped', { skip }, async t => {
  const s = animationStack(t);
  const { body } = await s.create();
  await s.run(body.job.id);
  assert.equal((await s.approve(body.job.id)).status, 202);
  const release = s.model.hold();
  const running = s.actor.alarm();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(s.stored(body.job.id).inFlight.role, 'author');
  const stopped = await s.send('cancel', {}, body.job.id);
  assert.deepEqual([stopped.body.job.stage, stopped.body.job.stopReason], ['cancelled', 'stopped']);
  release(); await running;
  const after = s.stored(body.job.id);
  assert.deepEqual([after.stage, after.draft, after.calls.at(-1).status], ['cancelled', null, 'settled']);
  const restarted = s.object();
  for (let i = 0; i < 3; i++) await restarted.alarm();
  assert.deepEqual([s.stored(body.job.id).stage, s.model.calls.length], ['cancelled', 2]);
  assert.equal((await s.approve(body.job.id, { ...postedProposal(s.sqlite, body.job.id), version: 9 })).body.code, 'plan_stale');
});

test('provider overload pauses at its stage; Retry resumes there within the same ceiling, once per attempt', { skip }, async t => {
  let down = true;
  const s = animationStack(t, { status: role => (role === 'review' && down ? 529 : 200), reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.failure.stage, done.failure.category, done.counts.review], ['failed', 'reviewing', 'provider_unavailable', 0]);
  assert.deepEqual((await s.job(id)).job.recovery, ['new_attempt', 'edit_request']);
  down = false;
  const [a, b] = [await s.send('retry', { expectedAttempt: 1 }, id), await s.send('retry', { expectedAttempt: 1 }, id)];
  assert.deepEqual([a.status, b.status, b.body.job.attempt], [202, 200, 2]);
  const ready = await s.run(id);
  assert.equal(ready.stage, 'ready');
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'review', 'review']);
  assert.deepEqual(ready.calls.filter(c => c.role === 'review').map(c => [c.status, c.costMicros]), [['refused', 0], ['settled', ready.calls.at(-1).costMicros]]);
});

test('a malformed author reply fails the build with no silent fallback and no retry beyond the ceiling', { skip }, async t => {
  // A request the policy refuses (no tool offered) is never sent and uses no call.
  const bad = animationStack(t, { pipeline: STUB_PIPELINE({ author: async (job, ctx) => ctx.call('author', { system: 'author', tool: null, content: 'x' }) }) });
  const failed = await bad.generated();
  assert.deepEqual([failed.done.stage, failed.done.failure.category, failed.done.counts.author], ['failed', 'transport', 0]);
  assert.deepEqual(bad.model.roles(), ['brief']);
  // A reply that is not exactly one call of the offered tool is an invalid turn: the call counts, the build fails, and no Retry
  // is offered past the one author call (the ceiling is never reset).
  const s = animationStack(t, { pipeline: STUB_PIPELINE({ author: async (job, ctx) => { const out = await ctx.call('author', { system: 'author', tool: { name: 'animation_out', input_schema: { type: 'object' } }, content: 'x' }); if (!out.input.scene) throw Object.assign(new Error('The author returned no artifact.'), { code: 'invalid_turn', status: 502 }); } }) });
  const { id, done } = await s.generated();
  assert.deepEqual([done.stage, done.failure.stage, done.counts.author, done.draft], ['failed', 'authoring', 1, null]);
  assert.deepEqual((await s.job(id)).job.recovery, ['edit_request']);
});

test('the summed per-call bounds of a build can never exceed its worst case: a third review is refused', { skip }, async t => {
  const s = animationStack(t, { pipeline: STUB_PIPELINE({ review: async (job, ctx) => { for (let i = 0; i < 3; i++) await ctx.call('review', { system: 'review', tool: { name: 'x', input_schema: { type: 'object' } }, content: 'x' }); return { accepted: true, artifactHash: job.artifact.artifactHash }; } }) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason, done.counts.review], ['failed', 'budget', 2]);
  assert.ok(done.bounds.generation <= done.reservation.generationMicros);
  assert.deepEqual(s.model.roles(), ['brief', 'author', 'review', 'review']);
});

test('the route is off unless ANIMATION_ENABLED, owner-only and same-origin; sources are read on the server, never taken from the client', async t => {
  const s = animationStack(t);
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const identity = async () => OWNER;
  const reads = [];
  const deps = { identity, readRefs: async (req, env, ctx, refs) => { reads.push({ app: ctx.board.app, refs }); return { refs: [{ sourceId: 'file:fs_1', kind: 'file', name: 'notes', version: 'v', status: 'read', evidence: 'ev_1' }], evidence: [{ id: 'ev_1', excerpt: 'read text', limitations: [] }], text: '' }; } };
  const post = (env, body, headers = {}) => animationRoute('/api/learn/animation/jobs', new Request('https://dev.test/api/learn/animation/jobs', { method: 'POST', headers, body: JSON.stringify(body) }), env, deps);
  const payload = { boardId: BOARD.id, requestId: 'req-00000009', cardId: 'card-0009', prompt: 'Animate a lever.' };
  assert.equal(await animationRoute('/api/learn/explain/jobs', new Request('https://dev.test/x'), s.env), null);
  for (const off of [undefined, 'false', '1']) assert.equal((await post({ ...s.env, ANIMATION_ENABLED: off, ANIMATION_JOBS: namespace }, payload)).status, 404);
  const env = { ...s.env, ANIMATION_JOBS: namespace };
  assert.equal((await post({ ...s.env }, payload)).status, 503);
  assert.equal((await post(env, payload, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await post(env, { ...payload, boardId: 'someone-elses' })).status, 404);
  const created = await post(env, { ...payload, evidence: [{ id: 'ev_fake', excerpt: 'forged' }], context: { refs: ['forged'], refText: 'forged', note: 'kept' }, context_refs: [{ kind: 'file', sourceId: 'file:fs_1' }] });
  assert.equal(created.status, 202);
  const job = s.stored((await created.json()).job.id);
  assert.deepEqual([reads.length, reads[0].app, job.evidence.map(e => e.id), job.context.note, job.context.refText, job.context.refs[0].sourceId], [1, BOARD.app, ['ev_1'], 'kept', undefined, 'file:fs_1']);
  assert.equal(s.model.calls.length, 0);
  const get = (e, q) => animationRoute(`/api/learn/animation/jobs/${job.id}`, new Request(`https://dev.test/api/learn/animation/jobs/${job.id}?board=${BOARD.id}${q}`), e, deps).then(r => r.json());
  assert.equal('diagnostics' in await get(env, '&detail=1'), false);
  assert.ok('diagnostics' in await get({ ...env, ANIMATION_DIAGNOSTICS: 'true' }, '&detail=1'));
});

test('the source set a result is bound to changes with what was read', { skip }, async t => {
  const a = animationStack(t, { reply: role => (role === 'review' ? { accepted: true } : {}) });
  const one = await a.generated({ evidence: [] });
  const b = animationStack(t, { reply: role => (role === 'review' ? { accepted: true } : {}) });
  const { body } = await b.create();
  const stored = b.stored(body.job.id);
  b.state.data.set(`job:${body.job.id}`, { ...stored, evidence: [{ id: 'ev_2', contentHash: 'sha256:x' }] });
  await b.run(body.job.id); await b.approve(body.job.id);
  const two = await b.run(body.job.id);
  assert.notEqual(one.done.result.sources, two.result.sources);
});
