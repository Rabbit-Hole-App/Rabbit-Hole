import { boxFences } from './derived.js';

// Illustrative times in minutes, in observation order.
export const observations = {
  'pool-museum-coat-check-waits': {
    label: 'Coat-check wait', unit: 'min',
    outlierLabels: { low: 'Short wait', high: 'Long wait' },
    groups: [
      { label: 'Opening night', readings: [12, 10, 14, 13, 29, 11, 9, 14, 10] },
      { label: 'Weekday', readings: [8, 9, 7, 6, 8, 19, 7, 9, 8] },
    ],
  },
  'pool-paint-swatch-drying-times': {
    label: 'Drying time', unit: 'min',
    outlierLabels: { low: 'Fast swatch', high: 'Slow swatch' },
    groups: [
      { label: 'Thin coat', readings: [32, 19, 27, 29, 34, 29, 32, 31, 30] },
      { label: 'Thick coat', readings: [44, 37, 43, 62, 36, 40, 44, 36, 34] },
    ],
  },
};

function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize({ label, readings }, outlierLabels) {
  const sorted = readings.toSorted((a, b) => a - b);
  // The middle observation is excluded from each half.
  const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)));
  const q3 = median(sorted.slice(Math.ceil(sorted.length / 2)));
  const { lower, upper } = boxFences({ q1, q3 });
  const inside = value => value >= lower && value <= upper;
  const inliers = sorted.filter(inside);
  const outliers = sorted.filter(value => !inside(value)).map(value => ({
    label: value < lower ? outlierLabels.low : outlierLabels.high, value,
  }));
  const box = {
    label, whiskerLow: inliers[0], q1, median: median(sorted), q3,
    whiskerHigh: inliers.at(-1), outliers,
  };
  return { box, lower, upper, iqr: q3 - q1 };
}

export function derived() {
  return Object.fromEntries(Object.entries(observations).map(([id, source]) => {
    const readings = source.groups.flatMap(group => group.readings);
    const x = { label: source.label, unit: source.unit, min: Math.min(...readings), max: Math.max(...readings) };
    return [id, { x, summaries: source.groups.map(group => summarize(group, source.outlierLabels)) }];
  }));
}
