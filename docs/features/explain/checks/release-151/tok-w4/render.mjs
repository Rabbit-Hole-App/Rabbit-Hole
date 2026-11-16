// Usage: node render.mjs <phase> <out-dir> [name...]  -> <name>-<phase>-<width>.svg/.html at 320, 408, 482, 720, 960
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from '../packages/web/src/tutor-diagrams/reference-library.js';
import { renderTutorDiagram } from '../packages/web/src/tutor-diagrams/TutorDiagram.js';
const [phase, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const qkv = diagramReferences.find(r => r.id === 'ml-transformer-qkv-projections');
const tensor = { rows: 2, columns: 2, dimensions: '2 × 2', name: 'Weights', values: [0, -12.5, 9.25e-8, 1000000000], role: 'weight' };
const strip = (name, role, columns = 3, dimensions = `1 × ${columns}`) => ({ tensor: { rows: 1, columns, dimensions, name, role, values: Array.from({ length: columns }, (_, i) => i + 1) } });
const mixed = { version: 1, diagram: { kind: 'transformation', title: 'Mixed items with one labelled link',
  before: { label: 'Before', items: ['Plain input', { label: 'Selected tensor', tensor }] },
  after: { label: 'After', items: [{ tensor }, 'Mapped output'] },
  operation: 'Map the items', links: [{ from: 1, to: 1, label: 'Use this pair' }] } };
const labelled = { version: 1, diagram: { kind: 'transformation', title: 'Two inputs, three outputs, labelled and plain links',
  before: { label: 'Inputs', items: [strip('Query', 'input', 4), strip('Key', 'input', 4)] },
  after: { label: 'Outputs', items: [strip('Scores', 'output', 4), strip('Weights', 'output', 4), strip('Context', 'output', 4)] },
  operation: 'Compare the inputs',
  links: [{ from: 0, to: 0, label: 'Dot product' }, { from: 1, to: 0, label: 'Same position' }, { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 1, to: 2, label: 'Weighted sum of the values' }] } };
const jobs = {
  'qkv': qkv.spec,
  'qkv-deep': qkv.depths.deep.spec,
  'mixed': mixed,
  'labelled': labelled,
};
const lines = [];
for (const [name, spec] of Object.entries(jobs)) {
  if (only.length && !only.includes(name)) continue;
  for (const width of [320, 408, 482, 720, 960]) {
    const { element, width: w, height: h } = renderTutorDiagram(spec, width);
    const svg = renderToStaticMarkup(element);
    const base = `${out}/${name}-${phase}-${width}`;
    writeFileSync(`${base}.svg`, svg);
    writeFileSync(`${base}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${svg}`);
    lines.push(`${name} ${phase} ${width}: ${Math.ceil(w)} x ${Math.ceil(h)}`);
  }
}
console.log(lines.join('\n'));
