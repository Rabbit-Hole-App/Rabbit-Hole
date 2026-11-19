// GEN-1 (Reviewer 2026-11-18): the limits the roadmap quote and the author request share. The quote bounds the worst dispatch body: the plain body, plus an examples
// block of at most EXAMPLES_CAP_CHARS characters priced at BYTES_PER_CHAR bytes each, plus a plan delta of PLAN_DELTA_BYTES (measured up to 24,356 bytes over the library prompts x 24 kinds).
// The request builder that adds the examples (GEN-1 R2) must pass the block through capExamples, so the bound holds by construction.
export const EXAMPLES_CAP_CHARS = 4500;
export const BYTES_PER_CHAR = 2;
export const PLAN_DELTA_BYTES = 26000;
// The bytes the quote adds to the system text of the plain body.
export const QUOTE_ROOM_BYTES = EXAMPLES_CAP_CHARS * BYTES_PER_CHAR + PLAN_DELTA_BYTES;

// The examples block cut to at most EXAMPLES_CAP_CHARS characters, at a line end when it has one (an example is one line), never mid-line unless one line alone is longer.
export function capExamples(text) {
  const s = String(text ?? '');
  if (s.length <= EXAMPLES_CAP_CHARS) return s;
  const cut = s.lastIndexOf('\n', EXAMPLES_CAP_CHARS);
  return s.slice(0, cut > 0 ? cut : EXAMPLES_CAP_CHARS);
}
