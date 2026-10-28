// Task 1 boundary proof: every adversarial program below runs inside the packaged QuickJS/WASM engine (runtime.js), never as
// native JavaScript, and each is followed by a valid program that must still succeed on the same engine.
// RECEIPT=<file.md> also writes the pass/fail table, timings and memory measured here.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadEngine, runProgram } from './runtime.js';
import { ENGINE_FINGERPRINT, ENGINE_VERSION, LIMITS } from './limits.js';

const VALID = `export function evaluate({ inputs, time }) {
  const n = 200, points = [];
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 10; points.push([x, Math.sin(x * (inputs.k ?? 1) + time)]); }
  const objects = [{ kind: 'polyline', id: 'curve', points }];
  for (let i = 0; i < 20; i++) objects.push({ kind: 'circle', id: 'c' + i, x: i, y: Math.cos(i + time), r: 0.2 });
  return { frame: { objects, readouts: [{ id: 'k', value: inputs.k ?? 1 }] }, quantities: { k: inputs.k ?? 1 } };
}`;
const REQUEST = { inputs: { k: 2 }, time: 0.5, seed: 7, state: null };
// Valid programs are checked for correctness under the host watchdog's budget, not the 50 ms interrupt: on this shared machine
// (other lanes' builds) a valid 2-4 ms program intermittently took over 50 ms of wall time. The abuse cases keep the real
// 50 ms budget, and the disposal test counts how many valid runs went over it (reported in the receipt).
const RELAXED = { ...LIMITS, interruptMs: LIMITS.watchdogMs };

let engine, observer, hits = 0, peakWasm = 0;
const rows = [], timings = {};
const run = (source, request = REQUEST, limits = RELAXED) => {
  const out = runProgram(engine, { source, request }, limits);
  peakWasm = Math.max(peakWasm, out.metrics.wasmBytes);
  return out;
};

before(async () => {
  observer = createServer((req, res) => { hits++; res.end('{}'); });
  await new Promise(resolve => observer.listen(0, '127.0.0.1', resolve));
  const t0 = performance.now();
  engine = await loadEngine();
  timings.firstBootMs = performance.now() - t0;
});
after(() => {
  observer.close();
  if (process.env.RECEIPT) writeFileSync(process.env.RECEIPT, receipt());
});

const OBSERVED = () => `http://127.0.0.1:${observer.address().port}/leak`;

// One abuse case: its expected refusal, then the valid program on the same engine.
function abuse(name, source, expected, check) {
  test(name, () => {
    const before = hits;
    const out = run(typeof source === 'function' ? source() : source, REQUEST, expected ? LIMITS : RELAXED);
    const next = run(VALID, REQUEST, RELAXED);
    rows.push({ name, expected: expected ? `${expected.code}/${expected.phase}` : 'ok', got: out.ok ? 'ok' : `${out.code}/${out.phase}`, ms: out.metrics.ms, detail: out.ok ? '' : out.detail, followUp: next.ok, network: hits - before });
    if (expected) assert.deepEqual({ code: out.code, phase: out.phase }, expected, out.detail);
    else assert.equal(out.ok, true, out.detail);
    check?.(out);
    assert.equal(hits, before, 'the external observer saw a request');
    assert.equal(next.ok, true, `the follow-up valid program failed: ${next.detail}`);
    assert.equal(next.value.frame.objects[0].points.length, 200);
  });
}

test('ENGINE_FINGERPRINT is the SHA-256 of the installed engine WASM', () => {
  const wasm = createRequire(import.meta.url).resolve('@jitl/quickjs-wasmfile-release-sync/wasm');
  assert.equal(createHash('sha256').update(readFileSync(wasm)).digest('hex'), ENGINE_FINGERPRINT);
});

test('a valid program evaluates to bounded JSON', () => {
  const out = run(VALID, REQUEST, RELAXED);
  assert.equal(out.ok, true, out.detail);
  assert.equal(out.value.frame.objects.length, 21);
  assert.equal(out.value.quantities.k, 2);
  assert.ok(Math.abs(out.value.frame.objects[0].points[1][1] - Math.sin(10 / 199 * 2 + 0.5)) < 1e-12);
});

// Network, module loading, DOM, storage, process and credentials: absent in the guest, and nothing reaches the observer.
const HOST_NAMES = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'require', 'process', 'Deno', 'Bun',
  'document', 'window', 'self', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore',
  'postMessage', 'Worker', 'setTimeout', 'setInterval', 'queueMicrotask', 'console', 'crypto', 'performance', 'Date', 'std', 'os', 'scriptArgs', 'print'];
abuse('host globals are absent (typeof each is undefined)', `export function evaluate() {
  const present = ${JSON.stringify(HOST_NAMES)}.filter(name => typeof globalThis[name] !== 'undefined');
  return { present, globals: Object.getOwnPropertyNames(globalThis) };
}`, null, out => {
  assert.deepEqual(out.value.present, []);
  rows.at(-1).detail = `guest globalThis: ${out.value.globals.join(' ')}`;
});
abuse('fetch to an external observer throws in the guest', () => `export function evaluate() { fetch('${OBSERVED()}'); }`, { code: 'runtime_error', phase: 'evaluate' });
abuse('XMLHttpRequest / WebSocket construction throws', () => `export function evaluate() { new XMLHttpRequest().open('GET', '${OBSERVED()}'); new WebSocket('ws://127.0.0.1:1'); }`, { code: 'runtime_error', phase: 'evaluate' });
abuse('static import of a URL is refused at load', () => `import x from '${OBSERVED()}'; export function evaluate() { return x; }`, { code: 'invalid_program', phase: 'load' });
abuse('static import of a bare package is refused at load', `import fs from 'node:fs'; export function evaluate() { return { r: fs.readFileSync('/etc/passwd', 'utf8') }; }`, { code: 'invalid_program', phase: 'load' });
abuse('dynamic import() never loads and its promise never settles a result', () => `export function evaluate() { const p = import('${OBSERVED()}'); return { frame: { objects: [] }, kind: typeof p }; }`, null);
abuse('document.cookie / localStorage reads throw', `export function evaluate() { return { c: document.cookie, s: localStorage.getItem('session') }; }`, { code: 'runtime_error', phase: 'evaluate' });
abuse('Function-constructor escape reaches only the guest global', `export function evaluate() {
  const g = (function () {}).constructor('return this')();
  const g2 = Object.getPrototypeOf(async function () {}).constructor('return globalThis');
  return { same: g === globalThis, hasProcess: typeof g.process, hasFetch: typeof g.fetch, evalProcess: typeof eval('typeof process') };
}`, null, out => assert.deepEqual(out.value, { same: true, hasProcess: 'undefined', hasFetch: 'undefined', evalProcess: 'string' }));
abuse('constructor-chain escape to process throws', `export function evaluate() { return { p: (() => {}).constructor.constructor('return process')().env }; }`, { code: 'runtime_error', phase: 'evaluate' });

test('cross-card globals: nothing set by one program is visible to the next, or to the host', () => {
  const first = run(`globalThis.leak = 'card-a'; Object.prototype.polluted = 1; Array.prototype.map = () => 'hijacked'; JSON.stringify = () => '"hijacked"';
    export function evaluate() { return { set: true }; }`);
  const second = run(`export function evaluate() { return { leak: typeof leak, polluted: ({}).polluted ?? null, map: [1].map(x => x + 1) }; }`);
  rows.push({ name: 'cross-card globals and prototype pollution', expected: 'isolated', got: JSON.stringify(second.value), ms: second.metrics.ms, detail: `first program: ${JSON.stringify(first.value)}`, followUp: second.ok, network: 0 });
  assert.deepEqual(first.value, { set: true }, 'a guest that replaces JSON.stringify still serializes through the intrinsic');
  assert.deepEqual(second.value, { leak: 'undefined', polluted: null, map: [2] });
  assert.equal(({}).polluted, undefined);
});

// Time, stack, heap: the guest is stopped inside the interpreter, and the next program runs.
abuse('infinite loop in evaluate', `export function evaluate() { for (;;) {} }`, { code: 'runtime_limit', phase: 'evaluate' }, out => assert.ok(out.metrics.ms < LIMITS.interruptMs + 30, `stopped after ${out.metrics.ms} ms`));
abuse('infinite loop at load (top level)', `while (true) {} export function evaluate() {}`, { code: 'runtime_limit', phase: 'load' });
abuse('unbounded recursion', `function f(n) { return f(n + 1) + 1; } export function evaluate() { return f(0); }`, { code: 'runtime_limit', phase: 'evaluate' });
abuse('heap growth', `export function evaluate() { const keep = []; for (;;) keep.push(new Array(100000).fill(Math.random())); }`, { code: 'runtime_limit', phase: 'evaluate' }, out => assert.ok(out.metrics.wasmBytes <= LIMITS.wasmBytes));
abuse('typed-array growth (escaped the QuickJS heap limit before the WASM cap)', `export function evaluate() { const keep = []; for (;;) keep.push(new Float64Array(1e6)); }`, { code: 'runtime_limit', phase: 'evaluate' }, out => assert.ok(out.metrics.wasmBytes <= LIMITS.wasmBytes));
abuse('string doubling', `export function evaluate() { let s = 'x'; for (;;) s += s; }`, { code: 'runtime_limit', phase: 'evaluate' });
abuse('catastrophic regular expression', `export function evaluate() { return { r: /^(a+)+$/.test('a'.repeat(40) + 'b') }; }`, { code: 'runtime_limit', phase: 'evaluate' });
abuse('a guest that catches the interrupt cannot keep running', `export function evaluate() { for (;;) { try { for (;;) {} } catch (e) {} } }`, { code: 'runtime_limit', phase: 'evaluate' });

// Output: serialized in the guest under the deadline, measured before it is copied out, then depth-checked.
// Cases are built cheaply (long strings, few entries) so the size bound, not the deadline, is what stops them on a busy machine.
// The whole result (frame, quantities, anything else) is measured: the guest-side bound stops an oversized walk, the host
// checks the exact UTF-8 bytes. Over the limit is invalid_output (the stable contract code).
const N = LIMITS.outputBytes, AT = 'x'.repeat(N - 8); // {"s":"<AT>"} is exactly N bytes
abuse('huge output (1 MB string)', `export function evaluate() { return { s: 'x'.repeat(1 << 20) }; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('huge output across many objects', `export function evaluate() { return { frame: { objects: Array.from({ length: 600 }, (_, i) => ({ kind: 'text', id: 'c' + i, x: i, y: i, text: 'w'.repeat(500) })) }, quantities: {} }; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('huge quantities beside a small frame', `export function evaluate() { const q = {}, long = 'q'.repeat(60); for (let i = 0; i < 4000; i++) q[long + i] = i; return { frame: { objects: [] }, quantities: q }; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('getter inflates output during serialization', `export function evaluate() { return { frame: { get objects() { return 'y'.repeat(300000); } } }; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('toJSON inflates output during serialization', `export function evaluate() { return { frame: { toJSON() { return new Array(300).fill('z'.repeat(1000)); } } }; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('output exactly at the byte limit passes', `export function evaluate() { return { s: 'x'.repeat(${N - 8}) }; }`, null, out => { assert.equal(out.metrics.outputBytes, N); assert.equal(out.value.s, AT); });
abuse('output one byte over the limit is refused', `export function evaluate() { return { s: 'x'.repeat(${N - 7}) }; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('multi-byte output at the byte limit passes (bytes, not characters)', `export function evaluate() { return { s: 'é'.repeat(${(N - 8) / 2}) }; }`, null);
abuse('multi-byte output over the byte limit is refused though its character count is half the limit', `export function evaluate() { return { s: 'é'.repeat(${(N - 8) / 2 + 1}) }; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('cyclic output', `export function evaluate() { const o = {}; o.self = o; return o; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('deeply nested output', `export function evaluate() { let o = {}; for (let i = 0; i < 1000; i++) o = { o }; return o; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('getter loop during serialization', `export function evaluate() { return { get x() { for (;;) {} } }; }`, { code: 'runtime_limit', phase: 'serialize' });
abuse('toJSON loop during serialization', `export function evaluate() { return { toJSON() { for (;;) {} } }; }`, { code: 'runtime_limit', phase: 'serialize' });
abuse('proxy trap loop during serialization', `export function evaluate() { return new Proxy({}, { ownKeys() { for (;;) {} } }); }`, { code: 'runtime_limit', phase: 'serialize' });
abuse('non-JSON result (undefined)', `export function evaluate() {}`, { code: 'invalid_output', phase: 'serialize' });
abuse('function-valued result', `export function evaluate() { return () => 1; }`, { code: 'invalid_output', phase: 'serialize' });
abuse('thrown getter on the error itself', `export function evaluate() { throw { get name() { for (;;) {} } }; }`, { code: 'runtime_limit', phase: 'evaluate' });

// Microtasks: queued jobs are never run, so a looping callback cannot execute, and the operation ends within budget.
abuse('microtask loop is never run', `export function evaluate() {
  Promise.resolve().then(() => { for (;;) {} });
  (async () => { await null; for (;;) {} })();
  return { frame: { objects: [] }, quantities: {} };
}`, null); // had a queued loop run, the operation would end in runtime_limit, not ok
abuse('async evaluate yields a promise, which serializes to an empty object (the frame schema then refuses it)', `export async function evaluate() { return { frame: {} }; }`, null, out => assert.deepEqual(out.value, {}));

abuse('syntax error', `export function evaluate( {`, { code: 'invalid_program', phase: 'load' });
abuse('no evaluate export', `export const x = 1;`, { code: 'invalid_program', phase: 'load' });
abuse('source over the size limit', `export function evaluate() { return {}; } //${'x'.repeat(LIMITS.sourceBytes)}`, { code: 'invalid_program', phase: 'load' });
test('state over the size limit is refused before the guest starts', () => {
  const out = run(VALID, { ...REQUEST, state: { blob: 'x'.repeat(LIMITS.stateBytes) } });
  assert.deepEqual({ code: out.code, phase: out.phase }, { code: 'runtime_limit', phase: 'load' });
});

test('the SDK is defined before the program, per operation, and a program cannot change it for the next one', () => {
  const uses = run(`export function evaluate({ inputs }) { return { frame: sdk.frame([sdk.polyline('p', sdk.sample(x => x * inputs.k, 0, 1, 4)), sdk.circle('c', 1, 2, 3)]), quantities: {} }; }`);
  assert.equal(uses.ok, true, uses.detail);
  assert.deepEqual(uses.value.frame.objects[0], { kind: 'polyline', id: 'p', points: [[0, 0], [0.25, 0.5], [0.5, 1], [0.75, 1.5], [1, 2]] });
  run(`sdk.sample = () => 'tampered'; export function evaluate() { return { x: sdk.sample() }; }`);
  assert.deepEqual(run(`export function evaluate() { return { x: sdk.sample(x => x, 0, 1, 1) }; }`).value, { x: [[0, 0], [1, 1]] });
});

test('time and randomness come only from the request: no Date, seeded Math.random', () => {
  const source = `export function evaluate() { return { date: typeof Date, r: [Math.random(), Math.random()] }; }`;
  const a = run(source), b = run(source), c = run(source, { ...REQUEST, seed: 8 });
  assert.equal(a.value.date, 'undefined');
  assert.deepEqual(a.value.r, b.value.r);
  assert.notDeepEqual(a.value.r, c.value.r);
});

test('repeated engine initialization gives independent engines that each run', async () => {
  const engines = await Promise.all([loadEngine(), loadEngine(), loadEngine()]);
  for (const other of engines) assert.equal(runProgram(other, { source: VALID, request: REQUEST }, RELAXED).ok, true);
  assert.equal(runProgram(engines[0], { source: `globalThis.x = 1; export function evaluate() { return { x: 1 }; }`, request: REQUEST }).ok, true);
  assert.deepEqual(runProgram(engines[1], { source: `export function evaluate() { return { x: typeof x }; }`, request: REQUEST }).value, { x: 'undefined' });
});

// Disposal: every operation frees its runtime; memory does not grow across many operations, abuse included.
test('disposal: 300 operations, abuse interleaved, leave WASM memory flat; warm timings', async () => {
  const t0 = performance.now();
  const cold = await loadEngine();
  timings.coldBootMs = performance.now() - t0;
  const first = runProgram(cold, { source: VALID, request: REQUEST }, RELAXED);
  timings.firstRunMs = first.metrics.ms;
  timings.wasmAfterFirst = cold.getWasmMemory().buffer.byteLength;
  const warm = [];
  for (let i = 0; i < 300; i++) {
    if (i % 50 === 25) runProgram(cold, { source: `export function evaluate() { const k = []; for (;;) k.push(new Array(1e5).fill(1)); }`, request: REQUEST });
    const out = runProgram(cold, { source: VALID, request: { ...REQUEST, time: i / 30 } }, RELAXED);
    assert.equal(out.ok, true, out.detail);
    warm.push(out.metrics.ms);
  }
  warm.sort((x, y) => x - y);
  Object.assign(timings, { overInterrupt: warm.filter(ms => ms > LIMITS.interruptMs).length, warmP50Ms: warm[150], warmP95Ms: warm[285], warmMaxMs: warm.at(-1), wasmAfter300: cold.getWasmMemory().buffer.byteLength, outputBytes: first.metrics.outputBytes });
  assert.ok(timings.wasmAfter300 <= LIMITS.wasmBytes && peakWasm <= LIMITS.wasmBytes, `WASM memory ${timings.wasmAfter300}, peak ${peakWasm}`);
});

const mb = bytes => `${(bytes / 1048576).toFixed(1)} MiB`;
function receipt() {
  const passed = rows.filter(row => row.expected === row.got || (row.expected === 'ok' && row.got === 'ok') || row.expected === 'isolated').length;
  return `# Task 1 runtime receipt (generated by runtime.test.mjs)

Engine: ${ENGINE_VERSION}. Node ${process.version}, ${process.platform}/${process.arch}. Generated ${new Date().toISOString()}.
Limits (limits.js): interrupt ${LIMITS.interruptMs} ms per operation, heap ${mb(LIMITS.heapBytes)} (QuickJS) and WASM memory cap ${mb(LIMITS.wasmBytes)}, stack ${LIMITS.stackBytes / 1024} KiB, output ${LIMITS.outputBytes / 1024} KiB / depth ${LIMITS.outputDepth}.
Every guest program ran inside the QuickJS/WASM interpreter; the Node harness only observes. "Follow-up" is the valid 200-point program run next on the same engine.
External observer: a local HTTP server whose URL the guest programs target; requests seen in total: ${hits}.

| Case | Expected | Result | ms | Follow-up valid run | Observer hits | Detail |
|---|---|---|---|---|---|---|
${rows.map(row => `| ${row.name} | ${row.expected} | ${row.got} | ${row.ms.toFixed(1)} | ${row.followUp ? 'ok' : 'FAILED'} | ${row.network} | ${String(row.detail).replace(/\|/g, '/').slice(0, 400)} |`).join('\n')}

Rows matching expectation: ${passed}/${rows.length} (node:test assertions are authoritative).

## Timings and memory (this machine, Node, not a browser)

- Cold engine boot, first in this process (WASM compile + instantiate): ${timings.firstBootMs?.toFixed(1)} ms; a later boot in the same process: ${timings.coldBootMs?.toFixed(1)} ms; first operation ${timings.firstRunMs?.toFixed(2)} ms.
- Warm operation (fresh runtime + context, source load, evaluate, in-guest serialize, host parse) for the 200-point + 20-object program, 300 runs: p50 ${timings.warmP50Ms?.toFixed(2)} ms, p95 ${timings.warmP95Ms?.toFixed(2)} ms, max ${timings.warmMaxMs?.toFixed(2)} ms; ${timings.overInterrupt} of 300 took longer than the ${LIMITS.interruptMs} ms interrupt budget. Output ${timings.outputBytes} bytes.
- WASM linear memory: ${mb(timings.wasmAfterFirst || 0)} after the first run, ${mb(timings.wasmAfter300 || 0)} after 300 runs with 6 heap-exhaustion programs interleaved; peak seen across all cases ${mb(peakWasm)}.
`;
}
