// Learn chat modes, server side (agent-coordination/tasks/chat-workspace-CONTRACT.md A2, A4, B1, B5, B6, B7): the request
// fields, Auto intent, the Tutor syllabus in the journey path shape, and apiAsk's writes and SSE order, run with the real
// askStream against SQLite (repository-schema.sql) and a mocked provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as chatModes from '../src/chat-modes.js';
import { chatFields, contextRefs, courseIntent, resolveMode, validateSyllabus, syllabusPath, chatContext, TUTOR_SYSTEM } from '../src/chat-modes.js';
import { pathOutput } from '../src/agents/learn-journey.js';
import { canvasApp, canvasAskSeam } from '../src/canvases.js';
import { contextDocsFetch } from '../src/learn-context-docs.js';
import { LEARN_SYSTEM } from '../src/agents/learn-chat.js';
import { HISTORY_TURNS } from '../src/learn-models.js';

const ref = (over = {}) => ({ sourceId: 'doc:ctx:0123456789ab', kind: 'doc', name: 'Notes.pdf', version: '2026-10-14 07:00:00', range: null, ...over });

test('request fields: an old client sends none; mode defaults to auto; refs follow A2 limits and shapes', () => {
  assert.equal(chatFields({ message: 'hi' }), null);
  assert.deepEqual(chatFields({ command: null, context_refs: [] }), { mode: 'auto', command: null, contextRefs: [], regenerate: null });
  assert.equal(chatFields({ mode: 'ask' }).contextRefs, null, 'no context_refs: today\'s documents');
  assert.deepEqual(chatFields({ mode: 'tutor', regenerate: { messageId: '812' } }).regenerate, { messageId: 812 });
  for (const body of [{ mode: 'turbo' }, { mode: 'ask', command: 'Diagram!' }, { mode: 'ask', regenerate: { messageId: 'x' } }, { mode: 'ask', context_refs: 'doc' }]) assert.throws(() => chatFields(body), JSON.stringify(body));
  const good = [
    ref(), ref({ range: { page: 3, quote: 'q' } }), ref({ range: { quote: 'passage' } }),
    ref({ sourceId: 'card:shape:a', kind: 'card', text: 'Card body' }), ref({ sourceId: 'group:shape:g', kind: 'group', range: { cardIds: ['shape:a', 'shape:b'] } }),
    ref({ sourceId: 'code:repo@abc:src/x.py', kind: 'code', range: { path: 'src/x.py', start: 10, end: 42 } }),
    ref({ sourceId: 'image:shape:i', kind: 'image' }), ref({ sourceId: 'media:shape:m', kind: 'media', range: { startSec: 12, endSec: 40 } }),
    ref({ sourceId: 'paper:2401.00001', kind: 'web', range: { page: 2 } }), ref({ sourceId: 'wiki:Linked_list', kind: 'web' }),
  ];
  assert.equal(contextRefs(good).length, good.length);
  assert.equal(contextRefs([{ ...ref(), extra: 'dropped' }])[0].extra, undefined);
  const bad = [
    ref({ kind: 'video' }), ref({ sourceId: 'card:x' }), ref({ name: '' }), ref({ name: 'n'.repeat(121) }), ref({ version: 7 }),
    ref({ range: { page: 0 } }), ref({ range: { page: 1, path: 'x' } }), ref({ range: { quote: 'q'.repeat(501) } }),
    ref({ sourceId: 'group:g', kind: 'group', range: { cardIds: Array(51).fill('a') } }), ref({ sourceId: 'code:r@c:p', kind: 'code', range: { path: 'p', start: 9, end: 3 } }),
    ref({ sourceId: 'media:m', kind: 'media', range: { startSec: 5, endSec: 1 } }), ref({ sourceId: 'image:i', kind: 'image', range: { quote: 'x' } }),
    ref({ sourceId: 'web:x', kind: 'web' }), ref({ text: 'docs carry no text' }), ref({ sourceId: 'card:c', kind: 'card', text: 'x'.repeat(8001) }),
  ];
  for (const r of bad) assert.throws(() => contextRefs([r]), JSON.stringify(r).slice(0, 80));
  assert.throws(() => contextRefs(Array(21).fill(ref())), /at most 20/);
  assert.throws(() => contextRefs([ref({ sourceId: `doc:${'é'.repeat(590)}`, version: 'v'.repeat(200), range: { quote: 'é'.repeat(500) } })]), /2 KB/);
  assert.equal(contextRefs([ref({ sourceId: 'card:c', kind: 'card', text: 'x'.repeat(8000) })]).length, 1, 'text does not count toward 2 KB');
  assert.throws(() => contextRefs(Array(5).fill(ref({ sourceId: 'card:c', kind: 'card', text: 'x'.repeat(7000) }))), /32000/);
});

test('Auto: only an explicit course request enters Tutor, across unrelated subjects; a topic word or a question never does', () => {
  const asks = [
    'make me a course on knife skills for home cooking', 'Can you plan a syllabus for tax law basics?', 'build a learning path for linked lists',
    "I'd like a short study plan for music theory", 'Please create a 4 week beginner curriculum on sourdough baking', 'Turn these notes into a course',
    'ok, help me design a curriculum covering capital gains tax', 'I want a course about chord progressions.',
  ];
  for (const text of asks) assert.equal(courseIntent(text), 'course', text);
  const answers = [
    'cooking', 'What is a roux?', 'how do I build a course on tax law?', "I'm taking a course on linked lists, why is insertion O(1)?",
    'Explain the circle of fifths', 'Create a linked list in Python', 'Make pasta carbonara for me step by step', 'Is a syllabus required for tax law exams?',
    'What makes a good curriculum?', 'tax law', 'music theory course', 'Should I take a course on linked lists?',
  ];
  for (const text of answers) assert.notEqual(courseIntent(text), 'course', text);
  assert.equal(courseIntent('I want to learn music theory'), 'maybe');
  assert.deepEqual(resolveMode({ mode: 'auto', command: null }, 'make me a course on knife skills'), { mode: 'tutor', maybe: false });
  assert.deepEqual(resolveMode({ mode: 'auto', command: null }, 'What is a roux?'), { mode: 'ask', maybe: false });
  assert.deepEqual(resolveMode({ mode: 'auto', command: null }, 'I want to learn music theory'), { mode: 'ask', maybe: true });
  assert.equal(resolveMode({ mode: 'ask', command: null }, 'make me a course on tax law').mode, 'ask', 'Ask is never a syllabus');
  assert.equal(resolveMode({ mode: 'tutor', command: 'diagram' }, 'make me a course on tax law').mode, 'ask', 'a command keeps its capability');
  assert.equal(resolveMode({ mode: 'tutor', command: null }, 'linked lists').mode, 'tutor');
});

test('a syllabus is the journey path shape: its version-1 draft passes the journey validator unchanged', () => {
  const refs = [ref(), ref({ sourceId: 'card:shape:a', kind: 'card', name: 'Card', text: 'never stored' })];
  const checked = validateSyllabus({ goal: 'Read a tax return', topics: [
    { id: 'a', title: 'Income', objectives: ['Name the income types'], refs: ['doc:ctx:0123456789ab', 'doc:unknown'] },
    { id: 'b', title: 'Deductions', objectives: ['Tell a deduction from a credit', 'Apply the standard deduction'], refs: [{ sourceId: 'card:shape:a' }] },
  ] }, refs);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.value.topics.map(t => t.refs.map(r => r.sourceId)), [['doc:ctx:0123456789ab'], ['card:shape:a']]);
  assert.equal(checked.value.topics[1].refs[0].text, undefined);
  const path = syllabusPath(checked.value);
  assert.equal(pathOutput({ path, concepts_added: { concepts: {}, claims: {} } }, { registry: { concepts: {}, claims: {} }, source: 'draft' }).ok, true, 'what pathOutput (planPath) accepts');
  assert.equal(path.sections[1].purpose, 'Tell a deduction from a credit; Apply the standard deduction');
  for (const s of [{ topics: [] }, { goal: 'g', topics: [] }, { goal: 'g', topics: [{ title: 't'.repeat(81), objectives: ['o'] }] }, { goal: 'g', topics: [{ title: 't', objectives: [] }] }, { goal: 'g', topics: [{ id: 'x', title: 't', objectives: ['o'] }, { id: 'x', title: 'u', objectives: ['o'] }] }]) {
    assert.equal(validateSyllabus(s).ok, false, JSON.stringify(s).slice(0, 80));
  }
});

test('chat context: summary and refs ride bounded, selection text as evidence, after the canvas scope', () => {
  const out = chatContext('SCOPE', [ref({ sourceId: 'card:c', kind: 'card', name: 'Roux', text: 'Equal parts flour and fat' })], { version: 2, text: 'We discussed sauces.', constraints: ['No butter, ever.'] }, 100000);
  assert.match(out, /^SCOPE\n\n/);
  assert.match(out, /version 2; history, not evidence/);
  assert.match(out, /- No butter, ever\./);
  assert.match(out, /"card:c"/);
  assert.match(out, /Equal parts flour and fat/);
  assert.match(chatContext('SCOPE', [ref({ sourceId: 'card:c', kind: 'card', text: 'x'.repeat(5000) })], null, 1000), /\[attached context truncated\]$/);
  assert.equal(chatContext('SCOPE', [], null, 10), 'SCOPE');
});

// ---------- apiAsk, end to end with the real askStream ----------

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const apiAskSource = source.match(/export async function apiAsk\([^]*?\n\}/)[0].replace(/^export /, '');
const owner = { email: 'owner@example.test', org: 'workspace-a' };
const modules = await Promise.all(['../src/ask.js', '../src/learn-wiki.js', '../src/learn-youtube.js', '../src/learn-outline-tool.js', '../src/learn-context.js', '../src/learn-ask-context.js', '../src/learn-models.js', '../src/learn-paper.js', '../src/learn-media.js', '../src/arxiv.js', '../src/canvas-conversation.js', '../src/learn-context-docs.js', '../src/learn-storage.js', '../src/token.js', '../src/agents/learn-chat.js'].map(path => import(path)));
const baseDeps = Object.fromEntries(modules.flatMap(m => Object.entries(m)).filter(([name]) => name !== 'default'));
// A test double of B4's trailer functions (on this base they are stubs): the wiring is what is under test here.
const fakeMeta = {
  ANSWER_META_SYSTEM: 'ANSWER_META_RULES',
  splitAnswerMeta: text => { const m = String(text).match(/\s*<answer_meta>([^]*?)<\/answer_meta>\s*$/); return m ? { content: text.slice(0, m.index), raw: m[1] } : { content: text, raw: null }; },
  validateAnswerMeta: (raw, { messageId }) => ({ actions: [], followUps: raw ? [{ id: 'f1', text: `next after ${messageId}`, kind: 'next' }] : [] }),
};
const build = (answerMeta = fakeMeta) => {
  const deps = { ...baseDeps, ...chatModes, ...answerMeta, json: (body, status = 200) => Response.json(body, { status }) };
  return new Function(...Object.keys(deps), `${apiAskSource}; return apiAsk;`)(...Object.values(deps));
};

function fixture(t, { migration = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  let schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8').replace(/\r/g, '');
  if (!migration) schema = schema.replace(readFileSync(new URL('../learn-migrations/0019-chat-message-meta.sql', import.meta.url), 'utf8').replace(/\r/g, '').trim(), '');
  sqlite.exec(schema);
  sqlite.exec(readFileSync(new URL('../learn-migrations/0003-canvas-context-documents.sql', import.meta.url), 'utf8'));
  if (!migration) assert.throws(() => sqlite.prepare('SELECT 1 FROM chat_message_meta').get());
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('workspace-a','canvas-0a1b2c3d','owner@example.test','Attention')");
  const objects = new Map(), calls = [], replies = [];
  const env = {
    SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-only',
    DB: { prepare: sql => { throw new Error(`live D1 touched: ${sql}`); } },
    LEARN_MEDIA: { put: async (key, bytes) => { objects.set(key, new Uint8Array(bytes)); }, get: async key => (objects.has(key) ? { arrayBuffer: async () => objects.get(key).buffer } : null), delete: async key => { objects.delete(key); } },
    LEARN_DB: { batch: async statements => Promise.all(statements.map(s => s.run())), prepare: sql => { const statement = sqlite.prepare(sql); return { bind: (...params) => ({
      first: async () => statement.get(...params) || null,
      all: async () => ({ results: statement.all(...params) }),
      run: async () => ({ meta: statement.run(...params) }),
    }) }; } },
  };
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).hostname !== 'api.anthropic.com') return new Response('', { status: 404 });
    calls.push(JSON.parse(init.body));
    const reply = replies.shift() ?? 'Plain answer.'; // a string is a final text turn; an object is a whole provider reply (a tool call)
    return Response.json(typeof reply === 'string' ? { content: [{ type: 'text', text: reply }], stop_reason: 'end_turn' } : reply);
  };
  const seam = () => canvasAskSeam(env, canvasApp(sqlite.prepare("SELECT * FROM canvases WHERE name='canvas-0a1b2c3d'").get(), owner));
  const ask = async (body, apiAsk = build()) => {
    const res = await apiAsk(new Request('https://dev.test/api/learn/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: { app: 'canvas-0a1b2c3d' }, ...body }) }), env, {}, owner, 'learn', seam());
    return { res, events: res.status === 200 ? sse(await res.text()) : null };
  };
  const rows = sql => sqlite.prepare(sql).all();
  const upload = async (name, attached = true) => {
    const form = new FormData(); form.set('app', 'canvas-0a1b2c3d'); form.set('file', new File([new TextEncoder().encode(`${name} body`)], name));
    const canvas = { org: owner.org, name: 'canvas-0a1b2c3d', email: owner.email };
    const doc = (await (await contextDocsFetch(new Request('https://dev.test/api/learn/context', { method: 'POST', body: form }), env, { authorize: async () => canvas })).json()).document;
    if (!attached) sqlite.prepare('UPDATE canvas_context_documents SET attached = 0 WHERE id = ?').run(doc.id);
    return doc;
  };
  return { env, sqlite, calls, replies, ask, rows, upload };
}
const sse = text => text.trim().split('\n\n').map(block => ({ event: block.match(/^event: (.*)$/m)[1], data: JSON.parse(block.match(/^data: (.*)$/m)[1]) }));

test('a Chat turn: stripped chunk, then answer_meta, then done with string ids; every write lands', async t => {
  const f = fixture(t);
  f.replies.push('Recursion calls itself.\n<answer_meta>{"followUps":[]}</answer_meta>');
  const refs = [ref({ sourceId: 'card:shape:a', kind: 'card', name: 'Base case', version: 'h1', text: 'A base case stops recursion' })];
  const { events } = await f.ask({ message: 'What is recursion?', mode: 'ask', command: null, context_refs: refs });
  assert.deepEqual(events.map(e => e.event), ['chunk', 'answer_meta', 'done']);
  assert.equal(events[0].data.text, 'Recursion calls itself.', 'the trailer never streams');
  const [user, assistant] = f.rows('SELECT id, role, content FROM messages ORDER BY id');
  assert.equal(assistant.content, 'Recursion calls itself.', 'the trailer is never stored');
  assert.deepEqual(events[1].data, { messageId: String(assistant.id), actions: [], followUps: [{ id: 'f1', text: `next after ${assistant.id}`, kind: 'next' }], alternatives: [String(assistant.id)], kind: 'answer', syllabus: null });
  assert.equal(events[2].data.userMessageId, String(user.id));
  assert.equal(events[2].data.messageId, String(assistant.id));
  assert.match(events[2].data.threadId, /^canvaschat-/);
  const meta = Object.fromEntries(f.rows('SELECT role, meta_json, alternative_of FROM chat_message_meta').map(r => [r.role, { ...JSON.parse(r.meta_json), alternative_of: r.alternative_of }]));
  assert.deepEqual(meta.user, { mode: 'ask', command: null, contextRefs: refs, alternative_of: null });
  assert.deepEqual(meta.assistant, { version: 1, mode: 'ask', kind: 'answer', contextRefs: refs.map(({ text, ...r }) => r), actions: [], followUps: events[1].data.followUps, syllabus: null, alternative_of: null });
  const [state] = f.rows('SELECT * FROM chat_thread_state');
  assert.equal(state.mode, 'ask');
  assert.deepEqual(JSON.parse(state.context_json), refs.map(({ text, ...r }) => r));
  assert.ok(state.last_activity_at && state.updated_at);
  const call = f.calls[0];
  assert.match(call.system, /ANSWER_META_RULES/);
  assert.doesNotMatch(call.system, /Tutor mode/);
  assert.match(JSON.stringify(call.messages.at(-1)), /A base case stops recursion/, 'the client-resolved selection rides as context');
  assert.match(JSON.stringify(call.messages.at(-1)), /title is a weak hint and may be outdated/);
});

test('an old client is unchanged: no side-table rows, no trailer prompt, done carries the thread only', async t => {
  const f = fixture(t);
  f.replies.push('Old answer <answer_meta>{}</answer_meta>');
  const { events } = await f.ask({ message: 'What is recursion?' });
  assert.deepEqual(events.map(e => e.event), ['chunk', 'done']);
  assert.deepEqual(Object.keys(events[1].data).sort(), ['ok', 'threadId']);
  assert.equal(f.rows('SELECT content FROM messages WHERE role = \'assistant\'')[0].content, 'Old answer <answer_meta>{}</answer_meta>', 'no split without mode');
  assert.equal(f.rows('SELECT * FROM chat_message_meta').length + f.rows('SELECT * FROM chat_thread_state').length, 0);
  assert.equal(f.calls[0].system.startsWith(LEARN_SYSTEM), true);
  assert.doesNotMatch(f.calls[0].system, /ANSWER_META_RULES/);
});

test('doc refs name exactly the context documents that ride; no context_refs keeps the switched-on ones', async t => {
  const f = fixture(t);
  const on = await f.upload('on.txt'), off = await f.upload('off.txt', false);
  const titles = call => call.messages.at(-1).content.filter(b => b.type === 'document').map(b => b.title);
  await f.ask({ message: 'q', mode: 'ask', context_refs: [ref({ sourceId: `doc:${off.id}`, name: 'off.txt' })] });
  assert.deepEqual(titles(f.calls[0]), ['off.txt'], 'a named doc rides even when switched off; the other does not');
  await f.ask({ message: 'q', mode: 'ask', context_refs: [] });
  assert.equal(typeof f.calls[1].messages.at(-1).content, 'string', '[] sends no document');
  await f.ask({ message: 'q', mode: 'ask' });
  assert.deepEqual(titles(f.calls[2]), [on.name]);
  await f.ask({ message: 'q' });
  assert.deepEqual(titles(f.calls[3]), [on.name], 'old client: switched-on documents');
  assert.equal((await f.ask({ message: 'q', mode: 'ask', context_refs: [{ kind: 'video' }] })).res.status, 400);
  assert.equal((await f.ask({ message: 'q', mode: 'nope' })).res.status, 400);
});

test('Tutor: a syllabus answer is kind syllabus with journey-shaped topics; a missing goal is one clarify question', async t => {
  const f = fixture(t);
  const refs = [ref({ name: 'Notes.pdf' })];
  f.replies.push(`Here is a plan.\n<answer_meta>${JSON.stringify({ followUps: [], syllabus: { goal: 'Cook weeknight dinners', topics: [{ title: 'Knife skills', objectives: ['Dice an onion'], refs: ['doc:ctx:0123456789ab', 'doc:invented'] }, { title: 'Sauces', objectives: ['Make a roux'] }] } })}</answer_meta>`);
  const { events } = await f.ask({ message: 'make me a course on cooking', mode: 'auto', context_refs: refs });
  const meta = events.find(e => e.event === 'answer_meta').data;
  assert.equal(meta.kind, 'syllabus');
  assert.deepEqual(meta.syllabus, { journeyId: null, goal: 'Cook weeknight dinners', topics: [
    { id: 't1', title: 'Knife skills', objectives: ['Dice an onion'], refs },
    { id: 't2', title: 'Sauces', objectives: ['Make a roux'], refs: [] },
  ] });
  assert.match(f.calls[0].system, /Tutor mode/);
  const stored = JSON.parse(f.rows("SELECT meta_json FROM chat_message_meta WHERE role = 'assistant'")[0].meta_json);
  assert.equal(stored.mode, 'tutor');
  assert.deepEqual(stored.syllabus, meta.syllabus);
  f.replies.push('What level are you starting from?\n<answer_meta>{}</answer_meta>');
  const clarify = await f.ask({ message: 'plan me a syllabus', mode: 'tutor', thread_id: events.at(-1).data.threadId });
  assert.equal(clarify.events.find(e => e.event === 'answer_meta').data.kind, 'clarify');
  assert.equal(TUTOR_SYSTEM.includes('cooking'), false, 'no topic in the prompt');
});

test('Ask never becomes a syllabus, even with a live journey on the canvas and a syllabus in the trailer', async t => {
  const f = fixture(t);
  f.replies.push(`Sure.\n<answer_meta>${JSON.stringify({ syllabus: { goal: 'g', topics: [{ title: 't', objectives: ['o'] }] } })}</answer_meta>`);
  const { events } = await f.ask({ message: 'make me a course on tax law', mode: 'ask' });
  const meta = events.find(e => e.event === 'answer_meta').data;
  assert.equal(meta.kind, 'answer');
  assert.equal(meta.syllabus, null);
  assert.doesNotMatch(f.calls[0].system, /Tutor mode/);
});

test('regenerate reuses the stored turn, inserts no user message, and history keeps only the newest alternative', async t => {
  const f = fixture(t);
  const refs = [ref({ sourceId: 'card:shape:a', kind: 'card', name: 'Stored card', text: 'stored selection' })];
  f.replies.push('First answer.');
  const first = (await f.ask({ message: 'Why is the sky blue?', mode: 'ask', context_refs: refs })).events;
  const threadId = first.at(-1).data.threadId, firstId = first.at(-1).data.messageId;
  f.replies.push('Second answer.');
  const again = (await f.ask({ message: 'ignored', thread_id: threadId, mode: 'tutor', context_refs: [], regenerate: { messageId: firstId } })).events;
  const call = f.calls[1];
  assert.match(JSON.stringify(call.messages.at(-1)), /Why is the sky blue\?/);
  assert.match(JSON.stringify(call.messages.at(-1)), /stored selection/, 'the stored refs, not the request\'s');
  assert.doesNotMatch(call.system, /Tutor mode/, 'the stored mode, not the request\'s');
  assert.deepEqual(call.messages.length, 1, 'history is the turns before that question');
  assert.equal(f.rows("SELECT count(*) AS n FROM messages WHERE role = 'user'")[0].n, 1);
  const secondId = again.at(-1).data.messageId;
  assert.deepEqual(again.find(e => e.event === 'answer_meta').data.alternatives, [firstId, secondId]);
  assert.equal(again.at(-1).data.userMessageId, first.at(-1).data.userMessageId);
  assert.equal(f.rows(`SELECT alternative_of FROM chat_message_meta WHERE message_id = ${secondId}`)[0].alternative_of, Number(firstId));
  f.replies.push('Third answer.');
  const third = (await f.ask({ message: 'ignored', thread_id: threadId, mode: 'ask', regenerate: { messageId: secondId } })).events;
  assert.deepEqual(third.find(e => e.event === 'answer_meta').data.alternatives, [firstId, secondId, third.at(-1).data.messageId]);
  f.replies.push('Follow-up answer.');
  await f.ask({ message: 'And at sunset?', thread_id: threadId, mode: 'ask' });
  assert.deepEqual(f.calls[3].messages.slice(0, -1).map(m => m.content), ['Why is the sky blue?', 'Third answer.'], 'superseded alternatives are not history');
  assert.equal((await f.ask({ message: 'x', thread_id: threadId, mode: 'ask', regenerate: { messageId: '99999' } })).res.status, 404);
  assert.equal((await f.ask({ message: 'x', mode: 'ask', regenerate: { messageId: firstId } })).res.status, 400);
});

test('a stopped stream stores its partial as status stopped, with no actions or follow-ups', async t => {
  const f = fixture(t);
  f.replies.push('Partial answer.\n<answer_meta>{"followUps":[]}</answer_meta>');
  const res = await build()(new Request('https://dev.test/api/learn/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: { app: 'canvas-0a1b2c3d' }, message: 'q', mode: 'ask' }) }), f.env, {}, owner, 'learn', canvasAskSeam(f.env, canvasApp(f.sqlite.prepare('SELECT * FROM canvases').get(), owner)));
  await res.body.cancel();
  for (let i = 0; i < 50 && !f.rows("SELECT 1 FROM messages WHERE role = 'assistant'").length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  const [assistant] = f.rows("SELECT id, content FROM messages WHERE role = 'assistant'");
  assert.equal(assistant.content, 'Partial answer.');
  for (let i = 0; i < 50 && !f.rows("SELECT 1 FROM chat_message_meta WHERE role = 'assistant'").length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(JSON.parse(f.rows("SELECT meta_json FROM chat_message_meta WHERE role = 'assistant'")[0].meta_json), { version: 1, status: 'stopped', mode: 'ask', contextRefs: [] });
});

test('without migration 0019 a Chat turn still answers and stores its messages', async t => {
  const f = fixture(t, { migration: false });
  f.replies.push('Still here.\n<answer_meta>{}</answer_meta>');
  const { events } = await f.ask({ message: 'q', mode: 'auto', context_refs: [] });
  assert.deepEqual(events.map(e => e.event), ['chunk', 'answer_meta', 'done']);
  assert.equal(events[0].data.text, 'Still here.');
  assert.deepEqual(f.rows('SELECT role, content FROM messages ORDER BY id').map(r => r.content), ['q', 'Still here.']);
  f.replies.push('Again.');
  const next = await f.ask({ message: 'q2', mode: 'ask', thread_id: events.at(-1).data.threadId });
  assert.equal(next.res.status, 200);
  assert.deepEqual(f.calls[1].messages.slice(0, -1).map(m => m.content), ['q', 'Still here.']);
});

test('a long thread asks for a summary in the trailer, stores it versioned, then sends it with the recent turns', async t => {
  const f = fixture(t);
  // The turn after HISTORY_TURNS / 2 full turns is the first to see more than HISTORY_TURNS earlier messages.
  let threadId;
  const last = HISTORY_TURNS / 2 + 1;
  for (let n = 0; n <= last; n++) {
    f.replies.push(`a${n}\n<answer_meta>${JSON.stringify({ summary: { text: `summary ${n}`, constraints: n === last ? ['Use metric units.'] : [] } })}</answer_meta>`);
    threadId = (await f.ask({ message: n === 0 ? 'Never use butter.' : `q${n}`, mode: 'ask', ...(threadId ? { thread_id: threadId } : {}) })).events.at(-1).data.threadId;
  }
  assert.match(f.calls.at(-1).system, /"summary"/);
  assert.doesNotMatch(f.calls.at(-2).system, /"summary"/);
  const summary = JSON.parse(f.rows('SELECT summary_json FROM chat_thread_state')[0].summary_json);
  assert.deepEqual({ version: summary.version, text: summary.text, constraints: summary.constraints }, { version: 1, text: `summary ${last}`, constraints: ['Use metric units.'] });
  assert.equal(summary.upToMessageId, String(f.rows("SELECT max(id) AS id FROM messages WHERE role = 'assistant'")[0].id));
  f.replies.push(`next\n<answer_meta>${JSON.stringify({ summary: { text: 'summary later', constraints: [] } })}</answer_meta>`);
  await f.ask({ message: 'next', mode: 'ask', thread_id: threadId });
  assert.match(JSON.stringify(f.calls.at(-1).messages.at(-1)), new RegExp(`summary ${last}[^]*Use metric units\.`), 'the stored summary and its constraints ride');
  const later = JSON.parse(f.rows('SELECT summary_json FROM chat_thread_state')[0].summary_json);
  assert.equal(later.version, 2);
  assert.deepEqual(later.constraints, ['Use metric units.'], 'a constraint the model dropped is kept');
});

test('PUT syllabus: the owner saves an edited syllabus over the answer meta, validated as the trailer is; anyone else gets 404', async t => {
  const { chatSyllabusFetch } = await import('../src/chat-syllabus-route.js');
  const f = fixture(t);
  const refs = [ref()];
  f.replies.push(`Plan.\n<answer_meta>${JSON.stringify({ syllabus: { goal: 'Learn linked lists', topics: [{ title: 'Nodes', objectives: ['Draw a node'] }] } })}</answer_meta>`);
  const { events } = await f.ask({ message: 'build a learning path for linked lists', mode: 'auto', context_refs: refs });
  const id = events.at(-1).data.messageId;
  const put = (body, user = owner, path = `/api/learn/chat/messages/${id}/syllabus`, method = 'PUT') => chatSyllabusFetch(new Request(`https://dev.test${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), f.env, { identity: async () => user });
  const topics = [{ id: 't2', title: 'Pointers', objectives: ['Follow next'], refs: [refs[0].sourceId, 'doc:other'] }, { id: 't1', title: 'Nodes, renamed', objectives: ['Draw a node', 'Name its fields'], refs: [] }];
  const saved = await put({ topics });
  assert.equal(saved.status, 200);
  const expected = { journeyId: null, goal: 'Learn linked lists', topics: [{ ...topics[0], refs }, topics[1]] };
  assert.deepEqual((await saved.json()).syllabus, expected);
  const stored = JSON.parse(f.rows(`SELECT meta_json FROM chat_message_meta WHERE message_id = ${id}`)[0].meta_json);
  assert.deepEqual(stored.syllabus, expected);
  assert.equal(stored.kind, 'syllabus', 'the rest of the meta is kept');
  assert.equal((await put({ topics: [{ id: 'a', title: 'x'.repeat(81), objectives: ['o'] }] })).status, 400);
  assert.equal((await put({ topics: [] })).status, 400);
  assert.equal((await put({ topics }, { ...owner, email: 'other@example.test' })).status, 404);
  assert.equal((await put({ topics }, owner, '/api/learn/chat/messages/99999/syllabus')).status, 404);
  assert.equal((await put({ topics }, owner, `/api/learn/chat/messages/${events.at(-1).data.userMessageId}/syllabus`)).status, 404, 'a user message has no syllabus');
  assert.equal((await put({ topics }, owner, `/api/learn/chat/messages/${id}/syllabus`, 'POST')).status, 405);
  assert.equal(await chatSyllabusFetch(new Request('https://dev.test/api/learn/ask'), f.env), null);
});

// Live 2026-10-14: the model answered beside a Wikipedia tool call, then closed with only the trailer; the answer was lost.
test('an answer written beside a show tool call survives a final turn that holds only the trailer', async t => {
  const f = fixture(t);
  f.replies.push({ content: [{ type: 'text', text: 'A chord is three or more notes sounded together.' }, { type: 'tool_use', id: 'call-1', name: 'show_wikipedia', input: { title: 'Chord (music)' } }], stop_reason: 'tool_use' },
    '<answer_meta>{"followUps":[]}</answer_meta>');
  const { events } = await f.ask({ message: 'What is a chord?', mode: 'ask', context_refs: [] });
  assert.equal(events.find(e => e.event === 'chunk').data.text, 'A chord is three or more notes sounded together.');
  assert.equal(f.rows("SELECT content FROM messages WHERE role = 'assistant'")[0].content, 'A chord is three or more notes sounded together.');
  assert.equal(events.find(e => e.event === 'answer_meta').data.followUps.length, 1, 'the trailer from the final turn is still read');
});
