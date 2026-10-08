// Card thumbnails (docs/features/card-thumbnails.md): the region a snapshot shows, when a snapshot is taken, what a chosen
// picture may be, the addresses cards load, and the card layout the owner asked for (picture right, one card per row,
// every card one size).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COVER_LIMIT, THUMBNAIL, bumpThumbnail, cardThumbnail, coverProblem, ownThumbnail, publishedThumbnail, thumbnailRegion, thumbnailScheduler } from './card-thumbnail.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the region is the content made 2:1: wide content centred, a tall column keeps its top, never past 2x zoom', () => {
  assert.equal(THUMBNAIL.width / THUMBNAIL.height, 2);
  assert.equal(thumbnailRegion([]), null, 'an empty canvas has no snapshot');
  assert.equal(thumbnailRegion([{ x: 0, y: 0, w: NaN, h: 1 }]), null);
  // Wide: 2000 x 400 of content (2048 x 448 with the margin) -> 2048 x 1024, centred vertically.
  assert.deepEqual(thumbnailRegion([{ x: 0, y: 0, w: 1000, h: 400 }, { x: 1000, y: 0, w: 1000, h: 400 }]), { x: -24, y: -312, w: 2048, h: 1024 });
  // Tall: one 560-wide column 3000 high keeps its top, widened by half again (912 x 456).
  const tall = thumbnailRegion([{ x: 100, y: 50, w: 560, h: 3000 }]);
  assert.deepEqual(tall, { x: 76 + (608 - 912) / 2, y: 26, w: 912, h: 456 });
  // Nearly 2:1: the whole card, centred.
  const card = thumbnailRegion([{ x: 0, y: 0, w: 552, h: 252 }]);
  assert.deepEqual([card.w, card.h, card.y], [600, 300, -24]);
  // A small sticky note never fills the picture at more than 2x.
  assert.deepEqual(thumbnailRegion([{ x: 0, y: 0, w: 100, h: 60 }]), { x: -150, y: -70, w: 400, h: 200 });
});

// Fake timers: run() fires only when the test says so.
const clock = () => {
  let at = 0, next = null;
  return {
    now: () => at,
    timers: { setTimeout: (fn, ms) => (next = { fn, due: at + ms }), clearTimeout: t => { if (t === next) next = null; } },
    async tick(ms) { at += ms; if (next && next.due <= at) { const { fn } = next; next = null; await fn(); } },
    get pending() { return next && next.due - at; },
  };
};

test('a snapshot per pause in saving, never per keystroke; at most one per 30 s; only changed content', async () => {
  const c = clock(), sent = [];
  let frame = 0;
  const s = thumbnailScheduler({ capture: async () => `shot-${++frame}`, upload: async blob => { sent.push(blob); }, now: c.now, timers: c.timers });
  s.saved('a'); await c.tick(1000); s.saved('ab'); await c.tick(1000); s.saved('abc');
  await c.tick(3999);
  assert.deepEqual(sent, [], 'still typing: nothing drawn');
  await c.tick(1);
  assert.deepEqual(sent, ['shot-1'], 'one snapshot after the 4 s pause, of the latest content');
  s.saved('abc'); await c.tick(4000);
  assert.deepEqual(sent, ['shot-1'], 'the same content again: nothing');
  s.saved('abcd'); await c.tick(4000);
  assert.deepEqual(sent, ['shot-1'], 'within 30 s of the last: waits');
  assert.equal(c.pending, 22000);
  await c.tick(22000);
  assert.deepEqual(sent, ['shot-1', 'shot-2']);
  s.stop(); s.saved('x'); s.stop(); await c.tick(60000);
  assert.deepEqual(sent, ['shot-1', 'shot-2'], 'stopped when the canvas closes');
});

test('an empty canvas sends nothing and counts as done; a failed upload is tried again on the next save', async () => {
  const c = clock(), sent = [];
  let fail = true, empty = true;
  const s = thumbnailScheduler({ capture: async () => (empty ? null : 'shot'), upload: async blob => { if (fail) throw new Error('offline'); sent.push(blob); }, now: c.now, timers: c.timers });
  s.saved('none yet'); await c.tick(4000);
  assert.equal(c.pending, null, 'nothing to draw: done');
  empty = false; s.saved('a'); await c.tick(4000);
  assert.deepEqual(sent, []);
  fail = false; s.saved('a'); await c.tick(4000);
  assert.deepEqual(sent, ['shot'], 'the same content, not yet sent, goes on the next save');
});

test('a chosen picture: PNG, JPEG or WebP, at most 10 MB', () => {
  assert.equal(coverProblem(null), 'Choose an image.');
  assert.equal(coverProblem({ type: 'image/gif', size: 10 }), 'Choose a PNG, JPEG or WebP image.');
  assert.equal(coverProblem({ type: 'image/svg+xml', size: 10 }), 'Choose a PNG, JPEG or WebP image.');
  assert.equal(coverProblem({ type: 'image/jpeg', size: COVER_LIMIT + 1 }), 'Choose an image of at most 10 MB.');
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) assert.equal(coverProblem({ type, size: COVER_LIMIT }), null, type);
});

test('addresses: your own card by its name, a published card by its token; a change gets a new address', () => {
  assert.equal(publishedThumbnail('/e/AbC_dEf-123'), '/api/learn/boards/published/AbC_dEf-123/thumbnail');
  assert.equal(ownThumbnail('canvas-0000000a'), '/api/learn/boards/canvas-0000000a/main/thumbnail');
  bumpThumbnail('canvas-0000000a');
  assert.match(ownThumbnail('canvas-0000000a'), /^\/api\/learn\/boards\/canvas-0000000a\/main\/thumbnail\?v=\d+$/);
  assert.equal(cardThumbnail({ kind: 'repository', name: 'repo-x', canEdit: false }), '/api/learn/boards/repo-x/main/thumbnail', 'a project: your own board of it');
  for (const a of [{ kind: 'canvas', name: 'canvas-0000000b', fixture: true }, { kind: 'canvas', name: 'canvas-0000000b', archived_at: '2026-10-08' },
    { kind: 'canvas', name: 'canvas-0000000b', canEdit: false }, { kind: 'job', name: 'nightly' }]) assert.equal(cardThumbnail(a), null, JSON.stringify(a));
});

test('the card: the picture on the right from md, on top on a phone; one per row; one fixed size; quiet placeholder', () => {
  const card = read('./home/LearningCard.jsx');
  assert.match(card, /export const CARD_ROWS = 'grid grid-cols-1 gap-4'/);
  assert.match(card, /export const CARD_HEIGHT = 'md:h-\[228px\]'/);
  assert.match(card, /aspect-\[2\/1\][^`]*md:order-last md:w-\[38%\]/, '2:1, after the text (right) from md, 38% wide');
  assert.match(card, /max-md:flex-col/, 'a phone stacks it above the text');
  assert.match(card, /max-md:h-\[196px\]/, 'and the text under it keeps one height');
  assert.match(card, /object-cover/, 'a custom picture is cropped to 2:1');
  assert.match(card, /data-card-thumbnail=\{shown \? 'image' : 'placeholder'\}/);
  assert.doesNotMatch(card, /min-h-\[186px\]/, 'a fixed height, not a floor');
  for (const [file, uses] of [['./Home.jsx', 2], ['./LibraryViews.jsx', 2], ['./home/PublicCards.jsx', 1]]) {
    const src = read(file);
    assert.equal(src.split('className={CARD_ROWS}').length - 1, uses, file);
    assert.doesNotMatch(src, /CARD_GRID/, file);
    assert.match(src, /thumbnail=\{(cardThumbnail|publishedThumbnail)\(/, file);
  }
  // Change thumbnail and Use canvas snapshot: the owner's menu only.
  const menu = read('./home/CardMenu.jsx');
  assert.match(menu, /const coverRows = menu\?\.a\.canEdit && /);
  assert.match(menu, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(menu, /cover\.source === 'custom' && <MenuItem icon=\{RotateCcw\} data-menu-thumbnail-revert/);
});
