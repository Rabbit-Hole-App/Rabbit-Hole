// Star events (docs/features/stars.md "Analytics and telemetry"): the names, the allowed payload fields and the delivery of the
// canvas_star_events rows (migration 0028) to the telemetry contract. This file owns Stars' event definitions; the telemetry
// lane owns the envelope, the validation and the sink (telemetry-contract.js, telemetry-delivery.js), so delivery goes through
// an injected `emit(envelope)` that must throw when the event was not stored. A leaf module (no imports).

// Where a person pressed Star, a fixed list: a client value outside it is dropped, never stored.
export const SURFACES = ['shared_page', 'card_home', 'card_library', 'card_explore', 'card_profile', 'canvas_header', 'personal_stars', 'profile_stars'];
export const surfaceOf = value => (SURFACES.includes(value) ? value : null);

// Allowlisted payload fields per event, in the contract's field kinds (hex, token, boolean). No free text, token, URL or title.
//   star.added   - an account starred a canvas (a repeat writes none).
//   star.removed - a star ended; reason says why (voluntary: the person; lifecycle: its canvas was deleted).
//   star.opened  - a canvas opened from the personal Stars page or a profile Stars collection (emitted by the opening surface).
export const STAR_EVENTS = Object.freeze({
  'star.added': Object.freeze({ canvas_ref: 'hex', owner_star: 'boolean', surface: 'token?' }),
  'star.removed': Object.freeze({ canvas_ref: 'hex', owner_star: 'boolean', surface: 'token?', reason: 'token' }),
  'star.opened': Object.freeze({ canvas_ref: 'hex', owner_star: 'boolean', surface: 'token' }),
});

// The canvas as analytics may name it: a one-way hash of the canonical (org, canvas), never the pair (org is a workspace
// name) and never a token. The same canvas always yields the same reference, so counts group.
export async function canvasRef(org, canvas) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`star-canvas:${org}/${canvas}`));
  return [...new Uint8Array(bytes)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// One canvas_star_events row as a telemetry envelope. event_id is the row's id, so a resend is the same event and the sink's
// insert-by-event_id absorbs it. user_ref is users.id (pseudonymous, never an email).
export async function starEnvelope(row) {
  const payload = { canvas_ref: await canvasRef(row.org, row.canvas), owner_star: !!row.owner_star };
  if (row.surface) payload.surface = row.surface;
  if (row.kind === 'removed') payload.reason = row.reason;
  return {
    event_id: row.event_id, event_name: row.kind === 'added' ? 'star.added' : 'star.removed', schema_version: 1,
    occurred_at: Date.parse(`${row.at.replace(' ', 'T')}Z`), user_ref: row.user_id, feature: 'stars', operation: row.kind === 'added' ? 'add' : 'remove', outcome: 'completed', payload,
  };
}

// Deliver undelivered events oldest first, marking each only after `emit` stored it. A failed emit stops the run (order is kept,
// the sink is not hammered) and leaves that row and the rest pending, so an outage loses nothing; a crash between emit and the
// mark resends the same event_id later, which the sink ignores. Returns { sent, failed, pending }.
export async function deliverStarEvents(db, emit, { limit = 50, now = () => new Date().toISOString() } = {}) {
  const { results } = await db.prepare('SELECT * FROM canvas_star_events WHERE delivered_at IS NULL ORDER BY at, rowid LIMIT ?').bind(limit).all();
  let sent = 0, failed = 0;
  for (const row of results) {
    try { await emit(await starEnvelope(row)); } catch { failed = 1; break; }
    await db.prepare('UPDATE canvas_star_events SET delivered_at = ? WHERE event_id = ? AND delivered_at IS NULL').bind(now(), row.event_id).run();
    sent += 1;
  }
  const { n } = await db.prepare('SELECT count(*) AS n FROM canvas_star_events WHERE delivered_at IS NULL').first();
  return { sent, failed, pending: n };
}
