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

// The numeric limits the models must be told (owner 2026-10-27, job e3a2f10e: the gate enforced a class the Author never saw): those of the
// most permissive class the readiness policy covers, or null when no restriction applies (allowed omitted: only the absolute table does).
export const allowedLimits = allowed => {
  const classes = Array.isArray(allowed) ? COMPLEXITY_CLASSES.filter(c => allowed.includes(c)) : [];
  return classes.length ? { class: classes.at(-1), ...COMPOSITION_LIMITS[classes.at(-1)] } : null;
};
// The sentence the Author is given. It names the measured quantities exactly as measureComposition counts them, and says what to do when the
// storyboard cannot fit (the existing needs_revision route), so a lesson is never thinned silently to pass the gate.
export const sizeBudgetText = limits => limits && [
  'Size budget (a hard check on your source, run before anything renders; a composition over it is not rendered):',
  `at most ${limits.layers} layers (every <Sequence>, <AbsoluteFill> or <Series.Sequence> tag and every data-start attribute), ${limits.elements} elements (every opening <Tag>, components included), ${limits.text_chars} characters of text between tags and ${limits.asset_bytes} bytes of source.`,
  'Keep every storyboard object, label and on-screen text: reduce decoration, not content. If the storyboard cannot be built faithfully inside this budget, return status needs_revision and name the budget in reason; do not drop content to fit.',
].join(' ');

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
