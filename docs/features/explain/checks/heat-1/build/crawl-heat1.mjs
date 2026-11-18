// HEAT-1: every heatmap in the reference library, the single-diagram library, kind-gallery.json and kind-gallery-depths.json is parsed by the repo's own parseTutorDiagram on C:/s/heat-1.
// Prints how many heatmap specs were scanned and which fail with an arithmetic-tagged issue (expected: none), plus the delivered cards.
import fs from 'node:fs';
const T = 'file:///C:/s/heat-1/packages/web/src/tutor-diagrams/';
const dir = 'C:/s/heat-1/packages/web/src/tutor-diagrams/';
const { diagramReferences } = await import(T + 'reference-library.js');
const { singleDiagramReferences } = await import(T + 'reference-single-variants.js');
const { parseTutorDiagram } = await import(T + 'spec.js');
const found = [];
function walk(node, id, path) {
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'heatmap' && Array.isArray(node.rows)) found.push({ id, path, d: node });
  for (const [k, v] of Object.entries(node)) walk(v, id, path + '/' + k);
}
for (const r of diagramReferences) walk(r, r.id, '');
for (const r of singleDiagramReferences) walk(r, r.id, '');
JSON.parse(fs.readFileSync(dir + 'kind-gallery.json', 'utf8')).forEach((g, i) => walk(g, 'kind-gallery#' + i, ''));
const depths = JSON.parse(fs.readFileSync(dir + 'kind-gallery-depths.json', 'utf8'));
(Array.isArray(depths) ? depths : Object.values(depths)).forEach((g, i) => walk(g, 'kind-gallery-depths#' + i, ''));
const tryParse = d => {
  try { parseTutorDiagram({ version: 1, diagram: d }); return { ok: true }; } catch (e) {
    const issues = e.issues ?? e.cause?.issues ?? [];
    return { ok: false, arithmetic: issues.some(i => i.params?.code === 'arithmetic'), message: String(e.message).slice(0, 160) };
  }
};
const results = found.map(f => ({ id: f.id, path: f.path, ...tryParse(f.d) }));
const bad = results.filter(r => !r.ok);
console.log('heatmap specs scanned:', results.length, 'distinct ids:', new Set(results.map(r => r.id)).size);
console.log('fail to parse (any reason):', bad.length);
for (const b of bad) console.log(' ', b.id, b.path, b.arithmetic ? '[arithmetic]' : '', b.message);
fs.writeFileSync('C:/s/sprint2-evidence/heat-1/crawl-result.json', JSON.stringify(results, null, 1));
for (const f of ['causal-mask-card.json', 'causal-mask-card-diag-allowed-all-zero.json']) {
  const card = JSON.parse(fs.readFileSync('C:/s/heat1-prep/' + f, 'utf8'));
  console.log(f, JSON.stringify(tryParse(card.diagram)));
}
const lib = diagramReferences.filter(r => r.id === 'ml-transformer-causal-mask');
console.log('ml-transformer-causal-mask specs in the crawl:', results.filter(r => r.id === 'ml-transformer-causal-mask').length, 'all ok:', results.filter(r => r.id === 'ml-transformer-causal-mask').every(r => r.ok), 'reference present:', lib.length);
