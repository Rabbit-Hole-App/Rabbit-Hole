import { lineHeight, textWidth, wrap } from './primitives.js';

const SIZE = 12;
const GAP = 6;

function regularValues({ min, max }) {
  const magnitude = 10 ** Math.floor(Math.log10(max / 4 - min / 4));
  return [1, 2, 2.5, 5, 10].flatMap(multiplier => {
    const step = multiplier * magnitude;
    const first = Math.ceil(min / step), last = Math.floor(max / step);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 5) return [];
    return [Array.from({ length: last - first + 1 }, (_, i) => Number(((first + i) * step).toPrecision(15)))];
  });
}

function sample({ min, max }, fraction) {
  const span = max - min;
  return Number.isFinite(span) ? min + fraction * span : (1 - fraction) * min + fraction * max;
}

function fits(ticks, horizontal, gap = GAP) {
  const sizes = ticks.map(({ lines }) => horizontal ? Math.max(...lines.map(line => textWidth(line, SIZE))) : lines.length * lineHeight(SIZE));
  return ticks.every(({ at }, i) => {
    if (i === 0) return true;
    const before = sizes[i - 1] / (horizontal && i === 1 ? 1 : 2);
    const after = sizes[i] / (horizontal && i === ticks.length - 1 ? 1 : 2);
    return Math.abs(at - ticks[i - 1].at) >= before + after + gap;
  });
}

export function plotTicks(axis, position, { horizontal = false, labelWidth = Infinity } = {}) {
  const { min, max } = axis;
  const tick = value => ({ at: position(value), text: String(value) });
  const start = tick(min), end = tick(max);
  const span = Math.abs(end.at - start.at);
  const format = (entries, width = labelWidth) => entries.map(({ at, text }, i) => ({
    at, lines: wrap(text, width, SIZE),
    anchor: !horizontal || i === entries.length - 1 ? 'end' : i === 0 ? 'start' : 'middle',
  }));
  const withEndpoints = values => {
    const interior = [...new Set(values)].filter(value => value > min && value < max).map(tick)
      .filter(({ at }) => Math.min(Math.abs(at - start.at), Math.abs(at - end.at)) >= 20);
    return [start, ...interior, end];
  };
  if (axis.scale === 'log') {
    const first = Math.ceil(Math.log10(min));
    const last = Math.floor(Math.log10(max));
    const decades = Array.from({ length: last - first + 1 }, (_, i) => Number(`1e${first + i}`));
    // Release 118 (owner): fewer than three ticks (the endpoints and the powers of ten between them) are completed with a 1-2-5 progression inside the range, and, when a domain
    // too narrow for any, its geometric midpoint, until there are three; three or more ticks are never given sub-ticks.
    let pool = decades;
    if (withEndpoints(decades).length < 3) {
      pool = Array.from({ length: last - first + 3 }, (_, i) => [1, 2, 5].map(m => Number(`${m}e${first - 1 + i}`))).flat().filter(value => value > min && value < max);
      if (withEndpoints(pool).length < 3) { const mid = Math.sqrt(min * max), rounded = Number(mid.toPrecision(6)); pool = [...pool, rounded > min && rounded < max && Math.abs(position(rounded) - position(mid)) <= 1 ? rounded : mid].sort((x, y) => x - y); }
    }
    // Thin crowded decades without replacing them with fractional ticks. A domain narrower than float precision has no interior tick at all: the generic path below labels its visual midpoint.
    if (withEndpoints(pool).length >= 3) {
      for (let step = 1; step <= pool.length; step *= 2) {
        const labels = format(withEndpoints(pool.filter((_, i) => i % step === 0)));
        if (fits(labels, horizontal, horizontal ? 0 : GAP)) return labels;
      }
      return format([start, end]);
    }
  }
  if (axis.integerTicks) {
    const range = max - min;
    for (let step = Math.max(1, Math.ceil(range / 7)); step < range; step *= 2) {
      const values = Array.from({ length: Math.ceil(range / step) - 1 }, (_, i) => min + (i + 1) * step);
      const labels = format(withEndpoints(values));
      if (fits(labels, horizontal)) return labels;
    }
    return format([start, end]);
  }
  const sampleValue = fraction => {
    const value = sample(axis, fraction);
    const rounded = Number(value.toPrecision(6));
    return rounded > min && rounded < max && Math.abs(position(rounded) - position(value)) <= 1 ? rounded : value;
  };
  const regular = regularValues(axis).map(withEndpoints).sort((a, b) => b.length - a.length);
  const midpoint = sampleValue(0.5);
  const sampled = [withEndpoints([sampleValue(0.25), midpoint, sampleValue(0.75)]), withEndpoints([midpoint])];
  let wrapped;
  for (const entries of [...regular, ...sampled]) {
    if (entries.length < 3 || entries.length > 5) continue;
    const ticks = format(entries);
    if (!fits(ticks, horizontal)) continue;
    if (ticks.every(({ lines }) => lines.length === 1)) return ticks;
    wrapped ??= ticks;
  }
  if (wrapped) return wrapped;

  // Use the visual midpoint when floating-point precision leaves no well-spaced numeric tick.
  const halfway = (start.at + end.at) / 2;
  const middle = tick(midpoint);
  const between = Math.abs(middle.at - halfway) <= span / 4 ? middle : { at: halfway, text: 'Midpoint' };
  const nearest = Math.min(Math.abs(between.at - start.at), Math.abs(end.at - between.at));
  return format([start, between, end], horizontal ? (nearest - GAP) * 2 / 3 : labelWidth);
}
