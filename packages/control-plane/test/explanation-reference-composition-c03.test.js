import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReferences, phase02LessonCoverage } from '../../web/src/tutor-diagrams/reference-library.js';
import { transformerFigureReferences } from '../../web/src/tutor-diagrams/transformer-figure-references.js';
import manifest from '../../web/src/tutor-diagrams/topic-transformer-sources.json' with { type: 'json' };
import { selectForAuthor } from '../src/explanation-references.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { singleDiagramReferences } from '../../web/src/tutor-diagrams/reference-single-variants.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTutorDiagram } from '../../web/src/tutor-diagrams/TutorDiagram.js';

const routes = [
  ['Decoder cross-attention aligns target queries with encoder keys, so the two axes describe different sequences.', 'ml-transformer-cross-attention-alignment'],
  ['GPT-2, BERT and Transformer-XL repeat different kinds of blocks for different ways of using context.', 'ml-transformer-context-rules-single'],
  ['The encoder prepares source representations that the decoder can consult while producing the target.', 'ml-transformer-encoder-decoder-memory'],
  ["Successive encoder layers consume the prior layer's vector at every position.", 'ml-transformer-contextual-layer-states'],
  ['Attention exchanges information across positions while the feed-forward sublayer updates each position separately.', 'ml-transformer-positionwise-feedforward'],
  ['The original decoder repeats the residual-add-and-normalize pattern around all three of its sublayers.', 'ml-transformer-original-decoder-sublayers'],
];

test('C03 cross-attention renders explicit translation axes without half-width composition scaling at 408', () => {
  const reference = diagramReferences.find(ref => ref.id === 'ml-transformer-cross-attention-alignment');
  for (const spec of [reference.depths.overview.spec, reference.spec, reference.depths.deep.detailSpec]) {
    const svg = renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
    assert.match(svg, /Target query/);
    assert.match(svg, /Source key/);
    assert.doesNotMatch(svg, /Query at source position|data-tutor-composition-child|scale\(0\./u);
  }
});

test('C03 shape-only layer states name parameter sets without asserting matrix inequality', () => {
  const reference = diagramReferences.find(ref => ref.id === 'ml-transformer-contextual-layer-states');
  const caption = reference.depths.deep.spec.diagram.caption;
  assert.match(caption, /parameter sets/iu);
  assert.doesNotMatch(caption, /\\ne|≠/u);
});

test('C03 source prompts reach the intended native or single author examples at every production depth', () => {
  const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' };
  for (const [prompt, id] of routes) for (const depth of ['brief', 'balanced', 'detailed']) {
    const selected = selectForAuthor({ prompt, depth }).references[0];
    assert.equal(selected?.id, id, `${depth}: ${prompt}`);
    const prepared = prepareArtifactAuthorRequest(env, { command: 'explanation', args: prompt, depth });
    assert.equal(prepared.diagramReferences[0]?.id, id);
    assert.ok(prepared.body.system.includes(JSON.stringify(prepared.diagramReferences[0].spec)));
    assert.ok(!['panels', 'comparison'].includes(prepared.diagramReferences[0].spec.diagram.kind));
    if (id === 'ml-transformer-cross-attention-alignment') {
      assert.equal(selected.spec.diagram.kind, depth === 'detailed' ? 'bar-chart' : 'heatmap');
      assert.ok(!singleDiagramReferences.some(ref => ref.panelReferenceId === id), 'Native alignment needs no unpublished single');
    }
    const schema = prepared.body.tools.find(tool => tool.name === 'make_explanation').input_schema;
    const visual = (schema.properties.visuals.items.oneOf ?? schema.properties.visuals.items.anyOf).find(branch => branch.properties.spec);
    const kinds = (visual.properties.spec.properties.diagram.oneOf ?? visual.properties.spec.properties.diagram.anyOf).map(branch => branch.properties.kind.const);
    assert.ok(kinds.includes(selected.spec.diagram.kind), `${id}: actual author bundle admits its kind`);
  }
});

test('C03 REUSE preserves all old visual payloads and adds only the authorized memory lesson', () => {
  for (const id of ['ml-transformer-encoder-decoder-memory', 'ml-transformer-positionwise-feedforward', 'ml-transformer-original-decoder-sublayers']) {
    const original = transformerFigureReferences.find(ref => ref.id === id);
    const current = diagramReferences.find(ref => ref.id === id);
    assert.deepEqual(current.spec, original.spec);
    assert.deepEqual(current.depths, original.depths);
    assert.equal(current.useWhen, original.useWhen);
    assert.ok(original.prompts.every(prompt => current.prompts.includes(prompt)));
    assert.ok(original.keywords.every(keyword => current.keywords.includes(keyword)));
    assert.deepEqual(current.lessons, id === 'ml-transformer-encoder-decoder-memory' ? ['01'] : []);
  }
  assert.ok(phase02LessonCoverage.find(row => row.lesson === '01').referenceIds.includes('ml-transformer-encoder-decoder-memory'));
  assert.equal(new Set(diagramReferences.map(ref => ref.id)).size, diagramReferences.length);
});

test('C03 source aliases, queued identities and lessons remain traceable under the reuse mapping', () => {
  assert.equal(manifest.references.length, 6);
  assert.equal(manifest.references.filter(ref => ref.mode === 'NEW').length, 3);
  assert.equal(manifest.references.flatMap(ref => [ref.source, ...ref.alsoCovers]).length, 17);
  for (const entry of manifest.references) {
    const reference = diagramReferences.find(ref => ref.id === entry.referenceId);
    assert.ok(reference, entry.queueId);
    assert.deepEqual(reference.lessons, entry.lessons);
    for (const source of [entry.source, ...entry.alsoCovers]) {
      assert.ok(reference.prompts.includes(source.summary), `${entry.queueId}/${source.figure}: verbatim prompt`);
      for (const depth of ['brief', 'balanced', 'detailed']) {
        const actual = selectForAuthor({ prompt: source.summary, depth }).references[0];
        assert.equal(actual?.id, entry.referenceId === 'ml-transformer-context-rules' ? `${entry.referenceId}-single` : entry.referenceId);
      }
    }
  }
});
