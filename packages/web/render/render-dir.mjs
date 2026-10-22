// Renders every scene JSON in a directory through Lane D's dev clone (Browser Rendering + the production render
// entry) and writes <name>-<theme>.png. With a manifest.json in the directory (T03 fixtures), its fixtures,
// sizes and states are used; otherwise each *.json is one scene rendered at its own size and end time.
//   node render/render-dir.mjs <dir> --out <dir> [--theme light|dark|both] [--url https://...] [--batch 6]
//   node render/render-dir.mjs <dir> --out <dir> --local [--dist dist-render]   (same entry and renderStates, local headless Chromium)
// The bearer token is read from C:/s/toc-explain-d/render-token (never printed). Browser time is appended to
// C:/s/toc-explain-d/browser-ms.log for the spend ledger.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_URL = 'https://rabbit-hole-web-dev-explain-d.tryrabbithole.workers.dev';
const TOKEN_FILE = 'C:/s/toc-explain-d/render-token';

const sceneOf = raw => raw.block?.scene || (raw.scene && Array.isArray(raw.scene.objects) ? raw.scene : raw);

// Items to render: [{ name, scene, entries: [{ id, theme, time, inputs }] }], output names per capture id.
export function planItems(dir, themes) {
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return manifest.fixtures.map(f => {
      const scene = sceneOf(JSON.parse(readFileSync(join(dir, f.file), 'utf8')));
      const states = f.states?.length ? f.states : [{}];
      const entries = states.flatMap((s, i) => themes.map(theme => ({
        id: `${f.name}${states.length > 1 ? `-s${i}` : ''}-${theme}`, theme, ...(s.time !== undefined ? { time: s.time } : {}), inputs: s.inputs || {},
        ...(f.width ? { width: f.width, height: f.height } : {}),
      })));
      return { name: f.name, scene, entries };
    });
  }
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(file => {
    const name = basename(file, '.json');
    return { name, scene: sceneOf(JSON.parse(readFileSync(join(dir, file), 'utf8'))), entries: themes.map(theme => ({ id: `${name}-${theme}`, theme })) };
  });
}

export async function renderItems(items, { url = DEFAULT_URL, token = readFileSync(TOKEN_FILE, 'utf8').trim(), batch = 6, fetcher = fetch } = {}) {
  const results = [];
  let browserMs = 0;
  for (let i = 0; i < items.length; i += batch) {
    const response = await fetcher(`${url}/__explain/render`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ items: items.slice(i, i + batch) }) });
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok) throw new Error(`render service: ${body.error || response.status}`);
    browserMs += body.browserMs || 0;
    results.push(...body.items);
  }
  return { results, browserMs };
}

// Local path: the same items through viz-benchmark-capture.mjs captureScene (renderStates over the local build).
export async function renderLocal(items, dist) {
  const { captureScene } = await import('../e2e/viz-benchmark-capture.mjs');
  const results = [];
  let browserMs = 0;
  for (const item of items) {
    try {
      const out = await captureScene(item.scene, item.entries, { dist });
      browserMs += out.browserMs || 0;
      results.push({ name: item.name, ok: true, blocked: out.requests.blocked, captures: out.captures.map(c => ({ id: c.id, aliases: c.aliases, png: Buffer.from(c.png).toString('base64') })) });
    } catch (error) { results.push({ name: item.name, ok: false, code: error.code || null, error: String(error.message).slice(0, 500) }); }
  }
  return { results, browserMs };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
  const local = args.includes('--local') && args.splice(args.indexOf('--local'), 1);
  const dist = flag('--dist');
  const out = flag('--out'), theme = flag('--theme', 'both'), url = flag('--url', DEFAULT_URL), batch = Number(flag('--batch', 6));
  const [dir] = args;
  if (!dir || !out) { console.error('usage: node render/render-dir.mjs <dir> --out <dir> [--theme light|dark|both] [--url ...]'); process.exit(1); }
  const themes = theme === 'both' ? ['light', 'dark'] : [theme];
  mkdirSync(out, { recursive: true });
  const { results, browserMs } = local ? await renderLocal(planItems(dir, themes), dist) : await renderItems(planItems(dir, themes), { url, batch });
  let failed = 0;
  for (const item of results) {
    if (!item.ok) { failed++; console.log(`FAIL ${item.name}: ${item.code || ''} ${item.error}`); continue; }
    for (const c of item.captures) for (const id of [c.id, ...(c.aliases || [])]) writeFileSync(join(out, `${id}.png`), Buffer.from(c.png, 'base64'));
    console.log(`ok ${item.name}: ${item.captures.map(c => c.id).join(', ')}${item.blocked?.length ? ` (blocked ${item.blocked.length} requests)` : ''}`);
  }
  if (!local) appendFileSync('C:/s/toc-explain-d/browser-ms.log', `${new Date().toISOString()} ${dir} items=${results.length} browserMs=${browserMs}\n`);
  console.log(`${results.length - failed}/${results.length} rendered, browser ${(browserMs / 1000).toFixed(1)} s`);
  if (failed) process.exit(1);
}
