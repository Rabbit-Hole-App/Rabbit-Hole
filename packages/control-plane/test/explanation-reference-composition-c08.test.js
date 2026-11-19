import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import queue from '../../../docs/features/explain/composition/queue.json' with { type: 'json' };
import { selectForAuthor } from '../src/explanation-references.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';

for (const entry of queue.references.filter(row => row.batch === 'C08')) test(`C08 source/alias author routes: ${entry.proposedReferenceId}`, () => {
  for (const source of [entry, ...entry.alsoCovers]) for (const depth of ['brief', 'balanced', 'detailed']) {
    const prompt = source.summary;
    assert.equal(selectForAuthor({ prompt, depth }).references[0]?.id, entry.proposedReferenceId);
    for (const env of [{}, { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' }]) {
      const prepared = prepareArtifactAuthorRequest(env, { command: 'explanation', args: prompt, depth });
      const actual = prepared.diagramReferences[0];
      assert.equal(actual?.id, entry.proposedReferenceId);
      assert.ok(prepared.body.system.includes(JSON.stringify(actual.spec)));
      const schema = prepared.body.tools.find(tool => tool.name === 'make_explanation').input_schema;
      const visual = (schema.properties.visuals.items.oneOf ?? schema.properties.visuals.items.anyOf).find(branch => branch.properties.spec);
      const kinds = (visual.properties.spec.properties.diagram.oneOf ?? visual.properties.spec.properties.diagram.anyOf).map(branch => branch.properties.kind.const);
      for (const spec of [actual.spec, actual.detailSpec].filter(Boolean)) assert.ok(kinds.includes(spec.diagram.kind));
      assert.equal(actual.spec.diagram.panels, undefined, 'Native depth view does not need a single fallback');
    }
  }
});


import manifest from '../../web/src/tutor-diagrams/topic-embeddings-sources.json' with { type: 'json' };
import learnerKeywords from '../../web/src/tutor-diagrams/reference-learner-keywords.json' with { type: 'json' };
import { derived as positionData } from '../../web/src/tutor-diagrams/topic-positional-encoding-data.js';
import { derived as embeddingData } from '../../web/src/tutor-diagrams/topic-embeddings-data.js';
import { derived as normalizationData } from '../../web/src/tutor-diagrams/topic-normalization-data.js';

test('C08 exact source families, per-source lessons and additive narrow learner routes remain traceable', () => {
  const families = queue.references.filter(row => row.batch === 'C08');
  assert.deepEqual(manifest.families, families);
  assert.equal(manifest.references.length, 4);
  let headings = 0;
  for (const family of families) {
    const entry = manifest.references.find(row => row.queueId === family.proposedReferenceId);
    assert.equal(entry.referenceId, family.proposedReferenceId);
    assert.equal(entry.mode, 'NEW');
    assert.deepEqual(entry.lessons, family.lessons);
    assert.deepEqual(entry.alsoCovers, family.alsoCovers);
    assert.equal(entry.source.summary, family.summary);
    const ref = diagramReferences.find(row => row.id === entry.referenceId);
    for (const source of [family, ...family.alsoCovers]) { assert.ok(ref.prompts.includes(source.summary)); headings++; }
    assert.deepEqual(learnerKeywords[ref.id], [...new Set(ref.keywords)]);
    for (const keyword of learnerKeywords[ref.id]) assert.equal(selectForAuthor({ prompt: keyword }).references[0]?.id, ref.id);
  }
  assert.equal(headings, 11);
});

test('C08 emitted author views preserve mechanism operands, variant details and returned-row identities', () => {
  const position = positionData(), embeddings = embeddingData(), normalization = normalizationData();
  for (const entry of manifest.references) for (const depth of ['brief', 'balanced', 'detailed']) {
    const prepared = prepareArtifactAuthorRequest({}, { command: 'explanation', args: entry.source.summary, depth });
    const actual = prepared.diagramReferences[0], main = actual.spec.diagram, detail = actual.detailSpec?.diagram;
    assert.equal(actual.id, entry.referenceId);
    if (entry.topic === 'normalization') {
      const row = depth === 'detailed' ? normalization.probe : normalization.base;
      assert.deepEqual(main.blocks.at(-1).diagram.tensor.values, row.display.normalized);
      assert.ok(main.caption.includes(String(row.mean)));
      assert.match(main.caption, /population|mean/i);
    } else if (entry.referenceId.endsWith('token-plus-position')) {
      const chosen = depth === 'brief' ? position.tokenPosition.fixed : depth === 'detailed' ? position.tokenPosition.probe : position.tokenPosition.learned;
      const index = depth === 'brief' ? position.parameters.tokenPosition.fixedOverviewPosition : position.parameters.tokenPosition.activePosition;
      assert.deepEqual(detail.blocks[1].diagram.tensor.values, chosen.rows[index].display.sum);
      assert.equal(detail.blocks[0].repeat, undefined);
      assert.equal(detail.blocks[0].diagram, undefined);
      assert.match(detail.blocks[0].label, /id.*position/i);
      assert.equal(detail.blocks[0].inputs.length, 2);
      assert.equal(detail.blocks[0].merge, 'add');
      assert.equal(detail.blocks[2].repeat, position.parameters.tokenPosition.decoderBlocks.length);
      assert.match(detail.caption, new RegExp(chosen.variant));
      if (depth !== 'brief') assert.deepEqual(main.rows, chosen.gridRows);
    } else if (entry.referenceId.endsWith('sinusoidal-positions')) {
      if (depth !== 'detailed') {
        assert.equal(main.series.length, depth === 'brief' ? 2 : 4);
        main.series.forEach((series, j) => assert.deepEqual(series.points, position.parameters.sinusoidal.positions.map((x, i) => ({ x, y: position.sinusoidal.displayRows[i][j] }))));
        assert.match(main.caption, /Lines connect samples/);
      } else assert.deepEqual(main.rows.map(row => row.cells), position.sinusoidal.groupedRows);
      assert.deepEqual(detail.rows.map(row => row.cells), position.sinusoidal.displayRows);
    } else {
      const chosen = depth === 'detailed' ? embeddings.probe : embeddings.base;
      assert.match(main.title, /returned center vector/);
      assert.match(detail.title, /returned context vectors/);
      assert.ok(main.caption.includes(`E${depth === 'detailed' ? "'" : ''}[${embeddings.parameters.centerId},:]`));
      assert.deepEqual(detail.rows.map(row => row.cells), chosen.C);
      assert.deepEqual(detail.highlights.map(cell => cell.row), embeddings.parameters.contextIds.flatMap(id => Array(embeddings.width).fill(embeddings.idToRow[id])));
      if (depth !== 'detailed') assert.match(main.caption, /T\[id,:\]/);
    }
    if (actual.detailSpec) assert.ok(prepared.body.system.includes(JSON.stringify(actual.detailSpec)));
  }
});
