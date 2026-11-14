import assert from 'node:assert/strict';
import test from 'node:test';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import learnerKeywords from '../../web/src/tutor-diagrams/reference-learner-keywords.json' with { type: 'json' };
import { selectDiagramReferences } from '../src/explanation-references.js';

test('the restored audit retains all 391 pairs of short learner topics', () => {
  assert.equal(Object.keys(learnerKeywords).length, 391);
  for (const phrases of Object.values(learnerKeywords)) assert.equal(phrases.length, 2);
});

test('the audited learner topics pick the intended reference first', () => {
  const byId = new Map(diagramReferences.map(ref => [ref.id, ref]));
  for (const [id, phrases] of Object.entries(learnerKeywords)) {
    assert.ok(byId.has(id), id);
    for (const phrase of phrases) {
      assert.ok(byId.get(id).keywords.includes(phrase), phrase);
      assert.ok(byId.get(id).shortKeywords.includes(phrase), phrase);
      assert.equal(selectDiagramReferences({ prompt: 'Show me the ' + phrase })[0]?.id, id, phrase);
    }
  }
});
