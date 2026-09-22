// Timed captions for one YouTube video. See docs/features/youtube-moment-recommendation.md.
//
// This is the experimental provider the spec warns about, kept behind one
// module boundary so a provider change replaces this file, not the pipeline.
// The route is InnerTube's player endpoint with the Android client - the same
// road youtube-transcript-api took when the web player's timedtext URLs began
// requiring proof-of-origin tokens. Verified against live YouTube: the web
// watch-page URLs return 200 with an empty body; these return the captions.
//
// Caption text is never stored durably (the spec's storage rule). This module
// fetches, parses, and hands lines to the caller; the 1-hour Cache API layer
// on the fetch is ordinary HTTP caching, the same as arXiv gets.

const PLAYER = 'https://www.youtube.com/youtubei/v1/player';
const CLIENT = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 31, hl: 'en' };
const UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 12) gzip';
// A caption fetch that would exceed this is a >4h video we refuse anyway.
const XML_LIMIT = 3 * 1024 * 1024;

const decode = text => String(text)
  .replace(/&#(\d{1,7});/g, (whole, code) => (Number(code) > 0 && Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : whole))
  .replace(/&#x([0-9a-f]{1,6});/gi, (whole, code) => (parseInt(code, 16) > 0 && parseInt(code, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(code, 16)) : whole))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity.toLowerCase()])
  .replace(/\s+/g, ' ')
  .trim();

// English first, human first. The spec is English-only, like the wiki source.
export function pickTrack(tracks) {
  const english = (tracks || []).filter(track => /^en(-|$)/.test(track?.languageCode || ''));
  return english.find(track => track.kind !== 'asr') || english[0] || null;
}

// Both shapes the endpoint actually serves, verified live:
//   manual: <p t="4060" d="4820">Here, we tackle backpropagation...</p>
//   auto:   <p t="5200" d="5120"><s ac="255">hi</s><s t="240"> everyone</s>...</p>
// plus <w> window markers and a <head> of styles, which carry no words.
export function parseTimedText(xml) {
  const lines = [];
  for (const match of String(xml || '').matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const attributes = match[1];
    const start = Number(attributes.match(/\bt="(\d+)"/)?.[1]);
    if (!Number.isFinite(start)) continue;
    const duration = Number(attributes.match(/\bd="(\d+)"/)?.[1]) || 0;
    const text = decode(match[2].replace(/<[^>]+>/g, ''));
    if (!text || text === '[Music]' || text === '[Applause]') continue;
    lines.push({ start: start / 1000, duration: duration / 1000, text });
  }
  return lines;
}

// The outcome is a record, never a verdict: the negative reasons feed the
// spec's expiring negative cache (no-track retries in weeks, blocked in hours).
export async function fetchCaptions(videoId, fetcher = fetch) {
  // The 1-hour transient cache the storage rule allows: a repeat topic within
  // the hour costs zero YouTube fetches. Keyed synthetically because the
  // player call is a POST. A cache failure must never cost the fetch.
  const cache = globalThis.caches?.default;
  const key = `https://captions-cache.small.internal/${videoId}`;
  try {
    const hit = await cache?.match(key);
    if (hit) return await hit.json();
  } catch { /* fall through to a live fetch */ }
  const outcome = await fetchCaptionsLive(videoId, fetcher);
  if (outcome.lines && cache) {
    try { await cache.put(key, new Response(JSON.stringify(outcome), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })); }
    catch { /* caching is best effort */ }
  }
  return outcome;
}

async function fetchCaptionsLive(videoId, fetcher = fetch) {
  let player;
  try {
    player = await fetcher(PLAYER, {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ context: { client: CLIENT }, videoId }),
    });
  } catch { return { lines: null, reason: 'blocked' }; }
  if (player.status === 429) return { lines: null, reason: 'rate-limited' };
  if (!player.ok) return { lines: null, reason: 'blocked' };
  const data = await player.json().catch(() => null);
  if (data?.playabilityStatus?.status && data.playabilityStatus.status !== 'OK') return { lines: null, reason: 'unplayable' };
  const track = pickTrack(data?.captions?.playerCaptionsTracklistRenderer?.captionTracks);
  if (!track?.baseUrl) return { lines: null, reason: 'no-track' };
  let response;
  try { response = await fetcher(track.baseUrl, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA } }); }
  catch { return { lines: null, reason: 'blocked' }; }
  if (response.status === 429) return { lines: null, reason: 'rate-limited' };
  if (!response.ok) return { lines: null, reason: 'blocked' };
  const xml = await response.text();
  if (xml.length > XML_LIMIT) return { lines: null, reason: 'too-large' };
  const lines = parseTimedText(xml);
  if (!lines.length) return { lines: null, reason: 'empty' };
  return {
    lines,
    kind: track.kind === 'asr' ? 'auto' : 'manual',
    language: track.languageCode,
    duration: Number(data?.videoDetails?.lengthSeconds) || null,
    title: String(data?.videoDetails?.title || '').slice(0, 200) || null,
  };
}
