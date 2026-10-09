// Tutor evaluation archive (learn-migrations/0017, after 0015 folders and 0016 usage): byte-exact artifacts of an offline evaluation run, chunked into
// the Learn D1, owner-only. Import: declare the execution, put every chunk, then complete, which re-hashes every
// artifact from its chunks. An interrupted import stays incomplete (completed_at NULL) and lists what is missing.
import { createHash } from 'node:crypto';

export const CHUNK_BYTES = 512 * 1024; // D1 holds about 1 MB a row; half leaves room for the row itself
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();

// -> { execution_id, run_id, run_date, analysis_version, ... } from a run.json manifest, or a thrown Error.
export const STATUSES = ['running', 'checkpointed', 'completed', 'stopped', 'failed', 'partial'];
export const MODES = ['real', 'scripted'];
// The identity and outcome fields a manifest must carry; cost is nullable and never defaulted to 0.
export function executionFromManifest(manifest, { importedBy, sourceSha, testedTree, artifactCount }) {
  for (const k of ['run_id', 'run_date', 'analysis_version', 'harness_version', 'eval_schema_version', 'topic', 'mode', 'config_version', 'status']) if (manifest[k] == null) throw new Error(`manifest lacks ${k}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.run_date)) throw new Error('manifest run_date is not YYYY-MM-DD');
  if (!MODES.includes(manifest.mode)) throw new Error(`manifest mode must be one of ${MODES.join(', ')}`);
  if (!STATUSES.includes(manifest.status)) throw new Error(`manifest status must be one of ${STATUSES.join(', ')}`);
  if (manifest.jev_cost_usd != null && !(Number.isFinite(manifest.jev_cost_usd) && manifest.jev_cost_usd >= 0)) throw new Error('manifest jev_cost_usd must be a non-negative number or null');
  for (const [k, v] of [['sourceSha', sourceSha], ['testedTree', testedTree]]) if (!/^[0-9a-f]{40}$/.test(v || '')) throw new Error(`${k} must be a full 40-hex id`);
  return {
    execution_id: `${manifest.run_id}:${manifest.analysis_version}`, run_id: manifest.run_id, run_date: manifest.run_date,
    analysis_version: String(manifest.analysis_version), harness_version: String(manifest.harness_version),
    eval_schema_version: Number(manifest.eval_schema_version), source_sha: sourceSha, tested_tree: testedTree,
    topic: String(manifest.topic), mode: manifest.mode, config_version: String(manifest.config_version),
    jev_cost_usd: manifest.jev_cost_usd ?? null, jev_cost_note: manifest.jev_cost_note ?? null,
    imported_by: importedBy, artifact_count: artifactCount, status: manifest.status,
  };
}

export const chunksOf = bytes => { const out = []; for (let i = 0; i < bytes.length; i += CHUNK_BYTES) out.push(bytes.subarray(i, i + CHUNK_BYTES)); return out.length ? out : [Buffer.alloc(0)]; };

export class TutorEvalArchive {
  constructor(db) { this.db = db; }

  // Declares an execution. A second declaration of the same execution is refused: duplicate imports never merge.
  async declare(execution) {
    const have = await this.db.prepare('SELECT execution_id, completed_at FROM tutor_eval_executions WHERE execution_id = ?').bind(execution.execution_id).first();
    if (have) throw new Error(`execution ${execution.execution_id} already ${have.completed_at ? 'archived' : 'started'}: an import is never repeated in place`);
    const cols = ['execution_id', 'run_id', 'run_date', 'analysis_version', 'harness_version', 'eval_schema_version', 'source_sha', 'tested_tree', 'topic', 'mode', 'config_version', 'jev_cost_usd', 'jev_cost_note', 'imported_by', 'artifact_count', 'status'];
    await this.db.prepare(`INSERT INTO tutor_eval_executions (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map(c => execution[c])).run();
    return execution.execution_id;
  }

  // Puts one artifact's bytes as chunks. Re-putting identical bytes is a no-op; different bytes under the same key are refused.
  async put(executionId, key, kind, bytes) {
    const hash = sha256(bytes), chunks = chunksOf(bytes);
    const have = await this.db.prepare('SELECT sha256, byte_length FROM tutor_eval_artifacts WHERE execution_id = ? AND artifact_key = ?').bind(executionId, key).first();
    if (have && have.sha256 !== hash) throw new Error(`artifact ${key} of ${executionId} already holds different bytes (sha256 ${have.sha256.slice(0, 12)}, not ${hash.slice(0, 12)})`);
    if (!have) await this.db.prepare('INSERT INTO tutor_eval_artifacts (execution_id, artifact_key, kind, byte_length, sha256, chunk_count) VALUES (?, ?, ?, ?, ?, ?)').bind(executionId, key, kind, bytes.length, hash, chunks.length).run();
    for (const [seq, chunk] of chunks.entries()) {
      const prior = await this.db.prepare('SELECT sha256 FROM tutor_eval_artifact_chunks WHERE execution_id = ? AND artifact_key = ? AND seq = ?').bind(executionId, key, seq).first();
      const chunkHash = sha256(chunk);
      if (prior?.sha256 === chunkHash) continue;
      if (prior) throw new Error(`chunk ${seq} of ${key} already holds different bytes`);
      await this.db.prepare('INSERT INTO tutor_eval_artifact_chunks (execution_id, artifact_key, seq, bytes, sha256) VALUES (?, ?, ?, ?, ?)').bind(executionId, key, seq, chunk, chunkHash).run();
    }
    await this.db.prepare('UPDATE tutor_eval_artifacts SET verified_at = ? WHERE execution_id = ? AND artifact_key = ? AND sha256 = ?').bind(now(), executionId, key, sha256(await this.bytes(executionId, key))).run();
  }

  // Reassembles an artifact's exact bytes, or throws when a chunk is missing.
  async bytes(executionId, key) {
    const meta = await this.db.prepare('SELECT chunk_count, byte_length, sha256 FROM tutor_eval_artifacts WHERE execution_id = ? AND artifact_key = ?').bind(executionId, key).first();
    if (!meta) throw new Error(`no artifact ${key} in ${executionId}`);
    const { results } = await this.db.prepare('SELECT seq, bytes FROM tutor_eval_artifact_chunks WHERE execution_id = ? AND artifact_key = ? ORDER BY seq').bind(executionId, key).all();
    if (results.length !== meta.chunk_count || results.some((r, i) => r.seq !== i)) throw new Error(`artifact ${key} of ${executionId} is incomplete: ${results.length} of ${meta.chunk_count} chunks`);
    const out = Buffer.concat(results.map(r => Buffer.from(r.bytes)));
    if (out.length !== meta.byte_length || sha256(out) !== meta.sha256) throw new Error(`artifact ${key} of ${executionId} does not reassemble to its recorded sha256`);
    return out;
  }

  // -> { complete: true } once every declared artifact is whole and verified, else { complete: false, missing: [...] }.
  async status(executionId) {
    const exec = await this.db.prepare('SELECT artifact_count, completed_at FROM tutor_eval_executions WHERE execution_id = ?').bind(executionId).first();
    if (!exec) throw new Error(`no execution ${executionId}`);
    const { results } = await this.db.prepare('SELECT artifact_key, verified_at FROM tutor_eval_artifacts WHERE execution_id = ? ORDER BY artifact_key').bind(executionId).all();
    const missing = results.filter(r => !r.verified_at).map(r => `${r.artifact_key}: not verified`);
    if (results.length < exec.artifact_count) missing.push(`${exec.artifact_count - results.length} of ${exec.artifact_count} artifacts never put`);
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

  async list() { return (await this.db.prepare('SELECT execution_id, run_id, run_date, analysis_version, topic, mode, config_version, status, jev_cost_usd, artifact_count, started_at, completed_at FROM tutor_eval_executions ORDER BY run_date, started_at').all()).results; }
}
