// Independent CAD route harness: real SQLite and HTTP, simulated DO storage/alarms.
// It proves route/authorization behavior, not actual Workers durability or CAD geometry.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { memoryBucket } from './live-storage-spy.js';

export async function startCadAcceptanceStack({ cadRoute, CadJobs, extraEnv = {} }) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  for (const [id, owner, app] of [['cad-board-a', 'owner@test', 'cad-a'], ['cad-board-b', 'other@test', 'cad-b']]) {
    sqlite.prepare('INSERT INTO learn_boards(id,org,owner_email,app,board,state_json,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, 'team', owner, app, 'main', JSON.stringify({ blocks: [], links: [] }), new Date().toISOString());
  }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql); let args = [];
      return { bind(...values) { args = values; return this; }, first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }), run: async () => ({ meta: statement.run(...args) }) };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const out = []; for (const statement of statements) out.push(await statement.run()); sqlite.exec('COMMIT'); return out; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const objects = new Map(), events = [], outbound = [], media = memoryBucket();
  // Existing storage spy omits R2 head.size; CAD verifies declared upload lengths.
  const head = media.head;
  media.head = async key => { const value = await head(key); return value ? { ...value, size: (await media.get(key)).size } : null; };
  let failAlarm = false;
  const actor = id => {
    if (objects.has(id)) return objects.get(id);
    const data = new Map(); let alarm = null, queue = Promise.resolve();
    const storage = {
      get: async key => structuredClone(data.get(key)),
      put: async (key, value) => { events.push({ kind: 'put', actor: id, key }); if (typeof key === 'object') for (const [k,v] of Object.entries(key)) data.set(k,structuredClone(v)); else data.set(key,structuredClone(value)); },
      delete: async key => data.delete(key),
      list: async ({ prefix = '' } = {}) => new Map([...data].filter(([key]) => key.startsWith(prefix)).map(([key,value]) => [key,structuredClone(value)])),
      getAlarm: async () => alarm,
      setAlarm: async at => { events.push({ kind: 'alarm', actor: id }); if (failAlarm) throw Error('diagnostic alarm unavailable'); alarm = at; },
      deleteAlarm: async () => { alarm = null; },
      transaction: async fn => fn(storage),
    };
    const state = { storage, blockConcurrencyWhile(fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result; } };
    const instance = new CadJobs(state, env);
    const value = { data, storage, instance, restart() { this.instance = new CadJobs(state, env); } };
    objects.set(id, value); return value;
  };
  const env = {
    SMALL_ENV: 'test', LEARN_DB: db, LEARN_MEDIA: media,
    CAD_JOB_SECRET: 'synthetic-cad-callback-secret-not-a-credential',
    CAD_EXECUTOR_URL: 'https://cad-executor.invalid', CAD_EXECUTOR_TOKEN: 'synthetic-executor-token',
    CONTROL_PLANE: { fetch: async request => {
      if (request.method !== 'GET') { outbound.push(`${request.method} ${new URL(request.url).pathname}`); throw Error('Unexpected control-plane write'); }
      const email = request.headers.get('x-email');
      return email ? Response.json({ org: 'team', email, user_id: email, apps: [] }) : new Response('', { status: 401 });
    } },
    CAD_JOBS: { idFromName: value => value, get: id => ({ fetch: (url, init) => actor(id).instance.fetch(url instanceof Request ? url : new Request(url, init)) }) },
    ...extraEnv,
  };
  const server = createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const req = new Request(`http://127.0.0.1${request.url}`, { method: request.method, headers: request.headers,
        ...(body && !['GET','HEAD'].includes(request.method) ? { body } : {}) });
      const result = await cadRoute(new URL(req.url).pathname, req, env) || new Response('', { status: 404 });
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) { response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { sqlite, env, media, objects, events, outbound, setAlarmFailure: value => { failAlarm = value; },
    request: (path, { method = 'GET', body, email = 'owner@test' } = {}) => fetch(origin + path, { method,
      headers: { ...(email ? { 'x-email': email } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    close: async () => { await new Promise(resolve => server.close(resolve)); sqlite.close(); },
  };
}
