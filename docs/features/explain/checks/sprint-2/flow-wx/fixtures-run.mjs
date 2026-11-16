import { createHash } from 'node:crypto';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = process.argv[2];
const { fixtures } = await import(`${root}/packages/web/src/tutor-diagrams/zz-fixtures.mjs`);
const { layoutFlow } = await import(`${root}/packages/web/src/tutor-diagrams/flow.js`);
const { convergingFlow } = await import(`${root}/packages/web/scripts/batch-1-followup-fixtures.mjs`);
const all = { ...fixtures, convergingFlow: convergingFlow.diagram };
for (const [name, d] of Object.entries(all)) {
  const diagram = d.diagram ?? d;
  const r = layoutFlow(diagram, 408);
  const svg = renderToStaticMarkup(h('svg', null, ...r.elements));
  console.log(name.padEnd(16), Math.ceil(r.width) + 'x' + Math.ceil(r.height), createHash('sha1').update(svg).digest('hex').slice(0, 10));
}
