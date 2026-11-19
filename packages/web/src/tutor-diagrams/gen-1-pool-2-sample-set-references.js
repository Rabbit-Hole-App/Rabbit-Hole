import { derived, drawnSlips, trays } from './gen-1-pool-2-sample-set-data.js';

export { derived };

const draw = { id: 'inspection', label: 'Inspection draw', replacement: true, members: drawnSlips };
const complement = { id: 'unpicked', label: 'Unpicked trays', outOfBagFor: draw.id };
const { draws, trayCount, inspected, unpicked, omitted } = derived();
const drawWithOmissions = { ...draw, omitted };

const overview = { version: 1, diagram: {
  kind: 'sample-set', title: 'Pick trays for a bakery spot check',
  samples: trays.map(({ id }) => ({ id })),
  groups: [draw, complement],
  caption: 'Each slip goes back in the bag. The unpicked trays form the bottom row.',
} };
const standard = { version: 1, diagram: {
  kind: 'sample-set', title: 'Which cookie trays escaped inspection?',
  samples: trays,
  groups: [drawWithOmissions, complement],
  caption: 'Repeated slips count as extra draws. The omitted IDs and the bottom row identify the same trays.',
} };
const deep = { version: 1, diagram: {
  ...standard.diagram, title: 'Draw count and tray coverage',
  caption: `${draws} draws reached ${inspected} of ${trayCount} trays. The complement holds the other ${unpicked}.`,
} };

export const references = [{
  id: 'pool-bakery-tray-spot-check', lessons: [],
  prompts: ['Which cookie trays did the bakery tray spot check miss after returning each slip?'],
  keywords: ['bakery tray draw', 'cookie tray slips'],
  useWhen: 'Show which IDs are absent from a draw made with replacement.',
  spec: standard, depths: { overview: { spec: overview }, standard: { spec: standard }, deep: { spec: deep } },
}];
