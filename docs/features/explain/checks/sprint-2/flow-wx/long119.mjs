import { writeFileSync, mkdirSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const [root, out, phase] = process.argv.slice(2);
const { layoutFlow } = await import(`${root}/packages/web/src/tutor-diagrams/flow.js`);
const diagram = { nodes: ['r', 'a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, label: `Node ${id}`, role: ['r', 'a'].includes(id) ? 'decision' : id === 'f' ? 'outcome' : 'process' })),
  edges: [{ from: 'r', to: 'a', label: 'First branch' }, { from: 'r', to: 'b', label: 'Second branch' }, { from: 'a', to: 'd', label: 'On the first branch' }, { from: 'a', to: 'e', label: 'On the second branch' }, { from: 'b', to: 'c' }, { from: 'c', to: 'f' }, { from: 'd', to: 'f' }, { from: 'e', to: 'f' }] };
mkdirSync(out, { recursive: true });
for (const w of [408, 320]) {
  const { width, height, elements } = layoutFlow(diagram, w);
  const svg = renderToStaticMarkup(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}`, fontFamily: 'Arial, sans-serif' }, h('rect', { width, height, fill: '#FFFCF0' }), ...elements));
  writeFileSync(`${out}/long-labels-${w}-${phase}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0}</style>${svg}`);
  console.log(`long-labels-${w} ${phase} ${Math.ceil(width)}x${Math.ceil(height)}`);
}
