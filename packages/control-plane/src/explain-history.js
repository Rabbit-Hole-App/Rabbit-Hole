// /explain per-round history of a program job (explain sandbox Task 6): what each candidate was, why it was rejected, before the next round
// replaces it. A PRIVATE diagnostic record on the ExplainJobs job:<id> value: only explainDiagnostics reads it (GET ...?detail=1, job owner,
// EXPLAIN_DIAGNOSTICS); publicExplainJob picks its fields by name and never includes it. It is pruned with the job. Everything in it that a
// model wrote (source, manifest, problems, findings) is untrusted text: bounded here, never executed or fed back as an instruction.
//
// Caps. A Durable Object value holds at most 128 KiB, and the whole job (prompt, context up to 60,000 characters, the current program
// and its sealed artifact, calls, captures) is ONE value. So the history takes at most 64 KiB, and an entry that would push the record
// past 120 KiB is shrunk (source, then manifest, then text dropped; hashes always kept) instead of risking the job's own save.
//   rounds:   8 entries (1 + 3 correction rounds is 4 candidates; the rest is room for a re-render of the same candidate)
//   per entry: source 8,192 bytes (the contract allows 16,384; typical programs are 3-4 KiB), manifest 3,072, problems + findings + runtime 3,072
//   total:    64 KiB of entries (8 x ~14 KiB worst case is 112 KiB, so the total cap, not the entry cap, binds on a long job)
export const HISTORY_LIMITS = Object.freeze({ entries: 8, sourceBytes: 8192, manifestBytes: 3072, textBytes: 3072, totalBytes: 64 * 1024, recordBytes: 120 * 1024, findings: 12, problems: 8, line: 400 });

const encoder = new TextEncoder();
const size = value => encoder.encode(JSON.stringify(value)).length;
const hex16 = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value))))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');

// Cut text to a UTF-8 byte budget without splitting a character.
function clip(text, bytes) {
  const value = String(text ?? '');
  if (encoder.encode(value).length <= bytes) return { text: value, cut: false };
  let out = value.slice(0, bytes);
  while (encoder.encode(out).length > bytes) out = out.slice(0, -1);
  return { text: out, cut: true };
}

// The same hash explain-job.js records on a repair candidate (programHash): the first 16 hex of the SHA-256 of the program draft's JSON.
export const programHashOf = hex16;

// One round's entry. program: the candidate ({source, manifest} draft, or the sealed artifact, which adds hashes); outcome: invalid (the
// trusted checks refused it), runtime (it ran and failed), rejected (the review refused it) or accepted. runtime: { code, phase, ms }.
export async function roundEntry(job, { stage, outcome, problems = [], runtime = null, findings = [] }) {
  const candidate = job.artifact || job.program, cut = [];
  const bound = (name, text, bytes) => { const out = clip(text, bytes); if (out.cut) cut.push(name); return out.text; };
  const line = text => clip(text, HISTORY_LIMITS.line).text;
  const hashes = { programHash: await programHashOf({ source: candidate.source, manifest: candidate.manifest }) };
  for (const key of ['sourceHash', 'manifestHash', 'bundleHash']) if (typeof candidate[key] === 'string') hashes[key] = candidate[key].slice(0, 64);
  const text = {
    problems: problems.slice(0, HISTORY_LIMITS.problems).map(line),
    ...(runtime ? { runtime: { code: String(runtime.code ?? '').slice(0, 40), ...(runtime.phase ? { phase: String(runtime.phase).slice(0, 16) } : {}), ...(Number.isFinite(runtime.ms) ? { ms: Math.round(runtime.ms * 10) / 10 } : {}) } } : {}),
    findings: findings.slice(0, HISTORY_LIMITS.findings).map(f => ({ id: String(f.id ?? '').slice(0, 24), category: String(f.category ?? '').slice(0, 24), severity: String(f.severity ?? '').slice(0, 16), verdict: String(f.verdict ?? '').slice(0, 16),
      capture: String(f.target?.capture ?? '').slice(0, 64), object: String(f.target?.object ?? '').slice(0, 64), message: line(f.message) })),
  };
  if (problems.length > HISTORY_LIMITS.problems || findings.length > HISTORY_LIMITS.findings) cut.push('count');
  // problems + findings + runtime share one byte budget: lines are dropped from the end, never cut mid-record.
  while (size(text) > HISTORY_LIMITS.textBytes && (text.findings.length || text.problems.length)) { (text.findings.length ? text.findings : text.problems).pop(); if (!cut.includes('text')) cut.push('text'); }
  const source = bound('source', candidate.source, HISTORY_LIMITS.sourceBytes);
  const manifest = bound('manifest', JSON.stringify(candidate.manifest), HISTORY_LIMITS.manifestBytes);
  return { round: job.round, attempt: job.attempt, stage, outcome, at: Date.now(), hashes, source, manifest, ...text, truncated: cut.length > 0, cut };
}

// Append the round's entry to job.history within the caps. The entry that does not fit is shrunk, then (hashes only) kept if even that fits
// and counted in job.historyDropped otherwise. Only program jobs call this; a scene job has no history field.
export async function recordRound(job, details) {
  const entry = await roundEntry(job, details);
  const history = job.history ?? [];
  if (history.length >= HISTORY_LIMITS.entries) { job.historyDropped = (job.historyDropped || 0) + 1; return; }
  const room = () => Math.min(HISTORY_LIMITS.totalBytes - size(history), HISTORY_LIMITS.recordBytes - size({ ...job, history }));
  for (const drop of [[], ['source'], ['source', 'manifest'], ['source', 'manifest', 'problems', 'findings']]) {
    const shrunk = { ...entry };
    for (const key of drop) { shrunk[key] = Array.isArray(shrunk[key]) ? [] : ''; if (!shrunk.cut.includes(key)) shrunk.cut = [...shrunk.cut, key]; shrunk.truncated = true; }
    if (size(shrunk) <= room()) { job.history = [...history, shrunk]; return; }
  }
  job.historyDropped = (job.historyDropped || 0) + 1;
}
