// Lead-only patch (scripts/ci/check-map.json): the R7a rows. Applies on top of the R4 rows (it needs them; refuses otherwise). No new e2e check: R7a adds
// unit coverage only; the web files it edits already select roadmap-command-check and roadmap-mvp-check through their R4 rows.
// A textual edit (check-map.json has duplicate keys inside one object), CRLF kept. Idempotent: refuses when already applied.
// Usage: node docs/features/explain-on-canvas/lead-patches/apply-r7a-check-map.mjs [path-to-check-map.json]   (default: scripts/ci/check-map.json)
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'scripts/ci/check-map.json';
const CP = 'packages/control-plane/', T = `${CP}test/`, W = 'packages/web/src/';
const test = (...names) => names.map(n => `${T}${n}.test.js`);

export const ROWS = {
  [`${CP}src/roadmap/roadmap-source-index.js`]: test('roadmap-source-index', 'roadmap-source-retrieval', 'roadmap-source-version'),
  [`${CP}src/roadmap/roadmap-source-summary.js`]: test('roadmap-source-retrieval'),
  [`${CP}src/agents/roadmap-index.js`]: test('roadmap-source-retrieval'),
  [`${W}roadmap-source-coverage.js`]: [`${W}roadmap-source-coverage.test.mjs`, `${W}roadmap-view.test.mjs`],
};
// Existing rows that must also select the new tests.
export const APPEND = {
  [`${CP}src/roadmap/roadmap-source-read.js`]: test('roadmap-source-version'),
  [`${CP}src/roadmap/roadmap-tools.js`]: test('roadmap-source-retrieval'),
  [`${W}RoadmapInvitation.jsx`]: [`${W}roadmap-source-coverage.test.mjs`],
  [`${W}RoadmapSurfaces.jsx`]: [`${W}roadmap-source-coverage.test.mjs`],
  [`${W}roadmap-client.js`]: [`${W}roadmap-source-coverage.test.mjs`],
  [`${W}roadmap-controller.js`]: [`${W}roadmap-source-coverage.test.mjs`],
};

const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const only = (re, what) => { const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter(i => i >= 0); if (hits.length !== 1) throw Error(`${what}: expected exactly one line, found ${hits.length}`); return hits[0]; };
const quote = list => `[${list.map(x => JSON.stringify(x)).join(',')}]`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (lines.some(l => l.includes(`"${CP}src/roadmap/roadmap-source-index.js"`))) throw Error('already applied');
if (!lines.some(l => l.includes(`"${CP}src/roadmap/roadmap-wire.js"`))) throw Error('the R4 rows are not applied yet');
const anchor = only(/^ {4}"packages\/control-plane\/src\/runbook-schema\.js":/, 'mapped anchor');
const rows = Object.entries(ROWS).map(([key, list]) => `    ${JSON.stringify(key)}: ${quote(list)},`);
lines.splice(anchor, 0, ...rows);
for (const [key, extra] of Object.entries(APPEND)) {
  const i = only(new RegExp(`^ {4}${escape(JSON.stringify(key))}: \\[`), `row ${key}`);
  const m = /^(.*)\](,?)$/.exec(lines[i]);
  if (!m) throw Error(`row ${key}: unexpected shape`);
  const have = new Set(JSON.parse(`[${m[1].slice(m[1].indexOf('[') + 1)}]`));
  lines[i] = `${m[1]}${extra.filter(x => !have.has(x)).map(x => `,${JSON.stringify(x)}`).join('')}]${m[2]}`;
}
writeFileSync(path, lines.join(eol));
console.log(`R7a check-map rows applied to ${path}: ${rows.length} rows, ${Object.keys(APPEND).length} appended`);
