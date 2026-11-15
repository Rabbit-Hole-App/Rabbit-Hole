// Documents in Chat's whole-canvas context (BlockNote-on-Canvas MVP, brief section 12; a document is a card since 2026-11-15): docText
// over the native BlockNote JSON, the Document card as one card object in boardObjects, its excerpt in buildCanvasContext like any
// card's, honest coverage, and the server's validator and prompt text on what the builder sends.
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

const board = (extra = {}) => ({ blocks: [], shapes: [], items: [], links: [], strokes: [], groups: [], ...extra });
// A Document card (DocCard.jsx, canvas-doc.js migrateDocToCard): the native blocks on a canvas block of type 'doc'.
const docCard = (blocks, id = 'doc-1') => ({ id, type: 'doc', title: 'Document', dx: 0, dy: 0, blocks });

test('boardObjects: a Document card is one card object carrying its words (the card path; the legacy single document is no longer read)', () => {
  const objects = boardObjects(board({ blocks: [docCard([block('heading', [t('Tides')], { level: 1 }), block('paragraph', [t('The moon pulls the sea.')])])] })).objects;
  assert.deepEqual(objects.map(({ id, type, kind, text, label }) => ({ id, type, kind, text, label })), [{ id: 'doc-1', type: 'card', kind: 'doc', text: '# Tides\nThe moon pulls the sea.', label: 'Document' }]);
  assert.equal(boardObjects(board({ blocks: [docCard([block('paragraph', [])])] })).objects[0].text, '', 'an empty card has no words');
  assert.equal(boardObjects(board({ doc: { v: 1, blocks: [block('paragraph', [t('legacy words')])] } })).objects.length, 0, 'a legacy doc key adds nothing: it is migrated into a card at load');
});

// A 200-block document (headings, paragraphs, lists) with one deep sentence about the request, beside ordinary cards.
const longDoc = () => Array.from({ length: 200 }, (_, i) => (i === 150
  ? block('paragraph', [t('The perihelion of the comet falls in March and its tail points away from the sun.')])
  : i % 20 === 0 ? block('heading', [t(`Section ${i / 20 + 1}`)], { level: 2 })
    : i % 3 ? block('paragraph', [t(`Paragraph ${i} keeps notes on rivers, mountains and the weather of the valley, line ${i}.`)])
      : block('bulletListItem', [t(`Point ${i} about the valley`)])));
const cards = Array.from({ length: 12 }, (_, i) => ({ id: `card-${i}`, type: 'note', title: `Card ${i}`, text: `Card ${i} explains orbits and gravity in some detail, again and again, sentence ${i}. `.repeat(8) }));
const pack = (withDoc, request = 'When is the perihelion of the comet?') => {
  const { objects, connectors, groups } = boardObjects(board({ blocks: [...(withDoc ? [docCard(longDoc())] : []), ...cards] }));
  return buildCanvasContext({ objects, connectors, groups, title: 'Valley', request });
};

test('a 200-block Document card is bounded like any card, marked partial, with the passage the request asks about', () => {
  const p = pack(true), d = p.excerpts.find(e => e.id === 'doc-1');
  assert.ok(d, 'the document card is sent');
  assert.equal(d.inclusion, 'partial');
  assert.ok(d.text.length <= CANVAS.focus, `bounded (${d.text.length})`);
  assert.ok(d.passages.length <= CANVAS.passages, `at most ${CANVAS.passages} passages (${d.passages.length})`);
  assert.match(d.text, /perihelion of the comet falls in March/, 'it carries the passage that shares the request terms');
  assert.equal(p.coverage.items.find(s => s.id === 'doc-1').status, 'partial');
});

test('a short Document card goes in full; the server accepts the package', () => {
  const { objects, connectors, groups } = boardObjects(board({ blocks: [docCard([block('heading', [t('Tides')], { level: 1 }), block('paragraph', [t('The moon pulls the sea twice a day.')])]), ...cards.slice(0, 2)] }));
  const p = buildCanvasContext({ objects, connectors, groups, title: 'Sea', request: 'What pulls the sea?' });
  assert.equal(p.coverage.items.find(s => s.id === 'doc-1').status, 'full');
  const server = validateCanvasContext(JSON.parse(JSON.stringify(p)));
  assert.equal(server.excerpts.find(e => e.id === 'doc-1').inclusion, 'full');
  assert.match(canvasContextText(server), /# Tides\nThe moon pulls the sea twice a day\./);
  const long = validateCanvasContext(JSON.parse(JSON.stringify(pack(true))));
  assert.equal(long.excerpts.find(e => e.id === 'doc-1').inclusion, 'partial', 'the server keeps a partial card partial');
});

test('an excerpt never carries more passages than the server takes', () => {
  // Many short lines that all share the request's term: the passage cap holds whatever is picked.
  const lines = Array.from({ length: 400 }, (_, i) => (i % 2 ? `comet ${i}` : `x${'y'.repeat(30)} ${i}`)).join('\n');
  const { objects } = boardObjects(board({ blocks: [docCard(lines.split('\n').map(line => block('paragraph', [t(line)])))] }));
  const p = buildCanvasContext({ objects, request: 'comet' });
  const d = p.excerpts.find(e => e.id === 'doc-1');
  assert.ok(d.passages.length <= CANVAS.passages);
  assert.doesNotThrow(() => validateCanvasContext(JSON.parse(JSON.stringify(p))));
});
