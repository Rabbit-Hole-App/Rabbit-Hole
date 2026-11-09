import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTutorDiagram, tutorDiagramSchema, tutorDiagramVisibleText } from './spec.js';
import { correctionCorpus } from './correction-corpus.fixtures.mjs';
import { additionalCorrections } from './correction-corpus-extra.fixtures.mjs';

for (const { id, broken, path, message, corrected, keeps, fields } of [...correctionCorpus, ...additionalCorrections]) {
  test(`${id}: rejects the broken spec and accepts its information-preserving correction`, () => {
    const invalid = tutorDiagramSchema.safeParse(broken);
    assert.equal(invalid.success, false);
    assert.ok(invalid.error.issues.some(issue =>
      JSON.stringify(issue.path) === JSON.stringify(path) && message.test(issue.message)),
    JSON.stringify(invalid.error.issues));
    const accepted = parseTutorDiagram(JSON.stringify(corrected));
    assert.deepEqual(accepted, corrected);
    const visible = tutorDiagramVisibleText(accepted).filter(Boolean).join('\n');
    for (const text of keeps) assert.ok(visible.includes(text), `Correction must retain "${text}"`);
    for (const [field, expected] of fields) {
      assert.deepEqual(field.reduce((value, key) => value[key], accepted.diagram), expected);
    }
  });
}
