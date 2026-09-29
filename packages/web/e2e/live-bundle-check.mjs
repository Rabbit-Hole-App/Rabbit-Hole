// The live build must not ship Rabbit Hole preview code, not even as unreferenced chunks: the live
// worker serves all of dist/, so an orphan chunk can still be downloaded. Run after `npm run build`
// (the live build, no VITE_COACHING_DEV): node e2e/live-bundle-check.mjs
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../dist/static/', import.meta.url);
const PREVIEW_CHUNKS = /^(AgentBar|ConfirmCard|StartHost|Home|RepositoryPage|review-fixtures-data)-/;
const MARKERS = ['data-agent-bar', 'data-result-sheet', 'nanoGPT from First Principles'];
const failures = [];
for (const name of readdirSync(dir)) {
  if (PREVIEW_CHUNKS.test(name)) failures.push(`${name}: a preview-only chunk`);
  if (!name.endsWith('.js')) continue;
  const text = readFileSync(new URL(name, dir), 'utf8');
  for (const marker of MARKERS) if (text.includes(marker)) failures.push(`${name}: contains ${marker}`);
}
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('ok: the live build ships no preview chunks');
