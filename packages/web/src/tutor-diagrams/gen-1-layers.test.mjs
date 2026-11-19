import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { cocoaSliceInputs, hilltopMapInputs } from './gen-1-layers-data.js';
import { references } from './gen-1-layers-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const diagramAt = (id, depth) => references.find(ref => ref.id === id).depths[depth].spec.diagram;

test('Hilltop Park layers retain front-to-back order and their quantities match the map inputs', () => {
  const { placeNames, paths, greenAreas, terrainRows, terrainColumns } = hilltopMapInputs;
  const id = 'pool-hilltop-park-map-layers';
  const labels = ['Place labels', 'Walking paths', 'Green areas', 'Shaded terrain'];
  for (const depth of ['overview', 'standard', 'deep']) {
    assert.deepEqual(diagramAt(id, depth).layers.map(layer => layer.label), labels);
  }

  const total = sum(paths.flatMap(path => path.legsMetres));
  const tiles = terrainRows * terrainColumns;
  assert.deepEqual(diagramAt(id, 'standard').layers.map(layer => layer.detail), [
    `${placeNames.length} place names`,
    `${paths.length} paths, ${total} m combined`,
    `${greenAreas.length} green areas`,
    `${tiles} terrain tiles`,
  ]);
  assert.deepEqual(diagramAt(id, 'deep').layers.map(layer => layer.detail), [
    `${placeNames.length} names · ${placeNames.join(', ')}`,
    paths.map(path => `${path.name} ${sum(path.legsMetres)} m`).join(' and '),
    `${greenAreas.length} areas · ${greenAreas.join(' and ')}`,
    `${tiles} tiles form the base`,
  ]);
});

test('the cocoa slice layers span the cut edge and add up to its full thickness', () => {
  const { layersFromBase, edgesMm } = cocoaSliceInputs;
  const id = 'pool-raspberry-cocoa-slice-layers';
  const labelsFromTop = layersFromBase.toReversed();
  for (const depth of ['overview', 'standard', 'deep']) {
    assert.deepEqual(diagramAt(id, depth).layers.map(layer => layer.label), labelsFromTop);
  }

  const edgesFromTop = edgesMm.toReversed();
  const thicknesses = labelsFromTop.map((_, index) => edgesFromTop[index] - edgesFromTop[index + 1]);
  assert.deepEqual(diagramAt(id, 'standard').layers.map(layer => layer.detail),
    thicknesses.map(thickness => `${thickness} mm thick`));
  assert.deepEqual(diagramAt(id, 'deep').layers.map(layer => layer.detail),
    thicknesses.map((thickness, index) => `${edgesFromTop[index + 1]} to ${edgesFromTop[index]} mm above the base · ${thickness} mm thick`));
  const sliceThickness = edgesMm.at(-1) - edgesMm[0];
  assert.equal(sum(thicknesses), sliceThickness);
  assert.equal(diagramAt(id, 'standard').caption, `The layers add up to a ${sliceThickness} mm slice from base to topping.`);
  assert.equal(diagramAt(id, 'deep').caption, `All heights are measured from the bottom of the ${sliceThickness} mm slice.`);
});

test('each depth parses and renders as a single 408 px layer stack', () => {
  for (const ref of references) {
    assert.deepEqual(Object.keys(ref.depths), ['overview', 'standard', 'deep']);
    assert.deepEqual(ref.spec, ref.depths.standard.spec);
    for (const { spec } of Object.values(ref.depths)) {
      assert.deepEqual(parseTutorDiagram(spec), spec);
      assert.equal(spec.diagram.kind, 'layers');
      assert.deepEqual(lintDiagramContent(spec), []);

      const { element, width } = renderTutorDiagram(spec, 408);
      const svg = renderToStaticMarkup(element);
      assert.equal(width, 408);
      assert.doesNotMatch(svg, /NaN|Infinity/);
      for (const { label } of spec.diagram.layers) assert.ok(svg.includes(`>${label}</tspan>`));
    }
  }
});
