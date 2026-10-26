// Disposable Dynamic Workers loader re-test (ledger ba6304f0). Deploys ONE throwaway Worker named rabbit-hole-loader-probe-<stamp> to the
// rabbit-hole Cloudflare account, runs the real inline-code runtime through the loader (finite, error, network denial, output and stdout
// limits, fresh globals, CPU-limit termination, wall deadline, memory), then deletes the Worker and proves it is gone.
// It never touches a shared, dev-clone or production Worker, a D1 database, a secret or a Durable Object.
//
//   node scripts/ctrlk-loader-probe.mjs              dry run (the default): prints the plan, mutates nothing
//   node scripts/ctrlk-loader-probe.mjs --run        deploys, probes, tears down (asks you to type the phrase in a real terminal)
//   node scripts/ctrlk-loader-probe.mjs --teardown   deletes the Worker recorded by an interrupted --run
// Options: --wrangler <path to wrangler/bin/wrangler.js> (else WRANGLER_JS, else a node_modules/wrangler in this repo),
//          --name rabbit-hole-loader-probe-<4-24 lowercase letters or digits>, --receipt-dir <dir> (default C:/s/spec/fj-ctrlk).
// Credentials: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID by NAME in the environment (never printed, never written).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

export const PHRASE = 'DEPLOY LOADER PROBE';
export const NAME_RE = /^rabbit-hole-loader-probe-[a-z0-9]{4,24}$/; // never a shared, dev-clone or production Worker name
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(ROOT, 'scripts', 'ctrlk-loader-probe-worker.js');
const CPU_RE = /cpu|time limit|exceeded|limit/i;

// Each case: what the code does and how the observed answer is judged. gate:false = observe and record, never fail the run.
export const CASES = [
  { id: 'finite', code: 'console.log("hi"); return input.x * 2;', input: { x: 21 }, judge: r => r.status === 'ok' && r.result === 42 && r.stdout?.[0]?.text === 'hi' },
  { id: 'thrown', code: 'throw Error("boom");', judge: r => r.status === 'error' && r.error?.message === 'boom' },
  { id: 'network_denied', code: 'try { await fetch("https://example.com"); return false; } catch { return true; }', judge: r => r.status === 'ok' && r.result === true },
  { id: 'stdout_limit', code: 'for (let i = 0; i < 200; i++) console.log("x" + i); return 1;', judge: r => r.status === 'error' && r.error?.message === 'stdout_limit' },
  { id: 'output_limit', code: 'return "x".repeat(40000);', judge: r => r.status === 'error' && r.error?.message === 'output_limit' },
  { id: 'fresh_globals', code: 'globalThis.n = (globalThis.n || 0) + 1; return globalThis.n;', judge: r => r.status === 'ok' && r.result === 1, repeat: 2 },
  // The question the local Miniflare run could not answer: does the platform stop a CPU-bound loop at limits.cpuMs (1000)? Answered by an
  // error that names the limit well before the 3 s wall deadline. A "timeout" means only the parent's wall clock fired: NOT terminated.
  { id: 'cpu_loop', code: 'for (;;) {}', judge: r => r.status === 'error' && CPU_RE.test(r.error?.message || '') && r.clientMs < 3000 },
  { id: 'wall_deadline', code: 'await new Promise(r => setTimeout(r, 6000)); return 1;', judge: r => r.status === 'timeout' && r.terminationConfirmed === false },
  // The runtime sets no memory limit (only cpuMs and subRequests), so this records what the platform default does.
  { id: 'memory', code: 'const a = []; for (;;) a.push(new Array(1e6).fill(0));', gate: false, judge: r => r.status === 'error' },
  { id: 'recovers_after_abuse', code: 'return input.x + 1;', input: { x: 1 }, judge: r => r.status === 'ok' && r.result === 2 },
];

export function plan({ name }) {
  return [
    '1. preflight: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID present (names only); the account equals the one pinned in packages/web/wrangler.dev.jsonc',
    `2. confirm no Worker named ${name} exists (GET workers/scripts/${name} must answer 404)`,
    `3. wrangler deploy of ${name}: one module Worker, worker_loaders INLINE_CODE_LOADER, a random per-run PROBE_TOKEN var, no other binding (a 10195 answer means Workers Paid is not active: stop, nothing was created)`,
    `4. run ${CASES.length} cases through the real inline-code runtime: ${CASES.map(c => c.id).join(', ')}`,
    `5. ALWAYS: wrangler delete --name ${name}, then GET workers/scripts/${name} must answer 404`,
    '6. write the receipt (no token, no credential)',
  ];
}

const accountPinned = () => readFileSync(join(ROOT, 'packages/web/wrangler.dev.jsonc'), 'utf8').match(/"account_id":\s*"([0-9a-f]{32})"/)?.[1];

export async function run({ dryRun, name, receiptDir }, deps) {
  const say = deps.say;
  if (!NAME_RE.test(name)) throw new Error(`Refusing the name ${name}: it must match ${NAME_RE}.`);
  say(`ctrlk loader probe, Worker ${name}, mode ${dryRun ? 'DRY RUN (nothing is created)' : 'RUN'}`);
  plan({ name }).forEach(line => say(line));
  if (dryRun) { say('✓ dry run complete: no command run, no request sent, no file written. Add --run to execute.'); return { dryRun: true }; }

  const state = { name, deployed: false, tornDown: false, startedAt: new Date().toISOString() };
  const saveState = () => deps.writeFile(join(receiptDir, 'loader-probe-state.json'), JSON.stringify(state, null, 2));
  const account = deps.env.CLOUDFLARE_ACCOUNT_ID, token = deps.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in the environment.');
  if (account !== accountPinned()) throw new Error('CLOUDFLARE_ACCOUNT_ID is not the rabbit-hole account pinned in packages/web/wrangler.dev.jsonc.');
  say('✓ credentials present by name; account matches the pinned rabbit-hole account');
  const exists = async () => (await deps.fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${name}`, { headers: { Authorization: `Bearer ${token}` } })).status !== 404;
  if (await exists()) throw new Error(`A Worker named ${name} already exists; refusing to touch it. Pick another --name.`);
  say(`✓ no Worker named ${name} exists`);
  if ((await deps.confirm(`Type ${PHRASE} to deploy the throwaway Worker ${name} to the rabbit-hole account: `)) !== PHRASE) throw new Error('Confirmation phrase not typed. Nothing was created.');

  const dir = deps.tempDir(), config = join(dir, 'wrangler.jsonc'), probeToken = randomBytes(24).toString('hex');
  const results = []; let blocked = null;
  try {
    deps.writeFile(config, JSON.stringify({ name, main: WORKER, compatibility_date: '2026-08-01', account_id: account, workers_dev: true, worker_loaders: [{ binding: 'INLINE_CODE_LOADER' }], vars: { PROBE_TOKEN: probeToken } }, null, 2));
    state.deployed = true; saveState(); // recorded BEFORE the deploy so an interrupted run can be torn down
    const deployed = deps.exec(['deploy', '--config', config]);
    if (/10195/.test(deployed.output)) { blocked = '10195: Cloudflare says Dynamic Workers need the Workers Paid plan; this account is not on it. Nothing was probed.'; throw new Error(blocked); }
    if (deployed.status !== 0) throw new Error(`wrangler deploy failed (exit ${deployed.status}): ${deployed.output.slice(-600).replaceAll(probeToken, '[token]')}`);
    const url = deployed.output.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];
    if (!url) throw new Error('wrangler deploy printed no workers.dev URL.');
    say(`✓ deployed ${name}: the loader was accepted, so Dynamic Workers are available on this account`);
    const call = async c => {
      const started = Date.now();
      const response = await deps.fetch(url, { method: 'POST', headers: { authorization: `Bearer ${probeToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ code: c.code, input: c.input ?? null }) });
      const text = await response.text();
      let body; try { body = JSON.parse(text); } catch { body = { status: `http_${response.status}`, error: { message: text.slice(0, 200) } }; }
      return { ...body, clientMs: Date.now() - started, http: response.status };
    };
    for (let tries = 0; tries < 12; tries++) { const r = await call(CASES[0]).catch(() => null); if (r?.status === 'ok') break; await deps.sleep(5000); } // rollout lag
    for (const c of CASES) {
      for (let n = 0; n < (c.repeat || 1); n++) {
        const r = await call(c).catch(error => ({ status: 'fetch_failed', error: { message: String(error.message).slice(0, 200) }, clientMs: null }));
        const verdict = c.judge(r) ? 'pass' : c.gate === false ? 'observe' : 'FAIL';
        results.push({ case: c.id, run: n + 1, verdict, http: r.http, status: r.status, result: typeof r.result === 'string' ? r.result.slice(0, 80) : r.result, error: r.error?.message?.slice(0, 200) ?? null, clientMs: r.clientMs, runtimeMs: r.elapsedMs, terminationConfirmed: r.terminationConfirmed });
        say(`${verdict.padEnd(7)} ${c.id}${c.repeat ? ` #${n + 1}` : ''}: status=${r.status} http=${r.http} clientMs=${r.clientMs}${r.error?.message ? ` error=${JSON.stringify(r.error.message.slice(0, 100))}` : ''}`);
      }
    }
  } catch (error) {
    state.error = String(error.message).replaceAll(probeToken, '[token]');
    say(`✗ stopped: ${state.error}`);
  } finally {
    if (state.deployed) {
      const deleted = deps.exec(['delete', '--name', name, '--force']);
      state.tornDown = !(await exists());
      say(state.tornDown ? `✓ ${name} deleted and confirmed gone (404)` : `✗ ${name} STILL EXISTS (wrangler delete exit ${deleted.status}). Run: node scripts/ctrlk-loader-probe.mjs --teardown`);
      saveState();
    }
    deps.removeDir(dir);
  }
  const outcome = blocked ? 'blocked' : state.error ? 'error' : results.some(r => r.verdict === 'FAIL') ? 'fail' : 'pass';
  const receipt = { name, outcome, blocked, error: state.error || null, tornDown: state.tornDown, results, finishedAt: new Date().toISOString(),
    meaning: 'cpu_loop pass = the platform ended a CPU-bound loop at the limit; a result of status timeout means only the 3 s wall deadline fired and the loop was NOT shown to terminate. clientMs is measured by the caller; Workers clocks do not advance during CPU work, so runtimeMs is not evidence.' };
  deps.writeFile(join(receiptDir, `loader-probe-${name.slice(-10)}.json`), JSON.stringify(receipt, null, 2));
  say(`${outcome === 'pass' ? '✓' : '✗'} outcome ${outcome}; receipt written to ${receiptDir}`);
  return receipt;
}

async function main() {
  const args = process.argv.slice(2), opt = key => (args.includes(key) ? args[args.indexOf(key) + 1] : undefined);
  const receiptDir = opt('--receipt-dir') || 'C:/s/spec/fj-ctrlk';
  const name = opt('--name') || `rabbit-hole-loader-probe-${new Date().toISOString().replace(/\D/g, '').slice(2, 12)}`;
  const execute = args.includes('--run') || args.includes('--teardown');
  const candidates = [opt('--wrangler'), process.env.WRANGLER_JS, ...['packages/web', 'packages/control-plane', '.'].map(p => join(ROOT, p, 'node_modules/wrangler/bin/wrangler.js'))].filter(Boolean);
  const wrangler = candidates.find(existsSync);
  if (execute && !wrangler) { console.error(`✗ wrangler not found. Pass --wrangler <path to wrangler/bin/wrangler.js>. Tried: ${candidates.join(', ')}`); process.exit(2); }
  // Always from the temp dir, so no repo wrangler config can be picked up by a delete.
  const exec = argv => { const r = spawnSync(process.execPath, [wrangler, ...argv], { env: process.env, encoding: 'utf8', cwd: tmpdir() }); return { status: r.status, output: `${r.stdout || ''}${r.stderr || ''}` }; };
  if (args.includes('--teardown')) {
    const state = JSON.parse(readFileSync(join(receiptDir, 'loader-probe-state.json'), 'utf8'));
    if (!NAME_RE.test(state.name)) { console.error('✗ the recorded name is not a probe name; refusing'); process.exit(2); }
    const r = exec(['delete', '--name', state.name, '--force']);
    console.log(`${r.status === 0 ? '✓' : '✗'} wrangler delete ${state.name}: exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
  if (execute) mkdirSync(receiptDir, { recursive: true });
  const confirm = async prompt => {
    if (!process.stdin.isTTY) throw new Error('--run needs a real terminal to type the confirmation phrase; run it in a normal terminal, not a pipe.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await rl.question(prompt)).trim(); } finally { rl.close(); }
  };
  const deps = { say: console.log, env: process.env, fetch, exec, confirm, sleep: ms => new Promise(r => setTimeout(r, ms)), writeFile: (p, t) => writeFileSync(p, t), tempDir: () => mkdtempSync(join(tmpdir(), 'loader-probe-')), removeDir: p => rmSync(p, { recursive: true, force: true }) };
  const outcome = await run({ dryRun: !execute, name, receiptDir }, deps);
  process.exit(outcome.dryRun || outcome.outcome === 'pass' ? 0 : outcome.outcome === 'blocked' ? 3 : 1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`✗ ${error.message}`); process.exit(1); });
