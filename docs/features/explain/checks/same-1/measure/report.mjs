// SAME-1 report from results.jsonl. node report.mjs [results.jsonl] > REPORT.md
// FIRST LINES answer the Reviewer's question: do the three SAME-1 questions (A, B, C) still share a picture in each arm (kind + reference id + item counts per card)? Then the per-arm tables.
import fs from 'node:fs';
const file = process.argv[2] ?? 'results.jsonl';
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const ARMS = ['before', 'after', 'everything'], PROFILES = ['google-low', 'fireworks-low'];
const cardText = r => r.delivered ? r.cards.map(c => `${c.kind}${Object.keys(c.counts).length ? '[' + Object.entries(c.counts).map(([k, v]) => `${k}:${v}`).join(' ') + ']' : ''}`).join('+') : `FAILED(${r.errorCode ?? 'none'})`;
const refText = r => (r.references ?? []).slice(0, 3).join(',') || 'none';
const out = [];
out.push('# SAME-1 measurement report');
out.push('');
for (const arm of ARMS) for (const profile of PROFILES) for (const rep of [1, 2]) {
  const trio = ['A', 'B', 'C'].map(tag => rows.find(r => r.arm === arm && r.profile === profile && r.set === 'same1' && r.tag === tag && r.rep === rep));
  if (trio.some(x => !x)) { out.push(`${arm} / ${profile} / rep ${rep}: not run`); continue; }
  const delivered = trio.filter(r => r.delivered), keys = new Set(delivered.map(r => r.pictureKey));
  const shareExact = delivered.length === 3 && keys.size === 1, shareShape = delivered.length === 3 && new Set(delivered.map(cardText)).size === 1;
  out.push(`${arm} / ${profile} / rep ${rep}: A, B, C ${shareExact ? 'SHARE ONE PICTURE (same diagram apart from title and caption)' : shareShape ? 'share the same kind and item counts (not identical)' : delivered.length < 3 ? `do not all deliver (${3 - delivered.length} failed)` : 'do NOT share a picture'} | A ${cardText(trio[0])} refs ${refText(trio[0])} | B ${cardText(trio[1])} refs ${refText(trio[1])} | C ${cardText(trio[2])} refs ${refText(trio[2])}`);
}
out.push('');
out.push('## Per arm and profile (all 52 items)');
out.push('| arm | profile | runs | delivered | honest failures | repairs (sum) | planned kind delivered | transformation planned | 1-into-1 cards delivered | cost US$ (settled) |');
out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const arm of ARMS) for (const profile of PROFILES) {
  const r = rows.filter(x => x.arm === arm && x.profile === profile); if (!r.length) continue;
  const d = r.filter(x => x.delivered), t = r.filter(x => x.plannedKind === 'transformation');
  const oneOne = d.filter(x => (x.transformationSizes ?? []).some(([b, a]) => b === 1 && a === 1)).length;
  out.push(`| ${arm} | ${profile} | ${r.length} | ${d.length} | ${r.length - d.length} | ${r.reduce((s, x) => s + x.repairs, 0)} | ${d.filter(x => x.deliveredAsPlanned).length}/${d.length} | ${t.length} | ${oneOne} | ${(r.reduce((s, x) => s + x.costMicros, 0) / 1e6).toFixed(3)} |`);
}
out.push('');
out.push('## Planned kind and delivered kind per question (set softmax and transformation), by arm');
for (const set of ['softmax', 'transformation']) {
  out.push(`### ${set}`);
  out.push('| tag | profile | ' + ARMS.map(a => `${a}: planned > delivered (refs) rep`).join(' | ') + ' |');
  out.push('| --- | --- | ' + ARMS.map(() => '---').join(' | ') + ' |');
  const tags = [...new Set(rows.filter(r => r.set === set).map(r => r.tag))];
  for (const tag of tags) for (const profile of PROFILES) out.push(`| ${tag} | ${profile} | ` + ARMS.map(arm => { const r = rows.find(x => x.arm === arm && x.profile === profile && x.set === set && x.tag === tag); return r ? `${r.plannedKind ?? '-'} > ${cardText(r)} (${refText(r)}) r${r.repairs}` : 'not run'; }).join(' | ') + ' |');
}
console.log(out.join('\n'));
