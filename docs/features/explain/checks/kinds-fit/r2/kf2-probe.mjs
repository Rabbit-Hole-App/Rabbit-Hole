// kinds-fit batch 2 probe: node kf2-probe.mjs <kind> [boxW boxH size] -> min, min.parts, geometry summary
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const SRC = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(SRC + 'TutorDiagram.js').href);
const gallery = JSON.parse(fs.readFileSync(SRC + 'kind-gallery.json', 'utf8'));
const [kind, bw, bh, sz = '14'] = process.argv.slice(2);
const spec = gallery.find(s => s.diagram.kind === kind);
const size = Number(sz), all = { title: size, heading: size, body: size, small: size };
const r = bw ? renderTutorDiagram(spec, Number(bw), { box: { width: Number(bw), height: Number(bh) }, sizes: all, parts: { title: false } }) : renderTutorDiagram(spec, 408);
console.log(kind, 'drawn', r.width, 'x', r.height, 'min', JSON.stringify(r.min.width ? { width: r.min.width, height: r.min.height } : r.min));
for (const p of r.min.parts ?? []) console.log('  ', p.axis, p.part, Number(p.px.toFixed(2)));
const g = r.geometry;
console.log('geometry', g === null ? 'null' : Object.keys(g).join(','));
