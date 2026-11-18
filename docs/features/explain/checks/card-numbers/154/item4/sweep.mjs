import fs from 'node:fs';
import { tutorDiagramSchema } from 'file:///C:/s/card-numbers-b/packages/web/src/tutor-diagrams/spec.js';
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/card-errors/cards-all.json', 'utf8'));
const walk = (o, out) => { if (Array.isArray(o)) o.forEach(x => walk(x, out)); else if (o && typeof o === 'object') { if (o.kind === 'sample-set') out.push(o); Object.values(o).forEach(x => walk(x, out)); } return out; };
const row = { sampleSets: 0, sayBootstrap: 0, otherSchemaIssue: 0, flagged: 0, pass: 0 }; const flagged = [];
for (const c of cards) for (const d of walk(c.diagrams, [])) {
  row.sampleSets++;
  if (!/bootstrap/i.test(JSON.stringify([d.title, d.caption, d.groups?.map(g => g.label), d.samples?.map(s => [s.label, s.class])]))) continue;
  row.sayBootstrap++;
  const r = tutorDiagramSchema.safeParse({ version: 1, diagram: d });
  const issues = r.success ? [] : r.error.issues;
  if (issues.some(i => i.params?.code !== 'arithmetic')) { row.otherSchemaIssue++; continue; }
  if (issues.length) { row.flagged++; flagged.push({ id: c.id, run: c.run, msg: issues[0].message }); } else row.pass++;
}
console.log(JSON.stringify(row)); flagged.forEach(f => console.log(JSON.stringify(f)));
