import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { diagramReferences } from './reference-library.js';
import { singleDiagramReferences } from './reference-single-variants.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const parents = diagramReferences.filter(({ id, spec: { diagram } }) =>
  (diagram.kind === 'comparison' && ((diagram.panels ?? diagram.columns).length === 2 || id === 'ml-fit-quality-comparison')) || // three panels, but its learner prompt (what is overfitting?) needs one multi-series plot (owner 2026-11-08)
  (diagram.kind === 'transformation' && diagram.variant === 'visual') ||
  diagram.kind === 'panels',
);

test('all two-panel references have exactly one linked single-diagram variant', () => {
  assert.equal(parents.length, 37); // 23 release references, eight figure chapters, the linear-regression normal-equation comparison, the logistic softmax panels and the four C01 panels references (linear unit, hidden layer, regularized objective, dropout mask: the answer panel is the variant).
  assert.deepEqual(singleDiagramReferences.map(r => r.panelReferenceId).sort(), parents.map(r => r.id).sort());
  for (const single of singleDiagramReferences) {
    const panel = parents.find(r => r.id === single.panelReferenceId);
    assert.equal(single.id, `${panel.id}-single`);
    assert.equal(single.variant, 'single');
    assert.deepEqual(single.keywords, panel.keywords);
    assert.deepEqual(single.prompts, panel.prompts);
    assert.deepEqual(single.lessons, panel.lessons);
    assert.ok(!diagramReferences.some(r => r.id === single.id));
  }
});

for (const { id, spec } of singleDiagramReferences) {
  test(`${id} renders as one diagram at all three gallery widths`, () => {
    const { diagram } = parseTutorDiagram(spec);
    assert.ok(!['comparison', 'transformation'].includes(diagram.kind));
    assert.deepEqual(lintDiagramContent(spec), []);
    for (const width of [320, 408, 720]) {
      const svg = renderToStaticMarkup(renderTutorDiagram(spec, width).element);
      assert.ok(svg.includes(`data-tutor-diagram="${diagram.kind}"`));
      assert.doesNotMatch(svg, /data-tutor-composition-child|NaN|Infinity|katex-error/);
    }
  });
}
