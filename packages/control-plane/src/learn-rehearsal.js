// packages/control-plane/src/learn-rehearsal.js
// Rehearsal of a connected repository (rehearsal-runtime spec section 9; contracts: packages/rehearsal-runtime/schemas).
// The controller (packages/rehearsal-runtime/server.py) runs one job per (app, commit, hardware); this module starts it, follows it
// and keeps its record. Once per repository and commit: the record lives in R2 and a second request is answered from it.
//
//   POST /api/learn/rehearsal {app, board}                        -> the old single-route flow: the record in R2 (rehearsal-cpu.json), else starts the job
//   POST /api/learn/rehearsal {app, board, action:'catalogue'}   -> start (or return the cached) catalogue; answers GET's shape plus catalogueDoc when ready
//   POST /api/learn/rehearsal {app, board, action:'start', routeId} -> rehearse that catalogue route only; answers the status shape below
//   GET  /api/learn/rehearsal?app=&board=[&routeId=]              -> schemas/learn-rehearsal-get.json: {indexing, catalogue:{status, practicalRoutes?, error?}, routes[], record? (routeId asked, ready)}
// The catalogue is not a click: the repository import (repositories.js) calls startCatalogue when the snapshot turns ready; a GET that finds a ready repository with no catalogue job starts one too.
// A rehearsal reply, one of (HTTP 200):
//   {status: queued|discovering|provisioning|running|repairing|planning, step?, attempt?, fixes?, elapsedSec}   (schemas/status.json)
//   {status: 'ready', elapsedSec, record}                                                                      (record: schemas/record.json; also one that gave up: gaveUp set, a step failed)
//   {status: 'failed', elapsedSec, error}
// Request errors are 4xx {error}. 404 on GET: no rehearsal was started for this repository version.
// Status lives in the RepositoryRehearsals object only (no D1 table; one object per rehearsal key, and one per catalogue key); the record, the artifact zip and the catalogue live in R2.
import { authorizedBoardApp } from './learn-board.js';
import { canvasRepository } from './learn-codebase-source-map.js';
import { NOT_TRASHED } from './library-trash.js';
import { repositorySnapshot } from './repositories.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { admitCompute, beginCompute, computeUsage, endCompute, endedAtOf, entryFromSession } from './learn-compute.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/;
const HARDWARE = 'cpu', VERSION = 'rehearsal-1', CATALOGUE_VERSION = 'catalogue-1', TIME_BUDGET_MIN = 20;
const CATALOGUE = 'catalogue', ROUTE_ID = /^[a-z0-9_]+$/; // 'catalogue' is the catalogue's slot in the key space, so it is never a routeId
const TIMEOUT_MS = 40 * 60 * 1000, CATALOGUE_TIMEOUT_MS = 10 * 60 * 1000, POLL_MS = 5000, MAX_MISSES = 12; // 12 unanswered 5 s ticks: the controller is not there
const MAX_ZIP = 64 * 1024 * 1024, MAX_RECORD = 2 * 1024 * 1024;
const ACTIVE = ['queued', 'running'];
const STATES = ['queued', 'discovering', 'provisioning', 'running', 'repairing', 'planning'];
const prefix = (appId, commit) => `learn-repositories-dev/${appId}/${commit}/`;
// One record per (repo, commit, routeId, hardware); a record without a routeId (made before the catalogue) is rehearsal-cpu.json.
const recordKey = (appId, commit, routeId) => `${prefix(appId, commit)}rehearsal-${routeId ? `${routeId}-` : ''}${HARDWARE}.json`;
const zipKey = (appId, commit, routeId) => `${prefix(appId, commit)}rehearsal-${routeId ? `${routeId}-` : ''}${HARDWARE}-artifacts.zip`;
const catalogueKey = (appId, commit) => `${prefix(appId, commit)}catalogue-${HARDWARE}.json`;
const configured = env => Boolean(env.REHEARSAL_WORKER_URL && env.REHEARSAL_WORKER_TOKEN);

// Worker -> controller, as workerRequest (learn-scene.js): Bearer token, 20 s timeout, no redirects. The controller is a local
// process on the owner's machine this sprint, so plain http is allowed for a loopback address and nowhere else.
export async function rehearsalRequest(env, path, body) {
  if (!env.REHEARSAL_WORKER_URL || !env.REHEARSAL_WORKER_TOKEN) throw new Error('The rehearsal controller is not configured');
  const base = new URL(env.REHEARSAL_WORKER_URL);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))) throw new Error('The rehearsal controller requires HTTPS');
  return fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.REHEARSAL_WORKER_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(20000) });
}

// sha256 hex of `${appId}|${commit}|${routeId}|cpu` (a rehearsal), `${appId}|${commit}|catalogue|cpu` (the catalogue) or, with no routeId, the old `${appId}|${commit}|cpu`:
// the DO's name, the controller's job key and the idempotency key in one.
export async function rehearsalKey(appId, commit, routeId) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${appId}|${commit}|${routeId ? `${routeId}|` : ''}${HARDWARE}`));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
// schemas/job.json from the repository snapshot ({repo, commit, files: {path: text}}): README text and the indexed paths; for a catalogue route also routeId, catalogueRoute and prerequisiteRoutes.
export function rehearsalJob(job, snapshot) {
  const paths = Object.keys(snapshot.files || {}), readme = paths.find(p => /^readme(\.[a-z]+)?$/i.test(p));
  return { key: job.key, repo: job.repo, commit: job.commit, hardware: HARDWARE, timeBudgetMin: TIME_BUDGET_MIN,
    readme: readme ? String(snapshot.files[readme]).slice(0, 400000) : '', files: paths.filter(p => p.length <= 512).slice(0, 20000), version: VERSION,
    ...(job.routeId ? { routeId: job.routeId, catalogueRoute: job.catalogueRoute, ...(job.prerequisiteRoutes?.length ? { prerequisiteRoutes: job.prerequisiteRoutes } : {}) } : {}) };
}
// schemas/catalogue-job.json: no sandbox and no clone, the controller reads what is sent. `files` is the snapshot's own files object (text by path), `graphLabels` the graph's node labels.
export function catalogueJob(job, snapshot) {
  const files = {};
  for (const [path, text] of Object.entries(snapshot.files || {})) if (typeof text === 'string' && path.length <= 512 && Object.keys(files).length < 2000) files[path] = text;
  const labels = [...new Set((snapshot.graph?.nodes || []).map(n => n?.label).filter(l => typeof l === 'string' && l.length > 0))].map(l => l.slice(0, 200)).slice(0, 10000);
  return { key: job.key, repo: job.repo, commit: job.commit, hardware: HARDWARE, files, graphLabels: labels, version: CATALOGUE_VERSION };
}
// The routes a route needs, in dependency order (a prerequisite before the route that needs it), the route itself left out.
export function prerequisiteRoutes(doc, route, seen = new Set()) {
  const out = [];
  for (const id of route.prerequisites || []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const needed = doc.routes.find(r => r.routeId === id);
    if (needed) out.push(...prerequisiteRoutes(doc, needed, seen), needed);
  }
  return out;
}
// A plain sentence for the Tutor from a catalogue failure: never the controller's own text, a stack trace or a provider term.
export function catalogueReason(raw) {
  const text = String(raw || '');
  if (/no_catalogue/.test(text)) return 'The README and scripts did not give a clear way to use this repository.';
  if (/not configured|HTTPS|not reachable|rejected/i.test(text)) return 'The service that reads repositories is not reachable right now.';
  if (/timed out/i.test(text)) return 'Reading this repository took longer than I allow.';
  return 'The catalogue could not be written just now.';
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
      job = { key: request.key, appId: request.appId, repo: request.repo, commit: request.commit, status: 'queued', started: Date.now(), misses: 0,
        ...(request.kind === CATALOGUE ? { kind: CATALOGUE } : request.routeId ? { routeId: request.routeId, catalogueRoute: request.catalogueRoute, prerequisiteRoutes: request.prerequisiteRoutes || [] } : {}) };
      await this.state.storage.put('job', job);
      await this.state.storage.setAlarm(Date.now() + 100);
      return json(reply(job), 202);
    });
  }
  // As RepositoryImports.alarm (repositories.js): send the job, then poll; transient trouble is retried until the timeout. A catalogue job (job.kind) goes to /catalogues, a rehearsal to /rehearsals.
  async alarm() {
    const job = await this.state.storage.get('job'); if (!job || !ACTIVE.includes(job.status)) return;
    const catalogue = job.kind === CATALOGUE, base = catalogue ? '/catalogues' : '/rehearsals';
    try {
      if (Date.now() - job.started > (catalogue ? CATALOGUE_TIMEOUT_MS : TIMEOUT_MS)) throw Error(catalogue ? 'The catalogue timed out after 10 minutes.' : 'The rehearsal timed out after 40 minutes. Retry it.');
      if (job.status === 'queued') {
        const snapshot = await repositorySnapshot(this.env, { id: job.appId }, job.commit);
        const r = await rehearsalRequest(this.env, base, catalogue ? catalogueJob(job, snapshot) : rehearsalJob(job, snapshot));
        if (r.ok || r.status === 409) job.status = 'running'; // 409: the controller already holds this key
        else if (![429, 502, 503, 504].includes(r.status)) throw Error(rejected(r.status));
      } else {
        const r = await rehearsalRequest(this.env, `${base}/${job.key}`);
        if (r.status === 404) job.status = 'queued'; // the controller lost it (restarted): send it again
        else if (r.ok) {
          const result = await r.json();
          if (result.status === 'failed') throw Error(result.error || (catalogue ? 'The catalogue failed' : 'The rehearsal failed'));
          if (result.status === 'ready' && catalogue) {
            const asset = await rehearsalRequest(this.env, `${base}/${job.key}/asset`); if (!asset.ok) throw Error('Catalogue download failed');
            const text = await asset.text(), doc = JSON.parse(text);
            if (doc.repo !== job.repo || doc.commit !== job.commit || doc.hardware !== HARDWARE || !Array.isArray(doc.routes) || text.length > MAX_RECORD) throw Error('Invalid catalogue result');
            await this.env.REPOSITORY_SNAPSHOTS.put(catalogueKey(job.appId, job.commit), text, { httpMetadata: { contentType: 'application/json' } });
            job.status = 'ready';
          } else if (result.status === 'ready') {
            const asset = await rehearsalRequest(this.env, `${base}/${job.key}/asset`); if (!asset.ok) throw Error('Rehearsal download failed');
            if (Number(asset.headers.get('content-length')) > MAX_ZIP) throw Error('Rehearsal result too large');
            const zip = new Uint8Array(await asset.arrayBuffer());
            if (zip.length > MAX_ZIP) throw Error('Rehearsal result too large');
            const text = new TextDecoder().decode(await zipEntry(zip, 'record.json')), record = JSON.parse(text);
            if (record.version !== VERSION || record.repo !== job.repo || record.commit !== job.commit || record.hardware !== HARDWARE || (job.routeId && record.routeId !== job.routeId)) throw Error('Invalid rehearsal result');
            await this.env.REPOSITORY_SNAPSHOTS.put(zipKey(job.appId, job.commit, job.routeId), zip, { httpMetadata: { contentType: 'application/zip' } });
            await this.env.REPOSITORY_SNAPSHOTS.put(recordKey(job.appId, job.commit, job.routeId), text, { httpMetadata: { contentType: 'application/json' } });
            job.status = 'ready'; // a record that gave up (gaveUp set, a step failed) is stored and answered as ready like any other
          } else if (STATES.includes(result.status)) job.last = { status: result.status, step: result.step, attempt: result.attempt, fixes: result.fixes };
        } else if ([401, 403].includes(r.status)) throw Error(rejected(r.status));
      }
      job.misses = 0;
    } catch (error) {
      if (Date.now() - job.started > (catalogue ? CATALOGUE_TIMEOUT_MS : TIMEOUT_MS) || !/fetch|network|connection|timeout/i.test(error.message)) { job.status = 'failed'; job.error = error.message; }
      else if (++job.misses >= MAX_MISSES) { job.status = 'failed'; job.error = `The ${catalogue ? 'catalogue' : 'rehearsal'} controller is not reachable. Start it on this machine and retry.`; }
    }
    if (!ACTIVE.includes(job.status)) job.ended = Date.now();
    await this.state.storage.put('job', job);
    if (ACTIVE.includes(job.status)) await this.state.storage.setAlarm(Date.now() + POLL_MS);
  }
}
const rejected = status => ([401, 403].includes(status) ? 'The rehearsal controller rejected this server\'s credential.' : 'The rehearsal controller rejected the request.');

// The stored record, as the ready reply. null: this repository version has not been rehearsed (for that route).
async function storedRecord(env, repo, routeId, doc) {
  const object = await env.REPOSITORY_SNAPSHOTS.get(recordKey(repo.id, repo.commit, routeId));
  let record = object ? await object.json() : null;
  if (!record && routeId) { // a record made before the catalogue (rehearsal-cpu.json) is the record of the route it names, so the first nanoGPT canvas keeps its Run card
    const legacy = await env.REPOSITORY_SNAPSHOTS.get(recordKey(repo.id, repo.commit));
    const old = legacy ? await legacy.json() : null;
    if (old && namesRoute(old, routeId, doc)) record = old;
  }
  return record ? { status: 'ready', elapsedSec: record.wallSec ?? 0, record } : null;
}
// A legacy record names a route by its routeId, or (the catalogue's ids are model-chosen) by the first source of the route's sketch appearing among its steps.
const namesRoute = (record, routeId, doc) => {
  if (record.routeId) return record.routeId === routeId;
  const route = record.route || {}, wanted = doc?.routes?.find(r => r.routeId === routeId);
  if (route.routeId === routeId) return true;
  const first = wanted?.stepsSketch?.[0]?.source;
  return Boolean(first) && (route.steps || []).some(step => step.source === first);
};
async function storedCatalogue(env, repo) {
  const object = await env.REPOSITORY_SNAPSHOTS.get(catalogueKey(repo.id, repo.commit));
  return object ? object.json() : null;
}
// The owner's own repository canvas row, indexed or not (canvasRepository answers only an indexed one): {id, repo, commit, status, error}.
async function canvasRepositoryRow(env, access) {
  if (!access.project) return null;
  const row = await env.LEARN_DB.prepare(`SELECT r.id, r.repo, r.commit_sha, r.status, r.error FROM repository_apps r WHERE r.org = ? AND r.name = ? AND r.owner_email = ? AND ${NOT_TRASHED('r.org', 'r.name')}`)
    .bind(access.org, access.project, access.email).first();
  return row ? { id: row.id, repo: row.repo, commit: row.commit_sha, status: row.status, error: row.error } : null;
}

// Start the catalogue for a repository version, unless R2 already has it or it is running: called by the repository import when the snapshot turns ready (repositories.js).
// `retry` also restarts a failed one. -> the DO's reply ({status, ...}), or null when the controller is not set up here (nothing is started).
export async function startCatalogue(env, repo, { retry = false } = {}) {
  if (!env.REPOSITORY_REHEARSALS || !configured(env)) return null;
  if (await storedCatalogue(env, repo)) return { status: 'ready' };
  const key = await rehearsalKey(repo.id, repo.commit, CATALOGUE), actor = env.REPOSITORY_REHEARSALS.get(env.REPOSITORY_REHEARSALS.idFromName(key));
  const seen = await actor.fetch('https://rehearsal/status');
  if (seen.status !== 404) { // running, ready or failed: a failed one waits for the owner's retry (the chat's action 'catalogue')
    const job = await seen.json();
    if (job.status !== 'failed' || !retry) return job;
  }
  const response = await actor.fetch('https://rehearsal/start', { method: 'POST', body: JSON.stringify({ kind: CATALOGUE, key, appId: repo.id, repo: repo.repo, commit: repo.commit }) });
  return response.json();
}
// The catalogue's state for the Tutor: ready (with the document), queued, or failed with a plain reason. `start` starts it when nothing is running; `retry` also when it failed.
async function catalogueState(env, repo, { start = false, retry = false } = {}) {
  const doc = await storedCatalogue(env, repo);
  if (doc) return { state: { status: 'ready', practicalRoutes: doc.routes.filter(r => r.practical).length }, doc };
  if (!env.REPOSITORY_REHEARSALS || !configured(env)) return { state: { status: 'failed', error: catalogueReason('not configured') } };
  const key = await rehearsalKey(repo.id, repo.commit, CATALOGUE), actor = env.REPOSITORY_REHEARSALS.get(env.REPOSITORY_REHEARSALS.idFromName(key));
  let response = await actor.fetch('https://rehearsal/status');
  let job = response.status === 404 ? null : await response.json();
  if (!job || (job.status === 'failed' && retry)) { // nothing started yet (an import older than the trigger), or the owner asks again
    if (!start) return { state: { status: 'queued' } };
    response = await actor.fetch('https://rehearsal/start', { method: 'POST', body: JSON.stringify({ kind: CATALOGUE, key, appId: repo.id, repo: repo.repo, commit: repo.commit }) });
    job = await response.json();
  }
  if (job.status === 'failed') return { state: { status: 'failed', error: catalogueReason(job.error) } };
  if (job.status === 'ready') return { state: { status: 'failed', error: catalogueReason('missing') } }; // the DO says ready but R2 has nothing: never silent
  return { state: { status: 'queued' } };
}
// Per routeId that has a record or a rehearsal: its state (schemas/learn-rehearsal-get.json `routes`). The catalogue's practical routes are always listed (none when not started).
async function routeStates(env, repo, doc) {
  const ids = new Set((doc?.routes || []).filter(r => r.practical).map(r => r.routeId));
  const have = new Set();
  const list = await env.REPOSITORY_SNAPSHOTS.list?.({ prefix: `${prefix(repo.id, repo.commit)}rehearsal-` }).catch(() => null);
  for (const { key } of list?.objects || []) {
    const m = /rehearsal-([a-z0-9_]+)-cpu\.json$/.exec(key);
    if (m) { ids.add(m[1]); have.add(m[1]); }
  }
  const legacy = await env.REPOSITORY_SNAPSHOTS.get(recordKey(repo.id, repo.commit)); // rehearsal-cpu.json, made before the catalogue
  const old = legacy ? await legacy.json() : null;
  const out = [];
  for (const routeId of ids) {
    if (have.has(routeId) || (old && namesRoute(old, routeId, doc))) { out.push({ routeId, status: 'ready' }); continue; }
    const key = await rehearsalKey(repo.id, repo.commit, routeId), response = await env.REPOSITORY_REHEARSALS.get(env.REPOSITORY_REHEARSALS.idFromName(key)).fetch('https://rehearsal/status');
    if (response.status === 404) { out.push({ routeId, status: 'none' }); continue; }
    const state = await response.json();
    out.push({ routeId, status: state.status, ...(state.step ? { step: state.step } : {}), ...(state.status === 'failed' && state.error ? { error: String(state.error).split('\n')[0].slice(0, 200) } : {}) });
  }
  return out;
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

// The old single-route flow (POST with no action): one record at rehearsal-cpu.json, one job per (app, commit, cpu).
async function legacyRehearsal(req, env, access) {
  const repo = await canvasRepository(env, access);
  if (!repo) return json({ error: 'no_repository' }, 409);
  const stored = await storedRecord(env, repo);
  if (stored) return json(stored);
  const key = await rehearsalKey(repo.id, repo.commit), actor = env.REPOSITORY_REHEARSALS.get(env.REPOSITORY_REHEARSALS.idFromName(key));
  if (!configured(env)) return json({ status: 'failed', elapsedSec: 0, error: 'The rehearsal controller is not configured on this server.' });
  const response = await actor.fetch('https://rehearsal/start', { method: 'POST', body: JSON.stringify({ key, appId: repo.id, repo: repo.repo, commit: repo.commit }) });
  const state = await response.json();
  return json(state.status === 'ready' ? (await storedRecord(env, repo)) || { status: 'failed', elapsedSec: state.elapsedSec, error: 'The rehearsal record is missing.' } : state);
}

// The person a machine is metered to: the signed-in account (never the repository's other members).
const meterUser = access => String(access.user_id);
const computeRefusal = (refusal, status = 402) => json({ error: refusal.reason, ...(refusal.resetsAt ? { resetsAt: refusal.resetsAt } : {}), ...(refusal.allowanceUnits ? { allowanceUnits: refusal.allowanceUnits } : {}) }, status);
// Is a machine for this entry already running (a start repeated every poll must not be refused by its own reservation)?
const meterRunning = async (env, entryId) => !!(await env.LEARN_DB.prepare("SELECT 1 AS found FROM compute_entries WHERE entry_id = ? AND status = 'running'").bind(entryId).first());

// {action:'start', routeId}: rehearse one practical route of the catalogue (its prerequisite routes inlined by the controller), or answer from its record.
async function startRoute(env, repo, routeId, access) {
  const doc = await storedCatalogue(env, repo);
  if (!doc) return json({ error: 'catalogue_not_ready' }, 409);
  const route = doc.routes.find(r => r.routeId === routeId);
  if (!route) return json({ error: 'unknown_route' }, 404);
  const needs = prerequisiteRoutes(doc, route);
  if (!route.practical || needs.some(r => !r.practical)) return json({ error: 'route_not_practical' }, 409);
  const stored = await storedRecord(env, repo, routeId, doc);
  if (stored) {
    if (env.LEARN_DB) await endCompute(env.LEARN_DB, env, await rehearsalKey(repo.id, repo.commit, routeId), { seconds: Number(stored.record?.wallSec ?? stored.elapsedSec) || undefined }).catch(() => null);
    return json(stored);
  }
  if (!configured(env)) return json({ status: 'failed', elapsedSec: 0, error: 'The rehearsal controller is not configured on this server.' });
  const key = await rehearsalKey(repo.id, repo.commit, routeId), actor = env.REPOSITORY_REHEARSALS.get(env.REPOSITORY_REHEARSALS.idFromName(key));
  // The gate: a rehearsal holds a machine, so the person's Compute allowance must cover it before it starts. Joining a job already running is not a new start.
  if (env.LEARN_DB && !(await meterRunning(env, key))) {
    const admit = await admitCompute(env.LEARN_DB, env, meterUser(access), { kind: 'rehearsal' });
    if (!admit.ok) return computeRefusal(admit);
  }
  const response = await actor.fetch('https://rehearsal/start', { method: 'POST', body: JSON.stringify({ key, appId: repo.id, repo: repo.repo, commit: repo.commit, routeId, catalogueRoute: route, prerequisiteRoutes: needs }) });
  const state = await response.json();
  if (env.LEARN_DB) {
    const now = Math.floor(Date.now() / 1000);
    if (state.status === 'ready' || state.status === 'failed') await endCompute(env.LEARN_DB, env, key, { seconds: state.elapsedSec });
    else await beginCompute(env.LEARN_DB, env, { entryId: key, userId: meterUser(access), kind: 'rehearsal', appId: repo.id, repo: repo.repo, commit: repo.commit, routeId, routeTitle: route.title ?? null, startedAt: now, deadlineAt: now + 35 * 60 });
  }
  return json(state.status === 'ready' ? (await storedRecord(env, repo, routeId, doc)) || { status: 'failed', elapsedSec: state.elapsedSec, error: 'The rehearsal record is missing.' } : state);
}

export async function rehearsalRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/rehearsal') return null;
  if (!env.REPOSITORY_REHEARSALS) return json({ error: 'Not found' }, 404); // production does not bind the object
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'GET or POST required' }, 405);
  let body;
  if (req.method === 'GET') {
    const query = new URL(req.url).searchParams;
    body = { app: query.get('app'), board: query.get('board'), ...(query.get('routeId') ? { routeId: query.get('routeId') } : {}) };
  } else {
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  }
  const { action, routeId } = body;
  if (action !== undefined && !['catalogue', 'start'].includes(action)) return json({ error: "action must be 'catalogue' or 'start'" }, 400);
  if (routeId !== undefined && (typeof routeId !== 'string' || !ROUTE_ID.test(routeId) || routeId === CATALOGUE)) return json({ error: 'routeId is not valid' }, 400);
  if (action === 'start' && !routeId) return json({ error: 'routeId is required to start a route' }, 400);
  const access = await ownerAccess(req, env, body, deps);
  if (access instanceof Response) return access;
  try {
    if (req.method === 'POST' && !action) return await legacyRehearsal(req, env, access);
    const row = await canvasRepositoryRow(env, access);
    if (!row) return json({ error: 'no_repository' }, 409);
    const indexed = row.status === 'ready' && row.commit, repo = indexed ? { id: row.id, repo: row.repo, commit: row.commit } : null;
    const indexing = ['queued', 'indexing', 'failed'].includes(row.status) ? row.status : indexed ? 'ready' : 'indexing';
    if (action === 'start') return repo ? await startRoute(env, repo, routeId, access) : json({ error: 'not_indexed' }, 409);
    if (!repo) return json({ indexing, catalogue: indexing === 'failed' ? { status: 'failed', error: 'The repository could not be indexed.' } : { status: 'queued' } }); // the catalogue waits for the snapshot
    // GET and {action:'catalogue'}: the catalogue state; a ready repository with no catalogue job (an import older than the trigger) starts one here; only the owner's action retries a failed one
    const { state, doc } = await catalogueState(env, repo, { start: true, retry: action === 'catalogue' });
    const out = { indexing, catalogue: state, ...(action === 'catalogue' && doc ? { catalogueDoc: doc } : {}), routes: await routeStates(env, repo, doc) };
    if (req.method === 'GET' && routeId) {
      const stored = await storedRecord(env, repo, routeId, doc);
      if (stored) out.record = stored.record;
    }
    return json(out);
  } catch (error) {
    console.error('rehearsal route', error.message);
    return json({ error: 'rehearsal_unavailable' }, 503);
  }
}

// ---- Run card (packages/rehearsal-runtime/RUN_CARD.md): POST /api/learn/run {app, board, action, sessionId?, cellId?, flags?, addedKnobs?, custom?, runId?} ----
// action start | run | poll | log | stop, forwarded to the controller's session routes. An optional routeId (every action) names the catalogue route whose record `start` reads. The browser polls every 2 s; no Durable Object.
// The control plane never accepts or forwards a command: a run names a cellId (or a `custom` sequence of route steps) and flag values (and the Tutor's `addedKnobs`); the controller builds the command and validates every knob.
// GET /api/learn/run?action=file&app=&board=&sessionId=&runId=&path=[&routeId=] streams a file the run produced (the controller's files route), under the same owner authorization.
const SESSION_ID = /^[a-f0-9]{32}$/, RUN_ID = /^[a-f0-9]{16}$/, CELL_ID = /^[a-z0-9_]+$/, FLAG = /^--[A-Za-z0-9_-]+$/;
const RUN_ACTIONS = ['start', 'run', 'poll', 'log', 'stop', 'file'], PASS = [400, 404, 409, 410, 429], MAX_LOG = 1000000;
const RUN_FIELDS = ['app', 'board', 'action', 'sessionId', 'cellId', 'flags', 'custom', 'addedKnobs', 'runId', 'routeId'];
const FILE_QUERY = ['app', 'board', 'action', 'sessionId', 'runId', 'path', 'routeId'];
// An opaque, stable id for the controller (never the email): sha256 hex of `${org}|${user_id}`, first 32 characters.
export async function runUser(access) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${access.org}|${access.user_id}`));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validFlags = flags => !flags || (plain(flags) && Object.keys(flags).length <= 24
  && Object.entries(flags).every(([name, value]) => FLAG.test(name) && typeof value === 'string' && value.length <= 80));
// run-request.json `custom`: {steps (1-8 route step ids), knobs ({stepId: {flag: value}}), name? (at most 60 characters)}. Only the shape is checked here; the controller checks the steps against the record.
const validCustom = custom => plain(custom) && Object.keys(custom).every(k => ['steps', 'knobs', 'name'].includes(k))
  && Array.isArray(custom.steps) && custom.steps.length >= 1 && custom.steps.length <= 8 && custom.steps.every(id => typeof id === 'string' && CELL_ID.test(id))
  && plain(custom.knobs) && Object.values(custom.knobs).every(knobs => plain(knobs) && validFlags(knobs)) && (custom.name === undefined || (typeof custom.name === 'string' && custom.name.length <= 60));
// run-request.json `addedKnobs`: at most 8 {flag, type, default, source, step?}; the controller reads each source line from the clone before it trusts the flag.
const validAdded = list => list === undefined || (Array.isArray(list) && list.length <= 8 && list.every(k => plain(k) && Object.keys(k).every(key => ['flag', 'type', 'default', 'source', 'step'].includes(key))
  && FLAG.test(k.flag) && ['string', 'float', 'int', 'bool'].includes(k.type) && typeof k.default === 'string' && k.default.length <= 80 && typeof k.source === 'string' && k.source.length <= 300
  && (k.step === undefined || (typeof k.step === 'string' && CELL_ID.test(k.step)))));
// A produced file's path: relative to the clone, no `..`, no leading slash, no backslash or control characters.
const validFilePath = path => typeof path === 'string' && path.length >= 1 && path.length <= 512 && !path.startsWith('/') && !path.includes('\\') && !/[\u0000-\u001f]/.test(path) && !path.split('/').some(part => part === '..' || part === '');

export async function runRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/run') return null;
  if (!env.REPOSITORY_REHEARSALS) return json({ error: 'Not found' }, 404); // production does not bind the object
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'POST required' }, 405);
  let body;
  if (req.method === 'GET') { // only the produced-file read is a GET
    const query = new URL(req.url).searchParams;
    const stray = [...query.keys()].find(key => !FILE_QUERY.includes(key));
    if (stray) return json({ error: `Unknown field ${stray}` }, 400);
    body = Object.fromEntries([...query.entries()]);
    if (body.action !== 'file') return json({ error: 'POST required' }, 405);
  } else {
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
    if ('cmd' in body || 'command' in body) return json({ error: 'A command cannot be sent: name a cell and its flags' }, 400);
    const unknown = Object.keys(body).find(key => !RUN_FIELDS.includes(key));
    if (unknown) return json({ error: `Unknown field ${unknown}` }, 400);
  }
  const { action, sessionId, cellId, runId, flags, custom, addedKnobs, routeId } = body;
  if (routeId !== undefined && (typeof routeId !== 'string' || !ROUTE_ID.test(routeId) || routeId === CATALOGUE)) return json({ error: 'routeId is not valid' }, 400);
  if (!RUN_ACTIONS.includes(action)) return json({ error: `action must be one of ${RUN_ACTIONS.join(', ')}` }, 400);
  if (action === 'file' && req.method !== 'GET') return json({ error: 'GET required' }, 405);
  if (action !== 'start' && !SESSION_ID.test(sessionId)) return json({ error: 'sessionId is not valid' }, 400);
  if (action === 'run' && custom !== undefined && cellId !== undefined) return json({ error: 'name a cell or a custom run, not both' }, 400);
  if (action === 'run' && custom === undefined && !CELL_ID.test(cellId)) return json({ error: 'cellId is not valid' }, 400);
  if (action === 'run' && custom !== undefined && (flags !== undefined || !validCustom(custom))) return json({ error: 'custom must be {steps: 1 to 8 step ids, knobs: {stepId: {--flag: value}}, name?: at most 60 characters}' }, 400);
  if (action === 'run' && !validFlags(flags)) return json({ error: 'flags must be at most 24 `--name` keys with string values of at most 80 characters' }, 400);
  if (action === 'run' && !validAdded(addedKnobs)) return json({ error: 'addedKnobs must be at most 8 {flag, type, default, source} entries' }, 400);
  if ((action === 'poll' || action === 'log' || action === 'file') && !RUN_ID.test(runId)) return json({ error: 'runId is not valid' }, 400);
  if (action === 'file' && !validFilePath(body.path)) return json({ error: 'path must be a file path inside the repository' }, 400);
  const access = await ownerAccess(req, env, body, deps);
  if (access instanceof Response) return access;
  try {
    const repo = await canvasRepository(env, access);
    if (!repo) return json({ error: 'no_repository' }, 409);
    let response, catalogue = null;
    if (action === 'start') {
      catalogue = routeId ? await storedCatalogue(env, repo) : null;
      const stored = await storedRecord(env, repo, routeId, catalogue); // a routeId reads that route's record; none, the record made before the catalogue
      if (!stored) return json({ error: 'no_record' }, 409);
      // The gate (usage-limits-spec.md section 3): a session holds a machine; refused, nothing starts. A start repeated while the session boots is the same machine, not a new one.
      if (env.LEARN_DB && !(await env.LEARN_DB.prepare("SELECT 1 AS found FROM compute_entries WHERE user_id = ? AND app_id = ? AND kind = 'session' AND status = 'running'").bind(meterUser(access), body.app).first())) {
        const admit = await admitCompute(env.LEARN_DB, env, meterUser(access), { kind: 'session' });
        if (!admit.ok) return computeRefusal(admit);
      }
      response = await rehearsalRequest(env, '/sessions', { repo: repo.repo, commit: repo.commit, canvas: body.app, user: await runUser(access), record: stored.record });
    } else if (action === 'run') response = await rehearsalRequest(env, `/sessions/${sessionId}/run`, { ...(custom !== undefined ? { custom } : { cellId }), ...(flags && Object.keys(flags).length ? { flags } : {}), ...(addedKnobs?.length ? { addedKnobs } : {}) });
    else if (action === 'stop') response = await rehearsalRequest(env, `/sessions/${sessionId}/stop`, {});
    else if (action === 'file') response = await rehearsalRequest(env, `/sessions/${sessionId}/runs/${runId}/files/${body.path.split('/').map(encodeURIComponent).join('/')}`);
    else response = await rehearsalRequest(env, `/sessions/${sessionId}/runs/${runId}${action === 'log' ? '/log' : ''}`);
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      if (env.LEARN_DB && [404, 410].includes(response.status) && ['poll', 'run', 'log', 'stop'].includes(action)) await endCompute(env.LEARN_DB, env, sessionId).catch(() => null);
      if (PASS.includes(response.status) || (action === 'file' && response.status === 403 && typeof detail?.error === 'string')) { // a file's 403 is the controller's own "binary, never served", not a credential problem
        return json({ error: typeof detail?.error === 'string' ? detail.error : `The run controller refused the request (${response.status})` }, response.status);
      }
      if ([401, 403].includes(response.status)) return json({ error: rejected(response.status) }, 502);
      return json({ error: 'rehearsal_unavailable' }, 503);
    }
    // A machine's meter: an ended session settles its entry; one still running that has used up the allowance is stopped here (the hard stop, never a silent provider termination).
    if (env.LEARN_DB && ['start', 'stop', 'poll'].includes(action)) {
      const user = meterUser(access);
      if (action === 'poll') {
        const mine = await env.LEARN_DB.prepare("SELECT 1 AS found FROM compute_entries WHERE entry_id = ? AND user_id = ? AND status = 'running'").bind(sessionId, user).first();
        if (mine && (await computeUsage(env.LEARN_DB, env, user, { limit: 0 })).remainingMicros <= 0) {
          await rehearsalRequest(env, `/sessions/${sessionId}/stop`, {}).catch(() => null);
          await endCompute(env.LEARN_DB, env, sessionId);
          return json({ error: 'compute_out' }, 410);
        }
      } else {
        const state = await response.clone().json().catch(() => null);
        if (state?.sessionId && action === 'start') await beginCompute(env.LEARN_DB, env, entryFromSession(state, { userId: user, appId: body.app, repo: repo.repo, commit: repo.commit, routeId: routeId ?? null, routeTitle: catalogue?.routes?.find(r => r.routeId === routeId)?.title ?? null }));
        if (action === 'stop') await endCompute(env.LEARN_DB, env, sessionId, { endedAt: endedAtOf(state) ?? undefined });
      }
    }
    // shortcut: the log is cut to its last MAX_LOG characters here; the controller already bounds it, page it if a run ever needs more.
    if (action === 'log') return json({ log: (await response.text()).slice(-MAX_LOG) });
    if (action === 'file') { // the bytes as the controller typed them (an SVG is text/plain there; image/svg+xml is never passed on), never cached, never sniffed, never able to run script
      const type = response.headers.get('Content-Type') || 'application/octet-stream';
      return new Response(response.body, { status: 200, headers: { 'Content-Type': /^image\/svg/i.test(type) ? 'text/plain; charset=utf-8' : type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Content-Disposition': 'inline' } });
    }
    return json(await response.json(), response.status);
  } catch (error) {
    console.error('run route', error.message);
    return json({ error: /not configured|requires HTTPS/.test(error.message) ? error.message : 'rehearsal_unavailable' }, 503);
  }
}
