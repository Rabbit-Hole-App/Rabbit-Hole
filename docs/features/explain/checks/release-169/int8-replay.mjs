// usage: node int8-replay.mjs <treeRoot> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [root, out] = process.argv.slice(2);
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { selectWithSteer } = await cp('src/explanation-references.js');
const { planWithReferenceKind } = await cp('src/learn-artifact.js');
const results = JSON.parse(readFileSync('C:/s/spec/benchmarks/explain-bench/2026-11-09T134635-118-3x-gate-c0e8f365a-fresh-ledger/results.json', 'utf8'));
const log = console.log; console.log = () => {}; // planWithReferenceKind logs an event per override
const rows = results.cards.map(c => {
  const depth = c.depth || 'standard', p = c.plan;
  let kind = p?.kind ?? null, steered = null;
  if (p?.planner === 'jev') {
    const visuals = Array.from({ length: p.diagrams ?? 0 }, () => ({ type: 'diagram', kind: p.kind }));
    const o = planWithReferenceKind({ args: c.prompt, depth, plan: { ...p, visuals } });
    if (o.plan.kindSource) { kind = o.plan.kind; steered = o.plan.kind; }
  }
  const sel = selectWithSteer({ prompt: c.prompt, depth, plannedKinds: p?.planner === 'jev' && p.diagrams ? [kind] : [], shapeFallback: false });
  return { key: `${c.set}|${c.id}|${depth}|${c.prompt}|${p?.kind}|${p?.diagrams}`, set: c.set, id: c.id, depth, plannerKind: p?.kind ?? null, kind, overridden: steered !== null,
    steer: sel.steer ? sel.steer.id : null, first: sel.references[0]?.id ?? null, refs: sel.references.map(r => r.id).join(',') };
});
console.log = log;
writeFileSync(out, JSON.stringify(rows));
console.log(out, rows.length, 'rows;', 'steer events', rows.filter(r => r.steer).length, 'overrides', rows.filter(r => r.overridden).length, 'with a first pick', rows.filter(r => r.first).length);
