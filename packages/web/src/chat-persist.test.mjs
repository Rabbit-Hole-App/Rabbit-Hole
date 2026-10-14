// Chat persistence across Rabbit Hole navigation (owner brief 2026-10-14): chat-persist.js saves an Auto (Tutor) turn
// through Lane B's routes, and chat-threads.js restores each canvas's ACTIVE thread with loading, empty and error states.
// No network and no model: chat-persist takes an injected call; useChatThread is bundled with esbuild over a one-component
// React stand-in (below) and talks to a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { activeThread, rememberThread, saveMessage, turnSaver } from './chat-persist.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tick = () => new Promise(done => setImmediate(done));
const settle = async () => { for (let i = 0; i < 30; i++) await tick(); };
const fail = status => Object.assign(Error(`HTTP ${status}`), { status });

// A messages route that keeps one row per (thread, client_id), as Lane B's does. lose: client ids whose first write lands
// but whose answer is lost (503), so the retry finds it saved (duplicate). down(n): the nth call fails before any write.
function messagesRoute({ lose = [], down = () => null, wait = null } = {}) {
  const rows = [], calls = [];
  let open = 0, most = 0;
  const call = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method || 'GET', body });
    open++; most = Math.max(most, open);
    try {
      if (wait) await wait(body);
      const refused = down(calls.length, body);
      if (refused) throw fail(refused);
      const threadId = decodeURIComponent(path.match(/threads\/([^/]+)\/messages$/)[1]);
      if (rows.some(row => row.threadId === threadId && row.client_id === body.client_id)) return { threadId, clientId: body.client_id, duplicate: true };
      rows.push({ threadId, ...body });
      if (lose.includes(body.client_id)) { lose.splice(lose.indexOf(body.client_id), 1); throw fail(503); }
      return { threadId, messageId: String(rows.length), clientId: body.client_id, duplicate: false };
    } finally { open--; }
  };
  return { call, rows, calls, most: () => most };
}
const NO_WAIT = [0, 0, 0];

test('an Auto turn saves its question, then its reply, each under its own client id, in the thread and canvas it was sent from', async () => {
  const route = messagesRoute();
  let asked = 0;
  const save = turnSaver({ app: 'canvas-0000000a', threadId: 'canvaschat-t1', turnId: 'turn1', title: 'Why tides?', onAsked: () => asked++, call: route.call, waits: NO_WAIT });
  save.user('Why tides?');
  await save.assistant('The moon pulls the near ocean.');
  assert.deepEqual(route.rows.map(({ threadId, app, client_id, role, content, status, mode, title }) => ({ threadId, app, client_id, role, content, status, mode, title })), [
    { threadId: 'canvaschat-t1', app: 'canvas-0000000a', client_id: 'turn1-u', role: 'user', content: 'Why tides?', status: undefined, mode: 'auto', title: 'Why tides?' },
    { threadId: 'canvaschat-t1', app: 'canvas-0000000a', client_id: 'turn1-a', role: 'assistant', content: 'The moon pulls the near ocean.', status: 'done', mode: 'auto', title: undefined },
  ]);
  assert.equal(asked, 1, 'onAsked once the question is saved');
  assert.ok(route.calls.every(c => c.method === 'POST' && c.path === '/api/learn/chat/threads/canvaschat-t1/messages'));
});

test('a failed save is sent again with the same client id and the server keeps one copy; a duplicate answer is a success', async () => {
  // The question's first write lands but its answer is lost; the reply's first two calls fail before writing.
  const route = messagesRoute({ lose: ['turn2-u'], down: (n, body) => (body.client_id === 'turn2-a' && n <= 4 ? 502 : null) });
  const save = turnSaver({ app: 'canvas-0000000a', threadId: 'canvaschat-t2', turnId: 'turn2', call: route.call, waits: NO_WAIT });
  save.user('Retry me');
  const saved = await save.assistant('Answer');
  assert.equal(saved.duplicate, false);
  assert.deepEqual(route.calls.map(c => c.body.client_id), ['turn2-u', 'turn2-u', 'turn2-a', 'turn2-a', 'turn2-a'], 'every retry reuses its client id');
  assert.deepEqual(route.rows.map(r => r.client_id), ['turn2-u', 'turn2-a'], 'no duplicated turn');
});

test('two saves of one client_id fired back to back: one request in flight at a time, the second after the first, a 200 duplicate is success', async () => {
  const gates = [];
  const route = messagesRoute({ wait: () => new Promise(done => gates.push(done)) });
  const body = { threadId: 'canvaschat-t3', app: 'canvas-0000000a', client_id: 'turn3-u', role: 'user', content: 'Once', mode: 'auto' };
  const first = saveMessage(body, route.call), second = saveMessage(body, route.call);
  await settle();
  assert.equal(route.calls.length, 1, 'the second waits for the first to settle');
  gates.shift()();
  assert.equal((await first).duplicate, false);
  await settle();
  assert.equal(route.calls.length, 2);
  gates.shift()();
  assert.equal((await second).duplicate, true, 'the server already has it: a success');
  assert.equal(route.most(), 1, 'never two in flight');
  assert.equal(route.rows.length, 1);
});

test('a question whose saves all failed is sent once more before the reply; a 4xx (another canvas, 409) is never retried', async () => {
  const flaky = messagesRoute({ down: n => (n <= 4 ? 503 : null) });
  const save = turnSaver({ app: 'canvas-0000000a', threadId: 'canvaschat-t4', turnId: 'turn4', call: flaky.call, waits: NO_WAIT });
  let asked = false;
  await save.user('Hello').catch(() => { asked = true; });
  assert.ok(asked, 'four tries, then the question is given up for now');
  await save.assistant('Hi');
  assert.deepEqual(flaky.rows.map(r => r.client_id), ['turn4-u', 'turn4-a'], 'the question first, under the same client id');

  const wrong = messagesRoute({ down: () => 409 });
  const late = turnSaver({ app: 'canvas-0000000b', threadId: 'canvaschat-t4', turnId: 'turn5', call: wrong.call, waits: NO_WAIT });
  late.user('Q');
  await assert.rejects(late.assistant('A'), /409/);
  assert.deepEqual(wrong.calls.map(c => c.body.client_id), ['turn5-u', 'turn5-u'], 'one try, one more before the reply, and no reply without its question');
});

test('a Stop is saved as interrupted; a late reply stays bound to the canvas and thread it was asked in', async () => {
  const route = messagesRoute();
  const parent = turnSaver({ app: 'canvas-0000000a', threadId: 'canvaschat-parent', turnId: 'p1', call: route.call, waits: NO_WAIT });
  parent.user('Pending question');
  // The learner goes into the hole and asks there before the parent's reply lands.
  const hole = turnSaver({ app: 'canvas-0000000b', threadId: 'canvaschat-hole', turnId: 'h1', call: route.call, waits: NO_WAIT });
  hole.user('Hole question');
  await hole.assistant('Stopped.', 'interrupted');
  await parent.assistant('The late answer');
  const by = threadId => route.rows.filter(r => r.threadId === threadId).map(r => [r.app, r.role, r.content, r.status ?? null]);
  assert.deepEqual(by('canvaschat-parent'), [['canvas-0000000a', 'user', 'Pending question', null], ['canvas-0000000a', 'assistant', 'The late answer', 'done']]);
  assert.deepEqual(by('canvaschat-hole'), [['canvas-0000000b', 'user', 'Hole question', null], ['canvas-0000000b', 'assistant', 'Stopped.', 'interrupted']]);
});

test('the active thread: its id, null when unset or for a canvas the route does not keep one for (404), an error otherwise', async () => {
  const seen = [];
  const call = answer => async (path, options = {}) => { seen.push([path, options.method || 'GET', options.body ? JSON.parse(options.body) : null]); return answer(); };
  assert.equal(await activeThread('canvas-0000000a', call(() => ({ threadId: 'canvaschat-a' }))), 'canvaschat-a');
  assert.equal(await activeThread('canvas-0000000a', call(() => ({ threadId: null }))), null);
  assert.equal(await activeThread('canvas-0000000a', call(() => { throw fail(404); })), null);
  await assert.rejects(activeThread('canvas-0000000a', call(() => { throw fail(500); })), /500/);
  await rememberThread('canvas-0000000a', 'canvaschat-a', call(() => ({ threadId: 'canvaschat-a' })));
  assert.deepEqual(seen.at(-1), ['/api/learn/chat/active', 'PUT', { app: 'canvas-0000000a', thread_id: 'canvaschat-a' }]);
  assert.equal(seen[0][0], '/api/learn/chat/active?app=canvas-0000000a');
});

// ---- useChatThread, over a one-component React stand-in: hooks by call order, effects after each render, a state change
// renders again on a microtask. Enough for a hook; never a component tree.
const FAKE_REACT = `
let slots = [], cursor = 0, hook = null, props, alive = false, queued = false, result, effects = null;
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function render() { cursor = 0; effects = []; result = hook(props); const run = effects; effects = null; for (const effect of run) effect(); }
function schedule() { if (queued || !alive) return; queued = true; queueMicrotask(() => { queued = false; if (alive) render(); }); }
export function useState(init) {
  const i = cursor++;
  if (!(i in slots)) { const slot = { value: typeof init === 'function' ? init() : init }; slot.set = next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; schedule(); } }; slots[i] = slot; }
  return [slots[i].value, slots[i].set];
}
export function useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; }
export function useMemo(make, deps) { const i = cursor++; if (!(i in slots) || !same(slots[i].deps, deps)) slots[i] = { value: make(), deps }; return slots[i].value; }
export const useCallback = (fn, deps) => useMemo(() => fn, deps);
export function useEffect(effect, deps) {
  const i = cursor++, previous = slots[i];
  if (previous && deps && same(previous.deps, deps)) return;
  slots[i] = { deps, cleanup: previous?.cleanup };
  effects.push(() => { previous?.cleanup?.(); const cleanup = effect(); slots[i] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : null }; });
}
export function mount(run, first) {
  slots = []; hook = run; props = first; alive = true; render();
  return { get current() { return result; }, rerender(next) { props = next; render(); }, unmount() { alive = false; for (const slot of slots) slot?.cleanup?.(); } };
}`;
const dir = mkdtempSync(join(tmpdir(), 'chat-persist-')), outfile = join(dir, 'threads.cjs');
await esbuild.build({
  stdin: { contents: "export * from './chat-threads.js'; export { mount } from 'react';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'fake-react', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fake-react' }));
    build.onLoad({ filter: /.*/, namespace: 'fake-react' }, () => ({ contents: FAKE_REACT, loader: 'js' }));
  } }],
});
const T = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} }; // api.js reads the workspace header

// The server as the hook sees it: active threads per canvas, threads with their canvas (ref), activity order and messages.
// hold(method, url): a promise the request waits on; down(method, url): a status to fail with.
function server({ active = {}, threads = {}, hold = () => null, down = () => null } = {}) {
  const calls = [];
  const reply = (body, status = 200) => Response.json(body, { status });
  globalThis.fetch = async (path, options = {}) => {
    const method = options.method || 'GET', url = new URL(path, 'http://local'), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, path: url.pathname, app: url.searchParams.get('app') || url.searchParams.get('ref'), body });
    await hold(method, url);
    const status = down(method, url);
    if (status) return reply({ error: 'Unavailable' }, status);
    if (url.pathname === '/api/learn/chat/active') {
      if (method === 'PUT') { active[body.app] = body.thread_id; return reply({ threadId: body.thread_id }); }
      return reply({ threadId: active[url.searchParams.get('app')] ?? null });
    }
    if (url.pathname === '/api/ask/threads') {
      const rows = Object.entries(threads).filter(([, t]) => t.ref === url.searchParams.get('ref')).sort(([, a], [, b]) => b.at - a.at);
      return reply({ threads: rows.slice(0, Number(url.searchParams.get('limit'))).map(([id, t]) => ({ id, title: t.title })) });
    }
    const id = decodeURIComponent(url.pathname.match(/^\/api\/ask\/threads\/([^/]+)$/)?.[1] || '');
    if (threads[id]) return reply({ id, title: threads[id].title, mode: 'auto', contextRefs: [], draft: null, messages: threads[id].messages });
    return reply({ error: 'Chat not found' }, 404);
  };
  return { calls, active, puts: () => calls.filter(c => c.method === 'PUT' && c.path === '/api/learn/chat/active').map(c => [c.body.app, c.body.thread_id]) };
}
const exchange = (q, a) => [{ messageId: '1', role: 'user', content: q, status: 'done' }, { messageId: '2', role: 'assistant', content: a, status: 'done' }];
const shown = view => view.current.restore.messages.map(m => m.content);

test('REGRESSION (fails on 26892668): returning to a canvas restores its active thread, not the one updated last', async () => {
  server({
    active: { 'canvas-0000000a': 'canvaschat-older' },
    threads: {
      'canvaschat-older': { ref: 'canvas-0000000a', at: 1, title: 'Tides', messages: exchange('Why tides?', 'The moon.') },
      'canvaschat-newer': { ref: 'canvas-0000000a', at: 2, title: 'Waves', messages: exchange('Why waves?', 'Wind.') },
    },
  });
  const view = T.mount(T.useChatThread, 'canvas-0000000a');
  await settle();
  assert.equal(view.current.id, 'canvaschat-older', 'the thread the learner had open');
  assert.deepEqual(shown(view), ['Why tides?', 'The moon.']);
  view.unmount();
});

test('parent, hole and grandchild keep their own conversations across navigation, and a canvas with none set opens its latest', async () => {
  const s = server({
    active: { 'canvas-0000000a': 'canvaschat-p', 'canvas-0000000b': 'canvaschat-h' },
    threads: {
      'canvaschat-p': { ref: 'canvas-0000000a', at: 1, title: 'Parent', messages: exchange('Parent Q', 'Parent A') },
      'canvaschat-h': { ref: 'canvas-0000000b', at: 2, title: 'Hole', messages: exchange('Hole Q', 'Hole A') },
      'canvaschat-g': { ref: 'canvas-0000000c', at: 3, title: 'Grandchild', messages: exchange('Deep Q', 'Deep A') },
    },
  });
  const view = T.mount(T.useChatThread, 'canvas-0000000a');
  await settle();
  assert.deepEqual(shown(view), ['Parent Q', 'Parent A']);
  view.rerender('canvas-0000000b'); await settle();
  assert.deepEqual([view.current.id, ...shown(view)], ['canvaschat-h', 'Hole Q', 'Hole A']);
  view.rerender('canvas-0000000c'); await settle();
  assert.deepEqual([view.current.id, ...shown(view)], ['canvaschat-g', 'Deep Q', 'Deep A'], 'no active thread: its latest');
  assert.deepEqual(s.puts(), [['canvas-0000000c', 'canvaschat-g']], 'which becomes its active one');
  view.rerender('canvas-0000000a'); await settle();
  assert.deepEqual([view.current.id, ...shown(view)], ['canvaschat-p', 'Parent Q', 'Parent A']);
  assert.ok(s.calls.filter(c => c.path === '/api/learn/chat/active' && c.method === 'GET').every(c => /^canvas-0000000[abc]$/.test(c.app)));
  view.unmount();
});

test('loading, empty and failed are three states; Retry restores; a turn sent meanwhile is never replaced', async () => {
  let release, outage = 503;
  server({
    active: { 'canvas-0000000a': 'canvaschat-a', 'canvas-0000000e': 'canvaschat-e' },
    threads: {
      'canvaschat-a': { ref: 'canvas-0000000a', at: 1, title: 'Saved', messages: exchange('Saved Q', 'Saved A') },
      'canvaschat-e': { ref: 'canvas-0000000e', at: 2, title: 'Other', messages: exchange('Other Q', 'Other A') },
    },
    hold: (method, url) => (url.pathname === '/api/learn/chat/active' && method === 'GET' && release === undefined ? new Promise(done => { release = done; }) : null),
    down: (method, url) => (url.pathname === '/api/learn/chat/active' && method === 'GET' ? outage : null),
  });
  const view = T.mount(T.useChatThread, 'canvas-0000000a');
  await settle();
  assert.equal(view.current.status, 'loading');
  assert.equal(T.chatTitle(view.current), 'Loading chat…');
  release();
  await settle();
  assert.equal(view.current.status, 'error', 'a failed fetch is an error, not an empty New chat');
  assert.equal(T.chatTitle(view.current), 'Chat not loaded');
  outage = null;
  view.current.retry();
  await settle();
  assert.deepEqual([view.current.status, T.chatTitle(view.current), ...shown(view)], ['ready', 'Saved', 'Saved Q', 'Saved A']);
  // Back on a canvas whose restore is slow, the learner sends: the restore stands down when it lands.
  release = undefined;
  view.rerender('canvas-0000000e');
  await settle();
  assert.equal(view.current.status, 'loading');
  view.current.claim();
  release();
  await settle();
  assert.deepEqual([view.current.status, view.current.id, shown(view).length], ['ready', null, 0], 'what the learner sees stays');
  // A canvas with no conversation at all is the empty state.
  view.rerender('canvas-0000000f');
  await settle();
  assert.deepEqual([view.current.status, T.chatTitle(view.current)], ['ready', 'New chat']);
  view.unmount();
});

test('History open and a saved turn make a thread the active one; a turn not saved yet does not; liveKey makes a turn late', async () => {
  const s = server({ threads: { 'canvaschat-x': { ref: 'canvas-0000000a', at: 1, title: 'X', messages: exchange('X Q', 'X A') } } });
  const view = T.mount(T.useChatThread, 'canvas-0000000a');
  await settle();
  s.calls.length = 0;
  view.current.newChat();
  await settle();
  const sent = view.current.liveKey();
  view.current.adopt('canvaschat-y', 'Y', { remember: false });
  await settle();
  assert.deepEqual([view.current.id, s.puts().length], ['canvaschat-y', 0], 'Auto adopts its thread at once and saves it as active only once saved');
  view.current.adopt('canvaschat-y', 'Y');
  assert.equal(T.lateEvent(sent, view.current.liveKey()), false, 'adopting keeps the turn on screen');
  await view.current.open('canvaschat-x');
  await settle();
  assert.deepEqual(s.puts(), [['canvas-0000000a', 'canvaschat-y'], ['canvas-0000000a', 'canvaschat-x']]);
  assert.equal(T.lateEvent(sent, view.current.liveKey()), true, 'a turn sent before a History open is late');
  const before = view.current.liveKey();
  view.rerender('canvas-0000000b');
  await settle();
  assert.equal(T.lateEvent(before, view.current.liveKey()), true, 'and before a canvas change');
  const live = view.current.liveKey;
  view.unmount();
  assert.equal(live(), null, 'once the Chat is gone, every turn sent from it is late');
});

test('a saved Stop restores as a stopped reply, never a spinner', () => {
  const restored = T.restoredMessages([{ role: 'assistant', content: '', status: 'interrupted' }, { role: 'assistant', content: 'Partial', status: 'stopped' }, { role: 'assistant', content: 'Done', status: 'done' }]);
  assert.deepEqual(restored.map(m => [m.content, m.status]), [['Stopped.', 'stopped'], ['Partial', 'stopped'], ['Done', 'done']]);
});

test('ask.jsx binds an Auto turn to its canvas and thread at send, saves the question in begin and the reply before the late check', () => {
  const ask = read('ask.jsx');
  assert.match(ask, /const sentKey = chatThread\?\.liveKey\(\), late = \(\) => !!chatThread && lateEvent\(sentKey, chatThread\.liveKey\(\)\);/);
  assert.match(ask, /turnSaver\(\{ app: chat\.canvas, threadId: chatThread\.id \|\| newThreadId\(\), turnId: replyId,/);
  assert.match(ask, /if \(viaTutor && autoSave\) \{ if \(!late\(\)\) chatThread\.adopt\(autoSave\.threadId, askedTitle, \{ remember: false \}\); autoSave\.user\(message\); \}\n\s+if \(late\(\)\) return;/);
  assert.match(ask, /autoSave\?\.assistant\(reply, stopped \? 'interrupted' : 'done'\)[^\n]*\n\s+if \(late\(\)\) return;\n\s+mirror\(reply\);/);
  assert.match(ask, /chatThread\?\.claim\(\);/);
});
