import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachStillCurrent, attachSnapshot, authorizePinnedSource, createPinnedAttacher, pinnedChatRef, versionStatus } from './study-attach.js';
import { attachedReducer, sameRef } from './chat-context.js';
import { excerptChatRef } from './pdf-excerpt.js';
import { pdfRef } from './pdf-source.js';
import { selectionRef } from './selection-ref.js';

const DOC = { sourceId: 'doc:7', kind: 'doc', name: 'Paper.pdf', version: '', range: null };
const PAPER = { sourceId: 'paper:upload:0123456789ab', kind: 'web', name: 'Upload.pdf', version: '', range: null, home: 'other-canvas' };
const pdfPin = ref => ({ cardId: 'c1', kind: 'pdf', ref });
const excerpt = (over = {}) => ({ id: 'pdfx_aaaaaaaaaaaaaaaaaaaaaaaa', kind: 'text', source: { key: 'doc:7', name: 'Paper.pdf', home: null }, page: { index: 4, label: null }, quote: { exact: 'The tide is a wave.' }, ...over });
const clone = value => JSON.parse(JSON.stringify(value));

test('a PDF pin attaches its ref at the reader page, an integer, 1 when the reader has none', () => {
  assert.deepEqual(pinnedChatRef(pdfPin(DOC), { page: 3 }), { ...DOC, range: { page: 3 } });
  assert.deepEqual(pinnedChatRef(pdfPin(DOC), {}).range, { page: 1 });
  assert.deepEqual(pinnedChatRef(pdfPin(DOC), null).range, { page: 1 });
  assert.deepEqual(pinnedChatRef(pdfPin(DOC), { page: 2, zoom: 1.5, scrollTop: 900 }).range, { page: 2 }, 'zoom and scroll are not part of the ref');
});

test('an uploaded paper keeps its home canvas and kind', () => {
  assert.deepEqual(pinnedChatRef(pdfPin(PAPER), { page: 2 }), { ...PAPER, range: { page: 2 } });
});

test('a page that is not a whole number from 1 is refused, never rounded', () => {
  for (const page of [0, -1, 1.5, NaN, Infinity, '3', [], {}, true]) assert.equal(pinnedChatRef(pdfPin(DOC), { page }), null, String(page));
});

test('a missing or unavailable source returns null', () => {
  assert.equal(pinnedChatRef(null, { page: 1 }), null);
  assert.equal(pinnedChatRef({ cardId: 'c1', kind: 'pdf' }, { page: 1 }), null);
  assert.equal(pinnedChatRef(pdfPin({ ...DOC, sourceId: '' }), { page: 1 }), null);
  assert.equal(pinnedChatRef(pdfPin({ ...DOC, sourceId: 'doc:' }), { page: 1 }), null);
  assert.equal(pinnedChatRef(pdfPin({ sourceId: 'paper:2401.00001', kind: 'web', name: 'arXiv', version: '', range: null }), { page: 1 }), null, 'an arXiv paper was never uploaded');
  assert.equal(pinnedChatRef(pdfPin(DOC), { page: 2, unavailable: true }), null, 'the reader refused or could not read the bytes');
});

test('a text selection in the pinned PDF attaches its own ref, the one the excerpt card sends', () => {
  const selected = excerpt();
  const ref = pinnedChatRef(pdfPin(DOC), { page: 9, excerpt: selected });
  assert.deepEqual(ref, excerptChatRef(selected));
  assert.equal(ref.sourceId, `excerpt:${selected.id}`);
  assert.deepEqual(ref.range, { page: 4 }, 'the excerpt page, not the reader page');
});

test('a selection in some other PDF, or one that gives no ref, falls back to the page', () => {
  assert.deepEqual(pinnedChatRef(pdfPin(DOC), { page: 2, excerpt: excerpt({ source: { key: 'doc:8' } }) }), { ...DOC, range: { page: 2 } });
  assert.deepEqual(pinnedChatRef(pdfPin(DOC), { page: 2, excerpt: excerpt({ quote: { exact: '' } }) }), { ...DOC, range: { page: 2 } });
  assert.deepEqual(pinnedChatRef(pdfPin(DOC), { page: 2, excerpt: excerpt({ kind: 'region' }) }), { ...DOC, range: { page: 2 } }, 'Release 1 attaches no picture');
});

test('a text or Explanation pin attaches the card ref as it is, text included', () => {
  const ref = selectionRef({ ids: ['t1'], kind: 'card', name: 'My note', content: 'The whole note', text: () => 'The whole note' });
  for (const kind of ['text', 'explanation']) {
    const out = pinnedChatRef({ cardId: 't1', kind, ref }, { page: 5 });
    assert.equal(out, ref);
    assert.equal(out.range, null, 'the reader page never lands on a card');
    assert.equal(out.text, 'The whole note');
  }
  assert.equal(pinnedChatRef({ cardId: 't1', kind: 'text', ref: { name: 'x' } }, null), null);
});

test('inputs are not mutated', () => {
  const pin = pdfPin(DOC), reader = { page: 3, excerpt: excerpt() };
  const before = clone({ pin, reader });
  pinnedChatRef(pin, reader);
  pinnedChatRef(pin, { page: 6 });
  assert.deepEqual(clone({ pin, reader }), before);
  assert.notEqual(pinnedChatRef(pin, { page: 6 }).range, pin.ref.range);
});

test('the ref is a snapshot: scrolling afterwards changes nothing already attached', () => {
  const reader = { page: 2 };
  const first = pinnedChatRef(pdfPin(DOC), reader);
  reader.page = 5;
  assert.deepEqual(first.range, { page: 2 });
});

test('two pages are two chips, the same page one, and the card Add to chat of the same PDF page is that chip', () => {
  let attached = [];
  const add = ref => { attached = attachedReducer(attached, { type: 'attach', ref }); };
  add(pinnedChatRef(pdfPin(DOC), { page: 2 }));
  add(pinnedChatRef(pdfPin(DOC), { page: 2, scrollTop: 400 }));
  assert.equal(attached.length, 1);
  add(pinnedChatRef(pdfPin(DOC), { page: 3 }));
  assert.equal(attached.length, 2);
  assert.ok(sameRef(attached[0], pdfRef({ type: 'slide', pdf: 'doc:7', number: 2, label: 'Paper.pdf' })));
  attached = attachedReducer(attached, { type: 'detach', ref: attached[0] });
  assert.deepEqual(attached.map(ref => ref.range), [{ page: 3 }], 'removing takes only that chip');
});

test('the same excerpt selected twice is one chip', () => {
  const selected = excerpt();
  let attached = [];
  for (let i = 0; i < 2; i++) attached = attachedReducer(attached, { type: 'attach', ref: pinnedChatRef(pdfPin(DOC), { page: 1 + i, excerpt: selected }) });
  assert.equal(attached.length, 1);
});

test('versionStatus: a ref with its own version or an excerpt identity is available, a doc or paper PDF ref is not', () => {
  assert.equal(versionStatus(DOC), 'unavailable');
  assert.equal(versionStatus(PAPER), 'unavailable');
  assert.equal(versionStatus(pinnedChatRef(pdfPin(DOC), { page: 2 })), 'unavailable', 'a page ref gains no version');
  assert.equal(versionStatus({ ...DOC, version: '2026-10-01' }), 'available');
  assert.equal(versionStatus(excerptChatRef(excerpt())), 'available');
  assert.equal(pinnedChatRef(pdfPin({ ...DOC, version: 'v9' }), { page: 2 }).version, 'v9', 'an existing version is kept as it is');
  assert.equal(versionStatus(null), 'unavailable');
});

const recorder = (answer) => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, method: init.method, headers: init.headers, signal: init.signal }); const out = answer(init.method); if (out instanceof Error) throw out; return out; };
  return { calls, fetchImpl };
};

test('authorizePinnedSource: a readable PDF is a status-only HEAD of the reader bytes route, aborted, never a write', async () => {
  const { calls, fetchImpl } = recorder(() => ({ ok: true, status: 200 }));
  assert.deepEqual(await authorizePinnedSource(pdfPin(DOC), { fetchImpl, app: 'canvas-1' }), { ok: true });
  assert.deepEqual(calls.map(call => [call.method, call.url]), [['HEAD', '/api/learn/context/7?app=canvas-1']]);
  assert.equal(calls[0].signal.aborted, true, 'the request is aborted once the status is known');
  const paper = recorder(() => ({ ok: true, status: 200 }));
  await authorizePinnedSource(pdfPin(PAPER), { fetchImpl: paper.fetchImpl, app: 'canvas-1' });
  assert.equal(paper.calls[0].url, '/api/learn/paper?app=canvas-1&id=upload%3A0123456789ab&home=other-canvas');
});

test('authorizePinnedSource: 401, 403, 404 and a network error refuse', async () => {
  for (const status of [401, 403, 404, 500]) {
    const { fetchImpl } = recorder(() => ({ ok: false, status }));
    assert.deepEqual(await authorizePinnedSource(pdfPin(DOC), { fetchImpl, app: 'a' }), { ok: false, reason: `status-${status}` });
  }
  const failing = recorder(() => new TypeError('Failed to fetch'));
  assert.deepEqual(await authorizePinnedSource(pdfPin(DOC), { fetchImpl: failing.fetchImpl, app: 'a' }), { ok: false, reason: 'network' });
});

test('authorizePinnedSource: when HEAD is not allowed it falls back to a GET that is aborted after the headers', async () => {
  const { calls, fetchImpl } = recorder(method => (method === 'HEAD' ? { ok: false, status: 405 } : { ok: true, status: 200 }));
  assert.deepEqual(await authorizePinnedSource(pdfPin(DOC), { fetchImpl, app: 'a' }), { ok: true });
  assert.deepEqual(calls.map(call => call.method), ['HEAD', 'GET']);
  assert.equal(calls[1].signal.aborted, true);
});

// A team canvas is read in its own workspace: both requests carry the page's workspace headers, as the reader's own GET does.
test('authorizePinnedSource: the HEAD and its GET fallback carry the workspace headers the reader sends', async () => {
  const { calls, fetchImpl } = recorder(method => (method === 'HEAD' ? { ok: false, status: 405 } : { ok: true, status: 200 }));
  await authorizePinnedSource(pdfPin(DOC), { fetchImpl, app: 'a', headers: { 'X-Small-Workspace': 'team-1' } });
  assert.deepEqual(calls.map(call => call.headers), [{ 'X-Small-Workspace': 'team-1' }, { 'X-Small-Workspace': 'team-1' }]);
  const plain = recorder(() => ({ ok: true, status: 200 }));
  await authorizePinnedSource(pdfPin(DOC), { fetchImpl: plain.fetchImpl, app: 'a' });
  assert.deepEqual(plain.calls[0].headers, {}, 'no workspace: no headers');
});

test('authorizePinnedSource: a source that cannot be addressed is refused without a request', async () => {
  const { calls, fetchImpl } = recorder(() => ({ ok: true, status: 200 }));
  assert.equal((await authorizePinnedSource(null, { fetchImpl, app: 'a' })).ok, false);
  assert.equal((await authorizePinnedSource(pdfPin({ ...DOC, sourceId: 'paper:2401.00001', kind: 'web' }), { fetchImpl, app: 'a' })).ok, false);
  assert.equal((await authorizePinnedSource(pdfPin(DOC), { fetchImpl })).ok, false, 'no canvas');
  assert.deepEqual(calls, []);
});

test('authorizePinnedSource: a text or Explanation pin needs its card to exist, and asks the network nothing', async () => {
  const { calls, fetchImpl } = recorder(() => ({ ok: true, status: 200 }));
  const pin = { cardId: 't1', kind: 'text', ref: { sourceId: 'card:t1', kind: 'card', range: null } };
  assert.deepEqual(await authorizePinnedSource(pin, { fetchImpl, app: 'a', cardExists: id => id === 't1' }), { ok: true });
  assert.deepEqual(await authorizePinnedSource({ ...pin, kind: 'explanation' }, { fetchImpl, app: 'a', cardExists: () => false }), { ok: false, reason: 'card-missing' });
  assert.equal((await authorizePinnedSource(pin, { fetchImpl, app: 'a' })).ok, false, 'no cardExists from the shell');
  assert.deepEqual(calls, []);
});

test('study-attach.js reads only through an injected fetch: no write method, no model route, no other network API', () => {
  const source = readFileSync(new URL('./study-attach.js', import.meta.url), 'utf8').replace(/^\/\/.*$/gm, '');
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|sendBeacon|EventSource|\/api\/|POST|PUT|PATCH|DELETE/);
  assert.deepEqual([...source.matchAll(/method: '(\w+)'/g)].map(m => m[1]).sort(), ['GET', 'HEAD']);
  assert.deepEqual([...source.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]), ['./pdf-source.js', './pdf-excerpt.js']);
});

// ---- the delayed authorization race (UI-27.4): the operation is a snapshot, and only that snapshot lands -------------------------
// A world the way StudyPane wires it: live state the learner can change while the authorizer is pending; the chips are the real
// chat-context reducer; every authorization waits for the test to settle it.
function world(over = {}) {
  const live = { alive: true, scope: 'canvas-1:main:study', thread: 't1', pinCardId: 'c1', cards: new Set(['c1', 'c2']), page: 3, ...over };
  const destination = () => ({ canvas: 'canvas-1', board: 'main', thread: live.thread });
  const pending = [], chips = { list: [] }, adds = [];
  const attacher = createPinnedAttacher();
  const press = () => {
    const pin = pdfPin(live.pinCardId === 'c2' ? { ...DOC, sourceId: 'doc:8' } : DOC);
    pin.cardId = live.pinCardId;
    const snap = attachSnapshot({ pin, ref: pinnedChatRef(pin, { page: live.page }), scope: live.scope, destination: destination() });
    return attacher(snap, {
      authorize: source => new Promise(resolve => pending.push({ source, settle: resolve })),
      current: operation => attachStillCurrent(operation, { alive: live.alive, scope: live.scope, destination: destination(), pinCardId: live.pinCardId, cardExists: live.cards.has(operation.pin.cardId) }),
      attach: ref => { adds.push(ref); chips.list = attachedReducer(chips.list, { type: 'attach', ref }); },
    });
  };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return { live, press, pending, chips, adds, tick };
}
const OK = { ok: true };

test('the attached ref is the one at the press, whatever the reader shows when authorization returns', async () => {
  const w = world();
  const done = w.press();
  w.live.page = 9; // the reader scrolled on while the source was being checked
  w.pending[0].settle(OK);
  assert.deepEqual(await done, { id: 1, status: 'attached' });
  assert.deepEqual(w.chips.list.map(ref => [ref.sourceId, ref.range]), [['doc:7', { page: 3 }]], 'page 3, not 9');
});

test('mixed parts: source from one operation, page from another, never', async () => {
  const w = world();
  const first = w.press(); // doc:7 at page 3
  w.live.pinCardId = 'c2'; w.live.page = 5; // the learner pins another reference and turns the page
  const second = w.press(); // doc:8 at page 5
  w.pending[0].settle(OK); w.pending[1].settle(OK);
  assert.equal((await first).status, 'superseded');
  assert.equal((await second).status, 'attached');
  assert.deepEqual(w.chips.list.map(ref => [ref.sourceId, ref.range]), [['doc:8', { page: 5 }]]);
});

test('switching the reference mid-flight abandons the old operation and says why', async () => {
  const w = world();
  const done = w.press();
  w.live.pinCardId = 'c2';
  w.pending[0].settle(OK);
  assert.deepEqual(await done, { id: 1, status: 'abandoned', reason: 'pin-changed' });
  assert.deepEqual(w.adds, []);
});

test('switching only the page mid-flight still attaches the pressed page, once', async () => {
  const w = world();
  const done = w.press();
  w.live.page = 4;
  w.pending[0].settle(OK);
  assert.equal((await done).status, 'attached');
  assert.deepEqual(w.adds.map(ref => ref.range), [{ page: 3 }]);
});

test('navigation to another canvas or board mid-flight attaches nothing', async () => {
  for (const scope of ['canvas-2:main:study', 'canvas-1:other:study']) {
    const w = world();
    const done = w.press();
    w.live.scope = scope;
    w.pending[0].settle(OK);
    assert.deepEqual(await done, { id: 1, status: 'abandoned', reason: 'canvas-changed' }, scope);
    assert.deepEqual(w.adds, []);
  }
  const w = world();
  const done = w.press();
  w.live.alive = false; // the pane closed
  w.pending[0].settle(OK);
  assert.equal((await done).reason, 'closed');
  assert.deepEqual(w.adds, []);
});

test('the destination Chat changing mid-flight (another thread, New chat) attaches nothing', async () => {
  const w = world();
  const done = w.press();
  w.live.thread = 't2';
  w.pending[0].settle(OK);
  assert.deepEqual(await done, { id: 1, status: 'abandoned', reason: 'chat-changed' });
  assert.deepEqual(w.adds, []);
  const fresh = world({ thread: null }); // a new chat that got its id on a first turn is still the same chat
  const landed = fresh.press();
  fresh.live.thread = 't9';
  fresh.pending[0].settle(OK);
  assert.equal((await landed).status, 'attached');
});

test('deleting the pinned card mid-flight attaches nothing', async () => {
  const w = world();
  const done = w.press();
  w.live.cards.delete('c1');
  w.pending[0].settle(OK);
  assert.deepEqual(await done, { id: 1, status: 'abandoned', reason: 'card-deleted' });
  assert.deepEqual(w.adds, []);
});

test('a refused source attaches nothing and reports why; a thrown authorizer is a refusal too', async () => {
  const w = world();
  const done = w.press();
  w.pending[0].settle({ ok: false, reason: 'status-404' });
  assert.deepEqual(await done, { id: 1, status: 'refused', reason: 'status-404' });
  assert.deepEqual(w.adds, []);
  const snap = attachSnapshot({ pin: pdfPin(DOC), ref: pinnedChatRef(pdfPin(DOC), { page: 1 }), scope: 's', destination: { canvas: 'a', board: 'main', thread: null } });
  const out = await createPinnedAttacher()(snap, { authorize: () => Promise.reject(new Error('x')), current: () => null, attach: () => assert.fail('must not attach') });
  assert.deepEqual(out, { id: 1, status: 'refused', reason: 'network' });
});

test('retry after a refusal is a new operation that attaches once', async () => {
  const w = world();
  const first = w.press();
  w.pending[0].settle({ ok: false, reason: 'status-403' });
  assert.equal((await first).status, 'refused');
  const retry = w.press();
  w.pending[1].settle(OK);
  assert.deepEqual(await retry, { id: 2, status: 'attached' });
  assert.equal(w.chips.list.length, 1);
});

test('two rapid presses make one chip: the older is superseded, whichever order authorization returns', async () => {
  for (const order of [[0, 1], [1, 0]]) {
    const w = world();
    const a = w.press(), b = w.press();
    for (const at of order) { w.pending[at].settle(OK); await w.tick(); }
    assert.deepEqual([(await a).status, (await b).status], ['superseded', 'attached'], order.join());
    assert.equal(w.adds.length, 1);
    assert.equal(w.chips.list.length, 1);
  }
});

test('the same ref attached by two operations is still one chip (chat-context sameRef)', async () => {
  const w = world();
  const a = w.press(); w.pending[0].settle(OK); await a;
  const b = w.press(); w.pending[1].settle(OK); await b; // a later press for the same page: two operations, one chip
  assert.equal(w.adds.length, 2);
  assert.equal(w.chips.list.length, 1);
  assert.ok(sameRef(w.chips.list[0], w.adds[1]));
});

test('the snapshot cannot be changed after the press, and what is attached is a copy', async () => {
  const snap = attachSnapshot({ pin: pdfPin(DOC), ref: pinnedChatRef(pdfPin(DOC), { page: 2 }), scope: 's', destination: { canvas: 'a', board: 'main', thread: null } });
  assert.throws(() => { snap.ref.range.page = 9; });
  assert.throws(() => { snap.pin.cardId = 'other'; });
  let sent;
  await createPinnedAttacher()(snap, { authorize: async () => OK, current: () => null, attach: ref => { sent = ref; } });
  sent.range.page = 7;
  assert.equal(snap.ref.range.page, 2);
  assert.equal(attachSnapshot({ pin: pdfPin(DOC), ref: null, scope: 's', destination: {} }), null, 'no ref, no operation');
});

test('StudyPane takes the snapshot at the press and lands only what attachStillCurrent approves', () => {
  const pane = readFileSync(new URL('./StudyPane.jsx', import.meta.url), 'utf8');
  assert.match(pane, /const snap = pinnedAttachSnapshot\(/);
  assert.match(pane, /attacher\.current\(snap, \{/);
  assert.match(pane, /current: operation => attachStillCurrent\(operation,/);
  assert.match(pane, /attach: ref => now\.current\.chat\.addToChat\(ref, \{\}\)/);
  assert.doesNotMatch(pane, /await authorizePinnedSource/, 'no authorization awaited outside the operation');
});
