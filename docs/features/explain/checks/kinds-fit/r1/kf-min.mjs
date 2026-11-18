import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
const T = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(T + 'TutorDiagram.js').href);
const g = JSON.parse(fs.readFileSync(T + 'kind-gallery.json', 'utf8'));
const all = s => ({ title: s, heading: s, body: s, small: s });
for (const kind of ['coordinate-plot', 'token-links']) {
  const spec = g.find(x => x.diagram.kind === kind);
  console.log(kind, 'series/tokens:', spec.diagram.series?.length ?? spec.diagram.source?.length);
  for (const [w, h] of [[632, 312], [312, 312], [632, 152], [312, 392], [312, 232]]) {
    const r = renderTutorDiagram(spec, w, { box: { width: w, height: h }, sizes: all(14), parts: { title: false } });
    console.log(' box', w + 'x' + h, '-> drawn', r.width + 'x' + r.height, 'min', JSON.stringify(r.min));
  }
  const r = renderTutorDiagram(spec, 408, { sizes: all(14), parts: { title: false } });
  console.log(' no box, 14 px, no title: drawn', r.width + 'x' + r.height, 'min', JSON.stringify(r.min), 'geometry keys', Object.keys(r.geometry), r.geometry.plotArea ? JSON.stringify(r.geometry.plotArea) : 'panels ' + r.geometry.panels.length);
}
