// Mocked: a scripted transport stands in for the worker, JEV and the model. These prove the session's contract (one
// request, late results dropped, idempotency, refine, coalescing), never provider behaviour or latency.
import { scripted } from './inline-ai-test-transport.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInlineSession, stageTimings } from './inline-ai-session.js';
import { readGeneration, readSse } from './inline-ai-transport.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const snapshot = (extra = {}) => () => {
  const context = { target: { objects: [{ id: 'n23', type: 'shape', text: '23' }] } };
  return { request: { kind: 'selection', targetIds: ['n23'], context }, context, summary: 'shape "23"', frozen: { ids: ['n23'] }, prints: { target: 't', relations: 'r' }, selectionOnly: false, ...extra };
};
const okValidate = result => ({ ok: true, preview: { text: result.text || result.block?.type || 'x' } });
let clock = 0;
const now = () => (clock += 1);
const make = (transport, extra = {}) => {
  const changes = [], metrics = [];
  const session = createInlineSession({ transport: scripted(transport), boardKey: 'board-a', enabled: ['note', 'diagram', 'code', 'motion'], validate: okValidate, now, flushMs: 0, onChange: state => changes.push(state), onMetrics: entry => metrics.push(entry), ...extra });
  return { session, changes, metrics };
};
for (const result of ['artifact', 'paid_proposal']) test(`${result} preserves extraction receipts through validation and cached reuse`, async () => {
  const extraction = { source: { blockId: 'image-1', source: { id: 'source-1', rev: 'rev-1' }, coverage: 'whole-image' }, uncertainties: [{ location: 'row 2', message: 'Digit unclear' }] };
  let calls = 0;
  const seen = [];
  const { session } = make({ artifact: async () => { calls++; return { result, primitive: 'code', block: { type: 'code', code: 'x=1' }, extraction }; } }, {
    validate: value => { seen.push(value); return { ok: true, preview: { block: value.block, extraction: value.extraction } }; },
  });
  await session.submit({ mode: 'explain', prompt: '/code extract this', prepare: snapshot() });
  assert.deepEqual(seen[0].extraction, extraction);
  assert.deepEqual(session.state.preview.extraction, extraction);
  session.reject();
  assert.equal(await session.submit({ mode: 'explain', prompt: '/code extract this', prepare: snapshot() }), 'reused');
  assert.deepEqual(seen[1].extraction, extraction);
  assert.equal(calls, 1);
  if (result === 'paid_proposal') assert.equal(session.state.status, 'proposal', 'reuse does not authorize paid execution');
});
test('notebook preparation is awaited, cancellation drops it before any request',async()=>{
 const waiting=deferred();let calls=0;
 const {session}=make({generate:async()=>{calls++;return{result:{kind:'note',text:'unused'}};}});
 const pending=session.submit({mode:'edit',prompt:'Edit selected cells',prepare:()=>waiting.promise});
 session.cancel();waiting.resolve(snapshot()());assert.equal(await pending,'dropped');assert.equal(calls,0);
});
test('async notebook acceptance remains pending and duplicate Accept cannot apply twice',async()=>{
 const {session}=make({generate:async()=>({result:{kind:'note',text:'ready'}})});
 await session.submit({mode:'explain',prompt:'Explain',prepare:snapshot()});
 const waiting=deferred();let applies=0;
 const pending=session.accept(()=>{applies++;return waiting.promise;});
 assert.deepEqual(session.accept(()=>{applies++;return{ok:true};}),{ignored:true});
 waiting.resolve({ok:true});assert.deepEqual(await pending,{ok:true});assert.equal(applies,1);assert.equal(session.state.status,'accepted');
});

test('a plain explain: one check (its route fixed), one generation, streamed text coalesced, then a validated preview', async () => {
  const calls = { route: 0, generate: 0 };
  const transport = {
    route: async () => { calls.route += 1; },
    generate: async (input, { onEvent }) => { calls.generate += 1; onEvent({ type: 'meta', streaming: true }); onEvent({ type: 'delta', text: 'Node 23 ' }); onEvent({ type: 'delta', text: 'is a leaf.' }); return { result: { kind: 'note', text: 'Node 23 is a leaf.' } }; },
  };
  const { session, changes, metrics } = make(transport);
  assert.equal(await session.submit({ mode: 'explain', prompt: 'Explain this node', prepare: snapshot() }), 'preview');
  assert.deepEqual(calls, { route: 0, generate: 1 }, 'the route is fixed (a plain explain): the check validates it, no route is chosen');
  assert.ok(changes.some(state => state.status === 'streaming' && state.stream?.text === 'Node 23 '), 'the first chunk showed before the end');
  assert.equal(session.state.preview.text, 'Node 23 is a leaf.');
  assert.equal(metrics[0].routing, 'jev', 'every request is checked once (owner brief 2026-10-13, validation)');
  assert.equal(metrics[0].counts.routeCalls, 1);
  assert.equal(metrics[0].counts.modelCalls, 1);
  assert.equal(metrics[0].streaming, true);
  const timings = stageTimings(metrics[0]);
  assert.equal(typeof timings.routing, 'number');
  assert.ok(timings.firstPreview > 0 && timings.complete >= timings.firstPreview);
});

test('A2: chunks are coalesced into bounded updates (one flush per window), not one render per token', async () => {
  const timers = [];
  const transport = { generate: async (input, { onEvent }) => { for (let i = 0; i < 200; i += 1) onEvent({ type: 'delta', text: 'w ' }); timers.forEach(run => run()); return { result: { kind: 'note', text: 'done' } }; } };
  const { session, metrics } = make(transport, { flushMs: 50, setTimer: run => { timers.push(run); return timers.length; }, clearTimer: () => {} });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
  assert.equal(metrics[0].counts.chunks, 200);
  assert.equal(metrics[0].counts.flushes, 1);
});

test('a second submit while one runs is a counted duplicate, never a second call', async () => {
  const gate = deferred();
  let generations = 0;
  const transport = { generate: async () => { generations += 1; await gate.promise; return { result: { kind: 'note', text: 'once' } }; } };
  const { session, metrics } = make(transport);
  const first = session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
  assert.equal(await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() }), 'duplicate');
  gate.resolve();
  await first;
  assert.equal(generations, 1);
  assert.equal(metrics[0].counts.duplicates, 1);
});

test('the same request again reuses its result: no second generation or charge', async () => {
  let generations = 0;
  const transport = { generate: async () => { generations += 1; return { result: { kind: 'note', text: 'kept' } }; } };
  const { session } = make(transport);
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
  session.reject();
  assert.equal(await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() }), 'reused');
  assert.equal(generations, 1);
  // A changed target is a different request.
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot({ prints: { target: 't2', relations: 'r' } }) });
  assert.equal(generations, 2);
});

test('cancel drops the late result and late chunks; nothing reaches the preview', async () => {
  const gate = deferred();
  let emit;
  const transport = { generate: async (input, { onEvent }) => { emit = onEvent; await gate.promise; return { result: { kind: 'note', text: 'late' } }; } };
  const { session, metrics } = make(transport);
  const pending = session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
  await Promise.resolve();
  session.cancel();
  emit({ type: 'delta', text: 'late chunk' });
  gate.resolve();
  assert.equal(await pending, 'dropped');
  assert.equal(session.state.preview, null);
  assert.equal(session.state.stream, null);
  assert.equal(metrics[0].outcome, 'cancelled');
});

test('a disposed session (board switched, editor closed) lands nothing, even when the answer arrives', async () => {
  const gate = deferred();
  const transport = { generate: async () => { await gate.promise; return { result: { kind: 'note', text: 'late' } }; } };
  const changes = [];
  const { session } = make(transport, { onChange: state => changes.push(state) });
  const pending = session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
  const before = changes.length;
  session.dispose('board-switch');
  gate.resolve();
  await pending;
  assert.equal(changes.length, before, 'no update after dispose');
  assert.deepEqual(session.accept(() => assert.fail('never applied')), { ignored: true });
});

test('refine keeps the previous preview until the revision succeeds; a failed revision keeps it and says why', async () => {
  let round = 0;
  const transport = { generate: async () => { round += 1; if (round === 2) throw new Error('The model failed.'); return { result: { kind: 'note', text: `v${round}` } }; } };
  const { session } = make(transport);
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
  assert.equal(session.state.preview.text, 'v1');
  await session.submit({ mode: 'explain', prompt: 'shorter please', prepare: snapshot() });
  assert.equal(session.state.preview.text, 'v1', 'kept after the failed refine');
  assert.equal(session.state.error, 'The model failed.');
  assert.equal(session.state.status, 'preview');
  await session.submit({ mode: 'explain', prompt: 'shorter still', prepare: snapshot() });
  assert.equal(session.state.preview.text, 'v3');
});

test('accept applies once; a stale target blocks it with the reason and keeps the preview', () => {
  return (async () => {
    const transport = { generate: async () => ({ result: { kind: 'note', text: 'x' } }) };
    const { session } = make(transport);
    await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
    let applies = 0;
    assert.deepEqual(session.accept(() => ({ stale: { content: true } })), { stale: { content: true } });
    assert.equal(session.state.status, 'stale');
    const again = make(transport).session;
    await again.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
    again.accept(() => { applies += 1; return { ok: true }; });
    again.accept(() => { applies += 1; return { ok: true }; });
    assert.equal(applies, 1);
    // The preview's outcome was provisional: the request is recorded as accepted.
    const settled = make(transport);
    await settled.session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot() });
    settled.session.accept(() => ({ ok: true }));
    assert.deepEqual(settled.metrics.map(entry => entry.outcome), ['previewed', 'accepted']);
  })();
});

test('the check: a natural request is checked and routed in one call; a failed check is retryable and never falls through', async () => {
  let routes = 0;
  const generated = [];
  const make2 = route => make({ route: async () => { routes += 1; return route(); }, generate: async input => { generated.push(input.route); return { result: { kind: 'note', text: 'n' } }; }, artifact: async input => { generated.push(input.command); return { result: 'artifact', primitive: input.command, block: { type: 'snippet' } }; } });
  const ok = make2(() => ({ choice: 'diagram', confidence: 0.9, probability: 0.9, ranked: ['diagram', 'note'] }));
  await ok.session.submit({ mode: 'explain', prompt: 'Explain this with a diagram', prepare: snapshot() });
  assert.deepEqual(generated, ['shapes'], 'a diagram is the native one (inline-ai-decide.js INLINE_SLASH)');
  assert.equal(ok.metrics[0].counts.routeCalls, 1);
  const timeout = make2(() => ({ error: 'timeout' }));
  assert.equal(await timeout.session.submit({ mode: 'explain', prompt: 'Explain this with a diagram', prepare: snapshot() }), 'check_failed');
  assert.deepEqual(generated, ['shapes'], 'nothing generated on a failed check');
  assert.equal(timeout.session.state.retry, true);
  assert.equal(timeout.metrics[0].counts.timeouts, 1);
  assert.equal(timeout.metrics[0].routing, 'skipped:timeout');
  const malformed = make2(() => ({ error: 'invalid' }));
  assert.equal(await malformed.session.submit({ mode: 'explain', prompt: 'Explain this with a diagram', prepare: snapshot() }), 'check_failed');
  assert.deepEqual(generated, ['shapes']);
  assert.equal(routes, 3);
});

test('an unsure check asks one question and generates nothing; the learner answers in their own words', async () => {
  let artifacts = 0, generations = 0;
  const { session } = make({ route: async () => ({ choice: 'diagram', confidence: 0.2, probability: 0.4, ranked: ['diagram', 'note'] }), artifact: async () => { artifacts += 1; return { result: 'artifact', primitive: 'x', block: { type: 'snippet' } }; }, generate: async () => { generations += 1; return { result: { kind: 'note', text: 'n' } }; } });
  assert.equal(await session.submit({ mode: 'explain', prompt: 'show the structure', prepare: snapshot() }), 'clarify');
  assert.equal(session.state.clarify.question, 'Which would you like: a text explanation, a diagram or a card?');
  assert.equal(session.state.clarify.options, undefined, 'one question, no menu of guesses');
  assert.deepEqual([artifacts, generations], [0, 0], 'nothing expensive ran on a guess');
});

test('paid: a proposal waits for Generate; declining starts nothing; Motion off is never substituted', async () => {
  let started = 0;
  const motion = args => ({ block: { type: 'video', mode: 'generate', title: `Motion: ${args}` }, message: 'This uses paid generation.' });
  const { session } = make({}, { motion });
  await session.submit({ mode: 'explain', prompt: '/motion softmax in 20s', prepare: snapshot() });
  assert.equal(session.state.status, 'proposal');
  assert.equal(session.state.proposal.message, 'This uses paid generation.');
  session.reject();
  assert.equal(started, 0);
  const off = make({}, { motion, enabled: ['note'] }).session;
  assert.equal(await off.submit({ mode: 'explain', prompt: '/motion softmax', prepare: snapshot() }), 'unsupported');
  assert.match(off.state.declined.message, /not available/);
  // A paid artifact proposal (animate's maths animation) is a proposal too, never a started job.
  const animate = make({ artifact: async () => ({ result: 'paid_proposal', primitive: 'maths_animation', block: { type: 'mathAnimation', operation: {} }, message: 'This uses paid generation.' }) }, { enabled: ['note', 'animate'] }).session;
  await animate.submit({ mode: 'explain', prompt: '/animate it', prepare: snapshot() });
  assert.equal(animate.state.status, 'proposal');
  assert.equal(animate.state.preview.kind, 'proposal');
});

test('the wire: SSE split at any byte boundary parses the same; an error event or a cut stream is an error', async () => {
  const text = 'event: meta\ndata: {"streaming":true}\n\nevent: delta\ndata: {"text":"Node "}\n\nevent: delta\ndata: {"text":"23"}\n\nevent: done\ndata: {"result":{"kind":"note","text":"Node 23"},"usage":{"input_tokens":10,"output_tokens":3}}\n\n';
  const bytes = new TextEncoder().encode(text);
  for (const size of [1, 3, 7, 64]) {
    const stream = new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size)); controller.close(); } });
    const deltas = [];
    const out = await readGeneration(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), event => event.type === 'delta' && deltas.push(event.text));
    assert.deepEqual(deltas, ['Node ', '23']);
    assert.equal(out.result.text, 'Node 23');
  }
  const cut = new Response('event: delta\ndata: {"text":"Node"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(readGeneration(cut, () => {}), /ended before it was complete/);
  const failed = new Response('event: error\ndata: {"error":"AI answers aren’t configured on this preview.","code":"not_configured"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(readGeneration(failed, () => {}), /configured/);
  const messages = [];
  await readSse(new Response('data: {"a":1}\n\ndata: not json\n\n').body, message => messages.push(message));
  assert.deepEqual(messages.map(message => message.event), ['message', 'error']);
});

// Owner 2026-10-13, point 7: an answer depends on its supporting context too. Changing the words around the selection
// (here, the far note the code's explanation relied on) is a new request; a move is not; and editing the canvas never
// calls the model by itself.
test('point 7: a change to supporting text is a new request, a move reuses the answer, and an edit alone calls nothing', async () => {
  const { buildContext, createContextCache, freezeTarget } = await import('./inline-ai-context.js');
  const { CONTEXT_CASES, withBoxes } = await import('./inline-ai-fixtures.js');
  const cache = createContextCache();
  const prepareFor = board => () => {
    const frozen = freezeTarget(board, ['code']);
    const context = buildContext(board, frozen, { cache, boardKey: 'board-a', request: 'Explain what this function does' });
    return { context, summary: 'code', frozen: { ...frozen, prints: context.prints }, prints: context.prints, selectionOnly: false };
  };
  let generations = 0;
  const transport = { generate: async () => { generations += 1; return { result: { kind: 'note', text: `answer ${generations}` } }; } };
  const { session } = make(transport);
  const board = withBoxes(CONTEXT_CASES.code.board());
  await session.submit({ mode: 'explain', prompt: 'Explain what this function does', prepare: prepareFor(board) });
  session.reject();
  const moved = withBoxes({ ...board, items: board.items.map(item => ({ ...item, x: item.x + 40, y: item.y + 25 })) });
  assert.equal(await session.submit({ mode: 'explain', prompt: 'Explain what this function does', prepare: prepareFor(moved) }), 'reused', 'everything moved, nothing changed: the answer stands');
  session.reject();
  assert.equal(generations, 1);
  const cents = withBoxes({ ...board, items: board.items.map(item => (item.id === 'spec' ? { ...item, text: 'total() adds up the cart prices before tax. prices is a list of whole numbers in cents.' } : item)) });
  assert.equal(await session.submit({ mode: 'explain', prompt: 'Explain what this function does', prepare: prepareFor(cents) }), 'preview', 'the note it relied on changed: a new answer');
  assert.equal(generations, 2);
  assert.equal(session.state.preview.text, 'answer 2');
});

// The validation brief: an empty request is invalid, answered by the free local check with one short message and no call;
// a request the check does not let through creates nothing, keeps the words, and the composer shows its message.
test('the check: an empty request is invalid with no call; unsupported, blocked and clarify generate nothing', async () => {
  let checks = 0, generations = 0;
  const answers = { 'please send this to my team': { decision: 'unsupported', message: 'That isn\'t something the editor can make here.', paid: false }, 'something prohibited': { decision: 'blocked', message: 'I can\'t help with that request.', paid: false }, 'make a chart': { decision: 'clarify', message: 'What values or content should it use?', missing: ['data'], paid: false } };
  const { session } = make({ decide: async ({ request }) => { checks += 1; return answers[request.prompt]; }, generate: async () => { generations += 1; return { result: { kind: 'note', text: 'n' } }; } });
  assert.equal(await session.submit({ mode: 'explain', prompt: '   ', prepare: snapshot() }), 'invalid');
  assert.equal(session.state.declined.message, 'Describe what you\'d like to change or understand.');
  assert.equal(checks, 0, 'the free local check, no call');
  for (const [prompt, outcome] of [['please send this to my team', 'unsupported'], ['something prohibited', 'blocked'], ['make a chart', 'clarify']]) {
    assert.equal(await session.submit({ mode: 'explain', prompt, prepare: snapshot() }), outcome);
  }
  assert.equal(session.state.clarify.question, 'What values or content should it use?');
  assert.deepEqual([checks, generations], [3, 0]);
});

test('typed equation uses signed inline generation rather than the artifact transport',async()=>{
 let generated=0,artifacts=0;
 const {session}=make({route:async()=>({choice:'equation',confidence:1}),generate:async input=>{generated++;assert.equal(input.route,'equation');return{result:{kind:'equation',latex:'x^2'}};},artifact:async()=>{artifacts++;throw new Error('wrong transport');}},{enabled:['note','equation'],validate:result=>({ok:true,preview:{latex:result.latex}})});
 assert.equal(await session.submit({mode:'explain',prompt:'Write the quadratic formula',prepare:snapshot()}),'preview');assert.equal(session.state.preview.kind,'equation');assert.equal(generated,1);assert.equal(artifacts,0);
});
