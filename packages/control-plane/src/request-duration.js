// A duration a learner states in a request: "15s", "12.5 sec", "25 seconds", "1 minute",
// "1.5 mins". Digits only: "a second time" is not a duration. A leaf with no imports, shared by
// the Learner Intent Resolver and Motion's duration policy (learn-render/motion/duration.js).
// ponytail: first match wins, so "20s explain 2s complement" reads 20s; a bare "2s complement" reads 2s.
export const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?)\b/i;

export function parseDuration(text) {
  const m = DURATION_PATTERN.exec(String(text || ''));
  if (!m) return null;
  const seconds = Number(m[1]) * (/^m/i.test(m[2]) ? 60 : 1);
  return { requested_text: m[0], requested_seconds: +seconds.toFixed(6) };
}
