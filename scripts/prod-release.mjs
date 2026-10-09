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

// A green dev deployment: a line in the dev-deploy record with this exact sha, gates and smoke both passed.
export function greenDevDeploy(sha, recordText) {
  return recordText.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .find(r => r?.sha === sha && r.gates === 'pass' && r.smoke === 'pass') || null;
}

const dirty = changes => `refused: the tracked tree has changes${changes ? `:\n${changes}` : ''}`;

export function checkPrepare({ sha, onMain, devRecord, head, clean, changes }) {
  if (!SHA.test(sha || '')) return 'refused: --sha must be a full 40-character commit sha';
  if (!onMain) return `refused: ${sha} is not on origin/main (git fetch origin main first)`;
  if (!greenDevDeploy(sha, devRecord)) return `refused: no green dev deployment is recorded for ${sha}`;
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

// Learn migrations are not tracked by wrangler; each is detected by the first table it creates.
export function learnMarkers(dir) {
  return readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(file => {
    const sql = readFileSync(join(dir, file), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    return { file, table: sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1] };
  });
}
export const pendingLearn = (markers, tables) => markers.filter(m => !tables.includes(m.table)).map(m => m.file);

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
  const err = checkPrepare({ sha, onMain: SHA.test(sha || '') && tryGit('merge-base', '--is-ancestor', sha, 'origin/main'), devRecord: record, ...tree() });
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
  const learn = learnMarkers(join(CP, 'learn-migrations')).map(m => m.file);
  mkdirSync(stateDir(sha), { recursive: true });
  writeFileSync(join(stateDir(sha), 'prepared.json'), JSON.stringify({ sha, build, at: new Date().toISOString(), learn }, null, 1));
  console.log(`✓ prepared ${sha} build ${build}`);
  console.log(`  needs on production: main migrations through ${readdirSync(join(CP, 'migrations')).sort().at(-1)}, learn through ${learn.at(-1)}`);
  console.log(`  approval phrase: RELEASE ${sha} ${build}`);
}

function release(opts) {
  if (HOLD) return fail(checkRelease({ hold: true }), 2);
  const { sha, build, approve } = opts;
  const file = SHA.test(sha || '') ? join(stateDir(sha), 'prepared.json') : '';
  const prepared = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const err = checkRelease({ hold: HOLD, sha, build, approve, prepared, ...tree() });
  if (err) return fail(err);
  if (bundleHash(sha) !== build) return fail(`refused: the local bundle no longer hashes to ${build}; prepare again`);
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT) return fail('refused: CLOUDFLARE_ACCOUNT_ID is not the rabbit-hole account');

  // Read-only preflight: secrets by name, then the schema. Any gap is a blocker; nothing is changed.
  const blockers = [];
  for (const [worker, cwd] of [['rabbit-hole-cp', CP], ['rabbit-hole-app', WEB]]) {
    const names = JSON.parse(run('npx', ['wrangler', 'secret', 'list', '--format', 'json', '--config', CONFIG], cwd)).map(s => s.name);
    for (const n of SECRETS[worker].required) if (!names.includes(n)) blockers.push(`${worker} is missing secret ${n}`);
    for (const n of [...NEVER_ON_PRODUCTION, ...(SECRETS[worker].forbidden || [])]) if (names.includes(n)) blockers.push(`${worker} must not have secret ${n}`);
  }
  const mainList = run('npx', ['wrangler', 'd1', 'migrations', 'list', 'rabbit-hole-prod', '--remote', '--config', CONFIG], CP);
  if (!/No migrations to apply/i.test(mainList)) blockers.push(`rabbit-hole-prod has pending migrations:\n${mainList}`);
  const tables = JSON.parse(run('npx', ['wrangler', 'd1', 'execute', 'rabbit-hole-learn-prod', '--remote', '--json', '--config', CONFIG,
    '--command', "SELECT name FROM sqlite_master WHERE type='table'"], CP))[0].results.map(r => r.name);
  const learn = pendingLearn(learnMarkers(join(CP, 'learn-migrations')), tables);
  if (learn.length) blockers.push(`rabbit-hole-learn-prod is missing learn migrations ${learn.join(', ')} (each needs the owner's GO; this job never applies them)`);
  if (blockers.length) return fail(`blocked:\n- ${blockers.join('\n- ')}`);

  const message = `release ${sha.slice(0, 12)} build ${build}`;
  run('npx', ['wrangler', 'deploy', '--config', CONFIG, '--message', message], CP);
  run('npx', ['wrangler', 'deploy', '--config', CONFIG, '--message', message], WEB);
  appendFileSync(join(COMMON(), 'rabbit-hole-prod-releases.jsonl'), `${JSON.stringify({ sha, build, at: new Date().toISOString() })}\n`);
  console.log(`✓ released ${sha} build ${build} to rabbit-hole-cp and rabbit-hole-app; run the smoke in docs/features/prod-release.md`);
}

function fail(message, code = 1) { console.error(message); process.exitCode = code; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { fail(e.message); }
  if (opts?.command === 'prepare') prepare(opts);
  else if (opts?.command === 'release') release(opts);
  else if (opts) fail('usage: prod-release.mjs prepare --sha <sha> | release --sha <sha> --build <hash> --approve "RELEASE <sha> <hash>"');
}
