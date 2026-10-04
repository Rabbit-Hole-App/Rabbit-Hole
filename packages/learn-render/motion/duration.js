// Motion V1 duration (spec §2.2, owner decision 2026-10-04): any stated duration,
// fractional allowed, rounded to the nearest whole second (.5 up), clamped to 5..30,
// default 10. Every normalization is a visible decision line, never a silent change.
export const DURATION = Object.freeze({ min: 5, max: 30, default: 10 });

// "15s", "12.5 sec", "25 seconds", "1 minute", "1.5 mins". Digits only: "a second time" is not a duration.
// ponytail: first match wins, so "20s explain 2s complement" reads 20s; a bare "2s complement" reads 2s.
const RE = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?)\b/i;

export function parseDuration(text) {
  const m = RE.exec(String(text || ''));
  if (!m) return null;
  const seconds = Number(m[1]) * (/^m/i.test(m[2]) ? 60 : 1);
  return { requested_text: m[0], requested_seconds: +seconds.toFixed(6) };
}

export function normalizeSeconds(asked) {
  return Math.min(DURATION.max, Math.max(DURATION.min, Math.round(asked)));
}

// -> the brief's `duration` object plus the decision line the run prints.
export function durationDecision(text) {
  const asked = parseDuration(text);
  if (!asked) return { duration: { seconds: DURATION.default }, line: `✓ duration: ${DURATION.default}s (default)` };
  const seconds = normalizeSeconds(asked.requested_seconds);
  const shown = `${+asked.requested_seconds.toFixed(3)}s`;
  let line = `✓ duration: ${seconds}s`;
  if (seconds !== asked.requested_seconds) {
    const bound = Math.round(asked.requested_seconds) > DURATION.max ? `; Motion V1 max is ${DURATION.max}s`
      : Math.round(asked.requested_seconds) < DURATION.min ? `; Motion V1 min is ${DURATION.min}s` : '';
    line += ` (asked ${shown}${bound})`;
  }
  return { duration: { ...asked, seconds, ...(seconds !== asked.requested_seconds ? { normalization: line } : {}) }, line };
}
