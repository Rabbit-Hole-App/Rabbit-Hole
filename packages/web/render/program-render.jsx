// Review render of a generated /explain program (explain sandbox Task 6): the server-sealed artifact is verified and run by the
// SAME host (host.js), pinned engine (runtime.js), SDK, frame normaliser and shared Frame the learner's card uses, then drawn so
// the driver can screenshot it. Loaded on demand by render-scene.jsx (window.__renderProgram), so a legacy scene capture never
// loads the interpreter.
//
// One difference from the card, stated: the card's host runs the engine in a dedicated Worker; here the host's createWorker option
// gives it a page-side stand-in that calls runProgram directly. The review page is trusted, inert and has no network, request
// interception cannot be relied on to cover a Worker's own fetches, and the guest still runs only inside QuickJS under the same
// interrupt, heap, stack and output limits. Worker termination and CSP are proven by e2e/explain-program-check.mjs.
//
// request: { program: ProgramArtifact, time, inputs, theme, width, height }
// -> { ok: true, frame, fonts, theme, bundleHash, trace, drawn } | { ok: false, programError: { code, diagnostic } } | { ok: false, error }
import { flushSync } from 'react-dom';
import { Frame } from '../src/AnimatedScene.jsx';
import { parseArtifact } from '../src/explain-program/contract.js';
import { normalizeFrame } from '../src/explain-program/frame.js';
import { createProgramHost } from '../src/explain-program/host.js';
import { evaluateRequestFor } from '../src/explain-program/program-card.js';
import { loadEngine, runProgram } from '../src/explain-program/runtime.js';

const NOOP = () => {};
let engine = null; // one WASM instance for the page, loaded on first use

// The Worker-shaped object host.js drives: it answers { ready } once and runs each posted program in the engine.
class InPageWorker {
  constructor() {
    this.onmessage = this.onerror = null;
    this.stopped = false;
    engine ??= loadEngine();
    engine.then(() => this.emit({ ready: true, bootMs: 0 }), () => this.emit({ ready: false }));
  }
  emit(data) { setTimeout(() => { if (!this.stopped) this.onmessage?.({ data }); }, 0); }
  postMessage({ id, source, request }) { engine.then(loaded => this.emit({ id, ...runProgram(loaded, { source, request }) }), () => this.emit({ id, ok: false, code: 'runtime_error', phase: 'engine', detail: 'engine failure' })); }
  terminate() { this.stopped = true; }
}

const failure = (code, diagnostic) => ({ ok: false, programError: { code, diagnostic: String(diagnostic ?? '').slice(0, 500) } });

export async function renderProgram(request, { host, root, frames, faces, nextMount }) {
  window.__renderDone = null;
  const parsed = parseArtifact(request.program);
  if (!parsed.ok) return (window.__renderDone = failure(parsed.error.code, parsed.issue));
  const artifact = parsed.value, { manifest } = artifact;
  document.documentElement.classList.toggle('dark', request.theme === 'dark');
  const programHost = createProgramHost({ artifact, createWorker: () => new InPageWorker() });
  const asked = evaluateRequestFor(manifest, { inputs: request.inputs }, request.time ?? 0, 1); // the card's own request builder
  let reply;
  try { reply = await programHost.evaluate(asked); }
  catch (error) { return (window.__renderDone = failure(error.code || 'runtime_error', error.diagnostic ?? error.message)); }
  finally { programHost.dispose('review render done'); }
  const view = normalizeFrame(reply.frame, manifest);
  if (!view.ok) return (window.__renderDone = failure(view.error.code, view.issue));

  const width = request.width || view.scene.width, height = request.height || view.scene.height;
  host.style.width = `${width}px`;
  host.style.height = `${height + 160}px`;
  flushSync(() => root.render(
    <div data-render-target data-program-bundle={artifact.bundleHash} key={nextMount()} className="flex h-full flex-col gap-2 bg-white p-3">
      <div data-program-frame role="group" aria-label={manifest.description} className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-white">
        <Frame scene={view.scene} state={view.state} selecting={false} marked={null} picked={null} pop={{ duration: 0 }} fixedView onPick={NOOP} onRegion={NOOP} />
      </div>
      {view.readouts.length > 0 && (
        <p data-program-readouts className="shrink-0 text-sm tabular-nums text-ink">{view.readouts.map(readout => `${readout.label}: ${readout.text}`).join(' · ')}</p>
      )}
      {manifest.assumptions.length > 0 && <p data-program-assumptions className="shrink-0 text-[11px] text-ink-2">Assumes: {manifest.assumptions.join(' ')}</p>}
    </div>,
  ));
  await frames(2);
  const frame = host.querySelector('[data-animation-frame]');
  if (!frame) return (window.__renderDone = { ok: false, error: host.textContent.trim().slice(0, 500) || 'nothing rendered' });
  await Promise.all(faces.map(face => document.fonts.load(face)));
  await document.fonts.ready;
  // Grow the card by its own chrome so the frame gets exactly the declared size (as render-scene.jsx does for a scene card).
  let box;
  for (let attempt = 0; attempt < 3; attempt++) {
    const chromeW = host.clientWidth - frame.clientWidth, chromeH = host.clientHeight - frame.clientHeight;
    host.style.width = `${width + chromeW}px`;
    host.style.height = `${height + chromeH}px`;
    await frames(3);
    box = frame.getBoundingClientRect();
    if (Math.round(box.width) === width && Math.round(box.height) === height) break;
  }
  if (Math.round(box.width) !== width || Math.round(box.height) !== height) {
    return (window.__renderDone = { ok: false, error: `frame is ${Math.round(box.width)}x${Math.round(box.height)}, declared ${width}x${height}` });
  }
  const missing = faces.filter(face => !document.fonts.check(face));
  window.__renderDone = {
    ok: true, frame: { width: Math.round(box.width), height: Math.round(box.height) }, fonts: { missing }, theme: request.theme || 'light',
    // What the driver asserts: the bundle that ran is the sealed one, and something was actually drawn.
    bundleHash: artifact.bundleHash,
    drawn: { objects: view.scene.objects.length, elements: frame.querySelectorAll('svg *').length, readouts: view.readouts.length },
    trace: { inputs: asked.inputs, time: asked.time, quantities: reply.quantities, metrics: { ms: Math.round(reply.metrics.ms * 100) / 100 } },
  };
  return window.__renderDone;
}
