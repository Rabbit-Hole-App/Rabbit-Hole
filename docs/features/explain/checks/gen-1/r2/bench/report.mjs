// GEN-1 R2 bench report (offline, on results.jsonl). usage: node report.mjs [results.jsonl] > report.md
// FIRST: both rates, planner kind delivered and effective plan kind delivered (the kind the request carried: examplesKind of a seeded request, else the gallery example's kind from shapeId, else the planner's kind).
import fs from 'node:fs';
const rows = fs.readFileSync(process.argv[2] ?? 'results.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const out = [], P = s => out.push(s);
const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)} %)` : '0/0');
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p90 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : null; };
const arms = ['before', 'after'], sets = [...new Set(rows.map(r => r.set))];
const effKind = r => r.examplesKind ?? (r.shapeId ? String(r.shapeId).replace(/^shape-/, '') : null) ?? r.plannerKind ?? null;
const deliveredOf = r => rows.filter(x => x === r).length && r.delivered;
const rate = (R, key) => { const base = R.filter(r => r.delivered && key(r)); const hit = base.filter(r => (r.finalKinds ?? []).includes(key(r))); return pct(hit.length, base.length); };
const plannerRate = R => rate(R, r => r.plannerKind), effRate = R => rate(R, effKind);
const mainRows = (arm, extra = () => true) => rows.filter(r => r.arm === arm && r.set !== 'roadmap' && extra(r));

P('# GEN-1 R2 bench report\n');
P('## First line: planner kind delivered and effective plan kind delivered\n');
P('| set / profile | arm | runs | delivered | planner kind delivered | effective plan kind delivered (the kind the request carried) |\n|---|---|---|---|---|---|');
for (const set of sets.filter(s => s !== 'roadmap')) for (const profile of ['google-low', 'fireworks-low']) for (const arm of arms) {
  const R = rows.filter(r => r.arm === arm && r.set === set && (r.profile ?? 'google-low') === profile); if (!R.length) continue;
  P(`| ${set} / ${profile} | ${arm} | ${R.length} | ${R.filter(r => r.delivered).length} | ${plannerRate(R)} | ${effRate(R)} |`);
}
for (const arm of arms) { const R = mainRows(arm); P(`| ALL questions | ${arm} | ${R.length} | ${R.filter(r => r.delivered).length} | ${plannerRate(R)} | ${effRate(R)} |`); }

// structure and values of one diagram
const labels = (o, acc = []) => { if (Array.isArray(o)) o.forEach(x => labels(x, acc)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && /^(label|name|heading|title|id|text)$/.test(k)) acc.push(v); else labels(v, acc); } return acc; };
const lens = (o, acc = []) => { if (Array.isArray(o)) { acc.push(o.length); o.forEach(x => lens(x, acc)); } else if (o && typeof o === 'object') Object.values(o).forEach(v => lens(v, acc)); return acc; };
const nums = (o, acc = []) => { if (typeof o === 'number') acc.push(o); else if (Array.isArray(o)) o.forEach(x => nums(x, acc)); else if (o && typeof o === 'object') Object.values(o).forEach(v => nums(v, acc)); return acc; };
const structSig = d => JSON.stringify([d.kind, lens(d), labels(d).sort()]), kindSig = d => d.kind, valueSig = d => JSON.stringify(nums(d));

P('\n## Same prompt, three seeds (delivered cards, first diagram): distinct kinds, distinct structures (kind + item counts + labels), distinct values\n');
P('| set | arm | questions with 3 delivered runs | mean distinct kinds | mean distinct structures | questions with 2+ distinct structures | mean distinct values |\n|---|---|---|---|---|---|---|');
for (const set of sets.filter(s => !['roadmap'].includes(s))) for (const arm of arms) {
  const byQ = new Map(); for (const r of rows.filter(x => x.arm === arm && x.set === set && (x.profile ?? 'google-low') === 'google-low' && x.delivered && x.diagrams?.[0])) { const k = r.prompt; (byQ.get(k) ?? byQ.set(k, []).get(k)).push(r.diagrams[0]); }
  const full = [...byQ.values()].filter(v => v.length >= 3).map(v => v.slice(0, 3)); if (!full.length) continue;
  const mean = f => (full.reduce((s, v) => s + new Set(v.map(f)).size, 0) / full.length).toFixed(2);
  P(`| ${set} | ${arm} | ${full.length} | ${mean(kindSig)} | ${mean(structSig)} | ${pct(full.filter(v => new Set(v.map(structSig)).size >= 2).length, full.length)} | ${mean(valueSig)} |`);
}

P('\n## The SAME-1 triplet: do the three questions share a picture (kind + item counts + labels)?\n');
P('| arm | profile | rep | A kind | B kind | C kind | A = B = C structure |\n|---|---|---|---|---|---|---|');
for (const arm of arms) for (const profile of ['google-low', 'fireworks-low']) for (const rep of [1, 2, 3]) {
  const t = ['A', 'B', 'C'].map(tag => rows.find(r => r.arm === arm && r.set === 'same1' && r.tag === tag && r.rep === rep && (r.profile ?? 'google-low') === profile)); if (t.some(x => !x)) continue;
  const d = t.map(x => x.diagrams?.[0]); P(`| ${arm} | ${profile} | ${rep} | ${d[0]?.kind ?? '-'} | ${d[1]?.kind ?? '-'} | ${d[2]?.kind ?? '-'} | ${d.every(Boolean) && new Set(d.map(structSig)).size === 1 ? 'YES' : 'no'} |`);
}

P('\n## Roadmap path (separately: repairs 0, one call per card)\n');
P('| arm | cards | delivered | honest failures | settled cost per card (micros, mean) | hold (quote) micros, mean | actual / hold | planner kind delivered | effective plan kind delivered |\n|---|---|---|---|---|---|---|---|---|');
for (const arm of arms) { const R = rows.filter(r => r.arm === arm && r.set === 'roadmap'); if (!R.length) continue;
  const mean = a => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null), cost = mean(R.map(r => r.costMicros || 0)), hold = mean(R.filter(r => r.holdMicros).map(r => r.holdMicros));
  P(`| ${arm} | ${R.length} | ${R.filter(r => r.delivered).length} | ${R.filter(r => !r.delivered).length} | ${cost} | ${hold} | ${hold ? (cost / hold).toFixed(3) : 'n/a'} | ${plannerRate(R)} | ${effRate(R)} |`); }

P('\n## Per arm: failures, repairs, flags, providers, latency, cost (questions, all sets)\n');
P('| arm | runs | delivered | honest failures | first attempt valid | repairs (sum) | moved to next provider | 154-rule flags | old-classifier flags | p50 / p90 ms | settled US$ |\n|---|---|---|---|---|---|---|---|---|---|---|');
for (const arm of arms) { const R = mainRows(arm); const known = R.filter(r => r.firstAttemptValid != null);
  P(`| ${arm} | ${R.length} | ${R.filter(r => r.delivered).length} | ${R.filter(r => !r.delivered).length} | ${pct(known.filter(r => r.firstAttemptValid).length, known.length)} | ${R.reduce((s, r) => s + (r.attempts ?? []).reduce((a, x) => a + (x.repairs ?? 0), 0), 0)} | ${R.filter(r => r.movedToNextProvider).length} | ${R.filter(r => r.flags154?.length).length} | ${R.filter(r => r.flags?.length).length} | ${med(R.map(r => r.ms))} / ${p90(R.map(r => r.ms))} | ${(R.reduce((s, r) => s + (r.costMicros || 0), 0) / 1e6).toFixed(3)} |`); }
const all = rows.reduce((s, r) => s + (r.costMicros || 0) + 200, 0) / 1e6; P(`\nSettled total of the bench (incl. the planner estimate US$0.0002 a run): US$${all.toFixed(3)}.`);
P('\n## Seeded-example trace (AFTER): runs with examples, mean examples per seeded run\n');
const seeded = rows.filter(r => r.arm === 'after' && r.examples?.length); P(`${seeded.length} seeded runs; mean ${(seeded.reduce((s, r) => s + r.examples.length, 0) / (seeded.length || 1)).toFixed(2)} examples; kinds: ${JSON.stringify(seeded.reduce((o, r) => ((o[r.examplesKind] = (o[r.examplesKind] || 0) + 1), o), {}))}`);
console.log(out.join('\n'));
