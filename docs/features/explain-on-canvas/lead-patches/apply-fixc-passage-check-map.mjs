// Lead-only patch (scripts/ci/check-map.json): the Fix C passage rows (a minted raw-Markdown quote found in the rendered text, markdown-anchor.js). Same textual method as
// apply-canvas-slot-check-map.mjs. The new file needs a class in the push that adds it; the files it serves also select its unit test. Browser checks: the existing
// source-ref checks (they press View passage and View explanation).
// Usage: node docs/features/explain-on-canvas/lead-patches/apply-fixc-passage-check-map.mjs [path-to-check-map.json]   (default: scripts/ci/check-map.json)
// Idempotent: refuses when already applied.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'scripts/ci/check-map.json';
const W = 'packages/web/src/';
const UNIT = [`${W}markdown-anchor.test.mjs`];

export const ROWS = {
  [`${W}markdown-anchor.js`]: ['source-ref-command-check.mjs', 'source-ref-mvp-check.mjs', ...UNIT, `${W}source-refs.test.mjs`],
};
export const APPEND = {
  [`${W}source-ref.js`]: UNIT,
  [`${W}FileDocMarkdown.jsx`]: UNIT,
};

const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const only = (re, what) => { const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter(i => i >= 0); if (hits.length !== 1) throw Error(`${what}: expected exactly one line, found ${hits.length}`); return hits[0]; };
const quote = list => `[${list.map(x => JSON.stringify(x)).join(',')}]`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (lines.some(l => l.includes(`"${W}markdown-anchor.js"`))) throw Error('already applied');
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
console.log(`Fix C passage check-map rows applied to ${path}: ${Object.keys(ROWS).length} rows, ${Object.keys(APPEND).length} appended`);
