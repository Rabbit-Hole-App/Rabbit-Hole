// base rate for the distribution-bar rule: every distinct saved bar-chart with a wording hit, values in 0..1, and whether it sums to 1
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const { parseTutorDiagram } = await import(pathToFileURL('C:/s/num2/packages/web/src/tutor-diagrams/spec.js').href);
const E = 'C:/s/sprint2-evidence/';
const FILES = ['var-1-bench/results-combined.jsonl', 'var-1-bench/results.jsonl', 'card-numbers/section-6/results.jsonl', 'card-numbers/section-6b/results.jsonl', 'fallbacks-batch/results.jsonl', 'gem-s2/results.jsonl'];
const WORDS = { probability: /\bprobabilit(?:y|ies)\b/i, distribution: /\bdistribution\b/i, softmax: /\bsoftmax\b/i, normalized: /\bnormali[sz]ed\b/i, proportion: /\bproportions?\b/i, share: /\bshares?\b/i, fractionof: /\bfractions? of\b/i, attention: /\battention weights?\b/i };
const seen = new Map();
for (const f of FILES) for (const r of fs.readFileSync(E + f, 'utf8').trim().split('\n').map(JSON.parse)) {
  if (!r.delivered || typeof r.body !== 'string') continue;
  const h = crypto.createHash('sha1').update(r.body).digest('hex'); if (!seen.has(h)) seen.set(h, r);
}
const tally = {};
const rows = [];
for (const [h, r] of seen) {
  const fenceRe = /```rh-diagram\n([\s\S]*?)```/g; let m;
  while ((m = fenceRe.exec(r.body))) {
    let d; try { d = parseTutorDiagram(m[1]).diagram; } catch { continue; }
    if (d.kind !== 'bar-chart' || d.variant === 'stacked') continue;
    const groups = d.bars ? [d.bars.map(b => b.value)] : (d.series || []).map(s => s.values);
    const text = `${d.title ?? ''} ${d.caption ?? ''} ${d.unit ?? ''}`;
    for (const values of groups) {
      if (values.length < 2 || !values.every(v => v >= 0 && v <= 1)) continue;
      const sum = values.reduce((a, b) => a + b, 0), dd = Math.max(...values.map(v => (String(v).split('.')[1] || '').length));
      const ok = Math.abs(sum - 1) <= values.length * 0.5 * 10 ** -dd * (1 + 1e-9);
      for (const [name, re] of Object.entries(WORDS)) if (re.test(text)) { const t = (tally[name] ||= { n: 0, sumsTo1: 0, off: 0 }); t.n++; ok ? t.sumsTo1++ : t.off++; if (!ok) rows.push(`${name}: "${d.title}" | ${d.caption ?? ''} | ${values.join(', ')} sum ${+sum.toFixed(4)}`); }
    }
  }
}
console.log('bar groups in 0..1 with a wording hit, by word (distinct cards):'); for (const [k, v] of Object.entries(tally)) console.log(' ', k, JSON.stringify(v));
console.log('the ones that do not sum to 1:'); for (const l of rows) console.log('  ' + l.slice(0, 260));
