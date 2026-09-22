// The window bar under a video card: where the moment sits on the timeline,
// and where a click on the bar should take playback.
//
// Pure, because this is the part that must be exactly right - the embed player
// is YouTube's and cannot be asserted on, but our own bar can be.

// Exa returns no durations, so a card often has no total length. The bar still
// needs a scale: enough room after the window to show it is a window, without
// pretending we know where the video ends.
// ponytail: real duration via YouTube Data API when a key exists; env-gated.
export function timelineSpan(start, end, duration = null) {
  if (duration && duration > 0) return duration;
  const to = end != null ? end : start;
  return Math.max(60, to + 60, Math.ceil(to * 1.25));
}

// Left edge and width of the tinted moment, as fractions of the bar.
export function momentGeometry(start, end, duration = null) {
  const span = timelineSpan(start, end, duration);
  const from = Math.max(0, Math.min(start, span));
  const to = end != null ? Math.max(from, Math.min(end, span)) : span;
  return {
    left: from / span,
    width: Math.max((to - from) / span, 0.01), // a 3-second moment is still visible
    known: !!(duration && duration > 0),
  };
}

// A click at `fraction` of the bar becomes a start time in whole seconds.
export function seekTo(fraction, start, end, duration = null) {
  const span = timelineSpan(start, end, duration);
  return Math.max(0, Math.min(Math.round(span * fraction), span - 1));
}

export const clock = value => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

// The embed URL, mirrored from the worker's learn-youtube.js: start and end
// ride the URL, so playback itself enforces the window.
export function embedUrl(videoId, start = 0, end = null) {
  // Same shape rule as the worker's builder. A block edited by hand in
  // localStorage cannot leave the youtube-nocookie origin either way - the id
  // is percent-encoded into one path segment - but a non-id renders a broken
  // player, and null renders nothing, which is the honest one of the two.
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId))) return null;
  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  // Floor before comparing, or 90.2..90.5 becomes start=90&end=90 - a window
  // the worker's validator would refuse.
  const from = Math.max(0, Math.floor(start) || 0);
  const to = end != null ? Math.floor(end) : null;
  if (from > 0) url.searchParams.set('start', String(from));
  if (to != null && to > from) url.searchParams.set('end', String(to));
  return url.toString();
}
