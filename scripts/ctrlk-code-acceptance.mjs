// OWNER COMMAND (production): the deployed acceptance of Ctrl+K JavaScript execution on https://digrabbithole.com
// (docs/features/ctrlk-code-loader-retest.md, ledger ba6304f0). Run it only after the loader probe passed (scripts/ctrlk-loader-probe.mjs) and the JS
// activation commit is live. The runs cost no provider money; the platform pays Dynamic Workers usage (US$0 expected inside the included 1,000 unique workers
// a month), so one small booking (US$0.05) covers the whole command in the shared budget (C:/s/spec/budget/budget.mjs).
//   node scripts/ctrlk-code-acceptance.mjs --dry-run      offline: prints the plan and how much of the lifetime run budget it uses. Contacts nothing, books nothing.
//   node scripts/ctrlk-code-acceptance.mjs [--window dev|production] [--runs a,b] [--force] [--out DIR]
//   node scripts/ctrlk-code-acceptance.mjs --runs disabled-check      the OTHER state: run it while the feature is OFF to prove it says so and creates nothing.
// Signs in as YOU with your small_session cookie for digrabbithole.com at a hidden prompt (memory only). Stops at the first failure.
// Proves through the DEPLOYED path: isolation (no network to the Internet or to this app, no storage, no environment, no bindings), execution limits (CPU loop,
// memory, output size, stdout, wall deadline), cancellation (cancel wins over a late result), TERMINATION on the deployed loader (a CPU loop ends with an error that names
// the platform limit, and the next run still works), refusal paths that create nothing, duplicate-submit protection, and the lifetime run budget's declared size.
import { randomUUID } from 'node:crypto';
import { ORIGIN, COOKIE_RE, Stop, apiFor, runEntry } from './ctrlk-acceptance-common.mjs';

export { ORIGIN };
export const BOOK_USD = 0.05;
export const WINDOWS = { dev: { maxRuns: 25, reserveCredits: 1, maxCredits: 25 }, production: { maxRuns: 200, reserveCredits: 1, maxCredits: 200 } };
const CPU_RE = /cpu|time limit|exceeded|limit/i;
const ISOLATION = `const out = {};
try { await fetch('https://example.com'); out.internet = 'allowed'; } catch { out.internet = 'blocked'; }
try { await fetch('${ORIGIN}/api/me'); out.thisApp = 'allowed'; } catch { out.thisApp = 'blocked'; }
try { out.dynamicImport = typeof (await import('https://example.com/x.js')); } catch { out.dynamicImport = 'blocked'; }
out.env = typeof env; out.process = typeof process; out.document = typeof document;
out.storage = [typeof localStorage, typeof sessionStorage, typeof indexedDB].join();
out.bindings = [typeof LEARN_DB, typeof LEARN_MEDIA, typeof INLINE_CODE_LOADER, typeof FILE_JOBS, typeof SESSIONS, typeof ASSETS].join();
out.cache = typeof caches;
return out;`;
// id, code, input and how the finished job is judged. gate:false = recorded, never fails the run. ms: the longest the job may take to finish.
export const CASES = [
  { id: 'finite', code: 'console.log("hi"); return input.x * 2;', input: { x: 21 }, judge: j => j.phase === 'succeeded' && j.result?.result === 42 && j.result.stdout?.[0]?.text === 'hi', ms: 30000 },
  { id: 'isolation', code: ISOLATION, judge: j => { const r = j.result?.result || {}; return j.phase === 'succeeded' && r.internet === 'blocked' && r.thisApp === 'blocked' && r.dynamicImport === 'blocked' && r.env === 'undefined' && r.process === 'undefined' && r.document === 'undefined' && r.storage === 'undefined,undefined,undefined' && r.bindings === 'undefined,undefined,undefined,undefined,undefined,undefined'; }, ms: 30000 },
  { id: 'thrown', code: 'throw Error("boom");', judge: j => j.phase === 'failed' && j.result?.error?.message === 'boom', ms: 30000 },
  { id: 'output_limit', code: 'return "x".repeat(40000);', judge: j => j.phase === 'failed' && j.result?.error?.message === 'output_limit', ms: 30000 },
  { id: 'stdout_limit', code: 'for (let i = 0; i < 200; i++) console.log("line " + i); return 1;', judge: j => j.phase === 'failed' && j.result?.error?.message === 'stdout_limit', ms: 30000 },
  // TERMINATION: the platform must end a CPU-bound loop at the 1,000 ms CPU limit. "unknown / timeout" would mean only the 3 s wall clock fired.
  { id: 'cpu_loop', code: 'for (;;) {}', judge: j => j.phase === 'failed' && j.result?.status === 'error' && CPU_RE.test(j.result?.error?.message || ''), ms: 30000 },
  { id: 'memory', code: 'const a = []; for (;;) a.push(new Array(1e6).fill(0));', gate: false, judge: j => j.phase === 'failed', ms: 30000 },
  { id: 'wall_deadline', code: 'await new Promise(r => setTimeout(r, 6000)); return 1;', judge: j => j.phase === 'unknown' && j.result?.status === 'timeout' && /not confirmed/i.test(j.reason || ''), ms: 30000 },
  { id: 'recovers_after_abuse', code: 'return input.x + 1;', input: { x: 1 }, judge: j => j.phase === 'succeeded' && j.result?.result === 2, ms: 30000 },
];
export const RUNS = { refusals: { kind: 'free' }, jobs: { kind: 'jobs' }, cancel: { kind: 'jobs' }, 'disabled-check': { kind: 'free', optIn: true } };

export function parse(argv) {
  const o = { dry: false, runs: null, force: false, out: null, window: 'production' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--force') o.force = true;
    else if (a === '--out') o.out = argv[++i] ?? null;
    else if (a === '--window') { o.window = argv[++i]; if (!WINDOWS[o.window]) return null; }
    else if (a === '--runs') { o.runs = String(argv[++i] ?? '').split(',').filter(Boolean); if (!o.runs.length || o.runs.some(r => !RUNS[r])) return null; } else return null;
  }
  o.runs ??= Object.keys(RUNS).filter(r => !RUNS[r].optIn);
  return o.dry && o.force ? null : o;
}

export async function accept(argv, deps) {
  const say = deps.out, o = parse(argv);
  if (!o) { say(`usage: node scripts/ctrlk-code-acceptance.mjs [--dry-run] [--window dev|production] [--runs ${Object.keys(RUNS).join(',')}] [--force] [--out DIR]`); return 2; }
  const names = Object.keys(RUNS).filter(r => o.runs.includes(r)), win = WINDOWS[o.window], disabledOnly = names.length === 1 && names[0] === 'disabled-check';
  const jobs = names.includes('jobs') ? CASES.length : 0, jobsTotal = jobs + (names.includes('cancel') ? 1 : 0);
  say(`deployed Ctrl+K JavaScript acceptance on ${ORIGIN}; runs, in order: ${names.join(', ')}`);
  if (jobsTotal) say(`jobs: ${CASES.map(c => c.id).join(', ')}${names.includes('cancel') ? ', cancel' : ''}`);
  say(`window ${o.window}: it must show ${win.maxRuns} lifetime runs, ${win.reserveCredits} credit reserved per run, ${win.maxCredits} credits in all. This command uses ${jobsTotal} of the ${win.maxRuns} lifetime runs (the budget is never refunded or refilled).`);
  say(`booked in the shared budget: US$${disabledOnly ? 0 : BOOK_USD} (no provider is called; the platform pays Dynamic Workers usage, US$0 expected)`);
  if (o.dry) { say('dry run: read no credential, contacted nothing, booked nothing. Nothing was run, called or changed.'); return 0; }
  if (!deps.interactive()) { say('stopped: this command asks for your session cookie at a hidden prompt and needs an interactive terminal. Nothing was done.'); return 1; }
  if (jobsTotal > win.maxRuns * 0.5) { say(`stopped: ${jobsTotal} jobs would use more than half of the ${win.maxRuns} lifetime runs.`); return 1; }

  const stamp = deps.now().replace(/[-:T]/g, '').slice(0, 14), done = { started: deps.now(), origin: ORIGIN, window: o.window, runs: {} }, budget = deps.budget;
  const cookie = (await deps.askHidden(`Paste the small_session cookie value for ${ORIGIN} (nothing is echoed): `)).trim();
  if (!COOKIE_RE.test(cookie)) { say('stopped: that does not look like a cookie value (16 or more printable characters, no spaces).'); return 1; }
  const api = apiFor(deps, cookie), TERMINAL = ['succeeded', 'failed', 'cancelled', 'unknown'];
  const poll = async (fn, ok, ms, every = 1500) => { const end = deps.clock() + ms; for (;;) { const v = await fn(); if (ok(v)) return v; if (deps.clock() > end) return null; await deps.sleep(every); } };
  const credits = async () => { const r = await api('GET', '/api/learn/usage'); return r.ok ? { used: r.json.usedCredits, reserved: r.json.reservedCredits } : null; };
  let bookId = null;

  try {
    const me = await api('GET', '/api/me');
    if (me.status !== 200) throw new Stop(`the cookie was refused by ${ORIGIN}/api/me (HTTP ${me.status}): sign in again and copy a fresh small_session value.`);
    say('signed in (identity not shown)');
    const quote = await api('GET', '/api/learn/code-runs');
    if (disabledOnly) {
      if (quote.json?.available !== false) throw new Stop(`disabled-check: the feature is ON (available ${quote.json?.available}, HTTP ${quote.status}); this check is for the OFF state.`);
      say('available is false; no reservation or limits are offered');
    } else {
      if (quote.json?.available !== true) throw new Stop(`JavaScript execution is not available on ${ORIGIN} (available ${quote.json?.available}, HTTP ${quote.status}): the activation commit or the loader is not live.`);
      if (quote.json.maximumReservedCredits !== win.reserveCredits || quote.json.limits?.maxRuns !== win.maxRuns || quote.json.limits?.maxCredits !== win.maxCredits) throw new Stop(`the deployed limits are ${JSON.stringify({ reserve: quote.json.maximumReservedCredits, ...quote.json.limits })}, not the ${o.window} window ${JSON.stringify(win)}. Use --window or fix the configuration.`);
      if (/usd|dollar|\$|micro/i.test(JSON.stringify(quote.json))) throw new Stop('the availability answer shows a dollar or micro figure to a person.');
      say(`available; ${quote.json.limits.maxRuns} lifetime runs, ${quote.json.maximumReservedCredits} credit per run`);
      const b0 = budget.status();
      if (!(b0.remaining >= BOOK_USD + 1)) throw new Stop(`the shared budget has US$${b0.remaining} left; this plan books US$${BOOK_USD} and keeps US$1 spare.`);
    }
    const created = disabledOnly ? { json: { name: 'canvas-none' } } : await api('POST', '/api/canvases', { title: `Ctrl+K JavaScript acceptance ${stamp}` });
    const canvas = created.json?.name;
    if (!canvas) throw new Stop(`could not create a canvas (HTTP ${created.status})`);
    if (!disabledOnly) { const board = `/api/learn/boards/${canvas}/main`; await api('PUT', board, { state: { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] }, version: (await api('GET', board)).json?.version }); say(`canvas ${canvas} created (delete it when you are done): ${ORIGIN}/apps/${canvas}`); }
    const create = (code, input, id = `cj_${randomUUID().replaceAll('-', '')}`, extra = {}) => ({ id, req: { id, app: canvas, board: 'main', language: 'javascript', code, input, executionConfirmed: true, maxReservedCredits: win.reserveCredits, ...extra } });
    const submit = req => api('POST', '/api/learn/code-runs', req);
    const jobOf = id => api('GET', `/api/learn/code-runs/${id}`).then(r => r.json?.job);

    if (!disabledOnly) { const booked = budget.reserve(`ctrlkcode-${stamp}`, 'ctrlk-code-acceptance', BOOK_USD); if (!booked.ok) throw new Stop(`the budget refused the booking (${booked.reason}); nothing was sent.`); bookId = `ctrlkcode-${stamp}`; say(`booked US$${BOOK_USD} as ${bookId}`); }
    const c0 = await credits();

    for (const name of names) {
      if (!o.force && deps.receipts.passed(name)) { say(`${name}: skipped, a PASS receipt exists (--force repeats it)`); continue; }
      const checks = [], receipt = { run: name, started: deps.now(), checks };
      const ok = (what, pass, detail = '') => { checks.push({ what, pass: !!pass, ...(detail ? { detail: String(detail) } : {}) }); say(`  ${pass ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!pass) throw new Stop(`${name}: ${what}${detail ? ` (${detail})` : ''}`); };
      say(`${name}:`);
      try {
        if (name === 'disabled-check') {
          const post = await submit(create('return 1;', null).req);
          ok('creating a run is refused (503 not_configured) and creates nothing', post.status === 503 && post.json?.code === 'not_configured', `HTTP ${post.status} ${post.json?.code || ''}`);
          say('  LOOK: open a canvas with a Code card, press Ctrl+K, choose Review execution. The panel must say "Execution is not configured." and offer no start button.');
          await deps.pause('  Press Enter when you saw that: ');
        } else if (name === 'refusals') {
          const base = create('return 1;', null).req;
          const refused = [
            ['a language other than JavaScript is refused (400)', { ...base, language: 'python' }, 400],
            ['a missing execution confirmation is refused (400)', { ...base, executionConfirmed: false }, 400],
            ['source over 32 KiB is refused (400)', { ...base, code: 'return "x";' + ' '.repeat(33000) }, 400],
            ['input over 16 KiB is refused (400)', { ...base, input: 'x'.repeat(17000) }, 400],
            ['an approved maximum below the reservation is refused (409 consent_bound)', { ...base, maxReservedCredits: win.reserveCredits / 2 }, 409],
            ['a field the route does not know is refused (400)', { ...base, extra: 1 }, 400],
            ['a canvas that is not yours is refused', { ...base, app: 'canvas-00000000' }, null],
          ];
          for (const [what, req, status] of refused) { const r = await submit(req); ok(what, status ? r.status === status : r.status >= 400, `HTTP ${r.status} ${r.json?.code || ''}`); }
          ok('no credits were charged by the refusals', JSON.stringify(await credits()) === JSON.stringify(c0));
        } else if (name === 'jobs') {
          receipt.jobs = [];
          for (const c of CASES) {
            const { id, req } = create(c.code, c.input ?? null);
            const first = await submit(req);
            if (first.status !== 201) throw new Stop(`${c.id}: the run was refused (HTTP ${first.status} ${first.json?.code || first.json?.error || ''})`);
            if (c.id === 'finite') { const dup = await submit(req); ok('a duplicate submit reaches the same job', dup.status === 201 && dup.json?.job?.id === id, `HTTP ${dup.status}`); const clash = await submit({ ...req, code: 'return 2;' }); ok('the same id with different code is refused (409)', clash.status === 409, `HTTP ${clash.status}`); }
            const started = deps.clock();
            const job = await poll(() => jobOf(id), j => j && TERMINAL.includes(j.phase), c.ms);
            const took = deps.clock() - started;
            if (!job) throw new Stop(`${c.id}: the job did not finish within ${c.ms / 1000} s (a stuck execution); stop and check the loader.`);
            const pass = !!c.judge(job), verdict = pass ? 'pass' : c.gate === false ? 'observe' : 'FAIL';
            receipt.jobs.push({ case: c.id, verdict, phase: job.phase, status: job.result?.status, error: job.result?.error?.message?.slice(0, 160) ?? null, reason: job.reason, waitedMs: took });
            ok(`${c.id} (${verdict}): phase ${job.phase}, ${job.result?.status || ''} ${job.result?.error?.message ? JSON.stringify(job.result.error.message.slice(0, 80)) : ''}`, verdict !== 'FAIL');
            if (c.id === 'finite') { const again = await jobOf(id); ok('a status re-read (reload recovery) returns the same finished job', again?.id === id && again.phase === job.phase && again.result?.result === 42); ok('the job view shows no source, owner, dollar or micro figure', !/\$|usd|micro|owner|email/i.test(JSON.stringify(job)) && job.code === undefined); }
          }
          const foreign = await api('GET', `/api/learn/code-runs/cj_${'e'.repeat(32)}`);
          ok('an unknown job answers 404', foreign.status === 404, `HTTP ${foreign.status}`);
        } else if (name === 'cancel') {
          const { id, req } = create('await new Promise(r => setTimeout(r, 2500)); return "late";', null);
          const first = await submit(req);
          if (first.status !== 201) throw new Stop(`cancel: the run was refused (HTTP ${first.status})`);
          const cancelled = await api('POST', `/api/learn/code-runs/${id}/cancel`, {});
          ok('cancel is accepted', cancelled.ok && cancelled.json?.job?.phase === 'cancelled', `HTTP ${cancelled.status} ${cancelled.json?.job?.phase}`);
          await deps.sleep(6000);
          const later = await jobOf(id);
          ok('cancellation wins: the late result never replaces it', later?.phase === 'cancelled' && !later.result, `phase ${later?.phase}`);
          ok('the reason does not claim termination', /not confirmed|before execution/i.test(later?.reason || ''), later?.reason);
        }
        receipt.verdict = 'PASS'; receipt.finished = deps.now();
        deps.receipts.write(name, stamp, JSON.stringify(receipt, null, 2));
        done.runs[name] = 'PASS';
        say(`${name}: PASS`);
      } catch (error) {
        receipt.verdict = 'FAIL'; receipt.failed = String(error.message || error); receipt.finished = deps.now();
        deps.receipts.write(name, stamp, JSON.stringify(receipt, null, 2));
        throw error;
      }
    }
    const c1 = await credits();
    done.credits = { before: c0, after: c1, note: 'the job budget is a global platform budget in micros; it is not the person\'s AI-credit ledger' };
    if (bookId) { budget.settle(bookId, 0.02); bookId = null; }
  } catch (error) {
    if (bookId) { try { budget.uncertain(bookId); } catch { /* already settled */ } }
    say(`FAILED: ${error.message || error}`);
    done.failed = String(error.message || error);
    deps.receipts.writeSummary(stamp, JSON.stringify(done, null, 2));
    return 1;
  }
  done.finished = deps.now();
  deps.receipts.writeSummary(stamp, JSON.stringify(done, null, 2));
  say(`ACCEPTANCE PASSED for ${Object.keys(done.runs).join(', ')}. Not covered: memory exhaustion is recorded, not gated (the runtime sets no memory limit); the lifetime budget's exhaustion behaviour (proven in unit tests only, since it would spend the real budget); concurrent users; a restart of the Durable Object mid-run; programs that need modules, timers beyond the 3 s wall deadline, or network.`);
  return 0;
}

await runEntry(import.meta.url, 'C:/s/spec/ctrlk-code-accept/receipts', 'ctrlkcode', accept);
