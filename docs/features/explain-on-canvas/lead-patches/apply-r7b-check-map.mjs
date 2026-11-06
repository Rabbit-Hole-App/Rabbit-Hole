// Lead-only patch (scripts/ci/check-map.json): the R7b rows. Applies on top of the R4 and R7a rows (it needs both; refuses otherwise). No new e2e check:
// R7b adds unit coverage only; the web file it edits already selects roadmap-command-check and roadmap-mvp-check through its R4 row.
// A textual edit (check-map.json has duplicate keys inside one object), CRLF kept. Idempotent.
// Usage: node docs/features/explain-on-canvas/lead-patches/apply-r7b-check-map.mjs [path-to-check-map.json]   (default: scripts/ci/check-map.json)
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'scripts/ci/check-map.json';
const CP = 'packages/control-plane/', T = `${CP}test/`, W = 'packages/web/src/';
const PDF = `${T}roadmap-source-pdf.test.js`;

export const ROWS = {
  [`${CP}src/roadmap/roadmap-source-pdf.js`]: [PDF],
};
// Existing rows that must also select the PDF tests (the files R7b edits or imports).
export const APPEND = {
  [`${CP}src/roadmap/roadmap-source-index.js`]: [PDF],
  [`${CP}src/roadmap/roadmap-source-read.js`]: [PDF],
  [`${CP}src/roadmap/roadmap-source-reader.js`]: [PDF],
  [`${CP}src/roadmap/roadmap-source-refs.js`]: [PDF],
  [`${CP}src/roadmap/roadmap-access.js`]: [PDF],
  [`${CP}src/learn-context-docs.js`]: [PDF],
  [`${CP}src/pdf-pages.js`]: [PDF],
};

const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const only = (re, what) => { const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter(i => i >= 0); if (hits.length !== 1) throw Error(`${what}: expected exactly one line, found ${hits.length}`); return hits[0]; };
const quote = list => `[${list.map(x => JSON.stringify(x)).join(',')}]`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (lines.some(l => l.includes(`"${CP}src/roadmap/roadmap-source-pdf.js"`))) throw Error('already applied');
if (!lines.some(l => l.includes(`"${CP}src/roadmap/roadmap-source-index.js"`))) throw Error('the R7a rows are not applied yet');
const anchor = only(/^ {4}"packages\/control-plane\/src\/runbook-schema\.js":/, 'mapped anchor');
lines.splice(anchor, 0, ...Object.entries(ROWS).map(([key, list]) => `    ${JSON.stringify(key)}: ${quote(list)},`));
for (const [key, extra] of Object.entries(APPEND)) {
  const i = only(new RegExp(`^ {4}${escape(JSON.stringify(key))}: \\[`), `row ${key}`);
  const m = /^(.*)\](,?)$/.exec(lines[i]);
  if (!m) throw Error(`row ${key}: unexpected shape`);
  const have = new Set(JSON.parse(`[${m[1].slice(m[1].indexOf('[') + 1)}]`));
  lines[i] = `${m[1]}${extra.filter(x => !have.has(x)).map(x => `,${JSON.stringify(x)}`).join('')}]${m[2]}`;
}
writeFileSync(path, lines.join(eol));
console.log(`R7b check-map rows applied to ${path}: ${Object.keys(ROWS).length} rows, ${Object.keys(APPEND).length} appended`);
