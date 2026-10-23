// Pre-render validation of a generated composition against supported complexity and resource limits (owner correction 2026-10-23).
// The limits are a STABLE TABLE whose numbers the render evidence will set; until then they are unmeasured placeholders (UNMEASURED)
// and are deliberately generous. A composition outside every class is refused BEFORE it renders; one inside a class the readiness
// policy does not cover is refused too. Passing is not a promise that the render succeeds, and no copy may say so.
// Metrics are measured from the source text (Remotion JSX or HyperFrames HTML) without running it: counts are heuristics of cost, not exact.
export const UNMEASURED = true;
export const COMPLEXITY_CLASSES = Object.freeze(['simple', 'standard', 'heavy']);
// Each class lists the most a composition in it may have. Stable names; change a number only with evidence, and say so in the commit.
export const COMPOSITION_LIMITS = Object.freeze({
  simple: Object.freeze({ layers: 8, elements: 60, text_chars: 800, asset_bytes: 16 * 1024, duration_seconds: 60 }),
  standard: Object.freeze({ layers: 20, elements: 160, text_chars: 2000, asset_bytes: 40 * 1024, duration_seconds: 60 }),
  heavy: Object.freeze({ layers: 40, elements: 400, text_chars: 4000, asset_bytes: 64 * 1024, duration_seconds: 60 }),
});

// -> { layers, elements, text_chars, asset_bytes, duration_seconds }. asset_bytes is the composition's own size: it may load no other asset.
export function measureComposition(source, { durationSeconds }) {
  const text = String(source ?? '');
  const sum = (text.match(/>([^<>{}]+)</g) || []).reduce((n, t) => n + t.slice(1, -1).trim().length, 0);
  return {
    layers: (text.match(/<(Sequence|AbsoluteFill|Series\.Sequence)\b|\bdata-start=/g) || []).length,
    elements: (text.match(/<[A-Za-z][\w.]*/g) || []).length,
    text_chars: sum,
    asset_bytes: new TextEncoder().encode(text).length,
    duration_seconds: durationSeconds,
  };
}
// The smallest class whose limits hold every metric, or null when even the heaviest is exceeded.
export const complexityClass = metrics => COMPLEXITY_CLASSES.find(c => Object.entries(COMPOSITION_LIMITS[c]).every(([k, max]) => metrics[k] <= max)) ?? null;

// -> { ok: true, class, metrics } or { ok: false, reason (one line), class, metrics }. allowed: the classes the readiness policy covers for
// this combination (omitted: only the absolute ceiling applies, as for a local run with no policy).
export function checkCompositionLimits(source, { durationSeconds, allowed = null }) {
  const metrics = measureComposition(source, { durationSeconds }), cls = complexityClass(metrics);
  if (!cls) {
    const heavy = COMPOSITION_LIMITS.heavy, over = Object.keys(heavy).filter(k => metrics[k] > heavy[k]);
    return { ok: false, class: null, metrics, reason: `the composition is beyond the supported limits (${over.map(k => `${k} ${metrics[k]} over ${heavy[k]}`).join(', ')})` };
  }
  if (allowed && !allowed.includes(cls)) return { ok: false, class: cls, metrics, reason: `the composition is ${cls}, which is not covered for these settings (covered: ${allowed.join(', ') || 'none'})` };
  return { ok: true, class: cls, metrics };
}
