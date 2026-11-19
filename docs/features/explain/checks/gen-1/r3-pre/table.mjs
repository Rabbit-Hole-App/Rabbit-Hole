// R3-pre table: per cell, planner kind, reference id and kind, planner probability for its kind, exact documented prompt (steer.exact), PLAN-arm result.
// usage: node table.mjs [results.jsonl]   (without results the PLAN columns say 'not run'). Offline: no provider call.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [RES = 'results.jsonl'] = process.argv.slice(2);
// steer.exact comes from the feat/gen-1-pure tree (47089fcd7): selectWithSteer(...).steer = { id, kind, referenceKind, score, exact }
const { selectWithSteer } = await import(pathToFileURL('C:/s/gen1-pure/packages/control-plane/src/explanation-references.js').href);
const cells = JSON.parse(fs.readFileSync('C:/s/gen1-r3pre/cells.json', 'utf8'));
const plan = new Map((fs.existsSync(RES) ? fs.readFileSync(RES, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []).map(r => [r.idx, r]));
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
const pct = x => (typeof x === 'number' ? x.toFixed(2) : 'n/a');
const rows = cells.map(c => {
  const steer = quiet(() => selectWithSteer({ prompt: c.prompt, depth: c.depth, plannedKinds: c.plannerKind ? [c.plannerKind] : [] })).steer;
  const p = plan.get(c.cell);
  const probs = p?.planProbabilities ?? null, own = probs && p.plannerKind ? probs[p.plannerKind] : null;
  const top = probs ? Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ') : null;
  const repairs = p ? (p.attempts ?? []).reduce((s, a) => s + (a.repairs || 0), 0) : null;
  return { cell: c.cell, depth: c.depth, prompt: c.prompt.slice(0, 48), plannerKindREF: c.plannerKind, referenceId: c.references?.[0] ?? steer?.id ?? null, referenceKind: steer?.referenceKind ?? null, steerId: steer?.id ?? null, exact: steer ? steer.exact : null, refDelivered: c.finalKinds.join('+') || '(failed)',
    plannerKindPLAN: p ? p.plannerKind : null, plannerProbability: own, top3: top, planKind: p?.planKind ?? null, planDelivered: p ? (p.delivered ? p.finalKinds.join('+') : '(failed)') : null, planHonestFailure: p ? !p.delivered : null, planRepairs: repairs, plannerTimedOut: p?.plannerTimedOut ?? null, planMs: p?.planMs ?? null };
});
fs.writeFileSync('C:/s/gen1-r3pre/table.json', JSON.stringify(rows, null, 1));
const md = ['| cell | depth | prompt (cut) | planner kind (REF run) | reference | reference kind | exact | REF delivered | planner p(own kind) PLAN run | top 3 | PLAN delivered | PLAN honest failure / repairs |', '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.cell} | ${r.depth} | ${r.prompt} | ${r.plannerKindREF} | ${r.referenceId} | ${r.referenceKind} | ${r.exact} | ${r.refDelivered} | ${pct(r.plannerProbability)} | ${r.top3 ?? 'not run'} | ${r.planDelivered ?? 'not run'} | ${r.planHonestFailure === null ? 'not run' : (r.planHonestFailure ? 'yes' : 'no') + ' / ' + r.planRepairs} |`)].join('\n');
fs.writeFileSync('C:/s/gen1-r3pre/table.md', md + '\n');
const exact = rows.filter(r => r.exact).length, withSteer = rows.filter(r => r.steerId).length;
console.log(`cells ${rows.length}; steer found for ${withSteer}; exact documented prompt in ${exact}; reference id equal to the REF record's: ${rows.filter(r => r.steerId && r.steerId === r.referenceId).length}; PLAN results: ${plan.size}`);
console.log(md.split('\n').slice(0, 8).join('\n'));
