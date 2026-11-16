// Every registered family's fill schema, at every depth, uses only keywords the model adapter's schema checker supports.
// The stepper's plainText was two .regex() calls, an allOf, and the first live Brief fill was refused before any model call
// (unsupported_schema: Schema keyword allOf at $.title). schemaProblems walks the whole schema and throws on any keyword it cannot enforce.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERACT_FAMILIES } from '../src/interact-families.js';
import { schemaProblems } from '../src/interact-model-adapters.js';
import { briefSchema } from '../../web/src/interact-plan-brief.js';

for (const family of [...INTERACT_FAMILIES]) {
  test(`${family.id}: the fill schema uses only supported keywords at every depth`, () => {
    for (const depth of ['brief', 'balanced', 'detailed']) {
      let schema;
      try { schema = briefSchema(depth, family.module ?? family).jsonSchema; } catch { continue; } // a depth the family does not offer
      assert.doesNotThrow(() => schemaProblems(schema, {}), `${family.id} ${depth}`);
    }
  });
}
