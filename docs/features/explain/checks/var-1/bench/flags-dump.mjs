import fs from 'node:fs';
const rows = fs.readFileSync('results.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const live = rows.filter(r => r.set !== 'vary' && r.idx < 155 && r.flags?.length);
const sent = (body, needle) => { const t = typeof body === 'string' ? body : JSON.stringify(body); const plain = t.replace(/```rh-diagram[\s\S]*?```/g, '[diagram]'); const parts = plain.split(/(?<=[.!?])\s+|\n/); return parts.filter(s => s.includes(needle)).slice(0, 2).map(s => s.slice(0, 220)); };
for (const r of live) {
  console.log(`\n## item ${r.idx} ${r.arm} ${r.set} ${r.depth} by ${r.authoredBy?.provider} :: ${r.prompt.slice(0, 120)}`);
  for (const f of r.flags) {
    console.log(' FLAG', f.check, '|', f.detail);
    const m = f.detail.match(/prose "([^"]+)"/); if (m) console.log('  prose:', JSON.stringify(sent(r.body, m[1].slice(0, 22))));
  }
  const ds = Array.isArray(r.diagrams) ? r.diagrams : [];
  for (const d of ds) if (d.kind === 'box-plot') console.log('  boxes:', JSON.stringify((d.boxes || []).map(b => ({ l: b.label, min: b.min, q1: b.q1, med: b.median, q3: b.q3, max: b.max, fences: b.fences, wl: b.whiskerLow, wh: b.whiskerHigh, out: b.outliers }))).slice(0, 700));
}
