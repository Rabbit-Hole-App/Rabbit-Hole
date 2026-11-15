// packages/control-plane/src/learn-rehearsal.js
// Rehearsal of a connected repository (rehearsal-runtime spec section 9; contracts: packages/rehearsal-runtime/schemas).
// The controller (packages/rehearsal-runtime/server.py) runs one job per (app, commit, hardware); this module starts it, follows it
// and keeps its record. Once per repository and commit: the record lives in R2 and a second request is answered from it.
//
//   POST /api/learn/rehearsal {app, board}      -> the record when R2 has it, else starts the job (or joins the one running)
//   GET  /api/learn/rehearsal?app=&board=       -> the same answer without starting anything
// Reply, one of (HTTP 200):
//   {status: queued|discovering|provisioning|running|repairing|planning, step?, attempt?, fixes?, elapsedSec}   (schemas/status.json)
//   {status: 'ready', elapsedSec, record}                                                                      (record: schemas/record.json)
//   {status: 'failed', elapsedSec, error}
// Request errors are 4xx {error}. 404 on GET: no rehearsal was started for this repository version.
// Status lives in the RepositoryRehearsals object only (no D1 table); the record and the artifact zip live in R2.
import { authorizedBoardApp } from './learn-board.js';
import { canvasRepository } from './learn-codebase-source-map.js';
import { repositorySnapshot } from './repositories.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/;
const HARDWARE = 'cpu', VERSION = 'rehearsal-1', TIME_BUDGET_MIN = 20;
const TIMEOUT_MS = 40 * 60 * 1000, POLL_MS = 5000, MAX_MISSES = 12; // 12 unanswered 5 s ticks: the controller is not there
const MAX_ZIP = 64 * 1024 * 1024, MAX_RECORD = 2 * 1024 * 1024;
const ACTIVE = ['queued', 'running'];
const STATES = ['queued', 'discovering', 'provisioning', 'running', 'repairing', 'planning'];
const recordKey = (appId, commit) => `learn-repositories-dev/${appId}/${commit}/rehearsal-${HARDWARE}.json`;
const zipKey = (appId, commit) => `learn-repositories-dev/${appId}/${commit}/rehearsal-${HARDWARE}-artifacts.zip`;

// Worker -> controller, as workerRequest (learn-scene.js): Bearer token, 20 s timeout, no redirects. The controller is a local
// process on the owner's machine this sprint, so plain http is allowed for a loopback address and nowhere else.
export async function rehearsalRequest(env, path, body) {
  if (!env.REHEARSAL_WORKER_URL || !env.REHEARSAL_WORKER_TOKEN) throw new Error('The rehearsal controller is not configured');
  const base = new URL(env.REHEARSAL_WORKER_URL);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))) throw new Error('The rehearsal controller requires HTTPS');
  return fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.REHEARSAL_WORKER_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(20000) });
}

// sha256 hex of `${appId}|${commit}|cpu`: the DO's name, the controller's job key and the idempotency key in one.
export async function rehearsalKey(appId, commit) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${appId}|${commit}|${HARDWARE}`));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
// schemas/job.json from the repository snapshot ({repo, commit, files: {path: text}}): README text and the indexed paths.
export function rehearsalJob(job, snapshot) {
  const paths = Object.keys(snapshot.files || {}), readme = paths.find(p => /^readme(\.[a-z]+)?$/i.test(p));
  return { key: job.key, repo: job.repo, commit: job.commit, hardware: HARDWARE, timeBudgetMin: TIME_BUDGET_MIN,
    readme: readme ? String(snapshot.files[readme]).slice(0, 400000) : '', files: paths.filter(p => p.length <= 512).slice(0, 20000), version: VERSION };
}
// One entry of a zip (central directory, stored or deflate), as bytes. The controller's asset zip carries record.json at its root.
export async function zipEntry(bytes, name) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw Error('Invalid rehearsal archive');
  let at = view.getUint32(end + 16, true);
  for (let i = 0, n = view.getUint16(end + 10, true); i < n && view.getUint32(at, true) === 0x02014b50; i++) {
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), raw = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
    if (new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)) === name) {
      if (raw > MAX_RECORD) throw Error('Rehearsal record too large');
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), data = bytes.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      throw Error('Invalid rehearsal archive');
    }
    at += 46 + nameLength + extra + comment;
  }
  throw Error('Rehearsal archive has no record.json');
}
// The DO's answer for a job: schemas/status.json while it runs, {failed, error}, or {ready} for the route to attach the record to.
function reply(job) {
  const elapsedSec = Math.round(((job.ended || Date.now()) - job.started) / 100) / 10;
  if (job.status === 'failed') return { status: 'failed', elapsedSec, error: job.error };
  if (job.status === 'ready') return { status: 'ready', elapsedSec };
  const { step, attempt, fixes } = job.last || {};
  return { status: job.last?.status || 'queued', ...(step ? { step } : {}), ...(attempt ? { attempt } : {}), ...(Number.isInteger(fixes) ? { fixes } : {}), elapsedSec };
}

export class RepositoryRehearsals {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(req) {
    return this.state.blockConcurrencyWhile(async () => {
      let job = await this.state.storage.get('job');
      if (req.method === 'GET') return job ? json(reply(job)) : json({ error: 'not_started' }, 404);
      const request = await req.json();
      if (job && ACTIVE.includes(job.status)) return json(reply(job)); // joins the run in progress
      job = { key: request.key, appId: request.appId, repo: request.repo, commit: request.commit, status: 'queued', started: Date.now(), misses: 0 };
      await this.state.storage.put('job', job);
      await this.state.storage.setAlarm(Date.now() + 100);
      return json(reply(job), 202);
    });
  }
  // As RepositoryImports.alarm (repositories.js): send the job, then poll; transient trouble is retried until the timeout.
  async alarm() {
    const job = await this.state.storage.get('job'); if (!job || !ACTIVE.includes(job.status)) return;
    try {
      if (Date.now() - job.started > TIMEOUT_MS) throw Error('The rehearsal timed out after 40 minutes. Retry it.');
      if (job.status === 'queued') {
        const snapshot = await repositorySnapshot(this.env, { id: job.appId }, job.commit);
        const r = await rehearsalRequest(this.env, '/rehearsals', rehearsalJob(job, snapshot));
        if (r.ok || r.status === 409) job.status = 'running'; // 409: the controller already holds this key
        else if (![429, 502, 503, 504].includes(r.status)) throw Error(rejected(r.status));
      } else {
        const r = await rehearsalRequest(this.env, `/rehearsals/${job.key}`);
        if (r.status === 404) job.status = 'queued'; // the controller lost it (restarted): send it again
        else if (r.ok) {
          const result = await r.json();
          if (result.status === 'failed') throw Error(result.error || 'The rehearsal failed');
          if (result.status === 'ready') {
            const asset = await rehearsalRequest(this.env, `/rehearsals/${job.key}/asset`); if (!asset.ok) throw Error('Rehearsal download failed');
            if (Number(asset.headers.get('content-length')) > MAX_ZIP) throw Error('Rehearsal result too large');
            const zip = new Uint8Array(await asset.arrayBuffer());
            if (zip.length > MAX_ZIP) throw Error('Rehearsal result too large');
            const text = new TextDecoder().decode(await zipEntry(zip, 'record.json')), record = JSON.parse(text);
            if (record.version !== VERSION || record.repo !== job.repo || record.commit !== job.commit || record.hardware !== HARDWARE) throw Error('Invalid rehearsal result');
            await this.env.REPOSITORY_SNAPSHOTS.put(zipKey(job.appId, job.commit), zip, { httpMetadata: { contentType: 'application/zip' } });
            await this.env.REPOSITORY_SNAPSHOTS.put(recordKey(job.appId, job.commit), text, { httpMetadata: { contentType: 'application/json' } });
            job.status = 'ready';
          } else if (STATES.includes(result.status)) job.last = { status: result.status, step: result.step, attempt: result.attempt, fixes: result.fixes };
        } else if ([401, 403].includes(r.status)) throw Error(rejected(r.status));
      }
      job.misses = 0;
    } catch (error) {
      if (Date.now() - job.started > TIMEOUT_MS || !/fetch|network|connection|timeout/i.test(error.message)) { job.status = 'failed'; job.error = error.message; }
      else if (++job.misses >= MAX_MISSES) { job.status = 'failed'; job.error = 'The rehearsal controller is not reachable. Start it on this machine and retry.'; }
    }
    if (!ACTIVE.includes(job.status)) job.ended = Date.now();
    await this.state.storage.put('job', job);
    if (ACTIVE.includes(job.status)) await this.state.storage.setAlarm(Date.now() + POLL_MS);
  }
}
const rejected = status => ([401, 403].includes(status) ? 'The rehearsal controller rejected this server\'s credential.' : 'The rehearsal controller rejected the request.');

// The stored record, as the ready reply. null: this repository version has not been rehearsed.
async function storedRecord(env, repo) {
  const object = await env.REPOSITORY_SNAPSHOTS.get(recordKey(repo.id, repo.commit));
  if (!object) return null;
  const record = await object.json();
  return { status: 'ready', elapsedSec: record.wallSec ?? 0, record };
}

// The signed-in owner's own canvas: canvasAccess resolves only canvases the caller owns, and canvasRepository only their own import.
// Shared by /api/learn/rehearsal and /api/learn/run: the access object, or the Response that refuses.
async function ownerAccess(req, env, body, deps) {
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  if (typeof body.board !== 'string' || !BOARD.test(body.board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  if (access.kind !== 'canvas') return json({ error: 'rehearsal_on_canvases_only' }, 400);
  if (!access.user_id) return json({ error: 'identity_unavailable' }, 401);
  return access;
}

export async function rehearsalRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/rehearsal') return null;
  if (!env.REPOSITORY_REHEARSALS) return json({ error: 'Not found' }, 404); // production does not bind the object
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'GET or POST required' }, 405);
  let body;
  if (req.method === 'GET') {
    const query = new URL(req.url).searchParams;
    body = { app: query.get('app'), board: query.get('board') };
  } else {
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  }
  const access = await ownerAccess(req, env, body, deps);
  if (access instanceof Response) return access;
  try {
    const repo = await canvasRepository(env, access);
    if (!repo) return json({ error: 'no_repository' }, 409);
    const stored = await storedRecord(env, repo);
    if (stored) return json(stored);
    const key = await rehearsalKey(repo.id, repo.commit), actor = env.REPOSITORY_REHEARSALS.get(env.REPOSITORY_REHEARSALS.idFromName(key));
    if (req.method === 'POST' && (!env.REHEARSAL_WORKER_URL || !env.REHEARSAL_WORKER_TOKEN)) return json({ status: 'failed', elapsedSec: 0, error: 'The rehearsal controller is not configured on this server.' });
    const response = await actor.fetch(req.method === 'GET' ? 'https://rehearsal/status' : 'https://rehearsal/start', req.method === 'GET' ? undefined : { method: 'POST', body: JSON.stringify({ key, appId: repo.id, repo: repo.repo, commit: repo.commit }) });
    if (response.status === 404) return json({ error: 'not_started' }, 404);
    const state = await response.json();
    return json(state.status === 'ready' ? (await storedRecord(env, repo)) || { status: 'failed', elapsedSec: state.elapsedSec, error: 'The rehearsal record is missing.' } : state);
  } catch (error) {
    console.error('rehearsal route', error.message);
    return json({ error: 'rehearsal_unavailable' }, 503);
  }
}

// ---- Run card (packages/rehearsal-runtime/RUN_CARD.md): POST /api/learn/run {app, board, action, sessionId?, cellId?, flags?, runId?} ----
// action start | run | poll | log | stop, forwarded to the controller's session routes. The browser polls every 2 s; no Durable Object.
// The control plane never accepts or forwards a command: a run names a cellId and flag values, the controller builds the command.
const SESSION_ID = /^[a-f0-9]{32}$/, RUN_ID = /^[a-f0-9]{16}$/, CELL_ID = /^[a-z0-9_]+$/, FLAG = /^--[A-Za-z0-9_-]+$/;
const RUN_ACTIONS = ['start', 'run', 'poll', 'log', 'stop'], PASS = [400, 404, 409, 410, 429], MAX_LOG = 1000000;
const RUN_FIELDS = ['app', 'board', 'action', 'sessionId', 'cellId', 'flags', 'runId'];
// An opaque, stable id for the controller (never the email): sha256 hex of `${org}|${user_id}`, first 32 characters.
export async function runUser(access) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${access.org}|${access.user_id}`));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const validFlags = flags => !flags || (typeof flags === 'object' && !Array.isArray(flags) && Object.keys(flags).length <= 8
  && Object.entries(flags).every(([name, value]) => FLAG.test(name) && typeof value === 'string' && value.length <= 80));

export async function runRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/run') return null;
  if (!env.REPOSITORY_REHEARSALS) return json({ error: 'Not found' }, 404); // production does not bind the object
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  if ('cmd' in body) return json({ error: 'A command cannot be sent: name a cell and its flags' }, 400);
  const unknown = Object.keys(body).find(key => !RUN_FIELDS.includes(key));
  if (unknown) return json({ error: `Unknown field ${unknown}` }, 400);
  const { action, sessionId, cellId, runId, flags } = body;
  if (!RUN_ACTIONS.includes(action)) return json({ error: `action must be one of ${RUN_ACTIONS.join(', ')}` }, 400);
  if (action !== 'start' && !SESSION_ID.test(sessionId)) return json({ error: 'sessionId is not valid' }, 400);
  if (action === 'run' && !CELL_ID.test(cellId)) return json({ error: 'cellId is not valid' }, 400);
  if (action === 'run' && !validFlags(flags)) return json({ error: 'flags must be at most 8 `--name` keys with string values of at most 80 characters' }, 400);
  if ((action === 'poll' || action === 'log') && !RUN_ID.test(runId)) return json({ error: 'runId is not valid' }, 400);
  const access = await ownerAccess(req, env, body, deps);
  if (access instanceof Response) return access;
  try {
    const repo = await canvasRepository(env, access);
    if (!repo) return json({ error: 'no_repository' }, 409);
    let response;
    if (action === 'start') {
      const stored = await storedRecord(env, repo);
      if (!stored) return json({ error: 'no_record' }, 409);
      response = await rehearsalRequest(env, '/sessions', { repo: repo.repo, commit: repo.commit, canvas: body.app, user: await runUser(access), record: stored.record });
    } else if (action === 'run') response = await rehearsalRequest(env, `/sessions/${sessionId}/run`, { cellId, ...(flags && Object.keys(flags).length ? { flags } : {}) });
    else if (action === 'stop') response = await rehearsalRequest(env, `/sessions/${sessionId}/stop`, {});
    else response = await rehearsalRequest(env, `/sessions/${sessionId}/runs/${runId}${action === 'log' ? '/log' : ''}`);
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      if (PASS.includes(response.status)) return json({ error: typeof detail?.error === 'string' ? detail.error : `The run controller refused the request (${response.status})` }, response.status);
      if ([401, 403].includes(response.status)) return json({ error: rejected(response.status) }, 502);
      return json({ error: 'rehearsal_unavailable' }, 503);
    }
    // shortcut: the log is cut to its last MAX_LOG characters here; the controller already bounds it, page it if a run ever needs more.
    if (action === 'log') return json({ log: (await response.text()).slice(-MAX_LOG) });
    return json(await response.json(), response.status);
  } catch (error) {
    console.error('run route', error.message);
    return json({ error: /not configured|requires HTTPS/.test(error.message) ? error.message : 'rehearsal_unavailable' }, 503);
  }
}
