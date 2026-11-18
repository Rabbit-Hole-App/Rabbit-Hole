import fs from 'node:fs';
import { splitCard, cardNumbers, sentencesOf, spokenNumbers, dataNumbers } from '../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
const B = 'C:/s/spec/benchmarks/explain-bench/';
const SMOKE = B + '2026-11-14T125715-145-smoke-rerun-71415b6b8/raw/smoke-r1/cards/', D116 = B + '2026-11-08T205831-baseline-3x-on-shipped-116-9d645b8f6/raw/';
const dirs = { 'precision-recall': D116 + 'correct-svg-r1-overview/cards/', 'ml-trees-bootstrap-coverage': SMOKE, 'four-stroke': SMOKE, softmax: D116 + 'correct-svg-r1-deep/cards/', 'water-cycle': D116 + 'correct-svg-r1-deep/cards/', bst: D116 + 'correct-svg-r1-deep/cards/' };
for (const file of ['variants-v6.json', 'variants-v5.json']) for (const r of JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/aud-2/' + file, 'utf8'))) {
  const d = dirs[r.id]; if (!d || !r.script) continue;
  const j = JSON.parse(fs.readFileSync(d + r.id + '.json', 'utf8')), parts = splitCard(j.response.block.body), allowed = cardNumbers(parts.prose, parts.visualText, j.response.block.title, j.row.prompt);
  for (const s of sentencesOf(r.script)) { const all = spokenNumbers(s), data = dataNumbers(s); if (all.some(n => !allowed.has(n))) console.log(`${r.provider} ${r.id} all=${JSON.stringify(all)} data=${JSON.stringify(data)} dataOutside=${data.some(n=>!allowed.has(n))} | ${s.slice(0,130)}`); }
}
