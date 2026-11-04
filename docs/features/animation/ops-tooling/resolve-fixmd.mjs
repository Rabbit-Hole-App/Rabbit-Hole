// Resolves a merge conflict in docs/features/animation/fix.md: every lane appends its entries in the same place, so the resolution keeps BOTH sides,
// ordered by FX-AN number, and never lets one heading appear twice. Exit 0 resolved (the file is rewritten, not staged); exit 1 not resolvable here.
//   node resolve-fixmd.mjs <path to fix.md>
// A conflict hunk is split into entries at "### " headings. An entry present on both sides with the same heading and the same body is kept once; the same
// heading with different bodies (two lanes claimed one number) stops the merge: that is a numbering decision, not a mechanical one.
// Text in a hunk before its first "### " heading (a changed line inside an entry) is not mechanical either, so it also stops.
import fs from 'node:fs';
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.split('\n');
const t = l => l.replace(/\r$/, '');
const num = e => Number((e[0].match(/FX-AN-(\d+)/) || [])[1]);
// Entries that sit OUTSIDE every conflict hunk (the merge placed them cleanly on one side and inside the hunk on the other): the hunk must not repeat them.
const outside = new Map();
{
  let inHunk = false, cur = null;
  for (const l of lines) {
    if (l.startsWith('<<<<<<< ')) { inHunk = true; cur = null; continue; }
    if (l.startsWith('>>>>>>> ')) { inHunk = false; cur = null; continue; }
    if (inHunk) continue;
    if (l.startsWith('### ')) { cur = { key: t(l).split(' — ')[0], body: [] }; outside.set(cur.key, cur); }
    else if (l.startsWith('## ')) cur = null;
    if (cur) cur.body.push(t(l));
  }
  for (const v of outside.values()) { while (v.body.length && v.body[v.body.length - 1].trim() === '') v.body.pop(); v.body = v.body.join('\n'); }
}
const out = [];
let i = 0, hunks = 0;
while (i < lines.length) {
  if (!lines[i].startsWith('<<<<<<< ')) { out.push(lines[i++]); continue; }
  const mid = lines.findIndex((l, k) => k > i && t(l) === '=======');
  const end = lines.findIndex((l, k) => k > mid && l.startsWith('>>>>>>> '));
  if (mid < 0 || end < 0) { console.error('unterminated conflict markers'); process.exit(1); }
  const side = arr => {
    const first = arr.findIndex(l => l.startsWith('### '));
    if (arr.some(l => t(l).trim() !== '') && first !== 0 && arr.slice(0, first < 0 ? arr.length : first).some(l => t(l).trim() !== '')) { console.error('text before the first entry heading in a conflict side: not mechanical'); process.exit(1); }
    const entries = []; let cur = null;
    for (const l of arr) { if (l.startsWith('### ')) { cur = [l]; entries.push(cur); } else if (cur) cur.push(l); }
    return entries.map(e => { while (e.length && t(e[e.length - 1]).trim() === '') e.pop(); return e; });
  };
  const ours = side(lines.slice(i + 1, mid)), theirs = side(lines.slice(mid + 1, end));
  const byHeading = new Map();
  for (const e of [...ours, ...theirs]) {
    const key = t(e[0]).split(' — ')[0];
    const body = e.map(t).join('\n');
    if (outside.has(key)) {
      if (outside.get(key).body !== body) { console.error(`${key} is inside the conflict and also outside it with different text: a numbering decision`); process.exit(1); }
      continue;
    }
    if (byHeading.has(key)) {
      if (byHeading.get(key).body !== body) { console.error(`${key} appears on both sides with different text: a numbering decision`); process.exit(1); }
      continue;
    }
    byHeading.set(key, { e, body });
  }
  const all = [...byHeading.values()].map(v => v.e).sort((a, b) => num(a) - num(b));
  const blank = crlf ? '\r' : '';
  all.forEach((e, k) => { if (k) out.push(blank); out.push(...e); });
  out.push(blank);
  hunks++;
  i = end + 1;
}
fs.writeFileSync(file, out.join('\n'));
const text = out.join('\n');
const headings = [...text.matchAll(/^### (FX-AN-\d+)/gm)].map(m => m[1]);
const dup = headings.filter((h, k) => headings.indexOf(h) !== k);
if (dup.length) { console.error(`duplicate headings after the resolution: ${[...new Set(dup)].join(', ')}`); process.exit(1); }
console.log(`resolved ${hunks} hunk(s); ${new Set(headings).size} unique FX-AN headings; no duplicates`);
