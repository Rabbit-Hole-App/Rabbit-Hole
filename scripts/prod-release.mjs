// Rabbit Hole production release job (docs/features/prod-release.md). Approved by hand, one exact commit at a time.
//   node scripts/prod-release.mjs prepare --sha <40-hex sha>
//   node scripts/prod-release.mjs release --sha <sha> --build <hash> --approve "RELEASE <sha> <hash>"
// prepare builds locally and makes no network call. release deploys rabbit-hole-cp, then rabbit-hole-app.
// It never applies a migration: a pending one is a blocker.
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, MASTER_SQL, expectedSchema, schemaDiff, schemaOf, mainMigrationDiff } from './schema-check.mjs';

// Production hold (owner, 2026-10-07; lifted by the owner in Home's session 2026-10-09). While true, `release` exits
// here before any remote call. Setting it again is a reviewed change to this line, never an environment variable or a flag.
export const HOLD = false;

export const ACCOUNT = 'c08d3dbdc53a3afd3cb09a536ac42318';
const CONFIG = 'wrangler.rabbit-hole-prod.jsonc';
export const SECRETS = {
  'rabbit-hole-cp': { required: ['MASTER_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'RESEND_API_KEY'] },
  'rabbit-hole-app': {
    required: ['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID', 'TYPESAFE_API_KEY', 'FISH_AUDIO_API_KEY', 'ELEVENLABS_API_KEY', 'SCENE_WORKER_TOKEN'],
    forbidden: ['RESEND_API_KEY', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_SECRET', 'MASTER_KEY'],
  },
};
// Dev-only sign-in: the test bypass, the mock OAuth and the dev Access bridge (dev-access.js) must never be configured here.
export const NEVER_ON_PRODUCTION = ['TEST_BYPASS_SECRET', 'SMALL_TEST_BYPASS', 'OAUTH_MOCK', 'DEV_TEST_BYPASS', 'ACCESS_AUD', 'ACCESS_TEAM_DOMAIN', 'ACCESS_ALLOWED_EMAILS', 'ACCESS_HOST', 'ACCESS_SMOKE_CLIENT_ID'];
// The production build (rabbit-hole-production.md): never the dev/review tools or BYOC.
export const BUILD_ENV = {
  VITE_RABBIT_HOLE: 'true',
  VITE_NOTEBOOK_ORIGIN: 'https://rabbit-hole-canvas-notebook.tryrabbithole.workers.dev',
  VITE_LESSON_NOTEBOOK_ORIGIN: 'https://rabbit-hole-notebook.tryrabbithole.workers.dev',
};
const DEV_ONLY_ENV = ['VITE_COACHING_DEV', 'VITE_BYOC_DEV'];

const SHA = /^[0-9a-f]{40}$/;

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command };
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) throw new Error(`bad argument ${rest[i]}`);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  return opts;
}

// A green dev deployment: a line in the dev-deploy record with this exact sha, gates and smoke both passed. Or (owner,
// 2026-10-09, option a) a reused gate: this sha's smoke passed, and its base G (app_gate_sha) has its own full-gate,
// smoke-passed line with the same page build and Worker bundle, and G is an ancestor of this sha. The byte-identical
// build is what makes G's gate cover what ships.
// Provenance (r34 audit): every line used must name the commit's own tree, its page build and Worker bundle, the gate
// record it passed on (gate_digest), the run that deployed it and the dev version it became.
const proven = (r, treeOf) => SHA.test(r.tree || '') && r.tree === treeOf(r.sha) && /^[0-9a-f]{16}$/.test(r.gate_digest || '')
  && r.build && r.bundle && r.version && r.run;
export function greenDevDeploy(sha, recordText, { isAncestor = () => false, treeOf = () => null } = {}) {
  const rows = recordText.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const full = s => rows.findLast(r => r.sha === s && r.gates === 'pass' && r.smoke === 'pass' && proven(r, treeOf)) || null;
  if (full(sha)) return full(sha);
  const reused = rows.findLast(r => r.sha === sha && r.gates === 'reused' && r.smoke === 'pass' && SHA.test(r.app_gate_sha || '') && proven(r, treeOf));
  const g = reused && full(reused.app_gate_sha);
  return g && reused.build === g.build && reused.bundle === g.bundle && isAncestor(g.sha, sha) ? reused : null;
}

const dirty = changes => `refused: the tracked tree has changes${changes ? `:\n${changes}` : ''}`;

export function checkPrepare({ sha, onMain, devRecord, head, clean, changes, isAncestor, treeOf }) {
  if (!SHA.test(sha || '')) return 'refused: --sha must be a full 40-character commit sha';
  if (!onMain) return `refused: ${sha} is not on origin/main (git fetch origin main first)`;
  if (!greenDevDeploy(sha, devRecord, { isAncestor, treeOf })) return `refused: no green dev deployment with provenance (tree, build, bundle, gate digest, run, version) is recorded for ${sha}`;
  if (head !== sha) return `refused: HEAD is ${head}, check out ${sha} first`;
  if (!clean) return dirty(changes);
  return null;
}

export function checkRelease({ hold, sha, build, approve, prepared, head, clean, changes }) {
  if (hold) return 'HOLD: production release is disabled. Lifting the hold is a reviewed change to HOLD in scripts/prod-release.mjs.';
  if (!SHA.test(sha || '')) return 'refused: --sha must be a full 40-character commit sha';
  if (!build) return 'refused: --build is required';
  if (approve !== `RELEASE ${sha} ${build}`) return `refused: --approve must be exactly "RELEASE ${sha} ${build}"`;
  if (!prepared) return `refused: ${sha} was never prepared (run prepare first)`;
  if (prepared.sha !== sha || prepared.build !== build) return `refused: the prepared build for ${sha} is ${prepared.build}, not ${build}`;
  if (head !== sha) return `refused: HEAD is ${head}, not ${sha}`;
  if (!clean) return dirty(changes);
  return null;
}

// The schema preflight (r34 audit): both databases must hold exactly the schema the repository builds - every table,
// index and column, not "the first table of each migration" - and the main D1's d1_migrations must name exactly the
// repository's migration files. Learn migrations are untracked by wrangler; schema identity is their identity
// (scripts/schema-check.mjs). -> blocker lines, [] when ready.
export function schemaBlockers({ mainFiles, mainApplied, mainLive, learnLive, expected }) {
  const out = [];
  for (const d of mainMigrationDiff(mainFiles, mainApplied)) out.push(`rabbit-hole-prod migrations: ${d}`);
  for (const d of schemaDiff(expected.main, mainLive)) out.push(`rabbit-hole-prod schema: ${d}`);
  for (const d of schemaDiff(expected.learn, learnLive)) out.push(`rabbit-hole-learn-prod schema: ${d}`);
  if (out.length) out.push('each migration needs the owner\'s GO; this job never applies one');
  return out;
}

// What production serves: the newest deployment of a Worker, one version at 100%, and the release it carries. A
// deployment made by a secret change keeps the code of the one before it, so the release is read from there.
// -> { version, sha12 } | { error }.
export function servedRelease(deployments) {
  const top = deployments[0];
  if (!top) return { error: 'no deployment' };
  if (top.versions.length !== 1 || top.versions[0].percentage !== 100) return { error: 'a split rollout' };
  for (const d of deployments) {
    const sha12 = d.annotations?.['workers/message']?.match(/\brelease ([0-9a-f]{12})\b/)?.[1];
    if (sha12) return { version: top.versions[0].version_id, sha12 };
    if (d.annotations?.['workers/triggered_by'] !== 'secret') break;
  }
  return { version: top.versions[0].version_id, sha12: null };
}

// Release only the newest main commit, only forward, and only over one consistent cp/app pair (r34 audit: a stale
// candidate, a re-run of an old workflow, never overwrites a newer release). -> null | { noop } | refusal string.
export function checkCandidate({ sha, mainTip, cp, app, isAncestor }) {
  if (sha !== mainTip) return `refused: ${sha.slice(0, 12)} is stale: origin/main is now ${mainTip.slice(0, 12)}, whose own run releases it`;
  for (const [name, s] of [['rabbit-hole-cp', cp], ['rabbit-hole-app', app]]) if (s.error) return `refused: ${name}: ${s.error}; restore one released version pair first`;
  if (cp.sha12 !== app.sha12) return `refused: production is split (rabbit-hole-cp serves ${cp.sha12 ?? 'an unnamed version'}, rabbit-hole-app ${app.sha12 ?? 'an unnamed version'}); restore one released pair first`;
  if (!cp.sha12) return 'refused: production serves a version no release named (a hand deploy?); this job cannot tell forward from backwards. Restore a released pair with wrangler rollback first';
  if (cp.sha12 && sha.startsWith(cp.sha12)) return { noop: `${sha.slice(0, 12)} is already released` };
  if (cp.sha12 && !isAncestor(cp.sha12, sha)) return `refused: production serves ${cp.sha12}, which is not an ancestor of ${sha.slice(0, 12)} (never release backwards)`;
  return null;
}

// The signed-out production smoke (docs/features/prod-release.md step 4). GET only, no session, no model call.
// The served page must name a module entry that exists in the build just deployed: the new version is the one serving.
export const SMOKE_ORIGIN = 'https://digrabbithole.com';
export async function smokeOnce(get, builtEntryExists) {
  const results = [];
  const home = await get('/');
  const entry = home.status === 200 ? home.body.match(/<script[^>]*type="module"[^>]*src="([^"]+\.js)"/)?.[1] : null;
  results.push({ check: 'GET / 200 and the new build\'s entry', ok: !!entry && builtEntryExists(entry), got: `${home.status} ${entry ?? 'no entry'}` });
  if (entry) { const s = (await get(entry)).status; results.push({ check: `GET ${entry} 200`, ok: s === 200, got: s }); }
  const login = await get('/login');
  results.push({ check: 'GET /login 302 to /sign-in', ok: login.status === 302 && login.location === `${SMOKE_ORIGIN}/sign-in`, got: `${login.status} ${login.location ?? ''}` });
  for (const [path, want] of [['/a/x', 404], ['/api/me', 401]]) { const s = (await get(path)).status; results.push({ check: `GET ${path} ${want}`, ok: s === want, got: s }); }
  return results;
}
// Bounded: a new version takes ~15-20s to serve everywhere; retry until every check passes or the deadline.
export async function smoke(get, builtEntryExists, { deadlineMs = 120_000, everyMs = 5_000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const end = now() + deadlineMs;
  for (;;) {
    const results = await smokeOnce(get, builtEntryExists);
    if (results.every(r => r.ok) || now() >= end) return results;
    await sleep(everyMs);
  }
}

// Wrangler's README.md (a "generated at" timestamp) and source maps (sourceRoot names the outdir) differ on every dry
// run, so they are not the build: the same rule as dev-deploy.mjs's bundle hash (run 37966166779).
const NOT_BUILD = rel => rel === 'README.md' || rel.endsWith('.map');

export function hashDirs(dirs) {
  const h = createHash('sha256');
  for (const [label, dir] of dirs) {
    const walk = d => readdirSync(d).sort().flatMap(n => statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]);
    for (const f of walk(dir)) {
      const rel = relative(dir, f).replaceAll('\\', '/');
      if (!NOT_BUILD(rel)) h.update(`${label}/${rel}\0`).update(readFileSync(f)).update('\0');
    }
  }
  return h.digest('hex').slice(0, 16);
}

// ---- CLI ----
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB = join(ROOT, 'packages', 'web'), CP = join(ROOT, 'packages', 'control-plane');
// npm and npx are .cmd files on Windows, which need a shell: there they run as one quoted command line.
const WIN = process.platform === 'win32';
const quote = a => /[\s"'&|<>^]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a;
const run = (cmd, args, cwd = ROOT, env = process.env) => {
  const o = { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] };
  const out = WIN && cmd !== 'git' && cmd !== 'node' ? execSync([cmd, ...args].map(quote).join(' '), o) : execFileSync(cmd, args, o);
  return out.trim();
};
const git = (...a) => run('git', a);
const tryGit = (...a) => { try { git(...a); return true; } catch { return false; } };
const isAncestor = (a, b) => tryGit('merge-base', '--is-ancestor', a, b);
const treeOf = s => { try { return git('rev-parse', `${s}^{tree}`); } catch { return null; } };
// Shared by every worktree of this clone, never tracked or pushed.
const COMMON = () => resolve(ROOT, git('rev-parse', '--git-common-dir'));
const devRecordPath = opts => opts['dev-record'] || join(COMMON(), 'rabbit-hole-dev-deploys.jsonl');
const stateDir = sha => join(COMMON(), 'rabbit-hole-prod-release', sha);
// A refusal names the changed paths: on the Linux runner a bare "has changes" hid a file-mode change (run 37956890240).
const tree = () => { const changes = git('status', '--porcelain', '--untracked-files=no'); return { head: git('rev-parse', 'HEAD'), clean: changes === '', changes }; };

// Bundle both Workers locally (no upload) and hash them with the built pages.
function bundleHash(sha) {
  const out = stateDir(sha);
  for (const [name, cwd] of [['cp', CP], ['app', WEB]]) {
    rmSync(join(out, name), { recursive: true, force: true });
    run('npx', ['wrangler', 'deploy', '--dry-run', '--config', CONFIG, '--outdir', join(out, name)], cwd);
  }
  return hashDirs([['dist', join(WEB, 'dist')], ['dist-dev', join(WEB, 'dist-dev')], ['cp', join(out, 'cp')], ['app', join(out, 'app')]]);
}

function prepare(opts) {
  const { sha } = opts;
  const record = existsSync(devRecordPath(opts)) ? readFileSync(devRecordPath(opts), 'utf8') : '';
  const err = checkPrepare({ sha, onMain: SHA.test(sha || '') && tryGit('merge-base', '--is-ancestor', sha, 'origin/main'), devRecord: record, isAncestor, treeOf, ...tree() });
  if (err) return fail(err);
  const tldraw = process.env.VITE_TLDRAW_LICENSE_KEY
    || (existsSync(join(ROOT, '.env')) && readFileSync(join(ROOT, '.env'), 'utf8').match(/^VITE_TLDRAW_LICENSE_KEY=(.*)$/m)?.[1]?.trim());
  if (!tldraw) return fail('refused: VITE_TLDRAW_LICENSE_KEY is not in the environment or the repo-root .env');
  const env = { ...process.env, ...BUILD_ENV, VITE_TLDRAW_LICENSE_KEY: tldraw };
  for (const k of DEV_ONLY_ENV) delete env[k];
  run('npm', ['run', 'build'], WEB, env);
  run('npm', ['run', 'build', '--', '--outDir', 'dist-dev'], WEB, env);
  console.log(run('node', ['e2e/production-bundle-check.mjs'], WEB));
  const build = bundleHash(sha);
  const learn = SOURCES.learn();
  mkdirSync(stateDir(sha), { recursive: true });
  writeFileSync(join(stateDir(sha), 'prepared.json'), JSON.stringify({ sha, build, at: new Date().toISOString(), learn }, null, 1));
  console.log(`✓ prepared ${sha} build ${build}`);
  console.log(`  needs on production: main migrations through ${readdirSync(join(CP, 'migrations')).sort().at(-1)}, learn through ${learn.at(-1)}`);
  console.log(`  approval phrase: RELEASE ${sha} ${build}`);
}

async function release(opts) {
  if (HOLD) return fail(checkRelease({ hold: true }), 2);
  const { sha, build, approve } = opts;
  const file = SHA.test(sha || '') ? join(stateDir(sha), 'prepared.json') : '';
  const prepared = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const err = checkRelease({ hold: HOLD, sha, build, approve, prepared, ...tree() });
  if (err) return fail(err);
  if (bundleHash(sha) !== build) return fail(`refused: the local bundle no longer hashes to ${build}; prepare again`);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT) return fail('refused: CLOUDFLARE_ACCOUNT_ID is not the rabbit-hole account');

  // Stale candidate: only the tip of origin/main, only forward, only over one consistent version pair.
  git('fetch', '-q', 'origin', 'main');
  const before = { cp: servedRelease(await deployments('rabbit-hole-cp')), app: servedRelease(await deployments('rabbit-hole-app')) };
  const stale = checkCandidate({ sha, mainTip: git('rev-parse', 'origin/main'), ...before, isAncestor });
  if (stale?.noop) return console.log(`✓ ${stale.noop}; nothing deployed`);
  if (stale) return fail(stale);

  // Read-only preflight: secrets by name, then the complete schema. Any gap is a blocker; nothing is changed.
  const blockers = [];
  for (const [worker, cwd] of [['rabbit-hole-cp', CP], ['rabbit-hole-app', WEB]]) {
    const names = JSON.parse(run('npx', ['wrangler', 'secret', 'list', '--format', 'json', '--config', CONFIG], cwd)).map(s => s.name);
    for (const n of SECRETS[worker].required) if (!names.includes(n)) blockers.push(`${worker} is missing secret ${n}`);
    for (const n of [...NEVER_ON_PRODUCTION, ...(SECRETS[worker].forbidden || [])]) if (names.includes(n)) blockers.push(`${worker} must not have secret ${n}`);
  }
  const select = (db, sql) => JSON.parse(run('npx', ['wrangler', 'd1', 'execute', db, '--remote', '--json', '--config', CONFIG, '--command', sql], CP))[0].results;
  blockers.push(...schemaBlockers({
    mainFiles: SOURCES.main().filter(f => f.startsWith('migrations/')).map(f => f.slice('migrations/'.length)),
    mainApplied: select('rabbit-hole-prod', 'SELECT name FROM d1_migrations').map(r => r.name),
    mainLive: schemaOf(select('rabbit-hole-prod', MASTER_SQL)), learnLive: schemaOf(select('rabbit-hole-learn-prod', MASTER_SQL)),
    expected: { main: expectedSchema('main'), learn: expectedSchema('learn') },
  }));
  if (blockers.length) return fail(`blocked:\n- ${blockers.join('\n- ')}`);

  // The release receipt: what served before, the D1 Time Travel bookmarks to restore data to (a Worker rollback never
  // restores data), what was deployed, the smoke, and the outcome. Written whatever happens.
  const receipt = { sha, build, run: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : 'local',
    at: new Date().toISOString(), previous: { cp: before.cp.version, app: before.app.version, release: before.cp.sha12 }, bookmarks: {}, deployed: {}, smoke: [], outcome: 'started' };
  const save = () => {
    const line = `${JSON.stringify(receipt)}\n`;
    appendFileSync(join(COMMON(), 'rabbit-hole-prod-releases.jsonl'), line);
    if (opts.receipt) writeFileSync(opts.receipt, JSON.stringify(receipt, null, 1));
    console.log(`release receipt: ${line.trim()}`);
  };
  try {
    for (const db of ['rabbit-hole-prod', 'rabbit-hole-learn-prod']) receipt.bookmarks[db] = await bookmark(db);
    const message = `release ${sha.slice(0, 12)} build ${build}`;
    // Matched recovery: whatever was uploaded is rolled back to the previous pair, app first, then the control plane.
    const rollback = async why => {
      receipt.outcome = 'rollback-failed';
      for (const [name, cwd] of [['rabbit-hole-app', WEB], ['rabbit-hole-cp', CP]]) {
        if (!receipt.deployed[name]) continue;
        run('npx', ['wrangler', 'rollback', receipt.previous[name === 'rabbit-hole-cp' ? 'cp' : 'app'], '--config', CONFIG, '--message', `rollback to release ${before.cp.sha12 ?? 'previous'}: ${why}`, '--yes'], cwd);
      }
      const after = { cp: servedRelease(await deployments('rabbit-hole-cp')), app: servedRelease(await deployments('rabbit-hole-app')) };
      receipt.rolled_back_to = { cp: after.cp.version, app: after.app.version };
      if (after.cp.version === before.cp.version && after.app.version === before.app.version) receipt.outcome = 'rolled-back';
      return fail(`✗ ${why}: ${receipt.outcome === 'rolled-back' ? `rolled back to the previous pair (cp ${before.cp.version}, app ${before.app.version})` : 'ROLLBACK DID NOT RESTORE THE PREVIOUS PAIR: see the receipt and docs/features/prod-release.md recovery'}`);
    };
    for (const [name, cwd] of [['rabbit-hole-cp', CP], ['rabbit-hole-app', WEB]]) {
      let out;
      try { out = run('npx', ['wrangler', 'deploy', '--config', CONFIG, '--message', message], cwd); }
      catch (e) { receipt.deployed[name] = 'unknown'; return await rollback(`${name} upload failed (${e.message.split('\n')[0]})`); }
      receipt.deployed[name] = out.match(/Current Version ID: (\S+)/)?.[1] ?? 'unknown';
    }
    const dist = join(WEB, 'dist-dev'); // what rabbit-hole-app serves (wrangler.rabbit-hole-prod.jsonc assets)
    receipt.smoke = await smoke(httpGet, entry => existsSync(join(dist, entry)));
    if (!receipt.smoke.every(r => r.ok)) return await rollback(`smoke failed: ${receipt.smoke.filter(r => !r.ok).map(r => `${r.check} (got ${r.got})`).join('; ')}`);
    receipt.outcome = 'released';
    console.log(`✓ released ${sha} build ${build}: rabbit-hole-cp ${receipt.deployed['rabbit-hole-cp']}, rabbit-hole-app ${receipt.deployed['rabbit-hole-app']}; smoke passed`);
  } finally { save(); }
}

// Cloudflare API reads (GET only) with the release token.
const cf = async path => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(`GET ${path}: ${r.status} ${JSON.stringify(j.errors ?? [])}`);
  return j.result;
};
const deployments = async worker => (await cf(`/workers/scripts/${worker}/deployments`)).deployments;
const bookmark = async name => {
  const [db] = await cf(`/d1/database?name=${name}`);
  return (await cf(`/d1/database/${db.uuid}/time_travel/bookmark`)).bookmark;
};
const httpGet = async path => {
  const r = await fetch(new URL(path, SMOKE_ORIGIN), { redirect: 'manual', headers: { 'User-Agent': 'rabbit-hole-prod-release' }, signal: AbortSignal.timeout(15_000) }).catch(e => ({ status: `error ${e.name}`, headers: new Headers(), text: async () => '' }));
  return { status: r.status, location: r.headers.get('location'), body: r.status === 200 ? await r.text() : '' };
};

function fail(message, code = 1) { console.error(message); process.exitCode = code; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { fail(e.message); }
  if (opts?.command === 'prepare') prepare(opts);
  else if (opts?.command === 'release') await release(opts);
  else if (opts) fail('usage: prod-release.mjs prepare --sha <sha> | release --sha <sha> --build <hash> --approve "RELEASE <sha> <hash>" [--receipt <file>]');
}
