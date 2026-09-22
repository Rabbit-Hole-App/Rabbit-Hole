// The flywheel's per-video R2 record - negative cache and index ledger in one
// object. See docs/features/youtube-moment-flywheel.md.
//
// One JSON object per video at learn/moment-index/<videoId>.json:
//   { videoId, checkedAt, reason | null, cut, starts, indexedAt | null }
// The negative half says "we probed and failed, retry later"; the ledger half
// remembers which windows were embedded so pruning can reconstruct vector ids
// (<videoId>:<cut>:<start>) without a prefix query Vectorize does not offer.
// Our own observations only - nothing of YouTube's is stored.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOUR = 60 * 60 * 1000, DAY = 24 * HOUR;

// A record is a record, never a verdict: transient failures retry within
// hours, a genuinely captionless video is worth re-asking after weeks.
export const RETRY_AFTER = {
  'rate-limited': 3 * HOUR,
  blocked: 6 * HOUR,
  'no-track': 21 * DAY,
  empty: 21 * DAY,
  unplayable: 60 * DAY,
  'too-large': 60 * DAY,
  deleted: 365 * DAY,
};

const recordKey = videoId => {
  if (!VIDEO_ID.test(String(videoId))) throw new Error('Not a YouTube video id');
  return `learn/moment-index/${videoId}.json`;
};

export async function readMomentRecord(env, videoId) {
  if (!env?.RUNS) return null;
  try {
    const object = await env.RUNS.get(recordKey(videoId));
    return object ? await object.json() : null;
  } catch { return null; }
}

// TTL is enforced at read time - R2 has no per-object expiry. An expired
// negative is treated as absent; the ledger half never expires.
export function negativeFresh(record, now = Date.now()) {
  if (!record?.reason) return false;
  const ttl = RETRY_AFTER[record.reason] ?? RETRY_AFTER.blocked;
  const checked = Date.parse(record.checkedAt || '');
  return Number.isFinite(checked) && now - checked < ttl;
}

async function writeRecord(env, videoId, patch, now) {
  if (!env?.RUNS) return;
  try {
    const existing = (await readMomentRecord(env, videoId)) || { videoId, cut: null, starts: [], indexedAt: null };
    const record = { ...existing, videoId, ...patch, checkedAt: new Date(now).toISOString() };
    await env.RUNS.put(recordKey(videoId), JSON.stringify(record), { httpMetadata: { contentType: 'application/json' } });
  } catch { /* a lost record costs one re-probe, never an answer */ }
}

export const writeNegative = (env, videoId, reason, now = Date.now()) => writeRecord(env, videoId, { reason }, now);

export const writeIndexed = (env, videoId, { cut, starts }, now = Date.now()) =>
  writeRecord(env, videoId, { reason: null, cut, starts, indexedAt: new Date(now).toISOString() }, now);

// The deterministic vector ids the ledger can reconstruct - <videoId>:<cut>:<start> -
// because Vectorize offers no delete-by-prefix.
export function vectorIds(record) {
  if (!record?.starts?.length || record.cut == null) return [];
  return record.starts.map(start => `${record.videoId}:${record.cut}:${start}`);
}

// A deleted video, as reported by a card whose thumbnail 404ed. The signal is
// client-reported, so it prunes derived data only - vectors and the record -
// never the D1 log, which is our own history.
export async function pruneVideo(env, videoId) {
  const record = await readMomentRecord(env, videoId);
  const ids = vectorIds(record);
  let pruned = 0;
  if (ids.length && env?.MOMENTS) {
    try { await env.MOMENTS.deleteByIds(ids); pruned = ids.length; }
    catch { /* the record still flips to deleted; a re-report retries */ }
  }
  await writeNegative(env, videoId, 'deleted');
  return { pruned };
}

// fetchCaptions with the record wrapped around it: a fresh negative skips the
// fetch entirely, a failed fetch writes its reason for next time. Without R2
// (unit tests, other deployments) it is a plain pass-through.
export function guardedCaptions(env, captions) {
  if (!env?.RUNS) return captions;
  return async videoId => {
    const record = await readMomentRecord(env, videoId);
    if (negativeFresh(record)) return { lines: null, reason: record.reason, cached: true };
    const outcome = await captions(videoId);
    if (!outcome.lines && outcome.reason) await writeNegative(env, videoId, outcome.reason);
    return outcome;
  };
}
