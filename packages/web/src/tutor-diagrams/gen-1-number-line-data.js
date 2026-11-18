function relativeAxis(readings, origin, step) {
  const positions = Object.fromEntries(Object.entries(readings).map(([label, value]) => [label, value - origin]));
  const values = Object.values(positions);
  return {
    positions,
    domain: {
      min: Math.floor(Math.min(...values) / step) * step,
      max: Math.ceil(Math.max(...values) / step) * step,
    },
  };
}

// Worked elevations in metres for a fictional trail.
const heights = { creek: 1140, trailhead: 1200, pineBend: 1230, lookout: 1275 };
const elevationStep = 25;
const trailAxis = relativeAxis(heights, heights.trailhead, elevationStep);

export const trailElevations = {
  heights,
  step: elevationStep,
  ...trailAxis,
  elevationSpan: trailAxis.positions.lookout - trailAxis.positions.creek,
};

// Clock readings for a fictional theatre schedule, in the same evening.
const times = {
  handover: [18, 15],
  micCheck: [18, 30],
  doors: [19, 0],
  show: [19, 25],
};
const clockMinutes = Object.fromEntries(Object.entries(times)
  .map(([cue, [hours, minutes]]) => [cue, hours * 60 + minutes]));
const timeStep = 15;
const soundcheckAxis = relativeAxis(clockMinutes, clockMinutes.handover, timeStep);

export const soundcheckTiming = {
  times,
  step: timeStep,
  ...soundcheckAxis,
  checkWindow: {
    from: soundcheckAxis.positions.handover,
    to: soundcheckAxis.positions.doors,
    startClosed: true,
    endClosed: false,
  },
  minutesUntilDoors: soundcheckAxis.positions.doors - soundcheckAxis.positions.micCheck,
};
