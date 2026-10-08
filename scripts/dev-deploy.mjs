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
import { execFileSync, execSync } from 'node:child_process';
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

// Which main commit the clone serves. deployments: newest first, [{ versions: [version id] }]; versions: id ->
// { message, trigger }, the version's own annotations. A version names its commit in its upload message
// ("main <sha> build <hash>"), and a rollback serves that same version again, so deployment messages are not needed.
// A version made by a secret change (an Access setting) carries the code that served when it was made: it resolves
// through the deployment before the one that introduced it. Anything else (a split rollout, an upload without the
// message) is unknown: null, and the pipeline stops rather than guess.
export function servedSha(deployments, versions) {
  const at = (i, depth) => {
    const d = deployments[i];
    if (!d || d.versions.length !== 1 || depth > deployments.length) return null;
    const id = d.versions[0], v = versions[id];
    const sha = deployedSha(v?.message);
    if (sha || v?.trigger !== 'secret') return sha;
    return at(deployments.findLastIndex(x => x.versions.length === 1 && x.versions[0] === id) + 1, depth + 1);
  };
  return at(0, 0);
}

// Owner policy A (2026-10-08): a main commit whose changes since a fully gated main commit are only docs or the
// deploy and release scripts reuses that commit's app gate. App source, dependencies, build inputs, runtime config
// and schema need a gate of their own. Markdown under packages/ is not here: lesson Markdown ships in the bundle.
const REUSABLE = [/^docs\//, /^[^/]+\.md$/, /^scripts\/(dev-deploy|prod-release)(\.test)?\.mjs$/];
export const notReusable = changed => changed.filter(p => !REUSABLE.some(r => r.test(p)));

// deploy | noop | refuse
export function decide({ candidate, deployed, deployedIsAncestor, hasDeployments }) {
  // Forward-only needs to know what serves now; an unknown commit could be newer than the candidate.
  if (hasDeployments && !deployed) return { action: 'refuse', why: 'the clone serves a version whose main commit is unknown (an upload without its "main <sha>" message); redeploy a gated commit by hand' };
  if (deployed && candidate.startsWith(deployed)) return { action: 'noop', why: `${deployed.slice(0, 8)} is already deployed` };
  if (deployed && !deployedIsAncestor) return { action: 'refuse', why: `the clone serves ${deployed.slice(0, 8)}, which is not an ancestor of ${candidate.slice(0, 8)} (an older run never overwrites a newer deployment)` };
  return { action: 'deploy', why: deployed ? `${candidate.slice(0, 8)} descends from deployed ${deployed.slice(0, 8)}` : 'no recorded deployment' };
}

const root = fileURLToPath(new URL('..', import.meta.url));
const web = join(root, 'packages/web');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const isAncestor = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: root }); return true; } catch { return false; } };
const fromEnvFile = key => { try { return readFileSync(join(root, '.env'), 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, ''); } catch { return undefined; } };
// The lockfile's own tools from the workspace root node_modules (npm ci below), run by node with no shell: never
// whatever version npx would fetch.
const tool = (pkg, file) => join(root, 'node_modules', pkg, file);
const wrangler = (args, extra = {}) => execFileSync(process.execPath, [tool('wrangler', 'bin/wrangler.js'), ...args], { cwd: web, encoding: 'utf8', env: { ...process.env, CI: 'true', ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
const say = line => console.log(line);
// Throws, so the lock's finally still runs; the entry point prints it and exits 1.
class Stop extends Error {}
const stop = line => { throw new Stop(line); };

const script = async path => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${WORKER}${path}`, { headers: { ...UA, Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } });
  const j = await r.json().catch(() => ({}));
  if (!j.success) stop(`Cloudflare ${path}: ${r.status} ${JSON.stringify(j.errors ?? [])}`);
  return j.result;
};

// What the clone serves now: the version to roll back to and, through the version chain, its main commit.
async function serving() {
  const deployments = (await script('/deployments')).deployments.map(d => ({ versions: d.versions.map(v => v.version_id) }));
  const versions = {};
  for (const id of new Set(deployments.flatMap(d => d.versions))) {
    const v = await script(`/versions/${id}`);
    versions[id] = { message: v.annotations?.['workers/message'], trigger: v.annotations?.['workers/triggered_by'] };
  }
  return { sha: servedSha(deployments, versions), version: deployments[0]?.versions[0], any: deployments.length > 0 };
}

// "main <sha> build <pages hash>[ bundle <Worker hash>]", the upload message -> its parts.
export function parseUpload(message) {
  const m = message?.match(/^main ([0-9a-f]{40}) build ([0-9a-f]+)(?: bundle ([0-9a-f]+))?$/);
  return m ? { sha: m[1], build: m[2], bundle: m[3] ?? null } : null;
}

// What a commit was deployed with - the page build and (from 2026-10-08) the Worker bundle: its line in the dev record,
// else its version's upload message.
async function recordedIdentity(sha, recordPath) {
  let text = '';
  try { text = readFileSync(recordPath, 'utf8'); } catch {}
  const line = text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).findLast(r => r?.sha === sha && r.build);
  if (line) return { build: line.build, bundle: line.bundle ?? null };
  for (const v of (await script('/versions')).items ?? []) {
    const u = parseUpload(v.annotations?.['workers/message']);
    if (u?.sha === sha) return u;
  }
  return null;
}

// The packaged Worker's identity, separate from the pages: wrangler's own bundle of the entrypoint (the code and every
// module it uploads, dist/index.html among them), without source maps. Deterministic: two bundles of 4393d912 hashed
// the same on 2026-10-08, and the bundle holds no absolute local path.
function bundleHash() {
  const out = join(tmpdir(), `${WORKER}.bundle`);
  rmSync(out, { recursive: true, force: true });
  wrangler(['deploy', 'dev-access-worker.js', '--config', 'wrangler.dev.jsonc', '--name', WORKER, '--dry-run', '--outdir', out]);
  const h = createHash('sha256');
  for (const f of readdirSync(out).filter(f => !f.endsWith('.map') && f !== 'README.md').sort()) h.update(f).update('\0').update(readFileSync(join(out, f)));
  rmSync(out, { recursive: true, force: true });
  return h.digest('hex').slice(0, 12);
}

// The pages' identity: every file of dist-dev.
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
  git('fetch', '-q', 'origin', 'main');
  if (!isAncestor(sha, 'origin/main')) stop(`${sha.slice(0, 8)} is not on origin/main`);
  if (git('rev-parse', 'HEAD') !== sha) stop(`this checkout is not at ${sha.slice(0, 8)}; deploy builds the exact commit`);
  // Content, not stat: npm ci rewrites a bin's line endings (packages/cli/bin/small.js), which git status reports
  // though the normalized content is unchanged.
  if (git('diff', '--name-only', 'HEAD') || git('ls-files', '--others', '--exclude-standard', 'packages/web/src', 'packages/web/public', 'packages/web/index.html')) stop('this checkout has local changes under the build');
  const record = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'rabbit-hole-dev-deploys.jsonl');

  // The gate record is the candidate's own, or (policy A, --reuse) that of the gated main commit it builds on.
  const reuse = arg('reuse') && git('rev-parse', `${arg('reuse')}^{commit}`);
  const gated = reuse || sha, tree = git('rev-parse', `${gated}^{tree}`);
  const verdict = gateVerdict(readFileSync(arg('gate') ?? stop('--gate <gate record> is required'), 'utf8'), tree);
  if (verdict) stop(`gate: ${verdict} - the last passing deployment stays`);
  say(`✓ gate passed for ${gated.slice(0, 8)} (tree ${tree.slice(0, 8)})`);
  let gatedId = null;
  if (reuse) {
    if (reuse === sha) stop('--reuse names the candidate itself; deploy it without --reuse');
    if (!isAncestor(reuse, sha)) stop(`the gated ${reuse.slice(0, 8)} is not an ancestor of ${sha.slice(0, 8)}`);
    const changed = git('diff', '--name-only', reuse, sha).split('\n').filter(Boolean);
    const outside = notReusable(changed);
    if (outside.length) stop(`policy A: ${outside.join(', ')} changed since the gated ${reuse.slice(0, 8)}; this commit needs its own full gate`);
    // The focused checks, on this exact tree: failed-gate rejection, exact sha, stale runs, environment targeting.
    try { execFileSync(process.execPath, ['--test', 'scripts/dev-deploy.test.mjs', 'scripts/prod-release.test.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] }); }
    catch { stop('policy A: the focused deploy and release tests failed'); }
    // The page build, and the Worker bundle where the gated deploy recorded one, must be byte-identical to the gated
    // ones: proof that no build input changed.
    gatedId = await recordedIdentity(reuse, record);
    if (!gatedId) stop(`policy A: no recorded dev build for the gated ${reuse.slice(0, 8)} to compare this build with`);
    say(`✓ policy A: reusing the app gate of ${reuse.slice(0, 8)}; changed since: ${changed.join(', ')}; focused tests passed`);
  }

  const lock = join(tmpdir(), `${WORKER}.deploy.lock`);
  try { mkdirSync(lock); } catch { stop(`another deploy holds ${lock} (remove it only if no deploy is running)`); }
  try {
    const before = await serving();
    const check = d => decide({ candidate: sha, deployed: d.sha && git('rev-parse', d.sha), deployedIsAncestor: d.sha ? isAncestor(d.sha, sha) : true, hasDeployments: d.any });
    let plan = check(before);
    say(`${plan.action === 'deploy' ? '✓' : '!'} ${plan.action}: ${plan.why}`);
    if (plan.action !== 'deploy') { process.exitCode = plan.action === 'noop' ? 0 : 1; return; }

    const tldraw = process.env.VITE_TLDRAW_LICENSE_KEY || fromEnvFile('TLDRAW_LICENSE_KEY');
    if (!tldraw) stop('VITE_TLDRAW_LICENSE_KEY (or TLDRAW_LICENSE_KEY in the repo-root .env) is missing');
    // Everything the Worker bundles comes from this commit: the dependencies exactly as its lockfile pins them, and both
    // page builds. dist-dev is what the dev worker serves; dist/index.html is bundled too, through the control plane's
    // own shell import (control-plane/src/index.js), so a leftover dist from another commit must never ship.
    execSync('npm ci --no-audit --no-fund', { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    // The documented dev build (docs/features/rabbit-hole-dev.md): flags set before the build or Learn silently vanishes.
    const buildEnv = { ...process.env, VITE_COACHING_DEV: 'true', VITE_BYOC_DEV: 'true', VITE_NOTEBOOK_ORIGIN: 'https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev', VITE_TLDRAW_LICENSE_KEY: tldraw };
    for (const outDir of ['dist', 'dist-dev']) execFileSync(process.execPath, [tool('vite', 'bin/vite.js'), 'build', '--outDir', outDir], { cwd: web, stdio: ['ignore', 'ignore', 'inherit'], env: buildEnv });
    const build = buildHash(join(web, 'dist-dev'));
    const entry = entryScript(readFileSync(join(web, 'dist-dev/index.html'), 'utf8'));
    if (!entry) stop('dist-dev/index.html has no module entry script; nothing deployed');
    // The Worker also uploads dist/index.html (the control plane's shell import); built with the same env from the same
    // commit it equals dist-dev/index.html. The Worker bundle hash below covers it either way.
    if (!readFileSync(join(web, 'dist/index.html')).equals(readFileSync(join(web, 'dist-dev/index.html')))) stop('dist/index.html differs from dist-dev/index.html; nothing deployed');
    if (gatedId && build !== gatedId.build) stop(`policy A: the page build ${build} differs from the gated ${gatedId.build}, so a build input changed; a full gate is needed`);
    const bundle = bundleHash();
    if (gatedId?.bundle && bundle !== gatedId.bundle) stop(`policy A: the Worker bundle ${bundle} differs from the gated ${gatedId.bundle}; a full gate is needed`);
    say(`✓ built pages ${build}${gatedId ? ' (identical to the gated build)' : ''}, Worker bundle ${bundle}${gatedId?.bundle ? ' (identical to the gated bundle)' : gatedId ? ' (the gated deploy recorded no bundle)' : ''}`);

    plan = check(await serving()); // again: another machine may have deployed during the build
    if (plan.action !== 'deploy') { say(`! ${plan.action}: ${plan.why}`); process.exitCode = plan.action === 'noop' ? 0 : 1; return; }
    // The Access entrypoint (dev-access-worker.js): the dev worker with the Access sign-in bridge in front.
    const out = wrangler(['deploy', 'dev-access-worker.js', '--config', 'wrangler.dev.jsonc', '--name', WORKER, '--message', `main ${sha} build ${build} bundle ${bundle}`]);
    const version = out.match(/Current Version ID: (\S+)/)?.[1];
    say(`✓ deployed ${sha.slice(0, 8)} pages ${build} bundle ${bundle} as version ${version} to ${URL_BASE}`);

    const results = await smoke(entry);
    for (const [state, line] of results) say(`${state === 'pass' ? '✓' : state === 'blocked' ? '!' : '✗'} ${state === 'blocked' ? 'blocked: ' : ''}${line}`);
    const smokeVerdict = results.some(([state]) => state === 'fail') ? 'fail' : results.some(([state]) => state === 'blocked') ? 'blocked' : 'pass';
    // Reused gate evidence is recorded apart from a fresh gate: prod-release prepare accepts only gates "pass".
    const gates = reuse ? { gates: 'reused', app_gate_sha: reuse } : { gates: 'pass' };
    appendFileSync(record, `${JSON.stringify({ sha, ...gates, build, bundle, smoke: smokeVerdict, worker: WORKER, version, at: new Date().toISOString() })}\n`);
    if (smokeVerdict === 'fail') {
      if (before.version) {
        wrangler(['rollback', before.version, '--name', WORKER, '-y', '-m', `rollback to main ${before.sha}: smoke failed for ${sha.slice(0, 8)}`]);
        say(`✗ smoke failed: rolled back to version ${before.version} (main ${before.sha.slice(0, 8)})`);
      } else say('✗ smoke failed and there is no earlier version to roll back to');
      process.exitCode = 1;
    }
  } finally { rmSync(lock, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(e => { if (!(e instanceof Stop)) throw e; console.error(`✗ ${e.message}`); process.exitCode = 1; });
}
