import { assumeRole } from './aws.js';
import { awsCall, platformCredentials, templateUrl } from './byoc-aws.js';
import { makeTemplate } from '../../byoc/template.mjs';

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

async function identity(req, env) {
  const headers = new Headers();
  for (const k of ['cookie', 'authorization', 'x-small-workspace']) if (req.headers.has(k)) headers.set(k, req.headers.get(k));
  const result = await env.CONTROL_PLANE.fetch(new Request(new URL('/api/apps', req.url), { headers }));
  if (!result.ok) fail('Sign in to small first', result.status === 401 ? 401 : 403);
  const user = await result.json();
  if (!user.org || !user.email) fail('Workspace identity unavailable', 401);
  return user;
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

export async function byocFetch(req, env, { apiCode, signerCode } = {}) {
  try {
    if (!env.BYOC_DB || !env.AWS_ACCESS_KEY_ID) return json({ error: 'AWS preview is not configured' }, 503);
    const path = new URL(req.url).pathname;
    if (path === '/api/byoc/register' && req.method === 'POST') {
      const b = await bodyOf(req, ['installation_id', 'account_id', 'role_arn', 'signer_arn', 'stack_id']);
      if (!/^[a-f0-9]{32}$/.test(b.installation_id || '')) fail('Invalid installation');
      const c = await env.BYOC_DB.prepare('SELECT * FROM connections WHERE id = ?').bind(b.installation_id).first();
      if (!c || !['pending', 'installed'].includes(c.state)) fail('No pending installation', 409);
      const label = 'small-byoc-' + c.id.slice(0, 12);
      if (b.account_id !== c.account_id || b.role_arn !== `arn:aws:iam::${c.account_id}:role/${label}-connection` ||
          b.signer_arn !== `arn:aws:lambda:${c.region}:${c.account_id}:function:${label}-signer` ||
          !new RegExp(`^arn:aws:cloudformation:${c.region}:${c.account_id}:stack/${label}/[a-f0-9-]+$`).test(b.stack_id || '')) fail('Unexpected AWS installation', 403);
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
      const template = makeTemplate({ apiCode, signerCode, installationId: c.id, externalId: c.external_id,
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
