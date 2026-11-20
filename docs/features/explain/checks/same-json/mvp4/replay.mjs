// MVP4 offline replay, no provider call: the ten AFTER3 cards of top-k and softmax-probabilities (MVP3 results.jsonl) through the new server step (applyCalculations of feat/same-json-mvp4),
// where their shape allows. The AFTER3 cards carry no `variables` list (the author was not asked for one), so a list is written for each from what the card draws, under the names of the reference's own
// calculation: the first row of top-k (series.0.values) is the input `full`, k is the number of items the card's second row keeps (not drawn: the card's second row is read, nothing else), and the
// two softmax rows (series.0.values, series.1.values) are read as the raw weights. The step then runs as it would on a card that carried that list.
// usage: node replay.mjs results3.jsonl [trees]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [RES, TREES = 'C:/s/same-json-trees'] = process.argv.slice(2);
const imp = f => import(pathToFileURL(`${TREES}/after4/packages/${f}`).href);
const { applyCalculations } = await imp('control-plane/src/explanation-calculation.js');
const { diagramReferences } = await imp('web/src/tutor-diagrams/reference-library.js');
const rows = fs.readFileSync(RES, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r => ['ml-sampling-top-k', 'softmax-probabilities'].includes(r.refId) && r.delivered);
const WRONG = new Set(['bench-2-2', 'bench-4-4', 'bench-16-1', 'bench-18-3', 'bench-20-5']); // the five the owner found wrong in AFTER3
const out = [];
for (const r of rows) {
  const ref = diagramReferences.find(x => x.id === r.refId), d = structuredClone(r.diagrams[0]);
  const rowsOf = d.series?.map(s => s.values) ?? [];
  let variables;
  if (r.refId === 'ml-sampling-top-k') {
    const kept = (rowsOf[1] ?? []).filter(v => v > 0).length;
    variables = ref.calculation.variables.map(v => ({ ...v, ...(v.name === 'k' ? { value: kept } : v.name === 'keptShare' ? { value: 0 } : {}) }));
  } else {
    variables = ref.calculation.variables.map(v => ({ ...v, ...(v.name === 'weightsA' ? { value: rowsOf[0] } : v.name === 'weightsB' ? { value: rowsOf[1] } : {}) }));
  }
  d.variables = variables;
  const before = { rows: structuredClone(rowsOf), title: d.title, caption: d.caption };
  const body = '```rh-diagram\n' + JSON.stringify({ version: 1, diagram: d }) + '\n```';
  const step = applyCalculations({ body }, [{ id: ref.id, calculation: ref.calculation, spec: ref.spec }]);
  let after = null;
  if (!step.problem) { const fence = step.block.body.split('\n')[1]; const nd = JSON.parse(fence).diagram; after = { rows: nd.series.map(s => s.values), title: nd.title, caption: nd.caption }; }
  out.push({ seed: r.requestSeed, ref: r.refId, ask: r.rep, wrongInAfter3: WRONG.has(r.requestSeed), problem: step.problem, overwritten: step.steps[0]?.overwritten ?? null, inputs: step.steps[0]?.inputs ?? null, before, after });
}
fs.writeFileSync('replay.json', JSON.stringify(out, null, 1));
for (const o of out) console.log(`${o.wrongInAfter3 ? 'WRONG ' : '      '}${o.seed} ${o.ref}: ${o.problem ?? `overwrote ${JSON.stringify(o.overwritten)}`} | rows ${JSON.stringify(o.before.rows)} -> ${JSON.stringify(o.after?.rows ?? null)} | title ${JSON.stringify(o.before.title)} -> ${JSON.stringify(o.after?.title ?? null)}`);
