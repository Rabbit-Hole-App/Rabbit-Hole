import fs from 'node:fs';
const B = 'C:/s/spec/benchmarks/explain-bench/';
const SMOKE = B + '2026-11-14T125715-145-smoke-rerun-71415b6b8/raw/smoke-r1/cards/';
const D116 = B + '2026-11-08T205831-baseline-3x-on-shipped-116-9d645b8f6/raw/';
const DEEP = D116 + 'correct-svg-r1-deep/cards/', OVER = D116 + 'correct-svg-r1-overview/cards/';
const picks = [
  [OVER, 'precision-recall'], [OVER, 'tcp-handshake'], [OVER, 'roman-empire'], [OVER, 'gradient-descent'],
  [SMOKE, 'ml-trees-bootstrap-coverage'], [SMOKE, 'ref-box-plot-iqr-fences'], [SMOKE, 'four-stroke'], [SMOKE, 'public-key-encryption'],
  [DEEP, 'softmax'], [DEEP, 'bst'], [DEEP, 'water-cycle'], [DEEP, 'gradient-descent'],
];
const labelKeys = new Set(['title', 'label', 'text', 'name', 'caption']);
function labels(o, out) {
  if (Array.isArray(o)) o.forEach(x => labels(x, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (labelKeys.has(k) && typeof v === 'string') out.add(v); else labels(v, out); }
}
const cards = picks.map(([dir, id], i) => {
  const j = JSON.parse(fs.readFileSync(dir + id + '.json', 'utf8'));
  const b = j.response.block, out = new Set();
  const fences = [...b.body.matchAll(/```(rh-[a-z-]+)\n([\s\S]*?)```/g)];
  for (const [, , src] of fences) { try { labels(JSON.parse(src), out); } catch { out.add('(unparsed visual)'); } }
  const body = b.body.replace(/```rh-[a-z-]+\n[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { n: i + 1, id, source: dir.replace(B, ''), question: j.row.prompt, title: b.title, depth: b.depth, depthLabel: { overview: 'Brief', balanced: 'Balanced', standard: 'Balanced', deep: 'Detailed' }[b.depth], body, visualLabels: [...out], visualCount: fences.length, visualKinds: fences.map(f => f[1]) };
});
fs.writeFileSync('C:/s/sprint2-evidence/aud-2/cards.json', JSON.stringify(cards, null, 1));
for (const c of cards) console.log(c.n, c.id, c.depth, c.visualKinds.join(','), c.body.split(/\s+/).length + 'w', '|', c.visualLabels.slice(0, 4).join(' / '));
