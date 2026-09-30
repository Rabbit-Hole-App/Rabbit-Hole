// The dev/review worker's only way through to production small-cp (dev-worker.js, last line of fetch).
// Fail closed: a request crosses only when it matches an entry below; everything else gets a JSON 403
// and never reaches production. Why each entry is safe: docs/features/dev-prod-write-barrier.md.

// Production GETs whose handlers (control-plane/src/index.js) only SELECT from D1 or read R2,
// and make no Fly, AWS, Slack, email or model call. Not here, on purpose: GET /api/logs (mints a Fly
// deploy token and writes apps.deploy_token), GET /api/runs (sweepStaleRuns UPDATE), GET /api/apps
// (same sweep; the dev worker answers it itself), the s3-list, s3-object and role reads (assume the
// customer's AWS role with production keys), /slack/* and /a/* (customer apps).
const READS = [
  /^\/$/,
  /^\/api\/workspaces$/,
  /^\/api\/watch$/,
  /^\/api\/ask\/threads(?:\/\d+)?$/,
  /^\/api\/runs\/[\w-]+$/,
  /^\/api\/runs\/[\w-]+\/outputs(?:\/.+)?$/,
  /^\/api\/apps\/[a-z0-9-]+(?:\/(?:deploys|runbook|learn-course))?$/,
  /^\/api\/trash$/,
  /^\/api\/org\/ai$/,
  /^\/api\/teams$/,
  /^\/api\/members$/,
  /^\/api\/request-logs$/,
  /^\/api\/review$/,
];

// No production authentication crosses the barrier (owner, 2026-09-30): /login, /auth, /logout and
// /test/session are refused with every method. Dev and review sign-in comes only from the dedicated dev
// control plane with its own MASTER_KEY (deployment step 5); until it exists, auth-dependent dev flows
// are unavailable, with no bypass in between.
export function productionAllows(method, path) {
  return method === 'GET' && READS.some(pattern => pattern.test(path));
}

// Who is signed in, asked of production without side effects: GET /api/me (index.js). The dev worker
// used GET /api/apps, whose sweepStaleRuns UPDATEs production runs. Returns {email, org, orgName}
// or a JSON 401/403 Response.
// ponytail: /api/me reaches production only with its next approved deploy; until then small-cp
// answers it 404 and the identity comes from two reads that write nothing, GET /api/workspaces
// (the active workspace and its name) and GET /api/trash (the email). Delete the fallback after that deploy.
export async function devIdentity(req, env) {
  const get = async path => {
    const url = new URL(req.url); url.pathname = path; url.search = '';
    const response = await env.CONTROL_PLANE.fetch(new Request(url, { headers: req.headers, redirect: 'manual' }));
    return response.ok && response.headers.get('content-type')?.includes('json') ? response.json() : response;
  };
  let me = await get('/api/me');
  if (me instanceof Response && me.status === 404) {
    const workspaces = await get('/api/workspaces'), trash = workspaces instanceof Response ? workspaces : await get('/api/trash');
    me = trash instanceof Response ? trash : { email: trash.email, org: workspaces.active, orgName: workspaces.workspaces?.find(w => w.slug === workspaces.active)?.name || null };
  }
  const refuse = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (me instanceof Response) return refuse('Sign in to this workspace first', me.status === 403 ? 403 : 401);
  if (!me.org || !me.email) return refuse('Workspace membership required', 403);
  return { email: me.email, org: me.org, orgName: me.orgName || null };
}

// Every CONTROL_PLANE call on the dev worker, not only the fall-through: dev-worker.js wraps the
// binding once at the top of fetch() and queue(), so a module that later adds a production call
// (learn-board.js authorizedBoardApp, byoc.js hostedApp, devIdentity today) is refused by default too.
export function guardControlPlane(env) {
  const live = env?.CONTROL_PLANE;
  if (!live || live.guarded) return env;
  const guarded = {
    guarded: true,
    fetch(input, init) {
      const req = input instanceof Request && !init ? input : new Request(input, init);
      const path = new URL(req.url).pathname;
      if (productionAllows(req.method, path) || (req.method === 'GET' && path === '/api/me')) return live.fetch(req);
      return Promise.resolve(Response.json({ error: 'Blocked on this preview: it would change live state.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }));
    },
  };
  return { ...env, CONTROL_PLANE: guarded };
}

export function forwardToProduction(req, env) {
  if (productionAllows(req.method, new URL(req.url).pathname)) return env.CONTROL_PLANE.fetch(req);
  return Response.json({ error: 'Blocked on this preview: it would change live state.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
