import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnHandoff } from '../flags.js';
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

// T02 §9: false until the handoff (feature/parallel-work cc0cbf8) merges to main.
test('with learnHandoff false nothing is sent: /teach opens Learn, every path shows its fallback line', async () => {
  assert.equal(learnHandoff, false);
  const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  assert.deepEqual(await learnAction('teach', { prompt: 'Why sqrt(dk)?' }, CTX), { status: 'fallback', message: "Opened Learn. Your prompt wasn't transferred; it's kept here." });
  assert.deepEqual(await learnAction('teach', { app: 'canvas-0f9e8d7c', prompt: 'Why sqrt(dk)?', from: 'start' }, CTX), { status: 'fallback', message: "Opened your canvas. Your question is on your clipboard: paste it into the Learn composer." });
  assert.deepEqual(await learnAction('research', { source: { kind: 'arxiv', ref: '1706.03762' } }, CTX), { status: 'fallback', message: 'Add sources from the Sources menu on the canvas.' });
  assert.deepEqual(win.opened, [{ to: '/apps/repo-1a2b3c4d-nanogpt?tab=learn', request: null }, { to: '/apps/canvas-0f9e8d7c?tab=learn', request: null }]);
  assert.equal(sessionStorage.getItem('small.learn.request'), null);
  assert.deepEqual(win.requests, []);
});

test('with the handoff on, the request is written before Learn opens, and only its own result counts', async () => {
  const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  const pending = learnAction('teach', { prompt: 'Why sqrt(dk)?' }, CTX, { handoff: true });
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
  const pending = learnAction('research', { app: 'canvas-0f9e8d7c', source: { kind: 'arxiv', ref: '1706.03762' } }, CTX, { handoff: true });
  const [sent] = win.requests;
  assert.deepEqual(sent, { id: sent.id, kind: 'research', app: 'canvas-0f9e8d7c', source: { kind: 'arxiv', ref: '1706.03762' } });
  assert.deepEqual(JSON.parse(sessionStorage.getItem('small.learn.request')), sent);
  assert.deepEqual(win.opened, []);
  answer(win, { id: sent.id, kind: 'research', status: 'added', resourceId: 'paper-1706.03762' });
  assert.deepEqual(await pending, { id: sent.id, kind: 'research', status: 'added', resourceId: 'paper-1706.03762', message: 'Added to canvas.' });
});

test('rejected and failed show the reason Learn gave, word for word', async () => {
  for (const [status, reason] of [['rejected', 'The Learn chat already has a draft. Send or clear it, then try again.'], ['failed', 'Search failed. Try again.']]) {
    const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=learn');
    const pending = learnAction('teach', { prompt: 'Why?' }, CTX, { handoff: true });
    answer(win, { id: win.requests[0].id, kind: 'teach', status, reason });
    assert.deepEqual([(await pending).status, (await pending).message], [status, reason]);
  }
});

test('no answer is not a failure: teach waits 12 s, research 30 s, then Still working, check the canvas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  let settled = false;
  const teach = learnAction('teach', { prompt: 'Why?' }, CTX, { handoff: true }).finally(() => { settled = true; });
  t.mock.timers.tick(11999);
  await new Promise(setImmediate);
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  const late = await teach;
  assert.deepEqual([late.status, late.message], ['timeout', 'Still working, check the canvas']);
  // The card can still land; the bar reconciles from the stored result when the sheet reopens.
  sessionStorage.setItem(`small.learn.result:${late.id}`, JSON.stringify({ id: late.id, kind: 'teach', status: 'prefilled' }));
  assert.deepEqual(readLearnResult(late.id), { id: late.id, kind: 'teach', status: 'prefilled' });

  const research = learnAction('research', { source: { kind: 'wiki', ref: 'Attention' } }, CTX, { handoff: true });
  const { id } = JSON.parse(sessionStorage.getItem('small.learn.request'));
  t.mock.timers.tick(29999);
  sessionStorage.setItem(`small.learn.result:${id}`, JSON.stringify({ id, kind: 'research', status: 'added', resourceId: 'wiki-Attention' }));
  t.mock.timers.tick(1);
  assert.deepEqual(await research, { id, kind: 'research', status: 'added', resourceId: 'wiki-Attention', message: 'Added to canvas.' });
});
