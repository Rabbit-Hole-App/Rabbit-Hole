// GEN-1 R2 x START-3 cold Worker scenario (h-examples-read): the accessor the seeded examples read the library through is START-3's synchronous reader: in a simulated Worker it throws before referenceLibraryReady() is awaited and works after.
import './no-sync-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { exampleReferences } = await import('../src/explanation-examples.js');
const { referenceLibraryReady } = await import('../src/reference-library-lazy.js');

test('cold Worker: exampleReferences throws before the library is awaited, draws three examples after', async () => {
  assert.throws(() => exampleReferences('flow', 'balanced', 'seed-cold'), /before referenceLibraryReady\(\) was awaited/);
  await referenceLibraryReady();
  const r = exampleReferences('flow', 'balanced', 'seed-cold');
  assert.equal(r.examples.length, 3);
});
