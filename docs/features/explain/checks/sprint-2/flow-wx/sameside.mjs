import { writeFileSync, mkdirSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const [root, out, phase] = process.argv.slice(2);
const { layoutFlow } = await import(`${root}/packages/web/src/tutor-diagrams/flow.js`);
const sameSide = { kind: 'flow', title: 'Same side', nodes: [
 { id: 'root', label: 'Start the check', role: 'process' }, { id: 'p', label: 'Check the cache', role: 'outcome' }, { id: 'q', label: 'Check the queue', role: 'outcome' },
 { id: 'd', label: 'Is the record valid?', role: 'decision' }, { id: 't1', label: 'Save the record', role: 'outcome' }, { id: 't2', label: 'Reject the record', role: 'outcome' }],
 edges: [{ from: 'root', to: 'p' }, { from: 'root', to: 'q' }, { from: 'root', to: 'd' }, { from: 'd', to: 't1', label: 'Yes' }, { from: 'd', to: 't2', label: 'No' }] };
mkdirSync(out, { recursive: true });
for (const w of [408, 720]) {
  const { width, height, elements } = layoutFlow(sameSide, w);
  const svg = renderToStaticMarkup(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}`, fontFamily: 'Arial, sans-serif' }, h('rect', { width, height, fill: '#FFFCF0' }), ...elements));
  writeFileSync(`${out}/sameside-${w}-${phase}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0}</style>${svg}`);
  console.log(`sameside-${w} ${phase} ${Math.ceil(width)}x${Math.ceil(height)}`);
}
