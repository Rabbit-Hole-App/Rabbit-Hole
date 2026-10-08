// Dev preview sign-in through Cloudflare Access (docs/features/dev-auto-deploy.md#access). Only the stable URL's own
// entrypoint (packages/web/dev-access-worker.js) imports this: dev-worker.js and production's app-worker.js never do
// (pinned in test/dev-access.test.js), and without ACCESS_AUD that entrypoint behaves exactly like dev-worker.js.
// Access stands in front of the preview host and lets only the allowed Google account through; this module checks
// Access's signed assertion itself (issuer, audience, signature, expiry, allowed identity), then gives the request a
// session of the dev control plane for that verified email, minted through the binding's /test/session (dev
// control plane only: its own MASTER_KEY, SMALL_ENV=dev). Every downstream call then runs the normal account,
// workspace and ownership checks for that person. The browser's /login, /auth, /logout and /test/session stay
// refused by the barrier (dev-forwarding.js); this path never forwards a browser request to them.
import { createRemoteJWKSet, jwtVerify } from 'jose';

// auth.js SESSION_COOKIE (a test pins them equal); not imported, so the dev worker does not bundle the sign-in module.
export const SESSION_COOKIE = 'small_session';
// The pipeline's post-deploy smoke signs in with an Access service token, which carries no email: it maps to this
// synthetic dev user only when its client id is the configured one.
export const SMOKE_EMAIL = 'dev-deploy-smoke@example.test';
const SESSION_TTL = 7 * 24 * 3600;
const keySets = new Map();
const refuse = (error, status = 403) => ({ refuse: Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } }) });
const cookieValue = (req, name) => (req.headers.get('Cookie') || '').split(/;\s*/).find(c => c.startsWith(`${name}=`))?.slice(name.length + 1);

// Which identity a session cookie names, unverified: the control plane verifies the signature on every call, so this
// only decides whether to mint a fresh session for the Access identity.
// ponytail: a session revoked by epoch still reads as current here; dev logout is refused, so nothing revokes one.
function sessionEmail(token) {
  try {
    const body = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    return body.exp > Date.now() / 1000 ? body.email : null;
  } catch { return null; }
}

export async function accessIdentity(req, env, keys) {
  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN) return null;
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!keys && !keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  try {
    const { payload } = await jwtVerify(token, keys || keySets.get(issuer), { issuer, audience: env.ACCESS_AUD });
    // The smoke user is only ever the service token's identity, never an email claim.
    if (typeof payload.email === 'string') return payload.email.toLowerCase() === SMOKE_EMAIL ? null : payload.email.toLowerCase();
    return env.ACCESS_SMOKE_CLIENT_ID && payload.common_name === env.ACCESS_SMOKE_CLIENT_ID ? SMOKE_EMAIL : null;
  } catch { return null; }
}

// -> { req } to serve (with the person's session cookie) and, once Access verified an allowed identity, its email, plus
// setCookie when a session was minted; or { refuse }.
export async function accessSession(req, env, keys) {
  if (!env.ACCESS_AUD) return { req };
  // Half a configuration never falls through to a session.
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_ALLOWED_EMAILS || !env.DEV_TEST_BYPASS || !env.ACCESS_HOST) return refuse('Access sign-in on this preview is not fully configured.', 503);
  // Only the host Access protects: a version preview host (<id>-<worker>.…workers.dev) sits outside the Access application.
  if (new URL(req.url).hostname !== env.ACCESS_HOST) return refuse('This preview is served only on its Access-protected host.');
  const email = await accessIdentity(req, env, keys);
  const allowed = String(env.ACCESS_ALLOWED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || (email !== SMOKE_EMAIL && !allowed.includes(email))) return refuse('This preview is private: sign in through Cloudflare Access with an allowed account.');
  if (sessionEmail(cookieValue(req, SESSION_COOKIE) || '') === email) return { req, email };
  const minted = await env.CONTROL_PLANE.fetch(new Request(new URL('/test/session', req.url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    // handle: null - the person keeps (or chooses) their own handle; /test/session would otherwise invent one.
    body: JSON.stringify({ email, secret: env.DEV_TEST_BYPASS, handle: null }),
  }));
  const session = minted.ok ? (await minted.json()).session : null;
  if (!session) return refuse('The dev control plane did not issue a session for this Access identity.', 502);
  const headers = new Headers(req.headers);
  const others = (req.headers.get('Cookie') || '').split(/;\s*/).filter(c => c && !c.startsWith(`${SESSION_COOKIE}=`));
  headers.set('Cookie', [...others, `${SESSION_COOKIE}=${session}`].join('; '));
  return { req: new Request(req, { headers }), email, setCookie: `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}` };
}

// The app's own sign-in pages and routes. Behind Access the person is already signed in, and the app's sign-in can
// never complete on a preview (the barrier refuses /auth/*), so these go to the Library instead.
const SIGN_IN = p => p === '/' || p === '/sign-in' || p === '/sign-up' || p === '/login' || p === '/auth' || p.startsWith('/auth/');
export const signInRedirect = req => (req.method === 'GET' || req.method === 'HEAD') && SIGN_IN(new URL(req.url).pathname);

// A worker's fetch with the Access bridge in front (dev-access-worker.js); unchanged when ACCESS_AUD is not set.
export const withAccess = (fetch, keys) => async (req, env, ctx) => {
  const access = await accessSession(req, env, keys);
  if (access.refuse) return access.refuse;
  const response = access.email && signInRedirect(req)
    ? new Response(null, { status: 302, headers: { Location: '/library', 'Cache-Control': 'no-store' } })
    : await fetch(access.req, env, ctx);
  if (!access.setCookie) return response;
  const out = new Response(response.body, response);
  out.headers.append('Set-Cookie', access.setCookie);
  return out;
};
