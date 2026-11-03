// Bug reports and feature ideas from the feedback button - the Learn canvas's,
// or the sidebar's on Home, Library and Explore, where there is no app
// (docs/features/learn-feedback.md). One JSON object per report in Learn
// media storage (learn-storage.js: the dev bucket on dev and review), with who
// sent it and where from. No schema change. After the report is kept, the owner is mailed (feedback-mail.js, best effort) and each
// sender is held to HOURLY and DAILY reports, so a flood cannot become a mail flood.
import { authorizedBoardApp } from './learn-board.js';
import { learnMedia } from './learn-storage.js';
import { repositoryIdentity } from './repositories.js';
import { devIdentity } from './dev-forwarding.js';
import { makeEvent, routeTemplate } from './telemetry-contract.js';
import { emitTelemetry } from './telemetry-delivery.js';

const KINDS = ['bug', 'idea'];
// Owner decision pending (docs/features/learn-feedback.md "Limits"): reports one account may send per UTC hour and per UTC day.
export const HOURLY = 5, DAILY = 20;
export const LIMITED = "You've sent a lot of feedback in a short time. Please try again later.";

// Claims one of `max` numbered slots for this sender in this window. A slot is an object created only if absent (R2's
// If-None-Match: *, atomic even for a burst of parallel requests); put returns null when it already exists. 'limited' when every
// slot is taken, 'unchecked' when the bucket errors (the report is still kept, but not mailed).
// shortcut: fixed windows, and the slot objects are never deleted (25 tiny objects per sender per day at most); add an R2 lifecycle rule on learn-feedback-limit/ if it matters.
async function claim(media, who, window, max) {
  for (let slot = 0; slot < max; slot += 1) {
    if (await media.put(`learn-feedback-limit/${who}/${window}/${slot}`, '1', { onlyIf: new Headers({ 'If-None-Match': '*' }) }) !== null) return 'ok';
  }
  return 'limited';
}
export async function withinLimits(media, id, at = new Date().toISOString()) {
  try {
    const who = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(id)))), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
    for (const [window, max] of [[at.slice(0, 13), HOURLY], [at.slice(0, 10), DAILY]]) if (await claim(media, who, window, max) === 'limited') return 'limited';
    return 'ok';
  } catch (error) { console.error(`feedback limit unchecked: ${String(error.message).slice(0, 100)}`); return 'unchecked'; }
}

// The sender's real contact address. The application principal (access.email) is user@<id>.rabbithole.invalid for an account that
// only signed in with Google or GitHub (auth.js userFor), so the address is read server-side from user_identities.provider_email,
// as auth.js sessionDisplay does: Google's only when the provider verified it, GitHub's profile address is kept but marked
// not verified. An emailed sign-in's principal is itself the proven address. Never read from the request.
const ADDRESS = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
const usable = value => typeof value === 'string' && value.length <= 254 && ADDRESS.test(value) && !value.toLowerCase().endsWith('.invalid');
export async function senderContact(env, userId, principal) {
  if (usable(principal)) return { email: principal.toLowerCase(), verified: true, provider: 'email' };
  if (!userId || !env.DB) return null;
  try {
    const { results } = await env.DB.prepare('SELECT provider, provider_email FROM user_identities WHERE user_id = ? AND provider_email IS NOT NULL ORDER BY last_login_at DESC LIMIT 5').bind(userId).all();
    const found = results.filter(row => usable(row.provider_email)).map(row => ({ email: row.provider_email.toLowerCase(), verified: row.provider !== 'github', provider: row.provider }));
    return found.find(row => row.verified) || found[0] || null;
  } catch { return null; }
}
const handleOf = async (env, principal) => {
  try { return (await env.LEARN_DB?.prepare('SELECT handle FROM user_handles WHERE email = ?').bind(principal).first())?.handle ?? null; } catch { return null; }
};

// Ask the control plane (the only Worker with the mail key) to mail the report just stored, as the sender: its session cookie is
// how the control plane knows the report is theirs. Best effort: a failure is logged without any content and never reaches the sender.
async function notifyOwner(req, env, key) {
  try {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (req.headers.has('cookie')) headers.set('cookie', req.headers.get('cookie'));
    const sent = await env.CONTROL_PLANE.fetch(new Request('https://control-plane/api/feedback/notify', { method: 'POST', headers, body: JSON.stringify({ key }), redirect: 'manual', signal: AbortSignal.timeout(8000) }));
    if (!sent.ok) console.error(`feedback mail not sent: status ${sent.status}`);
  } catch { console.error('feedback mail not sent: control plane unreachable'); }
}

// The reference a person can quote to support: RH-XXXX-XXXX in Crockford base 32 (no I, L, O or U), 40 bits from the platform's
// random source. It names the report in the owner dashboard (telemetry.md "Browser errors"); it grants nothing.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function supportRef(random = crypto) {
  const bytes = random.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, byte => ALPHABET[byte & 31]);
  return `RH-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}
// The page's latest client-error fingerprints and failed-request trace ids (client-telemetry.js diagnostics()): hex ids only,
// at most five of each, anything else dropped. Never text.
const diagnosticsOf = value => {
  const pick = (list, pattern) => (Array.isArray(list) ? list.filter(item => typeof item === 'string' && pattern.test(item)).slice(0, 5) : []);
  const fingerprints = pick(value?.fingerprints, /^[0-9a-f]{16}$/), traces = pick(value?.traces, /^[0-9a-f]{16}$/);
  return fingerprints.length || traces.length ? { fingerprints, traces } : null;
};

export function validateFeedback(body) {
  if (!body || !KINDS.includes(body.kind)) throw Error('Choose Bug or Idea');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 2000) throw Error('Describe it in 1 to 2000 characters');
  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const short = value => (typeof value === 'string' ? value.slice(0, 300) : null);
  const diagnostics = diagnosticsOf(body.diagnostics);
  return { kind: body.kind, text, context: { board: short(context.board), path: short(context.path), viewport: short(context.viewport), userAgent: short(context.userAgent) }, ...(diagnostics ? { diagnostics } : {}) };
}

export async function feedbackFetch(req, env) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body, report;
  try { body = await req.json(); report = validateFeedback(body); } catch (error) { return json({ error: error.message || 'Invalid feedback' }, 400); }
  // With an app, the same access check as every Learn route; without one
  // (Home, Library, Explore), a signed-in workspace member.
  const access = body.app == null ? await repositoryIdentity(req, env) : await authorizedBoardApp(req, env, body.app);
  if (access instanceof Response) return access;
  const media = learnMedia(env);
  if (!media) return json({ error: 'Feedback storage is not configured here.' }, 503);
  const at = new Date().toISOString(), id = crypto.randomUUID(), ref = supportRef();
  // Who sent it: the session user's id (a canvas's access carries it; otherwise ask the control plane who is signed in).
  const userId = access.userId ?? access.user_id ?? await Promise.resolve(devIdentity(req, env)).then(who => (who instanceof Response ? null : who?.userId ?? null), () => null);
  const limit = await withinLimits(media, userId || access.email, at);
  if (limit === 'limited') return json({ error: LIMITED }, 429);
  const [contact, handle] = await Promise.all([senderContact(env, userId, access.email), handleOf(env, access.email)]);
  const key = `learn-feedback/${at.slice(0, 10)}/${at}-${id}.json`;
  await media.put(key, JSON.stringify({ id, ref, at, app: body.app ?? null, org: access.org, email: access.email, userId, contact, handle, ...report }), { httpMetadata: { contentType: 'application/json' } });
  // Storage came first, so nothing below can lose the report. A sender whose limit could not be checked is not mailed.
  if (limit === 'ok' && userId) await notifyOwner(req, env, key);
  // The reference joins the report to what the page saw before it (a support.report event). Best effort: the report is already kept.
  await emitTelemetry(env, makeEvent('support.report', { feature: 'feedback', ...(userId ? { user_ref: userId } : {}),
    payload: { ref, kind: report.kind, ...(report.context.path ? { route: routeTemplate(report.context.path) } : {}), ...(report.diagnostics || {}) } }, { service: 'app_worker' }));
  return json({ id, ref }, 201);
}
