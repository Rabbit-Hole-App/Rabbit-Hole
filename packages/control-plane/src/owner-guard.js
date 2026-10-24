// The owner-only guard (telemetry owner decision 4, 2026-10-23): every owner dashboard API, export, reconciliation upload,
// diagnostic download and archive retrieval passes here first. Unconditional: it does not depend on SUBSCRIPTION_ONLY (unlike
// subscriptionOwnerRefusal, which lets everyone through when that mode is off). Single owner: SUBSCRIPTION_OWNER_EMAIL.
// The identity comes only from the trusted auth path, the control plane's session (devIdentity -> /api/me); no body, query or
// header is ever read for it. Missing configuration, no session, another account, or a failed session read: null, which
// callers answer with ownerNotFound(), so a stranger cannot tell the route exists.
import { devIdentity } from './dev-forwarding.js';
import { ownerEmailMatches } from './subscription-transport.js';

export async function ownerOnly(req, env, { identity = devIdentity } = {}) {
  if (!ownerEmailMatches(env, env?.SUBSCRIPTION_OWNER_EMAIL)) return null; // unset: refuse before any session read
  let user;
  try { user = await identity(req, env); } catch { return null; }
  if (!user || user instanceof Response || !ownerEmailMatches(env, user.email)) return null;
  return { email: user.email, userId: typeof user.userId === 'string' && user.userId ? user.userId : null };
}

export const ownerNotFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
