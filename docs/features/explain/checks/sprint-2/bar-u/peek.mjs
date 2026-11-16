const root = process.argv[2];
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const r = lib.diagramReferences.find(r => r.id === 'ml-logistic-regression-softmax');
const d = r.spec.diagram; console.log(d.kind, d.variant ?? '', Object.keys(d).join(','));
const p = d.panels?.[0]; console.log(JSON.stringify(p).slice(0, 400));
const r2 = lib.diagramReferences.find(r => r.id === 'ml-label-prior-drift-comparison'); console.log(r2?.spec.diagram.kind);
