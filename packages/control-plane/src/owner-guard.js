// The owner-only guard (telemetry owner decision 4, 2026-10-23): every owner dashboard API, export, reconciliation upload,
// diagnostic download and archive retrieval passes here first. Unconditional: it does not depend on SUBSCRIPTION_ONLY (unlike
// subscriptionOwnerRefusal, which lets everyone through when that mode is off). Single owner: SUBSCRIPTION_OWNER_EMAIL.
// The identity comes only from the trusted auth path (devIdentity -> the control plane's /api/me, which reads the session
// cookie); no body, query or header is ever read for it. Missing or malformed configuration, no session, another account, or a
// failed session read: null, which callers answer with ownerNotFound(), so a stranger cannot tell the route exists.
// Emails are compared through loginEmail (auth.js), the application's own normalization: trimmed, lowercased, one plain address.
// Nothing further is folded: a different local part (yudhisteer.chin01@gmail.com), a plus tag, a dot or another domain is another
// account and never matches.
import { devIdentity } from './dev-forwarding.js';
import { loginEmail } from './auth.js';

// A Google or GitHub sign-in's /api/me email is the application principal user@<32 hex>.rabbithole.invalid (auth.js userFor), which
// loginEmail refuses (.invalid), so on production no session could ever match. That exact shape is the only addition: the match stays
// whole-string, a provider email never becomes a principal and email sign-in refuses .invalid, so no caller can choose one.
const PRINCIPAL = /^user@[0-9a-f]{32}\.rabbithole\.invalid$/;
// Strings only: loginEmail coerces anything with String(), which would let [email] or an object with a toString match.
const normal = value => {
  if (typeof value !== 'string') return null;
  const principal = value.trim().toLowerCase();
  return PRINCIPAL.test(principal) ? principal : loginEmail(value);
};
export const ownerEmail = env => normal(env?.SUBSCRIPTION_OWNER_EMAIL); // null when unset, empty or not an address

export async function ownerOnly(req, env, { identity = devIdentity } = {}) {
  const owner = ownerEmail(env);
  if (!owner) return null; // unconfigured: refuse before any session read
  let user;
  try { user = await identity(req, env); } catch { return null; }
  if (!user || user instanceof Response || normal(user.email) !== owner) return null;
  return { email: owner, userId: typeof user.userId === 'string' && user.userId ? user.userId : null };
}

export const ownerNotFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
