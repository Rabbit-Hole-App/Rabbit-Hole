const root = process.argv[2];
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const all = [...lib.diagramReferences, ...lib.illustrationReferences];
for (const id of ['ml-gpu-matmul', 'figure-grouped-query-heads', 'figure-gallery-depth-attention', 'bayes-class-token-counts', 'ml-moe-top-two-experts', 'figure-retro-chunk-attention', 'ml-what-is-machine-learning-learning-families']) {
  const r = all.find(r => r.id === id); const s = r.spec ?? r.depths?.deep?.spec; const d = s.diagram;
  console.log(id, d.kind, Object.keys(d).join(','), d.rows ? 'rows' + d.rows.length : '', JSON.stringify(d).length);
}
