import fs from 'node:fs';
const B = 'C:/s/spec/benchmarks/explain-bench/';
const SMOKE = B + '2026-11-14T125715-145-smoke-rerun-71415b6b8/raw/smoke-r1/cards/';
const D116 = B + '2026-11-08T205831-baseline-3x-on-shipped-116-9d645b8f6/raw/';
const DEEP = D116 + 'correct-svg-r1-deep/cards/', OVER = D116 + 'correct-svg-r1-overview/cards/';
const picks = [[OVER, 'precision-recall'], [OVER, 'tcp-handshake'], [OVER, 'roman-empire'], [OVER, 'gradient-descent'], [SMOKE, 'ml-trees-bootstrap-coverage'], [SMOKE, 'ref-box-plot-iqr-fences'], [SMOKE, 'four-stroke'], [SMOKE, 'public-key-encryption'], [DEEP, 'softmax'], [DEEP, 'bst'], [DEEP, 'water-cycle'], [DEEP, 'gradient-descent']];
const out = [];
picks.forEach(([dir, id], i) => {
  const j = JSON.parse(fs.readFileSync(dir + id + '.json', 'utf8')), b = j.response.block;
  out.push({ n: i + 1, id, run: dir.replace(B, '').split('/')[0], depth: b.depth, planner: j.row.canvas?.plan?.planner ?? null, plannerKind: j.row.canvas?.plan?.kind ?? null, profile: j.row.profile?.id, authoredBy: b.authoredBy, repaired: j.response.repaired, title: b.title, body: b.body });
});
fs.writeFileSync('cards12-full.json', JSON.stringify(out, null, 1));
for (const c of out) { console.log('\n################', c.n, c.id, c.depth, JSON.stringify(c.authoredBy), c.profile, 'planner', c.planner, c.plannerKind, 'repaired', c.repaired); console.log(c.body.replace(/\n/g, '\n')); }
