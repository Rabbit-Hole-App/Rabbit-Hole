import { soundcheckTiming, trailElevations } from './gen-1-number-line-data.js';

function numberLine(domain, content) {
  return { spec: { version: 1, diagram: { kind: 'number-line', ...domain, ...content } } };
}

const creek = { label: 'Creek', value: trailElevations.positions.creek };
const trailhead = { label: 'Trailhead', value: trailElevations.positions.trailhead };
const pineBend = { label: 'Pine bend', value: trailElevations.positions.pineBend };
const lookout = { label: 'Lookout', value: trailElevations.positions.lookout };
const trailMarkers = [creek, trailhead, pineBend, lookout];

const trailDepths = {
  overview: numberLine(trailElevations.domain, {
    title: 'Above and below the trailhead',
    markers: [creek, trailhead, lookout],
    caption: 'Measurements are in metres. Negative values are below the trailhead, and positive values are above it.',
  }),
  standard: numberLine(trailElevations.domain, {
    title: 'Elevations from the trailhead',
    markers: trailMarkers,
    caption: 'Subtract the trailhead elevation from the elevation of each spot. The marks show the differences in metres.',
  }),
  deep: numberLine(trailElevations.domain, {
    title: 'Signed elevations along the trail',
    markers: trailMarkers,
    caption: `Subtract the creek’s signed elevation from the lookout’s to find the vertical span of ${trailElevations.elevationSpan} m.`,
  }),
};

const handover = { label: 'Stage handover', value: soundcheckTiming.positions.handover };
const micCheck = { label: 'Mic check', value: soundcheckTiming.positions.micCheck };
const doors = { label: 'Doors open', value: soundcheckTiming.positions.doors };
const show = { label: 'Show begins', value: soundcheckTiming.positions.show };
const soundcheckMarkers = [handover, micCheck, doors, show];
const checkWindow = { label: 'Soundcheck window', ...soundcheckTiming.checkWindow };

const soundcheckDepths = {
  overview: numberLine(soundcheckTiming.domain, {
    title: 'Theatre soundcheck timing',
    markers: [handover, micCheck, doors],
    caption: 'The stage handover starts the clock. Read each mark in minutes after handover.',
  }),
  standard: numberLine(soundcheckTiming.domain, {
    title: 'Soundcheck before the doors open',
    markers: soundcheckMarkers,
    intervals: [checkWindow],
    caption: 'Soundcheck can begin at handover and must end before doors open. Each position counts minutes after handover.',
  }),
  deep: numberLine(soundcheckTiming.domain, {
    title: 'Read the soundcheck time window',
    markers: soundcheckMarkers,
    intervals: [checkWindow],
    caption: `Minutes after handover. The mic check starts ${soundcheckTiming.minutesUntilDoors} minutes before doors open. The open circle excludes the opening time.`,
  }),
};

export const references = [
  {
    id: 'pool-trailhead-elevation-offsets',
    lessons: [],
    prompts: ['Can you plot the creek, pine bend and lookout elevations relative to the trailhead?'],
    keywords: ['creek pine bend and lookout elevations', 'trailhead elevation offsets', 'creek and lookout relative elevations'],
    useWhen: 'Show signed elevations against a named datum and compare the height between two marked sites.',
    ...trailDepths.standard,
    depths: trailDepths,
  },
  {
    id: 'pool-soundcheck-time-window',
    lessons: [],
    prompts: ['Can you show the theatre soundcheck window from stage handover until the doors open?'],
    keywords: ['theatre soundcheck window', 'soundcheck after stage handover', 'soundcheck window before doors'],
    useWhen: 'Put crew events on the elapsed time scale and mark the soundcheck window with one included boundary and one excluded boundary.',
    ...soundcheckDepths.standard,
    depths: soundcheckDepths,
  },
];
