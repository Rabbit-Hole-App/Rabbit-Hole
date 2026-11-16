// Visuals per card by depth, from archived card records (explain-archive JSON). Usage: node histogram.mjs <recordsDir>
import fs from 'node:fs';
import { deriveVisualRequirements, requirementText } from 'file:///C:/s/s2-prev/packages/control-plane/src/explanation-visuals.js';
const dir = process.argv[2];
const count = body => { const s = String(body || ''); return { d: (s.match(/```rh-diagram/g) || []).length, p: (s.match(/```rh-illustration/g) || []).length }; };
const recs = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ f, ...JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')) })).sort((a, b) => a.at.localeCompare(b.at));
const hist = {}, planHist = {}, rows = [];
const bump = (o, k1, k2) => { (o[k1] ??= { 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 }); o[k1][k2 > 3 ? '4+' : k2]++; };
const outcomes = {};
for (const r of recs) {
  outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
  if (r.outcome !== 'artifact' || r.returned?.type !== 'explanation') continue;
  const depth = r.request?.depth ?? 'null';
  const b = [r.returned.body, ...(r.returned.more || []).map(m => m?.text)].map(count).reduce((a, c) => ({ d: a.d + c.d, p: a.p + c.p }), { d: 0, p: 0 });
  const n = b.d + b.p, planned = r.plan?.visuals?.length ?? null;
  const asked = deriveVisualRequirements(requirementText({ args: r.request.args })).items?.filter(i => !i.implied && (i.kind === 'diagram' || i.kind === 'illustration')).length ?? 0;
  bump(hist, depth, n); bump(hist, 'ALL', n);
  if (planned !== null) { bump(planHist, depth, planned); bump(planHist, 'ALL', planned); }
  rows.push({ id: r.id.slice(0, 8), at: r.at, depth, planned, planner: r.plan?.planner ?? null, planKinds: (r.plan?.visuals || []).map(v => v.type === 'picture' ? 'picture' : v.kind ?? `choose:${v.choose}`).join('+'), carried: n, diagrams: b.d, pictures: b.p, askedByLearner: asked, planned_secondVisual: !!r.plan?.secondVisual, physical: !!r.plan?.physicalOverride, args: r.request.args.slice(0, 70) });
}
console.log('records', recs.length, 'outcomes', JSON.stringify(outcomes), 'release values', [...new Set(recs.map(r => r.release))], 'span', recs[0].at, recs.at(-1).at);
console.log('CARRIED visuals per card, by depth (cards with 0/1/2/3/4+):'); console.table(hist);
console.log('PLANNED visuals per card (plan.visuals.length), by depth:'); console.table(planHist);
console.log('cards with no plan field (plan null):', recs.filter(r => r.outcome === 'artifact' && !r.plan).length);
console.table(rows.map(({ id, depth, planned, planKinds, carried, diagrams, pictures, askedByLearner, args }) => ({ id, depth, planned, planKinds, carried, diagrams, pictures, askedByLearner, args })));
const diff = rows.filter(r => r.planned !== null && r.planned !== r.carried);
console.log('cards where carried != planned:', diff.length, diff.map(r => `${r.id} planned ${r.planned} carried ${r.carried}`));
fs.writeFileSync('histogram-output.json', JSON.stringify({ hist, planHist, rows }, null, 1));
