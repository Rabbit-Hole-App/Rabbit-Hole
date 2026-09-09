import { api } from './api.js';
import { createAwsClient } from './byoc-client.js';

// App names come directly from customer AWS. Job content stays in the browser
// and customer account when the normal app/run UI opens it.
export function withAwsApp(data, connection, jobs = [{ name: connection?.job_name }]) {
  if (!connection || connection.state !== 'connected' || connection.org !== data.org) return data;
  const names = new Set(data.apps.map((app) => app.name)), apps = [...data.apps];
  let awsError;
  for (const { name } of jobs) {
    if (!/^[a-z0-9-]{1,40}$/.test(name)) { awsError = 'AWS returned an invalid app name.'; continue; }
    if (names.has(name)) { awsError = 'The AWS job name conflicts with an existing app: ' + name; continue; }
    names.add(name);
    apps.push({
      name, org: connection.org, orgName: data.orgName, email: data.email,
      owner_email: connection.owner_email, kind: 'job', visibility: 'domain', hosting: 'aws',
      canEdit: false, canDeploy: connection.can_deploy, members: [], aws_connection: connection,
      url: '/apps/' + name,
    });
  }
  return { ...data, apps: apps.length === data.apps.length ? data.apps : apps, ...(awsError ? { awsError } : {}) };
}

export async function loadApps() {
  const data = await api('/api/apps');
  if (import.meta.env?.VITE_BYOC_DEV !== 'true') return data;
  try {
    const { connection } = await api('/api/byoc/connection');
    if (!connection || connection.state !== 'connected' || connection.org !== data.org) return data;
    const { apps } = await awsClient(connection)('/apps');
    return withAwsApp(data, connection, apps);
  } catch (error) { return { ...data, awsError: 'Could not load AWS apps: ' + error.message }; }
}

const utc = (value) => value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : null;
const runRow = (run) => ({ ...run, status: ['starting', 'running'].includes(run.status) ? 'running' : run.status,
  started_at: utc(run.started_at), finished_at: utc(run.finished_at) });

// Adapt customer AWS responses to the existing RunForm / RunsDb / RunView contract.
// Unknown operations fail here; they must never fall back to hosted endpoints.
export function createAwsRunApi(client, connection, name = connection.job_name) {
  const aws = (path, options) => client('/apps/' + encodeURIComponent(name) + path, options);
  return async (path, { method = 'GET', body } = {}) => {
    const url = new URL(path, 'https://small.invalid');
    if (url.origin !== 'https://small.invalid') throw new Error('Invalid app request');
    const data = typeof body === 'string' ? JSON.parse(body) : body || {};
    if (method === 'GET' && url.pathname === '/api/apps/' + name) {
      const job = await aws('/job');
      return { inputs: job.deployment?.inputs || {}, outputs: {}, deployment: job.deployment,
        deployed_at: utc(job.deployment?.created_at) };
    }
    if (url.pathname === '/api/runs') {
      if (method === 'POST') {
        if (data.app !== name || Object.keys(data).some((k) => !['app', 'inputs'].includes(k))) throw new Error('Invalid AWS run request');
        const run = await aws('/runs', { method, body: { inputs: data.inputs || {} } });
        return { runId: run.run_id };
      }
      if (method === 'GET' && url.searchParams.get('app') === name) {
        return { runs: (await aws('/runs')).runs.map(runRow) };
      }
    }
    const match = url.pathname.match(/^\/api\/runs\/(r-\d{13}-[a-f0-9]{12})(\/outputs)?$/);
    if (match && method === 'GET') {
      const [, id, outputs] = match;
      if (outputs) return aws('/runs/' + id + '/outputs');
      const run = runRow(await aws('/runs/' + id));
      const after = url.searchParams.get('after');
      const log = await aws('/runs/' + id + '/logs' + (after && !['-1', 'null'].includes(after) ? '?cursor=' + encodeURIComponent(after) : ''));
      return { runId: id, status: run.status, exitCode: run.exit_code, inputs: run.inputs, inputFiles: [],
        startedAt: run.started_at, finishedAt: run.finished_at, startedBy: run.started_by,
        lines: log.lines.map((line) => line.line), lineTs: log.lines.map((line) => new Date(line.timestamp).toISOString()),
        cursor: log.cursor, hasMore: log.lines.length === 200 };
    }
    throw new Error('This action is not available for AWS jobs yet');
  };
}

const clients = new WeakMap();
function awsClient(connection) {
  if (!clients.has(connection)) clients.set(connection, {
    aws: createAwsClient(() => api('/api/byoc/grant', { method: 'POST', body: '{}' }), connection.api_url),
    apps: new Map(),
  });
  return clients.get(connection).aws;
}

export function appApi(app) {
  if (app?.hosting !== 'aws') return api;
  const connection = app.aws_connection;
  const aws = awsClient(connection), { apps } = clients.get(connection);
  if (!apps.has(app.name)) apps.set(app.name, createAwsRunApi(aws, connection, app.name));
  return apps.get(app.name);
}

export async function loadApp(slug, catalogApp) {
  const detail = await appApi(catalogApp)('/api/apps/' + slug);
  return catalogApp?.hosting === 'aws' ? { ...catalogApp, ...detail } : detail;
}
