// START-3: the diagram reference library (about 60 reference and data modules, about 100 ms of module work) is loaded on first use, not when the worker starts.
// A Worker request handler awaits referenceLibraryReady() once per isolate before any code reads the library; the synchronous readers below then find it.
// Node (tests, scripts, benches) has no handler to await: it loads the ESM synchronously (require of ESM).
let loaded = null;
let pending = null;
const fromModules = (library, variants) => (loaded = { diagramReferences: library.diagramReferences, singleDiagramReferences: variants.singleDiagramReferences });

export function referenceLibraryReady() {
  if (loaded) return Promise.resolve(loaded);
  pending ??= Promise.all([import('../../web/src/tutor-diagrams/reference-library.js'), import('../../web/src/tutor-diagrams/reference-single-variants.js')]).then(([library, variants]) => fromModules(library, variants));
  return pending;
}

export function referenceLibrary() {
  if (loaded) return loaded;
  // shortcut: this synchronous path exists only under Node; in a Worker it fails loudly, so a missed entry point is a visible error, upgrade by awaiting referenceLibraryReady() in that entry point.
  let require;
  try { require = process.getBuiltinModule('node:module').createRequire(import.meta.url); } catch { /* not Node */ }
  if (!require) throw new Error('The diagram reference library was read before referenceLibraryReady() was awaited');
  return fromModules(require('../../web/src/tutor-diagrams/reference-library.js'), require('../../web/src/tutor-diagrams/reference-single-variants.js'));
}
