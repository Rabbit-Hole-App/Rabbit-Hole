// Monotone cubic Hermite interpolation in SVG coordinates. Steffen's limiter
// bounds each interior tangent using its two neighbouring secant slopes.
export function monotoneLinePath(points, band) {
  const intervals = points.slice(1).map(([x], i) => x - points[i][0]);
  const direction = Math.sign(intervals[0]);
  // Repeated or reversing x coordinates keep their authored segment order.
  if (points.length < 3 || !direction || intervals.some(dx => Math.sign(dx) !== direction)) {
    return 'M' + points.join('L');
  }

  const slopes = intervals.map((dx, i) => (points[i + 1][1] - points[i][1]) / dx);
  const interior = slopes.slice(1).map((right, i) => {
    const left = slopes[i], sign = Math.sign(left);
    if (sign !== Math.sign(right)) return 0;
    const [before, after] = [intervals[i], intervals[i + 1]];
    const centered = (left * after + right * before) / (before + after);
    return sign * Math.min(2 * Math.abs(left), 2 * Math.abs(right), Math.abs(centered));
  });
  const tangents = [
    (3 * slopes[0] - interior[0]) / 2,
    ...interior,
    (3 * slopes.at(-1) - interior.at(-1)) / 2,
  ];

  const curves = intervals.map((dx, i) => {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const third = dx / 3;
    const a = withinBand(y0 + third * tangents[i], band, i, 1 / 3);
    const b = withinBand(y1 - third * tangents[i + 1], band, i, 2 / 3);
    return `C${x0 + third},${a} ${x1 - third},${b} ${x1},${y1}`;
  });
  return 'M' + points[0] + curves.join('');
}

// The band edges are linear between samples. Keeping both Bézier controls
// inside that same interval keeps the whole segment within its envelope.
function withinBand(value, band, index, fraction) {
  if (!band) return value;
  const [lower, upper] = band[index].map((start, side) => start + (band[index + 1][side] - start) * fraction);
  return Math.max(lower, Math.min(upper, value));
}

export function showPlotMarker({ kind, points }, index) {
  return kind !== 'line' || points.length <= 6 || index === 0 || index === points.length - 1 || Boolean(points[index].label);
}
