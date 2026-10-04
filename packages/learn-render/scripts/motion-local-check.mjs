// M1 proof 11: the existing video pipeline accepts and plays a Motion render, on a LOCAL
// stack only (no deploy, no remote D1/R2). No Motion provider exists before M7, so a local
// HTTPS stand-in for the render service speaks the contract the spec names for it (the
// math worker's: GET /health, POST /jobs, GET /jobs/<key>, GET /jobs/<key>/asset) and
// returns the final MP4. The real LearnVideos Durable Object then stores it in LEARN_MEDIA
// (local R2) and the canvas video block plays it through GET /api/learn/video.
//
//   node scripts/motion-local-check.mjs setup                 renamed configs, certs and .dev.vars in .small/motion-local
//   (run the wrangler commands setup prints, from the repo root)
//   node scripts/motion-local-check.mjs run <final.mp4> [shotsDir]
//
// Worker names are motion-local-app / motion-local-cp / motion-local-cp-sessions: wrangler's
// machine-wide dev registry is keyed by name, so a shared name would collide with other stacks.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:https';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = join(ROOT, '.small', 'motion-local');
const APP = 'http://127.0.0.1:8858', CP = 'http://127.0.0.1:8859', STANDIN_PORT = 8857;
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
  const app = { ...web, name: 'motion-local-app', main: abs('packages/web/dev-worker.js'), assets: { ...web.assets, directory: abs('packages/web/dist-dev') },
    services: [{ binding: 'CONTROL_PLANE', service: 'motion-local-cp' }], vars: { ...web.vars, SCENE_WORKER_URL: 'https://localhost:9/' } };
  const plane = name => ({ ...cp, name, main: abs('packages/control-plane/src/index.js'), assets: { ...cp.assets, directory: abs('packages/web/dist-dev') },
    d1_databases: cp.d1_databases.map(d => ({ ...d, migrations_dir: abs(d.binding === 'LEARN_DB' ? 'packages/control-plane/learn-migrations' : 'packages/control-plane/migrations') })) });
  const secret = () => randomBytes(24).toString('hex');
  const cpVars = `SMALL_ENV=test\nMASTER_KEY=${secret()}\nTEST_BYPASS_SECRET=${secret()}\nOAUTH_MOCK=true\n`;
  const files = {
    'app/wrangler.jsonc': JSON.stringify(app, null, 2),
    'app/.dev.vars': `MATH_WORKER_URL=https://localhost:${STANDIN_PORT}\nMATH_WORKER_TOKEN=${secret()}\n`,
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
  (cd packages/web && npx vite build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npx vite build --outDir dist-dev)
  NODE_EXTRA_CA_CERTS=.small/motion-local/certs/ca.pem npx wrangler dev -c .small/motion-local/app/wrangler.jsonc -c .small/motion-local/cp/wrangler.jsonc --persist-to .small/motion-local/state --port 8858 --inspector-port 9299
  npx wrangler dev -c .small/motion-local/sessions/wrangler.jsonc --persist-to .small/motion-local/state --port 8859 --inspector-port 9300`);
  process.exit(0);
}

if (cmd === 'run') {
  const mp4 = resolve(args[0]), shots = resolve(args[1] || join(DIR, 'shots'));
  mkdirSync(shots, { recursive: true });
  const env = name => Object.fromEntries(readFileSync(join(DIR, name, '.dev.vars'), 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));
  const token = env('app').MATH_WORKER_TOKEN, bytes = readFileSync(mp4);
  const calls = [];
  const jobs = new Map();
  // The stand-in render service: bearer auth on every request, like the math worker.
  const standin = createServer({ key: readFileSync(join(DIR, 'certs', 'leaf.key')), cert: readFileSync(join(DIR, 'certs', 'leaf.pem')) }, async (req, res) => {
    const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    calls.push(`${req.method} ${req.url}`);
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    if (req.url === '/health') return send(200, { ok: true, version: 'motion-local-standin' });
    if (req.method === 'POST' && req.url === '/jobs') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const { key } = JSON.parse(raw);
      jobs.set(key, 'ready');
      return send(202, { key, status: 'ready' });
    }
    const m = req.url.match(/^\/jobs\/([a-f0-9]{64})(\/asset)?$/);
    if (!m || !jobs.has(m[1])) return send(404, { error: 'Job not found' });
    return m[2] ? send(200, bytes, 'video/mp4') : send(200, { status: 'ready' });
  }).listen(STANDIN_PORT, '127.0.0.1');

  const { chromium } = await import('@playwright/test');
  const secret = env('cp').TEST_BYPASS_SECRET;
  const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'motion-local@example.test', secret }) })).json();
  if (!session) throw new Error('no local session: is the sessions worker on 8859 running?');
  const canvas = await (await fetch(`${APP}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Motion M1 local check' }) })).json();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: APP }]);
  const page = await context.newPage();
  const asset = [];
  page.on('response', r => { if (r.url().includes('/api/learn/video?') && r.url().includes('asset=')) asset.push(`${r.status()} ${r.headers()['content-type']} ${r.headers()['content-range'] || ''}`.trim()); });
  await page.goto(`${APP}/apps/${canvas.name}`);
  await page.getByRole('button', { name: 'Insert lesson block' }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Insert lesson block' }).click();
  await page.getByRole('menu', { name: 'Lesson blocks' }).getByRole('menuitem', { name: /^Maths animation/ }).click();
  const found = page.locator('[data-block-id]').filter({ has: page.locator('[data-generate-video]') }).last();
  await found.waitFor({ timeout: 15000 });
  const card = page.locator(`[data-block-id="${await found.getAttribute('data-block-id')}"]`);
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
  const result = { canvas: canvas.name, seconds_to_ready: Math.round((Date.now() - t0) / 1000), video, asset_responses: asset, standin_calls: calls, mp4_bytes: statSync(mp4).size, shots };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync(join(shots, 'result.json'), JSON.stringify(result, null, 2));
  await browser.close();
  standin.close();
  process.exit(video.duration > 14.9 && video.width === 1920 ? 0 : 1);
}

console.error('usage: node scripts/motion-local-check.mjs setup | run <final.mp4> [shotsDir]');
process.exit(2);
