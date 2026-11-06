// Lead-only patch (scripts/ci/check-map.json): the R6 rows (automatic next proposals). Same textual method as apply-r4-check-map.mjs, because
// check-map.json has duplicate keys inside one object (edited by line, CRLF kept).
// Usage: node docs/features/explain-on-canvas/lead-patches/apply-r6-check-map.mjs [path-to-check-map.json]   (default: scripts/ci/check-map.json)
// Idempotent: refuses when already applied. Prove it on a copy: copy the map, run this on the copy, run check-map.test.mjs / affected.mjs against it.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'scripts/ci/check-map.json';
const CP = 'packages/control-plane/', T = `${CP}test/`, W = 'packages/web/src/';
const test = (...names) => names.map(n => `${T}${n}.test.js`);
const AUTO = ['roadmap-auto-check.mjs', `${W}roadmap-auto.test.mjs`];

export const ROWS = {
  [`${CP}src/roadmap/roadmap-auto.js`]: test('roadmap-auto-proposal', 'roadmap-auto-events'),
  [`${CP}src/roadmap/roadmap-settings-events.js`]: test('roadmap-auto-events', 'roadmap-auto-proposal'),
  [`${T}roadmap-auto-fixture.js`]: test('roadmap-auto-proposal', 'roadmap-auto-events'),
  [`${W}roadmap-auto.js`]: [...AUTO, `${W}roadmap-controller.test.mjs`],
};
// One new check (fork tier, faked job server). seconds are a first estimate until CI measures them.
export const CHECKS = { 'roadmap-auto-check.mjs': 60 };
// Existing rows that must also select the R6 coverage because R6 edited the file.
export const APPEND = {
  [`${W}roadmap-controller.js`]: AUTO,
  'packages/web/e2e/roadmap-fake-server.mjs': ['roadmap-auto-check.mjs'],
  [`${CP}src/roadmap/roadmap-routes.js`]: test('roadmap-auto-proposal'),
  [`${CP}src/learn-user-settings.js`]: test('roadmap-auto-events'),
};

const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const only = (re, what) => { const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter(i => i >= 0); if (hits.length !== 1) throw Error(`${what}: expected exactly one line, found ${hits.length}`); return hits[0]; };
const quote = list => `[${list.map(x => JSON.stringify(x)).join(',')}]`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (lines.some(l => l.includes(`"${CP}src/roadmap/roadmap-auto.js"`))) throw Error('already applied');
// 1. New rows go in front of the runbook-schema row, as R4's did.
const anchor = only(/^ {4}"packages\/control-plane\/src\/runbook-schema\.js":/, 'mapped anchor');
const rows = Object.entries(ROWS).map(([key, list]) => `    ${JSON.stringify(key)}: ${quote(list)},`);
lines.splice(anchor, 0, ...rows);
// 2. The check, at the head of "checks".
const head = only(/^ {2}"checks": \{/, 'checks head');
lines.splice(head + 1, 0, ...Object.entries(CHECKS).map(([name, seconds]) => `    ${JSON.stringify(name)}: {"runner": "fork", "seconds": ${seconds}},`));
// 3. Append to existing rows: the value array ends at the last ] of its line.
for (const [key, extra] of Object.entries(APPEND)) {
  const i = only(new RegExp(`^ {4}${escape(JSON.stringify(key))}: \\[`), `row ${key}`);
  const m = /^(.*)\](,?)$/.exec(lines[i]);
  if (!m) throw Error(`row ${key}: unexpected shape`);
  const have = new Set(JSON.parse(`[${m[1].slice(m[1].indexOf('[') + 1)}]`));
  const add = extra.filter(x => !have.has(x));
  lines[i] = `${m[1]}${add.map(x => `,${JSON.stringify(x)}`).join('')}]${m[2]}`;
}
writeFileSync(path, lines.join(eol));
console.log(`R6 check-map rows applied to ${path}: ${rows.length} rows, ${Object.keys(CHECKS).length} check, ${Object.keys(APPEND).length} appended`);
