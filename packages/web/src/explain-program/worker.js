// Trusted Worker bootstrap for generated /explain programs. It loads the pinned engine (runtime.js), says { ready } once, then
// answers each { id, source, request } with runProgram's result under the same id. Guest source never runs as native
// JavaScript here: it only reaches the QuickJS interpreter. host.js owns deadlines and Worker.terminate.
import { loadEngine, runProgram } from './runtime.js';

const started = performance.now();
const engine = loadEngine();
engine.then(() => self.postMessage({ ready: true, bootMs: performance.now() - started }),
  () => { self.postMessage({ ready: false }); self.close(); });

self.onmessage = async ({ data: { id, source, request } }) => {
  try {
    self.postMessage({ id, ...runProgram(await engine, { source, request }) });
  } catch {
    // The engine itself failed (a WASM trap, not a guest exception): report once and stop; the host starts a new Worker.
    self.postMessage({ id, ok: false, code: 'runtime_error', phase: 'engine', detail: 'engine failure' });
    self.close();
  }
};
