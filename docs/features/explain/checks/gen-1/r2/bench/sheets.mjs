// R2 bench output sheets: the AFTER cards of the no-match, numeric and SAME-1 questions, the three seeds of one question side by side (each tile = the card's first diagram at 408 px, fitted to its
// column, the kind above it). The Reviewer recomputes the numbers by hand from these (R3-pre showed wrong numbers that no rule flags).
// usage: node sheets.mjs [results.jsonl] [outDir] [--arm after] [--profile google-low] [--sets nomatch,numeric,same1] [--per-sheet 3] [--limit N]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { renderToStaticMarkup } from 'react-dom/server';
const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { arm: { type: 'string', default: 'after' }, profile: { type: 'string', default: 'google-low' }, sets: { type: 'string', default: 'nomatch,numeric,same1' }, 'per-sheet': { type: 'string', default: '3' }, limit: { type: 'string' }, tree: { type: 'string', default: 'C:/s/gen1-r2-trees/after/packages/web/src/tutor-diagrams/' } } });
const [RES = 'results.jsonl', OUT = 'C:/s/sprint2-evidence/gen1-r2-bench/sheets/'] = positionals;
const { renderTutorDiagram } = await import(pathToFileURL(o.tree + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(o.tree + 'teaching-theme.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '...' : s);
const rows = fs.readFileSync(RES, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r => r.arm === o.arm && (r.profile ?? 'google-low') === o.profile && o.sets.split(',').includes(r.set));
const order = [...new Set(rows.map(r => `${r.set}|${r.tag ?? ''}|${r.prompt}`))];
const questions = (o.limit ? order.slice(0, Number(o.limit)) : order).map(k => { const [set, tag, ...p] = k.split('|'); const prompt = p.join('|'); return { set, tag, prompt, runs: rows.filter(r => r.set === set && (r.tag ?? '') === tag && r.prompt === prompt).sort((a, b) => (a.rep ?? 0) - (b.rep ?? 0)) }; });
const tile = r => {
  const head = `<div class="l">seed ${r.rep ?? '?'}</div>`;
  const d = r.diagrams?.[0];
  if (!r.delivered || !d) return `<div class="t">${head}<div class="k">${r.delivered ? 'card without a diagram' : 'no card (honest failure)'}</div></div>`;
  const out = renderTutorDiagram({ version: 1, diagram: d }, 408), scale = Math.min(1, 408 / out.width), kinds = (r.diagrams ?? []).map(x => x.kind).join(' + ');
  return `<div class="t">${head}<div class="k">kind: ${esc(kinds)}${scale < 1 ? ` (drawn ${out.width} px wide, scaled to ${Math.round(scale * 100)}%)` : ''}${r.examplesKind ? ` &middot; request carried: ${esc(r.examplesKind)}` : ''}</div><div style="width:408px;height:${Math.ceil(out.height * scale)}px;overflow:hidden"><div style="width:${out.width}px;transform:scale(${scale});transform-origin:0 0;${css}">${renderToStaticMarkup(out.element)}</div></div></div>`;
};
const blocks = questions.map(q => `<div class="c"><div class="h">${esc(q.set)} ${esc(q.tag)} &middot; ${esc(cut(q.prompt, 120))}</div><div class="r">${q.runs.slice(0, 3).map(tile).join('')}</div></div>`);
fs.mkdirSync(OUT, { recursive: true });
const per = Number(o['per-sheet']), sheets = Math.ceil(blocks.length / per);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (let s = 0; s < sheets; s++) {
  const html = `<html><head><style>body{margin:0;background:#fff;font-family:Arial,sans-serif;width:1300px}.c{padding:10px;border-bottom:3px solid #888}.h{font-size:15px;font-weight:700;margin-bottom:6px}.r{display:flex;gap:20px}.t{width:408px}.l{font-size:18px;font-weight:700}.k{font-size:13px;color:#333;margin:2px 0 6px}</style></head><body>${blocks.slice(s * per, s * per + per).join('')}</body></html>`;
  await page.setViewport({ width: 1300, height: 600, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: `${OUT}sheet-${String(s + 1).padStart(2, '0')}.png`, fullPage: true });
}
await browser.close();
console.log(`sheets: ${sheets} (${questions.length} questions, arm ${o.arm}, profile ${o.profile}, sets ${o.sets}) in ${OUT}`);
