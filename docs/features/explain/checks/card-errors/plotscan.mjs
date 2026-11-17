import fs from 'node:fs';
import { plotRecompute, proseOf } from './checks.mjs';
import { compileFormula } from 'file:///C:/s/explain-layout-web/scripts/explain-bench/score.mjs';
const all = JSON.parse(fs.readFileSync('cards-all.json', 'utf8'));
const seen = new Set(); let plots = 0, withFormula = 0, series = 0, checkedSeries = 0, offSeries = 0; const near = [];
const decimals = s => (String(s).split('.')[1] || '').length;
for (const c of all) {
  if (seen.has(c.hash)) continue; seen.add(c.hash);
  for (const d of c.diagrams.filter(d => d.kind === 'coordinate-plot')) {
    plots++;
    const text = [proseOf(c.body), JSON.stringify(d.caption ?? ''), d.title].join(' ');
    // loose version: all candidates, no 25% cap, to list near misses
    const cands = []; for (const m of text.matchAll(/\$([^$]+)\$/g)) for (const p of m[1].split('=')) { const k = compileFormula(p); if (k && /[+\-*/^]|exp|log|sqrt|sin|cos|tanh|frac/.test(p)) cands.push({ formula: p.trim(), ...k }); }
    if (!cands.length) continue; withFormula++;
    for (const s of d.series ?? []) { if (!s.points || s.points.length < 3) continue; series++;
      let best = null; for (const k of cands) { const bad = s.points.map(p => { const e = k.f(p.x); return Number.isFinite(e) ? Math.abs(p.y - +e.toFixed(decimals(p.y))) > 0.01 : null; }).filter(x => x !== null); if (bad.length >= 3) { const er = bad.filter(Boolean).length; if (!best || er / bad.length < best.er / best.n) best = { formula: k.formula, n: bad.length, er }; } }
      if (best && best.er / best.n <= 0.5) { checkedSeries++; if (best.er) { offSeries++; near.push({ id: c.id, depth: c.depth, model: (c.model || '').split('/').pop(), series: s.label, ...best, frac: +(best.er / best.n).toFixed(2), pts: s.points.map(p => `${p.x}:${p.y}`).join(' ') }); } }
    }
  }
}
console.log({ plots, withFormula, series, checkedSeries, offSeries });
for (const n of near.sort((a, b) => a.frac - b.frac)) console.log(JSON.stringify(n).slice(0, 330));
