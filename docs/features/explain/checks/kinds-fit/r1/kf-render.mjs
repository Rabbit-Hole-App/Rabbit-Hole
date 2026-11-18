// Local-only render of the two worked examples to SVG and PNG (headless Chrome through puppeteer, the page holds only the SVG; no network).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const T = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(T + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(T + 'teaching-theme.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const OUT = 'C:/s/film-evidence/docs/features/explain/checks/kinds-fit/r1/';
const all = size => ({ title: size, heading: size, body: size, small: size });
const pendulum = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Pendulum angle over time', x: { label: 'Time', unit: 's', min: 0, max: 8 }, y: { label: 'Angle', unit: '°', min: -25, max: 25 },
  series: [{ kind: 'line', label: 'Small swing', points: [{ x: 0, y: 10 }, { x: 2, y: 0 }, { x: 4, y: -10 }, { x: 6, y: 0 }, { x: 8, y: 10 }] },
    { kind: 'line', label: 'Large swing', points: [{ x: 0, y: 20 }, { x: 2, y: 0 }, { x: 4, y: -20 }, { x: 6, y: 0 }, { x: 8, y: 10 }] }] } };
const attention = { version: 1, diagram: { kind: 'token-links', title: 'How sat attends to the sentence', source: ['The', 'cat', 'sat', 'on', 'the', 'mat'], target: ['The', 'cat', 'sat', 'on', 'the', 'mat'],
  queries: [{ index: 2, weights: [0.05, 0.4, 0.3, 0.1, 0.05, 0.1] }] } };
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const cases = [
  ['6.1-plot-312x312', pendulum, { box: { width: 312, height: 312 }, sizes: all(14), parts: { title: false } }],
  ['6.1-plot-box-200x150-smaller-than-min', pendulum, { box: { width: 200, height: 150 }, sizes: all(14), parts: { title: false } }],
  ['6.2-token-links-632x152', attention, { box: { width: 632, height: 152 }, sizes: all(14), parts: { title: false, caption: false } }],
  ['6.2-token-links-box-150x100-smaller-than-min', attention, { box: { width: 150, height: 100 }, sizes: all(14), parts: { title: false, caption: false } }],
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
  rows.push({ name, box: options.box, drawn: [r.width, r.height], min: r.min });
}
await browser.close();
console.log(JSON.stringify(rows));
