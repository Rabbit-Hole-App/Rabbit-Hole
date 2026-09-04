// small control plane: CLI API + browser auth wall + router. One Worker + D1.
// URLs are path-based (no custom domain): /a/<org>/<app>/... proxies to the app's Fly origin.
import { sign, verify, sha256, randomHex } from './token.js';

const SESSION_COOKIE = 'small_session';
const SESSION_TTL = 7 * 24 * 3600;

const orgOf = (email) => email.split('@')[1].toLowerCase().replace(/\./g, '-');
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const html = (body, status = 200, headers = {}) =>
  new Response(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;max-width:26rem;margin:15vh auto;padding:0 1rem}input,button{font-size:1rem;padding:.5rem}</style>${body}`, {
    status,
    headers: { 'Content-Type': 'text/html;charset=utf-8', ...headers },
  });

async function sendEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY) return false; // dev mode: caller falls back to echoing the code/link
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || 'small <onboarding@resend.dev>', to: [to], subject, text }),
  });
  return resp.ok;
}

async function cliAuth(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return null;
  const p = await verify(m[1], env.MASTER_KEY);
  return p && p.t === 'cli' ? p : null;
}

async function sessionOf(req, env) {
  const header = req.headers.get('X-Small-Session'); // tests use the header; browsers use the cookie
  const cookie = (req.headers.get('Cookie') || '').match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  const p = await verify(header || (cookie && cookie[1]), env.MASTER_KEY);
  return p && p.t === 'sess' ? p : null;
}

async function appRow(env, org, name) {
  return env.DB.prepare('SELECT * FROM apps WHERE org = ? AND name = ?').bind(org, name).first();
}

async function canView(env, app, email) {
  if (app.owner_email === email) return true;
  const member = await env.DB.prepare('SELECT role FROM members WHERE app_id = ? AND email = ?').bind(app.id, email).first();
  if (member) return true;
  return app.visibility === 'domain' && orgOf(email) === app.org;
}

async function canEdit(env, app, email) {
  if (app.owner_email === email) return true;
  const member = await env.DB.prepare('SELECT role FROM members WHERE app_id = ? AND email = ?').bind(app.id, email).first();
  return member && member.role === 'edit';
}

// ---------- CLI API ----------

async function apiLogin(req, env) {
  const { email } = await req.json();
  if (!email || !email.includes('@')) return json({ error: 'valid email required' }, 400);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const challenge = await sign({ t: 'challenge', email, codeHash: await sha256(code), exp: now() + 600 }, env.MASTER_KEY);
  const sent = await sendEmail(env, email, `small login code: ${code}`, `Your small login code is ${code}\nIt expires in 10 minutes.`);
  if (sent) return json({ challenge });
  // Echoing the code is an auth bypass — only allowed on test/dev instances (marked by TEST_BYPASS_SECRET).
  if (!env.TEST_BYPASS_SECRET) return json({ error: 'email not configured on this control plane' }, 503);
  return json({ challenge, devCode: code, warning: 'test instance — code echoed' });
}

async function apiVerify(req, env) {
  const { challenge, code } = await req.json();
  const p = await verify(challenge, env.MASTER_KEY);
  if (!p || p.t !== 'challenge' || p.codeHash !== (await sha256(String(code)))) return json({ error: 'bad or expired code' }, 401);
  // ponytail: CLI tokens never expire; revoke by rotating MASTER_KEY. Add exp + refresh when it matters.
  const token = await sign({ t: 'cli', email: p.email, org: orgOf(p.email) }, env.MASTER_KEY);
  return json({ token, email: p.email, org: orgOf(p.email) });
}

async function apiDeploy(req, env, user, baseUrl) {
  const { name, framework, visibility } = await req.json();
  if (!name || !/^[a-z0-9-]{1,40}$/.test(name)) return json({ error: 'name must be [a-z0-9-]' }, 400);
  let app = await appRow(env, user.org, name);
  if (app) {
    if (!(await canEdit(env, app, user.email))) return json({ error: `${name} exists and you cannot edit it` }, 403);
    if (visibility) await env.DB.prepare('UPDATE apps SET visibility = ? WHERE id = ?').bind(visibility, app.id).run();
  } else {
    const flyApp = `small-${name}-${randomHex(3)}`;
    await env.DB.prepare('INSERT INTO apps (org, name, fly_app, proxy_secret, visibility, owner_email) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(user.org, name, flyApp, randomHex(32), visibility || 'domain', user.email)
      .run();
    app = await appRow(env, user.org, name);
  }
  // ponytail: hands the org-wide Fly token to any org member; scope to per-app deploy tokens post-MVP.
  return json({
    flyApp: app.fly_app,
    proxySecret: app.proxy_secret,
    flyToken: env.FLY_API_TOKEN || null,
    flyOrg: env.FLY_ORG_SLUG || 'personal',
    url: `${baseUrl}/a/${user.org}/${name}/`,
    framework: framework || null,
  });
}

async function apiShare(req, env, user) {
  const { app: name, email, role } = await req.json();
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canEdit(env, app, user.email))) return json({ error: 'only owner or edit members can share' }, 403);
  await env.DB.prepare('INSERT INTO members (app_id, email, role) VALUES (?, ?, ?) ON CONFLICT(app_id, email) DO UPDATE SET role = excluded.role')
    .bind(app.id, email.toLowerCase(), role === 'edit' ? 'edit' : 'view')
    .run();
  return json({ ok: true, app: name, email: email.toLowerCase(), role: role === 'edit' ? 'edit' : 'view' });
}

async function apiApps(env, user) {
  const { results } = await env.DB.prepare('SELECT name, visibility, owner_email, fly_app, created_at FROM apps WHERE org = ? ORDER BY name').bind(user.org).all();
  return json({ apps: results });
}

async function apiLogs(req, env, user) {
  const name = new URL(req.url).searchParams.get('app');
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canView(env, app, user.email))) return json({ error: 'no access' }, 403);
  return json({ flyApp: app.fly_app, flyToken: env.FLY_API_TOKEN || null });
}

// ---------- Browser wall ----------

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}

async function loginPage(req, env, baseUrl) {
  const url = new URL(req.url);
  const next = url.searchParams.get('next') || '/';
  if (req.method === 'POST') {
    const form = await req.formData();
    const email = String(form.get('email') || '').toLowerCase().trim();
    if (!email.includes('@')) return html('<p>Enter a valid work email.</p><a href="javascript:history.back()">back</a>', 400);
    const magic = await sign({ t: 'magic', email, next, exp: now() + 900 }, env.MASTER_KEY);
    const link = `${baseUrl}/auth?token=${encodeURIComponent(magic)}`;
    const sent = await sendEmail(env, email, 'Your small sign-in link', `Sign in: ${link}\nExpires in 15 minutes.`);
    if (sent) return html(`<h2>Check your inbox</h2><p>We sent a sign-in link to <b>${email}</b>.</p>`);
    if (!env.TEST_BYPASS_SECRET) return html('<p>Email is not configured on this control plane.</p>', 503);
    return html(`<h2>Test instance</h2><p>Dev sign-in link:</p><p><a href="${link}">${link}</a></p>`);
  }
  return html(`<h2>Sign in to small</h2><form method=post><input name=email type=email placeholder=you@company.com required autofocus> <button>Send link</button></form>`);
}

async function authRedirect(req, env) {
  const token = new URL(req.url).searchParams.get('token');
  const p = await verify(token, env.MASTER_KEY);
  if (!p || p.t !== 'magic') return html('<p>Link expired or invalid. <a href="/login">Try again</a>.</p>', 401);
  const sess = await sign({ t: 'sess', email: p.email, exp: now() + SESSION_TTL }, env.MASTER_KEY);
  return new Response(null, { status: 302, headers: { Location: p.next || '/', 'Set-Cookie': sessionCookie(sess) } });
}

// Test bypass: mint a session without email. Enabled only when TEST_BYPASS_SECRET is set.
async function testSession(req, env) {
  if (!env.TEST_BYPASS_SECRET) return json({ error: 'not enabled' }, 404);
  const { email, secret } = await req.json();
  if (secret !== env.TEST_BYPASS_SECRET) return json({ error: 'bad secret' }, 401);
  const sess = await sign({ t: 'sess', email: email.toLowerCase(), exp: now() + SESSION_TTL }, env.MASTER_KEY);
  return json({ session: sess }, 200);
}

// ---------- Router/proxy ----------

async function proxyApp(req, env, org, name, rest, baseUrl) {
  const sess = await sessionOf(req, env);
  const prefix = `/a/${org}/${name}`;
  if (!sess) {
    if (req.method !== 'GET') return json({ error: 'login required' }, 401);
    return new Response(null, { status: 302, headers: { Location: `${baseUrl}/login?next=${encodeURIComponent(prefix + '/')}` } });
  }
  const app = await appRow(env, org, name);
  if (!app) return html(`<p>No app <b>${name}</b> here.</p>`, 404);
  if (!(await canView(env, app, sess.email))) return html(`<p><b>${sess.email}</b> does not have access to <b>${name}</b>. Ask the owner to run <code>small share ${sess.email}</code>.</p>`, 403);
  if (rest === '') return new Response(null, { status: 301, headers: { Location: `${prefix}/` } }); // relative URLs need the trailing slash

  const origin = `https://${app.fly_app}.fly.dev`;
  const target = new URL(req.url);
  const headers = new Headers(req.headers);
  headers.delete('Cookie'); // the app never sees the session
  headers.delete('X-Small-Session');
  headers.set('X-Small-User', sess.email);
  headers.set('X-Small-Org', org);
  headers.set('X-Small-Proxy', app.proxy_secret);
  let resp;
  for (let attempt = 0; ; attempt++) {
    resp = await fetch(`${origin}${rest}${target.search}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      redirect: 'manual',
    });
    // Fly answers 502/503 while a scaled-to-zero machine wakes (~30s for torch-heavy apps);
    // hold safe-to-repeat requests instead of showing the browser a Bad Gateway.
    if (![502, 503].includes(resp.status) || !['GET', 'HEAD'].includes(req.method) || attempt >= 9) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  const out = new Headers(resp.headers);
  const loc = out.get('Location');
  if (loc && loc.startsWith('/') && !loc.startsWith('/a/')) out.set('Location', prefix + loc); // path-based hosting: re-prefix app redirects
  return new Response(resp.body, { status: resp.status, headers: out });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const path = url.pathname;
    try {
      if (path === '/api/cli/login' && req.method === 'POST') return await apiLogin(req, env);
      if (path === '/api/cli/verify' && req.method === 'POST') return await apiVerify(req, env);
      if (path.startsWith('/api/')) {
        const user = await cliAuth(req, env);
        if (!user) return json({ error: 'run small login first' }, 401);
        if (path === '/api/deploy' && req.method === 'POST') return await apiDeploy(req, env, user, baseUrl);
        if (path === '/api/share' && req.method === 'POST') return await apiShare(req, env, user);
        if (path === '/api/apps' && req.method === 'GET') return await apiApps(env, user);
        if (path === '/api/logs' && req.method === 'GET') return await apiLogs(req, env, user);
        return json({ error: 'no such endpoint' }, 404);
      }
      if (path === '/login') return await loginPage(req, env, baseUrl);
      if (path === '/auth') return await authRedirect(req, env);
      if (path === '/test/session' && req.method === 'POST') return await testSession(req, env);
      const m = path.match(/^\/a\/([a-z0-9-]+)\/([a-z0-9-]+)(\/.*)?$/);
      if (m) return await proxyApp(req, env, m[1], m[2], m[3] || '', baseUrl);
      if (path === '/') return html('<h2>small</h2><p>Deploy a Python app behind a login in one command: <code>npm i -g small-deploy</code></p>');
      return html('<p>Not found.</p>', 404);
    } catch (err) {
      return json({ error: `internal: ${err.message}` }, 500);
    }
  },
};
