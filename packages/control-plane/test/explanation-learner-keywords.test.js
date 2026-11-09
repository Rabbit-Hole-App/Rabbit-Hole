import assert from 'node:assert/strict';
import test from 'node:test';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { references as batch3Topology } from '../../web/src/tutor-diagrams/ml-batch3-topology-references.js';
import { references as batch3Teaching } from '../../web/src/tutor-diagrams/ml-batch3-teaching-references.js';
import learnerKeywords from '../../web/src/tutor-diagrams/reference-learner-keywords.json' with { type: 'json' };
import { selectDiagramReferences } from '../src/explanation-references.js';

// ponytail: the 14 batch-3 references (ml-batch3-topology / ml-batch3-teaching) are in this lineage but not in Codex's, so the audit has no topics for them; audit them, then drop this exemption.
const unaudited = new Set([...batch3Topology, ...batch3Teaching].map(ref => ref.id));

test('every registered reference offers at least two short learner topics', () => {
  const missing = diagramReferences.filter(ref => !unaudited.has(ref.id) && (ref.shortKeywords?.length ?? 0) < 2).map(ref => ref.id);
  assert.deepEqual(missing, []);
});

test('the audited learner topics pick the intended reference first', () => {
  const byId = new Map(diagramReferences.map(ref => [ref.id, ref]));
  for (const [id, phrases] of Object.entries(learnerKeywords)) {
    if (!byId.has(id)) continue; // ponytail: Codex's figure-chapter references are not in this lineage
    for (const phrase of phrases) {
      assert.ok(byId.get(id).keywords.includes(phrase), phrase);
      assert.equal(selectDiagramReferences({ prompt: 'Show me the ' + phrase })[0]?.id, id, phrase);
    }
  }
});
