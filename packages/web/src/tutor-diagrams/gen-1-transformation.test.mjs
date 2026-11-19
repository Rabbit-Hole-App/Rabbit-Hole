import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { thumbnailCrop } from './gen-1-transformation-data.js';
import { references } from './gen-1-transformation-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

test('cropped dimensions and areas agree with counting pixels inside the retained rectangle', () => {
  const { photos, sideMargin, verticalMargin, widthTrimmed, heightTrimmed } = thumbnailCrop;
  for (const photo of photos) {
    const { original, cropped, pixelsKept, pixelsRemoved } = photo;
    const keptPositions = (length, margin) => Array.from({ length }, (_, i) => i)
      .filter(i => i >= margin && i < length - margin).length;
    const keptColumns = keptPositions(original.width, sideMargin);
    const keptRows = keptPositions(original.height, verticalMargin);

    assert.deepEqual(cropped, { width: keptColumns, height: keptRows });
    assert.equal(widthTrimmed, original.width - keptColumns);
    assert.equal(heightTrimmed, original.height - keptRows);
    assert.equal(pixelsKept, keptColumns * keptRows);
    assert.equal(pixelsRemoved, original.width * original.height - keptColumns * keptRows);
  }
});

test('every depth renders the same three before and after text items at 408 px', () => {
  const [reference] = references;
  assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
  assert.deepEqual(reference.spec, reference.depths.standard.spec);

  for (const { spec } of Object.values(reference.depths)) {
    const { diagram } = parseTutorDiagram(spec);
    assert.equal(diagram.kind, 'transformation');
    assert.equal(diagram.variant, undefined);
    assert.equal(diagram.links, undefined);
    assert.deepEqual(lintDiagramContent(spec), []);

    const { width, element } = renderTutorDiagram(spec, 408);
    const svg = renderToStaticMarkup(element);
    assert.equal(width, 408);
    assert.doesNotMatch(svg, /NaN|Infinity/);
    for (const [state, dimensions] of [['before', 'original'], ['after', 'cropped']]) {
      assert.equal(diagram[state].items.length, 3);
      thumbnailCrop.photos.forEach((photo, index) => {
        const { width, height } = photo[dimensions];
        assert.equal(diagram[state].items[index], `${photo.label} ${width} by ${height}`);
        assert.ok(svg.includes(`${photo.label} ${width} by ${height}`));
      });
    }
  }
});
