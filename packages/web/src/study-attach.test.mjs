import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizePinnedSource, pinnedChatRef, versionStatus } from './study-attach.js';
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
