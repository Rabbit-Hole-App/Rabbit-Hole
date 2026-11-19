// BOX-1 bench report. usage: node report.mjs [results.jsonl]  (offline; reads the saved records only)
// Per arm and prompt: delivered, first attempt valid, the box statistics drawn against the right ones (medians of the halves, the middle value left out for odd n), `values` carried, cost.
import fs from 'node:fs';
const file = process.argv[2] ?? 'C:/s/box1-bench/results.jsonl';
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const med = a => { const n = a.length, m = n >> 1; return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const truth = a => { const s = [...a].sort((x, y) => x - y), n = s.length, m = n >> 1; return { q1: med(s.slice(0, m)), median: med(s), q3: med(s.slice(n % 2 ? m + 1 : m)) }; };
const data = p => { const m = [...p.matchAll(/(-?\d+(?:\.\d+)?(?:\s*,\s*(?:and\s+)?-?\d+(?:\.\d+)?){4,})/g)]; return m.length === 1 ? m[0][1].match(/-?\d+(?:\.\d+)?/g).map(Number) : null; };
const out = [];
for (const r of rows) {
  const d = data(r.prompt), t = d && truth(d), box = (r.diagrams ?? []).find(x => x?.kind === 'box-plot')?.boxes?.[0];
  out.push({ arm: r.arm, idx: r.idx, delivered: r.delivered, error: r.errorCode, firstValid: r.firstAttemptValid, kinds: (r.finalKinds ?? []).join('+'), values: box ? Boolean(box.values) : null,
    right: box && t ? box.q1 === t.q1 && box.median === t.median && box.q3 === t.q3 : null, drawn: box ? [box.q1, box.median, box.q3].join('/') : '-', truth: t ? [t.q1, t.median, t.q3].join('/') : '-', calls: r.providerCalls, micros: r.costMicros });
}
for (const o of out) console.log(JSON.stringify(o));
const by = arm => out.filter(o => o.arm === arm), n = (xs, f) => xs.filter(f).length;
for (const arm of ['before', 'after']) { const x = by(arm); console.log(`${arm}: runs ${x.length} | delivered ${n(x, o => o.delivered)} | box plot kept ${n(x, o => o.drawn !== '-')} | right statistics ${n(x, o => o.right)} | carries values ${n(x, o => o.values)} | first attempt valid ${n(x, o => o.firstValid)} | provider calls ${x.reduce((s, o) => s + (o.calls || 0), 0)} | settled US$${(x.reduce((s, o) => s + (o.micros || 0), 0) / 1e6).toFixed(4)}`); }
