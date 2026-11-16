const root = process.argv[2];
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const all = [...lib.diagramReferences, ...lib.illustrationReferences];
const out = [];
for (const id of ['ml-moe-top-two-experts', 'figure-grouped-query-heads', 'figure-retro-encoded-neighbor-rows', 'figure-partial-rotary-head-width', 'figure-gpt2-learned-position-decoder', 'ml-transformer-qkv-projections']) {
  const r = all.find(r => r.id === id); const s = r.spec ?? r.depths?.deep?.spec ?? r.depths?.overview?.spec; out.push(id + ' ' + Math.ceil(renderTutorDiagram(s, 408).width));
}
console.log(out.join('\n'));
