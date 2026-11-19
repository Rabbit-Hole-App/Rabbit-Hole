// GEN-1 R3 bench sheets. On-topic and numeric questions: BEFORE row (release 165) and AFTER row (165 + R3), three seeds side by side, each tile = the card's first diagram at 408 px (fitted to the column),
// kind and kindSource above it. The 29 R3-pre cells: one tile each, AFTER only. katex.min.css is loaded so formula captions render (page is loaded from a file, not setContent).
// usage: node sheets.mjs [results.jsonl] [outDir] [--sets ontopic,numeric,r3pre] [--per-sheet 2] [--limit N] [--tree <web tutor-diagrams dir of the AFTER tree>]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { renderToStaticMarkup } from 'react-dom/server';
const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { sets: { type: 'string', default: 'ontopic,numeric,r3pre' }, 'per-sheet': { type: 'string', default: '2' }, limit: { type: 'string' }, tree: { type: 'string', default: 'C:/s/gen1-r3-trees/after/packages/web/src/tutor-diagrams/' } } });
const [RES = 'results.jsonl', OUT0 = 'C:/s/sprint2-evidence/gen1-r3-bench/sheets/'] = positionals;
const OUT = OUT0.replace(/[\/]*$/, '/'); // a slash after the directory, whatever was typed
const KATEX = 'file:///C:/s/teaching-palette/node_modules/katex/dist/katex.min.css';
const { renderTutorDiagram } = await import(pathToFileURL(o.tree + 'TutorDiagram.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(o.tree + 'teaching-theme.js').href);
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '...' : s);
const sets = o.sets.split(',');
const rows = fs.readFileSync(RES, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r => (r.profile ?? 'google-low') === 'google-low' && sets.includes(r.set));
const tile = (r, label) => {
  const head = `<div class="l">${label}</div>`;
  const d = r?.diagrams?.[0];
  if (!r) return `<div class="t">${head}<div class="k">not run</div></div>`;
  if (!r.delivered || !d) return `<div class="t">${head}<div class="k">${r.delivered ? 'card without a diagram' : 'no card (honest failure)'}</div></div>`;
  const kinds = (r.diagrams ?? []).map(x => x.kind).join(' + ');
  const src = r.kindSource ? `kindSource: ${esc(r.kindSource)}${r.kindDraw ? ` (drawn ${esc(r.kindDraw.drawn)}; planner said ${esc(r.plannerKind ?? '-')})` : ''}${r.closest ? ' &middot; closest example shown' : ''}` : `planner kind: ${esc(r.plannerKind ?? '-')}${r.examplesKind ? ` &middot; request carried: ${esc(r.examplesKind)}` : ''}`;
  return `<div class="t">${head}<div class="k"><b>kind: ${esc(kinds)}</b><br>${src}</div>${r.diagrams.map((dg, i) => { const out = renderTutorDiagram({ version: 1, diagram: dg }, 408), scale = Math.min(1, 408 / out.width); return `<div class="k">diagram ${i + 1} of ${r.diagrams.length}: ${esc(dg.kind)}${scale < 1 ? ` (drawn ${out.width} px wide, scaled to ${Math.round(scale * 100)}%)` : ''}</div><div style="width:408px;height:${Math.ceil(out.height * scale)}px;overflow:hidden;margin-bottom:6px"><div style="width:${out.width}px;transform:scale(${scale});transform-origin:0 0;${css}">${renderToStaticMarkup(out.element)}</div></div>`; }).join('')}</div>`;
};
const order = [...new Set(rows.filter(r => !['r3pre', 'r31'].includes(r.set)).map(r => `${r.set}|${r.tag ?? ''}|${r.prompt}`))];
const questions = (o.limit ? order.slice(0, Number(o.limit)) : order).map(k => { const [set, tag, ...p] = k.split('|'); const prompt = p.join('|'); return { set, tag, prompt, runs: rows.filter(r => r.set === set && (r.tag ?? '') === tag && r.prompt === prompt) }; });
const row = (q, arm) => [1, 2, 3].map(rep => tile(q.runs.find(r => r.arm === arm && r.rep === rep), `${arm.toUpperCase()} seed ${rep}`)).join('');
const blocks = questions.map(q => `<div class="c"><div class="h">${esc(q.set)} ${esc(q.tag)} &middot; ${esc(cut(q.prompt, 130))}</div><div class="r">${row(q, 'before')}</div><div class="r a">${row(q, 'after')}</div></div>`);
const cellRows = rows.filter(r => r.set === 'r3pre' && r.arm === 'after');
const cellBlocks = cellRows.map(r => `<div class="c"><div class="h">r3pre run ${r.idx} &middot; depth ${esc(r.depth ?? '')} &middot; ${esc(cut(r.prompt, 130))}</div><div class="r">${tile(r, 'AFTER')}</div></div>`);
// R3-1 re-run (set r31, arm after): one block per depth, the three seeds side by side
const r31Blocks = ['balanced', 'detailed'].map(depth => ({ depth, runs: rows.filter(r => r.set === 'r31' && r.arm === 'after' && r.depth === depth) })).filter(b => b.runs.length).map(b => `<div class="c"><div class="h">r31 · ${esc(cut(b.runs[0].prompt, 130))} · depth ${b.depth}</div><div class="r">${[1, 2, 3].map(rep => tile(b.runs.find(r => r.rep === rep), `AFTER seed ${rep}`)).join('')}</div></div>`);
fs.mkdirSync(OUT, { recursive: true });
const per = Number(o['per-sheet']);
const pages = [];
for (let i = 0; i < blocks.length; i += per) pages.push(['q', blocks.slice(i, i + per)]);
for (let i = 0; i < cellBlocks.length; i += 3 * per) pages.push(['c', cellBlocks.slice(i, i + 3 * per)]);
if (r31Blocks.length) pages.push(['q', r31Blocks]);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
let n = 0;
for (const [kind, bl] of pages) {
  n++;
  const html = `<html><head><link rel="stylesheet" href="${KATEX}"><style>body{margin:0;background:#fff;font-family:Arial,sans-serif;width:1300px}.c{padding:10px;border-bottom:3px solid #888}.h{font-size:15px;font-weight:700;margin-bottom:6px}.r{display:flex;gap:20px;margin-bottom:8px}.r.a{border-top:2px dashed #aaa;padding-top:6px}.t{width:408px}.l{font-size:18px;font-weight:700}.k{font-size:13px;color:#333;margin:2px 0 6px}${kind === 'c' ? 'body{display:flex;flex-wrap:wrap}.c{width:1300px}' : ''}</style></head><body>${bl.join('')}</body></html>`;
  const f = `${OUT}sheet-${String(n).padStart(2, '0')}.html`;
  fs.writeFileSync(f, html);
  await page.setViewport({ width: 1300, height: 600, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: f.replace('.html', '.png'), fullPage: true });
}
await browser.close();
console.log(`sheets: ${n} (${questions.length} on-topic and numeric questions before and after, ${cellRows.length} R3-pre cells after) in ${OUT}`);
