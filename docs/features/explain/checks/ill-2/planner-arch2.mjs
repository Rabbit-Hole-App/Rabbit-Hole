import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const R2 = 'C:/s/spec/owner-local/persist/local/v3/r2';
const db = new DatabaseSync(`${R2}/miniflare-R2BucketObject/746c97696fbbb9cf5581f88be52d0dab2857cc3278d166048e6396b80b3dcc16.sqlite`, { readOnly: true });
const pt = ms => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const recs = [];
for (const r of db.prepare("select key,blob_id,uploaded from _mf_objects where key like 'explain-archive/%' order by uploaded").all()) {
  let j; try { j = JSON.parse(fs.readFileSync(`${R2}/rabbit-hole-dev-learn-media/blobs/${r.blob_id}`, 'utf8')); } catch { continue; }
  recs.push({ t: r.uploaded, pt: pt(r.uploaded), j });
}
console.log('request keys', Object.keys(recs[5].j.request || {}).join(','), '| record keys', Object.keys(recs[5].j).join(','));
const kinds = {};
for (const r of recs) { const q = r.j.request || {}; const k = `${q.command ?? '?'} planned=${q.planned ?? 'u'} hasPlan=${r.j.plan ? 'y' : 'n'}`; kinds[k] = (kinds[k] || 0) + 1; }
console.log(kinds);
const v1 = recs.filter(r => r.j.request?.command === 'explanation');
console.log('v1 explanation records', v1.length);
for (const r of v1) console.log(r.pt, r.j.plan ? `plan ${r.j.plan.ms} ms (${r.j.plan.planner ?? '?'})` : 'plan null', '| profile', r.j.profile ?? '-', '| release', String(r.j.release ?? '-').slice(0, 9));
const v2 = recs.filter(r => r.j.request?.command !== 'explanation');
console.log('v2/other', v2.length, 'with plan.ms numeric', v2.filter(r => typeof r.j.plan?.ms === 'number').length);
