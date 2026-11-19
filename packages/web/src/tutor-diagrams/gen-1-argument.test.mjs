import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { bookReturn, mugSleeve, posterPrint } from './gen-1-argument-data.js';
import { references } from './gen-1-argument-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

function checkShownValues(id, expectedByDepth) {
  const reference = references.find(entry => entry.id === id);
  for (const [depth, expected] of Object.entries(expectedByDepth)) {
    const { title, claim, support, objections, conclusion, caption } = reference.depths[depth].spec.diagram;
    const text = [title, claim, ...support.map(item => item.label), ...objections.map(item => item.label),
      conclusion, caption].filter(Boolean).join(' ');
    const actual = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(([value]) => Number(value));
    assert.deepEqual(actual, expected, depth);
  }
}

test('the library trial counts each return and accounts for the closing schedule', () => {
  let eveningCount = 0;
  let nightReturns = 0;
  let total = 0;
  for (const [index, dayReturns] of bookReturn.openHoursReturns.entries()) {
    const nights = bookReturn.afterHoursReturns[index];
    total += dayReturns + nights;
    nightReturns += nights;
    if (nights > 0) eveningCount++;
  }
  const collection = bookReturn.minutesPerPickup * bookReturn.openHoursReturns.length;
  const percent = Number((100 * nightReturns / total).toFixed(0));
  assert.equal(eveningCount, bookReturn.openHoursReturns.length);
  assert.equal(nightReturns, bookReturn.afterHoursTotal);
  assert.equal(total, bookReturn.totalReturns);
  assert.equal(percent, bookReturn.afterHoursPercent);
  assert.equal(collection, bookReturn.pickupMinutes);
  assert.equal(bookReturn.spareMinutes + collection, bookReturn.closingAllowance);
  assert.ok(bookReturn.spareMinutes > 0);
  checkShownValues('pool-late-library-return', {
    overview: [nightReturns, eveningCount],
    standard: [nightReturns, total, eveningCount, collection, bookReturn.closingAllowance],
    deep: [percent, bookReturn.closingAllowance - collection, collection],
  });
});

test('the mug trial measures matched heat losses over the same interval', () => {
  let feltLoss = 0;
  let bareLoss = 0;
  let feltWins = 0;
  for (const { felt, bare } of mugSleeve.trials) {
    feltLoss += mugSleeve.initialTemperature - felt;
    bareLoss += mugSleeve.initialTemperature - bare;
    if (felt > bare) feltWins++;
  }
  const count = mugSleeve.trials.length;
  const difference = (bareLoss - feltLoss) / count;
  assert.equal(feltWins, count);
  assert.equal(feltLoss / count, mugSleeve.feltLoss);
  assert.equal(bareLoss / count, mugSleeve.bareLoss);
  assert.equal(difference, mugSleeve.retainedDifference);
  checkShownValues('pool-felt-mug-sleeve', {
    overview: [mugSleeve.initialTemperature - feltLoss / count, mugSleeve.initialTemperature - bareLoss / count, feltWins],
    standard: [difference, feltWins, count, mugSleeve.elapsedMinutes],
    deep: [feltLoss / count, bareLoss / count, mugSleeve.elapsedMinutes, difference, mugSleeve.initialTemperature],
  });
});

test('the poster budget and setup comparison use the same print run', () => {
  const { copies, budgetCents, minutesPerInk, logoInks, reduced, original } = posterPrint;
  const reducedCost = reduced.unitCents * copies / 100;
  const savedCost = (original.unitCents - reduced.unitCents) * copies / 100;
  const setupMinutes = reduced.inks * minutesPerInk;
  const savedTime = (original.inks - reduced.inks) * minutesPerInk;
  assert.equal(reducedCost, posterPrint.reducedDollars);
  assert.equal(savedCost, posterPrint.savedDollars);
  assert.equal(setupMinutes, reduced.setupMinutes);
  assert.equal(savedTime, posterPrint.savedMinutes);
  assert.equal(logoInks, original.inks);
  assert.ok(reduced.inks < logoInks);
  assert.ok(reducedCost * 100 <= budgetCents && original.unitCents * copies > budgetCents);
  checkShownValues('pool-club-poster-inks', {
    overview: [reduced.inks, reducedCost, setupMinutes],
    standard: [reduced.inks, reducedCost, budgetCents / 100, setupMinutes, setupMinutes + savedTime, logoInks, reduced.inks],
    deep: [reduced.inks, savedCost, savedTime, logoInks, copies],
  });
});

test('every argument depth renders both evidence lanes at 408 px', () => {
  assert.equal(references.length, 3);
  for (const reference of references) {
    assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.deepEqual(reference.spec, reference.depths.standard.spec);
    for (const [depth, { spec }] of Object.entries(reference.depths)) {
      const { diagram } = parseTutorDiagram(spec);
      assert.deepEqual(lintDiagramContent(spec), []);
      assert.equal(diagram.kind, 'argument');
      assert.equal(diagram.support.length, 2);
      assert.equal(diagram.objections.length, 1);
      const { width, height, element } = renderTutorDiagram(spec, 408);
      const description = `${reference.id} ${depth}`;
      assert.equal(width, 408, description);
      assert.ok(height > 0, description);
      const svg = renderToStaticMarkup(element);
      assert.match(svg, /data-tutor-diagram="argument"/);
      assert.match(svg, />Support<\/tspan>/);
      assert.match(svg, />Objections<\/tspan>/);
      assert.doesNotMatch(svg, /NaN|Infinity/);
    }
  }
});
