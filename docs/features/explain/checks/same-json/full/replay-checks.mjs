// Same-JSON full build, offline replay (no provider call): the prose-number check (correction 2) and the "?" check (correction 3) over the delivered cards of the earlier measurements (MVP1 BEFORE and AFTER,
// MVP2 AFTER2, MVP3 AFTER3, MVP4 AFTER4) for the five declared references, so a check that rejects right cards is seen. The checks run alone (the function step is switched off: the older cards carry no variables
// list): each reference is replayed as "needs none".
// usage: node replay-checks.mjs <branchRoot> <results files...>   -> replay-checks.json and a line per rejected card
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [root, ...files] = process.argv.slice(2);
const imp = p => import(pathToFileURL(`${root}/packages/${p}`).href);
const { applyCalculations } = await imp('control-plane/src/explanation-calculation.js');
const { diagramReferences } = await imp('web/src/tutor-diagrams/reference-library.js');
const REAL = process.env.REAL_REFS === '1';
const refs = Object.fromEntries(diagramReferences.filter(r => r.calculation).map(r => [r.id, REAL ? r : { ...r, calculation: { none: true } }]));
const out = []; const tally = {};
for (const file of files) for (const line of fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)) {
  const r = JSON.parse(line);
  if (!r.delivered || !r.body || !refs[r.refId]) continue;
  const arm = r.arm, step = applyCalculations({ body: r.body }, [refs[r.refId]]);
  const key = `${arm}|${r.refId}`; tally[key] ??= { cards: 0, rejected: 0 }; tally[key].cards++;
  if (step.problem) { tally[key].rejected++; out.push({ arm, ref: r.refId, seed: r.requestSeed, problem: step.problem.slice(0, 260) }); }
}
fs.writeFileSync('replay-checks.json', JSON.stringify({ tally, rejected: out }, null, 1));
for (const [k, v] of Object.entries(tally)) console.log(k, `${v.rejected} of ${v.cards} rejected`);
console.log('total', out.length, 'rejected of', Object.values(tally).reduce((s, v) => s + v.cards, 0));
