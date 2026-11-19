import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import queue from '../../../docs/features/explain/composition/queue.json' with { type: 'json' };
import { selectForAuthor } from '../src/explanation-references.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';

for (const entry of queue.references.filter(row => row.batch === 'C09')) test(`C09 source/alias author routes: ${entry.proposedReferenceId}`, () => {
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



import manifest from '../../web/src/tutor-diagrams/topic-contextual-embeddings-sources.json' with { type: 'json' };
import learnerKeywords from '../../web/src/tutor-diagrams/reference-learner-keywords.json' with { type: 'json' };
import { derived } from '../../web/src/tutor-diagrams/topic-contextual-embeddings-data.js';
const d = derived();

test('C09 exact source families preserve per-source lessons and narrow learner associations', () => {
  const families = queue.references.filter(row => row.batch === 'C09');
  assert.deepEqual(manifest.families, families);
  assert.equal(manifest.references.length, 4);
  let headings = 0;
  for (const family of families) {
    const entry = manifest.references.find(row => row.queueId === family.proposedReferenceId);
    assert.equal(entry.referenceId, family.proposedReferenceId);
    assert.equal(entry.mode, 'NEW');
    assert.deepEqual(entry.lessons, family.lessons);
    assert.deepEqual(entry.alsoCovers, family.alsoCovers);
    assert.deepEqual(entry.source, Object.fromEntries(['source', 'figure', 'brief', 'summary', 'lessons'].map(key => [key, family[key]])));
    const ref = diagramReferences.find(row => row.id === entry.referenceId);
    assert.deepEqual(ref.lessons, family.lessons);
    for (const source of [family, ...family.alsoCovers]) { assert.ok(ref.prompts.includes(source.summary)); headings++; }
    for (const keyword of learnerKeywords[ref.id]) assert.ok(ref.keywords.includes(keyword));
    for (const keyword of [...learnerKeywords[ref.id], ...(ref.shortKeywords ?? [])]) assert.equal(selectForAuthor({ prompt: keyword }).references[0]?.id, ref.id);
  }
  assert.equal(headings, 5);
  assert.deepEqual(manifest.references.find(row => row.source.figure === '17').lessons, []);
});

test('C09 actual source views preserve 4/6/7 resolved figures, concat identity, scale scope and keyed synthetic data', () => {
  const inventory = { brief: 0, balanced: 0, detailed: 0 };
  for (const entry of manifest.references) for (const depth of Object.keys(inventory)) {
    const prepared = prepareArtifactAuthorRequest({}, { command: 'explanation', args: entry.source.summary, depth });
    const actual = prepared.diagramReferences[0], main = actual.spec.diagram, detail = actual.detailSpec?.diagram;
    assert.equal(actual.id, entry.referenceId);
    inventory[depth] += 1 + +Boolean(detail);
    if (depth === 'brief') assert.equal(detail, undefined, 'Explicit null Overview override clears inherited Standard detail');
    if (entry.referenceId.endsWith('contextual-word-vectors')) {
      if (depth !== 'brief') assert.deepEqual(main.rows.map(row => row.cells), d.directional.contexts.flatMap(c => c.taskA.displayOutputs));
      if (depth === 'detailed') assert.deepEqual(detail.rows.map(row => row.cells), [0,1,2,3].map(index => d.directional.contexts.map(c => (index % 2 ? c.B : c.F)[Math.floor(index / 2)][d.parameters.directional.selectedPosition])));
      else assert.equal(detail, undefined);
    } else if (entry.referenceId.endsWith('two-directional-states')) {
      assert.equal(detail, undefined);
      if (depth !== 'brief') assert.deepEqual(main.rows.map(row => row.cells), (depth === 'detailed' ? d.directional.contexts : d.directional.contexts.slice(0,1)).flatMap(c => [c.F[0],c.B[0]]));
    } else if (entry.referenceId.endsWith('weighted-layer-states') && depth !== 'brief') {
      const q = d.parameters.directional, i = q.selectedPosition, G = d.directional.contexts[0], task = depth === 'detailed' ? q.taskB : q.taskA;
      assert.deepEqual(main.rows.slice(0,3).map(row => row.cells.slice(0,2)), G.H.map(layer => layer[i]));
      assert.deepEqual(main.rows.map(row => row.cells[2]), [...task.coefficients, task.gamma]);
      assert.match(main.rows[0].label,/E=H_0/);assert.match(main.rows[1].label,/F_1;B_1/);assert.match(main.rows[2].label,/F_2;B_2/);
      assert.deepEqual(main.rows[3].cells.slice(0,2), depth === 'detailed' ? d.directional.taskProbe.displayOutput : G.taskA.displayOutputs[i]);
      if (depth === 'balanced') assert.deepEqual(detail.rows.map(row => row.cells), [...G.taskA.displayProducts[i],G.taskA.displayOutputs[i]]);
      else assert.deepEqual(detail.rows.map(row=>row.cells), [...q.taskA.coefficients.map((value,l)=>[value,q.taskB.coefficients[l]]), ...G.taskA.displayOutputs[i].map((value,j)=>[value,d.directional.taskProbe.displayOutput[j]])]);
    } else if (entry.referenceId.endsWith('layer-pooling-evaluation')) {
      assert.equal(main.unit,d.parameters.evaluation.metric);
      if (depth === 'balanced') {
        assert.deepEqual(main.bars.map(bar=>bar.value),d.evaluation.base.map(m=>m.displayF1));
        assert.match(main.caption,/synthetic/);assert.match(main.caption,/untrained/);assert.match(main.caption,/logit/);
        assert.deepEqual(detail.rows.map(row=>row.cells),['TP','FP','FN','TN'].map(key=>d.evaluation.base.map(method=>method.counts[key])));
      } else if (depth === 'detailed') {
        assert.deepEqual(main.bars.map(bar=>bar.value),d.evaluation.base.flatMap((m,j)=>[m.displayF1,d.evaluation.reordered[j].displayF1]));
        assert.deepEqual(detail.rows.map(row=>row.label),d.evaluation.reordered[0].rows.map(row=>row.id+' target'+row.target));
        assert.deepEqual(detail.rows.map(row=>row.cells),d.evaluation.reordered[0].rows.map((_,j)=>d.evaluation.reordered.map(m=>m.rows[j].prediction)));
        assert.match(detail.caption,/categorical prediction flags/);
      }
    }
  }
  assert.deepEqual(inventory,{brief:4,balanced:6,detailed:7});
});
