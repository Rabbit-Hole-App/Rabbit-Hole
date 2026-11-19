import { dogGate, farmShelf, rainBarrel } from './gen-1-pool-2-plot-data.js';

export { derived } from './gen-1-pool-2-plot-data.js';

const hourAxis = points => ({ label: 'Hour of day', min: points[0].x, max: points.at(-1).x, integerTicks: true });

function rainPlot(points, caption) {
  return {
    kind: 'coordinate-plot',
    title: 'Rain barrel volume between readings',
    x: { label: 'Elapsed time', unit: 'min', min: points[0].x, max: points.at(-1).x, integerTicks: true },
    y: { label: 'Water volume', unit: 'L', min: rainBarrel.minLitres, max: rainBarrel.maxLitres },
    series: [{ kind: 'line', label: 'Barrel readings', points, markers: true }],
    annotations: [{ kind: 'point', label: `Estimated ${rainBarrel.estimate} L`, x: rainBarrel.halfway, derive: 'series.0:on' }],
    caption,
  };
}

function gatePlot(points, mean, caption) {
  return {
    kind: 'coordinate-plot',
    title: 'Dog park gate entries by hour',
    x: hourAxis(points),
    y: { label: 'Gate entries', min: dogGate.minEntries, max: dogGate.maxEntries, integerTicks: true },
    series: [{ kind: 'stem', label: 'Hourly counts', points }],
    annotations: [{ kind: 'reference-line', axis: 'y', label: `Mean ${mean} entries`, derive: 'series.0:mean' }],
    caption,
  };
}

function shelfPlot(points, peak, caption) {
  return {
    kind: 'coordinate-plot',
    title: 'Peak farm stand shelf temperature',
    x: hourAxis(points),
    y: { label: 'Shelf temperature', unit: '°C', min: farmShelf.minTemperature, max: farmShelf.maxTemperature },
    series: [{ kind: 'scatter', label: 'Thermometer readings', points }],
    annotations: [{ kind: 'reference-line', axis: 'y', label: `Peak reading ${peak} °C`, derive: 'series.0:max' }],
    caption,
  };
}

function plotReference(id, prompt, keywords, useWhen, plots) {
  const [overview, standard, deep] = plots.map(diagram => ({ spec: { version: 1, diagram } }));
  return {
    id, lessons: [], prompts: [prompt], keywords, shortKeywords: keywords, useWhen,
    spec: standard.spec, depths: { overview, standard, deep },
  };
}

export const references = [
  plotReference('pool-rain-barrel-midpoint',
    'What is the rain barrel volume halfway between the first two readings?',
    ['rain barrel estimate', 'barrel interpolation'],
    'Estimate water volume at a time between measured readings by following a straight segment.',
    [
      rainPlot(rainBarrel.overviewPoints, 'Illustrative readings with an estimate halfway between them.'),
      rainPlot(rainBarrel.points, 'The readings rise at a steady rate. The marker uses the first interval.'),
      rainPlot(rainBarrel.points,
        `Water rises ${rainBarrel.risePerMinute} L per minute on the first segment. Over ${rainBarrel.halfway} min it rises ${rainBarrel.halfRise} L.`),
    ]),
  plotReference('pool-dog-park-gate-mean',
    'What is the average number of entries per hour at the dog park gate?',
    ['dog park entries', 'gate count mean'],
    'Show a typical hourly entry count as the mean of a set of equally long counting periods.',
    [
      gatePlot(dogGate.overviewPoints, dogGate.overviewMean, 'Illustrative gate counts. The line shows the mean of the displayed hours.'),
      gatePlot(dogGate.points, dogGate.mean, 'Each stem counts entries from the marked hour to the next.'),
      gatePlot(dogGate.points, dogGate.mean,
        `Add the ${dogGate.totalEntries} entries and divide by the ${dogGate.hours} hours for the mean.`),
    ]),
  plotReference('pool-farm-stand-shelf-peak',
    'What was the highest shelf temperature recorded at the farm stand?',
    ['shelf temperature peak', 'farm stand thermometer'],
    'Mark the maximum among a series of shelf temperature observations.',
    [
      shelfPlot(farmShelf.overviewPoints, farmShelf.overviewPeak, 'Illustrative readings. The line meets the warmest reading.'),
      shelfPlot(farmShelf.points, farmShelf.peak, 'The line marks the highest measured temperature including the later cooler readings.'),
      shelfPlot(farmShelf.points, farmShelf.peak,
        `From the peak to the last reading, the shelf cooled by ${farmShelf.cooling} °C over ${farmShelf.coolingHours} h.`),
    ]),
];
