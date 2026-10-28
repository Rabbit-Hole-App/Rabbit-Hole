// Trusted Worker bootstrap for generated /explain programs. It loads the pinned engine (runtime.js), says { ready } once, then
// answers each { id, source, request } with runProgram's result under the same id. Guest source never runs as native
// JavaScript here: it only reaches the QuickJS interpreter. host.js owns deadlines and Worker.terminate.
import { loadEngine, runProgram } from './runtime.js';

// A Worker started by page-worker.js (name below; the same literal is there) makes no fetch of its own: its first message is the
// compiled engine module from the page. Any other Worker fetches the WASM itself.
const FROM_PAGE = self.name === 'explain-program-page-wasm';
const started = performance.now();
const engine = FROM_PAGE
  ? new Promise(resolve => { self.onmessage = ({ data }) => { self.onmessage = answer; resolve(loadEngine(undefined, data.wasmModule)); }; })
  : loadEngine();
engine.then(() => self.postMessage({ ready: true, bootMs: performance.now() - started }),
  () => { self.postMessage({ ready: false }); self.close(); });

async function answer({ data: { id, source, request } }) {
  try {
    self.postMessage({ id, ...runProgram(await engine, { source, request }) });
  } catch {
    // The engine itself failed (a WASM trap, not a guest exception): report once and stop; the host starts a new Worker.
    self.postMessage({ id, ok: false, code: 'runtime_error', phase: 'engine', detail: 'engine failure' });
    self.close();
  }
}
if (!FROM_PAGE) self.onmessage = answer;
