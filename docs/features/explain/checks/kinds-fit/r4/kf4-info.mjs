import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const T = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(T + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(T + 'teaching-theme.js').href);
const gallery = JSON.parse(fs.readFileSync(T + 'kind-gallery.json', 'utf8'));
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const all = s => ({ title: s, heading: s, body: s, small: s });
const OUT = 'C:/s/film-evidence/docs/features/explain/checks/kinds-fit/r4/images/';
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
for (const kind of ['coordinate-plot', 'token-links', 'bar-chart', 'heatmap', 'matrix', 'flow', 'layers', 'tensor']) {
  const spec = gallery.find(s => s.diagram.kind === kind);
  const m = renderTutorDiagram(spec, 400, { box: { width: 1, height: 1 }, sizes: all(14), parts: { title: false, caption: false } }).min;
  const mf = renderTutorDiagram(spec, 400, { box: { width: 1, height: 1 }, sizes: all(14), parts: { title: false, caption: false, frame: false } }).min;
  rows.push({ kind, min14: [m.width, m.height], min14NoFrame: [mf.width, mf.height] });
}
console.log(JSON.stringify(rows));
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const cases = [['layers', [312, 232]], ['tensor', [312, 120]]];
for (const [kind, [w, h]] of cases) {
  const spec = gallery.find(s => s.diagram.kind === kind);
  for (const [tag, box] of [['asked', { width: w, height: h }], ['below-min', { width: 100, height: 60 }]]) for (const frame of [true, false]) {
    const r = renderTutorDiagram(spec, box.width, { box, sizes: all(14), parts: { title: false, caption: false, frame } });
    const svg = renderToStaticMarkup(r.element);
    const name = `${kind}-${tag}-frame-${frame}`;
    fs.writeFileSync(`${OUT}${name}.svg`, svg);
    await page.setViewport({ width: Math.ceil(r.width) + 20, height: Math.ceil(r.height) + 20, deviceScaleFactor: 2 });
    await page.setContent(`<html><body style="margin:10px;background:#d8e4f0"><div id="s" style="width:${r.width}px;${css}">${svg}</div></body></html>`);
    await (await page.$('#s')).screenshot({ path: `${OUT}${name}.png` });
    console.log(name, r.width, 'x', r.height, 'min', r.min.width, 'x', r.min.height);
  }
}
await browser.close();
