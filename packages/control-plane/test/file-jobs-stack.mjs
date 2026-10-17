// A small local control plane for the file-job runner: real HTTP on 127.0.0.1, fileJobsRoute behind it, node:sqlite with
// repository-schema.sql (migration 0023 included), an in-memory R2 bucket and Durable Objects whose alarms fire on real
// timers. Used by the integration test and the local demo against test/fake-converter.mjs. Not a Workers runtime: it
// proves the job protocol over real sockets, not wrangler bindings.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileJobsRoute, FileJobs } from '../src/file-jobs.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function bucket() {
  const objects = new Map();
  const view = (o, bytes = o.bytes) => ({ size: o.bytes.byteLength, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata, body: new Response(bytes).body, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return {
    objects,
    head: async key => (objects.has(key) ? { size: objects.get(key).bytes.byteLength, httpMetadata: objects.get(key).httpMetadata, customMetadata: objects.get(key).customMetadata } : null),
    get: async key => (objects.has(key) ? view(objects.get(key)) : null),
    put: async (key, value, options = {}) => {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value instanceof ArrayBuffer ? value : await new Response(value).arrayBuffer());
      if (options.sha256 && sha(bytes) !== options.sha256) throw new Error('R2 checksum mismatch'); // what R2 does with a sha256 option
      objects.set(key, { bytes, httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} });
    },
  };
}

export async function startJobStack({ convertUrl, convertToken, port = 0, owner = 'owner@test' } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  const media = bucket();
  // One object per job id, each with its own storage and a real-timer alarm, like the platform's.
  const objects = new Map();
  const object = (id, env) => {
    if (!objects.has(id)) {
      const data = new Map(); let alarm = null, timer = null;
      const storage = { get: async k => data.get(k), put: async (k, v) => data.set(k, v), deleteAll: async () => data.clear(), getAlarm: async () => alarm,
        setAlarm: async at => { alarm = at; clearTimeout(timer); timer = setTimeout(async () => { alarm = null; try { await actor.alarm(); } catch (e) { stack.alarmErrors.push(e); storage.setAlarm(Date.now() + 1000); } }, Math.max(0, at - Date.now())); },
        stop: () => clearTimeout(timer) };
      const actor = new FileJobs({ storage }, env);
      objects.set(id, { actor, storage });
    }
    return objects.get(id);
  };
  const server = createServer();
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = {
    LEARN_DB: db, LEARN_MEDIA: media, CONVERT_URL: convertUrl, CONVERT_TOKEN: convertToken, FILE_JOB_SECRET: randomBytes(32).toString('hex'), FILE_JOB_ORIGIN: origin,
    CONTROL_PLANE: { fetch: async req => (req.headers.get('x-email') ? Response.json({ org: 'team', email: req.headers.get('x-email'), apps: [] }) : new Response('', { status: 401 })) },
    FILE_JOBS: { idFromName: n => n, get: id => ({ fetch: (url, init) => object(id, env).actor.fetch(new Request(url, init)) }) },
  };
  server.on('request', async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`${origin}${req.url}`, { method: req.method, headers: req.headers, ...(body && !['GET', 'HEAD'].includes(req.method) ? { body } : {}) });
    let response;
    try { response = (await fileJobsRoute(new URL(request.url).pathname, request, env)) || Response.json({ error: 'Not found' }, { status: 404 }); }
    catch (error) { response = Response.json({ error: error.message }, { status: 500 }); }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  sqlite.prepare("INSERT INTO learn_boards(id, org, owner_email, app, board, state_json, updated_at) VALUES('b1', 'team', ?, 'canvas-demo', 'main', '{\"blocks\":[]}', datetime('now'))").run(owner);
  const stack = {
    origin, env, sqlite, media, alarmErrors: [],
    // A stored source, as Lane 1's upload route leaves it.
    addSource(bytes, { family = 'presentation', name = 'deck.pptx' } = {}) {
      const id = `fs_${randomBytes(12).toString('hex')}`;
      sqlite.prepare("INSERT INTO file_sources(id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES(?, 'team', ?, 'canvas-demo', 'b1', ?, ?, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ?, ?, ?, 'stored', ?, ?)")
        .run(id, owner, family, name, bytes.byteLength, sha(bytes), `file-sources/${id}/original`, Date.now(), Date.now());
      media.objects.set(`file-sources/${id}/original`, { bytes, httpMetadata: {}, customMetadata: {} });
      return id;
    },
    request: (path, { method = 'GET', body, email = owner } = {}) => fetch(`${origin}${path}`, { method, headers: { 'x-email': email, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }),
    job: id => sqlite.prepare('SELECT * FROM file_jobs WHERE id = ?').get(id),
    derivatives: sourceId => sqlite.prepare('SELECT * FROM file_derivatives WHERE source_id = ? ORDER BY name').all(sourceId),
    close: () => { for (const o of objects.values()) o.storage.stop(); return new Promise(r => server.close(r)); },
  };
  return stack;
}
