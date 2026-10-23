// Who may frame what (SHARE-04, owner decision 6, 2026-10-22): no page of this origin may be framed by another site, except the
// embed document of a public canvas. One wrapper (withFraming) on the top of both workers (dev-worker.js, app-worker.js) sets it
// on every response, so a route added later is covered by default; the embed shell alone is exempt. Same-origin frames keep
// working ('self' / SAMEORIGIN); cross-origin frames inside our pages (notebooks, YouTube) are other servers' responses.

// /embed/b/<view token> and /embed/e/<publication token>: the only documents others may frame (token shape as the /b, /e shell).
export const EMBED_SHELL = /^\/embed\/[be]\/[A-Za-z0-9_-]{20,64}$/;
export const embedShellRequest = req => (req.method === 'GET' || req.method === 'HEAD') && EMBED_SHELL.test(new URL(req.url).pathname);

// A CSP value with its frame-ancestors directive set to `sources`, the response's other directives kept (a sandbox, default-src).
const csp = (existing, sources) => {
  const others = (existing || '').split(';').map(part => part.trim()).filter(part => part && !/^frame-ancestors(\s|$)/i.test(part));
  return [...others, `frame-ancestors ${sources}`].join('; ');
};

// The response with the framing headers. A WebSocket upgrade is returned as is; a response with immutable headers (a redirect,
// an asset or service-binding fetch) is copied, its body streamed through.
export function withFraming(req, response) {
  if (response.status === 101) return response;
  const out = new Response(response.body, response);
  if (embedShellRequest(req) && response.ok) {
    out.headers.set('Content-Security-Policy', csp(out.headers.get('Content-Security-Policy'), '*'));
    out.headers.delete('X-Frame-Options');
    return out;
  }
  out.headers.set('Content-Security-Policy', csp(out.headers.get('Content-Security-Policy'), "'self'"));
  out.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return out;
}
