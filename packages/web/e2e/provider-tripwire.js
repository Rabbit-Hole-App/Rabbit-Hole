// Test-only: a local check must send nothing to a model or paid-AI provider, and a missing API key is not isolation (a
// keyless worker still calls the provider, unauthenticated: the shared Rabbit Hole check did, 2026-10-07). On the local gate
// stack every worker is started through a tripwire entrypoint (e2e/tripwire-*-worker.js): this module, imported first, makes
// every outbound request to a provider host fail without leaving the machine (HTTP 599) and counts it, and
// GET /__provider-tripwire answers the count, this worker's plus its control plane's. Never deployed: no wrangler config in
// the repository points at a tripwire entrypoint; the local stack configs do (e2e/provider-tripwire.md).
export const PROVIDER_HOSTS = ['api.anthropic.com', 'api.openai.com', 'api.typesafe.ai', 'api.fish.audio', 'api.elevenlabs.io', 'api.heygen.com', 'api.exa.ai'];
const hits = [];
const original = globalThis.fetch;
const urlOf = (input) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '');
globalThis.fetch = function tripwire(input, init) {
  let host = '';
  try { host = new URL(urlOf(input)).hostname; } catch { /* a relative or odd URL is not a provider */ }
  if (PROVIDER_HOSTS.includes(host)) {
    hits.push({ host, path: new URL(urlOf(input)).pathname, at: new Date().toISOString() });
    return Promise.resolve(Response.json({ error: `provider tripwire: ${host} is not reachable from a local check` }, { status: 599 }));
  }
  return original.call(this, input, init);
};

// The worker with the count endpoint in front. A worker that has its control plane in process (CONTROL_PLANE) adds that
// worker's count, so one read covers the whole local app.
export const tripwired = (worker) => ({
  ...worker,
  async fetch(req, env, ctx) {
    if (new URL(req.url).pathname !== '/__provider-tripwire') return worker.fetch(req, env, ctx);
    let plane = [];
    if (env.CONTROL_PLANE) plane = (await (await env.CONTROL_PLANE.fetch(new Request(new URL('/__provider-tripwire', req.url)))).json().catch(() => ({ hits: [] }))).hits || [];
    return Response.json({ hits: [...hits, ...plane] }, { headers: { 'Cache-Control': 'no-store' } });
  },
});
