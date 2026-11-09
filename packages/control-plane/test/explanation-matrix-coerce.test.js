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
  assert.deepEqual(events(), [{ event: 'explanation_matrix_coerced', diagram: 'matrix', columnsCoerced: 0, rowIdsAdded: 0, rowIdsDropped: 4 }]);
});

test('cards 27, 28 and the demo card 03: the object columns are read as text, but a diagram that still has no rows (or no range) is NOT changed and goes to the repair as before', t => {
  const events = capture(t);
  for (const [name, spec, remaining] of [['27', CARD_27, ['diagram.rows', 'diagram.range']], ['28', CARD_28, ['diagram.rows']], ['03', GINI_03, ['diagram.rows']]]) {
    const md = body(spec), out = correctDiagrams(md);
    assert.equal(out.md, md, `card ${name}: unchanged`);
    assert.deepEqual(out.corrections, {});
    const asText = { ...spec, diagram: { ...spec.diagram, columns: spec.diagram.columns.map(c => c.heading) } };
    assert.deepEqual(issues(asText).map(i => i.split(':')[0]), remaining, `card ${name}: with the columns as text only the missing fields remain`);
  }
  assert.deepEqual(events(), []);
});

test('a matrix and a heatmap whose columns are objects, and whose rows are otherwise complete, validate after the coercion and keep their content', t => {
  const events = capture(t);
  const matrix = { version: 1, diagram: { kind: 'matrix', title: 'Pairs', columns: [{ heading: 'Image' }, { label: 'Caption' }, { text: 'Match' }, { title: 'Score', items: ['x'] }], rows: [{ heading: 'one', cells: ['a', 'b', 'c', 'd'] }, { heading: 'two', cells: ['e', 'f', 'g', 'h'] }] } };
  const heat = { version: 1, diagram: { kind: 'heatmap', title: 'Noise', columns: [{ heading: 'Clean' }, { heading: 'Noise' }], rows: [{ label: 'r1', cells: [0.8, 0.2] }, { label: 'r2', cells: [0.1, 0.4] }], range: { min: 0, max: 1 } } };
  assert.ok(!valid(matrix) && !valid(heat));
  const m = specOf(correctDiagrams(body(matrix)).md), h = specOf(correctDiagrams(body(heat)).md);
  assert.deepEqual(m.diagram.columns, ['Image', 'Caption', 'Match', 'Score']);
  assert.deepEqual(h.diagram.columns, ['Clean', 'Noise']);
  assert.ok(valid(m) && valid(h));
  assert.deepEqual(m.diagram.rows, matrix.diagram.rows);
  assert.deepEqual(h.diagram.rows, heat.diagram.rows);
  assert.deepEqual(events().map(({ diagram, columnsCoerced }) => [diagram, columnsCoerced]), [['matrix', 4], ['heatmap', 2]]);
});

test('heading wins over label, text and title; an object with none of them is left as it is (the diagram fails exactly as before)', t => {
  capture(t);
  const make = columns => ({ version: 1, diagram: { kind: 'matrix', title: 'T', columns, rows: [{ heading: 'a', cells: ['1', '2'] }, { heading: 'b', cells: ['3', '4'] }] } });
  const first = specOf(correctDiagrams(body(make([{ heading: 'H', label: 'L', text: 'X', title: 'Y' }, { label: 'L2', text: 'X' }]))).md);
  assert.deepEqual(first.diagram.columns, ['H', 'L2']);
  const none = body(make([{ items: ['1'] }, 'Plain']));
  assert.equal(correctDiagrams(none).md, none);
});

test('a teaching matrix whose rows have no id gets unique ids from the headings; a plain matrix with states keeps the ids it was given', t => {
  const events = capture(t);
  const teaching = { version: 1, diagram: { kind: 'matrix', layout: 'teaching', title: 'T', columns: [{ heading: 'A' }, { heading: 'B' }], rows: [{ heading: 'Same name', cells: ['1', '2'] }, { heading: 'Same name', cells: ['3', '4'] }, { heading: 'Third', cells: ['5', '6'] }] } };
  const fixed = specOf(correctDiagrams(body(teaching)).md);
  assert.ok(valid(fixed));
  assert.deepEqual(fixed.diagram.rows.map(r => r.id), ['same-name', 'same-name-2', 'third']);
  assert.deepEqual(events().map(e => [e.columnsCoerced, e.rowIdsAdded, e.rowIdsDropped]), [[2, 3, 0]]);
  const withStates = { version: 1, diagram: { kind: 'matrix', title: 'T', columns: [{ heading: 'A' }, { heading: 'B' }], rows: [{ id: 'r1', heading: 'x', cells: ['1', '2'] }, { id: 'r2', heading: 'y', cells: ['3', '4'] }], states: [{ row: 'r1', column: 0, state: 'changed' }] } };
  const md = body(withStates);
  assert.equal(correctDiagrams(md).md, md, 'ids that something refers to are never removed (and the rest of that diagram is the repair\'s)');
});

test('idempotent and inert: a second pass changes nothing, and a valid matrix or other diagram is untouched with no event', t => {
  const events = capture(t);
  const once = correctDiagrams(body(CARD_12)).md;
  assert.equal(correctDiagrams(once).md, once);
  assert.equal(events().length, 1);
  const ok = { version: 1, diagram: { kind: 'matrix', title: 'T', columns: ['A', 'B'], rows: [{ heading: 'x', cells: ['1', '2'] }, { heading: 'y', cells: ['3', '4'] }] } };
  const cycle = { version: 1, diagram: { kind: 'cycle', title: 'Loop', steps: ['Plan', 'Do', 'Check'] } };
  for (const spec of [ok, cycle]) { const md = body(spec); assert.equal(correctDiagrams(md).md, md); assert.equal(markdownVisuals(md).diagrams.length, 1); }
  assert.equal(events().length, 1, 'no new event');
});
