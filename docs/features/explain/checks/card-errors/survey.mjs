import fs from 'node:fs';
import { checkCard, carriesNumbers } from './checks.mjs';
const all = JSON.parse(fs.readFileSync('cards-all.json', 'utf8'));
const uniq = new Map(); for (const c of all) if (!uniq.has(c.hash)) uniq.set(c.hash, c);
const cards = [...uniq.values()];
const rows = [];
for (const c of cards) {
  const numeric = c.diagrams.filter(carriesNumbers);
  const flags = checkCard(c);
  rows.push({ hash: c.hash, run: c.run, id: c.id, depth: c.depth, model: (c.model || '?').split('/').pop(), profile: c.profile?.id, kinds: [...new Set(c.kinds)], numericKinds: [...new Set(numeric.map(d => d.kind))], hasNumeric: numeric.length > 0, flags: [...flags], examined: flags.examined, file: c.file, title: c.title });
}
fs.writeFileSync('survey-rows.json', JSON.stringify(rows));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
const num = rows.filter(r => r.hasNumeric);
console.log('unique cards', rows.length, 'with a numeric diagram', num.length, 'flagged (any)', num.filter(r => r.flags.length).length, pct(num.filter(r => r.flags.length).length, num.length));
console.log('flagged on all cards (incl no numeric diagram, prose arithmetic only)', rows.filter(r => r.flags.length).length);
const byCheck = {}; for (const r of rows) for (const f of r.flags) { byCheck[f.check] ??= { cards: new Set(), n: 0 }; byCheck[f.check].cards.add(r.hash); byCheck[f.check].n++; }
console.log(Object.entries(byCheck).map(([k, v]) => [k, v.cards.size]).sort((a, b) => b[1] - a[1]));
const byKind = {}; for (const r of num) for (const k of r.numericKinds) { byKind[k] ??= { n: 0, flagged: 0, anyflag: 0 }; byKind[k].n++; if (r.flags.some(f => f.kind === k)) byKind[k].flagged++; if (r.flags.length) byKind[k].anyflag++; }
console.table(byKind);

const ex = {}; for (const r of rows) for (const e of r.examined) { ex[e] ??= { examined: 0, flagged: 0 }; ex[e].examined++; }
for (const r of rows) for (const e of new Set(r.flags.map(f => f.check))) { const k = ({ "box-outlier-inside-correct-fence": "box-fence-arithmetic", "box-whisker-beyond-correct-fence": "box-fence-arithmetic", "plot-point-off-formula": "plot-recompute", "bootstrap-draw-count-not-n": "bootstrap-draw-count", "bars-should-sum-to-1": "bars-sum", "bars-should-sum-to-100": "bars-sum", "probabilities-should-sum-to-1": "probabilities-sum", "heatmap-weights-should-sum-to-1": "heatmap-sum", "timeline-out-of-order": "timeline-order", "waterfall-closing-mismatch": "waterfall-closing", "histogram-counts-vs-listed-values": "histogram-counts", "loss-curve-not-monotone": "loss-monotone" })[e] ?? e; if (ex[k]) ex[k].flagged++; }
console.log("coverage per check (cards the check could actually examine)"); console.table(ex);
