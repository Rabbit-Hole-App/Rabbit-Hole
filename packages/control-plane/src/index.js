// small control plane: CLI API + browser auth wall + router. One Worker + D1.
// URLs are path-based (no custom domain): /a/<org>/<app>/... proxies to the app's Fly origin.
import { sign, verify, sha256, randomHex } from './token.js';
import { ensureFlyApp, ensureVolume, deployTokenFor, startMachine, destroyMachine, destroyFlyApp } from './fly.js';
import { assumeRole, s3Buckets, s3Get, s3List } from './aws.js';
import { runReview, generateRunbook } from './review.js';
import { parseCron, matches, nextRun } from './cron.js';
import SHELL from '../../web/dist/index.html';

const SESSION_COOKIE = 'small_session';
const SESSION_TTL = 7 * 24 * 3600;

const orgOf = (email) => email.split('@')[1].toLowerCase().replace(/\./g, '-');
// apps.schedule may hold several crons separated by ';' (dashboard "+" adds them)
const cronParts = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean);
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const html = (body, status = 200, headers = {}) =>
  new Response(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:Inter,ui-sans-serif,system-ui;color:#37352F;background:#fff;max-width:26rem;margin:18vh auto;padding:0 1rem;line-height:1.5}input{width:100%;height:36px;padding:0 10px;border-radius:4px;border:1px solid transparent;background:#F7F6F3;font-size:14px;outline:0}input:focus{border-color:#D3D1CB;box-shadow:0 0 0 2px rgba(35,131,226,.2);background:#fff}button{height:36px;padding:0 14px;border-radius:4px;border:0;background:#2383E2;color:#fff;font-size:14px;font-weight:500;cursor:pointer;margin-top:8px}button:hover{background:#1B6FC2}a{color:#2383E2;text-decoration:none}p{color:#787774}h2{color:#37352F;font-weight:600}</style>${body}`, {
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
  return env.DB.prepare('SELECT * FROM apps WHERE org = ? AND name = ? AND deleted_at IS NULL').bind(org, name).first();
}

// Direct membership, a team share (#finance), or a share on the app's folder —
// all live references; 'edit' wins over 'view'.
async function memberRole(env, app, email) {
  const roles = [];
  const m = await env.DB.prepare('SELECT role FROM members WHERE app_id = ? AND email = ?').bind(app.id, email).first();
  if (m) roles.push(m.role);
  const t = await env.DB.prepare(
    "SELECT at.role FROM app_teams at JOIN team_members tm ON tm.team_id = at.team_id WHERE at.app_id = ? AND tm.email = ? ORDER BY (at.role = 'edit') DESC LIMIT 1"
  ).bind(app.id, email).first();
  if (t) roles.push(t.role);
  if (app.folder_id) {
    const f = await env.DB.prepare(
      "SELECT role FROM folder_shares WHERE folder_id = ?1 AND (email = ?2 OR team_id IN (SELECT team_id FROM team_members WHERE email = ?2)) ORDER BY (role = 'edit') DESC LIMIT 1"
    ).bind(app.folder_id, email).first();
    if (f) roles.push(f.role);
  }
  return roles.includes('edit') ? 'edit' : roles[0] || null;
}

// Reused in list/detail SQL: the caller's role from a share on the app's folder.
const FOLDER_ROLE_SQL = `(SELECT fs.role FROM folder_shares fs WHERE fs.folder_id = apps.folder_id
   AND (fs.email = ?1 OR fs.team_id IN (SELECT team_id FROM team_members WHERE email = ?1))
   ORDER BY (fs.role = 'edit') DESC LIMIT 1)`;

async function canView(env, app, email) {
  if (app.owner_email === email) return true;
  if (await memberRole(env, app, email)) return true;
  return app.visibility === 'domain' && orgOf(email) === app.org;
}

async function canEdit(env, app, email) {
  if (app.owner_email === email) return true;
  return (await memberRole(env, app, email)) === 'edit';
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

// 200 = public, 404 = private or nonexistent, anything else (rate limit, outage) = unknown.
// Unauthenticated on purpose — never store a token; private repos just get plain SHAs.
// ponytail: 60 req/h unauth limit shared across CF egress IPs; null (unknown) when it trips
async function repoPublic(repoUrl) {
  const m = (repoUrl || '').match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/);
  if (!m) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${m[1]}`, { headers: { 'User-Agent': 'small-cp' } });
    return r.status === 200 ? 1 : r.status === 404 ? 0 : null;
  } catch {
    return null;
  }
}

async function apiDeploy(req, env, ctx, user, baseUrl) {
  const { name, framework, visibility, awsRoleArn, kind, review, storage, schedule, source, inputs, outputs } = await req.json();
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
  // Verify the role is assumable NOW, before anything is created — the deploy error
  // carries the exact trust policy (principal + this org as ExternalId) to paste.
  if (awsRoleArn) {
    if (!env.AWS_ACCESS_KEY_ID) return json({ error: 'control plane has no AWS credentials configured' }, 503);
    try {
      await assumeRole(env, awsRoleArn, `small-verify-${user.org}`, user.org);
    } catch (e) {
      const trust = {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { AWS: env.AWS_PRINCIPAL_ARN || '<ask small support for the control-plane principal>' },
          Action: 'sts:AssumeRole',
          Condition: { StringEquals: { 'sts:ExternalId': user.org } },
        }],
      };
      return json({
        error:
          `aws: cannot assume ${awsRoleArn} (${e.message})\n` +
          `create the role in your AWS account with this trust policy, then redeploy:\n` +
          `${JSON.stringify(trust, null, 2)}\n` +
          `and attach a permissions policy for what the app may touch (S3, Lambda, ...)`,
      }, 400);
    }
  }
  // redeploying a name that sits in the Trash revives it — same fly app, same shares
  await env.DB.prepare('UPDATE apps SET deleted_at = NULL WHERE org = ? AND name = ? AND deleted_at IS NOT NULL').bind(user.org, name).run();
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
  // [inputs]/[outputs] schema from small.toml — the dashboard Run form renders from it.
  // undefined = old CLI (keep what's stored); null/absent-in-toml = clear. Oversize is
  // rejected, not truncated — a sliced JSON would 500 every later app GET.
  for (const [col, val] of [['inputs', inputs], ['outputs', outputs]]) {
    if (val === undefined) continue;
    const text = val ? JSON.stringify(val) : null;
    if (text && text.length > 20000) return json({ error: `[${col}] too large — keep the schema under 20KB` }, 400);
    await env.DB.prepare(`UPDATE apps SET ${col} = ? WHERE id = ?`).bind(text, app.id).run();
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
  // Source provenance: one deploys row per deploy, latest mirrored on the app row.
  // No source (not a git repo) clears the app-row copy — stale repo info under a fresh
  // deployed_at would claim the deployed code matches a commit it doesn't.
  const src = {
    repoUrl: source && source.repoUrl ? String(source.repoUrl).slice(0, 300) : null,
    branch: source && source.branch ? String(source.branch).slice(0, 100) : null,
    commit: source && /^[0-9a-f]{7,40}$/.test(source.commit || '') ? source.commit : null,
    dirty: source ? (source.dirty ? 1 : 0) : null,
  };
  const isPublic = src.repoUrl ? await repoPublic(src.repoUrl) : null;
  await env.DB.prepare(
    "UPDATE apps SET repo_url = ?, repo_branch = ?, repo_commit = ?, repo_dirty = ?, repo_public = ?, deployed_at = datetime('now') WHERE id = ?"
  ).bind(src.repoUrl, src.branch, src.commit, src.dirty, isPublic, app.id).run();
  await env.DB.prepare(
    'INSERT INTO deploys (app_id, repo_url, branch, commit_sha, dirty, deployed_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(app.id, src.repoUrl, src.branch, src.commit, src.dirty, user.email).run();
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

// Deploy-time review, run while the CLI holds the request open (in parallel with its Fly
// build). waitUntil's ~30s window is too short for the model to write review + runbook —
// this handler awaits the model and stores the result before responding. runReview never
// throws, so a model failure still answers 200 with the previous (or no) review.
async function apiReviewRun(req, env, user) {
  const { app: name, bundle, skipped } = await req.json();
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canEdit(env, app, user.email))) return json({ error: 'no access' }, 403);
  if (!env.ANTHROPIC_API_KEY || !bundle) return json({ error: 'review not configured' }, 503);
  await runReview(env, app.id, bundle, skipped || []);
  const fresh = await appRow(env, user.org, name);
  return json({
    review: fresh.review ? JSON.parse(fresh.review) : null,
    reviewedAt: fresh.reviewed_at || null,
    model: fresh.review_model || null,
  });
}

// `small init` sends a bundle before any app row exists; the runbook comes back
// synchronously and the CLI writes RUNBOOK.md. Deploys store theirs via runReview.
async function apiRunbook(req, env) {
  const { bundle } = await req.json();
  if (!bundle) return json({ error: 'bundle required' }, 400);
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'runbook generation not configured on this control plane' }, 503);
  try {
    return json({ runbook: await generateRunbook(env, bundle) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

const teamName = (s) => String(s || '').replace(/^#/, '').toLowerCase();
async function teamRow(env, org, name) {
  return env.DB.prepare('SELECT * FROM teams WHERE org = ? AND name = ?').bind(org, teamName(name)).first();
}

async function apiShare(req, env, user) {
  const { app: name, email, team, role } = await req.json();
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canEdit(env, app, user.email))) return json({ error: 'only owner or edit members can share' }, 403);
  const r = role === 'edit' ? 'edit' : 'view';
  if (team) {
    const t = await teamRow(env, user.org, team);
    if (!t) return json({ error: `no team #${teamName(team)} — create it first` }, 404);
    await env.DB.prepare('INSERT INTO app_teams (app_id, team_id, role) VALUES (?, ?, ?) ON CONFLICT(app_id, team_id) DO UPDATE SET role = excluded.role')
      .bind(app.id, t.id, r).run();
    return json({ ok: true, app: name, team: t.name, role: r });
  }
  await env.DB.prepare('INSERT INTO members (app_id, email, role) VALUES (?, ?, ?) ON CONFLICT(app_id, email) DO UPDATE SET role = excluded.role')
    .bind(app.id, email.toLowerCase(), r)
    .run();
  return json({ ok: true, app: name, email: email.toLowerCase(), role: r });
}

// A runner can only report while its 6h run token lives — anything 'running' longer
// is a dead machine that never posted an exit code. Swept lazily on list reads.
// finished_at stays NULL: the real end time is unknown, so no fake duration.
const sweepStaleRuns = (env) =>
  env.DB.prepare("UPDATE runs SET status = 'failed' WHERE status = 'running' AND started_at < datetime('now','-6 hours')").run();

async function apiApps(env, user, baseUrl) {
  await sweepStaleRuns(env);
  const FIELDS = `apps.org, name, kind, visibility, owner_email, fly_app, created_at, deployed_at, runbook, schedule, schedule_paused, folder_id,
            (SELECT group_concat(email || ':' || role) FROM members WHERE app_id = apps.id) AS member_emails,
            (SELECT role FROM members WHERE app_id = apps.id AND email = ?1) AS my_role,
            (SELECT at.role FROM app_teams at JOIN team_members tm ON tm.team_id = at.team_id
              WHERE at.app_id = apps.id AND tm.email = ?1 ORDER BY (at.role = 'edit') DESC LIMIT 1) AS team_role,
            ${FOLDER_ROLE_SQL} AS folder_role,
            (SELECT COUNT(*) FROM app_teams WHERE app_id = apps.id) AS team_count,
            (SELECT json_object('runId', run_id, 'status', status, 'exitCode', exit_code, 'startedAt', started_at, 'finishedAt', finished_at)
               FROM runs WHERE app_id = apps.id ORDER BY id DESC LIMIT 1) AS last_run`;
  const { results } = await env.DB.prepare(
    `SELECT ${FIELDS} FROM apps WHERE org = ?2 AND deleted_at IS NULL ORDER BY name`
  ).bind(user.email, user.org).all();
  // apps from OTHER orgs shared with me by email or via a group — the Shared section
  const { results: foreign } = await env.DB.prepare(
    `SELECT ${FIELDS} FROM apps WHERE deleted_at IS NULL AND org != ?2 AND (
        EXISTS (SELECT 1 FROM members WHERE app_id = apps.id AND email = ?1)
        OR EXISTS (SELECT 1 FROM app_teams at JOIN team_members tm ON tm.team_id = at.team_id WHERE at.app_id = apps.id AND tm.email = ?1)
        OR ${FOLDER_ROLE_SQL} IS NOT NULL
      ) ORDER BY name`
  ).bind(user.email, user.org).all();
  const { results: folders } = await env.DB.prepare('SELECT id, name FROM folders WHERE org = ? ORDER BY name').bind(user.org).all();
  const { results: fshares } = await env.DB.prepare(
    `SELECT fs.folder_id, fs.email, fs.role, t.name AS team FROM folder_shares fs
     LEFT JOIN teams t ON t.id = fs.team_id JOIN folders f ON f.id = fs.folder_id WHERE f.org = ?`
  ).bind(user.org).all();
  for (const f of folders) f.shares = fshares.filter((s) => s.folder_id === f.id).map(({ email, team, role }) => ({ email, team, role }));
  return json({
    org: user.org,
    email: user.email,
    folders,
    apps: [...results, ...foreign].map(({ member_emails, my_role, team_role, folder_role, last_run, ...a }) => {
      const canView = a.owner_email === user.email || !!my_role || !!team_role || !!folder_role || (a.visibility === 'domain' && a.org === user.org);
      return {
        ...a,
        // private apps stay listed for the org, but their content does not leak
        runbook: canView ? a.runbook : null,
        members: canView && member_emails ? member_emails.split(',').map((s) => { const [email, role] = s.split(':'); return { email, role }; }) : [],
        canView,
        canEdit: a.owner_email === user.email || my_role === 'edit' || team_role === 'edit' || folder_role === 'edit',
        lastRun: canView && last_run ? JSON.parse(last_run) : null,
        url: `${baseUrl}/a/${a.org}/${a.name}/`,
      };
    }),
  });
}

// Duplicate: a fresh owned copy of an app I can view — metadata, runbook, image.
// Jobs are immediately runnable (same image, fresh Fly app); servers need one
// `small deploy` to serve. Shares are not copied; schedules start paused.
async function apiAppDuplicate(env, user, name, baseUrl) {
  const src = await appForUser(env, user, name);
  if (!src) return json({ error: `no app named ${name}` }, 404);
  if (!src.canView) return json({ error: 'no access' }, 403);
  let copy = `${src.name}-copy`;
  for (let i = 2; await env.DB.prepare('SELECT 1 FROM apps WHERE org = ? AND name = ?').bind(user.org, copy).first(); i++)
    copy = `${src.name}-copy-${i}`;
  const flyApp = `small-${copy.slice(0, 30)}-${randomHex(3)}`;
  if (!env.FLY_ORG_TOKEN && !env.FLY_API_TOKEN) return json({ error: 'control plane has no fly token configured' }, 503);
  try {
    await ensureFlyApp(env, flyApp);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  await env.DB.prepare(
    `INSERT INTO apps (org, name, fly_app, proxy_secret, visibility, owner_email, kind, image, runbook, folder_id, schedule, schedule_paused)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(user.org, copy, flyApp, randomHex(32), src.visibility, user.email, src.kind, src.image, src.runbook, src.org === user.org ? src.folder_id : null, src.schedule).run();
  return json({ ok: true, name: copy, url: `${baseUrl}/apps/${copy}` });
}

// Share-page lookup. The slug is org-scoped, but people shared by email from another
// org must reach the page too — fall back to their membership row.
async function appForUser(env, user, name) {
  const app = await env.DB.prepare(
    `SELECT apps.*, members.role AS my_role,
            (SELECT at.role FROM app_teams at JOIN team_members tm ON tm.team_id = at.team_id
              WHERE at.app_id = apps.id AND tm.email = ?1 ORDER BY (at.role = 'edit') DESC LIMIT 1) AS team_role,
            ${FOLDER_ROLE_SQL} AS folder_role
     FROM apps
     LEFT JOIN members ON members.app_id = apps.id AND members.email = ?1
     WHERE apps.deleted_at IS NULL AND apps.name = ?2 AND (apps.org = ?3 OR members.email IS NOT NULL
       OR EXISTS (SELECT 1 FROM app_teams at JOIN team_members tm ON tm.team_id = at.team_id
                   WHERE at.app_id = apps.id AND tm.email = ?1)
       OR ${FOLDER_ROLE_SQL} IS NOT NULL)
     ORDER BY (apps.org = ?3) DESC LIMIT 1`
  ).bind(user.email, name, user.org).first();
  if (!app) return null;
  app.canEdit = app.owner_email === user.email || app.my_role === 'edit' || app.team_role === 'edit' || app.folder_role === 'edit';
  app.canView = app.owner_email === user.email || !!app.my_role || !!app.team_role || !!app.folder_role || (app.visibility === 'domain' && app.org === user.org);
  return app;
}

async function apiAppGet(env, user, name, baseUrl) {
  const app = await appForUser(env, user, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!app.canView) return json({ error: 'no access', owner: app.owner_email, name: app.name }, 403);
  const { results: members } = await env.DB.prepare('SELECT email, role FROM members WHERE app_id = ? ORDER BY email').bind(app.id).all();
  const { results: teams } = await env.DB.prepare(
    `SELECT t.name, at.role, (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS count
     FROM app_teams at JOIN teams t ON t.id = at.team_id WHERE at.app_id = ? ORDER BY t.name`
  ).bind(app.id).all();
  const lastRun = await env.DB.prepare(
    'SELECT run_id AS runId, status, exit_code AS exitCode, started_by AS startedBy, started_at AS startedAt, finished_at AS finishedAt FROM runs WHERE app_id = ? ORDER BY id DESC LIMIT 1'
  ).bind(app.id).first();
  let lastOpened = null;
  try {
    lastOpened = await env.DB.prepare(
      "SELECT user AS email, ts FROM request_logs WHERE org = ? AND slug = ? AND user IS NOT NULL ORDER BY id DESC LIMIT 1"
    ).bind(app.org, app.name).first();
  } catch {} // request_logs ships with the request-logs feature branch — absent on fresh local DBs
  let nextAt = null;
  if (app.schedule && !app.schedule_paused) {
    for (const part of cronParts(app.schedule)) {
      try {
        const n = nextRun(parseCron(part), Date.now());
        nextAt = nextAt == null ? n : Math.min(nextAt, n);
      } catch { /* legacy bad cron — row shows without a next time */ }
    }
  }
  return json({
    name: app.name, org: app.org, kind: app.kind, visibility: app.visibility, owner_email: app.owner_email,
    runbook: app.runbook, schedule: app.schedule, schedule_paused: app.schedule_paused, nextRun: nextAt,
    deployed_at: app.deployed_at ?? null, created_at: app.created_at,
    repo_url: app.repo_url ?? null, repo_branch: app.repo_branch ?? null, repo_commit: app.repo_commit ?? null,
    repo_dirty: app.repo_dirty ?? null, repo_public: app.repo_public ?? null,
    url: `${baseUrl}/a/${app.org}/${app.name}/`,
    members, teams, lastRun: lastRun || null, lastOpened: lastOpened || null,
    inputs: app.inputs ? JSON.parse(app.inputs) : null, outputs: app.outputs ? JSON.parse(app.outputs) : null,
    canEdit: app.canEdit, email: user.email,
  });
}

// s3:// autocomplete for the Run form: list one level under the typed uri using
// the app's own [aws] role — the browser never sees AWS creds.
async function apiS3List(req, env, user, name) {
  const app = await appForUser(env, user, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!app.canView) return json({ error: 'no access' }, 403);
  if (!app.aws_role_arn) return json({ error: `${name} has no [aws] role` }, 400);
  const uri = new URL(req.url).searchParams.get('uri') || '';
  const m = uri.match(/^s3:\/\/([a-z0-9.-]{3,63})\/(.*)$/);
  try {
    const creds = await assumeRole(env, app.aws_role_arn, `small-s3ls-${user.org}`, app.org);
    if (!m) {
      // browse mode (empty field / partial bucket): ListBuckets if the role may,
      // else the buckets this app's past runs actually used
      let buckets = [];
      try {
        buckets = await s3Buckets(env, creds);
      } catch {
        const { results } = await env.DB.prepare(
          "SELECT inputs FROM runs WHERE app_id = ? AND inputs LIKE '%s3://%' ORDER BY id DESC LIMIT 50"
        ).bind(app.id).all();
        const seen = new Set();
        for (const r of results) for (const b of String(r.inputs).matchAll(/s3:\/\/([a-z0-9.-]{3,63})/g)) seen.add(b[1]);
        buckets = [...seen];
      }
      return json({ items: buckets.map((b) => ({ uri: `s3://${b}/`, dir: true })) });
    }
    const { dirs, files } = await s3List(env, creds, m[1], m[2]);
    return json({
      items: [
        ...dirs.map((p) => ({ uri: `s3://${m[1]}/${p}`, dir: true })),
        ...files.map((f) => ({ uri: `s3://${m[1]}/${f.key}`, size: f.size })),
      ],
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// Preview for the Run form: proxy one S3 object through the app's role.
// Images/pdf up to 5 MB, text-ish (json/txt/csv) up to 64 KB — a preview pipe,
// not a download service; anything else is refused.
async function apiS3Object(req, env, user, name) {
  const app = await appForUser(env, user, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!app.canView) return json({ error: 'no access' }, 403);
  if (!app.aws_role_arn) return json({ error: `${name} has no [aws] role` }, 400);
  const uri = new URL(req.url).searchParams.get('uri') || '';
  const m = uri.match(/^s3:\/\/([a-z0-9.-]{3,63})\/(.+)$/);
  const TYPES = {
    jpg: ['image/jpeg', 5e6], jpeg: ['image/jpeg', 5e6], png: ['image/png', 5e6],
    gif: ['image/gif', 5e6], webp: ['image/webp', 5e6], pdf: ['application/pdf', 5e6],
    json: ['application/json', 65536], txt: ['text/plain', 65536], csv: ['text/csv', 65536],
  };
  const [type, cap] = (m && TYPES[(m[2].match(/\.(\w+)$/) || [])[1]?.toLowerCase()]) || [];
  if (!type) return json({ error: 'no preview for this file type' }, 400);
  try {
    const creds = await assumeRole(env, app.aws_role_arn, `small-s3get-${user.org}`, app.org);
    const resp = await s3Get(env, creds, m[1], m[2]);
    if (!resp.ok) return json({ error: `s3 get failed (${resp.status})` }, 502);
    const size = Number(resp.headers.get('Content-Length') || 0);
    if (size > cap) return json({ error: 'too large to preview' }, 413);
    return new Response(resp.body, {
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=60' },
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function apiAppPatch(req, env, user, name) {
  const app = await appForUser(env, user, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!app.canEdit) return json({ error: 'only owner or edit members can change this app' }, 403);
  const { visibility, folder } = await req.json();
  if (visibility !== undefined) {
    if (!['domain', 'private'].includes(visibility)) return json({ error: 'visibility must be domain or private' }, 400);
    await env.DB.prepare('UPDATE apps SET visibility = ? WHERE id = ?').bind(visibility, app.id).run();
  }
  if (folder !== undefined) {
    if (folder !== null) {
      const f = await env.DB.prepare('SELECT id FROM folders WHERE id = ? AND org = ?').bind(folder, app.org).first();
      if (!f) return json({ error: 'no such folder' }, 404);
    }
    await env.DB.prepare('UPDATE apps SET folder_id = ? WHERE id = ?').bind(folder, app.id).run();
  }
  return json({ ok: true });
}

// Rename an app. The slug IS the URL — /apps/<name> and /a/<org>/<name>/ change
// for everyone; request-log history follows the slug. The next `small deploy`
// from a small.toml still carrying the old name creates a fresh app.
async function apiAppRename(req, env, user, name) {
  const app = await appForUser(env, user, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!app.canEdit) return json({ error: 'only owner or edit members can rename' }, 403);
  const next = String((await req.json()).name || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(next)) return json({ error: 'name must be [a-z0-9-]' }, 400);
  if (next === app.name) return json({ ok: true, name: next });
  const dupe = await env.DB.prepare('SELECT 1 FROM apps WHERE org = ? AND name = ?').bind(app.org, next).first();
  if (dupe) return json({ error: `${next} already exists (maybe in the Trash)` }, 400);
  await env.DB.prepare('UPDATE apps SET name = ? WHERE id = ?').bind(next, app.id).run();
  try {
    await env.DB.prepare('UPDATE request_logs SET slug = ? WHERE org = ? AND slug = ?').bind(next, app.org, app.name).run();
  } catch {} // request_logs ships with the request-logs feature branch — absent on fresh local DBs
  return json({ ok: true, name: next });
}

// Delete = Trash. The row is stamped deleted_at and disappears everywhere (appRow
// filters it); the Fly app stays until the 30-day purge so Restore is instant.
// Owner only — stricter than canEdit; edit members can change an app, not delete it.
async function apiAppDelete(env, user, name) {
  const app = await appForUser(env, user, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (app.owner_email !== user.email) return json({ error: 'only the owner can delete an app' }, 403);
  await env.DB.prepare("UPDATE apps SET deleted_at = datetime('now') WHERE id = ?").bind(app.id).run();
  return json({ ok: true });
}

async function apiTrash(env, user) {
  const { results } = await env.DB.prepare(
    'SELECT name, kind, owner_email, deleted_at FROM apps WHERE org = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC'
  ).bind(user.org).all();
  return json({ trash: results, email: user.email });
}

async function apiAppRestore(env, user, name) {
  const app = await env.DB.prepare('SELECT * FROM apps WHERE org = ? AND name = ? AND deleted_at IS NOT NULL')
    .bind(user.org, name).first();
  if (!app) return json({ error: `nothing named ${name} in the trash` }, 404);
  if (app.owner_email !== user.email) return json({ error: 'only the owner can restore an app' }, 403);
  await env.DB.prepare('UPDATE apps SET deleted_at = NULL WHERE id = ?').bind(app.id).run();
  return json({ ok: true });
}

// The 30-day purge: destroy the Fly app for real and drop every row.
async function purgeApp(env, app) {
  try {
    await destroyFlyApp(env, app.fly_app);
  } catch (e) {
    console.log(`purge: fly delete failed for ${app.fly_app}: ${e.message}`); // retried next tick
    return;
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM run_logs WHERE run_id IN (SELECT run_id FROM runs WHERE app_id = ?)').bind(app.id),
    env.DB.prepare('DELETE FROM runs WHERE app_id = ?').bind(app.id),
    env.DB.prepare('DELETE FROM members WHERE app_id = ?').bind(app.id),
    env.DB.prepare('DELETE FROM app_teams WHERE app_id = ?').bind(app.id),
    env.DB.prepare('DELETE FROM deploys WHERE app_id = ?').bind(app.id),
    env.DB.prepare('DELETE FROM request_logs WHERE org = ? AND slug = ?').bind(app.org, app.name),
    env.DB.prepare('DELETE FROM apps WHERE id = ?').bind(app.id),
  ]);
}

// ---------- Folders + teams (dashboard) ----------
// ponytail: any org member can create folders/teams and move apps — org-internal
// organization, not an access boundary; lock down if it ever bites.

async function apiFolderCreate(req, env, user) {
  const { name } = await req.json();
  if (!name || !/^[\w][\w &-]{0,40}$/.test(name)) return json({ error: 'folder name must be 1-40 word characters' }, 400);
  await env.DB.prepare('INSERT INTO folders (org, name) VALUES (?, ?) ON CONFLICT(org, name) DO NOTHING').bind(user.org, name.trim()).run();
  const f = await env.DB.prepare('SELECT id, name FROM folders WHERE org = ? AND name = ?').bind(user.org, name.trim()).first();
  return json({ ok: true, folder: f });
}

async function apiFolderRename(req, env, user, id) {
  const { name } = await req.json();
  if (!name || !/^[\w][\w &-]{0,40}$/.test(name)) return json({ error: 'folder name must be 1-40 word characters' }, 400);
  const dupe = await env.DB.prepare('SELECT 1 FROM folders WHERE org = ? AND name = ? AND id != ?').bind(user.org, name.trim(), id).first();
  if (dupe) return json({ error: `a folder named ${name.trim()} already exists` }, 400);
  await env.DB.prepare('UPDATE folders SET name = ? WHERE id = ? AND org = ?').bind(name.trim(), id, user.org).run();
  return json({ ok: true });
}

// Share/unshare a folder with a person or #team. UNIQUE can't dedupe NULL pairs,
// so it's delete-then-insert.
async function apiFolderShare(req, env, user, id) {
  const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ? AND org = ?').bind(id, user.org).first();
  if (!folder) return json({ error: 'no such folder' }, 404);
  const { email, team, role, remove } = await req.json();
  let teamId = null;
  if (team) {
    const t = await teamRow(env, user.org, team);
    if (!t) return json({ error: `no team #${teamName(team)} — create it first` }, 404);
    teamId = t.id;
  } else if (!email || !email.includes('@')) {
    return json({ error: 'an email or a #team is required' }, 400);
  }
  const em = teamId ? null : email.toLowerCase();
  await env.DB.prepare('DELETE FROM folder_shares WHERE folder_id = ? AND email IS ? AND team_id IS ?').bind(id, em, teamId).run();
  if (!remove) {
    await env.DB.prepare('INSERT INTO folder_shares (folder_id, email, team_id, role) VALUES (?, ?, ?, ?)')
      .bind(id, em, teamId, role === 'edit' ? 'edit' : 'view').run();
  }
  return json({ ok: true });
}

async function apiFolderDelete(env, user, id) {
  await env.DB.prepare('UPDATE apps SET folder_id = NULL WHERE folder_id = ? AND org = ?').bind(id, user.org).run();
  await env.DB.prepare('DELETE FROM folder_shares WHERE folder_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM folders WHERE id = ? AND org = ?').bind(id, user.org).run();
  return json({ ok: true });
}

async function apiTeams(env, user) {
  const { results } = await env.DB.prepare(
    'SELECT t.name, group_concat(tm.email) AS emails FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id WHERE t.org = ? GROUP BY t.id ORDER BY t.name'
  ).bind(user.org).all();
  return json({ teams: results.map((t) => ({ name: t.name, members: t.emails ? t.emails.split(',').sort() : [] })) });
}

async function apiTeamCreate(req, env, user) {
  const { name } = await req.json();
  const n = teamName(name);
  if (!/^[a-z0-9-]{1,30}$/.test(n)) return json({ error: 'team name must be #[a-z0-9-], max 30' }, 400);
  await env.DB.prepare('INSERT INTO teams (org, name) VALUES (?, ?) ON CONFLICT(org, name) DO NOTHING').bind(user.org, n).run();
  return json({ ok: true, team: n });
}

// The org's people pool: everyone added on /members, plus everyone already visible
// through shares (owners, direct members, group members). Groups may only contain these.
async function knownEmail(env, org, email) {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok WHERE EXISTS (SELECT 1 FROM org_members WHERE org = ?1 AND email = ?2)
        OR EXISTS (SELECT 1 FROM apps WHERE org = ?1 AND owner_email = ?2)
        OR EXISTS (SELECT 1 FROM members m JOIN apps a ON a.id = m.app_id WHERE a.org = ?1 AND m.email = ?2)
        OR EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.org = ?1 AND tm.email = ?2)`
  ).bind(org, email).first();
  return !!row;
}

async function apiOrgMembers(req, env, user) {
  if (req.method === 'POST') {
    const { email, remove } = await req.json();
    if (!email || !email.includes('@')) return json({ error: 'valid email required' }, 400);
    if (remove) {
      await env.DB.prepare('DELETE FROM org_members WHERE org = ? AND email = ?').bind(user.org, email.toLowerCase()).run();
    } else {
      await env.DB.prepare('INSERT INTO org_members (org, email) VALUES (?, ?) ON CONFLICT(org, email) DO NOTHING').bind(user.org, email.toLowerCase()).run();
    }
    return json({ ok: true });
  }
  const { results: added } = await env.DB.prepare('SELECT email FROM org_members WHERE org = ? ORDER BY email').bind(user.org).all();
  const { results: known } = await env.DB.prepare(
    `SELECT owner_email AS email FROM apps WHERE org = ?1
     UNION SELECT m.email FROM members m JOIN apps a ON a.id = m.app_id WHERE a.org = ?1
     UNION SELECT tm.email FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.org = ?1
     UNION SELECT email FROM org_members WHERE org = ?1
     ORDER BY email`
  ).bind(user.org).all();
  return json({ members: known.map((r) => r.email), added: added.map((r) => r.email) });
}

async function apiTeamMembers(req, env, user, name) {
  const t = await teamRow(env, user.org, name);
  if (!t) return json({ error: `no team #${teamName(name)}` }, 404);
  const { email, remove } = await req.json();
  if (!email || !email.includes('@')) return json({ error: 'valid email required' }, 400);
  if (remove) {
    await env.DB.prepare('DELETE FROM team_members WHERE team_id = ? AND email = ?').bind(t.id, email.toLowerCase()).run();
  } else {
    // groups only hold people the org already knows — add them on /members first
    if (!(await knownEmail(env, user.org, email.toLowerCase())))
      return json({ error: `${email.toLowerCase()} isn't in Members yet — add them there first` }, 400);
    await env.DB.prepare('INSERT INTO team_members (team_id, email) VALUES (?, ?) ON CONFLICT(team_id, email) DO NOTHING').bind(t.id, email.toLowerCase()).run();
  }
  return json({ ok: true });
}

async function apiTeamRename(req, env, user, name) {
  const t = await teamRow(env, user.org, name);
  if (!t) return json({ error: `no team #${teamName(name)}` }, 404);
  const next = teamName((await req.json()).name);
  if (!/^[a-z0-9-]{1,30}$/.test(next)) return json({ error: 'team name must be #[a-z0-9-], max 30' }, 400);
  if (await teamRow(env, user.org, next)) return json({ error: `#${next} already exists` }, 400);
  await env.DB.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(next, t.id).run();
  return json({ ok: true, team: next });
}

async function apiTeamDelete(env, user, name) {
  const t = await teamRow(env, user.org, name);
  if (!t) return json({ error: `no team #${teamName(name)}` }, 404);
  await env.DB.prepare('DELETE FROM app_teams WHERE team_id = ?').bind(t.id).run();
  await env.DB.prepare('DELETE FROM folder_shares WHERE team_id = ?').bind(t.id).run();
  await env.DB.prepare('DELETE FROM team_members WHERE team_id = ?').bind(t.id).run();
  await env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(t.id).run();
  return json({ ok: true });
}

async function apiUnshare(req, env, user) {
  const { app: name, email, team } = await req.json();
  const app = await appForUser(env, user, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!app.canEdit) return json({ error: 'only owner or edit members can unshare' }, 403);
  if (team) {
    const t = await teamRow(env, user.org, team);
    if (t) await env.DB.prepare('DELETE FROM app_teams WHERE app_id = ? AND team_id = ?').bind(app.id, t.id).run();
    return json({ ok: true });
  }
  await env.DB.prepare('DELETE FROM members WHERE app_id = ? AND email = ?').bind(app.id, String(email || '').toLowerCase()).run();
  return json({ ok: true });
}

async function apiRequestAccess(env, user, name, baseUrl) {
  const app = await appForUser(env, user, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (app.canView) return json({ ok: true, already: true });
  const sent = await sendEmail(
    env, app.owner_email,
    `${user.email} asked for access to ${app.name}`,
    `${user.email} is asking for access to ${app.name}.\n\nGrant it from ${baseUrl}/apps/${app.name} (Share), or run:\n  small share ${user.email} --app ${app.name}`
  );
  return json({ ok: true, sent });
}

// Dashboard runbook save (PUT). POST /api/runbook is the CLI's generate-from-bundle route.
async function apiRunbookSave(req, env, user) {
  const { app: name, runbook } = await req.json();
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canEdit(env, app, user.email))) return json({ error: 'only owner or edit members can edit the runbook' }, 403);
  if (typeof runbook !== 'string' || runbook.length > 500_000) return json({ error: 'runbook must be a string under 500KB' }, 400);
  await env.DB.prepare('UPDATE apps SET runbook = ? WHERE id = ?').bind(runbook, app.id).run();
  return json({ ok: true });
}

async function apiDeploys(env, user, slug) {
  const app = await appRow(env, user.org, slug);
  if (!app) return json({ error: `no app named ${slug}` }, 404);
  if (!(await canView(env, app, user.email))) return json({ error: 'no access' }, 403);
  const { results } = await env.DB.prepare(
    'SELECT repo_url, branch, commit_sha, dirty, deployed_by, deployed_at FROM deploys WHERE app_id = ? ORDER BY id DESC'
  ).bind(app.id).all();
  return json({ deploys: results, repoPublic: app.repo_public });
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
  await env.DB.prepare("UPDATE apps SET image = ?, deployed_at = datetime('now') WHERE id = ?").bind(image, app.id).run();
  return json({ ok: true });
}

// Shared by the manual /api/runs path and the cron tick. startedBy = email or "cron".
// Marks the run failed and rethrows if the machine won't start.
// inputs = validated scalar values (files as original filename); files = [{ name, file }] multipart parts.
async function startRun(env, app, startedBy, baseUrl, inputs = null, files = []) {
  const runId = 'r-' + randomHex(6);
  await env.DB.prepare('INSERT INTO runs (run_id, app_id, started_by, inputs) VALUES (?, ?, ?, ?)')
    .bind(runId, app.id, startedBy, inputs ? JSON.stringify(inputs) : null).run();
  const runToken = await sign({ t: 'run', run: runId, exp: now() + 6 * 3600 }, env.MASTER_KEY);
  // input files land in R2 before the machine starts; runner fetches them by stored name
  const fileNames = {};
  for (const { name, file } of files) {
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    fileNames[name] = name + ext;
    await env.RUNS.put(`runs/${runId}/inputs/${fileNames[name]}`, file);
  }
  try {
    // [aws] jobs: one STS mint at start — the 1h session outlives a normal run, and a
    // failed mint fails the run here, not mid-script.
    // ponytail: no refresh — a job running past 1h loses AWS; add re-mint when one exists.
    let aws = {};
    if (app.aws_role_arn) {
      const c = await assumeRole(env, app.aws_role_arn, `small-${app.org}-${app.name}`, app.org);
      aws = { AWS_ACCESS_KEY_ID: c.AccessKeyId, AWS_SECRET_ACCESS_KEY: c.SecretAccessKey, AWS_SESSION_TOKEN: c.SessionToken, AWS_REGION: env.AWS_REGION || 'us-east-1' };
    }
    const machine = await startMachine(env, app.fly_app, {
      image: app.image,
      auto_destroy: true,
      restart: { policy: 'no' },
      guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 2048 }, // ponytail: fixed size (2GB fits torch jobs); read memory from small.toml when one needs more
      env: {
        SMALL_RUN_ID: runId,
        SMALL_RUN_TOKEN: runToken,
        SMALL_USER: startedBy,
        SMALL_API: baseUrl,
        ...aws,
        ...(inputs ? { SMALL_RUN_INPUTS: JSON.stringify({ values: inputs, files: fileNames }) } : {}),
        ...(startedBy === 'cron' ? { SMALL_TRIGGER: 'cron' } : {}),
      },
    });
    await env.DB.prepare('UPDATE runs SET machine_id = ? WHERE run_id = ?').bind(machine.id, runId).run(); // the dashboard Stop button kills it
  } catch (e) {
    await env.DB.prepare("UPDATE runs SET status = 'failed', finished_at = datetime('now') WHERE run_id = ?").bind(runId).run();
    throw e;
  }
  return runId;
}

async function apiRunStart(req, env, user, baseUrl) {
  // Plain JSON without files; multipart when the CLI ships file inputs:
  // field "body" = the same JSON, one "input:<name>" part per file (docs/features/job-inputs.md).
  let name, inputs = null;
  const files = [];
  if ((req.headers.get('Content-Type') || '').includes('multipart/form-data')) {
    const form = await req.formData();
    ({ app: name, inputs = null } = JSON.parse(form.get('body') || '{}'));
    for (const [k, v] of form.entries()) {
      if (k.startsWith('input:') && typeof v === 'object') files.push({ name: k.slice(6), file: v });
    }
    if (files.length && !env.RUNS) return json({ error: 'control plane has no R2 bucket bound — create small-runs and redeploy the worker' }, 503);
    if (files.reduce((s, f) => s + f.file.size, 0) > 100 * 1024 * 1024) return json({ error: 'input files exceed the 100 MB per-run cap' }, 400);
  } else {
    ({ app: name, inputs = null } = await req.json());
  }
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canView(env, app, user.email))) return json({ error: 'no access' }, 403);
  if (app.kind !== 'job') return json({ error: `${name} is not a job — set kind = "job" in small.toml and redeploy` }, 400);
  if (!app.image) return json({ error: `no image for ${name} — run small deploy first` }, 409);
  if (!env.FLY_ORG_TOKEN && !env.FLY_API_TOKEN) return json({ error: 'control plane has no fly token configured' }, 503);
  try {
    return json({ runId: await startRun(env, app, user.email, baseUrl, inputs, files) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// A run row + access check for the outputs routes. Returns the row or a Response.
async function runForUser(env, user, runId) {
  const run = await env.DB.prepare(
    'SELECT runs.run_id, apps.id AS app_id, apps.org, apps.owner_email, apps.visibility FROM runs JOIN apps ON apps.id = runs.app_id WHERE runs.run_id = ?'
  ).bind(runId).first();
  if (!run || run.org !== user.org) return json({ error: `no run ${runId}` }, 404);
  if (!(await canView(env, { id: run.app_id, org: run.org, owner_email: run.owner_email, visibility: run.visibility }, user.email)))
    return json({ error: 'no access' }, 403);
  return run;
}

async function apiRunOutputsList(env, user, runId) {
  const run = await runForUser(env, user, runId);
  if (run instanceof Response) return run;
  if (!env.RUNS) return json({ outputs: [] });
  const prefix = `runs/${runId}/outputs/`;
  const listed = await env.RUNS.list({ prefix }); // ponytail: first 1000 outputs only — no run writes that many
  return json({ outputs: listed.objects.map((o) => ({ name: o.key.slice(prefix.length), size: o.size })) });
}

async function apiRunOutputGet(env, user, runId, name) {
  const run = await runForUser(env, user, runId);
  if (run instanceof Response) return run;
  const obj = env.RUNS && (await env.RUNS.get(`runs/${runId}/outputs/${name}`));
  if (!obj) return json({ error: `no output ${name} on ${runId}` }, 404);
  // Real types for what the dashboard renders inline (thumbnails, json/csv/txt);
  // octet-stream downloads the rest. No svg — inline svg on this origin is stored XSS.
  const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', json: 'application/json', csv: 'text/csv', txt: 'text/plain' };
  const type = TYPES[(name.match(/\.(\w+)$/) || [])[1]?.toLowerCase()] || 'application/octet-stream';
  return new Response(obj.body, { headers: { 'Content-Type': type, 'Content-Length': String(obj.size), 'X-Content-Type-Options': 'nosniff' } });
}

// ---------- runner-auth routes (per-run token, not CLI auth) ----------

async function runnerAuth(req, env, runId) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  const p = m && (await verify(m[1], env.MASTER_KEY));
  return !!p && p.t === 'run' && p.run === runId;
}

// runner.py fetches its input files at boot; the dashboard downloads them too,
// so a session cookie (or CLI token) with canView on the app also passes.
async function apiRunInputGet(req, env, runId, fname) {
  if (!(await runnerAuth(req, env, runId))) {
    let user = await cliAuth(req, env);
    if (!user) {
      const s = await sessionOf(req, env);
      if (s) user = { email: s.email, org: orgOf(s.email) };
    }
    if (!user) return json({ error: 'bad run token' }, 401);
    const run = await runForUser(env, user, runId);
    if (run instanceof Response) return run;
  }
  const obj = env.RUNS && (await env.RUNS.get(`runs/${runId}/inputs/${fname}`));
  if (!obj) return json({ error: `no input ${fname}` }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(obj.size) } });
}

// runner.py uploads everything in $SMALL_OUTPUTS here on exit, declared or not
async function apiRunOutputPut(req, env, runId, name) {
  if (!(await runnerAuth(req, env, runId))) return json({ error: 'bad run token' }, 401);
  if (!env.RUNS) return json({ error: 'control plane has no R2 bucket bound — create small-runs and redeploy the worker' }, 503);
  if (name.includes('..') || name.startsWith('/')) return json({ error: 'bad output name' }, 400);
  const listed = await env.RUNS.list({ prefix: `runs/${runId}/outputs/` });
  const used = listed.objects.reduce((s, o) => s + o.size, 0);
  const len = Number(req.headers.get('Content-Length') || 0);
  if (used + len > 100 * 1024 * 1024) return json({ error: 'outputs exceed the 100 MB per-run cap' }, 400);
  await env.RUNS.put(`runs/${runId}/outputs/${name}`, req.body);
  return json({ ok: true });
}

// Pause/resume a schedule, and (dashboard) set or remove one: `schedule` set/replaces
// (null removes). A later `small deploy` still wins — small.toml is the source of truth
// at deploy time, so a redeploy without `schedule = ...` clears a dashboard-set cron.
async function apiSchedulePause(req, env, user) {
  const { app: name, paused, schedule } = await req.json();
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canEdit(env, app, user.email))) return json({ error: 'no access' }, 403);
  if (schedule !== undefined) {
    if (app.kind !== 'job') return json({ error: 'only jobs can be scheduled' }, 400);
    let nextAt = null;
    for (const part of schedule ? cronParts(schedule) : []) {
      try {
        const n = nextRun(parseCron(part), Date.now());
        nextAt = nextAt == null ? n : Math.min(nextAt, n);
      } catch (e) {
        return json({ error: `bad schedule "${part}": ${e.message} — use 5-field cron like "0 9 * * 1-5"` }, 400);
      }
    }
    // setting a schedule unpauses it (that's the intent); removing clears the pause too
    await env.DB.prepare('UPDATE apps SET schedule = ?, schedule_paused = 0, last_scheduled_at = NULL WHERE id = ?')
      .bind(schedule || null, app.id).run();
    return json({ ok: true, schedule: schedule || null, paused: false, nextRun: nextAt });
  }
  if (!app.schedule) return json({ error: `${name} has no schedule — add schedule = "..." to small.toml and redeploy` }, 400);
  await env.DB.prepare('UPDATE apps SET schedule_paused = ? WHERE id = ?').bind(paused ? 1 : 0, app.id).run();
  return json({ ok: true, schedule: app.schedule, paused: !!paused });
}

// Stop button on a live run: kill the machine, mark the run. Same privilege as
// starting one (canView) — whoever can run a job can stop it.
async function apiRunStop(req, env, user, runId) {
  const run = await env.DB.prepare(
    'SELECT runs.status, runs.machine_id, apps.id AS app_id, apps.org, apps.owner_email, apps.visibility, apps.fly_app FROM runs JOIN apps ON apps.id = runs.app_id WHERE runs.run_id = ?'
  ).bind(runId).first();
  if (!run || run.org !== user.org) return json({ error: `no run ${runId}` }, 404);
  if (!(await canView(env, { id: run.app_id, org: run.org, owner_email: run.owner_email, visibility: run.visibility }, user.email)))
    return json({ error: 'no access' }, 403);
  if (run.status !== 'running') return json({ ok: true, status: run.status }); // already settled
  if (run.machine_id) {
    try {
      await destroyMachine(env, run.fly_app, run.machine_id);
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }
  await env.DB.prepare("UPDATE runs SET status = 'stopped', finished_at = datetime('now') WHERE run_id = ? AND status = 'running'").bind(runId).run();
  return json({ ok: true, status: 'stopped' });
}

async function apiRunsList(req, env, user) {
  await sweepStaleRuns(env);
  const name = new URL(req.url).searchParams.get('app');
  const app = await appRow(env, user.org, name);
  if (!app) return json({ error: `no app named ${name}` }, 404);
  if (!(await canView(env, app, user.email))) return json({ error: 'no access' }, 403);
  const { results } = await env.DB.prepare(
    'SELECT run_id, status, exit_code, started_by, started_at, finished_at, reason, inputs FROM runs WHERE app_id = ? ORDER BY id DESC'
  ).bind(app.id).all();
  return json({ runs: results.map((r) => ({ ...r, inputs: r.inputs ? JSON.parse(r.inputs) : null })) });
}

async function apiRunGet(req, env, user, runId) {
  const run = await env.DB.prepare(
    'SELECT runs.status, runs.exit_code, runs.started_by, runs.started_at, runs.finished_at, runs.inputs, apps.id AS app_id, apps.org, apps.owner_email, apps.visibility, apps.name AS app_name FROM runs JOIN apps ON apps.id = runs.app_id WHERE runs.run_id = ?'
  ).bind(runId).first();
  if (!run || run.org !== user.org) return json({ error: `no run ${runId}` }, 404);
  if (!(await canView(env, { id: run.app_id, org: run.org, owner_email: run.owner_email, visibility: run.visibility }, user.email)))
    return json({ error: 'no access' }, 403);
  const after = Number(new URL(req.url).searchParams.get('after') ?? -1);
  const { results } = await env.DB.prepare('SELECT seq, line FROM run_logs WHERE run_id = ? AND seq > ? ORDER BY seq').bind(runId, after).all();
  // Stored input files with sizes, so the run page can show "photo.jpg 2.1 MB ⬇".
  let inputFiles = [];
  if (env.RUNS && run.inputs) {
    const prefix = `runs/${runId}/inputs/`;
    const listed = await env.RUNS.list({ prefix });
    inputFiles = listed.objects.map((o) => ({ name: o.key.slice(prefix.length), size: o.size }));
  }
  return json({
    status: run.status,
    exitCode: run.exit_code,
    startedBy: run.started_by,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    app: run.app_name,
    inputs: run.inputs ? JSON.parse(run.inputs) : null,
    inputFiles,
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
    // AND status='running': a stop via the dashboard must not be overwritten by the dying runner's last post
    await env.DB.prepare("UPDATE runs SET status = ?, exit_code = ?, finished_at = datetime('now') WHERE run_id = ? AND status = 'running'")
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
  return html(
    `<div style="font-weight:600;color:#37352F">&#9679; small</div><h2>Sign in</h2><form method=post><input name=email type=email placeholder=you@company.com required autofocus><button>Email me a link</button></form><p style="font-size:14px">We’ll send a link. No password.</p>`
  );
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
        const runInput = path.match(/^\/api\/runs\/([\w-]+)\/inputs\/([^/]+)$/);
        if (runInput && req.method === 'GET') return await apiRunInputGet(req, env, runInput[1], decodeURIComponent(runInput[2])); // runner auth
        const runOutPost = path.match(/^\/api\/runs\/([\w-]+)\/outputs\/(.+)$/);
        if (runOutPost && req.method === 'POST') return await apiRunOutputPut(req, env, runOutPost[1], decodeURIComponent(runOutPost[2])); // runner auth
        const reqLog = path.match(/^\/api\/apps\/([a-z0-9-]+)\/request-log$/);
        if (reqLog && req.method === 'POST') return await apiRequestLogIngest(req, env, reqLog[1]); // guard auth, not CLI auth
        // CLI Bearer token or browser session cookie — the web dashboard is same-origin and rides the cookie.
        let user = await cliAuth(req, env);
        if (!user) {
          const s = await sessionOf(req, env);
          if (s) user = { email: s.email, org: orgOf(s.email) };
        }
        if (!user) return json({ error: 'run small login first' }, 401);
        if (path === '/api/deploy' && req.method === 'POST') return await apiDeploy(req, env, ctx, user, baseUrl);
        if (path === '/api/image' && req.method === 'POST') return await apiImage(req, env, user);
        if (path === '/api/runs' && req.method === 'POST') return await apiRunStart(req, env, user, baseUrl);
        if (path === '/api/runs' && req.method === 'GET') return await apiRunsList(req, env, user);
        const runGet = path.match(/^\/api\/runs\/([\w-]+)$/);
        if (runGet && req.method === 'GET') return await apiRunGet(req, env, user, runGet[1]);
        const runOutputs = path.match(/^\/api\/runs\/([\w-]+)\/outputs$/);
        if (runOutputs && req.method === 'GET') return await apiRunOutputsList(env, user, runOutputs[1]);
        const runOutput = path.match(/^\/api\/runs\/([\w-]+)\/outputs\/(.+)$/);
        if (runOutput && req.method === 'GET') return await apiRunOutputGet(env, user, runOutput[1], decodeURIComponent(runOutput[2]));
        if (path === '/api/schedule' && req.method === 'POST') return await apiSchedulePause(req, env, user);
        const runStop = path.match(/^\/api\/runs\/([\w-]+)\/stop$/);
        if (runStop && req.method === 'POST') return await apiRunStop(req, env, user, runStop[1]);
        if (path === '/api/share' && req.method === 'POST') return await apiShare(req, env, user);
        if (path === '/api/apps' && req.method === 'GET') return await apiApps(env, user, baseUrl);
        const deploysGet = path.match(/^\/api\/apps\/([a-z0-9-]+)\/deploys$/);
        if (deploysGet && req.method === 'GET') return await apiDeploys(env, user, deploysGet[1]);
        const reqAccess = path.match(/^\/api\/apps\/([a-z0-9-]+)\/request-access$/);
        if (reqAccess && req.method === 'POST') return await apiRequestAccess(env, user, reqAccess[1], baseUrl);
        const s3ListPath = path.match(/^\/api\/apps\/([a-z0-9-]+)\/s3-list$/);
        if (s3ListPath && req.method === 'GET') return await apiS3List(req, env, user, s3ListPath[1]);
        const s3ObjPath = path.match(/^\/api\/apps\/([a-z0-9-]+)\/s3-object$/);
        if (s3ObjPath && req.method === 'GET') return await apiS3Object(req, env, user, s3ObjPath[1]);
        const appPath = path.match(/^\/api\/apps\/([a-z0-9-]+)$/);
        if (appPath && req.method === 'GET') return await apiAppGet(env, user, appPath[1], baseUrl);
        if (appPath && req.method === 'PATCH') return await apiAppPatch(req, env, user, appPath[1]);
        if (appPath && req.method === 'DELETE') return await apiAppDelete(env, user, appPath[1]);
        if (path === '/api/trash' && req.method === 'GET') return await apiTrash(env, user);
        const restorePath = path.match(/^\/api\/apps\/([a-z0-9-]+)\/restore$/);
        if (restorePath && req.method === 'POST') return await apiAppRestore(env, user, restorePath[1]);
        const dupPath = path.match(/^\/api\/apps\/([a-z0-9-]+)\/duplicate$/);
        if (dupPath && req.method === 'POST') return await apiAppDuplicate(env, user, dupPath[1], baseUrl);
        const renPath = path.match(/^\/api\/apps\/([a-z0-9-]+)\/rename$/);
        if (renPath && req.method === 'POST') return await apiAppRename(req, env, user, renPath[1]);
        if (path === '/api/unshare' && req.method === 'POST') return await apiUnshare(req, env, user);
        if (path === '/api/folders' && req.method === 'POST') return await apiFolderCreate(req, env, user);
        const folderDel = path.match(/^\/api\/folders\/(\d+)\/delete$/);
        if (folderDel && req.method === 'POST') return await apiFolderDelete(env, user, Number(folderDel[1]));
        const folderRen = path.match(/^\/api\/folders\/(\d+)\/rename$/);
        if (folderRen && req.method === 'POST') return await apiFolderRename(req, env, user, Number(folderRen[1]));
        const folderShr = path.match(/^\/api\/folders\/(\d+)\/share$/);
        if (folderShr && req.method === 'POST') return await apiFolderShare(req, env, user, Number(folderShr[1]));
        if (path === '/api/teams' && req.method === 'GET') return await apiTeams(env, user);
        if (path === '/api/teams' && req.method === 'POST') return await apiTeamCreate(req, env, user);
        if (path === '/api/members' && (req.method === 'GET' || req.method === 'POST')) return await apiOrgMembers(req, env, user);
        const teamMembers = path.match(/^\/api\/teams\/([a-z0-9-]+)\/members$/);
        if (teamMembers && req.method === 'POST') return await apiTeamMembers(req, env, user, teamMembers[1]);
        const teamRen = path.match(/^\/api\/teams\/([a-z0-9-]+)\/rename$/);
        if (teamRen && req.method === 'POST') return await apiTeamRename(req, env, user, teamRen[1]);
        const teamDel = path.match(/^\/api\/teams\/([a-z0-9-]+)\/delete$/);
        if (teamDel && req.method === 'POST') return await apiTeamDelete(env, user, teamDel[1]);
        if (path === '/api/runbook' && req.method === 'PUT') return await apiRunbookSave(req, env, user);
        if (path === '/api/logs' && req.method === 'GET') return await apiLogs(req, env, user);
        if (path === '/api/request-logs' && req.method === 'GET') return await apiRequestLogs(req, env, user);
        if (path === '/api/review' && req.method === 'GET') return await apiReview(req, env, user);
        if (path === '/api/runbook' && req.method === 'POST') return await apiRunbook(req, env);
        if (path === '/api/review/run' && req.method === 'POST') return await apiReviewRun(req, env, user);
        return json({ error: 'no such endpoint' }, 404);
      }
      if (path === '/logout')
        return new Response(null, {
          status: 302,
          headers: { Location: '/login', 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
        });
      if (path === '/login') return await loginPage(req, env, baseUrl);
      if (path === '/auth') return await authRedirect(req, env);
      if (path === '/test/session' && req.method === 'POST') return await testSession(req, env);
      const m = path.match(/^\/a\/([a-z0-9-]+)\/([a-z0-9-]+)(\/.*)?$/);
      if (m) return await proxyApp(req, env, m[1], m[2], m[3] || '', baseUrl);
      // Web dashboard: built packages/web assets ride on this Worker so /api is same-origin.
      // Only dashboard paths delegate — everything else keeps the Worker's own pages/404.
      // SPA shell ships inside the worker (no-store) — workers.dev's asset edge cache
      // outlived deploys and served stale HTML/405s on the old /apps + /assets/* URLs.
      // /dash is a clean alias while the poisoned /apps cache entry ages out.
      if (path === '/apps' || path === '/dash' || path.startsWith('/apps/'))
        return new Response(SHELL, { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } });
      if (env.ASSETS && (path.startsWith('/static/') || path === '/favicon.svg')) return env.ASSETS.fetch(req);
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
      // Trash retention: 30 days, then the Fly app and every row go for good.
      const { results: expired } = await env.DB.prepare(
        "SELECT * FROM apps WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')"
      ).all();
      for (const app of expired) await purgeApp(env, app);
      return;
    }
    // Every-minute tick. scheduledTime is the tick's nominal minute even when
    // delivery is late; last_scheduled_at pins each fired minute so a duplicate
    // or late tick never double-fires.
    // ponytail: no catch-up after downtime — a missed minute is just missed.
    const tick = Math.floor(event.scheduledTime / 60000) * 60; // unix seconds, floored to the minute
    const { results } = await env.DB.prepare(
      "SELECT * FROM apps WHERE kind = 'job' AND schedule IS NOT NULL AND schedule_paused = 0 AND image IS NOT NULL AND deleted_at IS NULL"
    ).all();
    for (const app of results) {
      // schedule may hold several crons ("0 9 * * 1-5; 0 14 * * 6") — due if ANY matches.
      // One fire per app per minute regardless of how many crons agree (last_scheduled_at pin).
      const due = cronParts(app.schedule).some((c) => {
        try {
          return matches(parseCron(c), new Date(tick * 1000));
        } catch {
          return false; // validated when set; a bad legacy part must not kill the whole tick
        }
      });
      if (!due || (app.last_scheduled_at || 0) >= tick) continue;
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
