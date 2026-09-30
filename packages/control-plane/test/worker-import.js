// Lets node import dev-worker.js and index.js, which import built HTML and BYOC .py files as text
// (wrangler's Text rule). Each such import becomes a module whose default export is its URL.
import { registerHooks } from 'node:module';

registerHooks({
  resolve: (specifier, context, next) => /\.(html|py)$/.test(specifier) ? { url: new URL(specifier, context.parentURL).href, shortCircuit: true } : next(specifier, context),
  load: (url, context, next) => /\.(html|py)$/.test(url) ? { format: 'module', source: `export default ${JSON.stringify(url)};`, shortCircuit: true } : next(url, context),
});

export const devWorker = () => import('../../web/dev-worker.js');
export const productionWorker = () => import('../src/index.js');
