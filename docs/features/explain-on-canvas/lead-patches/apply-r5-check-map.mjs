// Lead-only patch (scripts/ci/check-map.json): the R5 rows (proposal editing, existing-card links). Same textual method as apply-r4-check-map.mjs
// and apply-r6-check-map.mjs (check-map.json has duplicate keys inside one object; edited by line, CRLF kept). Independent of the R6 script: apply either first.
// Usage: node docs/features/explain-on-canvas/lead-patches/apply-r5-check-map.mjs [path-to-check-map.json]   (default: scripts/ci/check-map.json)
// Idempotent: refuses when already applied.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'scripts/ci/check-map.json';
const CP = 'packages/control-plane/', T = `${CP}test/`, W = 'packages/web/src/';
const test = (...names) => names.map(n => `${T}${n}.test.js`);
const EDIT = ['roadmap-edit-check.mjs', `${W}inline-ai-proposal.test.mjs`, `${W}roadmap-proposal-context.test.mjs`];

export const ROWS = {
  [`${CP}src/roadmap/roadmap-edit.js`]: test('roadmap-proposal-drafts'),
  [`${CP}src/roadmap/roadmap-proposal-drafts.js`]: test('roadmap-proposal-drafts'),
  [`${CP}src/roadmap/roadmap-links.js`]: test('roadmap-links'),
  [`${W}inline-ai-proposal.js`]: EDIT,
  [`${W}roadmap-proposal-context.js`]: EDIT,
};
// One new check (fork tier, faked job server). seconds are a first estimate until CI measures them. NOTE: scripts/ci/check-map.test.mjs 'a broad selection splits
// into six parts' has no headroom at the R4 tip (see r6-lead-patches.md); a second added check needs the same Lead decision.
export const CHECKS = { 'roadmap-edit-check.mjs': 45 };
// Existing rows that must also select the R5 coverage because R5 edited the file.
export const APPEND = {
  [`${CP}src/roadmap/roadmap-routes.js`]: test('roadmap-proposal-drafts', 'roadmap-links'),
  [`${CP}src/roadmap/roadmap-store.js`]: test('roadmap-proposal-drafts'),
  [`${CP}src/roadmap/roadmap-view.js`]: test('roadmap-links'),
  [`${CP}src/roadmap/roadmap-wire.js`]: test('roadmap-proposal-drafts'),
  [`${CP}src/roadmap/roadmap-models.js`]: test('roadmap-proposal-drafts'),
  [`${W}NextStepPill.jsx`]: EDIT,
  [`${W}RoadmapSurfaces.jsx`]: EDIT,
  [`${W}roadmap-client.js`]: EDIT,
  [`${W}roadmap-controller.js`]: EDIT,
  [`${W}roadmap-strings.js`]: EDIT,
  [`${W}use-roadmap.js`]: EDIT,
  'packages/web/e2e/roadmap-fake-server.mjs': ['roadmap-edit-check.mjs'],
};

const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const only = (re, what) => { const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter(i => i >= 0); if (hits.length !== 1) throw Error(`${what}: expected exactly one line, found ${hits.length}`); return hits[0]; };
const quote = list => `[${list.map(x => JSON.stringify(x)).join(',')}]`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (lines.some(l => l.includes(`"${CP}src/roadmap/roadmap-edit.js"`))) throw Error('already applied');
const anchor = only(/^ {4}"packages\/control-plane\/src\/runbook-schema\.js":/, 'mapped anchor');
const rows = Object.entries(ROWS).map(([key, list]) => `    ${JSON.stringify(key)}: ${quote(list)},`);
lines.splice(anchor, 0, ...rows);
const head = only(/^ {2}"checks": \{/, 'checks head');
lines.splice(head + 1, 0, ...Object.entries(CHECKS).map(([name, seconds]) => `    ${JSON.stringify(name)}: {"runner": "fork", "seconds": ${seconds}},`));
for (const [key, extra] of Object.entries(APPEND)) {
  const i = only(new RegExp(`^ {4}${escape(JSON.stringify(key))}: \\[`), `row ${key}`);
  const m = /^(.*)\](,?)$/.exec(lines[i]);
  if (!m) throw Error(`row ${key}: unexpected shape`);
  const have = new Set(JSON.parse(`[${m[1].slice(m[1].indexOf('[') + 1)}]`));
  const add = extra.filter(x => !have.has(x));
  lines[i] = `${m[1]}${add.map(x => `,${JSON.stringify(x)}`).join('')}]${m[2]}`;
}
writeFileSync(path, lines.join(eol));
console.log(`R5 check-map rows applied to ${path}: ${rows.length} rows, ${Object.keys(CHECKS).length} check, ${Object.keys(APPEND).length} appended`);
