// Renders a viz-benchmarks scene-spec.json to PNG through the SAME path /explain review uses in production:
// the built render entry (render/scene.html, `npm run build` first) driven by explain-render.js renderStates,
// with its interception serving only the entry's built files. Here the browser is local headless Chromium
// (Playwright, a dev dependency) behind a puppeteer-shaped adapter, and ASSETS reads the local build;
// in production the browser is Browser Rendering (env.BROWSER) and ASSETS is the Worker's asset binding.
// No dev server, no app shell, no auth, no network.
//
// Usage: node e2e/viz-benchmark-capture.mjs <scene-spec.json> <output.png> [time]
//          [--inputs '{"len":3}'] [--theme dark] [--target body] [--dpr 2] [--dist <dir>]
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compiledHash, renderStates } from '../../control-plane/src/explain-render.js';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

// env.ASSETS stand-in over a local build directory (refuses paths that escape it).
export function distAssets(dist = join(WEB_ROOT, 'dist')) {
  const root = normalize(dist);
  return { fetch: async request => {
    const file = normalize(join(root, decodeURIComponent(new URL(request.url).pathname)));
    if (!file.startsWith(root + sep)) return new Response('outside', { status: 403 });
    try { return new Response(readFileSync(file), { headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } }); }
    catch { return new Response('missing', { status: 404 }); }
  } };
}

// A puppeteer-shaped browser over Playwright Chromium: only the calls renderStates makes.
export function playwrightLauncher({ dpr = 2 } = {}) {
  return async () => {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    return {
      close: () => browser.close(),
      newPage: async () => {
        const context = await browser.newContext({ deviceScaleFactor: dpr });
        const page = await context.newPage();
        return {
          setRequestInterception: async () => {},
          on: (event, handler) => event === 'request' && page.route('**/*', route => handler({
            url: () => route.request().url(),
            abort: reason => route.abort(reason === 'blockedbyclient' ? 'blockedbyclient' : 'failed'),
            respond: ({ status, headers, body }) => route.fulfill({ status, headers, body: Buffer.from(body) }),
          })),
          emulateMediaFeatures: features => page.emulateMedia({ reducedMotion: features.find(f => f.name === 'prefers-reduced-motion')?.value || null }),
          setViewport: async ({ width, height, deviceScaleFactor }) => {
            if (deviceScaleFactor !== dpr) throw new Error(`this launcher renders at dpr ${dpr}, not ${deviceScaleFactor}`);
            await page.setViewportSize({ width, height });
          },
          goto: (url, options) => page.goto(url, options),
          waitForFunction: (expression, options) => page.waitForFunction(expression, null, options),
          evaluate: (fn, arg) => page.evaluate(fn, arg),
          $: selector => page.$(selector),
        };
      },
    };
  };
}

// Render captures for one scene; entries are manifest entries, defaulted to the scene's own size and end time.
export async function captureScene(scene, entries, { dpr = 2, dist } = {}) {
  const full = entries.map((e, i) => ({ id: e.id || `c${i}`, width: scene.width, height: scene.height, dpr, theme: 'light', inputs: {}, time: scene.duration, ...e }));
  const manifest = { version: 1, compiledHash: await compiledHash(scene), reserved: { captures: full.length, pixels: full.reduce((s, e) => s + e.width * e.height * e.dpr * e.dpr, 0) }, entries: full };
  return renderStates({ ASSETS: distAssets(dist) }, { scene }, manifest, { launch: playwrightLauncher({ dpr }) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const inputs = flag('--inputs'), theme = flag('--theme'), target = flag('--target'), dpr = Number(flag('--dpr') || 2), dist = flag('--dist');
  const [sceneArg, outArg, timeArg] = args;
  if (!sceneArg || !outArg) {
    console.error('usage: node e2e/viz-benchmark-capture.mjs <scene-spec.json> <output.png> [time] [--inputs json] [--theme dark] [--target body] [--dpr 2] [--dist dir]');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(sceneArg, 'utf8'));
  const scene = raw.block?.scene || raw.scene || raw; // a bare scene, a stored block or an explain-examples record
  const entry = { ...(timeArg !== undefined ? { time: Number(timeArg) } : {}), ...(inputs ? { inputs: JSON.parse(inputs) } : {}), ...(theme ? { theme } : {}), ...(target ? { target } : {}) };
  const result = await captureScene(scene, [entry], { dpr, dist });
  writeFileSync(outArg, result.captures[0].png);
  console.log(`captured ${outArg} sha256 ${result.captures[0].sha256}; served ${result.requests.served.length}, blocked ${result.requests.blocked.length}`);
}
