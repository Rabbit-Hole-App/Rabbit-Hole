// Test-only (EXP-04, owner message 24, 2026-10-21): the dev worker behind the provider tripwire, with the /explain scene
// tools answered by a scripted provider, so explain-gate-check.mjs drives the REAL server path (artifactFetch, the scene gates,
// the one repair, the verifier wiring) from the browser without a model. Never deployed: only a local stack whose rendered
// config points "main" here runs it (C:/s/toc-exp04/extra.sh with STUB=1). The answer is chosen by a marker word in the
// learner's line; every scripted request is recorded and GET /__scene-stub returns them. Anything else goes on to the
// tripwire, which refuses and counts it.
import worker from './tripwire-dev-worker.js';
import { SCENE_STUB } from './explain-gate-fixtures.js';
export { RepositoryImports, LearnScenes, LearnVideos, FileJobs } from './tripwire-dev-worker.js';

const calls = [];
const tripwire = globalThis.fetch;
globalThis.fetch = async function sceneStub(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
  if (!url.startsWith('https://api.anthropic.com/')) return tripwire.call(this, input, init);
  let body = null;
  try { body = JSON.parse(typeof init?.body === 'string' ? init.body : await input.clone().text()); } catch { /* not ours */ }
  const tools = (body?.tools || []).map(tool => tool.name);
  if (!tools.includes('make_animation') && !tools.includes('report_check')) return tripwire.call(this, input, init);
  const first = body.messages[0].content, text = typeof first === 'string' ? first : first.at(-1)?.text || '';
  const marker = Object.keys(SCENE_STUB).find(name => text.includes(name));
  const last = body.messages.at(-1).content;
  const repair = Array.isArray(last) && last[0]?.type === 'tool_result' ? last[0].content : null;
  const verifying = tools.includes('report_check');
  calls.push({ marker: marker || null, tool: verifying ? 'report_check' : 'make_animation', repair, at: new Date().toISOString() });
  const [name, input_] = verifying ? ['report_check', { problems: [] }] : ['make_animation', SCENE_STUB[marker]?.(Boolean(repair))];
  if (!input_) return Response.json({ error: 'scene stub: no marker in the request' }, { status: 599 });
  return Response.json({ id: `stub-${calls.length}`, type: 'message', role: 'assistant', model: body.model, stop_reason: 'tool_use',
    usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: 'tool_use', id: `stub-call-${calls.length}`, name, input: input_ }] });
};

export default {
  ...worker,
  async fetch(req, env, ctx) {
    if (new URL(req.url).pathname === '/__scene-stub') return Response.json({ calls }, { headers: { 'Cache-Control': 'no-store' } });
    return worker.fetch(req, env, ctx);
  },
};
