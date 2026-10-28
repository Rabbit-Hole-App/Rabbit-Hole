// Review render of a generated /explain program (explain sandbox Task 6): the server-sealed artifact is verified and run by the
// SAME host (host.js), pinned engine (runtime.js), SDK, frame normaliser and shared Frame the learner's card uses, then drawn so
// the driver can screenshot it. Loaded on demand by render-scene.jsx (window.__renderProgram), so a legacy scene capture never
// loads the interpreter.
//
// The engine runs in a REAL dedicated Worker, as on the learner's card (page-worker.js): the page fetches the bundled worker script and the
// WASM through the intercepted /static assets, checks the WASM against the pinned fingerprint, compiles it and starts the Worker from a
// Blob, handing it the compiled module, so the Worker fetches nothing itself and host.js can Worker.terminate it. Worker termination
// itself is proven by e2e/explain-program-check.mjs; that Browser Rendering leaves the blob: Worker alone is only provable in a real run.
//
// request: { program: ProgramArtifact, time, inputs, theme, width, height }
// -> { ok: true, frame, fonts, theme, bundleHash, trace, drawn } | { ok: false, programError: { code, diagnostic } } | { ok: false, error }
import { flushSync } from 'react-dom';
import { Frame } from '../src/AnimatedScene.jsx';
import { parseArtifact } from '../src/explain-program/contract.js';
import { normalizeFrame } from '../src/explain-program/frame.js';
import { createProgramHost } from '../src/explain-program/host.js';
import { evaluateRequestFor } from '../src/explain-program/program-card.js';
import { pageWorkerFactory } from '../src/explain-program/page-worker.js';

const NOOP = () => {};
let factory = null; // the Worker factory for this page: the script and the compiled engine are fetched once

// where: the runtime's phase (load, evaluate, serialize, engine) and elapsed ms when it reported them, so a load overrun can be told from an evaluate overrun.
const PHASES = ['load', 'evaluate', 'serialize', 'engine'];
const failure = (code, diagnostic, where) => ({ ok: false, programError: { code, diagnostic: String(diagnostic ?? '').slice(0, 500),
  ...(PHASES.includes(where?.phase) ? { phase: where.phase } : {}), ...(Number.isFinite(where?.ms) ? { ms: Math.round(where.ms * 10) / 10 } : {}) } });

export async function renderProgram(request, { host, root, frames, faces, nextMount }) {
  window.__renderDone = null;
  const parsed = parseArtifact(request.program);
  if (!parsed.ok) return (window.__renderDone = failure(parsed.error.code, parsed.issue));
  const artifact = parsed.value, { manifest } = artifact;
  document.documentElement.classList.toggle('dark', request.theme === 'dark');
  // A page that cannot load its own engine is a platform failure, not the program's: it is not a programError (the server retries the render).
  try { factory ??= pageWorkerFactory(); await factory; } catch (error) { factory = null; return (window.__renderDone = { ok: false, error: `engine unavailable: ${String(error.diagnostic ?? error.message).slice(0, 300)}` }); }
  const programHost = createProgramHost({ artifact, createWorker: await factory });
  const asked = evaluateRequestFor(manifest, { inputs: request.inputs }, request.time ?? 0, 1); // the card's own request builder
  let reply;
  try { reply = await programHost.evaluate(asked); }
  catch (error) { return (window.__renderDone = failure(error.code || 'runtime_error', error.diagnostic ?? error.message, error.where)); }
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
