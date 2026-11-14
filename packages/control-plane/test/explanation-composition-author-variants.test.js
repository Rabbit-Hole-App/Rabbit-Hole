import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';

const IDS = [
  'ml-linear-regression-linear-unit',
  'ml-neural-networks-hidden-layer',
  'ml-regularization-regularized-objective',
  'ml-regularization-dropout-mask',
];
for (const id of IDS) {
  test(`${id} reaches the real author request as its supported single-diagram variant`, () => {
    const parent = diagramReferences.find(ref => ref.id === id);
    assert.ok(parent, id);
    const prepared = prepareArtifactAuthorRequest({}, { command: 'explain', args: parent.prompts[0], depth: 'balanced' });
    assert.ok(!prepared.result, id);
    const single = prepared.diagramReferences.find(ref => ref.id === `${id}-single`);
    assert.ok(single, `${id}: the one-diagram variant is offered to the author`);
    assert.ok(!['panels', 'comparison', 'transformation'].includes(single.spec.diagram.kind), `${id}: supported leaf kind`);
    assert.ok(prepared.body.system.includes(JSON.stringify(single.spec)), `${id}: the actual prompt contains that spec`);
    assert.ok(!prepared.diagramReferences.some(ref => ref.id === id && ref.spec.diagram.kind === 'panels'), `${id}: no unsupported panels spec is sent`);
    const shapes = [];
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (node.properties?.kind?.const === single.spec.diagram.kind) shapes.push(node);
      for (const child of Object.values(node)) if (child && typeof child === 'object') visit(child);
    };
    visit(prepared.body.tools.find(tool => tool.name === 'make_explanation').input_schema);
    assert.ok(shapes.some(shape => Object.keys(single.spec.diagram).every(key => Object.hasOwn(shape.properties, key))),
      `${id}: every emitted diagram field is declared by the actual author tool schema`);
  });
}
