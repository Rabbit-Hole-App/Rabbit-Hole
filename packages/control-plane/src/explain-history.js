// /explain per-round history of a program job (explain sandbox Task 6): what each candidate was and why it was rejected, kept before the next
// round replaces it. PRIVATE diagnostic record: only explainDiagnostics (and its ?version= lookup) reads it (GET ...?detail=1, job owner,
// EXPLAIN_DIAGNOSTICS); publicExplainJob picks its fields by name and never includes it. Everything a model wrote (source, manifest, problems,
// findings) is untrusted text: bounded, stored as data, never executed or fed back as an instruction.
//
// Two places, because a Durable Object value holds at most 128 KiB and the job record (prompt, up to 60,000 characters of context, the current
// program and its sealed artifact, calls, captures) is ONE value:
//  - job.history (in the job record): one SMALL entry per round: ids, hashes, byte sizes, outcome, problems, the runtime measurement and the
//    findings, each carrying the programHash of the version it is about. No source and no manifest, so nothing in it is a truncated program.
//  - one `explainver:<jobId>:<programHash>` value per candidate (the same Durable Object storage as the `result:` artifacts, so it sits behind
//    the same owner-checked routes and is deleted with the job by prune()): the COMPLETE source and manifest, content-addressed by programHash
//    (the SHA-256 prefix of the exact {source, manifest}). A version the contract could not admit (source over 16,384 bytes or manifest over
//    4,096 bytes), or one whose write failed, says so in its entry (version.stored false + reason) and is never presented as replayable.
// Numbers (HISTORY_LIMITS): 8 entries and so at most 8 stored versions per job; a stored version is at most 16,384 + 4,096 bytes plus a
// small envelope (about 21 KiB, far under the 128 KiB value limit), so at most about 168 KiB per job outside the job record; an entry is at
// most about 4 KiB (text 3,072 bytes + hashes), so history is at most 32 KiB of the job record; and an entry that would push the record
// past 120 KiB loses its problems and findings (hashes kept) rather than risk the job's own save.
import { CONTRACT_LIMITS } from '../../web/src/explain-program/contract.js';

export const HISTORY_LIMITS = Object.freeze({ entries: 8, textBytes: 3072, totalBytes: 32 * 1024, recordBytes: 120 * 1024, findings: 12, problems: 8, line: 400,
  sourceBytes: CONTRACT_LIMITS.sourceBytes, manifestBytes: CONTRACT_LIMITS.manifestBytes });
export const versionKey = (jobId, programHash) => `explainver:${jobId}:${programHash}`;

const encoder = new TextEncoder();
const bytes = value => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
// The hash explain-job.js also records on a repair candidate (programHash): 16 hex characters of the SHA-256 of {source, manifest}'s JSON.
export const programHashOf = async program => (await sha256(JSON.stringify({ source: program.source, manifest: program.manifest }))).slice(0, 16);
const clip = (text, max) => String(text ?? '').slice(0, max);

// One round's entry for the candidate (the sealed artifact when there is one, else the draft). Pure; storage is separate.
export async function roundEntry(job, { stage, outcome, problems = [], runtime = null, findings = [] }) {
  const candidate = job.artifact || job.program, programHash = await programHashOf(candidate), cut = [];
  const hashes = { programHash, sourceHash: await sha256(candidate.source) };
  for (const key of ['manifestHash', 'bundleHash']) if (typeof candidate[key] === 'string') hashes[key] = candidate[key].slice(0, 64);
  const text = {
    problems: problems.slice(0, HISTORY_LIMITS.problems).map(message => ({ message: clip(message, HISTORY_LIMITS.line), programHash })),
    ...(runtime ? { runtime: { code: clip(runtime.code, 40), ...(runtime.phase ? { phase: clip(runtime.phase, 16) } : {}), ...(Number.isFinite(runtime.ms) ? { ms: Math.round(runtime.ms * 10) / 10 } : {}), programHash } } : {}),
    findings: findings.slice(0, HISTORY_LIMITS.findings).map(f => ({ id: clip(f.id, 24), category: clip(f.category, 24), severity: clip(f.severity, 16), verdict: clip(f.verdict, 16),
      capture: clip(f.target?.capture, 64), object: clip(f.target?.object, 64), message: clip(f.message, HISTORY_LIMITS.line), programHash })),
  };
  if (problems.length > HISTORY_LIMITS.problems || findings.length > HISTORY_LIMITS.findings) cut.push('count');
  // problems + findings + runtime share one byte budget: lines are dropped from the end, never cut mid-record.
  while (bytes(text) > HISTORY_LIMITS.textBytes && (text.findings.length || text.problems.length)) { (text.findings.length ? text.findings : text.problems).pop(); if (!cut.includes('text')) cut.push('text'); }
  return { round: job.round, attempt: job.attempt, stage, outcome, at: Date.now(), hashes, sizes: { sourceBytes: bytes(candidate.source), manifestBytes: bytes(candidate.manifest) },
    ...text, truncated: cut.length > 0, cut, candidate };
}

// Store the complete version, or say exactly why not. -> { stored: true, key } | { stored: false, reason }.
async function storeVersion(job, entry, storage, known) {
  const { sourceBytes, manifestBytes } = entry.sizes;
  if (sourceBytes > HISTORY_LIMITS.sourceBytes) return { stored: false, reason: 'source_over_contract_limit' };
  if (manifestBytes > HISTORY_LIMITS.manifestBytes) return { stored: false, reason: 'manifest_over_contract_limit' };
  const key = versionKey(job.id, entry.hashes.programHash);
  if (known.has(key)) return { stored: true, key }; // the same candidate again (a re-render): content-addressed, already there
  const { source, manifest } = entry.candidate;
  try { await storage.put(key, { jobId: job.id, programHash: entry.hashes.programHash, hashes: entry.hashes, sizes: entry.sizes, source, manifest, at: entry.at }); }
  catch { return { stored: false, reason: 'storage_failed' }; }
  return { stored: true, key };
}

// Append the round's entry within the caps and store its version. Only program jobs call this; a scene job has no history field.
// storage: the Durable Object storage (put/get/delete).
export async function recordRound(job, details, storage) {
  const entry = await roundEntry(job, details);
  const history = job.history ?? [];
  if (history.length >= HISTORY_LIMITS.entries) { job.historyDropped = (job.historyDropped || 0) + 1; return; }
  const { candidate, ...rest } = entry;
  const known = new Set(history.filter(h => h.version?.stored).map(h => h.version.key));
  const kept = { ...rest, version: storage ? await storeVersion(job, entry, storage, known) : { stored: false, reason: 'no_storage' } };
  const room = () => Math.min(HISTORY_LIMITS.totalBytes - bytes(history), HISTORY_LIMITS.recordBytes - bytes({ ...job, history }));
  for (const drop of [[], ['problems', 'findings']]) {
    const shrunk = { ...kept };
    for (const key of drop) { shrunk[key] = []; if (!shrunk.cut.includes(key)) shrunk.cut = [...shrunk.cut, key]; shrunk.truncated = true; }
    if (bytes(shrunk) <= room()) { job.history = [...history, shrunk]; return; }
  }
  // No room even for the hashes: counted, and the version just written is removed again (nothing would reference it for pruning).
  job.historyDropped = (job.historyDropped || 0) + 1;
  if (kept.version.stored && !known.has(kept.version.key)) await storage.delete?.(kept.version.key);
}

// The owner's lookup: the stored version of a hash in this job's history, re-verified from the stored text itself.
// -> { stored: false, reason } | { stored: true, programHash, source, manifest, verified: { programHash, sourceHash } }
export async function resolveVersion(job, programHash, storage) {
  const entry = (job.history || []).find(h => h.hashes?.programHash === programHash);
  if (!entry) return { stored: false, reason: 'unknown_version' };
  if (!entry.version?.stored) return { stored: false, reason: entry.version?.reason || 'not_stored' };
  const value = await storage.get(entry.version.key);
  if (!value) return { stored: false, reason: 'missing' };
  return { stored: true, programHash, source: value.source, manifest: value.manifest,
    verified: { programHash: await programHashOf(value) === programHash, sourceHash: await sha256(value.source) === entry.hashes.sourceHash } };
}
