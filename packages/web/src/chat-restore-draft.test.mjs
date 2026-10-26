// The composer against the thread restore (owner decision A, 2026-10-22): changes made while a canvas's INITIAL thread
// restore is pending survive it (chat-outputs-check step 13 typed a line before the saved thread landed and lost it): the draft,
// the attached context and the mode (fix/chat-restore-context). These are UNIT tests over a simplified React hook runner, not
// browser verification; chat-outputs-check step 16 is the browser twin (run by CI).
// useChatThread, useChatDraft and useChatContext are bundled over the React stand-in (fake-react-hooks.mjs) and a fake fetch whose thread
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
  stdin: { contents: "export * from './chat-threads.js'; export * from './chat-draft.js'; export * from './chat-context.js'; export { askMode } from './chat-route.js'; export { mount } from 'react';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'fakes', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fake-react' }));
    build.onLoad({ filter: /.*/, namespace: 'fake-react' }, () => ({ contents: FAKE_REACT, loader: 'js' }));
    build.onResolve({ filter: /context-docs\.js$/ }, () => ({ path: 'context-docs', namespace: 'stub' })); // the canvas's documents and their network calls
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useContextDocs = () => globalThis.__ctx; export const uploadContextDoc = (...a) => globalThis.__upload(...a); export const removeContextDoc = (...a) => globalThis.__remove(...a); export const toggleContextDoc = async () => {};', loader: 'js' }));
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
// A state PUT is applied to the stored thread, so a thread opened again shows what was saved (cloned: a test's fixture is its own).
function server(fixture, active = { [A]: 'canvaschat-saved' }) {
  const calls = [], gates = [], threads = structuredClone(fixture);
  globalThis.fetch = async (path, options = {}) => {
    const method = options.method || 'GET', url = new URL(path, 'http://local'), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, path: url.pathname, body });
    const id = decodeURIComponent(url.pathname.match(/^\/api\/ask\/threads\/([^/]+)$/)?.[1] || '');
    if (method === 'GET' && id) await new Promise(done => gates.push({ id, done }));
    if (url.pathname === '/api/learn/chat/active') return Response.json({ threadId: method === 'PUT' ? body.thread_id : active[url.searchParams.get('app') + (url.searchParams.get('slot') ? `|${url.searchParams.get('slot')}` : '')] ?? null });
    if (/\/state$/.test(url.pathname)) { Object.assign(threads[url.pathname.match(/threads\/([^/]+)\/state/)[1]] || {}, body); return Response.json({ ok: true }); }
    if (threads[id]) return Response.json(threads[id]);
    return Response.json({ error: 'Chat not found' }, { status: 404 });
  };
  const release = async id => { gates.splice(gates.findIndex(gate => gate.id === id), 1)[0].done(); await settle(); };
  const saves = () => calls.filter(c => c.method === 'PUT' && /\/state$/.test(c.path));
  return { calls, release, waiting: () => gates.map(gate => gate.id),
    puts: () => saves().map(c => [c.path.match(/threads\/([^/]+)\/state/)[1], c.body.draft]),
    states: () => saves().map(c => [c.path.match(/threads\/([^/]+)\/state/)[1], c.body]) };
}
// The Chat's thread and composer, and the Table of Contents' own pair, as chat-workspace.jsx connects them.
const pair = ({ canvas }) => {
  const main = H.useChatThread(canvas), composer = H.useChatDraft(canvas, main), context = H.useChatContext(canvas, main);
  const toc = H.useChatThread(canvas, { slot: 'toc' }), tocComposer = H.useChatDraft(`${canvas}.toc`, toc), tocContext = H.useChatContext(canvas, toc);
  return { main, composer, context, toc, tocComposer, tocContext };
};
const open = async (canvas = A) => { store.clear(); globalThis.__ctx = { docs: [], removed: [] }; const view = H.mount(pair, { canvas }); await settle(); return view; };
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

// ---------------------------------------------------------------------------------------------------------------------------------
// Draft precedence (fix/chat-restore-context, 3): a confirmed edit made during THIS restore beats the saved draft whatever the clocks say.
const AHEAD = () => Date.now() + 3600 * 1000; // a saved draft stamped an hour ahead of this browser's clock

test('DRAFT: a saved draft stamped ahead of the local clock does not defeat text typed while the restore is pending', async () => {
  const s = server(saved({ draft: { text: 'the thread\'s draft from a fast clock', command: 'quiz', savedAt: AHEAD() } }));
  const view = await open();
  view.current.composer.setText('typed meanwhile');
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.id, ...draft(view)], ['canvaschat-saved', 'typed meanwhile', null]);
  await close(view);
  assert.deepEqual(s.puts(), [['canvaschat-saved', { text: 'typed meanwhile', command: null }]]);
});

test('DRAFT: clearing the composer while the restore is pending beats a saved draft stamped ahead of the local clock', async () => {
  const s = server(saved({ draft: { text: 'the thread\'s draft from a fast clock', command: null, savedAt: AHEAD() } }));
  const view = await open();
  view.current.composer.setText('oops');
  view.current.composer.setText('');
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.id, ...draft(view)], ['canvaschat-saved', '', null]);
  await close(view);
  assert.deepEqual(s.puts(), [['canvaschat-saved', null]]);
});

test('DRAFT: with no edit, ordinary reconciliation is unchanged: a saved draft ahead of the local copy still wins', async () => {
  const s = server(saved({ draft: { text: 'server draft', command: null, savedAt: AHEAD() } }));
  const view = await open();
  localStorage.setItem(localKey('canvaschat-saved'), JSON.stringify({ text: 'older local copy', command: null, savedAt: 5 }));
  await s.release('canvaschat-saved');
  assert.deepEqual(draft(view), ['server draft', null]);
  await close(view);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Attached context and mode chosen while the initial restore is pending (fix/chat-restore-context, 2). Each case checks the composer's
// final state (chips, mode), what the thread saved, what the next message would send (ask.jsx sends askMode(thread.mode) and
// refsForSend(context.attached)) and what a reopened thread shows.
const card = name => ({ sourceId: `card:${name}`, kind: 'card', name, version: 'h1', range: null });
const [A1, B1, X, T1, Y] = ['A1', 'B1', 'X', 'T1', 'Y'].map(card);
const ids = refs => refs.map(ref => ref.sourceId);
const nextMessage = view => ({ mode: H.askMode(view.current.main.mode), context_refs: ids(H.refsForSend(view.current.context.attached)) });
const reopen = async (s, id = 'canvaschat-saved') => { const view = H.mount(pair, { canvas: A }); await settle(); await s.release(id); return view; };

test('CONTEXT: a chip attached while the restore is pending joins the saved ones; it is saved, sent and there after reopening', async () => {
  const s = server(saved({ contextRefs: [A1] }));
  const view = await open();
  view.current.context.attach(X);
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual(ids(view.current.context.attached), ['card:A1', 'card:X'], 'the saved chip is restored and the new one kept');
  assert.deepEqual(nextMessage(view).context_refs, ['card:A1', 'card:X']);
  await close(view);
  assert.deepEqual(s.states(), [['canvaschat-saved', { contextRefs: [A1, X] }]], 'saved to the resolved thread');
  const again = await reopen(s);
  assert.deepEqual(ids(again.current.context.attached), ['card:A1', 'card:X'], 'and the reopened thread shows both');
  await close(again);
});

test('CONTEXT: a saved chip detached while the restore is pending stays detached; the others still restore', async () => {
  const s = server(saved({ contextRefs: [A1, B1] }));
  const view = await open();
  view.current.context.detach(A1);
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual(ids(view.current.context.attached), ['card:B1']);
  assert.deepEqual(nextMessage(view).context_refs, ['card:B1']);
  await close(view);
  assert.deepEqual(s.states(), [['canvaschat-saved', { contextRefs: [B1] }]]);
  const again = await reopen(s);
  assert.deepEqual(ids(again.current.context.attached), ['card:B1']);
  await close(again);
});

test('CONTEXT: attach then detach while pending does not bring the chip back, and the saved chips restore untouched and unsaved', async () => {
  const s = server(saved({ contextRefs: [A1] }));
  const view = await open();
  view.current.context.attach(X);
  view.current.context.detach(X);
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual(ids(view.current.context.attached), ['card:A1']);
  await close(view);
  assert.deepEqual(s.states(), [], 'nothing changed, so nothing is saved');
});

test('CONTEXT: with no explicit edit the saved chips restore as before; the canvas\'s auto-loaded documents are not an edit', async () => {
  const doc = { id: 'ctx:0123456789ab', name: 'Notes.pdf', kind: 'pdf', size: 1, attached: true, created_at: '2026-10-13 22:00:00' };
  const s = server(saved({ contextRefs: [A1] }));
  const view = await open();
  globalThis.__ctx.docs = [doc]; // switched on in the Files panel: a new conversation follows it until the saved one lands
  view.rerender({ canvas: A });
  await settle();
  assert.deepEqual(ids(view.current.context.attached), ['doc:ctx:0123456789ab'], 'meanwhile the new conversation shows the canvas default');
  await s.release('canvaschat-saved');
  assert.deepEqual(ids(view.current.context.attached), ['card:A1'], 'the saved thread\'s own chips replace it');
  await close(view);
  assert.deepEqual(s.states(), [], 'and restoring saves nothing');

  const t = server(saved({ contextRefs: [A1] }));
  const edited = await open();
  globalThis.__ctx.docs = [doc];
  edited.rerender({ canvas: A });
  edited.current.context.attach(X);
  await settle();
  await t.release('canvaschat-saved');
  assert.deepEqual(ids(edited.current.context.attached), ['card:A1', 'card:X'], 'an explicit attach is kept, the auto-loaded document is not');
  await close(edited);
});

test('CONTEXT: deduplication and the attachment limit still hold when the edits are applied to the saved chips', async () => {
  const s = server(saved({ contextRefs: [A1] }));
  const view = await open();
  view.current.context.attach(A1);
  view.current.context.attach(X);
  view.current.context.attach(X);
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual(ids(view.current.context.attached), ['card:A1', 'card:X'], 'each source once');
  await close(view);

  const full = Array.from({ length: H.MAX_REFS }, (_, n) => card(`full${n}`));
  const t = server(saved({ contextRefs: full }));
  const over = await open();
  over.current.context.attach(X);
  await settle();
  await t.release('canvaschat-saved');
  assert.equal(over.current.context.attached.length, H.MAX_REFS, 'never more than the limit');
  assert.equal(over.current.context.isAttached(X), false);
  await close(over);
});

test('CONTEXT: New chat, a History open, a canvas change and the Table of Contents keep their own chips', async () => {
  const threads = { ...saved({ contextRefs: [A1] }), 'canvaschat-other': thread('canvaschat-other', { contextRefs: [B1] }), 'canvaschat-b': thread('canvaschat-b'), 'canvaschat-toc': thread('canvaschat-toc', { contextRefs: [T1] }) };
  let s = server(threads);
  let view = await open();
  view.current.context.attach(X);
  view.current.main.newChat();
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.id, ids(view.current.context.attached)], [null, []], 'New chat starts with none of the old restore\'s edits');
  await close(view);
  assert.deepEqual(s.states(), []);

  s = server(threads);
  view = await open();
  view.current.context.attach(X);
  const opened = view.current.main.open('canvaschat-other');
  await settle();
  await s.release('canvaschat-other');
  await opened;
  await s.release('canvaschat-saved'); // the initial restore, now stale
  assert.deepEqual([view.current.main.id, ids(view.current.context.attached)], ['canvaschat-other', ['card:B1']], 'the opened thread shows its own chips only');
  await close(view);
  assert.deepEqual(s.states(), []);

  s = server(threads, { [A]: 'canvaschat-saved', [B]: 'canvaschat-b' });
  view = await open();
  view.current.context.attach(X);
  view.rerender({ canvas: B });
  await settle();
  await s.release('canvaschat-saved'); // A's late response
  await s.release('canvaschat-b');
  assert.deepEqual([view.current.main.id, ids(view.current.context.attached)], ['canvaschat-b', []], 'A\'s chip did not migrate to B');
  await close(view);
  assert.deepEqual(s.states(), []);

  s = server(threads, { [A]: 'canvaschat-saved', [`${A}|toc`]: 'canvaschat-toc' });
  view = await open();
  view.current.context.attach(X);
  view.current.tocContext.attach(Y);
  await settle();
  await s.release('canvaschat-saved');
  await s.release('canvaschat-toc');
  assert.deepEqual(ids(view.current.context.attached), ['card:A1', 'card:X'], 'the Chat keeps its own');
  assert.deepEqual(ids(view.current.tocContext.attached), ['card:T1', 'card:Y'], 'the Table of Contents keeps its own');
  await close(view);
  assert.deepEqual(s.states().map(([id]) => id).sort(), ['canvaschat-saved', 'canvaschat-toc']);
});

test('CONTEXT: an upload started while the restore is pending joins the restored conversation when it completes, and nowhere else', async () => {
  const doc = { id: 'ctx:feedfeedfeed', name: 'notes.pdf', created_at: '2026-10-13 22:00:00' };
  let s = server(saved({ contextRefs: [A1] }));
  let finish;
  globalThis.__upload = () => new Promise(done => { finish = done; });
  let view = await open();
  view.current.context.upload({ name: 'notes.pdf' });
  await settle();
  await s.release('canvaschat-saved');
  finish(doc); // completes after the history landed
  await settle();
  assert.deepEqual(ids(view.current.context.attached), ['card:A1', 'doc:ctx:feedfeedfeed']);
  await close(view);
  assert.deepEqual(s.states(), [['canvaschat-saved', { contextRefs: [A1, H.docRef(doc)] }]]);

  s = server(saved({ contextRefs: [A1] }));
  view = await open();
  view.current.context.upload({ name: 'notes.pdf' });
  view.current.main.newChat();
  await settle();
  await s.release('canvaschat-saved');
  finish(doc); // completes in another conversation
  await settle();
  assert.deepEqual([view.current.main.id, ids(view.current.context.attached)], [null, []], 'a late upload never attaches to a different conversation');
  await close(view);
  assert.deepEqual(s.states(), []);
});

test('CONTEXT: removing a document from context while the restore is pending detaches its chip from the restored conversation', async () => {
  const doc = { id: 'ctx:0123456789ab', name: 'Notes.pdf', created_at: '2026-10-13 22:00:00' };
  const s = server(saved({ contextRefs: [A1, H.docRef(doc)] }));
  let finish;
  globalThis.__remove = () => new Promise(done => { finish = done; });
  const view = await open();
  view.current.context.remove(doc);
  await settle();
  await s.release('canvaschat-saved');
  finish();
  await settle();
  assert.deepEqual(ids(view.current.context.attached), ['card:A1']);
  await close(view);
});

test('MODE: the mode chosen while the restore is pending wins over the saved one; it is saved, sent and there after reopening', async () => {
  const s = server(saved({ mode: 'ask' }));
  const view = await open();
  view.current.main.setMode('auto');
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.id, view.current.main.mode, view.current.main.restore.mode], ['canvaschat-saved', 'auto', 'auto']);
  assert.equal(nextMessage(view).mode, 'auto');
  await close(view);
  assert.deepEqual(s.states(), [['canvaschat-saved', { mode: 'auto' }]], 'saved to the resolved thread');
  const again = await reopen(s);
  assert.equal(again.current.main.mode, 'auto');
  await close(again);
});

test('MODE: the latest of several choices wins', async () => {
  const s = server(saved({ mode: 'auto' }));
  const view = await open();
  view.current.main.setMode('tutor');
  view.current.main.setMode('ask');
  await settle();
  await s.release('canvaschat-saved');
  assert.equal(view.current.main.mode, 'ask');
  assert.equal(nextMessage(view).mode, 'ask');
  await close(view);
  assert.deepEqual(s.states(), [['canvaschat-saved', { mode: 'ask' }]]);
});

test('MODE: with no choice the saved mode restores as before, a held mode still wins over it, and nothing is saved', async () => {
  let s = server(saved({ mode: 'ask' }));
  let view = await open();
  await s.release('canvaschat-saved');
  assert.equal(view.current.main.mode, 'ask');
  await close(view);
  assert.deepEqual(s.states(), []);

  s = server(saved({ mode: 'ask' }));
  view = await open();
  view.current.main.holdMode('tutor');
  await settle();
  await s.release('canvaschat-saved');
  assert.equal(view.current.main.mode, 'tutor', 'a hold is not a choice, and it still wins');
  await close(view);
  assert.deepEqual(s.states(), []);
});

test('MODE: New chat, a History open, a canvas change and the Table of Contents keep their own mode', async () => {
  const threads = { ...saved({ mode: 'auto' }), 'canvaschat-other': thread('canvaschat-other', { mode: 'ask' }), 'canvaschat-b': thread('canvaschat-b', { mode: 'ask' }), 'canvaschat-toc': thread('canvaschat-toc', { mode: 'tutor' }) };
  let s = server(threads);
  let view = await open();
  view.current.main.setMode('tutor');
  view.current.main.newChat();
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.id, view.current.main.mode], [null, 'auto'], 'New chat is Auto');
  await close(view);
  assert.deepEqual(s.states(), []);

  s = server(threads);
  view = await open();
  view.current.main.setMode('tutor');
  const opened = view.current.main.open('canvaschat-other');
  await settle();
  await s.release('canvaschat-other');
  await opened;
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.id, view.current.main.mode], ['canvaschat-other', 'ask'], 'the opened thread shows its own mode');
  await close(view);

  s = server(threads, { [A]: 'canvaschat-saved', [B]: 'canvaschat-b' });
  view = await open();
  view.current.main.setMode('tutor');
  view.rerender({ canvas: B });
  await settle();
  await s.release('canvaschat-saved');
  await s.release('canvaschat-b');
  assert.deepEqual([view.current.main.id, view.current.main.mode], ['canvaschat-b', 'ask'], 'A\'s choice did not migrate to B');
  await close(view);
  assert.deepEqual(s.states(), []);

  s = server(threads, { [A]: 'canvaschat-saved', [`${A}|toc`]: 'canvaschat-toc' });
  view = await open();
  view.current.main.setMode('ask');
  await settle();
  await s.release('canvaschat-saved');
  await s.release('canvaschat-toc');
  assert.deepEqual([view.current.main.mode, view.current.toc.mode], ['ask', 'tutor'], 'the Table of Contents keeps its own');
  await close(view);
  assert.deepEqual(s.states(), [['canvaschat-saved', { mode: 'ask' }]]);
});

test('CONTEXT AND MODE together: a chip attached and a mode switched while loading both survive, are saved once and reopen the same', async () => {
  const s = server(saved({ mode: 'tutor', contextRefs: [A1] }));
  const view = await open();
  view.current.context.attach(X);
  view.current.main.setMode('auto');
  await settle();
  await s.release('canvaschat-saved');
  assert.deepEqual([view.current.main.mode, ids(view.current.context.attached)], ['auto', ['card:A1', 'card:X']]);
  assert.deepEqual(nextMessage(view), { mode: 'auto', context_refs: ['card:A1', 'card:X'] });
  await close(view);
  assert.deepEqual(s.states(), [['canvaschat-saved', { contextRefs: [A1, X], mode: 'auto' }]]);
  const again = await reopen(s);
  assert.deepEqual([again.current.main.mode, ids(again.current.context.attached)], ['auto', ['card:A1', 'card:X']]);
  await close(again);
});
