// frame false: is anything drawn outside the picture? (getBBox of all content against the cropped viewBox, headless Chrome; local only)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const T = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(T + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(T + 'teaching-theme.js').href);
const { diagramReferences } = await import(pathToFileURL(T + 'reference-library.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const gallery = JSON.parse(fs.readFileSync(T + 'kind-gallery.json', 'utf8'));
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const all = s => ({ title: s, heading: s, body: s, small: s });
const neutral = k => gallery.find(s => s.diagram.kind === k);
const tree = pick => diagramReferences.find(r => r.spec?.diagram?.kind === 'tree' && pick(r.spec.diagram))?.spec;
const specs = [...['coordinate-plot', 'token-links', 'bar-chart', 'heatmap', 'matrix', 'flow'].map(k => [k, neutral(k)]), ['tree binary', tree(d => d.layout === 'binary' && d.nodes.some(n => n.count !== undefined || n.detail) && d.nodes.every(n => n.label !== undefined))], ['tree hierarchy', tree(d => d.layout === 'hierarchy')],
  ...(process.argv.slice(2).includes('--new') ? ['layers', 'block-stack', 'tensor'].map(k => [k, neutral(k)]) : [])];
const BOXES = [[632, 312], [312, 312], [632, 152], [312, 392], [312, 232]];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
let bad = 0, n = 0;
for (const [name, spec] of specs) {
  if (!spec) { console.log(name, 'no example'); continue; }
  for (const [w, h] of BOXES) for (const size of [14, 12, 16]) for (const frame of [false]) {
    const r = renderTutorDiagram(spec, w, { box: { width: w, height: h }, sizes: all(size), parts: { title: false, caption: false, frame } });
    await page.setContent(`<html><body style="margin:0"><div style="${css}">${renderToStaticMarkup(r.element)}</div></body></html>`);
    const m = await page.evaluate(() => {
      const s = document.querySelector('svg'); const vb = s.viewBox.baseVal;
      // union bbox of the drawn children (the root bbox)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const el of s.querySelectorAll('g[transform] > *, svg > text, svg > g > text')) { /* children measured through their own bbox in the root space */ }
      const b = s.getBBox();
      return { vx: vb.x, vy: vb.y, vw: vb.width, vh: vb.height, bx: b.x, by: b.y, bw: b.width, bh: b.height };
    });
    n++;
    const eps = 0.75;
    const out = [m.vx - m.bx, m.vy - m.by, (m.bx + m.bw) - (m.vx + m.vw), (m.by + m.bh) - (m.vy + m.vh)];
    if (out.some(v => v > eps)) { bad++; console.log('OUTSIDE', name, `${w}x${h}`, size, 'drawn', r.width, r.height, 'overhang l,t,r,b', out.map(v => Math.round(v * 10) / 10).join(', ')); }
  }
}
await browser.close();
console.log(`checked ${n} pictures, ${bad} with content outside the picture (tolerance 0.75 px; getBBox excludes strokes)`);
