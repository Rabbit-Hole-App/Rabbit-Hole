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
        log.push(['job', a.prior.repairs.storyboard, a.prior.repairs.author, a.origin.storyboard]);
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
  assert.deepEqual(d.log, [['director', 'softmax in CausalSelfAttention.forward (model.py:69)'], ['storyboard', 0, null], ['author', 0], ['job', 0, 0, 'model_generated']]);
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

test('a storyboard that fails its checks spends the STORYBOARD repair; the Author keeps its own (owner decision 2026-10-05)', async () => {
  const d = doubles({ storyboard: ['storyboard_invalid', 'storyboard'] });
  const r = await run(d);
  assert.equal(r.status, 'ready');
  // The revision is the storyboard's round 1; the Author's first pass is round 0 and its repair is unused.
  assert.deepEqual(d.log.slice(1), [['storyboard', 0, null], ['storyboard', 1, 1], ['author', 0], ['job', 1, 0, 'model_generated']]);
  assert.deepEqual(r.storyboard_repair, { findings: 1, errors: ['B9: unknown claim'], status: 'storyboard' });
  const d2 = doubles({ storyboard: ['storyboard_invalid', 'storyboard_invalid'] });
  const r2 = await run(d2);
  assert.equal(r2.status, 'failed');
  assert.match(r2.failure_reason, /^storyboard \(after its repair\): storyboard_invalid: B9: unknown claim/);
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

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
// M7A (owner decision 2026-10-05): how an Author response ended, and the ONE transport retry.
const SOFTMAX_SOURCE = readFileSync(join(FIX, 'm5/softmax-15s-attention.real.composition.jsx'), 'utf8');
const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const sse = (events, { breakAfter = null } = {}) => {
  const text = events.join('');
  // The data arrives, then the connection breaks on the next read (as a real dropped stream does).
  let sent = false;
  return new Response(new ReadableStream({ pull(c) {
    if (!sent) { sent = true; c.enqueue(new TextEncoder().encode(breakAfter === null ? text : text.slice(0, breakAfter))); return; }
    if (breakAfter === null) c.close(); else c.error(new TypeError('terminated'));
  } }), { headers: { 'content-type': 'text/event-stream' } });
};
const authorEvents = (input, stop = 'tool_use') => [
  ev('message_start', { message: { model: 'claude-opus-5-5', usage: { input_tokens: 9000, output_tokens: 1 } } }),
  ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'motion_composition', input: {} } }),
  ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }),
  ev('content_block_stop', { index: 0 }),
  ev('message_delta', { delta: { stop_reason: stop }, usage: { output_tokens: 30000 } }),
  ev('message_stop', {}),
];
const composition = { status: 'composition', composition_id: 'softmax-attention-weights', source: SOFTMAX_SOURCE };

test('how a response ended: transport interrupted, gateway timeout, max_tokens, malformed tool arguments, provider error, refusal, complete', async () => {
  const { classifyEnd, readMessage, StreamEnded } = await import('./stream-message.js');
  const ended = async response => { try { return classifyEnd({ message: await readMessage(response), tool: 'motion_composition' }); } catch (error) { return classifyEnd({ error }); } };
  assert.deepEqual(await ended(sse(authorEvents(composition))), { kind: 'complete', detail: 'tool_use' });
  assert.deepEqual(await ended(sse(authorEvents(composition), { breakAfter: 400 })), { kind: 'transport_interrupted', detail: 'terminated' });
  assert.equal((await ended(sse(authorEvents(composition).slice(0, -1)))).detail, 'the stream ended before message_stop');
  assert.equal((await ended(sse(authorEvents(composition, 'max_tokens')))).kind, 'max_tokens');
  assert.equal((await ended(sse([...authorEvents(composition).slice(0, 2), ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{"status": "comp' } }), ...authorEvents(composition).slice(3)]))).kind, 'malformed_tool_arguments');
  assert.deepEqual(await ended(sse([authorEvents(composition)[0], ev('error', { error: { type: 'overloaded_error', message: 'busy' } })])), { kind: 'provider_error', detail: 'overloaded_error: busy' });
  assert.deepEqual(classifyEnd({ message: { stop_reason: 'refusal', stop_details: { category: 'cyber' } } }), { kind: 'refusal', detail: 'cyber' });
  for (const [status, kind] of [[504, 'gateway_timeout'], [524, 'gateway_timeout'], [408, 'gateway_timeout'], [502, 'transport_interrupted'], [500, 'provider_error'], [429, 'provider_error'], [529, 'provider_error']]) assert.equal(classifyEnd({ response: new Response('x', { status }) }).kind, kind, String(status));
  assert.equal(classifyEnd({ error: Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' }) }).kind, 'gateway_timeout');
  assert.equal(classifyEnd({ error: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }) }).kind, 'transport_interrupted');
  // What arrived before the break stays readable (its usage is the cost record).
  try { await readMessage(sse(authorEvents(composition), { breakAfter: 400 })); assert.fail('should break'); }
  catch (error) { assert.ok(error instanceof StreamEnded); assert.equal(error.partial.usage.input_tokens, 9000); }
});

test('the Author\'s ONE transport retry: only for a broken transport with no complete result, recorded, never a repair', async () => {
  const { runAuthor } = await import('./author.js');
  const brief = read('./fixtures/m2/softmax-15s-attention.brief.json'), storyboard = read('./fixtures/m3/softmax-15s-attention.real.storyboard.json');
  const runWith = async replies => { let sent = 0; const r = await runAuthor({ brief, storyboard, call: async () => { sent++; return replies.shift()(); } }); return { r, sent }; };
  // Broken once, then complete: one retry, recorded with its kind; the result is the composition.
  const once = await runWith([() => sse(authorEvents(composition), { breakAfter: 400 }), () => sse(authorEvents(composition))]);
  assert.equal(once.r.status, 'composition');
  assert.equal(once.sent, 2);
  assert.deepEqual(once.r.transport_retries, [{ stage: 'author', round: 0, kind: 'transport_interrupted', detail: 'terminated' }]);
  assert.deepEqual(once.r.calls.map(c => [c.end, c.partial ?? false]), [['transport_interrupted', true], ['complete', false]]);
  assert.deepEqual(once.r.format_retries, [], 'a transport retry is not a format re-ask');
  // Broken twice: no third send; the stage fails with the kind.
  const twice = await runWith([() => sse(authorEvents(composition), { breakAfter: 400 }), () => new Response('gateway', { status: 504 })]);
  assert.deepEqual([twice.r.status, twice.r.error, twice.r.end, twice.sent], ['failed', 'model_error', 'gateway_timeout', 2]);
  assert.match(twice.r.detail, /^gateway_timeout: HTTP 504/);
  // A gateway timeout first is retried too; a provider error or a refusal never is.
  assert.equal((await runWith([() => new Response('x', { status: 504 }), () => sse(authorEvents(composition))])).r.status, 'composition');
  for (const reply of [() => new Response('boom', { status: 500 }), () => sse([authorEvents(composition)[0], ev('error', { error: { type: 'overloaded_error', message: 'busy' } })])]) {
    const r = await runWith([reply, () => sse(authorEvents(composition))]);
    assert.deepEqual([r.r.status, r.r.end, r.sent, r.r.transport_retries.length], ['failed', 'provider_error', 1, 0]);
  }
  // Stop is never retried: it leaves the stage as it came.
  const { MotionCancelled } = await import('./review-job.mjs');
  let stopped = 0;
  await assert.rejects(runAuthor({ brief, storyboard, call: async () => { stopped++; throw new MotionCancelled(); } }), /cancelled/);
  assert.equal(stopped, 1);
  // max_tokens and malformed tool arguments are the schema-only re-ask, not a transport retry.
  const capped = await runWith([() => sse(authorEvents(composition, 'max_tokens')), () => sse(authorEvents(composition))]);
  assert.deepEqual([capped.r.status, capped.r.format_retries.length, capped.r.transport_retries.length], ['composition', 1, 0]);
});

test('a transport retry reaches the job record and nothing renders from an incomplete result', async () => {
  const d = doubles();
  const rendered = [];
  d.stages.author = async () => ({ status: 'composition', output: { status: 'composition', composition_id: 'softmax', source: 'SRC' }, check: { errors: [] }, calls: [{ stage: 'author', round: 0, end: 'transport_interrupted', latency_ms: 1, cost_usd: null }, { stage: 'author', round: 0, end: 'complete', latency_ms: 1, cost_usd: 0.6 }], format_retries: [], transport_retries: [{ stage: 'author', round: 0, kind: 'transport_interrupted', detail: 'terminated' }] });
  d.stages.job = async a => { rendered.push(a.author.output.source); return { job: { id: 'j', status: 'ready', repairs: a.prior.repairs, transport_retries: a.prior.transport_retries }, passes: [], render: { render_id: 'a'.repeat(32) }, calls: [], job_errors: [], repair: null, storyboard_revised: false }; };
  const r = await run(d);
  assert.equal(r.status, 'ready');
  assert.deepEqual(r.transport_retries, [{ stage: 'author', round: 0, kind: 'transport_interrupted', detail: 'terminated' }]);
  assert.deepEqual(rendered, ['SRC'], 'only the complete composition reaches the render job');
  assert.deepEqual(r.repairs, { storyboard: 0, author: 0 }, 'a transport retry is not a repair');
  const crash = doubles();
  crash.stages.author = async () => { throw new Error('socket closed\nstack'); };
  const c = await run(crash);
  assert.equal(c.failure_reason, 'authoring: socket closed');
  assert.deepEqual(c.calls.map(x => x.stage), ['brief', 'storyboard'], 'the calls already made stay recorded');
});

// M7B: one request, either backend; a renderer proof may reuse an accepted plan instead of the Director.
test('renderer hyperframes reaches the Author, the review job and the block; Remotion stays the default', async () => {
  const seen = [];
  const d = doubles();
  const author = d.stages.author, job = d.stages.job;
  d.stages.author = async a => { seen.push(['author', a.renderer]); return author(a); };
  d.stages.job = async a => { seen.push(['job', a.renderer]); return job(a); };
  const r = await run(d, { renderer: 'hyperframes' });
  assert.equal(r.status, 'ready');
  assert.deepEqual(seen, [['author', 'hyperframes'], ['job', 'hyperframes']]);
  assert.equal(r.block.motion.renderer, 'hyperframes');
  assert.equal(r.renderer, 'hyperframes');
  seen.length = 0;
  const d2 = doubles();
  const author2 = d2.stages.author, job2 = d2.stages.job;
  d2.stages.author = async a => { seen.push(['author', a.renderer]); return author2(a); };
  d2.stages.job = async a => { seen.push(['job', a.renderer]); return job2(a); };
  const r2 = await run(d2);
  assert.deepEqual(seen, [['author', 'remotion'], ['job', 'remotion']]);
  assert.equal(r2.block.motion.renderer, 'remotion');
});

test('a plan: the accepted brief and storyboard, validated again, no Director call; an invalid plan fails before any call', async () => {
  const plan = json('m7b/plan-softmax.json');
  const d = doubles();
  const r = await run(d, { renderer: 'hyperframes', plan: { brief: plan.brief, storyboard: plan.storyboard, from: plan.from } });
  assert.equal(r.status, 'ready', r.failure_reason);
  assert.deepEqual(d.log.map(l => l[0]), ['author', 'job'], 'no director, no storyboarder');
  assert.deepEqual(r.plan, { from: plan.from, storyboard_origin: 'model_generated', reused: true });
  assert.equal(r.brief, plan.brief);
  assert.equal(r.storyboard, plan.storyboard);
  const bad = doubles();
  const f = await run(bad, { plan: { brief: plan.brief, storyboard: { ...plan.storyboard, beats: plan.storyboard.beats.slice(1) }, from: 'x' } });
  assert.equal(f.status, 'failed');
  assert.match(f.failure_reason, /^plan: /);
  assert.deepEqual(bad.log, []);
});
