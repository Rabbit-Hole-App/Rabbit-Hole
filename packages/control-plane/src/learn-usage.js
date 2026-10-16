// Usage accounting, Phase 1 (learn-migrations/0022; design C:/s/spec/credits-phase1-design.md; owner D1-D3 2026-10-16).
// ACCOUNTING ONLY: nothing here refuses, delays or fails a request. The platform spend guard (learn-spend-ledger.js,
// usage_operations) stays the only gate; these rows are written beside it, best effort. A failed write is logged and the
// action marked 'accounting_error' where possible; the user's request carries on.
//
// One action per user action, created lazily on its first provider attempt, so a request that makes no paid call writes
// nothing. The route boundary (dev-worker.js) makes a per-request env copy carrying the context under a module-private
// Symbol, like learn-spend.js's admission token; spendTransport, askJev, fishSpendTransport and the media paths read it.
// Without a context an attempt is recorded under its own 'system' action, payer platform, so nothing is lost.
// Amounts are integer micro-USD (1 USD = 1_000_000 micros); unknown cost is NULL with its reservation kept, never 0.

const USAGE = Symbol('usage accounting context');
const KIND = Symbol('usage attempt kind');

// One string per entry point (the design's list). Keep it here, the only list.
export const FEATURES = ['ask', 'auto', 'tutor', 'tutor_evaluate', 'next_steps', 'shared_next_steps', 'shared_ask', 'home_ask',
  'explore_find', 'journey', 'artifact', 'board', 'inline_route', 'inline_decide', 'inline_generate', 'assess', 'grade', 'course',
  'image', 'transcribe', 'tts', 'voice_tts', 'voice_scribe', 'video', 'scene', 'search', 'handoff', 'legacy'];
export const ATTEMPT_KINDS = ['routing', 'generation', 'repair', 'retry', 'evaluation', 'escalation', 'tool', 'media'];

// PROVISIONAL until Phase 2 (owner D2.5, D2.7): practice grading is free to the user, its provider cost still recorded.
const FREE_FEATURES = new Set(['assess', 'grade', 'tutor_evaluate']);
// Entry points a signed-out visitor may reach on a public link (owner D2.4): platform-funded, never the canvas owner.
const PUBLIC_FEATURES = new Set(['shared_ask', 'shared_next_steps']);
// An attempt's kind when the caller names none.
const DEFAULT_KIND = { inline_route: 'routing', inline_decide: 'evaluation', assess: 'evaluation', grade: 'evaluation', tutor_evaluate: 'evaluation' };

// The /api/learn/* routes that make provider calls, and the feature each one is (dev-worker.js boundary).
const ROUTES = [
  [/^\/api\/learn\/(ask|selection)$/, 'ask'],
  [/^\/api\/learn\/tutor\/plan$/, 'tutor'],
  [/^\/api\/learn\/tutor\/evaluate$/, 'tutor_evaluate'],
  [/^\/api\/learn\/tutor\/next-steps$/, 'next_steps'],
  [/^\/api\/learn\/tutor\/handoff$/, 'handoff'],
  [/^\/api\/learn\/boards\/shared\/[^/]+\/next-steps$/, 'shared_next_steps'],
  [/^\/api\/learn\/boards\/shared\/[^/]+\/ask$/, 'shared_ask'],
  [/^\/api\/learn\/boards\/published\/find$/, 'explore_find'],
  [/^\/api\/learn\/home-ask$/, 'home_ask'],
  [/^\/api\/learn\/journey(\/|$)/, 'journey'],
  [/^\/api\/learn\/artifact$/, 'artifact'],
  [/^\/api\/learn\/board$/, 'board'],
  [/^\/api\/learn\/inline\/route$/, 'inline_route'],
  [/^\/api\/learn\/inline\/decide$/, 'inline_decide'],
  [/^\/api\/learn\/inline\/generate$/, 'inline_generate'],
  [/^\/api\/learn\/assess$/, 'assess'],
  [/^\/api\/learn\/grade(\/|$)/, 'grade'],
  [/^\/api\/apps\/[a-z0-9-]+\/learn-course$/, 'course'],
  [/^\/api\/learn\/image$/, 'image'],
  [/^\/api\/learn\/transcribe$/, 'transcribe'],
  [/^\/api\/learn\/tts$/, 'tts'],
  [/^\/api\/learn\/voice\/tts$/, 'voice_tts'],
  [/^\/api\/learn\/voice\/scribe-token$/, 'voice_scribe'],
  [/^\/api\/learn\/video$/, 'video'],
  [/^\/api\/learn\/scene$/, 'scene'],
  [/^\/api\/learn\/search$/, 'search'],
];
export function usageFeature(method, path) {
  if (method !== 'POST' && !(method === 'GET' && path === '/api/learn/search')) return null;
  return ROUTES.find(([pattern]) => pattern.test(path))?.[1] || null;
}

// X-RH-Action-Key: a random id per user action, reused by automatic retries. Anything else is ignored, never an error.
const CLIENT_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const nowSeconds = () => Math.floor(Date.now() / 1000);

// USD -> integer micros, rounded up. toFixed(6) first: 12345 / 1e6 * 1e6 is 12345.000000000002, which is not 12346 micros.
export const toMicros = usd => typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? Math.ceil(Number((usd * 1e6).toFixed(6))) : null;
// The UTC calendar month of a unix-seconds time (owner D2.3): an action keeps the period it started in.
export const periodOf = seconds => new Date(seconds * 1000).toISOString().slice(0, 7);
// The ISO start of the month after a period.
export const periodReset = period => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString(); };

// The per-request context. resolveUser is the boundary's own session read (devIdentity), used only when no
// authentication in the route has noted the session user yet. The payer never comes from a body, query or header.
export function withUsage(env, { feature, req = null, resolveUser = null, now = nowSeconds() }) {
  const key = req?.headers?.get?.('x-rh-action-key') || '';
  const ctx = { feature, clientKey: CLIENT_KEY.test(key) ? key : null, resolveUser, identity: undefined, startedAt: now, action: null, final: null };
  return { ...env, [USAGE]: ctx };
}
export const usageContext = env => env?.[USAGE] || null;
// A copy whose attempts are recorded as `kind` (a repair, an escalation) unless the transport names one itself.
export const withAttemptKind = (env, kind) => ({ ...env, [KIND]: kind });

// Authentication (dev-forwarding.js devIdentity) notes the session user it resolved: { userId, email }, or null when the
// request has no session. The first resolution in a request stands.
export function noteUsageIdentity(env, identity) {
  const ctx = env?.[USAGE];
  if (ctx && ctx.identity === undefined) ctx.identity = identity ? { userId: identity.userId || identity.user_id || null, email: identity.email || null } : null;
}

// Server-only payer rules (design "Payer rules"). The stable account id is users.id; an email only when the session has none.
export function payerOf(ctx) {
  if (!ctx) return { userId: null, payer: 'platform', payerReason: 'system', chargeClass: 'platform', feature: 'legacy' };
  const userId = ctx.identity?.userId || ctx.identity?.email || null;
  if (!userId) return { userId: null, payer: 'platform', payerReason: ctx.identity === null && PUBLIC_FEATURES.has(ctx.feature) ? 'anonymous_public' : 'system', chargeClass: 'platform', feature: ctx.feature };
  if (FREE_FEATURES.has(ctx.feature)) return { userId, payer: 'user', payerReason: 'free_action', chargeClass: 'free', feature: ctx.feature };
  return { userId, payer: 'user', payerReason: 'signed_in', chargeClass: 'would_charge', feature: ctx.feature };
}

const warned = new Set();
function warn(message) {
  // Once per isolate per message: an un-migrated database would otherwise log on every call.
  if (warned.has(message)) return;
  warned.add(message);
  console.warn('usage accounting:', message);
}

async function insertAction(db, ctx) {
  if (ctx && ctx.identity === undefined && ctx.resolveUser) {
    try { const who = await ctx.resolveUser(); if (ctx.identity === undefined) noteUsageIdentity({ [USAGE]: ctx }, who instanceof Response ? null : who); }
    catch { if (ctx.identity === undefined) ctx.identity = { failed: true }; } // unresolved: 'system', never 'anonymous_public'
  }
  const payer = payerOf(ctx);
  const startedAt = ctx?.startedAt ?? nowSeconds();
  const clientKey = payer.userId && ctx?.clientKey ? ctx.clientKey : null; // an anonymous caller's key is ignored
  const final = ctx?.final;
  const actionId = `act-${crypto.randomUUID()}`;
  const claim = async key => {
    await db.prepare(`INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at, client_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, client_key) DO NOTHING`)
      .bind(actionId, payer.userId, payer.payer, payer.payerReason, payer.feature, payer.chargeClass, periodOf(startedAt),
        final?.status || 'running', final?.result ?? null, startedAt, final ? nowSeconds() : null, key).run();
    if (!key) return { action_id: actionId };
    return db.prepare('SELECT action_id, payer, payer_reason, feature, charge_class FROM usage_actions WHERE user_id = ? AND client_key = ?').bind(payer.userId, key).first();
  };
  // A repeated key is an automatic retry of the same action only when the server derives the same identity for it
  // (feature, payer, payer reason, charge class); then it finds the action it already made. The same key on a different
  // identity (grade then ask) is a separate action under a key derived from both, so its own retries find it and it never
  // takes the earlier action's class. '|' is outside CLIENT_KEY, so a derived key never meets a browser's key.
  const identity = [payer.feature, payer.payer, payer.payerReason, payer.chargeClass];
  const same = row => row && [row.feature, row.payer, row.payer_reason, row.charge_class].every((value, at) => value === identity[at]);
  const row = await claim(clientKey);
  if (!clientKey || same(row)) return row?.action_id || actionId;
  return (await claim(`${clientKey}|${identity.join('|')}`))?.action_id || actionId;
}

function actionOf(env, db) {
  const ctx = env?.[USAGE];
  if (!ctx) return insertAction(db, null);
  ctx.action ||= insertAction(db, ctx).catch(error => { warn(`action not recorded: ${error?.message}`); return null; });
  return ctx.action;
}

async function markError(env, db, error) {
  warn(error?.message || String(error));
  try {
    const actionId = await env?.[USAGE]?.action;
    if (actionId) await db.prepare("UPDATE usage_actions SET status = 'accounting_error' WHERE action_id = ?").bind(actionId).run();
  } catch { /* best effort */ }
}

// Records one provider attempt. reservedMicros: the bound held at start (NULL when the path has none). costState
// 'reserved' (settled later by settleAttempt), or 'estimated' / 'unknown' for a ledger-bypass call recorded once, finished.
// Returns the attempt id, or null when nothing could be recorded. Never throws.
export async function beginAttempt(env, { attemptId = `att-${crypto.randomUUID()}`, kind, provider = null, model = null, reservedMicros = null,
  costState = 'reserved', costMicros = null, status = 'running', now = nowSeconds() } = {}) {
  const db = env?.LEARN_DB;
  if (!db) return null;
  try {
    const actionId = await actionOf(env, db);
    if (!actionId) return null;
    const chosen = ATTEMPT_KINDS.includes(kind) ? kind : env[KIND] || DEFAULT_KIND[env[USAGE]?.feature] || 'generation';
    // attempt_id is the ledger's op_id: a replayed insert of the same attempt changes nothing.
    await db.prepare(`INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, started_at, settled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (attempt_id) DO NOTHING`)
      .bind(attemptId, actionId, chosen, provider, model, reservedMicros, costMicros, costState, status, now, status === 'running' ? null : now).run();
    return attemptId;
  } catch (error) {
    await markError(env, db, error);
    return null;
  }
}

// A Durable Object job (video, scene) runs outside this request's isolate. The worker forwards the payer it authenticated
// in one server-set header, always removed from what the browser sent first; the object records its submission under it.
const PAYER_HEADER = 'x-rh-usage-payer';
export function forwardUsagePayer(req, identity) {
  const headers = new Headers(req.headers);
  headers.delete(PAYER_HEADER);
  const userId = identity?.user_id || identity?.userId || null, email = identity?.email || null;
  if (userId || email) headers.set(PAYER_HEADER, JSON.stringify({ userId, email }));
  return new Request(req, { headers });
}
export function usageFromForwarded(env, req, feature) {
  const scoped = withUsage(env, { feature, req });
  let who = null;
  try { who = JSON.parse(req.headers.get(PAYER_HEADER) || 'null'); } catch { /* none */ }
  noteUsageIdentity(scoped, who && typeof who === 'object' ? who : null);
  return scoped;
}

// A ledger-bypass media call, recorded once when it has finished (design "Attempt recording"): the provider's own reported
// cost when it gives one (settled), else a documented estimate (learn-usage-estimates.js, 'estimated'), else 'unknown'.
// A failed call keeps no estimate: whether it was charged is unknown. Never throws; nothing is admitted or refused here.
export function recordMedia(env, { kind = 'media', provider, model = null, ok = true, costMicros = null, estimateMicros = null }) {
  const reported = Number.isSafeInteger(costMicros) && costMicros >= 0 ? costMicros : null;
  const estimate = ok && reported == null && Number.isSafeInteger(estimateMicros) && estimateMicros >= 0 ? estimateMicros : null;
  return beginAttempt(env, { kind, provider, model, status: ok ? 'settled' : 'failed',
    costState: reported != null ? 'settled' : estimate != null ? 'estimated' : 'unknown', costMicros: reported ?? estimate });
}

// Settles a running attempt once: a known cost is 'settled', else 'unknown' with its reservation kept. A duplicate
// completion finds the row no longer running and changes nothing. Never throws.
export async function settleAttempt(env, attemptId, { costMicros = null, status = 'settled', model = null, inputTokens = null, outputTokens = null, now = nowSeconds() } = {}) {
  const db = env?.LEARN_DB;
  if (!db || !attemptId) return;
  const known = Number.isSafeInteger(costMicros) && costMicros >= 0 ? costMicros : null;
  const tokens = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  try {
    await db.prepare(`UPDATE usage_attempts SET status = ?, cost_micros = ?, cost_state = ?, model = COALESCE(?, model), input_tokens = ?, output_tokens = ?, settled_at = ?
      WHERE attempt_id = ? AND status = 'running'`)
      .bind(status, known, known == null ? 'unknown' : 'settled', model, tokens(inputTokens), tokens(outputTokens), now, attemptId).run();
  } catch (error) { await markError(env, db, error); }
}

// The route's outcome for its action: completed / failed / cancelled / interrupted, and result full / partial / none / null
// (unknown). An action that made no paid attempt has no row and needs none.
export async function finishAction(env, { status, result = null, now = nowSeconds() }) {
  const ctx = env?.[USAGE];
  if (!ctx) return;
  ctx.final = { status, result };
  if (!ctx.action) return;
  const db = env.LEARN_DB;
  try {
    const actionId = await ctx.action;
    if (actionId) await db.prepare("UPDATE usage_actions SET status = ?, result = ?, ended_at = ? WHERE action_id = ? AND status <> 'accounting_error'")
      .bind(status, result, now, actionId).run();
  } catch (error) { warn(`action not finished: ${error?.message}`); }
}

// A route that can tell what it delivered says so: 'full', 'partial' or 'none'. The boundary uses it over its default.
export function noteUsageResult(env, result) {
  const ctx = env?.[USAGE];
  if (ctx && ['full', 'partial', 'none'].includes(result)) ctx.result = result;
}

// The boundary's view of a response. An error status fails the action (result none). A JSON or other whole response
// completes it with result full: its work finished before the response was made. An event stream is passed through
// unchanged, byte for byte, and finishes when it ends (completed, result unknown: the stream's own events say what it
// delivered), errors (interrupted) or the client cancels it (cancelled; partial when bytes were delivered, else none).
export async function finishWithResponse(env, response) {
  if (!usageContext(env) || !(response instanceof Response)) return response;
  const streamed = (response.headers.get('content-type') || '').includes('text/event-stream');
  if (!response.ok || !response.body || !streamed) {
    await finishAction(env, response.ok ? { status: 'completed', result: usageContext(env).result || 'full' } : { status: 'failed', result: 'none' });
    return response;
  }
  const reader = response.body.getReader();
  let finished = false, delivered = false;
  const end = outcome => { if (finished) return null; finished = true; return finishAction(env, outcome); };
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) { await end({ status: 'completed', result: usageContext(env).result || null }); controller.close(); }
        else { delivered = true; controller.enqueue(value); }
      } catch (error) { await end({ status: 'interrupted', result: delivered ? 'partial' : 'none' }); controller.error(error); }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { await end({ status: 'cancelled', result: delivered ? 'partial' : 'none' }); } },
  });
  return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
}

// A refund or adjustment (Phase 1: the writer only, no UI flow). micros is signed: a refund is negative.
export async function recordAdjustment(db, { actionId = null, userId = null, micros, reason, now = nowSeconds() }) {
  if (!Number.isSafeInteger(micros) || typeof reason !== 'string' || !reason) throw new Error('adjustment needs integer micros and a reason');
  const adjustmentId = `adj-${crypto.randomUUID()}`;
  await db.prepare('INSERT INTO usage_adjustments (adjustment_id, action_id, user_id, micros, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(adjustmentId, actionId, userId, micros, reason, now).run();
  return adjustmentId;
}

// GET /api/learn/usage's sums for one user and period, over that user's would_charge actions only. Settled cost is used;
// reservations (running) and unknown attempts are reserved, never used; estimates are reported apart. Throws on a read failure.
export async function usageTotals(db, userId, period) {
  const row = await db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN t.cost_state = 'settled' THEN t.cost_micros END), 0) AS used,
      COALESCE(SUM(CASE WHEN t.cost_state IN ('reserved', 'unknown') THEN t.reserved_micros END), 0) AS reserved,
      COALESCE(SUM(CASE WHEN t.cost_state = 'estimated' THEN t.cost_micros END), 0) AS estimated,
      COUNT(CASE WHEN t.cost_state = 'unknown' THEN 1 END) AS unknown_attempts,
      COALESCE(SUM(CASE WHEN t.cost_state = 'unknown' THEN t.reserved_micros END), 0) AS unknown_reserved
    FROM usage_actions a JOIN usage_attempts t ON t.action_id = a.action_id
    WHERE a.user_id = ? AND a.period = ? AND a.charge_class = 'would_charge'`).bind(userId, period).first();
  return { used: Number(row?.used || 0), reserved: Number(row?.reserved || 0), estimated: Number(row?.estimated || 0),
    unknownAttempts: Number(row?.unknown_attempts || 0), unknownReserved: Number(row?.unknown_reserved || 0) };
}
