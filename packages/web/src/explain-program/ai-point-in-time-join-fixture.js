import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const pointInTimeJoinFixture = {
  id: 'fixture-ai-point-in-time-join',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Point-in-Time Join Explorer',
    summary: 'A point-in-time join takes the newest feature snapshot available when a label was recorded.',
    description: 'Move Label day to compare the matched snapshot with the newest row in the store. When the newest row is still in the future, using it would leak information into training.',
    assumptions: ['One user. Each snapshot counts visits in the previous seven days and becomes available on its snapshot day. Snapshots do not expire in this example.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'labelDay', label: 'Label day', type: 'number', default: 7, min: 1, max: 10, step: 1 }],
    readouts: [],
  },
  source: `
const snapshots = [
  { day: 3, visits: 2 },
  { day: 6, visits: 5 },
  { day: 9, visits: 8 },
];

export function evaluate({ inputs }) {
  const labelDay = Math.round(inputs.labelDay);
  const match = snapshots.findLast(row => row.day <= labelDay);
  const latest = snapshots.at(-1);
  const leaks = latest.day > labelDay;
  const label = row => 'Day ' + row.day + ' · ' + row.visits + ' visits';
  const objects = [
    ...sdk.timeline('join', {
      x: 24, y: 20, w: 568, h: 158, domain: [1, 10], unit: 'day', cursor: labelDay,
      lanes: [
        { id: 'snapshots', label: 'Snapshots', events: snapshots.map(row => ({
          id: 'day-' + row.day, at: row.day, label: label(row),
          role: row === match ? 'learner' : 'observed',
        })) },
        { id: 'label', label: 'Label day', events: [
          { id: 'cutoff', at: labelDay, label: 'Day ' + labelDay, role: 'learner' },
        ] },
      ],
    }),
    sdk.box('as-of', 24, 194, 568, 40, {
      text: 'As of label · ' + (match ? label(match) : 'No eligible snapshot'),
      role: match ? 'learner' : 'neutral',
    }),
    sdk.box('latest', 24, 246, 568, 40, {
      text: 'Latest only · ' + label(latest) + (leaks ? ' · Future data' : ''),
      role: leaks ? 'warning' : 'neutral',
    }),
  ];
  return { frame: sdk.frame(objects, { width: 616, height: 306 }) };
}`,
};
