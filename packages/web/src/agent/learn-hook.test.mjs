import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as flags from '../flags.js';
import { learnAction, readLearnResult } from './learn-hook.js';

const memory = () => { const items = new Map(); return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) }; };
// A tab at `url`. navigate() (api.js:31-34) pushes history; each push records what
// small.learn.request held at that moment, so a test can see the write came first.
function tab(url) {
  const [pathname, search = ''] = url.split('?');
  const win = Object.assign(new EventTarget(), { location: { pathname, search: search && `?${search}` }, opened: [], requests: [] });
  win.history = { pushState: (_state, _title, to) => win.opened.push({ to, request: globalThis.sessionStorage.getItem('small.learn.request') }) };
  win.addEventListener('small:learn-request', (event) => win.requests.push(event.detail));
  globalThis.window = win;
  globalThis.sessionStorage = memory();
  return win;
}
globalThis.PopStateEvent = class extends Event {};
const CTX = { scope: { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: null } };
const answer = (win, detail) => win.dispatchEvent(new CustomEvent('small:learn-result', { detail }));

// Tutor cleanup P4 (Q5): the handoff is teach only and always sends; the flag and the research branch are gone.
test('there is no learnHandoff flag, and teach is always sent: written before Learn opens, with no fallback line', async () => {
  assert.equal('learnHandoff' in flags, false);
  const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  const pending = learnAction('teach', { prompt: 'Why sqrt(dk)?' }, CTX);
  assert.equal(win.opened.length, 1);
  const sent = JSON.parse(win.opened[0].request);
  assert.deepEqual(sent, { id: sent.id, kind: 'teach', app: 'repo-1a2b3c4d-nanogpt', prompt: 'Why sqrt(dk)?' });
  answer(win, { id: sent.id, kind: 'teach', status: 'prefilled' });
  assert.equal((await pending).status, 'prefilled');
});

test('contextRefs rides the request when given and is absent when not', async () => {
  const refs = [{ sourceId: 'card:k1', kind: 'card', name: 'Softmax', version: '1', range: null }];
  const win = tab('/apps/canvas-0f9e8d7c?tab=learn');
  const withRefs = learnAction('teach', { app: 'canvas-0f9e8d7c', prompt: 'Teach me this', contextRefs: refs }, CTX);
  const [first] = win.requests;
  assert.deepEqual(first, { id: first.id, kind: 'teach', app: 'canvas-0f9e8d7c', prompt: 'Teach me this', contextRefs: refs });
  answer(win, { id: first.id, kind: 'teach', status: 'prefilled' });
  await withRefs;
  const plain = learnAction('teach', { app: 'canvas-0f9e8d7c', prompt: 'Teach me that', contextRefs: [] }, CTX);
  const second = win.requests[1];
  assert.equal('contextRefs' in second, false);
  assert.equal('contextRefs' in JSON.parse(sessionStorage.getItem('small.learn.request')), false);
  answer(win, { id: second.id, kind: 'teach', status: 'prefilled' });
  await plain;
});

test('with the handoff on, the request is written before Learn opens, and only its own result counts', async () => {
  const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  const pending = learnAction('teach', { prompt: 'Why sqrt(dk)?' }, CTX);
  const [{ to, request }] = win.opened;
  const sent = JSON.parse(request);
  assert.equal(to, '/apps/repo-1a2b3c4d-nanogpt?tab=learn');
  assert.deepEqual(sent, { id: sent.id, kind: 'teach', app: 'repo-1a2b3c4d-nanogpt', prompt: 'Why sqrt(dk)?' });
  assert.deepEqual(win.requests, []);
  answer(win, { id: 'another-request', kind: 'teach', status: 'rejected', reason: 'not this one' });
  answer(win, { id: sent.id, kind: 'teach', status: 'prefilled' });
  assert.deepEqual(await pending, { id: sent.id, kind: 'teach', status: 'prefilled', message: null });
});

test('already on that Learn view, the request is dispatched too and nothing navigates', async () => {
  const win = tab('/apps/canvas-0f9e8d7c?tab=learn');
  const pending = learnAction('teach', { app: 'canvas-0f9e8d7c', prompt: 'Why?' }, CTX);
  const [sent] = win.requests;
  assert.deepEqual(sent, { id: sent.id, kind: 'teach', app: 'canvas-0f9e8d7c', prompt: 'Why?' });
  assert.deepEqual(JSON.parse(sessionStorage.getItem('small.learn.request')), sent);
  assert.deepEqual(win.opened, []);
  answer(win, { id: sent.id, kind: 'teach', status: 'prefilled' });
  assert.deepEqual(await pending, { id: sent.id, kind: 'teach', status: 'prefilled', message: null });
});

test('rejected and failed show the reason Learn gave, word for word', async () => {
  for (const [status, reason] of [['rejected', 'The Learn chat already has a draft. Send or clear it, then try again.'], ['failed', 'The Learn chat did not open. Open Learn and try again.']]) {
    const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=learn');
    const pending = learnAction('teach', { prompt: 'Why?' }, CTX);
    answer(win, { id: win.requests[0].id, kind: 'teach', status, reason });
    assert.deepEqual([(await pending).status, (await pending).message], [status, reason]);
  }
});

test('no answer is not a failure: teach waits 12 s, then Still working, check the canvas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  let settled = false;
  const teach = learnAction('teach', { prompt: 'Why?' }, CTX).finally(() => { settled = true; });
  t.mock.timers.tick(11999);
  await new Promise(setImmediate);
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  const late = await teach;
  assert.deepEqual([late.status, late.message], ['timeout', 'Still working, check the canvas']);
  // The card can still land; the bar reconciles from the stored result when the sheet reopens.
  sessionStorage.setItem(`small.learn.result:${late.id}`, JSON.stringify({ id: late.id, kind: 'teach', status: 'prefilled' }));
  assert.deepEqual(readLearnResult(late.id), { id: late.id, kind: 'teach', status: 'prefilled' });
});
