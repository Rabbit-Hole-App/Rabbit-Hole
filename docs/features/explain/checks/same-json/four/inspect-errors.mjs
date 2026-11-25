import fs from 'node:fs';
const rows = fs.readFileSync('C:/s/same-json-run/four/results.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
console.log('rows', rows.length, 'delivered', rows.filter(r => r.delivered).length, 'lost', rows.filter(r => !r.delivered).length);
for (const r of rows.filter(r => !r.delivered || r.errorCode)) {
  console.log(JSON.stringify({ idx: r.idx, arm: r.arm, set: r.set, ref: r.refId, depth: r.depth, ms: r.ms, errorCode: r.errorCode, failureMessage: String(r.failureMessage ?? '').slice(0, 300), attempts: r.attempts, provider: r.authoredBy?.provider ?? null }));
  const ev = (r.events ?? []).slice(0, 4).map(e => JSON.stringify(e).slice(0, 400));
  for (const e of ev) console.log('   event ' + e);
}
console.log('order of runs:', rows.map(r => `${r.idx}${r.arm[0]}${r.delivered ? '+' : '-'}`).join(' '));
