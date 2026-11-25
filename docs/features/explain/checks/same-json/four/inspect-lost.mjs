import fs from 'node:fs';
const rows = fs.readFileSync('C:/s/same-json-run/four/results.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
for (const [idx, arm] of [[12, 'before'], [14, 'before'], [74, 'after'], [15, 'after']]) {
  const r = rows.find(x => x.idx === idx && x.arm === arm);
  console.log(`== idx ${idx} ${arm} ${r.refId} ${r.depth} delivered ${r.delivered} firstValid ${r.firstAttemptValid}`);
  for (const [i, raw] of (r.rawGoogle ?? []).entries()) {
    const tags = [...String(raw).matchAll(/"k"\s*:\s*"([^"]*)"/g)].map(m => m[1]);
    console.log(`   raw answer ${i}: length ${String(raw).length}, visual tags ${JSON.stringify(tags)}${String(raw).includes('"error"') ? ', ERROR ' + String(raw).slice(0, 160) : ''}`);
  }
  console.log('   events', (r.events ?? []).map(e => e.event + ':' + String(e.error ?? e.reason ?? '').slice(0, 110)).join(' | '));
}
console.log('lost-asks.md bytes', fs.statSync('C:/s/same-json-run/four/out/lost-asks.md').size);
