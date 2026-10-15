import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// REAL model check of repo-graph Release 1 suggestions (brief sections 10-11, owner decision 9) on a LOCAL stack only. Five
// paid turns, each reserved in the shared ledger first and settled from the stack's usage_operations delta after:
//   1 curious-repo      Curious on the repository's blank Main canvas: technical ideas grounded in the repository
//   2 curious-topic     Curious after the canvas moves to an unrelated subject: the new subject wins
//   3 chat-repo         a Chat question on a project canvas of that repository: implementation follow-ups
//   4 chat-offtopic     an explicit off-topic request in that same chat: answered, not restricted to the repository
//   5 chat-node         a selected-node question on the Main canvas: the answer reads that node's source
// The owner's cap for this whole task is 3.00 USD across both releases (ids rg-*); the script refuses any call whose
// reservation would pass it, on top of the ledger's own cap. Never prints a key: TEST_BYPASS_SECRET is read by name.
// usage: node e2e/repo-suggestions-real.mjs --base http://127.0.0.1:8921 --cp http://127.0.0.1:8923 --vars <app .dev.vars>
//          --persist <stack persist dir> --ledger C:/Users/cyudhist/Desktop/workspace/inline-ai-spend/ledger.mjs
//          --email <test account that owns the repository> --repo <repo-... project name> --canvas <canvas-... in that project>
//          --out <dir> [--only=curious-repo,chat-node] [--dry]
const arg = name => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : null; };
const BASE = arg('base'), CP = arg('cp'), OUT = arg('out'), LEDGER = arg('ledger'), PERSIST = arg('persist'), REPO = arg('repo'), CANVAS = arg('canvas'), EMAIL = arg('email');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean), DRY = process.argv.includes('--dry');
for (const [name, value] of Object.entries({ base: BASE, cp: CP, out: OUT, ledger: LEDGER, persist: PERSIST, repo: REPO, canvas: CANVAS, email: EMAIL, vars: arg('vars') })) if (!value) { console.error(`missing --${name}`); process.exit(2); }
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE) || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(CP)) { console.error('refused: local stacks only'); process.exit(2); }
const TASK_CAP = 3.0, PREFIX = 'rg-', RUN = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
// Reservations: a Curious set is one routine call (an escalation is a second); a Chat turn with repository tools reads code.
const MAX = { curious: 0.15, chat: 0.4 };
mkdirSync(OUT, { recursive: true });

// ---- the task's own cap, read from the shared ledger file beside ledger.mjs ----
const LEDGER_FILE = join(dirname(LEDGER), 'ledger.jsonl');
function taskSpend() {
  const rows = existsSync(LEDGER_FILE) ? readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => String(row.id).startsWith(PREFIX)) : [];
  const open = new Map();
  let spent = 0;
  for (const row of rows) {
    if (row.op === 'reserve') open.set(row.id, row.max_usd);
    if (row.op === 'settle') { spent += row.actual_usd; open.delete(row.id); }
    if (row.op === 'release') open.delete(row.id);
  }
  const held = [...open.values()].reduce((sum, usd) => sum + usd, 0);
  return { spent: Math.round(spent * 1e6) / 1e6, held: Math.round(held * 1e6) / 1e6, remaining: Math.round((TASK_CAP - spent - held) * 1e6) / 1e6 };
}
const ledger = (...args) => execFileSync('node', [LEDGER, ...args], { encoding: 'utf8' }).trim();
const usageFile = () => readdirSync(`${PERSIST}/v3/d1/miniflare-D1DatabaseObject`).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
  .map(name => `${PERSIST}/v3/d1/miniflare-D1DatabaseObject/${name}`)
  .find(file => { const db = new DatabaseSync(file, { readOnly: true }); try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'usage_operations'").get(); } finally { db.close(); } });
const spentNow = file => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare("SELECT COALESCE(SUM(cost_usd),0) AS usd, COUNT(*) AS n, COALESCE(SUM(CASE WHEN status='admitted' THEN 1 ELSE 0 END),0) AS open FROM usage_operations").get(); } finally { db.close(); }
};

const log = [];
const record = entry => { log.push(entry); console.log(JSON.stringify({ id: entry.id, usd: entry.usd, error: entry.error, ...(entry.hooks ? { hooks: entry.hooks } : {}), ...(entry.followUps ? { followUps: entry.followUps.map(f => f.text) } : {}) })); writeFileSync(`${OUT}/repo-suggestions-real.json`, JSON.stringify({ run: RUN, task: taskSpend(), log }, null, 2)); };
async function paid(name, kind, fn) {
  const id = `${PREFIX}${name}-${RUN}`, max = MAX[kind], task = taskSpend();
  if (max > task.remaining) { console.error(`refused: ${name} reserves $${max}, the task has $${task.remaining} left of $${TASK_CAP}`); process.exit(4); }
  if (DRY) { console.log(`dry: would reserve ${id} $${max}; task spent $${task.spent}, held $${task.held}`); return null; }
  const file = usageFile(), before = spentNow(file);
  ledger('reserve', id, 'anthropic', `repo-graph-${kind}`, String(max), 'owner decision 9: repo-graph Release 1 real suggestion check, local stack');
  let result = null, error = null;
  try { result = await fn(); } catch (failure) { error = String(failure.message).split('\n')[0]; }
  let after = spentNow(file);
  for (let i = 0; i < 20 && after.open > 0; i += 1) { await new Promise(r => setTimeout(r, 1500)); after = spentNow(file); }
  const actual = Math.round((after.usd - before.usd) * 1e6) / 1e6;
  const settled = after.open > 0 ? ledger('settle', id, String(max), 'reserved-max:open-admission') : ledger('settle', id, String(actual), `usage_operations delta (${after.n - before.n} ops)`);
  record({ id, name, settled, usd: after.open > 0 ? max : actual, error, ...(result || {}) });
  return result;
}

// ---- the local stack, as its test account ----
const secret = readFileSync(arg('vars'), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim();
if (!secret) { console.error('TEST_BYPASS_SECRET is not in --vars'); process.exit(2); }
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json();
const headers = { cookie: `small_session=${session}`, 'content-type': 'application/json', origin: BASE };
const getJson = async path => { const r = await fetch(`${BASE}${path}`, { headers }); if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`); return r.json(); };
const postJson = async (path, body) => { const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }); const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${path}: ${r.status} ${data.error || ''}`); return data; };
// One Chat turn: the streamed text, the validated answer_meta and the thread id.
async function ask(body) {
  const r = await fetch(`${BASE}/api/learn/ask`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok || !r.body) throw new Error(`/api/learn/ask: ${r.status} ${await r.text()}`);
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '', meta = null, done = null, failure = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop();
    for (const frame of frames) {
      const type = (frame.match(/^event: (.+)$/m) || [])[1], data = (frame.match(/^data: (.+)$/m) || [])[1];
      if (!type || !data) continue;
      const d = JSON.parse(data);
      if (type === 'chunk') text += d.text;
      else if (type === 'answer_meta') meta = d;
      else if (type === 'done') done = d;
      else if (type === 'error') failure = d.error;
    }
  }
  if (failure) throw new Error(failure);
  return { answer: text.slice(0, 2500), followUps: meta?.followUps || [], actions: (meta?.actions || []).map(a => a.label), threadId: done?.threadId || null, commit: done?.commit || null };
}

const repository = await getJson(`/api/repositories/${encodeURIComponent(REPO)}`);
if (!repository.commit_sha) { console.error(`refused: ${REPO} is ${repository.status}, not indexed yet`); process.exit(3); }
const snapshot = await getJson(`/api/repositories/${encodeURIComponent(REPO)}/snapshot`);
const degree = new Map();
for (const edge of snapshot.graph.edges) for (const id of [edge.source, edge.target]) degree.set(id, (degree.get(id) || 0) + 1);
const node = [...snapshot.graph.nodes].filter(n => n.path && n.kind !== 'external').sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))[0];
const blankInput = basis => ({ mode: 'canvas', basis, goal: '', canvas: { blocks: [] }, scope: { concepts: {}, claims: {} }, recent: { intent: null, transitions: [], modalities: [], practice: [] }, previous: { hooks: [], goals: [] }, constraints: { learner: [] } });
// The canvas moved on: one card on a subject no code repository is about (a test fixture, never product text).
const topicInput = basis => ({ ...blankInput(basis), canvas: { blocks: [{ id: 'rg-topic-1', kind: 'Explanation', title: 'Why sourdough bread rises', concept_ids: [], claim_ids: [], practice: null, text: 'Wild yeast and lactic acid bacteria ferment flour; carbon dioxide trapped in the gluten network makes the dough rise.' }] }, recent: { intent: 'question', question: 'Why does sourdough rise more slowly than bread made with dry yeast?', transitions: [], modalities: [], practice: [] } });
const want = name => !ONLY.length || ONLY.includes(name);
console.log(JSON.stringify({ run: RUN, repo: repository.repo, commit: repository.commit_sha.slice(0, 7), node: node ? { id: node.id, label: node.label, path: node.path } : null, task: taskSpend(), dry: DRY }));

if (want('curious-repo')) await paid('curious-repo', 'curious', async () => {
  const set = await postJson('/api/learn/tutor/next-steps', { app: REPO, input: blankInput(`rg_${RUN}_repo`) });
  return { hooks: set.options.map(o => o.hook), cost_reported: set.telemetry?.cost_usd ?? null };
});
if (want('curious-topic')) await paid('curious-topic', 'curious', async () => {
  const set = await postJson('/api/learn/tutor/next-steps', { app: REPO, input: topicInput(`rg_${RUN}_topic`) });
  return { hooks: set.options.map(o => o.hook), cost_reported: set.telemetry?.cost_usd ?? null };
});
let thread = null;
if (want('chat-repo')) {
  const out = await paid('chat-repo', 'chat', () => ask({ scope: { app: CANVAS }, message: 'How does this repository work at a high level, and where does the main work happen?', mode: 'ask', command: null, context_refs: [], thread_id: null }));
  thread = out?.threadId || null;
}
if (want('chat-offtopic')) await paid('chat-offtopic', 'chat', () => ask({ scope: { app: CANVAS }, message: 'Different question, not about this code: how do vaccines train the immune system?', mode: 'ask', command: null, context_refs: [], thread_id: thread }));
if (want('chat-node') && node) await paid('chat-node', 'chat', async () => ({ node: node.label, ...(await ask({ scope: { app: REPO }, message: 'What does this do, and what depends on it?', repository_context: { commit: repository.commit_sha, nodeId: node.id, label: node.label }, thread_id: null })) }));
console.log(JSON.stringify({ done: RUN, task: taskSpend(), report: `${OUT}/repo-suggestions-real.json` }));
