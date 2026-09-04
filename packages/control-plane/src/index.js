// small control plane: CLI API + browser auth wall + router. One Worker + D1.
// URLs are path-based (no custom domain): /a/<org>/<app>/... proxies to the app's Fly origin.
import { sign, verify, sha256, randomHex } from './token.js';
import { ensureFlyApp, ensureVolume, deployTokenFor, startMachine } from './fly.js';
import { assumeRole } from './aws.js';
import { runReview } from './review.js';
import { parseCron, matches, nextRun } from './cron.js';

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

async function apiDeploy(req, env, ctx, user, baseUrl) {
  const { name, framework, visibility, awsRoleArn, kind, review, storage, schedule } = await req.json();
  if (!name || !/^[a-z0-9-]{1,40}$/.test(name)) return json({ error: 'name must be [a-z0-9-]' }, 400);
  let nextAt = null;
  if (schedule) {
    if (kind !== 'job') return json({ error: 'schedule requires kind = "job" in small.toml' }, 400);
    try {
      nextAt = nextRun(parseCron(schedule), Date.now()); // also rejects "0 0 30 2 *" — valid syntax, never fires
    } catch (e) {
      return json({ error: `bad schedule "${schedule}": ${e.message} — use 5-field cron like "0 9 * * 1-5"` }, 400);
    }
  }
  if (storage && !(Number.isInteger(storage.sizeGb) && storage.sizeGb >= 1 && storage.sizeGb <= 100))
    return json({ error: 'storage.sizeGb must be an integer between 1 and 100' }, 400);
  if (awsRoleArn && !/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(awsRoleArn)) return json({ error: 'bad aws role arn' }, 400);
  let app = await appRow(env, user.org, name);
  if (app) {
    if (!(await canEdit(env, app, user.email))) return json({ error: `${name} exists and you cannot edit it` }, 403);
    if (visibility) await env.DB.prepare('UPDATE apps SET visibility = ? WHERE id = ?').bind(visibility, app.id).run();
    if (awsRoleArn !== undefined) await env.DB.prepare('UPDATE apps SET aws_role_arn = ? WHERE id = ?').bind(awsRoleArn || null, app.id).run();
    if (kind) await env.DB.prepare('UPDATE apps SET kind = ? WHERE id = ?').bind(kind === 'job' ? 'job' : 'server', app.id).run();
    if (schedule !== undefined) await env.DB.prepare('UPDATE apps SET schedule = ? WHERE id = ?').bind(schedule || null, app.id).run();
  } else {
    const flyApp = `small-${name}-${randomHex(3)}`;
    await env.DB.prepare('INSERT INTO apps (org, name, fly_app, proxy_secret, visibility, owner_email, aws_role_arn, kind, schedule) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(user.org, name, flyApp, randomHex(32), visibility || 'domain', user.email, awsRoleArn || null, kind === 'job' ? 'job' : 'server', schedule || null)
      .run();
    app = await appRow(env, user.org, name);
  }
  if (!env.FLY_API_TOKEN) return json({ error: 'control plane has no FLY_API_TOKEN configured' }, 503);
  // The worker owns the Fly app lifecycle; the CLI only gets a 1h token scoped to this one app.
  let flyToken, volumeRegion;
  try {
    await ensureFlyApp(env, app.fly_app);
    if (storage) volumeRegion = await ensureVolume(env, app.fly_app, storage.sizeGb);
    flyToken = await deployTokenFor(env, app);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  // Review runs concurrently with the CLI-side Fly build; it never blocks or fails the deploy.
  const reviewStarted = !!(env.ANTHROPIC_API_KEY && review && review.bundle);
  if (reviewStarted) ctx.waitUntil(runReview(env, app.id, review.bundle, review.skipped || []));
  return json({
    flyApp: app.fly_app,
    proxySecret: app.proxy_secret,
    flyToken,
    url: `${baseUrl}/a/${user.org}/${name}/`,
    framework: framework || null,
    volumeRegion: volumeRegion || null,
    reviewStarted,
    reviewedAt: app.reviewed_at || null, // previous review's stamp; the CLI polls until it changes
    nextRun: nextAt,
    schedulePaused: !!app.schedule_paused,
  });
}

async function apiReview(req, env, user) {
  const name = new URL(req.url).searchParams.get('app');
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canView(env, app, user.email))) return json({ error: 'no access' }, 403);
  return json({
    review: app.review ? JSON.parse(app.review) : null,
    prev: app.review_prev ? JSON.parse(app.review_prev) : null,
    reviewedAt: app.reviewed_at || null,
    model: app.review_model || null,
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
  if (!env.FLY_API_TOKEN) return json({ error: 'control plane has no FLY_API_TOKEN configured' }, 503);
  try {
    return json({ flyApp: app.fly_app, flyToken: await deployTokenFor(env, app) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// Called by guard.py with the app's proxy secret — not a CLI token.
async function apiRequestLogIngest(req, env, slug) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  const app = m && (await env.DB.prepare('SELECT * FROM apps WHERE proxy_secret = ?').bind(m[1]).first());
  if (!app || app.name !== slug) return json({ error: 'forbidden' }, 403);
  const { lines = [] } = await req.json();
  if (!Array.isArray(lines) || !lines.length) return json({ ok: true });
  const stmt = env.DB.prepare('INSERT INTO request_logs (org, slug, ts, method, path, status, ms, user) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  await env.DB.batch(
    lines.slice(0, 500).map((l) =>
      stmt.bind(app.org, app.name, String(l.ts || ''), String(l.method || ''), String(l.path || ''), Number(l.status) || 0, Number(l.ms) || 0, l.user == null ? null : String(l.user))
    )
  );
  return json({ ok: true });
}

// ponytail: no log search — user/status filters only, add a path/text query param when asked
async function apiRequestLogs(req, env, user) {
  const url = new URL(req.url);
  const name = url.searchParams.get('app');
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canView(env, app, user.email))) return json({ error: 'no access' }, 403);
  const where = ['org = ?', 'slug = ?'];
  const binds = [app.org, app.name];
  const byUser = url.searchParams.get('user');
  if (byUser) { where.push('user = ?'); binds.push(byUser); }
  const byStatus = url.searchParams.get('status') || '';
  if (/^[1-5]xx$/.test(byStatus)) { where.push('status BETWEEN ? AND ?'); binds.push(+byStatus[0] * 100, +byStatus[0] * 100 + 99); }
  else if (/^\d+$/.test(byStatus)) { where.push('status = ?'); binds.push(+byStatus); }
  const after = url.searchParams.get('after');
  const order = after === null ? 'ORDER BY id DESC LIMIT 100' : 'ORDER BY id LIMIT 1000'; // no cursor: last 100 newest-first; cursor: ascending for --follow
  if (after !== null) { where.push('id > ?'); binds.push(+after); }
  const { results } = await env.DB.prepare(`SELECT id, ts, method, path, status, ms, user FROM request_logs WHERE ${where.join(' AND ')} ${order}`).bind(...binds).all();
  const cursor = results.length ? Math.max(results[0].id, results[results.length - 1].id) : +(after || 0);
  return json({ lines: results, cursor });
}

// Runtime endpoint: the guard inside a machine trades its proxy secret for 1h STS
// session creds scoped by the customer's role. No CLI token involved — the proxy
// secret is per-app and high-entropy. ExternalId pins the role to the app's org so
// one org cannot point small.toml at another org's role (confused deputy).
async function apiAwsCreds(req, env) {
  const { secret } = await req.json();
  if (!secret) return json({ error: 'secret required' }, 400);
  const app = await env.DB.prepare('SELECT * FROM apps WHERE proxy_secret = ?').bind(secret).first();
  if (!app) return json({ error: 'forbidden' }, 403);
  if (!app.aws_role_arn) return json({ error: 'no aws role configured for this app' }, 404);
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) return json({ error: 'control plane has no AWS principal configured' }, 503);
  try {
    return json(await assumeRole(env, app.aws_role_arn, `small-${app.org}-${app.name}`, app.org));
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// ---------- Job runs ----------

// Registered by the CLI after `fly deploy --build-only --push` — jobs deploy an image, not machines.
async function apiImage(req, env, user) {
  const { app: name, image } = await req.json();
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canEdit(env, app, user.email))) return json({ error: 'no access' }, 403);
  if (!/^registry\.fly\.io\/[\w./:-]+$/.test(image || '')) return json({ error: 'bad image ref' }, 400);
  await env.DB.prepare('UPDATE apps SET image = ? WHERE id = ?').bind(image, app.id).run();
  return json({ ok: true });
}

// Shared by the manual /api/runs path and the cron tick. startedBy = email or "cron".
// Marks the run failed and rethrows if the machine won't start.
async function startRun(env, app, startedBy, baseUrl) {
  const runId = 'r-' + randomHex(6);
  await env.DB.prepare('INSERT INTO runs (run_id, app_id, started_by) VALUES (?, ?, ?)').bind(runId, app.id, startedBy).run();
  const runToken = await sign({ t: 'run', run: runId, exp: now() + 6 * 3600 }, env.MASTER_KEY);
  try {
    await startMachine(env, app.fly_app, {
      image: app.image,
      auto_destroy: true,
      restart: { policy: 'no' },
      guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 256 }, // ponytail: fixed size; read memory from small.toml when a job needs more
      env: {
        SMALL_RUN_ID: runId,
        SMALL_RUN_TOKEN: runToken,
        SMALL_USER: startedBy,
        SMALL_API: baseUrl,
        ...(startedBy === 'cron' ? { SMALL_TRIGGER: 'cron' } : {}),
      },
    });
  } catch (e) {
    await env.DB.prepare("UPDATE runs SET status = 'failed', finished_at = datetime('now') WHERE run_id = ?").bind(runId).run();
    throw e;
  }
  return runId;
}

async function apiRunStart(req, env, user, baseUrl) {
  const { app: name } = await req.json();
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canView(env, app, user.email))) return json({ error: 'no access' }, 403);
  if (app.kind !== 'job') return json({ error: `${name} is not a job — set kind = "job" in small.toml and redeploy` }, 400);
  if (!app.image) return json({ error: `no image for ${name} — run small deploy first` }, 409);
  if (!env.FLY_ORG_TOKEN && !env.FLY_API_TOKEN) return json({ error: 'control plane has no fly token configured' }, 503);
  try {
    return json({ runId: await startRun(env, app, user.email, baseUrl) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function apiSchedulePause(req, env, user) {
  const { app: name, paused } = await req.json();
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canEdit(env, app, user.email))) return json({ error: 'no access' }, 403);
  if (!app.schedule) return json({ error: `${name} has no schedule — add schedule = "..." to small.toml and redeploy` }, 400);
  await env.DB.prepare('UPDATE apps SET schedule_paused = ? WHERE id = ?').bind(paused ? 1 : 0, app.id).run();
  return json({ ok: true, schedule: app.schedule, paused: !!paused });
}

async function apiRunsList(req, env, user) {
  const name = new URL(req.url).searchParams.get('app');
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canView(env, app, user.email))) return json({ error: 'no access' }, 403);
  const { results } = await env.DB.prepare(
    'SELECT run_id, status, exit_code, started_by, started_at, finished_at, reason FROM runs WHERE app_id = ? ORDER BY id DESC'
  ).bind(app.id).all();
  return json({ runs: results });
}

async function apiRunGet(req, env, user, runId) {
  const run = await env.DB.prepare(
    'SELECT runs.status, runs.exit_code, apps.id AS app_id, apps.org, apps.owner_email, apps.visibility FROM runs JOIN apps ON apps.id = runs.app_id WHERE runs.run_id = ?'
  ).bind(runId).first();
  if (!run || run.org !== user.org) return json({ error: `no run ${runId}` }, 404);
  if (!(await canView(env, { id: run.app_id, org: run.org, owner_email: run.owner_email, visibility: run.visibility }, user.email)))
    return json({ error: 'no access' }, 403);
  const after = Number(new URL(req.url).searchParams.get('after') ?? -1);
  const { results } = await env.DB.prepare('SELECT seq, line FROM run_logs WHERE run_id = ? AND seq > ? ORDER BY seq').bind(runId, after).all();
  return json({
    status: run.status,
    exitCode: run.exit_code,
    lines: results.map((r) => r.line),
    cursor: results.length ? results[results.length - 1].seq : after,
  });
}

// Called by runner.py with the per-run token — not a CLI token.
async function apiRunLog(req, env, runId) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  const p = m && (await verify(m[1], env.MASTER_KEY));
  if (!p || p.t !== 'run' || p.run !== runId) return json({ error: 'bad run token' }, 401);
  const { lines = [], exitCode } = await req.json();
  if (lines.length) {
    // ponytail: MAX(seq) is race-free only because one runner posts batches sequentially
    const { m: maxSeq } = await env.DB.prepare('SELECT COALESCE(MAX(seq), -1) AS m FROM run_logs WHERE run_id = ?').bind(runId).first();
    let seq = maxSeq;
    const stmt = env.DB.prepare('INSERT INTO run_logs (run_id, seq, line) VALUES (?, ?, ?)');
    await env.DB.batch(lines.map((l) => stmt.bind(runId, ++seq, String(l))));
  }
  if (exitCode !== undefined && exitCode !== null) {
    await env.DB.prepare("UPDATE runs SET status = ?, exit_code = ?, finished_at = datetime('now') WHERE run_id = ?")
      .bind(exitCode === 0 ? 'finished' : 'failed', exitCode, runId)
      .run();
  }
  return json({ ok: true });
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
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const path = url.pathname;
    try {
      if (path === '/api/cli/login' && req.method === 'POST') return await apiLogin(req, env);
      if (path === '/api/cli/verify' && req.method === 'POST') return await apiVerify(req, env);
      if (path === '/api/runtime/aws-creds' && req.method === 'POST') return await apiAwsCreds(req, env);
      if (path.startsWith('/api/')) {
        const runLog = path.match(/^\/api\/runs\/([\w-]+)\/log$/);
        if (runLog && req.method === 'POST') return await apiRunLog(req, env, runLog[1]); // runner auth, not CLI auth
        const reqLog = path.match(/^\/api\/apps\/([a-z0-9-]+)\/request-log$/);
        if (reqLog && req.method === 'POST') return await apiRequestLogIngest(req, env, reqLog[1]); // guard auth, not CLI auth
        const user = await cliAuth(req, env);
        if (!user) return json({ error: 'run small login first' }, 401);
        if (path === '/api/deploy' && req.method === 'POST') return await apiDeploy(req, env, ctx, user, baseUrl);
        if (path === '/api/image' && req.method === 'POST') return await apiImage(req, env, user);
        if (path === '/api/runs' && req.method === 'POST') return await apiRunStart(req, env, user, baseUrl);
        if (path === '/api/runs' && req.method === 'GET') return await apiRunsList(req, env, user);
        const runGet = path.match(/^\/api\/runs\/([\w-]+)$/);
        if (runGet && req.method === 'GET') return await apiRunGet(req, env, user, runGet[1]);
        if (path === '/api/schedule' && req.method === 'POST') return await apiSchedulePause(req, env, user);
        if (path === '/api/share' && req.method === 'POST') return await apiShare(req, env, user);
        if (path === '/api/apps' && req.method === 'GET') return await apiApps(env, user);
        if (path === '/api/logs' && req.method === 'GET') return await apiLogs(req, env, user);
        if (path === '/api/request-logs' && req.method === 'GET') return await apiRequestLogs(req, env, user);
        if (path === '/api/review' && req.method === 'GET') return await apiReview(req, env, user);
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

  // Two crons (wrangler.jsonc): "0 3 * * *" purges request_logs, "* * * * *" runs due jobs.
  async scheduled(event, env, ctx) {
    if (event.cron === '0 3 * * *') {
      // 7-day request-log retention. Cutoff formatted with 'T' to match the guard's ISO timestamps.
      // ponytail: retention fixed at 7 days — make it a per-app column when someone needs more
      await env.DB.prepare("DELETE FROM request_logs WHERE ts < strftime('%Y-%m-%dT%H:%M:%S', 'now', '-7 days')").run();
      return;
    }
    // Every-minute tick. scheduledTime is the tick's nominal minute even when
    // delivery is late; last_scheduled_at pins each fired minute so a duplicate
    // or late tick never double-fires.
    // ponytail: no catch-up after downtime — a missed minute is just missed.
    const tick = Math.floor(event.scheduledTime / 60000) * 60; // unix seconds, floored to the minute
    const { results } = await env.DB.prepare(
      "SELECT * FROM apps WHERE kind = 'job' AND schedule IS NOT NULL AND schedule_paused = 0 AND image IS NOT NULL"
    ).all();
    for (const app of results) {
      let parsed;
      try {
        parsed = parseCron(app.schedule);
      } catch {
        continue; // validated at deploy; a bad legacy row must not kill the whole tick
      }
      if (!matches(parsed, new Date(tick * 1000)) || (app.last_scheduled_at || 0) >= tick) continue;
      await env.DB.prepare('UPDATE apps SET last_scheduled_at = ? WHERE id = ?').bind(tick, app.id).run();
      // ponytail: a run whose machine died before posting an exit code stays 'running'
      // and blocks cron forever; add a max-age cutoff when it bites.
      const running = await env.DB.prepare("SELECT 1 AS x FROM runs WHERE app_id = ? AND status = 'running' LIMIT 1").bind(app.id).first();
      if (running) {
        await env.DB.prepare(
          "INSERT INTO runs (run_id, app_id, started_by, status, reason, finished_at) VALUES (?, ?, 'cron', 'skipped', 'previous run still active', datetime('now'))"
        ).bind('r-' + randomHex(6), app.id).run();
        continue;
      }
      try {
        await startRun(env, app, 'cron', env.BASE_URL);
      } catch (e) {
        console.error(`cron: ${app.org}/${app.name}: ${e.message}`); // run row already marked failed
      }
    }
  },
};
