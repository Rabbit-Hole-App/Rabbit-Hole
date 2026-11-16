const root = process.argv[2];
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const { textWidth, longestWordWidth } = await import(`${root}/packages/web/src/tutor-diagrams/primitives.js`);
const all = [...lib.diagramReferences, ...lib.illustrationReferences, ...lib.transformerWalkthroughReferences];
for (const [id, path] of [['ml-transformer-residual-arithmetic', 'spec'], ['ml-transformer-weighted-values', 'spec'], ['ml-transformer-parallel-attention-heads', 'detailSpec'], ['ml-transformer-vocabulary-softmax', 'detailSpec']]) {
  const r = all.find(r => r.id === id); const d = r[path].diagram; console.log('==', id, JSON.stringify({ op: d.operation, links: d.links, before: d.before?.label, after: d.after?.label }));
  (function walk(o, p) { if (o && typeof o === 'object') { if (o.tensor) console.log(p, o.label ?? '', o.tensor.name ?? '', o.tensor.dimensions, JSON.stringify(o.tensor.values), 'max text', Math.ceil(Math.max(...o.tensor.values.map(v => textWidth(String(v), 15)))), 'nameW', o.tensor.name ? Math.ceil(longestWordWidth(o.tensor.name, 15)) : 0, 'dimW', Math.ceil(textWidth(o.tensor.dimensions, 13))); for (const [k, v] of Object.entries(o)) walk(v, p + '.' + k); } })(d, '');
  if (d.blocks) console.log(JSON.stringify(d.blocks.map(b => [b.label, b.dims, b.detail, b.variant])).slice(0, 400));
}
