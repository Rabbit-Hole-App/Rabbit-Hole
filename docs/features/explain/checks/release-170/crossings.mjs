// usage: node crossings.mjs <treeRoot> -> JSON { count, renders, hits: [{ id, width, tipEdge, edge, tip, x, y1, y2 }] } over all 57 relationship specs at 408 and 720 px.
// The spec list is the one relationship-graph.test.mjs builds (relationshipSpecs). The helper test-relationship-geometry.mjs of the tree is the branch's (it adds `points` and tipHits).
import { pathToFileURL } from 'node:url';
const dir = process.argv[2] + '/packages/web/src/tutor-diagrams/', load = rel => import(pathToFileURL(dir + rel).href);
const { renderTutorDiagram } = await load('TutorDiagram.js');
const { diagramReferences } = await load('reference-library.js');
const { illustrationSpecs } = await import(pathToFileURL(process.argv[2] + '/packages/web/scripts/illustration-previews.mjs').href);
const { relationshipGeometry, tipHits } = await load('test-relationship-geometry.mjs');
const kindGallery = (await import(pathToFileURL(dir + 'kind-gallery.json').href, { with: { type: 'json' } })).default;
const specs = new Map(), illustrated = new Map([...illustrationSpecs()].map(({ id, spec }) => [id, spec]));
for (const { id, spec } of [...diagramReferences, ...kindGallery.map(spec => ({ id: `shape-${spec.diagram.kind}`, spec }))]) if (!illustrated.has(id)) specs.set(id, spec);
for (const [id, spec] of illustrated) specs.set(id, spec);
const list = [...specs].filter(([, { diagram: d }]) => d.kind === 'relationship' && (d.layout === 'graph' || d.nodes?.some(n => n.tensor)));
const hits = []; let renders = 0;
for (const width of [408, 720]) for (const [id, spec] of list) {
  renders++;
  for (const hit of tipHits(relationshipGeometry(renderTutorDiagram(spec, width).element))) hits.push({ id, width, ...hit });
}
console.log(JSON.stringify({ specs: list.length, renders, count: hits.length, rendersWithHits: new Set(hits.map(h => h.id + '@' + h.width)).size, hits }));
