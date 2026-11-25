import fs from 'node:fs';
const rows = fs.readFileSync('C:/s/same-json-run/four/results.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const fb = rows.filter(r => r.set === 'fallback');
for (const r of fb) console.log(r.idx, r.arm, r.profile, 'authoredBy', JSON.stringify(r.authoredBy), 'attempts', JSON.stringify(r.attempts), 'steps', JSON.stringify(r.stepsRun), 'moved', r.movedToNextProvider, 'providerCalls', JSON.stringify(r.providerCalls));
const m = rows.filter(r => r.set === 'four');
const prov = {}; for (const r of m) { const k = `${r.arm}|${r.authoredBy?.provider ?? 'none'}`; prov[k] = (prov[k] ?? 0) + 1; }
console.log('main-set authoring providers', JSON.stringify(prov));
const mv = m.filter(r => r.movedToNextProvider || (r.attempts ?? []).some(a => a.provider !== 'google'));
for (const r of mv) console.log('moved/non-google attempt:', r.idx, r.arm, r.refId, r.depth, r.delivered, JSON.stringify(r.attempts).slice(0, 300));
const resc = rows.filter(r => r.rescuedVisual?.length);
for (const r of resc) console.log('rescued:', r.idx, r.arm, r.refId, r.depth, JSON.stringify(r.rescuedVisual), 'delivered', r.delivered, 'firstValid', r.firstAttemptValid);
