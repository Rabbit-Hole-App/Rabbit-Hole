// Every sample-set that says bootstrap in the repo's references, fixtures and docs JSON, against the new rule. Usage: node refscan.mjs <list-of-files>
import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
import { tutorDiagramSchema } from 'file:///C:/s/card-numbers-b/packages/web/src/tutor-diagrams/spec.js';
const files = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean);
const found = [];
const walk = (o, f, seen = new Set()) => { if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o); if (Array.isArray(o)) o.forEach(x => walk(x, f, seen)); else { if (o.kind === 'sample-set' && Array.isArray(o.samples) && Array.isArray(o.groups)) found.push({ f, d: o }); Object.values(o).forEach(x => walk(x, f, seen)); } };
for (const f of files) {
  const p = 'C:/s/card-numbers-b/' + f.split(String.fromCharCode(92)).join('/');
  if (f.endsWith('.json')) { try { walk(JSON.parse(fs.readFileSync(p, 'utf8')), f); } catch (e) { console.log('unparsed', f, e.message); } }
  else if (f.endsWith('.js')) { const m = await import(pathToFileURL(p).href); walk(m, f); }
}
let say = 0, flagged = 0;
for (const { f, d } of found) {
  if (!/bootstrap/i.test(JSON.stringify([d.title, d.caption, d.groups.map(g => g.label), d.samples.map(s => [s.label, s.class])]))) continue;
  say++;
  const r = tutorDiagramSchema.safeParse({ version: 1, diagram: d }); const bad = r.success ? [] : r.error.issues;
  const ar = bad.filter(i => i.params?.code === 'arithmetic');
  if (ar.length) { flagged++; console.log('FLAG', f, d.title, '|', ar[0].message); } else if (bad.length) console.log('other-schema-issue', f, d.title, bad[0].message);
}
console.log(JSON.stringify({ filesScanned: files.length, sampleSets: found.length, sayBootstrap: say, flagged }));
