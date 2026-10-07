import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBody, streamAsk } from './ask-stream.js';
import { rangeContext } from './scope.js';

globalThis.localStorage = { getItem: (key) => (key === 'small.ws' ? 'w-reading-group' : null) };
let request;
const serve = (response) => { globalThis.fetch = async (path, init) => { request = { path, init }; return response; }; };
// Every byte in its own chunk: frame boundaries and the arrow's three UTF-8 bytes split everywhere.
const byteStream = (text) => new ReadableStream({ start(controller) { for (const byte of new TextEncoder().encode(text)) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
const stream = (text) => new Response(byteStream(text), { headers: { 'Content-Type': 'text/event-stream' } });
const collect = async (options) => { const events = []; await streamAsk({ onEvent: (type, data) => events.push([type, data]), ...options }); return events; };
const NANOGPT = { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: null };

test('frames split anywhere, even inside a character, arrive whole and in order; paper is an event', async () => {
  serve(stream([
    'event: progress\ndata: {"stage":"Reading the graph"}\n\n',
    'event: chunk\ndata: {"text":"Attention → "}\n\n',
    'event: mystery\ndata: {"x":1}\n\n',
    'event: paper\ndata: {"id":"1706.03762","title":"Attention Is All You Need"}\n\n',
    'event: chunk\ndata: {"text":"weights"}\n\n',
    'event: done\ndata: {"ok":true,"threadId":"repochat-1","commit":"3f2a1c9"}\n\n',
  ].join('')));
  const ignored = [], info = console.info;
  console.info = (_label, type) => ignored.push(type);
  const signal = new AbortController().signal;
  try {
    const events = await collect({ path: '/api/learn/ask', body: { message: 'why?' }, signal });
    assert.deepEqual(events.map(([type]) => type), ['progress', 'chunk', 'paper', 'chunk', 'done']);
    assert.equal(events.filter(([type]) => type === 'chunk').map(([, data]) => data.text).join(''), 'Attention → weights');
    assert.deepEqual(events.at(-1)[1], { ok: true, threadId: 'repochat-1', commit: '3f2a1c9' });
  } finally { console.info = info; }
  assert.deepEqual(ignored, ['mystery']);
  assert.equal(request.path, '/api/learn/ask');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.signal, signal);
  assert.deepEqual(request.init.headers, { 'Content-Type': 'application/json', 'X-Small-Workspace': 'w-reading-group' });
  assert.equal(request.init.body, '{"message":"why?"}');
});

test('an ambiguous workspace question comes back as one choose event', async () => {
  const choose = [{ app: 'yolo', hint: 'job, owner a@gmail.com' }, { app: 'yolo-v2', hint: 'job, owner a@gmail.com' }];
  serve(Response.json({ choose }));
  assert.deepEqual(await collect({ path: '/api/ask', body: {} }), [['choose', { choose }]]);
});

test('a JSON error, or a failure that is not a stream, is an error event and never silence', async () => {
  serve(Response.json({ error: 'Repository not found in this workspace' }, { status: 404 }));
  assert.deepEqual(await collect({ path: '/api/learn/ask', body: {} }), [['error', { error: 'Repository not found in this workspace' }]]);
  serve(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
  assert.deepEqual(await collect({ path: '/api/ask', body: {} }), [['error', { error: 'HTTP 502' }]]);
});

test('an attachment rides as multipart beside the JSON body, as ask.jsx:494-498 sends it', async () => {
  serve(stream('event: done\ndata: {"ok":true,"threadId":"t-1"}\n\n'));
  const events = await collect({ path: '/api/ask', body: { message: 'sum this', scope: {} }, file: new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' }) });
  assert.deepEqual(events, [['done', { ok: true, threadId: 't-1' }]]);
  assert.deepEqual(request.init.headers, { 'X-Small-Workspace': 'w-reading-group' });
  assert.deepEqual(JSON.parse(request.init.body.get('body')), { message: 'sum this', scope: {} });
  assert.equal(request.init.body.get('file').name, 'data.csv');
});

test('a project question carries the selected node and the commit it was selected on', () => {
  const selected = { id: 'model_causalselfattention', label: 'CausalSelfAttention', commit: '3f2a1c9' };
  assert.deepEqual(askBody({ scope: { ...NANOGPT, selected }, message: 'Why the mask?', threadId: 'repochat-1' }), {
    scope: { app: 'repo-1a2b3c4d-nanogpt' },
    repository_context: { commit: '3f2a1c9', nodeId: 'model_causalselfattention', label: 'CausalSelfAttention' },
    message: 'Why the mask?', thread_id: 'repochat-1',
  });
  assert.deepEqual(askBody({ scope: NANOGPT, message: 'What is this?' }), { scope: { app: 'repo-1a2b3c4d-nanogpt' }, message: 'What is this?', thread_id: null });
});

test('a whole file in context travels by path, never as a node id (workspace-dock.md)', () => {
  const selected = { id: 'file:train.py', label: 'train.py', kind: 'file', path: 'train.py', line: 1, commit: '3f2a1c9' };
  assert.deepEqual(askBody({ scope: { ...NANOGPT, selected }, message: 'Why does this exist?' }).repository_context, { commit: '3f2a1c9', path: 'train.py', label: 'train.py' });
});

test('a line range travels as identity, {path, start, end} as the Learn chat sends it, never as source text; a large one keeps its whole range', () => {
  assert.deepEqual(askBody({ scope: { ...NANOGPT, selected: rangeContext('model.py', 115, 122, '3f2a1c9') }, message: 'Why?' }).repository_context,
    { commit: '3f2a1c9', range: { path: 'model.py', start: 115, end: 122 }, label: 'model.py:115–122' });
  const body = askBody({ scope: { ...NANOGPT, selected: rangeContext('train.py', 1, 337, '3f2a1c9') }, message: 'Show me the data flow.' });
  assert.deepEqual(body.repository_context.range, { path: 'train.py', start: 1, end: 337 });
  assert.ok(JSON.stringify(body).length < 300, 'no source text rides along');
});

test('workspace and app questions carry no repository context, and Auto sends no model', () => {
  assert.deepEqual(askBody({ scope: { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null }, message: 'What failed today?', model: 'opus-5' }),
    { scope: {}, message: 'What failed today?', thread_id: null, model: 'opus-5' });
  assert.deepEqual(askBody({ scope: { org: 'gmail-com', kind: 'app', slug: 'counter', title: 'counter', selected: null }, message: 'Is it up?' }),
    { scope: { app: 'counter' }, message: 'Is it up?', thread_id: null });
});
