// Gated main -> the stable dev testing URL (docs/features/dev-auto-deploy.md).
//   node scripts/dev-deploy.mjs --sha <main commit> --gate <gate record>
// Deploys that exact commit to the dev clone only when the gate record passed for its exact tree, the commit is on
// origin/main and it descends from what the clone serves now (an older run never overwrites a newer deployment).
// The Worker's deployment message ("main <sha> build <hash>") is the deploy record; a failed smoke rolls back to the
// previous version. Each deploy appends one JSON line to <git common dir>/rabbit-hole-dev-deploys.jsonl, the green dev
// record prod-release.mjs prepare reads. Never runs a migration, never deploys production, never prints a secret.
// With Cloudflare Access in front of the clone, the smoke signs in with the Access service token in
// ACCESS_SMOKE_CLIENT_ID / ACCESS_SMOKE_CLIENT_SECRET (dev-access.js maps it to a synthetic dev user).
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (rabbit-hole) and RABBIT_HOLE_DEV_TEST_BYPASS + VITE_TLDRAW_LICENSE_KEY
// in the environment (or TLDRAW_LICENSE_KEY / RABBIT_HOLE_DEV_TEST_BYPASS in the repo-root .env, read by key).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const WORKER = 'rabbit-hole-web-dev-small-parallel';
export const URL_BASE = `https://${WORKER}.tryrabbithole.workers.dev`;
const ACCOUNT = 'c08d3dbdc53a3afd3cb09a536ac42318';
const LEARN_DEV_DB = '028f800f-ce8e-4461-adb2-827f417492eb';
const CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const UA = { 'User-Agent': 'rabbit-hole-dev-deploy' };

// The gate record is the integration gate's output: line 1 names the gated index tree, every stage prints
// "<stage> exit <code>" (a crashed stage reruns once and prints again: the last line per stage counts), every
// provider-tripwire count is 0, and the run ends with a -DONE line.
export function gateVerdict(text, tree) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = lines.find(l => l.startsWith('tree HEAD ')); // stderr noise may come before it
  if (!head || !new RegExp(`\\bindex ${tree}\\b`).test(head)) return `the gate record is not for tree ${tree.slice(0, 8)}`;
  if (!/-DONE$/.test(lines.at(-1))) return 'the gate record has no -DONE line (gate unfinished)';
  const last = new Map();
  for (const l of lines) { const m = l.match(/^([^:]+?) exit (\d+)\b/); if (m) last.set(m[1], Number(m[2])); }
  if (last.get('make test-unit') !== 0) return 'make test-unit did not exit 0';
  const failed = [...last].filter(([, code]) => code !== 0).map(([stage]) => stage);
  if (failed.length) return `failed stages: ${failed.join(', ')}`;
  const hits = lines.flatMap(l => [...l.matchAll(/(?:tripwire hits|model key bindings in app log): (\S+)/g)].map(m => m[1]));
  if (hits.some(h => h !== '0')) return `provider tripwire or model key count not 0: ${hits.join(',')}`;
  return null;
}

// "main <sha> build <hash>" (or the "rollback to main <sha>" a rollback writes) -> the sha it serves.
export const deployedSha = message => message?.match(/\bmain ([0-9a-f]{7,40})\b/)?.[1] ?? null;

// The tables the repository's learn-migrations create. SQL comments are dropped first: 0006 mentions
// "CREATE TABLE IF NOT EXISTS adds no columns" in prose, which is not a table.
export const learnTables = repo => {
  const dir = join(repo, 'packages/control-plane/learn-migrations');
  return readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .flatMap(f => [...readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, '').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map(m => m[1]));
};

// The built page's module entry (Vite emits it as /static/app-<hash>.js): the served page names it once the new build is live.
export const entryScript = html => html.match(/<script[^>]*type="module"[^>]*src="([^"]+\.js)"/)?.[1] ?? null;

// deploy | noop | refuse
export function decide({ candidate, deployed, deployedIsAncestor }) {
  if (deployed && candidate.startsWith(deployed)) return { action: 'noop', why: `${deployed.slice(0, 8)} is already deployed` };
  if (deployed && !deployedIsAncestor) return { action: 'refuse', why: `the clone serves ${deployed.slice(0, 8)}, which is not an ancestor of ${candidate.slice(0, 8)} (an older run never overwrites a newer deployment)` };
  return { action: 'deploy', why: deployed ? `${candidate.slice(0, 8)} descends from deployed ${deployed.slice(0, 8)}` : 'no recorded deployment' };
}

const root = fileURLToPath(new URL('..', import.meta.url));
const web = join(root, 'packages/web');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const isAncestor = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: root }); return true; } catch { return false; } };
const fromEnvFile = key => { try { return readFileSync(join(root, '.env'), 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, ''); } catch { return undefined; } };
const wrangler = (args, extra = {}) => execFileSync('npx', ['wrangler', ...args], { cwd: web, encoding: 'utf8', shell: true, env: { ...process.env, CI: 'true', ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
const say = line => console.log(line);
const stop = line => { console.error(`✗ ${line}`); process.exit(1); };

// What the clone serves, from its deployment history (oldest first): the version to roll back to is the current one;
// the sha is the last code upload's message. A secret change (an Access setting) deploys the same code under no
// message, so it is skipped; a code upload without a "main <sha>" message is unrecorded and stops the pipeline.
export function servedRecord(list) {
  const current = list.at(-1);
  if (!current) return {};
  const upload = [...list].reverse().find(d => d.annotations?.['workers/triggered_by'] !== 'secret');
  const message = upload?.annotations?.['workers/message'];
  return { message, version: current.versions?.[0]?.version_id, unrecorded: !!upload && !deployedSha(message) };
}
const latestDeployment = () => servedRecord(JSON.parse(wrangler(['deployments', 'list', '--name', WORKER, '--json'])));

function buildHash(dir) {
  const files = (function walk(d) { return readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]); })(dir).sort();
  const h = createHash('sha256');
  for (const f of files) h.update(relative(dir, f).replace(/\\/g, '/')).update('\0').update(readFileSync(f));
  return h.digest('hex').slice(0, 12);
}

async function smoke(entry) {
  const results = [];
  const id = process.env.ACCESS_SMOKE_CLIENT_ID, idSecret = process.env.ACCESS_SMOKE_CLIENT_SECRET;
  const token = id && idSecret ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': idSecret } : {};
  const get = (p, init = {}) => fetch(`${URL_BASE}${p}`, { redirect: 'manual', ...init, headers: { ...UA, ...token, ...init.headers } });
  // Rollout lag: the new version serves some seconds after deploy returns; wait for this build's entry script.
  let served = false;
  for (let i = 0; i < 24 && !served; i++) { served = (await (await get('/library')).text()).includes(entry); if (!served) await new Promise(r => setTimeout(r, 5000)); }
  results.push([served ? 'pass' : 'fail', `the clone serves this build (${entry})`]);
  for (const p of ['/', '/library']) { const s = (await get(p)).status; results.push([s === 200 ? 'pass' : 'fail', `GET ${p} ${s}`]); }
  const barrier = [];
  for (const [m, p] of [['POST', '/login'], ['GET', '/auth'], ['POST', '/logout'], ['POST', '/test/session']]) barrier.push((await get(p, { method: m })).status);
  results.push([barrier.every(c => c === 403) ? 'pass' : 'fail', `dev barrier refuses sign-in routes ${barrier.join(',')}`]);
  // Access protection: without credentials Access (or, before it, the dev worker) turns the request away.
  const anon = await fetch(`${URL_BASE}/api/apps`, { redirect: 'manual', headers: UA });
  const away = anon.status === 401 || anon.status === 403 || (anon.status === 302 && /cloudflareaccess\.com/.test(anon.headers.get('location') || ''));
  results.push([away ? 'pass' : 'fail', `/api/apps without credentials ${anon.status}`]);
  // Signed-in flows need the Learn schema; a table the repository's learn-migrations create but the dev database lacks
  // is a migration blocker (reported, never applied here), not a regression.
  const wanted = learnTables(root);
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${LEARN_DEV_DB}/query`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table'" }) });
  const have = new Set((await r.json()).result?.[0]?.results?.map(t => t.name) ?? []);
  const missing = wanted.filter(t => !have.has(t));
  // Behind Access the bridge mints the session from the service token; before Access, the dev control plane does.
  let cookie = {};
  if (!token['CF-Access-Client-Id']) {
    const secret = process.env.RABBIT_HOLE_DEV_TEST_BYPASS || fromEnvFile('RABBIT_HOLE_DEV_TEST_BYPASS');
    const minted = await fetch(`${CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev-deploy-smoke@example.test', secret }) });
    cookie = minted.ok ? { Cookie: `small_session=${(await minted.json()).session}` } : null;
  }
  for (const p of ['/api/apps', '/api/profile']) {
    const s = cookie ? (await get(p, { headers: cookie })).status : 'no session';
    results.push([s === 200 ? 'pass' : missing.length ? 'blocked' : 'fail', `signed-in ${p} ${s}${s !== 200 && missing.length ? ` (schema: dev Learn DB lacks ${missing.join(', ')})` : ''}`]);
  }
  return results;
}

async function main() {
  const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT) stop('CLOUDFLARE_ACCOUNT_ID must be the rabbit-hole account');
  const sha = git('rev-parse', `${arg('sha') ?? stop('--sha <main commit> is required')}^{commit}`);
  const tree = git('rev-parse', `${sha}^{tree}`);
  git('fetch', '-q', 'origin', 'main');
  if (!isAncestor(sha, 'origin/main')) stop(`${sha.slice(0, 8)} is not on origin/main`);
  if (git('rev-parse', 'HEAD') !== sha) stop(`this checkout is not at ${sha.slice(0, 8)}; deploy builds the exact commit`);
  if (git('status', '--porcelain', '--untracked-files=no') || git('ls-files', '--others', '--exclude-standard', 'packages/web/src', 'packages/web/public', 'packages/web/index.html')) stop('this checkout has local changes under the build');
  const verdict = gateVerdict(readFileSync(arg('gate') ?? stop('--gate <gate record> is required'), 'utf8'), tree);
  if (verdict) stop(`gate: ${verdict} - the last passing deployment stays`);
  say(`✓ gate passed for ${sha.slice(0, 8)} (tree ${tree.slice(0, 8)})`);

  const lock = join(tmpdir(), `${WORKER}.deploy.lock`);
  try { mkdirSync(lock); } catch { stop(`another deploy holds ${lock} (remove it only if no deploy is running)`); }
  try {
    const before = latestDeployment();
    const check = d => { if (d.unrecorded) stop(`the clone serves an unrecorded upload (${d.message ?? 'no message'}); redeploy a gated commit by hand`); const deployed = deployedSha(d.message); return decide({ candidate: sha, deployed: deployed && git('rev-parse', deployed), deployedIsAncestor: deployed ? isAncestor(deployed, sha) : true }); };
    let plan = check(before);
    say(`${plan.action === 'deploy' ? '✓' : '!'} ${plan.action}: ${plan.why}`);
    if (plan.action !== 'deploy') { process.exitCode = plan.action === 'noop' ? 0 : 1; return; }

    const tldraw = process.env.VITE_TLDRAW_LICENSE_KEY || fromEnvFile('TLDRAW_LICENSE_KEY');
    if (!tldraw) stop('VITE_TLDRAW_LICENSE_KEY (or TLDRAW_LICENSE_KEY in the repo-root .env) is missing');
    // The documented dev build (docs/features/rabbit-hole-dev.md): flags set before the build or Learn silently vanishes.
    execFileSync('npx', ['vite', 'build', '--outDir', 'dist-dev'], { cwd: web, shell: true, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, VITE_COACHING_DEV: 'true', VITE_BYOC_DEV: 'true', VITE_NOTEBOOK_ORIGIN: 'https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev', VITE_TLDRAW_LICENSE_KEY: tldraw } });
    const build = buildHash(join(web, 'dist-dev'));
    const entry = entryScript(readFileSync(join(web, 'dist-dev/index.html'), 'utf8'));
    if (!entry) stop('dist-dev/index.html has no module entry script; nothing deployed');
    say(`✓ built dist-dev ${build}`);

    plan = check(latestDeployment()); // again: another machine may have deployed during the build
    if (plan.action !== 'deploy') { say(`! ${plan.action}: ${plan.why}`); process.exitCode = plan.action === 'noop' ? 0 : 1; return; }
    // The Access entrypoint (dev-access-worker.js): the dev worker with the Access sign-in bridge in front.
    const out = wrangler(['deploy', 'dev-access-worker.js', '--config', 'wrangler.dev.jsonc', '--name', WORKER, '--message', `"main ${sha} build ${build}"`]);
    const version = out.match(/Current Version ID: (\S+)/)?.[1];
    say(`✓ deployed ${sha.slice(0, 8)} build ${build} as version ${version} to ${URL_BASE}`);

    const results = await smoke(entry);
    for (const [state, line] of results) say(`${state === 'pass' ? '✓' : state === 'blocked' ? '!' : '✗'} ${state === 'blocked' ? 'blocked: ' : ''}${line}`);
    const verdict = results.some(([state]) => state === 'fail') ? 'fail' : results.some(([state]) => state === 'blocked') ? 'blocked' : 'pass';
    appendFileSync(join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'rabbit-hole-dev-deploys.jsonl'), `${JSON.stringify({ sha, gates: 'pass', smoke: verdict, worker: WORKER, version, at: new Date().toISOString() })}
`);
    if (verdict === 'fail') {
      if (before.version) {
        wrangler(['rollback', before.version, '--name', WORKER, '-y', '-m', `"rollback to main ${deployedSha(before.message)}: smoke failed for ${sha.slice(0, 8)}"`]);
        say(`✗ smoke failed: rolled back to version ${before.version} (${before.message})`);
      } else say('✗ smoke failed and there is no earlier version to roll back to');
      process.exitCode = 1;
    }
  } finally { rmSync(lock, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
