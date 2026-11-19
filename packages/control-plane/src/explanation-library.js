// GEN-1 R2: the ONE place the seeded examples (explanation-examples.js) read the reference library: START-3's synchronous reader of the lazy library (reference-library-lazy.js).
// In a Worker it throws unless referenceLibraryReady() was awaited first; exampleReferences is reached only through generateArtifact and quoteRoadmapCard, which await it (learn-artifact.js, roadmap-generate.js).
import { referenceLibrary } from './reference-library-lazy.js';

export const libraryRefs = () => referenceLibrary().diagramReferences;
