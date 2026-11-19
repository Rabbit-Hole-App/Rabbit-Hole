import { boxFences } from './derived.js';

function median(sorted) {
  const lowerMiddle = Math.floor((sorted.length - 1) / 2);
  const upperMiddle = Math.floor(sorted.length / 2);
  return (sorted[lowerMiddle] + sorted[upperMiddle]) / 2;
}

// Median-of-halves quartiles exclude the overall median when the sample size is odd.
function summarize(label, readings, outlierLabel) {
  const sorted = [...readings].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  const q1 = median(sorted.slice(0, Math.floor(middle)));
  const q3 = median(sorted.slice(Math.ceil(middle)));
  const { lower, upper } = boxFences({ q1, q3 });
  const inliers = sorted.filter(value => value >= lower && value <= upper);
  const outliers = sorted.filter(value => value < lower || value > upper)
    .map(value => ({ label: outlierLabel, value }));

  return {
    readings,
    iqr: q3 - q1,
    fences: { lower, upper },
    box: {
      label, q1, median: median(sorted), q3,
      whiskerLow: inliers[0], whiskerHigh: inliers.at(-1),
      ...(outliers.length ? { outliers } : {}),
    },
  };
}

function dataset(label, unit, groups) {
  const drawn = groups.flatMap(({ readings, box, fences }) =>
    box.outliers ? [...readings, fences.lower, fences.upper] : readings);
  const tickStep = 5;
  const min = Math.floor(Math.min(...drawn) / tickStep) * tickStep;
  const max = Math.ceil(Math.max(...drawn) / tickStep) * tickStep;
  return { x: { label, unit, min, max }, groups };
}

// Synthetic readings make the worked quartiles and fences exact.
export const sunflowerHeights = dataset('Seedling height', 'cm', [
  summarize('Window tray', [19, 12, 18, 16, 14, 33, 20, 13], 'Tall seedling'),
  summarize('Shelf tray', [17, 13, 12, 16, 15, 10, 11, 14], 'Unusual seedling'),
]);

export const firedTileWidths = dataset('Tile width', 'mm', [
  summarize('North kiln', [151, 149, 150, 152, 148, 150, 151, 149], 'Unusual tile'),
  summarize('South kiln', [155, 149, 153, 144, 156, 151, 145, 147], 'Unusual tile'),
]);
