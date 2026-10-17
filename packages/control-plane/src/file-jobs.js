// Durable file-conversion jobs (docs/features/canvas-file-imports.md section 5; converter half:
// docs/features/canvas-file-converter.md section 1). D1 `file_jobs` is the truth; one FileJobs Durable Object per job
// advances it on alarms, never cron and never a browser. The converter is a remote HTTP service that reports back by
// callbacks scoped to one (job, attempt); only the current attempt of a live job can change anything, so a late, repeated
// or cancelled result is a no-op. A job never writes board JSON: a card shows a job only while it still references it.
import { repositoryIdentity } from './repositories.js';
import { authorizeFileSource } from './file-access.js';
import { learnMedia } from './learn-storage.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const ACTIVE = ['validating', 'converting', 'preparing_preview'];
export const TERMINAL = ['ready', 'ready_with_limitations', 'failed', 'cancelled'];
const TERMINAL_SQL = `('${TERMINAL.join("','")}')`, ACTIVE_SQL = `('${ACTIVE.join("','")}')`;
// The converter's own names (canvas-file-converter.md 1.6) and the families each may take.
export const CONVERTERS = { 'office-pdf': ['word'], slides: ['presentation'], 'audio-playback': ['audio'], 'step-glb': ['cad'] };
export const LIMITS = {
  leaseMs: 90_000,            // a heartbeat every 20 s extends it; three missed ones and the attempt is presumed dead
  maxAttempts: 3,             // automatic attempts per submit or Retry
  maxDispatchWaits: 40,       // busy/unreachable converter re-dispatches of one attempt (about an hour at the cap)
  concurrency: 2,             // active attempts across all jobs (FILE_JOB_CONCURRENCY overrides)
  outputBytes: 50 * 1024 * 1024, // one output (converter 1.6)
  outputs: 400,
  tokenMs: 20 * 60 * 1000,    // callback token life: the converter's 300 s hard timeout plus margin
  backoffMs: 5_000,           // the first retry's wait; doubles per attempt, capped at 5 min
};
export const backoffMs = n => Math.min(LIMITS.backoffMs * 2 ** Math.max(0, n - 1), 300_000);
const FAILURES = {
  unsupported_format: 'This file format is not supported by the converter.',
  invalid_source: 'The file could not be read. It may be damaged.',
  source_mismatch: 'The stored file did not match its record.',
  timeout: 'Conversion took longer than its time limit.',
  memory_limit_exceeded: 'The file needs more memory than conversion allows.',
  output_too_large: 'The converted result is over the size limit.',
  too_complex: 'The file is too complex to convert.',
};
const reason = code => FAILURES[code] || 'Conversion failed.';
const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const randomId = prefix => `${prefix}_${hex(crypto.getRandomValues(new Uint8Array(12)))}`;
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const concurrency = env => Math.max(1, Number(env.FILE_JOB_CONCURRENCY) || LIMITS.concurrency);

// ---- callback tokens: HMAC over (job, attempt, expiry) with FILE_JOB_SECRET, never CONVERT_TOKEN, so the converter cannot
// mint a token for another job's source.
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const hmacKey = env => {
  if (!env.FILE_JOB_SECRET || env.FILE_JOB_SECRET.length < 32) throw new Error(NOT_CONFIGURED);
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.FILE_JOB_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
};
export async function callbackToken(env, job, attempt, now = Date.now()) {
  const exp = now + LIMITS.tokenMs;
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(`fj|${job}|${attempt}|${exp}`));
  return { token: `v1.${exp}.${b64url(mac)}`, expires_at: new Date(exp).toISOString() };
}
// Whether the request carries an unexpired token minted for this (job, attempt). crypto.subtle.verify compares in
// constant time.
export async function tokenValid(env, req, job, attempt, now = Date.now()) {
  const m = /^Bearer v1\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(req.headers.get('authorization') || '');
  if (!m || Number(m[1]) < now || !(attempt >= 1)) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(env), unb64url(m[2]), new TextEncoder().encode(`fj|${job}|${attempt}|${m[1]}`));
}

// ---- the converter's service API (canvas-file-converter.md 1.2)
const NOT_CONFIGURED = 'File conversion is not configured on this server.';
// HTTPS, or plain HTTP to this machine for a local stack's stub converter.
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i;
const configured = env => (/^https:\/\//i.test(env.CONVERT_URL || '') || LOCAL.test(env.CONVERT_URL || '')) && !!env.CONVERT_TOKEN && /^https?:\/\//i.test(env.FILE_JOB_ORIGIN || '') && (env.FILE_JOB_SECRET || '').length >= 32;
async function converter(env, path, body) {
  if (!configured(env)) throw new Error(NOT_CONFIGURED);
  return fetch(new URL(path, env.CONVERT_URL), {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${env.CONVERT_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const jobRow = (db, id) => db.prepare('SELECT * FROM file_jobs WHERE id = ?').bind(id).first();
const changed = result => (result?.meta?.changes ?? 0) > 0;
const kick = async (env, id, delayMs = 0) => {
  const stub = env.FILE_JOBS.get(env.FILE_JOBS.idFromName(id));
  const r = await stub.fetch('https://file-jobs/kick', { method: 'POST', body: JSON.stringify({ id, delayMs }) });
  if (!r.ok) throw new Error('The job runner did not accept the job');
};

// What the browser sees. Share viewers get the same shape; no owner, org or token.
export const publicJob = row => ({
  id: row.id, state: row.state, stage: row.stage, attempt: row.attempt, card: row.card_id, source: row.source_id,
  converter: row.converter, error: row.error || null, limitations: JSON.parse(row.limitations_json || '[]'),
  derivatives: JSON.parse(row.derivative_ids_json || '[]'), cancelRequested: !!row.cancel_requested,
  created_at: row.created_at, updated_at: row.updated_at, finished_at: row.finished_at || null,
});

// ---- submit: the row is written (idempotency key unique) before the runner is told; a repeated submit is the same job.
export async function submitJob(env, user, sourceId, body, now = Date.now()) {
  const db = env.LEARN_DB;
  const { converter: name, options = {}, card, app, board = 'main', idempotency_key: key } = body || {};
  if (!Object.hasOwn(CONVERTERS, name)) return json({ error: 'Unknown converter' }, 400);
  if (typeof key !== 'string' || !/^[A-Za-z0-9:_.-]{8,128}$/.test(key)) return json({ error: 'An idempotency key is required' }, 400);
  if (typeof card !== 'string' || !card || card.length > 200 || typeof app !== 'string' || typeof board !== 'string') return json({ error: 'The card and board are required' }, 400);
  if (!options || typeof options !== 'object' || Array.isArray(options) || JSON.stringify(options).length > 2000) return json({ error: 'Invalid options' }, 400);
  // Writes need write access to the board: its owner today (contract 4.1).
  const boardRow = await db.prepare('SELECT id FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = ?').bind(user.org, user.email, app, board).first();
  if (!boardRow) return json({ error: 'Board not found' }, 404);
  const source = await db.prepare("SELECT * FROM file_sources WHERE id = ? AND org = ? AND owner_email = ? AND status = 'stored'").bind(sourceId, user.org, user.email).first();
  if (!source) return json({ error: 'File not found or not uploaded yet' }, 404);
  if (!CONVERTERS[name].includes(source.family)) return json({ error: `The ${name} converter does not take ${source.family} files` }, 400);
  const optionsJson = canonical(options), id = randomId('fj');
  await db.prepare(`INSERT OR IGNORE INTO file_jobs(id, org, owner_email, app, board_id, card_id, source_id, source_sha256, converter, options_json,
      idempotency_key, state, stage, attempt, max_attempts, cancel_requested, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', 1, ?, 0, ?, ?)`)
    .bind(id, user.org, user.email, app, boardRow.id, card, source.id, source.sha256, name, optionsJson, key, LIMITS.maxAttempts, now, now).run();
  const row = await db.prepare('SELECT * FROM file_jobs WHERE org = ? AND owner_email = ? AND idempotency_key = ?').bind(user.org, user.email, key).first();
  if (row.source_id !== source.id || row.converter !== name || row.options_json !== optionsJson || row.card_id !== card)
    return json({ error: 'This idempotency key belongs to a different job' }, 409);
  const created = row.id === id;
  if (!TERMINAL.includes(row.state)) {
    try { await kick(env, row.id); } catch { return json({ job: publicJob(row), created, error: 'Saved; the runner will be reached on the next submit.' }, 503); }
  }
  return json({ job: publicJob(row), created }, created ? 201 : 200);
}

// ---- one bounded step of a job, run by the Durable Object's alarm. Returns the delay to the next alarm, or null when
// the job needs no more. `memo` is the object's own storage for re-dispatch counters (not truth).
export async function stepJob(env, id, memo, now = Date.now()) {
  const db = env.LEARN_DB;
  const row = await jobRow(db, id);
  if (!row || TERMINAL.includes(row.state)) return null;
  const guard = 'id = ? AND attempt = ? AND state = ?', at = [row.id, row.attempt, row.state];
  const settle = (state, error = null) => db.prepare(`UPDATE file_jobs SET state = ?, stage = ?, error = ?, lease_until = NULL, finished_at = ?, updated_at = ? WHERE ${guard}`)
    .bind(state, state, error, now, now, ...at).run();
  if (row.cancel_requested) {
    if (ACTIVE.includes(row.state)) await converter(env, `/jobs/${row.id}/${row.attempt}/cancel`).catch(() => {});
    // A settle that lost a race (the row moved on) looks again rather than dropping the job.
    return changed(await settle('cancelled')) ? null : 1_000;
  }
  if (row.state === 'queued') {
    if (!configured(env)) { await settle('failed', NOT_CONFIGURED); return null; }
    const waits = (await memo.get(`waits:${row.attempt}`)) || 0, notBefore = (await memo.get(`notBefore:${row.attempt}`)) || 0;
    if (now < notBefore) return notBefore - now;
    const wait = async () => {
      if (waits + 1 >= LIMITS.maxDispatchWaits) { await settle('failed', 'The converter is unavailable. Retry later.'); return null; }
      await memo.put(`waits:${row.attempt}`, waits + 1);
      return Math.min(LIMITS.backoffMs * (waits + 1), 120_000);
    };
    // Lease and concurrency are claimed in one statement, so two objects can never both take the last slot.
    const claim = await db.prepare(`UPDATE file_jobs SET state = 'validating', stage = 'validating', lease_until = ?, updated_at = ?, started_at = COALESCE(started_at, ?)
      WHERE ${guard} AND cancel_requested = 0 AND (lease_until IS NULL OR lease_until < ?)
        AND (SELECT COUNT(*) FROM file_jobs WHERE state IN ${ACTIVE_SQL} AND lease_until > ?) < ?`)
      .bind(now + LIMITS.leaseMs, now, now, ...at, now, now, concurrency(env)).run();
    // No free slot (or a cancel raced the claim): look again shortly; waiting in line never counts against the job.
    if (!changed(claim)) return LIMITS.backoffMs + Math.floor(Math.random() * LIMITS.backoffMs / 2);
    const source = await db.prepare('SELECT bytes, sha256, media_type FROM file_sources WHERE id = ?').bind(row.source_id).first();
    const base = new URL(`/api/learn/files/jobs/${row.id}/`, env.FILE_JOB_ORIGIN);
    let r;
    try {
      r = await converter(env, '/jobs', {
        schema: 'file-convert/1', job_id: row.id, attempt: row.attempt, converter: row.converter, options: JSON.parse(row.options_json || '{}'),
        source: { url: new URL('source', base).href, bytes: source.bytes, sha256: row.source_sha256, media_type: source.media_type },
        callback: { url: new URL(`attempts/${row.attempt}`, base).href, ...(await callbackToken(env, row.id, row.attempt, now)) },
      });
    } catch { r = null; }
    if (r && (r.status === 202 || r.status === 200)) return LIMITS.leaseMs + 1_000;
    const unclaim = () => db.prepare(`UPDATE file_jobs SET state = 'queued', stage = 'queued', lease_until = NULL, updated_at = ? WHERE id = ? AND attempt = ? AND state = 'validating'`).bind(now, row.id, row.attempt).run();
    // Busy, draining, degraded, unreachable: the same attempt again later, never a new one (converter 1.3).
    if (!r || [429, 502, 503, 504].includes(r.status) || r.status >= 500) { await unclaim(); return wait(); }
    const body = await r.json().catch(() => ({}));
    await db.prepare(`UPDATE file_jobs SET state = 'failed', stage = 'failed', error = ?, lease_until = NULL, finished_at = ?, updated_at = ? WHERE id = ? AND attempt = ? AND state = 'validating'`)
      .bind(r.status === 409 ? 'The converter already holds a newer attempt of this job.' : `The converter refused the job${body.error ? `: ${String(body.error).slice(0, 200)}` : '.'}`, now, now, row.id, row.attempt).run();
    return null;
  }
  // Active: the heartbeat keeps the lease. Past it the attempt is presumed dead (machine killed, process lost): the next
  // attempt starts from the stored source; the old one can no longer commit.
  if (row.lease_until > now) return row.lease_until - now + 1_000;
  if (row.attempt >= row.max_attempts) {
    return changed(await settle('failed', `Conversion stopped responding ${row.attempt} times. Retry to try again.`)) ? null : 1_000;
  }
  const next = await db.prepare(`UPDATE file_jobs SET attempt = attempt + 1, state = 'queued', stage = 'queued', lease_until = NULL, updated_at = ? WHERE ${guard} AND lease_until <= ?`)
    .bind(now, ...at, now).run();
  if (!changed(next)) return 1_000;
  await converter(env, `/jobs/${row.id}/${row.attempt}/cancel`).catch(() => {});
  const delay = backoffMs(row.attempt);
  await memo.put(`notBefore:${row.attempt + 1}`, now + delay);
  return delay;
}

export class FileJobs {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(req) {
    const { id, delayMs = 0 } = await req.json();
    if (typeof id !== 'string' || !/^fj_[a-f0-9]{24}$/.test(id)) return json({ error: 'Invalid job' }, 400);
    await this.state.storage.put('id', id);
    const at = Date.now() + Math.max(50, Math.min(Number(delayMs) || 0, 300_000)), current = await this.state.storage.getAlarm();
    if (!current || current > at) await this.state.storage.setAlarm(at);
    return json({ ok: true });
  }
  async alarm() {
    const id = await this.state.storage.get('id');
    if (!id) return;
    // A throw (D1 or R2 unavailable) leaves the lease to expire; the job's own re-arm below keeps it alive past the
    // platform's alarm retries, and the next step recovers.
    let delay;
    try { delay = await stepJob(this.env, id, this.state.storage); }
    catch (error) { console.error('file job step failed', id, error?.message); delay = 30_000; }
    if (delay != null) await this.state.storage.setAlarm(Date.now() + delay);
    else await this.state.storage.deleteAll();
  }
}

// ---- converter callbacks (converter 1.5), each guarded on attempt = current and the job not settled.
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/, HEX64 = /^[a-f0-9]{64}$/;
const stagingKey = (job, attempt, name) => `file-jobs/${job}/${attempt}/${name}`;
const stale = () => json({ error: 'stale attempt' }, 409);
const liveFor = (row, attempt) => row && row.attempt === attempt && !row.cancel_requested && !TERMINAL.includes(row.state);

async function readBounded(req, cap) {
  const declared = Number(req.headers.get('content-length'));
  if (!(declared >= 0 && declared <= cap)) return null;
  const bytes = new Uint8Array(await req.arrayBuffer());
  return bytes.byteLength === declared ? bytes : null;
}

async function putOutput(env, req, row, attempt, name) {
  if (!NAME.test(name)) return json({ error: 'Invalid output name' }, 400);
  const declared = (req.headers.get('x-content-sha256') || '').toLowerCase();
  if (!HEX64.test(declared)) return json({ error: 'X-Content-SHA256 is required' }, 400);
  const bucket = learnMedia(env), key = stagingKey(row.id, attempt, name);
  const existing = await bucket.head(key);
  if (existing) return existing.customMetadata?.sha256 === declared ? json({ unchanged: true }) : json({ error: 'Different bytes are already staged under this name' }, 409);
  const bytes = await readBounded(req, LIMITS.outputBytes);
  if (!bytes) return json({ error: 'Output is missing its length or over 50 MiB' }, 413);
  if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== declared) return json({ error: 'Output does not match its SHA-256' }, 422);
  // ponytail: buffered once (50 MiB cap); a FixedLengthStream + R2 sha256 check would stream it when outputs grow.
  await bucket.put(key, bytes, { sha256: declared, httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { sha256: declared, bytes: String(bytes.byteLength) } });
  return json({ stored: true }, 201);
}

const MANIFEST_OUTPUT = o => o && NAME.test(o.name) && /^[a-z_]{1,32}$/.test(o.kind) && typeof o.media_type === 'string' && o.media_type.length <= 100
  && Number.isSafeInteger(o.bytes) && o.bytes >= 0 && o.bytes <= LIMITS.outputBytes && HEX64.test(o.sha256);

async function complete(env, row, attempt, manifest, now) {
  const db = env.LEARN_DB;
  // A repeated identical complete of the committed attempt is 200, never a second commit.
  if (row.attempt === attempt && ['ready', 'ready_with_limitations'].includes(row.state)) return json({ committed: true, repeat: true });
  if (!liveFor(row, attempt)) return stale();
  const outputs = manifest?.outputs;
  if (manifest?.schema !== 'file-convert-result/1' || manifest.job_id !== row.id || manifest.attempt !== attempt || manifest.converter !== row.converter
    || typeof manifest.converter_version !== 'string' || !manifest.converter_version || manifest.converter_version.length > 200
    || !Array.isArray(outputs) || !outputs.length || outputs.length > LIMITS.outputs || !outputs.every(MANIFEST_OUTPUT)
    || new Set(outputs.map(o => o.name)).size !== outputs.length) return json({ error: 'Invalid manifest' }, 400);
  const limitations = (Array.isArray(manifest.limitations) ? manifest.limitations : []).filter(t => typeof t === 'string').slice(0, 20).map(t => t.slice(0, 300));
  const bucket = learnMedia(env);
  for (const o of outputs) {
    const staged = await bucket.head(stagingKey(row.id, attempt, o.name));
    if (staged?.customMetadata?.sha256 !== o.sha256 || Number(staged.customMetadata.bytes) !== o.bytes) return json({ error: `Output ${o.name} is missing or differs` }, 422);
  }
  const optionsHash = await sha256(row.options_json || '{}'), coverage = manifest.coverage && typeof manifest.coverage === 'object' ? manifest.coverage : null;
  // Copy to the source's derivative keys before the commit. A derivative id is per attempt, so a copy never overwrites a
  // committed object; until the batch below no row points at it, so a crash here leaves nothing anyone reads.
  const rows = [];
  for (const o of outputs) {
    const id = `fd_${(await sha256(`${row.id}|${attempt}|${o.name}`)).slice(0, 24)}`, key = `file-sources/${row.source_id}/d/${id}`;
    if (!(await bucket.head(key))) {
      const staged = await bucket.get(stagingKey(row.id, attempt, o.name));
      await bucket.put(key, await staged.arrayBuffer(), { sha256: o.sha256, httpMetadata: { contentType: o.media_type }, customMetadata: { sha256: o.sha256, source: row.source_id } });
    }
    rows.push({ ...o, id, key, coverage_json: JSON.stringify({ meta: o.meta ?? null, coverage }).slice(0, 2000) });
  }
  const live = `EXISTS (SELECT 1 FROM file_jobs WHERE id = ? AND attempt = ? AND cancel_requested = 0 AND state NOT IN ${TERMINAL_SQL})`;
  const state = limitations.length ? 'ready_with_limitations' : 'ready';
  // The one commit: every derivative and the job's result, guarded on the attempt, in one D1 batch (one transaction).
  // A derivative already made for this source revision, converter version and options is kept, never duplicated.
  const results = await db.batch([
    ...rows.map(o => db.prepare(`INSERT OR IGNORE INTO file_derivatives(id, source_id, source_sha256, kind, name, converter, converter_version, options_hash, status,
        media_type, bytes, sha256, r2_key, coverage_json, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ? WHERE ${live}`)
      .bind(o.id, row.source_id, row.source_sha256, o.kind, o.name, row.converter, manifest.converter_version, optionsHash, o.media_type, o.bytes, o.sha256, o.key, o.coverage_json, now, now, row.id, attempt)),
    db.prepare(`UPDATE file_jobs SET state = ?, stage = ?, converter_version = ?, limitations_json = ?, lease_until = NULL, finished_at = ?, updated_at = ?,
        derivative_ids_json = (SELECT json_group_array(id) FROM (SELECT id FROM file_derivatives WHERE source_id = ? AND source_sha256 = ? AND converter_version = ? AND options_hash = ? AND name IN (${rows.map(() => '?').join(',')}) ORDER BY name))
      WHERE id = ? AND attempt = ? AND cancel_requested = 0 AND state NOT IN ${TERMINAL_SQL}`)
      .bind(state, state, manifest.converter_version, JSON.stringify(limitations), now, now, row.source_id, row.source_sha256, manifest.converter_version, optionsHash, ...rows.map(o => o.name), row.id, attempt),
  ]);
  return changed(results.at(-1)) ? json({ committed: true }) : stale();
}

async function fail(env, row, attempt, body, now) {
  if (!liveFor(row, attempt) && !(row && row.attempt === attempt && row.cancel_requested && !TERMINAL.includes(row.state))) return stale();
  const db = env.LEARN_DB, code = typeof body?.error === 'string' ? body.error : '';
  if (row.cancel_requested) {
    await db.prepare(`UPDATE file_jobs SET state = 'cancelled', stage = 'cancelled', lease_until = NULL, finished_at = ?, updated_at = ? WHERE id = ? AND attempt = ? AND state NOT IN ${TERMINAL_SQL}`).bind(now, now, row.id, attempt).run();
    return json({ settled: 'cancelled' });
  }
  if (body?.retryable === true && attempt < row.max_attempts) {
    const r = await db.prepare(`UPDATE file_jobs SET attempt = attempt + 1, state = 'queued', stage = 'queued', lease_until = NULL, updated_at = ? WHERE id = ? AND attempt = ? AND state NOT IN ${TERMINAL_SQL}`).bind(now, row.id, attempt).run();
    if (changed(r)) await kick(env, row.id, backoffMs(attempt)).catch(() => {}); // the lease would wake it anyway
    return json({ settled: 'retrying' });
  }
  await db.prepare(`UPDATE file_jobs SET state = 'failed', stage = 'failed', error = ?, lease_until = NULL, finished_at = ?, updated_at = ? WHERE id = ? AND attempt = ? AND state NOT IN ${TERMINAL_SQL}`)
    .bind(reason(code), now, now, row.id, attempt).run();
  return json({ settled: 'failed' });
}

async function callback(env, req, row, attempt, action, name, now) {
  const db = env.LEARN_DB;
  if (action === 'source') {
    if (!liveFor(row, attempt)) return stale();
    const source = await db.prepare("SELECT r2_key, bytes, sha256 FROM file_sources WHERE id = ? AND sha256 = ? AND status = 'stored'").bind(row.source_id, row.source_sha256).first();
    const object = source && await learnMedia(env).get(source.r2_key);
    if (!object) return json({ error: 'Source unavailable' }, 404);
    return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(source.bytes), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (action === 'progress') {
    const body = await req.json().catch(() => null);
    if (!ACTIVE.includes(body?.stage)) return json({ error: 'Invalid stage' }, 400);
    // Also from 'queued' of the same attempt: a dispatch whose answer was lost still ran.
    const r = await db.prepare(`UPDATE file_jobs SET state = ?, stage = ?, lease_until = ?, updated_at = ? WHERE id = ? AND attempt = ? AND cancel_requested = 0 AND state IN ('queued', ${ACTIVE.map(s => `'${s}'`).join(', ')})`)
      .bind(body.stage, body.stage, now + LIMITS.leaseMs, now, row.id, attempt).run();
    return changed(r) ? json({ lease_until: now + LIMITS.leaseMs }) : stale();
  }
  if (action === 'outputs') return liveFor(row, attempt) ? putOutput(env, req, row, attempt, name) : stale();
  const text = await req.text();
  if (text.length > 256_000) return json({ error: 'Manifest too large' }, 413);
  let body; try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
  return action === 'complete' ? complete(env, row, attempt, body, now) : fail(env, row, attempt, body, now);
}

// ---- who may read a job's status (contract 4.1, file-access.js): the job's initiator, or a viewer the source check admits
// through a share/publication link whose board is the job's own board and still holds a card on this job.
async function readable(req, env, row) {
  const user = await repositoryIdentity(req, env);
  if (!(user instanceof Response) && user.org === row.org && user.email === row.owner_email) return true;
  const token = new URL(req.url).searchParams.get('share');
  if (!token) return false;
  const access = await authorizeFileSource(req, env, row.source_id, { token });
  if (access instanceof Response || String(access.board?.id) !== String(row.board_id)) return false;
  const blocks = JSON.parse(access.board.state_json || '{}').blocks || [];
  return blocks.some(b => b?.fileRef?.job === row.id && b.fileRef.source?.id === row.source_id);
}

const JOB = '(fj_[a-f0-9]{24})';
export async function fileJobsRoute(path, req, env, now = Date.now()) {
  const submitting = path.match(/^\/api\/learn\/files\/(fs_[a-f0-9]{24})\/jobs$/);
  const viewing = path.match(new RegExp(`^/api/learn/files/jobs/${JOB}(?:/(cancel|retry))?$`));
  const calling = path.match(new RegExp(`^/api/learn/files/jobs/${JOB}/(?:(source)|attempts/(\\d{1,3})/(progress|complete|fail|outputs)(?:/([^/]+))?)$`));
  if (!submitting && !viewing && !calling) return null;
  if (!env.LEARN_DB || !env.FILE_JOBS || !learnMedia(env)) return json({ error: 'File conversion is not available on this server.' }, 503);
  if (calling) {
    const [, id, source, n, action, name] = calling;
    const method = source ? 'GET' : action === 'outputs' ? 'PUT' : 'POST';
    if (req.method !== method || (action === 'outputs') !== !!name) return json({ error: 'Method not allowed' }, 405);
    const row = await jobRow(env.LEARN_DB, id);
    // The token names the attempt: an attempt route's own number, the current attempt for the source. A valid token of an
    // older attempt is then refused as stale (409), never committed.
    const attempt = source ? row?.attempt : Number(n);
    if (!row || !(await tokenValid(env, req, id, attempt, now))) return json({ error: 'Unauthorized' }, 401);
    return callback(env, req, row, attempt, source ? 'source' : action, name && decodeURIComponent(name), now);
  }
  if (submitting) {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const user = await repositoryIdentity(req, env);
    if (user instanceof Response) return user;
    return submitJob(env, user, submitting[1], await req.json().catch(() => null), now);
  }
  const [, id, action] = viewing;
  const row = await jobRow(env.LEARN_DB, id);
  if (!action) {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    return row && await readable(req, env, row) ? json({ job: publicJob(row) }) : json({ error: 'Not available' }, 404);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user;
  if (!row || row.org !== user.org || row.owner_email !== user.email) return json({ error: 'Not available' }, 404);
  const db = env.LEARN_DB;
  if (action === 'cancel') {
    // Queued work stops at once; an active attempt is told to stop by the runner, which settles it.
    await db.prepare(`UPDATE file_jobs SET cancel_requested = 1, updated_at = ? WHERE id = ? AND state NOT IN ${TERMINAL_SQL}`).bind(now, id).run();
    await db.prepare("UPDATE file_jobs SET state = 'cancelled', stage = 'cancelled', finished_at = ?, updated_at = ? WHERE id = ? AND state = 'queued' AND cancel_requested = 1").bind(now, now, id).run();
    const after = await jobRow(db, id);
    if (after.cancel_requested && !TERMINAL.includes(after.state)) await kick(env, id).catch(() => {});
    return json({ job: publicJob(after) });
  }
  // Retry: the same job and stored source, the next attempt number, a fresh attempt budget; never a second card.
  const r = await db.prepare(`UPDATE file_jobs SET attempt = attempt + 1, max_attempts = attempt + 1 + ?, state = 'queued', stage = 'queued', cancel_requested = 0,
      error = NULL, limitations_json = NULL, lease_until = NULL, finished_at = NULL, updated_at = ? WHERE id = ? AND state IN ('failed', 'cancelled') AND attempt < 97`)
    .bind(LIMITS.maxAttempts - 1, now, id).run();
  if (!changed(r)) return json({ error: 'Only a failed or cancelled job can be retried' }, 409);
  await kick(env, id).catch(() => {});
  return json({ job: publicJob(await jobRow(db, id)) });
}
