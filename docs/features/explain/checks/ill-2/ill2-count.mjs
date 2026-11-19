// ILL-2 offline counts over the 8878 explain archive (local R2 sqlite + blobs): picture cards by plan state. Ids and numbers only.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const R2 = 'C:/s/spec/owner-local/persist/local/v3/r2/';
const db = new DatabaseSync(R2 + 'miniflare-R2BucketObject/746c97696fbbb9cf5581f88be52d0dab2857cc3278d166048e6396b80b3dcc16.sqlite', { readOnly: true });
const rows = db.prepare("select key,blob_id,uploaded from _mf_objects where key like 'explain-archive/%' order by uploaded").all();
const recs = [];
for (const r of rows) { try { const j = JSON.parse(fs.readFileSync(R2 + 'rabbit-hole-dev-learn-media/blobs/' + r.blob_id, 'utf8')); recs.push({ key: r.key, j }); } catch { /* unreadable blob */ } }
const isJob = k => /\/ej_/.test(k);
const std = recs.filter(r => !isJob(r.key) && r.j?.request);
const jobs = recs.filter(r => isJob(r.key));
const hasPic = j => Object.keys(j?.returned?.figures || {}).length > 0 || /rh-illustration/.test(String(j?.returned?.body || ''));
const delivered = j => j?.outcome === 'artifact';
const vt = j => j?.plan?.visualType ?? j?.plan?.visualTypeChoice ?? j?.plan?.probabilities?.visualType ?? null;
const out = { objects: rows.length, standardRecords: std.length, jobRecords: jobs.length };
const picStd = std.filter(r => delivered(r.j) && hasPic(r.j));
out.deliveredWithPicture = picStd.length;
out.picturePlanNull = picStd.filter(r => r.j.plan === null).length;
out.pictureWithPlan = picStd.filter(r => r.j.plan !== null).length;
out.picturePlanVisualTypeDiagram = picStd.filter(r => r.j.plan && JSON.stringify(r.j.plan).includes('"diagram"') && (r.j.plan.visuals || []).every(v => v?.type !== 'picture')).length;
out.deliveredTotal = std.filter(r => delivered(r.j)).length;
out.deliveredPlanNull = std.filter(r => delivered(r.j) && r.j.plan === null).length;
out.pictureRows = picStd.map(r => ({ id: r.j.id, day: r.key.split('/')[1], atUtc: r.j.at, plan: r.j.plan === null ? 'null' : (r.j.plan.visuals || []).map(v => v?.type).join('+') || 'plan', plannerKind: r.j.plannerKind ?? null, profile: r.j.profile?.id ?? null, command: r.j.request?.command, sel: r.j.request?.selection?.kind ?? null }));
// job records (explain-job v2): do they carry figures or a plan field?
out.jobKeys = jobs.slice(0, 1).map(r => Object.keys(r.j).slice(0, 25));
out.jobsWithPicture = jobs.filter(r => /rh-illustration|"figures"/.test(JSON.stringify(r.j))).length;
console.log(JSON.stringify(out, null, 1));
const sample = std.find(r => r.j.plan !== null);
if (sample) console.log('plan keys of one record with a plan:', Object.keys(sample.j.plan).join(','), '| visuals:', JSON.stringify((sample.j.plan.visuals || []).map(v => ({ type: v?.type, kind: v?.kind }))));
