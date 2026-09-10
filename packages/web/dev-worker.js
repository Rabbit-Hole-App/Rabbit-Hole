import SHELL from './dist-dev/index.html';
import { byocFetch } from '../control-plane/src/byoc.js';
import apiCode from '../byoc/api.py';
import signerCode from '../byoc/signer.py';
import permissionsCode from '../byoc/permissions.py';

// UI preview only. Authentication and existing app actions use the live backend.
export default {
  fetch(req, env) {
    const path = new URL(req.url).pathname;
    if (path === '/aws') return Response.redirect(new URL('/apps', req.url), 302);
    if (path.startsWith('/api/byoc/')) return byocFetch(req, env, { apiCode, signerCode, permissionsCode });
    if (path === '/apps' || path === '/dash' || path === '/chat' || path === '/members' || path.startsWith('/apps/')) {
      return new Response(SHELL, {
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    if (path.startsWith('/static/') || path === '/favicon.svg' || path.startsWith('/icon-') || path === '/apple-touch-icon.png') {
      return env.ASSETS.fetch(req);
    }
    // Keep the dev request URL so sign-in links and cookies stay on the dev host.
    return env.CONTROL_PLANE.fetch(req);
  },
};
