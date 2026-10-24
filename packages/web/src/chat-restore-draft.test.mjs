// The composer draft against the thread restore (owner decision A, 2026-10-22): changes made while a canvas's INITIAL thread
// restore is pending survive it (chat-outputs-check step 13 typed a line before the saved thread landed and lost it).
// useChatThread and useChatDraft are bundled over the React stand-in (fake-react-hooks.mjs) and a fake fetch whose thread
// response is a promise the test resolves by hand, so no timing decides anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { FAKE_REACT } from './fake-react-hooks.mjs';

const tick = () => new Promise(done => setImmediate(done));
const settle = async () => { for (let i = 0; i < 30; i++) await tick(); };

const dir = mkdtempSync(join(tmpdir(), 'chat-restore-')), outfile = join(dir, 'hooks.cjs');
await esbuild.build({
  stdin: { contents: "export * from './chat-threads.js'; export * from './chat-draft.js'; export { mount } from 'react';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'fakes', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fake-react' }));
    build.onLoad({ filter: /.*/, namespace: 'fake-react' }, () => ({ contents: FAKE_REACT, loader: 'js' }));
    build.onResolve({ filter: /chat-context\.js$/ }, () => ({ path: 'chat-context', namespace: 'stub' })); // chat-draft.js needs sameRef only
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const sameRef = () => false;', loader: 'js' }));
  } }],
});
const H = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const store = new Map();
globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };

const A = 'canvas-0000000a', B = 'canvas-0000000b';
const exchange = (q, a) => [{ messageId: '1', role: 'user', content: q, status: 'done' }, { messageId: '2', role: 'assistant', content: a, status: 'done' }];
const thread = (id, extra = {}) => ({ id, title: id, mode: 'auto', contextRefs: [], draft: null, messages: exchange(`${id} Q`, `${id} A`), ...extra });
const saved = (extra = {}) => ({ 'canvaschat-saved': thread('canvaschat-saved', extra) });
const localKey = id => `rh.chat.draft.${A}.${id}`;

// The server. Every GET of a thread waits on a promise the test resolves by hand (release(id)); every request is recorded.
// active: `<canvas>` or `<canvas>|toc` to a thread id.
function server(threads, active = { [A]: 'canvaschat-saved' }) {
  const calls = [], gates = [];
  globalThis.fetch = async (path, options = {}) => {
    const method = options.method || 'GET', url = new URL(path, 'http://local'), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, path: url.pathname, body });
    const id = decodeURIComponent(url.pathname.match(/^\/api\/ask\/threads\/([^/]+)$/)?.[1] || '');
    if (method === 'GET' && id) await new Promise(done => gates.push({ id, done }));
    if (url.pathname === '/api/learn/chat/active') return Response.json({ threadId: method === 'PUT' ? body.thread_id : active[url.searchParams.get('app') + (url.searchParams.get('slot') ? `|${url.searchParams.get('slot')}` : '')] ?? null });
    if (/\/state$/.test(url.pathname)) return Response.json({ ok: true });
    if (threads[id]) return Response.json(threads[id]);
    return Response.json({ error: 'Chat not found' }, { status: 404 });
  };
  const release = async id => { gates.splice(gates.findIndex(gate => gate.id === id), 1)[0].done(); await settle(); };
  return { calls, release, waiting: () => gates.map(gate => gate.id), puts: () => calls.filter(c => c.method === 'PUT' && /\/state$/.test(c.path)).map(c => [c.path.match(/threads\/([^/]+)\/state/)[1], c.body.draft]) };
}
// The Chat's thread and composer, and the Table of Contents' own pair, as chat-workspace.jsx connects them.
const pair = ({ canvas }) => {
  const main = H.useChatThread(canvas), composer = H.useChatDraft(canvas, main);
  const toc = H.useChatThread(canvas, { slot: 'toc' }), tocComposer = H.useChatDraft(`${canvas}.toc`, toc);
  return { main, composer, toc, tocComposer };
};
const open = async (canvas = A) => { store.clear(); const view = H.mount(pair, { canvas }); await settle(); return view; };
const shown = view => view.current.main.restore.messages.map(m => m.content);
const draft = view => [view.current.composer.text, view.current.composer.command];
const close = async view => { view.unmount(); await settle(); }; // unmounting flushes the debounced state PUT

test('REGRESSION: text typed while the initial restore is pending survives it; the history appears; the draft is saved under the resolved thread', async () => {
  const s = server(saved());
  const view = await open();
  assert.deepEqual([view.current.main.status, s.waiting()], ['loading', ['canvaschat-saved']], 'the saved thread is still on its way');
  view.current.composer.setText('/simplify why softmax');
  await settle();
  assert.equal(store.has(localKey('new')), true, 'meanwhile it is kept under the temporary new key');
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.status, view.current.main.id, ...shown(view)], ['ready', 'canvaschat-saved', 'canvaschat-saved Q', 'canvaschat-saved A'], 'the conversation is restored');
  assert.deepEqual(draft(view), ['/simplify why softmax', null], 'and the line typed meanwhile is still in the composer');
  await close(view);
  assert.deepEqual(s.puts(), [['canvaschat-saved', { text: '/simplify why softmax', command: null }]], 'saved to the resolved thread');
  assert.equal(JSON.parse(store.get(localKey('canvaschat-saved'))).text, '/simplify why softmax', 'and under its own key here');
  assert.equal(store.has(localKey('new')), false, 'not left under the temporary new key, where a New chat would show it');
});

test('typing and then clearing everything is an edit: the draft stays empty over the thread\'s own saved draft', async () => {
  const s = server(saved({ draft: { text: 'the thread\'s own draft', command: null, savedAt: 1 } }));
  const view = await open();
  view.current.composer.setText('oops');
  view.current.composer.setText('');
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.id, ...draft(view)], ['canvaschat-saved', '', null]);
  await close(view);
  assert.deepEqual(s.puts(), [['canvaschat-saved', null]], 'an empty draft is saved as none');
});

test('a slash command chosen, or removed, while loading survives the restore', async () => {
  const stored = saved({ draft: { text: 'saved words', command: 'quiz', savedAt: 1 } });
  let s = server(stored);
  let view = await open();
  view.current.composer.setCommand('diagram');
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual(draft(view), ['', 'diagram'], 'the choice made while loading wins over the saved draft');
  await close(view);

  s = server(stored);
  view = await open();
  view.current.composer.setText('mine');
  view.current.composer.setCommand('diagram');
  view.current.composer.setCommand(null);
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual(draft(view), ['mine', null], 'removing the command is an edit too: the saved quiz does not come back');
  await close(view);
});

test('with no edit, the thread\'s saved draft restores as before and nothing is saved', async () => {
  const s = server(saved({ draft: { text: 'saved words', command: 'quiz', savedAt: 1 } }));
  const view = await open();
  assert.deepEqual(draft(view), ['', null]);
  await s.release('canvaschat-saved');
  assert.deepEqual(draft(view), ['saved words', 'quiz']);
  assert.deepEqual(shown(view), ['canvaschat-saved Q', 'canvaschat-saved A']);
  await close(view);
  assert.deepEqual(s.puts(), []);
});

test('New chat before the response returns: the old response cannot replace the new chat, and nothing is saved to the old thread', async () => {
  const s = server(saved());
  const view = await open();
  view.current.composer.setText('typed for the old restore');
  view.current.main.newChat();
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.status, view.current.main.id, shown(view).length], ['ready', null, 0]);
  await close(view);
  assert.deepEqual(s.puts(), []);
});

test('canvas navigation before the response returns: the old canvas\'s response and draft never reach the new canvas', async () => {
  const s = server({ ...saved(), 'canvaschat-b': thread('canvaschat-b') }, { [A]: 'canvaschat-saved', [B]: 'canvaschat-b' });
  const view = await open();
  view.current.composer.setText('typed in A');
  view.rerender({ canvas: B });
  await settle();
  await s.release('canvaschat-saved'); // A's late response
  assert.deepEqual([view.current.main.id, view.current.main.status], [null, 'loading'], 'B is still restoring its own');
  await s.release('canvaschat-b');
  assert.deepEqual([view.current.main.id, ...shown(view)], ['canvaschat-b', 'canvaschat-b Q', 'canvaschat-b A']);
  assert.deepEqual(draft(view), ['', null], 'A\'s line did not migrate');
  await close(view);
  assert.deepEqual(s.puts(), []);
});

test('a History open while the initial restore is pending is the learner\'s choice: its thread and draft replace the edit', async () => {
  const s = server({ ...saved(), 'canvaschat-other': thread('canvaschat-other', { draft: { text: 'other draft', command: null, savedAt: 1 } }) });
  const view = await open();
  view.current.composer.setText('typed meanwhile');
  const opened = view.current.main.open('canvaschat-other');
  await settle();
  await s.release('canvaschat-other');
  await opened;
  await s.release('canvaschat-saved'); // the initial restore, now stale
  assert.deepEqual([view.current.main.id, ...draft(view)], ['canvaschat-other', 'other draft', null]);
  await close(view);
});

test('sending while the restore is pending: claim() still stands the restore down, and the sent line is not brought back', async () => {
  const s = server(saved());
  const view = await open();
  view.current.composer.setText('the line I send');
  view.current.main.claim(); // ask.jsx, at send
  view.current.composer.clear();
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.status, view.current.main.id, shown(view).length], ['ready', null, 0], 'the restore did not replace what the learner sees');
  assert.deepEqual(draft(view), ['', null], 'and the sent line is not in the composer again');
  await close(view);
  assert.deepEqual(s.puts(), []);
});

test('the Table of Contents keeps its own composer: the Chat\'s edit never reaches it, nor its edit the Chat', async () => {
  const threads = { ...saved(), 'canvaschat-toc': thread('canvaschat-toc', { draft: { text: 'toc saved', command: null, savedAt: 1 } }) };
  const active = { [A]: 'canvaschat-saved', [`${A}|toc`]: 'canvaschat-toc' };
  const s = server(threads, active);
  const view = await open();
  view.current.composer.setText('chat words');
  await settle();
  await s.release('canvaschat-saved');
  await s.release('canvaschat-toc');
  assert.deepEqual([view.current.main.id, ...draft(view)], ['canvaschat-saved', 'chat words', null], 'the Chat keeps its edit');
  assert.deepEqual([view.current.toc.id, view.current.tocComposer.text], ['canvaschat-toc', 'toc saved'], 'the Table of Contents restores its own draft');
  view.current.tocComposer.setText('toc edit');
  await settle();
  assert.equal(view.current.composer.text, 'chat words');
  await close(view);
  assert.deepEqual(s.puts().map(([id]) => id).sort(), ['canvaschat-saved', 'canvaschat-toc']);

  // An edit made in the Table of Contents while its restore is pending survives that restore, apart from the Chat's.
  const t = server({ ...threads, 'canvaschat-toc': thread('canvaschat-toc') }, active);
  const again = await open();
  again.current.tocComposer.setText('toc typed meanwhile');
  await settle();
  await t.release('canvaschat-saved');
  await t.release('canvaschat-toc');
  assert.deepEqual([again.current.tocComposer.text, again.current.composer.text], ['toc typed meanwhile', '']);
  await close(again);
});
