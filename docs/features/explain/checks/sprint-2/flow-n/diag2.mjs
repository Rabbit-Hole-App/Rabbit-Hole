const root = process.argv[2];
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const { layoutFlow } = await import(`${root}/packages/web/src/tutor-diagrams/flow.js`);
const { layoutTokenLinks } = await import(`${root}/packages/web/src/tutor-diagrams/token-links-layout.js`).catch(() => ({}));
const all = [...lib.diagramReferences, ...lib.illustrationReferences];
const moe = all.find(r => r.id === 'ml-moe-top-two-experts').spec.diagram;
const g = layoutFlow(moe, 408).geometry;
const rows = {}; for (const n of g.nodes) (rows[Math.round(n.y)] ??= []).push(Math.round(n.width));
console.log('moe rows (y: node widths)', JSON.stringify(rows), 'paths?', JSON.stringify(moe.highlightPath));
