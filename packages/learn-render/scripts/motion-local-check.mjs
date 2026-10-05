// M1 proof 11: the existing video pipeline accepts and plays a Motion render, on a LOCAL
// stack only (no deploy, no remote D1/R2). A local HTTPS stand-in speaks the Motion render
// service API (GET /render/<id>, GET /render/<id>/artifacts/final.mp4, bearer auth) and serves
// the given final MP4 under one fixed render id. The canvas gets a Motion video block built by
// motionVideoBlock (Demo A brief), seeded into the canvas state Learn already persists in this
// browser; the real LearnVideos Durable Object fetches the render through MotionProvider,
// stores it in LEARN_MEDIA (local R2) and the block plays it through GET /api/learn/video.
//
//   node scripts/motion-local-check.mjs setup                 renamed configs, certs and .dev.vars in .small/motion-local
//   (run the wrangler commands setup prints, from the repo root)
//   node scripts/motion-local-check.mjs run <final.mp4> [shotsDir]
//
// Worker names are motion-local-app / motion-local-cp / motion-local-cp-sessions: wrangler's
// machine-wide dev registry is keyed by name, so a shared name would collide with other stacks.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:https';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionVideoBlock } from '../motion/video-block.js';
import { canvasKeys } from '../../web/src/home/canvas-local.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = join(ROOT, '.small', 'motion-local');
const APP = 'http://127.0.0.1:8858', CP = 'http://127.0.0.1:8859', STANDIN_PORT = 8857, ORCHESTRATOR_PORT = 8856;
const abs = p => join(ROOT, p).replaceAll('\\', '/');
// Wrangler configs are JSONC: drop comments and trailing commas outside strings.
const jsonc = text => JSON.parse(text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, s) => s || '').replace(/,(\s*[}\]])/g, '$1'));
const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'setup') {
  mkdirSync(join(DIR, 'certs'), { recursive: true });
  const ssl = (...a) => { const r = spawnSync('openssl', a, { cwd: join(DIR, 'certs'), encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };
  writeFileSync(join(DIR, 'certs', 'leaf.ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\n');
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '7', '-subj', '/CN=motion-local-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign');
  ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'leaf.key', '-out', 'leaf.csr', '-subj', '/CN=localhost');
  ssl('x509', '-req', '-in', 'leaf.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'leaf.pem', '-days', '7', '-extfile', 'leaf.ext');

  const web = jsonc(readFileSync(join(ROOT, 'packages/web/wrangler.dev.jsonc'), 'utf8'));
  const cp = jsonc(readFileSync(join(ROOT, 'packages/control-plane/wrangler.rabbit-hole-dev.jsonc'), 'utf8'));
  for (const c of [web, cp]) delete c.account_id;
  // dist-dev (dev-worker.js imports its index.html): built with VITE_MOTION_DEV=true here for /motion (M7A).
  const app = { ...web, name: 'motion-local-app', main: abs('packages/web/dev-worker.js'), assets: { ...web.assets, directory: abs('packages/web/dist-dev') },
    services: [{ binding: 'CONTROL_PLANE', service: 'motion-local-cp' }], vars: { ...web.vars, SCENE_WORKER_URL: 'https://localhost:9/' } };
  const plane = name => ({ ...cp, name, main: abs('packages/control-plane/src/index.js'), assets: { ...cp.assets, directory: abs('packages/web/dist-dev') },
    d1_databases: cp.d1_databases.map(d => ({ ...d, migrations_dir: abs(d.binding === 'LEARN_DB' ? 'packages/control-plane/learn-migrations' : 'packages/control-plane/migrations') })) });
  const secret = () => randomBytes(24).toString('hex');
  const cpVars = `SMALL_ENV=test\nMASTER_KEY=${secret()}\nTEST_BYPASS_SECRET=${secret()}\nOAUTH_MOCK=true\n`;
  const files = {
    'app/wrangler.jsonc': JSON.stringify(app, null, 2),
    // M7A: the development orchestrator (scripts/motion-orchestrator.mjs) for /motion requests.
    'app/.dev.vars': `MOTION_RENDERER_URL=https://localhost:${STANDIN_PORT}\nMOTION_RENDERER_TOKEN=${secret()}\nMOTION_ORCHESTRATOR_URL=https://localhost:${ORCHESTRATOR_PORT}\nMOTION_ORCHESTRATOR_TOKEN=${secret()}\n`,
    'cp/wrangler.jsonc': JSON.stringify(plane('motion-local-cp'), null, 2), 'cp/.dev.vars': cpVars,
    'sessions/wrangler.jsonc': JSON.stringify(plane('motion-local-cp-sessions'), null, 2), 'sessions/.dev.vars': cpVars,
  };
  for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(DIR, f)), { recursive: true }); writeFileSync(join(DIR, f), text); }
  const c = '-c .small/motion-local/cp/wrangler.jsonc --persist-to .small/motion-local/state';
  console.log(`✓ ${DIR}: renamed configs, a local CA + localhost cert, fresh local secrets\nthen, from ${ROOT}:
  npx wrangler d1 execute rabbit-hole-dev --local ${c} --file packages/control-plane/bootstrap.sql
  npx wrangler d1 migrations apply rabbit-hole-dev --local ${c}
  npx wrangler d1 execute rabbit-hole-learn-dev --local ${c} --file packages/control-plane/repository-schema.sql
  npx wrangler d1 migrations apply rabbit-hole-learn-dev --local ${c}
  (cd packages/web && npx vite build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_MOTION_DEV=true npx vite build --outDir dist-dev)   (rebuild without VITE_MOTION_DEV before any dev deploy from this tree)
  node packages/learn-render/scripts/motion-orchestrator.mjs   (M7A /motion; --stub <final.mp4> for a run with no model call)
  NODE_EXTRA_CA_CERTS=.small/motion-local/certs/ca.pem npx wrangler dev -c .small/motion-local/app/wrangler.jsonc -c .small/motion-local/cp/wrangler.jsonc --persist-to .small/motion-local/state --port 8858 --inspector-port 9299
  npx wrangler dev -c .small/motion-local/sessions/wrangler.jsonc --persist-to .small/motion-local/state --port 8859 --inspector-port 9300`);
  process.exit(0);
}

if (cmd === 'run') {
  const mp4 = resolve(args[0]), shots = resolve(args[1] || join(DIR, 'shots'));
  mkdirSync(shots, { recursive: true });
  const env = name => Object.fromEntries(readFileSync(join(DIR, name, '.dev.vars'), 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));
  const token = env('app').MOTION_RENDERER_TOKEN, bytes = readFileSync(mp4);
  const brief = JSON.parse(readFileSync(join(ROOT, 'packages/learn-render/motion/fixtures/demo-a/brief.json'), 'utf8'));
  const RENDER_ID = '00000000000000000000000000000a01'; // the one render this stand-in holds
  const calls = [];
  // The stand-in render service: bearer auth on every request, GET only, one ready render.
  const standin = createServer({ key: readFileSync(join(DIR, 'certs', 'leaf.key')), cert: readFileSync(join(DIR, 'certs', 'leaf.pem')) }, (req, res) => {
    const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    calls.push(`${req.method} ${req.url}`);
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    if (req.method !== 'GET') return send(405, { error: 'GET only' });
    if (req.url === `/render/${RENDER_ID}`) return send(200, { render_id: RENDER_ID, status: 'ready', duration_seconds: brief.duration.seconds });
    if (req.url === `/render/${RENDER_ID}/artifacts/final.mp4`) return send(200, bytes, 'video/mp4');
    return send(404, { error: 'Render not found' });
  }).listen(STANDIN_PORT, '127.0.0.1');

  const { chromium } = await import('@playwright/test');
  const secret = env('cp').TEST_BYPASS_SECRET;
  const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'motion-local@example.test', secret }) })).json();
  if (!session) throw new Error('no local session: is the sessions worker on 8859 running?');
  const canvas = await (await fetch(`${APP}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Motion M1 local check' }) })).json();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: APP }]);
  // The Motion block goes into the canvas state Learn already keeps in this browser (canvasKeys
  // ink = AdaptiveCanvas storageKey), before the page loads: no insert-menu item, no demo page.
  const block = { ...motionVideoBlock({ brief, renderId: RENDER_ID, jobId: 'motion-local-check' }), id: randomUUID(), dx: 0, dy: 0 };
  const { ink } = canvasKeys({ org: canvas.org, email: canvas.email, slug: canvas.name });
  await context.addInitScript(([key, value]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, value); }, [ink, JSON.stringify({ blocks: [block] })]);
  const page = await context.newPage();
  const asset = [];
  page.on('response', r => { if (r.url().includes('/api/learn/video?') && r.url().includes('asset=')) asset.push(`${r.status()} ${r.headers()['content-type']} ${r.headers()['content-range'] || ''}`.trim()); });
  await page.goto(`${APP}/apps/${canvas.name}`);
  const card = page.locator(`[data-block-id="${block.id}"]`);
  await card.locator('[data-generate-video]').waitFor({ timeout: 60000 });
  const button = await card.locator('[data-generate-video]').innerText();
  await card.locator('[data-generate-video]').click();
  await card.locator('[data-paid-generate]').click(); // the existing confirmation gate; the stand-in charges nothing
  const t0 = Date.now();
  await card.locator('video[data-lesson-video]').waitFor({ timeout: 120000 });
  const video = await card.locator('video[data-lesson-video]').evaluate(node => new Promise(done => {
    const report = () => done({ duration: node.duration, width: node.videoWidth, height: node.videoHeight, src: node.getAttribute('src') });
    if (node.readyState >= 1) return report();
    node.addEventListener('loadedmetadata', report, { once: true });
  }));
  await card.locator('video[data-lesson-video]').evaluate(node => { node.currentTime = 9; return new Promise(r => node.addEventListener('seeked', r, { once: true })); });
  await page.waitForTimeout(800);
  await card.screenshot({ path: join(shots, 'video-block.png') });
  await page.screenshot({ path: join(shots, 'canvas.png') });
  const text = await card.innerText(), meta = await card.locator('[data-video-meta]').innerText();
  // The playing card is the Motion render's: its title and metadata, none of the maths sample's copy.
  const checks = {
    button: button.includes('Add the rendered video'),
    title: text.includes(brief.title),
    metadata: meta.includes(`${brief.duration.seconds}s · Motion explainer · Remotion`) && meta.includes('model.py:62–64'),
    no_maths_copy: !/manim|sigmoid/i.test(text),
    renderer_get_only: calls.every(call => call.startsWith('GET ')),
    duration: video.duration > brief.duration.seconds - 0.1,
    width: video.width === 1920,
  };
  const result = { canvas: canvas.name, render_id: RENDER_ID, checks, seconds_to_ready: Math.round((Date.now() - t0) / 1000), video, card_text: text, asset_responses: asset, standin_calls: calls, mp4_bytes: statSync(mp4).size, shots };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync(join(shots, 'result.json'), JSON.stringify(result, null, 2));
  await browser.close();
  standin.close();
  process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
}

console.error('usage: node scripts/motion-local-check.mjs setup | run <final.mp4> [shotsDir]');
process.exit(2);
