import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { phase02LessonCoverage, PHASE02_SOURCE } from '../src/tutor-diagrams/reference-library.js';
import { diagramReferences } from '../src/tutor-diagrams/offline-reference-library.js';
import kindGallery from '../src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
import { parseTutorDiagram } from '../src/tutor-diagrams/spec.js';
import { renderTutorDiagram } from '../src/tutor-diagrams/TutorDiagram.js';

// Deterministic source-controlled acceptance assets, never substituted for model
// output. Run from any directory; optional positional destination is for QA.
const defaultOut = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/handoff/phase02-library/references/', import.meta.url));
const output = process.argv[2] ? resolve(process.argv[2]) : defaultOut;
await mkdir(output, { recursive: true });
const records = [];
const previews = [];
const shapeRecords = [];
const shapePreviews = [];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const galleryEntries = kindGallery.map(spec => ({
  id: `shape-${spec.diagram.kind}`, lessons: [], prompts: [spec.diagram.title],
  useWhen: 'Neutral example for the requested diagram kind.', spec, shape: true,
}));
for (const reference of [...diagramReferences, ...galleryEntries]) {
  const spec = parseTutorDiagram(reference.spec);
  const { element, width, height } = renderTutorDiagram(spec, 408);
  const svg = renderToStaticMarkup(element);
  await writeFile(resolve(output, `${reference.id}.svg`), svg + '\n');
  await writeFile(resolve(output, `${reference.id}.json`), JSON.stringify(spec, null, 2) + '\n');
  const index = reference.shape ? shapeRecords : records;
  const cards = reference.shape ? shapePreviews : previews;
  index.push({ id: reference.id, lessons: reference.lessons, prompts: reference.prompts, useWhen: reference.useWhen, kind: spec.diagram.kind, width, height });
  cards.push(`<article id="${reference.id}"><h2>${escape(reference.id)}</h2><p>${escape(reference.prompts[0])}</p><div class="scene">${svg}</div><p><a href="${reference.id}.json">JSON</a> · <a href="${reference.id}.svg">SVG</a></p></article>`);
}
// The gallery carries the same KaTeX stylesheet/fonts as the app. Raw SVG files
// intentionally remain the renderer's output; formula foreignObjects need this
// host CSS. Embed the gallery's fonts so it can be opened without a dev server.
const require = createRequire(import.meta.url);
const katexPath = require.resolve('katex/dist/katex.min.css');
let katexCss = await readFile(katexPath, 'utf8');
for (const face of [...katexCss.matchAll(/@font-face\{[^}]+\}/g)]) {
  const woff = face[0].match(/url\(([^)]+\.woff2)\) format\("woff2"\)/);
  if (!woff) continue;
  const bytes = await readFile(resolve(dirname(katexPath), woff[1]));
  katexCss = katexCss.replace(face[0], face[0].replace(/src:[^;}]*/, `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2")`));
}
const inter = await readFile(require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'));
const galleryCss = `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${inter.toString('base64')}) format("woff2");font-weight:100 900} ${katexCss}
*{box-sizing:border-box}body{margin:24px;background:#f6f8f4;color:#202723;font:14px/1.5 Inter,Arial,sans-serif}h1{font-size:24px}h2{font-size:15px;margin:0}p{margin:8px 0 16px;color:#5d675f}a{color:#426db2}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:24px}article{min-width:0;padding:16px;border:1px solid #e3e7e0;border-radius:12px;background:#fffefa}.scene{overflow-x:auto}svg{max-width:none}`;
await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Explanation SVG gallery</title><style>${galleryCss}</style><body><h1>Explanation SVG gallery</h1><p>Actual renderer output from checked reference JSON.</p><h2>Neutral kind shapes</h2><main>${shapePreviews.join('\n')}</main><h2>Worked references</h2><main>${previews.join('\n')}</main></body></html>\n`);
const lessons = phase02LessonCoverage.map(({ lesson }) => ({
  lesson, referenceIds: diagramReferences.filter(ref => ref.lessons.includes(lesson)).map(ref => ref.id),
}));
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ source: PHASE02_SOURCE, width: 408, references: records, kindGallery: shapeRecords, lessons }, null, 2) + '\n');
const lines = [
  '# Phase 02 written Explanation references', '',
  'These SVGs are produced by the production `renderTutorDiagram` renderer from the adjacent JSON. They are checked teaching examples, not outputs from a live model call. The author receives a relevant bounded subset of the same reference objects.', '',
  'Open [index.html](index.html) for the complete gallery, with the same KaTeX styling as the app and embedded fonts. Individual SVG files are raw renderer output; formula foreignObjects require the host KaTeX stylesheet. Inspect formulas in the gallery or the app.', '',
  'Palette source: the approved `tree-splits-and-impurity.svg` at Rabbit-Hole commit `012d4ae3dfd9b20ef14156bea89c2632b844cc46`. The shared `teaching-theme.js` owns those exact tokens; legacy layouts retain their saved treatment.', '',
  '| Reference | Kind | Lessons | Normal prompt |', '| --- | --- | --- | --- |',
  ...records.map(r => `| [${r.id}](${r.id}.svg) · [JSON](${r.id}.json) | \`${r.kind}\` | ${r.lessons.join(', ') || 'General'} | ${r.prompts[0].replaceAll('|', '\\|')} |`), '',
  '## Neutral kind shapes', '',
  '| Kind | Files |', '| --- | --- |',
  ...shapeRecords.map(r => `| \`${r.kind}\` | [SVG](${r.id}.svg) · [JSON](${r.id}.json) |`), '',
  '## Coverage by lesson', '',
  ...lessons.map(r => `- **${r.lesson}:** ${r.referenceIds.map(id => `[${id}](${id}.svg)`).join(', ')}`), '',
];
await writeFile(resolve(output, 'README.md'), lines.join('\n'));
console.log(`Exported ${records.length} worked references and ${shapeRecords.length} neutral shape SVG/JSON pairs to ${output}`);
