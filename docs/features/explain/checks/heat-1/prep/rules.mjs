// PROTOTYPE of the HEAT-1 rules, outside the repo (nothing here is applied). Same shape as checkHeatmap(d, issue) in ml-statistical-spec.js:50.
// Run: node C:/s/heat1-prep/rules.mjs   -> table of every heatmap in the library and gallery, plus the delivered cards, under each rule variant.
import fs from 'node:fs';
const T = 'file:///C:/s/var-1/packages/web/src/tutor-diagrams/';
const { diagramReferences } = await import(T + 'reference-library.js');
const { singleDiagramReferences } = await import(T + 'reference-single-variants.js');
const { parseTutorDiagram } = await import(T + 'spec.js');

const numericCells = d => d.rows.flatMap(row => row.cells).filter(v => v !== null);
// The value heatColor (ml-statistical-layouts.js:21-26) draws with fill-opacity 0: range.min for a range that does not cross zero upward, 0 for a signed range, range.max for a range at or below 0.
const blankValue = ({ min, max }) => (min < 0 && max > 0 ? 0 : max <= 0 ? max : min);

// Variant L (literal ticket wording): every numeric cell equal (or fewer than 2 numeric cells) = no contrast.
export const noContrastLiteral = d => { const n = numericCells(d); return n.length < 2 || Math.max(...n) === Math.min(...n); };
// Variant D (recommended): the grid is drawn blank = every numeric cell has the SAME value AND that value is the one drawn with no fill. A masked (null) cell is a drawn state of its own (dashed "Masked").
export const noContrastDrawn = d => {
  const n = numericCells(d), range = d.range ?? { min: Math.min(...n), max: Math.max(...n) };
  return n.length > 0 && Math.max(...n) === Math.min(...n) && (n[0] === blankValue(range) || range.min === range.max);
};
// Diagonal rule: square, n >= 2, every cell with j > i is null (a strict upper triangle is blocked); then every cell with j = i must be numeric.
export const triangleBlocked = d => d.rows.length === d.columns.length && d.rows.length >= 2 && d.rows.every(row => row.cells.length === d.columns.length)
  && d.rows.every((row, i) => row.cells.every((v, j) => j <= i || v === null)) && numericCells(d).length > 0;
export const diagonalBlocked = d => triangleBlocked(d) && d.rows.some((row, i) => row.cells[i] === null);

const found = [];
function walk(node, id, path) { if (!node || typeof node !== 'object') return; if (node.kind === 'heatmap' && Array.isArray(node.rows)) found.push({ id, path, d: node }); for (const [k, v] of Object.entries(node)) walk(v, id, path + '/' + k); }
for (const r of diagramReferences) walk(r, r.id, '');
for (const r of singleDiagramReferences) walk(r, r.id, '');
const gallery = JSON.parse(fs.readFileSync('C:/s/var-1/packages/web/src/tutor-diagrams/kind-gallery.json', 'utf8'));
gallery.forEach((g, i) => walk(g, 'kind-gallery#' + i, ''));
const depthsJson = JSON.parse(fs.readFileSync('C:/s/var-1/packages/web/src/tutor-diagrams/kind-gallery-depths.json', 'utf8'));
(Array.isArray(depthsJson) ? depthsJson : Object.values(depthsJson)).forEach((g, i) => walk(g, 'kind-gallery-depths#' + i, ''));

const rows = found.map(({ id, path, d }) => ({ id, path, literalFails: noContrastLiteral(d), drawnFails: noContrastDrawn(d), diagonalFails: diagonalBlocked(d), triangle: triangleBlocked(d) }));
const ids = list => [...new Set(list.map(r => `${r.id}${r.path}`))];
console.log('heatmap specs scanned:', rows.length, '(distinct (id,path):', ids(rows).length, ')');
console.log('literal rule fails:', rows.filter(r => r.literalFails).map(r => `${r.id}${r.path}`));
console.log('drawn-blank rule fails:', rows.filter(r => r.drawnFails).map(r => `${r.id}${r.path}`));
console.log('diagonal rule fails:', rows.filter(r => r.diagonalFails).map(r => `${r.id}${r.path}`));
console.log('triangle-null detected (rule applies):', rows.filter(r => r.triangle).map(r => `${r.id}${r.path}`));
fs.writeFileSync('C:/s/heat1-prep/rules-table.json', JSON.stringify(rows, null, 1));

// delivered cards and hand-made probes
const card = f => JSON.parse(fs.readFileSync('C:/s/heat1-prep/' + f, 'utf8')).diagram;
const probes = {
  'delivered 155 card (causal-mask-card.json)': card('causal-mask-card.json'),
  'idx56 after (diagonal allowed, all 0, range -4..4)': card('causal-mask-card-diag-allowed-all-zero.json'),
  'fixed: 0/1 mask, diagonal allowed, blocked null, range 0..1': { kind: 'heatmap', title: 't', columns: ['1', '2', '3'], rows: [{ label: '1', cells: [1, null, null] }, { label: '2', cells: [1, 1, null] }, { label: '3', cells: [1, 1, 1] }], range: { min: 0, max: 1 } },
  'fixed: raw scores, diagonal allowed (the library reference)': diagramReferences.find(r => r.id === 'ml-transformer-causal-mask').spec.diagram,
  'half correlation matrix, diagonal omitted (lower triangle, j<i)': { kind: 'heatmap', title: 't', columns: ['A', 'B', 'C'], rows: [{ label: 'A', cells: [null, null, null] }, { label: 'B', cells: [0.4, null, null] }, { label: 'C', cells: [-0.2, 0.7, null] }], range: { min: -1, max: 1 } },
  'half correlation matrix, diagonal 1': { kind: 'heatmap', title: 't', columns: ['A', 'B', 'C'], rows: [{ label: 'A', cells: [1, null, null] }, { label: 'B', cells: [0.4, 1, null] }, { label: 'C', cells: [-0.2, 0.7, 1] }], range: { min: -1, max: 1 } },
  'all numeric, all equal, 0 at range 0..1 (blank)': { kind: 'heatmap', title: 't', columns: ['a', 'b'], rows: [{ label: 'x', cells: [0, 0] }, { label: 'y', cells: [0, 0] }], range: { min: 0, max: 1 } },
  'all numeric, all equal 0.2 at range 0..1 (the uniform-weights reference)': { kind: 'heatmap', title: 't', columns: ['a', 'b'], rows: [{ label: 'x', cells: [0.2, 0.2] }, { label: 'y', cells: [0.2, 0.2] }], range: { min: 0, max: 1 } },
};
for (const [name, d] of Object.entries(probes)) {
  let parses = true; try { parseTutorDiagram({ version: 1, diagram: d }); } catch { parses = false; }
  console.log(`${name}\n   parses today: ${parses}; literal no-contrast: ${noContrastLiteral(d)}; drawn-blank no-contrast: ${noContrastDrawn(d)}; triangle: ${triangleBlocked(d)}; diagonal blocked: ${diagonalBlocked(d)}`);
}
