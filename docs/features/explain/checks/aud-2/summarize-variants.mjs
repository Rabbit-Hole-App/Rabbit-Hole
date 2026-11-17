// Merges verify-out.json with manual-verdicts.json and prints/saves the variant x model table.
import fs from 'node:fs';
const D = 'C:/s/sprint2-evidence/aud-2/';
const rows = JSON.parse(fs.readFileSync(D + 'verify-out.json', 'utf8')), man = JSON.parse(fs.readFileSync(D + 'manual-verdicts.json', 'utf8'));
const mid = { Brief: 70, Balanced: 90, Detailed: 115 };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const summary = [];
for (const prov of ['fireworks', 'gemini']) for (const v of ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']) {
  const rs = rows.filter(r => r.provider === prov && r.variant === v); if (!rs.length) continue;
  const m = r => man[`${r.provider}|${r.variant}|${r.n}`] || {};
  const errItems = rs.reduce((a, r) => a + (m(r).errors || 0), 0), errOut = rs.filter(r => (m(r).errors || 0) > 0).length;
  const sym = rs.filter(r => r.check.symbols > 0).length, reuse = rs.filter(r => r.check.reuseTag || m(r).partialReuse).length, fo = rs.filter(r => r.check.formulaOpener).length;
  const inw = rs.filter(r => r.check.inWindow).length, over = rs.filter(r => r.check.over).length, under = rs.filter(r => r.check.under).length;
  const ratio = mean(rs.map(r => r.check.sec180 / mid[r.depthLabel]));
  const words = rs.map(r => r.check.words), rt = rs.map(r => r.reasoningTokens).filter(x => x != null), comp = rs.map(r => r.completion).filter(x => x != null);
  summary.push({ provider: prov, variant: v, outputs: rs.length, outputsWithNumericErrors: errOut, errorItems: errItems, symbolLeakOutputs: sym, reuseOutputs: reuse, formulaOpenerOutputs: fo, inWindow: inw, over, under, meanSecOverMid: +ratio.toFixed(2), words: `${Math.min(...words)}-${Math.max(...words)}`, meanReasoningTokens: rt.length ? Math.round(mean(rt)) : null, meanCompletionTokens: Math.round(mean(comp)) });
}
console.table(summary);
fs.writeFileSync(D + 'variant-summary.json', JSON.stringify(summary, null, 1));
// per-card reuse and symbols for the why.md tables
for (const prov of ['fireworks', 'gemini']) { console.log('\n' + prov); for (const n of [1, 4, 5, 6, 7, 9, 10, 11, 12]) console.log(n, ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'].map(v => { const r = rows.find(x => x.provider === prov && x.variant === v && x.n === n); if (!r) return '-'; const k = man[`${prov}|${v}|${n}`] || {}; return `${v}:${r.check.sec180}s,e${k.errors || 0},s${r.check.symbols},${r.check.reuseTag || k.partialReuse ? 'R' : '.'}${r.check.formulaOpener ? 'F' : '.'}`; }).join(' ')); }
