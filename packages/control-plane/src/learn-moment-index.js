// The flywheel's per-video R2 record - negative cache and index ledger in one
// object. See docs/features/youtube-moment-flywheel.md.
//
// One JSON object per video at learn/moment-index/<videoId>.json:
//   { videoId, checkedAt, reason | null, cut, starts, indexedAt | null }
// The negative half says "we probed and failed, retry later"; the ledger half
// remembers which windows were embedded so pruning can reconstruct vector ids
// (<videoId>:<cut>:<start>) without a prefix query Vectorize does not offer.
// Our own observations only - nothing of YouTube's is stored.

import { fetchCaptions } from './learn-captions.js';
import { cutWindows, clock } from './learn-moment-retrieve.js';
import { learnMedia, learnMomentsDb } from './learn-storage.js';

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
  if (!learnMedia(env)) return null;
  try {
    const object = await learnMedia(env).get(recordKey(videoId));
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
  if (!learnMedia(env)) return;
  try {
    const existing = (await readMomentRecord(env, videoId)) || { videoId, cut: null, starts: [], indexedAt: null };
    const record = { ...existing, videoId, ...patch, checkedAt: new Date(now).toISOString() };
    await learnMedia(env).put(recordKey(videoId), JSON.stringify(record), { httpMetadata: { contentType: 'application/json' } });
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

export const CUT_VERSION = 1;
export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
// Workers AI takes batches; 50 keeps each call well under its input caps.
const EMBED_BATCH = 50;

export async function embedTexts(env, texts) {
  const vectors = [];
  for (let at = 0; at < texts.length; at += EMBED_BATCH) {
    const result = await env.AI.run(EMBEDDING_MODEL, { text: texts.slice(at, at + EMBED_BATCH) });
    vectors.push(...(result?.data || []));
  }
  if (vectors.length !== texts.length) throw new Error('Embedding batch came back short');
  return vectors;
}

// One video, cold to indexed: captions -> 60/30 windows -> embeddings ->
// Vectorize rows -> the ledger. The text is embedded and discarded - the
// storage rule - and every row carries the versioning fields the spec pins.
export async function indexVideo(videoId, env, { captions = fetchCaptions, now = Date.now } = {}) {
  if (!env?.AI || !env?.MOMENTS) return { videoId, indexed: 0, skipped: 'no-bindings' };
  const record = await readMomentRecord(env, videoId);
  if (negativeFresh(record)) return { videoId, indexed: 0, skipped: record.reason };
  if (record?.indexedAt && record.cut === CUT_VERSION && !record.reason) return { videoId, indexed: 0, skipped: 'indexed' };
  const outcome = await captions(videoId);
  if (!outcome.lines) {
    if (outcome.reason) await writeNegative(env, videoId, outcome.reason, now());
    return { videoId, indexed: 0, skipped: outcome.reason || 'empty' };
  }
  const windows = cutWindows(outcome.lines);
  if (!windows.length) {
    await writeNegative(env, videoId, 'empty', now());
    return { videoId, indexed: 0, skipped: 'empty' };
  }
  const values = await embedTexts(env, windows.map(window => window.text));
  const indexedAt = new Date(now()).toISOString();
  const rows = windows.map((window, at) => ({
    id: `${videoId}:${CUT_VERSION}:${window.start}`,
    values: values[at],
    namespace: 'windows',
    metadata: {
      videoId, start: window.start, end: window.end,
      cut: CUT_VERSION, embeddingModel: EMBEDDING_MODEL, indexedAt,
      ...(outcome.language ? { captionLanguage: outcome.language } : {}),
      ...(outcome.kind ? { captionKind: outcome.kind } : {}),
    },
  }));
  await env.MOMENTS.upsert(rows);
  await writeIndexed(env, videoId, { cut: CUT_VERSION, starts: windows.map(window => window.start) }, now());
  return { videoId, indexed: rows.length };
}

// The Queue consumer. One message per video, acked or retried alone, so a
// poison video cannot take its batchmates down with it.
export async function consumeIndexQueue(batch, env, options = {}) {
  for (const message of batch?.messages || []) {
    try {
      await indexVideo(message.body?.videoId, env, options);
      message.ack?.();
    } catch { message.retry?.(); }
  }
}

// The producer half: every cold answer warms the corpus. Fire-and-forget per
// video; without the binding, nothing is sent and nothing is owed.
export async function enqueueForIndex(env, videos) {
  if (!env?.INDEX_QUEUE) return 0;
  let sent = 0;
  for (const video of videos || []) {
    if (!video?.hasCaptions || !VIDEO_ID.test(String(video.videoId))) continue;
    const record = await readMomentRecord(env, video.videoId);
    if (record?.indexedAt && record.cut === CUT_VERSION && !record.reason) continue;
    try { await env.INDEX_QUEUE.send({ videoId: video.videoId }); sent += 1; }
    catch { /* the next cold answer retries */ }
  }
  return sent;
}

// The one knob that keeps the flywheel from making answers worse: below this
// best-match score the index does not cover the topic, and warm must fall
// through to cold - a mediocre indexed answer never beats a fresh search.
// Tuned against the eval harness, not guessed further.
export const RECALL_MIN = 0.55;
// Phase 4's bar is higher: only a near-restatement of an accepted question
// takes the hot path.
export const HOT_MIN = 0.8;

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let at = 0; at < a.length; at++) { dot += a[at] * b[at]; na += a[at] * a[at]; nb += b[at] * b[at]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

// The cold path's phase-3 scorer: embed the question and every window, rank
// by cosine. The same windows get re-embedded by the consumer for indexing -
// a known duplicate cost the spec accepts; Queue messages cannot carry them.
export function semanticWindowScorer(env) {
  return async (question, windows) => {
    if (!windows.length) return [];
    const [query, ...vectors] = await embedTexts(env, [question, ...windows.map(window => window.text)]);
    return vectors.map(vector => cosine(query, vector));
  };
}

// Warm verify sends excerpts, never transcripts: the candidate window plus
// this much surrounding caption, enough to tighten 4:00-5:00 into 4:12-5:38
// without rereading a lecture.
export const EXCERPT_PAD_S = 45;
export function excerptAround(lines, start, end, pad = EXCERPT_PAD_S) {
  const from = Math.max(0, start - pad), to = end + pad;
  const kept = lines.filter(line => line.start + (line.duration || 0) > from && line.start < to);
  return kept.map(line => `[${clock(line.start)}] ${line.text}`).join('\n');
}

// The warm path: question -> Vectorize -> recall check -> excerpts for the
// top videos -> the same {videos, passages} shape the cold path returns.
// Any failure returns null and cold takes over; warm may degrade, never break.
export async function warmMoments(query, env, { captions = fetchCaptions } = {}) {
  if (!env?.AI || !env?.MOMENTS) return null;
  try {
    const [vector] = await embedTexts(env, [query]);
    const result = await env.MOMENTS.query(vector, { topK: 20, namespace: 'windows', returnMetadata: 'all' });
    const matches = (result?.matches || []).filter(match => match.metadata?.videoId);
    if (!matches.length || (matches[0].score ?? 0) < RECALL_MIN) return null;
    // The prototype's per-video cap, so one long lecture cannot crowd the field.
    const byVideo = new Map();
    for (const match of matches) {
      const list = byVideo.get(match.metadata.videoId) || [];
      if (list.length < 3) { list.push(match); byVideo.set(match.metadata.videoId, list); }
    }
    const candidates = [...byVideo.entries()].slice(0, 3);
    const fetchCached = guardedCaptions(env, captions);
    const videos = [], passages = [];
    for (const [videoId, windows] of candidates) {
      const outcome = await fetchCached(videoId);
      if (!outcome.lines) continue;
      const title = outcome.title || videoId;
      videos.push({ videoId, title, channel: null, hasCaptions: true, hasPassages: true, duration: outcome.duration ?? null, warm: true });
      for (const match of windows) {
        passages.push({
          videoId, title,
          start: match.metadata.start, end: match.metadata.end,
          text: excerptAround(outcome.lines, match.metadata.start, match.metadata.end),
        });
      }
    }
    if (!passages.length) return null;
    return { videos, passages, warm: true };
  } catch { return null; }
}

// The hot path: has a learner already accepted a moment for this phrasing?
// question -> bge-m3 -> workspace-scoped question vectors -> momentId -> the
// D1 log, accepted rows only. Fast, not instant - and a candidate, never an
// auto-show: the model still confirms it fits this question.
export async function hotMoment(query, env, org) {
  if (!env?.AI || !env?.MOMENTS || !learnMomentsDb(env) || !org) return null;
  try {
    const [vector] = await embedTexts(env, [query]);
    const result = await env.MOMENTS.query(vector, { topK: 3, namespace: `questions:${org}`, returnMetadata: 'all' });
    const best = (result?.matches || [])[0];
    if (!best || (best.score ?? 0) < HOT_MIN || !best.metadata?.momentId) return null;
    const row = await learnMomentsDb(env).prepare('SELECT question, video_id, start, end, reason FROM learn_moments WHERE id = ? AND org = ? AND accepted = 1')
      .bind(Number(best.metadata.momentId), String(org)).first();
    if (!row) return null;
    return { momentId: Number(best.metadata.momentId), videoId: row.video_id, start: row.start, end: row.end, reason: row.reason || null, pastQuestion: row.question, score: best.score ?? null };
  } catch { return null; }
}

// On Keep, the question becomes the workspace's retrieval key for this
// moment; on Dismiss the key is withdrawn. Vector ids are unique per index,
// so q:<momentId> needs no namespace in the delete.
export async function upsertAcceptedQuestion(env, org, momentId, question) {
  if (!env?.AI || !env?.MOMENTS || !org || !question) return false;
  try {
    const [vector] = await embedTexts(env, [question]);
    await env.MOMENTS.upsert([{ id: `q:${momentId}`, values: vector, namespace: `questions:${org}`, metadata: { momentId } }]);
    return true;
  } catch { return false; }
}

export async function withdrawAcceptedQuestion(env, momentId) {
  if (!env?.MOMENTS) return false;
  try { await env.MOMENTS.deleteByIds([`q:${momentId}`]); return true; }
  catch { return false; }
}

// fetchCaptions with the record wrapped around it: a fresh negative skips the
// fetch entirely, a failed fetch writes its reason for next time. Without R2
// (unit tests, other deployments) it is a plain pass-through.
export function guardedCaptions(env, captions) {
  if (!learnMedia(env)) return captions;
  return async videoId => {
    const record = await readMomentRecord(env, videoId);
    if (negativeFresh(record)) return { lines: null, reason: record.reason, cached: true };
    const outcome = await captions(videoId);
    if (!outcome.lines && outcome.reason) await writeNegative(env, videoId, outcome.reason);
    return outcome;
  };
}
