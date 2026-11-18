// Read-only: list every heatmap spec in the reference library, the single-variant library and the gallery; test the proposed HEAT-1 rules on each.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const T = 'file:///C:/s/var-1/packages/web/src/tutor-diagrams/';
const { diagramReferences } = await import(T + 'reference-library.js');
const { singleDiagramReferences } = await import(T + 'reference-single-variants.js');
const { parseTutorDiagram } = await import(T + 'spec.js');
const require = createRequire(import.meta.url);
const gallery = JSON.parse(fs.readFileSync('C:/s/var-1/packages/web/src/tutor-diagrams/kind-gallery.json', 'utf8'));
const depths = JSON.parse(fs.readFileSync('C:/s/var-1/packages/web/src/tutor-diagrams/kind-gallery-depths.json', 'utf8'));
const examples = JSON.parse(fs.readFileSync('C:/s/var-1/packages/web/src/tutor-diagrams/examples.json', 'utf8'));

const found = [];
function walk(node, id, src, path) {
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'heatmap' && Array.isArray(node.rows)) found.push({ id, src, path, d: node });
  for (const [k, v] of Object.entries(node)) walk(v, id, src, path + '/' + k);
}
for (const r of diagramReferences) walk(r, r.id, 'diagramReferences', '');
for (const r of singleDiagramReferences) walk(r, r.id ?? '?', 'singleDiagramReferences', '');
gallery.forEach((g, i) => walk(g, 'kind-gallery#' + i, 'kind-gallery.json', ''));
(Array.isArray(depths) ? depths : Object.entries(depths)).forEach((g, i) => walk(g, 'kind-gallery-depths#' + i, 'kind-gallery-depths.json', ''));
(Array.isArray(examples) ? examples : Object.values(examples)).forEach((g, i) => walk(g, 'examples.json#' + i, 'examples.json', ''));

// ---- proposed rules (pure functions of the parsed heatmap) ----
const numeric = d => d.rows.flatMap(r => r.cells).filter(v => v !== null && v !== undefined);
// R1: contrast = at least 2 numeric cells and not all equal
const contrast = d => { const n = numeric(d); return n.length >= 2 && Math.max(...n) > Math.min(...n); };
// relative spread vs the written/derived range, to see how close legit cards come to the line
const spreadOfRange = d => { const n = numeric(d); const r = d.range ?? { min: Math.min(...n), max: Math.max(...n) }; return r.max > r.min ? (Math.max(...n) - Math.min(...n)) / (r.max - r.min) : 0; };
// R2: triangular-null detection and diagonal rule
const square = d => d.rows.length === d.columns.length && d.rows.every(r => r.cells.length === d.columns.length);
const upperNull = d => d.rows.every((r, i) => r.cells.every((v, j) => j <= i || v === null)) && d.rows.some((r, i) => r.cells.some((v, j) => j > i));
const lowerNull = d => d.rows.every((r, i) => r.cells.every((v, j) => j >= i || v === null)) && d.rows.some((r, i) => r.cells.some((v, j) => j < i));
const diagNull = d => d.rows.some((r, i) => r.cells[i] === null);
const rows = [];
const seen = new Set();
for (const f of found) {
  const key = JSON.stringify(f.d); // dedupe identical specs reached through several registries
  const d = f.d;
  const nulls = d.rows.flat ? 0 : 0;
  const nullCount = d.rows.reduce((a, r) => a + r.cells.filter(v => v === null).length, 0);
  const tri = square(d) && (upperNull(d) || lowerNull(d));
  rows.push({
    id: f.id, src: f.src, path: f.path, dup: seen.has(key), size: `${d.rows.length}x${d.columns.length}`, nulls: nullCount,
    numericCells: numeric(d).length, distinct: new Set(numeric(d)).size, contrast: contrast(d), spreadOfRange: +spreadOfRange(d).toFixed(3),
    triangularNull: tri ? (upperNull(d) ? 'upper(j>i)' : 'lower(j<i)') : '', diagNull: tri && diagNull(d), range: d.range ? `${d.range.min}..${d.range.max}` : 'derived',
    parses: (() => { try { parseTutorDiagram({ version: 1, diagram: d }); return true; } catch (e) { return false; } })(),
  });
  seen.add(key);
}
console.log(JSON.stringify(rows, null, 1));
console.error('counts: found', found.length, 'distinct specs', seen.size, 'diagramReferences', diagramReferences.length, 'single', singleDiagramReferences.length);
