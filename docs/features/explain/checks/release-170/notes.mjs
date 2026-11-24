// usage: node notes.mjs <treeRoot>: the six ids at 320, 408, 720 px: width x height, note lines (text), labels on arrows
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const dir = process.argv[2] + '/packages/web/src/tutor-diagrams/', load = rel => import(pathToFileURL(dir + rel).href);
const { renderTutorDiagram } = await load('TutorDiagram.js');
const { diagramReferences } = await load('reference-library.js');
const { relationshipGeometry } = await load('test-relationship-geometry.mjs');
const { illustrationSpecs } = await import(pathToFileURL(process.argv[2] + '/packages/web/scripts/illustration-previews.mjs').href);
const specs = new Map(diagramReferences.map(r => [r.id, r.spec])); for (const { id, spec } of illustrationSpecs()) specs.set(id, spec);
const ids = ['ml-stable-diffusion-unet-timestep-and-skips', 'ml-stable-diffusion-unet-timestep-and-skips-brief', 'ml-stable-diffusion-unet-timestep-and-skips-detailed', 'figure-gallery-shared-kv-and-index', 'figure-gallery-shared-kv-and-index-brief', 'figure-gallery-shared-kv-and-index-detailed'];
for (const id of ids) for (const width of [320, 408, 720]) {
  const r = renderTutorDiagram(specs.get(id), width);
  const graph = r.element.props.children[3].props.children;
  const last = graph.findLastIndex(n => n.props['data-tutor-node'] !== undefined);
  const notes = graph.slice(last + 1).flatMap(note => { const text = note.type === 'switch' ? note.props.children[1].props.children : note; return [text.props.children].flat().map(span => (span?.props?.children ?? span)); });
  const labels = relationshipGeometry(r.element).filter(e => e.label).map(e => e.label.text);
  console.log(`${id} @${width}: ${r.width}x${r.height} notes=${notes.length} ${JSON.stringify(notes)} labels=${JSON.stringify(labels)}`);
}
