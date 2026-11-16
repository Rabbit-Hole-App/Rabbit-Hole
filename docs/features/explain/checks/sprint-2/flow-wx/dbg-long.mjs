const root = process.argv[2];
const { layoutFlow } = await import(`${root}/packages/web/src/tutor-diagrams/flow.js`);
const diagram = { nodes: ['r', 'a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, label: `Node ${id}`, role: ['r', 'a'].includes(id) ? 'decision' : id === 'f' ? 'outcome' : 'process' })),
  edges: [{ from: 'r', to: 'a', label: 'First branch' }, { from: 'r', to: 'b', label: 'Second branch' }, { from: 'a', to: 'd', label: 'On the first branch' }, { from: 'a', to: 'e', label: 'On the second branch' }, { from: 'b', to: 'c' }, { from: 'c', to: 'f' }, { from: 'd', to: 'f' }, { from: 'e', to: 'f' }] };
const r = layoutFlow(diagram, 320);
console.log(r.width, r.height);
for (const e of r.geometry.edges) console.log(e.from + '>' + e.to, JSON.stringify(e.points.map(p => p.map(v => +v.toFixed(1)))), e.label ? JSON.stringify(e.label) : '');
