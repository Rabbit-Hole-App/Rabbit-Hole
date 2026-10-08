// The dev worker behind Cloudflare Access sign-in (../control-plane/src/dev-access.js), for the stable dev testing URL
// only: scripts/dev-deploy.mjs deploys this entrypoint to rabbit-hole-web-dev-small-parallel. dev-worker.js and
// production's app-worker.js never import it; small-cp-dev and every other clone keep dev-worker.js as their entry.
import { withAccess } from '../control-plane/src/dev-access.js';
import worker from './dev-worker.js';
export { RepositoryImports, LearnScenes, LearnVideos } from './dev-worker.js';
export default { ...worker, fetch: withAccess((req, env, ctx) => worker.fetch(req, env, ctx)) };
