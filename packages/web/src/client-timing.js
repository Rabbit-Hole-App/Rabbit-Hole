// Timings of user-visible intervals for benchmarking (docs/features/telemetry.md "Timing events"). One `client.timing` event per interval
// through the existing browser sink (client-telemetry.js reportClientEvent): the interval name, whole milliseconds, an outcome and a few
// enums. Never text, an id, a title or a URL. Start and end may live in different files: markStart(key, ...) / markEnd(key, ...) pair by
// key. Nothing here throws, awaits or changes behavior; with telemetry not installed every call does nothing.
import { routeTemplate } from '../../control-plane/src/telemetry-contract.js';
import { reportClientEvent } from './client-telemetry.js';

// Must equal the registered enum (control-plane/src/telemetry-events/client.js); client-timing.test.mjs checks it.
export const INTERVALS = Object.freeze([
  'chat_route_ms', 'chat_first_chunk_ms', 'chat_total_ms',
  'roadmap_plan_ms', 'roadmap_revise_ms', 'roadmap_accept_plan_ms', 'roadmap_first_proposal_ms',
  'card_accept_ms', 'card_ready_ms', 'card_stage_generating_ms', 'card_stage_checking_ms', 'card_stage_saving_ms',
  'drop_to_invite_ms', 'drop_to_ready_ms', 'source_resolve_ms', 'canvas_ready_ms',
]);
export const STALE_MS = 10 * 60_000; // a start never ended inside this window is dropped, not reported
export const PAGE_MAX_TIMINGS = 25;   // timings one page load may send: the sink's 50-event page budget is shared with error reports, which must never be crowded out
export const MAX_MS = 3_600_000;     // a longer interval is clamped; the contract itself has no maximum
const CONTEXT = ['mode', 'depth', 'path', 'size', 'count'];

let clock = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
let sent = 0;
let sink = (name, payload) => reportClientEvent(name, payload);
let routeOf = () => { try { return routeTemplate(globalThis.location?.pathname || '/'); } catch { return '/'; } };
export const configureTimingForTests = (parts = {}) => { clock = parts.clock || clock; sink = parts.sink || sink; routeOf = parts.route || routeOf; open.clear(); sent = 0; };

const open = new Map(); // key -> { interval, at, ctx }

function send(interval, at, outcome, ctx) {
  try {
    if (sent >= PAGE_MAX_TIMINGS) return;
    sent += 1;
    const ms = Math.min(MAX_MS, Math.max(0, Math.round(clock() - at)));
    const payload = { interval, ms, outcome, route: routeOf() };
    for (const field of CONTEXT) if (ctx?.[field] !== undefined && ctx[field] !== null) payload[field] = ctx[field];
    sink('client.timing', payload);
  } catch { /* a timing is never worth a failure */ }
}

// A start and its end in one place.
export function startTiming(interval, ctx = {}) {
  const at = clock();
  let done = false;
  return {
    end(outcome = 'ok', extra = {}) { if (!done) { done = true; send(interval, at, outcome, { ...ctx, ...extra }); } },
    cancel() { done = true; },
  };
}

// A start and its end in different places. Restarting a key replaces the earlier start (that attempt is dropped).
export function markStart(key, interval, ctx = {}) { open.set(key, { interval, at: clock(), ctx }); }
export function markEnd(key, outcome = 'ok', extra = {}) {
  const entry = open.get(key);
  if (!entry) return;
  open.delete(key);
  if (clock() - entry.at > STALE_MS) return;
  send(entry.interval, entry.at, outcome, { ...entry.ctx, ...extra });
}
// The same interval, found under another key later (a dropped block's id becomes its source key).
export function markMove(from, to) { const entry = open.get(from); if (entry) { open.delete(from); open.set(to, entry); } }
