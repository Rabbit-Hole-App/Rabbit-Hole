// Email preferences in the main D1 (user_email_preferences, migration 0028; docs/features/signup-email-preferences.md). The
// account is always the session's users.id, passed in by the caller: nothing here reads an identity from a request body. The mailing
// address is never stored with a preference; it is resolved from user_identities when it is needed.
import { sign, verify } from './token.js';
import { CATEGORIES, deliverableEmail, preferenceView, sendDecision, wording } from './email-preferences.js';

const ROWS = 'SELECT category, enabled, affirmative FROM user_email_preferences WHERE user_id = ?';
const IDENTITIES = 'SELECT provider, provider_email, last_login_at FROM user_identities WHERE user_id = ?';
const now = () => Math.floor(Date.now() / 1000);

export const emailPreferenceView = async (env, userId) => {
  const rows = (await env.DB.prepare(ROWS).bind(userId).all()).results;
  const identities = (await env.DB.prepare(IDENTITIES).bind(userId).all()).results;
  return preferenceView(rows, deliverableEmail(identities));
};

// Writes the validated choices (email-preferences.js validateEmailPreferences) for one account, only the categories named, so
// changing one never touches the other. Onboarding is insert-only: a choice already recorded (Settings, an unsubscribe, an earlier
// Continue) is never overwritten by a default shown again. Settings replaces its own category.
export async function saveEmailPreferences(env, userId, { source, disclosure, choices }, at = now()) {
  const conflict = source === 'onboarding' ? 'DO NOTHING'
    : 'DO UPDATE SET enabled = excluded.enabled, source = excluded.source, method = excluded.method, affirmative = excluded.affirmative, disclosure_version = excluded.disclosure_version, changed_at = excluded.changed_at';
  for (const [category, choice] of Object.entries(choices)) {
    await env.DB.prepare(`INSERT INTO user_email_preferences (user_id, category, enabled, source, method, affirmative, disclosure_version, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, category) ${conflict}`)
      .bind(userId, category, choice.enabled ? 1 : 0, source, choice.method, choice.affirmative ? 1 : 0, disclosure, at).run();
  }
}

// The unsubscribe link's write: this category off, no disclosure shown. A person with no row gets an off row, so it is on record.
export const unsubscribeCategory = (env, userId, category, at = now()) => env.DB.prepare(
  `INSERT INTO user_email_preferences (user_id, category, enabled, source, method, affirmative, disclosure_version, changed_at) VALUES (?, ?, 0, 'unsubscribe', 'unsubscribe_link', 0, NULL, ?)
   ON CONFLICT(user_id, category) DO UPDATE SET enabled = 0, source = 'unsubscribe', method = 'unsubscribe_link', affirmative = 0, disclosure_version = NULL, changed_at = excluded.changed_at`
).bind(userId, category, at).run();

// THE gate for any marketing-style email: { send: true, address } or { send: false, reason }. It reads the person's current
// preference, applies the owner's affirmative-consent rule, resolves a verified address server-side and checks suppression.
// Nothing sends mail yet; the future sender must call this and send to no other address.
export async function marketingRecipient(env, userId, category) {
  if (typeof userId !== 'string' || !userId || !CATEGORIES.includes(category)) return { send: false, reason: 'unknown_category' };
  const preference = await env.DB.prepare('SELECT enabled, affirmative FROM user_email_preferences WHERE user_id = ? AND category = ?').bind(userId, category).first();
  const identities = (await env.DB.prepare(IDENTITIES).bind(userId).all()).results;
  const address = deliverableEmail(identities);
  const suppressed = address ? !!(await env.DB.prepare('SELECT 1 AS hit FROM email_suppressions WHERE address = ?').bind(address).first()) : false;
  return sendDecision({ category, preference: preference && { enabled: !!preference.enabled, affirmative: !!preference.affirmative }, address, suppressed });
}

// ---------- Unsubscribe link ----------
// A signed link for one person and one category (the key is the control plane's MASTER_KEY, which the app Worker does not hold,
// so the route lives here). It does not expire: an old email must still work. GET only shows a button, so a mail scanner that
// opens the link unsubscribes nobody; POST (the button, or a mail client's one-click) does it.
export const unsubscribeUrl = async (env, baseUrl, userId, category) =>
  `${baseUrl}/unsubscribe?token=${encodeURIComponent(await sign({ t: 'unsub', uid: userId, cat: category }, env.MASTER_KEY))}`;

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const PAGE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' };

// null for any other path. deps: { baseUrl, html } from index.js.
export async function handleUnsubscribe(req, env, path, { baseUrl, html }) {
  if (path !== '/unsubscribe') return null;
  if (req.method !== 'GET' && req.method !== 'POST') return html('<p>Method not allowed.</p>', 405, { Allow: 'GET, POST', ...PAGE });
  const origin = req.headers.get('Origin');
  if (req.method === 'POST' && origin && origin !== baseUrl) return Response.json({ error: 'cross-site request refused' }, { status: 403 });
  const invalid = () => html('<h2>This unsubscribe link is not valid</h2><p>Open Settings in Rabbit Hole to change your email choices.</p>', 400, PAGE);
  let token = new URL(req.url).searchParams.get('token');
  if (req.method === 'POST') {
    try { token = (await req.formData()).get('token') || token; } catch { /* a one-click POST has the token in the URL */ }
  }
  const claim = await verify(token, env.MASTER_KEY);
  if (!claim || claim.t !== 'unsub' || typeof claim.uid !== 'string' || !claim.uid || !CATEGORIES.includes(claim.cat)) return invalid();
  const label = esc(wording()[claim.cat].label);
  if (req.method === 'GET') {
    return html(`<h2>Unsubscribe from ${label}?</h2><p>You will no longer get ${label} emails. Your other email choices stay as they are.</p><form method=post action=/unsubscribe><input type=hidden name=token value="${esc(token)}"><button>Unsubscribe</button></form>`, 200, PAGE);
  }
  try { await unsubscribeCategory(env, claim.uid, claim.cat); }
  catch { return html('<p>We could not save that right now. Try again in a few minutes.</p>', 503, PAGE); }
  return html(`<h2>You are unsubscribed from ${label}</h2><p>You can change this any time in Rabbit Hole under Settings.</p>`, 200, PAGE);
}
