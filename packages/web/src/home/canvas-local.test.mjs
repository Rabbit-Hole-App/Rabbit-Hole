import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasKeys, deviceId, hasLocalContent, localBoard, opensHere } from './canvas-local.js';

const memory = (entries = {}) => { const items = new Map(Object.entries(entries)); return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)) }; };
const KEYS = canvasKeys({ org: 'gmail-com', email: 'a@gmail.com', slug: 'canvas-0f9e8d7c' });
// What Learn writes 400 ms after a canvas opens, before anything is drawn or asked
// (AdaptiveCanvas.jsx:774, LearnPage.jsx:163).
const OPENED = { [KEYS.ink]: JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [] }), [KEYS.chat]: '[]' };

test('the keys are the ones Learn writes (LearnPage.jsx:143, :158, :169, :794)', () => {
  assert.deepEqual(KEYS, {
    base: 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c',
    ink: 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c:ink',
    chat: 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c:chat',
    sources: 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c:sources',
  });
});

test('opened but untouched is not content; one stroke, shape, item, link, block or question is', () => {
  assert.equal(hasLocalContent(memory(), KEYS), false);
  assert.equal(hasLocalContent(memory(OPENED), KEYS), false);
  for (const field of ['strokes', 'shapes', 'items', 'links', 'blocks']) {
    const ink = JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [], [field]: [{ id: 'x' }] });
    assert.equal(hasLocalContent(memory({ ...OPENED, [KEYS.ink]: ink }), KEYS), true, field);
  }
  assert.equal(hasLocalContent(memory({ ...OPENED, [KEYS.chat]: JSON.stringify([{ id: '1', question: 'why sqrt(dk)?' }]) }), KEYS), true);
});

// Undo deletes on "no content", so anything that cannot be read as empty counts as content.
test('unreadable storage, broken JSON or a changed blob shape counts as content', () => {
  assert.equal(hasLocalContent(memory({ [KEYS.ink]: 'not json' }), KEYS), true);
  assert.equal(hasLocalContent(memory({ [KEYS.ink]: '{"blocks":{"b1":{}}}' }), KEYS), true);
  assert.equal(hasLocalContent(memory({ [KEYS.chat]: '{"not":"a list"}' }), KEYS), true);
  assert.equal(hasLocalContent({ getItem() { throw new Error('SecurityError'); } }, KEYS), true);
});

test('this browser gets one device id, made on first use', () => {
  const storage = memory();
  const id = deviceId(storage);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(storage.getItem('small.device'), id);
  assert.equal(deviceId(storage), id);
});

test('a canvas opens with local content, on the device that made it, or with no device recorded; otherwise it is gated', () => {
  const record = { name: 'canvas-0f9e8d7c', device_id: 'dev-a' };
  const on = (entries, rec = record) => opensHere({ storage: memory(entries), keys: KEYS, record: rec });
  assert.equal(on({ 'small.device': 'dev-a' }), true);
  assert.equal(on({ 'small.device': 'dev-b' }), false);
  assert.equal(on({ 'small.device': 'dev-b', ...OPENED }), false);
  assert.equal(on({ 'small.device': 'dev-b', [KEYS.chat]: '[{"question":"q"}]' }), true);
  assert.equal(on({ 'small.device': 'dev-b' }, { ...record, device_id: null }), true);
  assert.equal(on({}), false);
});

// Fork (docs/features/canvas-forking.md): your own canvas forks from what this browser saved, or from
// nothing local at all - never an empty board standing in for content held elsewhere.
test("a Fork sends this browser's board with its chat cards, and nothing when the browser holds none", () => {
  assert.equal(localBoard(memory(), KEYS), null, 'never opened here');
  assert.equal(localBoard(memory(OPENED), KEYS), null, 'opened but empty is not a copy');
  const ink = { strokes: [], shapes: [{ id: 's' }], items: [], links: [], blocks: [{ id: 'b', type: 'explanation' }] };
  const chat = [{ id: '1', question: 'why sqrt(dk)?', answer: 'scale', status: 'done' }];
  assert.deepEqual(localBoard(memory({ [KEYS.ink]: JSON.stringify(ink), [KEYS.chat]: JSON.stringify(chat) }), KEYS), { ...ink, exchanges: chat });
  assert.deepEqual(localBoard(memory({ ...OPENED, [KEYS.chat]: JSON.stringify(chat) }), KEYS).exchanges, chat, 'chat cards alone are content');
  assert.equal(localBoard(memory({ [KEYS.ink]: '{not json' }), KEYS), null, 'unreadable: let the server copy decide');
});
