// Lead-only patch (scripts/ci/check-map.json) for feat/tutor-r4-integration-2: the new wiring test and the money test join the rows that
// select them. A textual edit (check-map.json has duplicate keys): appends to the FIRST row of each key, CRLF kept. Idempotent.
// Usage: node docs/features/explain-on-canvas/lead-patches/r4-integration-check-map.mjs [path-to-check-map.json]
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'scripts/ci/check-map.json';
const W = 'packages/web/src/', WIRING = `${W}roadmap-integration-wiring.test.mjs`;
const ADD = {
  [`${W}LearnPage.jsx`]: [WIRING], [`${W}ask.jsx`]: [WIRING], [`${W}chat-workspace.jsx`]: [WIRING],
  [`${W}use-roadmap.js`]: [WIRING], [`${W}roadmap-client.js`]: [WIRING], [`${W}roadmap-controller.js`]: [WIRING],
  'packages/control-plane/src/roadmap/roadmap-store.js': ['packages/control-plane/test/roadmap-money.test.js'],
};
const text = readFileSync(path, 'utf8');
const lines = text.split('\n');
let changed = 0;
for (const [key, extra] of Object.entries(ADD)) {
  const at = lines.findIndex(line => line.trimStart().startsWith(`"${key}":`));
  if (at < 0) throw Error(`no row for ${key}`);
  for (const entry of extra) {
    if (lines[at].includes(`"${entry}"`)) continue;
    lines[at] = lines[at].replace(/\](,?)(\r?)$/, `,"${entry}"]$1$2`);
    if (!lines[at].includes(`"${entry}"`)) throw Error(`could not append to ${key}`);
    changed += 1;
  }
}
writeFileSync(path, lines.join('\n'));
console.log(changed ? `appended ${changed} entries` : 'already applied');
