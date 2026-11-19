// GEN-1 R2 x START-3 cold Worker scenario (f-typed-seeded): a seeded typed card with a planned kind and no stored reference, from a cold module state in a simulated Worker (no synchronous loader for the lazy reference library, no /api/ request first), delivers a card whose request carried the seeded examples. Red when generateArtifact does not await referenceLibraryReady() before the examples are drawn.
import './no-sync-loader.mjs';
await import('./explanation-seeded-generate.test.js');
