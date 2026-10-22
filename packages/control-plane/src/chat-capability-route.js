// CR-1 (owner 2026-10-21; interface C:/s/spec/day-1021/chat-route-interface.md): the server's route decision for one chat
// line, before the turn is sent. Explicit commands and picker or suggestion ids resolve here with no call; plain words get
// one JEV Choice question over the declared chat capabilities (web/src/inline-ai-route.js CHAT_CAPABILITIES), the same
// transport, spend guard and thresholds as inline routing. Nothing here generates, reserves or calls an author: a
// proposal capability gets a signed route token that the chat turn (index.js apiAsk route_token) turns into that
// command's proposal turn, and a direct one runs its existing handler. A timeout or failure answers, never a capability.
import { askJev, JEV_TRANSPORTS, JevError } from './learn-grade-jev.js';
import { jevTransport } from './learn-inline.js';
import { signingKey } from './learn-inline-route.js';
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { MOTION_PAUSED, motionOffered, motionPaused, reviewRequired } from './generation-proposal.js';
import { sha256, sign, verify } from './token.js';
import { CHAT_ROUTE_PROTOCOL_VERSION, ROUTE_THRESHOLDS, ROUTE_TIMEOUT_MS, chatCapability, chatRouteRequest, explicitCommand, isPlainExplain, readChatRoute } from '../../web/src/inline-ai-route.js';
import { IMAGE_GENERATION, SLASH, commandLabel, unavailableCommand } from '../../web/src/agent/slash.js';
import { paidOf } from '../../web/src/inline-ai-decide.js';

const TOKEN_TTL_S = 300, TEXT_MAX = 20000;
const REQUEST_ID = /^[A-Za-z0-9-]{8,80}$/;
const MODES = ['auto', 'ask', 'tutor'];
export const FALLBACK = 'Couldn\'t check whether this asks for a video or another tool. Answer normally, or try again.';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const log = fields => { try { console.log(JSON.stringify({ event: 'chat_route', ...fields })); } catch { /* never worth a failed route */ } };

// Sorted-key JSON, so the route request and the ask may build the same objects in any key order.
const canon = v => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v ?? null));
// What a route token is bound to: the learner, the canvas and the exact turn fields the ask will send.
const bindingOf = (email, f) => sha256(canon([String(email).toLowerCase(), f.app ?? null, f.text ?? null, f.mode ?? null, f.selection ?? null, f.source_refs ?? null, f.motion ?? null]));

// Whether this capability can run here now. Never enables anything: a build flag only the browser knows must be in its
// enabled list, Motion also needs the server's own gate (orchestrator configured, not paused), image generation is off.
function availability(env, cap, enabled) {
  if (Array.isArray(enabled) && !enabled.includes(cap.name)) return false;
  if (cap.name === 'motion') return motionOffered(env);
  if (cap.needs === 'image_generation') return IMAGE_GENERATION;
  if (cap.needs) return Array.isArray(enabled);
  return true;
}
const unavailable = (env, name) => (name === 'motion' && motionPaused(env) ? MOTION_PAUSED : name === 'motion' ? 'Video explainers (Motion) are not available on this canvas.' : `${commandLabel(name)} isn't available here.`);

// One chat line's decision. deps.ask is the JEV call (counted in tests). Returns the response body.
export async function decideChat(env, { email, app, requestId, fields, capability = null, enabled = null }, { ask = askJev, timeoutMs = ROUTE_TIMEOUT_MS, thresholds = ROUTE_THRESHOLDS } = {}) {
  const text = fields.text;
  const base = { route: null, via: null, capability: null, flow: null, args: text.trim(), confidence: null, probability: null, clarification: null, message: null, paid: false, retryable: false, code: null, token: null, settings: null, meta: { protocol: CHAT_ROUTE_PROTOCOL_VERSION } };
  const answer = (via, extra = {}) => ({ ...base, route: 'answer', via, ...extra });
  const refuse = (via, message) => ({ ...base, route: 'unsupported', via, message });
  // A named capability: its declaration (or, for an undeclared Learn command, its registry entry run directly), checked
  // for availability, and a token bound to this turn.
  const pick = async (name, via, args, extra = {}) => {
    const removed = unavailableCommand(name);
    if (removed) return refuse(via, removed);
    const declared = chatCapability(name);
    const entry = SLASH.find(command => command.name === name && command.places.includes('learn'));
    if (!entry) return refuse(via, `/${name} is not a Learn command.`);
    if (!availability(env, { name, needs: entry.needs || null }, enabled)) return refuse(via, unavailable(env, name));
    const flow = declared?.flow === 'proposal' && reviewRequired(name) ? 'proposal' : 'direct';
    const token = await sign({ t: 'chat-route', cap: name, flow, h: await bindingOf(email, fields), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }, await signingKey(env));
    return { ...base, ...extra, route: `capability:${name}`, via, capability: name, flow, args, paid: paidOf(name), settings: declared?.settings || null, token };
  };
  if (capability === 'answer') return answer('capability');
  if (capability) return pick(capability, 'capability', text.trim());
  const command = explicitCommand(text);
  if (command) return pick(command.name, 'command', command.args);
  if (fields.mode === 'tutor') return answer('mode');
  if (isPlainExplain(text)) return answer('default');
  const transport = jevTransport(env);
  const started = Date.now();
  const failed = code => answer('fallback', { retryable: true, code, message: FALLBACK, meta: { ...base.meta, ms: Date.now() - started } });
  if (!transport || !(await signingKey(env))) return failed('unavailable');
  let out, read;
  try {
    out = await ask(env, chatRouteRequest({ text, selection: fields.selection, sourceRefs: fields.source_refs }, JEV_TRANSPORTS[transport].model), { transport, timeoutMs });
    read = readChatRoute(out.body);
  } catch (error) {
    const code = error instanceof JevError ? (error.code === 'timeout' ? 'timeout' : 'unavailable') : 'malformed';
    log({ request_id: requestId, outcome: code, ms: Date.now() - started, transport, called: error?.called !== false });
    return failed(code);
  }
  const meta = { ...base.meta, model: out.model ?? null, ms: out.ms ?? Date.now() - started, input_tokens: out.inputTokens ?? null, cost: out.cost ?? null, transport };
  const scored = { confidence: read.confidence, probability: read.probability, meta };
  log({ request_id: requestId, outcome: 'routed', choice: read.choice, confidence: read.confidence, probability: read.probability, ms: meta.ms, cost: meta.cost, input_tokens: meta.input_tokens });
  const ranked = read.ranked.filter(id => id !== 'answer');
  if (read.choice === 'several') return { ...base, ...scored, route: 'clarify', via: 'jev', clarification: { question: 'This asks for more than one thing. Which first?', options: [...ranked.slice(0, 2), 'answer'] } };
  if (read.choice === 'none') return { ...base, ...scored, route: 'unsupported', via: 'jev', message: 'That isn\'t something chat can do here.' };
  if (read.choice === 'answer') return answer('jev', scored);
  if (read.probability < thresholds.probability || read.confidence < thresholds.confidence) {
    return { ...base, ...scored, route: 'clarify', via: 'jev', clarification: { question: `Did you want ${(chatCapability(read.choice)?.label || read.choice).toLowerCase()}, or an answer in chat?`, options: [read.choice, 'answer'] } };
  }
  return pick(read.choice, 'jev', text.trim(), scored);
}

// The route a chat turn's route_token names, when it verifies for this learner and these exact turn fields: { cap, flow },
// else null. body is the /api/learn/ask body.
export async function verifyChatRoute(env, body, email) {
  const key = await signingKey(env);
  if (!key || typeof body?.route_token !== 'string') return null;
  const payload = await verify(body.route_token, key).catch(() => null);
  const fields = { app: body.scope?.app, text: body.message, mode: body.mode, selection: body.canvas_target, source_refs: body.context_refs, motion: body.generation?.motion };
  if (!payload || payload.t !== 'chat-route' || payload.h !== await bindingOf(email, fields)) return null;
  return { cap: payload.cap, flow: payload.flow };
}

// POST /api/learn/chat/route (dev-worker.js). Authorized for the canvas as the chat turn is.
export async function chatRouteFetch(req, env, { authorize = authorizedBoardApp, ...deps } = {}) {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const raw = await req.text();
  if (raw.length > 80000) return json({ error: 'Request too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const bad = !body || typeof body !== 'object' || !REQUEST_ID.test(String(body.request_id)) || typeof body.text !== 'string' || body.text.length > TEXT_MAX
    || !MODES.includes(body.mode) || (body.capability != null && (typeof body.capability !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.capability)))
    || (body.enabled != null && (!Array.isArray(body.enabled) || body.enabled.some(id => typeof id !== 'string')))
    || [body.selection, body.motion].some(v => v != null && (typeof v !== 'object' || Array.isArray(v))) || (body.source_refs != null && !Array.isArray(body.source_refs));
  if (bad) return json({ error: 'Invalid chat route request' }, 400);
  if (!body.text.trim() && !body.capability) return json({ error: 'Type a message first.' }, 400);
  const allowed = await authorize(req, env, body.app, body.pending);
  if (allowed instanceof Response) return allowed;
  const refused = subscriptionOwnerRefusal(env, allowed);
  if (refused) return refused;
  const fields = { app: body.app, text: body.text, mode: body.mode, selection: body.selection, source_refs: body.source_refs, motion: body.motion };
  return json(await decideChat(env, { email: allowed.email, app: body.app, requestId: body.request_id, fields, capability: body.capability ?? null, enabled: body.enabled ?? null }, deps));
}
