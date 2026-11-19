// kind-limits: the table read from the zod schemas (kind-limits.js) is checked against the real parser. For the six fitted kinds, every list field accepts a list at its table
// max and min and refuses one item more or fewer, and every text field accepts exactly its shown-length limit and refuses one more shown character. The base specs are
// the kind gallery's own; only the field under test changes (plus the fields that must follow it: one cell per column, one weight per target token, a flow's edges...).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { kindLimitKinds, kindLimits, shownLength } from './kind-limits.js';
import { parseTutorDiagram, textLimits, tutorDiagramSchema } from './spec.js';

const gallery = JSON.parse(readFileSync(new URL('./kind-gallery.json', import.meta.url), 'utf8'));
const baseOf = kind => structuredClone(gallery.find(spec => spec.diagram.kind === kind).diagram);
const FITTED = ['coordinate-plot', 'token-links', 'bar-chart', 'heatmap', 'matrix', 'flow'];
const range = n => Array.from({ length: Math.max(n, 0) }, (_, i) => i);

// The paths zod reports for a diagram the parser refuses, as table paths: ['rows', 0, 'cells'] -> rows[].cells.
const keyOf = path => path.map(part => typeof part === 'number' ? '[]' : `.${part}`).join('').replace(/^\./, '').replace(/\.?\[\]/g, '[]').replace(/\[\]\./g, '[].');
function refusedAt(diagram) {
  try { parseTutorDiagram({ version: 1, diagram }); return []; }
  catch (error) { if (!error.issues) throw error; return error.issues.map(issue => keyOf(issue.path.slice(1))); }
}
const parses = (diagram, what) => assert.deepEqual(refusedAt(diagram), [], `${what} should parse`);
// A refusal at the field itself; inside a plain union (a|0.b) zod reports the union's own path, so the part before the first | is what is compared.
function refuses(diagram, path, what) {
  const own = path.replace(/\{[^}]*\}/g, ''), prefix = own.split('|')[0];
  const refused = refusedAt(diagram);
  assert.ok(refused.some(key => own.includes('|') ? key.startsWith(prefix) : key === own), `${what} should be refused at ${own}; refused at: ${JSON.stringify(refused)}`);
}

// ---- list builders: a valid diagram of the kind whose list at `path` holds n items ----
const grid = (columns, rows, ids) => ({
  columns: range(columns).map(c => `C${c}`),
  rows: range(rows).map(r => ({ ...(ids && { id: `r${r}` }), heading: `R${r}`, cells: range(columns).map(() => '1') })),
});
const teaching = (d, columns, rows) => Object.assign(d, { layout: 'teaching' }, grid(columns, rows, true));
const chain = count => ({
  nodes: range(count).map(i => ({ id: `n${i}`, label: `Step ${i}`, role: i === count - 1 ? 'outcome' : 'process' })),
  edges: range(count - 1).map(i => ({ from: `n${i}`, to: `n${i + 1}` })),
});
// A fork reaching every other node, and a second fork reaching nine of them: twelve nodes, twenty distinct edges, one root.
const fan = () => ({
  nodes: range(12).map(i => ({ id: `n${i}`, label: `Step ${i}`, role: i < 2 ? 'fork' : 'outcome' })),
  edges: [...range(11).map(i => ({ from: 'n0', to: `n${i + 1}` })), ...range(9).map(i => ({ from: 'n1', to: `n${i + 2}` }))],
});
// Two routes that split at a fork and meet at a merge; `length` is the first route's length (at least 4 nodes of path): r, a1..ak, m, t.
const pair = length => {
  const middle = Math.max(length - 3, 1);
  const a = range(middle).map(i => `a${i}`);
  const ids = ['r', ...a, 'm', 't'];
  const nodes = ids.map(id => ({ id, label: id, role: id === 'r' ? 'fork' : id === 'm' ? 'merge' : id === 't' ? 'outcome' : 'process' }));
  const edges = [{ from: 'r', to: a[0] }, ...a.slice(1).map((id, i) => ({ from: a[i], to: id })), { from: a.at(-1), to: 'm' }, { from: 'r', to: 'm' }, { from: 'm', to: 't' }];
  return { nodes, edges, paths: [ids, ['r', 'm', 't']] };
};
const annotated = (d, annotations) => Object.assign(d, { annotations });
const samples = (d, samples) => Object.assign(d, { series: [{ label: 'Samples', kind: 'scatter', samples }] });
const barCategories = (d, categories, series) => {
  delete d.bars;
  return Object.assign(d, { variant: 'grouped', categories: range(categories).map(i => `Group ${i}`), series: range(series).map(s => ({ label: `Series ${s}`, values: range(categories).map(i => i + s) })) });
};
const heat = (d, columns, rows) => Object.assign(d, { columns: range(columns).map(c => `C${c}`), rows: range(rows).map(r => ({ label: `R${r}`, cells: range(columns).map(c => r * 10 + c) })), range: { min: 0, max: 1000 } });
const cellRefs = n => range(n).map(i => ({ row: `r${Math.floor(i / 8)}`, column: i % 8 }));
// `unreachable`: a bound no valid diagram can reach because of a rule between fields; the test then only checks that the schema itself raises nothing at that path.
const LISTS = {
  'coordinate-plot': {
    series: (d, n) => Object.assign(d, { series: range(n).map(i => ({ ...structuredClone(d.series[0]), label: `Series ${i}` })) }),
    'series[].points': (d, n) => Object.assign(d, { series: [{ label: 'Points', kind: 'scatter', points: range(n).map(i => ({ x: i % 8, y: i })) }] }),
    'series[].samples|0.x|0': (d, n) => samples(d, { x: range(n).map(i => i % 8), y: range(n) }),
    'series[].samples|0.x|2.values': (d, n) => samples(d, { x: { values: range(n).map(i => i % 8), divisor: 1 }, y: range(n) }),
    'series[].samples|0.y': (d, n) => samples(d, { x: range(n).map(i => i % 8), y: range(n) }),
    annotations: (d, n) => annotated(d, range(n).map(i => ({ kind: 'point', label: `P${i}`, x: 1, y: 1 }))),
    'annotations[]{polygon}.points': (d, n) => annotated(d, [{ kind: 'polygon', label: 'Area', points: range(n).map(i => ({ x: 4 + 3 * Math.cos(2 * Math.PI * i / n), y: 32 + 30 * Math.sin(2 * Math.PI * i / n) })) }]),
  },
  'token-links': {
    source: (d, n) => Object.assign(d, { source: range(n).map(i => `s${i}`), queries: [{ index: Math.min(1, Math.max(n - 1, 0)), weights: [0.5, 0.5] }] }),
    target: (d, n) => Object.assign(d, { target: range(n).map(i => `t${i}`), queries: [{ index: 1, weights: range(n).map(() => 0.1) }] }),
    queries: (d, n) => Object.assign(d, { source: ['a', 'b', 'c'], queries: range(n).map(i => ({ index: i, weights: [0.5, 0.5] })) }),
    'queries[].weights': (d, n) => Object.assign(d, { target: range(n).map(i => `t${i}`), queries: [{ index: 1, weights: range(n).map(() => 0.1) }] }),
  },
  'bar-chart': {
    bars: (d, n) => Object.assign(d, { bars: range(n).map(i => ({ label: `Bar ${i}`, value: i })) }),
    categories: (d, n) => barCategories(d, n, 2),
    series: (d, n) => barCategories(d, 2, n),
    'series[].values': (d, n) => barCategories(d, n, 2),
  },
  heatmap: {
    columns: (d, n) => heat(d, n, 2),
    rows: (d, n) => heat(d, 2, n),
    'rows[].cells': (d, n) => heat(d, n, 2),
    highlights: (d, n) => Object.assign(heat(d, 6, 6), { highlights: range(n).map(i => ({ row: Math.floor(i / 6), column: i % 6 })) }),
  },
  matrix: {
    columns: (d, n) => Object.assign(d, n > 5 ? teaching(d, n, 2) : grid(n, 2)),
    rows: (d, n) => Object.assign(d, n > 6 ? teaching(d, 2, n) : grid(2, n)),
    'rows[].cells': (d, n) => Object.assign(d, n > 5 ? teaching(d, n, 2) : grid(n, 2)),
    'emphasis.rows': (d, n) => Object.assign(teaching(d, 2, Math.max(n, 2)), { emphasis: { rows: range(n).map(i => `r${i}`) } }),
    'emphasis.columns': (d, n) => Object.assign(teaching(d, Math.max(n, 2), 2), { emphasis: { columns: range(n) } }),
    'emphasis.cells': (d, n) => Object.assign(teaching(d, 8, 12), { emphasis: { cells: cellRefs(n) } }),
    states: (d, n) => Object.assign(teaching(d, 8, 12), { states: cellRefs(n).map(cell => ({ ...cell, state: 'missing' })) }),
  },
  flow: {
    nodes: (d, n) => Object.assign(d, chain(n)),
    edges: (d, n) => Object.assign(d, n <= 1 ? { ...chain(2), edges: chain(2).edges.slice(0, n) } : { ...fan(), edges: [...fan().edges, ...range(n - 20).map(() => ({ from: 'n2', to: 'n3' }))].slice(0, n) }),
    'nodes[].tensor.values': (d, n) => Object.assign(d, { nodes: d.nodes.map((node, i) => i ? node : { ...node, tensor: { rows: 1, columns: Math.max(n, 1), dimensions: '1 by n', values: range(n) } }) }),
    'highlightPath|0': (d, n) => Object.assign(d, chain(Math.min(Math.max(n, 2), 12)), { highlightPath: range(n).map(i => `n${i}`) }),
    'highlightPath|1': (d, n) => { const { nodes, edges, paths } = pair(4); return Object.assign(d, { nodes, edges, highlightPath: range(n).map(i => paths[i % 2]) }); },
    'highlightPath|1[]': (d, n) => {
      const { nodes, edges, paths } = pair(Math.min(Math.max(n, 4), 12));
      return Object.assign(d, { nodes, edges, highlightPath: [range(n).map(i => paths[0][i] ?? `x${i}`), paths[1]] });
    },
  },
};
const UNREACHABLE = new Set(['flow|highlightPath|1[]|min']); // two routes of two nodes cannot both end at one terminal and meet at a merge: that is a rule between fields.
const listCases = FITTED.flatMap(kind => kindLimits(kind).filter(entry => entry.type === 'list').map(entry => [kind, entry]));

test('the six fitted kinds are the ones TutorDiagram.js fits', () => {
  const source = readFileSync(new URL('./TutorDiagram.js', import.meta.url), 'utf8');
  const named = [...source.match(/const FITTED_KINDS = new Set\(\[([^\]]*)\]\)/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual([...named].sort(), [...FITTED].sort());
});

test('kindLimits lists every kind of the parser, caches its table and refuses an unknown kind', () => {
  const kinds = tutorDiagramSchema.shape.diagram.options.map(option => option.shape.kind.value);
  assert.deepEqual(kindLimitKinds(), kinds);
  for (const kind of kinds) { assert.ok(kindLimits(kind).length > 0, kind); assert.equal(kindLimits(kind), kindLimits(kind)); }
  assert.throws(() => kindLimits('no-such-kind'), /unknown kind/);
});

test('the table keeps alternative shapes apart', () => {
  const at = (kind, path) => kindLimits(kind).find(entry => entry.path === path);
  assert.ok(at('bar-chart', 'bars').optional && at('bar-chart', 'categories').optional && at('bar-chart', 'series').optional, 'bars, or categories with series: each optional alone');
  assert.ok(at('coordinate-plot', 'series[].points').optional && at('coordinate-plot', 'series[].samples|0').optional, 'points or samples');
  assert.equal(at('flow', 'edges').min, 1);
  assert.equal(at('flow', 'title').counts, 'shownLength');
  assert.equal(shownLength('$\\frac{a}{b}$'), 3);
});

for (const [kind, entry] of listCases) {
  test(`${kind} list ${entry.path}: ${entry.min} to ${entry.max} items`, () => {
    const make = LISTS[kind]?.[entry.path];
    assert.ok(make, `no list builder for ${kind} ${entry.path}: add one (a new list field must be tested)`);
    const build = n => make(baseOf(kind), n);
    for (const [bound, n] of [['max', entry.max], ['min', entry.min]]) {
      if (UNREACHABLE.has(`${kind}|${entry.path}|${bound}`)) { assert.ok(!refusedAt(build(n)).some(key => key === entry.path), `${bound} should not be refused at ${entry.path}`); continue; }
      parses(build(n), `${entry.path} with ${n} items (${bound})`);
    }
    refuses(build(entry.max + 1), entry.path, `${entry.path} with ${entry.max + 1} items`);
    if (entry.min > 0) refuses(build(entry.min - 1), entry.path, `${entry.path} with ${entry.min - 1} items`);
  });
}

// ---- text fields ----
const TEMPLATES = {
  point: { kind: 'point', label: 'p', x: 1, y: 1 },
  segment: { kind: 'segment', label: 's', from: { x: 1, y: 1 }, to: { x: 2, y: 2 } },
  vector: { kind: 'vector', label: 'v', from: { x: 1, y: 1 }, to: { x: 2, y: 2 } },
  'reference-line': { kind: 'reference-line', label: 'r', axis: 'x', value: 1 },
  rectangle: { kind: 'rectangle', label: 'r', xMin: 1, xMax: 2, yMin: 1, yMax: 2 },
  polygon: { kind: 'polygon', label: 'p', points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] },
  circle: { kind: 'circle', label: 'c', center: { x: 4, y: 4 }, radius: 1 },
  ellipse: { kind: 'ellipse', label: 'e', center: { x: 4, y: 4 }, radiusX: 1, radiusY: 1 },
  band: { kind: 'band', label: 'b', axis: 'x', from: 1, to: 2 },
};
const ABSENT = { 'nodes[].tensor': () => ({ rows: 1, columns: 1, dimensions: '1' }) }; // an optional group the base does not carry
function place(node, segments, value, walked = '') {
  const [segment, ...rest] = segments, key = segment.replace(/\[\]$/, ''), list = segment.endsWith('[]'), here = walked ? `${walked}.${segment}` : segment;
  if (!rest.length) { if (list) node[key][0] = value; else node[key] = value; return; }
  if (node[key] === undefined) node[key] = list ? [ABSENT[here]()] : ABSENT[here]();
  place(list ? node[key][0] : node[key], rest, value, here);
}
function withText(kind, path, value) {
  const diagram = baseOf(kind), variant = path.match(/^annotations\[\]\{([^}]+)\}\.(.+)$/);
  if (kind === 'bar-chart' && /^(categories|series)/.test(path)) barCategories(diagram, 2, 2); // the other bar shape: categories with series
  if (variant) { diagram.annotations = [structuredClone(TEMPLATES[variant[1]])]; place(diagram.annotations[0], variant[2].split('.'), value); }
  else place(diagram, path.split('.'), value);
  return diagram;
}
const textCases = FITTED.flatMap(kind => kindLimits(kind).filter(entry => entry.type === 'text').map(entry => [kind, entry]));
for (const [kind, entry] of textCases) {
  test(`${kind} text ${entry.path}: ${entry.max} shown characters`, () => {
    assert.equal(entry.counts, 'shownLength');
    parses(withText(kind, entry.path, 'a'.repeat(entry.max)), `${entry.path} of ${entry.max} characters`);
    refuses(withText(kind, entry.path, 'a'.repeat(entry.max + 1)), entry.path, `${entry.path} of ${entry.max + 1} characters`);
  });
}

test('a text limit counts shown characters: a formula\'s delimiters are free, not the schema\'s own twofold bound', () => {
  const title = kindLimits('bar-chart').find(entry => entry.path === 'title').max;
  parses({ ...baseOf('bar-chart'), title: `$${'x'.repeat(title)}$` }, 'a formula of exactly the limit shown');
  refuses({ ...baseOf('bar-chart'), title: `$${'x'.repeat(title + 1)}$` }, 'title', 'a formula one shown character over');
});

// ---- the registry: every text() schema the parser uses is recorded, with the raw bound zod holds at twice the limit ----
function strings(schema, found = new Set(), seen = new Set()) {
  if (!schema || seen.has(schema)) return found;
  seen.add(schema);
  const def = schema._zod.def;
  if (def.type === 'string') found.add(schema);
  for (const key of ['innerType', 'element', 'in', 'out']) if (def[key]) strings(def[key], found, seen);
  if (def.getter) strings(def.getter(), found, seen);
  for (const child of Object.values(def.shape ?? {})) strings(child, found, seen);
  for (const child of def.options ?? []) strings(child, found, seen);
  return found;
}
test('every text() schema of every kind is in the registry', () => {
  const found = [...strings(tutorDiagramSchema.shape.diagram)];
  const texts = found.filter(schema => (schema._zod.def.checks ?? []).some(check => check._zod.def.check === 'custom'));
  assert.ok(texts.length > 0, 'the walk found no text schema');
  const missing = texts.filter(schema => !textLimits.has(schema));
  assert.equal(missing.length, 0, `${missing.length} text schemas carry the shown-length check but are not registered`);
  for (const schema of texts) {
    const raw = (schema._zod.def.checks).find(check => check._zod.def.check === 'max_length')._zod.def.maximum;
    assert.equal(raw, 2 * textLimits.get(schema), 'the raw bound is twice the shown limit');
  }
  const ids = found.filter(schema => !textLimits.has(schema));
  assert.ok(ids.length > 0 && ids.every(schema => (schema._zod.def.checks ?? []).every(check => check._zod.def.check !== 'custom')), 'strings outside the registry are ids and patterns, not text');
});
