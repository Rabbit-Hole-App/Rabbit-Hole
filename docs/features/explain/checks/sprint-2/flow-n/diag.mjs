const root = process.argv[2];
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const all = [...lib.diagramReferences, ...lib.illustrationReferences];
const g = id => { const r = all.find(r => r.id === id); return r.spec ?? r.depths?.deep?.spec; };
const moe = g('ml-moe-top-two-experts').diagram;
const level = {}; for (const e of moe.edges) {} 
console.log('moe nodes', moe.nodes.length, moe.nodes.map(n => n.role + ':' + n.label).join(' | '));
console.log('moe edges', moe.edges.map(e => e.from + '>' + e.to).join(' '));
const lf = g('ml-what-is-machine-learning-learning-families').diagram; console.log('families', lf.kind, lf.layout, lf.nodes.length, JSON.stringify(lf.nodes.map(n => [n.id, n.parent, n.label])).slice(0, 700));
const b = g('bayes-class-token-counts').diagram; console.log('bayes', b.kind, b.layout, 'columns', JSON.stringify(b.columns), 'rows', JSON.stringify(b.rows).slice(0, 500));
for (const id of ['figure-gallery-depth-attention', 'figure-retro-chunk-attention']) { const t = g(id).diagram; console.log(id, t.kind, 'source', JSON.stringify(t.source).slice(0, 300), 'target', JSON.stringify(t.target).slice(0, 300), 'queries', t.queries?.length); }
