import test from 'node:test';
import { strict as assert } from 'node:assert';
import { derived, trainingRows, heldoutRows, predictionHistories, parameters } from './topic-model-evaluation-data.js';
import { references } from './composition-model-evaluation-references.js';
import { tutorDiagramSchema } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}`);

test('C02 diagnostic metrics recompute binary cross entropy and correct counts from eight labelled examples', () => {
  const d = derived();
  assert.deepEqual(d.counts, { examples: 8, features: 1, training: 4, heldout: 4, epochs: 4 });
  assert.deepEqual([...trainingRows, ...heldoutRows].map(row => row.target), [0, 0, 1, 1, 0, 0, 1, 1]);
  assert.deepEqual(d.epochs, [1, 2, 3, 4]);
  for (const name of ['dropout', 'fixedRate']) for (const [split, rows] of [['training', trainingRows], ['heldout', heldoutRows]]) {
    predictionHistories[name][split].forEach((probabilities, epoch) => {
      const losses = probabilities.map((p, i) => -Math.log(rows[i].target ? p : 1 - p));
      const correct = probabilities.filter((p, i) => Number(p >= parameters.threshold) === rows[i].target).length;
      const actual = d[name][split][epoch];
      near(actual.loss, losses.reduce((sum, value) => sum + value, 0) / rows.length);
      assert.equal(actual.correct, correct);
      assert.equal(actual.accuracy, correct / rows.length);
      assert.equal(actual.percent, correct / rows.length * 100);
      assert.equal(actual.lossShown, Number(actual.loss.toFixed(3)));
      actual.losses.forEach((loss, i) => near(loss, losses[i]));
    });
  }
});

test('C02 dropout history has close loss traces and an independently checked held-out accuracy rise', () => {
  const d = derived();
  const expectedTraining = [.7135581778200728, .455503128099769, .3592324942721176, .2899092476264711];
  const expectedHeldout = [.7135581778200728, .5056708019653069, .3992538481088858, .3170619200552421];
  d.dropout.training.forEach((row, i) => near(row.loss, expectedTraining[i]));
  d.dropout.heldout.forEach((row, i) => near(row.loss, expectedHeldout[i]));
  assert.deepEqual(d.dropout.heldout.map(row => row.correct), [2, 3, 4, 4]);
  assert.deepEqual(d.dropout.heldout.map(row => row.percent), [50, 75, 100, 100]);
  const check = d.dropout.check;
  assert.equal(check.id, 'H2');
  assert.deepEqual(check.probabilities, [.4, .32]);
  assert.deepEqual(check.classes, [0, 0]);
  assert.deepEqual(check.correct, [1, 1]);
  near(check.losses[0], .5108256237659907);
  near(check.losses[1], .3856624808119847);
});

test('C02 fixed-rate history distinguishes an accuracy plateau from improving training fit', () => {
  const d = derived();
  const run = d.fixedRate;
  const expectedLoss = [.7135581778200728, .5427247880421677, .3824690223994787, .2262140885621230];
  run.training.forEach((row, i) => near(row.loss, expectedLoss[i]));
  assert.deepEqual(run.training.map(row => row.percent), [50, 75, 100, 100]);
  assert.deepEqual(run.heldout.map(row => row.percent), [50, 75, 75, 75]);
  assert.deepEqual(run.accuracyGap, [0, 0, 25, 25]);
  assert.deepEqual(run.rates, [.1, .1, .1, .1]);
  assert.equal(run.gapIncrease, 25);
  assert.deepEqual(run.check.map(row => row.id), ['T2', 'H2']);
  assert.deepEqual(run.check.map(row => row.probabilities), [[.55, .45], [.55, .6]]);
  assert.deepEqual(run.check.map(row => row.classes), [[1, 0], [1, 1]]);
  assert.deepEqual(run.check.map(row => row.correct), [[0, 1], [0, 0]]);
  near(run.check[0].losses[0], .7985076962177717);
  near(run.check[0].losses[1], .5978370007556204);
  near(run.check[1].losses[1], .9162907318741550);
});

const walk = values => values.flatMap(value => value && typeof value === 'object' ? [value, ...walk([value.props?.children].flat())] : []);
const views = reference => Object.entries(reference.depths).flatMap(([depth, view]) => Object.entries(view).map(([field, spec]) => ({ depth, field, spec })));

test('C02 diagnostics retain source identities, lesson links, canonical prompts and narrow learner intents', () => {
  const prompts = ['During dropout training the held-out loss can track the training loss while held-out accuracy improves.', 'A fixed learning rate can keep improving the training metric after held-out accuracy levels off.'];
  const sourceCounts = [12, 15];
  references.forEach((reference, i) => {
    assert.equal(reference.topic, 'model-evaluation');
    assert.deepEqual(reference.lessons, i ? ['09', '10', '12'] : ['09', '10']);
    assert.equal(reference.prompts[0], prompts[i]);
    assert.equal(reference.paraphrases.length, 5);
    assert.equal(new Set(reference.paraphrases).size, 5);
    assert.deepEqual(reference.prompts.slice(1), reference.paraphrases);
    assert.equal(reference.keywords.length, 2);
    assert.ok(reference.keywords.every(word => word === word.toLowerCase() && word.split(' ').length <= 3));
    assert.match(reference.useWhen, /\bnot\b/iu);
    assert.equal(reference.sources.length, sourceCounts[i]);
    assert.ok(reference.sources.every(source => source.kind === 'figure-brief' && source.revision === '05d5f02f6' && /briefs\.md#figure-\d\d$/u.test(source.path)));
  });
});

test('C02 every depth and extra check follows the schema and authored content contracts within 680 pixels', () => {
  for (const reference of references) {
    assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.ok(reference.depths.deep.detailSpec);
    for (const { depth, field, spec } of views(reference)) {
      assert.ok(tutorDiagramSchema.safeParse(spec).success, `${reference.id}/${depth}/${field} schema`);
      assert.deepEqual(lintDiagramContent(spec), [], `${reference.id}/${depth}/${field} content`);
      assert.match(spec.diagram.caption, /^Illustrative\b/u);
      const rendered = renderTutorDiagram(spec, 680);
      assert.ok(rendered.width <= 680, `${reference.id}/${depth}/${field} width ${rendered.width}`);
      const groups = walk([rendered.element]).filter(element => Object.hasOwn(element.props ?? {}, 'data-tutor-composition-child'));
      assert.equal(groups.length, 2, `${reference.id}/${depth}/${field} has two actual visual children`);
    }
    for (const depth of ['standard', 'deep']) {
      const diagram = reference.depths[depth].spec.diagram;
      assert.equal(diagram.kind, 'comparison');
      assert.equal(diagram.variant, 'panels');
      assert.deepEqual(diagram.sharedAxes, ['x']);
      assert.equal(diagram.panels.length, 2);
      assert.ok(diagram.panels.every(panel => panel.diagram.kind === 'coordinate-plot'));
      assert.deepEqual(diagram.panels[0].diagram.x, diagram.panels[1].diagram.x);
      assert.notDeepEqual(diagram.panels[0].diagram.y, diagram.panels[1].diagram.y);
    }
  }
});

test('C02 dropout plots expose the same recomputed loss and accuracy history as the summaries', () => {
  const d = derived();
  const reference = references[0];
  const overview = reference.depths.overview.spec.diagram.panels;
  assert.deepEqual(overview[0].diagram.series.map(row => row.values), [[.714, .29], [.714, .317]]);
  assert.deepEqual(overview[1].diagram.bars.map(row => row.value), [50, 100]);
  for (const depth of ['standard', 'deep']) {
    const [loss, accuracy] = reference.depths[depth].spec.diagram.panels.map(panel => panel.diagram);
    assert.deepEqual(loss.series.map(row => row.samples.y), [d.dropout.training.map(row => row.lossShown), d.dropout.heldout.map(row => row.lossShown)]);
    assert.deepEqual(accuracy.series[0].samples.y, [50, 75, 100, 100]);
    assert.deepEqual(loss.series[0].samples.x, [1, 2, 3, 4]);
  }
  assert.match(reference.depths.deep.spec.diagram.caption, /\$L=-y\\ln p-\(1-y\)\\ln\(1-p\)\$/u);
  const detail = reference.depths.deep.detailSpec.diagram;
  assert.equal(detail.links[0].operation, 'Compute BCE');
  assert.deepEqual(detail.panels[0].diagram.bars.map(row => row.value), [.4, .32]);
  assert.deepEqual(detail.panels[1].diagram.bars.map(row => row.value), [.511, .386]);
  assert.deepEqual(detail.panels.map(panel => panel.diagram.title), ['Class-one p by epoch', 'BCE by epoch (nats)']);
  assert.ok(detail.panels.every(panel => !Object.hasOwn(panel.diagram, 'unit')));
  assert.ok(detail.panels.every(panel => panel.diagram.bars.every((row, i) => row.label === String(d.dropout.check.epochs[i]))));
  assert.match(detail.caption, /true class 0/u);
  assert.match(detail.caption, /wrong-class probabilities/u);
});

test('C02 fixed-rate plots retain both accuracies, separate training loss and the emerging gap', () => {
  const d = derived();
  const reference = references[1];
  const overview = reference.depths.overview.spec.diagram.panels;
  assert.deepEqual(overview[0].diagram.bars.map(row => row.value), [.543, .226]);
  assert.deepEqual(overview[1].diagram.series.map(row => row.values), [[3, 4], [3, 3]]);
  for (const depth of ['standard', 'deep']) {
    const diagram = reference.depths[depth].spec.diagram;
    const [accuracy, loss] = diagram.panels.map(panel => panel.diagram);
    assert.deepEqual(accuracy.series.map(row => row.samples.y), [[50, 75, 100, 100], [50, 75, 75, 75]]);
    assert.deepEqual(loss.series[0].samples.y, d.fixedRate.training.map(row => row.lossShown));
    assert.deepEqual(accuracy.annotations, [{ kind: 'band', axis: 'x', from: 2, to: 4, label: 'Gap opens' }]);
    assert.ok(diagram.caption.includes(`$\\eta=${d.parameters.learningRate}$`));
  }
  assert.ok(reference.depths.deep.spec.diagram.caption.includes(`gap ${d.fixedRate.gapIncrease} percentage points`));
  const detail = reference.depths.deep.detailSpec.diagram;
  assert.deepEqual(detail.sharedAxes, ['x', 'y']);
  assert.deepEqual(detail.panels.map(panel => panel.diagram.series[0].samples.y), [[.55, .45], [.55, .6]]);
  assert.ok(detail.panels.every(panel => panel.diagram.annotations[0].value === d.parameters.threshold));
});
