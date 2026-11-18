// Sweep: every softmax list-transformation in cards-all.json against the new schema rule. Run: node sweep.mjs
import fs from 'node:fs';
import { tutorDiagramSchema } from 'file:///C:/s/card-numbers-b/packages/web/src/tutor-diagrams/spec.js';
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/card-errors/cards-all.json', 'utf8'));
const walk = (o, out) => { if (Array.isArray(o)) o.forEach(x => walk(x, out)); else if (o && typeof o === 'object') { if (o.kind === 'transformation') out.push(o); Object.values(o).forEach(x => walk(x, out)); } return out; };
const OFF = /temperature|scaled|scaling|masked|causal|log[- ]?softmax/i, T = /\bT\s*=/;
const row = { cards: cards.length, transformations: 0, softmaxList: 0, schemaOtherIssue: 0, survive: 0, gated: 0, flagged: 0, passed: 0, numeric: 0, nonNumericSkipped: 0 }; const flagged = [], gatedIds = [];
for (const c of cards) for (const d of walk(c.diagrams, [])) {
  row.transformations++;
  if (d.variant === 'visual' || !d.before?.items || !/softmax/i.test(`${d.title} ${d.operation}`)) continue;
  row.softmaxList++;
  const r = tutorDiagramSchema.safeParse({ version: 1, diagram: d });
  const other = r.success ? [] : r.error.issues.filter(i => i.params?.code !== 'arithmetic');
  if (other.length) { row.schemaOtherIssue++; continue; }
  row.survive++;
  const num = x => typeof x === 'string' && /^(-?\d+(?:\.\d+)?)\s*%?$/.test(x.replace(/\$/g, '').split(/[=:]/).pop().trim().replace(/−/g, '-'));
  if ([...d.before.items, ...d.after.items].every(num) && d.before.items.length === d.after.items.length) row.numeric++; else row.nonNumericSkipped++;
  const arith = r.success ? [] : r.error.issues.filter(i => i.params?.code === 'arithmetic');
  const labels = [d.title, d.caption, d.operation, d.before.label, d.after.label, ...(d.links ?? []).map(l => l.label)].filter(Boolean).join(' ');
  if (OFF.test(labels) || T.test(labels)) { row.gated++; gatedIds.push(c.id); if (arith.length) flagged.push({ id: c.id, run: c.run, gated: true, msg: arith[0].message }); continue; }
  if (arith.length) { row.flagged++; flagged.push({ id: c.id, run: c.run, before: d.before.items, after: d.after.items, msg: arith[0].message }); } else row.passed++; // passed includes the non-numeric items the rule skips
}
console.log(JSON.stringify(row)); for (const f of flagged) console.log(JSON.stringify(f));
console.log('gated ids', JSON.stringify([...new Set(gatedIds)]));
