// Formula-sampled plot series (owner 2026-11-08, Codex set 1; behind EXPLANATION_FORMULA_SAMPLER=on, default off, so production is unchanged).
// With the flag on, a coordinate-plot series may carry { label, kind, formula, xMin, xMax, samples } instead of its points: the server samples the formula
// (formula-sampler.js, a hand-written parser, no eval) and writes the points before the card is parsed, so the author states the function, never y values it
// would have to compute by hand. A series whose formula cannot be sampled is left as written: the parser names it and the one repair runs, as today.
import { sampleFormula } from '../../web/src/tutor-diagrams/formula-sampler.js';

export const formulaSamplerEnabled = env => env?.EXPLANATION_FORMULA_SAMPLER === 'on';

export const FORMULA_SERIES_GUIDANCE = ' For a coordinate-plot line that is a function, do not write points: give the series {"label","kind":"line","formula","xMin","xMax","samples"} with the formula in x as the prose states it (+ - * / ^, parentheses, exp, log, log2, sqrt, abs, sin, cos, tanh, min, max) and samples from 7 to 12; the server samples it. Points are only for measured or scattered data.';

const FORMULA_SERIES = {
  type: 'object', additionalProperties: false, required: ['label', 'kind', 'formula', 'xMin', 'xMax', 'samples'],
  properties: { label: { type: 'string', minLength: 1, maxLength: 42 }, kind: { type: 'string', const: 'line' }, formula: { type: 'string', minLength: 1, maxLength: 120 },
    xMin: { type: 'number' }, xMax: { type: 'number' }, samples: { type: 'integer', minimum: 2, maximum: 24 } },
};

// The make_explanation input schema with the coordinate-plot series items offered in both forms (points, or formula and range). Returns the schema unchanged when it has no such branch.
export function withFormulaSeries(schema) {
  const out = structuredClone(schema), visuals = out.properties?.visuals?.items;
  const spec = (visuals?.oneOf ?? visuals?.anyOf)?.find(v => v.properties?.spec)?.properties.spec, union = spec?.properties?.diagram;
  const plot = (union?.oneOf ?? union?.anyOf)?.find(b => b.properties?.kind?.const === 'coordinate-plot');
  if (plot?.properties?.series?.items) plot.properties.series.items = { anyOf: [plot.properties.series.items, FORMULA_SERIES] };
  return out;
}

// -> visuals with every formula series of a coordinate-plot diagram replaced by its sampled points; the same array when nothing was sampled.
export function fillFormulaSeries(visuals) {
  if (!Array.isArray(visuals)) return visuals;
  let changed = false;
  const filled = visuals.map(visual => {
    const d = visual?.k === 'diagram' ? visual.spec?.diagram : null;
    if (d?.kind !== 'coordinate-plot' || !Array.isArray(d.series) || !d.series.some(s => typeof s?.formula === 'string')) return visual;
    const series = d.series.map(s => {
      if (typeof s?.formula !== 'string') return s;
      const { formula, xMin, xMax, samples, ...rest } = s;
      try {
        // shortcut: four decimals, the card's own precision for plotted values; raise it if a plot ever needs finer.
        const points = sampleFormula({ formula, xMin: xMin ?? d.x?.min, xMax: xMax ?? d.x?.max, samples: samples ?? 9 }, { yMin: d.y?.min, yMax: d.y?.max })
          .map(({ x, y }) => ({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) }));
        changed = true;
        return { ...rest, points };
      } catch { return { ...rest, formula, xMin, xMax, samples }; }
    });
    return { ...visual, spec: { ...visual.spec, diagram: { ...d, series } } };
  });
  return changed ? filled : visuals;
}
