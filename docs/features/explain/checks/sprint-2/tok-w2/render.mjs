import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
const [root, out, phase] = process.argv.slice(2);
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
mkdirSync(out, { recursive: true });
const all = [...lib.diagramReferences, ...lib.illustrationReferences, ...lib.transformerWalkthroughReferences];
const lines = [];
for (const [id, path] of [['ml-gpt2-fused-qkv-slices', 'spec'], ['ml-transformer-token-embeddings', 'spec'], ['ml-transformer-residual-arithmetic', 'spec'], ['ml-transformer-weighted-values', 'spec'], ['ml-transformer-parallel-attention-heads', 'detailSpec'], ['ml-transformer-vocabulary-softmax', 'detailSpec']]) {
  const ref = all.find(r => r.id === id); const spec = ref[path];
  for (const w of [408, 720]) {
    const { element, width, height } = renderTutorDiagram(spec, w);
    const name = `${id.replace(/^ml-(gpt2|transformer)-/, '')}-${w}-${phase}`;
    writeFileSync(`${out}/${name}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${renderToStaticMarkup(element)}`);
    lines.push(`${name} ${Math.ceil(width)}x${Math.ceil(height)}`);
  }
}
console.log(lines.join('\n'));
