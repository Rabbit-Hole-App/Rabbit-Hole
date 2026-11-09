import { registerHooks } from 'node:module';

const selectorUrl = new URL('../../src/explanation-references.js', import.meta.url).href;
const registryUrl = new URL('../../../web/src/tutor-diagrams/reference-library.js', import.meta.url).href;
const offlineUrl = new URL('../../../web/src/tutor-diagrams/offline-reference-library.js', import.meta.url).href;

// Exercise the real selector and author with the offline batches in these isolated test files.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    return context.parentURL === selectorUrl && resolved.url === registryUrl
      ? { ...resolved, url: offlineUrl }
      : resolved;
  },
});

let author, selector;
try {
  [author, selector] = await Promise.all([import('../../src/learn-artifact.js'), import(selectorUrl)]);
} finally {
  hooks.deregister();
}
export const { prepareArtifactAuthorRequest } = author;
export const { diagramReferenceContext, selectDiagramReferences } = selector;
