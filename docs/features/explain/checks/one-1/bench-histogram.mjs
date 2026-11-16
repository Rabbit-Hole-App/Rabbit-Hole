// Visuals per card from saved bench runs (results.json cards). Usage: node bench-histogram.mjs <benchRoot> <firstRunDir>
import fs from 'node:fs';
const root = process.argv[2], from = process.argv[3];
const runs = fs.readdirSync(root).filter(d => d >= from && fs.existsSync(`${root}/${d}/results.json`)).sort();
const bin = n => (n > 3 ? '4+' : n);
const empty = () => ({ 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 });
const out = { runs: [], byDepth: {}, planned: {}, plannedVsCarried: {}, prompts: new Set() };
for (const d of runs) {
  const r = JSON.parse(fs.readFileSync(`${root}/${d}/results.json`, 'utf8'));
  const cards = (r.cards || []).filter(c => c.delivered);
  const h = empty();
  for (const c of cards) {
    const n = (c.diagrams?.length ?? 0) + (c.pictures?.length ?? 0);
    const depth = c.depth ?? 'null(default)';
    (out.byDepth[depth] ??= empty())[bin(n)]++; h[bin(n)]++;
    const p = c.plan && typeof c.plan.diagrams === 'number' ? c.plan.diagrams + (c.plan.pictures ?? 0) : c.plan?.visuals?.length;
    if (p !== undefined) { (out.planned[depth] ??= empty())[bin(p)]++; const k = `planned ${p} -> carried ${n}`; out.plannedVsCarried[k] = (out.plannedVsCarried[k] || 0) + 1; }
    out.prompts.add(c.id);
  }
  out.runs.push({ run: d, cards: r.cards?.length ?? 0, delivered: cards.length, hist: h, withPlan: cards.filter(c => c.plan).length, depths: [...new Set((r.cards || []).map(c => c.depth ?? null))] });
}
console.table(out.runs.map(x => ({ run: x.run, cards: x.cards, delivered: x.delivered, '0': x.hist[0], '1': x.hist[1], '2': x.hist[2], '3': x.hist[3], '4+': x.hist['4+'], withPlan: x.withPlan, depths: x.depths.join(',') })));
console.log('CARRIED, all listed runs, by depth:'); console.table(out.byDepth);
console.log('PLANNED (plan.visuals.length), by depth:'); console.table(out.planned);
console.log('planned -> carried:'); console.log(out.plannedVsCarried);
console.log('distinct prompt ids', out.prompts.size);
