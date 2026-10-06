// Rabbit Hole web sign-in: Continue with Google, Continue with GitHub, Continue with email.
// No passwords. Every route ends at one internal user (users), found by the provider's immutable
// id (user_identities), and a signed session that logout can revoke (users.session_epoch).
// The CLI keeps its own code flow in index.js; for one email address both reach the same principal.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { sign, verify, randomHex, sha256 } from './token.js';
import { normalizeHandle } from './handle.js';

export const SESSION_COOKIE = 'small_session';
const SESSION_TTL = 7 * 24 * 3600;
const OAUTH_COOKIE = 'rh_oauth';
const LINK_TTL = 900;
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Test/dev bypasses (/test/*) need SMALL_ENV test or dev AND their secret. Any other SMALL_ENV,
// including none, is production: fail closed.
export const testMode = (env) => env.SMALL_ENV === 'test' || env.SMALL_ENV === 'dev';
// Echoing a login code or sign-in link hands a session for any email to whoever asks, so it is
// SMALL_ENV=test only. A public dev control plane (rabbit-hole-cp-dev) mints through /test/session.
export const echoesLogin = (env) => env.SMALL_ENV === 'test' && !!env.TEST_BYPASS_SECRET;
// The mock provider signs anyone in as any provider id - the same risk as an echo: SMALL_ENV=test
// instances that opt in only, never a public dev control plane.
const mockOAuth = (env) => echoesLogin(env) && env.OAUTH_MOCK === 'true';

// Login email: trimmed, lowercased, one @, plain local part, dotted domain labels with no edge hyphens.
// Quoted or display-name forms are refused - orgOf reads after the first @, so they could pick another org.
// .invalid (RFC 2606, never deliverable) is refused: it marks Google/GitHub-only principals.
const EMAIL_RE = /^[a-z0-9._%+-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const loginEmail = (raw) => {
  const email = String(raw ?? '').trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) && !email.endsWith('.invalid') ? email : null;
};

// Where to land after sign-in: a path on this site only. //host, /\host, schemes and
// whitespace/control characters (browsers drop tabs and newlines, turning /\t/host into //host) become /.
// Printable ASCII only: a raw non-ASCII character cannot go in a Location header (browsers send it
// percent-encoded anyway). A sign-in route is not a destination: next=/logout would sign out at once.
const AUTH_ROUTE = /^\/(?:login|logout|auth|test)(?:[/?#]|$)/;
export function safeNext(raw) {
  const s = String(raw ?? '');
  return s.length <= 1024 && /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]*$/.test(s) && !AUTH_ROUTE.test(s) ? s : '/';
}

const cookieValue = (req, name) => (req.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
const setCookie = (name, value, path, maxAge) => `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}
const loginError = (code, next) => `/login?error=${code}${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`;

// ---------- Users and sessions ----------

// The user behind (provider, provider id), created on first sign-in. Email identities use the
// address as both id and principal, so the web link and the CLI code reach the same user.
// Google/GitHub identities get a fresh user with a per-user .invalid principal: a provider's email
// and name are display metadata only (refreshed each sign-in), so a matching address never merges
// into another account. The returned user carries the provider it signed in with.
// ponytail: two first sign-ins racing on one Google/GitHub id can leave one orphan users row (never
// reachable); wrap in a D1 batch if it matters.
export async function userFor(env, provider, providerUserId, { email = null, name = null } = {}) {
  const find = () => env.DB.prepare(
    'SELECT u.id, u.email, u.session_epoch FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.provider_user_id = ?'
  ).bind(provider, providerUserId).first();
  const t = now();
  let user = await find();
  if (user) {
    await env.DB.prepare('UPDATE user_identities SET last_login_at = ?, provider_email = ?, provider_name = ? WHERE provider = ? AND provider_user_id = ?')
      .bind(t, email, name, provider, providerUserId).run();
    return { ...user, provider };
  }
  const id = randomHex(16);
  const principal = provider === 'email' ? providerUserId : `user@${id}.rabbithole.invalid`;
  await env.DB.prepare('INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)').bind(id, principal, t).run();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user_identities (provider, provider_user_id, user_id, provider_email, provider_name, created_at, last_login_at) SELECT ?, ?, id, ?, ?, ?, ? FROM users WHERE email = ?'
  ).bind(provider, providerUserId, email, name, t, t, principal).run();
  user = await find();
  if (!user) throw new Error('identity not stored');
  return { ...user, provider };
}

const sessionFor = (env, user) =>
  sign({ t: 'sess', uid: user.id, email: user.email, ep: user.session_epoch, prov: user.provider, exp: now() + SESSION_TTL }, env.MASTER_KEY);
const sessionCookie = async (env, user) => setCookie(SESSION_COOKIE, await sessionFor(env, user), '/', SESSION_TTL);

// A session is good while its signature holds, it has not expired, and its epoch still matches
// the user's (logout bumps it). Sessions from before users existed carry no uid and are void.
// Any D1 error is no session: fail closed.
export async function sessionOf(req, env) {
  const header = req.headers.get('X-Small-Session'); // tests use the header; browsers use the cookie
  const p = await verify(header || cookieValue(req, SESSION_COOKIE), env.MASTER_KEY);
  if (!p || p.t !== 'sess' || typeof p.uid !== 'string') return null;
  try {
    const u = await env.DB.prepare('SELECT session_epoch FROM users WHERE id = ?').bind(p.uid).first();
    return u && u.session_epoch === p.ep ? p : null;
  } catch {
    return null;
  }
}

// What the frontend may show for the signed-in user. Never the internal principal: Google/GitHub
// users get the provider's email/name when there is one, else a neutral label like "GitHub user".
const PROVIDER_LABELS = { google: 'Google user', github: 'GitHub user', email: 'Email user' };
const NO_STORE = { 'Cache-Control': 'no-store' }; // per person: never from a shared cache
const shown = (v) => (typeof v === 'string' && v && !v.endsWith('.invalid') ? v : null);
async function sessionDisplay(req, env) {
  const s = await sessionOf(req, env);
  if (!s) return json({ signedIn: false }, 401, NO_STORE);
  let row = null;
  try {
    row = await env.DB.prepare('SELECT provider_email, provider_name FROM user_identities WHERE user_id = ? AND provider = ?').bind(s.uid, s.prov).first();
  } catch {} // display metadata only: fall back to the neutral label
  const email = shown(row?.provider_email);
  const name = shown(row?.provider_name);
  const provider = PROVIDER_LABELS[s.prov] ? s.prov : null;
  return json({ signedIn: true, provider, display: { name, email, label: name || email || PROVIDER_LABELS[provider] || 'Signed in' } }, 200, NO_STORE);
}

// ---------- Google and GitHub ----------

// jwks_uri from https://accounts.google.com/.well-known/openid-configuration. jose caches the keys
// per isolate and refetches when a token names a kid it has not seen (Google rotates keys).
const GOOGLE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const PROVIDERS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    params: { response_type: 'code', scope: 'openid email', prompt: 'select_account' },
    clientId: (env) => env.GOOGLE_CLIENT_ID,
    clientSecret: (env) => env.GOOGLE_CLIENT_SECRET,
    profile: googleProfile,
  },
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    params: { allow_signup: 'true' }, // no scope: public profile only; the numeric id is all sign-in needs
    clientId: (env) => env.GITHUB_CLIENT_ID,
    clientSecret: (env) => env.GITHUB_CLIENT_SECRET,
    profile: githubProfile,
  },
};
const configured = (env, name) => mockOAuth(env) || !!(PROVIDERS[name].clientId(env) && PROVIDERS[name].clientSecret(env));

async function googleProfile(env, code, verifier, redirectUri) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  if (!r.ok) throw new Error(`token status ${r.status}`);
  const { id_token } = await r.json();
  // Full ID-token verification even though it came straight from Google: RS256 signature against
  // Google's published keys, issuer, audience, expiry. sub never changes; email is display only.
  let c;
  try {
    ({ payload: c } = await jwtVerify(String(id_token), GOOGLE_KEYS, {
      algorithms: ['RS256'], issuer: GOOGLE_ISSUERS, audience: env.GOOGLE_CLIENT_ID, requiredClaims: ['exp', 'iat', 'sub'],
    }));
  } catch (e) {
    throw new Error(`id_token rejected: ${e.code || 'invalid'}`);
  }
  if (typeof c.sub !== 'string' || !c.sub) throw new Error('id_token has no sub');
  return { id: c.sub, email: c.email_verified === true && typeof c.email === 'string' ? c.email.toLowerCase() : null, name: null };
}

async function githubProfile(env, code, verifier, redirectUri) {
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
      redirect_uri: redirectUri, code_verifier: verifier,
    }),
  });
  const tok = r.ok ? await r.json() : {};
  if (!tok.access_token) throw new Error(`token status ${r.status}${tok.error ? ` ${tok.error}` : ''}`);
  const u = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'rabbit-hole' },
  });
  if (!u.ok) throw new Error(`user status ${u.status}`);
  // id is GitHub's immutable account id; login and email can change, and email is often private (null).
  const { id, email, name, login } = await u.json();
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('no user id');
  const display = [name, login].find((v) => typeof v === 'string' && v.trim());
  return { id: String(id), email: typeof email === 'string' ? email.toLowerCase() : null, name: display ? display.trim().slice(0, 100) : null };
}

async function profileOf(env, name, code, verifier, redirectUri) {
  if (!code) throw new Error('no code');
  if (mockOAuth(env)) {
    const m = await verify(code, env.MASTER_KEY);
    if (!m || m.t !== 'mockcode' || m.p !== name) throw new Error('bad mock code');
    return { id: m.sub, email: m.email, name: m.name || null };
  }
  return PROVIDERS[name].profile(env, code, verifier, redirectUri);
}

// The flow cookie binds the callback to this browser: its state must come back from the provider,
// and it carries the PKCE verifier and the safe post-login path. Signed, HttpOnly, 10 minutes.
async function oauthStart(req, env, name, baseUrl) {
  const next = safeNext(new URL(req.url).searchParams.get('next'));
  if (!configured(env, name)) return redirect(loginError('unavailable', next));
  const p = PROVIDERS[name];
  const state = randomHex(16);
  const verifier = randomHex(32);
  const flow = await sign({ t: 'oauth', p: name, state, v: verifier, next, exp: now() + 600 }, env.MASTER_KEY);
  const url = new URL(mockOAuth(env) ? `${baseUrl}/test/oauth/authorize` : p.authorize);
  const params = {
    ...p.params, client_id: p.clientId(env) || 'mock', redirect_uri: `${baseUrl}/auth/${name}/callback`,
    state, code_challenge: await sha256(verifier), code_challenge_method: 'S256',
    ...(mockOAuth(env) ? { provider: name } : {}),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return redirect(url.href, [setCookie(OAUTH_COOKIE, flow, '/auth/', 600)]);
}

async function oauthCallback(req, env, name, baseUrl) {
  const url = new URL(req.url);
  const clear = setCookie(OAUTH_COOKIE, '', '/auth/', 0);
  const flow = await verify(cookieValue(req, OAUTH_COOKIE), env.MASTER_KEY);
  const state = url.searchParams.get('state');
  if (!flow || flow.t !== 'oauth' || flow.p !== name || !state || state !== flow.state) return redirect(loginError('expired', '/'), [clear]);
  const next = safeNext(flow.next);
  if (url.searchParams.get('error')) return redirect(loginError('cancelled', next), [clear]);
  let profile;
  try {
    profile = await profileOf(env, name, url.searchParams.get('code'), flow.v, `${baseUrl}/auth/${name}/callback`);
  } catch (e) {
    console.error(`${name} sign-in failed: ${e.message}`); // statuses and error codes only, never tokens
    return redirect(loginError('provider', next), [clear]);
  }
  try {
    const user = await userFor(env, name, profile.id, profile);
    return redirect(next, [clear, await sessionCookie(env, user)]);
  } catch {
    return redirect(loginError('unavailable', next), [clear]);
  }
}

// ---------- Passwordless email ----------

export const WEB_LOGIN_UNAVAILABLE = "We couldn't send a sign-in email right now. Try again in a few minutes.";
const WEB_LOGIN_LIMITED = 'Too many sign-in links requested. Try again later.';

// One single-use link per request: the email carries a signed id, the row (login_links) holds the
// address and the post-login path. Per address: 3 links per 15 minutes, 10 per day. No domain cap:
// a 128-bit link cannot be guessed, and a cap on gmail.com would lock out every Gmail user.
// Any D1 error or undelivered email fails closed; only SMALL_ENV=test instances with the bypass secret see the link.
async function emailLogin(env, email, next, baseUrl, sendEmail) {
  const id = randomHex(16);
  const t = now();
  try {
    const ins = await env.DB.prepare(
      `INSERT INTO login_links (id, email, next, created_at, expires_at)
       SELECT ?1, ?2, ?3, ?4, ?5
       WHERE (SELECT COUNT(*) FROM login_links WHERE email = ?2 AND created_at > ?4 - 900) < 3
         AND (SELECT COUNT(*) FROM login_links WHERE email = ?2 AND created_at > ?4 - 86400) < 10`
    ).bind(id, email, next, t, t + LINK_TTL).run();
    if (ins.meta.changes !== 1) return { status: 'limited' };
  } catch {
    return { status: 'unavailable' };
  }
  const link = `${baseUrl}/auth?token=${encodeURIComponent(await sign({ t: 'magic', id, exp: t + LINK_TTL }, env.MASTER_KEY))}`;
  const sent = await sendEmail(env, email, 'Your Rabbit Hole sign-in link',
    `Sign in to Rabbit Hole: ${link}\nThe link works once and expires in 15 minutes. If you did not ask for it, ignore this email.`);
  if (sent) return { status: 'sent' };
  if (echoesLogin(env)) return { status: 'dev', link };
  try { await env.DB.prepare('DELETE FROM login_links WHERE id = ?').bind(id).run(); } catch {} // its id was never handed out
  return { status: 'unavailable' };
}

// GET only shows the address and a Continue button - mail scanners that open links must not spend
// them. POST spends the link once and signs in.
async function magicLink(req, env, html) {
  const expired = () => html('<h2>This sign-in link has expired</h2><p>Each link works once, for 15 minutes. <a href="/login">Get a new one</a>.</p>', 401);
  const t = now();
  try {
    if (req.method === 'POST') {
      const p = await verify((await req.formData()).get('token'), env.MASTER_KEY);
      if (!p || p.t !== 'magic' || typeof p.id !== 'string') return expired();
      const row = await env.DB.prepare(
        'UPDATE login_links SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ? RETURNING email, next'
      ).bind(t, p.id, t).first();
      if (!row) return expired();
      return redirect(safeNext(row.next), [await sessionCookie(env, await userFor(env, 'email', row.email, { email: row.email }))]);
    }
    const token = new URL(req.url).searchParams.get('token');
    const p = await verify(token, env.MASTER_KEY);
    if (!p || p.t !== 'magic' || typeof p.id !== 'string') return expired();
    const row = await env.DB.prepare('SELECT email FROM login_links WHERE id = ? AND used_at IS NULL AND expires_at > ?').bind(p.id, t).first();
    if (!row) return expired();
    return html(
      `<h2>Sign in to Rabbit Hole</h2><p>Continue as <b>${esc(row.email)}</b>.</p><form method=post action=/auth><input type=hidden name=token value="${esc(token)}"><button>Continue</button></form>`,
      200, { 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store' }
    );
  } catch {
    return html('<p>Could not sign you in right now. Try again in a few minutes.</p>', 503);
  }
}

// ---------- Pages ----------

const LOGIN_ERRORS = {
  unavailable: "That sign-in option isn't available right now. Try another one.",
  cancelled: 'Sign-in was cancelled.',
  expired: 'That sign-in attempt expired. Try again.',
  provider: "We couldn't finish signing you in. Try again.",
};

// Transitional page until the Landing sign-in screen replaces it (docs/features/rabbit-hole-auth-backend.md).
function loginPage(env, next, error, html) {
  const q = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
  const provider = (name, label) => configured(env, name)
    ? `<a href="/auth/${name}/start${q}" style="display:block;text-align:center;line-height:36px;border:1px solid #D3D1CB;border-radius:4px;color:#37352F;margin-top:8px">Continue with ${label}</a>`
    : '';
  const err = LOGIN_ERRORS[error] ? `<p role=alert style="color:#A12E31">${LOGIN_ERRORS[error]}</p>` : '';
  return html(
    `<h2>Sign in to Rabbit Hole</h2>${err}${provider('google', 'Google')}${provider('github', 'GitHub')}<form method=post style="margin-top:16px"><input name=email type=email placeholder=you@example.com aria-label=Email required autofocus><button style="width:100%">Continue with email</button></form><p style="font-size:14px">No password. We email you a sign-in link.</p>`
  );
}

const EMAIL_PAGES = {
  sent: (email) => [200, `<h2>Check your email</h2><p>We sent a secure sign-in link to <b>${esc(email)}</b>.</p>`],
  limited: () => [429, `<p>${WEB_LOGIN_LIMITED}</p>`],
  unavailable: () => [503, `<p>${WEB_LOGIN_UNAVAILABLE}</p>`],
};

// Mock provider for local/test instances: a form that mints a signed code for any provider id.
async function mockAuthorize(req, env, baseUrl, html) {
  if (!mockOAuth(env)) return json({ error: 'not enabled' }, 404);
  const q = new URL(req.url).searchParams;
  const name = q.get('provider');
  if (!PROVIDERS[name]) return json({ error: 'unknown provider' }, 400);
  if (!q.get('sub')) {
    return html(`<h2>Mock ${esc(name)} sign-in</h2><p>Test instance only.</p><form><input type=hidden name=provider value="${esc(name)}"><input type=hidden name=state value="${esc(q.get('state') || '')}"><input name=sub placeholder="provider user id" required><input name=email placeholder="provider email (optional)"><button>Sign in</button></form>`);
  }
  const code = await sign({ t: 'mockcode', p: name, sub: String(q.get('sub')), email: q.get('email') || null, exp: now() + 300 }, env.MASTER_KEY);
  return redirect(`${baseUrl}/auth/${name}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.get('state') || '')}`);
}

// ---------- Router ----------

const FORM_POSTS = new Set(['/login', '/auth', '/auth/email/start', '/logout']);

// The web sign-in routes; null for any other path. deps: { baseUrl, html, sendEmail } from index.js.
export async function handleWebAuth(req, env, path, { baseUrl, html, sendEmail }) {
  const url = new URL(req.url);
  // PUBLIC_ORIGIN (production: https://digrabbithole.com) is the one origin sign-in happens on. Cookies
  // are host-only and providers accept only registered callbacks, so a sign-in route reached on any other
  // host this Worker answers (workers.dev, www, plain http) is sent there first; a POST is refused.
  // That origin also serves Landing, so the transitional /login page becomes /sign-in.
  const canonical = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : null;
  if (canonical && baseUrl !== canonical && AUTH_ROUTE.test(path)) {
    return req.method === 'GET' || req.method === 'HEAD' ? redirect(canonical + path + url.search) : json({ error: `sign in on ${canonical}` }, 403);
  }
  // Login CSRF: a browser always sends Origin on POST, so a cross-site form post is refused.
  // Non-browser clients may omit Origin; they cannot plant a cookie in someone's browser.
  const origin = req.headers.get('Origin');
  if (req.method === 'POST' && FORM_POSTS.has(path) && origin && origin !== baseUrl) return json({ error: 'cross-site request refused' }, 403);

  if (path === '/login') {
    const next = safeNext(url.searchParams.get('next'));
    if (req.method !== 'POST') return canonical ? redirect(`/sign-in${url.search}`) : loginPage(env, next, url.searchParams.get('error'), html);
    const email = loginEmail((await req.formData()).get('email'));
    if (!email) return html('<p>Enter a valid email address.</p><a href="javascript:history.back()">back</a>', 400);
    const r = await emailLogin(env, email, next, baseUrl, sendEmail);
    if (r.status === 'dev') return html(`<h2>Test instance</h2><p>Dev sign-in link:</p><p><a href="${esc(r.link)}">${esc(r.link)}</a></p>`);
    const [status, body] = EMAIL_PAGES[r.status](email);
    return html(body, status);
  }
  if (path === '/auth/email/start' && req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch {}
    const email = loginEmail(body?.email);
    if (!email) return json({ error: 'valid email required' }, 400);
    const r = await emailLogin(env, email, safeNext(body?.next), baseUrl, sendEmail);
    if (r.status === 'sent') return json({ ok: true });
    if (r.status === 'dev') return json({ ok: true, devLink: r.link, warning: 'test instance - link echoed' });
    return r.status === 'limited' ? json({ error: WEB_LOGIN_LIMITED }, 429) : json({ error: WEB_LOGIN_UNAVAILABLE }, 503);
  }
  if (path === '/auth' && (req.method === 'GET' || req.method === 'POST')) return magicLink(req, env, html);
  if (path === '/auth/session' && req.method === 'GET') return sessionDisplay(req, env);
  const oauth = path.match(/^\/auth\/(google|github)\/(start|callback)$/);
  if (oauth && req.method === 'GET') return oauth[2] === 'start' ? oauthStart(req, env, oauth[1], baseUrl) : oauthCallback(req, env, oauth[1], baseUrl);
  if (path === '/logout') {
    // Signs out every session of this user (the epoch bump). Only this origin's own pages, or the person
    // typing the URL (none), may do it: a cross-site or sibling-subdomain (same-site) request does nothing.
    const site = req.headers.get('Sec-Fetch-Site');
    if (site && site !== 'same-origin' && site !== 'none') return redirect('/login');
    const s = await sessionOf(req, env);
    if (s) {
      try { await env.DB.prepare('UPDATE users SET session_epoch = session_epoch + 1 WHERE id = ?').bind(s.uid).run(); } catch {}
    }
    return redirect('/login', [setCookie(SESSION_COOKIE, '', '/', 0)]);
  }
  // Test bypass: mint a session without email. Enabled only in testMode with TEST_BYPASS_SECRET set.
  if (path === '/test/session' && req.method === 'POST') {
    if (!testMode(env) || !env.TEST_BYPASS_SECRET) return json({ error: 'not enabled' }, 404);
    const { email, secret, handle } = await req.json();
    if (secret !== env.TEST_BYPASS_SECRET) return json({ error: 'bad secret' }, 401);
    const address = String(email).toLowerCase();
    const user = await userFor(env, 'email', address, { email: address });
    // A test person gets a public handle (docs/features/user-handles.md), so a browser check lands on the page it asked
    // for rather than on "Choose your handle": the one it names, else a random test handle; handle: null keeps none, to
    // test that step itself. An existing handle is kept. Test mode only, like this route; best effort on a LEARN_DB
    // without migration 0008.
    if (handle !== null && env.LEARN_DB) {
      const chosen = typeof handle === 'string' ? normalizeHandle(handle).handle : `t_${randomHex(6)}`;
      try {
        await env.LEARN_DB.prepare('INSERT INTO user_profiles (email) VALUES (?) ON CONFLICT(email) DO NOTHING').bind(address).run();
        if (chosen) await env.LEARN_DB.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').bind(address, chosen).run();
      } catch { /* no 0008 here, or the named handle is taken: the session still mints */ }
    }
    return json({ session: await sessionFor(env, user) });
  }
  if (path === '/test/oauth/authorize' && req.method === 'GET') return mockAuthorize(req, env, baseUrl, html);
  return null;
}
