// GEN-1 R2: the ONE place the seeded examples (explanation-examples.js) read the reference library. Today it returns the static import; START-3 (the lazy library, reference-library-lazy.js
// referenceLibrary()) swaps this body for `referenceLibrary()`, so R2 adds no static import of the library to the worker's start.
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';

export const libraryRefs = () => diagramReferences;
