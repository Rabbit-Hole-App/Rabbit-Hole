// Production render entry for /explain review (EXP-T18 step 1) and the viz-benchmarks capture: the real
// AnimatedScene card body with the app's CSS, fonts and KaTeX, at a declared size, theme, time and inputs.
// Built by Vite (vite.config.js input `render`), so a capture uses the same bundle the app ships.
// The page holds no data and makes no requests of its own: the driver injects the scene with
// window.__renderScene(...) (never in a URL) and screenshots [data-render-target] or [data-animation-frame].
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import AnimatedScene from '../src/AnimatedScene.jsx';
import '../src/index.css';

const host = document.getElementById('root');
const root = createRoot(host);
const frames = n => new Promise(resolve => { const step = left => (left ? requestAnimationFrame(() => step(left - 1)) : resolve()); step(n); });

// Inter (UI and scene labels), JetBrains Mono (scene numerals and code, index.css) and the KaTeX faces equations use; each load resolves once the face is usable.
const FACES = ['400 1em "Inter Variable"', '600 1em "Inter Variable"', '400 1em "JetBrains Mono"', '1em KaTeX_Main', 'italic 1em KaTeX_Math', '1em KaTeX_Size1', '1em KaTeX_Size2'];

// request: { scene, time, inputs, theme: 'light'|'dark', width, height }
// width/height size the diagram frame (default: the scene's own); the transport and any experiment
// controls render below it at their natural height, as in the card.
window.__renderScene = async request => {
  window.__renderDone = null;
  const { scene, time, inputs, theme = 'light' } = request;
  const width = request.width || scene.width;
  const height = request.height || scene.height;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  host.style.width = `${width}px`;
  host.style.height = `${height + 160}px`;
  const block = { id: 'render', type: 'animation', dx: 0, dy: 0, title: scene.title || scene.id, scene, time: time ?? scene.duration, selectedObject: null, marked: null, ...(inputs ? { inputs } : {}) };
  flushSync(() => root.render(
    <div data-render-target className="flex h-full flex-col bg-white p-3">
      <AnimatedScene block={block} onChange={() => {}} onChangeQuiet={() => {}} onAskRegion={() => {}} />
    </div>,
  ));
  await frames(2);
  const frame = host.querySelector('[data-animation-frame]');
  if (!frame) {
    window.__renderDone = { ok: false, error: host.textContent.trim().slice(0, 500) || 'nothing rendered' };
    return window.__renderDone;
  }
  // Grow the card by its own chrome (padding, border, controls) so the frame gets exactly the declared size.
  const chromeW = host.clientWidth - frame.clientWidth, chromeH = host.clientHeight - frame.clientHeight;
  host.style.width = `${width + chromeW}px`;
  host.style.height = `${height + chromeH}px`;
  await Promise.all(FACES.map(face => document.fonts.load(face)));
  await document.fonts.ready;
  await frames(3);
  const box = frame.getBoundingClientRect();
  if (Math.round(box.width) !== width || Math.round(box.height) !== height) {
    window.__renderDone = { ok: false, error: `frame is ${Math.round(box.width)}x${Math.round(box.height)}, declared ${width}x${height}` };
    return window.__renderDone;
  }
  const missing = FACES.filter(face => !document.fonts.check(face));
  window.__renderDone = { ok: true, frame: { width: Math.round(box.width), height: Math.round(box.height) }, fonts: { missing }, theme };
  return window.__renderDone;
};
window.__renderReady = true;
