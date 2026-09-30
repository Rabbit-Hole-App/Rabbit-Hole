// Production storage as the dev worker binds it (C1, docs/features/learn-cleanup.md):
// DB = live D1 "small", RUNS = live small-runs, CONTROL_PLANE = live small-cp.
// Every call is RECORDED before it throws. The moment log (ask.js) and hotMoment
// swallow their errors, so a fake that only throws would let a live write pass
// silently: assert on `.calls`, never on a thrown error.
export function liveDb() {
  const calls = [];
  const refuse = what => { calls.push(what); throw new Error(`live D1 touched: ${what}`); };
  return { calls, prepare: sql => refuse(sql), batch: async () => refuse('batch'), exec: async sql => refuse(sql) };
}

export function liveRuns() {
  const calls = [];
  const refuse = (op, key) => { calls.push(`${op} ${key ?? ''}`.trim()); throw new Error('live bucket touched'); };
  return { calls, get: async key => refuse('get', key), head: async key => refuse('head', key), put: async key => refuse('put', key), delete: async key => refuse('delete', key), list: async options => refuse('list', options?.prefix) };
}

// Answers the identity reads only: GET /api/apps and GET /api/apps/<name> (from `apps`).
// Any other method or path is recorded in `refused` and throws, since the dev worker
// proxies it to live small-cp. ponytail: this fake replaces live GET /api/apps, so it
// cannot see that handler's own sweepStaleRuns UPDATE (index.js apiApps); recorded in learn-cleanup.md.
export function readOnlyControlPlane({ org = 'team', email = 'owner@test', apps = {} } = {}) {
  const seen = [], refused = [];
  return {
    seen, refused,
    fetch: async req => {
      const path = new URL(req.url).pathname;
      if (req.method !== 'GET') { refused.push(`${req.method} ${path}`); throw new Error(`live small-cp write: ${req.method} ${path}`); }
      seen.push(`GET ${path}`);
      if (path === '/api/apps') return Response.json({ org, email, orgName: 'Team', apps: [] });
      const name = decodeURIComponent(path.replace(/^\/api\/apps\//, ''));
      if (apps[name]) return Response.json({ name, org, email, ...apps[name] });
      refused.push(`GET ${path}`);
      return Response.json({ error: 'not found' }, { status: 404 });
    },
  };
}

// An in-memory R2 bucket with the slice of the API the Learn handlers use.
export function memoryBucket() {
  const objects = new Map();
  const body = (value, meta = {}) => {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    return {
      ...meta, size: bytes.byteLength,
      body: new Response(bytes).body,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => new TextDecoder().decode(bytes),
      json: async () => JSON.parse(new TextDecoder().decode(bytes)),
    };
  };
  return {
    objects,
    put: async (key, value, options = {}) => {
      const bytes = typeof value === 'string' ? value : value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, { bytes, httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} });
    },
    get: async key => { const o = objects.get(key); return o ? body(o.bytes, { httpMetadata: o.httpMetadata, customMetadata: o.customMetadata }) : null; },
    head: async key => { const o = objects.get(key); return o ? { httpMetadata: o.httpMetadata, customMetadata: o.customMetadata } : null; },
    delete: async keys => { for (const key of [keys].flat()) objects.delete(key); },
    list: async ({ prefix = '' } = {}) => ({ objects: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false }),
  };
}
