// The collapsed Explanation card's summary (owner spec "minimize an Explanation card to a compact tile", branch explain/minimize-card).
//
//   POST /api/learn/explanation-summary { app, title, body } -> { summary } (at most 220 characters, plain words), or { summary: null, outcome } when no step answered (still 200: the card keeps its fallback text)
//
// ONE small model call per card, off the critical path: the client calls it after a new Explanation is on the canvas (and on the first minimize of an old card with none),
// then writes the answer onto the card it already holds through its normal save path (explanation-minimize.js landSummary). The server never writes a board: canvas
// content is browser-only, so the card's title and body prose come in the request (no diagram JSON, no questions) and nothing is stored here.
// Provider: the cheapest steps of the written /explain chain (the fireworks-low profile: gpt-oss-120b at low effort, then Gemini Flash Lite), each only when its credential is
// set on this server; the endpoints, deadlines and key handling are explanation-fast-chain.js's. Every call is admitted, priced and settled by spendTransport under the
// category explanation_summary (its ledger row is the cost); a log line `explanation_summary` carries latency, provider, size and outcome. Access: the signed-in owner of
// the canvas, as /api/learn/artifact (authorizedBoardApp, then the subscription owner rule).
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { spendTransport } from './learn-spend.js';
import { CHAIN_ENDPOINTS, anthropicReply } from './explanation-fast-chain.js';
import { chainSteps, resolveExplanationProfile } from './explanation-models.js';
import { capSummary } from '../../web/src/explanation-summary-text.js';

export const SUMMARY_INSTRUCTION = 'Summarise this explanation in at most two sentences and 220 characters, plain words, no maths, for a collapsed preview.';
// The output cap. The spec asks for about 80 tokens, but gpt-oss spends hidden reasoning tokens inside max_tokens (explanation-models.js CHAIN_MAX_TOKENS), and 80 leaves none
// for them: an empty answer. 300 is still under a tenth of a cent a call.
export const SUMMARY_MAX_TOKENS = 300;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } };
const BODY_CHARS = 6000;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export function summaryRequest(step, { title, body }) {
  return { model: step.model, stream: false, max_tokens: SUMMARY_MAX_TOKENS, reasoning_effort: 'low', ...(step.provider === 'google' ? {} : { temperature: 0 }),
    messages: [{ role: 'system', content: SUMMARY_INSTRUCTION }, { role: 'user', content: `Title: ${title}\n\n${body}` }],
    response_format: { type: 'json_schema', json_schema: { name: 'summary', strict: true, schema: SCHEMA } } };
}

// -> { summary, provider, model, outcome: 'ok' } or { summary: null, outcome: <the last step's reason> }. input: { title, body } already checked.
export async function writeSummary(env, input, org, identity = {}) {
  const steps = chainSteps(resolveExplanationProfile('fireworks-low').roles.author).filter(step => env[step.credentialRef]);
  let outcome = 'no_credential';
  for (const step of steps) {
    const { url, deadlineMs } = CHAIN_ENDPOINTS[step.provider], request = summaryRequest(step, input);
    let seen = null;
    try {
      const response = await spendTransport(env, request, step.model, org, async () => {
        const abort = new AbortController(), timer = setTimeout(() => abort.abort(), deadlineMs);
        try {
          const sent = await fetch(url, { method: 'POST', signal: abort.signal, headers: { Authorization: `Bearer ${env[step.credentialRef]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
          if (!sent.ok) return sent;
          const reply = await sent.json();
          seen = reply?.choices?.[0]?.message?.content;
          const { model, usage } = anthropicReply(reply, 'summary');
          return Response.json({ model, usage });
        } finally { clearTimeout(timer); }
      }, { provider: step.provider, category: 'explanation_summary', ...identity });
      if (!response.ok) { outcome = `http_${response.status}`; continue; }
      let text = null;
      try { text = JSON.parse(seen)?.summary; } catch { /* an unreadable answer is a failed step */ }
      const summary = typeof text === 'string' ? capSummary(text) : '';
      if (summary) return { summary, provider: step.provider, model: step.model, outcome: 'ok' };
      outcome = 'empty';
    } catch (error) { outcome = error?.name === 'AbortError' ? 'timeout' : 'error'; }
  }
  return { summary: null, outcome };
}

export async function explanationSummaryRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/explanation-summary') return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 4 * BODY_CHARS) return json({ error: 'Request too large' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['app', 'title', 'body'].includes(key))
      || typeof body.app !== 'string' || typeof body.title !== 'string' || typeof body.body !== 'string' || !body.body.trim() || body.body.length > BODY_CHARS || body.title.length > 300) throw new Error('Invalid request');
  } catch { return json({ error: 'Invalid request' }, 400); }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  const refused = subscriptionOwnerRefusal(env, access);
  if (refused) return refused;
  const prose = body.body.replace(/```[\s\S]*?```/g, ' ').trim(); // fenced diagram and picture JSON is never sent
  if (!prose) return json({ error: 'Invalid request' }, 400);
  const started = Date.now();
  const done = await writeSummary(env, { title: body.title, body: prose }, access.org, { userId: access.user_id || access.email });
  console.log(JSON.stringify({ event: 'explanation_summary', ms: Date.now() - started, provider: done.provider ?? null, model: done.model ?? null, chars: done.summary?.length ?? 0, outcome: done.outcome }));
  return json(done.summary ? { summary: done.summary } : { summary: null, outcome: done.outcome }); // a failure is not an error for the card: it keeps its fallback text
}
