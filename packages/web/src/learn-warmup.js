// Tool Performance v1 idle warm-up (docs/features/learn-tool-performance.md).
// Tiers: the initial Learn load fetches nothing extra. Once the browser is
// idle, and the learner has not typed, scrolled or pointed for a moment, one
// tool per idle slot is fetched and parsed, most common first, so a first
// insert costs about what a warm one does. Nothing here renders a card,
// creates a calculator or boots Python. Skipped on Save-Data and 2G.
import { loadDesmos } from './graph-renderers.js';
import { warmNotebookSite } from './learn-notebook.js';

const QUIET_MS = 1200;
let lastActivity = 0, started = false;
const constrained = () => {
  const connection = navigator.connection;
  return !!(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || ''));
};
const whenIdle = task => new Promise(resolve => {
  const attempt = () => {
    const wait = QUIET_MS - (performance.now() - lastActivity);
    if (wait > 0) { setTimeout(attempt, wait); return; }
    (window.requestIdleCallback || (fn => setTimeout(fn, 200)))(() => {
      if (performance.now() - lastActivity < QUIET_MS) { attempt(); return; }
      Promise.resolve().then(task).catch(() => { /* warm-up is opportunistic */ }).finally(resolve);
    }, { timeout: 8000 });
  };
  attempt();
});

// In order: cheap and common first, heavy and less common last.
const TIERS = app => [
  // KaTeX's code is in the main bundle; its first use costs the two fonts.
  () => Promise.all(['1em KaTeX_Main', 'italic 1em KaTeX_Math'].map(font => document.fonts?.load(font))),
  // Fetch and parse the Desmos SDK (the 0.6 s first-use freeze); no calculator is created.
  () => loadDesmos(app),
  () => import('plotly.js-basic-dist-min'),
  // Starts the shared ELK layout worker (flow-layout.js); it parses off the main thread.
  () => import('./flow-layout.js').then(module => module.layoutEngine()),
  () => import('./WhiteboardBlock.jsx'),
  () => import('mermaid'),
  // The notebook site's code into its own cache partition; Python is not started.
  () => warmNotebookSite(),
];

export function warmLearnTools(app) {
  if (started || typeof window === 'undefined' || constrained()) return;
  started = true;
  for (const event of ['keydown', 'wheel', 'pointerdown', 'touchstart']) window.addEventListener(event, () => { lastActivity = performance.now(); }, { passive: true, capture: true });
  // The page just loaded: hold off a few seconds so nothing competes with Learn's own load.
  lastActivity = performance.now() + 2000;
  // Marks let the benchmark see when the warm-up finished (learn-perf.js naming).
  (async () => {
    for (const [index, task] of TIERS(app).entries()) { await whenIdle(task); performance.mark(`rh:warmup:${index}`); }
    performance.mark('rh:warmup:done');
  })();
}
