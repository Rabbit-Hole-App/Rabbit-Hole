import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { bertFigureReferences } from '../../web/src/tutor-diagrams/bert-figure-references.js';
import { selectForAuthor } from '../src/explanation-references.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';

const routes = [
  ['A visual backbone can pass a learned vector to a classifier just as a text encoder does.', 'ml-transfer-learning-modality-feature-classifier'],
  ['BERT belongs to a line of work that combines reusable language representations with Transformer encoders.', 'ml-bert-pretraining-families'],
  ['Supervised task adaptation needs examples paired with their correct classes.', 'ml-bert-supervised-class-pairs'],
  ['A classifier can read the contextual output at the designated summary token.', 'ml-bert-summary-token-readout'],
  ['A classification head converts one contextual vector into scores for the task classes.', 'ml-bert-summary-token-readout'],
  ['Masked language modelling recovers a selected missing token from the rest of a bidirectional context.', 'ml-bert-masked-token'],
  ['The original BERT training setup includes deciding whether a second passage follows a first passage.', 'ml-bert-next-sentence'],
  ['Different BERT tasks read different positions in the same encoder outputs or attach different task heads.', 'ml-bert-task-heads'],
];

test('C04 all source statements reach their intended native author examples at every depth', () => {
  for (const [prompt, id] of routes) for (const depth of ['brief', 'balanced', 'detailed']) {
    assert.equal(selectForAuthor({ prompt, depth }).references[0]?.id, id, `${id}/${depth}`);
    for (const env of [{}, { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' }]) {
      const prepared = prepareArtifactAuthorRequest(env, { command: 'explanation', args: prompt, depth });
      const selected = prepared.diagramReferences[0];
      assert.equal(selected?.id, id);
      assert.ok(prepared.body.system.includes(JSON.stringify(selected.spec)));
      const schema = prepared.body.tools.find(tool => tool.name === 'make_explanation').input_schema;
      const visual = (schema.properties.visuals.items.oneOf ?? schema.properties.visuals.items.anyOf).find(branch => branch.properties.spec);
      const kinds = (visual.properties.spec.properties.diagram.oneOf ?? visual.properties.spec.properties.diagram.anyOf).map(branch => branch.properties.kind.const);
      assert.ok(kinds.includes(selected.spec.diagram.kind), 'Actual author bundle admits the native kind');
    }
  }
});

test('C04 reused BERT references retain all old visual/data/lesson behavior', () => {
  for (const id of ['ml-bert-pretraining-families', 'ml-bert-masked-token', 'ml-bert-next-sentence', 'ml-bert-task-heads']) {
    const old = bertFigureReferences.find(reference => reference.id === id);
    const current = diagramReferences.find(reference => reference.id === id);
    for (const field of ['spec', 'depths', 'lessons', 'useWhen', 'paraphrases']) assert.deepEqual(current[field], old[field], `${id}/${field}`);
    assert.ok(old.prompts.every(prompt => current.prompts.includes(prompt)));
    assert.ok(old.keywords.every(keyword => current.keywords.includes(keyword)));
  }
  assert.equal(new Set(diagramReferences.map(reference => reference.id)).size, diagramReferences.length);
});
