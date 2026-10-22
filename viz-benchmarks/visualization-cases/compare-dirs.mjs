// Before/after batch comparison: for every PNG name present in both directories, compose before-left/after-right into
// <out>/<name>.png and write a static index.html (no scripts). Missing counterparts are listed, never invented.
//   node compare-dirs.mjs <beforeDir> <afterDir> <outDir>
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeComparison } from './compose.mjs';

export function pairNames(before, after) {
  const a = new Set(readdirSync(before).filter(f => f.endsWith('.png'))), b = new Set(readdirSync(after).filter(f => f.endsWith('.png')));
  return { both: [...a].filter(f => b.has(f)).sort(), onlyBefore: [...a].filter(f => !b.has(f)).sort(), onlyAfter: [...b].filter(f => !a.has(f)).sort() };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [before, after, out] = process.argv.slice(2);
  if (!before || !after || !out || !existsSync(before) || !existsSync(after)) { console.error('usage: node compare-dirs.mjs <beforeDir> <afterDir> <outDir>'); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const { both, onlyBefore, onlyAfter } = pairNames(before, after);
  for (const name of both) await composeComparison(join(before, name), join(after, name), join(out, name), { leftLabel: 'Before', resultLabel: 'After' });
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Before and after</title><style>body{font:14px system-ui;margin:24px}img{max-width:100%;border:1px solid #ccc}</style><h1>Before and after</h1><p>${esc(before)} vs ${esc(after)}</p>${both.map(n => `<h2>${esc(n)}</h2><img src="${esc(n)}">`).join('')}<h2>Only before</h2><p>${onlyBefore.map(esc).join(', ') || 'none'}</p><h2>Only after</h2><p>${onlyAfter.map(esc).join(', ') || 'none'}</p>\n`);
  console.log(`${both.length} pairs composed; only before ${onlyBefore.length}, only after ${onlyAfter.length}; ${join(out, 'index.html')}`);
}
