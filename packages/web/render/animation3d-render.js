// Review capture entry for /animation (AN-05 render seam; served as /render/animation3d.html, driven by control-plane
// animation-render.js through env.BROWSER). The page holds no data and makes no requests of its own beyond its /static assets and
// its own blob: Worker: the driver passes ONE candidate per call with window.__renderAnimation3d(request) (never in a URL) and
// screenshots [data-animation3d-frame]. The program runs in the learner card's runtime (review.js -> runtime.js) on a real
// dedicated Worker started from the page's own fetched, fingerprint-checked engine (explain-program/page-worker.js); the scene is
// drawn by the card's renderer (renderer.js).
// WebGL in Browser Rendering's headless Chrome is unverified: the page probes for it once, and without it every capture answers
// { ok: false, error: 'webgl_unavailable' } (a structured render blocker, never a blank pass). A capture whose canvas cannot be read
// back after drawing (a lost context) answers the same.
import { pageWorkerFactory } from '../src/explain-program/page-worker.js';
import { createAnimationRenderer } from '../src/animation3d/renderer.js';
import { runReviewProgram } from '../src/animation3d/review.js';

const frameElement = document.querySelector('[data-animation3d-frame]');
const frames = count => new Promise(resolve => { const step = left => (left ? requestAnimationFrame(() => step(left - 1)) : resolve()); step(count); });
const THEMES = { light: { background: '#ffffff', ink: '#1f2328', panel: 'rgba(255, 255, 255, 0.9)' }, dark: { background: '#16181d', ink: '#e6e8eb', panel: 'rgba(22, 24, 29, 0.9)' } };

let renderer = null, lost = false, unavailable = null, workerFactory = null;
const probe = document.createElement('canvas');
if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) unavailable = 'webgl_unavailable';
else {
  try { renderer = createAnimationRenderer({ container: frameElement, onLost: () => { lost = true; } }); }
  catch { unavailable = 'webgl_unavailable'; }
}
const canvas = frameElement.querySelector('canvas');
if (canvas) Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
const overlay = document.createElement('div');
Object.assign(overlay.style, { position: 'absolute', left: '12px', bottom: '12px', maxWidth: 'calc(100% - 24px)', padding: '6px 10px', borderRadius: '8px', font: '500 14px/1.4 system-ui, sans-serif', display: 'none' });
frameElement.appendChild(overlay);

// The readouts (with their declared decimals and units) and a game's goal, as plain text: never parsed as HTML.
function showOverlay(artifact, frame, theme) {
  const lines = artifact.readouts.filter(readout => Number.isFinite(frame.readouts?.[readout.id]))
    .map(readout => `${readout.label}: ${frame.readouts[readout.id].toFixed(readout.decimals)}${readout.unit ? ` ${readout.unit}` : ''}`);
  if (frame.goal) lines.push(`${frame.goal.status === 'won' ? 'Won' : frame.goal.status === 'lost' ? 'Lost' : 'Playing'}${frame.goal.message ? `: ${frame.goal.message}` : ''}`);
  overlay.textContent = lines.join('  ·  ');
  Object.assign(overlay.style, { display: lines.length ? 'block' : 'none', background: THEMES[theme].panel, color: THEMES[theme].ink });
}

window.__renderAnimation3d = async request => {
  if (unavailable) return { ok: false, error: unavailable };
  if (!workerFactory) return { ok: false, error: 'engine_unavailable' };
  const ran = await runReviewProgram(request, { workerFactory });
  if (!ran.ok) return ran;
  const theme = request.theme ?? 'light';
  Object.assign(frameElement.style, { width: `${request.width}px`, height: `${request.height}px`, background: THEMES[theme].background });
  document.body.style.background = THEMES[theme].background;
  const loaded = await renderer.load(ran.artifact, { generation: request.artifactHash });
  if (!loaded.ok) return { ok: false, error: `scene ${loaded.code}` };
  renderer.setCamera(request.view);
  const applied = renderer.applyFrame(ran.frame);
  if (!applied.ok) return { ok: false, error: `frame refused: ${JSON.stringify(applied.issues.slice(0, 3))}` };
  showOverlay(ran.artifact, ran.frame, theme);
  await frames(3); // the resize observer and the on-demand draw settle
  if (lost || !renderer.capturePoster()) return { ok: false, error: 'webgl_unavailable' };
  const box = frameElement.getBoundingClientRect();
  if (Math.round(box.width) !== request.width || Math.round(box.height) !== request.height) return { ok: false, error: `frame is ${Math.round(box.width)}x${Math.round(box.height)}, declared ${request.width}x${request.height}` };
  return { ok: true, artifactHash: ran.artifactHash, trace: ran.trace };
};

// Ready once the renderer is probed and the engine Worker can start (or is known not to): the driver then never waits out its
// timeout on a page that can only refuse.
(async () => {
  if (!unavailable) {
    try { workerFactory = await pageWorkerFactory(); } catch { workerFactory = null; }
  }
  window.__animationRenderReady = true;
})();
