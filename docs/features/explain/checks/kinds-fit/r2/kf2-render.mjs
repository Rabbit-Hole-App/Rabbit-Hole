// Local-only render of one example per new kind (bar-chart grouped, heatmap, matrix) to SVG and PNG at an asked box and below min (headless Chrome through puppeteer; no network).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const T = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(T + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(T + 'teaching-theme.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const OUT = 'C:/s/film-evidence/docs/features/explain/checks/kinds-fit/r2/';
const all = size => ({ title: size, heading: size, body: size, small: size });
const gallery = JSON.parse(fs.readFileSync(T + 'kind-gallery.json', 'utf8'));
const neutral = kind => gallery.find(spec => spec.diagram.kind === kind);
const grouped = { version: 1, diagram: { kind: 'bar-chart', title: 'Loans by season', variant: 'grouped', unit: 'books', categories: ['Spring', 'Summer', 'Autumn'], series: [{ label: 'Adults', values: [12, 18, 9] }, { label: 'Children', values: [7, 15, 11] }] } };
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const cases = [
  ['bar-chart-grouped-408x312', grouped, { box: { width: 408, height: 312 }, sizes: all(14), parts: { title: false } }],
  ['bar-chart-grouped-box-120x100-smaller-than-min', grouped, { box: { width: 120, height: 100 }, sizes: all(14), parts: { title: false } }],
  ['heatmap-312x312', neutral('heatmap'), { box: { width: 312, height: 312 }, sizes: all(14), parts: { title: false } }],
  ['heatmap-box-150x100-smaller-than-min', neutral('heatmap'), { box: { width: 150, height: 100 }, sizes: all(14), parts: { title: false } }],
  ['matrix-312x232', neutral('matrix'), { box: { width: 312, height: 232 }, sizes: all(14), parts: { title: false } }],
  ['matrix-box-100x80-smaller-than-min', neutral('matrix'), { box: { width: 100, height: 80 }, sizes: all(14), parts: { title: false } }],
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
  rows.push({ name, box: [options.box.width, options.box.height], drawn: [r.width, r.height], min: { width: r.min.width, height: r.min.height }, fonts: [...new Set([...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => Number(m[1])))] });
}
await browser.close();
console.log(JSON.stringify(rows, null, 1));
