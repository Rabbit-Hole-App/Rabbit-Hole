// Imported file cards in the turn's context (canvas-file-imports.md section 6; owner spec section 9): the whole-canvas
// inventory lists them by name with what was extracted, never their content; the selected-card description is honest; an
// Auto turn with a file attached goes to the route that reads file refs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardObjects, buildCanvasContext } from './inline-ai-context.js';
import { tutorTurn } from './chat-route.js';
import { describeCanvasObject } from './learn-ask-target.js';

const ID = `fs_${'c'.repeat(24)}`, REV = 'd'.repeat(64);
const fileCard = (id, family, context, extra = {}) => ({ id, type: 'file', kind: family, label: `${id}.bin`, dx: 0, dy: 0,
  fileRef: { v: 1, source: { id: ID, rev: REV }, family, meta: { name: `${id}.${family}`, size: 2048 }, status: { preview: 'ready', context } }, ...extra });
const status = (pack, id) => pack.coverage.items.find(entry => entry.id === id);

test('the canvas inventory lists a file card by name and coverage, and never sends its content', () => {
  const board = { blocks: [
    { id: 'note', type: 'explanation', title: 'Revenue notes', body: 'Q1 grew because of the spring launch.' },
    fileCard('sheet', 'workbook', 'extracted', { title: 'SECRET CELL TEXT that must not ride' }),
    fileCard('deck', 'presentation', 'none'),
    fileCard('scan', 'pdf', 'unavailable'),
  ] };
  const { objects } = boardObjects(board);
  const sheet = objects.find(o => o.id === 'sheet');
  assert.deepEqual([sheet.type, sheet.kind, sheet.label, sheet.text, sheet.file], ['file', 'workbook', 'sheet.workbook', '', 'extracted']);
  const pack = buildCanvasContext({ ...boardObjects(board), request: 'what grew in Q1?' });
  assert.deepEqual(status(pack, 'sheet'), { id: 'sheet', type: 'file', status: 'listed', reason: 'file: extracted, read when attached' });
  assert.deepEqual(status(pack, 'deck'), { id: 'deck', type: 'file', status: 'listed', reason: 'file: listed only, not extracted' }, 'a rendered preview with no extraction is listed only');
  assert.equal(status(pack, 'scan').reason, 'file: content unavailable');
  assert.doesNotMatch(JSON.stringify(pack), /SECRET CELL TEXT/, 'no card text of a file rides in the canvas package');
  assert.equal(status(pack, 'note').status, 'full');
});

test('an image or video file card stays media: inspected only when its picture rides', () => {
  const board = { blocks: [{ ...fileCard('pic', 'image', 'none'), kind: 'image' }] };
  const pack = buildCanvasContext(boardObjects(board));
  assert.deepEqual(status(pack, 'pic'), { id: 'pic', type: 'image', status: 'unavailable', reason: 'media' });
});

test('Auto with a file attached posts to /api/learn/ask, which reads file refs; nothing else changes', () => {
  const tutor = { active: true };
  assert.equal(tutorTurn({ tutor, chat: {}, mode: 'auto' }), true);
  assert.equal(tutorTurn({ tutor, fileTurn: true, chat: {}, mode: 'auto' }), false);
  assert.equal(tutorTurn({ tutor: null, fileTurn: true }), false);
});

test('the selected file card is described by name, type and size, and only as readable when extracted', () => {
  const listed = describeCanvasObject(fileCard('deck', 'presentation', 'none'));
  assert.equal(listed.material, 'file');
  assert.match(listed.text, /^Presentation file on the canvas: deck\.presentation, 0\.0 MiB\. only its name and type are known/);
  assert.match(describeCanvasObject(fileCard('sheet', 'workbook', 'extracted')).text, /its extracted text can be read when the file is attached/);
});
