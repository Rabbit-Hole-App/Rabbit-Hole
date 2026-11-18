// NUM-2 offline proof: the three bench cards, and every saved delivered card (distinct bodies) for the false-positive count. No network.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const ROOT = process.argv[2] ?? 'C:/s/num2';
const P = await import(pathToFileURL(`${ROOT}/packages/control-plane/src/learn-primitives.js`).href);
const { parseTutorDiagram } = await import(pathToFileURL(`${ROOT}/packages/web/src/tutor-diagrams/spec.js`).href);
const E = 'C:/s/sprint2-evidence/';
const FILES = ['var-1-bench/results-combined.jsonl', 'var-1-bench/results.jsonl', 'card-numbers/section-6/results.jsonl', 'card-numbers/section-6b/results.jsonl', 'fallbacks-batch/results.jsonl', 'gem-s2/results.jsonl'];
const proseOf = md => { const out = []; let open = false; for (const line of String(md).split('\n')) { if (/^\s*```/.test(line)) { open = !open; continue; } if (!open) out.push(line); } return out.join('\n'); };
const fences = md => { const out = []; let cur = null; for (const line of String(md).split('\n')) { if (/^\s*```/.test(line)) { if (cur) { out.push(cur); cur = null; } else if (/rh-diagram/.test(line)) cur = []; else cur = null; continue; } if (cur) cur.push(line); } return out; };
const seen = new Map();
for (const f of FILES) {
  const rows = fs.readFileSync(E + f, 'utf8').trim().split('\n').map(JSON.parse);
  for (const r of rows) {
    if (!r.delivered || typeof r.body !== 'string' || !r.body) continue;
    const h = crypto.createHash('sha1').update(r.body).digest('hex');
    if (!seen.has(h)) seen.set(h, { body: r.body, where: [], prompt: r.prompt, provider: r.authoredBy?.provider });
    seen.get(h).where.push(`${f.split('/').pop()}#${r.idx ?? '?'}${r.arm ? '/' + r.arm : ''}`);
  }
}
console.log('distinct delivered card bodies:', seen.size);
const eq = [], bars = [];
for (const [h, c] of seen) {
  for (const bad of P.proseArithmetic(proseOf(c.body))) eq.push({ h, c, bad });
  for (const fence of fences(c.body)) {
    let d; try { d = parseTutorDiagram(fence.join('\n')).diagram; } catch { continue; }
    for (const bad of P.distributionBarIssues(d)) bars.push({ h, c, bad, d });
  }
}
console.log('prose equation flags:', eq.length, 'on', new Set(eq.map(x => x.h)).size, 'distinct cards');
for (const x of eq) {
  console.log(`  EQ  [${x.c.where[0]}] ${x.c.provider} :: ${x.bad.text}  (computed ${+x.bad.computed.toPrecision(7)}, stated ${x.bad.stated}) :: ${String(x.c.prompt).slice(0, 60)}`);
  console.log('      sentence: ' + proseOf(x.c.body).split(/(?<=[.!?])\s+|\n/).filter(s => s.includes('=')).map(s => s.slice(0, 260)).join(' || '));
}
console.log('distribution bar flags:', bars.length, 'on', new Set(bars.map(x => x.h)).size, 'distinct cards');
for (const x of bars) console.log(`  BAR [${x.c.where[0]}] ${x.c.provider} :: "${x.d.title}" word=${x.bad.word} ${x.bad.label ?? ''} values ${x.bad.values.join(', ')} sum ${x.bad.sum} :: ${String(x.c.prompt).slice(0, 60)}`);
// the three bench cards through the product entry point
const bench = fs.readFileSync(E + 'var-1-bench/results-combined.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
for (const [idx, arm] of [[222, 'after'], [297, 'after'], [280, 'after']]) {
  const r = bench.find(x => x.idx === idx && x.arm === arm);
  const issue = P.numbersIssue({ body: r.body });
  console.log(`\nBENCH ${idx} ${arm}:`, issue ? 'FAILS ' + issue.problem.slice(0, 330) : 'passes (no NUM-2 issue)');
}
