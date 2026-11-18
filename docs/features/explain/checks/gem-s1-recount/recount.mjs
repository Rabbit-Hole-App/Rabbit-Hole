// Offline recount of the attempt-0 "columns ... received object" error in the saved 155 fallbacks-batch bench (66 runs). No provider call.
// usage: node recount.mjs [results.jsonl]
import fs from 'node:fs';
const file = process.argv[2] ?? 'C:/s/sprint2-evidence/fallbacks-batch/results.jsonl';
const RE = /columns\.\d+: Invalid input: expected string, received object/; // the corrected regex (the bench's own lost its backslashes)
const rs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const attempt0 = r => (r.events || []).filter(e => e.event === 'learn_artifact_invalid' && e.attempt === 0);
const row = (label, set) => {
  const out = {};
  for (const arm of ['before', 'after']) {
    const s = set.filter(r => r.arm === arm);
    out[arm] = { runs: s.length, attempt0Invalid: s.filter(r => attempt0(r).length).length, columnsObject: s.filter(r => attempt0(r).some(e => RE.test(e.error))).length, savedFlag: s.filter(r => r.colsErrorAttempt0).length };
  }
  console.log(`${label.padEnd(24)} before ${out.before.columnsObject}/${out.before.runs}  after ${out.after.columnsObject}/${out.after.runs}   (attempt-0 invalid with error text: before ${out.before.attempt0Invalid}, after ${out.after.attempt0Invalid}; bench flag colsErrorAttempt0 as saved: before ${out.before.savedFlag}, after ${out.after.savedFlag})`);
};
row('all cells', rs);
row('GEM-S1 cells 1,2,3,6', rs.filter(r => [1, 2, 3, 6].includes(r.cell)));
for (const c of [...new Set(rs.map(r => r.cell))].sort((a, b) => a - b)) row(`cell ${c}`, rs.filter(r => r.cell === c));
const noText = rs.filter(r => r.anyErrorAttempt0 && !attempt0(r).length);
console.log('runs flagged anyErrorAttempt0 but with no attempt-0 invalid event text saved:', noText.length);
