export const toasterTimeline = {
  breadIn: 0,
  carriageDown: 4,
  chamberWarm: 18,
  heatOff: 87,
  breadUp: 90,
};

// Dry grit weighed before the pour and in the deposits on each filter.
export const filterGrit = { mixed: [45, 55], meshDeposit: [23, 31], paperDeposit: [12, 19] };

// Measured path lengths between the depot stations, in order.
export const parcelStretches = [4, 7, 5];

const sum = values => values.reduce((total, value) => total + value, 0);

export function derived() {
  const { breadIn, carriageDown, chamberWarm, heatOff, breadUp } = toasterTimeline;
  const carriage = carriageDown - breadIn;
  const warmup = chamberWarm - carriageDown;
  const browning = heatOff - chamberWarm;
  const lift = breadUp - heatOff;
  const cycle = breadUp - breadIn;

  const feed = sum(filterGrit.mixed);
  const mesh = sum(filterGrit.meshDeposit);
  const paper = sum(filterGrit.paperDeposit);
  const captured = mesh + paper;

  const stations = [0, ...parcelStretches.map((_, index) => sum(parcelStretches.slice(0, index + 1)))];

  return {
    'pool-pop-up-toaster-stages': { carriage, warmup, browning, lift, cycle, outsideBrowning: cycle - browning },
    'pool-mesh-and-paper-water-filter': { feed, afterMesh: feed - mesh, afterPaper: feed - captured, captured },
    'pool-parcel-sorting-line': {
      stations, route: stations.at(-1), longest: Math.max(...parcelStretches), stretchCount: parcelStretches.length,
    },
  };
}
