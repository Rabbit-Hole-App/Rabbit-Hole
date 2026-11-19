// GEN-1 R3 bench report (offline, on results.jsonl). usage: node report.mjs [results.jsonl] > report.md
// FIRST: for questions with a reference, how many give three visibly identical pictures (same kind, same labels, same values) BEFORE and AFTER.
import fs from 'node:fs';
const rows = fs.readFileSync(process.argv[2] ?? 'results.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const cells = JSON.parse(fs.readFileSync('C:/s/gen1-r3pre/cells.json', 'utf8'));
const out = [], P = s => out.push(s);
const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)} %)` : '0/0');
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p90 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : null; };
const arms = ['before', 'after'];
const labels = (o, acc = []) => { if (Array.isArray(o)) o.forEach(x => labels(x, acc)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && /^(label|name|heading|title|id|text)$/.test(k)) acc.push(v); else labels(v, acc); } return acc; };
const lens = (o, acc = []) => { if (Array.isArray(o)) { acc.push(o.length); o.forEach(x => lens(x, acc)); } else if (o && typeof o === 'object') Object.values(o).forEach(v => lens(v, acc)); return acc; };
const nums = (o, acc = []) => { if (typeof o === 'number') acc.push(o); else if (Array.isArray(o)) o.forEach(x => nums(x, acc)); else if (o && typeof o === 'object') Object.values(o).forEach(v => nums(v, acc)); return acc; };
const sig = d => JSON.stringify([d.kind, lens(d), labels(d).sort(), nums(d)]), structSig = d => JSON.stringify([d.kind, lens(d), labels(d).sort()]), valueSig = d => JSON.stringify(nums(d));
const byQuestion = (arm, set) => { const m = new Map(); for (const r of rows.filter(x => x.arm === arm && x.set === set && x.delivered && x.diagrams?.[0])) (m.get(r.prompt) ?? m.set(r.prompt, []).get(r.prompt)).push(r); return [...m.values()].filter(v => v.length >= 3).map(v => v.slice(0, 3)); };

P('# GEN-1 R3 bench report\n');
P('## First: questions with a reference, three seeds: how many give three visibly identical pictures (same kind, same labels, same values)\n');
P('| set | arm | questions with 3 delivered runs | three identical pictures | same kind in all 3, other labels or values | 2+ distinct kinds | mean distinct structures | mean distinct values |\n|---|---|---|---|---|---|---|---|');
for (const set of ['ontopic', 'numeric']) for (const arm of arms) {
  const Q = byQuestion(arm, set); if (!Q.length) continue;
  const ds = Q.map(v => v.map(r => r.diagrams[0])), ident = ds.filter(d => new Set(d.map(sig)).size === 1).length, kinds = ds.filter(d => new Set(d.map(x => x.kind)).size >= 2).length, sameKindVaried = ds.filter(d => new Set(d.map(x => x.kind)).size === 1 && new Set(d.map(sig)).size > 1).length;
  const mean = f => (ds.reduce((s, d) => s + new Set(d.map(f)).size, 0) / ds.length).toFixed(2);
  P(`| ${set} | ${arm} | ${Q.length} | ${pct(ident, Q.length)} | ${sameKindVaried} | ${kinds} | ${mean(structSig)} | ${mean(valueSig)} |`);
}
P('\nPer on-topic question (kinds over the three seeds, BEFORE | AFTER; kindSource in AFTER):\n');
P('| question | BEFORE kinds | AFTER kinds | AFTER kindSource | AFTER closest example shown | AFTER three identical |\n|---|---|---|---|---|---|');
const prompts = [...new Set(rows.filter(r => r.set === 'ontopic').map(r => r.prompt))];
for (const q of prompts) {
  const R = arm => rows.filter(r => r.arm === arm && r.set === 'ontopic' && r.prompt === q).sort((a, b) => a.rep - b.rep);
  const b = R('before'), a = R('after');
  P(`| ${q.slice(0, 70)} | ${b.map(r => r.diagrams?.[0]?.kind ?? '-').join(', ')} | ${a.map(r => r.diagrams?.[0]?.kind ?? '-').join(', ')} | ${a.map(r => r.kindSource ?? '-').join(', ')} | ${a.map(r => (r.closest ? 'yes' : 'no')).join(', ')} | ${a.length >= 3 && a.every(r => r.diagrams?.[0]) && new Set(a.map(r => sig(r.diagrams[0]))).size === 1 ? 'YES' : 'no'} |`);
}

P('\n## kindSource and the draw (AFTER): how the kind was decided\n');
const af = rows.filter(r => r.arm === 'after' && r.set !== 'r3pre');
const ks = {}; for (const r of af) ks[r.kindSource ?? 'none (no plan or no probabilities)'] = (ks[r.kindSource ?? 'none (no plan or no probabilities)'] || 0) + 1;
P(`AFTER runs by kindSource: ${JSON.stringify(ks)}. Planner kind differs from the drawn kind in ${af.filter(r => r.kindDraw && r.plannerKind && r.kindDraw.drawn !== r.plannerKind).length} of ${af.filter(r => r.kindDraw).length} drawn runs.`);

P('\n## Planner kind delivered and effective plan kind delivered (the kind the request carried)\n');
const effKind = r => r.kindDraw?.drawn ?? r.examplesKind ?? (r.shapeId ? String(r.shapeId).replace(/^shape-/, '') : null) ?? r.plannerKind ?? null;
const rate = (R, key) => { const base = R.filter(r => r.delivered && key(r)); return pct(base.filter(r => (r.finalKinds ?? []).includes(key(r))).length, base.length); };
P('| set | arm | runs | delivered | planner kind delivered | effective plan kind delivered |\n|---|---|---|---|---|---|');
for (const set of ['ontopic', 'numeric', 'r3pre']) for (const arm of arms) { const R = rows.filter(r => r.arm === arm && r.set === set); if (!R.length) continue; P(`| ${set} | ${arm} | ${R.length} | ${R.filter(r => r.delivered).length} | ${rate(R, r => r.plannerKind)} | ${rate(R, effKind)} |`); }

P('\n## Wrong-number flags by rule (delivered-card flags; invalid first answers by the rule text of the refusal)\n');
const ruleOf = e => { const t = String(e.error ?? ''); const r = []; if (/computes to/i.test(t)) r.push('NUM-2'); if (/softmax/i.test(t)) r.push('NUM-3a/3c (softmax recompute)'); if (/fence|sum to 1|whisker|derived/i.test(t)) r.push('154 rules'); if (/sample|repeat/i.test(t) && /explanation_bad_diagram|bad_numbers/.test(t)) r.push('SAMP-1'); return r; };
P('| arm | delivered cards with a 154-rule flag | with an old-classifier flag | first answers refused for NUM-2 | for the softmax rules | for the 154 rules |\n|---|---|---|---|---|---|');
for (const arm of arms) { const R = rows.filter(r => r.arm === arm && r.set !== 'r3pre'); const ev = R.flatMap(r => (Array.isArray(r.events) ? r.events : []).filter(e => e.event === 'learn_artifact_invalid' && e.attempt === 0).map(ruleOf)); const c = k => ev.filter(x => x.includes(k)).length;
  P(`| ${arm} | ${R.filter(r => r.flags154?.length).length} | ${R.filter(r => r.flags?.length).length} | ${c('NUM-2')} | ${c('NUM-3a/3c (softmax recompute)')} | ${c('154 rules')} |`); }

P('\n## Cards where the caption or the prose names a value the picture does not show (candidates for the Reviewer to recompute from the sheets)\n');
const shown = d => new Set(nums(d).map(n => String(n)));
const numsIn = t => (String(t ?? '').replace(/\$[^$]*\$/g, ' ').match(/-?\d+(?:\.\d+)?/g) || []);
const bad = []; for (const r of rows.filter(x => x.delivered && x.diagrams?.[0])) { const d = r.diagrams[0], seen = shown(d), cap = numsIn(d.caption).filter(n => !seen.has(String(Number(n))) && !seen.has(n)); const prose = numsIn(String(r.body).replace(/```[\s\S]*?```/g, ' ')).filter(n => /\./.test(n) && !seen.has(String(Number(n))) && !seen.has(n)); if (cap.length || prose.length) bad.push(`${r.arm} ${r.set} ${r.tag ?? ''} seed ${r.rep}: ${cap.length ? `caption ${cap.slice(0, 4).join(', ')}` : ''}${cap.length && prose.length ? '; ' : ''}${prose.length ? `prose ${prose.slice(0, 4).join(', ')}` : ''}`); }
P(`${bad.length} cards. By arm: before ${bad.filter(x => x.startsWith('before')).length}, after ${bad.filter(x => x.startsWith('after')).length}. (A number in the caption or a decimal in the prose that is not a number of the diagram; computed values such as sums are expected here: the list is for reading, not a verdict.)`);
for (const b of bad.slice(0, 60)) P('- ' + b);

P('\n## The 29 R3-pre cells, once in AFTER: kind drawn against the R3-pre reference-steered kind (today) and the planner kind\n');
P('| cell | prompt | R3-pre REF kind (today) | AFTER kind | kindSource | planner kind | same as REF |\n|---|---|---|---|---|---|---|');
let same = 0, n = 0;
for (const c of cells) { const r = rows.find(x => x.arm === 'after' && x.set === 'r3pre' && x.tag === `C${c.cell}`); if (!r) continue; const refKind = (c.finalKinds ?? [])[0] ?? '-', k = r.diagrams?.[0]?.kind ?? '-'; n++; if (k === refKind) same++; P(`| ${c.cell} | ${c.prompt.slice(0, 50)} | ${refKind} | ${k} | ${r.kindSource ?? '-'} | ${r.plannerKind ?? '-'} | ${k === refKind ? 'yes' : 'no'} |`); }
P(`\nAFTER kind equals the reference-steered kind in ${same} of ${n} cells.`);

P('\n## Per arm: failures, repairs, providers, latency, cost\n');
P('| arm | runs | delivered | honest failures | first attempt valid | repairs (sum) | moved to next provider | p50 / p90 ms | settled US$ |\n|---|---|---|---|---|---|---|---|---|');
for (const arm of arms) { const R = rows.filter(r => r.arm === arm), known = R.filter(r => r.firstAttemptValid != null);
  P(`| ${arm} | ${R.length} | ${R.filter(r => r.delivered).length} | ${R.filter(r => !r.delivered).length} | ${pct(known.filter(r => r.firstAttemptValid).length, known.length)} | ${R.reduce((s, r) => s + (r.attempts ?? []).reduce((a, x) => a + (x.repairs ?? 0), 0), 0)} | ${R.filter(r => r.movedToNextProvider).length} | ${med(R.map(r => r.ms))} / ${p90(R.map(r => r.ms))} | ${(R.reduce((s, r) => s + (r.costMicros || 0), 0) / 1e6).toFixed(3)} |`); }
P(`\nSettled total of the bench (incl. the planner estimate US$0.0002 a run): US$${(rows.reduce((s, r) => s + (r.costMicros || 0) + 200, 0) / 1e6).toFixed(3)}.`);
console.log(out.join('\n'));
