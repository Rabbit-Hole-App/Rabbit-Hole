import fs from 'node:fs';
const rows = fs.readFileSync('C:/s/same-json-run/four/results.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const count = {};
for (const r of rows.filter(x => x.set === 'four')) for (const e of (r.events ?? []).filter(e => e.event === 'learn_artifact_invalid')) {
  const k = `${r.arm}|${r.refId}|${String(e.error).split(':')[0]}`; count[k] = (count[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(count).sort()) console.log(v, k);
