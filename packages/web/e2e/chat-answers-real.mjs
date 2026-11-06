// Chat workspace, Lane B (Answers): the REAL provider check on a LOCAL stack (never a shared or deployed worker), against
// agent-coordination/tasks/chat-workspace-CONTRACT.md Part B. Every paid turn is reserved in the shared ledger first and
// settled from the local usage_operations delta after (the control plane runs SMALL_ENV=dev, so the app's own spend checks
// are on). The run stops before a reservation that would take this lane past its cap. Records per turn: SSE order, time to
// the first chunk and to done, ids, kind, actions, follow-ups, and what was spent. Prints no secrets.
// usage: node e2e/chat-answers-real.mjs --base http://127.0.0.1:8871 --cp http://127.0.0.1:8873 --vars <app .dev.vars>
//        --persist <wrangler persist dir> --ledger <ledger.mjs> --out <dir> [--cap 1.50] [--only=a,b]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const arg = name => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : null; };
const BASE = arg('base'), CP = arg('cp'), OUT = arg('out'), LEDGER = arg('ledger'), PERSIST = arg('persist'), CAP = Number(arg('cap') || 1.5);
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url || '')) throw Error('the real check runs against a local stack only');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const RUN = `chatb-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 17)}`;
const SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(arg('vars'), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const log = [];
const record = entry => { log.push(entry); console.log(JSON.stringify(entry)); writeFileSync(`${OUT}/chat-answers-real.json`, JSON.stringify({ run: RUN, sha: SHA, log }, null, 2)); };
const check = (ok, what) => { record({ check: what, ok: !!ok }); return !!ok; };

// ---- spend: the shared ledger, this lane's cap (ids chatb-), and the app's own usage_operations ----
const ledger = (...args) => execFileSync('node', [LEDGER, ...args], { encoding: 'utf8' }).trim();
const laneSpend = () => {
  const lines = readFileSync(LEDGER.replace(/ledger\.mjs$/, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => String(e.id).startsWith('chatb-'));
  const settled = new Map(lines.filter(e => e.op === 'settle').map(e => [e.id, e.actual_usd]));
  const open = lines.filter(e => e.op === 'reserve' && !settled.has(e.id) && !lines.some(r => r.op === 'release' && r.id === e.id));
  return [...settled.values()].reduce((a, b) => a + b, 0) + open.reduce((a, e) => a + e.max_usd, 0);
};
const dbFiles = () => readdirSync(`${PERSIST}/v3/d1/miniflare-D1DatabaseObject`).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite').map(name => `${PERSIST}/v3/d1/miniflare-D1DatabaseObject/${name}`);
const withTable = table => dbFiles().find(file => { const db = new DatabaseSync(file, { readOnly: true }); try { return !!db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?').get(table); } finally { db.close(); } });
const opsFile = withTable('usage_operations'), learnFile = withTable('chat_message_meta');
const read = (file, sql, ...params) => { const db = new DatabaseSync(file, { readOnly: true }); try { return db.prepare(sql).all(...params); } finally { db.close(); } };
const spentNow = () => read(opsFile, "SELECT COALESCE(SUM(cost_usd),0) AS usd, COUNT(*) AS n, COALESCE(SUM(CASE WHEN status='admitted' THEN 1 ELSE 0 END),0) AS open FROM usage_operations")[0];
// One chat turn: the research loop can call the model more than once; reserved at a rounded-up bound per turn.
const PER_TURN = 0.15;
async function paid(id, fn) {
  if (laneSpend() + PER_TURN > CAP + 1e-9) throw Error(`stop: ${id} would take this lane past $${CAP}`);
  const before = spentNow();
  const reserved = ledger('reserve', `${RUN}-${id}`, 'anthropic', 'learn_chat', String(PER_TURN), 'chat answers real check');
  let result, error = null;
  try { result = await fn(); } catch (failure) { error = failure.message.split('\n')[0]; }
  let after = spentNow();
  for (let i = 0; i < 20 && after.open > 0; i += 1) { await new Promise(r => setTimeout(r, 1500)); after = spentNow(); }
  const usd = Math.round((after.usd - before.usd) * 1e6) / 1e6;
  const settled = after.open > 0 ? ledger('settle', `${RUN}-${id}`, String(PER_TURN), 'reserved-max:open-admission')
    : ledger('settle', `${RUN}-${id}`, String(usd), `usage_operations delta (${after.n - before.n} ops)`);
  record({ id, reserved, settled, usd: after.open > 0 ? PER_TURN : usd, ops: after.n - before.n, error, ...(result?.summary || {}) });
  return result;
}

// ---- the stack ----
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `chatb-real-${Date.now().toString(36)}@example.com`, secret }) })).json();
const headers = { cookie: `small_session=${session}`, 'content-type': 'application/json', origin: BASE };
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers }); return { status: r.status, body: await r.json().catch(() => null) }; };
const canvasWith = async (title, state = {}) => {
  const made = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;
  await api(`/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks: [], exchanges: [], ...state }, version: 0 }) });
  return made.name;
};

// One /api/learn/ask turn, read as SSE: event order, first-chunk and done times, the answer, answer_meta and done.
async function turn(app, body) {
  const started = Date.now();
  const r = await fetch(`${BASE}/api/learn/ask`, { method: 'POST', headers, body: JSON.stringify({ scope: { app }, ...body }) });
  if (!(r.headers.get('content-type') || '').includes('event-stream')) return { status: r.status, error: JSON.stringify(await r.json().catch(() => null)), summary: { status: r.status } };
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '', firstChunkMs = null, meta = null, done = null;
  const order = [];
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split('\n\n'); buf = events.pop();
    for (const ev of events) {
      const type = (ev.match(/^event: (.+)$/m) || [])[1], data = (ev.match(/^data: (.+)$/m) || [])[1];
      if (!type || !data) continue;
      const d = JSON.parse(data);
      if (order.at(-1) !== type) order.push(type);
      if (type === 'chunk') { if (firstChunkMs == null) firstChunkMs = Date.now() - started; text += d.text; }
      else if (type === 'answer_meta') meta = d;
      else if (type === 'done') done = d;
      else if (type === 'error') text += `\n[error] ${d.error}`;
    }
  }
  const doneMs = Date.now() - started;
  return { text, meta, done, order, summary: { order: order.join('>'), firstChunkMs, doneMs, chars: text.length, kind: meta?.kind ?? null,
    actions: (meta?.actions || []).map(a => `${a.capabilityId}${a.generationRequired ? '' : '(reuse)'}${a.paid ? '(paid)' : ''}: ${a.label} | ${a.args?.subject}`),
    followUps: (meta?.followUps || []).map(f => `${f.kind}: ${f.text}`), messageId: done?.messageId ?? null, threadId: done?.threadId ?? null } };
}
const want = id => !ONLY.length || ONLY.includes(id);
const metaRow = id => read(learnFile, 'SELECT role, alternative_of, meta_json FROM chat_message_meta WHERE message_id = ?', Number(id))[0] || null;
const stateRow = thread => read(learnFile, 'SELECT mode, context_json, last_activity_at FROM chat_thread_state WHERE thread_id = ?', thread)[0] || null;
const leaksTitle = (strings, title) => strings.some(s => s.toLowerCase().includes(title.toLowerCase()));

// 1. Ask on a canvas whose title is stale (Linked List) about something else: the answer, actions and follow-ups follow the
// conversation, not the title. Server ids, the SSE order, the meta and thread state rows.
const stale = await canvasWith('Linked List');
let ask = null;
if (want('ask')) {
  ask = await paid('ask', () => turn(stale, { message: 'How does evaporation drive the water cycle? Keep it short.', mode: 'ask', context_refs: [] }));
  if (ask?.done) {
    check(ask.summary.order === 'chunk>answer_meta>done', `SSE order chunk > answer_meta > done (got ${ask.summary.order})`);
    check(/^\d+$/.test(ask.done.messageId) && /^\d+$/.test(ask.done.userMessageId), 'done carries server message ids');
    check(!/answer_meta/.test(ask.text), 'the trailer never reaches the streamed text');
    check(!leaksTitle([ask.text, ...ask.summary.followUps, ...ask.summary.actions], 'linked list'), 'the stale canvas title (Linked List) is in neither the answer, the actions nor the follow-ups');
    check(ask.summary.followUps.length >= 1 && ask.summary.followUps.length <= 3, `1-3 follow-ups (got ${ask.summary.followUps.length})`);
    check(ask.summary.actions.length <= 3, `at most 3 actions (got ${ask.summary.actions.length})`);
    const row = metaRow(ask.done.messageId);
    check(row?.role === 'assistant' && JSON.parse(row.meta_json).mode === 'ask', 'the assistant meta row is stored with mode ask');
    check(metaRow(ask.done.userMessageId)?.role === 'user', 'the user meta row is stored');
    check(stateRow(ask.done.threadId)?.last_activity_at, 'chat_thread_state has last_activity_at');
  }
}

// 2. A follow-up in the same thread that asks for rich formatting (headings, a table, an equation, code): the text for the
// renderer screenshots. Then thumbs on it, persisted and cleared.
let rich = null;
if (want('rich') && ask?.done) {
  rich = await paid('rich', () => turn(stale, { message: 'Give me the latent heat of vaporization as an equation, a small table of values for three liquids, and a 4-line Python snippet computing the energy to boil 1 kg of water. Use headings.', mode: 'ask', context_refs: [], thread_id: ask.done.threadId }));
  if (rich?.done) {
    writeFileSync(`${OUT}/rich-answer.md`, rich.text);
    check(/\$|\\\(|\\\[/.test(rich.text) && /\|.*\|/.test(rich.text) && /```/.test(rich.text), 'the rich answer carries math, a table and a code fence');
    const id = rich.done.messageId;
    const up = await api(`/api/learn/chat/messages/${id}/feedback`, { method: 'PUT', body: JSON.stringify({ rating: 'up' }) });
    const got = await api(`/api/learn/chat/messages/${id}`);
    check(up.status === 200 && got.body?.meta?.feedback?.rating === 'up', 'thumbs up is stored against the message id');
    const down = await api(`/api/learn/chat/messages/${id}/feedback`, { method: 'PUT', body: JSON.stringify({ rating: 'down', reason: 'too long' }) });
    check(down.body?.rating === 'down' && down.body?.reason === 'too long', 'changed to thumbs down with a reason');
    await api(`/api/learn/chat/messages/${id}/feedback`, { method: 'PUT', body: JSON.stringify({ rating: null }) });
    check((await api(`/api/learn/chat/messages/${id}`)).body?.meta?.feedback == null, 'the rating clears');
  }
}

// 3. Regenerate the latest answer: a new alternative, the old one kept, no new user message.
if (want('regen') && rich?.done) {
  const users = () => read(learnFile, "SELECT COUNT(*) AS n FROM chat_message_meta WHERE thread_id = ? AND role = 'user'", rich.done.threadId)[0].n;
  const before = users();
  const again = await paid('regen', () => turn(stale, { message: 'regenerate', mode: 'ask', context_refs: [], thread_id: rich.done.threadId, regenerate: { messageId: rich.done.messageId } }));
  if (again?.done) {
    check(again.done.messageId !== rich.done.messageId && String(metaRow(again.done.messageId)?.alternative_of) === rich.done.messageId, 'the regenerated answer is a new message, alternative_of the first');
    check(users() === before, 'regenerate inserts no user message');
    const alt = await api(`/api/learn/chat/messages/${again.done.messageId}`);
    check((alt.body?.meta?.alternatives || []).length === 2, 'both alternatives are listed');
  }
}

// 4. Auto: a plain question stays an answer; an explicit course request gives a syllabus in the journey path shape, and an
// edit to it saves.
const music = await canvasWith('Untitled');
if (want('auto-plain')) {
  const plain = await paid('auto-plain', () => turn(music, { message: 'What is a chord in music?', mode: 'auto', context_refs: [] }));
  if (plain?.done) { check(plain.summary.kind !== 'syllabus', `Auto keeps a plain question an answer (kind ${plain.summary.kind})`); check(plain.text.trim().length > 40, `the answer has text (${plain.text.trim().length} chars), even when the model used a tool`); }
}
if (want('auto-course')) {
  const course = await paid('auto-course', () => turn(music, { message: 'Make me a course on music theory. I am a complete beginner and I play a little guitar.', mode: 'auto', context_refs: [] }));
  if (course?.done) {
    const syllabus = course.meta?.syllabus;
    check(course.summary.kind === 'syllabus' && syllabus?.topics?.length >= 3, `Auto turns an explicit course request into a syllabus (kind ${course.summary.kind}, ${syllabus?.topics?.length ?? 0} topics)`);
    writeFileSync(`${OUT}/syllabus.json`, JSON.stringify(syllabus, null, 2));
    if (syllabus?.topics?.length) {
      const topics = syllabus.topics.map((t, i) => (i === 0 ? { ...t, title: `${t.title} (edited)` } : t));
      const saved = await api(`/api/learn/chat/messages/${course.done.messageId}/syllabus`, { method: 'PUT', body: JSON.stringify({ topics }) });
      check(saved.status === 200 && JSON.parse(metaRow(course.done.messageId).meta_json).syllabus.topics[0].title.endsWith('(edited)'), 'a syllabus edit saves to the message');
    }
  }
}

// 5. An unrelated subject with code in the answer: suggested actions come from the registry, and Open in Notebook reuses the
// answer's own code (generationRequired false).
if (want('code')) {
  const tree = await canvasWith('Weekend plans');
  const code = await paid('code', () => turn(tree, { message: 'Show me Python code that inserts a key into a binary search tree, then explain it in three sentences.', mode: 'ask', context_refs: [] }));
  if (code?.done) {
    const known = ['diagram', 'graph', 'animate', 'video', 'image', 'notebook', 'code', 'compare', 'practice', 'quiz'];
    check((code.meta?.actions || []).every(a => known.includes(a.capabilityId) && a.args?.subject && a.sourceMessageId === code.done.messageId), 'every action is a validated registry record with a subject and its source message');
    check(!leaksTitle([code.text, ...code.summary.followUps], 'weekend'), 'the stale title (Weekend plans) stays out');
  }
}

const total = log.filter(e => e.usd != null).reduce((a, e) => a + e.usd, 0);
const checks = log.filter(e => e.check);
record({ done: true, spentUsd: Math.round(total * 1e6) / 1e6, checks: `${checks.filter(c => c.ok).length}/${checks.length}` });
