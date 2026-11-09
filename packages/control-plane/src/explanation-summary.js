// The collapsed Explanation card's summary (owner spec "minimize an Explanation card to a compact tile", branch explain/minimize-card).
//
//   POST /api/learn/explanation-summary { app, id, title, body } -> { summary } (one or two whole sentences, at most 160 characters, ending in a full stop; plain words), or { summary: null, outcome } when no step answered (still 200: the card keeps its fallback text)
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

// Owner 2026-11-08: one COMPLETE sentence of about 150 characters (never cut, never an ellipsis); the server's hard cap is the shared rule (explanation-summary-text.js capSummary: 160, whole sentences only).
export const SUMMARY_INSTRUCTION = 'Summarise this explanation in one complete sentence of at most about 150 characters, plain words, no maths or markup, ending with a full stop, for a collapsed preview.';
// The output cap. The spec asks for about 80 tokens, but gpt-oss spends hidden reasoning tokens inside max_tokens (explanation-models.js CHAIN_MAX_TOKENS), and 80 leaves none
// for them: an empty answer. 300 is still under a tenth of a cent a call.
export const SUMMARY_MAX_TOKENS = 300;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } };
const BODY_CHARS = 6000;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

// One model call per card (owner 2026-11-08): the answer is kept per (org, canvas, card id) in LEARN_DB explanation_summaries (learn-migrations/0043, applied by an owner
// command), and a second request for the same card returns it with no model call. Until the table exists the same record lives in this isolate (`memo`), and two requests
// in flight for one card share one call (`pending`). shortcut: the isolate record is lost on a restart or lives in another isolate, so a card may be summarised twice
// until 0043 is applied; a failed call stores nothing, so the card may ask again. The server-side write into the saved card replaces all of this when pictures-async lands.
const memo = new Map(), pending = new Map(), MEMO_MAX = 500;
const recordKey = (org, app, id) => `${org}|${app}|${id}`;
async function storedSummary(env, org, app, id) {
  try { const row = await env.LEARN_DB?.prepare('SELECT summary FROM explanation_summaries WHERE org = ? AND app = ? AND card_id = ?').bind(org, app, id).first(); if (row?.summary) return row.summary; } catch { /* no table yet */ }
  return memo.get(recordKey(org, app, id)) ?? null;
}
async function keepSummary(env, org, app, id, summary) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  memo.set(recordKey(org, app, id), summary);
  try { await env.LEARN_DB?.prepare('INSERT OR IGNORE INTO explanation_summaries (org, app, card_id, summary, created_at) VALUES (?, ?, ?, ?, ?)').bind(org, app, id, summary, Date.now()).run(); } catch { /* no table yet */ }
}

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
      if (!response.ok) { outcome = (await response.clone().json().catch(() => null))?.code || `http_${response.status}`; continue; } // our own admission refusals carry a code
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
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['app', 'id', 'title', 'body'].includes(key))
      || typeof body.app !== 'string' || typeof body.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.id) || typeof body.title !== 'string' || typeof body.body !== 'string' || !body.body.trim() || body.body.length > BODY_CHARS || body.title.length > 300) throw new Error('Invalid request');
  } catch { return json({ error: 'Invalid request' }, 400); }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  const refused = subscriptionOwnerRefusal(env, access);
  if (refused) return refused;
  const prose = body.body.replace(/```[\s\S]*?```/g, ' ').trim(); // fenced diagram and picture JSON is never sent
  if (!prose) return json({ error: 'Invalid request' }, 400);
  const started = Date.now(), key = recordKey(access.org, body.app, body.id);
  const earlier = await storedSummary(env, access.org, body.app, body.id);
  if (earlier) { console.log(JSON.stringify({ event: 'explanation_summary', ms: Date.now() - started, provider: null, model: null, chars: earlier.length, outcome: 'stored' })); return json({ summary: earlier }); }
  if (!pending.has(key)) pending.set(key, writeSummary(env, { title: body.title, body: prose }, access.org, { userId: access.user_id || access.email }).finally(() => pending.delete(key)));
  const done = await pending.get(key);
  if (done.summary) await keepSummary(env, access.org, body.app, body.id, done.summary);
  console.log(JSON.stringify({ event: 'explanation_summary', ms: Date.now() - started, provider: done.provider ?? null, model: done.model ?? null, chars: done.summary?.length ?? 0, outcome: done.outcome }));
  return json(done.summary ? { summary: done.summary } : { summary: null, outcome: done.outcome }); // a failure is not an error for the card: it keeps its fallback text
}
