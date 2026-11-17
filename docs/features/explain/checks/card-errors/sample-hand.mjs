import fs from 'node:fs';
import { carriesNumbers, proseOf } from './checks.mjs';
const all = JSON.parse(fs.readFileSync('cards-all.json', 'utf8')); const seen = new Set(), pool = {};
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (const c of all) { if (seen.has(c.hash)) continue; seen.add(c.hash); for (const d of c.diagrams) if (carriesNumbers(d)) { (pool[d.kind] ??= []).push({ c, d }); break; } }
const want = { 'coordinate-plot': 9, 'bar-chart': 4, transformation: 3, histogram: 2, heatmap: 2, matrix: 2, 'number-line': 2, timeline: 2, waterfall: 1, 't-account': 1, 'box-plot': 0 };
const pick = []; const usedId = new Set();
for (const [k, n] of Object.entries(want)) { const p = pool[k] ?? []; let got = 0, tries = 0; while (got < n && tries++ < 500) { const x = p[Math.floor(rnd() * p.length)]; const key = x.c.id + x.c.depth + (x.c.model||'').slice(-8); if (usedId.has(x.c.id)) continue; usedId.add(x.c.id); pick.push(x); got++; } }
const short = o => JSON.stringify(o).replace(/"version":1,/, '').slice(0, 900);
pick.forEach(({ c, d }, i) => { console.log(`\n#### H${i + 1} ${c.id} | ${c.depth} | ${(c.model || '').split('/').pop()} | ${c.run.slice(0, 16)} | kind ${d.kind}`); console.log('PROSE:', proseOf(c.body).replace(/\s+/g, ' ').slice(0, 520)); console.log('DIAGRAM:', short(d)); });
fs.writeFileSync('hand-sample-ids.json', JSON.stringify(pick.map(({ c, d }, i) => ({ h: i + 1, id: c.id, hash: c.hash, kind: d.kind, depth: c.depth, model: c.model, run: c.run }))));
