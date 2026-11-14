import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../web/src/tutor-diagrams/topic-recurrent-networks-sources.json' with { type: 'json' };
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import queue from '../../../docs/features/explain/composition/queue.json' with { type: 'json' };
import { selectForAuthor } from '../src/explanation-references.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';

for (const entry of queue.references.filter(row => row.batch === 'C05')) test(`C05 source/alias author routes: ${entry.proposedReferenceId}`, () => {
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

test('C05 manifest preserves every exact source association and lesson boundary',()=>{
 const queued=queue.references.filter(row=>row.batch==='C05');assert.equal(manifest.references.length,queued.length);
 for(const row of queued){const entry=manifest.references.find(item=>item.queueId===row.proposedReferenceId),ref=diagramReferences.find(item=>item.id===entry.referenceId);
 assert.equal(entry.mode,'NEW');assert.equal(entry.referenceId,row.proposedReferenceId);assert.equal(ref.topic,row.proposedTopicSlug);assert.deepEqual(ref.lessons,row.lessons);
 assert.deepEqual(entry.lessons,row.lessons);assert.deepEqual(entry.source,{source:row.source,figure:row.figure,brief:row.brief,summary:row.summary,lessons:row.representativeLessons});assert.deepEqual(entry.alsoCovers,row.alsoCovers);
 assert.deepEqual(ref.sources.map(source=>source.path),[row.brief,...row.alsoCovers.map(source=>source.brief)]);
 }
});
