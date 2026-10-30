// Images a learner drops onto a Learn canvas. The card renders from the
// browser's own IndexedDB copy; this R2 copy exists for one reason - so a later
// question can put the image in front of the tutor as an image block, the way
// an uploaded PDF rides learn-paper.js. GIFs and video clips never come here:
// they stay browser-only by design, the tutor does not see them.
//
// ponytail: no lifecycle sweep, same as learn-papers. Add one when storage is
// measured.
import { sha256, randomHex, base64 } from './token.js';
import { learnMedia } from './learn-storage.js';

// Same ceiling as PDFs, for the same reason: the bytes are base64'd into every
// turn that asks about them.
export const MEDIA_UPLOAD_LIMIT = 5 * 1024 * 1024;

const MEDIA = /^media:[0-9a-f]{12}$/;

export const isUploadedMediaId = value => typeof value === 'string' && MEDIA.test(value);

const newUploadedMediaId = () => `media:${randomHex(6)}`;

// Trust the bytes, not the extension or the declared type. Only the three
// static formats the ask path will forward; a GIF here is a caller bug.
export function sniffImageType(bytes) {
  const at = (offset, text) => new TextDecoder().decode(bytes.slice(offset, offset + text.length)) === text;
  if (bytes.length > 8 && bytes[0] === 0x89 && at(1, 'PNG')) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  return null;
}

// Derived from the session, never from the request - the same rule as
// paperObjectKey, so one learner cannot name their way into another's image.
async function mediaObjectKey(identity, id) {
  if (!isUploadedMediaId(id)) throw new Error('Not an uploaded image id');
  const digest = await sha256(JSON.stringify([identity.org, identity.name, identity.email]));
  return `learn-media/${digest}/${id}`;
}

export function uploadedMediaTitle(name) {
  const clean = String(name ?? '').replace(/\p{Cc}/gu, ' ').trim();
  return clean ? clean.slice(0, 200) : 'Dropped image';
}

export async function putUploadedMedia(env, identity, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('That file is empty');
  if (bytes.length > MEDIA_UPLOAD_LIMIT) throw new Error(`That image is larger than ${MEDIA_UPLOAD_LIMIT / (1024 * 1024)} MB`);
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new Error('That file is not a PNG, JPEG, or WebP image');
  const id = newUploadedMediaId();
  const title = uploadedMediaTitle(file.name);
  await learnMedia(env).put(await mediaObjectKey(identity, id), bytes, {
    httpMetadata: { contentType },
    customMetadata: { title },
  });
  return { id, title };
}

export async function readUploadedMedia(env, identity, id) {
  const object = await learnMedia(env).get(await mediaObjectKey(identity, id));
  if (!object) throw new Error('That image is no longer stored');
  return {
    bytes: new Uint8Array(await object.arrayBuffer()),
    contentType: object.httpMetadata?.contentType || 'image/png',
    title: uploadedMediaTitle(object.customMetadata?.title),
  };
}

// The Anthropic image block for the ask path, plus the title the context JSON
// names it by.
export async function uploadedMediaAsImage(env, identity, id) {
  const { bytes, contentType, title } = await readUploadedMedia(env, identity, id);
  return { id, title, image: { type: 'image', source: { type: 'base64', media_type: contentType, data: base64(bytes) } } };
}

// ---- Explain-back voice transcripts (plan 5, 7A.4 and 7C; EB-06 06.3). A transcript is a derivative of one stored voice
// note, separate from the typed answer: immutable once ready, versioned, and keyed by the audio's content hash, so the same
// clip is never transcribed twice (a revision that keeps the note, a reload, a reassessment all reuse it). Only submission or
// assessment preparation calls ensureTranscript; playback and panel toggles never reach it. A failed transcription keeps the
// audio (it is the attempt asset's, not this record's) and is recorded as status 'failed'; only an explicit retry replaces it.
//
// Record: { transcriptId, version, status: 'ready' | 'failed', assetId, hash, text, segments?, provider, model,
//   converterVersion, derivativeHash, uncertainty?, error?, createdAt }
//   segments    [{ start, end, text }] in seconds, only when the provider returned them (gpt-4o-transcribe does not; no
//               timing is invented).
//   uncertainty { meanLogprob, low: [{ text, p }] } from the provider's token logprobs, when returned.
//   EB-01 DerivativeRef for coverage: { derivativeId: transcriptId, hash: derivativeHash, converterVersion }.
export const TRANSCRIPT_VERSION = 1;
const hexDigest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
const SHA_HEX = /^[0-9a-f]{64}$/;

export const transcriptIdFor = (hash, provider, model) => `tr_${hash.slice(0, 32)}_${provider}_${model}_v${TRANSCRIPT_VERSION}`.replace(/[^A-Za-z0-9_-]/g, '-');

// The provider's answer -> the parts of the record it decides. Low-confidence tokens are those under p = 0.5 (at most 20).
export function transcriptParts(heard) {
  const text = String(heard?.text ?? '').trim();
  const segments = Array.isArray(heard?.segments)
    ? heard.segments.filter(s => Number.isFinite(s?.start) && Number.isFinite(s?.end)).map(s => ({ start: s.start, end: s.end, text: String(s.text ?? '').trim() }))
    : null;
  const probs = Array.isArray(heard?.logprobs) ? heard.logprobs.filter(t => Number.isFinite(t?.logprob)) : [];
  const uncertainty = probs.length ? {
    meanLogprob: probs.reduce((sum, t) => sum + t.logprob, 0) / probs.length,
    low: probs.filter(t => Math.exp(t.logprob) < 0.5).slice(0, 20).map(t => ({ text: String(t.token), p: Math.round(Math.exp(t.logprob) * 1000) / 1000 })),
  } : null;
  return { text, ...(segments?.length ? { segments } : {}), ...(uncertainty ? { uncertainty } : {}) };
}

// ensureTranscript({ assetId, hash, mime, read, store, transcriber, retry }) -> record.
//   read()        -> { bytes } of the stored note (D's attempt-asset read, owner-authorized).
//   store         { get(transcriptId), put(record) } (D's derivative store, scoped to the attempt owner).
//   transcriber   openaiTranscriber(env, ...) or a test double: { provider, model, transcribe({ bytes, mime }) -> heard }; null when
//                 transcription is not configured here (the result is a failed record, not stored, so it runs once it is).
// ponytail: two concurrent preparations of the same clip can both call the provider; the assessment operation's claim is
// what keeps one attempt to one preparation.
export async function ensureTranscript({ assetId, hash, mime = '', read, store, transcriber, retry = false, now = () => new Date().toISOString() }) {
  if (!SHA_HEX.test(String(hash))) throw new Error('A transcript is keyed by the audio sha256');
  const provider = transcriber?.provider || 'none', model = transcriber?.model || 'none';
  const transcriptId = transcriptIdFor(hash, provider, model);
  const base = { transcriptId, version: TRANSCRIPT_VERSION, assetId, hash, provider, model, converterVersion: `${provider}:${model}:v${TRANSCRIPT_VERSION}` };
  const failed = async (error, keep = true) => {
    const record = { ...base, status: 'failed', text: '', derivativeHash: await hexDigest(new TextEncoder().encode(JSON.stringify(['failed', error]))), error, createdAt: now() };
    if (keep) await store.put(record);
    return record;
  };
  if (!transcriber) return failed('not_configured', false);
  const existing = await store.get(transcriptId);
  if (existing && (existing.status === 'ready' || !retry)) return existing;
  const audio = await read();
  if (!audio?.bytes?.byteLength) return failed('audio_unavailable', false);
  if (await hexDigest(audio.bytes) !== hash) return failed('hash_mismatch', false);
  let heard;
  try { heard = await transcriber.transcribe({ bytes: audio.bytes, mime: mime || audio.mime || '' }); }
  catch (problem) { return failed(problem?.code || 'provider_failed'); }
  const parts = transcriptParts(heard);
  if (!parts.text) return failed('no_speech');
  const record = { ...base, status: 'ready', ...parts, derivativeHash: await hexDigest(new TextEncoder().encode(JSON.stringify([parts.text, parts.segments ?? null]))), createdAt: now() };
  await store.put(record);
  return record;
}

const AUDIO_EXT = { 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
// The OpenAI transcription call for a stored note, or null when this environment has transcription off (OPENAI_API_KEY and
// TRANSCRIBE_ENABLED === 'true', the same switch as /api/learn/transcribe). Spend stays the caller's: admit() returns a
// refusal (truthy) to stop before the call, record({ ok }) logs it after (paidSubmissionRefusal / recordMedia in dev-worker).
export function openaiTranscriber(env, { fetchImpl = globalThis.fetch, admit = async () => null, record = async () => {} } = {}) {
  if (!env?.OPENAI_API_KEY || env.TRANSCRIBE_ENABLED !== 'true') return null;
  const model = env.TRANSCRIBE_MODEL === 'gpt-transcribe' ? 'gpt-transcribe' : 'gpt-4o-transcribe';
  return {
    provider: 'openai', model,
    async transcribe({ bytes, mime }) {
      if (await admit()) throw Object.assign(new Error('Spend admission refused'), { code: 'spend_refused' });
      const type = String(mime).split(';')[0];
      const form = new FormData();
      // OpenAI picks the decoder by the file name, so it carries the real container.
      form.set('file', new Blob([bytes], { type }), `voice-note.${AUDIO_EXT[type] || 'webm'}`);
      form.set('model', model);
      form.set('response_format', 'json');
      form.append('include[]', 'logprobs');
      let response;
      try { response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form }); }
      catch { await record({ ok: false, model }); throw Object.assign(new Error('Transcription unreachable'), { code: 'provider_unreachable' }); }
      await record({ ok: response.ok, model });
      if (!response.ok) throw Object.assign(new Error(`Transcription failed (${response.status})`), { code: 'provider_failed' });
      return response.json();
    },
  };
}
