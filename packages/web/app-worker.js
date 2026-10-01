// Production Rabbit Hole (tryrabbithole.dev; config wrangler.rabbit-hole-prod.jsonc). The same routes as the
// dev worker, so a route added there ships here too, but CONTROL_PLANE is this deployment's own control
// plane (rabbit-hole-cp), so sign-in and writes pass through instead of hitting the P0-B dev barrier.
// Topology: docs/features/rabbit-hole-production.md.
import worker from './dev-worker.js';
import { ownControlPlane } from '../control-plane/src/dev-forwarding.js';
export { RepositoryImports, LearnScenes, LearnVideos } from './dev-worker.js';

export default {
  queue: (batch, env) => worker.queue(batch, ownControlPlane(env)),
  fetch(req, env, ctx) {
    const url = new URL(req.url);
    // Auth errors, sign-out and the app's 401 handler all land on /login, the control plane's legacy page.
    if (url.pathname === '/login' && ['GET', 'HEAD'].includes(req.method)) { url.pathname = '/sign-in'; return Response.redirect(url, 302); }
    return worker.fetch(req, ownControlPlane(env), ctx);
  },
};
