const durations = [12, 18, 25, 30, 33, 36, 39, 43, 46, 49, 51, 56, 59, 60, 69, 81, 88, 95, 112, 120];
const binWidth = 30;
const binCount = Math.ceil(Math.max(...durations) / binWidth);
const binEdges = Array.from({ length: binCount + 1 }, (_, index) => index * binWidth);
const counts = binEdges.slice(0, -1).map((lower, index) => {
  const upper = binEdges[index + 1];
  const last = index === binCount - 1;
  return durations.filter(minutes => minutes >= lower && (minutes < upper || (last && minutes === upper))).length;
});

const total = durations.length;
const sorted = [...durations].sort((a, b) => a - b);
const median = (sorted[Math.floor((total - 1) / 2)] + sorted[Math.floor(total / 2)]) / 2;
const peakCount = Math.max(...counts);
const peakBin = counts.indexOf(peakCount);
const peak = { lower: binEdges[peakBin], upper: binEdges[peakBin + 1], count: peakCount, proportion: peakCount / total };

export const skateRentals = { durations, binWidth, binEdges, counts, total, median, peak };
export const derived = () => skateRentals;
