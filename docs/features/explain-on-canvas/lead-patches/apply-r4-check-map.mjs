// Lead-only patch (scripts/ci/check-map.json): the R4 rows from the State, Tools and UI lanes and the integration glue, merged into ONE edit.
// A textual edit, not JSON.parse + stringify, because check-map.json has duplicate keys inside one object (the file is edited by line, CRLF kept).
// Usage: node docs/features/explain-on-canvas/lead-patches/apply-r4-check-map.mjs [path-to-check-map.json]   (default: scripts/ci/check-map.json)
// Idempotent: refuses when already applied. Prove it on a copy: copy the map, run this on the copy, run affected.mjs classify / check-map.test.mjs on it.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'scripts/ci/check-map.json';
const CP = 'packages/control-plane/', T = `${CP}test/`, W = 'packages/web/src/';
const UI_CHECKS = ['roadmap-command-check.mjs', 'roadmap-mvp-check.mjs'];
const UI_TESTS = [`${W}roadmap-client.test.mjs`, `${W}roadmap-controller.test.mjs`, `${W}roadmap-view.test.mjs`];
const test = (...names) => names.map(n => `${T}${n}.test.js`);

// New rows (key -> checks and CI-run unit tests). Narrow: a source file selects the tests that import it.
export const ROWS = {
  [`${CP}src/agents/roadmap-card.js`]: test('roadmap-generate'),
  [`${CP}src/agents/roadmap-check.js`]: test('roadmap-grounding', 'roadmap-safety'),
  [`${CP}src/agents/roadmap-plan.js`]: test('roadmap-plan'),
  [`${CP}src/roadmap/roadmap-access.js`]: test('roadmap-loop', 'roadmap-routes'),
  [`${CP}src/roadmap/roadmap-check.js`]: test('roadmap-grounding', 'roadmap-safety', 'roadmap-loop'),
  [`${CP}src/roadmap/roadmap-compose.js`]: test('roadmap-loop'),
  [`${CP}src/roadmap/roadmap-events.js`]: test('roadmap-events', 'roadmap-glue'),
  [`${CP}src/roadmap/roadmap-generate.js`]: test('roadmap-generate', 'roadmap-loop'),
  [`${CP}src/roadmap/roadmap-grounding.js`]: test('roadmap-grounding'),
  [`${CP}src/roadmap/roadmap-invitations.js`]: test('roadmap-glue', 'roadmap-loop'),
  [`${CP}src/roadmap/roadmap-jobs.js`]: test('roadmap-events'),
  [`${CP}src/roadmap/roadmap-lifecycle.js`]: test('roadmap-recovery', 'roadmap-routes'),
  [`${CP}src/roadmap/roadmap-models.js`]: test('roadmap-glue'),
  [`${CP}src/roadmap/roadmap-money.js`]: test('roadmap-money', 'roadmap-recovery'),
  [`${CP}src/roadmap/roadmap-plan.js`]: test('roadmap-plan', 'roadmap-planning'),
  [`${CP}src/roadmap/roadmap-planning.js`]: test('roadmap-planning', 'roadmap-loop'),
  [`${CP}src/roadmap/roadmap-privacy.js`]: test('roadmap-privacy'),
  [`${CP}src/roadmap/roadmap-quota.js`]: test('roadmap-glue'),
  [`${CP}src/roadmap/roadmap-routes.js`]: test('roadmap-routes', 'roadmap-loop', 'roadmap-planning'),
  [`${CP}src/roadmap/roadmap-run.js`]: test('roadmap-loop'),
  [`${CP}src/roadmap/roadmap-safety.js`]: test('roadmap-safety'),
  [`${CP}src/roadmap/roadmap-source-read.js`]: test('roadmap-planning'),
  [`${CP}src/roadmap/roadmap-source-reader.js`]: test('roadmap-source-reader'),
  [`${CP}src/roadmap/roadmap-source-refs.js`]: test('roadmap-planning'),
  [`${CP}src/roadmap/roadmap-source.js`]: test('roadmap-source'),
  [`${CP}src/roadmap/roadmap-store.js`]: test('roadmap-store', 'roadmap-routes', 'roadmap-loop'),
  [`${CP}src/roadmap/roadmap-validate.js`]: test('roadmap-plan'),
  [`${CP}src/roadmap/roadmap-view.js`]: test('roadmap-routes', 'roadmap-loop'),
  [`${CP}src/roadmap/roadmap-wire.js`]: test('roadmap-loop', 'roadmap-glue'),
  [`${W}NextStepPill.jsx`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}RoadmapInvitation.jsx`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}RoadmapPlan.jsx`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}RoadmapRecovery.jsx`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}RoadmapSurfaces.jsx`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}roadmap-client.js`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}roadmap-contract.js`]: [...UI_CHECKS, `${W}roadmap-client.test.mjs`, ...test('roadmap-contract')],
  [`${W}roadmap-controller.js`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}roadmap-placement.js`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}roadmap-strings.js`]: [...UI_CHECKS, ...UI_TESTS],
  [`${W}use-roadmap.js`]: [...UI_CHECKS, ...UI_TESTS],
  'packages/web/e2e/roadmap-fake-server.mjs': UI_CHECKS,
};
// Two checks (fork tier, faked job server). seconds are a first estimate until CI measures them.
export const CHECKS = { 'roadmap-command-check.mjs': 60, 'roadmap-mvp-check.mjs': 90 };
// (learn-spend*.js, shared-privacy.js and learn-boards.js are broad already: any change selects everything, so they need no row.)
// Existing rows that must also select the new coverage because the R4 lanes edited the file or the integration mounts into it.
export const APPEND = {
  [`${W}LearnPage.jsx`]: UI_CHECKS,
  [`${W}ask.jsx`]: UI_CHECKS,
  [`${CP}src/learn-artifact.js`]: test('roadmap-generate'),
  [`${CP}src/learn-grade-jev.js`]: test('roadmap-money'),
};

const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);
const only = (re, what) => { const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter(i => i >= 0); if (hits.length !== 1) throw Error(`${what}: expected exactly one line, found ${hits.length}`); return hits[0]; };
const quote = list => `[${list.map(x => JSON.stringify(x)).join(',')}]`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (lines.some(l => l.includes(`"${CP}src/roadmap/roadmap-wire.js"`))) throw Error('already applied');
// 1. New rows go in front of the runbook-schema row (the first key after the existing roadmap rows).
const anchor = only(/^ {4}"packages\/control-plane\/src\/runbook-schema\.js":/, 'mapped anchor');
const rows = Object.entries(ROWS).map(([key, list]) => `    ${JSON.stringify(key)}: ${quote(list)},`);
lines.splice(anchor, 0, ...rows);
// 2. The two checks, at the head of "checks".
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
console.log(`R4 check-map rows applied to ${path}: ${rows.length} rows, ${Object.keys(CHECKS).length} checks, ${Object.keys(APPEND).length} appended`);
