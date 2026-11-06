// Tutor evaluation archive (learn-migrations/0017; contract reviewed by Tutor eval and Parallel 2026-10-09): byte-exact
// originals of an offline evaluation run, chunked into the Learn D1, owner-only. Import: declare the execution
// (resumable: the same declaration again returns it, a different one is refused), put every artifact (identical bytes
// are a no-op, different bytes are refused), then complete, which re-hashes every artifact from its chunks and refuses
// while anything is missing or the count is off. An interrupted import stays incomplete (completed_at NULL).
import { createHash } from 'node:crypto';

export const CHUNK_BYTES = 512 * 1024; // a D1 row holds at most 2,000,000 bytes (platform limits); one chunk plus the row stays far under it
export const STATUSES = ['running', 'checkpointed', 'completed', 'stopped', 'failed', 'partial'];
export const MODES = ['real', 'scripted', 'unknown'];
export const KINDS = { manifest: 'application/json', aggregate: 'application/json', session: 'application/json', log: 'text/plain' };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const HEX40 = /^[0-9a-f]{40}$/;

// The columns of an execution row, in insert order. Fields the importer must state; nothing is defaulted silently.
export const EXECUTION_COLUMNS = ['execution_id', 'run_id', 'run_date', 'run_started_at', 'run_finished_at', 'topic', 'mode', 'status', 'status_note',
  'source_sha', 'tested_tree', 'harness_version', 'config_version', 'anthropic_usd', 'anthropic_calls', 'jev_cost_usd', 'jev_cost_note', 'imported_by', 'artifact_count'];

// -> a validated execution row, or a thrown Error naming the first problem.
export function execution(fields) {
  const e = { status_note: null, run_finished_at: null, config_version: null, anthropic_usd: null, anthropic_calls: null, jev_cost_usd: null, jev_cost_note: null, ...fields };
  for (const k of ['execution_id', 'run_id', 'run_started_at', 'topic', 'mode', 'status', 'source_sha', 'tested_tree', 'harness_version', 'imported_by', 'artifact_count']) if (e[k] == null || e[k] === '') throw new Error(`execution lacks ${k}`);
  if (!ISO.test(e.run_started_at)) throw new Error('run_started_at must be ISO 8601 UTC');
  if (e.run_finished_at != null && !ISO.test(e.run_finished_at)) throw new Error('run_finished_at must be ISO 8601 UTC or null');
  if (!MODES.includes(e.mode)) throw new Error(`mode must be one of ${MODES.join(', ')}`);
  if (!STATUSES.includes(e.status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  for (const k of ['source_sha', 'tested_tree']) if (!HEX40.test(e[k])) throw new Error(`${k} must be a full 40-hex id`);
  for (const k of ['anthropic_usd', 'jev_cost_usd']) if (e[k] != null && !(Number.isFinite(e[k]) && e[k] >= 0)) throw new Error(`${k} must be a non-negative number or null`);
  if (e.anthropic_calls != null && !(Number.isInteger(e.anthropic_calls) && e.anthropic_calls >= 0)) throw new Error('anthropic_calls must be a non-negative integer or null');
  if (!(Number.isInteger(e.artifact_count) && e.artifact_count > 0)) throw new Error('artifact_count must be a positive integer');
  e.run_date = e.run_started_at.slice(0, 10);
  return Object.fromEntries(EXECUTION_COLUMNS.map(c => [c, e[c]]));
}

// What the harness writes today (tests/evals/tutor-session/run.mjs, main 2026-10-09) mapped onto an execution: the
// fallback for manifests without execution_id/mode/status (r27); every mapped value is explicit and overridable.
export function executionFromRunJson(run, over) {
  const config = run.limits || run.models ? createHash('sha256').update(JSON.stringify({ limits: run.limits ?? null, models: run.models ?? null })).digest('hex').slice(0, 12) : null;
  return execution({
    execution_id: run.execution_id, run_id: run.run_id, run_started_at: run.started_at, run_finished_at: run.finished_at ?? null,
    // Unknown unless proven (contract): a run that made Anthropic calls was real.
    topic: run.topic, mode: run.mode ?? (run.anthropic?.calls > 0 ? 'real' : 'unknown'), status: run.status ?? (run.finished_at ? 'completed' : 'partial'),
    source_sha: run.sha, tested_tree: run.tree, harness_version: run.harness_version ?? run.sha, config_version: run.config_version ?? config,
    anthropic_usd: run.anthropic?.total_usd ?? null, anthropic_calls: run.anthropic?.calls ?? null,
    jev_cost_usd: null, jev_cost_note: null, // the importer states why, per run
    ...over,
  });
}

export const chunksOf = bytes => { const out = []; for (let i = 0; i < bytes.length; i += CHUNK_BYTES) out.push(bytes.subarray(i, i + CHUNK_BYTES)); return out.length ? out : [Buffer.alloc(0)]; };

export class TutorEvalArchive {
  constructor(db) { this.db = db; }

  // Declares an execution. Declared again with identical fields it returns the row (a resumed import); with any
  // difference it is refused: a run that happened once is never redescribed.
  async declare(fields) {
    const e = execution(fields);
    const have = await this.db.prepare('SELECT * FROM tutor_eval_executions WHERE execution_id = ?').bind(e.execution_id).first();
    if (have) {
      const diff = EXECUTION_COLUMNS.filter(c => (have[c] ?? null) !== (e[c] ?? null));
      if (diff.length) throw new Error(`execution ${e.execution_id} is already declared with different ${diff.join(', ')}: refused`);
      return { ...have, resumed: true };
    }
    const cols = [...EXECUTION_COLUMNS, 'imported_at'];
    await this.db.prepare(`INSERT INTO tutor_eval_executions (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...EXECUTION_COLUMNS.map(c => e[c]), now()).run();
    return { ...e, imported_at: now(), completed_at: null, resumed: false };
  }

  // Puts one artifact's bytes as chunks. Identical bytes again are a no-op; different bytes under the same key are refused.
  async put(executionId, key, kind, bytes, { analysisVersion = null, contentType = KINDS[kind] } = {}) {
    if (!KINDS[kind]) throw new Error(`kind must be one of ${Object.keys(KINDS).join(', ')}`);
    if (kind === 'aggregate' && !analysisVersion) throw new Error('an aggregate needs its analysis_version');
    if (kind !== 'aggregate' && analysisVersion) throw new Error(`a ${kind} has no analysis_version`);
    const hash = sha256(bytes), chunks = chunksOf(bytes);
    const have = await this.db.prepare('SELECT sha256 FROM tutor_eval_artifacts WHERE execution_id = ? AND artifact_key = ?').bind(executionId, key).first();
    if (have && have.sha256 !== hash) throw new Error(`artifact ${key} of ${executionId} already holds different bytes (sha256 ${have.sha256.slice(0, 12)}, not ${hash.slice(0, 12)})`);
    if (!have) await this.db.prepare('INSERT INTO tutor_eval_artifacts (execution_id, artifact_key, kind, analysis_version, content_type, byte_length, sha256, chunk_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(executionId, key, kind, analysisVersion, contentType, bytes.length, hash, chunks.length).run();
    for (const [seq, chunk] of chunks.entries()) {
      const prior = await this.db.prepare('SELECT sha256 FROM tutor_eval_artifact_chunks WHERE execution_id = ? AND artifact_key = ? AND seq = ?').bind(executionId, key, seq).first();
      const chunkHash = sha256(chunk);
      if (prior?.sha256 === chunkHash) continue;
      if (prior) throw new Error(`chunk ${seq} of ${key} already holds different bytes`);
      await this.db.prepare('INSERT INTO tutor_eval_artifact_chunks (execution_id, artifact_key, seq, bytes, sha256) VALUES (?, ?, ?, ?, ?)').bind(executionId, key, seq, chunk, chunkHash).run();
    }
    await this.db.prepare('UPDATE tutor_eval_artifacts SET verified_at = ? WHERE execution_id = ? AND artifact_key = ? AND sha256 = ?').bind(now(), executionId, key, sha256(await this.bytes(executionId, key))).run();
  }

  // Reassembles an artifact's exact bytes, or throws when a chunk is missing or any byte differs.
  async bytes(executionId, key) {
    const meta = await this.db.prepare('SELECT chunk_count, byte_length, sha256 FROM tutor_eval_artifacts WHERE execution_id = ? AND artifact_key = ?').bind(executionId, key).first();
    if (!meta) throw new Error(`no artifact ${key} in ${executionId}`);
    const { results } = await this.db.prepare('SELECT seq, bytes FROM tutor_eval_artifact_chunks WHERE execution_id = ? AND artifact_key = ? ORDER BY seq').bind(executionId, key).all();
    if (results.length !== meta.chunk_count || results.some((r, i) => r.seq !== i)) throw new Error(`artifact ${key} of ${executionId} is incomplete: ${results.length} of ${meta.chunk_count} chunks`);
    const out = Buffer.concat(results.map(r => Buffer.from(r.bytes)));
    if (out.length !== meta.byte_length || sha256(out) !== meta.sha256) throw new Error(`artifact ${key} of ${executionId} does not reassemble to its recorded sha256`);
    return out;
  }

  // -> { complete, completed_at, missing: [...] }: every declared artifact verified, and exactly artifact_count of them.
  async status(executionId) {
    const exec = await this.db.prepare('SELECT artifact_count, completed_at FROM tutor_eval_executions WHERE execution_id = ?').bind(executionId).first();
    if (!exec) throw new Error(`no execution ${executionId}`);
    const { results } = await this.db.prepare('SELECT artifact_key, verified_at FROM tutor_eval_artifacts WHERE execution_id = ? ORDER BY artifact_key').bind(executionId).all();
    const missing = results.filter(r => !r.verified_at).map(r => `${r.artifact_key}: not verified`);
    const verified = results.length - missing.length;
    if (verified < exec.artifact_count) missing.push(`${verified} of ${exec.artifact_count} artifacts verified`);
    if (results.length > exec.artifact_count) missing.push(`${results.length} artifacts put, ${exec.artifact_count} declared`);
    return { complete: !missing.length && !!exec.completed_at, completed_at: exec.completed_at, missing };
  }

  // Marks the import complete after re-hashing every artifact from its chunks. Refuses while anything is missing.
  async complete(executionId) {
    const s = await this.status(executionId);
    if (s.missing.length) throw new Error(`import of ${executionId} is incomplete: ${s.missing.join('; ')}`);
    const { results } = await this.db.prepare('SELECT artifact_key FROM tutor_eval_artifacts WHERE execution_id = ?').bind(executionId).all();
    for (const { artifact_key } of results) await this.bytes(executionId, artifact_key); // throws on any mismatch
    await this.db.prepare('UPDATE tutor_eval_executions SET completed_at = ? WHERE execution_id = ? AND completed_at IS NULL').bind(now(), executionId).run();
    return this.status(executionId);
  }

  // Owner-only listing (the route checks the principal): filters are exact matches, from/to on run_date.
  async list({ topic, mode, status, sha, from, to } = {}) {
    const where = [], args = [];
    for (const [col, v] of [['topic', topic], ['mode', mode], ['status', status], ['source_sha', sha]]) if (v) { where.push(`${col} = ?`); args.push(v); }
    if (from) { where.push('run_date >= ?'); args.push(from); }
    if (to) { where.push('run_date <= ?'); args.push(to); }
    const sql = `SELECT e.*, (SELECT json_group_array(analysis_version) FROM tutor_eval_artifacts a WHERE a.execution_id = e.execution_id AND a.kind = 'aggregate') AS analysis_versions
      FROM tutor_eval_executions e${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY run_started_at`;
    return (await this.db.prepare(sql).bind(...args).all()).results.map(r => ({ ...r, analysis_versions: JSON.parse(r.analysis_versions) }));
  }

  async artifacts(executionId, { kind } = {}) {
    const sql = `SELECT artifact_key AS key, kind, analysis_version, content_type, byte_length, sha256, verified_at FROM tutor_eval_artifacts WHERE execution_id = ?${kind ? ' AND kind = ?' : ''} ORDER BY artifact_key`;
    return (await this.db.prepare(sql).bind(...(kind ? [executionId, kind] : [executionId])).all()).results;
  }
}
