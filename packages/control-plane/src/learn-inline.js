// The inline AI editor's worker routes (docs/features/inline-ai-editor.md §6-§12, A2, A3, A5).
//
//   POST /api/learn/inline/route     one JEV Choice question: which existing capability makes an Explain output. The
//                                    request and validator are the router's own (web/src/inline-ai-route.js), never the
//                                    grader's; only JEV's existing transport and spend guard (askJev) are shared.
//   POST /api/learn/inline/generate  the short note (Explain's direct path) or one structured edit (Edit), streamed as
//                                    server-sent events: real model deltas, validated once complete. Specialized outputs
//                                    never come here: the browser asks the existing /api/learn/artifact handler.
//   POST /api/learn/inline/telemetry the content-free per-request timings and counters (learn-migrations/0018).
//
// The same model, auth, ownership and spend admission as a slash-command card: LEARN_TASKS.artifact's model through
// planModel, authorizedBoardApp, subscriptionOwnerRefusal, and spendTransport inside anthropic().
import { askJev, JEV_TRANSPORTS, JevError } from './learn-grade-jev.js';
import { PROMPT_MAX, promptTooLong, readRoute, routeRequest, ROUTE_PROTOCOL_VERSION, ROUTE_TIMEOUT_MS } from '../../web/src/inline-ai-route.js';
import { planModel } from './ask.js';
import { LEARN_TASKS, notConfiguredMessage } from './learn-models.js';
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { tutorImageContext } from './learn-image-context.js';
import { isUploadedMediaId } from './learn-media.js';
import { INLINE_EDIT_SYSTEM, INLINE_EDIT_TOOL, INLINE_NOTE_SYSTEM } from './agents/learn-inline.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
// A note needs little room; an edit may rewrite a code block. Both inside LEARN_TASKS.artifact's 4000.
export const NOTE_MAX_TOKENS = 1500, EDIT_MAX_TOKENS = 4000, NOTE_MAX_CHARS = 1200;
const REQUEST_ID = /^[A-Za-z0-9-]{8,80}$/;

async function readBody(req, limit) {
  if (req.method !== 'POST') return { response: json({ error: 'POST required' }, 405) };
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return { response: json({ error: 'Invalid origin' }, 403) };
  const raw = await req.text();
  if (raw.length > limit) return { response: json({ error: 'Request too large' }, 413) };
  try { const body = JSON.parse(raw); if (!body || typeof body !== 'object') throw new Error(); return { body }; } catch { return { response: json({ error: 'Invalid JSON' }, 400) }; }
}
async function access(req, env, body, authorize) {
  const allowed = await authorize(req, env, body.app, body.pending);
  if (allowed instanceof Response) return allowed;
  return subscriptionOwnerRefusal(env, allowed) || allowed;
}
// One log line per stage, keyed by request id: timings, counts and status only - never the prompt or canvas content.
const log = fields => { try { console.log(JSON.stringify({ event: 'inline_ai', ...fields })); } catch { /* never worth a failed answer */ } };

// Which JEV transport this worker has a key for: the gateway (VERCEL_TYPESAFE_API_KEY) or direct (TYPESAFE_API_KEY).
export const jevTransport = env => (env.VERCEL_TYPESAFE_API_KEY ? 'gateway' : env.TYPESAFE_API_KEY ? 'direct' : null);

export async function inlineRouteFetch(req, env, { authorize = authorizedBoardApp, ask = askJev } = {}) {
  const { body, response } = await readBody(req, 8000);
  if (response) return response;
  if (typeof body.prompt === 'string' && body.prompt.length > PROMPT_MAX) return json({ error: promptTooLong(body.prompt.length), code: 'too_long' }, 400);
  if (typeof body.prompt !== 'string' || (body.selection != null && (typeof body.selection !== 'string' || body.selection.length > 1500)) || !REQUEST_ID.test(String(body.request_id))) return json({ error: 'Invalid route request' }, 400);
  const allowed = await access(req, env, body, authorize);
  if (allowed instanceof Response) return allowed;
  const transport = jevTransport(env);
  const started = Date.now();
  // No key: no call. The browser takes the stated note fallback.
  if (!transport) { log({ stage: 'route', request_id: body.request_id, outcome: 'unavailable', ms: 0 }); return json({ error: 'unavailable', protocol: ROUTE_PROTOCOL_VERSION }); }
  try {
    const out = await ask(env, routeRequest({ prompt: body.prompt, selection: body.selection || '' }, JEV_TRANSPORTS[transport].model), { transport, timeoutMs: ROUTE_TIMEOUT_MS });
    const read = readRoute(out.body);
    log({ stage: 'route', request_id: body.request_id, outcome: 'routed', choice: read.choice, confidence: read.confidence, ms: out.ms, retries: out.retries, transport, cost: out.cost, input_tokens: out.inputTokens });
    return json({ ...read, ms: out.ms, transport, cost: out.cost, protocol: ROUTE_PROTOCOL_VERSION });
  } catch (error) {
    const code = error instanceof JevError ? (error.code === 'timeout' ? 'timeout' : error.code === 'bad_response' ? 'invalid' : 'unavailable') : 'invalid';
    log({ stage: 'route', request_id: body.request_id, outcome: code, ms: Date.now() - started, transport });
    return json({ error: code, protocol: ROUTE_PROTOCOL_VERSION });
  }
}

// The partial text of each edit operation inside a tool input still streaming in (A2): an op's id, then its text so far.
// Best effort over incomplete JSON; the complete input is validated before anything is accepted.
export function partialEdits(text) {
  const out = [], re = /"id"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)/g;
  let match;
  while ((match = re.exec(text))) {
    const raw = match[2].replace(/\\u[0-9a-fA-F]{0,3}$/, '').replace(/(^|[^\\])\\$/, '$1');
    try { out.push({ id: JSON.parse(`"${match[1]}"`), text: JSON.parse(`"${raw}"`) }); } catch { /* an escape cut mid-way: next delta */ }
  }
  return out;
}

// The finished answer, checked before it may become a preview.
export function checkNote(text) {
  const note = String(text || '').trim();
  if (!note) return { error: 'The model wrote no explanation.' };
  if (note.length > NOTE_MAX_CHARS) return { error: 'The explanation came back too long for a note.' };
  return { result: { kind: 'note', text: note } };
}
export function checkEdit(input, targetIds) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.ops)) return { error: 'The model returned no edit.' };
  const ops = input.ops.slice(0, 40);
  const outside = ops.find(op => !targetIds.includes(op?.id));
  if (outside) return { error: `The edit reached outside the selection (${String(outside?.id).slice(0, 60)}).` };
  const limitation = typeof input.limitation === 'string' ? input.limitation.slice(0, 300) : undefined;
  return { result: { kind: 'edit', summary: String(input.summary || '').slice(0, 200), ops, ...(limitation ? { limitation } : {}) } };
}

// Anthropic's stream, read event by event: text deltas, tool input deltas, usage and the stop reason.
async function readModelStream(body, on) {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  const kinds = new Map();
  on.reader(reader);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let at;
    while ((at = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, at); buffer = buffer.slice(at + 2);
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
      if (!data) continue;
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      if (event.type === 'message_start') on.start(event.message || {});
      else if (event.type === 'content_block_start') { kinds.set(event.index, event.content_block?.type); if (event.content_block?.type === 'tool_use') on.tool(event.content_block); }
      else if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta' && kinds.get(event.index) === 'text') on.text(event.delta.text || '');
        else if (event.delta?.type === 'input_json_delta') on.json(event.delta.partial_json || '');
      } else if (event.type === 'message_delta') on.delta(event);
      else if (event.type === 'error') throw new Error(event.error?.message || 'The model stream failed.');
    }
  }
}

export async function inlineGenerateFetch(req, env, { authorize = authorizedBoardApp, callModel = planModel, images = tutorImageContext } = {}) {
  const { body, response } = await readBody(req, 60000);
  if (response) return response;
  const { mode, route } = body;
  if (typeof body.prompt === 'string' && body.prompt.length > PROMPT_MAX) return json({ error: promptTooLong(body.prompt.length), code: 'too_long' }, 400);
  // A refine (§10) carries the candidate it revises and the original request.
  const revise = body.revise ?? null;
  if (revise !== null && (typeof revise !== 'object' || typeof revise.result !== 'string' || !revise.result || revise.result.length > 8000 || typeof revise.prompt !== 'string' || revise.prompt.length > PROMPT_MAX)) return json({ error: 'Invalid inline request' }, 400);
  if (!((mode === 'explain' && route === 'note') || (mode === 'edit' && route === 'edit')) || typeof body.prompt !== 'string'
    || !body.context || typeof body.context !== 'object' || !Array.isArray(body.context.target?.ids) || !body.context.target.ids.length || !REQUEST_ID.test(String(body.request_id))) {
    return json({ error: 'Invalid inline request' }, 400);
  }
  const allowed = await access(req, env, body, authorize);
  if (allowed instanceof Response) return allowed;
  const edit = mode === 'edit', started = Date.now(), requestId = body.request_id;
  const targetIds = body.context.target.ids.map(String);
  // A flattened image goes to the vision-capable explanation model as one picture of the board's own card - never to JEV.
  let pictures = [];
  if (!edit && typeof body.context.image?.id === 'string') {
    // The card's uploaded copy when it has one (read under this app's identity), else the board's own card.
    const ref = isUploadedMediaId(body.context.image.mediaId) ? { id: body.context.image.mediaId } : { block_id: body.context.image.id };
    const got = await images(env, allowed, { image_context: ref, board: typeof body.board === 'string' ? body.board : 'main' }).catch(() => null);
    if (got?.blocks) pictures = got.blocks;
  }
  const text = JSON.stringify({ request: body.prompt, canvas: body.context, ...(revise ? { earlier: { request: revise.prompt, result: revise.result } } : {}) });
  const request = {
    // The subscription bridge replays a streamed answer as text only, which would drop an edit's tool call: an edit asks
    // for the whole answer there (the non-streaming branch below reads it).
    max_tokens: edit ? EDIT_MAX_TOKENS : NOTE_MAX_TOKENS, stream: !(edit && env.SUBSCRIPTION_ONLY === 'true'),
    system: edit ? INLINE_EDIT_SYSTEM : INLINE_NOTE_SYSTEM,
    messages: [{ role: 'user', content: pictures.length ? [...pictures, { type: 'text', text }] : text }],
    ...(edit ? { tools: [INLINE_EDIT_TOOL], tool_choice: { type: 'any', disable_parallel_tool_use: true } } : {}),
  };
  let upstream;
  try { upstream = await callModel(env, request, LEARN_TASKS.artifact.model, null); }
  catch (error) { log({ stage: 'generate', request_id: requestId, mode, outcome: 'error', ms: Date.now() - started }); return json({ error: error.message || 'Generation failed.', code: 'error' }, 502); }
  if (!upstream.ok) {
    const configured = await notConfiguredMessage(upstream);
    const refusal = await upstream.clone().json().catch(() => null);
    log({ stage: 'generate', request_id: requestId, mode, outcome: configured ? 'not_configured' : refusal?.code || `http_${upstream.status}`, ms: Date.now() - started });
    if (configured) return json({ error: configured, code: 'not_configured' }, 503);
    if (refusal?.code === 'spend_limited') return json({ error: refusal.error, code: 'spend_limited' }, 429);
    return json({ error: `The explanation is unavailable right now (model HTTP ${upstream.status}). Try again.`, code: 'http' }, 502);
  }
  const streaming = (upstream.headers.get('content-type') || '').includes('text/event-stream');
  const encoder = new TextEncoder();
  let upstreamReader = null;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => { try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* the browser left */ } };
      send('meta', { request_id: requestId, streaming });
      const got = { text: '', json: '', tool: null, usage: {}, stop: null, model: null, first: null };
      const sent = new Map();
      const firstNow = () => { if (got.first == null) got.first = Date.now(); };
      let outcome = 'error';
      try {
        if (streaming) {
          await readModelStream(upstream.body, {
            reader: reader => { upstreamReader = reader; },
            start: message => { got.model = message.model || null; got.usage = { ...(message.usage || {}) }; },
            tool: block => { got.tool = block; },
            text: piece => { firstNow(); got.text += piece; if (!edit && piece) send('delta', { text: piece }); },
            json: piece => {
              firstNow(); got.json += piece;
              if (edit) for (const part of partialEdits(got.json)) if (sent.get(part.id) !== part.text) { sent.set(part.id, part.text); send('preview', part); }
            },
            delta: event => { got.stop = event.delta?.stop_reason || got.stop; got.usage = { ...got.usage, ...(event.usage || {}) }; },
          });
        } else {
          // A provider that answers whole (no stream): one delta, said as non-streaming in meta.
          const message = await upstream.json();
          firstNow();
          got.model = message.model || null; got.usage = message.usage || {}; got.stop = message.stop_reason;
          for (const part of message.content || []) {
            if (part.type === 'text') { got.text += part.text; if (!edit) send('delta', { text: part.text }); }
            if (part.type === 'tool_use') { got.tool = part; got.json = JSON.stringify(part.input || {}); }
          }
        }
        let checked;
        if (got.stop === 'max_tokens') checked = { error: 'The answer was cut off before it was complete.' };
        else if (edit) {
          let input = null;
          try { input = got.tool?.name === INLINE_EDIT_TOOL.name ? JSON.parse(got.json || '{}') : null; } catch { input = null; }
          checked = checkEdit(input, targetIds);
        } else checked = checkNote(got.text);
        if (checked.error) send('error', { error: checked.error, code: 'invalid' });
        else { outcome = 'done'; send('done', { result: checked.result, usage: { input_tokens: got.usage.input_tokens ?? null, output_tokens: got.usage.output_tokens ?? null }, ms: { first: got.first == null ? null : got.first - started, total: Date.now() - started } }); }
        if (checked.error) outcome = 'invalid';
      } catch (error) {
        send('error', { error: 'The answer stopped before it was complete.', code: 'stream' });
        outcome = 'stream_error';
      } finally {
        log({ stage: 'generate', request_id: requestId, mode, outcome, streaming, model: got.model, first_ms: got.first == null ? null : got.first - started, total_ms: Date.now() - started, input_tokens: got.usage.input_tokens ?? null, output_tokens: got.usage.output_tokens ?? null, image: pictures.length > 0 });
        try { controller.close(); } catch { /* already cancelled */ }
      }
    },
    // The browser cancelled or left: stop reading the provider, which ends its stream (and settles its admission).
    cancel() { upstreamReader?.cancel().catch(() => {}); log({ stage: 'generate', request_id: requestId, mode, outcome: 'cancelled', total_ms: Date.now() - started }); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
}

// ---------- A5: per-request telemetry rows (learn-migrations/0018-inline-ai-telemetry.sql) ----------
// Only these keys, only numbers, booleans or the listed words: whatever a browser sends, no content can be stored.
const STAGES = ['open', 'prep', 'refresh', 'routing', 'providerFirst', 'firstPreview', 'complete', 'accept', 'persist', 'serverFirst', 'serverTotal'];
const COUNTS = ['modelCalls', 'routeCalls', 'chunks', 'flushes', 'duplicates', 'cancels', 'stale', 'errors', 'timeouts', 'reused', 'objects', 'chars', 'omitted', 'inputTokens', 'outputTokens', 'longTasks', 'longTaskMs', 'frameP95', 'frameMax'];
const WORDS = { prepCache: ['hit', 'miss'], selection: ['text', 'code', 'group', 'shape', 'card', 'image', 'connection', 'range', 'mixed'], board: ['small', 'large'], output: ['text', 'edit', 'card', 'media'], open: ['cold', 'repeat'] };
const ROUTE_WAYS = ['direct', 'jev', 'bypassed'];
const OUTCOMES = ['accepted', 'rejected', 'cancelled', 'stale', 'error', 'timeout', 'invalid', 'clarify', 'unavailable', 'limitation', 'previewed', 'reused', 'closed', 'board-switch', 'proposal-declined', 'unsupported', 'refined'];
const number = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e9 ? Math.round(value * 10) / 10 : null);
export function cleanMetrics(metrics) {
  const out = { stages: {}, counts: {} };
  for (const key of STAGES) { const value = metrics?.stages?.[key]; if (value === 'bypassed' && key === 'routing') out.stages.routing = 'bypassed'; else if (number(value) != null) out.stages[key] = number(value); }
  for (const key of COUNTS) if (number(metrics?.counts?.[key]) != null) out.counts[key] = number(metrics.counts[key]);
  for (const [key, allowed] of Object.entries(WORDS)) if (allowed.includes(metrics?.[key])) out[key] = metrics[key];
  return out;
}
export function telemetryRow(row, { userId, board, now = new Date().toISOString() }) {
  if (!REQUEST_ID.test(String(row?.request_id)) || !ROUTE_WAYS.includes(row.route) || !OUTCOMES.includes(row.outcome)) return null;
  const source = row.source === 'benchmark' ? 'benchmark' : 'live';
  const tag = (value, max) => (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value.slice(0, max) : null);
  return {
    request_id: row.request_id, created_at: now, user_id: userId || null, board: String(board).slice(0, 100), source,
    run_id: source === 'benchmark' ? tag(row.run_id, 80) : null, sha: source === 'benchmark' ? tag(row.sha, 40) : null, fixture: source === 'benchmark' ? tag(row.fixture, 80) : null,
    mocked: row.mocked ? 1 : 0, streaming: row.streaming ? 1 : 0, route: row.route, capability: tag(row.capability, 20), outcome: row.outcome,
    metrics_json: JSON.stringify(cleanMetrics(row.metrics)),
  };
}
// Insert-or-ignore by request_id (a retry never writes twice); fail-soft (a missing table skips the row, never the request).
export async function keepInlineTelemetry(db, rows, identity) {
  let kept = 0, skipped = 0;
  for (const raw of rows.slice(0, 50)) {
    const row = telemetryRow(raw, identity);
    if (!row || !db) { skipped += 1; continue; }
    try {
      const result = await db.prepare('INSERT OR IGNORE INTO inline_ai_telemetry (request_id, created_at, user_id, board, source, run_id, sha, fixture, mocked, streaming, route, capability, outcome, metrics_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(row.request_id, row.created_at, row.user_id, row.board, row.source, row.run_id, row.sha, row.fixture, row.mocked, row.streaming, row.route, row.capability, row.outcome, row.metrics_json).run();
      if (result?.meta?.changes === 0) skipped += 1; else kept += 1;
    } catch { skipped += 1; }
  }
  return { kept, skipped };
}
// users.id of the signed-in person, for a row whose board access does not carry it: canvasAccess sets user_id on its
// access object; a repo- board's (repositoryAccess) and a live app's do not. Read the way canvasAccess reads it
// (repositoryIdentity). Never an email; null when there is none.
async function signedInUserId(req, env) {
  try {
    const { repositoryIdentity } = await import('./repositories.js');
    const user = await repositoryIdentity(req, env);
    return user instanceof Response ? null : user?.userId ?? null;
  } catch { return null; }
}
export async function inlineTelemetryFetch(req, env, { authorize = authorizedBoardApp, identify = signedInUserId } = {}) {
  const { body, response } = await readBody(req, 100000);
  if (response) return response;
  if (!Array.isArray(body.rows)) return json({ error: 'rows required' }, 400);
  const allowed = await authorize(req, env, body.app, body.pending);
  if (allowed instanceof Response) return allowed;
  // Only a signed-in person's own board: authorizedBoardApp answered for this app and this person.
  const userId = allowed.user_id ?? await identify(req, env);
  return json(await keepInlineTelemetry(env.LEARN_DB, body.rows, { userId: userId || null, board: body.app }));
}

// The report numbers come from the rows (A5): median, p95 and n per stage, grouped by the given keys.
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : null);
export function summarize(rows, by = row => row.capability) {
  const groups = new Map();
  for (const row of rows) {
    const metrics = typeof row.metrics_json === 'string' ? JSON.parse(row.metrics_json) : row.metrics_json;
    const key = by({ ...row, metrics });
    if (!groups.has(key)) groups.set(key, { n: 0, failures: 0, stages: {} });
    const group = groups.get(key);
    group.n += 1;
    if (!['accepted', 'previewed', 'rejected', 'reused', 'clarify', 'proposal-declined', 'refined'].includes(row.outcome)) group.failures += 1;
    for (const [stage, value] of Object.entries(metrics.stages || {})) if (typeof value === 'number') (group.stages[stage] ||= []).push(value);
  }
  return Object.fromEntries([...groups].map(([key, group]) => [key, { n: group.n, failures: group.failures, stages: Object.fromEntries(Object.entries(group.stages).map(([stage, values]) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return [stage, { n: sorted.length, median: quantile(sorted, 0.5), p95: sorted.length >= 20 ? quantile(sorted, 0.95) : null }];
  })) }]));
}
export const TELEMETRY_QUERY = 'SELECT request_id, source, run_id, sha, fixture, mocked, streaming, route, capability, outcome, metrics_json FROM inline_ai_telemetry WHERE source = ? AND (? IS NULL OR run_id = ?) ORDER BY created_at';
