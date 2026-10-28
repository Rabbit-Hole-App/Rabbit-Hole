import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestResult, parseManifest, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { createProgramHost, programStamps } from './host.js';
import { growthFixture, searchFixture } from './fixtures.js';

// The two hand-authored fixtures (test data, not generation evidence) run through the REAL pinned QuickJS engine (runtime.js) and
// the REAL host (host.js), then through the same frame normaliser the card uses. Only the Worker is replaced by an in-process
// stand-in speaking the worker's message protocol; the browser Worker itself is proved by e2e/explain-program-check.mjs.
// Skipped where the engine package is not installed (a bare checkout without npm ci).
let runtime = null;
try { runtime = await import('./runtime.js'); } catch { runtime = null; }
const run = runtime ? test : test.skip;

let engine;
before(async () => { if (runtime) engine = await runtime.loadEngine(); });
after(() => engine?.dispose?.());

const inProcessWorker = () => {
  const worker = {
    terminate() { worker.dead = true; },
    postMessage: ({ id, source, request }) => queueMicrotask(() => { if (!worker.dead) worker.onmessage?.({ data: { id, ...runtime.runProgram(engine, { source, request }) } }); }),
  };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
const evaluateOnHost = async (fixture, request) => {
  const sealed = await sealProgram({ manifest: fixture.manifest, source: fixture.source }, await programStamps());
  assert.equal(sealed.ok, true, sealed.issue);
  const host = createProgramHost({ artifact: sealed.value, createWorker: inProcessWorker });
  try {
    const manifest = sealed.value.manifest;
    return { manifest, reply: await host.evaluate({ requestId: 'r1', inputs: resolveInputs(manifest, request.inputs), time: request.time, seed: 1, state: null }) };
  } finally { host.dispose('test over'); }
};

run('both fixtures run in the pinned interpreter and pass the contract at every sampled request', () => {
  for (const fixture of [growthFixture, searchFixture]) {
    const manifest = parseManifest(fixture.manifest).value;
    for (const request of fixture.requests) {
      const out = runtime.runProgram(engine, { source: fixture.source, request: { inputs: resolveInputs(manifest, request.inputs), time: request.time, seed: 1, state: null } });
      assert.equal(out.ok, true, `${fixture.id}: ${out.code} ${out.detail}`);
      const result = parseGuestResult(out.value);
      assert.equal(result.ok, true, `${fixture.id}: ${result.issue}`);
      const frame = normalizeFrame(result.value.frame, manifest);
      assert.equal(frame.ok, true, `${fixture.id}: ${frame.issue}`);
    }
  }
});

run('through the host: two structurally different programs, one contract, one frame path', async () => {
  const growth = await evaluateOnHost(growthFixture, { inputs: { rate: 5, years: 10, mode: 'compound' }, time: 4 });
  const search = await evaluateOnHost(searchFixture, { inputs: { target: 2 }, time: 4 });
  const growthFrame = normalizeFrame(growth.reply.frame, growth.manifest), searchFrame = normalizeFrame(search.reply.frame, search.manifest);
  assert.equal(growthFrame.ok && searchFrame.ok, true);
  const kinds = frame => new Set(frame.state.objects.map(object => object.type));
  assert.ok(kinds(growthFrame).has('polyline') && kinds(growthFrame).has('circle'), 'a plotted curve with a marker');
  assert.ok(!kinds(searchFrame).has('polyline') && kinds(searchFrame).has('box') && kinds(searchFrame).has('arrow'), 'cells and a pointer, no curve');
  assert.equal(growthFrame.state.objects.find(object => object.id === 'balance-curve').points.length, 61);
  assert.equal(searchFrame.state.objects.filter(object => object.type === 'box').length, 15);
  assert.ok(Math.abs(growth.reply.quantities.balance - 1000 * 1.05 ** 10) < 1e-6, 'the program computed it');
  assert.deepEqual(search.reply.quantities, { checked: 2, low: 1, high: 3 });
  assert.equal(growthFrame.readouts[0].text, '1629');
  assert.equal(searchFrame.state.objects.find(object => object.id === 'cell-2').role, 'success');
});

run('the same program at another time or input draws a different picture without any model or server', async () => {
  const early = await evaluateOnHost(growthFixture, { inputs: {}, time: 1 }), late = await evaluateOnHost(growthFixture, { inputs: {}, time: 4 });
  const curve = out => normalizeFrame(out.reply.frame, out.manifest).state.objects.find(object => object.id === 'balance-curve').points;
  assert.notDeepEqual(curve(early), curve(late));
  const simple = await evaluateOnHost(growthFixture, { inputs: { mode: 'simple' }, time: 4 });
  assert.ok(simple.reply.quantities.balance < late.reply.quantities.balance, 'simple interest ends lower than compound');
});

run('a hostile program is stopped by the host and the next card still runs', async () => {
  const loop = { manifest: growthFixture.manifest, source: 'export function evaluate({ inputs, time, seed, state }) { for (;;) {} }' };
  const sealed = await sealProgram(loop, await programStamps());
  const host = createProgramHost({ artifact: sealed.value, createWorker: inProcessWorker });
  await assert.rejects(host.evaluate({ requestId: 'x', inputs: resolveInputs(sealed.value.manifest, {}), time: 0, seed: 1, state: null }), error => error.code === 'runtime_limit');
  host.dispose('test over');
  const after = await evaluateOnHost(searchFixture, { inputs: {}, time: 0 });
  assert.equal(after.reply.requestId, 'r1');
});

run('a program that only defines a global evaluate is refused by the interpreter, not run', () => {
  const request = { inputs: {}, time: 0, seed: 1, state: null };
  for (const source of ['function evaluate({ inputs, time, seed, state }) { return { frame: { objects: [] }, quantities: {} }; }', 'globalThis.evaluate = () => ({ frame: { objects: [] }, quantities: {} });']) {
    const out = runtime.runProgram(engine, { source, request });
    assert.equal(out.ok, false, source);
    assert.equal(out.code, 'invalid_program');
  }
  assert.equal(runtime.runProgram(engine, { source: 'export function evaluate({ inputs, time, seed, state }) { return { frame: { objects: [] }, quantities: {} }; }', request }).ok, true);
});
