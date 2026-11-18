import fs from 'node:fs';
import { tutorDiagramSchema } from 'file:///C:/s/card-numbers-b/packages/web/src/tutor-diagrams/spec.js';
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/card-errors/cards-all.json', 'utf8'));
const walk = (o, out) => { if (Array.isArray(o)) o.forEach(x => walk(x, out)); else if (o && typeof o === 'object') { if (o.kind === 'box-plot') out.push(o); Object.values(o).forEach(x => walk(x, out)); } return out; };
const row = { boxPlots: 0, withFences: 0, whiskerBeyondFence: 0, otherSchemaIssue: 0 }; const hits = [];
for (const c of cards) for (const d of walk(c.diagrams, [])) {
  row.boxPlots++; if (!d.boxes?.some(b => b.fences)) continue; row.withFences++;
  const r = tutorDiagramSchema.safeParse({ version: 1, diagram: d }); const bad = r.success ? [] : r.error.issues;
  const w = bad.filter(i => /enclose both whiskers/.test(i.message)); if (w.length) { row.whiskerBeyondFence++; hits.push({ id: c.id, run: c.run, msg: w[0].message }); }
  else if (bad.length) row.otherSchemaIssue++;
}
console.log(JSON.stringify(row)); hits.forEach(h => console.log(JSON.stringify(h)));
