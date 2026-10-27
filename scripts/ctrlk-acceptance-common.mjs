// Shared plumbing of the two deployed Ctrl+K acceptance commands (ctrlk-image-acceptance.mjs, ctrlk-code-acceptance.mjs), in the style of
// scripts/image-acceptance.mjs: production origin only, the owner's session cookie at a hidden prompt (memory only), every paid run booked in the
// shared budget BEFORE its request and settled after, receipts that hold no secret, stop at the first failure.
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

export const ORIGIN = 'https://digrabbithole.com';
export const BUDGET = 'C:/s/spec/budget/budget.mjs';
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export class Stop extends Error {}
export const COOKIE_RE = /^[\x21-\x7e]{16,4096}$/;

// One request to the production origin, with the cookie; nothing else ever carries it.
export function apiFor(deps, cookie) {
  return async (method, path, body, extra = {}) => {
    const res = await deps.fetch(`${ORIGIN}${path}`, { method, headers: { cookie: `small_session=${cookie}`, origin: ORIGIN, ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : extra.headers || {}) }, body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) });
    let json = null, bytes = null;
    if (extra.raw) bytes = Buffer.from(await res.arrayBuffer()); else json = await res.json().catch(() => null);
    return { status: res.status, ok: res.status < 400, json, bytes, headers: res.headers };
  };
}

// The real entry: the shared ledger only (a private BUDGET_FILE is refused), the budget module loaded only for a real run, the fetch pinned to the origin.
export async function runEntry(metaUrl, defaultOut, receiptPrefix, accept) {
  if (!(process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href)) return;
  const { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } = await import('node:fs');
  const args = process.argv.slice(2), outIndex = args.indexOf('--out'), out = outIndex >= 0 ? args[outIndex + 1] : defaultOut;
  let budget = null;
  if (!args.includes('--dry-run')) {
    if (process.env.BUDGET_FILE) { console.log('refused: BUDGET_FILE is set; the acceptance books only in the shared ledger.'); process.exit(2); }
    const b = await import(pathToFileURL(BUDGET).href);
    budget = { status: b.status, reserve: b.reserve, settle: b.settle, uncertain: b.uncertain, release: b.release };
  }
  const deps = {
    out: line => console.log(line), now: () => new Date().toISOString(), clock: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms)), budget,
    interactive: () => !!(process.stdin.isTTY && process.stdout.isTTY),
    askHidden: q => new Promise(res => { process.stdout.write(q); const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true }); rl._writeToOutput = () => {}; rl.question('', a => { rl.close(); process.stdout.write('\n'); res(a); }); }),
    pause: q => new Promise(res => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, () => { rl.close(); res(); }); }),
    fetch: (url, init) => { if (!url.startsWith(`${ORIGIN}/`)) throw new Error('refused: not the production origin'); return fetch(url, { ...init, signal: AbortSignal.timeout(60_000), redirect: 'manual' }); },
    receipts: {
      passed: name => existsSync(out) && readdirSync(out).some(f => f.startsWith(`${receiptPrefix}-${name}-`) && f.endsWith('.json') && JSON.parse(readFileSync(`${out}/${f}`, 'utf8')).verdict === 'PASS'),
      write: (name, stamp, text) => { mkdirSync(out, { recursive: true }); writeFileSync(`${out}/${receiptPrefix}-${name}-${stamp}.json`, text); },
      writeSummary: (stamp, text) => { mkdirSync(out, { recursive: true }); writeFileSync(`${out}/${receiptPrefix}-summary-${stamp}.json`, text); },
    },
  };
  process.exit(await accept(args, deps));
}
