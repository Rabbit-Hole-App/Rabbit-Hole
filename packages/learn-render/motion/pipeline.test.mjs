// M7A: a raw /motion request through every stage (pipeline.mjs), with the model stages and the
// review job doubled: what ran, in which order, and what one repair round and Stop allow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBrief } from './contracts.js';
import { runMotionRequest } from './pipeline.mjs';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const BRIEF = json('m2/softmax-15s-attention.brief.json');
const STORYBOARD = json('m3/softmax-15s-attention.real.storyboard.json');
const REQUEST = '/motion 15s explain me softmax func';
const call = async () => assert.fail('the stages are doubled: no real model call');
const service = { health: async () => ({ version: 'motion-renderer-1-test' }) };

function doubles({ storyboard = ['storyboard'], author = 'composition', job = 'ready' } = {}) {
  const log = [];
  const rec = (stage, extra = {}) => ({ calls: [{ stage, round: extra.round ?? 0, latency_ms: 1000, cost_usd: 0.1 }], format_retries: [] });
  const sb = [...storyboard];
  return {
    log,
    stages: {
      director: async a => { log.push(['director', a.grounding.resolved_target.label]); return { status: 'brief', brief: BRIEF, decision_line: '✓ duration: 15s', ...rec('brief') }; },
      storyboarder: async a => {
        log.push(['storyboard', a.round ?? 0, a.revision ? a.revision.findings.length : null]);
        const status = sb.shift();
        return { status, storyboard: STORYBOARD, check: { errors: status === 'storyboard' ? [] : ['B9: unknown claim'] }, ...rec('storyboard', a) };
      },
      author: async a => { log.push(['author', a.round]); return author === 'composition' ? { status: 'composition', output: { status: 'composition', composition_id: 'softmax', source: 'SRC' }, check: { errors: [] }, ...rec('author', a) } : { status: 'failed', error: 'model_error', detail: 'HTTP 500', calls: [], format_retries: [] }; },
      job: async a => {
        log.push(['job', a.prior.repair_count, a.origin.storyboard]);
        const ready = job === 'ready';
        return { job: { id: 'motion-job-t', status: ready ? 'ready' : 'failed', ...(ready ? {} : { failure_reason: 'still blocking after the repair round: blank_frame' }) }, passes: [], render: ready ? { render_id: 'a'.repeat(32), status: 'ready' } : null, calls: [{ stage: 'visual_review', round: 0, latency_ms: 500, cost_usd: 0.05 }], job_errors: [], repair: null, storyboard_revised: false };
      },
    },
  };
}
const run = (d, extra = {}) => runMotionRequest({ message: REQUEST, location: { concept: 'attention' }, call, service, dir: mkdtempSync(join(tmpdir(), 'motion-pipeline-')), stages: d.stages, ...extra });

test('a raw /motion request reaches the existing type "video" block: resolver, grounding, brief, storyboard, Author, review job', async () => {
  const d = doubles();
  const stages = [];
  const r = await run(d, { onStage: s => stages.push(s) });
  assert.equal(r.status, 'ready');
  assert.deepEqual(d.log, [['director', 'softmax in CausalSelfAttention.forward (model.py:69)'], ['storyboard', 0, null], ['author', 0], ['job', 0, 'model_generated']]);
  assert.deepEqual(stages.filter(s => !s.startsWith('job:')), ['resolving', 'directing', 'storyboarding', 'authoring', 'review_and_render', 'ready']);
  assert.equal(r.block.type, 'video');
  assert.equal(r.block.mode, 'generate');
  assert.deepEqual(r.block.operation, { op: 'motion_render', render_id: 'a'.repeat(32) });
  assert.equal(r.block.title, BRIEF.title);
  assert.equal(r.block.motion.duration_seconds, 15);
  assert.deepEqual(r.block.motion.source_refs.map(s => `${s.path}:${s.start_line}-${s.end_line}`), BRIEF.source_refs.map(s => `${s.path}:${s.start_line}-${s.end_line}`));
  assert.ok(!JSON.stringify(r.block).includes(BRIEF.raw_user_request), 'no learner words in the block');
  assert.equal(r.cost_usd, 0.35);
  assert.equal(r.model_latency_s, 3.5);
  assert.deepEqual(r.target.source_refs, ['model.py:44-45', 'model.py:48-50', 'model.py:62-64', 'model.py:65-71']);
  assert.deepEqual(validateBrief(r.brief), []);
});

test('an unresolved target asks one clarification before any paid call', async () => {
  const d = doubles();
  const r = await run(d, { location: {} });
  assert.equal(r.status, 'needs_clarification');
  assert.match(r.clarification.question, /CausalSelfAttention\.forward .* or in GPT\.generate/);
  assert.deepEqual(d.log, []);
  assert.deepEqual(r.calls, []);
});

test('a storyboard that fails its checks spends the ONE repair round on a Director revision; the Author then runs in round 1', async () => {
  const d = doubles({ storyboard: ['storyboard_invalid', 'storyboard'] });
  const r = await run(d);
  assert.equal(r.status, 'ready');
  assert.deepEqual(d.log.slice(1), [['storyboard', 0, null], ['storyboard', 1, 1], ['author', 1], ['job', 1, 'model_generated']]);
  const d2 = doubles({ storyboard: ['storyboard_invalid', 'storyboard_invalid'] });
  const r2 = await run(d2);
  assert.equal(r2.status, 'failed');
  assert.match(r2.failure_reason, /^storyboard \(repair round\): storyboard_invalid: B9: unknown claim/);
  assert.equal(d2.log.filter(l => l[0] === 'storyboard').length, 2, 'no second revision');
  assert.equal(d2.log.filter(l => l[0] === 'author').length, 0);
});

test('a failed Author or a failed review job fails the request with its reason; no block', async () => {
  const r = await run(doubles({ author: 'failed' }));
  assert.equal(r.status, 'failed');
  assert.match(r.failure_reason, /^author: model_error: HTTP 500/);
  assert.equal(r.block, undefined);
  const r2 = await run(doubles({ job: 'failed' }));
  assert.equal(r2.status, 'failed');
  assert.match(r2.failure_reason, /blank_frame/);
  assert.equal(r2.block, undefined);
});

test('Stop: nothing new starts after the signal; the stage it stopped in is reported', async () => {
  const d = doubles();
  const stop = new AbortController();
  d.stages.director = async () => { stop.abort(); return { status: 'brief', brief: BRIEF, calls: [], format_retries: [] }; };
  const r = await run(d, { signal: stop.signal });
  assert.equal(r.status, 'cancelled');
  assert.equal(r.failure_reason, 'stopped during directing');
  assert.deepEqual(d.log, [], 'no storyboard, Author or render after Stop');
});

test('a response that breaks off mid-stream fails the stage (never a crash, never retried); anything else fails the request with the calls so far', async () => {
  const { runAuthor } = await import('./author.js');
  let sent = 0;
  const dropped = async () => { sent++; return { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), text: async () => { throw new TypeError('terminated'); } }; };
  const a = await runAuthor({ brief: BRIEF, storyboard: STORYBOARD, call: dropped });
  assert.deepEqual([a.status, a.error, sent], ['failed', 'model_error', 1]);
  assert.match(a.detail, /the response broke off: terminated/);
  const d = doubles();
  d.stages.author = async () => { throw new Error('socket closed\nstack'); };
  const r = await run(d);
  assert.equal(r.status, 'failed');
  assert.equal(r.failure_reason, 'authoring: socket closed');
  assert.deepEqual(r.calls.map(c => c.stage), ['brief', 'storyboard'], 'the calls already made stay recorded');
});
