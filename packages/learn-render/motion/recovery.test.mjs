// Recovery by cause (owner message 38): what a failed job saves (its checkpoint), how each cause recovers from it, and the
// orchestrator's artifacts and /recover routes. Every model stage, render and the renderer are doubled: nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairFindings } from './contracts.js';
import { fixtureSource } from './fixture-source.js';
import { RECOVERY_POLICY, motionOrchestrator, recoveryActions, sealCheckpoint, signGrant } from './orchestrator.mjs';
import { runMotionRequest } from './pipeline.mjs';
import { runMotionJob } from './review-job.mjs';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const INPUTS = JSON.parse(readFileSync(join(FIX, 'm5', 'inputs.json'), 'utf8'));
const json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const I = INPUTS.softmax;
const BRIEF = json(I.brief), STORYBOARD = json(I.storyboard), SOURCE = readFileSync(join(FIX, I.composition), 'utf8');
const REQUEST = '/motion 15s explain me softmax func';
const tmp = () => mkdtempSync(join(tmpdir(), 'motion-recovery-'));
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

// The model stages and the review job's renders and reviewers, doubled; `log` is what ran, in order.
function world({ reviews = [], previews = [], finals = [], authorFails = false } = {}) {
  const log = [];
  const rec = stage => ({ calls: [{ stage, round: 0, latency_ms: 1, cost_usd: 0.1 }], format_retries: [] });
  const preview = async a => {
    log.push(['preview', a.author.output.source.slice(0, 8)]);
    const next = previews.shift() ?? 'ready';
    if (next !== 'ready') return { submitted: true, result: { status: 'render_failed', render_id: null, failure: { category: 'service_unreachable', detail: 'HTTP 503' } } };
    mkdirSync(join(a.dir, 'frames'), { recursive: true });
    for (const f of ['f0', 'f1', 'f2']) writeFileSync(join(a.dir, 'frames', `${f}.png`), PNG);
    return { submitted: true, result: { status: 'ready', nonblank: { ok: true }, frames: ['f0', 'f1', 'f2'].map((f, i) => ({ frame: i, time: i, beat: 'B1', file: `frames/${f}.png` })) } };
  };
  const final = async a => {
    log.push(['final', a.author.output.source.slice(0, 8)]);
    const next = finals.shift() ?? 'ready';
    return next === 'ready' ? { submitted: true, result: { status: 'ready', render_id: 'f'.repeat(32), validation: { ok: true } } }
      : { submitted: true, result: { status: 'render_failed', render_id: null, failure: { category: 'timeout', detail: 'the render service did not finish' } } };
  };
  const review = async a => {
    log.push([`${a.reviewer}_review`, a.round]);
    if (reviews[0] === 'model_error') { reviews.shift(); return { status: 'failed', error: 'model_error', detail: 'HTTP 529', calls: [], format_retries: [] }; }
    return { status: 'reviewed', findings: (reviews.shift() || []).map(f => ({ reviewer: a.reviewer, round: a.round, ...f })), calls: [{ stage: `${a.reviewer}_review`, round: a.round, cost_usd: 0.05 }], format_retries: [] };
  };
  const revise = async a => { log.push(['storyboard_revision', a.revision.findings]); return { status: 'storyboard', storyboard: { ...a.revision.storyboard, version: 2 }, check: { errors: [] }, ...rec('storyboard') }; };
  const repairAuthor = async a => { log.push(['author_repair', a.repair?.findings ?? null, a.repair?.source?.slice(0, 8) ?? null]); return { status: 'composition', output: { status: 'composition', composition_id: 'softmax-fixed', source: 'REPAIRED' }, ...rec('author') }; };
  const stages = {
    director: async () => { log.push(['director']); return { status: 'brief', brief: BRIEF, ...rec('brief') }; },
    storyboarder: async () => { log.push(['storyboard']); return { status: 'storyboard', storyboard: STORYBOARD, check: { errors: [] }, ...rec('storyboard') }; },
    author: async () => { log.push(['author']); return authorFails ? { status: 'failed', error: 'model_error', detail: 'stream broke', calls: [], format_retries: [] } : { status: 'composition', output: { status: 'composition', composition_id: I.composition_id, source: SOURCE }, check: { errors: [] }, ...rec('author') }; },
    job: args => runMotionJob({ ...args, preview, final, review, revise, repairAuthor }),
    final,
  };
  return { log, stages };
}
const service = { health: async () => ({ version: 'motion-renderer-1-test' }) };
const run = (w, extra = {}) => runMotionRequest({ message: REQUEST, location: { concept: 'attention' }, source: fixtureSource(), call: async () => assert.fail('doubled'), service, dir: tmp(), stages: w.stages, ...extra });
const BLOCKING = [{ category: 'must_not_claim_violation', beat_id: 'B2', description: 'B2 says softmax keeps the raw scores.' }];

test('renderer temporary failure: the accepted composition is saved, and Retry rendering renders it again with 0 model calls', async () => {
  const w = world({ reviews: [[], []], finals: ['render_failed'] });
  const r = await run(w);
  assert.equal(r.status, 'failed');
  assert.equal(r.cause, 'renderer');
  assert.equal(r.checkpoint.composition.state, 'accepted');
  assert.equal(r.checkpoint.composition.output.source, SOURCE);
  assert.deepEqual([r.checkpoint.request, r.checkpoint.brief.id, r.checkpoint.storyboard.id], [REQUEST, BRIEF.id, STORYBOARD.id]);
  assert.deepEqual(recoveryActions(r.cause, r.checkpoint), ['render']);
  const w2 = world();
  const again = await runMotionRequest({ call: async () => assert.fail('a render recovery calls no model'), service, dir: tmp(), stages: w2.stages, recover: { mode: 'render', checkpoint: r.checkpoint } });
  assert.equal(again.status, 'ready');
  assert.deepEqual(w2.log, [['final', SOURCE.slice(0, 8)]], 'no Director, storyboard, Author, preview or review');
  assert.deepEqual(again.calls, []);
  assert.equal(again.block.operation.render_id, 'f'.repeat(32));
  assert.equal(again.block.title, BRIEF.title);
});

test('content findings: the saved review findings feed the targeted repair verbatim, then one fresh review, then the final', async () => {
  const w = world({ reviews: [[], BLOCKING, [], BLOCKING] });
  const r = await run(w);
  assert.equal(r.status, 'failed');
  assert.equal(r.cause, 'content');
  assert.equal(r.checkpoint.composition.state, 'blocking');
  assert.equal(r.checkpoint.composition.output.source, 'REPAIRED', 'the latest valid composition, the repaired one');
  assert.deepEqual(r.checkpoint.findings.map(f => [f.reviewer, f.round, f.category, f.description]), [['pedagogical', 1, 'must_not_claim_violation', BLOCKING[0].description]]);
  assert.equal(r.checkpoint.frames.length, 3, 'its preview keyframes');
  assert.deepEqual(recoveryActions(r.cause, r.checkpoint), ['fix', 'edit']);
  const w2 = world({ reviews: [[], []] });
  const fixed = await runMotionRequest({ call: async () => assert.fail('doubled'), service, dir: tmp(), stages: w2.stages, recover: { mode: 'fix', checkpoint: r.checkpoint } });
  assert.equal(fixed.status, 'ready');
  const [revision, repair, ...rest] = w2.log;
  assert.deepEqual(revision, ['storyboard_revision', r.checkpoint.findings], 'storyboard-level findings: the one Director revision gets the exact findings');
  assert.deepEqual(repairFindings(repair[1]), repairFindings(r.checkpoint.findings), 'the Author repair gets the exact findings');
  assert.equal(repair[2], 'REPAIRED', 'and the saved composition as its previous source');
  assert.deepEqual(rest, [['preview', 'REPAIRED'], ['visual_review', 1], ['pedagogical_review', 1], ['final', 'REPAIRED']]);
  assert.ok(!w2.log.some(l => ['director', 'storyboard', 'author'].includes(l[0])), 'no new brief, storyboard or first-pass Author call');
});

test('missing context: one specific question before any paid call; the card offers Edit request and Add source', async () => {
  const w = world();
  const r = await run(w, { location: {} });
  assert.equal(r.status, 'needs_clarification');
  assert.equal(r.cause, 'missing_context');
  assert.match(r.clarification.question, /CausalSelfAttention\.forward .* or in GPT\.generate/);
  assert.deepEqual([w.log, r.calls], [[], []]);
  assert.deepEqual(recoveryActions(r.cause, r.checkpoint), ['edit', 'source']);
});

test('a model step that fails partway keeps the work so far: an unreviewed composition is reviewed on recovery, never re-authored', async () => {
  const w = world({ reviews: ['model_error'] });
  const r = await run(w);
  assert.equal(r.cause, 'model');
  assert.equal(r.checkpoint.composition.state, 'unreviewed');
  assert.deepEqual(recoveryActions(r.cause, r.checkpoint), ['fix']);
  const w2 = world({ reviews: [[], []] });
  const done = await runMotionRequest({ call: async () => assert.fail('doubled'), service, dir: tmp(), stages: w2.stages, recover: { mode: 'fix', checkpoint: r.checkpoint } });
  assert.equal(done.status, 'ready');
  assert.deepEqual(w2.log, [['preview', SOURCE.slice(0, 8)], ['visual_review', 0], ['pedagogical_review', 0], ['final', SOURCE.slice(0, 8)]]);
  // The Author broke before any composition: recovery starts at the Author from the saved storyboard.
  const w3 = world({ authorFails: true });
  const r3 = await run(w3);
  assert.deepEqual([r3.cause, r3.checkpoint.composition, recoveryActions(r3.cause, r3.checkpoint)], ['model', null, ['fix']]);
  const w4 = world({ reviews: [[], []] });
  assert.equal((await runMotionRequest({ call: async () => assert.fail('doubled'), service, dir: tmp(), stages: w4.stages, recover: { mode: 'fix', checkpoint: r3.checkpoint } })).status, 'ready');
  assert.deepEqual(w4.log.map(l => l[0]), ['author', 'preview', 'visual_review', 'pedagogical_review', 'final']);
});

test('recovery actions: only what works for the cause; a limit offers nothing; content without a storyboard only Edit request', () => {
  const cp = state => ({ brief: BRIEF, storyboard: STORYBOARD, composition: state ? { state } : null });
  assert.deepEqual(recoveryActions('renderer', cp('unreviewed')), ['fix'], 'a render failure before review: the reviews still have to run');
  assert.deepEqual(recoveryActions('stopped', cp('accepted')), ['render']);
  assert.deepEqual(recoveryActions('limit', cp('blocking')), []);
  assert.deepEqual(recoveryActions('content', { brief: BRIEF }), ['edit']);
  assert.deepEqual(recoveryActions('model', null), []);
  assert.deepEqual(Object.keys(RECOVERY_POLICY.render), [], 'a render recovery may call no model');
});

// The orchestrator: artifacts outlive the job directory, the seal admits only its own checkpoints, the recovery policy.
const TOKEN = 'r'.repeat(40);
async function orchestrator(t, run, extra = {}) {
  const outDir = tmp();
  const o = motionOrchestrator({ token: TOKEN, service: { health: async () => ({ ok: true, busy: false, sandbox: 'linux' }), submit: async () => new Response('{}') }, call: async () => Response.json({ model: 'claude-opus-5-5', usage: { input_tokens: 0, output_tokens: 10 } }), outDir, run, ...extra });
  const server = createServer(o.handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); o.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  let n = 0;
  const grant = (micros = 2_000_000) => { const key = `op-motion-rec-${++n}`, at = Math.floor(Date.now() / 1000); return { idempotency_key: key, grant: { micros, issued_at: at, boot: o.boot, sig: signGrant(TOKEN, key, micros, at, o.boot) } }; };
  const done = async id => { for (let i = 0; i < 500; i++) { const v = await (await req(`/jobs/${id}`)).json(); if (v.status !== 'running') return v; await new Promise(r => setTimeout(r, 5)); } assert.fail('job did not end'); };
  return { o, req, grant, done, outDir };
}

test('orchestrator: a failed job keeps its sealed checkpoint, cause, findings and keyframes after its directory is deleted', async t => {
  const run = async ({ dir, onStage }) => {
    mkdirSync(join(dir, 'round-1', 'frames'), { recursive: true });
    writeFileSync(join(dir, 'round-1', 'frames', 'a.png'), PNG);
    const out = { checkpoint: { request: REQUEST, brief: BRIEF, storyboard: STORYBOARD, composition: { output: { status: 'composition', composition_id: 'x', source: SOURCE }, state: 'blocking' }, findings: [{ reviewer: 'pedagogical', round: 1, ...BLOCKING[0] }], frames: ['round-1/frames/a.png'] } };
    onStage('review_and_render', out);
    return { status: 'failed', failure_reason: 'still blocking after the Author repair: must_not_claim_violation', cause: 'content', checkpoint: out.checkpoint, job: { findings: out.checkpoint.findings } };
  };
  const { req, grant, done, outDir } = await orchestrator(t, run);
  const { job_id } = await (await req('/jobs', { request: REQUEST, ...grant() })).json();
  const view = await done(job_id);
  assert.deepEqual([view.status, view.cause, view.artifacts_rev > 0], ['failed', 'content', true]);
  assert.deepEqual(readdirSync(outDir), [], 'the job directory is gone');
  const a = await (await req(`/jobs/${job_id}/artifacts`)).json();
  assert.deepEqual([a.cause, a.actions, a.blocking], ['content', ['fix', 'edit'], [{ category: 'must_not_claim_violation', beat_id: 'B2', description: BLOCKING[0].description }]]);
  assert.equal(a.checkpoint.composition.output.source, SOURCE);
  assert.equal(a.seal, sealCheckpoint(TOKEN, a.checkpoint));
  assert.deepEqual(a.frames, [{ file: 'round-1/frames/a.png', png: PNG.toString('base64') }]);
  assert.ok(a.hold_usd.fix > 0 && a.hold_usd.render === 0);
});

test('orchestrator /recover: only a checkpoint it sealed starts; a render recovery under the policy refuses any model call', async t => {
  const seen = [];
  const run = async ({ recover, call }) => {
    seen.push(recover?.mode ?? 'new');
    const r = await call({}, { max_tokens: 100, tools: [{ name: 'motion_review' }], messages: [{ role: 'user', content: 'x' }] }, 'claude-opus-5-5');
    return { status: r.ok ? 'ready' : 'failed', failure_reason: r.ok ? null : await r.text(), cause: 'renderer', checkpoint: recover?.checkpoint };
  };
  const { req, grant, done } = await orchestrator(t, run, { policy: { motion_review: { calls: 4, max_tokens: 16000, bytes: 24000, images: 20 } } });
  const checkpoint = { request: REQUEST, brief: BRIEF, storyboard: STORYBOARD, composition: { output: { status: 'composition', composition_id: 'x', source: SOURCE }, state: 'accepted' }, findings: [], frames: [] };
  const seal = sealCheckpoint(TOKEN, checkpoint);
  const forged = await req('/recover', { ...grant(), mode: 'render', checkpoint: { ...checkpoint, composition: { ...checkpoint.composition, output: { ...checkpoint.composition.output, source: 'export default () => fetch(1)' } } }, seal });
  assert.equal(forged.status, 400, 'a changed composition is refused: never learner-supplied code');
  assert.equal((await req('/recover', { ...grant(), mode: 'render', checkpoint, seal, extra: 1 })).status, 400);
  assert.deepEqual(seen, []);
  const body = { ...grant(), mode: 'render', checkpoint, seal };
  const started = await (await req('/recover', body)).json();
  assert.equal((await (await req('/recover', body)).json()).job_id, started.job_id, 'the same key is the same job');
  const v = await done(started.job_id);
  assert.equal(v.status, 'failed');
  assert.match(v.failure_reason, /motion_review call is outside the production policy/);
  assert.deepEqual([v.spend.calls, v.cause], [0, 'limit'], 'nothing was sent; the refusal is the limit');
  assert.deepEqual(seen, ['render']);
});
