// kinds-fit R1: token-links gets box, sizes (body/small/heading) and geometry; defaults = today's constants.
import fs from 'node:fs';
const F = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/token-links-layout.js';
const CR = String.fromCharCode(13, 10), LF = String.fromCharCode(10);
let s = fs.readFileSync(F, 'utf8');
const crlf = s.includes(CR);
s = s.split(CR).join(LF);
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, () => b); };
const repAll = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.split(a).join(b); };

rep('const SMALL = 13;', 'const SMALL = 13;\nconst ROW_GAP_FLOOR = 48; // with a box: the gap between the two chip rows is at least this (a 24 px weight badge and its arrowheads), the rest of the box height is added to it');
rep('function tokenMetrics({ source, target }, compact, requested = 0) {\n  const count', 'function tokenMetrics({ source, target }, compact, requested = 0, { boxed = false, body = 15 } = {}) {\n  const count');
rep('const measure = compact ? widestFormula : textWidth;', 'const measure = compact ? widestFormula : token => textWidth(token, body);');
rep('const budget = Math.min(MAX_WIDTH, Math.max(720, requested));', 'const budget = Math.min(MAX_WIDTH, Math.max(boxed ? 1 : 720, requested));');
rep('const minimum = Math.max(MIN_WIDTH, compact', 'const minimum = Math.max(boxed ? 0 : MIN_WIDTH, compact');
rep('function weightBadge(from, to, weight) {', 'function weightBadge(from, to, weight, small = SMALL) {');
repAll("textWidth(text, SMALL) + 10", 'textWidth(text, small) + 10');
rep("label(text, x, y, { size: SMALL, weight: 600, fill: TEACHING.ink }));", "label(text, x, y, { size: small, weight: 600, fill: TEACHING.ink }));");

// layout: rename the core, add the two-pass wrapper
rep('export function layoutTokenLinks(diagram, requestedWidth = 408, { compact = false } = {}) {', `// kinds-fit: with a box, the chip rows sit ROW_GAP_FLOOR apart and the rest of the box height (contentHeight, set by the entry point) is added to that gap, shared by the panels.
export function layoutTokenLinks(diagram, requestedWidth = 408, options = {}) {
  const { box, contentHeight, floor } = options;
  const first = tokenLinksCore(diagram, requestedWidth, options, () => 0);
  if (!box || floor || contentHeight === undefined) return first;
  const extra = Math.floor(contentHeight - first.height), n = diagram.queries.length;
  return extra > 0 ? tokenLinksCore(diagram, requestedWidth, options, i => Math.floor(extra / n) + (i < extra % n ? 1 : 0)) : first;
}

function tokenLinksCore(diagram, requestedWidth, options, extraGap) {
  const { compact = false, box, sizes } = options;
  const boxed = Boolean(box), body = sizes?.body ?? 15, small = sizes?.small ?? SMALL, heading = sizes?.heading ?? 15;`);
rep('const metrics = tokenMetrics(diagram, compact, requested);', 'const metrics = tokenMetrics(diagram, compact, requested, { boxed, body });');
rep('const sourceLabels = source.map(token => wrap(token, innerWidth));', 'const sourceLabels = source.map(token => wrap(token, innerWidth, body));');
rep('const targetLabels = target.map(token => wrap(token, innerWidth));', 'const targetLabels = target.map(token => wrap(token, innerWidth, body));');
rep('lines.length * lineHeight() + 24)); // token boxes', 'lines.length * lineHeight(body) + 24)); // token boxes');
// the row gap becomes per panel when boxed: targetY / targetTop / targetBottom depend on it
rep('const targetY = sourceBottom + Math.max(86, Math.round(rowWidth * 0.16));\n  const sourceTop = index => sourceY + rowOf(index) * (cellHeight + ROW_GAP), targetTop = index => targetY + rowOf(index) * (cellHeight + ROW_GAP);\n  const targetBottom = targetY + (targetRows - 1) * (cellHeight + ROW_GAP) + cellHeight;',
  'const rowGapFor = panel => (boxed ? ROW_GAP_FLOOR + extraGap(panel) : Math.max(86, Math.round(rowWidth * 0.16)));\n  const sourceTop = index => sourceY + rowOf(index) * (cellHeight + ROW_GAP);');
rep('const sourceLabelY = compact ? sourceY - 11 : sourceY + cellHeight / 2;\n  const targetLabelY = compact ? targetBottom + 11 : targetY + cellHeight / 2;\n\n  function tokenBox(lines, row, index, y, query, strongest) {',
  'const sourceLabelY = compact ? sourceY - 11 : sourceY + cellHeight / 2;\n  const panels = [];\n\n  function tokenBox(lines, row, index, y, query, strongest, targetTop) {');
rep("y = row === 'source' ? sourceTop(index) : targetTop(index);", "y = row === 'source' ? sourceTop(index) : targetTop(index);");
rep('const nameY = y + (cellHeight - 13) / 2;', 'const nameY = y + (cellHeight - small) / 2;');
rep('const scale = Math.min(1, innerWidth / Math.max(...lines.map(line => textWidth(line))));\n    const options = { weight: active || heavy ? 700 : 400 };', 'const scale = Math.min(1, innerWidth / Math.max(...lines.map(line => textWidth(line, body))));\n    const options = { weight: active || heavy ? 700 : 400, size: body };');
rep("name, label(String(index + 1), cx, y + cellHeight - 10, { size: SMALL, tone: 'muted' }));", "name, label(String(index + 1), cx, y + cellHeight - 10, { size: small, tone: 'muted' }));");
rep('  let y = PAD;\n  const elements = queries.map(({ index, weights }) => {', '  let y = PAD;\n  const elements = queries.map(({ index, weights }, panelIndex) => {\n    const top = y;\n    const targetY = sourceBottom + rowGapFor(panelIndex);\n    const targetTop = i => targetY + rowOf(i) * (cellHeight + ROW_GAP);\n    const targetBottom = targetY + (targetRows - 1) * (cellHeight + ROW_GAP) + cellHeight;\n    const targetLabelY = compact ? targetBottom + 11 : targetY + cellHeight / 2;');
rep("const footer = note ? wrap(note, contentWidth, SMALL) : [];\n    const footerHeight = footer.length * lineHeight(SMALL);", "const footer = note ? wrap(note, contentWidth, small) : [];\n    const footerHeight = footer.length * lineHeight(small);");
rep("label(`Query at source position ${index + 1}`, left, INSET + 4, { weight: 700, anchor: 'start' }),\n      label('Source', left, sourceLabelY, { size: SMALL, tone: 'muted', anchor: 'start' }),\n      label('Target', left, targetLabelY, { size: SMALL, tone: 'muted', anchor: 'start' }),",
  "label(`Query at source position ${index + 1}`, left, INSET + 4, { weight: 700, anchor: 'start', size: heading }),\n      label('Source', left, sourceLabelY, { size: small, tone: 'muted', anchor: 'start' }),\n      label('Target', left, targetLabelY, { size: small, tone: 'muted', anchor: 'start' }),");
rep("...sourceLabels.map((lines, i) => tokenBox(lines, 'source', i, sourceY, index, strongest)),\n      ...targetLabels.map((lines, i) => tokenBox(lines, 'target', i, targetY, index, strongest)),\n      strongest.length ? weightBadge(badgeFrom(strongest[0]), to(strongest[0]), highest) : null,",
  "...sourceLabels.map((lines, i) => tokenBox(lines, 'source', i, sourceY, index, strongest, targetTop)),\n      ...targetLabels.map((lines, i) => tokenBox(lines, 'target', i, targetY, index, strongest, targetTop)),\n      strongest.length ? weightBadge(badgeFrom(strongest[0]), to(strongest[0]), highest, small) : null,");
rep("label(footer, left, footerTop + footerHeight / 2, { size: SMALL, weight: 700, anchor: 'start' })", "label(footer, left, footerTop + footerHeight / 2, { size: small, weight: 700, anchor: 'start' })");
// the panel's positions, in picture coordinates (the title block is added by the entry point)
rep('    y += panelHeight + GAP;\n    return panel;', "    const chip = (i, at) => ({ index: i, x: center(i) - cellWidth / 2, y: top + at(i), width: cellWidth, height: cellHeight });\n    panels.push({ query: index, sources: source.map((_, i) => chip(i, sourceTop)), targets: target.map((_, i) => chip(i, targetTop)),\n      links: weights.map((weight, t) => ({ target: t, weight, from: [from[0], top + from[1]], to: [to(t)[0], top + to(t)[1]] })) });\n    y += panelHeight + GAP;\n    return panel;");
rep('return { width, height: y - GAP + PAD, elements };', 'return { width, height: y - GAP + PAD, elements, geometry: { panels } };');
fs.writeFileSync(F, crlf ? s.split(LF).join(CR) : s);
console.log('token-links patched');
