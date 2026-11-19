import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { derived, grantInputs, teaInputs } from './gen-1-pool-2-transformation-data.js';
import { references } from './gen-1-pool-2-transformation-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

function independentShares(scores, temperature = 1) {
  const weights = scores.map(score => Math.E ** (score / temperature));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return weights.map(weight => (weight / sum).toFixed(2));
}

const fixtures = [
  { id: 'pool-garden-grant-softmax', name: 'grant', options: grantInputs.projects },
  { id: 'pool-fruit-tea-blend-softmax', name: 'tea', options: teaInputs.ingredients, temperature: teaInputs.temperature },
];

for (const { id, name, options, temperature } of fixtures) {
  test(`${id} computes omitted shares in every depth and draws them at 408 px`, () => {
    const result = derived()[name];
    const scores = options.map(({ ratings }) => ratings[0] + ratings[1]);
    const expected = independentShares(scores, temperature);
    assert.deepEqual(result.shares, expected);
    assert.equal(expected.reduce((total, share) => total + Math.round(Number(share) * 100), 0), 100);

    const ref = references.find(item => item.id === id);
    for (const { spec } of Object.values(ref.depths)) {
      const { diagram } = spec;
      assert.equal(diagram.op, 'softmax');
      assert.equal(diagram.t, temperature);
      assert.equal(Object.hasOwn(diagram, 'links'), false);
      assert.equal(Object.hasOwn(diagram.after, 'items'), false);
      assert.deepEqual(diagram.before.items, options.map(({ label }, i) => `${label}: ${scores[i]}`));
      assert.deepEqual(lintDiagramContent(spec), []);

      const parsed = parseTutorDiagram(spec);
      assert.deepEqual(parsed.diagram.after.items, expected);
      assert.deepEqual(parseTutorDiagram(parsed), parsed);

      const rendered = renderTutorDiagram(spec, 408);
      assert.equal(rendered.width, 408);
      const markup = renderToStaticMarkup(rendered.element);
      for (const share of expected) assert.ok(markup.includes(`${share}</tspan>`), `Missing visible share ${share}`);
    }
    assert.deepEqual(ref.spec, ref.depths.standard.spec);
  });
}

test('detailed captions use the displayed grant and tea shares', () => {
  const values = derived();
  const [grant, tea] = references.map(ref => ref.depths.deep.spec.diagram.caption);
  assert.ok(grant.includes(`${values.grant.budget}-dollar grant`));
  assert.ok(grant.includes(`${values.grant.leaderDollars} dollars`));
  assert.equal(values.grant.leaderDollars, Math.round(grantInputs.budget * Number(independentShares(values.grant.scores).at(-1))));
  assert.ok(tea.includes(`${values.tea.unscaledLeaderPercent}% to ${values.tea.leaderPercent}%`));
  assert.equal(values.tea.unscaledLeaderPercent, Math.round(Number(independentShares(values.tea.scores)[0]) * 100));
  assert.equal(values.tea.leaderPercent, Math.round(Number(independentShares(values.tea.scores, teaInputs.temperature)[0]) * 100));
});
