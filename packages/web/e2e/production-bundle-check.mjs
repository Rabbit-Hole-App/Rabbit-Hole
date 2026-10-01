// The production Rabbit Hole build (VITE_RABBIT_HOLE=true, no VITE_COACHING_DEV) ships the Learn app and none of
// the dev-only tools (docs/features/rabbit-hole-production.md). Run after building into dist-dev with that env:
//   node e2e/production-bundle-check.mjs
// DIST=<a VITE_COACHING_DEV build> must FAIL on the dev-only markers: it proves they are real, not vacuous.
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL(`../${process.env.DIST || 'dist-dev'}/static/`, import.meta.url);
const names = readdirSync(dir);
const REQUIRED_CHUNKS = ['CanvasPage', 'RepositoryPage', 'Home', 'AgentBar'];
const DEV_CHUNKS = /^(review-fixtures-data|map-memory-data)-/;
const DEV_MARKERS = ['Insert a sample lesson block'];
const failures = [];
for (const chunk of REQUIRED_CHUNKS) if (!names.some(n => n.startsWith(`${chunk}-`))) failures.push(`missing Learn chunk ${chunk}`);
for (const name of names) {
  if (DEV_CHUNKS.test(name)) failures.push(`${name}: a dev-only chunk`);
  if (!name.endsWith('.js')) continue;
  const text = readFileSync(new URL(name, dir), 'utf8');
  for (const marker of DEV_MARKERS) if (text.includes(marker)) failures.push(`${name}: contains dev-only "${marker}"`);
}
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
console.log('ok: the production build ships the Learn app and no dev-only tools');
