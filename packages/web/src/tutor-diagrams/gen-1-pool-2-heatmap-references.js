import { aisles, derived } from './gen-1-pool-2-heatmap-data.js';

export { derived };

const { rows, lowest, highest, spread } = derived();
const highCell = { row: highest.row, column: highest.column };
const lowCell = { row: lowest.row, column: lowest.column };
const grid = { kind: 'heatmap', columns: aisles, rows };

const overview = { version: 1, diagram: {
  ...grid, title: 'Foot traffic at a craft market',
  caption: 'Each cell counts passersby at one aisle during that period.',
} };
const standard = { version: 1, diagram: {
  ...grid, title: 'Craft market traffic by aisle and period',
  rowLabel: 'Market period', columnLabel: 'Aisle', highlights: [highCell],
  caption: 'The darkest cell marks the busiest aisle and period.',
} };
const deep = { version: 1, diagram: {
  ...standard.diagram, title: 'The craft market color scale',
  highlights: [highCell, lowCell],
  caption: `The lightest and darkest cells show ${lowest.value} and ${highest.value} visits. The scale spans ${spread} visits.`,
} };

export const references = [{
  id: 'pool-craft-market-aisle-traffic', lessons: [],
  prompts: ['How do the craft market aisle tallies set the color scale for foot traffic?'],
  keywords: ['craft market traffic', 'market aisle tallies'],
  useWhen: 'Compare an observed count grid with a color scale taken from its cells.',
  spec: standard, depths: { overview: { spec: overview }, standard: { spec: standard }, deep: { spec: deep } },
}];
