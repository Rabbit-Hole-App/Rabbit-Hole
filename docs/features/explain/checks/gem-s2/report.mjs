// GEM-S2 report: node report.mjs [--in results.jsonl] [--trees C:/s/gem-s2-trees]  -> REPORT.md and counts.json next to the input.
// Tolerates records without rawGoogle (the fallbacks bench), so it can be tried on ../fallbacks-batch/results.jsonl (arms before, after).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values: a } = parseArgs({ options: { in: { type: 'string', default: 'results.jsonl' }, trees: { type: 'string', default: 'C:/s/gem-s2-trees' } } });
const rows = fs.readFileSync(a.in, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const ARMS = ['before', 'batch', 'after'].filter(x => rows.some(r => r.arm === x));
const COLS_OBJECT = /columns\.\d+: Invalid input: expected string, received object/;
const out = [], counts = {}, pct = (n, d) => `${n}/${d}`;
const by = (arm, f = () => true) => rows.filter(r => r.arm === arm && f(r));
const tally = list => { const t = {}; for (const k of list) t[k] = (t[k] || 0) + 1; return Object.entries(t).sort((x, y) => y[1] - x[1]); };

// Offline replay: the raw attempt-0 answer -> its rh-diagram fences -> each arm tree's Q0 (correctDiagrams) -> does the diagram then validate?
const strings = (v, acc = []) => { if (typeof v === 'string') acc.push(v); else if (Array.isArray(v)) v.forEach(x => strings(x, acc)); else if (v && typeof v === 'object') Object.values(v).forEach(x => strings(x, acc)); return acc; };
const fencesOf = raw => { let texts = [raw]; try { texts = strings(JSON.parse(raw)); } catch { /* plain text */ } return texts.flatMap(t => [...t.matchAll(/```rh-diagram\n([\s\S]*?)```/g)].map(m => m[1])); };
const shapeOf = spec => { const d = spec?.diagram ?? {}; const cols = Array.isArray(d.columns) ? d.columns : []; return `${d.kind}: columns ${cols.length ? (cols.every(c => typeof c === 'string') ? 'strings' : cols.every(c => c && typeof c === 'object') ? `objects{${[...new Set(cols.flatMap(c => Object.keys(c)))].sort().join(',')}}` : 'mixed') : 'none'}; rows ${Array.isArray(d.rows) ? `${d.rows.length} (${d.rows.every(r => r && typeof r === 'object') ? 'objects' : 'not all objects'})` : 'absent'}${d.range ? '; range' : ''}`; };
const replay = {};
for (const arm of ARMS) {
  const dir = `${a.trees}/${arm}/packages`;
  if (!fs.existsSync(dir)) continue;
  const prim = await import(pathToFileURL(`${dir}/control-plane/src/learn-primitives.js`).href), spec = await import(pathToFileURL(`${dir}/web/src/tutor-diagrams/spec.js`).href);
  const valid = s => { try { spec.parseTutorDiagram(s); return true; } catch { return false; } };
  const log = console.log; let events = [];
  const fenceTally = { fences: 0, validAsWritten: 0, validAfterQ0: 0, shapes: [] };
  for (const r of by(arm)) {
    const raw = r.rawGoogle?.[0]; if (!raw) continue;
    for (const f of fencesOf(raw)) {
      let parsed; try { parsed = JSON.parse(f); } catch { continue; }
      fenceTally.fences++; const ok0 = valid(parsed); if (ok0) fenceTally.validAsWritten++;
      console.log = l => { try { events.push(JSON.parse(l)); } catch { /* not json */ } };
      const fixed = prim.correctDiagrams('```rh-diagram\n' + f.trim() + '\n```'); console.log = log;
      const m = fixed.md.match(/```rh-diagram\n([\s\S]*?)\n```/); let after = null; try { after = JSON.parse(m[1]); } catch { /* */ }
      if (after && valid(after)) fenceTally.validAfterQ0++;
      else fenceTally.shapes.push(`${shapeOf(parsed)}`);
    }
  }
  replay[arm] = { ...fenceTally, stillInvalidShapes: tally(fenceTally.shapes) };
}

out.push('# GEM-S2 rerun report', '', `Source: ${path.resolve(a.in)}, ${rows.length} runs, arms ${ARMS.join(', ')}.`, '');
out.push('## 1. First-attempt validity and Q0 events', '', '| arm | runs | first attempt valid | attempt-0 "columns ... received object" | any attempt-0 error | runs with a Q0 event | delivered | moved to next provider | planned kind missing | cost US$ |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const arm of ARMS) {
  const y = by(arm), fv = y.filter(r => r.firstAttemptValid != null);
  const colsObj = y.filter(r => r.events.some(e => e.event === 'learn_artifact_invalid' && e.attempt === 0 && COLS_OBJECT.test(e.error))).length; // recomputed from the events: the old run.mjs flag was broken
  counts[arm] = { runs: y.length, firstAttemptValid: fv.filter(r => r.firstAttemptValid).length, firstAttemptKnown: fv.length, colsObjectAttempt0: colsObj, anyErrorAttempt0: y.filter(r => r.anyErrorAttempt0).length, delivered: y.filter(r => r.delivered).length, moved: y.filter(r => r.movedToNextProvider).length };
  out.push(`| ${arm} | ${y.length} | ${pct(counts[arm].firstAttemptValid, fv.length)} | ${colsObj} | ${counts[arm].anyErrorAttempt0} | ${y.filter(r => (r.coercedByQ0 ?? []).length).length} | ${counts[arm].delivered} | ${counts[arm].moved} | ${y.filter(r => r.plannedKindMissing).length} | ${(y.reduce((s, r) => s + (r.costMicros || 0), 0) / 1e6).toFixed(4)} |`);
}
out.push('', '## 2. Q0 events by arm (action and reason)', '', '| arm | action: reason | events |', '| --- | --- | --- |');
for (const arm of ARMS) for (const [k, n] of tally(by(arm).flatMap(r => (r.coercedByQ0 ?? []).map(c => `${c[0]}: ${c[1]}`)))) { out.push(`| ${arm} | ${k} | ${n} |`); (counts[arm].q0 ??= {})[k] = n; }
out.push('', '## 3. Final kinds and who wrote the delivered card', '', '| arm | final kinds | authored by |', '| --- | --- | --- |');
for (const arm of ARMS) out.push(`| ${arm} | ${tally(by(arm).map(r => (r.finalKinds ?? []).join('+') || 'none')).map(([k, n]) => `${k} x${n}`).join(', ')} | ${tally(by(arm).map(r => r.authoredBy?.model?.split('/').pop() ?? 'none')).map(([k, n]) => `${k} x${n}`).join(', ')} |`);
out.push('', '## 4. Offline replay of the raw attempt-0 answers through each arm\'s Q0', '');
if (!Object.keys(replay).length) out.push('No rawGoogle in this input (the fallbacks bench did not record it): nothing to replay.');
else {
  out.push('| arm | rh-diagram fences in attempt-0 answers | valid as written | valid after Q0 | still invalid |', '| --- | --- | --- | --- | --- |');
  for (const [arm, r] of Object.entries(replay)) out.push(`| ${arm} | ${r.fences} | ${r.validAsWritten} | ${r.validAfterQ0} | ${r.fences - r.validAfterQ0} |`);
  out.push('', 'Shapes that stay invalid after Q0 (this is where the missing row labels, if any, show):', '', '| arm | shape | count |', '| --- | --- | --- |');
  for (const [arm, r] of Object.entries(replay)) for (const [k, n] of r.stillInvalidShapes) out.push(`| ${arm} | ${k} | ${n} |`);
  counts.replay = Object.fromEntries(Object.entries(replay).map(([k, r]) => [k, { fences: r.fences, validAsWritten: r.validAsWritten, validAfterQ0: r.validAfterQ0 }]));
}
const dir = path.dirname(path.resolve(a.in));
fs.writeFileSync(path.join(dir, 'REPORT.md'), out.join('\n') + '\n');
fs.writeFileSync(path.join(dir, 'counts.json'), JSON.stringify(counts, null, 1));
console.log(out.join('\n'));
