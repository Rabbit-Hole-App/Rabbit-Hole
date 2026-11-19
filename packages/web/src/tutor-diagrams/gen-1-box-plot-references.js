import { firedTileWidths, sunflowerHeights } from './gen-1-box-plot-data.js';

function boxPlot(data, title, caption, groups = data.groups) {
  return { spec: { version: 1, diagram: {
    kind: 'box-plot', title, caption, x: data.x, boxes: groups.map(group => group.box),
  } } };
}

const [windowTray, shelfTray] = sunflowerHeights.groups;
const { whiskerLow, whiskerHigh, outliers } = windowTray.box;
const tallSeedling = outliers[0].value;
const sunflowerDepths = {
  overview: boxPlot(sunflowerHeights, 'Sunflowers in the window tray',
    `Most seedlings measured ${whiskerLow} to ${whiskerHigh} cm. The ${tallSeedling} cm seedling sits apart.`, [windowTray]),
  standard: boxPlot(sunflowerHeights, 'Sunflower heights by tray',
    `The window tray median is ${windowTray.box.median} cm. The shelf tray median is ${shelfTray.box.median} cm.`),
  deep: boxPlot(sunflowerHeights, 'Why the tallest sunflower is flagged',
    `Median-of-halves quartiles give the window tray an IQR of ${windowTray.iqr} cm. The ${tallSeedling} cm seedling exceeds the ${windowTray.fences.upper} cm fence.`),
};

const [northKiln, southKiln] = firedTileWidths.groups;
const tileDepths = {
  overview: boxPlot(firedTileWidths, 'Tile widths by kiln',
    `Both sets center at ${northKiln.box.median} mm. The south kiln has a wider middle spread.`),
  standard: boxPlot(firedTileWidths, 'Fired tile width quartiles',
    `The middle half spans ${northKiln.box.q1} to ${northKiln.box.q3} mm in the north kiln and ${southKiln.box.q1} to ${southKiln.box.q3} mm in the south kiln.`),
  deep: boxPlot(firedTileWidths, 'Tile spreads at the same median',
    `With median-of-halves quartiles, the north IQR is ${northKiln.iqr} mm and the south IQR is ${southKiln.iqr} mm. Both medians are ${northKiln.box.median} mm.`),
};

export const references = [
  {
    id: 'pool-sunflower-tray-heights',
    lessons: [],
    prompts: ['What does a box plot of these sunflower seedling heights from the window and shelf trays show?'],
    keywords: ['sunflower tray heights', 'window tray sunflowers'],
    useWhen: 'Compare measured groups on a shared scale and show a tall seedling beyond its fence.',
    ...sunflowerDepths.standard,
    depths: sunflowerDepths,
  },
  {
    id: 'pool-fired-tile-widths',
    lessons: [],
    prompts: ['How do box plots of the fired clay tile widths from the north and south kilns compare?'],
    keywords: ['fired tile widths', 'kiln tile widths'],
    useWhen: 'Compare distributions with the same median and different middle spreads on one axis.',
    ...tileDepths.standard,
    depths: tileDepths,
  },
];
