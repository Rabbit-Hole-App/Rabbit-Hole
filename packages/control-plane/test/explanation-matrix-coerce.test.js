// Release 118 follow-up (Q0, reviewer/owner): deterministic coercion of the matrix / heatmap schema slip. A column given as an object becomes its own text (heading, label, text, title); a teaching-layout
// row with no id gets one from its heading; ids on the rows of a plain matrix are removed. Applies only when the whole diagram then validates. Real failing specs: figure-chapters 02 (cards 12, 27, 28:
// results.jsonl raw[0] of the run 2026-11-09T133813-figchap02-armr) and the demo card 03 gini-split (run 5 of 2026-11-09T115809-gini-split-x5-variance-b). Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctDiagrams, markdownVisuals } from '../src/learn-primitives.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

const CARD_12 = {"version":1,"diagram":{"title":"Which BERT positions does each task head read?","caption":"The same reading layers return a vector for every position. Different tasks read different positions.","kind":"matrix","columns":["Positions read","Toy output"],"rows":[{"id":"r1","heading":"Classify a sentence","cells":["CLS state","Wildlife"]},{"id":"r2","heading":"Classify a pair","cells":["CLS state for the pair","Both describe animals"]},{"id":"r3","heading":"Tag each word","cells":["One state per token","seal is a noun"]},{"id":"r4","heading":"Find an answer span","cells":["Start and end scores per token","a seal"]}]}}; // ids r1..r4 on the rows of a matrix with no teaching layout: 'Select layout teaching for stable row IDs'
const CARD_27 = {"version":1,"diagram":{"title":"Forward diffusion with known noise","caption":"Each cell combines part of the clean value with part of the known noise. The noise is kept as the target.","kind":"heatmap","columns":[{"heading":"Clean","items":["0.8","0.2","0.2","0.8"]},{"heading":"Sampled noise","items":["-0.5","0.5","-0.25","0.25"]},{"heading":"Noisy result","items":["0.34","0.46","0.01","0.79"]}]}}; // heatmap, columns are {heading, items}, no rows, no range
const CARD_28 = {"version":1,"diagram":{"title":"Paired image-caption training examples","caption":"Each pattern has a short description. When pairing the examples, keep the matching row identities.","kind":"matrix","columns":[{"heading":"Original toy pattern","items":["Diagonal lights","Lower-left light"]},{"heading":"Associated caption","items":["two bright corners","lower left light"]}]}}; // matrix, columns are {heading, items}, no rows
const GINI_03 = {"version":1,"diagram":{"title":"Gini after the root split","caption":"Worked example. Combine the child Ginis in proportion to their sizes.","kind":"matrix","columns":[{"heading":"Class 0","items":["4","1","—"]},{"heading":"Class 1","items":["0","3","—"]},{"heading":"Gini","items":["0","0.375","0.1875"]},{"heading":"Weight","items":["0.5","0.5","1"]}]}}; // demo card 03, matrix: columns are {heading, items}, no rows

const TICKS = String.fromCharCode(96).repeat(3);
const fence = spec => `${TICKS}rh-diagram\n${JSON.stringify(spec)}\n${TICKS}`;
const body = spec => `Intro text before the diagram.\n\n${fence(spec)}\n\nClosing text after it.`;
const specOf = md => JSON.parse(md.split('\n').find(line => line.startsWith('{"version"')));
const valid = spec => { try { parseTutorDiagram(spec); return true; } catch { return false; } };
const issues = spec => { try { parseTutorDiagram(spec); return []; } catch (e) { return e.issues.map(i => `${i.path.join('.')}: ${i.message}`); } };
const capture = t => { const lines = [], { log } = console; console.log = l => lines.push(l); t.after(() => { console.log = log; }); return () => lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e?.event === 'explanation_matrix_coerced'); };
const matrix = (columns, rows, extra = {}) => ({ version: 1, diagram: { kind: 'matrix', title: 'T', columns, ...(rows ? { rows } : {}), ...extra } });

test('card 12 (figure-chapters 02): the old code reports the row ids, the new code removes them from the plain matrix and keeps every heading, cell and column', t => {
  const events = capture(t);
  assert.ok(!valid(CARD_12) && issues(CARD_12).every(i => /Select layout teaching for stable row IDs/.test(i)), 'the old code: the spec is refused for the ids');
  const out = correctDiagrams(body(CARD_12));
  assert.deepEqual(out.corrections, { matrix_coerced: 1 });
  const fixed = specOf(out.md);
  assert.ok(valid(fixed));
  assert.deepEqual(fixed.diagram.columns, CARD_12.diagram.columns);
  assert.deepEqual(fixed.diagram.rows.map(({ heading, cells }) => ({ heading, cells })), CARD_12.diagram.rows.map(({ heading, cells }) => ({ heading, cells })));
  assert.ok(fixed.diagram.rows.every(row => !('id' in row)));
  assert.deepEqual([fixed.diagram.title, fixed.diagram.caption], [CARD_12.diagram.title, CARD_12.diagram.caption]);
  assert.deepEqual(events(), [{ event: 'explanation_matrix_coerced', action: 'coerced', diagram: 'matrix', columnsCoerced: 0, rowsFromColumns: 0, rangeDerived: null, rowIdsAdded: 0, rowIdsDropped: 4 }]);
});

test('card 27 (heatmap, columns are {heading, items}, no rows) and the logistic confusion matrix: no labels for the items, so nothing is transposed and no Item 1, Item 2 is invented (release 126)', t => {
  const events = capture(t);
  assert.ok(!valid(CARD_27));
  const md27 = body(CARD_27);
  assert.equal(correctDiagrams(md27).md, md27, 'left for the one repair');
  assert.ok(!/Item \d/.test(correctDiagrams(md27).md));
  // The shape the model wrote for logistic card 11 (pack run 2026-11-12T232359): columns {heading, items}, the items unlabeled.
  const card11 = { version: 1, diagram: { title: 'Thresholded predictions', caption: '8 cases at t=0.5.', kind: 'matrix', columns: [{ heading: 'Predicted positive', items: ['TP 3', 'FP 1'] }, { heading: 'Predicted negative', items: ['FN 1', 'TN 3'] }, { heading: 'Actual total', items: ['4', '4'] }] } };
  const md11 = body(card11);
  const out = correctDiagrams(md11);
  assert.equal(out.md, md11);
  assert.ok(!out.corrections?.matrix_coerced);
  assert.deepEqual(events().map(e => [e.action, /Item 1, Item 2 is never invented/.test(e.reason)]), [['left', true], ['left', true], ['left', true]]);
});

test('with the labels the author gave (as many row headings as items) the transposition keeps them: the confusion matrix reads Actually positive / Actually negative across, never Item 1, Item 2', t => {
  const events = capture(t);
  const labelled = { version: 1, diagram: { title: 'Thresholded predictions', caption: '8 cases at t=0.5.', kind: 'matrix',
    columns: [{ heading: 'Predicted positive', items: ['TP 3', 'FP 1'] }, { heading: 'Predicted negative', items: ['FN 1', 'TN 3'] }, { heading: 'Actual total', items: ['4', '4'] }],
    rows: [{ heading: 'Actually positive' }, { heading: 'Actually negative' }] } };
  const fixed = specOf(correctDiagrams(body(labelled)).md);
  assert.ok(valid(fixed));
  assert.deepEqual(fixed.diagram.columns, ['Actually positive', 'Actually negative']);
  assert.deepEqual(fixed.diagram.rows.map(r => [r.heading, ...r.cells]), [['Predicted positive', 'TP 3', 'FP 1'], ['Predicted negative', 'FN 1', 'TN 3'], ['Actual total', '4', '4']]);
  assert.ok(!JSON.stringify(fixed).includes('Item '));
  assert.deepEqual(events().map(e => [e.action, e.rowsFromColumns]), [['transposed', 3]]);
});

test('card 28 and the demo card 03 gini-split (matrix, columns are {heading, items}, no rows): left for the repair, every column and item untouched, no Item n', t => {
  const events = capture(t);
  for (const [name, spec] of [['28', CARD_28], ['03', GINI_03]]) {
    assert.ok(!valid(spec), name);
    const md = body(spec);
    assert.equal(correctDiagrams(md).md, md, `card ${name} is left as the author wrote it`);
  }
  assert.deepEqual(events().map(e => [e.diagram, e.action]), [['matrix', 'left'], ['matrix', 'left']]);
});

test('former row headings become the column headings when there are as many as items; a heatmap keeps the author\'s own range', t => {
  capture(t);
  const withRows = specOf(correctDiagrams(body(matrix([{ heading: 'Precision', items: ['0.8', '0.6'] }, { heading: 'Recall', items: ['0.7', '0.9'] }], [{ heading: 'Model A' }, { heading: 'Model B' }]))).md);
  assert.deepEqual(withRows.diagram.columns, ['Model A', 'Model B']);
  assert.deepEqual(withRows.diagram.rows, [{ heading: 'Precision', cells: ['0.8', '0.6'] }, { heading: 'Recall', cells: ['0.7', '0.9'] }]);
  const heat = specOf(correctDiagrams(body({ version: 1, diagram: { kind: 'heatmap', title: 'H', columns: [{ label: 'a', cells: [1, 2] }, { label: 'b', cells: [3, null] }], rows: [{ label: 'x' }, { label: 'y' }], range: { min: 0, max: 10 } } })).md);
  assert.deepEqual([heat.diagram.range, heat.diagram.rows.map(r => r.cells)], [{ min: 0, max: 10 }, [[1, 2], [3, null]]]);
});

test('object columns without lists become their text: heading wins over label, text and title (and a heatmap too)', t => {
  const events = capture(t);
  const m = specOf(correctDiagrams(body(matrix([{ heading: 'H', label: 'L', text: 'X', title: 'Y' }, { label: 'L2', text: 'X' }, { text: 'T3' }, { title: 'Y4' }], [{ heading: 'a', cells: ['1', '2', '3', '4'] }, { heading: 'b', cells: ['5', '6', '7', '8'] }]))).md);
  assert.deepEqual(m.diagram.columns, ['H', 'L2', 'T3', 'Y4']);
  const h = specOf(correctDiagrams(body({ version: 1, diagram: { kind: 'heatmap', title: 'N', columns: [{ heading: 'Clean' }, { heading: 'Noise' }], rows: [{ label: 'r1', cells: [0.8, 0.2] }, { label: 'r2', cells: [0.1, 0.4] }], range: { min: 0, max: 1 } } })).md);
  assert.deepEqual(h.diagram.columns, ['Clean', 'Noise']);
  assert.deepEqual(events().map(e => [e.action, e.columnsCoerced]), [['coerced', 4], ['coerced', 2]]);
});

test('anything else is left for the repair and logged with its reason: unequal lists, a heatmap with non-numeric cells, an object with no text, lists mixed with plain columns, rows with cells of their own', t => {
  const events = capture(t);
  const cases = [
    ['column lists of different lengths', matrix([{ heading: 'a', items: ['1', '2'] }, { heading: 'b', items: ['1', '2', '3'] }])],
    ['heatmap cells are not numeric', { version: 1, diagram: { kind: 'heatmap', title: 'H', columns: [{ heading: 'a', items: ['low', 'high'] }, { heading: 'b', items: ['1', '2'] }], rows: [{ label: 'x' }, { label: 'y' }] } }],
    ['a column object with no heading, label, text or title', matrix([{ items: ['1', '2'] }, { heading: 'b', items: ['1', '2'] }])],
    ['column lists mixed with other columns', matrix([{ heading: 'a', items: ['1', '2'] }, 'Plain'])],
    ['rows with cells of their own beside the column lists', matrix([{ heading: 'a', items: ['1', '2'] }, { heading: 'b', items: ['3', '4'] }], [{ heading: 'x', cells: ['1', '2'] }, { heading: 'y', cells: ['3', '4'] }])],
  ];
  for (const [, spec] of cases) { const md = body(spec); assert.equal(correctDiagrams(md).md, md); }
  assert.deepEqual(events().map(e => [e.action, e.reason]), cases.map(([reason]) => ['left', reason]));
});

test('a coercion that does not make the whole diagram valid is not applied (logged as left)', t => {
  const events = capture(t);
  const long = matrix([{ heading: 'a', items: ['1'] }, { heading: 'b', items: ['2'] }], [{ heading: 'x' }]); // one item each: the transposed matrix would have a single column
  const md = body(long);
  assert.equal(correctDiagrams(md).md, md);
  const [event] = events();
  assert.equal(event.action, 'left');
  assert.match(event.reason, /does not validate after the coercion: diagram\.columns/);
});

test('a teaching matrix whose rows have no id gets unique ids from the headings; a plain matrix with states keeps the ids it was given', t => {
  const events = capture(t);
  const teaching = matrix([{ heading: 'A' }, { heading: 'B' }], [{ heading: 'Same name', cells: ['1', '2'] }, { heading: 'Same name', cells: ['3', '4'] }, { heading: 'Third', cells: ['5', '6'] }], { layout: 'teaching' });
  const fixed = specOf(correctDiagrams(body(teaching)).md);
  assert.ok(valid(fixed));
  assert.deepEqual(fixed.diagram.rows.map(r => r.id), ['same-name', 'same-name-2', 'third']);
  assert.deepEqual(events().map(e => [e.columnsCoerced, e.rowIdsAdded, e.rowIdsDropped]), [[2, 3, 0]]);
  const withStates = matrix(['A', 'B'], [{ id: 'r1', heading: 'x', cells: ['1', '2'] }, { id: 'r2', heading: 'y', cells: ['3', '4'] }], { states: [{ row: 'r1', column: 0, state: 'changed' }] });
  const md = body(withStates);
  assert.equal(correctDiagrams(md).md, md, 'ids that something refers to are never removed (and the rest of that diagram is the repair\'s)');
});

test('idempotent and inert: a second pass changes nothing, and a valid matrix or other diagram is untouched with no event', t => {
  const events = capture(t);
  for (const spec of [CARD_12, CARD_27, CARD_28]) { const once = correctDiagrams(body(spec)).md; assert.equal(correctDiagrams(once).md, once); }
  assert.equal(events().length, 5, 'card 12 coerced once; cards 27 and 28 are left (no labels for the items) and logged again on the second pass');
  const ok = matrix(['A', 'B'], [{ heading: 'x', cells: ['1', '2'] }, { heading: 'y', cells: ['3', '4'] }]);
  const cycle = { version: 1, diagram: { kind: 'cycle', title: 'Loop', steps: ['Plan', 'Do', 'Check'] } };
  for (const spec of [ok, cycle]) { const md = body(spec); assert.equal(correctDiagrams(md).md, md); assert.equal(markdownVisuals(md).diagrams.length, 1); }
  assert.equal(events().length, 5, 'no new event');
});
