// AUDIT-1 combine: structural diff of two renders per id + paired contact sheets (before = main 18cf9fce8 left, after = 74c4f68ae right).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'C:/s/sprint2-evidence/audit-1';
mkdirSync(OUT, { recursive: true });
const oldR = JSON.parse(readFileSync('C:/s/audit1/old.json', 'utf8'));
const newR = JSON.parse(readFileSync('C:/s/audit1/new.json', 'utf8'));
const ids = [...new Set([...Object.keys(oldR), ...Object.keys(newR)])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// ---- structural diff
const FLAGS = ['render-error', 'only-before', 'only-after', 'smooth->straight', 'straight->smooth', 'closed-shapes-changed', 'markers-changed', 'badges-without-key', 'badges-without-key (same before)', 'text-overflow', 'elements>30%', 'width-changed'];
const rows = [];
for (const id of ids) {
  const a = oldR[id], b = newR[id], flags = [];
  if (!a) flags.push('only-after'); else if (!b) flags.push('only-before');
  if (a?.error || b?.error) flags.push('render-error');
  if (a?.m && b?.m) {
    const x = a.m, y = b.m;
    if (x.pathsWithC > 0 && y.pathsWithC === 0) flags.push('smooth->straight');
    if (x.pathsWithC === 0 && y.pathsWithC > 0) flags.push('straight->smooth');
    if (x.closedPolygons !== y.closedPolygons) flags.push('closed-shapes-changed');
    const mk = m => m.markers + m.squares + m.diamonds;
    const mx = mk(x), my = mk(y);
    if (mx !== my && (mx === 0 || my === 0 || Math.abs(mx - my) / Math.max(mx, my) > 0.25)) flags.push('markers-changed');
    if (y.badgesWithoutKey > 0) flags.push(y.badgesWithoutKey > x.badgesWithoutKey ? 'badges-without-key' : 'badges-without-key (same before)');
    if (y.overflows.length > 0 && y.overflows.length > x.overflows.length) flags.push('text-overflow');
    if (x.elements > 0 && Math.abs(y.elements - x.elements) / x.elements > 0.3) flags.push('elements>30%');
    if (Math.round(a.w) !== Math.round(b.w)) flags.push('width-changed');
  }
  const m = side => side?.m ? { elements: side.m.elements, C: side.m.cmdC, pathsWithC: side.m.pathsWithC, closed: side.m.closedPolygons, markers: side.m.markers, squares: side.m.squares, diamonds: side.m.diamonds, circles: side.m.circles, badges: side.m.badges, listLines: side.m.listLines, badgesNoKey: side.m.badgesWithoutKey, overflows: side.m.overflows.length, w: Math.round(side.w), h: Math.round(side.h) } : null;
  rows.push({ id, set: (b ?? a).set, flags, before: m(a), after: m(b), overflowAfter: b?.m?.overflows?.slice(0, 4) ?? [], overflowBefore: a?.m?.overflows?.length ?? 0 });
}
rows.sort((p, q) => q.flags.length - p.flags.length || (p.id < q.id ? -1 : 1));
const summary = Object.fromEntries(FLAGS.map(f => [f, rows.filter(r => r.flags.includes(f)).length]));
const flagged = rows.filter(r => r.flags.length);
const byCount = {};
for (const r of rows) byCount[r.flags.length] = (byCount[r.flags.length] ?? 0) + 1;
writeFileSync(`${OUT}/diff.json`, JSON.stringify({ widthRequested: 408, before: 'main 18cf9fce8', after: 'feat/visual-sprint 74c4f68ae (= main 74c4f68ae)', ids: ids.length, summary, byFlagCount: byCount, rows }, null, 2));
const cell = s => (s ? `${s.elements}/${s.C}/${s.closed}/${s.markers}+${s.squares}+${s.diamonds}/${s.badges}:${s.badgesNoKey}/${s.overflows}/${s.w}x${s.h}` : '-');
const md = [
  '# AUDIT-1: structural diff, every snapshot id at width 408',
  '',
  'Before = main 18cf9fce8 (left on the sheets), after = 74c4f68ae (right). Set: the snapshot ids that have a 408 key in `svg-snapshots.json`: 221 reference ids (those not drawn as illustrations) + 22 `shape-*` kind-gallery ids + 844 illustration ids (the references drawn as illustrations, their depth variants `-brief`/`-detailed`/`-detail`, and the fixtures) = ' + ids.length + ' ids. Both trees render the same ids (no id appears on one side only). Rendered with each tree\'s own `renderTutorDiagram(spec, 408)`; figure widths can exceed 408 when the figure needs it (that is the `width-changed` flag).',
  '',
  '## Summary: ids per flag',
  '',
  '| flag | ids |', '|---|---|',
  ...FLAGS.map(f => `| ${f} | ${summary[f]} |`),
  '',
  `Ids with at least one flag: ${flagged.length} of ${ids.length}. Ids by number of flags: ${Object.entries(byCount).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} flags: ${v}`).join(', ')}.`,
  '',
  '## Flag rules (SVG string of each tree, regex measurement; script `C:/s/audit1/audit-render.mjs` + `combine.mjs`)',
  '- smooth->straight / straight->smooth: number of `<path>` elements whose d contains a cubic `C` command, before vs after (0 vs more than 0). Flow wires use `Q` corners and are not counted.',
  '- closed-shapes-changed: count of closed shapes differs: polygons with 4+ points (not arrowheads) plus paths that end in Z or return to their first point using only L segments.',
  '- markers-changed: small circles (r up to 8) + small squares (w = h up to 14) + 4-point polygons (diamonds) differ by more than 25 percent or one side is 0.',
  '- badges-without-key: after has a numbered badge (a circle r 6-14 followed by a text of 1-2 digits centred on it) whose number has no text line starting "N. " / "N) " anywhere in the figure.',
  '- text-overflow: an ESTIMATE, not a measurement: each `<text>` is measured with the renderer\'s own `textWidth(line, fontSize)` (it ignores font weight, so bold text is under-estimated) and compared with the smallest rect that contains its anchor point (flag when it protrudes more than 1 px) and with the figure\'s own width; flagged only when the after render has more overflows than the before render. HTML `foreignObject` text (legend pills) is not measured.',
  '- elements>30%: SVG element count differs by more than 30 percent.',
  '- width-changed: the figure width (rounded) differs.',
  '',
  '## Per id (sorted by number of flags, then id; only flagged ids; full data in diff.json)',
  '',
  'Counts are `elements / C commands / closed shapes / markers+squares+diamonds / badges:without key / overflows / width x height`.',
  '',
  '| id | set | flags | before | after | overflow detail (after) |', '|---|---|---|---|---|---|',
  ...flagged.map(r => `| ${r.id} | ${r.set.replace('kind-gallery shape', 'shape').replace('illustration case', 'illus').replace('reference', 'ref')} | ${r.flags.join(', ')} | ${cell(r.before)} | ${cell(r.after)} | ${r.overflowAfter.map(o => `${o.kind}:${o.text} (${o.w}${o.box ? ' in ' + o.box : ''})`).join('; ').replace(/\|/g, '/')} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/diff.md`, md);
console.log(JSON.stringify(summary), 'flagged', flagged.length, JSON.stringify(byCount));
console.log(rows.slice(0, 20).map(r => `${r.id} [${r.flags.join(',')}]`).join('\n'));

// ---- paired sheets
const CELL = 300, GAP = 8, PAIR_GAP = 16, PER_ROW = 6, LABEL = 18, MAX_SHEET_H = 4200, MARGIN = 10;
const cssVars = file => {
  const css = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const root = css.slice(0, css.indexOf('\n.dark {') > 0 ? css.indexOf('\n.dark {') : css.length);
  return [...root.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map(m => `${m[1]}:${m[2].trim().replace(/"/g, "'")}`).join(';');
};
const varsOld = cssVars('C:/s/audit1/old/packages/web/src/index.css'), varsNew = cssVars('C:/s/audit1/new/packages/web/src/index.css');
const figure = (r, vars) => {
  if (!r || r.error) return `<div style="width:${CELL}px;height:40px;font:12px Arial;color:#900">${r?.error ?? 'absent'}</div>`;
  const s = Math.min(CELL / 408, CELL / r.w), h = Math.ceil(r.h * s);
  return { html: `<div style="width:${CELL}px;height:${h}px;overflow:hidden;${vars ? '' : ''}"><div style="width:${Math.ceil(r.w)}px;transform:scale(${s});transform-origin:0 0;${vars}">${r.svg}</div></div>`, h, scale: s };
};
const rowsOfIds = [];
for (let i = 0; i < ids.length; i += PER_ROW) rowsOfIds.push(ids.slice(i, i + PER_ROW));
const sheets = [];
let cur = { rows: [], h: MARGIN };
for (const rowIds of rowsOfIds) {
  const pairs = rowIds.map(id => ({ id, a: figure(oldR[id], `${varsOld}`), b: figure(newR[id], `${varsNew}`) }));
  const hgt = LABEL + Math.max(...pairs.flatMap(p => [p.a.h ?? 40, p.b.h ?? 40])) + 10;
  if (cur.h + hgt > MAX_SHEET_H && cur.rows.length) { sheets.push(cur); cur = { rows: [], h: MARGIN }; }
  cur.rows.push({ pairs, hgt, top: cur.h }); cur.h += hgt;
}
sheets.push(cur);
const width = MARGIN * 2 + PER_ROW * (2 * CELL + GAP) + (PER_ROW - 1) * PAIR_GAP;
const index = [];
sheets.forEach((sheet, n) => {
  const body = sheet.rows.map(row => row.pairs.map((p, i) => {
    const left = MARGIN + i * (2 * CELL + GAP + PAIR_GAP);
    const flagged = rows.find(r => r.id === p.id)?.flags.length ? ' [' + rows.find(r => r.id === p.id).flags.length + ']' : '';
    return `<div style="position:absolute;left:${left}px;top:${row.top}px;width:${2 * CELL + GAP}px"><div style="font:600 11px Arial;color:#222;height:${LABEL}px;white-space:nowrap;overflow:hidden">${p.id}${flagged}</div><div style="display:flex;gap:${GAP}px"><div>${p.a.html ?? p.a}</div><div>${p.b.html ?? p.b}</div></div></div>`;
  }).join('')).join('');
  const name = `sheet-${String(n + 1).padStart(2, '0')}`;
  writeFileSync(`C:/s/audit1/${name}.html`, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#cfccc2"><div style="position:relative;width:${width}px;height:${sheet.h + MARGIN}px">${body}</div>`);
  index.push(`${name} ${width} ${sheet.h + MARGIN} ${sheet.rows[0].pairs[0].id} ${sheet.rows.at(-1).pairs.at(-1).id}`);
});
writeFileSync('C:/s/audit1/sheets-index.txt', index.join('\n') + '\n');
console.log('sheets', sheets.length, 'width', width, 'scale', (CELL / 408).toFixed(3), 'for figures up to 408 px wide, 300/width for wider');
