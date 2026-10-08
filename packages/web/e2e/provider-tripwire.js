// Test-only: a local check must send nothing to a model or paid-AI provider, and a missing API key is not isolation (a
// keyless worker still calls the provider, unauthenticated: the shared Rabbit Hole check did, 2026-10-07). On the local gate
// stack every worker is started through a tripwire entrypoint (e2e/tripwire-*-worker.js): this module, imported first, makes
// every outbound request to a provider host fail without leaving the machine (HTTP 599) and counts it, and
// GET /__provider-tripwire answers the count, this worker's plus its control plane's. Never deployed: no wrangler config in
// the repository points at a tripwire entrypoint; the local stack configs do (e2e/provider-tripwire.md).
//
// Expected requests (owner, 2026-10-08): the Professor Next Steps hook planner (tool suggest_next_steps) runs whenever a
// canvas opens, so it is answered here, at the outgoing provider boundary, with the keyless journey stack's deterministic
// fixture (learn-journey-fixtures.js): the real hook route, its input checks and its output validation all run. Those
// answers are counted as fixtures, never as hits; any other provider request is still a hit and fails the gate. The hook
// requests the worker receives are logged too (route and basis), so a wrong trigger or a request loop shows in the counts.
import { fixtureModel } from '../../control-plane/src/learn-journey-fixtures.js';

export const PROVIDER_HOSTS = ['api.anthropic.com', 'api.openai.com', 'api.typesafe.ai', 'api.fish.audio', 'api.elevenlabs.io', 'api.heygen.com', 'api.exa.ai'];
export const FIXTURE_TOOLS = ['suggest_next_steps'];
const hits = [], fixtures = [], hooks = [];
const original = globalThis.fetch;
const urlOf = (input) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '');
const bodyOf = async (input, init) => {
  try { return JSON.parse(typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : 'null'); } catch { return null; }
};
globalThis.fetch = async function tripwire(input, init) {
  let host = '';
  try { host = new URL(urlOf(input)).hostname; } catch { /* a relative or odd URL is not a provider */ }
  if (!PROVIDER_HOSTS.includes(host)) return original.call(this, input, init);
  const body = await bodyOf(input, init), tool = body?.tools?.[0]?.name ?? null;
  const entry = { host, path: new URL(urlOf(input)).pathname, tool, at: new Date().toISOString() };
  if (host === 'api.anthropic.com' && FIXTURE_TOOLS.includes(tool)) { fixtures.push(entry); return fixtureModel(null, body); }
  hits.push(entry);
  return Response.json({ error: `provider tripwire: ${host} is not reachable from a local check` }, { status: 599 });
};

// The hook request's identity: an owned request carries its basis; a shared one its share token and origin card.
const HOOK_ROUTE = /^\/api\/learn\/(?:tutor|boards\/shared\/([^/]+))\/next-steps$/;
async function logHook(req) {
  const match = new URL(req.url).pathname.match(HOOK_ROUTE);
  if (!match || req.method !== 'POST') return;
  let body = null; try { body = await req.clone().json(); } catch { /* the route refuses it */ }
  const key = match[1] ? `shared:${match[1].slice(0, 8)}:${JSON.stringify(body?.input?.origin ?? null)}:${body?.viewer_states ? 'viewer' : 'anon'}` : `owned:${body?.input?.basis ?? null}`;
  hooks.push({ key, at: new Date().toISOString() });
}

// The worker with the count endpoint in front. A worker that has its control plane in process (CONTROL_PLANE) adds that
// worker's count, so one read covers the whole local app.
export const tripwired = (worker) => ({
  ...worker,
  async fetch(req, env, ctx) {
    if (new URL(req.url).pathname !== '/__provider-tripwire') { await logHook(req); return worker.fetch(req, env, ctx); }
    let plane = {};
    if (env.CONTROL_PLANE) plane = await (await env.CONTROL_PLANE.fetch(new Request(new URL('/__provider-tripwire', req.url)))).json().catch(() => ({}));
    return Response.json({ hits: [...hits, ...(plane.hits || [])], fixtures: [...fixtures, ...(plane.fixtures || [])], hooks: [...hooks, ...(plane.hooks || [])] }, { headers: { 'Cache-Control': 'no-store' } });
  },
});
