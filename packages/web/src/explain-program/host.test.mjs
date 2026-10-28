// Task 3 host behavior. Guest programs run in the real packaged QuickJS engine (runtime.js) behind a Worker-shaped stand-in;
// browser Worker termination itself is proven by e2e/explain-program-check.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProgramHost, liveRuntimeCount, programStamps } from './host.js';
import { loadEngine, runProgram } from './runtime.js';
import { LIMITS } from './limits.js';
import { parseEvaluateResponse, sealProgram } from './contract.js';
import { growthFixture } from './fixtures.js';

const engine = loadEngine();
// The stand-in's guest interrupt is test-only and below the 250 ms host watchdog: these tests are about host behaviour, and a
// loaded machine must not turn a valid run into runtime_limit. A looping guest still ends in runtime_limit (interrupt or watchdog).
const GUEST_LIMITS = { ...LIMITS, interruptMs: 150 };
const workers = new Set(); // every stand-in not yet terminated: an orphan shows up here
let started = 0;
// mode: 'real' runs the program; 'hang' never answers; 'mute' never boots; 'rogue' answers late even after terminate.
class StandIn {
  constructor(mode = 'real') {
    Object.assign(this, { mode, terminated: false, onmessage: null, onerror: null });
    workers.add(this);
    started++;
    if (mode !== 'mute') engine.then(() => this.emit({ ready: true, bootMs: 1 }));
  }
  emit(data) { setTimeout(() => (this.mode === 'rogue' || !this.terminated) && this.onmessage?.({ data }), 0); }
  postMessage({ id, source, request }) {
    if (this.mode === 'hang') return;
    engine.then(e => {
      const out = runProgram(e, { source, request }, GUEST_LIMITS);
      this.mode === 'rogue' ? setTimeout(() => this.emit({ id, ...out }), 400) : this.emit({ id, ...out });
    });
  }
  terminate() { this.terminated = true; workers.delete(this); }
}
const factory = mode => () => new StandIn(mode);

const seal = async (source = growthFixture.source) => {
  const sealed = await sealProgram({ manifest: growthFixture.manifest, source }, await programStamps());
  assert.equal(sealed.ok, true, sealed.issue);
  return sealed.value;
};
const request = (n, inputs = { rate: 5, years: 10, mode: 'compound' }) => ({ requestId: `r${n}`, inputs, time: n % 4, seed: 1, state: null });
const isAbort = error => error?.name === 'AbortError';
const LOOP = `export function evaluate() { for (;;) {} }`;
const settled = promise => promise.then(value => ({ value }), error => ({ error }));

test('a sealed artifact evaluates to a contract-valid response', async () => {
  const host = createProgramHost({ artifact: await seal(), createWorker: factory() });
  const out = await host.evaluate(request(2)); // time 2 of 4: five of ten years shown
  assert.equal(parseEvaluateResponse(out).ok, true, parseEvaluateResponse(out).issue);
  assert.equal(out.requestId, 'r2');
  assert.ok(Math.abs(out.quantities.balance - 1000 * 1.05 ** 5) < 1e-6, String(out.quantities.balance));
  host.dispose();
  assert.equal(workers.size, 0);
});

test('a tampered or differently pinned artifact never starts a Worker', async () => {
  const artifact = await seal();
  const before = started;
  const tampered = createProgramHost({ artifact: { ...artifact, source: artifact.source.replace('1000', '2000') }, createWorker: factory() });
  await assert.rejects(tampered.evaluate(request(1)), { code: 'invalid_program' });
  const otherEngine = createProgramHost({ artifact: { ...artifact, runtimeVersion: 'quickjs-release-sync@0.33.0' }, createWorker: factory() });
  await assert.rejects(otherEngine.evaluate(request(1)), { code: 'version_unavailable' });
  const otherWasm = createProgramHost({ artifact: { ...artifact, fingerprints: { ...artifact.fingerprints, engine: 'f'.repeat(64) } }, createWorker: factory() });
  await assert.rejects(otherWasm.evaluate(request(1)), { code: 'version_unavailable' });
  const otherSdk = createProgramHost({ artifact: { ...artifact, fingerprints: { ...artifact.fingerprints, sdk: 'e'.repeat(64) } }, createWorker: factory() });
  await assert.rejects(otherSdk.evaluate(request(1)), { code: 'version_unavailable' });
  assert.equal(started, before);
  for (const host of [tampered, otherEngine, otherWasm, otherSdk]) host.dispose();
});

test('rapid input changes: one in flight, only the newest waits, the newest inputs win', async () => {
  const host = createProgramHost({ artifact: await seal(), createWorker: factory() });
  const results = await Promise.all(Array.from({ length: 100 }, (_, n) => settled(host.evaluate(request(n, { rate: n % 20, years: 10, mode: 'simple' })))));
  const answered = results.filter(r => r.value);
  assert.ok(results.slice(1, 99).every(r => isAbort(r.error)), 'every request between the first and the last is superseded');
  assert.deepEqual(answered.map(r => r.value.requestId), ['r0', 'r99']);
  assert.ok(Math.abs(answered[1].value.quantities.balance - 1000 * (1 + 0.19 * 10 * 0.75)) < 1e-6, 'the last inputs were evaluated');
  host.dispose();
});

test('stale_frame_cannot_replace_new_inputs: an answer after the watchdog, from a terminated Worker, is ignored', async () => {
  const host = createProgramHost({ artifact: await seal(), createWorker: factory('rogue') });
  await assert.rejects(host.evaluate(request(1)), { code: 'runtime_limit' }); // the rogue answers at 400 ms, after the 250 ms watchdog
  const delivered = [];
  const next = host.evaluate(request(2)).then(value => delivered.push(value.requestId), () => {});
  await new Promise(resolve => setTimeout(resolve, 900));
  await next;
  assert.ok(!delivered.includes('r1'));
  host.dispose();
});

test('guest_loop_is_terminated_and_next_card_runs', async () => {
  const looping = createProgramHost({ artifact: await seal(LOOP), createWorker: factory() });
  const healthy = createProgramHost({ artifact: await seal(), createWorker: factory() });
  const [loop, ok] = await Promise.all([settled(looping.evaluate(request(1))), settled(healthy.evaluate(request(2)))]);
  assert.equal(loop.error.code, 'runtime_limit');
  assert.equal(ok.value.requestId, 'r2');
  assert.equal((await healthy.evaluate(request(3))).requestId, 'r3');
  looping.dispose(); healthy.dispose();
});

test('a Worker that never answers is terminated by the host watchdog and replaced on the next request', async () => {
  let mode = 'hang';
  const host = createProgramHost({ artifact: await seal(), createWorker: () => new StandIn(mode) });
  const t0 = performance.now();
  await assert.rejects(host.evaluate(request(1)), { code: 'runtime_limit' });
  assert.ok(performance.now() - t0 < 5000, 'the watchdog fired (a hang would never settle)');
  assert.equal(workers.size, 0, 'the hung Worker was terminated');
  mode = 'real';
  assert.equal((await host.evaluate(request(2))).requestId, 'r2');
  host.dispose();
});

test('an engine that never boots hits the boot deadline', async () => {
  const host = createProgramHost({ artifact: await seal(), createWorker: factory('mute'), limits: { ...LIMITS, bootMs: 100 } });
  await assert.rejects(host.evaluate(request(1)), { code: 'runtime_limit' });
  assert.equal(workers.size, 0);
  host.dispose();
});

test('disposal is idempotent, rejects in-flight and waiting requests once, terminates the Worker, refuses later requests', async () => {
  const host = createProgramHost({ artifact: await seal(LOOP), createWorker: factory('hang') });
  const first = settled(host.evaluate(request(1)));
  const second = settled(host.evaluate(request(2)));
  await new Promise(resolve => setTimeout(resolve, 20));
  host.dispose('card deleted');
  host.dispose('again');
  const [a, b] = await Promise.all([first, second]);
  assert.ok(isAbort(a.error) && a.error.message === 'card deleted');
  assert.ok(isAbort(b.error));
  assert.equal(workers.size, 0);
  assert.ok(isAbort((await settled(host.evaluate(request(3)))).error));
});

test('at most two live runtimes across cards: an idle card is evicted, and restarts on its next request', async () => {
  const artifact = await seal();
  const cards = [0, 1, 2].map(() => createProgramHost({ artifact, createWorker: factory() }));
  let peak = 0;
  const watch = setInterval(() => { peak = Math.max(peak, workers.size, liveRuntimeCount()); }, 1);
  for (let round = 0; round < 3; round++) for (const [i, card] of cards.entries()) assert.equal((await card.evaluate(request(i))).requestId, `r${i}`);
  await Promise.all(cards.map((card, i) => card.evaluate(request(10 + i))));
  clearInterval(watch);
  assert.ok(peak <= LIMITS.activeRuntimes, `peak ${peak}`);
  assert.equal(liveRuntimeCount(), LIMITS.activeRuntimes);
  cards.forEach(card => card.dispose());
  assert.equal(liveRuntimeCount(), 0);
  assert.equal(workers.size, 0);
});

test('an unused Worker is terminated after idleMs', async () => {
  const host = createProgramHost({ artifact: await seal(), createWorker: factory(), limits: { ...LIMITS, idleMs: 50 } });
  await host.evaluate(request(1));
  assert.equal(workers.size, 1);
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(workers.size, 0);
  assert.equal((await host.evaluate(request(2))).requestId, 'r2');
  host.dispose();
});

test('repeated mount and unmount leaves no Worker behind', async () => {
  const artifact = await seal();
  for (let i = 0; i < 20; i++) {
    const host = createProgramHost({ artifact, createWorker: factory() });
    const pending = settled(host.evaluate(request(i)));
    if (i % 2) await pending;
    host.dispose('unmount');
  }
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(workers.size, 0);
  assert.equal(liveRuntimeCount(), 0);
});

test('every evaluation starts from a fresh guest: shuffled orders give identical answers', async () => {
  const counter = `let calls = 0; export function evaluate({ inputs }) { calls++; globalThis.seen = (globalThis.seen || 0) + 1;
    return { frame: { objects: [] }, quantities: { calls, seen: globalThis.seen, k: inputs.rate } }; }`;
  const host = createProgramHost({ artifact: await seal(counter), createWorker: factory() });
  const order = [3, 1, 4, 1, 5, 9, 2, 6];
  const answers = [];
  for (const k of order) answers.push((await host.evaluate(request(k, { rate: k, years: 10, mode: 'simple' }))).quantities);
  assert.deepEqual(answers, order.map(k => ({ calls: 1, seen: 1, k })));
  host.dispose();
});

test('the Blob-started Worker name is the same literal in page-worker.js and worker.js, and the Worker bundle needs no import()', () => {
  const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
  const named = read('./page-worker.js').match(/const NAME = '([^']+)'/)[1];
  assert.ok(read('./worker.js').includes(`self.name === '${named}'`));
  assert.doesNotMatch(read('./runtime.js'), /\bimport\s*\(|newQuickJSWASMModuleFromVariant\(/);
});
