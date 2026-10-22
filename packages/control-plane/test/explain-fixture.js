// Shared stack for the /explain job tests (EXP-T12, T17, T19, M3): the real ledger (learn-migrations 0016 + 0022) and the chat
// tables the proposal state lives on, in SQLite; the real ExplainJobs object on a durable storage map that outlives an
// instance (object() is the object after a restart). No fetch is installed here: each test installs its provider.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ExplainJobs } from '../src/explain-job.js';
import { periodOf } from '../src/learn-usage.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
export const NOW = Math.floor(Date.now() / 1000), PERIOD = periodOf(NOW);
export const OWNER = { org: 'acme', email: 'learner@example.com', userId: 'u-1' };
export const BOARD = { id: 'board-1', app: 'canvas-a', board: 'main' };

export function d1(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql']) sqlite.exec(sql(file));
  sqlite.exec('CREATE TABLE learn_boards (id TEXT PRIMARY KEY, app TEXT, board TEXT, org TEXT, owner_email TEXT)');
  sqlite.prepare('INSERT INTO learn_boards VALUES (?, ?, ?, ?, ?)').run(BOARD.id, BOARD.app, BOARD.board, OWNER.org, OWNER.email);
  // The chat tables the proposal state lives on (repository-schema.sql threads and chat_message_meta, the columns it reads).
  sqlite.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, org TEXT NOT NULL, user TEXT NOT NULL, scope_ref TEXT NOT NULL); CREATE TABLE chat_message_meta (message_id INTEGER PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, alternative_of INTEGER, meta_json TEXT NOT NULL)");
  const LEARN_DB = {
    prepare(text) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        first: async () => sqlite.prepare(text).get(...args) || null,
        all: async () => ({ results: sqlite.prepare(text).all(...args) }),
        run: async () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }),
        now: () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }),
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, LEARN_DB };
}
export const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(r => ({ ...r }));
export function spent(sqlite, micros) {
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('seed', ?, 'user', 'signed_in', 'ask', 'would_charge', ?, 'completed', ?)").run(OWNER.userId, PERIOD, NOW);
  sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES ('seed-a', 'seed', 'generation', ?, ?, 'settled', 'settled', ?)").run(micros, micros, NOW);
}
export function durable(data = new Map()) {
  let lock = Promise.resolve();
  return { id: 'explain-test', data, storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => { if (typeof k === 'object') for (const [key, value] of Object.entries(k)) data.set(key, structuredClone(value)); else data.set(k, structuredClone(v)); },
    delete: async k => data.delete(k), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])),
    setAlarm: async () => {}, getAlarm: async () => null, deleteAlarm: async () => {} },
    blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
}

export function explainStack(t, { pipeline, used = 0 } = {}) {
  const { sqlite, LEARN_DB } = d1(t);
  if (used) spent(sqlite, used);
  const env = { SMALL_ENV: 'dev', ANTHROPIC_API_KEY: 'test-key', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50', LEARN_DB, EXPLAIN_V2_ENABLED: 'true',
    // Configured brief thresholds: a simple request within them goes straight to authoring (explain-brief.js).
    EXPLAIN_BRIEF_THRESHOLDS: JSON.stringify({ components: 12, credits: 400 }) };
  const state = durable();
  const object = () => new ExplainJobs(state, env, pipeline);
  const actor = object();
  const send = async (action, payload = {}, id = null, who = OWNER, on = actor) => {
    const response = await on.fetch(new Request('https://explain/action', { method: 'POST', body: JSON.stringify({ action, id, payload, board: BOARD, user: who, origin: 'https://dev.test' }) }));
    return { status: response.status, body: await response.json() };
  };
  const create = (extra = {}) => send('create', { requestId: 'req-00000001', cardId: 'card-0001', prompt: 'Explain a pendulum.', requestClass: 'simple', ...extra });
  const job = async id => (await send('get', {}, id)).body;
  // Each alarm advances each live job by one stage.
  const run = async (id, on = actor, max = 40) => { for (let i = 0; i < max; i++) { await on.alarm(); const j = state.data.get(`job:${id}`); if (['ready', 'failed', 'cancelled', 'awaiting_approval'].includes(j.stage) && !j.inFlight) return j; } return state.data.get(`job:${id}`); };
  return { sqlite, env, state, actor, object, send, create, job, run };
}
