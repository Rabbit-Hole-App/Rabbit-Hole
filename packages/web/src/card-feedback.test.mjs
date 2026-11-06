import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFeedbackStore, feedbackStoreFor, feedbackSummary, isFeedbackCard, validFeedback } from './card-feedback.js';

const card = (type, extra = {}) => ({ id: `${type}-1`, type, title: type, ...extra });

test('generated cards (practice cards included) are rateable; imported, pending and unmade cards are not', () => {
  const yes = [card('challenge'), card('quiz'), card('code'), card('flashcards'), card('explanation'), card('table'), card('snippet'), card('graph'), card('knowledge'), card('flow'), card('mermaid'), card('scene'), card('animation3d'),
    card('animation', { scene: { duration: 1 } }), card('animation', { program: { bundleHash: 'h' } }), card('cad', { manifest: { files: [] } }),
    card('whiteboardVideo', { whiteboard: { status: 'ready', artifactId: 'a' } }), card('image', { mode: 'generate', src: 'x.png' }), card('video', { mode: 'generate', src: 'x.mp4' })];
  const no = [card('file'), card('pdf'), card('slide'), card('webpage'), card('wiki'), card('paper'), card('repo-code'), card('repo-graph'), card('canvas-ref'), card('heading'), card('divider'), card('notebook'), card('model3d'),
    card('video', { videoId: 'abc', start: 1 }), card('image', { mode: 'search', src: 'x.png' }), card('image', { mode: 'generate', src: '' }),
    card('animation', { scene: null, explainJob: { id: 'j' } }), card('animation', { scene: null }), card('animation3d', { animation3dJob: { id: 'j' } }), card('cad', {}),
    card('whiteboardVideo', { whiteboardJob: { id: 'j' } }), card('whiteboardVideo', { whiteboard: { status: 'rendering' } }), card('text'), card('sticky')];
  for (const block of yes) assert.equal(isFeedbackCard(block), true, `${block.type} ${JSON.stringify(Object.keys(block))}`);
  for (const block of no) assert.equal(isFeedbackCard(block), false, `${block.type} ${JSON.stringify(Object.keys(block))}`);
  for (const bad of [null, undefined, 'explanation', 7, {}, { type: 'explanation' }, { id: 4, type: 'explanation' }]) assert.equal(isFeedbackCard(bad), false);
});

test('imported look-alikes are ineligible even when they are drawn as a generated kind; a restored or citing generated card stays eligible', () => {
  const lookAlikes = {
    'a PDF excerpt drawn as a text card': card('explanation', { excerpt: { kind: 'text', page: 3 } }),
    'a PDF page drawn as a text card': card('explanation', { pdf: 'asset-key' }),
    'an excerpt crop drawn as a generated image': card('image', { mode: 'generate', src: 'crop.png', excerpt: { kind: 'region', crop: { x: 0, y: 0, width: 1, height: 1 } } }),
    'an uploaded file drawn as a table': card('table', { assetKey: 'k', fileRef: { id: 'f1' } }),
    'a Markdown file drawn as a text card': card('explanation', { body: '# notes', fileRef: { id: 'f2', kind: 'markdown' } }),
    'a paper page': card('explanation', { paper: { id: '1706.03762', page: 3 } }),
    'a YouTube moment drawn as a generated clip': card('video', { mode: 'generate', src: 'x.mp4', videoId: 'abc' }),
    'a repository card': card('snippet', { repository: { app: 'repo-1' } }),
    'a failed placeholder': card('explanation', { status: 'failed' }),
    'a failed clip': card('video', { mode: 'generate', src: 'x.mp4', failed: true }),
  };
  for (const [what, block] of Object.entries(lookAlikes)) assert.equal(isFeedbackCard(block), false, what);
  const generated = card('explanation', { body: 'text', sources: [{ kind: 'web', title: 'A', url: 'https://a.test' }], sourceRef: { id: 'sref_1' }, promptUsed: '/explain x', copyOf: 'older', stepId: 'step-1' });
  assert.equal(isFeedbackCard(generated), true, 'citing sources, a source reference, a prompt, a copy or a step does not make a generated card imported');
  assert.equal(isFeedbackCard({ ...generated, excerpt: undefined, pdf: null, fileRef: false }), true, 'empty source fields do not count');
  assert.equal(isFeedbackCard(JSON.parse(JSON.stringify(generated))), true, 'a card restored after undo is the same block');
});

test('a value is up, down or null', () => {
  for (const ok of ['up', 'down', null]) assert.equal(validFeedback(ok), true);
  for (const bad of ['', 'UP', 'sideways', 1, true, undefined, {}]) assert.equal(validFeedback(bad), false);
});

let failure = null;
// A server that numbers every change, like the route does.
const server = (list = []) => {
  const calls = [], saved = new Map(list.map(item => [item.cardId, { revision: 1, ...item }])), revisions = new Map(list.map(item => [item.cardId, item.revision ?? 1]));
  return {
    calls, saved, revisions,
    io: {
      read: async () => [...saved.values()],
      write: async (cardId, value) => {
        calls.push([cardId, value]);
        if (failure) throw Object.assign(new Error('x'), { code: failure });
        const revision = (revisions.get(cardId) ?? 0) + 1; revisions.set(cardId, revision);
        saved.set(cardId, { cardId, value, title: 't', revision });
        return { cardId, value, revision };
      },
    },
  };
};
const later = ms => new Promise(resolve => setTimeout(resolve, ms));

test('toggle selected value clears: pressing the chosen thumb sends null, the other thumb replaces the value', async () => {
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
  assert.deepEqual(store.items(), []);
  assert.deepEqual(s.calls.map(c => c[1]), ['up', 'down', null]);
  assert.deepEqual(seen, ['up', 'down', null], 'each change notifies once, when it is shown');
});

test('a reload replaces what is shown with what the server holds; a cleared row shows nothing', async () => {
  const store = createFeedbackStore(server([{ cardId: 'b', value: 'down', title: 'B' }, { cardId: 'c', value: null, title: 'C', revision: 4 }]).io);
  assert.equal(store.loaded, false);
  await store.refresh();
  assert.equal(store.loaded, true);
  assert.equal(store.value('b'), 'down');
  assert.deepEqual(store.items(), [{ cardId: 'b', value: 'down', title: 'B' }]);
});

test('a failed save puts back the last value the server confirmed and says why', async () => {
  const s = server([{ cardId: 'a', value: 'up', title: 'A' }]), store = createFeedbackStore(s.io);
  await store.refresh();
  failure = 'feedback_unavailable';
  assert.equal(await store.set('a', 'down'), 'feedback_unavailable');
  assert.equal(store.value('a'), 'up');
  assert.equal(await store.set('a', null), 'feedback_unavailable');
  assert.equal(store.value('a'), 'up');
  failure = null;
  assert.equal(await store.set('a', 'down'), null, 'a retry works');
  assert.equal(store.value('a'), 'down');
});

test('a read error is kept for Progress to show, and a retry clears it', async () => {
  let down = true;
  const store = createFeedbackStore({ read: async () => { if (down) throw new Error('offline'); return [{ cardId: 'a', value: 'up', revision: 1, title: 'A' }]; }, write: async () => ({ revision: 1 }) });
  await store.refresh();
  assert.deepEqual([store.error, store.loaded, store.items()], [true, false, []]);
  down = false;
  await store.refresh();
  assert.deepEqual([store.error, store.loaded, store.items().length], [false, true, 1]);
});

test('a card the server has not seen yet is saved with the board first, then rated once more', async () => {
  const s = server(); let persisted = 0, known = false;
  const store = createFeedbackStore({ ...s.io, write: async (id, value) => { if (!known) throw Object.assign(new Error('x'), { code: 'not_available' }); return s.io.write(id, value); }, persist: async () => { persisted += 1; known = true; } });
  assert.equal(await store.set('new', 'up'), null);
  assert.equal(persisted, 1);
  assert.equal(store.value('new'), 'up');
  // Still not available after the save: the rating is taken back.
  const stubborn = createFeedbackStore({ ...s.io, write: async () => { throw Object.assign(new Error('x'), { code: 'not_available' }); }, persist: async () => {} });
  assert.equal(await stubborn.set('x', 'down'), 'not_available');
  assert.equal(stubborn.value('x'), null);
});

test('quick presses reach the server in the order they were made', async () => {
  const order = [];
  const store = createFeedbackStore({ read: async () => [], write: async (id, value) => { await later(value === 'up' ? 20 : 0); order.push(value); return { revision: order.length }; } });
  await Promise.all([store.set('a', 'up'), store.set('a', 'down'), store.set('a', null)]);
  assert.deepEqual(order, ['up', 'down', null]);
  assert.equal(store.value('a'), null);
});

test('late response cannot reverse newer choice: neither a slow read nor a failed older save undoes a later press', async () => {
  // (1) A read that started before the press and is answered after it, with the older row.
  let release;
  const s = server([{ cardId: 'a', value: 'up', title: 'A' }]);
  const slow = createFeedbackStore({ ...s.io, read: () => new Promise(resolve => { release = () => resolve([{ cardId: 'a', value: 'up', revision: 1, title: 'A' }]); }) });
  const reading = slow.refresh();
  const saving = slow.set('a', 'down', 'A'); // the press, while the read is out
  assert.equal(slow.value('a'), 'down');
  release(); await reading;
  assert.equal(slow.value('a'), 'down', 'the older row did not replace the press');
  await saving;
  // Answered after the save is confirmed: the row is older than the revision this tab already holds, so it is still ignored.
  const lateRead = createFeedbackStore({ ...s.io, read: async () => { await later(30); return [{ cardId: 'a', value: 'up', revision: 1, title: 'A' }]; } });
  await lateRead.refresh();
  assert.equal(lateRead.value('a'), 'up');
  const reading2 = lateRead.refresh();
  assert.equal(await lateRead.set('a', 'down', 'A'), null); // confirmed at revision 2 while the read is still out
  await reading2;
  assert.equal(lateRead.value('a'), 'down', 'a row of revision 1 does not replace revision 2');
  // (2) An older save that fails after a newer press was made leaves the newer press alone.
  let n = 0;
  const flaky = createFeedbackStore({ read: async () => [], write: async (id, value) => { n += 1; if (n === 1) { await later(20); throw Object.assign(new Error('x'), { code: 'feedback_unavailable' }); } return { revision: 5 }; } });
  const first = flaky.set('a', 'up'), second = flaky.set('a', 'down');
  assert.equal(await first, 'feedback_unavailable');
  assert.equal(flaky.value('a'), 'down', 'the first failure did not put back an older value over the newer press');
  assert.equal(await second, null);
  assert.equal(flaky.value('a'), 'down');
  // (3) A newer row from the server (another tab) is taken.
  const other = createFeedbackStore({ read: async () => [{ cardId: 'a', value: 'down', revision: 9, title: 'A' }], write: async () => ({ revision: 3 }) });
  await other.set('a', 'up');
  await other.refresh();
  assert.equal(other.value('a'), 'down', 'a higher revision wins');
});

test('scope switch ignores old response: each canvas has its own store, so an answer for one canvas lands only there', async () => {
  const resolvers = {};
  const make = name => feedbackStoreFor({ app: name, board: 'main' }, { read: () => new Promise(resolve => { resolvers[name] = resolve; }), write: async () => ({ revision: 1 }) });
  const one = make('canvas-aaaaaaa1'), two = make('canvas-aaaaaaa2');
  assert.notEqual(one, two);
  assert.equal(feedbackStoreFor({ app: 'canvas-aaaaaaa1', board: 'main' }), one, 'the same canvas and board is the same store');
  assert.notEqual(feedbackStoreFor({ app: 'canvas-aaaaaaa1', board: 'other' }, { read: async () => [], write: async () => ({}) }), one, 'another board of the canvas is another store');
  const readOne = one.refresh(), readTwo = two.refresh();
  resolvers['canvas-aaaaaaa2']([{ cardId: 'c', value: 'down', revision: 1, title: 'Two' }]); await readTwo; // the newer scope answers first
  resolvers['canvas-aaaaaaa1']([{ cardId: 'c', value: 'up', revision: 1, title: 'One' }]); await readOne; // the old scope answers late
  assert.deepEqual([one.value('c'), two.value('c')], ['up', 'down']);
  assert.deepEqual(two.items(), [{ cardId: 'c', value: 'down', title: 'Two' }]);
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
// is never drawn on a read-only or copied canvas, and Progress shows the read-out with or without a goal. (The rendered markup,
// reveal classes and labels are in card-feedback-render.test.mjs; the Progress pane in learn-progress-feedback.test.mjs.)
test('wiring: scope-gated and read-only-safe on the canvas, outside the goal branches in Progress', () => {
  const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
  const canvas = read('./AdaptiveCanvas.jsx'), progress = read('./LearnProgress.jsx');
  assert.match(canvas, /!cadPermissions\.readOnly && !cadPermissions\.localCopy && <CardFeedback block=\{block\} \/>/);
  assert.match(progress, /\{!managing && <CardFeedbackSummary scope=\{scope\}/, 'outside the goal branches, so no goal is needed');
});
