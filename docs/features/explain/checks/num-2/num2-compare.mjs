// compare the product rule with the evidence checker's arithmeticFlags over the same distinct saved cards (what the product rule skips)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const P = await import(pathToFileURL('C:/s/num2/packages/control-plane/src/learn-primitives.js').href);
const C = await import(pathToFileURL('C:/s/sprint2-evidence/card-errors/checks.mjs').href);
const E = 'C:/s/sprint2-evidence/';
const FILES = ['var-1-bench/results-combined.jsonl', 'var-1-bench/results.jsonl', 'card-numbers/section-6/results.jsonl', 'card-numbers/section-6b/results.jsonl', 'fallbacks-batch/results.jsonl', 'gem-s2/results.jsonl'];
const proseOf = md => { const out = []; let open = false; for (const line of String(md).split('\n')) { if (/^\s*```/.test(line)) { open = !open; continue; } if (!open) out.push(line); } return out.join('\n'); };
const seen = new Map();
for (const f of FILES) for (const r of fs.readFileSync(E + f, 'utf8').trim().split('\n').map(JSON.parse)) {
  if (!r.delivered || typeof r.body !== 'string' || !r.body) continue;
  const h = crypto.createHash('sha1').update(r.body).digest('hex');
  if (!seen.has(h)) seen.set(h, r.body);
}
let evid = 0, both = 0; const onlyEvid = [], stats = { latex: 0, plain: 0 };
for (const [h, body] of seen) {
  const prose = proseOf(body);
  const ef = C.arithmeticFlags(prose, stats).filter(a => a.type === 'wrong');
  const pf = P.proseArithmetic(prose);
  for (const a of ef) { evid++; if (pf.some(p => Math.abs(p.stated - a.stated) < 1e-9 && Math.abs(p.computed - a.computed) < 1e-6)) both++; else onlyEvid.push(a); }
}
console.log('cards', seen.size, '| evidence-checker wrong statements', evid, '| also found by the product rule', both, '| only the evidence checker', onlyEvid.length);
for (const a of onlyEvid.slice(0, 40)) console.log('  ONLY-EVID', String(a.text).slice(0, 110), '| computed', +Number(a.computed).toPrecision(6), 'stated', a.stated);
console.log('evidence-checker equations evaluated: latex', stats.latex, 'plain', stats.plain);
