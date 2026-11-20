// STACK-C rework sheet: BEFORE = feat/rel-1 efe5a5207 (REL-1 only, no STACK-C), AFTER = the rework commit. Each spec at 408 px, side by side, four specs a page.
// usage: node sheet.mjs outDir
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const OUT = process.argv[2] ?? 'out';
const IDS = [
  ['ml-architecture-hybrid-routing', 'unchanged by the rework: containers hold insets'],
  ['ml-gemma-decoder-stack-detailed', 'unchanged by the rework: containers hold insets'],
  ['ml-transformer-token-embeddings', 'unchanged by the rework: blocks hold insets'],
  ['ml-transformer-weighted-values', 'unchanged by the rework: blocks hold insets'],
  ['ml-transformer-vocabulary-softmax-detail', 'unchanged by the rework: blocks hold insets'],
  ['ml-dense-vs-moe-architecture', 'unchanged by the rework: a changed block is in the stack'],
  ['ml-what-is-machine-learning-dataset-split', 'keeps the new blue'],
  ['d2l-cnn-shape-through-classifier', 'keeps the new blue'],
  ['figure-vocabulary-interface-width', 'keeps the new blue'],
  ['ml-linear-regression-linear-unit', 'also changes (leaf blocks, no inset, no changed block)'],
  ['ml-neural-networks-hidden-layer', 'also changes (leaf blocks, no inset, no changed block)'],
  ['ml-regularization-regularized-objective', 'also changes (leaf blocks, no inset, no changed block)'],
  ['shape-block-stack', 'also changes (the gallery shape example)'],
];
const load = async arm => {
  const d = pathToFileURL(`C:/s/stackc-sheet/${arm}/packages/web/src/tutor-diagrams/`).href;
  const [lib, gal, td, th] = await Promise.all([import(d + 'reference-library.js'), import(d + 'kind-gallery.json', { with: { type: 'json' } }), import(d + 'TutorDiagram.js'), import(d + 'teaching-theme.js')]);
  const specs = new Map([...lib.diagramReferences.flatMap(r => [[r.id, r.spec], ...(r.detailSpec ? [[r.id + '-detail', r.detailSpec]] : []), ...Object.entries(r.depths ?? {}).filter(([, v]) => v?.spec).map(([k, v]) => [r.id + '-' + ({ overview: 'brief', deep: 'detailed' }[k] ?? k), v.spec])]), ...gal.default.map(s => ['shape-' + s.diagram.kind, s])]);
  return { specs, render: td.renderTutorDiagram, style: th.TEACHING_STYLE };
};
const { renderToStaticMarkup } = await import(pathToFileURL('C:/s/teaching-palette/node_modules/react-dom/server.node.js').href);
const T = { before: await load('before'), after: await load('after') };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tile = (arm, id) => {
  const t = T[arm], spec = t.specs.get(id);
  if (!spec) return `<div class="t"><div class="l">${arm.toUpperCase()}</div><div class="k">${esc(id)}: not in this tree</div></div>`;
  const o = t.render(spec, 408), css = Object.entries(t.style).map(([k, v]) => `${k}:${v}`).join(';');
  return `<div class="t"><div class="l">${arm.toUpperCase()}</div><div style="width:${o.width}px;${css}">${renderToStaticMarkup(o.element)}</div></div>`;
};
fs.mkdirSync(OUT, { recursive: true });
const per = 4;
for (let p = 0; p * per < IDS.length; p++) {
  const blocks = IDS.slice(p * per, p * per + per).map(([id, note]) => `<div class="c"><div class="h">${esc(id)} &middot; ${esc(note)}</div><div class="r">${tile('before', id)}${tile('after', id)}</div></div>`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>stackc ${p + 1}</title><link rel="stylesheet" href="file:///C:/s/teaching-palette/node_modules/katex/dist/katex.min.css"><style>body{margin:0;background:#fff;font-family:Arial,sans-serif;width:1300px}.c{padding:10px;border-bottom:3px solid #888}.h{font-size:15px;font-weight:700;margin-bottom:6px}.r{display:flex;gap:30px}.t{flex:none}.l{font-size:16px;font-weight:700;margin-bottom:4px}.k{font-size:13px}</style></head><body>${blocks.join('')}</body></html>`;
  fs.writeFileSync(`${OUT}/stackc-rework-p${p + 1}.html`, html);
}
console.log('pages', Math.ceil(IDS.length / per));
