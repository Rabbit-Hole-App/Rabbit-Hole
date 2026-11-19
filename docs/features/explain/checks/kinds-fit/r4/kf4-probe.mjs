// probe: the content margins of each fitted kind inside its layout group (how much outer padding the layout leaves), measured with getBBox in headless Chrome
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const T = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(T + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(T + 'teaching-theme.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const gallery = JSON.parse(fs.readFileSync(T + 'kind-gallery.json', 'utf8'));
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const all = s => ({ title: s, heading: s, body: s, small: s });
const kinds = [['coordinate-plot'], ['token-links'], ['bar-chart'], ['heatmap'], ['matrix'], ['flow'], ['tree', s => s.diagram.layout === 'binary' || s.diagram.layout === 'hierarchy'], ['tensor'], ['layers'], ['block-stack']];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [kind, pick] of kinds) {
  const specs = gallery.filter(s => s.diagram.kind === kind && (!pick || pick(s)));
  const spec = specs[0];
  if (!spec) { console.log(kind, 'no gallery example'); continue; }
  const r = renderTutorDiagram(spec, 400, { box: { width: 400, height: 320 }, sizes: all(14), parts: { title: false, caption: false } });
  const svg = renderToStaticMarkup(r.element);
  await page.setContent(`<html><body style="margin:0"><div style="${css}">${svg}</div></body></html>`);
  const m = await page.evaluate(() => {
    const s = document.querySelector('svg'); const g = s.querySelector('g[transform]'); const b = g.getBBox();
    const W = Number(s.getAttribute('width')), H = Number(s.getAttribute('height'));
    return { W, H, left: b.x, top: b.y, right: W - (b.x + b.width), bottom: H - (b.y + b.height) };
  });
  console.log(kind, 'drawn', r.width, 'x', r.height, 'margins (l,t,r,b)', [m.left, m.top, m.right, m.bottom].map(v => Math.round(v * 10) / 10).join(', '));
}
await browser.close();
