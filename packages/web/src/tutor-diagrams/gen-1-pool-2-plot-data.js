export const plotInputs = {
  rain: { interval: 10, litres: [12, 32, 52], tick: 10 },
  gate: { openingHour: 8, entries: [3, 9, 7, 5, 4, 8], tick: 2 },
  shelf: { firstHour: 10, celsius: [15, 20, 26, 24, 22], tick: 5 },
};

const total = values => values.reduce((sum, value) => sum + value, 0);
const atIntervals = (values, start, gap) => values.map((y, index) => ({ x: start + index * gap, y }));
const upperBound = (values, tick) => Math.ceil(Math.max(...values) / tick) * tick;

const { interval, litres, tick: litreTick } = plotInputs.rain;
const rainPoints = atIntervals(litres, 0, interval);
const [first, second] = rainPoints;
const halfway = (first.x + second.x) / 2;
const risePerMinute = (second.y - first.y) / (second.x - first.x);
const halfRise = (halfway - first.x) * risePerMinute;
export const rainBarrel = {
  overviewPoints: rainPoints.slice(0, 2),
  points: rainPoints,
  minLitres: 0,
  maxLitres: upperBound(litres, litreTick),
  halfway,
  risePerMinute,
  halfRise,
  estimate: first.y + halfRise,
};

const { openingHour, entries, tick: entryTick } = plotInputs.gate;
const gatePoints = atIntervals(entries, openingHour, 1);
const gateOverview = gatePoints.slice(0, 4);
const gateTotal = total(entries);
export const dogGate = {
  overviewPoints: gateOverview,
  points: gatePoints,
  minEntries: 0,
  maxEntries: upperBound(entries, entryTick),
  hours: gatePoints.length,
  totalEntries: gateTotal,
  overviewMean: total(gateOverview.map(point => point.y)) / gateOverview.length,
  mean: gateTotal / gatePoints.length,
};

const { firstHour, celsius, tick: degreeTick } = plotInputs.shelf;
const shelfPoints = atIntervals(celsius, firstHour, 1);
const shelfOverview = shelfPoints.slice(0, 3);
const peak = Math.max(...celsius);
const peakHour = shelfPoints.find(point => point.y === peak).x;
export const farmShelf = {
  overviewPoints: shelfOverview,
  points: shelfPoints,
  minTemperature: Math.floor(Math.min(...celsius) / degreeTick) * degreeTick,
  maxTemperature: upperBound(celsius, degreeTick),
  overviewPeak: Math.max(...shelfOverview.map(point => point.y)),
  peak,
  peakHour,
  cooling: peak - celsius.at(-1),
  coolingHours: shelfPoints.at(-1).x - peakHour,
};

export function derived() {
  return {
    'pool-rain-barrel-midpoint': rainBarrel,
    'pool-dog-park-gate-mean': dogGate,
    'pool-farm-stand-shelf-peak': farmShelf,
  };
}
