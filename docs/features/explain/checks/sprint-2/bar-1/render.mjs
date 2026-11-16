import { writeFileSync, mkdirSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const [root, out, phase] = process.argv.slice(2);
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
const { createLayouts } = await import(`${root}/packages/web/src/tutor-diagrams/ml-plot-layouts.js`);
mkdirSync(out, { recursive: true });
const specs = {
  binomial: { version: 1, diagram: { kind: 'bar-chart', title: 'Binomial, n = 10, p = 0.5', unit: '%', bars: [0, 1, 2, 3, 4, 5].map((k, i) => ({ label: `k = ${k}`, value: [0.1, 1, 4.4, 11.7, 20.5, 24.6][i] })) } },
  grouped: { version: 1, diagram: { kind: 'bar-chart', title: 'Sales by quarter', unit: 'k', variant: 'grouped', categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ label: '2025', values: [12, 18, 15, 22] }, { label: '2026', values: [14, 21, 19, 27] }] } },
  softmax: { version: 1, diagram: { kind: 'bar-chart', title: 'Softmax parts', variant: 'stacked', bars: [{ label: 'cat', value: 0.66 }, { label: 'dog', value: 0.24 }, { label: 'fox', value: 0.1 }], total: 1 } },
};
const lines = [];
for (const [name, spec] of Object.entries(specs)) for (const w of [408, 720]) {
  try {
    const { element, width, height } = renderTutorDiagram(spec, w);
    writeFileSync(`${out}/${name}-${w}-${phase}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${renderToStaticMarkup(element)}`);
    lines.push(`${name}-${w} ${phase} ${Math.ceil(width)}x${Math.ceil(height)}`);
  } catch (e) { lines.push(`${name}-${w} ${phase} ERR ${String(e.message).slice(0, 80)}`); }
}
// 12 categories is past the schema's 8: drawn through the layout directly
const twelve = { kind: 'bar-chart', title: 'Twelve months', variant: 'grouped', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], series: [{ label: 'Visits', values: [3, 5, 4, 7, 6, 9, 8, 10, 7, 6, 4, 5] }] };
// (a 12-bar single-series plain chart is the case the owner means: plain bars)
const plain12 = { kind: 'bar-chart', title: 'Twelve months', bars: twelve.categories.map((label, i) => ({ label, value: twelve.series[0].values[i] })) };
const { quantitativeLayouts } = await import(`${root}/packages/web/src/tutor-diagrams/quantitative-layouts.js`);
const layouts = createLayouts({ legacy: quantitativeLayouts });
for (const w of [408, 720]) {
  const { width, height, elements } = layouts['bar-chart'](plain12, w, {});
  const svg = renderToStaticMarkup(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}`, fontFamily: 'Arial, sans-serif' }, h('rect', { width, height, fill: '#FFFCF0' }), ...elements));
  writeFileSync(`${out}/twelve-${w}-${phase}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0}</style>${svg}`);
  lines.push(`twelve-${w} ${phase} ${Math.ceil(width)}x${Math.ceil(height)}`);
}
console.log(lines.join('\n'));
