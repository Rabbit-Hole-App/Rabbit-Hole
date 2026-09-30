import { assumeRole } from './aws.js';
import { awsCall, platformCredentials, templateUrl } from './byoc-aws.js';
import { makeTemplate } from '../../byoc/template.mjs';
import { s3Read, accessMap } from '../../cli/lib/byoc-s3.js';
import { devIdentity } from './dev-forwarding.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const random = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((v) => v.toString(16).padStart(2, '0')).join('');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const view = (c, email) => c && ({ id: c.id, job_name: c.job_name, org: c.org, owner_email: c.owner_email,
  account_id: c.account_id, region: c.region, state: c.state, api_url: c.api_url, can_deploy: email === c.owner_email });

async function bodyOf(req, keys) {
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) fail('Expected JSON');
  const text = await req.text();
  if (text.length > 2048) fail('Only connection metadata is accepted', 413);
  let body;
  try { body = JSON.parse(text); } catch { fail('Invalid JSON'); }
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some((k) => !keys.includes(k))) fail('Only connection metadata is accepted');
  return body;
}

// The side-effect-free identity read (dev-forwarding.js); GET /api/apps would sweep production runs.
async function identity(req, env) {
  const user = await devIdentity(req, env);
  if (user instanceof Response) fail(user.status === 401 ? 'Sign in to small first' : 'Workspace identity unavailable', user.status);
  return user;
}

// A hosted app of this name the caller can see: production GET /api/apps/<name>, a read-only lookup.
async function hostedApp(req, env, name) {
  const url = new URL(req.url); url.pathname = `/api/apps/${encodeURIComponent(name)}`; url.search = '';
  return (await env.CONTROL_PLANE.fetch(new Request(url, { headers: req.headers, redirect: 'manual' }))).status !== 404;
}

async function invoke(env, c, operation, email) {
  const creds = await assumeRole(env, c.role_arn, 'small-byoc-connect', c.external_id);
  const response = await awsCall(creds, c.region, 'lambda', `/2015-03-31/functions/${c.signer_arn}/invocations`,
    JSON.stringify({ operation, org: c.org, installation_id: c.id, ...(email ? { email } : {}) }));
  const data = await response.json();
  if (response.headers.get('x-amz-function-error') || data.error) fail('AWS connection verification failed', 502);
  return { data, creds };
}

function validateInfo(c, info) {
  if (info.installation_id !== c.id || info.org !== c.org || info.owner !== c.owner_email || info.account_id !== c.account_id ||
      info.region !== c.region || info.job_name !== c.job_name ||
      !new RegExp(`^https://[a-z0-9]{20,64}\\.lambda-url\\.${c.region}\\.on\\.aws/$`).test(info.api_url)) fail('AWS installation does not match this connection', 403);
}

async function accessState(env, c) {
  const creds = await assumeRole(env, c.role_arn, 'small-byoc-connect', c.external_id);
  const response = await awsCall(creds, c.region, 'cloudformation', '/', new URLSearchParams({
    Action: 'DescribeStacks', Version: '2010-05-15', StackName: c.stack_id,
  }).toString(), { contentType: 'application/x-www-form-urlencoded' });
  const status = (await response.text()).match(/<StackStatus>([A-Z_]+)<\/StackStatus>/)?.[1];
  // Read installed metadata after stack status, including after a rollback.
  const stable = ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(status);
  const { data } = await invoke(env, c, 'info');
  validateInfo(c, data);
  const approved = accessMap(data.s3_access ?? {});
  let pending = await env.BYOC_DB.prepare('SELECT * FROM access_requests WHERE connection_id=?').bind(c.id).first();
  if (pending) {
    const base = JSON.parse(pending.base_access), desired = { ...base };
    if (pending.s3_read) desired[pending.app_name] = pending.s3_read; else delete desired[pending.app_name];
    const same = (a, b) => JSON.stringify(accessMap(a)) === JSON.stringify(accessMap(b));
    if (stable && !data.applying && same(approved, desired)) {
      await env.BYOC_DB.prepare('DELETE FROM access_requests WHERE connection_id=? AND id=?').bind(c.id, pending.id).run();
      pending = null;
    } else pending = { ...pending, status: !stable ? 'updating' : pending.template_key.startsWith('applying:') || data.applying ? 'applying' : same(approved, base) ? 'pending' : 'stale' };
  }
  return { approved, pending, stable, approval_enabled: data.access_approval === true, stack_status: status || 'UNKNOWN' };
}

const accessView = (state) => ({ approved: state.approved, stable: state.stable, stack_status: state.stack_status,
  approval_enabled: state.approval_enabled,
  pending: state.pending && { id: state.pending.id, app_name: state.pending.app_name, s3_read: state.pending.s3_read, status: state.pending.status } });

export async function byocFetch(req, env, { apiCode, signerCode, permissionsCode, grantsCode } = {}) {
  try {
    if (!env.BYOC_DB || !env.AWS_ACCESS_KEY_ID) return json({ error: 'AWS preview is not configured' }, 503);
    const path = new URL(req.url).pathname;
    if (path === '/api/byoc/register' && req.method === 'POST') {
      const b = await bodyOf(req, ['installation_id', 'account_id', 'role_arn', 'signer_arn', 'stack_id']);
      if (!/^[a-f0-9]{32}$/.test(b.installation_id || '')) fail('Invalid installation');
      const c = await env.BYOC_DB.prepare('SELECT * FROM connections WHERE id = ?').bind(b.installation_id).first();
      if (!c || !['pending', 'installed', 'connected'].includes(c.state)) fail('No pending installation', 409);
      const label = 'small-byoc-' + c.id.slice(0, 12);
      if (b.account_id !== c.account_id || b.role_arn !== `arn:aws:iam::${c.account_id}:role/${label}-connection` ||
          b.signer_arn !== `arn:aws:lambda:${c.region}:${c.account_id}:function:${label}-signer` ||
          !new RegExp(`^arn:aws:cloudformation:${c.region}:${c.account_id}:stack/${label}/[a-f0-9-]+$`).test(b.stack_id || '')) fail('Unexpected AWS installation', 403);
      if (c.state === 'connected') {
        // CloudFormation may refresh its custom resource during a permission
        // update. Matching installed metadata is an idempotent no-op, not a grant.
        if (b.role_arn !== c.role_arn || b.signer_arn !== c.signer_arn || b.stack_id !== c.stack_id) fail('Unexpected AWS installation', 403);
        return json({ ok: true });
      }
      // Registration is an untrusted readiness hint. Verify IAM and stack ownership
      // only on the installer's authenticated connect request, after IAM propagates.
      await env.BYOC_DB.prepare("UPDATE connections SET state='installed', role_arn=?, signer_arn=?, stack_id=? WHERE id=? AND state IN ('pending', 'installed')")
        .bind(b.role_arn, b.signer_arn, b.stack_id, c.id).run();
      return json({ ok: true });
    }
    const user = await identity(req, env);
    let c = await env.BYOC_DB.prepare('SELECT * FROM connections WHERE org = ?').bind(user.org).first();
    if (path === '/api/byoc/connection' && req.method === 'GET') return json({ connection: view(c, user.email) });
    if (path === '/api/byoc/install' && req.method === 'POST') {
      const b = await bodyOf(req, ['job_name', 'account_id']);
      if (c && c.owner_email !== user.email) fail('Only the installer can manage this connection', 403);
      if (c?.state === 'connected') fail('This workspace already has an AWS connection', 409);
      if (c?.state === 'disconnected') fail('Use Connect AWS to reconnect the existing installation', 409);
      const accountId = b.account_id ?? c?.account_id, jobName = b.job_name ?? c?.job_name;
      if (typeof accountId !== 'string' || !/^\d{12}$/.test(accountId)) fail('Enter your 12-digit AWS account ID');
      if (typeof jobName !== 'string' || !/^[a-z0-9-]{1,40}$/.test(jobName)) fail('Use an app name with 1-40 lowercase letters, numbers, and hyphens');
      if (env.BYOC_REGION !== 'us-east-1') fail('The AWS preview supports us-east-1 only', 503);
      if (c && (accountId !== c.account_id || jobName !== c.job_name)) {
        if (c.state !== 'pending' || c.role_arn) fail('This installation is already prepared; finish connecting with its existing account and app name', 409);
        const next = { ...c, id: random(16), external_id: random(32), job_name: jobName, account_id: accountId };
        // A corrected account gets a fresh installation identity. A callback from
        // the previous template must never bind that old account to this workspace.
        const changed = await env.BYOC_DB.prepare("UPDATE connections SET id=?, external_id=?, job_name=?, account_id=? WHERE id=? AND state='pending' AND role_arn IS NULL")
          .bind(next.id, next.external_id, next.job_name, next.account_id, c.id).run();
        if (changed.meta.changes !== 1) fail('Installation changed; reload before continuing', 409);
        c = next;
      }
      if (!c) {
        c = { id: random(16), external_id: random(32), org: user.org, owner_email: user.email, job_name: jobName,
          account_id: accountId, region: env.BYOC_REGION, state: 'pending' };
        const inserted = await env.BYOC_DB.prepare('INSERT INTO connections (id, org, owner_email, job_name, external_id, account_id, region) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(org) DO NOTHING')
          .bind(c.id, c.org, c.owner_email, c.job_name, c.external_id, c.account_id, c.region).run();
        if (inserted.meta.changes !== 1) fail('This workspace already has an AWS setup; reload to continue it', 409);
      }
      const template = makeTemplate({ apiCode, signerCode, permissionsCode, grantsCode, installationId: c.id, externalId: c.external_id,
        workspace: c.org, owner: c.owner_email, jobName: c.job_name, platformPrincipal: env.BYOC_PRINCIPAL_ARN, platformOrigin: new URL(req.url).origin });
      const key = `templates/${c.id}.json`;
      await awsCall(platformCredentials(env), c.region, 's3', '/' + key, JSON.stringify(template), {
        method: 'PUT', host: `${env.BYOC_TEMPLATE_BUCKET}.s3.${c.region}.amazonaws.com`, contentType: 'application/json',
      });
      const url = await templateUrl(env, key);
      const launch = `https://${c.region}.console.aws.amazon.com/cloudformation/home?region=${c.region}#/stacks/create/review?templateURL=${encodeURIComponent(url)}&stackName=small-byoc-${c.id.slice(0, 12)}`;
      return json({ connection: view(c, user.email), install_url: launch, template_url: url });
    }
    if (!c) fail('Connect AWS in the dev dashboard first', 404);
    if (path.startsWith('/api/byoc/access')) {
      if (c.state !== 'connected') fail('Finish connecting AWS first', 409);
      if (req.method !== 'GET' && user.email !== c.owner_email) fail('Only the installer can manage AWS permissions', 403);
      let b;
      if (req.method === 'POST') b = await bodyOf(req, path === '/api/byoc/access' ? ['app_name', 's3_read'] : path.endsWith('/upgrade') ? [] : ['request_id']);
      if (path === '/api/byoc/access' && req.method === 'POST') {
        if (!/^[a-z0-9-]{1,40}$/.test(b.app_name || '') || typeof b.app_name !== 'string') fail('Invalid app name');
        if (!Object.hasOwn(b, 's3_read')) fail('Declare the requested S3 folder, or null for no S3 access');
        try { b.s3_read = s3Read(b.s3_read); } catch (error) { fail(error.message); }
        if (await hostedApp(req, env, b.app_name)) fail('This name belongs to a hosted app', 409);
      }
      const state = await accessState(env, c);
      if (path === '/api/byoc/access' && req.method === 'GET') return json(accessView(state));
      if (path === '/api/byoc/access/upgrade' && req.method === 'POST') {
        if (!state.stable || state.pending?.status === 'applying') fail('AWS is updating; wait for it to finish', 409);
        if (state.approval_enabled) fail('This connection is already upgraded', 409);
        if (!permissionsCode) fail('Connection upgrade is unavailable', 503);
        // Preserve all installed grants. The upgrade itself approves no new folder.
        const template = makeTemplate({ apiCode, signerCode, permissionsCode, grantsCode, installationId: c.id, externalId: c.external_id,
          workspace: c.org, owner: c.owner_email, jobName: c.job_name, platformPrincipal: env.BYOC_PRINCIPAL_ARN,
          platformOrigin: new URL(req.url).origin, s3Access: state.approved });
        const key = `templates/${c.id}/upgrade-${random(16)}.json`;
        await awsCall(platformCredentials(env), c.region, 's3', '/' + key, JSON.stringify(template), {
          method: 'PUT', host: `${env.BYOC_TEMPLATE_BUCKET}.s3.${c.region}.amazonaws.com`, contentType: 'application/json',
        });
        const url = await templateUrl(env, key);
        return json({ template_url: url, update_url: `https://${c.region}.console.aws.amazon.com/cloudformation/home?region=${c.region}#/stacks/update/template?stackId=${encodeURIComponent(c.stack_id)}&templateURL=${encodeURIComponent(url)}` });
      }
      if (path === '/api/byoc/access' && req.method === 'POST') {
        if (!state.stable) fail('AWS is updating this installation; retry deploy when it finishes', 409);
        if (state.pending?.status === 'applying') fail('A permission update is applying; finish it in Settings > Connections > AWS', 409);
        if ((state.approved[b.app_name] ?? null) === b.s3_read) return json({ status: 'approved', app_name: b.app_name, s3_read: b.s3_read });
        if (state.pending) {
          if (state.pending.app_name !== b.app_name || state.pending.s3_read !== b.s3_read || state.pending.status === 'stale') {
            fail('Another permission change is pending; finish or dismiss it in Settings > Connections > AWS', 409);
          }
        } else {
          const desired = { ...state.approved };
          if (b.s3_read) desired[b.app_name] = b.s3_read; else delete desired[b.app_name];
          let template;
          try {
            accessMap(desired);
            if (!state.approval_enabled) template = makeTemplate({ apiCode, signerCode, permissionsCode, grantsCode, installationId: c.id, externalId: c.external_id,
              workspace: c.org, owner: c.owner_email, jobName: c.job_name, platformPrincipal: env.BYOC_PRINCIPAL_ARN,
              platformOrigin: new URL(req.url).origin, s3Access: permissionsCode ? state.approved : desired });
          } catch (error) { fail(error.message); }
          const id = random(16), key = template ? `templates/${c.id}/${id}.json` : '';
          const inserted = await env.BYOC_DB.prepare('INSERT INTO access_requests (connection_id, id, app_name, s3_read, base_access, template_key) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(connection_id) DO NOTHING')
            .bind(c.id, id, b.app_name, b.s3_read, JSON.stringify(state.approved), key).run();
          if (inserted.meta.changes !== 1) fail('Another permission change was just prepared; retry deploy', 409);
          try {
            if (template) await awsCall(platformCredentials(env), c.region, 's3', '/' + key, JSON.stringify(template), {
              method: 'PUT', host: `${env.BYOC_TEMPLATE_BUCKET}.s3.${c.region}.amazonaws.com`, contentType: 'application/json',
            });
          } catch (error) {
            await env.BYOC_DB.prepare('DELETE FROM access_requests WHERE connection_id=? AND id=?').bind(c.id, id).run();
            throw error;
          }
          state.pending = { id };
        }
        return json({ status: 'pending', request_id: state.pending.id, app_name: b.app_name, s3_read: b.s3_read, dashboard_url: new URL('/apps', req.url).href });
      }
      if (path === '/api/byoc/access/approve' && req.method === 'POST') {
        if (!state.approval_enabled) fail('Upgrade this AWS connection once before approving in Small', 409);
        if (!state.pending || b.request_id !== state.pending.id) fail('Permission request changed; refresh and try again', 409);
        if (!state.stable || state.pending.status === 'stale') fail('AWS permissions changed or are updating; refresh before approving', 409);
        const p = state.pending;
        // Claim this exact row before AWS changes. Cancel cannot race an approval.
        const claimed = await env.BYOC_DB.prepare('UPDATE access_requests SET template_key=? WHERE connection_id=? AND id=? AND template_key=?')
          .bind('applying:' + p.id, c.id, p.id, p.template_key).run();
        if (claimed.meta.changes !== 1) fail('Permission request changed; refresh and try again', 409);
        const creds = await assumeRole(env, c.role_arn, 'small-byoc-access', c.external_id);
        const arn = `arn:aws:lambda:${c.region}:${c.account_id}:function:small-byoc-${c.id.slice(0, 12)}-access`;
        const response = await awsCall(creds, c.region, 'lambda', `/2015-03-31/functions/${arn}/invocations`, JSON.stringify({
          installation_id: c.id, org: c.org, email: user.email, request_id: p.id, app_name: p.app_name,
          s3_read: p.s3_read, previous_s3_read: JSON.parse(p.base_access)[p.app_name] ?? null,
        }));
        const result = await response.json();
        if (response.headers.get('x-amz-function-error') || !result.ok) {
          if ([400, 403, 409].includes(result.status)) await env.BYOC_DB.prepare('UPDATE access_requests SET template_key=? WHERE connection_id=? AND id=? AND template_key=?')
            .bind('', c.id, p.id, 'applying:' + p.id).run();
          fail(result.error || 'AWS approval did not finish; retry the same approval', result.status || 502);
        }
        return json(accessView(await accessState(env, c)));
      }
      if (['/api/byoc/access/open', '/api/byoc/access/dismiss'].includes(path) && req.method === 'POST') {
        if (!state.pending || b.request_id !== state.pending.id) fail('Permission request changed; refresh and try again', 409);
        if (!state.stable || state.pending.status === 'applying') fail('AWS is updating; wait for it to finish', 409);
        if (path.endsWith('/dismiss')) {
          const deleted = await env.BYOC_DB.prepare("DELETE FROM access_requests WHERE connection_id=? AND id=? AND template_key NOT LIKE 'applying:%'").bind(c.id, b.request_id).run();
          if (deleted.meta.changes !== 1) fail('Approval has started; refresh before continuing', 409);
          return json({ ok: true });
        }
        if (state.pending.status === 'stale') fail('AWS permissions changed; dismiss this request and retry deploy', 409);
        if (state.approval_enabled) fail('Approve this request in Small', 409);
        const url = await templateUrl(env, state.pending.template_key);
        const launch = `https://${c.region}.console.aws.amazon.com/cloudformation/home?region=${c.region}#/stacks/update/template?stackId=${encodeURIComponent(c.stack_id)}&templateURL=${encodeURIComponent(url)}`;
        return json({ update_url: launch, template_url: url });
      }
      return json({ error: 'No such permission operation' }, 404);
    }
    if (path === '/api/byoc/disconnect' && req.method === 'POST') {
      await bodyOf(req, []);
      if (user.email !== c.owner_email) fail('Only the installer can disconnect AWS', 403);
      if (!['connected', 'disconnected'].includes(c.state)) fail('AWS is not connected', 409);
      // Retain the installation for reconnecting. Existing short-lived grants
      // expire normally; no AWS resources or customer data are changed.
      await env.BYOC_DB.prepare("UPDATE connections SET state='disconnected' WHERE id=? AND org=? AND owner_email=?")
        .bind(c.id, c.org, user.email).run();
      return json({ connection: view({ ...c, state: 'disconnected' }, user.email) });
    }
    if (path === '/api/byoc/connect' && req.method === 'POST') {
      await bodyOf(req, []);
      if (user.email !== c.owner_email) fail('Only the installer can connect AWS', 403);
      if (!c.role_arn) fail('AWS is still installing', 409);
      const { data, creds } = await invoke(env, c, 'info');
      validateInfo(c, data);
      const response = await awsCall(creds, c.region, 'cloudformation', '/', new URLSearchParams({ Action: 'DescribeStacks', Version: '2010-05-15', StackName: c.stack_id }).toString(), { contentType: 'application/x-www-form-urlencoded' });
      const xml = await response.text();
      if (!/<StackStatus>(CREATE_COMPLETE|UPDATE_COMPLETE)<\/StackStatus>/.test(xml)) fail('AWS is still installing; try again shortly', 409);
      await env.BYOC_DB.prepare("UPDATE connections SET state='connected', api_url=? WHERE id=?").bind(data.api_url, c.id).run();
      return json({ connection: view({ ...c, state: 'connected', api_url: data.api_url }, user.email) });
    }
    if (path === '/api/byoc/grant' && req.method === 'POST') {
      await bodyOf(req, []);
      if (c.state !== 'connected') fail('Finish connecting AWS first', 409);
      const { data } = await invoke(env, c, 'grant', user.email);
      if (data.api_url !== c.api_url || typeof data.token !== 'string') fail('Invalid AWS access grant', 502);
      return json(data);
    }
    return json({ error: 'No such connection operation' }, 404);
  } catch (error) {
    if (!error.status) console.error('BYOC metadata operation failed', error.name, error.stack?.split('\n').slice(1, 3).join('\n'));
    return json({ error: error.status ? error.message : 'AWS connection operation failed; check the installation and try again' }, error.status || 502);
  }
}
