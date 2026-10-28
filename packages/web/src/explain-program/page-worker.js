// A real dedicated Worker for pages whose request interception covers the page's own fetches but not a Worker's (the /explain
// review render in Browser Rendering, explain-render.js). The page fetches the bundled program Worker and the engine WASM (both
// intercepted /static assets), refuses a WASM whose SHA-256 is not the pinned ENGINE_FINGERPRINT, compiles it, and starts the
// Worker from a Blob. The Worker bundle is one file with no imports (runtime.js loads the engine without import()), and it is
// handed the compiled module, so it fetches nothing itself. Same worker.js, runtime.js, limits and stamps as the card, and
// Worker.terminate stops it as on the card.
//   createProgramHost({ artifact, createWorker: await pageWorkerFactory() })
import workerUrl from './worker.js?worker&url';
import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import { RuntimeError } from './contract.js';
import { ENGINE_FINGERPRINT } from './stamps.js';

const NAME = 'explain-program-page-wasm'; // worker.js waits for the compiled engine when it has this name
const fetched = async url => {
  const response = await fetch(url);
  if (!response.ok) throw new RuntimeError('version_unavailable', `${url}: HTTP ${response.status}`);
  return response;
};
const hex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');

export async function pageWorkerFactory() {
  const [script, wasm] = await Promise.all([fetched(workerUrl).then(r => r.text()), fetched(wasmUrl).then(r => r.arrayBuffer())]);
  if (hex(await crypto.subtle.digest('SHA-256', wasm)) !== ENGINE_FINGERPRINT) throw new RuntimeError('version_unavailable', 'engine WASM does not match ENGINE_FINGERPRINT');
  const wasmModule = await WebAssembly.compile(wasm);
  const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' })); // ponytail: never revoked; one per review page
  return () => {
    const worker = new Worker(url, { type: 'module', name: NAME });
    worker.postMessage({ wasmModule });
    return worker;
  };
}
