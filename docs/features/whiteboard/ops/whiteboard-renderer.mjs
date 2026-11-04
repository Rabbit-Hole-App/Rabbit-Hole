// Owner launcher, roadmap W0.3: creates the Fly app rabbit-hole-whiteboard-renderer, installs ONE fresh bearer token on the app
// (MOTION_RENDERER_TOKEN) and on the production Worker (WHITEBOARD_RENDERER_TOKEN), deploys the pinned commit and probes /health.
// The token is generated here, piped on stdin to both and never printed, logged or put on a command line.
//   node whiteboard-renderer.mjs --check    reads state only; mutates nothing
//   node whiteboard-renderer.mjs            does what --check prints, in order; a rerun skips what is done
// Everything it needs (commit, worktree, tool paths, credentials file) is in the pins file beside it: nothing is read from
// the environment and there is no flag or variable that answers a prompt. Run it through whiteboard-renderer.cmd.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes('--check');
const pins = Object.fromEntries(readFileSync(join(HERE, 'whiteboard-renderer.pins'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
for (const k of ['SHA', 'W', 'ENV_FILE', 'APP', 'ORG', 'WORKER', 'FLY', 'WRANGLER', 'CURL', 'SH', 'CONTEXT_SH']) if (!pins[k]) stop(`the pins file has no ${k}`);

const secrets = [];                                        // every value that must never appear in output
const clean = s => secrets.reduce((t, v) => (v ? t.split(v).join('<value>') : t), String(s ?? ''));
function say(s) { console.log(clean(s)); }
function stop(why) { console.log(clean(`STOP: ${why}`)); process.exit(1); }

const credentials = readFileSync(pins.ENV_FILE, 'utf8');
const named = name => { const v = (credentials.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^['"]|['"]$/g, ''); if (v) secrets.push(v); return v; };
const flyToken = named('FLY_ORG_TOKEN'), cfToken = named('CLOUDFLARE_API_TOKEN'), cfAccount = named('CLOUDFLARE_ACCOUNT_ID');
for (const [n, v] of [['FLY_ORG_TOKEN', flyToken], ['CLOUDFLARE_API_TOKEN', cfToken], ['CLOUDFLARE_ACCOUNT_ID', cfAccount]]) if (!v) stop(`${n} is missing from the credentials file`);

// A pin may name a program plus leading arguments, separated by "|" (the offline harness points them at stubs).
const tool = spec => { const [exe, ...lead] = spec.split('|'); return (args, o = {}) => spawnSync(exe, [...lead, ...args], { encoding: 'utf8', cwd: o.cwd, input: o.input, env: { ...process.env, ...o.env }, windowsHide: true }); };
const flyRun = tool(pins.FLY), wranglerRun = tool(pins.WRANGLER), curlRun = tool(pins.CURL), shRun = tool(pins.SH), git = tool('git');
const FLY_ENV = { FLY_API_TOKEN: flyToken }, CF_ENV = { CLOUDFLARE_API_TOKEN: cfToken, CLOUDFLARE_ACCOUNT_ID: cfAccount };
const mutations = [];
let issued = null;                                         // the token this run generated, kept only to prove the app accepts it

// Preflight: the commit being deployed is the pinned one and the tree is clean.
const head = git(['-C', pins.W, 'rev-parse', 'HEAD']).stdout.trim();
if (head !== pins.SHA) stop(`${pins.W} is at ${head.slice(0, 9)}, not the pinned ${pins.SHA.slice(0, 9)}; nothing was changed`);
if (git(['-C', pins.W, 'status', '--porcelain']).stdout.trim()) stop(`${pins.W} has uncommitted changes; nothing was changed`);
say(`✓ commit: ${pins.SHA.slice(0, 9)} in ${pins.W}`);

// State, read only.
const json = (r, what) => { try { return JSON.parse(r.stdout); } catch { return stop(`${what} did not answer JSON (exit ${r.status}): ${clean((r.stderr || r.stdout).slice(0, 300))}`); } };
const apps = json(flyRun(['apps', 'list', '--org', pins.ORG, '--json'], { env: FLY_ENV }), 'fly apps list').map(a => a.Name);
const appExists = apps.includes(pins.APP);
const hasSecret = (list, n) => list.some(s => (s.Name ?? s.name) === n);
const flySecret = appExists && hasSecret(json(flyRun(['secrets', 'list', '-a', pins.APP, '--json'], { env: FLY_ENV }), 'fly secrets list'), 'MOTION_RENDERER_TOKEN');
const workerSecret = hasSecret(json(wranglerRun(['secret', 'list', '--name', pins.WORKER, '--format', 'json'], { env: CF_ENV, cwd: tmpdir() }), 'wrangler secret list'), 'WHITEBOARD_RENDERER_TOKEN');
const health = () => { const r = curlRun(['-s', '-m', '30', `https://${pins.APP}.fly.dev/health`]); try { return JSON.parse(r.stdout); } catch { return null; } };
let h = appExists ? health() : null;
const deployed = h?.ok === true && h?.settings?.git_revision === pins.SHA;
const needToken = !(flySecret && workerSecret);
say(`${appExists ? '✓' : '·'} app ${pins.APP}: ${appExists ? 'exists' : 'will be created in ' + pins.ORG}`);
say(`${flySecret ? '✓' : '·'} app secret MOTION_RENDERER_TOKEN: ${flySecret ? 'present' : 'will be set'}`);
say(`${workerSecret ? '✓' : '·'} Worker secret WHITEBOARD_RENDERER_TOKEN on ${pins.WORKER}: ${workerSecret ? 'present' : 'will be set'}`);
say(`${deployed ? '✓' : '·'} image at ${pins.SHA.slice(0, 9)}: ${deployed ? 'already serving' : 'will be deployed'}`);
if (needToken && (flySecret || workerSecret)) say('· one of the two secrets is missing, so both get a fresh value (nothing uses either yet)');
if (CHECK) { say(`CHECK OK: nothing was changed.`); process.exit(0); }
if (deployed && !needToken) { say('OK: already done; nothing to change.'); process.exit(0); }

// Mutations, in this order; each one stops the run with the exact error and a rerun resumes.
const must = (r, what) => { if (r.status !== 0) stop(`${what} failed (exit ${r.status}): ${clean((r.stderr || r.stdout).slice(-400))}`); };
if (!appExists) { mutations.push('create'); must(flyRun(['apps', 'create', pins.APP, '--org', pins.ORG], { env: FLY_ENV }), 'fly apps create'); say(`✓ created ${pins.APP}`); }
if (needToken) {
  const token = randomBytes(24).toString('hex'); secrets.push(token);
  mutations.push('app-secret'); must(flyRun(['secrets', 'import', '--stage', '-a', pins.APP], { env: FLY_ENV, input: `MOTION_RENDERER_TOKEN=${token}\n` }), 'fly secrets import');
  say('✓ app secret MOTION_RENDERER_TOKEN staged');
  mutations.push('worker-secret'); must(wranglerRun(['secret', 'put', 'WHITEBOARD_RENDERER_TOKEN', '--name', pins.WORKER], { env: CF_ENV, cwd: tmpdir(), input: token }), 'wrangler secret put');
  say('✓ Worker secret WHITEBOARD_RENDERER_TOKEN set (the Worker still has WHITEBOARD_ENABLED false: no learner sees a change)');
  issued = token;
}
const ctx = mkdtempSync(join(tmpdir(), 'whiteboard-renderer-'));
try {
  must(shRun([pins.CONTEXT_SH, '--target', 'whiteboard', ctx], { cwd: pins.W }), 'context.sh');
  if (!existsSync(join(ctx, 'fly.whiteboard.toml')) || !existsSync(join(ctx, 'src.tar'))) stop('context.sh did not produce the deploy context');
  mutations.push('deploy');
  must(flyRun(['deploy', ctx, '--config', join(ctx, 'fly.whiteboard.toml'), '--build-arg', `MOTION_RENDERER_BUILD=${pins.SHA}`, '--ha=false', '--yes', '-a', pins.APP], { env: FLY_ENV }), 'fly deploy');
} finally { rmSync(ctx, { recursive: true, force: true }); }
say('✓ deployed');

// Probe: /health reports this commit, and the new bearer token is accepted (an unknown render id is 404 with a good token, 401 without).
for (let i = 0; i < 18 && !(h?.ok && h?.settings?.git_revision === pins.SHA); i++) { if (i) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},10000)']); h = health(); }
if (!(h?.ok && h?.settings?.git_revision === pins.SHA)) stop(`/health does not report ${pins.SHA.slice(0, 9)} after the deploy (${h ? 'revision ' + String(h?.settings?.git_revision).slice(0, 9) : 'no answer'}); rerun to resume`);
say(`✓ /health: ${h.service} ${h.version}, revision ${pins.SHA.slice(0, 9)}, ${h.limits?.concurrent_renders} render at a time`);
if (issued) {
  const probe = curlRun(['-s', '-m', '30', '-w', '\n%{http_code}', '-K', '-', `https://${pins.APP}.fly.dev/render/${'0'.repeat(32)}`], { input: `header = "Authorization: Bearer ${issued}"\n` });
  const code = probe.stdout.trim().split('\n').pop();
  if (code !== '404') stop(`the new bearer token was not accepted (HTTP ${code}); rerun to resume`);
  say('✓ bearer token accepted by the app');
}
say(`OK: ${pins.APP} is serving ${pins.SHA.slice(0, 9)}. Tell Claude: whiteboard renderer done.`);
