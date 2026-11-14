import test from 'node:test';
import assert from 'node:assert';
import { cards, namingRules, derived } from './topic-distribution-shift-data.js';
import { references } from './composition-distribution-shift-references.js';
import { tutorDiagramSchema } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const classes = ['A', 'B'];
const countLabels = labels => classes.map(name => labels.filter(label => label === name).length);

test('C02 input shift recomputes style counts while the fixed shape rule keeps both domains balanced', () => {
  const d = derived();
  assert.strictEqual(cards.length, 8);
  assert.strictEqual(d.counts.features, 2);
  assert.deepStrictEqual(cards.map(card => card.id), ['t1', 't2', 't3', 't4', 'd1', 'd2', 'd3', 'd4']);
  assert.deepStrictEqual(namingRules, { Elm: { round: 'A', square: 'B' }, Ash: { round: 'B', square: 'A' } });
  for (const domain of d.domains) {
    const rows = cards.filter(card => card.domain === domain.id);
    assert.deepStrictEqual(domain.cards, rows);
    assert.deepStrictEqual(domain.styleCounts, ['dark', 'light'].map(tone => rows.filter(card => card.tone === tone).length));
    assert.deepStrictEqual(domain.classCounts, countLabels(rows.map(card => card.shape === 'round' ? 'A' : 'B')));
    assert.deepStrictEqual(domain.classCounts, [2, 2]);
  }
  assert.deepStrictEqual(d.domains.map(domain => domain.styleCounts), [[3, 1], [1, 3]]);
  assert.strictEqual(new Set(d.domains.flatMap(domain => domain.cards.map(card => card.id))).size, cards.length);
});

test('C02 concept shift relabels the identical eight inputs and preserves the global label totals', () => {
  const d = derived();
  const expected = Object.entries(namingRules).map(([name, rule]) => ({ name, labels: cards.map(card => rule[card.shape]) }));
  for (const [index, setting] of d.concept.settings.entries()) {
    assert.strictEqual(setting.name, expected[index].name);
    assert.deepStrictEqual(setting.labels, expected[index].labels);
    assert.deepStrictEqual(setting.classCounts, countLabels(expected[index].labels));
    assert.deepStrictEqual(setting.classCounts, [4, 4]);
  }
  const changed = cards.filter((card, index) => expected[0].labels[index] !== expected[1].labels[index]).length;
  assert.strictEqual(d.concept.changedLabels, changed);
  assert.strictEqual(changed, 8);
  assert.strictEqual(d.concept.unchangedInputs, cards.length);
  assert.deepStrictEqual(d.concept.inputCounts, ['dark', 'light'].flatMap(tone => ['round', 'square'].map(shape => cards.filter(card => card.tone === tone && card.shape === shape).length)));
  assert.deepStrictEqual(d.concept.inputCounts, [3, 1, 1, 3]);
});

test('C02 competing labels are conditioned on one fixed input rather than domain prevalence', () => {
  const d = derived();
  for (const slice of d.concept.slices) {
    const rows = cards.filter(card => card.tone === slice.tone && card.shape === slice.shape);
    assert.strictEqual(slice.count, rows.length);
    assert.deepStrictEqual(slice.classCounts, Object.values(namingRules).map(rule => countLabels(rows.map(card => rule[card.shape]))));
    assert.ok(slice.classCounts.every(counts => counts.reduce((sum, value) => sum + value, 0) === slice.count));
  }
  assert.deepStrictEqual(d.concept.slices.map(slice => slice.classCounts), [[[3, 0], [0, 3]], [[0, 3], [3, 0]]]);
});

test('C02 shift references preserve source prompts, aliases and narrow routing metadata', () => {
  assert.deepStrictEqual(references.map(reference => reference.id), ['ml-distribution-shift-input-distribution-shift', 'ml-distribution-shift-concept-shift']);
  assert.deepStrictEqual(references.map(reference => reference.lessons), [['19', '20'], ['20']]);
  assert.ok(references.every(reference => reference.topic === 'distribution-shift' && /\bnot\b/iu.test(reference.useWhen)));
  assert.deepStrictEqual(references.map(reference => reference.keywords), [['input style shift', 'fixed class rule'], ['conditional label change', 'changed naming rule']]);
  assert.ok(references[0].prompts.includes('A training sample can teach a model a narrow version of the input domain even when both target classes are represented.'));
  assert.ok(references[0].prompts.includes('Deployment inputs can look unlike training inputs while the task still uses the same class definitions.'));
  assert.ok(references[1].prompts.includes('The same input can acquire different labels across settings when the labeling rule itself changes.'));
  assert.strictEqual(references[0].alsoCovers[0].figure, '02');
  assert.strictEqual(references[0].alsoCovers[0].summary, references[0].prompts[1]);
  assert.ok(references.every(reference => reference.paraphrases.length === 5 && reference.paraphrases.every(prompt => reference.prompts.includes(prompt))));
  assert.deepStrictEqual(references.flatMap(reference => reference.sources.map(source => source.path.split('#').at(-1))), ['figure-01', 'figure-02', 'figure-03']);
  assert.ok(references.flatMap(reference => reference.sources).every(source => source.revision === '05d5f02f6'));
});

test('C02 input views compare independent domains and derive style and class magnitudes from the cards', () => {
  const d = derived();
  const { overview, standard, deep } = references[0].depths;
  for (const view of [overview, standard]) {
    assert.strictEqual(view.spec.diagram.kind, 'comparison');
    assert.strictEqual(view.spec.diagram.variant, 'panels');
    assert.strictEqual(view.spec.diagram.links, undefined);
    assert.strictEqual(view.spec.diagram.shared, undefined, 'Comparison has no shared-class schema field');
  }
  assert.deepStrictEqual(overview.spec.diagram.panels.map(panel => panel.diagram.samples.length), [2, 2]);
  assert.deepStrictEqual(standard.spec.diagram.panels.map(panel => panel.diagram.samples.length), [4, 4]);
  for (const [index, panel] of standard.spec.diagram.panels.entries()) {
    assert.deepStrictEqual(panel.diagram.samples.map(sample => sample.id), d.domains[index].cards.map(card => card.id));
    assert.deepStrictEqual(panel.diagram.samples.map(sample => sample.class), d.domains[index].cards.map(card => namingRules.Elm[card.shape]));
    assert.deepStrictEqual(panel.diagram.samples.map(sample => sample.label.toLowerCase()), d.domains[index].cards.map(card => `${card.tone} ${card.shape}`));
  }
  const styles = deep.spec.diagram;
  assert.strictEqual(styles.kind, 'bar-chart');
  assert.strictEqual(styles.panels, undefined, 'Counts use the full chart width');
  assert.strictEqual(styles.variant, 'grouped');
  assert.deepStrictEqual(styles.categories, ['Dark', 'Light']);
  assert.deepStrictEqual(styles.series.map(series => series.values), d.domains.map(domain => domain.styleCounts));
  assert.deepStrictEqual(styles.series.map(series => series.values.reduce((sum, value) => sum + value, 0)), d.domains.map(domain => domain.cards.length));
  assert.strictEqual(deep.detailSpec.diagram.kind, 'bar-chart');
  assert.strictEqual(deep.detailSpec.diagram.variant, 'grouped');
  assert.deepStrictEqual(deep.detailSpec.diagram.categories, classes);
  assert.deepStrictEqual(deep.detailSpec.diagram.series.map(series => series.values), d.domains.map(domain => domain.classCounts));
});

test('C02 concept views keep conditional input fixed, preserve both competing classes, and add a whole-input check', () => {
  const d = derived();
  const { overview, standard, deep } = references[1].depths;
  for (const [view, slice] of [[overview, d.concept.slices[0]], [standard, d.concept.slices[0]], [deep, d.concept.slices[1]]]) {
    const diagram = view.spec.diagram;
    assert.strictEqual(diagram.kind, 'panels');
    assert.deepStrictEqual(diagram.shared, ['classes', 'colours']);
    assert.deepStrictEqual(diagram.panels.map(panel => panel.diagram.bars.map(bar => bar.label)), [classes, classes]);
    assert.deepStrictEqual(diagram.panels.map(panel => panel.diagram.bars.map(bar => bar.value)), slice.classCounts);
  }
  assert.ok(overview.spec.diagram.panels.every(panel => panel.label === undefined));
  assert.strictEqual(overview.spec.diagram.links[0].operation, 'Change rule', 'Panels show the rule-changing operation');
  assert.deepStrictEqual(standard.spec.diagram.panels.map(panel => panel.label), ['Round is A; square is B', 'Round is B; square is A']);
  assert.strictEqual(standard.spec.diagram.links[0].operation, 'Change label rule');
  assert.ok(deep.spec.diagram.caption.includes(`Same ${d.concept.unchangedInputs} inputs in both studios`));
  assert.ok(deep.spec.diagram.caption.includes(`${d.concept.changedLabels} labels change`));
  assert.deepStrictEqual(deep.detailSpec.diagram.panels.map(panel => panel.diagram.bars.map(bar => bar.value)), d.concept.settings.map(setting => setting.classCounts));
});

test('C02 shift compositions obey the frozen schema and content contract and fit the real 680 px renderer', () => {
  for (const reference of references) {
    assert.deepStrictEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    for (const [depth, view] of Object.entries(reference.depths)) for (const [field, spec] of Object.entries(view)) {
      const name = `${reference.id}/${depth}/${field}`;
      const parsed = tutorDiagramSchema.safeParse(spec);
      assert.ok(parsed.success, `${name}: ${JSON.stringify(parsed.error?.issues)}`);
      assert.deepStrictEqual(lintDiagramContent(spec), [], name);
      if (spec.diagram.panels) {
        assert.ok(spec.diagram.panels.length >= 2 && spec.diagram.panels.length <= 3, name);
        assert.ok(spec.diagram.panels.every(panel => !['panels', 'comparison', 'transformation'].includes(panel.diagram.kind)), name);
      }
      assert.ok(renderTutorDiagram(spec, 680).width <= 680, `${name}: no horizontal scrolling`);
    }
  }
});
