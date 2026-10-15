// The canvas document in Chat's whole-canvas context (BlockNote-on-Canvas MVP, brief section 12): docText over the native
// BlockNote JSON, the one document object boardObjects adds, its own excerpt share in buildCanvasContext (never the reserve
// or the rest of the canvas's room), honest coverage, and the server's validator and prompt text on what the builder sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docText } from './doc-text.js';
import { boardObjects, buildCanvasContext, CANVAS } from './inline-ai-context.js';
import { CANVAS_BUDGET, canvasContextText, validateCanvasContext } from '../../control-plane/src/canvas-context.js';

const t = (text, styles = {}) => ({ type: 'text', text, styles });
const block = (type, content = [], props = {}, children = []) => ({ id: `b-${Math.random().toString(36).slice(2, 8)}`, type, props, content, children });

test('docText: every MVP block type, nesting, links, tables and code, deterministically', () => {
  const blocks = [
    block('heading', [t('Plan')], { level: 2 }),
    block('paragraph', [t('Read '), t('this', { bold: true }), t(' and '), { type: 'link', href: 'https://example.com/a', content: [t('the guide')] }, t('.')]),
    block('bulletListItem', [t('first')], {}, [block('bulletListItem', [t('nested')])]),
    block('numberedListItem', [t('one')]), block('numberedListItem', [t('two')]),
    block('paragraph', [t('break')]),
    block('numberedListItem', [t('again')]),
    block('checkListItem', [t('done')], { checked: true }), block('checkListItem', [t('todo')], { checked: false }),
    block('quote', [t('quoted')]),
    block('codeBlock', [t('const a = 1;\nreturn a;')], { language: 'javascript' }),
    block('divider'),
    { id: 'tb', type: 'table', props: {}, content: { type: 'tableContent', columnWidths: [], rows: [
      { cells: [[t('h1')], [t('h2')]] },
      { cells: [{ type: 'tableCell', props: {}, content: [t('c1')] }, { type: 'tableCell', props: {}, content: [t('c2')] }] },
    ] }, children: [] },
    block('paragraph', []),
  ];
  assert.equal(docText(blocks), [
    '## Plan', 'Read this and the guide (https://example.com/a).', '- first', '  - nested', '1. one', '2. two', 'break', '1. again',
    '[x] done', '[ ] todo', '> quoted', '```javascript', 'const a = 1;', 'return a;', '```', '---', '| h1 | h2 |', '| c1 | c2 |',
  ].join('\n'));
  assert.equal(docText(blocks), docText(JSON.parse(JSON.stringify(blocks))), 'deterministic');
  assert.equal(docText([block('paragraph', [])]), '', 'a new, empty document has no words');
  assert.equal(docText(undefined), '');
});

const board = (doc, extra = {}) => ({ blocks: [], shapes: [], items: [], links: [], strokes: [], groups: [], ...(doc ? { doc } : {}), ...extra });
const doc = blocks => ({ v: 1, x: 0, y: 0, w: 760, blocks });

test('boardObjects: one document object when the document has words, none when absent or empty', () => {
  assert.equal(boardObjects(board(null)).objects.some(o => o.type === 'document'), false, 'an old board without a document');
  assert.equal(boardObjects(board(doc([block('paragraph', [])]))).objects.some(o => o.type === 'document'), false, 'an empty document adds nothing');
  const objects = boardObjects(board(doc([block('heading', [t('Tides')], { level: 1 }), block('paragraph', [t('The moon pulls the sea.')])]))).objects.filter(o => o.type === 'document');
  assert.deepEqual(objects.map(({ id, type, text, label }) => ({ id, type, text, label })), [{ id: 'doc', type: 'document', text: '# Tides\nThe moon pulls the sea.', label: 'Tides' }]);
});

// A 200-block document (headings, paragraphs, lists) with one deep sentence about the request, beside ordinary cards.
const longDoc = () => doc(Array.from({ length: 200 }, (_, i) => (i === 150
  ? block('paragraph', [t('The perihelion of the comet falls in March and its tail points away from the sun.')])
  : i % 20 === 0 ? block('heading', [t(`Section ${i / 20 + 1}`)], { level: 2 })
    : i % 3 ? block('paragraph', [t(`Paragraph ${i} keeps notes on rivers, mountains and the weather of the valley, line ${i}.`)])
      : block('bulletListItem', [t(`Point ${i} about the valley`)]))));
const cards = Array.from({ length: 12 }, (_, i) => ({ id: `card-${i}`, type: 'note', title: `Card ${i}`, text: `Card ${i} explains orbits and gravity in some detail, again and again, sentence ${i}. `.repeat(8) }));
const pack = (withDoc, request = 'When is the perihelion of the comet?') => {
  const { objects, connectors, groups } = boardObjects(board(withDoc ? longDoc() : null, { blocks: cards }));
  return buildCanvasContext({ objects, connectors, groups, title: 'Valley', request });
};

test('a 200-block document is bounded, its own share, marked partial, with the passage the request asks about', () => {
  const p = pack(true), d = p.excerpts.find(e => e.id === 'doc'), whole = docText(longDoc().blocks);
  assert.ok(d, 'the document is sent');
  assert.equal(d.type, 'document');
  assert.equal(d.inclusion, 'partial');
  assert.ok(d.text.length <= CANVAS.document && d.omitted_chars === whole.length - p.excerpts.find(e => e.id === 'doc').passages.reduce((n, s) => n + s.end - s.start, 0));
  assert.ok(d.passages.length <= CANVAS.passages, `at most ${CANVAS.passages} passages (${d.passages.length})`);
  assert.ok(d.text.startsWith('## Section 1'), 'it opens with the start of the document');
  assert.match(d.text, /perihelion of the comet falls in March/, 'and carries the passage that shares the request terms');
  const status = p.coverage.items.find(s => s.id === 'doc');
  assert.equal(status.status, 'partial');
  assert.match(p.coverage.summary, /document partial: \d+ of \d+ characters/);
  assert.doesNotMatch(p.coverage.summary, /document in full/);
});

test('the document never takes the reserve or the room of the rest of the canvas', () => {
  const without = pack(false), withDoc = pack(true);
  const labels = q => q.inventory.items.filter(it => it.id !== 'doc').map(it => it.label);
  assert.deepEqual(labels(withDoc), labels(without), 'every other object keeps its label');
  assert.equal(withDoc.inventory.omitted_items, without.inventory.omitted_items);
  const others = q => q.excerpts.filter(e => e.id !== 'doc').reduce((n, e) => n + e.text.length, 0);
  const room = CANVAS_BUDGET - withDoc.coverage.reserved_chars;
  assert.ok(others(withDoc) >= Math.min(others(without), Math.floor(room / 2)) - CANVAS.minPassage, `the other objects keep at least half the excerpt room (${others(withDoc)} of ${room})`);
  assert.ok(withDoc.excerpts.find(e => e.id === 'doc').text.length <= Math.floor(room / 2), 'the document takes at most half of it');
});

test('a short document goes in full; the server accepts the package and names the document in the prompt', () => {
  const { objects, connectors, groups } = boardObjects(board(doc([block('heading', [t('Tides')], { level: 1 }), block('paragraph', [t('The moon pulls the sea twice a day.')])]), { blocks: cards.slice(0, 2) }));
  const p = buildCanvasContext({ objects, connectors, groups, title: 'Sea', request: 'What pulls the sea?' });
  assert.equal(p.coverage.items.find(s => s.id === 'doc').status, 'full');
  assert.match(p.coverage.summary, /document in full/);
  const server = validateCanvasContext(JSON.parse(JSON.stringify(p)));
  assert.equal(server.excerpts.find(e => e.id === 'doc').inclusion, 'full');
  assert.match(canvasContextText(server), /- doc document \(the canvas's written document; in full\): # Tides\nThe moon pulls the sea twice a day\./);
  const long = validateCanvasContext(JSON.parse(JSON.stringify(pack(true))));
  assert.equal(long.excerpts.find(e => e.id === 'doc').inclusion, 'partial', 'the server keeps a partial document partial');
  assert.match(canvasContextText(long), /- doc document \(the canvas's written document; partial; \d+ characters not included; passages at characters/);
});

test('an excerpt never carries more passages than the server takes', () => {
  // Many short lines that all share the request's term: the passage cap holds whatever is picked.
  const lines = Array.from({ length: 400 }, (_, i) => (i % 2 ? `comet ${i}` : `x${'y'.repeat(30)} ${i}`)).join('\n');
  const { objects } = boardObjects(board(doc(lines.split('\n').map(line => block('paragraph', [t(line)])))));
  const p = buildCanvasContext({ objects, request: 'comet' });
  const d = p.excerpts.find(e => e.id === 'doc');
  assert.ok(d.passages.length <= CANVAS.passages);
  assert.doesNotThrow(() => validateCanvasContext(JSON.parse(JSON.stringify(p))));
});
