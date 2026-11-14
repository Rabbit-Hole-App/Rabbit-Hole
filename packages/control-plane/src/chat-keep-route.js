// Create as card (owner 2026-11-13): is a finished chat reply worth offering as a written /explain card to keep on the canvas? One JEV Choice question over the
// reply and the learner's question (web src/inline-ai-route.js keepRequest), the same transport, authorization and thresholds as the chat router
// (chat-capability-route.js). Nothing here generates or charges: it only says whether the button shows. A failed, slow or unsure check says no.
import { askJev, JEV_TRANSPORTS } from './learn-grade-jev.js';
import { jevTransport } from './learn-inline.js';
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { KEEP_THRESHOLDS, ROUTE_TIMEOUT_MS, keepRequest, readKeep } from '../../web/src/inline-ai-route.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const log = fields => { try { console.log(JSON.stringify({ event: 'chat_keep', ...fields })); } catch { /* never worth a failed check */ } };

// -> { keep, via, probability, confidence }. deps.ask is the JEV call (counted in tests).
export async function decideKeep(env, { question, reply }, { ask = askJev, timeoutMs = ROUTE_TIMEOUT_MS * 2, thresholds = KEEP_THRESHOLDS } = {}) {
  const no = (via, extra = {}) => ({ keep: false, via, probability: null, confidence: null, ...extra });
  const transport = jevTransport(env);
  if (!transport) { log({ outcome: 'unavailable', reason: 'no_transport' }); return no('unavailable'); }
  let read;
  try {
    const out = await ask(env, keepRequest({ question, reply }, JEV_TRANSPORTS[transport].model), { transport, timeoutMs });
    read = readKeep(out.body);
  } catch (error) { log({ outcome: 'failed', reason: error?.code || 'unreadable' }); return no('fallback'); }
  const keep = read.choice === 'card' && read.probability >= thresholds.probability && read.confidence >= thresholds.confidence;
  log({ outcome: 'decided', choice: read.choice, keep, probability: read.probability, confidence: read.confidence });
  return { keep, via: 'jev', probability: read.probability, confidence: read.confidence };
}

export async function chatKeepFetch(req, env, { authorize = authorizedBoardApp, ...deps } = {}) {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const raw = await req.text();
  if (raw.length > 20000) return json({ error: 'Request too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || typeof body.question !== 'string' || typeof body.reply !== 'string' || !body.question.trim() || !body.reply.trim()) return json({ error: 'Invalid chat keep request' }, 400);
  const allowed = await authorize(req, env, body.app, body.pending);
  if (allowed instanceof Response) return allowed;
  const refused = subscriptionOwnerRefusal(env, allowed);
  if (refused) return refused;
  return json(await decideKeep(env, { question: body.question, reply: body.reply }, deps));
}
