// Worked example inputs for a fictional park map and a sample dessert cross-section.
export const hilltopMapInputs = {
  placeNames: ['Lookout', 'Playground', 'Pond gate'],
  paths: [
    { name: 'Ridge walk', legsMetres: [140, 110] },
    { name: 'Pond walk', legsMetres: [80, 120] },
  ],
  greenAreas: ['Orchard', 'Play lawn'],
  terrainRows: 2,
  terrainColumns: 3,
};

export const cocoaSliceInputs = {
  layersFromBase: ['Crumb base', 'Cocoa sponge', 'Raspberry gel', 'Whipped cream'],
  edgesMm: [0, 7, 22, 28, 39],
};

const sum = values => values.reduce((total, value) => total + value, 0);
const paths = hilltopMapInputs.paths.map(({ name, legsMetres }) => ({ name, metres: sum(legsMetres) }));

export const hilltopMap = {
  placeCount: hilltopMapInputs.placeNames.length,
  placeNames: hilltopMapInputs.placeNames.join(', '),
  paths,
  pathCount: paths.length,
  combinedPathMetres: sum(paths.map(path => path.metres)),
  greenAreaCount: hilltopMapInputs.greenAreas.length,
  greenAreaNames: hilltopMapInputs.greenAreas.join(' and '),
  terrainTileCount: hilltopMapInputs.terrainRows * hilltopMapInputs.terrainColumns,
};

const { edgesMm, layersFromBase } = cocoaSliceInputs;
export const cocoaSlice = {
  thicknessMm: edgesMm.at(-1) - edgesMm[0],
  layersFromTop: layersFromBase.map((label, index) => ({
    label,
    lowerMm: edgesMm[index],
    upperMm: edgesMm[index + 1],
    thicknessMm: edgesMm[index + 1] - edgesMm[index],
  })).reverse(),
};
