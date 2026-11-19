import { cocoaSlice, hilltopMap } from './gen-1-layers-data.js';

function stack(title, caption, layers) {
  return { spec: { version: 1, diagram: { kind: 'layers', title, caption, layers } } };
}

function reference(id, prompt, keywords, useWhen, depths) {
  return { id, lessons: [], prompts: [prompt], keywords, useWhen, spec: depths.standard.spec, depths };
}

const mapLabels = ['Place labels', 'Walking paths', 'Green areas', 'Shaded terrain'];
const mapLayers = details => mapLabels.map((label, index) => ({ label, detail: details[index] }));

export const references = [
  reference(
    'pool-hilltop-park-map-layers',
    'Show the drawing order of the layers in the Hilltop Park map artwork.',
    ['hilltop park map artwork', 'hilltop park map layers'],
    'Show a map from its frontmost labels to its bottom terrain. Paths and park fill sit between them.',
    {
      overview: stack('Hilltop Park map', 'Look from the top of the stack to the bottom. Place names stay above the paths and terrain.',
        mapLayers(['Names to read', 'Routes to follow', 'Lawns and planted areas', 'Hills and slopes'])),
      standard: stack('Hilltop Park map drawing order', 'Place labels sit above the lines and fills so they can stay legible.',
        mapLayers([
          `${hilltopMap.placeCount} place names`,
          `${hilltopMap.pathCount} paths, ${hilltopMap.combinedPathMetres} m combined`,
          `${hilltopMap.greenAreaCount} green areas`,
          `${hilltopMap.terrainTileCount} terrain tiles`,
        ])),
      deep: stack('Front to back in the Hilltop Park map', 'The walking paths draw over green fill and hill shading. The place names draw on top.',
        mapLayers([
          `${hilltopMap.placeCount} names · ${hilltopMap.placeNames}`,
          hilltopMap.paths.map(path => `${path.name} ${path.metres} m`).join(' and '),
          `${hilltopMap.greenAreaCount} areas · ${hilltopMap.greenAreaNames}`,
          `${hilltopMap.terrainTileCount} tiles form the base`,
        ])),
    },
  ),
  reference(
    'pool-raspberry-cocoa-slice-layers',
    'Show the layer order and thicknesses in a raspberry cocoa slice.',
    ['raspberry cocoa slice', 'raspberry cocoa slice layers'],
    'Show the physical layers of a dessert slice from whipped topping to crumb base, with thicknesses from the same cut edge.',
    {
      overview: stack('Raspberry cocoa slice', 'Read the dessert from the cream topping down to the crumb base.',
        cocoaSlice.layersFromTop.map(({ label }) => ({ label }))),
      standard: stack('Thickness of each dessert layer', `The layers add up to a ${cocoaSlice.thicknessMm} mm slice from base to topping.`,
        cocoaSlice.layersFromTop.map(({ label, thicknessMm }) => ({ label, detail: `${thicknessMm} mm thick` }))),
      deep: stack('Raspberry cocoa slice cut edge', `All heights are measured from the bottom of the ${cocoaSlice.thicknessMm} mm slice.`,
        cocoaSlice.layersFromTop.map(({ label, lowerMm, upperMm, thicknessMm }) => ({
          label, detail: `${lowerMm} to ${upperMm} mm above the base · ${thicknessMm} mm thick`,
        }))),
    },
  ),
];
