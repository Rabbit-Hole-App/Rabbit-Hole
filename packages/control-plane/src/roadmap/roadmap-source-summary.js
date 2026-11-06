// R7a bounded summary batches over an index (roadmap-source-index.js). The only model use in R7a. Off with the switch; platform-funded (the injected
// callModel is platformCallModel for the `roadmap_index` role, Lead patch). Nothing here is called by a route or a schedule: Lead mounts the trigger.
//
// Each batch is reserved in D1 BEFORE its call (status 'reserved' with the input hash), so a crash leaves evidence of a call that may have reached the
// provider. On the next run such a batch is 'unknown': it is never retried blind and its range is reported as unread. A completed batch is replayed from D1
// (no call). Budget ceilings (calls, characters, elapsed time) stop the run with a specific reason; earlier successes stay. Summaries are navigation, never evidence.
import { INDEX_LIMITS, longMarkdownEnabled, loadIndexRow, publicIndex, coverageOf } from './roadmap-source-index.js';
import { sha256 } from './roadmap-source.js';
import { INDEX_SYSTEM, INDEX_TOOLS, INDEX_PROMPT_VERSION, batchMessage, validateSummaries } from '../agents/roadmap-index.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
const parse = json => { try { return JSON.parse(json) ?? {}; } catch { return {}; } };
const RESERVE_TTL_S = 600; // a reservation older than this was a run that died after dispatch: its call may have been paid

// Deterministic batches of consecutive chunks, bounded in count and characters.
export function planBatches(chunks, { batchChunks, batchChars } = INDEX_LIMITS.summary) {
  const batches = [];
  for (const c of chunks) {
    const size = c.end - c.start, b = batches.at(-1);
    if (b && b.chunks.length < batchChunks && b.chars + size <= batchChars) { b.chunks.push(c); b.chars += size; } else batches.push({ chunks: [c], chars: size });
  }
  return batches.map((b, i) => ({ no: i, first: b.chunks[0].ordinal, last: b.chunks.at(-1).ordinal, chars: b.chars, chunks: b.chunks }));
}

export const batchRows = async (db, indexId, promptVersion = INDEX_PROMPT_VERSION) =>
  (await db.prepare('SELECT * FROM learn_source_index_batches WHERE index_id = ? AND prompt_version = ? ORDER BY batch_no').bind(indexId, promptVersion).all()).results ?? [];

// Budget totals of one index across every run (persisted in the batch rows: summary_json.attempts / .ms, chars_in x attempts).
export async function spentOf(db, indexId, promptVersion = INDEX_PROMPT_VERSION) {
  const r = await db.prepare(`SELECT COALESCE(SUM(json_extract(summary_json, '$.attempts')), 0) AS calls, COALESCE(SUM(chars_in * json_extract(summary_json, '$.attempts')), 0) AS chars,
    COALESCE(SUM(json_extract(summary_json, '$.ms')), 0) AS ms FROM learn_source_index_batches WHERE index_id = ? AND prompt_version = ?`).bind(indexId, promptVersion).first();
  return { calls: r.calls, chars: r.chars, ms: r.ms };
}

// -> { status: 'ok' | 'partial' | 'unavailable' | 'unsupported', reason?, calls (this run), spent (whole index), summarized, coverage }
// deps: { callModel(role, body) -> parsed message, readSourceForActor, limits?, clock?, now? }
export async function summarizeIndex(env, access, indexId, { callModel, readSourceForActor, limits = INDEX_LIMITS.summary, clock = Date.now, now = nowSeconds() } = {}) {
  if (!longMarkdownEnabled(env)) return { status: 'unavailable', reason: 'not_enabled', calls: 0 };
  if (typeof callModel !== 'function' || typeof readSourceForActor !== 'function') return { status: 'unavailable', reason: 'no_model', calls: 0 };
  const db = env.LEARN_DB, row = await loadIndexRow(db, access, indexId);
  if (!row) return { status: 'unavailable', reason: 'index_unavailable', calls: 0 };
  let got;
  try { got = await readSourceForActor(env, access, { key: row.source_key, rev: row.source_rev }); } catch { got = null; } // the access check
  const text = String(got?.text ?? '');
  if (!got || got.status !== 'ok' || got.rev !== row.source_rev || got.complete === false || row.status !== 'ready' || text.length !== row.total_chars) return { status: 'unavailable', reason: got?.status === 'changed' || row.status === 'stale' ? 'source_changed' : 'index_unavailable', calls: 0 };

  const index = publicIndex(row), existing = new Map((await batchRows(db, indexId)).map(r => [r.batch_no, r]));
  const maxAttempts = limits.maxAttempts ?? INDEX_LIMITS.summary.maxAttempts;
  let calls = 0, stop = null, capped = false;
  const cols = '(index_id, prompt_version, batch_no, org, owner_email, first_chunk, last_chunk, input_hash, chars_in, status, reason, summary_json, created_at, updated_at)';
  // Every transition is a compare-and-set on the row's current status, so two concurrent runs never pay for the same batch and a late writer never
  // overwrites a done batch. The budget (calls, characters, time) is summed over the index's own rows inside the statement that reserves.
  const skip = (b, reason) => db.prepare(`INSERT INTO learn_source_index_batches ${cols} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'skipped', ?, NULL, ?, ?)
    ON CONFLICT (index_id, prompt_version, batch_no) DO UPDATE SET reason = excluded.reason, updated_at = excluded.updated_at WHERE learn_source_index_batches.status = 'skipped'`)
    .bind(indexId, INDEX_PROMPT_VERSION, b.no, access.org, access.actorEmail, b.first, b.last, b.hash, b.chars, reason, now, now).run();
  const reserve = async b => (await db.prepare(`INSERT INTO learn_source_index_batches ${cols}
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', NULL, '{"attempts":1,"ms":0}', ?, ?
    WHERE (SELECT COALESCE(SUM(json_extract(summary_json, '$.attempts')), 0) FROM learn_source_index_batches WHERE index_id = ? AND prompt_version = ?) < ?
      AND (SELECT COALESCE(SUM(chars_in * json_extract(summary_json, '$.attempts')), 0) FROM learn_source_index_batches WHERE index_id = ? AND prompt_version = ?) + ? <= ?
      AND (SELECT COALESCE(SUM(json_extract(summary_json, '$.ms')), 0) FROM learn_source_index_batches WHERE index_id = ? AND prompt_version = ?) < ?
    ON CONFLICT (index_id, prompt_version, batch_no) DO UPDATE SET status = 'reserved', reason = NULL, input_hash = excluded.input_hash, updated_at = excluded.updated_at,
      summary_json = json_set(COALESCE(learn_source_index_batches.summary_json, '{}'), '$.attempts', COALESCE(json_extract(learn_source_index_batches.summary_json, '$.attempts'), 0) + 1)
    WHERE (learn_source_index_batches.status IN ('failed', 'skipped') AND COALESCE(json_extract(learn_source_index_batches.summary_json, '$.attempts'), 0) < ?)
      OR (learn_source_index_batches.status = 'done' AND learn_source_index_batches.input_hash != excluded.input_hash)`)
    .bind(indexId, INDEX_PROMPT_VERSION, b.no, access.org, access.actorEmail, b.first, b.last, b.hash, b.chars, now, now,
      indexId, INDEX_PROMPT_VERSION, limits.maxCalls, indexId, INDEX_PROMPT_VERSION, b.chars, limits.maxChars, indexId, INDEX_PROMPT_VERSION, limits.maxMs, maxAttempts).run()).meta?.changes === 1;
  // Only the run holding the reservation can finish it. A quota refusal never reached a provider, so its attempt is handed back.
  const finish = (b, status, reason, ms, { summaries = null, refund = 0 } = {}) => db.prepare(`UPDATE learn_source_index_batches SET status = ?, reason = ?, updated_at = ?,
    summary_json = json_set(COALESCE(summary_json, '{}'), '$.attempts', COALESCE(json_extract(summary_json, '$.attempts'), 0) - ?, '$.ms', COALESCE(json_extract(summary_json, '$.ms'), 0) + ?${summaries ? ", '$.summaries', json(?)" : ''})
    WHERE index_id = ? AND prompt_version = ? AND batch_no = ? AND status = 'reserved' AND input_hash = ?`)
    .bind(status, reason, now, refund, ms, ...(summaries ? [summaries] : []), indexId, INDEX_PROMPT_VERSION, b.no, b.hash).run();

  for (const b of planBatches(index.chunks, limits)) {
    b.hash = await sha256(JSON.stringify([row.source_rev, INDEX_PROMPT_VERSION, b.first, b.last]));
    const prior = existing.get(b.no);
    if (prior?.status === 'done' && prior.input_hash === b.hash) continue; // replay: a completed result is never paid for twice
    if (prior?.status === 'unknown') continue; // a call may have reached the provider: never retry blind
    if (prior?.status === 'reserved') { // a live reservation belongs to another run; only a stale one is a lost call
      if (now - prior.updated_at > RESERVE_TTL_S) await db.prepare("UPDATE learn_source_index_batches SET status = 'unknown', reason = 'unknown_provider_outcome', updated_at = ? WHERE index_id = ? AND prompt_version = ? AND batch_no = ? AND status = 'reserved' AND updated_at = ?")
        .bind(now, indexId, INDEX_PROMPT_VERSION, b.no, prior.updated_at).run();
      continue;
    }
    if (prior?.status === 'failed' && (parse(prior.summary_json).attempts ?? 0) >= maxAttempts) { capped = true; continue; } // the same invalid answer is not paid for forever
    if (stop) { await skip(b, stop); continue; }
    if (!await reserve(b)) {
      const status = (await db.prepare('SELECT status FROM learn_source_index_batches WHERE index_id = ? AND prompt_version = ? AND batch_no = ?').bind(indexId, INDEX_PROMPT_VERSION, b.no).first())?.status;
      if (status === 'reserved' || status === 'done' || status === 'unknown') continue; // another run holds or finished this batch
      const t = await spentOf(db, indexId);
      stop = t.calls >= limits.maxCalls ? 'budget_calls' : t.chars + b.chars > limits.maxChars ? 'budget_chars' : t.ms >= limits.maxMs ? 'budget_time' : 'budget_calls';
      await skip(b, stop);
      continue;
    }
    calls++;
    const ids = b.chunks.map(c => c.id), t0 = clock();
    let message;
    try {
      message = await callModel('roadmap_index', { max_tokens: limits.maxTokens, system: INDEX_SYSTEM, tools: INDEX_TOOLS, tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: batchMessage(b.chunks.map(c => ({ id: c.id, path: index.sections[c.section].path, text: text.slice(c.start, c.end) }))) }] });
    } catch (error) {
      const code = error?.code, ms = Math.max(0, clock() - t0);
      if (code === 'unknown_provider_outcome') await finish(b, 'unknown', 'unknown_provider_outcome', ms);
      else await finish(b, 'failed', code === 'quota_exhausted' ? 'quota_exhausted' : 'model_unavailable', ms, { refund: code === 'quota_exhausted' ? 1 : 0 });
      stop = code === 'quota_exhausted' ? 'quota_exhausted' : 'earlier_batch_failed';
      continue;
    }
    const ms = Math.max(0, clock() - t0);
    const used = (message?.content || []).filter(p => p.type === 'tool_use');
    const verdict = used.length === 1 && used[0].name === 'summarize_chunks' ? validateSummaries(used[0].input, ids, limits.summaryChars) : { ok: false };
    if (!verdict.ok) { await finish(b, 'failed', 'invalid_output', ms); stop = 'earlier_batch_failed'; continue; }
    await finish(b, 'done', null, ms, { summaries: JSON.stringify([...verdict.summaries].map(([chunkId, summary]) => ({ chunkId, summary }))) });
  }
  const rows = await batchRows(db, indexId), coverage = coverageOf(index, rows);
  await db.prepare('UPDATE learn_source_indices SET coverage_json = ?, updated_at = ? WHERE id = ? AND org = ? AND owner_email = ?').bind(JSON.stringify(coverage), now, indexId, access.org, access.actorEmail).run();
  const summarized = rows.filter(r => r.status === 'done').length;
  return { status: coverage.summaryGaps.length ? 'partial' : 'ok', ...(stop ? { reason: stop } : capped && coverage.summaryGaps.length ? { reason: 'batch_attempts_exhausted' } : {}), calls, summarized, spent: await spentOf(db, indexId), coverage };
}

// The navigation summaries of an index, by chunk id. Labelled as summaries by the caller; never fed to a claim check.
export async function readSummaries(db, access, indexId) {
  if (!await loadIndexRow(db, access, indexId)) return new Map();
  const out = new Map();
  for (const r of await batchRows(db, indexId)) if (r.status === 'done') for (const s of JSON.parse(r.summary_json).summaries) out.set(s.chunkId, s.summary);
  return out;
}

// The production `callModel(role, body)` for summarizeIndex: platform-paid (withSystemUsage), the `roadmap_index` role from the central registry, no
// fallback model. The batch row in D1 is this stage's call checkpoint (learn_roadmap_calls is per roadmap and its stage list is closed by 0039, so it is
// not used: an index belongs to a source, not to a roadmap). A role that is not registered fails closed. `reserve` is an optional per-learner quota hook.
// Imports are lazy so the pure index and summary modules load without the model stack.
export function makeIndexCallModel(env, { registry, transport, reserve } = {}) {
  return async function callModel(role, body) {
    const fail = (code, message = code) => Object.assign(new Error(message), { code });
    const { LEARN_TASKS, loggedModel } = await import('../learn-models.js');
    const { withSystemUsage } = await import('../learn-usage.js');
    const { anthropic } = await import('../ask.js');
    const task = (registry || LEARN_TASKS)[role];
    if (role !== 'roadmap_index' || !task) throw fail('role_not_registered');
    if (reserve && !(await reserve())) throw fail('quota_exhausted');
    let response;
    try { response = await loggedModel(role, transport || anthropic)(withSystemUsage(env, 'roadmap'), { ...body, ...(task.effort ? { output_config: { effort: task.effort } } : {}) }, task.model, null); }
    catch (error) { throw Object.assign(error, { code: error?.code || 'unknown_provider_outcome' }); } // a throw after dispatch: the call may have cost money
    if (!response.ok) throw fail('model_unavailable', `model ${response.status}`);
    return response.json();
  };
}
