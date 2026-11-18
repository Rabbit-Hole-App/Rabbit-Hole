// HEAT-1 survey: saved card records with a square heatmap whose cells above the diagonal are blocked (null) AND whose diagonal has a blocked cell, other than the causal-mask shape of the 155 report.
// Reports every blocked-diagonal triangle with its file, record index and numbers, and says whether it looks like the failing causal-mask card (row 1 entirely null) or like a half matrix with its diagonal omitted.
import fs from 'node:fs';
import path from 'node:path';
const roots = ['C:/s/sprint2-evidence', 'C:/s/film-evidence/docs/features/explain/checks'];
const files = [];
const walkDir = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === '.git') continue; const p = path.join(d, e.name); if (e.isDirectory()) walkDir(p); else if (/\.(jsonl|json)$/i.test(e.name) && fs.statSync(p).size < 400e6) files.push(p); } };
roots.forEach(walkDir);
let heatmaps = 0, triangles = 0, records = 0;
const hits = [], seen = new Set();
const isHeat = n => n && typeof n === 'object' && n.kind === 'heatmap' && Array.isArray(n.rows) && n.rows.every(r => Array.isArray(r?.cells));
const triangleBlocked = d => { const n = d.rows.length; return n >= 2 && n === d.columns?.length && d.rows.every(r => r.cells.length === n) && d.rows.every((r, i) => r.cells.every((v, j) => j <= i || v === null)) && d.rows.some(r => r.cells.some(v => v !== null)); };
function visit(node, where, depth = 0) {
  if (depth > 40 || node === null || node === undefined) return;
  if (typeof node === 'string') {
    if (node.includes('rh-diagram') || (node.includes('"heatmap"') && node.length > 20)) {
      for (const m of node.matchAll(/```rh-diagram\s*([\s\S]*?)```/g)) { try { visit(JSON.parse(m[1]), where + '#fence', depth + 1); } catch { /* not json */ } }
    }
    return;
  }
  if (typeof node !== 'object') return;
  if (isHeat(node)) {
    heatmaps++;
    const key = JSON.stringify(node.rows.map(r => r.cells));
    if (!seen.has(key)) {
      seen.add(key);
      if (triangleBlocked(node)) { triangles++; if (node.rows.some((r, i) => r.cells[i] === null)) hits.push({ where, title: node.title, n: node.rows.length, firstRowAllNull: node.rows[0].cells.every(v => v === null), cells: node.rows.map(r => r.cells.map(v => (v === null ? '.' : v)).join(' ')).join(' / ') }); }
    }
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) visit(v, where, depth + 1);
}
for (const f of files) {
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (!/heatmap/.test(text)) continue;
  if (/\.jsonl$/i.test(f)) { text.split('\n').forEach((line, i) => { if (!line.trim() || !line.includes('heatmap')) return; try { records++; visit(JSON.parse(line), `${f}:${i + 1}`); } catch { /* skip */ } }); }
  else { try { records++; visit(JSON.parse(text), f); } catch { /* skip */ } }
}
console.log('files scanned with the word heatmap; records parsed:', records, '| distinct heatmap grids seen:', seen.size, '(heatmap objects incl. repeats:', heatmaps, ')');
console.log('distinct grids with every cell above the diagonal blocked:', triangles, '| of them with the diagonal blocked:', hits.length);
const byShape = {};
for (const h of hits) { const k = h.cells; (byShape[k] ||= { ...h, count: 0, wheres: [] }); byShape[k].count++; if (byShape[k].wheres.length < 3) byShape[k].wheres.push(h.where.replace('C:/s/', '')); }
for (const h of Object.values(byShape)) console.log(`- ${h.title} (${h.n}x${h.n}), row 1 all null: ${h.firstRowAllNull}, grid: ${h.cells}\n    first at: ${h.wheres.join(' | ')}`);
