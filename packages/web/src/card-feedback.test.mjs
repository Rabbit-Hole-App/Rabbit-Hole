import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFeedbackStore, feedbackSummary, isFeedbackCard, validFeedback } from './card-feedback.js';

const card = (type, extra = {}) => ({ id: `${type}-1`, type, title: type, ...extra });

test('generated explanatory cards are rateable; imported, practice, pending and unmade cards are not', () => {
  const yes = [card('explanation'), card('table'), card('snippet'), card('graph'), card('knowledge'), card('flow'), card('mermaid'), card('scene'), card('animation3d'),
    card('animation', { scene: { duration: 1 } }), card('animation', { program: { bundleHash: 'h' } }), card('cad', { manifest: { files: [] } }),
    card('whiteboardVideo', { whiteboard: { status: 'ready', artifactId: 'a' } }), card('image', { mode: 'generate', src: 'x.png' }), card('video', { mode: 'generate', src: 'x.mp4' })];
  const no = [card('file'), card('pdf'), card('slide'), card('webpage'), card('wiki'), card('paper'), card('repo-code'), card('repo-graph'), card('canvas-ref'), card('heading'), card('divider'), card('notebook'), card('model3d'),
    card('video', { videoId: 'abc', start: 1 }), card('image', { mode: 'search', src: 'x.png' }), card('image', { mode: 'generate', src: '' }),
    card('challenge'), card('quiz'), card('code'), card('flashcards'),
    card('animation', { scene: null, explainJob: { id: 'j' } }), card('animation', { scene: null }), card('animation3d', { animation3dJob: { id: 'j' } }), card('cad', {}),
    card('whiteboardVideo', { whiteboardJob: { id: 'j' } }), card('whiteboardVideo', { whiteboard: { status: 'rendering' } }), card('text'), card('sticky')];
  for (const block of yes) assert.equal(isFeedbackCard(block), true, `${block.type} ${JSON.stringify(Object.keys(block))}`);
  for (const block of no) assert.equal(isFeedbackCard(block), false, `${block.type} ${JSON.stringify(Object.keys(block))}`);
  for (const bad of [null, undefined, 'explanation', 7, {}, { type: 'explanation' }, { id: 4, type: 'explanation' }]) assert.equal(isFeedbackCard(bad), false);
});

test('a value is up, down or null', () => {
  for (const ok of ['up', 'down', null]) assert.equal(validFeedback(ok), true);
  for (const bad of ['', 'UP', 'sideways', 1, true, undefined, {}]) assert.equal(validFeedback(bad), false);
});

let failure = null;
const server = (list = []) => {
  const calls = [], saved = new Map(list.map(item => [item.cardId, item]));
  return {
    calls, saved,
    io: {
      read: async () => [...saved.values()],
      write: async (cardId, value) => { calls.push([cardId, value]); if (failure) throw Object.assign(new Error('x'), { code: failure }); if (value) saved.set(cardId, { cardId, value, title: 't' }); else saved.delete(cardId); },
    },
  };
};

test('the store shows a rating at once, saves it, reloads it and clears it', async () => {
  const s = server(), store = createFeedbackStore(s.io), seen = [];
  store.subscribe(() => seen.push(store.value('a')));
  assert.equal(store.value('a'), null);
  const pending = store.set('a', 'up', 'Title');
  assert.equal(store.value('a'), 'up', 'shown before the server answers');
  assert.equal(await pending, null);
  assert.deepEqual(s.calls, [['a', 'up']]);
  assert.deepEqual(store.items(), [{ cardId: 'a', value: 'up', title: 'Title' }]);
  assert.equal(await store.set('a', 'down'), null);
  assert.equal(store.value('a'), 'down');
  assert.deepEqual(store.items()[0].title, 'Title', 'a change keeps the card title');
  assert.equal(await store.set('a', null), null);
  assert.equal(store.value('a'), null);
  assert.deepEqual(s.calls.map(c => c[1]), ['up', 'down', null]);
  assert.deepEqual(seen, ['up', 'down', null], 'each change notifies once, when it is shown');
});

test('a reload replaces what is shown with what the server holds', async () => {
  const store = createFeedbackStore(server([{ cardId: 'b', value: 'down', title: 'B' }]).io);
  assert.equal(store.loaded, false);
  await store.refresh();
  assert.equal(store.loaded, true);
  assert.equal(store.value('b'), 'down');
  assert.deepEqual(store.items(), [{ cardId: 'b', value: 'down', title: 'B' }]);
});

test('a failed save puts back the earlier value and says why', async () => {
  const s = server([{ cardId: 'a', value: 'up', title: 'A' }]), store = createFeedbackStore(s.io);
  await store.refresh();
  failure = 'feedback_unavailable';
  assert.equal(await store.set('a', 'down'), 'feedback_unavailable');
  assert.equal(store.value('a'), 'up');
  assert.equal(await store.set('a', null), 'feedback_unavailable');
  assert.equal(store.value('a'), 'up');
  failure = null;
});

test('a card the server has not seen yet is saved with the board first, then rated once more', async () => {
  const s = server(); let persisted = 0, known = false;
  const store = createFeedbackStore({ ...s.io, write: async (id, value) => { if (!known) throw Object.assign(new Error('x'), { code: 'unknown_card' }); return s.io.write(id, value); }, persist: async () => { persisted += 1; known = true; } });
  assert.equal(await store.set('new', 'up'), null);
  assert.equal(persisted, 1);
  assert.equal(store.value('new'), 'up');
  // Still unknown after the save: the rating is taken back.
  known = false;
  const stubborn = createFeedbackStore({ ...s.io, write: async () => { throw Object.assign(new Error('x'), { code: 'unknown_card' }); }, persist: async () => {} });
  assert.equal(await stubborn.set('x', 'down'), 'unknown_card');
  assert.equal(stubborn.value('x'), null);
});

test('quick presses reach the server in the order they were made', async () => {
  const order = [];
  const store = createFeedbackStore({ read: async () => [], write: async (id, value) => { await new Promise(r => setTimeout(r, value === 'up' ? 20 : 0)); order.push(value); } });
  await Promise.all([store.set('a', 'up'), store.set('a', 'down'), store.set('a', null)]);
  assert.deepEqual(order, ['up', 'down', null]);
  assert.equal(store.value('a'), null);
});

test('Progress lists ratings by value and gives a card that is gone no row to open', () => {
  const items = [{ cardId: 'a', value: 'up', title: 'A' }, { cardId: 'b', value: 'down', title: 'B' }, { cardId: 'gone', value: 'up', title: 'Gone' }];
  const all = feedbackSummary(items);
  assert.deepEqual([all.up.length, all.down.length, all.total], [2, 1, 3]);
  const live = feedbackSummary(items, id => id !== 'gone');
  assert.deepEqual([live.up.map(i => i.cardId), live.down.map(i => i.cardId), live.total], [['a'], ['b'], 2]);
  assert.equal(feedbackSummary([]).total, 0);
});

// The wiring the browser checks cannot be run here to prove: the control sits only behind the scope the owner's page provides,
// is never drawn on a read-only or copied canvas, reveals on hover or on its own focus (never on the card's selection or focus),
// and Progress shows the read-out with or without a goal.
test('wiring: scope-gated, read-only-safe, hover or own-focus reveal, no-goal Progress', () => {
  const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
  const canvas = read('./AdaptiveCanvas.jsx'), pair = read('./CardFeedback.jsx'), progress = read('./LearnProgress.jsx');
  assert.match(canvas, /!cadPermissions\.readOnly && !cadPermissions\.localCopy && <CardFeedback block=\{block\} \/>/);
  assert.match(pair, /return scope && isFeedbackCard\(block\)/);
  const reveal = pair.match(/className="absolute top-full[^"]*"/)[0];
  assert.match(reveal, /opacity-0/);
  assert.match(reveal, /group-hover:opacity-100/);
  assert.match(reveal, /has-\[:focus-visible\]:opacity-100/, 'keyboard focus on the pair reveals it; a mouse click does not hold it open');
  assert.doesNotMatch(reveal, /group-focus-within|(^|\s)focus-within:|selected|aria-current/, 'selection, card focus or a clicked thumb must not reveal the pair');
  assert.match(progress, /\{!managing && <CardFeedbackSummary scope=\{scope\}/, 'outside the goal branches, so no goal is needed');
  for (const [, , text] of pair.matchAll(/(['"])((?:(?!\1)[^\n])*)\1/g)) assert.doesNotMatch(text, /\.\.\.|…/, `no ellipsis in "${text}"`);
});
