// YouTube as a lesson source, phase 1: find a video, address a moment in it.
// See docs/features/youtube-moments.md and the moment/ prototype it comes from.
//
// Discovery is Exa restricted to youtube.com - semantic, so a question finds
// the video that answers it rather than the one that repeats its words. Exa is
// find-only: it never returns durations or timestamps. The moment window comes
// from the learner (or, in phase 2, from a transcript the model has read).

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// A video is at most this long for our purposes; the prototype drops >3h too.
const MAX_SECONDS = 4 * 3600;

// The id from any of the shapes a YouTube URL takes. Channel and playlist
// pages come back from a domain-restricted search as well, and anything
// without an 11-character id is not a video.
export function videoIdFrom(value) {
  const raw = String(value || '').trim();
  if (VIDEO_ID.test(raw)) return raw;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(url.hostname)) return null;
  const candidate = url.hostname.endsWith('youtu.be') ? url.pathname.slice(1).split('/')[0]
    : url.pathname.startsWith('/watch') ? url.searchParams.get('v')
    : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export function parseExaResults(payload) {
  const seen = new Set();
  const videos = [];
  for (const hit of payload?.results || []) {
    const videoId = videoIdFrom(hit?.url);
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    videos.push({
      videoId,
      // Exa titles usually end " - YouTube"; that is the site, not the video.
      title: String(hit.title || '').replace(/\s*[-|]\s*YouTube\s*$/i, '').trim().slice(0, 200) || videoId,
      channel: String(hit.author || '').trim().slice(0, 120) || null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return videos;
}

// Whole seconds, ordered, inside a sane ceiling. `end` null means "to the end".
export function validateMoment(start, end) {
  const from = Math.floor(Number(start ?? 0));
  if (!Number.isFinite(from) || from < 0 || from > MAX_SECONDS) throw new Error('Invalid moment start');
  if (end == null) return { start: from, end: null };
  const to = Math.floor(Number(end));
  if (!Number.isFinite(to) || to <= from || to > MAX_SECONDS) throw new Error('A moment ends after it starts');
  return { start: from, end: to };
}

// The whole trick from the prototype's README: start and end ride the embed
// URL, so playback itself enforces the window - begins at start, stops at end.
export function embedUrl(videoId, start = 0, end = null) {
  if (!VIDEO_ID.test(String(videoId))) throw new Error('Invalid video');
  const moment = validateMoment(start, end);
  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  if (moment.start) url.searchParams.set('start', String(moment.start));
  if (moment.end != null) url.searchParams.set('end', String(moment.end));
  return url.toString();
}

export function validateVideoContext(context) {
  const videoId = videoIdFrom(context?.videoId);
  if (!videoId) throw new Error('Invalid video');
  const moment = validateMoment(context?.start, context?.end);
  const title = typeof context?.title === 'string' ? context.title.slice(0, 200) : null;
  return { videoId, ...moment, title };
}

// One Exa call, key server-side only. Exa's youtube.com results include
// channel and playlist pages; parseExaResults drops them.
export async function searchYouTube(query, env, fetcher = fetch) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Invalid video search');
  if (!env?.EXA_API_KEY) throw new Error('YouTube search is not connected on this deployment.');
  let response;
  try {
    response = await fetcher('https://api.exa.ai/search', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.EXA_API_KEY },
      body: JSON.stringify({ query: query.trim(), includeDomains: ['youtube.com'], numResults: 10, type: 'auto' }),
    });
  } catch (error) { throw new Error(error?.name === 'TimeoutError' ? 'Video search did not answer in time. Try again.' : 'Video search is unavailable'); }
  if (response.status === 401 || response.status === 403) throw new Error('The Exa search key was refused.');
  if (response.status === 429) throw new Error('Video search is rate-limited. Wait a minute and try again.');
  if (!response.ok) throw new Error(`Video search is unavailable (${response.status})`);
  return parseExaResults(await response.json());
}
