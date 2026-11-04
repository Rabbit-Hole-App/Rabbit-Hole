// Gate 2 test sessions (AN-21, docs/features/animation/gate2-qualification.md): N distinct dev test sessions (1 to 5), so Gate 2 runs its jobs
// in parallel and each test user has its own monthly allowance. Dev only; never production (production has no test bypass).
//
//   node scripts/animation/dev-test-session.mjs --check --count 5 [--fresh]                  no network, no write: validates the configuration
//   node scripts/animation/dev-test-session.mjs --mint --fresh --count 5                    FRESH users for one Gate 2 run: g2-<UTC yyyymmddhhmm>-1..5@example.com, a per-run sessions file
//   node scripts/animation/dev-test-session.mjs --mint --count 5 [--prefix gate2]           fixed identities <prefix>-1..N@example.com into one sessions file (dev D1 user rows)
//   node scripts/animation/dev-test-session.mjs --allowance --base <preview origin> --file F  read-only GET /api/learn/usage per session: credits used and left
//
// Why fresh: the billing escrow lets a learner fail 5 generations free per day (MVP2a); a reused test user hits it ("approve HTTP 429"). So a Gate 2
// run gets its own users, and a prefix that has run before is never reused (<out>/used-prefixes.json, written by --mint --fresh and by sgd-qualify).
// Identities are dev test people at the example.com reserved test domain, <prefix>-1 .. <prefix>-N@example.com. The bypass secret
// RABBIT_HOLE_DEV_TEST_BYPASS is read BY NAME from the credentials file at run time and never printed. Cookie values are written only to the
// sessions file (outside the repository, owner-only mode); the screen shows the cookie NAME and a placeholder.
import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
export const COOKIE = 'small_session';
export const CREDENTIALS = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
export const SECRET_NAME = 'RABBIT_HOLE_DEV_TEST_BYPASS';
export const SESSIONS_FILE = 'C:/s/spec/animation/sgd-mvp1-acceptance/gate2-sessions.json';
export const RUN_OUT = 'C:/s/spec/animation/sgd-mvp1-acceptance/release-2';
export const MAX_SESSIONS = 5;
const UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' }; // Cloudflare answers some default client agents with 1010
const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url))).replaceAll('\\', '/').toLowerCase();
const EMAIL = /^[a-z0-9._+-]+@example\.com$/i;

export const utcStamp = (date = new Date()) => date.toISOString().replace(/\D/g, '').slice(0, 12); // yyyymmddhhmm
// The prefixes that have been minted or have run, in the out folder. A file that exists but cannot be read is an error, never "nothing used".
const USED = 'used-prefixes.json';
export function readUsed(outDir) {
  const file = join(outDir, USED);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { prefixes: {} };
}
export function markUsed(outDir, prefix, patch) {
  const used = readUsed(outDir);
  used.prefixes[prefix] = { ...used.prefixes[prefix], ...patch };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, USED), JSON.stringify(used, null, 1));
}
// The one prefix of a sessions file (<prefix>-<n>@example.com for every session), or null when the emails do not share one.
export const prefixOf = emails => { const found = emails.map(e => /^(.+)-\d+@example\.com$/i.exec(e)?.[1]); return found.length && found.every(x => x && x === found[0]) ? found[0] : null; };
export const emailsFor = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}@example.com`);
export const insideRepo = path => `${resolve(path).replaceAll('\\', '/').toLowerCase()}/`.startsWith(`${REPO}/`);
// -> the value of NAME in a KEY=value file, or '' (missing). The caller must never print it.
export const readKey = (file, name) => {
  try { return (readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^['"]|['"]$/g, ''); } catch { return ''; }
};

// One request function over fetch: call(method, path, body) -> { status, data }. A transient network error is retried for GET only, never for a POST
// (a create or approve must not be sent twice).
export function makeCall({ base, session, fetchImpl = globalThis.fetch, retries = 5, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  return async (method, path, body) => {
    const init = { method, headers: { ...UA, cookie: `${COOKIE}=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: base } : {}) }, body: body ? JSON.stringify(body) : undefined };
    for (let i = 0; ; i += 1) {
      try { const r = await fetchImpl(`${base}${path}`, init); return { status: r.status, data: await r.json().catch(() => null) }; }
      catch (error) { if (method !== 'GET' || i >= retries) throw error; await wait(2000); }
    }
  };
}

export async function mint({ devCp = DEV_CP, email, secret, fetchImpl = globalThis.fetch }) {
  const r = await fetchImpl(`${devCp}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, secret }) });
  const session = (await r.json().catch(() => ({}))).session;
  if (!session) throw new Error(`no dev session for ${email} (HTTP ${r.status})`); // the status only: nothing from the exchange is echoed
  return session;
}

// The sessions file: { cookie, devCp, mintedAt, sessions: [{ email, value }] }, 1 to 5 distinct example.com identities.
export function writeSessions(file, record) {
  if (insideRepo(file)) throw new Error(`refusing to write session cookies inside the repository: ${file}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(record, null, 1), { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* shortcut: Windows ignores the mode; the file sits under the owner's profile-protected C:/s tree */ }
}
export function readSessions(file) {
  const record = JSON.parse(readFileSync(file, 'utf8')), list = record?.sessions;
  if (record?.cookie !== COOKIE || !Array.isArray(list) || !list.length || list.length > MAX_SESSIONS) throw new Error(`${file} is not a sessions file (cookie ${COOKIE} and 1 to ${MAX_SESSIONS} sessions expected)`);
  if (list.some(s => !s?.value || !EMAIL.test(s.email)) || new Set(list.map(s => s.email.toLowerCase())).size !== list.length) throw new Error(`${file}: every session needs a value and a distinct example.com email`);
  return list;
}

// GET /api/learn/usage as the session's user: the monthly allowance, free to call. -> { status, usage }
export const readUsage = async call => { const r = await call('GET', '/api/learn/usage'); return { status: r.status, usage: r.data }; };
export const usable = ({ status, usage }) => status === 200 && !!usage && !usage.unavailable && typeof usage.remainingCredits === 'number';
export function usageLine(read) {
  if (read.status === 401) return 'usage: the session was refused (401); mint a new one with --mint --replace';
  if (!usable(read)) return `usage: unavailable (HTTP ${read.status}${read.usage?.unavailable ? `, ${read.usage.unavailable}` : ''})`;
  const u = read.usage;
  return `usage ${u.period}: used ${u.usedCredits} of ${u.allowanceCredits} credits, left ${u.remainingCredits} (reserved ${u.reservedCredits}, unknown attempts ${u.unknownAttempts}); resets ${u.resetsAt}`;
}
export const PACING = 'platform day cap: USAGE_PLATFORM_DAY_USD is US$40 on the dev clone, shared by every lane and measured over a ROLLING 24 hours (settled cost plus the worst-case reserve of calls in flight); this script cannot read it, so add the other lanes to the run\'s settled cost (docs/features/animation/gate2-qualification.md)';

export const parse = argv => {
  const { values } = parseArgs({ args: argv, strict: true, options: {
    check: { type: 'boolean' }, mint: { type: 'boolean' }, allowance: { type: 'boolean' }, replace: { type: 'boolean' }, fresh: { type: 'boolean' },
    count: { type: 'string' }, prefix: { type: 'string' }, file: { type: 'string' }, out: { type: 'string', default: RUN_OUT }, base: { type: 'string' },
    'dev-cp': { type: 'string', default: DEV_CP }, credentials: { type: 'string', default: CREDENTIALS } } });
  if ([values.check, values.mint, values.allowance].filter(Boolean).length !== 1) throw new Error('give exactly one of --check, --mint, --allowance');
  if (values.fresh && (values.prefix || values.replace || values.allowance)) throw new Error('--fresh picks its own prefix and never replaces: do not combine it with --prefix, --replace or --allowance');
  values.prefix ??= 'gate2';
  if (!/^[a-z0-9._+-]+$/i.test(values.prefix)) throw new Error(`--prefix is not valid in an email local part: ${values.prefix}`);
  if (values.check || values.mint) {
    values.count = Number(values.count);
    if (!Number.isInteger(values.count) || values.count < 1 || values.count > MAX_SESSIONS) throw new Error(`--count must be a whole number from 1 to ${MAX_SESSIONS}`);
  }
  if (values.allowance && !/^https:\/\/[^/\s]+$/.test(values.base || '')) throw new Error('--allowance needs --base <https://preview origin, no path>');
  return values;
};

export async function main(argv, { out = console.log, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  let o;
  try { o = parse(argv); } catch (error) { out(`USAGE: ${error.message}`); return 2; }
  const prefix = o.fresh ? `g2-${utcStamp(now())}` : o.prefix;
  const file = o.file ?? (o.fresh ? join(dirname(SESSIONS_FILE), `gate2-sessions-${prefix}.json`) : SESSIONS_FILE);
  if (o.check) {
    const problems = [];
    if (!readKey(o.credentials, SECRET_NAME)) problems.push(`${SECRET_NAME} is missing from ${o.credentials}`);
    if (insideRepo(file)) problems.push(`the sessions file is inside the repository: ${file}`);
    if (o.fresh) { try { if (readUsed(o.out).prefixes[prefix]) problems.push(`the prefix ${prefix} was already used (${join(o.out, USED)}); wait for the next minute`); } catch (error) { problems.push(`${join(o.out, USED)} cannot be read: ${error.message}`); } }
    let dir = resolve(dirname(file)); while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
    try { accessSync(dir, constants.W_OK); } catch { problems.push(`no write access to ${dir}`); }
    out(`would mint ${emailsFor(prefix, o.count).join(', ')} (dev test identities at example.com); sessions file ${file} ${existsSync(file) ? 'exists' : 'absent'}; ${SECRET_NAME} ${readKey(o.credentials, SECRET_NAME) ? 'present' : 'MISSING'} (name only)`);
    out(problems.length ? `CHECK FAILED: ${problems.join('; ')}` : 'CHECK OK: configuration is valid; no network request was made');
    return problems.length ? 2 : 0;
  }
  if (o.mint) {
    if (existsSync(file) && (o.fresh || !o.replace)) { out(`REFUSED: ${file} exists${o.fresh ? '' : '; --replace mints new cookies over it'}`); return 2; }
    if (o.fresh) {
      try { if (readUsed(o.out).prefixes[prefix]) { out(`REFUSED: the prefix ${prefix} was already minted or has run (${join(o.out, USED)}); a prefix is never reused, try again in the next minute`); return 2; } }
      catch (error) { out(`REFUSED: ${join(o.out, USED)} cannot be read (${error.message}); a used prefix could be reused`); return 2; }
    }
    const secret = readKey(o.credentials, SECRET_NAME);
    if (!secret) { out(`REFUSED: ${SECRET_NAME} is missing from ${o.credentials}`); return 2; }
    const emails = emailsFor(prefix, o.count), sessions = [];
    out(`announce: this writes ${emails.length} dev user rows (${emails.join(', ')}) to the shared dev D1 through ${o['dev-cp']}/test/session`);
    try {
      for (const email of emails) sessions.push({ email, value: await mint({ devCp: o['dev-cp'], email, secret, fetchImpl }) });
      writeSessions(file, { cookie: COOKIE, devCp: o['dev-cp'], mintedAt: now().toISOString(), sessions });
      if (o.fresh) markUsed(o.out, prefix, { mintedAt: now().toISOString() });
    } catch (error) { out(`FAILED: ${error.message}${sessions.length ? ` (${sessions.length} minted before it; nothing was written)` : ''}`); return 1; }
    out(`minted ${sessions.length} dev test sessions on ${o['dev-cp']}: ${emails.join(', ')}\ncookie ${COOKIE}=<redacted>, stored in ${file}${o.fresh ? `\nuse it for ONE run: sgd-qualify.mjs --sessions-file ${file}` : ''}`);
    return 0;
  }
  let sessions;
  try { sessions = readSessions(file); } catch (error) { out(`FAILED: ${error.message}`); return 2; }
  for (const s of sessions) out(`${s.email}: ${usageLine(await readUsage(makeCall({ base: o.base, session: s.value, fetchImpl })))}`);
  out(PACING);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
