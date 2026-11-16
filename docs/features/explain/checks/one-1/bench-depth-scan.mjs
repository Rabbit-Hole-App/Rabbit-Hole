// All saved bench runs: cards by depth setting and carried visual count (no date filter; to show which depths have any measured sample).
import fs from 'node:fs'; const root = process.argv[2]; const t = {};
for (const d of fs.readdirSync(root)) { const f = `${root}/${d}/results.json`; if (!fs.existsSync(f)) continue;
  let r; try { r = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  for (const c of r.cards || []) { if (!c.delivered) continue; const dep = c.depth ?? 'null(default balanced)', n = (c.diagrams?.length ?? 0) + (c.pictures?.length ?? 0); const k = `${dep}`; (t[k] ??= { cards: 0, 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 }); t[k].cards++; t[k][n > 3 ? '4+' : n]++; } }
console.table(t);
