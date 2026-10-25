// Static guard for the fork-tier browser checks (flake lane, 2026-10-24): no fork check may mint a session (/test/session) or call
// the standalone control plane (SMALL_CP, port 8879) after its browser has launched.
//
// Why: the fast-tier and gate stacks run two `wrangler dev --persist-to` processes on the same local D1 sqlite files (the app on
// 8878 and the standalone control plane on 8879). workerd opens those files with WAL and no busy handler it exposes, so a
// control-plane request while a page is polling the app's session read gives SQLITE_BUSY; control-plane/src/auth.js sessionOf
// fails closed on any D1 error to 401, and the page leaves for /login for the rest of the check (CI runs 40140822538 and
// 40136801962 pdf-excerpt-check, comments-delete step 15). Mint every session before the browser launches.
//
// Scope: the checks check-map.json puts in the `fork` runner tier (read here, at test time) and the local modules they import.
// A hit is any line after the first browser launch that (a) mints directly or through a helper whose definition mints, (b) uses
// the control plane origin, or (c) runs the wrangler D1 CLI (a third process writing the same files). Comment lines are skipped.
// This is a text scan, not a flow analysis: it cannot see a call reached through an indirection it does not know, and a launch
// without a page open is still counted as "after launch" (the conservative side).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const E2E = new URL('packages/web/e2e/', root);
const read = file => readFileSync(new URL(file, E2E), 'utf8').replace(/\r\n/g, '\n');

// Deliberate cases. Each entry must still match something (a stale entry fails below), so the list cannot silently grow stale.
// start-sources-check.mjs seeds its project through the wrangler D1 CLI too, but at module level before the browser launches, so
// it needs no entry; if that seed ever moves after the launch this test names it.
//
// `pending` entries are violations already fixed on a branch that has not reached this tree yet: they carry the branch and are
// exempt from the stale check, so the fix can merge in either order; delete the entry in the merge that lands the fix.
export const ALLOW = {
  'pdf-excerpt-check.mjs': {
    kinds: ['mint'], pending: 'fix/pdf-excerpt-flake c52fd9ed (CI runs 40140822538, 40136801962, fixed run 40142601463)',
    why: 'mints the other and viewer sessions inside the fork and share-viewer steps while the owner page is open',
  },
  'shared-header-check.mjs': {
    kinds: ['mint'], pending: 'fix/session-mint-order d038ab5c (parked by the integrator, 2026-10-24)',
    why: 'mints two extra owners between page blocks; every earlier context is closed at that point, so the contention window is small',
  },
  'webpage-card-check.mjs': {
    kinds: ['d1-cli'],
    why: 'seeds file_sources rows through `wrangler d1 execute --local` (lines after the launch, before any page opens) and flips one '
      + 'file source status mid-step on purpose (steps around the stored/uploading toggle); the state change is the point of the step and a '
      + 'LEARN_DB write, not a session read',
  },
};

const LAUNCH = /\.launch\(|launchPersistentContext\(|launchEngine\(|launchAvailable\(/;
const isComment = line => /^\s*(\/\/|\*|\/\*)/.test(line);

// One file's text -> [{ line, kind, text }] for everything the rule forbids after the first launch.
export function scan(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const launch = lines.findIndex((l, i) => !isComment(l) && LAUNCH.test(l) && !/^\s*(export\s+)?(async\s+)?function\b/.test(l)
    && !/(const|let)\s+(launchEngine|launchAvailable)\b/.test(l));
  if (launch < 0) return [];
  // Helpers whose own definition (the line or the two after it) mints: calls to them are mints.
  const helpers = new Map(), defLines = new Set();
  lines.forEach((l, i) => {
    const def = l.match(/^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\b|\(|[A-Za-z_$][\w$]*\s*=>)/) || l.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (!def) return;
    // The definition is its own statement: this line and its continuation lines up to the next declaration (at most 6).
    let end = i + 1;
    while (end < Math.min(lines.length, i + 6) && !/^\s*(const|let|var|function|async\s+function|export|await|for|if)\b/.test(lines[end])) end++;
    const body = lines.slice(i, end).join('\n');
    const kind = /test\/session/.test(body) ? 'mint' : /'d1',\s*'execute'/.test(body) ? 'd1-cli' : null;
    if (kind) { helpers.set(def[1], kind); for (let k = i; k < end; k++) defLines.add(k); }
  });
  const hits = [];
  lines.forEach((l, i) => {
    if (i <= launch || isComment(l) || defLines.has(i)) return;
    const text = l.trim().slice(0, 140);
    if (/test\/session/.test(l)) hits.push({ line: i + 1, kind: 'mint', text });
    else if (/\$\{CP\}|\bCP\s*\+|process\.env\.SMALL_CP|:8879/.test(l) && !/\bCP\s*=|\[BASE,\s*CP\]|\.test\(url\)/.test(l)) hits.push({ line: i + 1, kind: 'control-plane', text });
    else if (/'d1',\s*'execute'/.test(l)) hits.push({ line: i + 1, kind: 'd1-cli', text });
    else for (const [name, kind] of helpers) {
      const at = l.indexOf(`${name}(`);
      if (at >= 0 && !/[\w$]/.test(l[at - 1] || '') && !/(const|let|function)\s+$/.test(l.slice(0, at))) { hits.push({ line: i + 1, kind, text }); break; }
    }
  });
  return hits;
}

const forkChecks = () => {
  const map = JSON.parse(readFileSync(new URL('scripts/ci/check-map.json', root), 'utf8'));
  return Object.entries(map.checks).filter(([, v]) => v.runner === 'fork').map(([name]) => name);
};
// The check and the local modules it imports, one level.
const unitsOf = name => {
  const out = [name];
  for (const m of read(name).matchAll(/from\s+'\.\/([\w.-]+\.mjs)'/g)) if (existsSync(new URL(m[1], E2E)) && !out.includes(m[1])) out.push(m[1]);
  return out;
};

test('the scanner catches a session minted, a control-plane call and a D1 CLI write after the browser launched, and passes the right order', () => {
  const bad = [
    "const mint = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST' })).json()).session;",
    'const sql = s => wrangler([\'d1\', \'execute\', \'db\', \'--command\', s]);',
    'const owner = await mint(`a-${run}`);',
    'const browser = await chromium.launch();',
    '// await mint(`in a comment`);',
    'const later = await mint(`b-${run}`);',
    "const direct = await fetch(`${CP}/test/session`, { method: 'POST' });",
    "const members = await fetch(`${CP}/api/members`);",
    "sql('UPDATE t SET x = 1');",
  ].join('\n');
  assert.deepEqual(scan(bad).map(h => [h.line, h.kind]), [[6, 'mint'], [7, 'mint'], [8, 'control-plane'], [9, 'd1-cli']]);
  const good = bad.split('\n').filter((_, i) => i < 3).concat(['const browser = await chromium.launch();', 'await page.goto(BASE);']).join('\n');
  assert.deepEqual(scan(good), []);
  // The validation line and the declaration are not requests.
  assert.deepEqual(scan("const browser = await chromium.launch();\nfor (const url of [BASE, CP]) if (!/x/.test(url)) throw Error('local only');\nconst CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';"), []);
  // CRLF sources scan the same.
  assert.deepEqual(scan(bad.replace(/\n/g, '\r\n')).map(h => h.line), [6, 7, 8, 9]);
});

test('the fork tier is read from check-map.json and every fork check file exists', () => {
  const names = forkChecks();
  assert.ok(names.length >= 40, `fork checks: ${names.length}`);
  for (const name of names) assert.ok(existsSync(new URL(name, E2E)), `${name} is in the fork tier of check-map.json but not in packages/web/e2e`);
  for (const name of ['pdf-excerpt-check.mjs', 'comments-delete-check.mjs', 'pinned-study-check.mjs']) assert.ok(names.includes(name), `${name} is expected in the fork tier`);
});

test('no fork-tier check mints a session or calls the control plane after its browser launched (the allow-list names the deliberate cases)', () => {
  const found = [], used = new Set();
  for (const name of forkChecks()) for (const unit of unitsOf(name)) {
    for (const hit of scan(read(unit))) {
      const allowed = ALLOW[unit]?.kinds.includes(hit.kind);
      if (allowed) used.add(unit);
      else found.push(`${unit}:${hit.line} (${hit.kind}) ${hit.text}`);
    }
  }
  assert.deepEqual(found, [], `mint every session before the browser launches (see the header of ${fileURLToPath(import.meta.url).split(/[\\/]/).pop()}); a deliberate case goes in ALLOW with its reason`);
  for (const [unit, entry] of Object.entries(ALLOW)) if (!entry.pending) assert.ok(used.has(unit),`ALLOW has a stale entry: ${unit} no longer has a hit of its allowed kinds`);
});
