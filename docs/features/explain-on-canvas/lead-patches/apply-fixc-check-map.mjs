// Lead-only patch (scripts/ci/check-map.json): the Fix C rows (the Tutor's offers as cards on the canvas). Same textual method as apply-r5-check-map.mjs
// (check-map.json has duplicate keys inside one object; edited by line, line endings kept). Two new web files need a class in the push that adds them, and the
// canvas files they extend select their unit tests. No new browser check (an e2e budget decision stays with the Lead; the existing roadmap checks already select
// on RoadmapSurfaces.jsx).
// Usage: node docs/features/explain-on-canvas/lead-patches/apply-fixc-check-map.mjs [path-to-check-map.json]   (default: scripts/ci/check-map.json)
// Idempotent: refuses when already applied.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'scripts/ci/check-map.json';
const W = 'packages/web/src/';
const UNIT = [`${W}roadmap-canvas.test.mjs`, `${W}proposal-card.test.mjs`];

export const ROWS = {
  [`${W}roadmap-canvas.js`]: UNIT,
  [`${W}ProposalCard.jsx`]: UNIT,
};
export const APPEND = {
  [`${W}AdaptiveCanvas.jsx`]: UNIT,
  [`${W}canvas-slots.js`]: UNIT,
  [`${W}roadmap-placement.js`]: UNIT,
};

const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const only = (re, what) => { const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter(i => i >= 0); if (hits.length !== 1) throw Error(`${what}: expected exactly one line, found ${hits.length}`); return hits[0]; };
const quote = list => `[${list.map(x => JSON.stringify(x)).join(',')}]`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (lines.some(l => l.includes(`"${W}roadmap-canvas.js"`))) throw Error('already applied');
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
console.log(`Fix C check-map rows applied to ${path}: ${Object.keys(ROWS).length} rows, ${Object.keys(APPEND).length} appended`);
