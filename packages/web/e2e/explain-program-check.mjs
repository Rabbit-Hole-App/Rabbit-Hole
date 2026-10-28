// Generated /explain programs, Task 1 browser proof (plan docs/superpowers/plans/2026-10-28-explain-sandbox.md): the BUILT
// runtime Worker (src/explain-program/worker.js) and its QuickJS WASM asset load from this origin under the headers the
// worker wrapper really sends (framing-headers.js), with no CSP violation; guest programs run only inside the interpreter;
// time, heap and output limits stop the guest and the next program still runs; Worker.terminate stops a busy Worker and no
// late message arrives. An external observer (a local HTTP server the guest programs target) must see no request.
// Local stack only, no model call, no secrets. Reads the built assets from dist-dev (served) and dist (production build).
// Usage: BASE=http://127.0.0.1:8878 node e2e/explain-program-check.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('explain-program-check runs against the local stack only');
const TOTAL = 23; // bump with the checks below; the printed line is what CI reads
let passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; console.log(`${ok ? 'ok' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`); };

// The runtime's built files: the Worker chunk (it alone carries the engine-failure reply) and the QuickJS WASM.
const assets = dir => {
  const root = new URL(`../${dir}/static/`, import.meta.url);
  if (!existsSync(root)) return {};
  const names = readdirSync(root);
  return { worker: names.find(n => n.endsWith('.js') && readFileSync(new URL(n, root), 'utf8').includes('engine failure') && readFileSync(new URL(n, root), 'utf8').includes('bootMs')),
    wasm: names.find(n => /^emscripten-module-[\w-]+\.wasm$/.test(n)) };
}
const served = assets('dist-dev'), production = assets('dist');
check('the production build (dist) ships the runtime Worker and its WASM as local assets', !!production.worker && !!production.wasm, JSON.stringify(production));
check('the served build (dist-dev) ships them too', !!served.worker && !!served.wasm, JSON.stringify(served));
if (!served.worker || !served.wasm) { console.log(`${passed}/${TOTAL} checks passed`); process.exit(1); }

const wasm = await fetch(`${BASE}/static/${served.wasm}`);
const wasmBytes = (await wasm.arrayBuffer()).byteLength;
check('the WASM asset is served from this origin as application/wasm', wasm.ok && wasm.headers.get('content-type') === 'application/wasm', `${wasm.status} ${wasm.headers.get('content-type')} ${wasmBytes} bytes`);
const doc = await fetch(`${BASE}/`);
await doc.arrayBuffer();
const csp = doc.headers.get('content-security-policy') || '';
console.log(`document headers: content-security-policy="${csp}" x-frame-options="${doc.headers.get('x-frame-options')}"`);
check('the document CSP is the framing wrapper\'s and does not restrict scripts, workers or WASM', /frame-ancestors 'self'/.test(csp) && !/(default-src|script-src|worker-src)/.test(csp), csp);

let hits = 0;
const observer = createServer((req, res) => { hits++; res.end('{}'); });
await new Promise(resolve => observer.listen(0, '127.0.0.1', resolve));
const OBSERVED = `http://127.0.0.1:${observer.address().port}/leak`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => { window.__cspViolations = []; document.addEventListener('securitypolicyviolation', e => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  await page.goto(`${BASE}/`);
  // From here on, every request the page or its Workers make must stay on this origin (the page's own load is not judged).
  const offOrigin = [];
  context.on('request', request => { if (!request.url().startsWith(BASE) && !/^(data|blob):/.test(request.url())) offOrigin.push(request.url()); });

  const result = await page.evaluate(async ({ workerUrl, OBSERVED }) => {
    const VALID = `export function evaluate({ inputs, time }) { const points = []; for (let i = 0; i < 200; i++) points.push([i / 20, Math.sin(i / 20 * inputs.k + time)]);
      return { frame: { objects: [{ kind: 'polyline', id: 'curve', points }] }, quantities: { k: inputs.k } }; }`;
    const request = { inputs: { k: 2 }, time: 0.5, seed: 1, state: null };
    const start = () => new Promise((resolve, reject) => {
      const t0 = performance.now(), worker = new Worker(workerUrl, { type: 'module' });
      worker.onerror = e => reject(Error(`worker error: ${e.message}`));
      worker.onmessage = ({ data }) => data.ready ? resolve({ worker, coldMs: performance.now() - t0, bootMs: data.bootMs }) : reject(Error('engine did not load'));
    });
    let next = 0;
    const call = (worker, source, req = request) => new Promise(resolve => {
      const id = ++next, t0 = performance.now();
      worker.onmessage = ({ data }) => data.id === id && resolve({ ...data, roundTripMs: performance.now() - t0 });
      worker.postMessage({ id, source, request: req });
    });
    const out = {};
    const { worker, coldMs, bootMs } = await start();
    out.boot = { coldMs, bootMs };
    const first = await call(worker, VALID);
    out.firstValid = { ok: first.ok, points: first.value?.frame.objects[0].points.length, ms: first.roundTripMs };
    const cases = {
      loop: `export function evaluate() { for (;;) {} }`,
      fetch: `export function evaluate() { fetch('${OBSERVED}'); }`,
      xhr: `export function evaluate() { new XMLHttpRequest().open('GET', '${OBSERVED}'); }`,
      importUrl: `import x from '${OBSERVED}'; export function evaluate() { return x; }`,
      dynamicImport: `export function evaluate() { import('${OBSERVED}'); return { frame: { objects: [] } }; }`,
      storage: `export function evaluate() { return { c: document.cookie, s: localStorage.length, w: typeof self }; }`,
      heap: `export function evaluate() { const k = []; for (;;) k.push(new Float64Array(1e6)); }`,
      getterLoop: `export function evaluate() { return { get x() { for (;;) {} } }; }`,
      hugeOutput: `export function evaluate() { return { s: 'x'.repeat(1 << 20) }; }`,
      microtask: `export function evaluate() { Promise.resolve().then(() => { for (;;) {} }); return { frame: { objects: [] } }; }`,
    };
    out.cases = {};
    for (const [name, source] of Object.entries(cases)) {
      const r = await call(worker, source);
      const after = await call(worker, VALID);
      out.cases[name] = { ok: r.ok, code: r.code, phase: r.phase, ms: r.roundTripMs, wasmBytes: r.metrics?.wasmBytes, followUp: after.ok };
    }
    out.workerGlobalsUntouched = typeof self.fetch === 'function';
    const warm = [];
    for (let i = 0; i < 200; i++) warm.push((await call(worker, VALID, { ...request, time: i / 30 })).roundTripMs);
    warm.sort((a, b) => a - b);
    const last = await call(worker, VALID);
    out.warm = { p50: warm[100], p95: warm[190], max: warm[199], wasmBytes: last.metrics.wasmBytes, outputBytes: last.metrics.outputBytes };
    worker.terminate();

    // Hard termination: a busy Worker is terminated mid-operation; nothing arrives afterwards; a new Worker runs.
    const busy = await start();
    let late = 0;
    busy.worker.onmessage = () => { late++; };
    busy.worker.postMessage({ id: 'busy', source: `export function evaluate() { for (;;) {} }`, request });
    await new Promise(resolve => setTimeout(resolve, 5));
    busy.worker.terminate();
    await new Promise(resolve => setTimeout(resolve, 400));
    out.terminated = { lateMessages: late };
    // Repeated init and disposal.
    const again = [];
    for (let i = 0; i < 5; i++) { const w = await start(); const r = await call(w.worker, VALID); again.push(r.ok); w.worker.terminate(); }
    out.repeated = again;
    return out;
  }, { workerUrl: `/static/${served.worker}`, OBSERVED });

  console.log(JSON.stringify(result, null, 1));
  check('a valid program evaluates in the built Worker', result.firstValid.ok && result.firstValid.points === 200, JSON.stringify(result.firstValid));
  const expect = { loop: 'runtime_limit', fetch: 'runtime_error', xhr: 'runtime_error', importUrl: 'invalid_program', storage: 'runtime_error', heap: 'runtime_limit', getterLoop: 'runtime_limit', hugeOutput: 'invalid_output' };
  for (const [name, code] of Object.entries(expect)) check(`${name}: refused with ${code}, then a valid program runs`, result.cases[name].code === code && result.cases[name].followUp, JSON.stringify(result.cases[name]));
  check('dynamic import and queued microtasks never run, and the operation still answers', result.cases.dynamicImport.ok && result.cases.microtask.ok && result.cases.microtask.followUp);
  check('the WASM memory stays under its 32 MiB cap after heap exhaustion', result.cases.heap.wasmBytes <= 32 * 1024 * 1024, `${result.cases.heap.wasmBytes}`);
  check('a looping guest is stopped by the interpreter deadline, well inside the host watchdog (250 ms)', result.cases.loop.ms < 250, `${result.cases.loop.ms.toFixed(1)} ms`);
  check('cold Worker start (fetch, compile, instantiate) within the 2 s boot budget', result.boot.coldMs < 2000, `${result.boot.coldMs.toFixed(1)} ms`);
  console.log(`warm round trip (postMessage + evaluate + transfer), 200 runs: p50 ${result.warm.p50.toFixed(2)} ms, p95 ${result.warm.p95.toFixed(2)} ms, max ${result.warm.max.toFixed(2)} ms; WASM ${result.warm.wasmBytes} bytes`);
  check('warm round trip p95 under the 16 ms frame budget', result.warm.p95 < 16, `${result.warm.p95.toFixed(2)} ms`);
  check('Worker.terminate on a busy Worker: no late message', result.terminated.lateMessages === 0, JSON.stringify(result.terminated));
  check('repeated Worker start, evaluate and terminate', result.repeated.length === 5 && result.repeated.every(Boolean));
  check('the external observer saw no guest request', hits === 0, `${hits} hits`);
  check('no request left this origin', offOrigin.length === 0, offOrigin.join(' '));
  const violations = await page.evaluate(() => window.__cspViolations);
  check('no CSP violation', violations.length === 0, violations.join(' | '));
} finally {
  await browser.close();
  observer.close();
}
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL ? 0 : 1);
