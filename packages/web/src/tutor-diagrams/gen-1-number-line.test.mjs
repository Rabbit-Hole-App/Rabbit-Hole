import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { soundcheckTiming, trailElevations } from './gen-1-number-line-data.js';
import { references } from './gen-1-number-line-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

function checkRoundedBounds({ domain, step, positions }) {
  const values = Object.values(positions);
  const low = Math.min(...values);
  const high = Math.max(...values);
  assert.ok(Number.isInteger(domain.min / step) && Number.isInteger(domain.max / step));
  assert.ok(domain.min <= low && low - domain.min < step);
  assert.ok(domain.max >= high && domain.max - high < step);
}

test('trail positions recover each measured elevation from the trailhead reading', () => {
  const { heights, positions, elevationSpan } = trailElevations;
  for (const [site, elevation] of Object.entries(heights)) {
    assert.equal(heights.trailhead + positions[site], elevation, site);
  }
  assert.equal(elevationSpan, Math.max(...Object.values(heights)) - Math.min(...Object.values(heights)));
  checkRoundedBounds(trailElevations);
});

test('soundcheck boundaries and markers agree with the clock schedule', () => {
  const { times, positions, checkWindow, minutesUntilDoors } = soundcheckTiming;
  const elapsedMinutes = (instant, origin) =>
    (Date.UTC(2000, 0, 1, ...instant) - Date.UTC(2000, 0, 1, ...origin)) / 60_000;
  for (const [cue, clock] of Object.entries(times)) {
    assert.equal(positions[cue], elapsedMinutes(clock, times.handover), cue);
  }
  assert.deepEqual(checkWindow, {
    from: 0,
    to: elapsedMinutes(times.doors, times.handover),
    startClosed: true,
    endClosed: false,
  });
  assert.equal(minutesUntilDoors, elapsedMinutes(times.doors, times.micCheck));
  checkRoundedBounds(soundcheckTiming);
});

test('all six number-line specs render the source markers and endpoints at 408 px', () => {
  const expected = [
    { data: trailElevations, keys: { Creek: 'creek', Trailhead: 'trailhead', 'Pine bend': 'pineBend', Lookout: 'lookout' } },
    { data: soundcheckTiming, keys: { 'Stage handover': 'handover', 'Mic check': 'micCheck', 'Doors open': 'doors', 'Show begins': 'show' } },
  ];
  assert.equal(references.length, expected.length);
  for (const [index, reference] of references.entries()) {
    const { data, keys } = expected[index];
    assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.deepEqual(reference.spec, reference.depths.standard.spec);
    for (const [depth, { spec }] of Object.entries(reference.depths)) {
      const { diagram } = parseTutorDiagram(spec);
      assert.deepEqual(lintDiagramContent(spec), []);
      assert.equal(diagram.kind, 'number-line');
      assert.deepEqual({ min: diagram.min, max: diagram.max }, data.domain);
      assert.equal(diagram.markers.length, depth === 'overview' ? 3 : 4);
      for (const { label, value } of diagram.markers) {
        assert.equal(value, data.positions[keys[label]], label);
      }
      const { width, element } = renderTutorDiagram(spec, 408);
      const svg = renderToStaticMarkup(element);
      assert.equal(width, 408);
      assert.doesNotMatch(svg, /NaN|Infinity/);
      assert.deepEqual([...svg.matchAll(/data-tutor-number-marker="([^"]+)"/g)].map(match => Number(match[1])),
        diagram.markers.map(marker => marker.value));
      const endpoints = [...svg.matchAll(/data-tutor-endpoint="([^"]+)"/g)].map(match => match[1]);
      if (data.checkWindow && depth !== 'overview') {
        assert.deepEqual(diagram.intervals, [{ label: 'Soundcheck window', ...data.checkWindow }]);
        assert.deepEqual(endpoints, ['closed', 'open']);
      } else {
        assert.deepEqual(endpoints, []);
      }
    }
  }
});
