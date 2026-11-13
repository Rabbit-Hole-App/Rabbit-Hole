// Render the LOOK of the three generated /interactive scenes next to Codex's three reference cards, offline: no model call, no deploy, no app, no dev clone.
//   node scripts/interact/render-look.mjs            (from the repo root; writes docs/features/interact/evidence/2026-11-13-codex-match/*.png)
// Codex: each docs/features/interact/references/<depth>-toss-and-drop.html is loaded from file:// in headless Chrome (1000 px viewport, device scale 2), and its `.experiment` element
// (scene, transport, controls) is screenshotted at the default state, after "At top" (and, for Standard, 0.10 s after the top).
// Ours: the scripted sdk-8 program of the same plan (packages/web/src/interact-toss-programs.js) runs in the pinned engine at the same states, its frame is normalised (normalizeFrame)
// and drawn by the real Frame of AnimatedScene.jsx in interact mode (esbuild bundle + react-dom/server), in a static page with the Codex page's own Inter and the theme variables of
// packages/web/src/index.css, at the width of the Codex `.experiment`, same device scale. Only the scene frame is drawn: the card chrome, transport and controls are not part of it.
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { loadEngine, runProgram } from '../../packages/web/src/explain-program/runtime.js';
import { parseGuestResult, resolveInputs } from '../../packages/web/src/explain-program/contract.js';
import { LIMITS } from '../../packages/web/src/explain-program/limits.js';
import { normalizeFrame } from '../../packages/web/src/explain-program/frame.js';
import { sealTossProgram } from '../../packages/web/src/interact-toss-programs.js';

const root = resolve(import.meta.dirname, '../..');
const out = join(root, 'docs/features/interact/evidence/2026-11-13-codex-match');
const REFERENCE = depth => join(root, `docs/features/interact/references/${depth}-toss-and-drop.html`);
const PLANS = { overview: 'tossOverview', standard: 'tossStandard', deep: 'tossDeep' };
const VIEWPORT = 1000, SCALE = 2, G = 9.8, U = 4, TOP = U / G;
// The states shot per depth: name of the file suffix, the Codex action that reaches it, and the elapsed time (from launch) the program is run at.
const STATES = {
  overview: [['', null, 0], ['-top', 'top', TOP]],
  standard: [['', null, 0], ['-top', 'top', TOP], ['-after', 'after', TOP + 0.1]],
  deep: [['', null, 0], ['-top', 'top', TOP]],
};

const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
async function launch() {
  try { return await chromium.launch({ channel: 'chrome', headless: true }); } catch (error) { console.log(`chrome channel unavailable (${String(error.message).split('\n')[0]}); using the bundled Chromium`); return chromium.launch({ headless: true }); }
}

// ---- ours: the real Frame, server-rendered ----
function frameBundle() {
  const dir = mkdtempSync(join(tmpdir(), 'render-look-')), outfile = join(dir, 'frame.cjs');
  try {
    buildSync({
      stdin: { contents: "export { Frame } from '../AnimatedScene.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: join(root, 'packages/web/src/explain-program') },
      bundle: true, outfile, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent',
    });
    return createRequire(import.meta.url)(outfile);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const NOOP = () => {};
const engine = await loadEngine();
const drawn = frameBundle();

async function ourMarkup(plan, time) {
  const sealed = await sealTossProgram(plan), { manifest } = sealed;
  const request = { requestId: '1', inputs: resolveInputs(manifest, {}), time, seed: 0, state: null };
  const run = runProgram(engine, { source: sealed.source, request, sdkVersion: sealed.sdkVersion }, { ...LIMITS, interruptMs: LIMITS.watchdogMs });
  if (!run.ok) throw new Error(`${plan} at ${time} s: ${run.code} ${run.detail}`);
  const parsed = parseGuestResult(run.value, manifest, sealed.sdkVersion);
  if (!parsed.ok) throw new Error(`${plan} at ${time} s: ${parsed.issue}`);
  const view = normalizeFrame(parsed.value.frame, manifest);
  if (!view.ok) throw new Error(`${plan} at ${time} s: ${view.issue}`);
  return drawn.renderToStaticMarkup(drawn.createElement(drawn.Frame, { interact: true, scene: view.scene, state: view.state, selecting: false, marked: null, picked: null, pop: { duration: 0 }, fixedView: true, onPick: NOOP, onRegion: NOOP }));
}

// The page ours is drawn in: the Inter face of the Codex page, and the --viz / --color tokens of index.css (the theme variables the card sets; the Frame sets its own ink, line and surface).
const reference = readFileSync(REFERENCE('overview'), 'utf8');
const FONT = reference.match(/@font-face\{font-family:Inter;[^}]*\}/)?.[0];
if (!FONT) throw new Error('the Inter @font-face was not found in the Codex page');
const css = readFileSync(join(root, 'packages/web/src/index.css'), 'utf8');
const TOKENS = [...css.slice(0, css.indexOf('\n.dark {')).matchAll(/(--(?:viz|color|font)-[\w-]+):\s*([^;]+);/g)].map(match => `${match[1]}:${match[2]};`).join('');
const page = (markup, width) => `<!doctype html><meta charset="utf-8"><style>${FONT}:root{${TOKENS}}body{margin:0;font-family:Inter,"Liberation Sans",Arial,sans-serif}#shot{width:${width}px}#shot svg{display:block;width:100%;height:auto}</style><div id="shot">${markup}</div>`;

mkdirSync(out, { recursive: true });
const browser = await launch();
const written = [];
try {
  for (const [depth, states] of Object.entries(STATES)) {
    // Codex
    const context = await browser.newContext({ viewport: { width: VIEWPORT, height: 1500 }, deviceScaleFactor: SCALE });
    const codex = await context.newPage();
    await codex.goto(pathToFileURL(REFERENCE(depth)).href);
    await codex.evaluate(() => document.fonts.ready);
    await codex.waitForTimeout(300);
    const experiment = codex.locator('.experiment');
    const width = (await experiment.boundingBox()).width;
    for (const [suffix, action] of states) {
      if (action === 'top') { await codex.click('#top-marker'); await codex.waitForTimeout(400); }
      if (action === 'after') { await codex.evaluate(() => { const input = document.getElementById('time'); input.value = '0.1'; input.dispatchEvent(new Event('input', { bubbles: true })); }); await codex.waitForTimeout(400); }
      const file = join(out, `${depth}-codex${suffix}.png`);
      await experiment.screenshot({ path: file });
      written.push(file);
    }
    await context.close();
    // Ours, at the same states and the Codex width
    const mine = await (await browser.newContext({ viewport: { width: VIEWPORT, height: 1000 }, deviceScaleFactor: SCALE })).newPage();
    for (const [suffix, , time] of states) {
      await mine.setContent(page(await ourMarkup(PLANS[depth], time), width));
      await mine.evaluate(() => Promise.all(['400 14px Inter', '600 14px Inter', '700 14px Inter'].map(face => document.fonts.load(face)))).then(() => mine.evaluate(() => document.fonts.ready));
      const file = join(out, `${depth}-ours${suffix}.png`);
      await mine.locator('#shot').screenshot({ path: file });
      written.push(file);
    }
    console.log(`${depth}: the Codex experiment is ${width} px wide`);
  }
} finally { await browser.close(); }
for (const file of written) console.log(file);
