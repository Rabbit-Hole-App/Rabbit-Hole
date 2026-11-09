// Learn chat modes, server side (agent-coordination/tasks/chat-workspace-CONTRACT.md A2, A4, B1, B5, B6, B7): the request
// fields, Auto intent, the Tutor syllabus in the journey path shape, and apiAsk's writes and SSE order, run with the real
// askStream against SQLite (repository-schema.sql) and a mocked provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as chatModes from '../src/chat-modes.js';
import { chatFields, contextRefs, resolveMode, chatContext, TUTOR_OUTLINE_SYSTEM } from '../src/chat-modes.js';
import { outlineRevision } from '../../web/src/learn-outline-model.js';
import { REQUEST_FIRST } from '../src/agents/learn-chat.js';
import { CUT_NOTE, DECLINE } from '../src/learn-research.js';
import { WITHHELD } from '../src/canvas-conversation.js';
import { canvasApp, canvasAskSeam, canvasesFetch, validContextRefs } from '../src/canvases.js';
import { refsForSend } from '../../web/src/chat-draft.js';
import { excerptChatRef, quoteOf, regionExcerptCard, textExcerptCard } from './excerpt-ref-fixture.js';
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

test('Auto: a course request is an Ask answer (no syllabus mode); only the table of contents conversation resolves to tutor', () => {
  for (const text of ['make me a course on knife skills for home cooking', 'Can you plan a syllabus for tax law basics?', 'What is a roux?', 'I want to learn music theory'])
    assert.deepEqual(resolveMode({ mode: 'auto', command: null }, text), { mode: 'ask', maybe: false }, text);
  assert.equal(resolveMode({ mode: 'ask', command: null }, 'make me a course on tax law').mode, 'ask', 'Ask is never a syllabus');
  assert.equal(resolveMode({ mode: 'tutor', command: 'diagram' }, 'make me a course on tax law').mode, 'ask', 'a command keeps its capability');
  assert.equal(resolveMode({ mode: 'tutor', command: null }, 'linked lists').mode, 'tutor', 'the table of contents conversation keeps its mode');
  assert.equal(resolveMode({ mode: 'tutor', command: null, contextRefs: [{ kind: 'progress' }] }).mode, 'ask', 'a progress question is a question in every mode');
  assert.equal('courseIntent' in chatModes, false);
  assert.equal('validateSyllabus' in chatModes, false);
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
const modules = await Promise.all(['../src/ask.js', '../src/learn-wiki.js', '../src/learn-youtube.js', '../src/learn-outline-tool.js', '../src/learn-context.js', '../src/learn-ask-context.js', '../src/learn-models.js', '../src/learn-paper.js', '../src/learn-media.js', '../src/arxiv.js', '../src/canvas-conversation.js', '../src/learn-context-docs.js', '../src/learn-storage.js', '../src/token.js', '../src/agents/learn-chat.js', '../src/canvas-context.js', '../src/generation-proposal.js', '../src/chat-capability-route.js', '../src/chat-tools.js'].map(path => import(path)));
const { verifyProposal } = await import('../src/generation-proposal.js');
const baseDeps = Object.fromEntries(modules.flatMap(m => Object.entries(m)).filter(([name]) => name !== 'default'));
// A test double of B4's trailer functions (on this base they are stubs): the wiring is what is under test here.
const fakeMeta = {
  ANSWER_META_SYSTEM: 'ANSWER_META_RULES',
  answerMetaSystem: ({ repository = false } = {}) => (repository ? 'ANSWER_META_RULES REPOSITORY_FOLLOWUPS' : 'ANSWER_META_RULES'),
  splitAnswerMeta: text => { const m = String(text).match(/\s*<answer_meta>([^]*?)<\/answer_meta>\s*$/); return m ? { content: text.slice(0, m.index), raw: m[1] } : { content: text, raw: null }; },
  validateAnswerMeta: (raw, { messageId }) => ({ actions: [], followUps: raw ? [{ id: 'f1', text: `next after ${messageId}`, kind: 'next' }] : [] }),
};
const build = (answerMeta = fakeMeta, extra = {}) => {
  const deps = { ...baseDeps, ...chatModes, ...answerMeta, json: (body, status = 200) => Response.json(body, { status }), ...extra };
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

const NL = String.fromCharCode(10);
test('a slash command turn stores and sends no actions or follow-ups; a plain question in the same thread still does', async t => {
  const f = fixture(t);
  f.replies.push('Here is a practice task.' + NL + '<answer_meta>{"followUps":[{"text":"x"}]}</answer_meta>', 'Recursion calls itself.' + NL + '<answer_meta>{"followUps":[{"text":"x"}]}</answer_meta>');
  const command = await f.ask({ message: 'Recursion', mode: 'ask', command: 'practice', context_refs: [] });
  assert.deepEqual(command.events.find(e => e.event === 'answer_meta').data.followUps, []);
  const plain = await f.ask({ message: 'What is recursion?', mode: 'ask', command: null, context_refs: [] });
  assert.equal(plain.events.find(e => e.event === 'answer_meta').data.followUps.length, 1, 'an ordinary answer keeps its follow-ups');
  const stored = f.rows("SELECT meta_json FROM chat_message_meta WHERE role = 'assistant' ORDER BY message_id").map(r => JSON.parse(r.meta_json));
  assert.deepEqual([stored[0].actions, stored[0].followUps], [[], []]);
  assert.equal(stored[1].followUps.length, 1);
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
  assert.equal((f.calls.at(-1).tools || []).some(tool => tool.name === 'propose_lesson_outline'), false, 'without contents Tutor offers no outline tool');
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
  assert.equal((f.calls[1].tools || []).some(tool => tool.name === 'propose_lesson_outline'), false, 'Tutor offers no outline tool');
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
  assert.doesNotMatch(f.calls[3].system, /Tutor mode/, 'a course request in Auto is an ordinary answer (no syllabus mode)');
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
  assert.deepEqual([...chatModes.pageDocIds(refs).keys()], ['ctx:bbbbbbbbbbbb']);
  assert.deepEqual([...chatModes.pageDocIds(null).keys()], []);
  assert.match(readFileSync(new URL('../src/index.js', import.meta.url), 'utf8'), /contextDocumentBlocks\(env, scopedApp, docIds\(chat\?\.contextRefs\), \{ pages: pageDocIds\(chat\?\.contextRefs\), query: message \}\)/);
});

test('a selected graph card rides as a named graph ref: scope only, no range and no text (repo-graph Release 2)', () => {
  const commit = 'a'.repeat(40);
  const [ref] = contextRefs([{ sourceId: `graph:karpathy/nanoGPT@${commit}#model,train`, kind: 'graph', name: 'karpathy/nanoGPT subgraph', version: commit, range: null }]);
  assert.deepEqual(ref, { sourceId: `graph:karpathy/nanoGPT@${commit}#model,train`, kind: 'graph', name: 'karpathy/nanoGPT subgraph', version: commit, range: null });
  assert.throws(() => contextRefs([{ ...ref, text: 'code' }]), /text rides only/);
  assert.throws(() => contextRefs([{ ...ref, sourceId: 'code:x@y:z' }]), /must start with graph:/);
  assert.match(chatContext('', [ref], null, 4000), /\[graph\] "karpathy\/nanoGPT subgraph" sourceId/);
});

// Imported files (canvas-file-imports.md section 6; owner acceptance 3d): every mode that reaches /api/learn/ask - Ask, explicit
// Tutor and Auto (which the client routes here whenever a file is attached, chat-route.js fileTurn) - resolves the turn's file
// refs and sends their excerpts and coverage to the model. Tutor consumes them; nothing is dropped. fileContext is a double
// here: file-context.test.js covers what it reads; this covers that apiAsk calls it and sends what it returns.
test('file refs ride Ask, explicit Tutor and Auto turns: the excerpt and its coverage reach the model', async t => {
  const f = fixture(t);
  const FILE = { sourceId: `file:fs_${'a'.repeat(24)}@${'b'.repeat(64)}`, kind: 'file', name: 'sales.xlsx', version: '', range: { sheet: 'Q1' } };
  const seen = [];
  const fileContext = async (req, env, refs, options) => {
    seen.push({ refs, options });
    return { coverage: new Map([[`${FILE.sourceId}|${JSON.stringify(FILE.range)}`, 'extracted']]), blocks: ['Extracted text of "sales.xlsx": [Q1!A1:B3] Jan | 10'] };
  };
  for (const mode of ['ask', 'tutor', 'auto']) {
    f.replies.push('An answer.\n<answer_meta>{}</answer_meta>');
    const { res } = await f.ask({ message: 'what grew in Q1?', mode, context_refs: [FILE], member_board: 'b-1' }, build(fakeMeta, { fileContext }));
    assert.equal(res.status, 200, mode);
    const sent = JSON.stringify(f.calls.at(-1));
    assert.match(sent, /\[Q1!A1:B3\] Jan \| 10/, `${mode}: the excerpt reaches the model`);
    assert.match(sent, /extracted: its text for this range is included below/, `${mode}: its coverage is said`);
  }
  assert.equal(seen.length, 3);
  assert.deepEqual(seen[1].refs, [FILE], 'the Tutor turn asked for the file ref');
  assert.deepEqual(seen[1].options, { user: owner, app: 'canvas-0a1b2c3d', member: 'b-1' });
});

// Progress questions (Tutor Task 10, C:/s/spec/tutor-workflow/draft.md): a progress ref rides Ask, Tutor and Auto turns as a
// question. The learner's own records for its scope reach the model, read-only; the Tutor turn plans no syllabus; the ref
// stays with the conversation; nothing is assessed. The resolver is real (learn-progress-context.test.js covers its rules).
test('a progress ref rides every mode as a read-only question: its evidence reaches the model, no syllabus, nothing assessed', async t => {
  const f = fixture(t);
  const { applyCoachingAction, readCoachingState } = await import('../src/learn-coaching-store.js');
  const { acceptAttempt, claimAssessment, commitAssessment } = await import('../src/learn-attempt-store.js');
  const { progressQuestionContext } = await import('../src/learn-progress-context.js');
  const actor = { org: owner.org, userId: 'u-owner-1', app: 'canvas-0a1b2c3d', board: 'main' };
  let n = 0;
  const act = async (action, payload) => applyCoachingAction(f.env, actor, { actionId: `a-${++n}`, expectedRevision: (await readCoachingState(f.env, actor)).revision, action, payload });
  const goalId = (await act('create_goal', { label: 'KNN', criteria: [{ criterionId: 'vote', label: 'Explain the majority vote', requirement: 'Explain why the class wins', requiresReasoning: true }] })).state.activeGoalId;
  const state = (await act('activate_activity', { activity: { goalId, objective: 'Vote', prompt: 'Predict and explain', responseKind: 'text', criterionRefs: [{ criterionId: 'vote', version: 1 }] } })).state;
  const activity = state.activities.find(a => a.activityId === state.activeActivityId);
  const saved = await acceptAttempt(f.env, actor, { activityId: activity.activityId, activityRevision: 1, submissionKey: 'answer-0001', submittedContent: { text: 'A wins because two of three are A.' }, sourceRefs: [], assistanceRefs: ['hint-1'] });
  const token = await claimAssessment(f.env, actor, saved.assessmentId);
  await commitAssessment(f.env, actor, { assessmentId: saved.assessmentId, token, attemptId: saved.attemptId, goalId, status: 'completed', observations: [{ criterionId: 'vote', criterionVersion: 1, fit: 'met', reasoning: 'supported', assistance: 'assisted', validity: 'valid', application: 'not_assessed' }] });
  const PROGRESS = { sourceId: `progress:${goalId}`, kind: 'progress', name: 'KNN · Explain the majority vote', version: '1', range: { goalRefs: [{ goalId, scopeVersion: 1 }], criterionRefs: [{ criterionId: 'vote', version: 1 }], dimensions: [], observationIds: [], summaryRevision: 1 } };
  const before = JSON.stringify(f.rows('SELECT * FROM learn_assessments').concat(f.rows('SELECT * FROM learn_observations')));
  const app = { ...canvasApp(f.sqlite.prepare("SELECT * FROM canvases WHERE name='canvas-0a1b2c3d'").get(), owner), user_id: actor.userId };
  const apiAsk = build(fakeMeta, { progressQuestionContext });
  for (const mode of ['ask', 'tutor', 'auto']) {
    f.replies.push('Your explanation was right after a hint.\n<answer_meta>{}</answer_meta>');
    const res = await apiAsk(new Request('https://dev.test/api/learn/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: { app: 'canvas-0a1b2c3d' }, message: 'make me a course on why this says with help', mode, context_refs: [PROGRESS] }) }), f.env, {}, owner, 'learn', canvasAskSeam(f.env, app));
    assert.equal(res.status, 200, mode);
    await res.text();
    const sent = JSON.stringify(f.calls.at(-1));
    assert.match(sent, /PROGRESS QUESTION \(read-only\)/, `${mode}: the progress block reaches the model`);
    assert.match(sent, /fit met, reasoning supported, help assisted/, `${mode}: the learner's own observation is in it`);
    assert.doesNotMatch(sent, /Tutor mode/, `${mode}: a progress question never plans a syllabus, even worded as a course request`);
  }
  assert.equal(JSON.stringify(f.rows('SELECT * FROM learn_assessments').concat(f.rows('SELECT * FROM learn_observations'))), before, 'nothing was assessed');
  const metas = f.rows("SELECT meta_json FROM chat_message_meta WHERE role = 'user'").map(r => JSON.parse(r.meta_json));
  assert.deepEqual(metas.map(m => [m.mode, m.contextRefs[0].sourceId]), [['ask', PROGRESS.sourceId], ['tutor', PROGRESS.sourceId], ['auto', PROGRESS.sourceId]], 'the chosen mode is kept and the scope stays with the conversation');
  // A malformed scope is refused before anything runs; the thread state accepts a valid progress ref.
  assert.throws(() => contextRefs([{ ...PROGRESS, range: { ...PROGRESS.range, owner: 'u-owner-1' } }]), /question scope only/);
  assert.throws(() => contextRefs([{ ...PROGRESS, range: { ...PROGRESS.range, observationIds: Array.from({ length: 25 }, (_, i) => `ob_${i}`) } }]), /at most 24 observations/);
  assert.equal(validContextRefs([PROGRESS]), true);
  assert.equal(validContextRefs([{ ...PROGRESS, range: null }]), false);
});

// PDF excerpts (C:/s/spec/pdf-excerpts/contract.md "Chat"): payload tests only - they prove what reaches the model request,
// never that a model understood a figure. An image file ref's picture rides as an image block in the user message, and a
// text excerpt's 8,000 verbatim characters ride whole; past the cap it is cut and the model is told.
test('a region crop file ref sends its picture as an image block on Ask, Tutor and Auto', async t => {
  const f = fixture(t);
  const CROP = { sourceId: `file:fs_${'c'.repeat(24)}@${'d'.repeat(64)}`, kind: 'file', name: 'Paper, page 3 excerpt.png', version: '', range: null };
  const picture = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
  const fileContext = async () => ({ coverage: new Map([[`${CROP.sourceId}|null`, 'image included']]), blocks: [], images: [{ type: 'text', text: 'Image "Paper, page 3 excerpt.png":' }, picture] });
  for (const mode of ['ask', 'tutor', 'auto']) {
    f.replies.push('An answer.\n<answer_meta>{}</answer_meta>');
    assert.equal((await f.ask({ message: 'what does this figure show?', mode, context_refs: [CROP] }, build(fakeMeta, { fileContext }))).res.status, 200, mode);
    const content = f.calls.at(-1).messages.at(-1).content;
    assert.deepEqual(content.filter(block => block.type === 'image'), [picture], `${mode}: the image block is in the model request`);
    assert.match(JSON.stringify(content), /image included: the image itself is attached to this turn/, `${mode}: its coverage is said`);
  }
});

test('an excerpt ref: 8,000 verbatim characters reach the model whole, framed as only an excerpt; past the cap it says partial', async t => {
  const f = fixture(t);
  const exact = Array.from({ length: 1000 }, (_, i) => `w${String(i).padStart(4, '0')} ...`).join('').slice(0, 8000);
  assert.equal(exact.length, 8000);
  const text = `Verbatim excerpt from "Attention.pdf", page xii:\n${exact}\n\nLearner note: compare with the figure`;
  const EXCERPT = { sourceId: `excerpt:pdfx_${'1'.repeat(24)}`, kind: 'excerpt', name: 'Attention.pdf · p. xii', version: '', range: { page: 12 }, text };
  f.replies.push('An answer.\n<answer_meta>{}</answer_meta>');
  assert.equal((await f.ask({ message: 'explain this', mode: 'ask', context_refs: [EXCERPT] })).res.status, 200);
  const last = f.calls.at(-1).messages.at(-1).content, sent = typeof last === 'string' ? last : last.map(block => block.text || '').join('');
  assert.ok(sent.includes(text), 'the whole excerpt text, untruncated');
  assert.match(sent, /- \[excerpt\] "Attention\.pdf · p\. xii" sourceId "excerpt:pdfx_1{24}" range \{"page":12\} - excerpt: only this excerpt of the document is included below/);
  assert.doesNotMatch(sent, /truncated/);
  // Over the per-excerpt cap: cut, and both the attachment line and the content say so.
  const [cut] = contextRefs([{ ...EXCERPT, text: 'y'.repeat(chatModes.EXCERPT_TEXT + 5) }]);
  assert.deepEqual(cut.cut, { kept: chatModes.EXCERPT_TEXT, of: chatModes.EXCERPT_TEXT + 5 });
  const told = chatContext('', [cut], null, 100000);
  assert.match(told, /partially included: only the first 12000 of its 12005 characters are included below/);
  assert.match(told, /\[excerpt truncated\]$/);
  assert.deepEqual(chatModes.bareRefs([cut]), [{ sourceId: EXCERPT.sourceId, kind: 'excerpt', name: EXCERPT.name, version: '', range: { page: 12 } }], 'stored refs carry identity only');
  // Validation: the id shape and the page range; a pinned excerpt saves with its text.
  assert.throws(() => contextRefs([{ ...EXCERPT, sourceId: 'excerpt:x' }]), /excerpt:pdfx_<24 hex>/);
  assert.throws(() => contextRefs([{ ...EXCERPT, range: { page: 0 } }]), /malformed excerpt range/);
  assert.equal(validContextRefs([EXCERPT]), true);
  assert.equal(validContextRefs([{ ...EXCERPT, sourceId: 'excerpt:nope' }]), false);
});

// Review 2026-10-20 (P2): a turn stored its refs in the thread state as identity only, so a reopened thread's excerpt chip
// had no quote to send and no source to open. Attach, send, reopen as a fresh session (the thread read back from the
// database), then the follow-up: its model request carries the exact quote and the note.
test('a sent PDF excerpt chip comes back with its quote, note and source, and the follow-up sends them', async t => {
  const f = fixture(t);
  f.env.CONTROL_PLANE = { fetch: async () => Response.json({ org: owner.org, email: owner.email, orgName: 'A', user_id: 'u-1', apps: [] }) };
  const exact = quoteOf(2000), attached = [excerptChatRef(textExcerptCard(exact)), excerptChatRef(regionExcerptCard())];
  const textRef = attached[0];
  f.replies.push('First answer.\n<answer_meta>{}</answer_meta>');
  const first = await f.ask({ message: 'explain this', mode: 'ask', context_refs: refsForSend([textRef]) });
  assert.equal(first.res.status, 200);
  assert.ok(lastText(f.calls.at(-1)).includes(exact), 'the first turn sends the quote');
  const threadId = first.events.at(-1).data.threadId;
  // Nothing of the browser survives: the thread is read back from the server.
  const opened = await (await canvasesFetch(new Request(`https://dev.test/api/ask/threads/${threadId}`), f.env)).json();
  assert.deepEqual(opened.contextRefs, [textRef], 'restored as attached: text (quote and note) and the reader ref');
  assert.equal(opened.contextRefs[0].open.range.excerpt.id, textRef.open.range.excerpt.id);
  f.replies.push('Second answer.\n<answer_meta>{}</answer_meta>');
  assert.equal((await f.ask({ message: 'and what follows from it?', mode: 'ask', thread_id: threadId, context_refs: refsForSend(opened.contextRefs) })).res.status, 200);
  const followUp = lastText(f.calls.at(-1));
  assert.ok(followUp.includes(exact), 'the follow-up carries the exact quote');
  assert.ok(followUp.includes('Learner note: Compare with the figure on page 4'), 'and the note');
  assert.doesNotMatch(followUp, /named only: its text was not sent/);
  // The message history keeps identity only; the reader ref never reaches the model or a message's meta.
  for (const { meta_json } of f.rows('SELECT meta_json FROM chat_message_meta')) assert.ok(!meta_json.includes('"open"'), meta_json.slice(0, 120));
  for (const call of f.calls) assert.ok(!JSON.stringify(call).includes('"rects"'), 'no anchor in a model request');
  // A region chip (its crop's file ref) keeps its reader ref through a state save as well.
  const state = await canvasesFetch(new Request(`https://dev.test/api/learn/chat/threads/${threadId}/state`, { method: 'PUT', body: JSON.stringify({ contextRefs: attached }) }), f.env);
  assert.equal(state.status, 200);
  assert.deepEqual((await (await canvasesFetch(new Request(`https://dev.test/api/ask/threads/${threadId}`), f.env)).json()).contextRefs, attached);
});

function lastText(call) { const last = call.messages.at(-1).content; return typeof last === 'string' ? last : last.map(block => block.text || '').join(''); }

// ---------- UI-15 / MOT-20: a generation proposal is a chat turn (generation-proposal.js) ----------

const MOTION_ENV = { MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48), MOTION_ESTIMATE_USD: '1.00', MOTION_MAX_CHARGE_USD: '3.50', MOTION_JOB_RESERVATION_USD: '8.96' };
const WATER = 'Sunlight warms a body of water, causing evaporation. Moist air rises and cools, forming droplets that gather into clouds. The droplets grow and fall as rain. Water collects again, completing the cycle.';
const proposeCall = (id, over = {}) => ({ content: [{ type: 'tool_use', id, name: 'propose_generation', input: { command: 'motion', title: 'Water cycle: evaporation to rain', description: WATER, settings: { duration_seconds: 10, audio: false }, ...over } }], stop_reason: 'tool_use' });

test('a /motion chat turn proposes on the chat path: one model turn, the signed card in answer_meta and in the answer meta; nothing generated', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV);
  f.replies.push(proposeCall('tu1'), 'Here is a 10-second video proposal.\n<answer_meta>{}</answer_meta>');
  const { res, events } = await f.ask({ message: 'explain the water cycle', mode: 'ask', command: 'motion', generation: { motion: { concept: 'Weather' } } });
  assert.equal(res.status, 200);
  assert.deepEqual(f.calls[0].tools.map(tool => tool.name), ['propose_generation'], 'a /motion turn: the proposal tool alone, no research');
  assert.ok(f.calls[0].system.includes('This turn is a /motion request'), 'the model is told what the turn is');
  assert.match(f.calls[0].system, /Generation proposals:/);
  const meta = events.find(e => e.event === 'answer_meta').data;
  const p = meta.proposal;
  assert.deepEqual([p.command, p.version, p.title, p.description, p.settings, p.input, p.usage], ['motion', 1, 'Water cycle: evaporation to rain', WATER, { duration_seconds: 10, aspect_ratio: '16:9', audio: false }, { request: '/motion explain the water cycle', concept: 'Weather', org: 'workspace-a', app: 'canvas-0a1b2c3d', binding: { inputs: { duration_seconds: 10, aspect_ratio: '16:9' }, price_version: 'flat', estimate_credits: 100, max_credits: 350, policy_version: 'legacy-5-30', renderer_config: null } }, { estimate_credits: 100, max_credits: 350, reserve_credits: 896, inputs: { duration_seconds: 10, aspect_ratio: '16:9' }, price_version: 'flat' }], 'signed for the canvas and workspace it was asked on (MOT-22)');
  assert.equal(await verifyProposal(f.env, p, 'owner@example.test'), null, 'signed for the asker');
  const stored = JSON.parse(f.rows("SELECT meta_json FROM chat_message_meta WHERE role = 'assistant'")[0].meta_json);
  assert.deepEqual(stored.proposal, p, 'kept with the answer, so a reload draws the card again');
  assert.equal(f.calls.length, 2, 'the proposal and the reply: no Director, author or render call');
  assert.equal(events.find(e => e.event === 'chunk').data.text, 'Here is a 10-second video proposal.');
});

test('refinement through chat: the learner\'s words change the unanswered proposal into its next version, with the same id and input', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV);
  f.replies.push(proposeCall('tu1'), 'Proposed.\n<answer_meta>{}</answer_meta>');
  const first = (await f.ask({ message: 'explain the water cycle', mode: 'ask', command: 'motion', generation: { motion: { concept: 'Weather' } } })).events.find(e => e.event === 'answer_meta').data.proposal;
  const clouds = 'Sunlight warms the sea and water evaporates. The vapour rises and cools into tiny droplets. The droplets gather into clouds that grow darker. The clouds release rain over the land.';
  f.replies.push(proposeCall('tu2', { description: clouds, settings: { duration_seconds: 20, audio: false } }), 'Updated.\n<answer_meta>{}</answer_meta>');
  const second = (await f.ask({ message: 'make it 20 seconds and focus more on clouds', mode: 'auto', generation: { motion: { concept: 'Weather' }, current: first } })).events.find(e => e.event === 'answer_meta').data.proposal;
  assert.deepEqual([second.proposal_id, second.version, second.settings.duration_seconds, second.description, second.input], [first.proposal_id, 2, 20, clouds, { ...first.input, binding: { ...first.input.binding, inputs: { duration_seconds: 20, aspect_ratio: '16:9' } } }]);
  assert.match(lastText(f.calls[2]), /The proposal you made, not generated yet \(version 1\)/, 'the model sees the card it revises');
  // A proposal changed in the browser is not a current one: the next proposal starts over as a new one.
  f.replies.push(proposeCall('tu3'), 'New.\n<answer_meta>{}</answer_meta>');
  const forged = (await f.ask({ message: 'again', mode: 'auto', generation: { motion: {}, current: { ...second, title: 'Edited' } } })).events.find(e => e.event === 'answer_meta').data.proposal;
  assert.notEqual(forged.proposal_id, first.proposal_id);
  assert.equal(forged.version, 1);
});

test('CR-1 hand-off: a signed chat route to Motion makes the ordinary turn its proposal turn; a mismatched token calls nothing', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV);
  const { decideChat } = await import('../src/chat-capability-route.js');
  const words = 'Create a 15-second animated explanation of photosynthesis';
  const fields = { app: 'canvas-0a1b2c3d', text: words, mode: 'ask', selection: null, source_refs: null, motion: { concept: 'Weather' } };
  const routed = await decideChat(f.env, { email: owner.email, app: fields.app, requestId: 'req-00000001', fields, capability: 'motion' }, { ask: () => assert.fail('an explicit id makes no router call') });
  assert.deepEqual([routed.route, routed.flow], ['capability:motion', 'proposal']);
  const forged = await f.ask({ message: `${words} now`, mode: 'ask', generation: { motion: { concept: 'Weather' } }, route_token: routed.token });
  assert.equal(forged.res.status, 400);
  assert.equal((await forged.res.json()).code, 'route_mismatch');
  assert.equal(f.calls.length, 0, 'no model call for a token that does not match');
  f.replies.push(proposeCall('tu1'), 'Here is a proposal.\n<answer_meta>{}</answer_meta>');
  const { res, events } = await f.ask({ message: words, mode: 'ask', generation: { motion: { concept: 'Weather' } }, route_token: routed.token });
  assert.equal(res.status, 200);
  assert.deepEqual(f.calls[0].tools.map(tool => tool.name), ['propose_generation'], 'the proposal tool alone, as a typed /motion');
  const p = events.find(e => e.event === 'answer_meta').data.proposal;
  assert.deepEqual([p.command, p.version, { ...p.input, binding: undefined }], ['motion', 1, { request: `/motion ${words}`, concept: 'Weather', org: 'workspace-a', app: 'canvas-0a1b2c3d', binding: undefined }]);
  assert.equal(f.calls.length, 2, 'the proposal and the reply: no Director, author or render call');
});

test('CR-1 through the real route with a simulated JEV: an Ask-mode question routes to answer and /ask answers it; an Ask-mode video request gets a token /ask accepts; a malformed JEV body falls back', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV, { VERCEL_TYPESAFE_API_KEY: 'test-only' }); // a JEV transport; the JEV call itself is the stub below
  const { chatRouteFetch } = await import('../src/chat-capability-route.js');
  const { chatRouteAnswer } = await import('../../web/e2e/dev-cp.mjs');
  const authorize = async () => ({ email: owner.email, org: owner.org, kind: 'owner' });
  const jevSays = body => { const ask = async () => { ask.calls += 1; return { body, ms: 40, model: 'jev-1.13.0', inputTokens: 600, cost: 0.0000252 }; }; ask.calls = 0; return ask; };
  const choice = name => ({ model: 'jev-1.13.0', answers: { route: { type: 'choice', choice: name, confidence: 0.9, probabilities: { [name]: 0.92 } } } });
  const route = async (text, ask, over = {}) => {
    const res = await chatRouteFetch(new Request('https://dev.test/api/learn/chat/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: 'req-00000001', app: 'canvas-0a1b2c3d', text, mode: 'ask', ...over }) }), f.env, { authorize, ask });
    assert.equal(res.status, 200);
    return res.json();
  };
  // An Ask-mode question: one JEV call, an answer with no token, exactly the e2e fixture's fields; /ask then answers it.
  const question = 'Why does a metal spoon feel colder than a wooden one?';
  const asked = jevSays(choice('answer'));
  const answered = await route(question, asked);
  assert.equal(asked.calls, 1, 'Ask mode is routed: one JEV call');
  assert.deepEqual([answered.route, answered.via, answered.args, answered.token, answered.retryable], ['answer', 'jev', question, null, false]);
  const fixtureAnswer = chatRouteAnswer({ text: question });
  assert.deepEqual(Object.keys(answered).sort(), Object.keys(fixtureAnswer).sort(), 'the e2e fixture has every field the server answers');
  assert.deepEqual(Object.keys(answered.meta).sort(), Object.keys(fixtureAnswer.meta).sort());
  const plain = await f.ask({ message: question, mode: 'ask' });
  assert.equal(plain.res.status, 200);
  assert.equal(plain.events.at(-1).event, 'done');
  assert.ok(!(f.calls.at(-1).tools || []).some(tool => tool.name === 'propose_generation'), 'an answer: no proposal tool');
  // An Ask-mode video request: JEV picks Motion, the route signs a token bound to this turn, and /ask makes it the proposal turn.
  const words = 'Create a 15-second animated explanation of photosynthesis';
  const video = await route(words, jevSays(choice('motion')), { motion: { concept: 'Weather' } });
  assert.deepEqual([video.route, video.flow, video.via, typeof video.token], ['capability:motion', 'proposal', 'jev', 'string']);
  const sent = f.calls.length;
  f.replies.push(proposeCall('tu-ask'), 'Here is a proposal.\n<answer_meta>{}</answer_meta>');
  const proposed = await f.ask({ message: words, mode: 'ask', generation: { motion: { concept: 'Weather' } }, route_token: video.token });
  assert.equal(proposed.res.status, 200);
  assert.deepEqual(f.calls[sent].tools.map(tool => tool.name), ['propose_generation'], 'the token makes it the /motion proposal turn');
  assert.equal(proposed.events.find(e => e.event === 'answer_meta').data.proposal.command, 'motion');
  const moved = await f.ask({ message: words, mode: 'auto', generation: { motion: { concept: 'Weather' } }, route_token: video.token });
  assert.deepEqual([moved.res.status, (await moved.res.json()).code], [400, 'route_mismatch'], 'the token is bound to the mode it was routed in');
  // A malformed JEV body: the answer fallback (retryable), never a capability or a token.
  const broken = await route(question, jevSays({ model: 'jev-1.13.0', answers: { route: { type: 'choice', choice: 'rocket', confidence: 1, probabilities: { rocket: 1 } } } }));
  assert.deepEqual([broken.route, broken.via, broken.code, broken.retryable, broken.token, broken.capability], ['answer', 'fallback', 'malformed', true, null, null]);
});

test('paused or with no orchestrator, a /motion chat turn is answered before any model call; without the generation fields no tool rides', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV, { MOTION_GENERATION_PAUSED: '1' });
  const paused = await f.ask({ message: 'explain the water cycle', mode: 'ask', command: 'motion', generation: { motion: {} } });
  assert.equal(paused.res.status, 503);
  assert.deepEqual(await paused.res.json(), { error: 'Motion generation is temporarily unavailable while we fix a reliability issue.', code: 'motion_paused' });
  delete f.env.MOTION_GENERATION_PAUSED; delete f.env.MOTION_ORCHESTRATOR_URL;
  const unavailable = await f.ask({ message: 'explain the water cycle', mode: 'ask', command: 'motion', generation: { motion: {} } });
  assert.equal(unavailable.res.status, 503);
  assert.equal(f.calls.length, 0, 'no model call');
  Object.assign(f.env, MOTION_ENV);
  await f.ask({ message: 'what is rain?', mode: 'ask' });
  assert.equal(f.calls[0].tools.some(tool => tool.name === 'propose_generation'), false, 'a turn without the generation fields offers no proposal tool');
  f.replies.push(proposeCall('tu1', { description: 'It rains.' }), 'Could not propose.\n<answer_meta>{}</answer_meta>');
  const bad = await f.ask({ message: 'a video of rain', mode: 'ask', generation: { motion: {} } });
  assert.equal(bad.events.find(e => e.event === 'answer_meta').data.proposal, undefined, 'an invalid proposal reaches no card');
  assert.match(JSON.stringify(f.calls.at(-1).messages), /Not proposed: the description must be 3 to 10 complete sentences/);
});

// Owner 2026-10-25, the controlled owner-only path on the CHAT turn: paused, the proposal turn is answered 503 for everyone except the signed-in
// account listed in MOTION_ACCEPTANCE_EMAILS (the fixture's user is owner@example.test); the proposal it gets is signed for it and is the ordinary one.
test('paused with MOTION_ACCEPTANCE_EMAILS, the /motion chat turn proposes only for the listed account; a list without it, an empty list and look-alikes are answered before any model call', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV, { MOTION_GENERATION_PAUSED: '1' });
  const turn = () => f.ask({ message: 'explain the water cycle', mode: 'ask', command: 'motion', generation: { motion: {} } });
  const paused = { error: 'Motion generation is temporarily unavailable while we fix a reliability issue.', code: 'motion_paused' };
  for (const list of [undefined, '', 'someone@example.test', 'xowner@example.test', 'owner@example.test.evil.test', 'example.test']) {
    if (list === undefined) delete f.env.MOTION_ACCEPTANCE_EMAILS; else f.env.MOTION_ACCEPTANCE_EMAILS = list;
    const r = await turn();
    assert.equal(r.res.status, 503, String(list));
    assert.deepEqual(await r.res.json(), paused);
  }
  assert.equal(f.calls.length, 0, 'no model call for any of them');
  f.env.MOTION_ACCEPTANCE_EMAILS = ' Owner@Example.Test ';
  f.replies.push(proposeCall('tu-owner'), 'Here is a proposal.\n<answer_meta>{}</answer_meta>');
  const listed = await turn();
  assert.equal(listed.res.status, 200);
  const proposal = listed.events.find(e => e.event === 'answer_meta').data.proposal;
  assert.equal(proposal.command, 'motion');
  assert.equal(await verifyProposal(f.env, proposal, 'owner@example.test'), null, 'signed for the asker, like any proposal');
  assert.deepEqual(proposal.settings, { duration_seconds: 10, aspect_ratio: '16:9', audio: false }, 'the public settings: the list grants no larger ones');
});

// MOT-20b: a submitted answer suggestion is an entry point. Motion is suggested only on a turn where a Motion video can start;
// its Send is the Chat's /motion turn (web AnswerSuggestions prepares it, the composer sends it), so it is proposed first.
test('answer suggestions: a motion action is offered only where Motion can start, and the prompt says so only there', async t => {
  const realMeta = await import('../src/chat-answer-meta.js');
  const trailer = '\n<answer_meta>{"actions":[{"capability":"motion","label":"Animate photosynthesis","subject":"photosynthesis in 15 seconds"}],"followUps":[]}</answer_meta>';
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV);
  f.replies.push(`Photosynthesis makes glucose.${trailer}`);
  const on = await f.ask({ message: 'what is photosynthesis?', mode: 'ask', generation: { motion: { concept: 'Biology' } } }, build(realMeta));
  const offered = on.events.find(e => e.event === 'answer_meta').data.actions;
  assert.deepEqual(offered.map(a => [a.capabilityId, a.args.subject, a.generationRequired]), [['motion', 'photosynthesis in 15 seconds', true]]);
  assert.ok(f.calls[0].system.includes(realMeta.ANSWER_META_MOTION));
  f.replies.push(`Photosynthesis makes glucose.${trailer}`);
  const off = await f.ask({ message: 'what is photosynthesis?', mode: 'ask' }, build(realMeta));
  assert.deepEqual(off.events.find(e => e.event === 'answer_meta').data.actions, [], 'no Motion offered on this turn: the action is dropped');
  assert.ok(!f.calls[1].system.includes(realMeta.ANSWER_META_MOTION));
});

// "Mention a canvas" (canvas-mention-ref.js): a canvas ref is its board id only. Whatever name the browser sends, the server
// stores and shows the model "Canvas" (the title is read under access at Send); no range, no text, at most three per question.
test('a canvas ref is a board id only: its name is never the browser\'s, and malformed, ranged or a fourth canvas is refused', () => {
  const id = n => `canvas:0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`;
  const ref = (n, extra = {}) => ({ sourceId: id(n), kind: 'canvas', name: 'Canvas', version: '', range: null, ...extra });
  assert.deepEqual(contextRefs([ref(1, { name: 'A title the browser should not set' })]), [{ sourceId: id(1), kind: 'canvas', name: 'Canvas', version: '', range: null }]);
  assert.equal(contextRefs([ref(1), ref(2), ref(3)]).length, 3);
  assert.throws(() => contextRefs([ref(1), ref(2), ref(3), ref(4)]), /at most 3 mentioned canvases/);
  assert.throws(() => contextRefs([ref(1, { sourceId: 'canvas:canvas-0a1b2c3d' })]), /canvas:<board id>/);
  assert.throws(() => contextRefs([ref(1, { range: { quote: 'x' } })]), /malformed canvas range/);
  assert.throws(() => contextRefs([ref(1, { text: 'smuggled content' })]), /text rides only/);
  assert.equal(validContextRefs([ref(1)]), true, 'a thread keeps its canvas refs');
  assert.equal(validContextRefs([ref(1, { range: { page: 1 } })]), false);
  assert.equal(validContextRefs([ref(1, { sourceId: 'canvas:nope' })]), false);
  assert.match(chatContext('base', contextRefs([ref(1)]), null, 10000), /\[canvas\] "Canvas" sourceId "canvas:00000001-[^"]+" - a mentioned canvas: its title and saved content are included below/);
});

// ---------- Auto Chat: "hi" and a router outage never leave the message unsent (owner bug 2026-11-07) ----------
// The client's own routing functions (web/src/generation-proposal-chat.js) drive the real route and the real /ask here, with a stubbed JEV.
test('Auto Chat: hi gets one reply and no classifier call; a router outage lets an ordinary question be answered once, text only, with no banner, proposal, job or hold', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV, { VERCEL_TYPESAFE_API_KEY: 'test-only' });
  const { chatRouteFetch, decideChat } = await import('../src/chat-capability-route.js');
  const { routeChat, routeOutcome } = await import('../../web/src/generation-proposal-chat.js');
  const { isSmallTalk } = await import('../../web/src/inline-ai-route.js');
  const { JevError } = await import('../src/learn-grade-jev.js');
  const logs = [], log = console.log;
  console.log = line => { logs.push(String(line)); };
  t.after(() => { console.log = log; });
  const counted = reply => { const ask = async () => { ask.calls += 1; if (reply instanceof Error) throw reply; return reply; }; ask.calls = 0; return ask; };
  const choice = name => ({ body: { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice: name, confidence: 0.9, probabilities: { [name]: 0.92 } } } }, ms: 5, model: 'jev-1.13.0', inputTokens: 100, cost: 0 });
  const authorize = async () => ({ email: owner.email, org: owner.org, kind: 'owner' });
  const route = async (text, ask, { over = {}, authorizeWith = authorize } = {}) => chatRouteFetch(new Request('https://dev.test/api/learn/chat/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: 'req-00000001', app: 'canvas-0a1b2c3d', text, mode: 'auto', ...over }) }), f.env, { authorize: authorizeWith, ask });
  const fetcher = ask => async (url, init) => route(JSON.parse(init.body).text, ask, { over: { request_id: JSON.parse(init.body).request_id } });
  const payloadOf = message => ({ scope: { app: 'canvas-0a1b2c3d' }, message, mode: 'auto' });

  // 1. "hi": the Chat skips the router; if it were called the server would still answer with zero classifier calls. One reply.
  assert.equal(isSmallTalk('hi'), true);
  const never = counted(choice('motion'));
  const hi = await (await route('hi', never)).json();
  assert.deepEqual([hi.route, hi.via, hi.token, hi.retryable], ['answer', 'default', null, false]);
  assert.equal(never.calls, 0, 'zero classifier calls for a greeting');
  const { depthInstruction } = await import('../src/chat-depth.js');
  const context = [ref({ sourceId: 'card:shape:a', kind: 'card', name: 'Base case', version: 'h1', text: 'A base case stops recursion' })];
  const greeted = await f.ask({ message: 'hi', mode: 'auto', depth: 'deep', context_refs: context, answer_only: true });
  assert.equal(greeted.res.status, 200);
  assert.equal(greeted.events.filter(e => e.event === 'chunk').length, 1, 'exactly one reply');
  assert.equal(f.calls.length, 1);
  assert.equal((f.calls[0].tools ?? []).length, 0, 'zero tools offered: no proposal, outline, research or paper tool');
  assert.equal(f.calls[0].tool_choice, undefined);
  assert.ok(f.calls[0].system.includes(depthInstruction('deep')), 'the learner\'s Depth is intact');
  assert.match(JSON.stringify(f.calls[0].messages.at(-1)), /A base case stops recursion/, 'the canvas context is intact');
  const threadId = greeted.events.at(-1).data.threadId;
  assert.deepEqual(f.rows('SELECT role FROM messages ORDER BY id').map(m => m.role), ['user', 'assistant'], 'one saved user message and one reply');
  assert.equal(f.rows('SELECT content FROM messages ORDER BY id')[0].content, 'hi');
  // A mixed request is not small talk: it takes the normal route (one classifier call, then a Motion token).
  const mixed = counted(choice('motion'));
  assert.equal(isSmallTalk('hi, make me a video'), false);
  assert.equal((await (await route('hi, make me a video', mixed, { over: { motion: { concept: 'x' } } })).json()).route, 'capability:motion');
  assert.equal(mixed.calls, 1);

  // 2. Forced router outage (timeout, provider down, unreadable): the ordinary question goes on once as an answer-only turn, no banner.
  const question = 'Why does a metal spoon feel colder than a wooden one?';
  const outages = [['timeout', counted(new JevError('timeout', 'slow'))], ['unavailable', counted(new JevError('http', 'down', 503))], ['malformed', counted(new Error('unreadable'))]];
  for (const [code, ask] of outages) {
    const before = f.calls.length, requestId = `req-${code.padEnd(8, '0')}`;
    const decision = await routeChat(fetcher(ask), payloadOf(question), { requestId });
    assert.deepEqual([decision.route, decision.via, decision.code, decision.recoverable], ['answer', 'fallback', code, true], code);
    const outcome = routeOutcome(decision, { plain: true });
    assert.deepEqual([outcome.send, outcome.answerOnly, outcome.show], [true, true, undefined], `${code}: sent, answer-only, nothing shown (no banner, no buttons)`);
    assert.equal(outcome.failure.request_id, requestId);
    // The turn the client then sends, with the generation fields it would normally also send (a Motion proposal could ride them).
    const saved = f.rows('SELECT role FROM messages').length;
    const { res, events } = await f.ask({ message: question, mode: 'auto', thread_id: threadId, depth: 'deep', context_refs: context, answer_only: true, route_failure: outcome.failure, generation: { motion: { concept: 'Heat' } } });
    assert.equal(res.status, 200, code);
    assert.equal(events.filter(e => e.event === 'chunk').length, 1, `${code}: exactly one reply`);
    assert.equal(events.at(-1).data.threadId, threadId, `${code}: the same thread`);
    assert.equal(f.calls.length - before, 1, `${code}: one model call`);
    assert.equal(f.rows('SELECT role FROM messages').length - saved, 2, `${code}: one saved user message and one reply`);
    assert.equal((f.calls.at(-1).tools ?? []).length, 0, `${code}: zero tools offered`);
    assert.ok(f.calls.at(-1).system.includes(depthInstruction('deep')), `${code}: Depth intact`);
    assert.match(JSON.stringify(f.calls.at(-1).messages.at(-1)), /A base case stops recursion/, `${code}: context intact`);
    assert.doesNotMatch(f.calls.at(-1).system, /Generation proposals:/);
    assert.equal(events.find(e => e.event === 'answer_meta').data.proposal ?? null, null, `${code}: no proposal`);
  }
  // The server never touched live D1 (a credit hold or job row would have thrown), and nothing proposed was stored.
  assert.equal(f.rows('SELECT COUNT(*) AS n FROM chat_message_meta WHERE meta_json LIKE \'%"proposal"%\'')[0].n, 0, 'nothing proposed is stored');
  assert.ok(logs.some(line => line.includes('"event":"chat_route_recovered"') && line.includes('"request_id":"req-timeout0"')), 'the recovered turn is logged under the failed route request id');
  assert.ok(logs.some(line => line.includes('"event":"chat_route"') && line.includes('"reason":"timeout"')), 'the router failure logs its reason');
  assert.ok(logs.every(line => !line.includes(question) && !line.includes('test-only')), 'no prompt or secret is logged');
  // Missing router configuration is named in the log (the reason, never a value).
  const bare = { ...f.env };
  delete bare.VERCEL_TYPESAFE_API_KEY; delete bare.INLINE_DECISION_KEY;
  assert.equal((await decideChat(bare, { email: owner.email, app: 'canvas-0a1b2c3d', requestId: 'req-00000009', fields: { text: question, mode: 'auto' } }, { ask: counted(choice('answer')) })).code, 'unavailable');
  assert.ok(logs.some(line => line.includes('"outcome":"unavailable"') && /"reason":"no_(transport|signing_key)"/.test(line)));

  // 3. answer_only cannot widen a turn: not with a command, a route decision, a regeneration, a proposal Edit (checklist CHAT.01: reject
  // contradictory command, proposal token, Edit or regeneration inputs) or a non-true value; the model is never called.
  const before = f.calls.length;
  for (const extra of [{ command: 'motion' }, { route_token: 'x' }, { regenerate: { messageId: '1' }, thread_id: greeted.events.at(-1).data.threadId }, { generation: { edit: true, current: { command: 'motion', proposal_id: 'p1' } } }]) {
    const refused = await f.ask({ message: question, mode: 'auto', answer_only: true, ...extra });
    assert.deepEqual([refused.res.status, (await refused.res.json()).code], [400, 'answer_only_invalid'], JSON.stringify(Object.keys(extra)));
  }
  assert.equal((await f.ask({ message: question, mode: 'auto', answer_only: 'yes' })).res.status, 400);
  assert.equal(f.calls.length, before);

  // 4. Genuine decisions are unchanged: ambiguity clarifies; a real /motion request still reaches the signed proposal; a denied canvas stays denied
  // with its own words, and a command that cannot start shows its error.
  const several = await (await route('make a video and a diagram', counted({ body: { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice: 'several', confidence: 0.9, probabilities: { several: 0.9 } } } }, ms: 5 }))).json();
  assert.deepEqual([several.route, several.via], ['clarify', 'jev']);
  assert.equal(routeOutcome(several, { plain: true }).show.kind, 'clarify');
  const words = 'Create a 15-second animated explanation of photosynthesis';
  const video = await (await route(words, counted(choice('motion')), { over: { motion: { concept: 'Weather' } } })).json();
  assert.deepEqual([video.route, video.flow, typeof video.token], ['capability:motion', 'proposal', 'string']);
  f.replies.push(proposeCall('tu-real'), 'Here is a proposal.\n<answer_meta>{}</answer_meta>');
  const proposed = await f.ask({ message: words, mode: 'auto', generation: { motion: { concept: 'Weather' } }, route_token: video.token });
  assert.equal(proposed.res.status, 200);
  assert.equal(proposed.events.find(e => e.event === 'answer_meta').data.proposal.command, 'motion', 'the real request still reaches signed review');
  const denial = async () => Response.json({ error: 'No access to this canvas.' }, { status: 403 });
  const denied = await route(question, counted(choice('answer')), { authorizeWith: denial });
  assert.equal(denied.status, 403);
  const refusal = routeOutcome(await routeChat(async () => denied, payloadOf(question)), { plain: true });
  assert.deepEqual([refusal.send, refusal.show], [undefined, { kind: 'error', message: 'No access to this canvas.' }], 'a denial is shown with its own words, never answered around');
  const commandDown = routeOutcome(await routeChat(async () => { throw new Error('offline'); }, payloadOf('/motion a video')), { plain: false });
  assert.equal(commandDown.show.kind, 'error', 'an explicit tool command that cannot start shows an error and sends nothing');
  assert.equal(commandDown.send, undefined);
});

// CHAT.01 (checklist 4.5): a restricted turn cannot be talked into a tool, and suggests no artifact to make next.
test('answer_only: a tool call the model makes anyway dispatches nothing, and its suggested actions are dropped', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV);
  const suggests = build({ ...fakeMeta, validateAnswerMeta: () => ({ actions: [{ capability: 'diagram', label: 'Draw it', subject: 'x' }], followUps: [] }) });
  // Control: an ordinary turn keeps its suggestions.
  f.replies.push('Plain text.\n<answer_meta>{"actions":[{"capability":"diagram"}]}</answer_meta>');
  const normal = await f.ask({ message: 'Why is the sky blue?', mode: 'auto' }, suggests);
  assert.equal(normal.events.find(e => e.event === 'answer_meta').data.actions.length, 1, 'control: an ordinary turn offers its action');
  // The restricted turn: the provider answers with a Motion proposal call although no tool was offered, then with text.
  const before = f.calls.length;
  f.replies.push(proposeCall('tu-restricted'), 'Plain text.\n<answer_meta>{"actions":[{"capability":"diagram"}]}</answer_meta>');
  const { res, events } = await f.ask({ message: 'Why is the grass green?', mode: 'auto', answer_only: true, generation: { motion: { concept: 'Plants' } } }, suggests);
  assert.equal(res.status, 200);
  assert.equal(f.calls[before].tools, undefined, 'no tool definition is sent');
  assert.doesNotMatch(f.calls[before].system, /Generation proposals:|propose_generation|propose_outline/);
  const meta = events.find(e => e.event === 'answer_meta').data;
  assert.deepEqual([meta.actions, meta.proposal ?? null], [[], null], 'no suggested artifact and no proposal');
  assert.equal(f.rows('SELECT COUNT(*) AS n FROM chat_message_meta WHERE meta_json LIKE \'%"proposal"%\'')[0].n, 0, 'nothing proposed is stored');
  // The tool call was answered as an error and the text followed: exactly one saved reply, and the live D1 (credit holds, jobs) was never touched.
  assert.equal(f.rows("SELECT COUNT(*) AS n FROM messages WHERE role = 'assistant'")[0].n, 2, 'one reply per turn, two turns');
  assert.match(JSON.stringify(f.calls[before + 1].messages.at(-1)), /Unknown Learn tool/, 'the call came back as a refusal');
});

test('CHAT.01 table: conversation and questions about a tool stay replies; a full creation request gets one signed review; search and typed commands keep their routes', async t => {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV, { VERCEL_TYPESAFE_API_KEY: 'test-only' });
  const { chatRouteFetch } = await import('../src/chat-capability-route.js');
  const { routeChat, routeOutcome } = await import('../../web/src/generation-proposal-chat.js');
  const log = console.log;
  console.log = () => {};
  t.after(() => { console.log = log; });
  const counted = reply => { const ask = async () => { ask.calls += 1; return reply; }; ask.calls = 0; return ask; };
  const choice = name => ({ body: { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice: name, confidence: 0.9, probabilities: { [name]: 0.95 } } } }, ms: 5, model: 'jev-1.13.0', inputTokens: 100, cost: 0 });
  const authorize = async () => ({ email: owner.email, org: owner.org, kind: 'owner' });
  const fetcher = (jev, mode) => async (url, init) => chatRouteFetch(new Request('https://dev.test/api/learn/chat/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init.body }), f.env, { authorize, ask: jev });
  const payload = (message, mode, extra = {}) => ({ scope: { app: 'canvas-0a1b2c3d' }, message, mode, ...extra });
  // Conversation in varied wording and languages, a question about Motion, and "without a video": one reply, zero artifact requests, in Ask and Auto.
  for (const mode of ['ask', 'auto']) {
    for (const message of ['Hola, soy nuevo aquí. ¿Cómo empiezo?', 'Can Motion generate audio?', 'Explain this without a video', 'Quel est le but du gradient ?']) {
      const jev = counted(choice('answer'));
      const outcome = routeOutcome(await routeChat(fetcher(jev, mode), payload(message, mode)), { plain: true });
      assert.deepEqual([outcome.send, outcome.token, outcome.show], [true, null, undefined], `${mode}: ${message}`);
      const before = f.calls.length;
      const { res, events } = await f.ask({ message, mode });
      assert.equal(res.status, 200);
      assert.equal(events.filter(e => e.event === 'chunk').length, 1, `${mode}: one reply`);
      assert.equal(f.calls.length - before, 1, `${mode}: one model call`);
      assert.ok(!(f.calls.at(-1).tools || []).some(tool => tool.name === 'propose_generation'), `${mode}: zero artifact requests`);
      assert.equal(events.find(e => e.event === 'answer_meta').data.proposal ?? null, null);
    }
  }
  // "Hi, make a short video of the tree split": the full request gets one signed Motion review, and the proposal is the only artifact.
  const words = 'Hi, make a short video of the tree split';
  const motion = counted(choice('motion'));
  const decision = await routeChat(fetcher(motion, 'auto'), payload(words, 'auto', { generation: { motion: { concept: 'Trees' } } }));
  const outcome = routeOutcome(decision, { plain: true });
  assert.equal(motion.calls, 1);
  assert.equal(typeof outcome.token, 'string');
  f.replies.push(proposeCall('tu-tree'), 'Here is a proposal.\n<answer_meta>{}</answer_meta>');
  const proposed = await f.ask({ message: words, mode: 'auto', generation: { motion: { concept: 'Trees' } }, route_token: outcome.token });
  assert.equal(proposed.events.find(e => e.event === 'answer_meta').data.proposal.command, 'motion', 'one signed review, a job only on Generate');
  // "find me a video": the existing search handler (a direct command), not a Motion review.
  const search = routeOutcome(await routeChat(fetcher(counted(choice('youtube')), 'auto'), payload('find me a video', 'auto')), { plain: true });
  assert.deepEqual(search.direct && search.direct.command, 'youtube');
  // Typed /motion: the named route, no classification at all, and the signed review.
  const classifier = counted(choice('answer'));
  const typed = routeOutcome(await routeChat(fetcher(classifier, 'auto'), payload('/motion tree split', 'auto', { generation: { motion: { concept: 'Trees' } } }), { capability: null }), { plain: false });
  assert.equal(classifier.calls, 0, 'a typed command is not classified');
  assert.equal(typeof typed.token, 'string');
});

// ---------- CHAT.02: the answer model gets the eligible tools (CHAT_ANSWER_TOOLS; chat-tools.js) ----------
// A scripted model proves wiring, validation, state and action counts. Whether the real model picks the right tool is UNVERIFIED here.
const toolCall = (id, name, input) => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' });
const QUESTION = 'Why does a metal spoon feel colder than a wooden one?';
function withTools(t, flag = 'auto') {
  const f = fixture(t);
  Object.assign(f.env, MOTION_ENV, flag === null ? {} : { CHAT_ANSWER_TOOLS: flag });
  const elsewhere = [], prior = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (new URL(String(url)).hostname !== 'api.anthropic.com') elsewhere.push(String(url)); return prior(url, init); };
  t.after(() => { globalThis.fetch = prior; });
  return { ...f, elsewhere, runTools: call => (call.tools || []).filter(tool => tool.name.startsWith('run_')).map(tool => tool.name) };
}
const turn = (over = {}) => ({ message: QUESTION, mode: 'auto', generation: { motion: { concept: 'Heat' } }, ...over });
const metaOf = events => events.find(e => e.event === 'answer_meta').data;

test('CHAT.02: with the flag on, an ordinary message offers the eligible tools natively; the model may answer with none', async t => {
  const f = withTools(t);
  const { res, events } = await f.ask(turn());
  assert.equal(res.status, 200);
  const call = f.calls[0];
  assert.deepEqual(f.runTools(call).sort(), ['run_3d', 'run_arxiv', 'run_code', 'run_diagram', 'run_flashcards', 'run_graph', 'run_image', 'run_quiz', 'run_wikipedia', 'run_youtube']);
  assert.ok(call.tools.some(tool => tool.name === 'propose_generation'), 'the Motion proposal rides beside them');
  assert.ok(!call.tools.some(tool => /whiteboard|animation|cad|goal/.test(tool.name)), 'R12-held and explicit-only commands are never offered');
  assert.deepEqual(call.tool_choice, { type: 'auto', disable_parallel_tool_use: true }, 'auto, never forced');
  assert.match(call.system, /you may call one of the tools offered, once/);
  assert.match(call.tools.find(tool => tool.name === 'propose_generation').input_schema.properties.command.description, /no narration \(audio is off\), not interactive/);
  assert.equal(f.calls.length, 1, 'one model call');
  assert.equal(events.filter(e => e.event === 'chunk').length, 1, 'a saved reply');
  const meta = metaOf(events);
  assert.deepEqual([meta.toolRequest ?? null, meta.proposal ?? null], [null, null], 'zero tool requests');
  assert.deepEqual(f.rows('SELECT role FROM messages ORDER BY id').map(m => m.role), ['user', 'assistant']);
  assert.deepEqual(f.elsewhere, [], 'no adapter, orchestrator or provider call other than the answer');
});

test('CHAT.02: the flag is per mode; unset, a command turn, an answer-only turn and the Contents conversation offer no direct tool', async t => {
  for (const [flag, over, expectTools, label] of [
    [null, {}, false, 'unset'], ['ask', {}, false, 'auto not listed'], ['auto', { mode: 'ask' }, false, 'ask not listed'],
    ['ask', { mode: 'ask' }, true, 'ask listed'], ['all', { mode: 'ask' }, true, 'all, ask'], ['all', {}, true, 'all, auto'],
    ['auto', { command: 'diagram' }, false, 'a command turn'], ['auto', { answer_only: true }, false, 'answer-only'], ['all', { mode: 'tutor' }, false, 'wire tutor'],
  ]) {
    const f = withTools(t, flag);
    const { res } = await f.ask(turn(over));
    assert.equal(res.status, 200, label);
    assert.equal(f.runTools(f.calls[0]).length > 0, expectTools, label);
  }
});

test('CHAT.02: a valid direct tool call becomes one toolRequest for the browser; the server runs nothing and creates nothing', async t => {
  const f = withTools(t);
  f.replies.push(toolCall('tu1', 'run_diagram', { request: 'the steps of binary search' }), 'I opened the diagram command for you.\n<answer_meta>{}</answer_meta>');
  const { res, events } = await f.ask(turn({ message: 'draw the steps of binary search' }));
  assert.equal(res.status, 200);
  const meta = metaOf(events);
  assert.deepEqual(meta.toolRequest, { command: 'diagram', args: 'the steps of binary search' });
  assert.deepEqual([meta.proposal ?? null, meta.actions, meta.followUps], [null, [], []], 'no proposal; a tool request is a workflow answer with no extra suggestions');
  assert.equal(f.calls.length, 2, 'the tool turn and the reply');
  const result = JSON.parse(f.calls[1].messages.at(-1).content[0].content[0].text);
  assert.equal(result.requested, 1);
  assert.deepEqual(JSON.parse(f.rows("SELECT meta_json FROM chat_message_meta WHERE role = 'assistant'")[0].meta_json).toolRequest, meta.toolRequest, 'kept with the answer');
  assert.deepEqual(f.elsewhere, [], 'zero adapter dispatch, job or credit hold');
});

test('CHAT.02: an unfit call, an unavailable tool and a second request come back to the model as errors and nothing is requested', async t => {
  const f = withTools(t);
  // narration is required: no existing tool narrates -> the model is told to help in Chat
  f.replies.push(toolCall('tu1', 'run_diagram', { request: 'a narrated walkthrough', requirements: { narration: true } }), 'No tool here can narrate, so here is a storyboard you can read instead.\n<answer_meta>{}</answer_meta>');
  const first = await f.ask(turn({ message: 'a narrated walkthrough of the tree split' }));
  assert.equal(metaOf(first.events).toolRequest ?? null, null);
  assert.match(f.calls[1].messages.at(-1).content[0].content[0].text, /cannot provide narration[^]*No available tool fits/);
  // an unavailable tool (image generation is off for this caller)
  f.replies.push(toolCall('tu2', 'run_generate_image', { request: 'a cat' }), 'I cannot generate pictures here.\n<answer_meta>{}</answer_meta>');
  const second = await f.ask(turn({ message: 'draw me a cat' }));
  assert.equal(metaOf(second.events).toolRequest ?? null, null);
  assert.match(f.calls.at(-1).messages.at(-1).content[0].content[0].text, /Unknown Learn tool/, 'a tool that was never offered is rejected before it reaches the handler');
  // two requests in one answer: the first stands, the second is refused
  f.replies.push(toolCall('tu3', 'run_diagram', { request: 'the split' }), toolCall('tu4', 'run_graph', { request: 'the cost' }), 'Opened the diagram.\n<answer_meta>{}</answer_meta>');
  const third = await f.ask(turn({ message: 'diagram and graph of the split' }));
  assert.deepEqual(metaOf(third.events).toolRequest, { command: 'diagram', args: 'the split' });
  assert.match(f.calls.at(-1).messages.at(-1).content[0].content[0].text, /One tool request per answer/);
  assert.deepEqual(f.elsewhere, []);
});

test('CHAT.02: Motion keeps its signed review; a narration requirement is refused before any review; ordinary talk beside a waiting plan stays a reply', async t => {
  const f = withTools(t);
  f.replies.push(proposeCall('tu1', { requirements: { narration: true } }), 'Motion cannot narrate; want a read-along storyboard instead?\n<answer_meta>{}</answer_meta>');
  const refused = await f.ask(turn({ message: 'a narrated video of the water cycle' }));
  assert.equal(metaOf(refused.events).proposal ?? null, null, 'no review for a requirement Motion cannot meet');
  assert.match(f.calls.at(-1).messages.at(-1).content[0].content[0].text, /cannot provide narration/);
  f.replies.push(proposeCall('tu2'), 'Here is a 10-second video proposal.\n<answer_meta>{}</answer_meta>');
  const first = await f.ask(turn({ message: 'Hi, make a short video of the water cycle' }));
  const proposal = metaOf(first.events).proposal;
  assert.equal(proposal.command, 'motion');
  assert.equal(await verifyProposal(f.env, proposal, 'owner@example.test'), null, 'signed for the asker');
  // ordinary conversation beside the waiting plan: the model answers, no new version is made
  const before = f.calls.length;
  const talk = await f.ask(turn({ message: 'thanks, how long do these usually take to render?', generation: { motion: { concept: 'Heat' }, current: proposal } }));
  assert.equal(f.calls.length - before, 1);
  assert.equal(metaOf(talk.events).proposal ?? null, null, 'no revision without a refinement');
  assert.deepEqual(f.elsewhere, []);
});

test('CHAT.02: the route skips the classifier for a listed mode; a denied board and a mismatched token stay denied', async t => {
  const f = withTools(t);
  const { chatRouteFetch } = await import('../src/chat-capability-route.js');
  const { routeChat, routeOutcome } = await import('../../web/src/generation-proposal-chat.js');
  const jev = async () => { jev.calls += 1; throw new Error('the classifier must not be called'); };
  jev.calls = 0;
  const authorize = async () => ({ email: owner.email, org: owner.org, kind: 'owner' });
  const fetcher = (authorizeWith = authorize) => async (url, init) => chatRouteFetch(new Request('https://dev.test/api/learn/chat/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init.body }), f.env, { authorize: authorizeWith, ask: jev });
  const payload = { scope: { app: 'canvas-0a1b2c3d' }, message: QUESTION, mode: 'auto' };
  const decision = await routeChat(fetcher(), payload);
  assert.deepEqual([decision.route, decision.via, jev.calls], ['answer', 'model', 0]);
  assert.deepEqual(routeOutcome(decision, { plain: true }), { send: true, token: null }, 'sent as an ordinary turn with the tools, no banner');
  const denied = await routeChat(fetcher(async () => Response.json({ error: 'No access to this canvas.' }, { status: 403 })), payload);
  assert.equal(routeOutcome(denied, { plain: true }).show.message, 'No access to this canvas.');
  const mismatch = await f.ask(turn({ route_token: 'not-a-token' }));
  assert.deepEqual([mismatch.res.status, (await mismatch.res.json()).code], [400, 'route_mismatch']);
  assert.equal(f.calls.length, 0, 'a denied or mismatched turn never reaches the model');
});

// ---------- BE.01a (server half): Explain on canvas from typed words (chat-tools.js start_lesson; client half is web roadmap-lesson-entry.test.mjs) ----------
// The tool exists only under the flag, only when the browser sent authorized sources (no unfinished roadmap), and the server executes nothing: a valid call is a
// toolRequest for the same controller action the button runs. A scripted model proves wiring and validation; whether the real model picks it is UNVERIFIED.
const LESSON_SRC = { key: 'file:fs_41c9e0a7d2b84f63a1c07e92', rev: 'rev1', name: 'Gradient descent notes.md' };
const lessonTurn = (over = {}) => turn({ message: 'Teach me this document as a lesson on the canvas', lesson: { sources: [LESSON_SRC] }, ...over });
const lessonTool = call => (call.tools || []).find(tool => tool.name === 'start_lesson');

test('BE.01a: start_lesson is offered only under the flag, with authorized sources, for an ordinary turn; its definition says what it makes, when, and its limits', async t => {
  const on = withTools(t);
  await on.ask(lessonTurn());
  const tool = lessonTool(on.calls[0]);
  assert.ok(tool, 'offered');
  assert.equal(tool.input_schema.additionalProperties, false);
  assert.deepEqual(tool.input_schema.required, ['instruction'], 'one source: no choice to make');
  assert.deepEqual(Object.keys(tool.input_schema.properties).sort(), ['instruction', 'scope']);
  assert.match(tool.description, /roadmap draft the learner reviews in Chat/);
  assert.match(tool.description, /CLEARLY asks/);
  assert.match(tool.description, /not for an informational question about the source, not for a request for one card/);
  assert.match(on.calls[0].system, /start_lesson: call it only for a clear request to be taught the source as a lesson/);
  // Ask honors an explicit request (the model never starts one unprompted), Auto and ordinary Tutor travel as auto.
  const ask = withTools(t, 'ask');
  await ask.ask(lessonTurn({ mode: 'ask' }));
  assert.ok(lessonTool(ask.calls[0]), 'Ask: an explicit request is honored');
  for (const [flag, over, label] of [
    [null, {}, 'flag unset (byte-identical to today)'], ['ask', {}, 'auto not listed'], ['auto', { lesson: undefined }, 'no sources: no resolved source or an unfinished roadmap'],
    ['auto', { lesson: { sources: [] } }, 'empty sources'], ['auto', { lesson: { sources: [{ ...LESSON_SRC, key: 'file:../escape' }] } }, 'a malformed key'],
    ['auto', { lesson: { sources: [LESSON_SRC, LESSON_SRC] } }, 'a duplicated source'], ['auto', { lesson: { sources: Array.from({ length: 6 }, (_, i) => ({ ...LESSON_SRC, key: `file:s${i}` })) } }, 'more than five'],
    ['auto', { command: 'diagram' }, 'a command turn'], ['auto', { answer_only: true }, 'answer-only'], ['all', { mode: 'tutor' }, 'the Contents conversation'],
  ]) {
    const f = withTools(t, flag);
    const { res } = await f.ask(lessonTurn(over));
    assert.equal(res.status, 200, label);
    assert.equal(lessonTool(f.calls[0]), undefined, label);
  }
});

test('BE.01a: a clear lesson request becomes ONE toolRequest explain-on-canvas with the learner words, scope and source; the server starts and charges nothing', async t => {
  const f = withTools(t);
  f.replies.push(toolCall('tu1', 'start_lesson', { instruction: 'teach me gradient descent from this, at a deeper level', scope: 'whole' }), 'Starting the roadmap draft in Chat.\n<answer_meta>{}</answer_meta>');
  const { res, events } = await f.ask(lessonTurn({ depth: 'deep' }));
  assert.equal(res.status, 200);
  const meta = metaOf(events);
  assert.deepEqual(meta.toolRequest, { command: 'explain-on-canvas', args: { instruction: 'teach me gradient descent from this, at a deeper level', scope: 'whole', source: LESSON_SRC.key } });
  assert.deepEqual([meta.proposal ?? null, meta.actions], [null, []]);
  assert.equal(f.calls.length, 2, 'the tool turn and the reply: no planner, author or provider call');
  assert.equal(JSON.parse(f.calls[1].messages.at(-1).content[0].content[0].text).requested, 1);
  assert.deepEqual(JSON.parse(f.rows("SELECT meta_json FROM chat_message_meta WHERE role = 'assistant'")[0].meta_json).toolRequest, meta.toolRequest, 'kept with the answer');
  assert.deepEqual(f.elsewhere, [], 'zero roadmap create, job or credit hold from the server');
  // A second request in the same answer is refused.
  const g = withTools(t);
  g.replies.push(toolCall('a', 'start_lesson', { instruction: 'one' }), toolCall('b', 'start_lesson', { instruction: 'two' }), 'Done.\n<answer_meta>{}</answer_meta>');
  const second = await g.ask(lessonTurn());
  assert.equal(metaOf(second.events).toolRequest.args.instruction, 'one');
  assert.match(g.calls[2].messages.at(-1).content[0].content[0].text, /One tool request per answer/);
});

test('BE.01a: a normal question and a single-card request keep their own paths; an ambiguous source asks one question and starts nothing', async t => {
  // An informational question about the source: a reply, zero lesson and zero tool requests.
  const q = withTools(t);
  const asked = await q.ask(lessonTurn({ message: 'What does this document say about the learning rate?' }));
  assert.deepEqual([metaOf(asked.events).toolRequest ?? null, q.calls.length], [null, 1]);
  // A request for ONE card: the existing direct tool (its own review), never the lesson.
  const card = withTools(t);
  card.replies.push(toolCall('tu1', 'run_diagram', { request: 'the update rule as a diagram' }), 'Opening the diagram command.\n<answer_meta>{}</answer_meta>');
  const one = await card.ask(lessonTurn({ message: 'draw the update rule as a diagram' }));
  assert.deepEqual(metaOf(one.events).toolRequest, { command: 'diagram', args: 'the update rule as a diagram' });
  // Two sources: the schema makes the choice explicit; a call without one is an error to the model (it asks the learner), and no request is made.
  const two = withTools(t);
  const other = { key: 'file:fs_0000000000000000000000aa', rev: 'rev9', name: 'Optimizers.md' };
  two.replies.push(toolCall('tu1', 'start_lesson', { instruction: 'teach me this' }), 'Which one: Gradient descent notes.md or Optimizers.md?\n<answer_meta>{}</answer_meta>');
  const asking = await two.ask(lessonTurn({ lesson: { sources: [LESSON_SRC, other] } }));
  const def = lessonTool(two.calls[0]);
  assert.deepEqual(def.input_schema.required, ['instruction', 'source']);
  assert.deepEqual(def.input_schema.properties.source.enum, [LESSON_SRC.key, other.key]);
  assert.equal(metaOf(asking.events).toolRequest ?? null, null, 'no roadmap is started');
  assert.match(two.calls[1].messages.at(-1).content[0].content[0].text, /Which source\? Ask the learner one focused question: Gradient descent notes\.md; Optimizers\.md/);
  assert.match(asking.events.find(e => e.event === 'chunk').data.text, /Which one/);
  // A call naming a source that is not on the canvas is refused the same way; naming a real one is accepted.
  const bad = withTools(t);
  bad.replies.push(toolCall('tu1', 'start_lesson', { instruction: 'teach me', source: 'file:elsewhere' }), 'Which source do you mean?\n<answer_meta>{}</answer_meta>');
  assert.equal(metaOf((await bad.ask(lessonTurn({ lesson: { sources: [LESSON_SRC, other] } }))).events).toolRequest ?? null, null);
  const good = withTools(t);
  good.replies.push(toolCall('tu1', 'start_lesson', { instruction: 'teach me', source: other.key }), 'Starting.\n<answer_meta>{}</answer_meta>');
  assert.equal(metaOf((await good.ask(lessonTurn({ lesson: { sources: [LESSON_SRC, other] } }))).events).toolRequest.args.source, other.key);
  // Malformed input never becomes a request.
  for (const input of [{}, { instruction: '' }, { instruction: 'x'.repeat(2001) }, { instruction: 'teach me', scope: 'chapter' }, { instruction: 'teach me', extra: 1 }]) {
    const f = withTools(t);
    f.replies.push(toolCall('tu1', 'start_lesson', input), 'Could you tell me more?\n<answer_meta>{}</answer_meta>');
    assert.equal(metaOf((await f.ask(lessonTurn())).events).toolRequest ?? null, null, JSON.stringify(input).slice(0, 40));
  }
});
