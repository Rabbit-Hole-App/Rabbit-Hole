// BOX-1 hand-check sheet: the delivered cards of one arm, the three seeds of a prompt side by side. Each tile: the author model, the expected statistics (median of the halves, the middle value left out
// for odd n, computed from the numbers in the prompt) against the drawn ones, the card's diagram at 408 px with the real renderer, its caption and its prose (katex.min.css loaded). Modelled on
// C:/s/sprint2-evidence/gen1-r2-bench/sheets.mjs.
// usage: node sheets.mjs [results.jsonl] [outDir] [--arm after] [--per-sheet 5] [--tree C:/s/box1/packages/web/src/tutor-diagrams/]
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { renderToStaticMarkup } from 'react-dom/server';
const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { arm: { type: 'string', default: 'after' }, 'per-sheet': { type: 'string', default: '5' }, tree: { type: 'string', default: 'C:/s/box1/packages/web/src/tutor-diagrams/' } } });
const [RES = 'C:/s/box1-bench/results-v2.jsonl', OUT = 'C:/s/box1-bench/sheets/'] = positionals;
const NM = 'C:/s/teaching-palette/node_modules/';
const { renderTutorDiagram } = await import(pathToFileURL(o.tree + 'TutorDiagram.js').href);
const { parseTutorDiagram } = await import(pathToFileURL(o.tree + 'spec.js').href);
const { TEACHING_STYLE } = await import(pathToFileURL(o.tree + 'teaching-theme.js').href);
const katex = createRequire(NM)('katex');
const puppeteer = (await import(pathToFileURL('C:/s/kinds-fit/node_modules/puppeteer/lib/puppeteer/puppeteer.js').href)).default;
const css = Object.entries(TEACHING_STYLE).map(([k, v]) => `${k}:${v}`).join(';');
const katexCss = fs.readFileSync(NM + 'katex/dist/katex.min.css', 'utf8').replace(/url\(fonts\//g, `url(${pathToFileURL(NM + 'katex/dist/fonts/').href}`);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '...' : s);
// text with $...$ maths: escaped, the maths through katex
const withMath = text => String(text ?? '').split(/(\$[^$]+\$)/).map(part => { if (/^\$[^$]+\$$/.test(part)) { try { return katex.renderToString(part.slice(1, -1), { throwOnError: false }); } catch { return esc(part); } } return esc(part); }).join('');
const med = a => { const n = a.length, m = n >> 1; return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const num = n => Number(n.toFixed(3));
function expected(prompt) {
  const runs = [...prompt.matchAll(/(-?\d+(?:\.\d+)?(?:\s*,\s*(?:and\s+)?-?\d+(?:\.\d+)?){4,})/g)].map(m => m[1].match(/-?\d+(?:\.\d+)?/g).map(Number));
  if (runs.length !== 1) return null;
  const s = [...runs[0]].sort((a, b) => a - b), n = s.length, m = n >> 1, q1 = med(s.slice(0, m)), q3 = med(s.slice(n % 2 ? m + 1 : m)), lower = q1 - 1.5 * (q3 - q1), upper = q3 + 1.5 * (q3 - q1);
  return { q1, median: med(s), q3, iqr: q3 - q1, lower, upper, outliers: s.filter(v => v < lower || v > upper) };
}
const say = e => `Q1 ${num(e.q1)}, median ${num(e.median)}, Q3 ${num(e.q3)}, IQR ${num(e.iqr)}, fences ${num(e.lower)} and ${num(e.upper)}, outlier ${e.outliers.join(', ') || 'none'}`;
const authorOf = r => (r.author ? `${r.author.provider ?? '?'} / ${r.author.model ?? '?'}` : r.authoredBy ? `${r.authoredBy.provider} / ${r.authoredBy.model}` : 'unknown');
const proseOf = body => String(body ?? '').replace(/```[\s\S]*?```/g, '\n\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const rows = fs.readFileSync(RES, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r => r.arm === o.arm);
const prompts = [...new Set(rows.map(r => r.prompt))];
const tile = (r, exp) => {
  const head = `<div class="l">seed ${esc(r.rep ?? '?')} &middot; idx ${esc(r.idx)}</div><div class="k">author: <b>${esc(authorOf(r))}</b></div>${exp ? `<div class="e">expected: ${esc(say(exp))}</div>` : ''}`;
  const body = r.deliveredBody ?? r.body, diagrams = r.deliveredDiagrams ?? r.diagrams ?? [], d = diagrams.find(x => x?.kind === 'box-plot') ?? diagrams[0];
  if (!r.delivered || !d) return `<div class="t">${head}<div class="x">${r.delivered ? 'card without a diagram' : `no card (honest failure: ${esc(r.errorCode)})`}</div></div>`;
  const doc = { version: 1, diagram: d }, out = renderTutorDiagram(doc, 408), scale = Math.min(1, 408 / out.width);
  let drawn = '';
  try { const b = parseTutorDiagram(structuredClone(doc)).diagram.boxes?.[0]; if (b) { const mine = { q1: b.q1, median: b.median, q3: b.q3, lower: b.fences?.lower, upper: b.fences?.upper }; const ok = exp && mine.q1 === exp.q1 && mine.median === exp.median && mine.q3 === exp.q3 && (mine.lower === undefined || (Math.abs(mine.lower - exp.lower) < 1e-9 && Math.abs(mine.upper - exp.upper) < 1e-9)); drawn = `<div class="${ok ? 'ok' : 'bad'}">drawn: Q1 ${b.q1}, median ${b.median}, Q3 ${b.q3}${b.fences ? `, fences ${b.fences.lower} and ${b.fences.upper}` : ' (no fences drawn)'}, outliers ${(b.outliers ?? []).map(p => p.value).join(', ') || 'none'}${exp ? (ok ? ' = expected' : ' DIFFERS from expected') : ''}</div>`; } } catch { drawn = '<div class="bad">the diagram does not parse</div>'; }
  const caption = d.caption ? `<div class="cap"><b>caption:</b> ${withMath(d.caption)}</div>` : '';
  return `<div class="t">${head}${drawn}<div style="width:408px;height:${Math.ceil(out.height * scale)}px;overflow:hidden"><div style="width:${out.width}px;transform:scale(${scale});transform-origin:0 0;${css}">${renderToStaticMarkup(out.element)}</div></div>${caption}<div class="p">${proseOf(body).map(p => `<p>${withMath(p)}</p>`).join('')}</div></div>`;
};
const blocks = prompts.map(p => { const exp = expected(p); return `<div class="c"><div class="h">${esc(cut(p, 150))}</div><div class="r">${rows.filter(r => r.prompt === p).sort((a, b) => (a.rep ?? 0) - (b.rep ?? 0)).slice(0, 3).map(r => tile(r, exp)).join('')}</div></div>`; });
fs.mkdirSync(OUT, { recursive: true });
const per = Number(o['per-sheet']), sheets = Math.max(1, Math.ceil(blocks.length / per));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
for (let s = 0; s < sheets; s++) {
  const html = `<html><head><style>${katexCss}body{margin:0;background:#fff;font-family:Arial,sans-serif;width:1340px}.c{padding:10px;border-bottom:3px solid #888}.h{font-size:15px;font-weight:700;margin-bottom:6px}.r{display:flex;gap:20px;align-items:flex-start}.t{width:408px}.l{font-size:18px;font-weight:700}.k{font-size:13px;color:#333;margin:2px 0}.e{font-size:12px;color:#064;margin:2px 0}.ok{font-size:12px;color:#064;font-weight:700;margin:2px 0 6px}.bad{font-size:12px;color:#a00;font-weight:700;margin:2px 0 6px}.x{font-size:13px;color:#a00;margin:6px 0}.cap{font-size:12px;color:#333;margin:4px 0}.p{font-size:12px;color:#111;line-height:1.35}.p p{margin:4px 0}</style></head><body>${blocks.slice(s * per, s * per + per).join('')}</body></html>`;
  await page.setViewport({ width: 1340, height: 600, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: `${OUT}sheet-${String(s + 1).padStart(2, '0')}.png`, fullPage: true });
}
await browser.close();
console.log(`sheets: ${sheets} (${prompts.length} prompts, arm ${o.arm}, ${rows.length} rows) in ${OUT}`);
