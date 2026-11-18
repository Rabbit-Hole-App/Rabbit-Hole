import fs from 'node:fs';
const rows = fs.readFileSync('results.jsonl', 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.set === 'same1');
const out = [];
out.push('| arm | profile | triplets | A,B,C same kind | B and C same kind | A,B,C identical picture (pictureKey) | B and C identical picture | A,B,C same kind + same item counts |');
out.push('|---|---|---|---|---|---|---|---|');
const key = r => `${(r.deliveredKinds || []).join('+')}`;
const counts = r => JSON.stringify(r.cards?.[0]?.sizes ?? r.transformationSizes ?? null);
for (const arm of ['before', 'after', 'everything']) for (const profile of ['google-low', 'fireworks-low']) {
  const by = {};
  for (const r of rows.filter(x => x.arm === arm && x.profile === profile)) (by[r.rep ?? 0] ||= {})[r.tag] = r;
  const tr = Object.values(by).filter(t => t.A && t.B && t.C);
  const n = tr.length, c = f => tr.filter(f).length;
  out.push(`| ${arm} | ${profile} | ${n} | ${c(t => key(t.A) === key(t.B) && key(t.B) === key(t.C))} | ${c(t => key(t.B) === key(t.C))} | ${c(t => t.A.pictureKey === t.B.pictureKey && t.B.pictureKey === t.C.pictureKey)} | ${c(t => t.B.pictureKey === t.C.pictureKey)} | ${c(t => key(t.A) === key(t.B) && key(t.B) === key(t.C) && JSON.stringify(t.A.transformationSizes) === JSON.stringify(t.B.transformationSizes) && JSON.stringify(t.B.transformationSizes) === JSON.stringify(t.C.transformationSizes))} |`);
}
console.log(out.join('\n'));

