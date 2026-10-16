// Learn chat modes, server side (agent-coordination/tasks/chat-workspace-CONTRACT.md A2, A4, B1, B5, B6, B7): the request
// fields, Auto intent, the Tutor syllabus in the journey path shape, and apiAsk's writes and SSE order, run with the real
// askStream against SQLite (repository-schema.sql) and a mocked provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as chatModes from '../src/chat-modes.js';
import { chatFields, contextRefs, courseIntent, resolveMode, validateSyllabus, syllabusPath, chatContext, TUTOR_SYSTEM, TUTOR_OUTLINE_SYSTEM } from '../src/chat-modes.js';
import { outlineRevision } from '../../web/src/learn-outline-model.js';
import { pathOutput } from '../src/agents/learn-journey.js';
import { REQUEST_FIRST } from '../src/agents/learn-tutor.js';
import { CUT_NOTE, DECLINE } from '../src/learn-research.js';
import { WITHHELD } from '../src/canvas-conversation.js';
import { canvasApp, canvasAskSeam } from '../src/canvases.js';
import { contextDocsFetch } from '../src/learn-context-docs.js';
import { LEARN_SYSTEM } from '../src/agents/learn-chat.js';
import { HISTORY_TURNS } from '../src/learn-models.js';
import { CANVAS_CONTEXT_RULES, canvasContextText, validateCanvasContext } from '../src/canvas-context.js';
import { canvasPackage } from './canvas-context-fixture.js';

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

test('chat context: one uploaded PDF rides per turn; every other uploaded-PDF page ref is named only, never as if read', () => {
  const page = (hex, n) => ref({ sourceId: `paper:upload:${hex}`, kind: 'web', name: `Paper ${hex}`, range: { page: n } });
  const refs = [page('aaaaaaaaaaaa', 12), page('aaaaaaaaaaaa', 13), page('bbbbbbbbbbbb', 4), ref({ range: { page: 2 } })];
  const lineOf = (out, text) => out.split('\n').find(line => line.includes(text));
  const read = chatContext('SCOPE', refs, null, 100000, 'upload:aaaaaaaaaaaa');
  // The read paper's pages (its whole PDF rides) say so; the other upload is a label only.
  assert.match(lineOf(read, '{"page":12}'), / - its PDF is included in this turn$/);
  assert.match(lineOf(read, '{"page":13}'), / - its PDF is included in this turn$/);
  assert.match(lineOf(read, 'paper:upload:bbbbbbbbbbbb'), / - named only: its content was not included in this turn, so you have not seen it; say so if the question needs it$/);
  // A context document page is read in full: no coverage note.
  assert.doesNotMatch(lineOf(read, 'doc:ctx:'), /named only|included/);
  // No PDF read (none sent, or an unreadable one): every uploaded page is named only.
  const none = chatContext('SCOPE', refs, null, 100000, null);
  assert.equal(none.split('\n').filter(line => line.includes('paper:upload:') && line.endsWith('say so if the question needs it')).length, 3);
  assert.doesNotMatch(none, /its PDF is included/);
});

// ---------- apiAsk, end to end with the real askStream ----------

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const apiAskSource = source.match(/export async function apiAsk\([^]*?\n\}/)[0].replace(/^export /, '');
const owner = { email: 'owner@example.test', org: 'workspace-a' };
const modules = await Promise.all(['../src/ask.js', '../src/learn-wiki.js', '../src/learn-youtube.js', '../src/learn-outline-tool.js', '../src/learn-context.js', '../src/learn-ask-context.js', '../src/learn-models.js', '../src/learn-paper.js', '../src/learn-media.js', '../src/arxiv.js', '../src/canvas-conversation.js', '../src/learn-context-docs.js', '../src/learn-storage.js', '../src/token.js', '../src/agents/learn-chat.js', '../src/canvas-context.js'].map(path => import(path)));
const baseDeps = Object.fromEntries(modules.flatMap(m => Object.entries(m)).filter(([name]) => name !== 'default'));
// A test double of B4's trailer functions (on this base they are stubs): the wiring is what is under test here.
const fakeMeta = {
  ANSWER_META_SYSTEM: 'ANSWER_META_RULES',
  answerMetaSystem: ({ repository = false } = {}) => (repository ? 'ANSWER_META_RULES REPOSITORY_FOLLOWUPS' : 'ANSWER_META_RULES'),
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

// R4 contract C9 (owner decisions 2A, 3A, 5B): topics gain a description and subtopics for the table of contents; a journey
// stays flat (purpose = description, else objectives), and an old syllabus without either keeps exactly its shape.
test('a syllabus topic may carry a description and up to 6 subtopics; the journey path stays flat', () => {
  const checked = validateSyllabus({ goal: 'Read a tide table', topics: [
    { id: 'a', title: 'Tides', description: ' Why the sea rises and falls twice a day. ', objectives: [], subtopics: [{ title: ' The moon ', description: 'Its pull makes the bulges.' }, { id: 'sun', title: 'The sun' }] },
    { id: 'b', title: 'Tables', objectives: ['Read a height'] },
  ] });
  assert.equal(checked.ok, true, JSON.stringify(checked.errors));
  assert.deepEqual(checked.value.topics[0], { id: 'a', title: 'Tides', description: 'Why the sea rises and falls twice a day.', objectives: [], subtopics: [{ id: 'a.1', title: 'The moon', description: 'Its pull makes the bulges.' }, { id: 'sun', title: 'The sun' }], refs: [] });
  assert.deepEqual(checked.value.topics[1], { id: 'b', title: 'Tables', objectives: ['Read a height'], refs: [] }, 'no description or subtopics: the old shape');
  const path = syllabusPath(checked.value);
  assert.deepEqual(path.sections.map(section => [section.id, section.purpose]), [['a', 'Why the sea rises and falls twice a day.'], ['b', 'Read a height']]);
  assert.equal(pathOutput({ path, concepts_added: { concepts: {}, claims: {} } }, { registry: { concepts: {}, claims: {} }, source: 'draft' }).ok, true);
  const topic = { title: 't', objectives: ['o'] };
  for (const bad of [
    { ...topic, description: 'x'.repeat(241) },
    { ...topic, subtopics: Array.from({ length: 7 }, (_, i) => ({ title: `s${i}` })) },
    { ...topic, subtopics: [{ title: ' ' }] },
    { ...topic, subtopics: [{ title: 'x'.repeat(81) }] },
    { ...topic, subtopics: [{ title: 's', description: 'x'.repeat(241) }] },
    { ...topic, subtopics: [{ id: 'd', title: 's' }, { id: 'd', title: 'u' }] },
    { ...topic, subtopics: 'not a list' },
  ]) assert.equal(validateSyllabus({ goal: 'g', topics: [bad] }).ok, false, JSON.stringify(bad).slice(0, 80));
});

test('Tutor: the model\'s descriptions and subtopics are clipped to their limits and given ids, never a reason to lose the syllabus', async t => {
  const f = fixture(t);
  f.replies.push(`A plan.\n<answer_meta>${JSON.stringify({ syllabus: { goal: 'Read a tide table', topics: [
    { title: 'Tides', description: 'd'.repeat(300), objectives: ['Explain the bulges'], subtopics: [...Array.from({ length: 7 }, (_, i) => ({ title: `Part ${i + 1}`, description: i ? undefined : 'The first part.' })), { title: ' ' }] },
    { title: 'Tables', objectives: ['Read a height'] },
  ] } })}</answer_meta>`);
  const { events } = await f.ask({ message: 'make me a syllabus on tides', mode: 'tutor' });
  const { syllabus } = events.find(e => e.event === 'answer_meta').data;
  assert.equal(syllabus.topics[0].description.length, 240);
  assert.deepEqual(syllabus.topics[0].subtopics.map(u => u.id), ['t1.1', 't1.2', 't1.3', 't1.4', 't1.5', 't1.6']);
  assert.deepEqual(syllabus.topics[0].subtopics[0], { id: 't1.1', title: 'Part 1', description: 'The first part.' });
  assert.deepEqual(syllabus.topics[1], { id: 't2', title: 'Tables', objectives: ['Read a height'], refs: [] });
  assert.match(TUTOR_SYSTEM, /"subtopics"/);
  assert.match(TUTOR_SYSTEM, /"description"/);
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

test('Tutor plans only: one call with no tools, so no reader opens and no card lands; an overlong objective or an untitled topic never loses the syllabus', async t => {
  const f = fixture(t);
  f.replies.push(`A two-topic path.\n<answer_meta>${JSON.stringify({ syllabus: { goal: 'Read a tide table', topics: [{ title: ' ', objectives: ['dropped'] }, { title: 'Tides', objectives: ['x'.repeat(300)] }, { title: 'Spring and neap', objectives: ['Explain spring tides'] }] } })}</answer_meta>`);
  const { events } = await f.ask({ message: 'I am a beginner; make me a syllabus on ocean tides', mode: 'tutor' });
  assert.deepEqual(events.map(e => e.event), ['chunk', 'answer_meta', 'done'], 'no wiki, video, paper, outline or progress event');
  assert.equal(f.calls.length, 1);
  assert.equal('tools' in f.calls[0] || 'tool_choice' in f.calls[0], false, 'no tool is offered, so none can run');
  assert.doesNotMatch(f.calls[0].system, /search_arxiv/, 'the paper research prompt stays out');
  const meta = events[1].data;
  assert.equal(meta.kind, 'syllabus');
  assert.deepEqual(meta.syllabus.topics.map(topic => [topic.id, topic.title, topic.objectives[0].length]), [['t1', 'Tides', 240], ['t2', 'Spring and neap', 20]]);
  assert.match(TUTOR_SYSTEM, /the trailer always carries the syllabus/);
  // Ask keeps its tools: the Wikipedia reader is offered there.
  await f.ask({ message: 'What causes tides?', mode: 'ask' });
  assert.ok(f.calls[1].tools.some(tool => tool.name === 'show_wikipedia'));
});

// R4 owner decisions 4A and 5B, contract C4 and C6: with a table of contents, Tutor's one tool is the outline proposal, made
// against the headings this turn sent (the learner's manual edits included), and the proposal comes back with that
// revision as its base. An ordinary question proposes nothing. Stub model: no paid call.
test('Tutor with contents: the outline proposal is its one tool, the headings ride with ids and descriptions, and the proposal carries the sent revision as base', async t => {
  const f = fixture(t);
  // 'Lunar pull' is the learner's own retitle of a heading the Tutor once called 'The moon'.
  const outline = [{ id: 'h1', level: 1, label: 'Tides', done: true, description: 'Why the sea rises and falls.' }, { id: 'h2', level: 2, label: 'Lunar pull', done: false, description: '' }];
  const revision = outlineRevision(outline);
  f.replies.push({ content: [{ type: 'tool_use', id: 'tu1', name: 'propose_lesson_outline', input: { ops: [{ op: 'add', text: 'The sun', level: 2, parent: 'h1', after: 'h2', description: 'Why spring tides are higher.' }] } }], stop_reason: 'tool_use' });
  f.replies.push('I proposed a subtopic on the sun under Tides; apply it if you want it.\n<answer_meta>{}</answer_meta>');
  const { res, events } = await f.ask({ message: 'why are some tides higher than others?', mode: 'tutor', outline, outlineRevision: revision });
  assert.equal(res.status, 200);
  assert.deepEqual(f.calls[0].tools.map(tool => tool.name), ['propose_lesson_outline'], 'no reader, video or card tool');
  assert.ok(f.calls[0].system.includes(TUTOR_OUTLINE_SYSTEM));
  assert.match(f.calls[0].system, /Most answers propose nothing/);
  const sent = JSON.stringify(f.calls[0].messages);
  assert.match(sent, /Tides \(id \\"h1\\"\)/);
  assert.match(sent, /Why the sea rises and falls\./);
  assert.match(sent, /Lunar pull \(id \\"h2\\"\)/, 'the learner\'s own title is what the Tutor works from');
  assert.deepEqual(events.find(e => e.event === 'outline').data, { ops: [{ op: 'add', text: 'The sun', level: 2, after: 'h2', parent: 'h1', description: 'Why spring tides are higher.' }], base: revision });
  assert.equal(events.find(e => e.event === 'answer_meta').data.syllabus, null, 'no second syllabus beside the contents');
  f.replies.push('Spring tides line up the sun and the moon.\n<answer_meta>{}</answer_meta>');
  const plain = await f.ask({ message: 'what is a spring tide?', mode: 'tutor', outline, outlineRevision: revision });
  assert.equal(plain.events.some(e => e.event === 'outline'), false, 'an ordinary question proposes nothing');
  f.replies.push('A plan.\n<answer_meta>{}</answer_meta>');
  await f.ask({ message: 'make me a syllabus on tides', mode: 'tutor' });
  assert.equal('tools' in f.calls.at(-1), false, 'without contents Tutor still offers no tool');
  assert.equal(f.calls.at(-1).system.includes(TUTOR_OUTLINE_SYSTEM), false);
});

// R4 real-model defect (lead, 2026-10-16): asked from the docked composer to add a topic, the Tutor wrote that it had
// proposed a subtopic, but never called the tool, so no proposal reached the page. A stub replay of that turn matched the
// run's prompt id exactly with the tool offered: the claim was prose. A change exists only as a tool call, the prompt says so,
// and a refused call comes back as not proposed with its reason.
test('Tutor with contents: an add request offers the tool and the rule that only a call proposes; a prose claim is no proposal', async t => {
  const f = fixture(t);
  const outline = [{ id: 'h1', level: 1, label: 'Why real coasts disagree', done: false, description: '' }, { id: 'h2', level: 2, label: 'Resonance and funnelling', done: false, description: '' }];
  f.replies.push('Good addition. I\'ve proposed it as a new subtopic under Why real coasts disagree.\n<answer_meta>{}</answer_meta>');
  const { events } = await f.ask({ message: 'I would also like to learn about tidal bores. Please add that to my course.', mode: 'tutor', canvas_context: canvasPackage(), outline, outlineRevision: outlineRevision(outline) });
  assert.deepEqual(f.calls[0].tools.map(tool => tool.name), ['propose_lesson_outline'], 'the docked-composer Tutor turn is offered the tool');
  assert.match(f.calls[0].system, /A change exists only when propose_lesson_outline was called in this answer and returned proposed/);
  assert.match(f.calls[0].system, /Never say you proposed a change unless that call returned proposed in this answer/);
  assert.match(f.calls[0].system, /call propose_lesson_outline once, before you write your reply/);
  assert.equal(events.some(e => e.event === 'outline'), false, 'a claim in prose proposes nothing');
});

// Owner decision, Release A3 item 1 (stub model, no paid call): the largest syllabus adoption, 84 headings, followed by a
// chat turn - it was refused at 60 before - in Tutor and in Ask; then 121 manual headings, which ride as a count.
test('after the largest syllabus adoption (84 headings) a chat turn sends them whole and Tutor keeps the outline tool', async t => {
  const f = fixture(t);
  const outline = Array.from({ length: 12 }, (_, i) => [{ id: `t${i}`, level: 1, label: `Unit ${i + 1}`, done: false, description: 'd' },
    ...Array.from({ length: 6 }, (_, j) => ({ id: `t${i}-${j}`, level: 2, label: `Part ${j + 1}`, done: false, description: '' }))]).flat();
  assert.equal(outline.length, 84);
  f.replies.push('Unit 12 builds on Unit 11.\n<answer_meta>{}</answer_meta>');
  const tutor = await f.ask({ message: 'how do the last two units connect?', mode: 'tutor', outline, outlineRevision: outlineRevision(outline) });
  assert.equal(tutor.res.status, 200);
  assert.deepEqual(f.calls[0].tools.map(tool => tool.name), ['propose_lesson_outline']);
  assert.match(JSON.stringify(f.calls[0].messages), /Part 6 \(id \\"t11-5\\"\)/, 'the last heading rides');
  f.replies.push('Attention weighs tokens.\n<answer_meta>{}</answer_meta>');
  const ask = await f.ask({ message: 'what is attention?', mode: 'ask', outline, outlineRevision: outlineRevision(outline) });
  assert.equal(ask.res.status, 200);
  assert.match(JSON.stringify(f.calls[1].messages), /Unit 12 \(id \\"t11\\"\)/);
});

test('past 120 headings a chat turn still answers; the model hears the count, Tutor gets no outline tool, and nothing is proposed', async t => {
  const f = fixture(t);
  f.replies.push('Attention weighs tokens.\n<answer_meta>{}</answer_meta>');
  const ask = await f.ask({ message: 'what is attention?', mode: 'ask', outlineOmitted: { count: 121 } });
  assert.equal(ask.res.status, 200);
  assert.equal(ask.events[0].data.text, 'Attention weighs tokens.');
  assert.equal((f.calls[0].tools || []).some(tool => tool.name === 'propose_lesson_outline'), false);
  const sent = JSON.stringify(f.calls[0].messages);
  assert.match(sent, /table of contents has 121 headings, more than the 120 that can be sent, so they were omitted from this request/);
  assert.doesNotMatch(sent, /as the learner sees it:/, 'no empty contents block');
  f.replies.push('The table of contents is too large (121 headings, over 120) for me to edit; you can edit it in the Table of contents panel.\n<answer_meta>{}</answer_meta>');
  const tutor = await f.ask({ message: 'add a section on positional encoding', mode: 'tutor', outlineOmitted: { count: 121 } });
  assert.equal(tutor.res.status, 200);
  assert.equal('tools' in f.calls[1], false, 'Tutor offers no outline tool');
  assert.equal(f.calls[1].system.includes(TUTOR_OUTLINE_SYSTEM), false);
  assert.match(JSON.stringify(f.calls[1].messages), /say once, in one sentence, that the table of contents is too large \(121 headings, over 120\)/);
  assert.equal(tutor.events.some(e => e.event === 'outline'), false);
  const whole = Array.from({ length: 121 }, (_, i) => ({ id: `h${i}`, level: 1, label: 'x', done: false }));
  assert.equal((await f.ask({ message: 'x', outline: whole })).res.status, 400, '121 sent whole is refused');
});

test('a refused outline call reaches the model as not proposed with its reason; a corrected call in the same answer is the proposal', async t => {
  const f = fixture(t);
  const outline = [{ id: 'h1', level: 1, label: 'Why real coasts disagree', done: false, description: '' }, { id: 'h2', level: 2, label: 'Resonance and funnelling', done: false, description: '' }];
  f.replies.push({ content: [{ type: 'tool_use', id: 'tu1', name: 'propose_lesson_outline', input: { ops: [{ op: 'add', text: 'Tidal bores', level: 2, parent: 'invented-id' }] } }], stop_reason: 'tool_use' });
  f.replies.push({ content: [{ type: 'tool_use', id: 'tu2', name: 'propose_lesson_outline', input: { ops: [{ op: 'add', text: 'Tidal bores', level: 2, parent: 'h1', after: 'h2', description: 'A wave that runs up a river on the rising tide.' }] } }], stop_reason: 'tool_use' });
  f.replies.push('I proposed Tidal bores under Why real coasts disagree.\n<answer_meta>{}</answer_meta>');
  const { events } = await f.ask({ message: 'Please add tidal bores to my course.', mode: 'tutor', outline, outlineRevision: outlineRevision(outline) });
  const result = calls => calls.messages.at(-1).content.find(block => block.type === 'tool_result');
  const refused = result(f.calls[1]);
  assert.equal(refused.is_error, false);
  assert.deepEqual(JSON.parse(refused.content[0].text), { proposed: 0, applied: false, error: 'Not proposed: No section invented-id in this outline', note: 'Nothing was shown to the learner. Do not say you proposed this change.' });
  assert.equal(JSON.parse(result(f.calls[2]).content[0].text).proposed, 1);
  assert.equal(events.some(e => e.event === 'progress' && /failed/i.test(e.data.stage)), false, 'a refusal is not shown as a failed retrieval');
  assert.deepEqual(events.find(e => e.event === 'outline').data.ops, [{ op: 'add', text: 'Tidal bores', level: 2, after: 'h2', parent: 'h1', description: 'A wave that runs up a river on the rising tide.' }]);
});

test('outlineRevision rides only beside an outline, as 8 hex digits; a description is at most 240 characters', async t => {
  const f = fixture(t);
  const outline = [{ id: 'h1', level: 1, label: 'Tides', done: false }];
  for (const body of [{ outline, outlineRevision: 'zz' }, { outline, outlineRevision: 42 }, { outlineRevision: outlineRevision(outline) }, { outline: [{ ...outline[0], description: 'x'.repeat(241) }] }, { outline: [{ ...outline[0], description: 7 }] }])
    assert.equal((await f.ask({ message: 'hi', mode: 'ask', ...body })).res.status, 400, JSON.stringify(body).slice(0, 80));
  assert.equal(f.calls.length, 0);
  f.replies.push({ content: [{ type: 'tool_use', id: 'tu1', name: 'propose_lesson_outline', input: { ops: [{ op: 'describe', id: 'h1', description: 'Why the sea moves.' }] } }], stop_reason: 'tool_use' });
  const { events } = await f.ask({ message: 'describe the tides section', mode: 'ask', outline: [{ ...outline[0], description: 'x'.repeat(240) }] });
  assert.deepEqual(events.find(e => e.event === 'outline').data, { ops: [{ op: 'describe', id: 'h1', description: 'Why the sea moves.' }], base: null }, 'an old client sends no revision: base is null');
});

// Whole-canvas context (2026-10-14-whole-canvas-context-OWNER.md): no phrase decides whether the board rides. Ask, Auto
// (answering or entering Tutor), Tutor and an old client send the same block and rules for unseen paraphrases and follow-ups.
test('canvas_context: every mode and any wording carries the same board block and rules; none sent, none added; a malformed one is refused', async t => {
  const f = fixture(t);
  const block = canvasContextText(validateCanvasContext(canvasPackage()));
  const turns = [['ask', 'What am I missing in this canvas?'], ['auto', 'Is this complete?'], ['tutor', 'Review my work'], ['auto', 'make me a course from this board'],
    ['ask', 'Does this contradict anything else here?'], ['auto', 'Hmm, and after that?'], [undefined, 'What should I explore next?']];
  for (const [mode, message] of turns) {
    f.replies.push('Answer.');
    assert.equal((await f.ask({ message, ...(mode ? { mode } : {}), canvas_context: canvasPackage() })).res.status, 200, message);
  }
  assert.equal(f.calls.length, turns.length);
  f.calls.forEach((call, i) => {
    assert.ok(JSON.stringify(call.messages.at(-1)).includes(JSON.stringify(block).slice(1, -1)), `${turns[i][1]}: the block rides whole`);
    assert.ok(call.system.includes(CANVAS_CONTEXT_RULES), `${turns[i][1]}: the rules ride`);
  });
  assert.match(f.calls[3].system, /Tutor mode/, 'Auto entered Tutor: the mode changes the workflow, not the context');
  f.replies.push('Answer.');
  await f.ask({ message: 'What am I missing in this canvas?', mode: 'ask' });
  assert.equal(JSON.stringify(f.calls.at(-1)).includes('CANVAS CONTEXT (built'), false, 'no package: nothing is added');
  assert.equal(f.calls.at(-1).system.includes(CANVAS_CONTEXT_RULES), false);
  const refused = await f.ask({ message: 'q', mode: 'ask', canvas_context: canvasPackage({ excerpts: 'all of it' }) });
  assert.equal(refused.res.status, 400);
  assert.match((await refused.res.json()).error, /^canvas_context: excerpts/);
});

// Topic restriction (2026-10-14-topic-restriction-OWNER.md): the canvas is titled 'Attention'; requests on other subjects in
// every mode get the same request-first system prompt. A declined turn stays in history as a declined turn with its request's
// text withheld (RECHECK.md 6c: the provider's safety check reads the whole history, so resending the text declined a later
// safe question too); the rule judges a clearly safe new request on its own.
test('any subject in Ask, Auto and Tutor gets the request-first rule; a declined turn stays in history with its text withheld', async t => {
  const f = fixture(t);
  const turns = [['ask', 'Explain how a heat pump moves heat'], ['ask', 'What is a Fourier series?'], ['auto', 'show me how vaccines train immunity'], ['tutor', 'Plan a course on medieval trade routes']];
  for (const [mode, message] of turns) { f.replies.push('Answer.'); await f.ask({ message, mode }); }
  for (const call of f.calls) assert.ok(call.system.includes(REQUEST_FIRST));
  assert.equal(f.calls[0].system, f.calls[1].system, 'the subject never changes the Ask prompt');
  assert.doesNotMatch(f.calls.map(c => c.system).join('\n'), /within what the canvas is about/);
  f.replies.push('I can\'t help with that request.');
  const refused = (await f.ask({ message: 'a request the assistant refuses', mode: 'auto' })).events;
  f.replies.push('Answer.');
  await f.ask({ message: 'Explain photosynthesis', mode: 'auto', thread_id: refused.at(-1).data.threadId });
  const after = f.calls.at(-1);
  assert.deepEqual(after.messages.slice(0, -1).map(m => m.content), [WITHHELD, DECLINE], 'the decline stays; the declined text does not');
  assert.equal(JSON.stringify(after).includes('a request the assistant refuses'), false, 'the declined request never rides again');
  assert.ok(after.system.includes(REQUEST_FIRST));
  // A model refusal (stop_reason refusal) stores the same decline, so its request is withheld the same way.
  f.replies.push({ stop_reason: 'refusal', content: [] });
  const second = (await f.ask({ message: 'a second declined request', mode: 'tutor' })).events;
  f.replies.push('Answer.');
  await f.ask({ message: 'Explain how vaccines train the immune system', mode: 'tutor', thread_id: second.at(-1).data.threadId });
  assert.deepEqual(f.calls.at(-1).messages.slice(0, -1).map(m => m.content), [WITHHELD, DECLINE]);
});

// lane-b-real/RESULTS.md: a refusal reached the pane as "No Learn answer returned (refusal; no content)" and a long whole-board
// answer as "cut short" with nothing kept. The chat stream now answers with the decline, or the text it has plus a note.
test('a refused turn answers with the decline and a cut turn keeps its text; both stored as the answer, no error event', async t => {
  const f = fixture(t);
  f.replies.push({ stop_reason: 'refusal', content: [] });
  const refused = (await f.ask({ message: 'a request the model declines', mode: 'tutor' })).events;
  assert.deepEqual(refused.map(e => e.event), ['chunk', 'answer_meta', 'done']);
  assert.equal(refused[0].data.text, DECLINE);
  f.replies.push({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'A long review of the whole board.' }] });
  const cut = (await f.ask({ message: 'Review the whole board', mode: 'ask' })).events;
  assert.equal(cut[0].data.text, `A long review of the whole board.\n\n${CUT_NOTE}`);
  assert.deepEqual(f.rows("SELECT content FROM messages WHERE role = 'assistant' ORDER BY id").map(r => r.content), [DECLINE, `A long review of the whole board.\n\n${CUT_NOTE}`]);
  assert.equal(f.calls[0].max_tokens, 6000);
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
  const described = [{ id: 't1', title: 'Nodes', description: 'What a node holds.', objectives: ['Draw a node'], subtopics: [{ id: 't1.1', title: 'Fields' }], refs: [] }];
  assert.deepEqual((await (await put({ topics: described })).json()).syllabus.topics, described, 'a description and subtopics survive an edit');
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

// materials-remove.md: a document removed from the canvas context still rides for a ref at one page, never for a whole one.
test('pageDocIds names the documents a ref holds at one page, and the ask route sends them as pages', () => {
  const refs = [{ sourceId: 'doc:ctx:aaaaaaaaaaaa', kind: 'doc', range: null }, { sourceId: 'doc:ctx:bbbbbbbbbbbb', kind: 'doc', range: { page: 12 } },
    { sourceId: 'paper:upload:cccccccccccc', kind: 'web', range: { page: 3 } }];
  assert.deepEqual([...chatModes.pageDocIds(refs)], ['ctx:bbbbbbbbbbbb']);
  assert.deepEqual([...chatModes.pageDocIds(null)], []);
  assert.match(readFileSync(new URL('../src/index.js', import.meta.url), 'utf8'), /contextDocumentBlocks\(env, scopedApp, docIds\(chat\?\.contextRefs\), \{ pages: pageDocIds\(chat\?\.contextRefs\) \}\)/);
});

test('a selected graph card rides as a named graph ref: scope only, no range and no text (repo-graph Release 2)', () => {
  const commit = 'a'.repeat(40);
  const [ref] = contextRefs([{ sourceId: `graph:karpathy/nanoGPT@${commit}#model,train`, kind: 'graph', name: 'karpathy/nanoGPT subgraph', version: commit, range: null }]);
  assert.deepEqual(ref, { sourceId: `graph:karpathy/nanoGPT@${commit}#model,train`, kind: 'graph', name: 'karpathy/nanoGPT subgraph', version: commit, range: null });
  assert.throws(() => contextRefs([{ ...ref, text: 'code' }]), /text rides only/);
  assert.throws(() => contextRefs([{ ...ref, sourceId: 'code:x@y:z' }]), /must start with graph:/);
  assert.match(chatContext('', [ref], null, 4000), /\[graph\] "karpathy\/nanoGPT subgraph" sourceId/);
});
