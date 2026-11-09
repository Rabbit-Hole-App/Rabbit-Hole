import { lineHeight, textWidth, wrap } from './primitives.js';

const SIZE = 12;
const GAP = 6;

function regularValues({ min, max, scale }) {
  if (scale === 'log') {
    const low = Math.log10(min), high = Math.log10(max);
    if (high - low >= 1) {
      const step = Math.ceil((high - low) / 4);
      const first = Math.ceil(low / step), last = Math.floor(high / step);
      return [Array.from({ length: last - first + 1 }, (_, i) => 10 ** ((first + i) * step))];
    }
  }
  const magnitude = 10 ** Math.floor(Math.log10(max / 4 - min / 4));
  return [1, 2, 2.5, 5, 10].flatMap(multiplier => {
    const step = multiplier * magnitude;
    const first = Math.ceil(min / step), last = Math.floor(max / step);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 5) return [];
    return [Array.from({ length: last - first + 1 }, (_, i) => Number(((first + i) * step).toPrecision(15)))];
  });
}

function sample({ min, max, scale }, fraction) {
  const span = max - min;
  if (scale === 'log') {
    const relative = span / min;
    if (relative < 0.5) return min + min * Math.expm1(fraction * Math.log1p(relative));
    return Math.exp((1 - fraction) * Math.log(min) + fraction * Math.log(max));
  }
  return Number.isFinite(span) ? min + fraction * span : (1 - fraction) * min + fraction * max;
}

function fits(ticks, horizontal) {
  const sizes = ticks.map(({ lines }) => horizontal ? Math.max(...lines.map(line => textWidth(line, SIZE))) : lines.length * lineHeight(SIZE));
  return ticks.every(({ at }, i) => {
    if (i === 0) return true;
    const before = sizes[i - 1] / (horizontal && i === 1 ? 1 : 2);
    const after = sizes[i] / (horizontal && i === ticks.length - 1 ? 1 : 2);
    return Math.abs(at - ticks[i - 1].at) >= before + after + GAP;
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
