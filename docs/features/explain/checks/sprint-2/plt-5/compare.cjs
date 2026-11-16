// Compares count-before.json (released main 74c4f68ae) with count-after.json: the line series whose form (smooth or straight) or marker count changes.
const fs = require('fs');
const before = JSON.parse(fs.readFileSync('count-before.json', 'utf8')), after = JSON.parse(fs.readFileSync('count-after.json', 'utf8'));
const key = r => `${r.id}${r.path}|${r.label}`;
const map = new Map(before.map(r => [key(r), r]));
const rows = [];
let total = 0;
for (const a of after) {
  if (a.error) continue;
  const b = map.get(key(a)); total++;
  if (!b) { rows.push({ id: a.id, label: a.label, note: 'new' }); continue; }
  const form = r => r.smooth === null ? '?' : r.smooth ? 'smooth' : 'straight';
  if (form(a) !== form(b) || a.markers !== b.markers) rows.push({ id: a.id, path: a.path, label: a.label, samples: a.samples, closed: a.closed, declared: a.declared, scatter: a.hasScatter, from: `${form(b)}, ${b.markers} markers`, to: `${form(a)}, ${a.markers} markers`, formChanged: form(a) !== form(b), markersChanged: a.markers !== b.markers });
}
const formChanged = rows.filter(r => r.formChanged).length, markerOnly = rows.filter(r => !r.formChanged && r.markersChanged).length;
let md = `# Line series whose drawing changes under PLT-5 (vs released main 74c4f68ae)\n\nSeries counted: ${total} line series in ${new Set(after.map(r => r.id)).size} references (every coordinate-plot found at any depth in the reference library, rendered alone at 720 px).\n\n- form changes (smooth <-> straight): **${formChanged}**\n- marker changes only: **${markerOnly}**\n- unchanged: ${total - rows.length}\n\n| reference id | series | samples | closed | smooth declared | from | to |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.id}${r.path || ''} | ${r.label} | ${r.samples} | ${r.closed ? 'yes' : ''} | ${r.declared ?? ''} | ${r.from} | ${r.to} |\n`;
fs.writeFileSync('count-table.md', md);
console.log({ total, formChanged, markerOnly, unchanged: total - rows.length });
