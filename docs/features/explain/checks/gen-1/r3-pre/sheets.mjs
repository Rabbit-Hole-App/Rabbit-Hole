// R3-pre contact sheets: 6 cells per sheet, two tiles per cell (A left, B right; which arm is A is shuffled per cell, the key goes to key.json), each tile = the card's diagram at 408 px with the kind above it.
// usage: node sheets.mjs [results.jsonl] [outDir]   (without results.jsonl the PLAN tiles are placeholders: layout dry run)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const [RES = 'results.jsonl', OUT = 'C:/s/gen1-r3pre/sheets/'] = process.argv.slice(2);
const T = 'C:/s/gen1-r1-trees/after/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(T + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(T + 'teaching-theme.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const cells = JSON.parse(fs.readFileSync('C:/s/gen1-r3pre/cells.json', 'utf8'));
const plan = new Map((fs.existsSync(RES) ? fs.readFileSync(RES, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []).map(r => [r.idx, r]));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '...' : s);
const tile = (label, card, note) => {
  if (!card?.diagrams?.length) return `<div class="t"><div class="l">${label}</div><div class="k">${esc(note)}</div></div>`;
  const d = card.diagrams[0], kinds = card.diagrams.map(x => x.kind).join(' + ');
  const r = renderTutorDiagram({ version: 1, diagram: d }, 408);
  return `<div class="t"><div class="l">${label}</div><div class="k">kind: ${esc(kinds)}</div><div style="width:${r.width}px;${css}">${renderToStaticMarkup(r.element)}</div></div>`;
};
const key = {};
const blocks = cells.map(c => {
  const aIsRef = ((c.cell * 2654435761) >>> 0) % 2 === 0; // seeded shuffle: fixed per cell number
  key[c.cell] = { A: aIsRef ? 'REF' : 'PLAN', B: aIsRef ? 'PLAN' : 'REF' };
  const ref = { diagrams: c.diagrams }, pl = plan.get(c.cell);
  const refTile = c.delivered ? ref : null, plTile = pl?.delivered ? pl : null;
  const refNote = 'no card (honest failure)', plNote = pl ? 'no card (honest failure)' : 'PLAN not run yet (placeholder)';
  const left = tile('A', aIsRef ? refTile : plTile, aIsRef ? refNote : plNote), right = tile('B', aIsRef ? plTile : refTile, aIsRef ? plNote : refNote);
  return `<div class="c"><div class="h">Cell ${c.cell} &middot; ${esc(c.depth)} &middot; ${esc(cut(c.prompt, 90))}</div><div class="r">${left}${right}</div></div>`;
});
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(OUT + 'key.json', JSON.stringify(key, null, 1));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const sheets = Math.ceil(blocks.length / 6);
for (let s = 0; s < sheets; s++) {
  const html = `<html><head><style>body{margin:0;background:#fff;font-family:Arial,sans-serif;width:880px}.c{padding:10px;border-bottom:3px solid #888}.h{font-size:14px;font-weight:700;margin-bottom:6px}.r{display:flex;gap:24px}.t{width:408px}.l{font-size:22px;font-weight:700}.k{font-size:13px;color:#333;margin:2px 0 6px}</style></head><body>${blocks.slice(s * 6, s * 6 + 6).join('')}</body></html>`;
  await page.setViewport({ width: 880, height: 600, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: `${OUT}sheet-${s + 1}.png`, fullPage: true });
}
await browser.close();
console.log(`sheets: ${sheets} in ${OUT}; key: ${OUT}key.json (the key stays with the lead until the Reviewer has judged)`);
