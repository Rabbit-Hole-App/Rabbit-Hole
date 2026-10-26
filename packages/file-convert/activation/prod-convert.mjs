// OWNER COMMAND (production): create and deploy the production file converter, install its secrets, roll it back. Read prod-convert-core.mjs's header.
//   node packages/file-convert/activation/prod-convert.mjs --dry-run [run|rotate|rollback L1]   offline: prints the plan and the recorded progress
//   node packages/file-convert/activation/prod-convert.mjs --preflight [--sha <sha>]              reads production (names and listings only)
//   node packages/file-convert/activation/prod-convert.mjs run --sha <40-hex>                     the steps, each behind a typed phrase (interactive terminal only)
// No option, environment variable or file answers a confirmation or changes a target. The typed answers are read from the terminal only.
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './prod-convert-core.mjs';

const CREDENTIALS = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const STATE = 'C:/s/spec/fj-converter/prod-convert-state.txt'; // step names, shas and times only: never a value
const WRANGLER_VERSION = '4.150.0';
const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [join(HERE, '../../../node_modules/wrangler'), ...['release-g3', 'credits-2500', 'small-deploy'].map(w => `C:/Users/cyudhist/Desktop/workspace/${w}/node_modules/wrangler`)];

// Refuse to start with anything in the environment that could redirect a tool, a credential or an answer: the credentials come from the file only.
const refused = Object.keys(process.env).filter(n => /^(FLY_|WRANGLER_|CLOUDFLARE_|CONVERT_|FILE_JOB_|NODE_OPTIONS$|NODE_EXTRA_CA_CERTS$|GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|EXEC_PATH|CONFIG)|HTTPS?_PROXY$|ALL_PROXY$)/i.test(n) || /CONFIRM|ANSWER|ASSUME_YES|AUTO_YES|NONINTERACTIVE|PREANSWER/i.test(n));
if (refused.length) { console.log(`stopped: the environment sets ${refused.join(', ')}. This command accepts no override of a credential, tool, proxy or answer: unset them. Nothing was done.`); process.exit(1); }

const KEEP = ['PATH', 'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'TEMP', 'TMP'];
const keep = Object.fromEntries(KEEP.filter(n => process.env[n]).map(n => [n, process.env[n]]));
const scratch = fn => { const dir = mkdtempSync(join(tmpdir(), 'prod-convert-')); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
const toplevel = () => spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();

const deps = {
  out: line => console.log(line),
  now: () => new Date().toISOString(),
  readCredentials: () => readFileSync(CREDENTIALS, 'utf8'),
  state: { read: () => (existsSync(STATE) ? readFileSync(STATE, 'utf8') : ''), append: line => { mkdirSync(dirname(STATE), { recursive: true }); appendFileSync(STATE, `${line}\n`); } },
  wrangler: () => {
    for (const dir of CANDIDATES) {
      try { if (JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')).version === WRANGLER_VERSION) return { path: `${dir}/bin/wrangler.js`, version: WRANGLER_VERSION }; } catch { /* next */ }
    }
    return null;
  },
  flyctl: () => spawnSync('flyctl', ['version'], { env: keep, encoding: 'utf8' }).status === 0,
  interactive: () => !!(process.stdin.isTTY && process.stdout.isTTY),
  ask: async question => { const rl = createInterface({ input: process.stdin, output: process.stdout }); try { return (await rl.question(question)).trim(); } finally { rl.close(); } },
  // The value of a secret travels on `input` (a child's stdin) only. wrangler runs in an empty directory so it finds no project config.
  spawn: (tool, args, { input, env }) => scratch(cwd => {
    const r = tool === 'git' ? spawnSync('git', args, { cwd: toplevel(), encoding: 'utf8' })
      : tool === 'wrangler' ? spawnSync(process.execPath, [deps.wrangler().path, ...args], { cwd, input, encoding: 'utf8', env: { ...keep, ...env, WRANGLER_SEND_METRICS: 'false' } })
        : spawnSync('flyctl', args, { cwd, input, encoding: 'utf8', env: { ...keep, ...env } });
    return { status: r.status, stdout: r.stdout || '' };
  }),
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000), redirect: 'manual' }),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  random: n => randomBytes(n),
  // The build context is exactly one commit of rabbit-hole/main: git archive of packages/file-convert plus its Dockerfile and fly.prod.toml.
  makeContext: sha => {
    const root = toplevel(), dir = mkdtempSync(join(tmpdir(), 'convert-ctx-'));
    const git = (...args) => { const r = spawnSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 }); if (r.status !== 0) throw new Error(`git ${args[0]} failed`); return r.stdout; };
    writeFileSync(join(dir, 'src.tar'), git('archive', '--format=tar', sha, 'packages/file-convert'));
    for (const f of ['Dockerfile', 'fly.prod.toml']) writeFileSync(join(dir, f), git('show', `${sha}:packages/file-convert/${f}`));
    return dir.replace(/\\/g, '/');
  },
  cleanup: dir => rmSync(dir, { recursive: true, force: true }),
};
process.exit(await run(process.argv.slice(2), deps));
