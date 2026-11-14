// Lets node import dev-worker.js and index.js, which import built HTML and BYOC .py files as text
// (wrangler's Text rule). Each such import becomes a module whose default export is its URL.
import { registerHooks } from 'node:module';

// A .wasm import (the QuickJS engine, dev-worker.js) is a compiled module under wrangler; node needs none (it loads the engine itself), so its default export is undefined here.
registerHooks({
  resolve: (specifier, context, next) => /\.(html|py|wasm)$/.test(specifier) ? { url: new URL(specifier, context.parentURL).href, shortCircuit: true } : next(specifier, context),
  load: (url, context, next) => /\.wasm$/.test(url) ? { format: 'module', source: 'export default undefined;', shortCircuit: true } : /\.(html|py)$/.test(url) ? { format: 'module', source: `export default ${JSON.stringify(url)};`, shortCircuit: true } : next(url, context),
});

export const devWorker = () => import('../../web/dev-worker.js');
export const productionWorker = () => import('../src/index.js');
export const appWorker = () => import('../../web/app-worker.js');
