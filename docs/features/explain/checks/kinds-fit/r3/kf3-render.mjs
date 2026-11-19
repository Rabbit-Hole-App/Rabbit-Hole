// Local-only render of one flow and one decision tree (library example) to SVG and PNG at an asked box and below min (headless Chrome through puppeteer, no network).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const T = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(T + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(T + 'teaching-theme.js').href);
const { diagramReferences } = await import(pathToFileURL(T + 'reference-library.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const OUT = 'C:/s/film-evidence/docs/features/explain/checks/kinds-fit/r3/';
const all = size => ({ title: size, heading: size, body: size, small: size });
const gallery = JSON.parse(fs.readFileSync(T + 'kind-gallery.json', 'utf8'));
const flow = gallery.find(spec => spec.diagram.kind === 'flow');
const tree = diagramReferences.find(ref => ref.spec?.diagram?.kind === 'tree' && ref.spec.diagram.layout === 'binary' && ref.spec.diagram.nodes.some(n => n.count !== undefined || n.detail) && ref.spec.diagram.nodes.every(n => n.label !== undefined)).spec;
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const cases = [
  ['flow-632x312', flow, { box: { width: 632, height: 312 }, sizes: all(14), parts: { title: false } }],
  ['flow-box-150x100-smaller-than-min', flow, { box: { width: 150, height: 100 }, sizes: all(14), parts: { title: false } }],
  ['tree-632x392', tree, { box: { width: 632, height: 392 }, sizes: all(14), parts: { title: false, caption: false } }],
  ['tree-box-150x100-smaller-than-min', tree, { box: { width: 150, height: 100 }, sizes: all(14), parts: { title: false, caption: false } }],
];
fs.mkdirSync(OUT + 'images', { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const rows = [];
for (const [name, spec, options] of cases) {
  const r = renderTutorDiagram(spec, options.box.width, options);
  const svg = renderToStaticMarkup(r.element);
  fs.writeFileSync(`${OUT}images/${name}.svg`, svg);
  await page.setViewport({ width: Math.ceil(r.width) + 20, height: Math.ceil(r.height) + 20, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:10px;background:#fff"><div id="s" style="width:${r.width}px;${css}">${svg}</div></body></html>`);
  await (await page.$('#s')).screenshot({ path: `${OUT}images/${name}.png` });
  rows.push({ name, box: options.box, drawn: [r.width, r.height], min: { width: r.min.width, height: r.min.height }, parts: r.min.parts.map(p => `${p.axis}:${p.part}=${p.px}`) });
}
await browser.close();
console.log(JSON.stringify(rows, null, 1));
