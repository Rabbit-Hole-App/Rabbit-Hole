import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { derived, filterGrit, parcelStretches, toasterTimeline } from './gen-1-pool-2-block-stack-data.js';
import { references } from './gen-1-pool-2-block-stack-references.js';
import { lintDiagramContent } from './content-contract.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const data = derived();
const displayedNumbers = text => [...text.matchAll(/\d+/g)].map(([value]) => Number(value));
const dimensions = reference => reference.spec.diagram.blocks.map(({ dims }) => dims);
const caption = reference => reference.depths.deep.spec.diagram.caption;

test('toaster stage measurements and cycle totals agree', () => {
  const [reference] = references;
  const [first, ...ends] = Object.values(toasterTimeline);
  const starts = [first, ...ends.slice(0, -1)];
  const times = ends.map((end, index) => end - starts[index]);
  const [carriage, warmup, browning, lift] = times;
  const outsideBrowning = carriage + warmup + lift;
  const cycle = outsideBrowning + browning;

  assert.deepEqual(data[reference.id], { carriage, warmup, browning, lift, cycle, outsideBrowning });
  assert.deepEqual(dimensions(reference), times.map(seconds => `${seconds} s`));
  assert.deepEqual(displayedNumbers(caption(reference)), [browning, cycle, outsideBrowning]);
});

test('each water filter stage accounts for the feed grit', () => {
  const reference = references[1];
  const [e, f] = filterGrit.mixed;
  const [m, n] = filterGrit.meshDeposit;
  const [p, q] = filterGrit.paperDeposit;
  const feed = e + f;
  const afterMesh = feed - m - n;
  const afterPaper = afterMesh - p - q;
  const captured = feed - afterPaper;

  assert.deepEqual(data[reference.id], { feed, afterMesh, afterPaper, captured });
  assert.deepEqual(dimensions(reference), [feed, afterMesh, afterPaper, afterPaper].map(mass => `${mass} mg grit`));
  assert.deepEqual(displayedNumbers(caption(reference)), [captured, afterPaper]);
});

test('parcel positions and end-to-end distance agree with the measured stretches', () => {
  const reference = references[2];
  const [entry, middle, exit] = parcelStretches;
  const route = entry + middle + exit;
  const stations = [0, entry, route - exit, route];
  assert.ok(middle > entry && middle > exit);

  assert.deepEqual(data[reference.id], { stations, route, longest: middle, stretchCount: parcelStretches.length });
  assert.deepEqual(dimensions(reference), stations.map(distance => `${distance} m`));
  assert.deepEqual(displayedNumbers(caption(reference)), [middle, parcelStretches.length, route]);
});

test('all three depths render the ordered blocks at 408 px without residuals or joins', () => {
  for (const reference of references) {
    for (const [depth, { spec }] of Object.entries(reference.depths)) {
      const key = `${reference.id}/${depth}`;
      const { diagram } = parseTutorDiagram(spec);
      assert.equal(diagram.kind, 'block-stack', key);
      assert.equal(diagram.edges, undefined, key);
      assert.ok(diagram.blocks.every(item => !item.merge && !item.inputs && !item.diagram), key);
      assert.deepEqual(lintDiagramContent(spec), [], key);
      const { element, width } = renderTutorDiagram(spec, 408);
      const markup = renderToStaticMarkup(element);
      assert.equal(width, 408, key);
      assert.deepEqual([...markup.matchAll(/data-block-stack-node="([^"]+)"/g)].map(match => match[1]),
        diagram.blocks.map(block => block.id), key);
      assert.doesNotMatch(markup, /data-block-stack-(?:residual|merge|input)/, key);
    }
  }
});
