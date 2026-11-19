// contact sheet of the 12 NEW GEN-1 pool references (tensor 3, layers 2, transformation 1, figure 3, argument 3) at 408 px, id and kind above each tile
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const ROOT = 'C:/s/gen1-r2/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(ROOT + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(ROOT + 'teaching-theme.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kinds = ['tensor', 'layers', 'transformation', 'figure', 'argument'];
const refs = [];
for (const k of kinds) { const m = await import(pathToFileURL(`${ROOT}gen-1-${k}-references.js`).href); for (const r of m.references) refs.push({ group: k, id: r.id, spec: r.spec }); }
console.log('references', refs.length, refs.map(r => r.id).join(', '));
const tiles = refs.map(r => {
  const d = r.spec.diagram, out = renderTutorDiagram(r.spec, 408), scale = Math.min(1, 408 / out.width);
  return `<div class="t"><div class="i">${esc(r.id)}</div><div class="k">kind: ${esc(d.kind)}${d.variant ? ' (' + esc(d.variant) + ')' : ''} &middot; ${out.width} x ${out.height} px${scale < 1 ? ` &middot; scaled to ${Math.round(scale * 100)}%` : ''}</div><div style="width:408px;height:${Math.ceil(out.height * scale)}px;overflow:hidden"><div style="width:${out.width}px;transform:scale(${scale});transform-origin:0 0;${css}">${renderToStaticMarkup(out.element)}</div></div></div>`;
});
const html = `<html><head><style>body{margin:0;background:#fff;font-family:Arial,sans-serif;width:1300px}.g{display:flex;flex-wrap:wrap;gap:20px;padding:16px;align-items:flex-start}.t{width:408px;border-bottom:2px solid #bbb;padding-bottom:10px}.i{font-size:15px;font-weight:700}.k{font-size:13px;color:#333;margin:2px 0 6px}</style></head><body><div class="g">${tiles.join('')}</div></body></html>`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1300, height: 600, deviceScaleFactor: 1 });
await page.setContent(html);
const out = 'C:/s/film-evidence/docs/features/explain/checks/gen-1/r2/pool-sheet.png';
fs.mkdirSync('C:/s/film-evidence/docs/features/explain/checks/gen-1/r2', { recursive: true });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('written', out);
