import SHELL from './dist-dev/index.html';

// UI preview only. Authentication and existing app actions use the live backend.
export default {
  fetch(req, env) {
    const path = new URL(req.url).pathname;
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
